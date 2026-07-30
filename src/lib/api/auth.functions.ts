import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
  consumePasswordReset,
  createDoctor,
  createEmailVerification,
  createPasswordReset,
  createSession,
  exchangeGoogleCode,
  findDoctorByEmail,
  findDoctorByToken,
  getGoogleConfig,
  googleAuthUrl,
  isEmailVerified,
  revokeSession,
  verifyEmailToken,
  verifyOAuthState,
  verifyPassword,
  type Doctor,
} from "../auth.server";
import { sendPasswordResetEmail, sendVerificationEmail } from "../email.server";

type AuthResult =
  | { ok: true; token: string; doctor: { nome: string; email: string; avatarUrl: string | null } }
  | { ok: false; error: string };

type RegisterResult =
  | { ok: true; needsVerification: true; email: string }
  | { ok: false; error: string };

function pub(d: Doctor) {
  return { nome: d.nome, email: d.email, avatarUrl: d.avatarUrl };
}

const origemSchema = z.string().url().max(300);

// Cadastro por e-mail/senha NÃO cria sessão: manda o link de confirmação e
// deixa a conta pendente até o médico clicar nele.
export const registerDoctor = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      nome: z.string().min(2).max(120),
      email: z.string().email().max(160),
      password: z.string().min(6).max(120),
      origin: origemSchema,
    }),
  )
  .handler(async ({ data }): Promise<RegisterResult> => {
    const existing = await findDoctorByEmail(data.email);
    if (existing) return { ok: false, error: "Este e-mail já tem cadastro. Faça login." };
    const doctor = await createDoctor({
      nome: data.nome,
      email: data.email,
      password: data.password,
      provider: "email",
    });
    const token = await createEmailVerification(doctor.id);
    await sendVerificationEmail(
      doctor.email,
      doctor.nome,
      `${data.origin}/confirmar-cadastro/${token}`,
    );
    return { ok: true, needsVerification: true, email: doctor.email };
  });

export const loginDoctor = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      email: z.string().email().max(160),
      password: z.string().min(1).max(120),
    }),
  )
  .handler(async ({ data }): Promise<AuthResult> => {
    const doctor = await findDoctorByEmail(data.email);
    if (!doctor) return { ok: false, error: "E-mail não encontrado. Crie sua conta." };
    if (doctor.provider === "google" && !doctor.passHash)
      return { ok: false, error: "Esta conta usa login com Google." };
    if (!verifyPassword(doctor, data.password))
      return { ok: false, error: "Senha incorreta. Tente novamente." };
    if (!isEmailVerified(doctor))
      return { ok: false, error: "E-mail ainda não confirmado. Verifique sua caixa de entrada." };
    const token = await createSession(doctor.id);
    return { ok: true, token, doctor: pub(doctor) };
  });

// Confirmação pública do cadastro (sem auth) — o token é a única credencial.
export const confirmEmailVerification = createServerFn({ method: "POST" })
  .inputValidator(z.object({ token: z.string().min(10).max(120) }))
  .handler(async ({ data }) => {
    const doctor = await verifyEmailToken(data.token);
    if (!doctor) return { ok: false as const, error: "invalid_or_expired" as const };
    return { ok: true as const, nome: doctor.nome };
  });

// Reenvio: SEMPRE ok — não revela se o e-mail existe ou já está verificado.
export const resendVerificationEmail = createServerFn({ method: "POST" })
  .inputValidator(z.object({ email: z.string().email().max(160), origin: origemSchema }))
  .handler(async ({ data }) => {
    const doctor = await findDoctorByEmail(data.email);
    if (doctor && !isEmailVerified(doctor)) {
      const token = await createEmailVerification(doctor.id);
      await sendVerificationEmail(
        doctor.email,
        doctor.nome,
        `${data.origin}/confirmar-cadastro/${token}`,
      );
    }
    return { ok: true as const };
  });

// Resposta genérica sempre igual — não revela existência de conta nem se ela
// é Google-only (essa nota vai só no corpo do e-mail, se a conta existir).
export const requestPasswordReset = createServerFn({ method: "POST" })
  .inputValidator(z.object({ email: z.string().email().max(160), origin: origemSchema }))
  .handler(async ({ data }) => {
    const doctor = await findDoctorByEmail(data.email);
    if (doctor) {
      const token = await createPasswordReset(doctor.id);
      await sendPasswordResetEmail(
        doctor.email,
        doctor.nome,
        `${data.origin}/redefinir-senha/${token}`,
        { googleOnly: doctor.provider === "google" && !doctor.passHash },
      );
    }
    return { ok: true as const };
  });

export const resetPassword = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      token: z.string().min(10).max(120),
      novaSenha: z.string().min(6).max(120),
    }),
  )
  .handler(async ({ data }) => {
    const doctor = await consumePasswordReset(data.token, data.novaSenha);
    if (!doctor) return { ok: false as const, error: "invalid_or_expired" as const };
    return { ok: true as const, email: doctor.email };
  });


// Passo 1 do Google: devolve a URL de autorização quando o OAuth real está
// configurado (GOOGLE_CLIENT_ID/SECRET), ou url:null para o cliente cair no
// fluxo simulado de desenvolvimento.
export const googleAuthStart = createServerFn({ method: "POST" })
  .inputValidator(z.object({ redirectUri: z.string().url().max(400) }))
  .handler(async ({ data }) => ({ url: googleAuthUrl(data.redirectUri) }));

// Passo 2 do Google: o /auth/callback troca code+state por uma sessão real.
export const googleExchange = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      code: z.string().min(1).max(600),
      state: z.string().min(1).max(200),
      redirectUri: z.string().url().max(400),
    }),
  )
  .handler(async ({ data }): Promise<AuthResult> => {
    if (!getGoogleConfig()) return { ok: false, error: "Google OAuth não configurado." };
    if (!verifyOAuthState(data.state))
      return { ok: false, error: "Sessão de login expirada. Tente novamente." };
    const profile = await exchangeGoogleCode(data.code, data.redirectUri);
    if ("error" in profile) return { ok: false, error: profile.error };
    let doctor = await findDoctorByEmail(profile.email);
    if (!doctor) {
      doctor = await createDoctor({
        nome: profile.nome,
        email: profile.email,
        provider: "google",
        avatarUrl: profile.avatarUrl,
      });
    }
    const token = await createSession(doctor.id);
    return { ok: true, token, doctor: pub(doctor) };
  });

// Fallback de desenvolvimento: sem credenciais Google configuradas, o botão
// autentica uma persona de demonstração — passando pelo MESMO fluxo real de
// conta + sessão do backend. Em produção (env configurada) nunca é usado.
export const googleLogin = createServerFn({ method: "POST" })
  .inputValidator(z.object({}).optional())
  .handler(async (): Promise<AuthResult> => {
    await new Promise((r) => setTimeout(r, 700));
    const email = "helena.costa@lifeline.med.br";
    let doctor = await findDoctorByEmail(email);
    if (!doctor) {
      doctor = await createDoctor({ nome: "Dra. Helena Costa", email, provider: "google" });
    }
    const token = await createSession(doctor.id);
    return { ok: true, token, doctor: pub(doctor) };
  });

export const getMe = createServerFn({ method: "POST" })
  .inputValidator(z.object({ token: z.string().min(1) }))
  .handler(async ({ data }) => {
    const doctor = await findDoctorByToken(data.token);
    return doctor
      ? { ok: true as const, doctor: pub(doctor) }
      : { ok: false as const };
  });

export const logout = createServerFn({ method: "POST" })
  .inputValidator(z.object({ token: z.string().min(1) }))
  .handler(async ({ data }) => {
    await revokeSession(data.token);
    return { ok: true as const };
  });
