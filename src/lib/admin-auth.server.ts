// Server-only auth para o painel de testes (/admin) — namespace totalmente
// separado da sessão de médico/paciente: credencial própria em
// admin_credentials.json, sessões próprias com TTL curto (2h, de propósito
// mais curto que a sessão de 30 dias do médico) e rate limit em memória
// contra força bruta. Mesmo padrão de hash salgado de auth.server.ts
// (hashPassword + crypto.timingSafeEqual).

import crypto from "node:crypto";

import { deleteCookie, getCookie, setCookie } from "@tanstack/react-start/server";

import { mutateRows, nowIso, readRows } from "./db.server";

// Cookie httpOnly espelhando o token (que também vive no localStorage do
// cliente, usado pelas outras server fns). Serve só pra permitir um guard
// de verdade no servidor (beforeLoad da rota /admin), já que o token em
// localStorage não é visível durante o SSR/loader.
const ADMIN_COOKIE = "lifeline_admin_session";

type AdminCredentials = {
  login: string;
  passHash: string;
  salt: string;
  updatedAt: string;
  /** Impressão digital dos secrets que geraram este registro. Quando os
   *  secrets ADMIN_LOGIN/ADMIN_PASSWORD mudam, o registro é re-semeado. */
  seedFingerprint?: string;
};
type AdminSession = { token: string; login: string; createdAt: string; expiresAt: string };

const CREDENTIALS = "admin_credentials.json";
const SESSIONS = "admin_sessions.json";
const SESSION_TTL_MS = 2 * 60 * 60 * 1000; // 2 horas

const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;

// SEC — nunca semear credencial padrão conhecida. A credencial inicial vem
// exclusivamente das variáveis de ambiente ADMIN_LOGIN/ADMIN_PASSWORD. Sem
// elas, o registro é semeado com uma senha aleatória impossível de adivinhar
// (e nunca revelada), o que deixa o /admin efetivamente fechado até o
// operador configurar os secrets.
function seedLogin(): string {
  return (process.env.ADMIN_LOGIN ?? "").trim();
}
function seedPassword(): string {
  return process.env.ADMIN_PASSWORD ?? "";
}
function adminConfigured(): boolean {
  return seedLogin().length >= 3 && seedPassword().length >= 8;
}

function hashPassword(password: string, salt: string) {
  return crypto.createHash("sha256").update(`${salt}:${password}`).digest("hex");
}

function makeCredentials(login: string, password: string): AdminCredentials {
  const salt = crypto.randomBytes(12).toString("hex");
  return { login, passHash: hashPassword(password, salt), salt, updatedAt: nowIso() };
}

function verify(creds: AdminCredentials, password: string): boolean {
  const expected = Buffer.from(creds.passHash, "hex");
  const actual = Buffer.from(hashPassword(password, creds.salt), "hex");
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

/** Lê a credencial de admin. Semeia a partir de ADMIN_LOGIN/ADMIN_PASSWORD;
 *  se não estiverem configurados, semeia uma senha aleatória inutilizável
 *  (o painel fica fechado até os secrets serem definidos). */
async function getCredentials(): Promise<AdminCredentials> {
  const existing = await readRows<AdminCredentials>(CREDENTIALS);
  // Credencial padrão legada gravada antes desta correção é descartada e
  // substituída pela dos secrets (ou por uma aleatória inutilizável).
  if (existing[0] && !verify(existing[0], "lifelineadm")) return existing[0];
  if (existing[0]) await mutateRows<AdminCredentials>(CREDENTIALS, () => []);
  const login = adminConfigured() ? seedLogin() : crypto.randomBytes(16).toString("hex");
  const password = adminConfigured() ? seedPassword() : crypto.randomBytes(32).toString("hex");
  let seeded: AdminCredentials | undefined;
  await mutateRows<AdminCredentials>(CREDENTIALS, (rows) => {
    if (rows[0]) {
      seeded = rows[0];
      return rows;
    }
    seeded = makeCredentials(login, password);
    return [seeded];
  });
  return seeded!;
}

// ---------------------------------------------------------------------------
// Rate limit em memória, por login normalizado. Não sobrevive a restart do
// processo — é só proteção contra força bruta ao vivo, não um requisito de
// durabilidade.
// ---------------------------------------------------------------------------

const attempts = new Map<string, { count: number; lockedUntil: number | null }>();

function attemptKey(login: string) {
  return login.trim().toLowerCase();
}

function isLocked(login: string): boolean {
  const a = attempts.get(attemptKey(login));
  return !!a?.lockedUntil && a.lockedUntil > Date.now();
}

function registerFailure(login: string) {
  const key = attemptKey(login);
  const a = attempts.get(key) ?? { count: 0, lockedUntil: null };
  a.count += 1;
  if (a.count >= MAX_ATTEMPTS) {
    a.lockedUntil = Date.now() + LOCKOUT_MS;
    a.count = 0;
  }
  attempts.set(key, a);
}

function registerSuccess(login: string) {
  attempts.delete(attemptKey(login));
}

// ---------------------------------------------------------------------------

function setAdminCookie(token: string) {
  setCookie(ADMIN_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });
}

function clearAdminCookie() {
  deleteCookie(ADMIN_COOKIE, { path: "/" });
}

/** Lê o cookie httpOnly e valida a sessão — usado pelo beforeLoad de /admin
 *  pra barrar a rota no servidor, antes de qualquer componente montar. */
export async function requireAdminCookie(): Promise<boolean> {
  return requireAdminSession(getCookie(ADMIN_COOKIE));
}

export async function loginAdmin(
  login: string,
  senha: string,
): Promise<{ ok: true; token: string } | { ok: false; error: "locked" | "invalid" }> {
  if (isLocked(login)) return { ok: false, error: "locked" };
  const creds = await getCredentials();
  // Bloqueia qualquer credencial padrão legada gravada antes desta correção.
  if (verify(creds, "lifelineadm")) return { ok: false, error: "invalid" };
  if (attemptKey(login) !== attemptKey(creds.login) || !verify(creds, senha)) {
    registerFailure(login);
    return { ok: false, error: "invalid" };
  }
  registerSuccess(login);
  const token = crypto.randomBytes(24).toString("hex");
  const now = Date.now();
  await mutateRows<AdminSession>(SESSIONS, (rows) => {
    const alive = rows.filter((s) => Date.parse(s.expiresAt) > now);
    alive.push({
      token,
      login: creds.login,
      createdAt: nowIso(),
      expiresAt: new Date(now + SESSION_TTL_MS).toISOString(),
    });
    return alive;
  });
  setAdminCookie(token);
  return { ok: true, token };
}

export async function requireAdminSession(token: string | undefined | null): Promise<boolean> {
  if (!token) return false;
  const sessions = await readRows<AdminSession>(SESSIONS);
  const s = sessions.find((x) => x.token === token);
  return !!s && Date.parse(s.expiresAt) > Date.now();
}

export async function logoutAdmin(token: string): Promise<void> {
  await mutateRows<AdminSession>(SESSIONS, (rows) => rows.filter((x) => x.token !== token));
  clearAdminCookie();
}

export async function changeAdminCredentials(
  token: string,
  novoLogin: string,
  novaSenha: string,
  senhaAtual: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await requireAdminSession(token))) return { ok: false, error: "Sessão expirada." };
  const creds = await getCredentials();
  if (!verify(creds, senhaAtual)) return { ok: false, error: "Senha atual incorreta." };
  const next = makeCredentials(novoLogin.trim(), novaSenha);
  await mutateRows<AdminCredentials>(CREDENTIALS, () => [next]);
  // Trocar credenciais invalida TODAS as sessões — inclusive a atual, que
  // precisa logar de novo com a credencial nova.
  await mutateRows<AdminSession>(SESSIONS, () => []);
  return { ok: true };
}
