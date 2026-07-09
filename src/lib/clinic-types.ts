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

export type Soap = { s: string; o: string; a: string; p: string };

export type Evolution = {
  id: string;
  doctorId: string;
  patientId: string;
  evolucao: string;
  soap: Soap;
  sealed: { protocol: string; signature: string; sealedAt: string } | null;
  prescription: { code: string; meds: string[]; url: string; createdAt: string } | null;
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
