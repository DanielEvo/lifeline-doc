// Server-only auth: doctor accounts with salted SHA-256 password hashing and
// expiring token sessions, persisted via db.server. Google sign-in runs the
// REAL OAuth 2.0 authorization-code flow when GOOGLE_CLIENT_ID/SECRET are
// configured; without credentials it falls back to a demo persona so dev and
// review environments keep working (see auth.functions.ts).

import crypto from "node:crypto";

import { mutateRows, newId, nowIso, readRows } from "./db.server";

export type Doctor = {
  id: string;
  nome: string;
  email: string;
  passHash: string | null; // null for Google accounts
  salt: string | null;
  provider: "email" | "google";
  avatarUrl: string | null;
  createdAt: string;
};

type Session = { token: string; doctorId: string; createdAt: string; expiresAt: string };

const DOCTORS = "doctors.json";
const SESSIONS = "sessions.json";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 dias

function hashPassword(password: string, salt: string) {
  return crypto.createHash("sha256").update(`${salt}:${password}`).digest("hex");
}

export async function findDoctorByEmail(email: string): Promise<Doctor | undefined> {
  const rows = await readRows<Doctor>(DOCTORS);
  return rows.find((d) => d.email.toLowerCase() === email.toLowerCase());
}

export async function createDoctor(input: {
  nome: string;
  email: string;
  password?: string;
  provider: "email" | "google";
  avatarUrl?: string | null;
}): Promise<Doctor> {
  const salt = input.password ? crypto.randomBytes(12).toString("hex") : null;
  const doctor: Doctor = {
    id: newId(),
    nome: input.nome,
    email: input.email,
    passHash: input.password && salt ? hashPassword(input.password, salt) : null,
    salt,
    provider: input.provider,
    avatarUrl: input.avatarUrl ?? null,
    createdAt: nowIso(),
  };
  await mutateRows<Doctor>(DOCTORS, (rows) => {
    rows.push(doctor);
  });
  return doctor;
}

export function verifyPassword(doctor: Doctor, password: string): boolean {
  if (!doctor.passHash || !doctor.salt) return false;
  const expected = Buffer.from(doctor.passHash, "hex");
  const actual = Buffer.from(hashPassword(password, doctor.salt), "hex");
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

export async function createSession(doctorId: string): Promise<string> {
  const token = crypto.randomBytes(24).toString("hex");
  const now = Date.now();
  await mutateRows<Session>(SESSIONS, (rows) => {
    // prune expired sessions while we're here
    const alive = rows.filter((s) => Date.parse(s.expiresAt) > now);
    alive.push({
      token,
      doctorId,
      createdAt: nowIso(),
      expiresAt: new Date(now + SESSION_TTL_MS).toISOString(),
    });
    return alive;
  });
  return token;
}

export async function findDoctorByToken(token: string): Promise<Doctor | undefined> {
  const sessions = await readRows<Session>(SESSIONS);
  const s = sessions.find((x) => x.token === token);
  if (!s || Date.parse(s.expiresAt) <= Date.now()) return undefined;
  const doctors = await readRows<Doctor>(DOCTORS);
  return doctors.find((d) => d.id === s.doctorId);
}

/** Resolve o médico da sessão ou null — toda server fn autenticada passa aqui. */
export async function requireDoctor(token: string | undefined | null): Promise<Doctor | null> {
  if (!token) return null;
  return (await findDoctorByToken(token)) ?? null;
}

export async function revokeSession(token: string): Promise<void> {
  await mutateRows<Session>(SESSIONS, (rows) => rows.filter((x) => x.token !== token));
}

// ---------------------------------------------------------------------------
// Google OAuth 2.0 (authorization code). Configuração via variáveis de
// ambiente — veja .env.example. O redirect URI registrado no Google Cloud
// deve ser `${origem}/auth/callback`.
// ---------------------------------------------------------------------------

export function getGoogleConfig(): { clientId: string; clientSecret: string } | null {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

// O state anti-CSRF é HMAC-assinado com o client secret (só existe no fluxo
// real) e expira em 10 minutos.
function stateSecret(): string {
  return process.env.GOOGLE_CLIENT_SECRET ?? "";
}

export function makeOAuthState(): string {
  const payload = `${Date.now().toString(36)}.${crypto.randomBytes(8).toString("hex")}`;
  const mac = crypto.createHmac("sha256", stateSecret()).update(payload).digest("hex").slice(0, 24);
  return `${payload}.${mac}`;
}

export function verifyOAuthState(state: string): boolean {
  const parts = state.split(".");
  if (parts.length !== 3) return false;
  const [ts, rand, mac] = parts;
  const expected = crypto
    .createHmac("sha256", stateSecret())
    .update(`${ts}.${rand}`)
    .digest("hex")
    .slice(0, 24);
  if (mac.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expected)))
    return false;
  const age = Date.now() - parseInt(ts, 36);
  return age >= 0 && age < 10 * 60 * 1000;
}

export function googleAuthUrl(redirectUri: string): string | null {
  const cfg = getGoogleConfig();
  if (!cfg) return null;
  const params = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state: makeOAuthState(),
    prompt: "select_account",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

export type GoogleProfile = { email: string; nome: string; avatarUrl: string | null };

/** Troca o authorization code por tokens e extrai o perfil do id_token.
 *  O id_token chega direto do Google por TLS servidor-a-servidor, então o
 *  payload é confiável sem verificação de assinatura local. */
export async function exchangeGoogleCode(
  code: string,
  redirectUri: string,
): Promise<GoogleProfile | { error: string }> {
  const cfg = getGoogleConfig();
  if (!cfg) return { error: "Google OAuth não configurado no servidor." };
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error("google token exchange failed:", res.status, body.slice(0, 300));
    return { error: "O Google recusou o código de autorização. Tente entrar novamente." };
  }
  const tokens = (await res.json()) as { id_token?: string };
  if (!tokens.id_token) return { error: "Resposta do Google sem id_token." };
  try {
    const payload = JSON.parse(
      Buffer.from(tokens.id_token.split(".")[1], "base64url").toString("utf-8"),
    ) as { email?: string; email_verified?: boolean; name?: string; picture?: string };
    if (!payload.email || payload.email_verified === false)
      return { error: "Conta Google sem e-mail verificado." };
    return {
      email: payload.email,
      nome: payload.name || payload.email.split("@")[0],
      avatarUrl: payload.picture ?? null,
    };
  } catch {
    return { error: "id_token do Google ilegível." };
  }
}
