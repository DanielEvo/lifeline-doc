// Server-only: adaptador real para a WhatsApp Business Cloud API (Meta).
// Contrato confirmado em developers.facebook.com/docs/whatsapp/cloud-api:
// POST https://graph.facebook.com/v23.0/{PHONE_NUMBER_ID}/messages com
// Bearer token de um usuário de sistema. Sem WHATSAPP_ACCESS_TOKEN/
// WHATSAPP_PHONE_NUMBER_ID no ambiente, o app segue usando o link wa.me
// (envio manual) que já funciona hoje — isto é só o envio automático.
//
// Limite real do modo sandbox/teste da Meta: só entrega para números
// verificados como destinatário de teste no App Dashboard.

const GRAPH_API_VERSION = "v23.0";

export function isWhatsAppApiConfigured(): boolean {
  return !!(process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);
}

function toE164BR(phoneRaw: string): string {
  const digits = phoneRaw.replace(/\D/g, "");
  return digits.startsWith("55") ? digits : `55${digits}`;
}

export type WhatsAppSendResult =
  | { ok: true }
  | { ok: false; error: "not_configured" | "send_failed"; detail?: string };

export async function sendWhatsAppTextReal(toPhone: string, body: string): Promise<WhatsAppSendResult> {
  if (!isWhatsAppApiConfigured()) return { ok: false, error: "not_configured" };
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID!;
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN!;

  try {
    const res = await fetch(`https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: toE164BR(toPhone),
        type: "text",
        text: { body },
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return { ok: false, error: "send_failed", detail: detail.slice(0, 300) };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: "send_failed", detail: String(e) };
  }
}
