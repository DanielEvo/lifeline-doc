// Tipos e helpers puros da clínica, compartilhados entre cliente e servidor.
// Sem nada de runtime de servidor aqui — este módulo pode ir pro bundle.

// Colunas do kanban são PERSONALIZÁVEIS por médico (boards.json). Estas são
// as colunas padrão de um consultório novo; `column` no paciente é o id.
export type ClinicColumn = string;

export type BoardColumn = { id: string; title: string; hint: string };

export const DEFAULT_COLUMNS: BoardColumn[] = [
  { id: "triagem", title: "Triagem / Pré-Consulta", hint: "Aguardando atendimento" },
  { id: "atendimento", title: "Em Atendimento", hint: "Consulta em andamento" },
  { id: "aguardando", title: "Aguardando Exames", hint: "Solicitações enviadas" },
  { id: "retorno", title: "Retorno Agendado", hint: "Exames recebidos · retorno marcado" },
  { id: "estavel", title: "Estável / Check-up", hint: "Acompanhamento sem queixa" },
];

export const CONVENIOS = [
  "Particular",
  "Unimed",
  "Bradesco Saúde",
  "SulAmérica",
  "Amil",
  "Hapvida",
  "NotreDame Intermédica",
] as const;

export type Patient = {
  id: string;
  doctorId: string;
  /** Código único dentro do namespace do médico. Formato: "LFL-XXXX" (base-36 maiúsculo). */
  patientCode: string;
  nome: string;
  nascimento: string | null; // ISO date (yyyy-mm-dd)
  sexo: "feminino" | "masculino" | "outro" | null;
  cpf: string | null;
  telefone: string | null;
  email: string | null;
  convenio: string | null; // "Particular", "Unimed", … (livre)
  queixa: string;
  column: ClinicColumn;
  criticalFlag: string | null;
  adherence: number | null;
  briefing: string | null;
  examsCount: number;
  tint: string;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
};

export type AppointmentStatus = "agendada" | "confirmada" | "realizada" | "faltou";

export type Appointment = {
  id: string;
  doctorId: string;
  patientId: string;
  dateTime: string; // ISO
  status: AppointmentStatus;
  note: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Charge = {
  id: string;
  doctorId: string;
  patientId: string;
  descricao: string;
  valor: number; // em reais
  vencimento: string; // yyyy-mm-dd
  status: "pendente" | "pago";
  pagoEm: string | null;
  createdAt: string;
};

// Resultado de exame (biomarcador) — a matéria-prima da linha do tempo
// clínica e dos gráficos de evolução por anos.
export type Measurement = {
  id: string;
  doctorId: string;
  patientId: string;
  name: string; // "Hemoglobina"
  unit: string; // "g/dL"
  value: number;
  refMin: number;
  refMax: number;
  date: string; // yyyy-mm-dd (data da coleta)
  label: string; // "Check-up de rotina", "Exames via WhatsApp"…
  createdAt: string;
};

export const BIOMARKER_CATALOG = [
  { name: "Hemoglobina", unit: "g/dL", min: 12, max: 16, synonyms: ["Hb", "HGB", "Hemoglobina Total"] },
  { name: "Ferritina", unit: "ng/mL", min: 30, max: 200, synonyms: ["Ferritina Sérica"] },
  { name: "Vitamina D", unit: "ng/mL", min: 30, max: 100, synonyms: ["25-OH Vitamina D", "Vitamina D Total", "25-Hidroxivitamina D", "25 OH Vitamina D"] },
  { name: "Vitamina B12", unit: "pg/mL", min: 300, max: 900, synonyms: ["Cobalamina", "Vit B12", "Vitamina B-12, Dosagem"] },
  { name: "Zinco", unit: "µg/dL", min: 70, max: 120, synonyms: ["Zinco Sérico"] },
  { name: "Creatinina", unit: "mg/dL", min: 0.5, max: 1.1, synonyms: ["Cr", "Creatinina Sérica"] },
  { name: "Glicemia de jejum", unit: "mg/dL", min: 70, max: 99, synonyms: ["Glicose", "Glicemia"] },
  { name: "HbA1c", unit: "%", min: 4, max: 5.6, synonyms: ["Hemoglobina Glicada", "A1c", "Hemoglobina Glicada - HbA1c"] },
  { name: "Colesterol total", unit: "mg/dL", min: 100, max: 190, synonyms: ["Colesterol"] },
  { name: "TSH", unit: "µUI/mL", min: 0.4, max: 4, synonyms: ["Hormônio Tireoestimulante", "Hormônio Tireoestimulante Ultrassensível (TSH)", "Hormônio Tireoestimulante Ultrassensível"] },
  { name: "Eritrócitos", unit: "10^6/µL", min: 4.5, max: 5.5, synonyms: ["Eritrócitos", "Hemácias"] },
  { name: "Hematócrito", unit: "%", min: 40, max: 50, synonyms: ["Hematócrito", "Ht", "HT"] },
  { name: "VCM", unit: "fL", min: 83, max: 101, synonyms: ["VCM", "MCV"] },
  { name: "HCM", unit: "pg", min: 27, max: 32, synonyms: ["HCM", "MCH"] },
  { name: "CHCM", unit: "g/dL", min: 31, max: 35, synonyms: ["CHCM", "MCHC"] },
  { name: "RDW", unit: "%", min: 11.6, max: 14, synonyms: ["RDW"] },
  { name: "Leucócitos", unit: "/µL", min: 4000, max: 10000, synonyms: ["Leucócitos", "WBC"] },
  { name: "Neutrófilos", unit: "/µL", min: 1800, max: 7800, synonyms: ["Neutrófilos"] },
  { name: "Eosinófilos", unit: "/µL", min: 20, max: 500, synonyms: ["Eosinófilos"] },
  { name: "Basófilos", unit: "/µL", min: 20, max: 100, synonyms: ["Basófilos"] },
  { name: "Linfócitos", unit: "/µL", min: 1000, max: 3000, synonyms: ["Linfócitos"] },
  { name: "Monócitos", unit: "/µL", min: 200, max: 1000, synonyms: ["Monócitos"] },
  { name: "Plaquetas", unit: "/µL", min: 150000, max: 450000, synonyms: ["Contagem de Plaquetas", "Plaquetas", "PLT"] },
  { name: "VPM", unit: "fL", min: 8.3, max: 12.5, synonyms: ["VPM", "MPV"] },
  { name: "Ferro", unit: "µg/dL", min: 65, max: 175, synonyms: ["Ferro", "Ferro Sérico"] },
  { name: "Ureia", unit: "mg/dL", min: 19, max: 49, synonyms: ["Uréia", "Ureia"] },
  { name: "eGFR", unit: "mL/min/1.73m²", min: 90, max: 200, synonyms: ["eGFR", "Taxa de Filtração Glomerular"] },
  { name: "Potássio", unit: "mmol/L", min: 3.5, max: 5.1, synonyms: ["Potássio", "K+"] },
  { name: "Sódio", unit: "mmol/L", min: 136, max: 145, synonyms: ["Sódio", "Na+"] },
  { name: "Magnésio", unit: "mg/dL", min: 1.6, max: 2.6, synonyms: ["Magnésio", "Mg"] },
  { name: "Cálcio", unit: "mg/dL", min: 8.3, max: 10.6, synonyms: ["Cálcio", "Ca"] },
  { name: "Cálcio Ionizado", unit: "mmol/L", min: 1.05, max: 1.3, synonyms: ["Calcio Ionizado", "Cálcio Iônico"] },
  { name: "Insulina", unit: "µUI/mL", min: 2.5, max: 13.1, synonyms: ["Insulina"] },
  { name: "HOMA-IR", unit: "", min: 0, max: 2.7, synonyms: ["HOMA-IR", "Índice HOMA"] },
  { name: "Triglicérides", unit: "mg/dL", min: 0, max: 150, synonyms: ["Triglicérides", "Triglicerídeos"] },
  { name: "HDL Colesterol", unit: "mg/dL", min: 40, max: 100, synonyms: ["HDL - Colesterol", "HDL"] },
  { name: "LDL Colesterol", unit: "mg/dL", min: 0, max: 130, synonyms: ["LDL - Colesterol (calculado)", "LDL"] },
  { name: "VLDL Colesterol", unit: "mg/dL", min: 5, max: 40, synonyms: ["VLDL - Colesterol", "VLDL"] },
  { name: "Não-HDL Colesterol", unit: "mg/dL", min: 0, max: 160, synonyms: ["Não HDL - Colesterol", "Não-HDL"] },
  { name: "Ácido Úrico", unit: "mg/dL", min: 3.8, max: 8.6, synonyms: ["Ácido Úrico"] },
  { name: "TGO", unit: "U/L", min: 0, max: 34, synonyms: ["Transaminase oxalacética - TGO", "TGO", "AST"] },
  { name: "TGP", unit: "U/L", min: 10, max: 49, synonyms: ["Transaminase pirúvica - TGP", "TGP", "ALT"] },
  { name: "Gama-GT", unit: "U/L", min: 0, max: 73, synonyms: ["Gama-Glutamil Transferase", "Gama GT", "GGT"] },
  { name: "Fosfatase Alcalina", unit: "U/L", min: 46, max: 116, synonyms: ["Fosfatase Alcalina"] },
  { name: "T3 Livre", unit: "pg/mL", min: 2.3, max: 4.2, synonyms: ["T3 Livre (Triiodotironina Livre)", "T3 Livre"] },
  { name: "T4 Livre", unit: "ng/dL", min: 0.89, max: 1.76, synonyms: ["Tiroxina Livre (T4 Livre)", "T4 Livre"] },
  { name: "Testosterona Total", unit: "ng/dL", min: 164.94, max: 753.38, synonyms: ["Testosterona Total"] },
  { name: "SHBG", unit: "nmol/L", min: 10, max: 57, synonyms: ["SHBG (Globulina Transportadora de Hormônios Sexuais)", "SHBG"] },
  { name: "Testosterona Livre Calculada", unit: "ng/dL", min: 3.4, max: 24.6, synonyms: ["Testosterona Livre Calculada"] },
  { name: "Testosterona Biodisponível", unit: "ng/dL", min: 82, max: 626, synonyms: ["Testosterona Biodisponível"] },
  { name: "PSA Total", unit: "ng/mL", min: 0, max: 4, synonyms: ["PSA Total"] },
  { name: "PSA Livre", unit: "ng/mL", min: 0, max: 1, synonyms: ["PSA Livre"] },
] as const;

export function resolveBiomarkerName(rawName: string): (typeof BIOMARKER_CATALOG)[number] | null {
  const normalized = rawName.trim().toLowerCase();
  for (const b of BIOMARKER_CATALOG) {
    if (b.name.toLowerCase() === normalized) return b;
    if ((b.synonyms as readonly string[]).some((s) => s.toLowerCase() === normalized)) return b;
  }
  return null;
}

// Catálogo de medicamentos e template de anamnese — apoiam a UI de
// prescrição estilo Memed e o toggle de template da Evolução Atual.
// MED_CATALOG é mock local; troque pela busca real do Memed quando a
// integração acontecer (a estrutura de dados já é compatível).
export const MED_CATALOG: { name: string; dosage: string; duration: string }[] = [
  { name: "Sulfato Ferroso 40mg", dosage: "1 comprimido, 2x/dia, em jejum", duration: "90 dias" },
  { name: "Vitamina B12 1000mcg", dosage: "1 comprimido, 1x/dia", duration: "60 dias" },
  { name: "Ácido Fólico 5mg", dosage: "1 comprimido, 1x/dia", duration: "60 dias" },
  { name: "Colecalciferol 50.000UI", dosage: "1 comprimido, 1x/semana", duration: "8 semanas" },
  { name: "Metformina 850mg", dosage: "1 comprimido, 2x/dia, após refeições", duration: "Uso contínuo" },
  { name: "Losartana 50mg", dosage: "1 comprimido, 1x/dia", duration: "Uso contínuo" },
];

export const ANAMNESE_TEMPLATE = `QUEIXA PRINCIPAL:

HISTÓRIA DA DOENÇA ATUAL:

ANTECEDENTES PESSOAIS E FAMILIARES:

HÁBITOS DE VIDA:

REVISÃO DE SISTEMAS:

EXAME FÍSICO:

AVALIAÇÃO:

PLANO:`;

export function isOutOfRange(m: Pick<Measurement, "value" | "refMin" | "refMax">): boolean {
  return m.value < m.refMin || m.value > m.refMax;
}

/** Status de um evento de exame pela quantidade de valores fora da faixa. */
export function examStatus(ms: Measurement[]): "Saudável" | "Atenção" | "Alerta" {
  const out = ms.filter(isOutOfRange).length;
  if (out === 0) return "Saudável";
  if (out === 1) return "Atenção";
  return "Alerta";
}

export type Soap = {
  s: string;
  o: string;
  /** Avaliação: `compartilhavel` entra no resumo/timeline; `notaPrivada` é
   *  anotação pessoal do médico, editada à parte — nunca derivada do texto. */
  a: { compartilhavel: string; notaPrivada: string };
  p: string;
};

export type PrescriptionMed = { name: string; dosage: string; duration: string };

export type Evolution = {
  id: string;
  doctorId: string;
  patientId: string;
  evolucao: string;
  /** Conduta/tratamento — campo próprio, separado do texto livre da Evolução. */
  planoTerapeutico: string;
  soap: Soap;
  sealed: { protocol: string; signature: string; sealedAt: string } | null;
  prescription: { code: string; meds: PrescriptionMed[]; url: string; createdAt: string } | null;
  createdAt: string;
  updatedAt: string;
};

// ---------------------------------------------------------------------------
// Helpers puros
// ---------------------------------------------------------------------------

export function initialsOf(nome: string): string {
  return nome
    .replace(/^(dra?\.?\s+)/i, "")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

export function ageFrom(nascimento: string | null): number | null {
  if (!nascimento) return null;
  const d = new Date(`${nascimento}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age >= 0 && age < 130 ? age : null;
}

export function formatDateBR(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
}

export function formatDateTimeBR(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })} · ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
}

export function formatHourBR(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export function formatBRL(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** yyyy-mm-dd local de hoje (não UTC). */
export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function isSameLocalDay(iso: string, ymd: string): boolean {
  const d = new Date(iso);
  const local = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return local === ymd;
}

export type DayPeriod = "manha" | "tarde" | "noite";

export function periodOf(iso: string): DayPeriod {
  const h = new Date(iso).getHours();
  if (h < 12) return "manha";
  if (h < 18) return "tarde";
  return "noite";
}

export const PERIOD_LABEL: Record<DayPeriod, string> = {
  manha: "Manhã",
  tarde: "Tarde",
  noite: "Noite",
};

/** Cobrança em atraso = pendente com vencimento antes de hoje. */
export function isOverdue(c: Charge): boolean {
  return c.status === "pendente" && c.vencimento < todayIso();
}

/** Link wa.me com telefone BR normalizado + mensagem pronta. */
export function waLink(telefone: string, text: string): string {
  let digits = telefone.replace(/\D/g, "");
  if (digits.length === 10 || digits.length === 11) digits = `55${digits}`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

export const WA_TEMPLATES = {
  confirmar: (paciente: string, hora: string, medico: string) =>
    `Olá, ${paciente.split(" ")[0]}! Confirmando sua consulta hoje às ${hora}. Qualquer imprevisto, me avise por aqui. — ${medico}`,
  cobrar: (paciente: string, valor: string, venc: string, medico: string) =>
    `Olá, ${paciente.split(" ")[0]}! Tudo bem? Passando para lembrar do pagamento de ${valor} com vencimento em ${venc}. Qualquer dúvida estou à disposição. — ${medico}`,
  reengajar: (paciente: string, medico: string) =>
    `Olá, ${paciente.split(" ")[0]}! Sentimos sua falta na última consulta. Vamos remarcar? Me diga o melhor dia e horário para você. — ${medico}`,
  livre: (paciente: string, medico: string) =>
    `Olá, ${paciente.split(" ")[0]}! Aqui é do consultório — ${medico}.`,
};
