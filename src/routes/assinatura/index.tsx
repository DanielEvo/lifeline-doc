import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { Check, Loader2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';

import { PaymentTestModeBanner } from '@/components/PaymentTestModeBanner';
import { StripeEmbeddedCheckout } from '@/components/StripeEmbeddedCheckout';
import {
  createBillingPortal,
  getSubscriptionStatus,
  switchSubscriptionPlan,
} from '@/lib/subscription.functions';
import { getStripeEnvironment } from '@/lib/stripe';

type Plan = {
  id: 'pro_monthly' | 'pro_yearly';
  nome: string;
  preco: string;
  ciclo: string;
  destaque?: boolean;
  economia?: string;
};

const PLANS: Plan[] = [
  { id: 'pro_monthly', nome: 'Pro Mensal', preco: 'R$ 149', ciclo: '/mês' },
  {
    id: 'pro_yearly',
    nome: 'Pro Anual',
    preco: 'R$ 1.490',
    ciclo: '/ano',
    destaque: true,
    economia: 'Economize R$ 298 (2 meses grátis)',
  },
];

const FEATURES = [
  'Prontuário completo com SOAP e linha do tempo',
  'Assistente clínico com IA e base de conhecimento',
  'OCR de exames ilimitado (Gemini)',
  'Agenda com arrastar e soltar',
  'Prescrição eletrônica Memed',
  'Portal do paciente com histórico',
];

export const Route = createFileRoute('/assinatura/')({
  head: () => ({
    meta: [
      { title: 'LifeLine · Assinatura Pro' },
      {
        name: 'description',
        content: 'Assine o LifeLine Pro e desbloqueie prontuário, agenda, IA clínica e Memed.',
      },
      { property: 'og:title', content: 'LifeLine Pro — Assinatura' },
      {
        property: 'og:description',
        content: 'Planos mensal e anual para médicos que querem devolver tempo à consulta.',
      },
      { property: 'og:type', content: 'website' },
      { name: 'twitter:card', content: 'summary' },
    ],
  }),
  component: PricingPage,
});

function PricingPage() {
  const navigate = useNavigate();
  const [checkoutPlan, setCheckoutPlan] = useState<Plan['id'] | null>(null);
  const [sub, setSub] = useState<Awaited<ReturnType<typeof getSubscriptionStatus>> | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getSubscriptionStatus({ data: { environment: getStripeEnvironment() } })
      .then(setSub)
      .catch(() => setSub(null));
  }, []);

  const openPortal = async () => {
    setBusy(true);
    try {
      const r = await createBillingPortal({
        data: {
          environment: getStripeEnvironment(),
          returnUrl: window.location.href,
        },
      });
      if ('error' in r) throw new Error(r.error);
      window.open(r.url, '_blank');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao abrir portal');
    } finally {
      setBusy(false);
    }
  };

  const switchPlan = async (priceId: Plan['id']) => {
    setBusy(true);
    try {
      const r = await switchSubscriptionPlan({
        data: { priceId, environment: getStripeEnvironment() },
      });
      if ('error' in r) throw new Error(r.error);
      toast.success('Plano atualizado. A diferença é cobrada/creditada com pró-rata.');
      const fresh = await getSubscriptionStatus({ data: { environment: getStripeEnvironment() } });
      setSub(fresh);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao trocar de plano');
    } finally {
      setBusy(false);
    }
  };

  if (checkoutPlan) {
    return (
      <div className="min-h-screen bg-muted/30">
        <PaymentTestModeBanner />
        <div className="mx-auto max-w-3xl px-4 py-8">
          <button
            onClick={() => setCheckoutPlan(null)}
            className="mb-4 text-sm text-muted-foreground hover:text-foreground"
          >
            ← Voltar para os planos
          </button>
          <StripeEmbeddedCheckout priceId={checkoutPlan} />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30">
      <PaymentTestModeBanner />
      <div className="mx-auto max-w-5xl px-4 py-10">
        <div className="mb-8 text-center">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            <Sparkles className="h-3 w-3" /> LifeLine Pro
          </div>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">
            Devolva tempo à sua consulta.
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Prontuário, agenda, IA clínica e Memed em um só lugar. Cancele quando quiser.
          </p>
        </div>

        {sub?.active && (
          <div className="mb-6 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm">
            <div className="font-medium text-emerald-900 dark:text-emerald-200">
              Assinatura ativa: {sub.plan === 'pro_yearly' ? 'Pro Anual' : 'Pro Mensal'}
            </div>
            <div className="mt-1 text-xs text-emerald-800/80 dark:text-emerald-200/80">
              {sub.cancel_at_period_end
                ? `Acesso até ${new Date(sub.current_period_end!).toLocaleDateString('pt-BR')}.`
                : sub.current_period_end
                ? `Próxima cobrança em ${new Date(sub.current_period_end).toLocaleDateString('pt-BR')}.`
                : 'Sem data de renovação.'}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                onClick={openPortal}
                disabled={busy}
                className="rounded-md border border-emerald-600/30 bg-white px-3 py-1.5 text-xs font-medium text-emerald-900 hover:bg-emerald-50 disabled:opacity-50 dark:bg-emerald-900/40 dark:text-emerald-100"
              >
                Gerenciar assinatura
              </button>
              <button
                onClick={() => navigate({ to: '/app' })}
                className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"
              >
                Ir para o consultório
              </button>
            </div>
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          {PLANS.map((p) => {
            const current = sub?.active && sub.plan === p.id;
            return (
              <div
                key={p.id}
                className={`relative rounded-2xl border bg-card p-6 shadow-sm ${
                  p.destaque ? 'border-primary/50 ring-1 ring-primary/30' : 'border-border'
                }`}
              >
                {p.destaque && (
                  <div className="absolute -top-3 right-4 rounded-full bg-primary px-2.5 py-0.5 text-[11px] font-medium text-primary-foreground">
                    Mais escolhido
                  </div>
                )}
                <div className="text-sm font-medium text-muted-foreground">{p.nome}</div>
                <div className="mt-1 flex items-baseline gap-1">
                  <div className="text-3xl font-semibold tracking-tight">{p.preco}</div>
                  <div className="text-sm text-muted-foreground">{p.ciclo}</div>
                </div>
                {p.economia && (
                  <div className="mt-1 text-xs font-medium text-emerald-600">{p.economia}</div>
                )}

                <ul className="mt-5 space-y-2">
                  {FEATURES.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>

                <div className="mt-6">
                  {current ? (
                    <button
                      disabled
                      className="w-full rounded-lg bg-muted px-4 py-2.5 text-sm font-medium text-muted-foreground"
                    >
                      Plano atual
                    </button>
                  ) : sub?.active ? (
                    <button
                      onClick={() => switchPlan(p.id)}
                      disabled={busy}
                      className="w-full rounded-lg border border-primary bg-primary/10 px-4 py-2.5 text-sm font-medium text-primary hover:bg-primary/20 disabled:opacity-50"
                    >
                      {busy ? (
                        <Loader2 className="mx-auto h-4 w-4 animate-spin" />
                      ) : (
                        `Trocar para ${p.nome} (pró-rata)`
                      )}
                    </button>
                  ) : (
                    <button
                      onClick={() => setCheckoutPlan(p.id)}
                      className={`w-full rounded-lg px-4 py-2.5 text-sm font-medium ${
                        p.destaque
                          ? 'bg-primary text-primary-foreground hover:opacity-90'
                          : 'border border-border bg-background hover:bg-muted'
                      }`}
                    >
                      Assinar {p.nome}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-8 text-center text-xs text-muted-foreground">
          <Link to="/app" className="hover:text-foreground">
            ← Voltar ao consultório
          </Link>
        </div>
      </div>
    </div>
  );
}
