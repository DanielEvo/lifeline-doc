// Server-only: extração de biomarcadores de laudos (PDF/imagem) via Gemini.
// Só lê o documento e devolve candidatos — nunca grava no banco.

const GEMINI_MODEL = "gemini-1.5-pro";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

export type ExtractedBiomarker = { rawName: string; value: number; unit: string };

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    collectionDate: { type: "string", nullable: true },
    biomarkers: {
      type: "array",
      items: {
        type: "object",
        properties: { rawName: { type: "string" }, value: { type: "number" }, unit: { type: "string" } },
        required: ["rawName", "value", "unit"],
      },
    },
  },
  required: ["biomarkers"],
};

const PROMPT = `Você é um assistente de extração de dados de exames laboratoriais brasileiros.
Leia o documento anexado (PDF ou foto de laudo) e extraia TODOS os biomarcadores numéricos.

Regras:
- rawName: nome EXATO como aparece no laudo, sem traduzir ou normalizar.
- value: apenas o número, sem unidade.
- unit: unidade exatamente como aparece (ex: "g/dL", "mg/dL").
- Biomarcador repetido no laudo → retorne cada ocorrência.
- Ignore texto livre, observações, assinatura do médico.
- Não invente valores. Sem confiança no número, não inclua.
- collectionDate: data de coleta se aparecer no documento, formato yyyy-mm-dd.`;

export async function extractBiomarkersFromDocument(
  fileBase64: string,
  mimeType: string,
): Promise<{ collectionDate: string | null; biomarkers: ExtractedBiomarker[] }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY não configurada");

  const res = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: PROMPT }, { inlineData: { mimeType, data: fileBase64 } }] }],
      generationConfig: { responseMimeType: "application/json", responseSchema: RESPONSE_SCHEMA, temperature: 0 },
    }),
  });

  if (!res.ok) throw new Error(`Gemini API error ${res.status}: ${(await res.text()).slice(0, 300)}`);

  const json = await res.json();
  const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Resposta vazia da IA");

  const parsed = JSON.parse(text) as { collectionDate?: string | null; biomarkers: ExtractedBiomarker[] };
  return { collectionDate: parsed.collectionDate ?? null, biomarkers: parsed.biomarkers ?? [] };
}
