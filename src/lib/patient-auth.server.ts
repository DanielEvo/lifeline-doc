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
};

type PatientSession = { token: string; patientId: string; createdAt: string; expiresAt: string };

const PATIENT_ACCOUNTS = "patient_accounts.json";
const PATIENT_SESSIONS = "patient_sessions.json";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 dias

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

export async function revokePatientSession(token: string): Promise<void> {
  await mutateRows<PatientSession>(PATIENT_SESSIONS, (rows) =>
    rows.filter((x) => x.token !== token),
  );
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

// ---------------------------------------------------------------------------
// Password reset (paciente) — namespace 100% separado do médico. Tabela
// patient_password_resets.json, TTL 30 min, uso único, revoga todas as
// sessões ativas do paciente ao trocar a senha.
// ---------------------------------------------------------------------------

type PatientPasswordReset = {
  token: string;
  patientId: string;
  createdAt: string;
  expiresAt: string;
  usedAt: string | null;
};

const PATIENT_PASSWORD_RESETS = "patient_password_resets.json";
const RESET_TTL_MS = 30 * 60 * 1000;

export async function createPatientPasswordReset(email: string): Promise<string | null> {
  const patient = await findPatientByEmail(email);
  if (!patient) return null;
  if (patient.provider === "google" && !patient.passHash) return null;
  const token = crypto.randomBytes(32).toString("hex");
  const now = Date.now();
  await mutateRows<PatientPasswordReset>(PATIENT_PASSWORD_RESETS, (rows) => {
    const alive = rows.filter(
      (r) => r.usedAt === null && Date.parse(r.expiresAt) > now && r.patientId !== patient.id,
    );
    alive.push({
      token,
      patientId: patient.id,
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
  newPassword: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const rows = await readRows<PatientPasswordReset>(PATIENT_PASSWORD_RESETS);
  const reset = rows.find((r) => r.token === token);
  if (!reset) return { ok: false, error: "Link inválido." };
  if (reset.usedAt) return { ok: false, error: "Este link já foi usado." };
  if (Date.parse(reset.expiresAt) <= Date.now())
    return { ok: false, error: "Link expirado. Peça um novo." };
  const salt = crypto.randomBytes(12).toString("hex");
  const passHash = hashPassword(newPassword, salt);
  await mutateRows<PatientAccount>(PATIENT_ACCOUNTS, (rows) => {
    const p = rows.find((x) => x.id === reset.patientId);
    if (p) {
      p.salt = salt;
      p.passHash = passHash;
    }
  });
  await mutateRows<PatientPasswordReset>(PATIENT_PASSWORD_RESETS, (rows) => {
    const r = rows.find((x) => x.token === token);
    if (r) r.usedAt = nowIso();
  });
  await mutateRows<PatientSession>(PATIENT_SESSIONS, (rows) =>
    rows.filter((s) => s.patientId !== reset.patientId),
  );
  return { ok: true };
}
