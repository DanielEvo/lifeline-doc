// Server-only: adaptador real para a API REST da Memed (Sinapse Prescrição).
// Referência: HANDOVER_Memed_Referencia_Tecnica.md (consolidado a partir de
// 24 páginas da doc oficial, Julho/2026). Nunca simula um token — sem
// credenciais ou perfil incompleto, cai em erro explícito
// (not_configured/missing_profile), porque um token falso quebraria o
// embed real do widget.

import type { Doctor } from "./auth.server";

const MEMED_API_BASE =
  process.env.MEMED_API_URL || "https://integrations.api.memed.com.br/v1";

export const MEMED_SCRIPT_URL =
  process.env.MEMED_SCRIPT_URL ||
  "https://integrations.memed.com.br/modulos/plataforma.sinapse-prescricao/build/sinapse-prescricao.min.js";

/** Timeout de rede: a homologação da Memed às vezes pendura a conexão. */
const MEMED_TIMEOUT_MS = 8_000;
/** JWT do prescritor vale bem mais que isso; 50min dá folga de renovação. */
const TOKEN_TTL_MS = 50 * 60 * 1000;

/**
 * Ambiente em uso. As chaves de homologação são compartilhadas entre
 * parceiros e o ambiente cai fora do horário comercial — a UI usa isso para
 * avisar o médico antes de ele tentar prescrever.
 */
export function memedEnvironment(): "sandbox" | "live" {
  return (process.env.MEMED_ENV || "sandbox") === "live" ? "live" : "sandbox";
}

/**
 * Chaves por ambiente (mesmo padrão do Stripe): MEMED_LIVE_* / MEMED_SANDBOX_*
 * quando existirem, com fallback para o par legado MEMED_API_KEY/SECRET_KEY.
 * Evita emitir receita de teste com chave de produção e vice-versa.
 */
function memedKeys(): { apiKey?: string; secretKey?: string } {
  const live = memedEnvironment() === "live";
  const apiKey =
    (live ? process.env.MEMED_LIVE_API_KEY : process.env.MEMED_SANDBOX_API_KEY) ||
    process.env.MEMED_API_KEY;
  const secretKey =
    (live ? process.env.MEMED_LIVE_SECRET_KEY : process.env.MEMED_SANDBOX_SECRET_KEY) ||
    process.env.MEMED_SECRET_KEY;
  return { apiKey, secretKey };
}

export function isMemedConfigured(): boolean {
  const { apiKey, secretKey } = memedKeys();
  return !!(apiKey && secretKey);
}

/**
 * Homologação da Memed fica indisponível 0h–6h em dias úteis e nos fins de
 * semana (horário de Brasília). Só informativo — nunca bloqueia a tentativa.
 */
export function isMemedLikelyOffline(now = new Date()): boolean {
  if (memedEnvironment() === "live") return false;
  const brt = new Date(now.getTime() - 3 * 60 * 60 * 1000); // UTC-3
  const day = brt.getUTCDay();
  const hour = brt.getUTCHours();
  if (day === 0 || day === 6) return true;
  return hour < 6;
}

export type MemedTokenResult =
  | { ok: true; token: string }
  | {
      ok: false;
      error: "not_configured" | "missing_profile" | "prescritor_inativo" | "memed_error";
      detail?: string;
    };

// Cache de token por médico: antes cada abertura do dialog de receita batia
// em POST /usuarios, o que é lento e conta para o rate-limit da Memed.
const tokenCache = new Map<string, { token: string; expiresAt: number }>();

/** Usado quando o perfil do prescritor muda (saveMemedProfile). */
export function invalidateMemedToken(doctorId: string): void {
  tokenCache.delete(doctorId);
}

async function memedFetch(url: string, init: RequestInit, attempt = 0): Promise<Response> {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(MEMED_TIMEOUT_MS) });
  } catch (e) {
    // 1 retry só para falha de rede/timeout — erro HTTP não é retentado aqui.
    if (attempt === 0) return memedFetch(url, init, 1);
    throw e;
  }
}

// ---------------------------------------------------------------------------
// Resolução de cidade/especialidade → ID numérico da Memed.
//
// A API não aceita mais texto livre em `attributes.cidade`/`attributes.
// especialidade` — exige um bloco `relationships` com IDs numéricos da base
// da própria Memed (§3.1/§3.2 do handover). As rotas de busca não exigem
// autenticação. Cacheado em memória (a doc recomenda explicitamente não
// bater na API a cada cadastro) — perfil de médico muda raramente.
// ---------------------------------------------------------------------------

const cidadeIdCache = new Map<string, number | null>();
const especialidadeIdCache = new Map<string, number | null>();

function normalizeKey(s: string): string {
  return s.trim().toLowerCase();
}

async function resolveMemedCidadeId(cidade: string, uf: string): Promise<number | null> {
  const key = `${normalizeKey(cidade)}|${normalizeKey(uf)}`;
  if (cidadeIdCache.has(key)) return cidadeIdCache.get(key)!;
  try {
    const qs = `filter[q]=${encodeURIComponent(cidade)}&filter[uf]=${encodeURIComponent(uf)}`;
    const res = await memedFetch(`${MEMED_API_BASE}/cidades?${qs}`, {
      headers: { Accept: "application/vnd.api+json" },
    });
    const json: any = await res.json().catch(() => null);
    const first = Array.isArray(json?.data) ? json.data[0] : null;
    const id = first?.id != null ? Number(first.id) : null;
    cidadeIdCache.set(key, id);
    return id;
  } catch (e) {
    console.error("[memed] cidade_lookup_error", { cidade, uf, error: String(e) });
    return null;
  }
}

async function resolveMemedEspecialidadeId(especialidade: string): Promise<number | null> {
  const key = normalizeKey(especialidade);
  if (especialidadeIdCache.has(key)) return especialidadeIdCache.get(key)!;
  try {
    const qs = `filter[q]=${encodeURIComponent(especialidade)}`;
    const res = await memedFetch(`${MEMED_API_BASE}/especialidades?${qs}`, {
      headers: { Accept: "application/vnd.api+json" },
    });
    const json: any = await res.json().catch(() => null);
    const first = Array.isArray(json?.data) ? json.data[0] : null;
    const id = first?.id != null ? Number(first.id) : null;
    especialidadeIdCache.set(key, id);
    return id;
  } catch (e) {
    console.error("[memed] especialidade_lookup_error", { especialidade, error: String(e) });
    return null;
  }
}

/** yyyy-mm-dd (formato interno) → dd/mm/YYYY (formato exigido pela Memed). */
function toMemedDate(isoDate: string): string {
  const [y, m, d] = isoDate.split("-");
  return `${d}/${m}/${y}`;
}

export async function getMemedPrescriberToken(doctor: Doctor): Promise<MemedTokenResult> {
  if (!isMemedConfigured()) return { ok: false, error: "not_configured" };
  if (
    !doctor.crm ||
    !doctor.crmUf ||
    !doctor.cpfMedico ||
    !doctor.especialidade ||
    !doctor.crmCidade ||
    !doctor.dataNascimento
  ) {
    return { ok: false, error: "missing_profile" };
  }

  const cached = tokenCache.get(doctor.id);
  if (cached && cached.expiresAt > Date.now()) return { ok: true, token: cached.token };

  const { apiKey, secretKey } = memedKeys();
  const qs = `api-key=${encodeURIComponent(apiKey!)}&secret-key=${encodeURIComponent(secretKey!)}`;
  const [nome, ...resto] = doctor.nome.trim().split(/\s+/);
  const sobrenome = resto.join(" ") || nome;

  // cidade/especialidade viram relationships com ID numérico — sem match,
  // omite o relacionamento em vez de falhar (não estão na lista de campos
  // obrigatórios da Memed, só board/cpf/nome/sobrenome/data_nascimento estão).
  const [cidadeId, especialidadeId] = await Promise.all([
    resolveMemedCidadeId(doctor.crmCidade, doctor.crmUf),
    resolveMemedEspecialidadeId(doctor.especialidade),
  ]);

  try {
    const res = await memedFetch(`${MEMED_API_BASE}/sinapse-prescricao/usuarios?${qs}`, {
      method: "POST",
      headers: { Accept: "application/vnd.api+json", "Content-Type": "application/json" },
      body: JSON.stringify({
        data: {
          type: "usuarios",
          attributes: {
            external_id: doctor.id,
            nome,
            sobrenome,
            cpf: doctor.cpfMedico.replace(/\D/g, ""),
            board: { board_code: "CRM", board_number: doctor.crm, board_state: doctor.crmUf },
            data_nascimento: toMemedDate(doctor.dataNascimento),
            email: doctor.email,
            telefone: (doctor.telefoneMedico ?? "").replace(/\D/g, ""),
          },
          ...((cidadeId != null || especialidadeId != null) && {
            relationships: {
              ...(cidadeId != null && {
                cidade: { data: { type: "cidades", id: cidadeId } },
              }),
              ...(especialidadeId != null && {
                especialidade: { data: { type: "especialidades", id: especialidadeId } },
              }),
            },
          }),
        },
      }),
    });
    const json: any = await res.json().catch(() => null);
    const jwtToken = json?.data?.attributes?.token;
    const status = json?.data?.attributes?.status as string | undefined;
    if (status === "Inativo") {
      console.error("[memed] prescritor_inativo", { doctorId: doctor.id });
      return { ok: false, error: "prescritor_inativo" };
    }
    if (!res.ok || !jwtToken) {
      const detail = JSON.stringify(json)?.slice(0, 300);
      console.error("[memed] token_error", { status: res.status, doctorId: doctor.id, detail });
      return { ok: false, error: "memed_error", detail };
    }
    tokenCache.set(doctor.id, { token: jwtToken, expiresAt: Date.now() + TOKEN_TTL_MS });
    return { ok: true, token: jwtToken };
  } catch (e) {
    console.error("[memed] token_network_error", { doctorId: doctor.id, error: String(e) });
    return { ok: false, error: "memed_error", detail: String(e) };
  }
}

// Token para a rota de simulação (/app/memed-simulacao) — prescritor sintético
// fixo, nunca associado a um médico real, só para exercitar o embed oficial
// sem exigir CRM cadastrado. Nunca usado no fluxo de prescrição de verdade.
// external_id é FIXO de propósito: antes usava Date.now() e criava um
// prescritor novo na base da Memed a cada carregamento da bancada.
const SANDBOX_DOCTOR_ID = "lifeline-sandbox-prescritor";

export async function getMemedSandboxToken(): Promise<MemedTokenResult> {
  if (!isMemedConfigured()) return { ok: false, error: "not_configured" };
  const fakeDoctor = {
    id: SANDBOX_DOCTOR_ID,
    nome: "Teste Simulação",
    crm: "12345",
    crmUf: "SP",
    cpfMedico: "11144477735",
    especialidade: "Clínica Geral",
    crmCidade: "São Paulo",
    dataNascimento: "1990-01-01",
    email: "sandbox@lifeline.doc",
  } as Doctor;
  return getMemedPrescriberToken(fakeDoctor);
}
