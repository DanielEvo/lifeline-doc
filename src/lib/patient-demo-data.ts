// Dados fictícios do app do paciente — SOMENTE demonstração, ligados por
// ação explícita do paciente ("Importar dados de exemplo"). Ficam em
// localStorage, nunca tocam o backend nem se misturam a dados reais: tudo
// que vem daqui carrega a flag `demo` e aparece rotulado como exemplo.

export type DemoBiomarker = {
  name: string;
  value: number;
  unit: string;
  min: number;
  max: number;
};

export type PatientHistoryEntry = {
  key: string;
  kind: "exame" | "consulta" | "cirurgia";
  /** yyyy-mm-dd */
  date: string;
  title: string;
  source: string;
  status: "Saudável" | "Atenção" | "Alerta" | "Pendente";
  biomarkers: DemoBiomarker[];
  fileName: string | null;
  demo: boolean;
};

export type PatientConsulta = {
  id: string;
  /** yyyy-mm-dd */
  date: string;
  hora: string;
  title: string;
  local: string;
  status: "agendada" | "realizada";
  resultado?: string;
  demo: boolean;
};

const DEMO_FLAG = "lifeline:patient:demo";

export function isDemoOn(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(DEMO_FLAG) === "1";
}

export function setDemoOn(on: boolean) {
  if (typeof window === "undefined") return;
  if (on) window.localStorage.setItem(DEMO_FLAG, "1");
  else window.localStorage.removeItem(DEMO_FLAG);
}

export const DEMO_HISTORY: PatientHistoryEntry[] = [
  {
    key: "demo-2023-03",
    kind: "exame",
    date: "2023-03-14",
    title: "Check-up de rotina",
    source: "Lab. Fleury",
    status: "Saudável",
    fileName: "checkup-mar-2023.pdf",
    demo: true,
    biomarkers: [
      { name: "Hemoglobina", value: 13.8, unit: "g/dL", min: 12, max: 16 },
      { name: "Ferritina", value: 62, unit: "ng/mL", min: 30, max: 200 },
      { name: "Vitamina D", value: 38, unit: "ng/mL", min: 30, max: 100 },
      { name: "TSH", value: 2.1, unit: "mUI/L", min: 0.4, max: 4 },
    ],
  },
  {
    key: "demo-2024-01",
    kind: "consulta",
    date: "2024-01-22",
    title: "Consulta clínica geral",
    source: "Dr. Marcos Lima",
    status: "Atenção",
    fileName: null,
    demo: true,
    biomarkers: [],
  },
  {
    key: "demo-2024-09",
    kind: "exame",
    date: "2024-09-05",
    title: "Painel metabólico",
    source: "Lab. Sabin",
    status: "Atenção",
    fileName: "painel-set-2024.pdf",
    demo: true,
    biomarkers: [
      { name: "Hemoglobina", value: 12.4, unit: "g/dL", min: 12, max: 16 },
      { name: "Ferritina", value: 34, unit: "ng/mL", min: 30, max: 200 },
      { name: "Vitamina D", value: 26, unit: "ng/mL", min: 30, max: 100 },
      { name: "TSH", value: 3.4, unit: "mUI/L", min: 0.4, max: 4 },
    ],
  },
  {
    key: "demo-2025-06",
    kind: "exame",
    date: "2025-06-11",
    title: "Hemograma + ferro",
    source: "Lab. Fleury",
    status: "Alerta",
    fileName: "hemograma-jun-2025.pdf",
    demo: true,
    biomarkers: [
      { name: "Hemoglobina", value: 11.2, unit: "g/dL", min: 12, max: 16 },
      { name: "Ferritina", value: 18, unit: "ng/mL", min: 30, max: 200 },
      { name: "Vitamina D", value: 22, unit: "ng/mL", min: 30, max: 100 },
      { name: "TSH", value: 3.9, unit: "mUI/L", min: 0.4, max: 4 },
    ],
  },
  {
    key: "demo-2026-02",
    kind: "exame",
    date: "2026-02-19",
    title: "Reavaliação pós-tratamento",
    source: "Lab. Sabin",
    status: "Atenção",
    fileName: "reavaliacao-fev-2026.pdf",
    demo: true,
    biomarkers: [
      { name: "Hemoglobina", value: 12.9, unit: "g/dL", min: 12, max: 16 },
      { name: "Ferritina", value: 41, unit: "ng/mL", min: 30, max: 200 },
      { name: "Vitamina D", value: 29, unit: "ng/mL", min: 30, max: 100 },
      { name: "TSH", value: 2.6, unit: "mUI/L", min: 0.4, max: 4 },
    ],
  },
];

export const DEMO_CONSULTAS: PatientConsulta[] = [
  {
    id: "dc1",
    date: "2024-01-22",
    hora: "10:00",
    title: "Consulta clínica geral",
    local: "Dr. Marcos Lima · Presencial",
    status: "realizada",
    resultado: "Ajuste de dieta e reavaliação em 6 meses",
    demo: true,
  },
  {
    id: "dc2",
    date: "2025-06-18",
    hora: "14:30",
    title: "Retorno · resultado de exames",
    local: "Dra. Helena Prado · Telemedicina",
    status: "realizada",
    resultado: "Início de reposição de ferro",
    demo: true,
  },
  {
    id: "dc3",
    date: "2026-02-26",
    hora: "09:00",
    title: "Consulta de acompanhamento",
    local: "Dra. Helena Prado · Presencial",
    status: "realizada",
    resultado: "Melhora dos níveis de ferritina",
    demo: true,
  },
  {
    id: "dc4",
    date: "2026-08-12",
    hora: "08:00",
    title: "Coleta de hemograma completo",
    local: "Lab. Fleury",
    status: "agendada",
    demo: true,
  },
  {
    id: "dc5",
    date: "2026-08-20",
    hora: "15:00",
    title: "Retorno Dra. Helena",
    local: "Telemedicina",
    status: "agendada",
    demo: true,
  },
];

/** Status derivado das faixas de referência do próprio exame. */
export function statusDosBiomarcadores(
  items: DemoBiomarker[],
): PatientHistoryEntry["status"] {
  if (items.length === 0) return "Pendente";
  let atencao = false;
  for (const b of items) {
    const span = b.max - b.min || 1;
    if (b.value < b.min - span * 0.25 || b.value > b.max + span * 0.25) return "Alerta";
    if (b.value < b.min || b.value > b.max) atencao = true;
  }
  return atencao ? "Atenção" : "Saudável";
}
