// Server-only: agenda de consultas por médico. Uma consulta pertence a um
// paciente e tem status simples (agendada → confirmada → realizada | faltou).
// "Faltou" alimenta a visão de reengajamento no painel de pacientes.

import { mutateRows, newId, nowIso, readRows } from "./db.server";
import type {
  Appointment,
  AppointmentStatus,
  RecurrenceFreq,
  RecurrenceScope,
} from "./clinic-types";

const FILE = "appointments.json";
const DEFAULT_DURATION_MIN = 30;

export async function listAppointments(doctorId: string): Promise<Appointment[]> {
  const rows = await readRows<Appointment>(FILE);
  return (
    rows
      .filter((a) => a.doctorId === doctorId)
      // linhas antigas não têm os campos abaixo — normaliza sem migrar o arquivo
      .map((a) => ({
        ...a,
        kind: a.kind ?? "consulta",
        label: a.label ?? null,
        recurrenceId: a.recurrenceId ?? null,
        durationMin: a.durationMin ?? DEFAULT_DURATION_MIN,
        allDay: a.allDay ?? false,
        categoriaId: a.categoriaId ?? null,
        cor: a.cor ?? null,
        descricao: a.descricao ?? null,
        local: a.local ?? null,
        lembretesMin: a.lembretesMin ?? [],
      }))
      .sort((a, b) => a.dateTime.localeCompare(b.dateTime))
  );
}

type CreateAppointmentInput = {
  patientId?: string | null;
  dateTime: string;
  note?: string | null;
  kind?: "consulta" | "bloqueio";
  label?: string | null;
  recurrenceId?: string | null;
  durationMin?: number | null;
  allDay?: boolean;
  categoriaId?: string | null;
  cor?: string | null;
  descricao?: string | null;
  local?: string | null;
  lembretesMin?: number[];
};

function buildAppointment(
  doctorId: string,
  input: CreateAppointmentInput,
  now: string,
): Appointment {
  const allDay = input.allDay ?? false;
  return {
    id: newId(),
    doctorId,
    patientId: input.patientId ?? null,
    dateTime: input.dateTime,
    status: "agendada",
    note: input.note?.trim() || null,
    kind: input.kind ?? "consulta",
    label: input.label?.trim() || null,
    recurrenceId: input.recurrenceId ?? null,
    durationMin: allDay ? null : (input.durationMin ?? DEFAULT_DURATION_MIN),
    allDay,
    categoriaId: input.categoriaId ?? null,
    cor: input.cor ?? null,
    descricao: input.descricao?.trim() || null,
    local: input.local?.trim() || null,
    lembretesMin: input.lembretesMin ?? [],
    createdAt: now,
    updatedAt: now,
  };
}

export async function createAppointment(
  doctorId: string,
  input: CreateAppointmentInput,
): Promise<Appointment> {
  const appt = buildAppointment(doctorId, input, nowIso());
  await mutateRows<Appointment>(FILE, (rows) => {
    rows.push(appt);
  });
  return appt;
}

/** Passo de data por frequência — mesma lógica de "avança N unidades" pras
 *  três frequências suportadas; rollover de mês (ex.: dia 31 caindo num mês
 *  de 30) fica por conta do comportamento nativo do JS Date, sem tratamento
 *  manual de borda. */
function stepDate(base: Date, freq: Exclude<RecurrenceFreq, "none">, n: number): Date {
  const d = new Date(base);
  if (freq === "daily") d.setDate(d.getDate() + n);
  else if (freq === "weekly") d.setDate(d.getDate() + n * 7);
  else d.setMonth(d.getMonth() + n);
  return d;
}

/** Gera 1 + count ocorrências (mesma hora, avançando por freq), todas com o
 *  mesmo recurrenceId — usado tanto por consulta quanto por evento pessoal. */
export async function createRecurringAppointments(
  doctorId: string,
  input: CreateAppointmentInput,
  recurrence: { freq: Exclude<RecurrenceFreq, "none">; count: number },
): Promise<Appointment[]> {
  const recurrenceId = newId();
  const base = new Date(input.dateTime);
  const now = nowIso();
  const created: Appointment[] = Array.from({ length: recurrence.count + 1 }, (_, i) =>
    buildAppointment(
      doctorId,
      { ...input, dateTime: stepDate(base, recurrence.freq, i).toISOString(), recurrenceId },
      now,
    ),
  );
  await mutateRows<Appointment>(FILE, (rows) => {
    rows.push(...created);
  });
  return created;
}

/** scope "this" apaga só a ocorrência; "following" apaga essa e as
 *  seguintes da mesma série (por dateTime); "all" apaga a série inteira.
 *  Fora de uma série (recurrenceId null), scope é sempre tratado como "this". */
export async function deleteAppointment(
  doctorId: string,
  id: string,
  scope: RecurrenceScope = "this",
): Promise<number> {
  let deletedCount = 0;
  await mutateRows<Appointment>(FILE, (rows) => {
    const target = rows.find((r) => r.id === id && r.doctorId === doctorId);
    if (!target) return;
    const idsToDelete = new Set<string>([target.id]);
    if (scope !== "this" && target.recurrenceId) {
      for (const r of rows) {
        if (r.doctorId !== doctorId || r.recurrenceId !== target.recurrenceId) continue;
        if (scope === "all" || r.dateTime >= target.dateTime) idsToDelete.add(r.id);
      }
    }
    for (let i = rows.length - 1; i >= 0; i--) {
      if (idsToDelete.has(rows[i].id)) {
        rows.splice(i, 1);
        deletedCount++;
      }
    }
  });
  return deletedCount;
}

export type AppointmentEditableFields = {
  note?: string | null;
  label?: string | null;
  durationMin?: number | null;
  allDay?: boolean;
  categoriaId?: string | null;
  cor?: string | null;
  descricao?: string | null;
  local?: string | null;
  lembretesMin?: number[];
};

/** Edição completa (reabrir o editor) — não mexe em dateTime/durationMin de
 *  drag/resize (isso continua em updateAppointmentTiming). Escopo de série
 *  igual ao delete: "this" só essa ocorrência, "following" essa e as
 *  seguintes, "all" a série inteira. */
export async function updateAppointment(
  doctorId: string,
  id: string,
  patch: AppointmentEditableFields,
  scope: RecurrenceScope = "this",
): Promise<Appointment | undefined> {
  let updated: Appointment | undefined;
  await mutateRows<Appointment>(FILE, (rows) => {
    const target = rows.find((r) => r.id === id && r.doctorId === doctorId);
    if (!target) return;
    const targets =
      scope === "this" || !target.recurrenceId
        ? [target]
        : rows.filter(
            (r) =>
              r.doctorId === doctorId &&
              r.recurrenceId === target.recurrenceId &&
              (scope === "all" || r.dateTime >= target.dateTime),
          );
    const now = nowIso();
    for (const a of targets) {
      if (patch.note !== undefined) a.note = patch.note;
      if (patch.label !== undefined) a.label = patch.label;
      if (patch.durationMin !== undefined) a.durationMin = patch.durationMin;
      if (patch.allDay !== undefined) a.allDay = patch.allDay;
      if (patch.categoriaId !== undefined) a.categoriaId = patch.categoriaId;
      if (patch.cor !== undefined) a.cor = patch.cor;
      if (patch.descricao !== undefined) a.descricao = patch.descricao;
      if (patch.local !== undefined) a.local = patch.local;
      if (patch.lembretesMin !== undefined) a.lembretesMin = patch.lembretesMin;
      a.updatedAt = now;
    }
    updated = { ...target };
  });
  return updated;
}

export async function setAppointmentStatus(
  doctorId: string,
  id: string,
  status: AppointmentStatus,
): Promise<Appointment | undefined> {
  let updated: Appointment | undefined;
  await mutateRows<Appointment>(FILE, (rows) => {
    const a = rows.find((r) => r.id === id && r.doctorId === doctorId);
    if (!a) return;
    a.status = status;
    a.updatedAt = nowIso();
    updated = { ...a };
  });
  return updated;
}

/** Usado tanto por mover (só dateTime, drag) quanto por redimensionar (só
 *  durationMin, alça na borda do bloco) — cada chamador manda só o campo
 *  que mudou. */
export async function updateAppointmentTiming(
  doctorId: string,
  id: string,
  patch: { dateTime?: string; durationMin?: number },
): Promise<Appointment | undefined> {
  let updated: Appointment | undefined;
  await mutateRows<Appointment>(FILE, (rows) => {
    const a = rows.find((r) => r.id === id && r.doctorId === doctorId);
    if (!a) return;
    if (patch.dateTime !== undefined) a.dateTime = patch.dateTime;
    if (patch.durationMin !== undefined) a.durationMin = patch.durationMin;
    a.updatedAt = nowIso();
    updated = { ...a };
  });
  return updated;
}
