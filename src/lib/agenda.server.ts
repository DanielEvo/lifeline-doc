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
    .sort((a, b) => a.dateTime.localeCompare(b.dateTime));
}

export async function createAppointment(
  doctorId: string,
  input: { patientId: string; dateTime: string; note?: string | null },
): Promise<Appointment> {
  const now = nowIso();
  const appt: Appointment = {
    id: newId(),
    doctorId,
    patientId: input.patientId,
    dateTime: input.dateTime,
    status: "agendada",
    note: input.note?.trim() || null,
    createdAt: now,
    updatedAt: now,
  };
  await mutateRows<Appointment>(FILE, (rows) => {
    rows.push(appt);
  });
  return appt;
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

