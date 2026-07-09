// Server functions da plataforma real do médico. TODAS exigem o token de
// sessão e resolvem o médico no servidor — o doctorId nunca vem do cliente.
// Métodos POST em tudo para o token nunca aparecer em URL/logs.
//
// getWorkspace é a fonte ÚNICA das telas (kanban, pacientes, agenda,
// cobranças): um roundtrip devolve tudo, e qualquer mutação invalida a mesma
// query — é isso que mantém kanban ⇄ lista sempre em sincronia.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireDoctor } from "../auth.server";
import {
  createPatient,
  getPatient,
  importSamples,
  listPatients,
  movePatient,
  setArchived,
  updatePatient,
} from "../patients.server";
import { getBoardColumns, resolveColumn, saveBoardColumns } from "../board.server";
import { createAppointment, listAppointments, setAppointmentStatus } from "../agenda.server";
import { createCharge, listCharges, setChargeStatus } from "../billing.server";
import {
  createEvolution,
  listEvolutions,
  prescribeEvolution,
  sealEvolution,
  updateEvolution,
} from "../records.server";
import { extractTriage } from "../triage.server";
import { todayIso } from "../clinic-types";

const token = z.string().min(1).max(80);
const COLUMN = z.string().min(1).max(32);
const YMD = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const UNAUTH = { ok: false as const, error: "unauthorized" as const };

export const getWorkspace = createServerFn({ method: "POST" })
  .inputValidator(z.object({ token }))
  .handler(async ({ data }) => {
    const doctor = await requireDoctor(data.token);
    if (!doctor) return UNAUTH;
    const [patients, columns, appointments, charges] = await Promise.all([
      listPatients(doctor.id, { includeArchived: true }),
      getBoardColumns(doctor.id),
      listAppointments(doctor.id),
      listCharges(doctor.id),
    ]);
    return {
      ok: true as const,
      doctor: { nome: doctor.nome, email: doctor.email, avatarUrl: doctor.avatarUrl },
      patients,
      columns,
      appointments,
      charges,
    };
  });

export const createMyPatient = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      token,
      nome: z.string().min(2).max(120),
      nascimento: YMD.nullish(),
      sexo: z.enum(["feminino", "masculino", "outro"]).nullish(),
      cpf: z.string().max(20).nullish(),
      telefone: z.string().max(24).nullish(),
      email: z.string().email().max(160).nullish(),
      convenio: z.string().max(60).nullish(),
      queixa: z.string().max(300).optional().default(""),
      column: COLUMN.optional(),
    }),
  )
  .handler(async ({ data }) => {
    const doctor = await requireDoctor(data.token);
    if (!doctor) return UNAUTH;
    const { token: _t, column, ...input } = data;
    const columns = await getBoardColumns(doctor.id);
    const patient = await createPatient(doctor.id, {
      ...input,
      column: resolveColumn(columns, column),
    });
    return { ok: true as const, patient };
  });

export const updateMyPatient = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      token,
      id: z.string().min(1),
      nome: z.string().min(2).max(120).optional(),
      nascimento: YMD.nullish(),
      sexo: z.enum(["feminino", "masculino", "outro"]).nullish(),
      cpf: z.string().max(20).nullish(),
      telefone: z.string().max(24).nullish(),
      email: z.string().email().max(160).nullish(),
      convenio: z.string().max(60).nullish(),
      queixa: z.string().max(300).optional(),
      column: COLUMN.optional(),
      adherence: z.number().min(0).max(100).nullish(),
      criticalFlag: z.string().max(160).nullish(),
    }),
  )
  .handler(async ({ data }) => {
    const doctor = await requireDoctor(data.token);
    if (!doctor) return UNAUTH;
    const { token: _t, id, column, ...patch } = data;
    const columns = await getBoardColumns(doctor.id);
    const patient = await updatePatient(doctor.id, id, {
      ...patch,
      ...(column !== undefined ? { column: resolveColumn(columns, column) } : {}),
    });
    return patient ? { ok: true as const, patient } : { ok: false as const, error: "not_found" as const };
  });

export const moveMyPatient = createServerFn({ method: "POST" })
  .inputValidator(z.object({ token, id: z.string().min(1), to: COLUMN }))
  .handler(async ({ data }) => {
    const doctor = await requireDoctor(data.token);
    if (!doctor) return UNAUTH;
    const columns = await getBoardColumns(doctor.id);
    if (!columns.some((c) => c.id === data.to))
      return { ok: false as const, error: "invalid_column" as const };
    const ok = await movePatient(doctor.id, data.id, data.to);
    return ok ? { ok: true as const } : { ok: false as const, error: "not_found" as const };
  });

export const archiveMyPatient = createServerFn({ method: "POST" })
  .inputValidator(z.object({ token, id: z.string().min(1), archived: z.boolean() }))
  .handler(async ({ data }) => {
    const doctor = await requireDoctor(data.token);
    if (!doctor) return UNAUTH;
    const ok = await setArchived(doctor.id, data.id, data.archived);
    return ok ? { ok: true as const } : { ok: false as const, error: "not_found" as const };
  });

// ---------------------------------------------------------------------------
// Kanban flexível
// ---------------------------------------------------------------------------

export const saveMyBoard = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      token,
      columns: z
        .array(
          z.object({
            id: z.string().max(32).optional(),
            title: z.string().min(2).max(28),
            hint: z.string().max(48).optional(),
          }),
        )
        .min(1)
        .max(7),
    }),
  )
  .handler(async ({ data }) => {
    const doctor = await requireDoctor(data.token);
    if (!doctor) return UNAUTH;
    const columns = await saveBoardColumns(doctor.id, data.columns);
    return { ok: true as const, columns };
  });

// ---------------------------------------------------------------------------
// Agenda
// ---------------------------------------------------------------------------

export const scheduleAppointment = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      token,
      patientId: z.string().min(1),
      dateTime: z.string().refine((s) => !Number.isNaN(Date.parse(s)), "data/hora inválida"),
      note: z.string().max(200).nullish(),
    }),
  )
  .handler(async ({ data }) => {
    const doctor = await requireDoctor(data.token);
    if (!doctor) return UNAUTH;
    const patient = await getPatient(doctor.id, data.patientId);
    if (!patient) return { ok: false as const, error: "not_found" as const };
    const appointment = await createAppointment(doctor.id, {
      patientId: data.patientId,
      dateTime: new Date(data.dateTime).toISOString(),
      note: data.note,
    });
    return { ok: true as const, appointment };
  });

export const setMyAppointmentStatus = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      token,
      id: z.string().min(1),
      status: z.enum(["agendada", "confirmada", "realizada", "faltou"]),
    }),
  )
  .handler(async ({ data }) => {
    const doctor = await requireDoctor(data.token);
    if (!doctor) return UNAUTH;
    const appointment = await setAppointmentStatus(doctor.id, data.id, data.status);
    return appointment
      ? { ok: true as const, appointment }
      : { ok: false as const, error: "not_found" as const };
  });

// ---------------------------------------------------------------------------
// Cobranças
// ---------------------------------------------------------------------------

export const createMyCharge = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      token,
      patientId: z.string().min(1),
      descricao: z.string().max(120).optional(),
      valor: z.number().positive().max(1_000_000),
      vencimento: YMD,
    }),
  )
  .handler(async ({ data }) => {
    const doctor = await requireDoctor(data.token);
    if (!doctor) return UNAUTH;
    const patient = await getPatient(doctor.id, data.patientId);
    if (!patient) return { ok: false as const, error: "not_found" as const };
    const charge = await createCharge(doctor.id, {
      patientId: data.patientId,
      descricao: data.descricao,
      valor: data.valor,
      vencimento: data.vencimento,
    });
    return { ok: true as const, charge };
  });

export const setMyChargeStatus = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({ token, id: z.string().min(1), status: z.enum(["pendente", "pago"]) }),
  )
  .handler(async ({ data }) => {
    const doctor = await requireDoctor(data.token);
    if (!doctor) return UNAUTH;
    const charge = await setChargeStatus(doctor.id, data.id, data.status);
    return charge ? { ok: true as const, charge } : { ok: false as const, error: "not_found" as const };
  });

// ---------------------------------------------------------------------------
// Prontuário
// ---------------------------------------------------------------------------

export const getPatientRecord = createServerFn({ method: "POST" })
  .inputValidator(z.object({ token, id: z.string().min(1) }))
  .handler(async ({ data }) => {
    const doctor = await requireDoctor(data.token);
    if (!doctor) return UNAUTH;
    const patient = await getPatient(doctor.id, data.id);
    if (!patient) return { ok: false as const, error: "not_found" as const };
    const evolutions = await listEvolutions(doctor.id, data.id);
    return { ok: true as const, patient, evolutions };
  });

export const saveEvolution = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      token,
      patientId: z.string().min(1),
      evolutionId: z.string().optional(),
      evolucao: z.string().min(3).max(8000),
    }),
  )
  .handler(async ({ data }) => {
    const doctor = await requireDoctor(data.token);
    if (!doctor) return UNAUTH;
    const patient = await getPatient(doctor.id, data.patientId);
    if (!patient) return { ok: false as const, error: "not_found" as const };
    if (data.evolutionId) {
      const r = await updateEvolution(doctor.id, data.evolutionId, data.evolucao);
      if ("error" in r) return { ok: false as const, error: r.error };
      return { ok: true as const, evolution: r };
    }
    const evolution = await createEvolution(doctor.id, data.patientId, data.evolucao);
    return { ok: true as const, evolution };
  });

export const sealMyEvolution = createServerFn({ method: "POST" })
  .inputValidator(z.object({ token, evolutionId: z.string().min(1), patientId: z.string().min(1) }))
  .handler(async ({ data }) => {
    const doctor = await requireDoctor(data.token);
    if (!doctor) return UNAUTH;
    const patient = await getPatient(doctor.id, data.patientId);
    if (!patient) return { ok: false as const, error: "not_found" as const };
    // latência deliberada: assinar tem peso — o "selando…" precisa ler como real
    await new Promise((r) => setTimeout(r, 600));
    const result = await sealEvolution(doctor.id, data.evolutionId, patient.nome);
    if ("error" in result) return { ok: false as const, error: result.error };
    return { ok: true as const, evolution: result };
  });

export const prescribeForEvolution = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      token,
      evolutionId: z.string().min(1),
      patientId: z.string().min(1),
      meds: z.array(z.string().min(1).max(120)).min(1).max(20),
    }),
  )
  .handler(async ({ data }) => {
    const doctor = await requireDoctor(data.token);
    if (!doctor) return UNAUTH;
    const patient = await getPatient(doctor.id, data.patientId);
    if (!patient) return { ok: false as const, error: "not_found" as const };
    await new Promise((r) => setTimeout(r, 500));
    const result = await prescribeEvolution(doctor.id, data.evolutionId, patient.nome, data.meds);
    if ("error" in result) return { ok: false as const, error: result.error };
    return { ok: true as const, evolution: result };
  });

// ---------------------------------------------------------------------------
// Triagem IA
// ---------------------------------------------------------------------------

export const triageIntake = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      token,
      message: z.string().min(3).max(2000),
      nome: z.string().min(2).max(120).optional(),
      nascimento: YMD.nullish(),
      telefone: z.string().max(24).nullish(),
      criar: z.boolean().optional().default(false),
    }),
  )
  .handler(async ({ data }) => {
    const doctor = await requireDoctor(data.token);
    if (!doctor) return UNAUTH;
    await new Promise((r) => setTimeout(r, 400));
    const triage = extractTriage(data.message);
    if (!data.criar || !data.nome) return { ok: true as const, triage, patient: null };
    const columns = await getBoardColumns(doctor.id);
    const patient = await createPatient(doctor.id, {
      nome: data.nome,
      nascimento: data.nascimento,
      telefone: data.telefone,
      queixa: triage.complaint || data.message.slice(0, 120),
      column: resolveColumn(columns, triage.suggestedColumn),
      criticalFlag: triage.redFlags.length ? triage.redFlags.join(" · ") : null,
      briefing: triage.summary,
    });
    return { ok: true as const, triage, patient };
  });

// ---------------------------------------------------------------------------
// Personas de exemplo — pacientes + agenda + cobranças de amostra, para as
// visões Hoje/Faltas/Cobranças nascerem habitadas.
// ---------------------------------------------------------------------------

function atLocal(dayOffset: number, hour: number, minute = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

function ymdOffset(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export const importSamplePatients = createServerFn({ method: "POST" })
  .inputValidator(z.object({ token }))
  .handler(async ({ data }) => {
    const doctor = await requireDoctor(data.token);
    if (!doctor) return UNAUTH;
    const added = await importSamples(doctor.id);
    const byName = (n: string) => added.find((p) => p.nome.startsWith(n));

    const mariana = byName("Mariana");
    const carlos = byName("Carlos");
    const juliana = byName("Juliana");
    const roberto = byName("Roberto");
    const sofia = byName("Sofia");

    if (mariana) {
      await createAppointment(doctor.id, { patientId: mariana.id, dateTime: atLocal(0, 14) });
      await createCharge(doctor.id, { patientId: mariana.id, valor: 350, vencimento: todayIso() });
    }
    if (carlos) {
      const a = await createAppointment(doctor.id, { patientId: carlos.id, dateTime: atLocal(0, 15, 30) });
      await setAppointmentStatus(doctor.id, a.id, "confirmada");
    }
    if (juliana) {
      const a = await createAppointment(doctor.id, { patientId: juliana.id, dateTime: atLocal(-6, 10) });
      await setAppointmentStatus(doctor.id, a.id, "faltou");
      await createCharge(doctor.id, { patientId: juliana.id, valor: 280, vencimento: ymdOffset(-10) });
    }
    if (roberto) {
      await createAppointment(doctor.id, { patientId: roberto.id, dateTime: atLocal(1, 9) });
      const c = await createCharge(doctor.id, { patientId: roberto.id, valor: 300, vencimento: ymdOffset(-3) });
      await setChargeStatus(doctor.id, c.id, "pago");
    }
    if (sofia) {
      await createAppointment(doctor.id, { patientId: sofia.id, dateTime: atLocal(0, 19) });
    }

    return { ok: true as const, added: added.length };
  });
