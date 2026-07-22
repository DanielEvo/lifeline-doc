import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import {
  type StripeEnv,
  createStripeClient,
  getStripeErrorMessage,
} from '@/lib/stripe.server';

type CheckoutSessionResult = { clientSecret: string } | { error: string };
type PortalSessionResult = { url: string } | { error: string };
type SwitchPlanResult = { ok: true } | { error: string };
type SubStatus = {
  active: boolean;
  status: string | null;
  plan: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
};

async function resolveOrCreateCustomer(
  stripe: ReturnType<typeof createStripeClient>,
  options: { email?: string; userId: string },
): Promise<string> {
  if (!/^[a-zA-Z0-9_-]+$/.test(options.userId)) throw new Error('Invalid userId');
  const found = await stripe.customers.search({
    query: `metadata['userId']:'${options.userId}'`,
    limit: 1,
  });
  if (found.data.length) return found.data[0].id;
  if (options.email) {
    const existing = await stripe.customers.list({ email: options.email, limit: 1 });
    if (existing.data.length) {
      const customer = existing.data[0];
      if (customer.metadata?.userId !== options.userId) {
        await stripe.customers.update(customer.id, {
          metadata: { ...customer.metadata, userId: options.userId },
        });
      }
      return customer.id;
    }
  }
  const created = await stripe.customers.create({
    ...(options.email && { email: options.email }),
    metadata: { userId: options.userId },
  });
  return created.id;
}

export const createSubscriptionCheckout = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { priceId: string; returnUrl: string; environment: StripeEnv }) => {
    if (!/^[a-zA-Z0-9_]+$/.test(data.priceId)) throw new Error('Invalid priceId');
    return data;
  })
  .handler(async ({ data, context }): Promise<CheckoutSessionResult> => {
    try {
      const { supabase, userId } = context;
      const { data: userData } = await supabase.auth.getUser();
      const email = userData.user?.email ?? undefined;

      const stripe = createStripeClient(data.environment);
      const prices = await stripe.prices.list({ lookup_keys: [data.priceId] });
      if (!prices.data.length) throw new Error('Price not found');
      const stripePrice = prices.data[0];

      const customerId = await resolveOrCreateCustomer(stripe, { email, userId });

      const session = await stripe.checkout.sessions.create({
        line_items: [{ price: stripePrice.id, quantity: 1 }],
        mode: 'subscription',
        ui_mode: 'embedded_page',
        return_url: data.returnUrl,
        customer: customerId,
        metadata: { userId },
        subscription_data: { metadata: { userId } },
      });

      return { clientSecret: session.client_secret ?? '' };
    } catch (error) {
      return { error: getStripeErrorMessage(error) };
    }
  });

export const createBillingPortal = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { returnUrl?: string; environment: StripeEnv }) => data)
  .handler(async ({ data, context }): Promise<PortalSessionResult> => {
    const { supabase, userId } = context;
    const { data: sub } = await supabase
      .from('subscriptions')
      .select('stripe_customer_id')
      .eq('user_id', userId)
      .eq('environment', data.environment)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!sub?.stripe_customer_id) return { error: 'Nenhuma assinatura encontrada.' };
    try {
      const stripe = createStripeClient(data.environment);
      const portal = await stripe.billingPortal.sessions.create({
        customer: sub.stripe_customer_id as string,
        ...(data.returnUrl && { return_url: data.returnUrl }),
      });
      return { url: portal.url };
    } catch (error) {
      return { error: getStripeErrorMessage(error) };
    }
  });

// Upgrade/downgrade imediato com pró-rata.
export const switchSubscriptionPlan = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { priceId: string; environment: StripeEnv }) => {
    if (!/^[a-zA-Z0-9_]+$/.test(data.priceId)) throw new Error('Invalid priceId');
    return data;
  })
  .handler(async ({ data, context }): Promise<SwitchPlanResult> => {
    try {
      const { supabase, userId } = context;
      const { data: sub } = await supabase
        .from('subscriptions')
        .select('stripe_subscription_id')
        .eq('user_id', userId)
        .eq('environment', data.environment)
        .in('status', ['active', 'trialing', 'past_due'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!sub?.stripe_subscription_id) return { error: 'Sem assinatura ativa.' };

      const stripe = createStripeClient(data.environment);
      const prices = await stripe.prices.list({ lookup_keys: [data.priceId] });
      if (!prices.data.length) throw new Error('Price not found');
      const target = prices.data[0];

      const subscription = await stripe.subscriptions.retrieve(
        sub.stripe_subscription_id as string,
      );
      const itemId = subscription.items.data[0]?.id;
      if (!itemId) throw new Error('Subscription item missing');

      await stripe.subscriptions.update(sub.stripe_subscription_id as string, {
        items: [{ id: itemId, price: target.id }],
        proration_behavior: 'always_invoice',
        cancel_at_period_end: false,
      });
      return { ok: true };
    } catch (error) {
      return { error: getStripeErrorMessage(error) };
    }
  });

export const getSubscriptionStatus = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { environment: StripeEnv }) => data)
  .handler(async ({ data, context }): Promise<SubStatus> => {
    const { supabase, userId } = context;
    const { data: sub } = await supabase
      .from('subscriptions')
      .select('status, price_id, current_period_end, cancel_at_period_end')
      .eq('user_id', userId)
      .eq('environment', data.environment)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!sub) {
      return {
        active: false,
        status: null,
        plan: null,
        current_period_end: null,
        cancel_at_period_end: false,
      };
    }
    const end = sub.current_period_end as string | null;
    const now = Date.now();
    const endMs = end ? new Date(end).getTime() : null;
    const status = sub.status as string;
    const active =
      (['active', 'trialing', 'past_due'].includes(status) && (endMs === null || endMs > now)) ||
      (status === 'canceled' && endMs !== null && endMs > now);
    return {
      active,
      status,
      plan: (sub.price_id as string) ?? null,
      current_period_end: end,
      cancel_at_period_end: Boolean(sub.cancel_at_period_end),
    };
  });
