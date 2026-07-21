import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { callLovableChat } from "../knowledge-chat.functions";

// Ditado da consulta: áudio real (MediaRecorder no navegador) → transcrição
// via Lovable AI Gateway (proxy no formato da OpenAI, modelo
// openai/gpt-4o-mini-transcribe) → resumo estruturado S/A/P reaproveitando
// o MESMO gateway de chat já validado pelo assistente de conhecimento.
// Endpoint de transcrição inferido do padrão /v1/chat/completions já
// confirmado em produção (mesmo host, mesmo header, contrato OpenAI-shape)
// — validar contra uma chave real antes de ir a produção (ver PRD).

const SUMMARY_SYSTEM = `Você resume transcrições de consultas médicas em português do Brasil.
Devolva SOMENTE um JSON válido (sem markdown, sem texto fora do JSON) com exatamente estas chaves:
{"subjective": "...", "assessment": "...", "plan": "..."}
- subjective: queixa e história da doença atual relatadas pelo paciente/médico na fala.
- assessment: hipótese diagnóstica ou avaliação clínica mencionada.
- plan: conduta, exames solicitados, medicação, retorno.
Se uma seção não tiver informação na transcrição, devolva string vazia "" — nunca invente conteúdo.`;

function extractJson(text: string): { subjective: string; assessment: string; plan: string } {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("Resumo da IA não veio em formato reconhecível.");
  const parsed = JSON.parse(match[0]) as Record<string, unknown>;
  return {
    subjective: typeof parsed.subjective === "string" ? parsed.subjective : "",
    assessment: typeof parsed.assessment === "string" ? parsed.assessment : "",
    plan: typeof parsed.plan === "string" ? parsed.plan : "",
  };
}

export const transcribeConsult = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      audioBase64: z.string().min(1).max(30_000_000), // ~22MB decodificado, cobre consultas curtas
      mimeType: z.string().max(60).default("audio/webm"),
      durationSec: z.number().min(0).max(7200).default(0),
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

    const summaryReply = await callLovableChat(
      [{ role: "user", content: transcript }],
      { system: SUMMARY_SYSTEM },
    );
    const { subjective, assessment, plan } = extractJson(summaryReply);

    return {
      durationSec: data.durationSec,
      transcript,
      subjective,
      assessment,
      plan,
    };
  });
