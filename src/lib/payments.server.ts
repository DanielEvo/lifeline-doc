// Server-only: adaptador real para a Stripe Checkout (modo sandbox/teste).
// Contrato confirmado em docs.stripe.com: chaves de teste começam com
// "sk_test_", e POST https://api.stripe.com/v1/checkout/sessions (form-
// -encoded, Basic auth com a secret key) devolve uma sessão com `url`
// hospedada — sem mover dinheiro de verdade. Sem STRIPE_SECRET_KEY no
// ambiente, cai em "not_configured" e a cobrança segue só com o lembrete
// por WhatsApp (sem link de pagamento), como hoje.

export function isStripeConfigured(): boolean {
  return !!process.env.STRIPE_SECRET_KEY;
}

export type StripeLinkResult =
  | { ok: true; url: string }
  | { ok: false; error: "not_configured" | "stripe_error"; detail?: string };

export async function createStripeCheckoutLink(input: {
  descricao: string;
  valorReais: number;
  successUrl: string;
  cancelUrl: string;
}): Promise<StripeLinkResult> {
  if (!isStripeConfigured()) return { ok: false, error: "not_configured" };
  const secretKey = process.env.STRIPE_SECRET_KEY!;

  const params = new URLSearchParams();
  params.set("mode", "payment");
  params.set("success_url", input.successUrl);
  params.set("cancel_url", input.cancelUrl);
  params.set("line_items[0][price_data][currency]", "brl");
  params.set("line_items[0][price_data][product_data][name]", input.descricao.slice(0, 120));
  params.set("line_items[0][price_data][unit_amount]", String(Math.round(input.valorReais * 100)));
  params.set("line_items[0][quantity]", "1");

  try {
    const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${secretKey}:`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });
    const json: any = await res.json().catch(() => null);
    if (!res.ok || !json?.url) {
      return { ok: false, error: "stripe_error", detail: JSON.stringify(json)?.slice(0, 300) };
    }
    return { ok: true, url: json.url as string };
  } catch (e) {
    return { ok: false, error: "stripe_error", detail: String(e) };
  }
}
