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

export function isMemedConfigured(): boolean {
  return !!(process.env.MEMED_API_KEY && process.env.MEMED_SECRET_KEY);
}

export type MemedTokenResult =
  | { ok: true; token: string }
  | { ok: false; error: "not_configured" | "missing_profile" | "memed_error"; detail?: string };

export async function getMemedPrescriberToken(doctor: Doctor): Promise<MemedTokenResult> {
  if (!isMemedConfigured()) return { ok: false, error: "not_configured" };
  if (!doctor.crm || !doctor.crmUf || !doctor.cpfMedico || !doctor.especialidade || !doctor.crmCidade) {
    return { ok: false, error: "missing_profile" };
  }

  const apiKey = process.env.MEMED_API_KEY!;
  const secretKey = process.env.MEMED_SECRET_KEY!;
  const qs = `api-key=${encodeURIComponent(apiKey)}&secret-key=${encodeURIComponent(secretKey)}`;
  const [nome, ...resto] = doctor.nome.trim().split(/\s+/);
  const sobrenome = resto.join(" ") || nome;

  try {
    const res = await fetch(`${MEMED_API_BASE}/sinapse-prescricao/usuarios?${qs}`, {
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
      return { ok: false, error: "memed_error", detail: JSON.stringify(json)?.slice(0, 300) };
    }
    return { ok: true, token: jwtToken };
  } catch (e) {
    return { ok: false, error: "memed_error", detail: String(e) };
  }
}
