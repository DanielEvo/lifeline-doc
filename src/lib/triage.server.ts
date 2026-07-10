// Server-only triage engine. A deterministic, rule-based PT-BR symptom
// extractor that stands in for the production LLM — so the demo responds to
// whatever a doctor actually types, instead of replaying a fixed script.
// Lives in .server.ts so it never ships to the client bundle.

import { BIOMARKER_CATALOG } from "./clinic-types";

// ---------------------------------------------------------------------------
// SIMULATED_OCR — trocar por extração real quando pipeline OCR existir.
// ---------------------------------------------------------------------------

export type SimulatedMeasurement = {
  name: string;
  value: number;
  unit: string;
  refMin: number;
  refMax: number;
};

export type ExamExtractionResult = {
  measurements: SimulatedMeasurement[];
  summaryLine: string;
};

export function simulateExamExtraction(fileNames: string[]): ExamExtractionResult {
  // SIMULATED_OCR — sorteia 1–3 biomarcadores com valores plausíveis
  const catalog = [...BIOMARKER_CATALOG].sort(() => Math.random() - 0.5);
  const count = 1 + Math.floor(Math.random() * 3);
  const picked = catalog.slice(0, count);

  const measurements: SimulatedMeasurement[] = picked.map((b) => {
    const range = b.max - b.min;
    const inRange = Math.random() < 0.7;
    let value: number;
    if (inRange) {
      value = b.min + Math.random() * range;
    } else {
      const overshoot = range * 0.2;
      value = Math.random() < 0.5 ? b.min - overshoot : b.max + overshoot;
    }
    return {
      name: b.name,
      unit: b.unit,
      value: Math.round(value * 100) / 100,
      refMin: b.min,
      refMax: b.max,
    };
  });

  const names = measurements.map((m) => `${m.name} ${m.value} ${m.unit}`).join(", ");
  const summaryLine = `Exames (${fileNames.join(", ")}): ${names}.`;
  return { measurements, summaryLine };
}

export type TriageResult = {
  complaint: string;
  symptoms: string[];
  redFlags: string[];
  duration: string | null;
  urgency: "baixa" | "média" | "alta";
  summary: string;
  followUpQuestion: string;
  suggestedColumn: "triagem" | "atendimento";
};

type Rule = {
  id: string;
  label: string;
  keywords: string[];
  redFlag?: boolean;
};

const RULES: Rule[] = [
  { id: "fadiga", label: "fadiga / cansaço", keywords: ["cansa", "cansad", "fadiga", "exaust", "sem energia", "indispos", "fraqueza", "fraca", "fraco"] },
  { id: "dispneia", label: "dispneia aos esforços", keywords: ["falta de ar", "falta de ár", "dispne", "ar quando", "sufoc", "ofegan", "cansa ao subir", "fôlego"] },
  { id: "dor_toracica", label: "dor torácica", keywords: ["dor no peito", "dor torac", "dor torác", "aperto no peito", "peito apert", "peito doendo"], redFlag: true },
  { id: "cefaleia", label: "cefaleia", keywords: ["dor de cabeça", "cefale", "enxaqueca", "cabeça doendo", "cabeça latejando"] },
  { id: "febre", label: "febre", keywords: ["febre", "febril", "temperatura alta", "38", "39", "40 graus"] },
  { id: "tontura", label: "tontura", keywords: ["tontura", "tont", "vertigem", "zonz", "cabeça rodando"] },
  { id: "palpitacao", label: "palpitações", keywords: ["palpita", "coração aceler", "coracao aceler", "taquicard", "batedeira", "coração disparado"] },
  { id: "nausea", label: "náusea", keywords: ["náusea", "nausea", "enjoo", "enjôo", "vontade de vomitar", "vomit"] },
  { id: "dor_abdominal", label: "dor abdominal", keywords: ["dor de barriga", "dor abdominal", "abdome", "estômago doendo", "dor no estomago", "dor no estômago", "cólica"] },
  { id: "tosse", label: "tosse", keywords: ["tosse", "tossind", "tossir"] },
  { id: "perda_peso", label: "perda de peso", keywords: ["emagrec", "perda de peso", "perdi peso", "perdendo peso"] },
  { id: "sangramento", label: "sangramento", keywords: ["sangr", "sangue na", "perda de sangue"], redFlag: true },
  { id: "sincope", label: "síncope (desmaio)", keywords: ["desmai", "desfalec", "apaguei", "perdi a consciência"], redFlag: true },
  { id: "parestesia", label: "formigamento / dormência", keywords: ["dormênc", "dormenc", "formigam", "adormec"] },
  { id: "insonia", label: "insônia", keywords: ["insônia", "insonia", "não consigo dormir", "nao consigo dormir", "sem dormir", "dormindo mal", "noites mal"] },
  { id: "ansiedade", label: "ansiedade", keywords: ["ansiedade", "ansios", "angústia", "angustia", "pânico", "panico", "nervos"] },
];

function extractDuration(text: string): string | null {
  // "há 3 dias", "faz 2 semanas", "3 meses", "uma semana"
  const m = text.match(
    /(?:h[áa]|faz|desde|tem)\s+(?:cerca de\s+)?(\d{1,3}|um|uma|dois|duas|tr[êe]s|quatro|cinco|seis|sete|oito|nove|dez)\s*(dia|dias|semana|semanas|m[êe]s|meses|ano|anos|hora|horas)/i,
  );
  if (m) return `${m[1]} ${m[2]}`;
  const m2 = text.match(/(\d{1,3})\s*(dia|dias|semana|semanas|m[êe]s|meses|ano|anos)/i);
  if (m2) return `${m2[1]} ${m2[2]}`;
  return null;
}

export function extractTriage(rawMessage: string): TriageResult {
  const text = rawMessage.toLowerCase();
  const matched = RULES.filter((r) => r.keywords.some((k) => text.includes(k)));
  const symptoms = matched.map((r) => r.label);
  const redFlags = matched.filter((r) => r.redFlag).map((r) => r.label);
  const duration = extractDuration(text);

  // Urgency: any red flag → alta; 2+ symptoms or breathlessness → média; else baixa
  let urgency: TriageResult["urgency"] = "baixa";
  if (redFlags.length > 0) urgency = "alta";
  else if (matched.length >= 2 || matched.some((r) => r.id === "dispneia")) urgency = "média";

  const complaint =
    symptoms.length > 0
      ? symptoms.slice(0, 2).join(" + ")
      : "queixa a esclarecer na consulta";

  const durTxt = duration ? ` há ${duration}` : "";
  const flagTxt =
    redFlags.length > 0
      ? ` Sinal de alerta: ${redFlags.join(", ")} — priorizar avaliação.`
      : "";
  const summary =
    symptoms.length > 0
      ? `Paciente refere ${symptoms.join(", ")}${durTxt}.${flagTxt}`
      : `Paciente relata desconforto sem sintomas específicos identificados. Detalhar na consulta.`;

  // A relevant next question, picked from the leading symptom
  let followUpQuestion =
    "Você tem exames de sangue dos últimos 12 meses? Pode mandar em PDF ou foto.";
  if (matched.some((r) => r.id === "fadiga" || r.id === "dispneia"))
    followUpQuestion =
      "Há quanto tempo você se sente assim? E tem um hemograma recente para me enviar?";
  else if (matched.some((r) => r.id === "dor_toracica" || r.id === "palpitacao"))
    followUpQuestion =
      "A dor aparece em esforço ou em repouso? Você tem um ECG ou exames recentes?";
  else if (matched.some((r) => r.id === "cefaleia"))
    followUpQuestion =
      "Com que frequência a dor aparece? Tem relação com sono, tela ou estresse?";

  return {
    complaint,
    symptoms,
    redFlags,
    duration,
    urgency,
    summary,
    followUpQuestion,
    suggestedColumn: urgency === "alta" ? "atendimento" : "triagem",
  };
}
