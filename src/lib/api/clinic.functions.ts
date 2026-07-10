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
  bumpExams,
  createPatient,
  findPatientByCode,
  getPatient,
  importSamples,
  listPatients,
  movePatient,
  setArchived,
  updatePatient,
} from "../patients.server";
import { simulateExamExtraction } from "../triage.server";
import { getBoardColumns, resolveColumn, saveBoardColumns } from "../board.server";
import { createAppointment, listAppointments, setAppointmentStatus } from "../agenda.server";
import { createCharge, listCharges, setChargeStatus } from "../billing.server";
import {
  createEvolution,
  listEvolutions,
  prescribeEvolution,
  sealEvolution,
  updateEvolution,
  updateEvolutionNote,
} from "../records.server";
import { addMeasurement, listMeasurements } from "../measurements.server";
import { extractTriage } from "../triage.server";
import { BIOMARKER_CATALOG, todayIso } from "../clinic-types";

const token = z.string().min(1).max(80);
const COLUMN = z.string().min(1).max(32);
const YMD = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const UNAUTH = { ok: false as const, error: "unauthorized" as const };

export const lookupPatientByCode = createServerFn({ method: "POST" })
  .inputValidator(z.object({ token, code: z.string().min(1).max(20) }))
  .handler(async ({ data }) => {
    const doctor = await requireDoctor(data.token);
    if (!doctor) return UNAUTH;
    const patient = await findPatientByCode(doctor.id, data.code);
    return { ok: true as const, patient: patient ?? null };
  });

export const submitPreCadastro = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      token,
      existingPatientId: z.string().optional(),
      nome: z.string().min(2).max(120).optional(),
      telefone: z.string().max(24).nullish(),
      queixa: z.string().max(300).optional(),
      fileNames: z.array(z.string().max(260)).max(20),
    }),
  )
  .handler(async ({ data }) => {
    const doctor = await requireDoctor(data.token);
    if (!doctor) return UNAUTH;

    let patient = await (async () => {
      if (data.existingPatientId) {
        return getPatient(doctor.id, data.existingPatientId);
      }
      if (!data.nome) return undefined;
      const columns = await getBoardColumns(doctor.id);
      return createPatient(doctor.id, {
        nome: data.nome,
        telefone: data.telefone,
        queixa: data.queixa || "",
        column: resolveColumn(columns, "triagem"),
      });
    })();

    if (!patient) return { ok: false as const, error: "not_found" as const };

    if (data.fileNames.length > 0) {
      const { measurements, summaryLine } = simulateExamExtraction(data.fileNames);
      for (const m of measurements) {
        await addMeasurement(doctor.id, {
          patientId: patient.id,
          name: m.name,
          unit: m.unit,
          value: m.value,
          refMin: m.refMin,
          refMax: m.refMax,
          date: todayIso(),
          label: `Pré-cadastro · ${data.fileNames.join(", ")}`,
        });
      }
      await bumpExams(doctor.id, patient.id, measurements.length);
      const briefing = [patient.briefing, summaryLine].filter(Boolean).join(" ");
      patient = (await updatePatient(doctor.id, patient.id, { briefing })) ?? patient;
    }

    return { ok: true as const, patient };
  });

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
    const [evolutions, measurements] = await Promise.all([
      listEvolutions(doctor.id, data.id),
      listMeasurements(doctor.id, data.id),
    ]);
    return { ok: true as const, patient, evolutions, measurements };
  });

// Registrar resultado de exame (biomarcador). A faixa de referência vem do
// catálogo quando o nome bate; senão o médico informa a dele.
export const addMyMeasurement = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      token,
      patientId: z.string().min(1),
      name: z.string().min(1).max(60),
      value: z.number().finite().min(-1_000_000).max(1_000_000),
      date: YMD,
      label: z.string().max(80).optional(),
      unit: z.string().max(16).optional(),
      refMin: z.number().finite().optional(),
      refMax: z.number().finite().optional(),
    }),
  )
  .handler(async ({ data }) => {
    const doctor = await requireDoctor(data.token);
    if (!doctor) return UNAUTH;
    const patient = await getPatient(doctor.id, data.patientId);
    if (!patient) return { ok: false as const, error: "not_found" as const };
    const cat = BIOMARKER_CATALOG.find((b) => b.name === data.name);
    const measurement = await addMeasurement(doctor.id, {
      patientId: data.patientId,
      name: data.name,
      unit: data.unit ?? cat?.unit ?? "",
      value: data.value,
      refMin: data.refMin ?? cat?.min ?? 0,
      refMax: data.refMax ?? cat?.max ?? 0,
      date: data.date,
      label: data.label?.trim() || "Exame avulso",
    });
    return { ok: true as const, measurement };
  });

export const saveEvolution = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      token,
      patientId: z.string().min(1),
      evolutionId: z.string().optional(),
      evolucao: z.string().min(3).max(8000),
      // ausente = não mexe no plano já salvo (edição só do texto da evolução)
      planoTerapeutico: z.string().max(4000).optional(),
    }),
  )
  .handler(async ({ data }) => {
    const doctor = await requireDoctor(data.token);
    if (!doctor) return UNAUTH;
    const patient = await getPatient(doctor.id, data.patientId);
    if (!patient) return { ok: false as const, error: "not_found" as const };
    if (data.evolutionId) {
      const r = await updateEvolution(doctor.id, data.evolutionId, data.evolucao, data.planoTerapeutico);
      if ("error" in r) return { ok: false as const, error: r.error };
      return { ok: true as const, evolution: r };
    }
    const evolution = await createEvolution(doctor.id, data.patientId, data.evolucao, data.planoTerapeutico ?? "");
    return { ok: true as const, evolution };
  });

export const saveEvolutionNote = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      token,
      evolutionId: z.string().min(1),
      notaPrivada: z.string().max(2000),
    }),
  )
  .handler(async ({ data }) => {
    const doctor = await requireDoctor(data.token);
    if (!doctor) return UNAUTH;
    const result = await updateEvolutionNote(doctor.id, data.evolutionId, data.notaPrivada);
    if ("error" in result) return { ok: false as const, error: result.error };
    return { ok: true as const, evolution: result };
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
      meds: z
        .array(
          z.object({
            name: z.string().min(1).max(120),
            dosage: z.string().max(120),
            duration: z.string().max(120),
          }),
        )
        .min(1)
        .max(20),
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

    // Histórico clínico da Mariana — 4 anos de biomarcadores (espelha a demo):
    // a linha do tempo e os gráficos do prontuário nascem contando a história
    // da queda de hemoglobina/ferritina.
    if (mariana) {
      const seed = async (
        date: string,
        label: string,
        values: Array<[name: string, value: number]>,
      ) => {
        for (const [name, value] of values) {
          const cat = BIOMARKER_CATALOG.find((b) => b.name === name);
          if (!cat) continue;
          await addMeasurement(doctor.id, {
            patientId: mariana.id,
            name,
            unit: cat.unit,
            value,
            refMin: cat.min,
            refMax: cat.max,
            date,
            label,
          });
        }
      };
      await seed("2023-03-15", "Check-up de rotina", [
        ["Hemoglobina", 13.4],
        ["Ferritina", 78],
        ["Vitamina D", 38],
        ["Vitamina B12", 520],
        ["Zinco", 95],
        ["Creatinina", 0.78],
      ]);
      await seed("2024-09-10", "Investigação de fadiga", [
        ["Hemoglobina", 12.6],
        ["Ferritina", 42],
      ]);
      await seed("2025-05-20", "Retorno · acompanhamento metabólico", [
        ["Creatinina", 0.85],
        ["Vitamina D", 24],
        ["Vitamina B12", 290],
        ["Zinco", 68],
      ]);
      await seed("2026-06-18", "Exames via WhatsApp", [
        ["Hemoglobina", 11.2],
        ["Ferritina", 18],
      ]);
    }
    if (roberto) {
      const cat = (n: string) => BIOMARKER_CATALOG.find((b) => b.name === n)!;
      for (const [date, label, name, value] of [
        ["2025-12-10", "Hemoglobina glicada", "HbA1c", 8.4],
        ["2026-06-20", "Retorno diabetes", "HbA1c", 7.1],
        ["2026-06-20", "Retorno diabetes", "Glicemia de jejum", 118],
      ] as const) {
        const c = cat(name);
        await addMeasurement(doctor.id, {
          patientId: roberto.id,
          name,
          unit: c.unit,
          value,
          refMin: c.min,
          refMax: c.max,
          date,
          label,
        });
      }
    }

    return { ok: true as const, added: added.length };
  });
