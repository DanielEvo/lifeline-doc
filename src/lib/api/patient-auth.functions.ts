// Server functions de autenticação do paciente — espelha auth.functions.ts,
// mas em namespace totalmente separado do médico (ver patient-auth.server.ts).

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
  acceptPatientConsent,
  consumePatientPasswordReset,
  createPatient,
  createPatientEmailVerification,
  createPatientPasswordReset,
  createPatientSession,
  exchangeGoogleCode,
  findPatientByEmail,
  findPatientByToken,
  getGoogleConfig,
  googleAuthUrl,
  isPatientEmailVerified,
  requirePatient,
  revokePatientSession,
  verifyOAuthState,
  verifyPassword,
  verifyPatientEmailToken,
  type PatientAccount,
} from "../patient-auth.server";
import { sendPasswordResetEmail, sendVerificationEmail } from "../email.server";
import { updateRegistryProfile, findRegistryByGlobalId } from "../patients-registry.server";
import { extractBiomarkersFromDocument } from "../ocr-extraction.server";
import { BIOMARKER_CATALOG, resolveBiomarkerName } from "../clinic-types";
import {
  addPendingMeasurements,
  listPendingMeasurements,
} from "../patient-measurements.server";
import { createRateLimiter, createUsageCounter } from "../rate-limit.server";
import { CONSENT_VERSION } from "../consent";

// SEC-02 — mesmo padrão do lado médico (src/lib/api/auth.functions.ts).
const loginLimiter = createRateLimiter({ maxAttempts: 5, lockoutMs: 15 * 60 * 1000 });
const resetLimiter = createRateLimiter({ maxAttempts: 3, lockoutMs: 15 * 60 * 1000 });
// OCR-01 — teto de extrações por IA por conta de paciente/dia. Cada chamada
// bate na Gemini API (custo real); sem teto, uma conta comprometida ou um
// loop de retry no cliente pode gerar custo/abuso ilimitado.
const patientOcrCounter = createUsageCounter(24 * 60 * 60 * 1000);
const PATIENT_OCR_DAILY_LIMIT = 10;

type PatientAuthResult =
  | {
      ok: true;
      token: string;
      patient: { nome: string; email: string; avatarUrl: string | null; consentVersion: string | null };
    }
  | { ok: false; error: string };

type PatientRegisterResult =
  | { ok: true; needsVerification: true; email: string; devLink?: string }
  | { ok: false; error: string };

function pub(p: PatientAccount) {
  return { nome: p.nome, email: p.email, avatarUrl: p.avatarUrl, consentVersion: p.consentVersion };
}

const origemSchema = z.string().url().max(300);

// Cadastro por e-mail/senha NÃO cria sessão: manda o link de confirmação.
export const registerPatient = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      nome: z.string().min(2).max(120),
      email: z.string().email().max(160),
      password: z.string().min(6).max(120),
      origin: origemSchema,
      // LGP-01 — só aceita `true` explícito: sem checkbox marcado, nem
      // chega a criar a conta.
      consentAccepted: z.literal(true),
    }),
  )
  .handler(async ({ data }): Promise<PatientRegisterResult> => {
    const existing = await findPatientByEmail(data.email);
    if (existing) return { ok: false, error: "Este e-mail já tem cadastro. Faça login." };
    const patient = await createPatient({
      nome: data.nome,
      email: data.email,
      password: data.password,
      provider: "email",
    });
    await acceptPatientConsent(patient.id, CONSENT_VERSION);
    const token = await createPatientEmailVerification(patient.id);
    const link = `${data.origin}/paciente/confirmar-cadastro/${token}`;
    const sent = await sendVerificationEmail(patient.email, patient.nome, link);
    return {
      ok: true,
      needsVerification: true,
      email: patient.email,
      // Sem RESEND_API_KEY o e-mail nunca chega — devolvemos o link direto
      // pra não deixar o cadastro travado num ambiente sem provedor real.
      ...(!sent.sent && { devLink: link }),
    };
  });

export const loginPatient = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      email: z.string().email().max(160),
      password: z.string().min(1).max(120),
    }),
  )
  .handler(async ({ data }): Promise<PatientAuthResult> => {
    if (loginLimiter.isLocked(data.email))
      return { ok: false, error: "Muitas tentativas. Aguarde 15 minutos e tente de novo." };
    const patient = await findPatientByEmail(data.email);
    if (!patient) {
      loginLimiter.registerFailure(data.email);
      return { ok: false, error: "E-mail não encontrado. Crie sua conta." };
    }
    if (patient.provider === "google" && !patient.passHash)
      return { ok: false, error: "Esta conta usa login com Google." };
    if (!verifyPassword(patient, data.password)) {
      loginLimiter.registerFailure(data.email);
      return { ok: false, error: "Senha incorreta. Tente novamente." };
    }
    if (!isPatientEmailVerified(patient))
      return { ok: false, error: "E-mail ainda não confirmado. Verifique sua caixa de entrada." };
    loginLimiter.registerSuccess(data.email);
    const token = await createPatientSession(patient.id);
    return { ok: true, token, patient: pub(patient) };
  });

export const confirmPatientEmailVerification = createServerFn({ method: "POST" })
  .inputValidator(z.object({ token: z.string().min(10).max(120) }))
  .handler(async ({ data }) => {
    const patient = await verifyPatientEmailToken(data.token);
    if (!patient) return { ok: false as const, error: "invalid_or_expired" as const };
    return { ok: true as const, nome: patient.nome };
  });

export const resendPatientVerificationEmail = createServerFn({ method: "POST" })
  .inputValidator(z.object({ email: z.string().email().max(160), origin: origemSchema }))
  .handler(async ({ data }) => {
    const patient = await findPatientByEmail(data.email);
    let devLink: string | undefined;
    if (patient && !isPatientEmailVerified(patient)) {
      const token = await createPatientEmailVerification(patient.id);
      const link = `${data.origin}/paciente/confirmar-cadastro/${token}`;
      const sent = await sendVerificationEmail(patient.email, patient.nome, link);
      if (!sent.sent) devLink = link;
    }
    return { ok: true as const, devLink };
  });

export const requestPatientPasswordReset = createServerFn({ method: "POST" })
  .inputValidator(z.object({ email: z.string().email().max(160), origin: origemSchema }))
  .handler(async ({ data }) => {
    if (resetLimiter.isLocked(data.email)) return { ok: true as const, devLink: undefined };
    resetLimiter.registerFailure(data.email);
    const patient = await findPatientByEmail(data.email);
    let devLink: string | undefined;
    if (patient) {
      const token = await createPatientPasswordReset(patient.id);
      const link = `${data.origin}/paciente/redefinir-senha/${token}`;
      const sent = await sendPasswordResetEmail(patient.email, patient.nome, link, {
        googleOnly: patient.provider === "google" && !patient.passHash,
      });
      if (!sent.sent) devLink = link;
    }
    return { ok: true as const, devLink };
  });

export const resetPatientPassword = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      token: z.string().min(10).max(120),
      novaSenha: z.string().min(6).max(120),
    }),
  )
  .handler(async ({ data }) => {
    const patient = await consumePatientPasswordReset(data.token, data.novaSenha);
    if (!patient) return { ok: false as const, error: "invalid_or_expired" as const };
    return { ok: true as const, email: patient.email };
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

// LGP-01 — aceite explícito e versionado dos termos. Chamado pelo modal
// bloqueante em /paciente/app quando patient.consentVersion !== CONSENT_VERSION.
export const acceptPatientConsentFn = createServerFn({ method: "POST" })
  .inputValidator(z.object({ token: z.string().min(1) }))
  .handler(async ({ data }) => {
    const patient = await requirePatient(data.token);
    if (!patient) return { ok: false as const };
    await acceptPatientConsent(patient.id, CONSENT_VERSION);
    return { ok: true as const };
  });

// ---------------------------------------------------------------------------
// Timeline do paciente — vínculo com o prontuário (patientCode) ainda não
// decidido (Pergunta 1, opções A/B/C em aberto). Por ora patientCode é
// SEMPRE null, então isso só devolve linked:false — sem inventar dados
// clínicos. Já devolve os dados autodeclarados (perfil) e o draft de
// biomarcadores enviados pelo próprio paciente.
// ---------------------------------------------------------------------------

export const getPatientTimeline = createServerFn({ method: "POST" })
  .inputValidator(z.object({ token: z.string().min(1) }))
  .handler(async ({ data }) => {
    const patient = await requirePatient(data.token);
    if (!patient) return { ok: false as const, error: "unauthorized" as const };
    const registry = await findRegistryByGlobalId(patient.globalId);
    const pendingMeasurements = await listPendingMeasurements(patient.globalId);
    return {
      ok: true as const,
      linked: false as const,
      profile: {
        publicCode: registry?.publicCode ?? null,
        birthDate: registry?.birthDate ?? null,
        sexo: registry?.sexo ?? null,
        telefone: registry?.telefone ?? null,
        cpf: registry?.cpf ?? null,
        tipoSanguineo: registry?.patientProfile?.tipoSanguineo ?? null,
        alergias: registry?.patientProfile?.alergias ?? null,
        pesoKg: registry?.patientProfile?.pesoKg ?? null,
        alturaCm: registry?.patientProfile?.alturaCm ?? null,
      },
      pendingMeasurements: pendingMeasurements.map((m) => ({
        id: m.id,
        name: m.matchedName ?? m.rawName,
        value: m.value,
        unit: m.unit,
        collectionDate: m.collectionDate,
      })),
    };
  });

// ---------------------------------------------------------------------------
// Perfil autodeclarado do paciente (TECH-13). Escreve em patients_registry.
// CPF é salvo aqui mas SEM lógica de busca/match — a ligação com prontuários
// de médicos entra numa próxima rodada.
// ---------------------------------------------------------------------------

export const updatePatientProfile = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      token: z.string().min(1),
      birthDate: z.string().max(20).optional(),
      sexo: z.enum(["F", "M", "outro"]).optional(),
      telefone: z.string().max(24).optional(),
      cpf: z.string().max(20).optional(),
      tipoSanguineo: z.string().max(6).optional(),
      alergias: z.string().max(500).optional(),
      pesoKg: z.number().min(0).max(500).optional(),
      alturaCm: z.number().min(0).max(280).optional(),
    }),
  )
  .handler(async ({ data }) => {
    const patient = await requirePatient(data.token);
    if (!patient) return { ok: false as const, error: "unauthorized" as const };
    await updateRegistryProfile(patient.globalId, {
      birthDate: data.birthDate,
      sexo: data.sexo,
      telefone: data.telefone,
      cpf: data.cpf,
      tipoSanguineo: data.tipoSanguineo,
      alergias: data.alergias,
      pesoKg: data.pesoKg,
      alturaCm: data.alturaCm,
    });
    return { ok: true as const };
  });

// ---------------------------------------------------------------------------
// Upload de exame pelo paciente — MESMO pipeline OCR do médico
// (extractBiomarkersFromDocument), só troca a autenticação. Nunca escreve
// em measurements.json: só cria draft em patient_pending_measurements.
// ---------------------------------------------------------------------------

// PAC-04 — mesmo teto de tamanho do lado médico (clinic.functions.ts).
const MAX_EXAM_BASE64_CHARS = Math.ceil(((15 * 1024 * 1024) / 3) * 4);

export const extractExamDocumentPatient = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      token: z.string().min(1),
      fileBase64: z.string().min(1).max(MAX_EXAM_BASE64_CHARS),
      mimeType: z.enum(["application/pdf", "image/jpeg", "image/png", "image/webp"]),
    }),
  )
  .handler(async ({ data }) => {
    const patient = await requirePatient(data.token);
    if (!patient) return { ok: false as const, error: "unauthorized" as const };
    const used = patientOcrCounter.increment(patient.id);
    if (used > PATIENT_OCR_DAILY_LIMIT) {
      return { ok: false as const, error: "ocr_limit" as const };
    }
    try {
      const result = await extractBiomarkersFromDocument(data.fileBase64, data.mimeType);
      const items = result.biomarkers.map((b) => {
        const match = resolveBiomarkerName(b.rawName);
        return {
          rawName: b.rawName,
          value: b.value,
          unit: match?.unit ?? b.unit,
          refMin: match?.min ?? null,
          refMax: match?.max ?? null,
          matchedName: match?.name ?? null,
        };
      });
      return { ok: true as const, collectionDate: result.collectionDate, items };
    } catch (e) {
      return { ok: false as const, error: "extraction_failed" as const, detail: String(e) };
    }
  });

export const confirmPatientMeasurements = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      token: z.string().min(1),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
      items: z
        .array(
          z.object({
            rawName: z.string().max(120).optional(),
            name: z.string().min(1).max(60),
            value: z.number().finite(),
            unit: z.string().max(16),
            refMin: z.number().finite().nullable().optional(),
            refMax: z.number().finite().nullable().optional(),
          }),
        )
        .min(1)
        .max(200),
    }),
  )
  .handler(async ({ data }) => {
    const patient = await requirePatient(data.token);
    if (!patient) return { ok: false as const, error: "unauthorized" as const };
    const catalogNames = new Set<string>(BIOMARKER_CATALOG.map((b) => b.name));
    await addPendingMeasurements(
      patient.globalId,
      data.items.map((it) => ({
        rawName: it.rawName ?? it.name,
        matchedName: catalogNames.has(it.name) ? it.name : null,
        value: it.value,
        unit: it.unit,
        refMin: it.refMin ?? null,
        refMax: it.refMax ?? null,
        collectionDate: data.date ?? null,
      })),
    );
    return { ok: true as const, added: data.items.length };
  });
