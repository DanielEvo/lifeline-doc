// Tipos e helpers puros da clínica, compartilhados entre cliente e servidor.
// Sem nada de runtime de servidor aqui — este módulo pode ir pro bundle.

// Colunas do kanban são PERSONALIZÁVEIS por médico (boards.json). Estas são
// as colunas padrão de um consultório novo; `column` no paciente é o id.
export type ClinicColumn = string;

export type BoardColumn = { id: string; title: string; hint: string };

export const DEFAULT_COLUMNS: BoardColumn[] = [
  { id: "triagem", title: "Triagem / Pré-Consulta", hint: "Aguardando atendimento" },
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
  /** Vínculo com a identidade global do paciente (BKL-37) — null até o médico
   *  vincular via LifeLine ID ou busca. Uma vez setado, nunca é trocado
   *  (linkPatientToGlobalId só grava se ainda for null). */
  globalId: string | null;
  nome: string;
  nascimento: string | null; // ISO date (yyyy-mm-dd)
  sexo: "feminino" | "masculino" | "outro" | null;
  cpf: string | null;
  telefone: string | null;
  email: string | null;
  // E-mail é a credencial de login do paciente — trocar exige a confirmação
  // dele (link de uso único), nunca o médico sozinho. Telefone não tem essa
  // trava: é livremente editável (baixo risco, alta frequência de correção
  // operacional). Ver runPatientIntake / requestEmailChange.
  pendingEmail: string | null;
  pendingEmailToken: string | null;
  pendingEmailRequestedAt: string | null;
  convenio: string | null; // "Particular", "Unimed", … (livre)
  queixa: string;
  column: ClinicColumn;
  criticalFlag: string | null;
  adherence: number | null;
  briefing: string | null;
  examsCount: number;
  tint: string;
  archived: boolean;
  // Antecedentes pessoais — conjunto mínimo inspirado na estrutura de
  // anamnese esperada pela Resolução CFM 1.821/2007 (prontuário eletrônico)
  // e pelo Manual de Certificação SBIS-CFM. Editável pelo médico; badges no
  // cabeçalho do prontuário (ver pacientes.$id.tsx).
  tipoSanguineo: string | null; // "O+", "A-", … — ver TIPOS_SANGUINEOS
  tabagismo: Tabagismo | null;
  etilismo: Etilismo | null;
  comorbidades: string[]; // subconjunto de COMORBIDADES_CATALOGO (+ livres)
  alergias: string | null;
  medicacaoContinua: string | null;
  pesoKg: number | null;
  alturaCm: number | null;
  // Anotações do médico sobre o paciente — nunca visível ao paciente. Não é
  // "privado"/"confidencial" no sentido de imune a requisição judicial: é só
  // um registro médico comum que não entra no app do paciente (ver §6.3 PRD).
  notasMedicas: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Tabagismo = "nunca" | "ex_fumante" | "fumante";
export type Etilismo = "nunca" | "ex_etilista" | "etilista";

export const TABAGISMO_LABEL: Record<Tabagismo, string> = {
  nunca: "Nunca fumou",
  ex_fumante: "Ex-fumante",
  fumante: "Fumante",
};

export const ETILISMO_LABEL: Record<Etilismo, string> = {
  nunca: "Não bebe",
  ex_etilista: "Ex-etilista",
  etilista: "Etilista",
};

export const TIPOS_SANGUINEOS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"] as const;

export const COMORBIDADES_CATALOGO = [
  "Diabetes",
  "Hipertensão",
  "Doença cardíaca",
  "Doença renal",
  "Asma / DPOC",
  "Obesidade",
  "Hipotireoidismo",
  "Depressão / Ansiedade",
] as const;

/** IMC a partir de peso(kg)/altura(cm) — null se faltar qualquer dado. */
export function calcImc(pesoKg: number | null, alturaCm: number | null): number | null {
  if (!pesoKg || !alturaCm) return null;
  const alturaM = alturaCm / 100;
  return Math.round((pesoKg / (alturaM * alturaM)) * 10) / 10;
}

export type AppointmentStatus = "agendada" | "confirmada" | "realizada" | "faltou";

export type Appointment = {
  id: string;
  doctorId: string;
  // null só quando kind === "bloqueio" (horário travado, sem paciente).
  patientId: string | null;
  dateTime: string; // ISO — início
  // Duração em minutos — null só quando allDay=true. Ausente em dados
  // antigos = 30 (normalizado em listAppointments, não migra o arquivo).
  durationMin: number | null;
  // Dia inteiro — só faz sentido pra kind "bloqueio" (evento pessoal);
  // consulta nunca é dia inteiro.
  allDay: boolean;
  status: AppointmentStatus;
  note: string | null; // só consulta
  kind: "consulta" | "bloqueio"; // ausente em dados antigos = "consulta"
  label: string | null; // título — motivo do bloqueio (ex.: "Almoço") ou nome do evento pessoal
  // Campos abaixo só se aplicam a kind === "bloqueio" (evento pessoal):
  categoriaId: string | null; // referência pro filtro da sidebar — nunca a fonte da cor
  cor: string | null; // hex resolvido no momento da criação, sobrescrevível — snapshot, não muda se a categoria mudar/for desativada depois
  descricao: string | null;
  local: string | null;
  recurrenceId: string | null; // agrupa eventos gerados na mesma série (consulta ou bloqueio)
  // Minutos antes do início pra lembrar (ex.: [10, 60] = 10min e 1h antes).
  // Disparo é só client-side (toast) enquanto o app está aberto — sem push/e-mail.
  lembretesMin: number[];
  createdAt: string;
  updatedAt: string;
};

export type RecurrenceScope = "this" | "following" | "all";

/** Narrowing helper — todo consumidor que assume patientId presente deve
 *  filtrar por isso antes de usar (ex.: listas de "hoje"/"faltas" por paciente). */
export function isConsultaAppointment(a: Appointment): a is Appointment & { patientId: string } {
  return a.kind !== "bloqueio";
}

export type RecurrenceFreq = "none" | "daily" | "weekly" | "monthly";

// Configuração da agenda (duração do slot, expediente) — antes só em
// localStorage por token, agora persistida por médico (Doctor.calendarSettings).
export type CalendarSettings = {
  slotMinutes: 15 | 20 | 30 | 45 | 60;
  startHour: number; // 0-23
  endHour: number; // 1-24
  // Quantas consultas (kind="consulta") podem se sobrepor no mesmo horário
  // antes do servidor recusar o agendamento (BUG-3) — bloqueio não conta.
  maxParallel: 1 | 2 | 3;
};

export const DEFAULT_CALENDAR_SETTINGS: CalendarSettings = {
  slotMinutes: 30,
  startHour: 8,
  endHour: 19,
  maxParallel: 1,
};

// Categoria/cor de eventos pessoais (agenda, PRO-XX) — nunca se aplica a
// consultas, que mantêm a cor própria do paciente (Patient.tint).
export type EventCategory = {
  id: string;
  doctorId: string;
  nome: string;
  cor: string; // hex
  ativo: boolean;
  createdAt: string;
  updatedAt: string;
};

// Swatches sugeridos no color picker de categoria/evento pessoal (paleta
// inspirada no Material Design) — não são categorias pré-semeadas, só
// opções rápidas de cor.
export const EVENT_COLOR_SWATCHES = [
  "#039be5", // Turquesa
  "#33b679", // Verde Menta
  "#f6bf26", // Amarelo
  "#f4511e", // Laranja
  "#8e24aa", // Roxo
  "#e67c73", // Rosa
] as const;

// Presets de lembrete (minutos antes) oferecidos no editor de evento — mesmo
// menu do Google Agenda, sem o "no dia às" (não temos horário fixo de lembrete diário).
export const REMINDER_PRESETS: { minutes: number; label: string }[] = [
  { minutes: 10, label: "10 minutos antes" },
  { minutes: 30, label: "30 minutos antes" },
  { minutes: 60, label: "1 hora antes" },
  { minutes: 24 * 60, label: "1 dia antes" },
  { minutes: 2 * 24 * 60, label: "2 dias antes" },
];

// Mapeia os 5 gradientes de Patient.tint (patients.server.ts) pra um hex
// representativo (stop "from-") — usado pra renderizar blocos de consulta
// no mesmo estilo fundo-suave+borda-esquerda dos eventos pessoais.
export const TINT_TO_HEX: Record<string, string> = {
  "from-rose-400 to-pink-500": "#fb7185",
  "from-cyan-400 to-teal-500": "#22d3ee",
  "from-amber-400 to-orange-500": "#fbbf24",
  "from-emerald-400 to-teal-500": "#34d399",
  "from-violet-400 to-indigo-500": "#a78bfa",
};

// Catálogo de produtos/serviços do consultório — alimenta os chips de
// "serviços aplicados" na Evolução (ver Evolution.servicosAplicados).
export type Service = {
  id: string;
  doctorId: string;
  nome: string;
  descricao: string | null;
  preco: number;
  duracaoMin: number | null;
  ativo: boolean;
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
  paymentUrl?: string | null; // link de checkout real (Stripe), quando gerado
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
  motivo?: string | null; // razão clínica da solicitação (ex.: "investigar fadiga")
  createdAt: string;
};

// loincCode curado manualmente contra loinc_pt_br_filtered.json — cada um
// verificado por jq/busca direta no arquivo antes de gravar (ver
// HANDOVER_LOINC_v3_Pendencias.md para os que ficaram null e por quê).
export const BIOMARKER_CATALOG = [
  {
    name: "Hemoglobina",
    unit: "g/dL",
    min: 12,
    max: 16,
    synonyms: ["Hb", "HGB", "Hemoglobina Total"],
    loincCode: "718-7",
  },
  {
    name: "Ferritina",
    unit: "ng/mL",
    min: 30,
    max: 200,
    synonyms: ["Ferritina Sérica"],
    loincCode: "2276-4",
  },
  {
    name: "Vitamina D",
    unit: "ng/mL",
    min: 30,
    max: 100,
    synonyms: ["25-OH Vitamina D", "Vitamina D Total", "25-Hidroxivitamina D", "25 OH Vitamina D"],
    loincCode: "1989-3",
  },
  {
    name: "Vitamina B12",
    unit: "pg/mL",
    min: 300,
    max: 900,
    synonyms: ["Cobalamina", "Vit B12", "Vitamina B-12, Dosagem"],
    loincCode: "2132-9",
  },
  { name: "Zinco", unit: "µg/dL", min: 70, max: 120, synonyms: ["Zinco Sérico"], loincCode: null },
  {
    name: "Creatinina",
    unit: "mg/dL",
    min: 0.5,
    max: 1.1,
    synonyms: ["Cr", "Creatinina Sérica"],
    loincCode: "2160-0",
  },
  {
    name: "Glicemia de jejum",
    unit: "mg/dL",
    min: 70,
    max: 99,
    synonyms: ["Glicose", "Glicemia"],
    loincCode: null,
  },
  {
    name: "HbA1c",
    unit: "%",
    min: 4,
    max: 5.6,
    synonyms: ["Hemoglobina Glicada", "A1c", "Hemoglobina Glicada - HbA1c"],
    loincCode: "4548-4",
  },
  {
    name: "Colesterol total",
    unit: "mg/dL",
    min: 100,
    max: 190,
    synonyms: ["Colesterol"],
    loincCode: "2093-3",
  },
  {
    name: "TSH",
    unit: "µUI/mL",
    min: 0.4,
    max: 4,
    synonyms: [
      "Hormônio Tireoestimulante",
      "Hormônio Tireoestimulante Ultrassensível (TSH)",
      "Hormônio Tireoestimulante Ultrassensível",
    ],
    loincCode: "3016-3",
  },
  {
    name: "Eritrócitos",
    unit: "10^6/µL",
    min: 4.5,
    max: 5.5,
    synonyms: ["Eritrócitos", "Hemácias"],
    loincCode: "789-8",
  },
  {
    name: "Hematócrito",
    unit: "%",
    min: 40,
    max: 50,
    synonyms: ["Hematócrito", "Ht", "HT"],
    loincCode: "4544-3",
  },
  { name: "VCM", unit: "fL", min: 83, max: 101, synonyms: ["VCM", "MCV"], loincCode: "787-2" },
  { name: "HCM", unit: "pg", min: 27, max: 32, synonyms: ["HCM", "MCH"], loincCode: "785-6" },
  { name: "CHCM", unit: "g/dL", min: 31, max: 35, synonyms: ["CHCM", "MCHC"], loincCode: "786-4" },
  { name: "RDW", unit: "%", min: 11.6, max: 14, synonyms: ["RDW"], loincCode: "788-0" },
  {
    name: "Leucócitos",
    unit: "/µL",
    min: 4000,
    max: 10000,
    synonyms: ["Leucócitos", "WBC"],
    loincCode: "6690-2",
  },
  {
    name: "Neutrófilos",
    unit: "/µL",
    min: 1800,
    max: 7800,
    synonyms: ["Neutrófilos"],
    loincCode: "751-8",
  },
  {
    name: "Eosinófilos",
    unit: "/µL",
    min: 20,
    max: 500,
    synonyms: ["Eosinófilos"],
    loincCode: "711-2",
  },
  {
    name: "Basófilos",
    unit: "/µL",
    min: 20,
    max: 100,
    synonyms: ["Basófilos"],
    loincCode: "704-7",
  },
  {
    name: "Linfócitos",
    unit: "/µL",
    min: 1000,
    max: 3000,
    synonyms: ["Linfócitos"],
    loincCode: "731-0",
  },
  {
    name: "Monócitos",
    unit: "/µL",
    min: 200,
    max: 1000,
    synonyms: ["Monócitos"],
    loincCode: "742-7",
  },
  {
    name: "Plaquetas",
    unit: "/µL",
    min: 150000,
    max: 450000,
    synonyms: ["Contagem de Plaquetas", "Plaquetas", "PLT"],
    loincCode: "777-3",
  },
  { name: "VPM", unit: "fL", min: 8.3, max: 12.5, synonyms: ["VPM", "MPV"], loincCode: "32623-1" },
  {
    name: "Ferro",
    unit: "µg/dL",
    min: 65,
    max: 175,
    synonyms: ["Ferro", "Ferro Sérico"],
    loincCode: "2498-4",
  },
  {
    name: "Ureia",
    unit: "mg/dL",
    min: 19,
    max: 49,
    synonyms: ["Uréia", "Ureia"],
    loincCode: "3094-0",
  },
  {
    name: "eGFR",
    unit: "mL/min/1.73m²",
    min: 90,
    max: 200,
    synonyms: ["eGFR", "Taxa de Filtração Glomerular"],
    loincCode: null,
  },
  {
    name: "Potássio",
    unit: "mmol/L",
    min: 3.5,
    max: 5.1,
    synonyms: ["Potássio", "K+"],
    loincCode: "2823-3",
  },
  {
    name: "Sódio",
    unit: "mmol/L",
    min: 136,
    max: 145,
    synonyms: ["Sódio", "Na+"],
    loincCode: "2951-2",
  },
  {
    name: "Magnésio",
    unit: "mg/dL",
    min: 1.6,
    max: 2.6,
    synonyms: ["Magnésio", "Mg"],
    loincCode: "2601-3",
  },
  {
    name: "Cálcio",
    unit: "mg/dL",
    min: 8.3,
    max: 10.6,
    synonyms: ["Cálcio", "Ca"],
    loincCode: "17861-6",
  },
  {
    name: "Cálcio Ionizado",
    unit: "mmol/L",
    min: 1.05,
    max: 1.3,
    synonyms: ["Calcio Ionizado", "Cálcio Iônico"],
    loincCode: "1994-3",
  },
  {
    name: "Insulina",
    unit: "µUI/mL",
    min: 2.5,
    max: 13.1,
    synonyms: ["Insulina"],
    loincCode: "20448-7",
  },
  {
    name: "HOMA-IR",
    unit: "",
    min: 0,
    max: 2.7,
    synonyms: ["HOMA-IR", "Índice HOMA"],
    loincCode: null,
  },
  {
    name: "Triglicérides",
    unit: "mg/dL",
    min: 0,
    max: 150,
    synonyms: ["Triglicérides", "Triglicerídeos"],
    loincCode: "2571-8",
  },
  {
    name: "HDL Colesterol",
    unit: "mg/dL",
    min: 40,
    max: 100,
    synonyms: ["HDL - Colesterol", "HDL"],
    loincCode: "2085-9",
  },
  {
    name: "LDL Colesterol",
    unit: "mg/dL",
    min: 0,
    max: 130,
    synonyms: ["LDL - Colesterol (calculado)", "LDL"],
    loincCode: "13457-7",
  },
  {
    name: "VLDL Colesterol",
    unit: "mg/dL",
    min: 5,
    max: 40,
    synonyms: ["VLDL - Colesterol", "VLDL"],
    loincCode: "13458-5",
  },
  {
    name: "Não-HDL Colesterol",
    unit: "mg/dL",
    min: 0,
    max: 160,
    synonyms: ["Não HDL - Colesterol", "Não-HDL"],
    loincCode: null,
  },
  {
    name: "Ácido Úrico",
    unit: "mg/dL",
    min: 3.8,
    max: 8.6,
    synonyms: ["Ácido Úrico"],
    loincCode: "3084-1",
  },
  {
    name: "TGO",
    unit: "U/L",
    min: 0,
    max: 34,
    synonyms: ["Transaminase oxalacética - TGO", "TGO", "AST"],
    loincCode: "1920-8",
  },
  {
    name: "TGP",
    unit: "U/L",
    min: 10,
    max: 49,
    synonyms: ["Transaminase pirúvica - TGP", "TGP", "ALT"],
    loincCode: "1742-6",
  },
  {
    name: "Gama-GT",
    unit: "U/L",
    min: 0,
    max: 73,
    synonyms: ["Gama-Glutamil Transferase", "Gama GT", "GGT"],
    loincCode: "2324-2",
  },
  {
    name: "Fosfatase Alcalina",
    unit: "U/L",
    min: 46,
    max: 116,
    synonyms: ["Fosfatase Alcalina"],
    loincCode: "6768-6",
  },
  {
    name: "T3 Livre",
    unit: "pg/mL",
    min: 2.3,
    max: 4.2,
    synonyms: ["T3 Livre (Triiodotironina Livre)", "T3 Livre"],
    loincCode: null,
  },
  {
    name: "T4 Livre",
    unit: "ng/dL",
    min: 0.89,
    max: 1.76,
    synonyms: ["Tiroxina Livre (T4 Livre)", "T4 Livre"],
    loincCode: "3024-7",
  },
  {
    name: "Testosterona Total",
    unit: "ng/dL",
    min: 164.94,
    max: 753.38,
    synonyms: ["Testosterona Total"],
    loincCode: "2986-8",
  },
  {
    name: "SHBG",
    unit: "nmol/L",
    min: 10,
    max: 57,
    synonyms: ["SHBG (Globulina Transportadora de Hormônios Sexuais)", "SHBG"],
    loincCode: null,
  },
  {
    name: "Testosterona Livre Calculada",
    unit: "ng/dL",
    min: 3.4,
    max: 24.6,
    synonyms: ["Testosterona Livre Calculada"],
    loincCode: null,
  },
  {
    name: "Testosterona Biodisponível",
    unit: "ng/dL",
    min: 82,
    max: 626,
    synonyms: ["Testosterona Biodisponível"],
    loincCode: null,
  },
  {
    name: "PSA Total",
    unit: "ng/mL",
    min: 0,
    max: 4,
    synonyms: ["PSA Total"],
    loincCode: "2857-1",
  },
  {
    name: "PSA Livre",
    unit: "ng/mL",
    min: 0,
    max: 1,
    synonyms: ["PSA Livre"],
    loincCode: "10886-0",
  },
  // Faixa ampla (não é referência clínica real — peso não tem "normal" sem
  // altura/IMC) só pra não disparar falso alerta de fora-da-faixa.
  {
    name: "Peso",
    unit: "kg",
    min: 30,
    max: 200,
    synonyms: ["Peso corporal", "Peso Corporal"],
    loincCode: null,
  },
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
  {
    name: "Metformina 850mg",
    dosage: "1 comprimido, 2x/dia, após refeições",
    duration: "Uso contínuo",
  },
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

// Template padrão da Evolução Atual — ativo por default (zero tela em
// branco), sem forçar anamnese completa numa 1ª consulta.
export const TEMPLATE_PADRAO = "QUEIXA:\n\nAVALIAÇÃO:\n\nCONDUTA:\n\n";
export const TEMPLATE_PADRAO_SECOES = ["QUEIXA", "AVALIAÇÃO", "CONDUTA"];

/** Extrai os cabeçalhos de seção (linha em MAIÚSCULAS terminando em ":") de
 *  um template ou texto de evolução — mesmo padrão de extração usado em
 *  HistoricoConsultaContent (pacientes.$id.tsx). */
export function parseTemplateSections(conteudo: string): string[] {
  return [...conteudo.matchAll(/^([A-ZÀ-Ú][A-ZÀ-Ú\s]{1,40}):\s*$/gm)].map((m) => m[1].trim());
}

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
  prescription: {
    code: string;
    meds: PrescriptionMed[];
    url: string;
    createdAt: string;
    /** Preenchido quando a Memed emite o evento prescricaoExcluida. */
    canceledAt?: string | null;
  } | null;
  // Snapshot de nome/preço no momento do registro — se o serviço mudar ou for
  // desativado depois, a evolução já salva não muda (mesma lógica do selo).
  servicosAplicados: { serviceId: string; nome: string; preco: number }[];
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
  cobrar: (
    paciente: string,
    valor: string,
    venc: string,
    medico: string,
    paymentUrl?: string | null,
  ) =>
    `Olá, ${paciente.split(" ")[0]}! Tudo bem? Passando para lembrar do pagamento de ${valor} com vencimento em ${venc}.${paymentUrl ? ` Link para pagar: ${paymentUrl}` : ""} Qualquer dúvida estou à disposição. — ${medico}`,
  reengajar: (paciente: string, medico: string) =>
    `Olá, ${paciente.split(" ")[0]}! Sentimos sua falta na última consulta. Vamos remarcar? Me diga o melhor dia e horário para você. — ${medico}`,
  livre: (paciente: string, medico: string) =>
    `Olá, ${paciente.split(" ")[0]}! Aqui é do consultório — ${medico}.`,
  confirmarEmail: (paciente: string, link: string, medico: string) =>
    `Olá, ${paciente.split(" ")[0]}! Pedi para atualizar seu e-mail no cadastro do consultório. Só confirme se foi você mesmo quem pediu: ${link} — ${medico}`,
  pedirAtualizacaoCadastro: (paciente: string, medico: string) =>
    `Olá, ${paciente.split(" ")[0]}! Tipo sanguíneo, alergias, peso e altura no seu cadastro agora são atualizados por você direto no app LifeLine — se algo mudou, é só editar por lá. — ${medico}`,
};
