import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireDoctor } from "../auth.server";
import { generateGeminiJson, uploadFileToGemini, GEMINI_MODEL } from "../gemini-client.server";

// Ditado da consulta: áudio real (MediaRecorder no navegador) → transcrição +
// resumo estruturado em UMA chamada multimodal ao Gemini (antes eram duas
// chamadas via Lovable AI Gateway: transcrição + resumo). A estrutura do
// resumo depende do template ativo no front (PRO-02/PRO-03): com seções
// (Padrão/Anamnese/custom), o resumo sai já dividido por cabeçalho — sem
// seções ("Texto livre"), sai um único resumo corrido.

const INLINE_LIMIT_BYTES = 15_000_000;

const CONVERSATION_NOTICE =
  "O áudio é uma conversa entre médico e paciente durante a consulta — não um monólogo do médico. Sintetize por conteúdo clínico, não transcreva literalmente seção por seção.";

const FREE_TEXT_PROMPT = `${CONVERSATION_NOTICE}
Transcreva o áudio literalmente no campo transcricao.
No campo resumo, produza um resumo corrido em prosa clínica objetiva, cobrindo queixa/avaliação/conduta, sem estrutura fixa.
Se a transcrição não tiver conteúdo clínico relevante, devolva resumo vazio.
Nunca invente conteúdo.`;

/** Monta o prompt pedindo um JSON com uma chave por seção — índice numérico
 *  ("s0", "s1", …) como chave interna pra não depender de acento/case do
 *  label; o label original é reanexado depois em `blocks`. */
function buildSectionsPrompt(sections: string[], templateContent: string): string {
  const mapping = sections.map((label, i) => `s${i} = "${label}"`).join("; ");
  const templateBlock = templateContent.trim()
    ? `\n\nO médico escolheu este template — use-o como instrução de estrutura e de estilo, respeitando qualquer orientação escrita nele:\n"""\n${templateContent.trim()}\n"""`
    : "";
  return `${CONVERSATION_NOTICE}
Transcreva o áudio literalmente no campo transcricao. Nas demais seções, distribua o conteúdo clínico relevante — cada chave corresponde a uma seção do template: ${mapping}.

REGRA CRÍTICA: seções de avaliação, hipótese, diagnóstico ou conduta só podem conter julgamento clínico verbalizado pelo MÉDICO — nunca uma fala do paciente, mesmo que pareça clinicamente relevante. Seções de queixa/relato podem e devem refletir as palavras do paciente. Se não for possível determinar com segurança quem verbalizou um trecho, classifique-o como relato do paciente (mais seguro).

Para cada seção, devolva também um booleano s{i}_paciente = true se o texto daquela seção contém, ou é derivado de, fala direta do paciente — sinal para o médico revisar com atenção extra antes de aceitar.

Se uma seção não tiver informação correspondente na transcrição, devolva string vazia "" e s{i}_paciente = false — nunca invente conteúdo.${templateBlock}`;
}

function buildSchema(sections: string[]): Record<string, unknown> {
  const props: Record<string, unknown> = { transcricao: { type: "string" } };
  const required = ["transcricao"];
  if (sections.length === 0) {
    props.resumo = { type: "string" };
    required.push("resumo");
  } else {
    sections.forEach((_, i) => {
      props[`s${i}`] = { type: "string" };
      props[`s${i}_paciente`] = { type: "boolean" };
      required.push(`s${i}`, `s${i}_paciente`);
    });
  }
  return { type: "object", properties: props, required };
}

export const transcribeConsult = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      // Sem token, qualquer um na internet podia mandar 22MB de áudio e
      // queimar os créditos de IA do workspace — o endpoint era público.
      token: z.string().min(1),
      audioBase64: z.string().min(1).max(30_000_000), // ~22MB decodificado, cobre consultas curtas
      mimeType: z.string().max(60).default("audio/webm"),
      durationSec: z.number().min(0).max(7200).default(0),
      // Cabeçalhos de seção do template ativo no front (parseTemplateSections)
      // — vazio quando o médico está em modo "Texto livre".
      templateSections: z.array(z.string().max(40)).max(8).optional().default([]),
      // Template ativo por inteiro — orienta a IA a encaixar a transcrição
      // nos campos do template (inclusive instruções escritas nele).
      templateContent: z.string().max(4000).optional().default(""),
    }),
  )
  .handler(async ({ data }) => {
    const doctor = await requireDoctor(data.token);
    if (!doctor) throw new Error("Sessão expirada. Entre novamente para usar o ditado.");

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY não configurada neste ambiente — ditado por IA indisponível.");
    }

    const audioBuffer = Buffer.from(data.audioBase64, "base64");
    if (audioBuffer.length === 0) throw new Error("Áudio vazio.");

    const mimeType = data.mimeType.split(";")[0].trim() || "audio/webm";

    const sections = data.templateSections;
    const schema = buildSchema(sections);
    const prompt = sections.length === 0 ? FREE_TEXT_PROMPT : buildSectionsPrompt(sections, data.templateContent);

    const fileUri =
      audioBuffer.length > INLINE_LIMIT_BYTES ? await uploadFileToGemini(audioBuffer, mimeType, apiKey) : null;

    const audioPart = fileUri
      ? ({ fileData: { mimeType, fileUri } } as const)
      : ({ inlineData: { mimeType, data: data.audioBase64 } } as const);

    let json: Record<string, unknown>;
    try {
      json = await generateGeminiJson({
        apiKey,
        model: GEMINI_MODEL,
        parts: [{ text: prompt }, audioPart],
        responseSchema: schema,
      });
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : "Não consegui transcrever agora.");
    }

    const transcript = typeof json.transcricao === "string" ? json.transcricao.trim() : "";
    if (!transcript) throw new Error("Transcrição vazia — tente falar mais alto ou perto do microfone.");

    const blocks =
      sections.length === 0
        ? [
            {
              label: "Transcrição",
              text: typeof json.resumo === "string" ? json.resumo.trim() : "",
              containsPatientReport: false,
            },
          ]
        : sections.map((label, i) => ({
            label,
            text: typeof json[`s${i}`] === "string" ? (json[`s${i}`] as string).trim() : "",
            containsPatientReport: json[`s${i}_paciente`] === true,
          }));

    return { durationSec: data.durationSec, transcript, blocks };
  });
