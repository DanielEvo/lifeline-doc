// Server-only patient registry — the real data behind the doctor workspace.
// Every row is scoped by doctorId; queries NEVER cross doctors. Columns match
// Daniel's 5-column clinical pipeline so the board reads the same way the
// demo taught users to read it.

import { mutateRows, newId, nowIso, readRows } from "./db.server";
import type { ClinicColumn, Patient } from "./clinic-types";

export type { ClinicColumn, Patient } from "./clinic-types";

const FILE = "patients.json";

const TINTS = [
  "from-rose-400 to-pink-500",
  "from-cyan-400 to-teal-500",
  "from-amber-400 to-orange-500",
  "from-emerald-400 to-teal-500",
  "from-violet-400 to-indigo-500",
  "from-sky-400 to-blue-500",
];

export type PatientInput = {
  nome: string;
  nascimento?: string | null;
  sexo?: Patient["sexo"];
  cpf?: string | null;
  telefone?: string | null;
  email?: string | null;
  convenio?: string | null;
  queixa?: string;
  column?: ClinicColumn;
  criticalFlag?: string | null;
  adherence?: number | null;
  briefing?: string | null;
};

export async function listPatients(
  doctorId: string,
  opts: { includeArchived?: boolean } = {},
): Promise<Patient[]> {
  const rows = await readRows<Patient>(FILE);
  return rows
    .filter((p) => p.doctorId === doctorId && (opts.includeArchived || !p.archived))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getPatient(doctorId: string, id: string): Promise<Patient | undefined> {
  const rows = await readRows<Patient>(FILE);
  return rows.find((p) => p.id === id && p.doctorId === doctorId);
}

export async function createPatient(doctorId: string, input: PatientInput): Promise<Patient> {
  const now = nowIso();
  const patient: Patient = {
    id: newId(),
    doctorId,
    nome: input.nome.trim(),
    nascimento: input.nascimento || null,
    sexo: input.sexo ?? null,
    cpf: input.cpf?.trim() || null,
    telefone: input.telefone?.trim() || null,
    email: input.email?.trim() || null,
    convenio: input.convenio?.trim() || null,
    queixa: input.queixa?.trim() || "",
    column: input.column ?? "triagem",
    criticalFlag: input.criticalFlag ?? null,
    adherence: input.adherence ?? null,
    briefing: input.briefing ?? null,
    examsCount: 0,
    tint: TINTS[Math.floor(Math.random() * TINTS.length)],
    archived: false,
    createdAt: now,
    updatedAt: now,
  };
  await mutateRows<Patient>(FILE, (rows) => {
    rows.unshift(patient);
  });
  return patient;
}

export async function updatePatient(
  doctorId: string,
  id: string,
  patch: Partial<PatientInput>,
): Promise<Patient | undefined> {
  let updated: Patient | undefined;
  await mutateRows<Patient>(FILE, (rows) => {
    const p = rows.find((r) => r.id === id && r.doctorId === doctorId);
    if (!p) return;
    if (patch.nome !== undefined) p.nome = patch.nome.trim();
    if (patch.nascimento !== undefined) p.nascimento = patch.nascimento || null;
    if (patch.sexo !== undefined) p.sexo = patch.sexo ?? null;
    if (patch.cpf !== undefined) p.cpf = patch.cpf?.trim() || null;
    if (patch.telefone !== undefined) p.telefone = patch.telefone?.trim() || null;
    if (patch.email !== undefined) p.email = patch.email?.trim() || null;
    if (patch.convenio !== undefined) p.convenio = patch.convenio?.trim() || null;
    if (patch.queixa !== undefined) p.queixa = patch.queixa.trim();
    if (patch.column !== undefined && patch.column) p.column = patch.column;
    if (patch.criticalFlag !== undefined) p.criticalFlag = patch.criticalFlag;
    if (patch.adherence !== undefined) p.adherence = patch.adherence;
    if (patch.briefing !== undefined) p.briefing = patch.briefing;
    p.updatedAt = nowIso();
    updated = { ...p };
  });
  return updated;
}

export async function movePatient(
  doctorId: string,
  id: string,
  to: ClinicColumn,
): Promise<boolean> {
  let ok = false;
  await mutateRows<Patient>(FILE, (rows) => {
    const p = rows.find((r) => r.id === id && r.doctorId === doctorId);
    if (!p) return;
    p.column = to;
    p.updatedAt = nowIso();
    ok = true;
  });
  return ok;
}

export async function setArchived(
  doctorId: string,
  id: string,
  archived: boolean,
): Promise<boolean> {
  let ok = false;
  await mutateRows<Patient>(FILE, (rows) => {
    const p = rows.find((r) => r.id === id && r.doctorId === doctorId);
    if (!p) return;
    p.archived = archived;
    p.updatedAt = nowIso();
    ok = true;
  });
  return ok;
}

export async function bumpExams(doctorId: string, id: string, delta: number): Promise<void> {
  await mutateRows<Patient>(FILE, (rows) => {
    const p = rows.find((r) => r.id === id && r.doctorId === doctorId);
    if (!p) return;
    p.examsCount = Math.max(0, p.examsCount + delta);
    p.updatedAt = nowIso();
  });
}

// Personas de exemplo (as mesmas da demo) — importadas por AÇÃO EXPLÍCITA do
// médico num consultório vazio; nunca semeadas automaticamente. Retorna os
// pacientes criados para o chamador semear agenda/cobranças de amostra.
const SAMPLES: Array<PatientInput & { nascimento: string }> = [
  { nome: "Mariana Silva", nascimento: "1988-03-12", sexo: "feminino", telefone: "(11) 98888-1234", convenio: "Particular", queixa: "Fadiga + queda de hemoglobina", column: "triagem", criticalFlag: "Hb 11.2 g/dL · abaixo do ref", adherence: 40, briefing: "Queixa: fadiga há 4 semanas + dispneia aos esforços. Exames via WhatsApp: Hb 11.2 · Ferritina 18 · Vit D 19." },
  { nome: "Carlos Andrade", nascimento: "1972-07-30", sexo: "masculino", telefone: "(11) 97777-2345", convenio: "Unimed", queixa: "Hipertensão — ajuste de medicação", column: "atendimento", adherence: 82, briefing: "PA domiciliar média 148x92. Em losartana 50mg. Sem sintomas." },
  { nome: "Juliana Prado", nascimento: "1997-01-15", sexo: "feminino", telefone: "(11) 96666-3456", convenio: "Particular", queixa: "Cefaleia recorrente", column: "aguardando", briefing: "Cefaleia pulsátil 3x/semana, fotofobia. Solicitada RM de crânio." },
  { nome: "Roberto Lima", nascimento: "1965-11-02", sexo: "masculino", telefone: "(11) 95555-4567", convenio: "Bradesco Saúde", queixa: "Diabetes — retorno", column: "retorno", adherence: 91, briefing: "HbA1c 7.1% (era 8.4). Em metformina 850mg 2x/dia. 3 exames anexados." },
  { nome: "Sofia Ramos", nascimento: "1981-05-22", sexo: "feminino", telefone: "(11) 94444-5678", convenio: "Amil", queixa: "Check-up anual · sem queixas", column: "estavel" },
];

export async function importSamples(doctorId: string): Promise<Patient[]> {
  const existing = await listPatients(doctorId, { includeArchived: true });
  const names = new Set(existing.map((p) => p.nome.toLowerCase()));
  const added: Patient[] = [];
  for (const s of SAMPLES) {
    if (names.has(s.nome.toLowerCase())) continue;
    added.push(await createPatient(doctorId, s));
  }
  return added;
}
