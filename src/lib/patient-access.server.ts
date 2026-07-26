// Dois canais de acesso do médico ao perfil do paciente (BKL-37): presencial
// (paciente lê um código de 6 dígitos na consulta) e solicitação remota
// (paciente aprova pelo app, sem código). Mesmo padrão mutateRows/readRows/
// newId/nowIso de "./db.server".

import { mutateRows, newId, nowIso, readRows } from "./db.server";

export type AccessPurpose = "perfil" | "historico";
// "historico" é gancho estrutural para a Feature 7 do roadmap (ID Único
// entre Especialistas, V3+ per Build KB) — NÃO implementar leitura
// cross-médico de prontuário agora. Só o campo existe, sem consumidor.

export type AccessToken = {
  id: string;
  globalId: string;
  purpose: AccessPurpose;
  code: string | null;
  channel: "presencial" | "solicitacao";
  expiresAt: string;
  consumedByDoctorId: string | null;
  consumedAt: string | null;
  createdAt: string;
};

export type AccessRequest = {
  id: string;
  globalId: string;
  doctorId: string;
  doctorNome: string;
  purpose: AccessPurpose;
  status: "pendente" | "aprovado" | "negado";
  createdAt: string;
  respondedAt: string | null;
};

const TOKENS = "patient_access_tokens.json";
const REQUESTS = "patient_access_requests.json";

const PRESENTIAL_TTL_MS = 10 * 60 * 1000;
const REQUEST_GRANT_TTL_MS = 24 * 60 * 60 * 1000;

function generateSixDigitCode(): string {
  let code = "";
  for (let i = 0; i < 6; i++) code += Math.floor(Math.random() * 10);
  return code;
}

export async function createPresentialToken(
  globalId: string,
  purpose: AccessPurpose,
): Promise<AccessToken> {
  const token: AccessToken = {
    id: newId(),
    globalId,
    purpose,
    code: generateSixDigitCode(),
    channel: "presencial",
    expiresAt: new Date(Date.now() + PRESENTIAL_TTL_MS).toISOString(),
    consumedByDoctorId: null,
    consumedAt: null,
    createdAt: nowIso(),
  };
  await mutateRows<AccessToken>(TOKENS, (rows) => {
    rows.push(token);
  });
  return token;
}

export async function findValidPresentialToken(
  globalId: string,
  purpose: AccessPurpose,
  code: string,
): Promise<AccessToken | undefined> {
  const rows = await readRows<AccessToken>(TOKENS);
  const now = Date.now();
  return rows.find(
    (t) =>
      t.globalId === globalId &&
      t.purpose === purpose &&
      t.channel === "presencial" &&
      t.code === code &&
      t.consumedByDoctorId === null &&
      Date.parse(t.expiresAt) > now,
  );
}

export async function consumeToken(tokenId: string, doctorId: string): Promise<void> {
  await mutateRows<AccessToken>(TOKENS, (rows) => {
    const t = rows.find((r) => r.id === tokenId);
    if (!t) return;
    t.consumedByDoctorId = doctorId;
    t.consumedAt = nowIso();
  });
}

export async function createAccessRequest(
  globalId: string,
  doctorId: string,
  doctorNome: string,
  purpose: AccessPurpose,
): Promise<AccessRequest> {
  const rows = await readRows<AccessRequest>(REQUESTS);
  const existing = rows.find(
    (r) =>
      r.globalId === globalId &&
      r.doctorId === doctorId &&
      r.purpose === purpose &&
      r.status === "pendente",
  );
  if (existing) return existing;

  const request: AccessRequest = {
    id: newId(),
    globalId,
    doctorId,
    doctorNome,
    purpose,
    status: "pendente",
    createdAt: nowIso(),
    respondedAt: null,
  };
  await mutateRows<AccessRequest>(REQUESTS, (r) => {
    r.push(request);
  });
  return request;
}

export async function listPendingRequests(globalId: string): Promise<AccessRequest[]> {
  const rows = await readRows<AccessRequest>(REQUESTS);
  return rows.filter((r) => r.globalId === globalId && r.status === "pendente");
}

export async function respondAccessRequest(
  requestId: string,
  globalId: string,
  approve: boolean,
): Promise<AccessRequest | null> {
  let updated: AccessRequest | null = null;
  await mutateRows<AccessRequest>(REQUESTS, (rows) => {
    const r = rows.find((x) => x.id === requestId && x.globalId === globalId);
    if (!r) return;
    r.status = approve ? "aprovado" : "negado";
    r.respondedAt = nowIso();
    updated = { ...r };
  });
  if (!updated) return null;
  const request: AccessRequest = updated;
  if (approve) {
    // A aprovação em si é o consumo — o médico nunca digita código neste fluxo.
    await mutateRows<AccessToken>(TOKENS, (rows) => {
      rows.push({
        id: newId(),
        globalId,
        purpose: request.purpose,
        code: null,
        channel: "solicitacao",
        expiresAt: new Date(Date.now() + REQUEST_GRANT_TTL_MS).toISOString(),
        consumedByDoctorId: request.doctorId,
        consumedAt: nowIso(),
        createdAt: nowIso(),
      });
    });
  }
  return request;
}

export async function hasActiveGrant(
  globalId: string,
  doctorId: string,
  purpose: AccessPurpose,
): Promise<boolean> {
  const rows = await readRows<AccessToken>(TOKENS);
  const now = Date.now();
  return rows.some(
    (t) =>
      t.globalId === globalId &&
      t.purpose === purpose &&
      t.consumedByDoctorId === doctorId &&
      Date.parse(t.expiresAt) > now,
  );
}
