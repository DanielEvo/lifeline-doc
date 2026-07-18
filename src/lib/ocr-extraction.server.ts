// Server-only: extração de biomarcadores de laudos (PDF/imagem) via Gemini.
// Só lê o documento e devolve candidatos — nunca grava no banco.
//
// PDFs são divididos em lotes de páginas (pdf-lib, sem binário nativo) antes
// de ir para a IA — evita corte de geração em laudos longos (ex: 29 páginas).
// Se um lote ainda vier cortado, o lote é dividido ao meio e tentado de novo,
// recursivamente, até 1 página — agnóstico ao tamanho do documento e à
// densidade de biomarcadores por página. Imagens soltas (.jpg/.png) não
// passam por essa divisão, vão direto.
//
// Falha transitória (rate limit 429, 5xx, timeout de polling do File API) em
// qualquer lote é reexecutada com backoff exponencial antes de desistir —
// sem isso, um laudo de várias páginas processado em lotes sequenciais perde
// silenciosamente qualquer lote que esbarre em rate limit no meio do caminho.

import { PDFDocument } from "pdf-lib";

const GEMINI_API_BASE = "https://generativelanguage.googleapis.com";
const GEMINI_MODEL = "gemini-flash-latest";
const PAGES_PER_BATCH = 4;
const MAX_OUTPUT_TOKENS = 8192;
const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 1500;

// Erros de HTTP da API do Gemini carregam o status — permite diferenciar
// falha transitória (429 rate limit, 5xx) de falha permanente (400 malformado,
// 403 sem permissão), já que só a primeira vale a pena tentar de novo.
class GeminiRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

// Reexecuta `fn` com backoff exponencial em falha transitória (rate limit,
// erro 5xx, timeout de polling do File API, erro de rede). Falha permanente
// (4xx que não seja 429) propaga na primeira tentativa — tentar de novo não
// resolveria. Sem isso, um laudo de várias páginas processado em lotes
// sequenciais perde silenciosamente qualquer lote que esbarre em rate limit
// no meio do caminho.
async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      const retryable = e instanceof GeminiRequestError ? isRetryableStatus(e.status) : true;
      if (!retryable || attempt >= MAX_RETRIES) throw e;
      const delay = RETRY_BASE_DELAY_MS * 2 ** attempt;
      console.error(
        `[ocr-extraction] Tentativa ${attempt + 1}/${MAX_RETRIES + 1} falhou (${e instanceof Error ? e.message : e}) — nova tentativa em ${delay}ms.`,
      );
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}

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
Leia o documento anexado (pode ser um trecho de poucas páginas de um laudo maior) e
extraia TODOS os biomarcadores numéricos presentes NESTAS páginas.

Regras:
- rawName: nome EXATO como aparece no laudo, sem traduzir ou normalizar.
- value: apenas o valor da tabela principal, no campo "RESULTADO" — NUNCA um
  valor lido de "Gráfico de Histórico" (são resultados de coletas anteriores,
  não da coleta atual, e devem ser ignorados por completo).
- unit: unidade exatamente como aparece (ex: "g/dL", "mg/dL").
- Biomarcador repetido → retorne cada ocorrência.
- Ignore texto livre, observações, referências bibliográficas, assinatura do médico.
- Não invente valores. Sem confiança no número, não inclua.
- collectionDate: data de coleta do exame ATUAL, formato yyyy-mm-dd, se aparecer
  nestas páginas (campo "DATA COLETA/RECEBIMENTO"). Se não aparecer aqui, retorne null.
- Extraia TODOS os biomarcadores destas páginas, não pare cedo.`;

type ExtractionResult = { collectionDate: string | null; biomarkers: ExtractedBiomarker[] };
type RawExtraction = ExtractionResult & { finishReason: string | undefined };

async function uploadFileToGemini(bytes: Uint8Array, mimeType: string, apiKey: string): Promise<string> {
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
    body: JSON.stringify({ file: { display_name: "exame-lifeline" } }),
  });
  if (!startRes.ok) {
    throw new GeminiRequestError(
      `Gemini upload start error ${startRes.status}: ${(await startRes.text()).slice(0, 300)}`,
      startRes.status,
    );
  }
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
  if (!uploadRes.ok) {
    throw new GeminiRequestError(
      `Gemini upload error ${uploadRes.status}: ${(await uploadRes.text()).slice(0, 300)}`,
      uploadRes.status,
    );
  }
  const uploaded = await uploadRes.json();
  const fileUri = uploaded?.file?.uri;
  const fileName = uploaded?.file?.name;
  if (!fileUri || !fileName) throw new Error("Gemini upload: resposta sem file.uri");

  let state = uploaded?.file?.state;
  let attempts = 0;
  while (state !== "ACTIVE" && attempts < 15) {
    await new Promise((r) => setTimeout(r, 1000));
    const statusRes = await fetch(`${GEMINI_API_BASE}/v1beta/${fileName}?key=${apiKey}`);
    if (!statusRes.ok) throw new GeminiRequestError(`Gemini file status error ${statusRes.status}`, statusRes.status);
    const statusJson = await statusRes.json();
    state = statusJson?.state;
    if (state === "FAILED") throw new Error("Gemini: processamento do arquivo falhou");
    attempts++;
  }
  if (state !== "ACTIVE") throw new Error("Gemini: arquivo não ficou pronto a tempo (timeout de 15s)");

  return fileUri;
}

async function extractRaw(bytes: Uint8Array, mimeType: string, apiKey: string): Promise<RawExtraction> {
  const fileUri = await uploadFileToGemini(bytes, mimeType, apiKey);

  const res = await fetch(`${GEMINI_API_BASE}/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: PROMPT }, { fileData: { mimeType, fileUri } }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: RESPONSE_SCHEMA,
        temperature: 0,
        maxOutputTokens: MAX_OUTPUT_TOKENS,
      },
    }),
  });

  if (!res.ok) {
    throw new GeminiRequestError(`Gemini API error ${res.status}: ${(await res.text()).slice(0, 300)}`, res.status);
  }

  const json = await res.json();
  const candidate = json.candidates?.[0];
  const finishReason = candidate?.finishReason;
  const text = candidate?.content?.parts?.[0]?.text;
  if (!text) return { collectionDate: null, biomarkers: [], finishReason };

  try {
    const parsed = JSON.parse(text) as { collectionDate?: string | null; biomarkers: ExtractedBiomarker[] };
    return { collectionDate: parsed.collectionDate ?? null, biomarkers: parsed.biomarkers ?? [], finishReason };
  } catch {
    // JSON incompleto por corte no meio — trata como lote vazio, deixa o
    // chamador decidir se divide e tenta de novo (finishReason já indica isso)
    return { collectionDate: null, biomarkers: [], finishReason };
  }
}

// Extrai um conjunto de páginas de um PDF já carregado (pdf-lib). Se a
// resposta vier cortada (MAX_TOKENS) e ainda há mais de 1 página no lote,
// divide ao meio e tenta cada metade separadamente — agnóstico ao tamanho
// do lote inicial e à densidade de biomarcadores por página.
async function extractPageRangeRecursive(
  sourceDoc: PDFDocument,
  pageIndices: number[],
  apiKey: string,
): Promise<ExtractionResult> {
  const subDoc = await PDFDocument.create();
  const copied = await subDoc.copyPages(sourceDoc, pageIndices);
  copied.forEach((p) => subDoc.addPage(p));
  const bytes = await subDoc.save();

  let result: RawExtraction;
  try {
    result = await withRetry(() => extractRaw(bytes, "application/pdf", apiKey));
  } catch (e) {
    console.error(
      `[ocr-extraction] Falha definitiva no lote de páginas ${pageIndices.join(",")} após ${MAX_RETRIES + 1} tentativa(s): ${e}`,
    );
    return { collectionDate: null, biomarkers: [] };
  }

  if (result.finishReason === "MAX_TOKENS" && pageIndices.length > 1) {
    const mid = Math.ceil(pageIndices.length / 2);
    const [left, right] = await Promise.all([
      extractPageRangeRecursive(sourceDoc, pageIndices.slice(0, mid), apiKey),
      extractPageRangeRecursive(sourceDoc, pageIndices.slice(mid), apiKey),
    ]);
    return {
      collectionDate: left.collectionDate ?? right.collectionDate,
      biomarkers: [...left.biomarkers, ...right.biomarkers],
    };
  }

  if (result.finishReason === "MAX_TOKENS") {
    console.error(
      `[ocr-extraction] Página ${pageIndices[0]} sozinha ainda cortou por MAX_TOKENS — ` +
        `retornando parcial (${result.biomarkers.length} itens).`,
    );
  }

  return { collectionDate: result.collectionDate, biomarkers: result.biomarkers };
}

export async function extractBiomarkersFromDocument(
  fileBase64: string,
  mimeType: string,
): Promise<ExtractionResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY não configurada");

  if (mimeType !== "application/pdf") {
    // Imagem solta: uma página, sem necessidade de lotes.
    const bytes = Buffer.from(fileBase64, "base64");
    const result = await withRetry(() => extractRaw(bytes, mimeType, apiKey));
    return { collectionDate: result.collectionDate, biomarkers: result.biomarkers };
  }

  const bytes = Buffer.from(fileBase64, "base64");
  const sourceDoc = await PDFDocument.load(bytes);
  const pageCount = sourceDoc.getPageCount();

  const batches: number[][] = [];
  for (let i = 0; i < pageCount; i += PAGES_PER_BATCH) {
    batches.push(Array.from({ length: Math.min(PAGES_PER_BATCH, pageCount - i) }, (_, j) => i + j));
  }

  const results: ExtractionResult[] = [];
  for (const batch of batches) {
    // sequencial: protege cota da API (free tier) em documentos muito longos
    results.push(await extractPageRangeRecursive(sourceDoc, batch, apiKey));
  }

  const collectionDate = results.find((r) => r.collectionDate)?.collectionDate ?? null;
  const biomarkers = results.flatMap((r) => r.biomarkers);

  console.log(
    `[ocr-extraction] Documento de ${pageCount} página(s) em ${batches.length} lote(s) → ${biomarkers.length} biomarcador(es) extraído(s).`,
  );

  return { collectionDate, biomarkers };
}
