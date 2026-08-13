// Server-only: cliente HTTP direto para a API do Gemini. Substitui o Lovable
// AI Gateway (ai.gateway.lovable.dev) em todo o produto — chat do assistente
// de conhecimento, criação de template e ditado de consulta (TECH-24). Mesma
// GEMINI_API_KEY já usada pelo OCR — uma dependência externa a menos.
//
// uploadFileToGemini duplica a lógica de ocr-extraction.server.ts de propósito:
// aquele arquivo está validado em produção e não foi tocado para não
// introduzir risco numa pipeline que funciona. Dedup é follow-up, não agora.

const GEMINI_API_BASE = "https://generativelanguage.googleapis.com";

export const GEMINI_MODEL = "gemini-flash-latest";

export class GeminiClientError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

function friendlyError(status: number, body: string): Error {
  if (status === 429) return new GeminiClientError("Limite de requisições atingido. Tente novamente em instantes.", status);
  if (status === 403) return new GeminiClientError("Chave da API Gemini recusada ou sem permissão.", status);
  return new GeminiClientError(`Falha na API Gemini (${status}): ${body.slice(0, 200)}`, status);
}

export async function uploadFileToGemini(
  bytes: Uint8Array,
  mimeType: string,
  apiKey: string,
): Promise<string> {
  const numBytes = bytes.length;

  const startRes = await fetch(`${GEMINI_API_BASE}/upload/v1beta/files?key=${apiKey}`, {
    method: "POST",
    headers: {
      "X-Goog-Upload-Protocol": "resumable",
      "X-Goog-Upload-Command": "start",
      "X-Goog-Upload-Header-Content-Length": String(numBytes),
      "X-Goog-Upload-Header-Content-Type": mimeType,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ file: { display_name: "lifeline-upload" } }),
  });
  if (!startRes.ok) throw friendlyError(startRes.status, await startRes.text());
  const uploadUrl = startRes.headers.get("x-goog-upload-url");
  if (!uploadUrl) throw new Error("Gemini upload: URL de upload não retornada");

  const uploadRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Length": String(numBytes),
      "X-Goog-Upload-Offset": "0",
      "X-Goog-Upload-Command": "upload, finalize",
    },
    body: bytes as BodyInit,
  });
  if (!uploadRes.ok) throw friendlyError(uploadRes.status, await uploadRes.text());
  const uploaded = await uploadRes.json();
  const fileUri = uploaded?.file?.uri;
  const fileName = uploaded?.file?.name;
  if (!fileUri || !fileName) throw new Error("Gemini upload: resposta sem file.uri");

  let state = uploaded?.file?.state;
  let attempts = 0;
  while (state !== "ACTIVE" && attempts < 15) {
    await new Promise((r) => setTimeout(r, 1000));
    const statusRes = await fetch(`${GEMINI_API_BASE}/v1beta/${fileName}?key=${apiKey}`);
    if (!statusRes.ok) throw friendlyError(statusRes.status, await statusRes.text());
    const statusJson = await statusRes.json();
    state = statusJson?.state;
    if (state === "FAILED") throw new Error("Gemini: processamento do arquivo falhou");
    attempts++;
  }
  if (state !== "ACTIVE") throw new Error("Gemini: arquivo não ficou pronto a tempo (timeout de 15s)");

  return fileUri;
}

type GeminiPart =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } }
  | { fileData: { mimeType: string; fileUri: string } };

export async function generateGeminiText(opts: {
  apiKey: string;
  model?: string;
  system?: string;
  messages: { role: "user" | "assistant" | "system"; content: string }[];
}): Promise<string> {
  const { apiKey, model = GEMINI_MODEL, system, messages } = opts;

  const systemParts = [system, ...messages.filter((m) => m.role === "system").map((m) => m.content)]
    .filter(Boolean)
    .join("\n\n");

  const contents = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

  const res = await fetch(`${GEMINI_API_BASE}/v1beta/models/${model}:generateContent?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents,
      ...(systemParts ? { systemInstruction: { parts: [{ text: systemParts }] } } : {}),
      generationConfig: { temperature: 0.4 },
    }),
  });
  if (!res.ok) throw friendlyError(res.status, await res.text());

  const json = await res.json();
  const reply = json?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  if (!reply) throw new Error("Resposta vazia do Gemini.");
  return reply;
}

export async function generateGeminiJson(opts: {
  apiKey: string;
  model?: string;
  parts: GeminiPart[];
  responseSchema: Record<string, unknown>;
  temperature?: number;
}): Promise<Record<string, unknown>> {
  const { apiKey, model = GEMINI_MODEL, parts, responseSchema, temperature = 0 } = opts;

  const res = await fetch(`${GEMINI_API_BASE}/v1beta/models/${model}:generateContent?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: { responseMimeType: "application/json", responseSchema, temperature },
    }),
  });
  if (!res.ok) throw friendlyError(res.status, await res.text());

  const json = await res.json();
  const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Resposta vazia do Gemini.");
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("Resposta do Gemini não veio em JSON válido.");
  }
}
