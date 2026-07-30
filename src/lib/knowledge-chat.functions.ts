import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireDoctor } from "./auth.server";
import { listAlwaysAppliedCriterios } from "./criterios.server";

const MessageSchema = z.object({
  role: z.enum(["user", "assistant", "system"]),
  content: z.string(),
});
export type ChatMessage = z.infer<typeof MessageSchema>;

const InputSchema = z.object({
  token: z.string().min(1).max(80),
  messages: z.array(MessageSchema).min(1).max(50),
});

const SYSTEM_PROMPT = `Você é o assistente de conhecimento clínico do LifeLine, um mini-GPT que apoia médicos durante a consulta.
- Responda sempre em português do Brasil, com linguagem clínica objetiva.
- Baseie-se em medicina baseada em evidências. Cite diretriz/estudo quando relevante.
- Estruture respostas em tópicos curtos quando útil (diagnóstico, conduta, follow-up).
- Se faltar contexto do paciente, peça o dado específico que precisa.
- Nunca invente doses; se não tiver certeza, diga.`;

/** Helper puro (não é server fn) — chama o Lovable AI Gateway e devolve o
 *  texto da resposta. Reaproveitado por askKnowledgeAssistant (chat) e por
 *  transcribeConsult (resumo estruturado do ditado) para não duplicar a
 *  chamada HTTP nem o tratamento de erro de créditos/rate-limit. */
export async function callLovableChat(
  messages: ChatMessage[],
  opts: { system?: string } = {},
): Promise<string> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) {
    throw new Error("LOVABLE_API_KEY não configurada.");
  }

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": apiKey,
    },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages: [{ role: "system", content: opts.system ?? SYSTEM_PROMPT }, ...messages],
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    if (res.status === 429) {
      throw new Error("Limite de requisições atingido. Tente novamente em instantes.");
    }
    if (res.status === 402) {
      throw new Error("Créditos de IA esgotados. Adicione créditos no workspace.");
    }
    throw new Error(`Falha no assistente (${res.status}): ${text.slice(0, 200)}`);
  }

  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const reply = json.choices?.[0]?.message?.content?.trim();
  if (!reply) throw new Error("Resposta vazia do assistente.");
  return reply;
}

/** Monta o bloco de "Verdade" (Seção 1.1/5.1 do documento de concepção):
 *  Regra e Estilo são sempre injetados no system prompt, nunca em RAG sob
 *  demanda — é o que garante que a IA não contradiga o que o médico já
 *  definiu de uma pergunta para a outra. Métrica fica de fora aqui porque não
 *  é uma instrução, é um valor usado só em perguntas agregadas (fora de
 *  escopo nesta rodada). */
async function buildCriteriosContext(doctorId: string): Promise<string> {
  let criterios: Awaited<ReturnType<typeof listAlwaysAppliedCriterios>>;
  try {
    criterios = await listAlwaysAppliedCriterios(doctorId);
  } catch (err) {
    // A busca de critérios nunca deve derrubar o chat — sem ela, o assistente
    // só perde o contexto extra e volta a se comportar como antes.
    console.error("[knowledge-chat] falha ao buscar critérios:", err);
    return "";
  }
  if (criterios.length === 0) return "";
  const regras = criterios.filter((c) => c.kind === "regra");
  const estilo = criterios.filter((c) => c.kind === "estilo");
  const lines: string[] = [];
  if (regras.length > 0) {
    lines.push(
      "Regras que o médico definiu (NUNCA contrarie — se o caso exigir, sinalize o conflito em vez de ignorar a regra):",
    );
    lines.push(...regras.map((c) => `- ${c.rawText}`));
  }
  if (estilo.length > 0) {
    lines.push(
      "Estilo e forma de trabalho do médico (aplique como preferência de tom/abordagem; pode flexibilizar quando o contexto clínico exigir, mas sinalize quando se afastar):",
    );
    lines.push(...estilo.map((c) => `- ${c.rawText}`));
  }
  return `\n\n---\n${lines.join("\n")}`;
}

export const askKnowledgeAssistant = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data }) => {
    const doctor = await requireDoctor(data.token);
    if (!doctor) return { ok: false as const, error: "unauthorized" as const };
    const context = await buildCriteriosContext(doctor.id);
    const reply = await callLovableChat(data.messages, {
      system: context ? `${SYSTEM_PROMPT}${context}` : undefined,
    });
    return { ok: true as const, reply };
  });
