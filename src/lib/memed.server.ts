// Server-only: adaptador real para a API REST da Memed (Sinapse Prescrição).
// Contrato confirmado em doc.memed.com.br (ambiente de homologação/testes,
// compartilhado por todos os parceiros até a validação técnica liberar as
// chaves de produção): POST /sinapse-prescricao/usuarios registra ou
// atualiza o prescritor e devolve um JWT em data.attributes.token, usado
// como data-token do script de embed do módulo de prescrição.
//
// Sem MEMED_API_KEY/MEMED_SECRET_KEY no ambiente, ou sem CRM/CPF cadastrados
// no médico, cai em "not_configured"/"missing_profile" — nunca simula um
// token, porque um token falso quebraria o embed real do widget.

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

export function isMemedConfigured(): boolean {
  return !!(process.env.MEMED_API_KEY && process.env.MEMED_SECRET_KEY);
}

/**
 * Ambiente em uso. As chaves de homologação são compartilhadas entre
 * parceiros e o ambiente cai fora do horário comercial — a UI usa isso para
 * avisar o médico antes de ele tentar prescrever.
 */
export function memedEnvironment(): "sandbox" | "live" {
  return (process.env.MEMED_ENV || "sandbox") === "live" ? "live" : "sandbox";
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
  | { ok: false; error: "not_configured" | "missing_profile" | "memed_error"; detail?: string };

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

export async function getMemedPrescriberToken(doctor: Doctor): Promise<MemedTokenResult> {
  if (!isMemedConfigured()) return { ok: false, error: "not_configured" };
  if (!doctor.crm || !doctor.crmUf || !doctor.cpfMedico || !doctor.especialidade || !doctor.crmCidade) {
    return { ok: false, error: "missing_profile" };
  }

  const cached = tokenCache.get(doctor.id);
  if (cached && cached.expiresAt > Date.now()) return { ok: true, token: cached.token };

  const apiKey = process.env.MEMED_API_KEY!;
  const secretKey = process.env.MEMED_SECRET_KEY!;
  const qs = `api-key=${encodeURIComponent(apiKey)}&secret-key=${encodeURIComponent(secretKey)}`;
  const [nome, ...resto] = doctor.nome.trim().split(/\s+/);
  const sobrenome = resto.join(" ") || nome;

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
            email: doctor.email,
            telefone: "",
            especialidade: doctor.especialidade,
            cidade: doctor.crmCidade,
          },
        },
      }),
    });
    const json: any = await res.json().catch(() => null);
    const jwtToken = json?.data?.attributes?.token;
    if (!res.ok || !jwtToken) {
      const detail = JSON.stringify(json)?.slice(0, 300);
      // Log estruturado server-side (nunca inclui api-key/secret-key).
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
    email: "sandbox@lifeline.doc",
  } as Doctor;
  return getMemedPrescriberToken(fakeDoctor);
}
