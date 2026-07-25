// Remédios autodeclarados pelo paciente (feature "Remédios" do app do
// paciente). Fica em patient_medications.json + patient_medication_logs.json.
// Igual ao restante do app do paciente (ver patient-measurements.server.ts):
// dado 100% do paciente, sem depender de vínculo médico ainda.

import { mutateRows, newId, nowIso, readRows } from "./db.server";

// "prescricao" é um GANCHO ESTRUTURAL para BKL-37 (vínculo médico↔paciente,
// ver LifeLine_PRD_Handover_v6.docx Seção 8.1). Hoje SÓ "self" é usado —
// não construir lógica de preenchimento de "prescricao" agora, só deixar
// o campo pronto no schema para não migrar depois.
export type MedicationOrigin = "self" | "prescricao";

export type MedicationStatus = "ativo" | "interrompido";

export type PatientMedication = {
  id: string;
  globalId: string;
  nome: string;
  dose: string;
  horarios: string[];
  nota: string | null;
  origin: MedicationOrigin;
  status: MedicationStatus;
  createdAt: string;
  updatedAt: string;
};

export type MedicationLog = {
  id: string;
  medicationId: string;
  globalId: string;
  scheduledFor: string;
  scheduledTime: string;
  takenAt: string | null;
  skipped: boolean;
  skipReason: string | null;
  createdAt: string;
};

const MEDICATIONS = "patient_medications.json";
const LOGS = "patient_medication_logs.json";

export type MedicationInput = {
  nome: string;
  dose: string;
  horarios: string[];
  nota: string | null;
};

export type MedicationPatch = {
  nome?: string;
  dose?: string;
  horarios?: string[];
  nota?: string | null;
};

export async function addMedication(
  globalId: string,
  input: MedicationInput,
): Promise<PatientMedication> {
  const now = nowIso();
  const med: PatientMedication = {
    id: newId(),
    globalId,
    nome: input.nome,
    dose: input.dose,
    horarios: input.horarios,
    nota: input.nota,
    origin: "self",
    status: "ativo",
    createdAt: now,
    updatedAt: now,
  };
  await mutateRows<PatientMedication>(MEDICATIONS, (rows) => {
    rows.push(med);
  });
  return med;
}

export async function listMedications(globalId: string): Promise<PatientMedication[]> {
  const rows = await readRows<PatientMedication>(MEDICATIONS);
  return rows
    .filter((m) => m.globalId === globalId)
    .sort((a, b) => {
      if (a.status !== b.status) return a.status === "ativo" ? -1 : 1;
      return b.createdAt.localeCompare(a.createdAt);
    });
}

async function findOwnedMedication(
  globalId: string,
  medicationId: string,
): Promise<PatientMedication | null> {
  const rows = await readRows<PatientMedication>(MEDICATIONS);
  const med = rows.find((m) => m.id === medicationId && m.globalId === globalId);
  return med ?? null;
}

export async function updateMedicationStatus(
  globalId: string,
  medicationId: string,
  status: MedicationStatus,
): Promise<PatientMedication | null> {
  const owned = await findOwnedMedication(globalId, medicationId);
  if (!owned) return null;
  let updated: PatientMedication | null = null;
  await mutateRows<PatientMedication>(MEDICATIONS, (rows) =>
    rows.map((m) => {
      if (m.id !== medicationId || m.globalId !== globalId) return m;
      updated = { ...m, status, updatedAt: nowIso() };
      return updated;
    }),
  );
  return updated;
}

export async function updateMedication(
  globalId: string,
  medicationId: string,
  patch: MedicationPatch,
): Promise<PatientMedication | null> {
  const owned = await findOwnedMedication(globalId, medicationId);
  if (!owned) return null;
  let updated: PatientMedication | null = null;
  await mutateRows<PatientMedication>(MEDICATIONS, (rows) =>
    rows.map((m) => {
      if (m.id !== medicationId || m.globalId !== globalId) return m;
      updated = { ...m, ...patch, updatedAt: nowIso() };
      return updated;
    }),
  );
  return updated;
}

async function upsertLog(
  globalId: string,
  medicationId: string,
  scheduledFor: string,
  scheduledTime: string,
  patch: { takenAt: string | null; skipped: boolean; skipReason: string | null },
): Promise<MedicationLog> {
  let result!: MedicationLog;
  await mutateRows<MedicationLog>(LOGS, (rows) => {
    const existing = rows.find(
      (l) =>
        l.medicationId === medicationId &&
        l.globalId === globalId &&
        l.scheduledFor === scheduledFor &&
        l.scheduledTime === scheduledTime,
    );
    if (existing) {
      Object.assign(existing, patch);
      result = existing;
      return rows;
    }
    const created: MedicationLog = {
      id: newId(),
      medicationId,
      globalId,
      scheduledFor,
      scheduledTime,
      createdAt: nowIso(),
      ...patch,
    };
    rows.push(created);
    result = created;
    return rows;
  });
  return result;
}

export async function logDose(
  globalId: string,
  medicationId: string,
  scheduledFor: string,
  scheduledTime: string,
): Promise<MedicationLog | null> {
  const owned = await findOwnedMedication(globalId, medicationId);
  if (!owned) return null;
  return upsertLog(globalId, medicationId, scheduledFor, scheduledTime, {
    takenAt: nowIso(),
    skipped: false,
    skipReason: null,
  });
}

export async function skipDose(
  globalId: string,
  medicationId: string,
  scheduledFor: string,
  scheduledTime: string,
  reason?: string,
): Promise<MedicationLog | null> {
  const owned = await findOwnedMedication(globalId, medicationId);
  if (!owned) return null;
  return upsertLog(globalId, medicationId, scheduledFor, scheduledTime, {
    takenAt: null,
    skipped: true,
    skipReason: reason ?? null,
  });
}

export async function undoLog(
  globalId: string,
  medicationId: string,
  scheduledFor: string,
  scheduledTime: string,
): Promise<void> {
  const owned = await findOwnedMedication(globalId, medicationId);
  if (!owned) return;
  await mutateRows<MedicationLog>(LOGS, (rows) =>
    rows.filter(
      (l) =>
        !(
          l.medicationId === medicationId &&
          l.globalId === globalId &&
          l.scheduledFor === scheduledFor &&
          l.scheduledTime === scheduledTime
        ),
    ),
  );
}

export async function listLogsForDate(
  globalId: string,
  date: string,
): Promise<MedicationLog[]> {
  const rows = await readRows<MedicationLog>(LOGS);
  return rows.filter((l) => l.globalId === globalId && l.scheduledFor === date);
}

// Agregação determinística (mesmo princípio do TECH-20 do Knowledge Base:
// nunca jogar log cru pra IA depois, se algum dia isso alimentar insight).
// Como não guardamos histórico de mudança de status, "ativo naquele período"
// é aproximado por status atual + createdAt <= o dia (evita contar horários
// de remédios que ainda não existiam nos dias mais antigos da janela).
export async function getAdherenceSummary(
  globalId: string,
  days: number,
): Promise<{ date: string; scheduled: number; taken: number }[]> {
  const [medications, logs] = await Promise.all([
    readRows<PatientMedication>(MEDICATIONS),
    readRows<MedicationLog>(LOGS),
  ]);
  const myMeds = medications.filter((m) => m.globalId === globalId);
  const myLogs = logs.filter((l) => l.globalId === globalId);

  const result: { date: string; scheduled: number; taken: number }[] = [];
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const date = d.toISOString().slice(0, 10);
    const activeMeds = myMeds.filter(
      (m) => m.status === "ativo" && m.createdAt.slice(0, 10) <= date,
    );
    const scheduled = activeMeds.reduce((sum, m) => sum + m.horarios.length, 0);
    const taken = myLogs.filter((l) => l.scheduledFor === date && l.takenAt !== null).length;
    result.push({ date, scheduled, taken });
  }
  return result;
}
