// Server-only: agenda de consultas por médico. Uma consulta pertence a um
// paciente e tem status simples (agendada → confirmada → realizada | faltou).
// "Faltou" alimenta a visão de reengajamento no painel de pacientes.

import { mutateRows, newId, nowIso, readRows } from "./db.server";
import type { Appointment, AppointmentStatus } from "./clinic-types";

const FILE = "appointments.json";

export async function listAppointments(doctorId: string): Promise<Appointment[]> {
  const rows = await readRows<Appointment>(FILE);
  return rows
    .filter((a) => a.doctorId === doctorId)
    // linhas antigas não têm kind/label/recurrenceId — normaliza como "consulta" sem migrar o arquivo
    .map((a) => ({
      ...a,
      kind: a.kind ?? "consulta",
      label: a.label ?? null,
      recurrenceId: a.recurrenceId ?? null,
    }))
    .sort((a, b) => a.dateTime.localeCompare(b.dateTime));
}

export async function createAppointment(
  doctorId: string,
  input: {
    patientId?: string | null;
    dateTime: string;
    note?: string | null;
    kind?: "consulta" | "bloqueio";
    label?: string | null;
    recurrenceId?: string | null;
  },
): Promise<Appointment> {
  const now = nowIso();
  const appt: Appointment = {
    id: newId(),
    doctorId,
    patientId: input.patientId ?? null,
    dateTime: input.dateTime,
    status: "agendada",
    note: input.note?.trim() || null,
    kind: input.kind ?? "consulta",
    label: input.label?.trim() || null,
    recurrenceId: input.recurrenceId ?? null,
    createdAt: now,
    updatedAt: now,
  };
  await mutateRows<Appointment>(FILE, (rows) => {
    rows.push(appt);
  });
  return appt;
}

/** Gera 1 + weeksRepeat consultas semanais (mesma hora, +7 dias cada), todas
 *  com o mesmo recurrenceId — para o toggle "Repetir semanalmente" da agenda. */
export async function createRecurringAppointments(
  doctorId: string,
  input: { patientId: string; dateTime: string; note?: string | null },
  weeksRepeat: number,
): Promise<Appointment[]> {
  const recurrenceId = newId();
  const base = new Date(input.dateTime);
  const now = nowIso();
  const created: Appointment[] = Array.from({ length: weeksRepeat + 1 }, (_, i) => {
    const d = new Date(base);
    d.setDate(d.getDate() + i * 7);
    return {
      id: newId(),
      doctorId,
      patientId: input.patientId,
      dateTime: d.toISOString(),
      status: "agendada",
      note: input.note?.trim() || null,
      kind: "consulta",
      label: null,
      recurrenceId,
      createdAt: now,
      updatedAt: now,
    };
  });
  await mutateRows<Appointment>(FILE, (rows) => {
    rows.push(...created);
  });
  return created;
}

export async function deleteAppointment(doctorId: string, id: string): Promise<boolean> {
  let deleted = false;
  await mutateRows<Appointment>(FILE, (rows) => {
    const idx = rows.findIndex((r) => r.id === id && r.doctorId === doctorId);
    if (idx === -1) return;
    rows.splice(idx, 1);
    deleted = true;
  });
  return deleted;
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

export async function updateAppointmentDateTime(
  doctorId: string,
  id: string,
  dateTime: string,
): Promise<Appointment | undefined> {
  let updated: Appointment | undefined;
  await mutateRows<Appointment>(FILE, (rows) => {
    const a = rows.find((r) => r.id === id && r.doctorId === doctorId);
    if (!a) return;
    a.dateTime = dateTime;
    a.updatedAt = nowIso();
    updated = { ...a };
  });
  return updated;
}

