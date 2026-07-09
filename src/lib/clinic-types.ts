// Tipos e helpers puros da clínica, compartilhados entre cliente e servidor.
// Sem nada de runtime de servidor aqui — este módulo pode ir pro bundle.

export type ClinicColumn = "triagem" | "atendimento" | "aguardando" | "retorno" | "estavel";

export const CLINIC_COLUMNS: { id: ClinicColumn; title: string; hint: string }[] = [
  { id: "triagem", title: "Triagem / Pré-Consulta", hint: "Aguardando atendimento" },
  { id: "atendimento", title: "Em Atendimento", hint: "Consulta em andamento" },
  { id: "aguardando", title: "Aguardando Exames", hint: "Solicitações enviadas" },
  { id: "retorno", title: "Retorno Agendado", hint: "Exames recebidos · retorno marcado" },
  { id: "estavel", title: "Estável / Check-up", hint: "Acompanhamento sem queixa" },
];

export type Patient = {
  id: string;
  doctorId: string;
  nome: string;
  nascimento: string | null; // ISO date (yyyy-mm-dd)
  sexo: "feminino" | "masculino" | "outro" | null;
  cpf: string | null;
  telefone: string | null;
  email: string | null;
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
