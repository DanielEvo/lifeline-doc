// Server functions da feature "Remédios" do app do paciente — mesmo padrão
// de patient-auth.functions.ts: createServerFn, requirePatient(token), zod
// inputValidator, retorno { ok: true/false }.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requirePatient } from "../patient-auth.server";
import {
  addMedication,
  getAdherenceSummary,
  listLogsForDate,
  listMedications,
  logDose,
  skipDose,
  undoLog,
  updateMedication,
  updateMedicationStatus,
  type MedicationStatus,
} from "../patient-medications.server";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

function pub(m: Awaited<ReturnType<typeof addMedication>>) {
  return {
    id: m.id,
    nome: m.nome,
    dose: m.dose,
    horarios: m.horarios,
    nota: m.nota,
    origin: m.origin,
    status: m.status,
    createdAt: m.createdAt,
    updatedAt: m.updatedAt,
  };
}

export const listMyMedications = createServerFn({ method: "POST" })
  .inputValidator(z.object({ token: z.string().min(1) }))
  .handler(async ({ data }) => {
    const patient = await requirePatient(data.token);
    if (!patient) return { ok: false as const, error: "unauthorized" as const };
    const meds = await listMedications(patient.globalId);
    return { ok: true as const, medications: meds.map(pub) };
  });

export const addMyMedication = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      token: z.string().min(1),
      nome: z.string().min(1).max(120),
      dose: z.string().min(1).max(80),
      horarios: z.array(z.string().regex(TIME_RE)).min(1).max(12),
      nota: z.string().max(300).optional(),
    }),
  )
  .handler(async ({ data }) => {
    const patient = await requirePatient(data.token);
    if (!patient) return { ok: false as const, error: "unauthorized" as const };
    const med = await addMedication(patient.globalId, {
      nome: data.nome,
      dose: data.dose,
      horarios: data.horarios,
      nota: data.nota ?? null,
    });
    return { ok: true as const, medication: pub(med) };
  });

export const updateMyMedicationStatus = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      token: z.string().min(1),
      medicationId: z.string().min(1),
      status: z.enum(["ativo", "interrompido"]),
    }),
  )
  .handler(async ({ data }) => {
    const patient = await requirePatient(data.token);
    if (!patient) return { ok: false as const, error: "unauthorized" as const };
    const updated = await updateMedicationStatus(
      patient.globalId,
      data.medicationId,
      data.status as MedicationStatus,
    );
    if (!updated) return { ok: false as const, error: "not_found" as const };
    return { ok: true as const, medication: pub(updated) };
  });

export const updateMyMedication = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      token: z.string().min(1),
      medicationId: z.string().min(1),
      nome: z.string().min(1).max(120).optional(),
      dose: z.string().min(1).max(80).optional(),
      horarios: z.array(z.string().regex(TIME_RE)).min(1).max(12).optional(),
      nota: z.string().max(300).nullable().optional(),
    }),
  )
  .handler(async ({ data }) => {
    const patient = await requirePatient(data.token);
    if (!patient) return { ok: false as const, error: "unauthorized" as const };
    const updated = await updateMedication(patient.globalId, data.medicationId, {
      nome: data.nome,
      dose: data.dose,
      horarios: data.horarios,
      nota: data.nota,
    });
    if (!updated) return { ok: false as const, error: "not_found" as const };
    return { ok: true as const, medication: pub(updated) };
  });

export const logMyDose = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      token: z.string().min(1),
      medicationId: z.string().min(1),
      scheduledFor: z.string().regex(DATE_RE),
      scheduledTime: z.string().regex(TIME_RE),
    }),
  )
  .handler(async ({ data }) => {
    const patient = await requirePatient(data.token);
    if (!patient) return { ok: false as const, error: "unauthorized" as const };
    const log = await logDose(
      patient.globalId,
      data.medicationId,
      data.scheduledFor,
      data.scheduledTime,
    );
    if (!log) return { ok: false as const, error: "not_found" as const };
    return { ok: true as const };
  });

export const skipMyDose = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      token: z.string().min(1),
      medicationId: z.string().min(1),
      scheduledFor: z.string().regex(DATE_RE),
      scheduledTime: z.string().regex(TIME_RE),
      reason: z.string().max(200).optional(),
    }),
  )
  .handler(async ({ data }) => {
    const patient = await requirePatient(data.token);
    if (!patient) return { ok: false as const, error: "unauthorized" as const };
    const log = await skipDose(
      patient.globalId,
      data.medicationId,
      data.scheduledFor,
      data.scheduledTime,
      data.reason,
    );
    if (!log) return { ok: false as const, error: "not_found" as const };
    return { ok: true as const };
  });

export const undoMyLog = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      token: z.string().min(1),
      medicationId: z.string().min(1),
      scheduledFor: z.string().regex(DATE_RE),
      scheduledTime: z.string().regex(TIME_RE),
    }),
  )
  .handler(async ({ data }) => {
    const patient = await requirePatient(data.token);
    if (!patient) return { ok: false as const, error: "unauthorized" as const };
    await undoLog(patient.globalId, data.medicationId, data.scheduledFor, data.scheduledTime);
    return { ok: true as const };
  });

// ---------------------------------------------------------------------------
// Tela "hoje" — combina medicamentos ativos × horários do dia com o log de
// cada slot, já pronto para a UI renderizar sem lógica extra no cliente.
// ---------------------------------------------------------------------------

export const getMyTodayMeds = createServerFn({ method: "POST" })
  .inputValidator(z.object({ token: z.string().min(1) }))
  .handler(async ({ data }) => {
    const patient = await requirePatient(data.token);
    if (!patient) return { ok: false as const, error: "unauthorized" as const };
    const date = new Date().toISOString().slice(0, 10);
    const [meds, logs] = await Promise.all([
      listMedications(patient.globalId),
      listLogsForDate(patient.globalId, date),
    ]);
    const activeMeds = meds.filter((m) => m.status === "ativo");
    const items = activeMeds.flatMap((m) =>
      m.horarios.map((scheduledTime) => {
        const log = logs.find(
          (l) => l.medicationId === m.id && l.scheduledTime === scheduledTime,
        );
        return {
          medicationId: m.id,
          nome: m.nome,
          dose: m.dose,
          nota: m.nota,
          scheduledTime,
          takenAt: log?.takenAt ?? null,
          skipped: log?.skipped ?? false,
        };
      }),
    );
    items.sort((a, b) => a.scheduledTime.localeCompare(b.scheduledTime));
    const takenCount = items.filter((i) => i.takenAt !== null).length;
    const adherencePct = items.length === 0 ? 0 : Math.round((takenCount / items.length) * 100);
    return { ok: true as const, date, items, adherencePct };
  });

export const getMyAdherenceSummary = createServerFn({ method: "POST" })
  .inputValidator(z.object({ token: z.string().min(1), days: z.number().int().min(1).max(90) }))
  .handler(async ({ data }) => {
    const patient = await requirePatient(data.token);
    if (!patient) return { ok: false as const, error: "unauthorized" as const };
    const summary = await getAdherenceSummary(patient.globalId, data.days);
    return { ok: true as const, summary };
  });
