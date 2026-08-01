// Server-only auth: patient accounts with salted SHA-256 password hashing
// and expiring token sessions, persisted via db.server — mesmo padrão de
// auth.server.ts, mas em namespace TOTALMENTE separado (patient_accounts.json
// / patient_sessions.json). NUNCA compartilha tabela com doctors.json /
// sessions.json (TECH-12).
//
// O fluxo de Google OAuth 2.0 é genérico (não depende de médico ou
// paciente) — reaproveita os helpers já existentes em auth.server.ts em vez
// de duplicar a implementação. patient-auth.functions.ts importa tudo que
// precisa a partir deste módulo (mesmo padrão de auth.functions.ts importar
// tudo de auth.server.ts).
//
// patientCode fica SEMPRE null por ora — o vínculo entre a conta do
// paciente e o prontuário (patientCode) ainda não foi decidido (Pergunta 1,
// opções A/B/C em aberto). Não inventar lógica de match por CPF/e-mail aqui.

import crypto from "node:crypto";

import { mutateRows, newId, nowIso, readRows } from "./db.server";
import { createRegistryEntry } from "./patients-registry.server";

export type PatientAccount = {
  id: string;
  nome: string;
  email: string;
  passHash: string | null; // null para contas Google
  salt: string | null;
  provider: "email" | "google";
  avatarUrl: string | null;
  patientCode: string | null; // vínculo com prontuário — decisão futura, sempre null por ora
  globalId: string; // TECH-13: aponta para patients_registry.json
  createdAt: string;
  // Verificação de e-mail. OPCIONAL de propósito: contas anteriores a este
  // campo (ausente) contam como verificadas — ver isPatientEmailVerified().
  emailVerified?: boolean;
  // LGP-01 — consentimento versionado (LGPD). null até o paciente aceitar os
  // termos vigentes; comparar com CONSENT_VERSION (src/lib/consent.ts).
  consentVersion: string | null;
  consentAcceptedAt: string | null;
};

/** Ausência do campo = conta legada, já em uso → nunca travar o acesso. */
export function isPatientEmailVerified(p: PatientAccount): boolean {
  return p.emailVerified !== false;
}

type PatientSession = { token: string; patientId: string; createdAt: string; expiresAt: string };

export type PatientEmailVerification = {
  token: string;
  patientId: string;
  createdAt: string;
  expiresAt: string;
};

export type PatientPasswordReset = {
  token: string;
  patientId: string;
  createdAt: string;
  expiresAt: string;
  usedAt: string | null;
};

const PATIENT_ACCOUNTS = "patient_accounts.json";
const PATIENT_SESSIONS = "patient_sessions.json";
const PATIENT_EMAIL_VERIFICATIONS = "patient_email_verifications.json";
const PATIENT_PASSWORD_RESETS = "patient_password_resets.json";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 dias
const VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000; // 24 horas
const RESET_TTL_MS = 30 * 60 * 1000; // 30 minutos

function hashPassword(password: string, salt: string) {
  return crypto.createHash("sha256").update(`${salt}:${password}`).digest("hex");
}

export async function findPatientByEmail(email: string): Promise<PatientAccount | undefined> {
  const rows = await readRows<PatientAccount>(PATIENT_ACCOUNTS);
  return rows.find((p) => p.email.toLowerCase() === email.toLowerCase());
}

export async function createPatient(input: {
  nome: string;
  email: string;
  password?: string;
  provider: "email" | "google";
  avatarUrl?: string | null;
}): Promise<PatientAccount> {
  const salt = input.password ? crypto.randomBytes(12).toString("hex") : null;
  const id = newId();
  const registry = await createRegistryEntry(
    { fullName: input.nome, email: input.email },
    { type: "patient", id },
  );
  const patient: PatientAccount = {
    id,
    nome: input.nome,
    email: input.email,
    passHash: input.password && salt ? hashPassword(input.password, salt) : null,
    salt,
    provider: input.provider,
    avatarUrl: input.avatarUrl ?? null,
    patientCode: null,
    globalId: registry.globalId,
    createdAt: nowIso(),
    // Google já validou o e-mail no OAuth; cadastro por senha precisa confirmar.
    emailVerified: input.provider === "google",
    consentVersion: null,
    consentAcceptedAt: null,
  };
  await mutateRows<PatientAccount>(PATIENT_ACCOUNTS, (rows) => {
    rows.push(patient);
  });
  return patient;
}

export function verifyPassword(patient: PatientAccount, password: string): boolean {
  if (!patient.passHash || !patient.salt) return false;
  const expected = Buffer.from(patient.passHash, "hex");
  const actual = Buffer.from(hashPassword(password, patient.salt), "hex");
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

export async function createPatientSession(patientId: string): Promise<string> {
  const token = crypto.randomBytes(24).toString("hex");
  const now = Date.now();
  await mutateRows<PatientSession>(PATIENT_SESSIONS, (rows) => {
    // prune expired sessions while we're here
    const alive = rows.filter((s) => Date.parse(s.expiresAt) > now);
    alive.push({
      token,
      patientId,
      createdAt: nowIso(),
      expiresAt: new Date(now + SESSION_TTL_MS).toISOString(),
    });
    return alive;
  });
  return token;
}

export async function findPatientByToken(token: string): Promise<PatientAccount | undefined> {
  const sessions = await readRows<PatientSession>(PATIENT_SESSIONS);
  const s = sessions.find((x) => x.token === token);
  if (!s || Date.parse(s.expiresAt) <= Date.now()) return undefined;
  const patients = await readRows<PatientAccount>(PATIENT_ACCOUNTS);
  return patients.find((p) => p.id === s.patientId);
}

/** Resolve o paciente da sessão ou null — toda server fn autenticada de paciente passa aqui. */
export async function requirePatient(
  token: string | undefined | null,
): Promise<PatientAccount | null> {
  if (!token) return null;
  return (await findPatientByToken(token)) ?? null;
}

/** LGP-01 — grava o aceite explícito dos termos vigentes. */
export async function acceptPatientConsent(patientId: string, version: string): Promise<void> {
  await mutateRows<PatientAccount>(PATIENT_ACCOUNTS, (rows) => {
    const p = rows.find((x) => x.id === patientId);
    if (p) {
      p.consentVersion = version;
      p.consentAcceptedAt = nowIso();
    }
  });
}

export async function revokePatientSession(token: string): Promise<void> {
  await mutateRows<PatientSession>(PATIENT_SESSIONS, (rows) =>
    rows.filter((x) => x.token !== token),
  );
}

/** Derruba TODAS as sessões da conta — usado ao trocar a senha. */
export async function revokeAllPatientSessions(patientId: string): Promise<void> {
  await mutateRows<PatientSession>(PATIENT_SESSIONS, (rows) =>
    rows.filter((x) => x.patientId !== patientId),
  );
}

// ---------------------------------------------------------------------------
// Verificação de e-mail (token de uso único, 24h) — espelha auth.server.ts.
// ---------------------------------------------------------------------------

export async function createPatientEmailVerification(patientId: string): Promise<string> {
  const token = crypto.randomBytes(24).toString("hex");
  const now = Date.now();
  await mutateRows<PatientEmailVerification>(PATIENT_EMAIL_VERIFICATIONS, (rows) => {
    const alive = rows.filter(
      (r) => Date.parse(r.expiresAt) > now && r.patientId !== patientId,
    );
    alive.push({
      token,
      patientId,
      createdAt: nowIso(),
      expiresAt: new Date(now + VERIFICATION_TTL_MS).toISOString(),
    });
    return alive;
  });
  return token;
}

export async function verifyPatientEmailToken(token: string): Promise<PatientAccount | null> {
  const rows = await readRows<PatientEmailVerification>(PATIENT_EMAIL_VERIFICATIONS);
  const row = rows.find((r) => r.token === token);
  if (!row || Date.parse(row.expiresAt) <= Date.now()) return null;
  let updated: PatientAccount | null = null;
  await mutateRows<PatientAccount>(PATIENT_ACCOUNTS, (list) => {
    const p = list.find((x) => x.id === row.patientId);
    if (!p) return;
    p.emailVerified = true;
    updated = { ...p };
  });
  await mutateRows<PatientEmailVerification>(PATIENT_EMAIL_VERIFICATIONS, (list) =>
    list.filter((r) => r.token !== token),
  );
  return updated;
}

// ---------------------------------------------------------------------------
// Recuperação de senha (token de uso único, 30 min).
// ---------------------------------------------------------------------------

export async function createPatientPasswordReset(patientId: string): Promise<string> {
  const token = crypto.randomBytes(24).toString("hex");
  const now = Date.now();
  await mutateRows<PatientPasswordReset>(PATIENT_PASSWORD_RESETS, (rows) => {
    const alive = rows.filter((r) => Date.parse(r.expiresAt) > now && !r.usedAt);
    alive.push({
      token,
      patientId,
      createdAt: nowIso(),
      expiresAt: new Date(now + RESET_TTL_MS).toISOString(),
      usedAt: null,
    });
    return alive;
  });
  return token;
}

export async function consumePatientPasswordReset(
  token: string,
  novaSenha: string,
): Promise<PatientAccount | null> {
  const rows = await readRows<PatientPasswordReset>(PATIENT_PASSWORD_RESETS);
  const row = rows.find((r) => r.token === token);
  if (!row || row.usedAt || Date.parse(row.expiresAt) <= Date.now()) return null;

  const salt = crypto.randomBytes(12).toString("hex");
  let updated: PatientAccount | null = null;
  await mutateRows<PatientAccount>(PATIENT_ACCOUNTS, (list) => {
    const p = list.find((x) => x.id === row.patientId);
    if (!p) return;
    p.salt = salt;
    p.passHash = hashPassword(novaSenha, salt);
    p.emailVerified = true;
    updated = { ...p };
  });
  if (!updated) return null;

  await mutateRows<PatientPasswordReset>(PATIENT_PASSWORD_RESETS, (list) => {
    const r = list.find((x) => x.token === token);
    if (r) r.usedAt = nowIso();
  });
  await revokeAllPatientSessions(row.patientId);
  return updated;
}

// ---------------------------------------------------------------------------
// Google OAuth 2.0 — reexporta os helpers genéricos já existentes em
// auth.server.ts. Não são específicos de médico: geram URL de autorização,
// assinam/verificam o state anti-CSRF e trocam code por perfil do Google.
// Ficam aqui só para patient-auth.functions.ts importar de um único módulo,
// mesmo padrão de auth.functions.ts importar tudo de auth.server.ts.
// ---------------------------------------------------------------------------

export {
  exchangeGoogleCode,
  getGoogleConfig,
  googleAuthUrl,
  makeOAuthState,
  verifyOAuthState,
  type GoogleProfile,
} from "./auth.server";
