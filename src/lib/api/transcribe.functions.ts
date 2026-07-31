import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { callLovableChat } from "../knowledge-chat.functions";

// Ditado da consulta: áudio real (MediaRecorder no navegador) → transcrição
// via Lovable AI Gateway (proxy no formato da OpenAI, modelo
// openai/gpt-4o-mini-transcribe) → resumo estruturado reaproveitando o
// MESMO gateway de chat já validado pelo assistente de conhecimento.
// Endpoint de transcrição inferido do padrão /v1/chat/completions já
// confirmado em produção (mesmo host, mesmo header, contrato OpenAI-shape)
// — validar contra uma chave real antes de ir a produção (ver PRD).
//
// A estrutura do resumo depende do template ativo no front (PRO-02/PRO-03):
// com seções (Padrão/Anamnese/custom), o resumo sai já dividido por
// cabeçalho — sem seções ("Texto livre"), sai um único resumo corrido.

/** Monta o system prompt pedindo um JSON com uma chave por seção — índice
 *  numérico ("s0", "s1", …) como chave interna pra não depender de
 *  acento/case do label; o label original é reanexado depois em `blocks`. */
function buildSectionsSystem(sections: string[], templateContent: string): string {
  const keys = sections.map((_, i) => `s${i}`);
  const mapping = sections.map((label, i) => `${keys[i]} = "${label}"`).join("; ");
  const templateBlock = templateContent.trim()
    ? `\n\nO médico escolheu este template — use-o como instrução de estrutura e de estilo, respeitando qualquer orientação escrita nele:\n"""\n${templateContent.trim()}\n"""`
    : "";
  return `Você resume transcrições de consultas médicas em português do Brasil, organizando o conteúdo nas seções de um template escolhido pelo médico.
Devolva SOMENTE um JSON válido (sem markdown, sem texto fora do JSON) com exatamente estas chaves, nesta ordem: ${keys.join(", ")}.
Cada chave corresponde a uma seção do template: ${mapping}.
Para cada seção, extraia da transcrição só o que foi efetivamente dito e é relevante para aquele cabeçalho.
Se uma seção não tiver informação correspondente na transcrição, devolva string vazia "" — nunca invente conteúdo.${templateBlock}`;
}

function extractSectionsJson(
  text: string,
  sections: string[],
): { label: string; text: string }[] {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("Resumo da IA não veio em formato reconhecível.");
  const parsed = JSON.parse(match[0]) as Record<string, unknown>;
  return sections.map((label, i) => {
    const v = parsed[`s${i}`];
    return { label, text: typeof v === "string" ? v : "" };
  });
}

// Modo "Texto livre" (sem template com seções) — resumo corrido em prosa,
// sem se prender a nenhuma estrutura fixa (não há seção nenhuma pra separar por).
const FREE_TEXT_SYSTEM = `Você resume transcrições de consultas médicas em português do Brasil para uso em texto livre de evolução clínica.
Produza um resumo corrido, em prosa clínica objetiva, cobrindo o que foi dito de relevante (queixa, avaliação, conduta) sem se prender a uma estrutura fixa de seções.
Devolva SOMENTE o texto do resumo — sem markdown, sem JSON, sem título.
Se a transcrição não tiver conteúdo clínico relevante, devolva string vazia.`;

export const transcribeConsult = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      audioBase64: z.string().min(1).max(30_000_000), // ~22MB decodificado, cobre consultas curtas
      mimeType: z.string().max(60).default("audio/webm"),
      durationSec: z.number().min(0).max(7200).default(0),
      // Cabeçalhos de seção do template ativo no front (parseTemplateSections)
      // — vazio quando o médico está em modo "Texto livre".
      templateSections: z.array(z.string().max(40)).max(8).optional().default([]),
    }),
  )
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) {
      throw new Error(
        "LOVABLE_API_KEY não configurada neste ambiente — ditado por IA indisponível. Configure a chave para ativar.",
      );
    }

    const audioBuffer = Buffer.from(data.audioBase64, "base64");
    if (audioBuffer.length === 0) throw new Error("Áudio vazio.");

    const ext = data.mimeType.includes("mp4") ? "mp4" : data.mimeType.includes("wav") ? "wav" : "webm";
    const form = new FormData();
    form.append("file", new Blob([audioBuffer], { type: data.mimeType }), `consulta.${ext}`);
    form.append("model", "openai/gpt-4o-mini-transcribe");

    const transcribeRes = await fetch("https://ai.gateway.lovable.dev/v1/audio/transcriptions", {
      method: "POST",
      headers: { "Lovable-API-Key": apiKey },
      body: form,
    });

    if (!transcribeRes.ok) {
      const text = await transcribeRes.text().catch(() => "");
      if (transcribeRes.status === 429) throw new Error("Limite de requisições atingido. Tente novamente em instantes.");
      if (transcribeRes.status === 402) throw new Error("Créditos de IA esgotados. Adicione créditos no workspace.");
      throw new Error(`Falha na transcrição (${transcribeRes.status}): ${text.slice(0, 200)}`);
    }

    const transcribeJson = (await transcribeRes.json()) as { text?: string };
    const transcript = transcribeJson.text?.trim();
    if (!transcript) throw new Error("Transcrição vazia — tente falar mais alto ou perto do microfone.");

    const sections = data.templateSections;
    let blocks: { label: string; text: string }[];
    if (sections.length === 0) {
      const summary = await callLovableChat(
        [{ role: "user", content: transcript }],
        { system: FREE_TEXT_SYSTEM },
      );
      blocks = [{ label: "Transcrição", text: summary.trim() }];
    } else {
      const summaryReply = await callLovableChat(
        [{ role: "user", content: transcript }],
        { system: buildSectionsSystem(sections) },
      );
      blocks = extractSectionsJson(summaryReply, sections);
    }

    return {
      durationSec: data.durationSec,
      transcript,
      blocks,
    };
  });
