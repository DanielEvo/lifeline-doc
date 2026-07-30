// Server-only: envio de e-mail transacional via Resend.
//
// Sem RESEND_API_KEY configurada o app NÃO quebra — loga um aviso e devolve
// { sent: false }. Isso mantém dev/preview funcionando (o fluxo de cadastro
// segue normalmente, só o e-mail não chega de fato). Nunca simula sucesso:
// o retorno diz claramente que nada foi enviado.
//
// process.env é lido DENTRO das funções (runtime edge injeta por request).

import { Resend } from "resend";

export type SendResult = { sent: boolean; error?: string };

const FALLBACK_FROM = "LifeLine <onboarding@resend.dev>";

function shell(titulo: string, corpo: string): string {
  return `<!doctype html>
<html lang="pt-BR"><body style="margin:0;padding:24px;background:#f6f7f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#0f172a">
  <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:16px;padding:28px 26px;border:1px solid #e5e7eb">
    <div style="font-size:15px;font-weight:600;letter-spacing:-.01em;color:#0d9488">LifeLine</div>
    <h1 style="margin:18px 0 12px;font-size:19px;line-height:1.3;font-weight:600">${titulo}</h1>
    ${corpo}
    <hr style="margin:26px 0 14px;border:none;border-top:1px solid #e5e7eb" />
    <p style="margin:0;font-size:11px;color:#94a3b8">LifeLine · Ecossistema Médico Inteligente</p>
  </div>
</body></html>`;
}

function botao(link: string, texto: string): string {
  return `<p style="margin:22px 0">
    <a href="${link}" style="display:inline-block;background:#0d9488;color:#ffffff;text-decoration:none;padding:11px 20px;border-radius:10px;font-size:14px;font-weight:600">${texto}</a>
  </p>
  <p style="margin:0;font-size:12px;color:#64748b;word-break:break-all">Se o botão não funcionar, copie este endereço no navegador:<br />${link}</p>`;
}

async function send(to: string, subject: string, html: string): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn(
      `[email] RESEND_API_KEY ausente — e-mail para ${to} ("${subject}") NÃO foi enviado.`,
    );
    return { sent: false, error: "not_configured" };
  }
  const from = process.env.RESEND_FROM_EMAIL || FALLBACK_FROM;
  try {
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({ from, to, subject, html });
    if (error) {
      console.error("[email] falha no envio:", error.message);
      return { sent: false, error: error.message };
    }
    return { sent: true };
  } catch (e) {
    console.error("[email] erro inesperado no envio:", e);
    return { sent: false, error: String(e) };
  }
}

export async function sendVerificationEmail(
  to: string,
  nome: string,
  link: string,
): Promise<SendResult> {
  const primeiro = nome.split(" ")[0] || nome;
  return send(
    to,
    "Confirme seu e-mail · LifeLine",
    shell(
      `Olá, ${primeiro} — falta só um passo`,
      `<p style="margin:0;font-size:14px;line-height:1.6;color:#334155">
         Sua conta no LifeLine já está criada. Para começar a usar, confirme
         que este e-mail é seu.
       </p>
       ${botao(link, "Confirmar meu e-mail")}
       <p style="margin:18px 0 0;font-size:12px;color:#64748b">
         Este link vale por 24 horas. Se você não criou esta conta, pode ignorar esta mensagem.
       </p>`,
    ),
  );
}

export async function sendPasswordResetEmail(
  to: string,
  nome: string,
  link: string,
  opts?: { googleOnly?: boolean },
): Promise<SendResult> {
  const primeiro = nome.split(" ")[0] || nome;
  const notaGoogle = opts?.googleOnly
    ? `<p style="margin:18px 0 0;font-size:13px;line-height:1.6;color:#b45309;background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:10px 12px">
         Atenção: esta conta usa <strong>login com Google</strong>, não senha.
         Basta voltar à tela de acesso e escolher "Entrar com Google".
       </p>`
    : "";
  return send(
    to,
    "Redefinir sua senha · LifeLine",
    shell(
      `Olá, ${primeiro} — vamos recuperar seu acesso`,
      `<p style="margin:0;font-size:14px;line-height:1.6;color:#334155">
         Recebemos um pedido para redefinir a senha da sua conta LifeLine.
         Clique abaixo para criar uma nova senha.
       </p>
       ${botao(link, "Criar nova senha")}
       <p style="margin:18px 0 0;font-size:12px;color:#64748b">
         Este link expira em <strong>30 minutos</strong> e só pode ser usado uma vez.
         Se você não pediu isso, pode ignorar este e-mail — sua senha continua a mesma.
       </p>
       ${notaGoogle}`,
    ),
  );
}
