// Server-only: templates de Evolução do médico (PRO-02/PRO-03) — texto
// pronto com cabeçalhos de seção (mesmo formato de ANAMNESE_TEMPLATE),
// aplicável via pill na Evolução Atual. O rascunho gerado por IA nunca
// preenche dado clínico — só monta a estrutura de cabeçalhos a partir da
// descrição em linguagem natural do médico.

import { mutateRows, newId, nowIso, readRows } from "./db.server";
import { generateGeminiText, GEMINI_MODEL } from "./gemini-client.server";

const FILE = "templates.json";

export type EvolutionTemplate = {
  id: string;
  doctorId: string;
  nome: string;
  conteudo: string;
  createdAt: string;
  updatedAt: string;
};

export async function listTemplates(doctorId: string): Promise<EvolutionTemplate[]> {
  const rows = await readRows<EvolutionTemplate>(FILE);
  return rows
    .filter((t) => t.doctorId === doctorId)
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

export async function createTemplate(
  doctorId: string,
  nome: string,
  conteudo: string,
): Promise<EvolutionTemplate> {
  const now = nowIso();
  const template: EvolutionTemplate = {
    id: newId(),
    doctorId,
    nome: nome.trim(),
    conteudo,
    createdAt: now,
    updatedAt: now,
  };
  await mutateRows<EvolutionTemplate>(FILE, (rows) => {
    rows.push(template);
  });
  return template;
}

export async function updateTemplate(
  doctorId: string,
  id: string,
  patch: { nome?: string; conteudo?: string },
): Promise<EvolutionTemplate | undefined> {
  let updated: EvolutionTemplate | undefined;
  await mutateRows<EvolutionTemplate>(FILE, (rows) => {
    const t = rows.find((r) => r.id === id && r.doctorId === doctorId);
    if (!t) return;
    if (patch.nome !== undefined) t.nome = patch.nome.trim();
    if (patch.conteudo !== undefined) t.conteudo = patch.conteudo;
    t.updatedAt = nowIso();
    updated = { ...t };
  });
  return updated;
}

export async function deleteTemplate(doctorId: string, id: string): Promise<boolean> {
  let ok = false;
  await mutateRows<EvolutionTemplate>(FILE, (rows) => {
    const idx = rows.findIndex((r) => r.id === id && r.doctorId === doctorId);
    if (idx === -1) return;
    rows.splice(idx, 1);
    ok = true;
  });
  return ok;
}

// ---------------------------------------------------------------------------
// Rascunho de estrutura via IA (PRO-03) — mesmo cliente Gemini direto
// (gemini-client.server.ts) usado por transcribe.functions.ts e
// knowledge-chat.functions.ts. Só monta cabeçalhos; nunca preenche conteúdo
// clínico.

const TEMPLATE_DRAFT_SYSTEM = `Você ajuda um médico a montar a ESTRUTURA de um template de evolução clínica em português do Brasil.
Devolva SOMENTE o texto do template — sem markdown, sem explicações fora do template.
Formato obrigatório: um cabeçalho de seção por linha, em MAIÚSCULAS terminando em ":", seguido de uma linha em branco. Exemplo de formato (não copie o conteúdo, só o padrão):
QUEIXA:

AVALIAÇÃO:

CONDUTA:

Regras:
- NUNCA preencha as seções com dado clínico, texto de exemplo ou placeholder — cada seção fica vazia, só o cabeçalho e a linha em branco depois.
- Baseie os cabeçalhos na descrição em linguagem natural do médico (ex.: "retorno de hipertensão" → seções relevantes para esse tipo de consulta).
- Use entre 2 e 8 seções.`;

export async function generateTemplateDraft(descricao: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY não configurada.");
  const reply = await generateGeminiText({
    apiKey,
    model: GEMINI_MODEL,
    system: TEMPLATE_DRAFT_SYSTEM,
    messages: [{ role: "user", content: descricao }],
  });
  return reply.trim();
}
