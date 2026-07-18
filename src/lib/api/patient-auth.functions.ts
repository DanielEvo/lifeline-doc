// Server functions de autenticação do paciente — espelha auth.functions.ts,
// mas em namespace totalmente separado do médico (ver patient-auth.server.ts).

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
  createPatient,
  createPatientSession,
  exchangeGoogleCode,
  findPatientByEmail,
  findPatientByToken,
  getGoogleConfig,
  googleAuthUrl,
  requirePatient,
  revokePatientSession,
  verifyOAuthState,
  verifyPassword,
  type PatientAccount,
} from "../patient-auth.server";

type PatientAuthResult =
  | { ok: true; token: string; patient: { nome: string; email: string; avatarUrl: string | null } }
  | { ok: false; error: string };

function pub(p: PatientAccount) {
  return { nome: p.nome, email: p.email, avatarUrl: p.avatarUrl };
}

export const registerPatient = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      nome: z.string().min(2).max(120),
      email: z.string().email().max(160),
      password: z.string().min(6).max(120),
    }),
  )
  .handler(async ({ data }): Promise<PatientAuthResult> => {
    const existing = await findPatientByEmail(data.email);
    if (existing) return { ok: false, error: "Este e-mail já tem cadastro. Faça login." };
    const patient = await createPatient({ ...data, provider: "email" });
    const token = await createPatientSession(patient.id);
    return { ok: true, token, patient: pub(patient) };
  });

export const loginPatient = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      email: z.string().email().max(160),
      password: z.string().min(1).max(120),
    }),
  )
  .handler(async ({ data }): Promise<PatientAuthResult> => {
    const patient = await findPatientByEmail(data.email);
    if (!patient) return { ok: false, error: "E-mail não encontrado. Crie sua conta." };
    if (patient.provider === "google" && !patient.passHash)
      return { ok: false, error: "Esta conta usa login com Google." };
    if (!verifyPassword(patient, data.password))
      return { ok: false, error: "Senha incorreta. Tente novamente." };
    const token = await createPatientSession(patient.id);
    return { ok: true, token, patient: pub(patient) };
  });

// Passo 1 do Google: devolve a URL de autorização quando o OAuth real está
// configurado (GOOGLE_CLIENT_ID/SECRET), ou url:null para o cliente cair no
// fluxo simulado de desenvolvimento.
export const patientGoogleAuthStart = createServerFn({ method: "POST" })
  .inputValidator(z.object({ redirectUri: z.string().url().max(400) }))
  .handler(async ({ data }) => ({ url: googleAuthUrl(data.redirectUri) }));

// Passo 2 do Google: a página de callback do paciente troca code+state por
// uma sessão real.
export const patientGoogleExchange = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      code: z.string().min(1).max(600),
      state: z.string().min(1).max(200),
      redirectUri: z.string().url().max(400),
    }),
  )
  .handler(async ({ data }): Promise<PatientAuthResult> => {
    if (!getGoogleConfig()) return { ok: false, error: "Google OAuth não configurado." };
    if (!verifyOAuthState(data.state))
      return { ok: false, error: "Sessão de login expirada. Tente novamente." };
    const profile = await exchangeGoogleCode(data.code, data.redirectUri);
    if ("error" in profile) return { ok: false, error: profile.error };
    let patient = await findPatientByEmail(profile.email);
    if (!patient) {
      patient = await createPatient({
        nome: profile.nome,
        email: profile.email,
        provider: "google",
        avatarUrl: profile.avatarUrl,
      });
    }
    const token = await createPatientSession(patient.id);
    return { ok: true, token, patient: pub(patient) };
  });

// Fallback de desenvolvimento: sem credenciais Google configuradas, o botão
// autentica uma persona de demonstração (mesma "Mariana Silva" usada no
// resto da demo) — passando pelo MESMO fluxo real de conta + sessão do
// backend. Em produção (env configurada) nunca é usado.
export const patientGoogleLogin = createServerFn({ method: "POST" })
  .inputValidator(z.object({}).optional())
  .handler(async (): Promise<PatientAuthResult> => {
    await new Promise((r) => setTimeout(r, 700));
    const email = "mariana@email.com";
    let patient = await findPatientByEmail(email);
    if (!patient) {
      patient = await createPatient({ nome: "Mariana Silva", email, provider: "google" });
    }
    const token = await createPatientSession(patient.id);
    return { ok: true, token, patient: pub(patient) };
  });

export const getMePatient = createServerFn({ method: "POST" })
  .inputValidator(z.object({ token: z.string().min(1) }))
  .handler(async ({ data }) => {
    const patient = await findPatientByToken(data.token);
    return patient ? { ok: true as const, patient: pub(patient) } : { ok: false as const };
  });

export const logoutPatient = createServerFn({ method: "POST" })
  .inputValidator(z.object({ token: z.string().min(1) }))
  .handler(async ({ data }) => {
    await revokePatientSession(data.token);
    return { ok: true as const };
  });

// ---------------------------------------------------------------------------
// Timeline do paciente — vínculo com o prontuário (patientCode) ainda não
// decidido (Pergunta 1, opções A/B/C em aberto). Por ora patientCode é
// SEMPRE null, então isso só devolve linked:false — sem inventar dados nem
// tentar casar por CPF/e-mail.
// ---------------------------------------------------------------------------

export const getPatientTimeline = createServerFn({ method: "POST" })
  .inputValidator(z.object({ token: z.string().min(1) }))
  .handler(async ({ data }) => {
    const patient = await requirePatient(data.token);
    if (!patient) return { ok: false as const, error: "unauthorized" as const };
    if (!patient.patientCode) return { ok: true as const, linked: false as const };
    // patient.patientCode existirá quando o vínculo (Pergunta 1) for
    // decidido — a leitura do prontuário entra aqui nessa rodada futura.
    return { ok: true as const, linked: false as const };
  });
