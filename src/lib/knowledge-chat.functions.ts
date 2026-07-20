import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const MessageSchema = z.object({
  role: z.enum(["user", "assistant", "system"]),
  content: z.string(),
});

const InputSchema = z.object({
  messages: z.array(MessageSchema).min(1).max(50),
});

const SYSTEM_PROMPT = `Você é o assistente de conhecimento clínico do LifeLine, um mini-GPT que apoia médicos durante a consulta.
- Responda sempre em português do Brasil, com linguagem clínica objetiva.
- Baseie-se em medicina baseada em evidências. Cite diretriz/estudo quando relevante.
- Estruture respostas em tópicos curtos quando útil (diagnóstico, conduta, follow-up).
- Se faltar contexto do paciente, peça o dado específico que precisa.
- Nunca invente doses; se não tiver certeza, diga.`;

export const askKnowledgeAssistant = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data }) => {
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
        messages: [{ role: "system", content: SYSTEM_PROMPT }, ...data.messages],
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
    return { reply };
  });
