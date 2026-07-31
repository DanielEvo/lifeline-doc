// Server functions da plataforma real do médico. TODAS exigem o token de
// sessão e resolvem o médico no servidor — o doctorId nunca vem do cliente.
// Métodos POST em tudo para o token nunca aparecer em URL/logs.
//
// getWorkspace é a fonte ÚNICA das telas (kanban, pacientes, agenda,
// cobranças): um roundtrip devolve tudo, e qualquer mutação invalida a mesma
// query — é isso que mantém kanban ⇄ lista sempre em sincronia.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
  requireDoctor,
  updateDoctorCalendarSettings,
  updateDoctorMemedProfile,
  updateDoctorPreferredMetrics,
} from "../auth.server";
import { listCategories } from "../categories.server";
import {
  bumpExams,
  createPatient,
  findPatientByCode,
  findPatientByGlobalId,
  getPatient,
  importSamples,
  linkPatientToGlobalId,
  listPatients,
  movePatient,
  setArchived,
  updatePatient,
} from "../patients.server";
import {
  findRegistryByCpf,
  findRegistryByEmail,
  findRegistryByGlobalId,
  findRegistryByPublicCode,
  findRegistryByRg,
  mergeAutodeclarado,
  searchRegistryByName,
  type PatientRegistry,
} from "../patients-registry.server";
import {
  consumeToken,
  createAccessRequest,
  findValidPresentialToken,
  hasActiveGrant,
} from "../patient-access.server";
import { simulateExamExtraction } from "../triage.server";
import { getBoardColumns, resolveColumn, saveBoardColumns } from "../board.server";
import {
  countOverlappingConsultas,
  createAppointment,
  createRecurringAppointments,
  deleteAppointment,
  getAppointment,
  listAppointments,
  listAppointmentsInRange,
  setAppointmentStatus,
  updateAppointment,
  updateAppointmentTiming,
} from "../agenda.server";
import { createCharge, listCharges, setChargePaymentUrl, setChargeStatus } from "../billing.server";
import {
  getMemedPrescriberToken,
  getMemedSandboxToken,
  invalidateMemedToken,
  isMemedConfigured,
  isMemedLikelyOffline,
  MEMED_SCRIPT_URL,
} from "../memed.server";
import { isWhatsAppApiConfigured, sendWhatsAppTextReal } from "../whatsapp.server";
import { createStripeCheckoutLink, isStripeConfigured } from "../payments.server";
import {
  createEvolution,
  listEvolutions,
  prescribeEvolution,
  prescribeEvolutionMemed,
  sealEvolution,
  updateEvolution,
  updateEvolutionNote,
} from "../records.server";
import { addMeasurement, listMeasurements } from "../measurements.server";
import { extractTriage } from "../triage.server";
import { extractBiomarkersFromDocument } from "../ocr-extraction.server";
import { resolveLoincCode } from "../loinc-mapping.server";
import {
  ageFrom,
  BIOMARKER_CATALOG,
  DEFAULT_CALENDAR_SETTINGS,
  resolveBiomarkerName,
  todayIso,
  type CalendarSettings,
  type Evolution,
  type Patient,
} from "../clinic-types";

const token = z.string().min(1).max(80);
const COLUMN = z.string().min(1).max(32);
const YMD = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

// Antecedentes pessoais — mesmo fragmento em createMyPatient e
// updateMyPatient para não divergir a validação entre os dois.
const CLINICAL_FIELDS = {
  tipoSanguineo: z.string().max(4).nullish(),
  tabagismo: z.enum(["nunca", "ex_fumante", "fumante"]).nullish(),
  etilismo: z.enum(["nunca", "ex_etilista", "etilista"]).nullish(),
  comorbidades: z.array(z.string().max(60)).max(20).optional(),
  alergias: z.string().max(300).nullish(),
  medicacaoContinua: z.string().max(300).nullish(),
  pesoKg: z.number().min(0).max(500).nullish(),
  alturaCm: z.number().min(0).max(280).nullish(),
};

const UNAUTH = { ok: false as const, error: "unauthorized" as const };

// ---------------------------------------------------------------------------
// BKL-37 — busca global + vínculo médico↔paciente
//
// Vínculo (linkMyPatientToGlobalId) e ACESSO aos dados (hasProfileAccess) são
// decisões independentes: vincular é sempre permitido (é só apontar o
// prontuário local pra identidade global); o acesso ao que o paciente
// autodeclarou é que fica condicionado — token presencial, aprovação de
// solicitação, ou o médico já ser dono do registry/já ter evolução com esse
// paciente. Um paciente pode ficar "vinculado, sem acesso" por tempo
// indeterminado (ex.: paciente sem celular).
// ---------------------------------------------------------------------------

/** "Mariana Silva" → "Mariana S." — nunca expõe o sobrenome completo na busca. */
function nomeParcial(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0]?.toUpperCase() ?? ""}.`;
}

async function hasProfileAccess(
  doctorId: string,
  patient: Patient,
  registry: PatientRegistry,
  evolutions: Evolution[],
): Promise<boolean> {
  if (registry.createdBy.type === "doctor" && registry.createdBy.id === doctorId) return true;
  if (evolutions.length > 0) return true;
  if (await hasActiveGrant(registry.globalId, doctorId, "perfil")) return true;
  return false;
}

type VinculoStatus = "sem_vinculo" | "sem_acesso" | "com_acesso";

async function toSearchResult(doctorId: string, r: PatientRegistry) {
  const localMatch = await findPatientByGlobalId(doctorId, r.globalId);
  let vinculoStatus: VinculoStatus = "sem_vinculo";
  if (localMatch) {
    const evolutions = await listEvolutions(doctorId, localMatch.id);
    const access = await hasProfileAccess(doctorId, localMatch, r, evolutions);
    vinculoStatus = access ? "com_acesso" : "sem_acesso";
  }
  return {
    globalId: r.globalId,
    nomeParcial: nomeParcial(r.fullName),
    idade: ageFrom(r.birthDate ?? null),
    // Distingue um registry de conta real do paciente (já usa o app) de um
    // shell criado por outro médico via pré-cadastro.
    jaTemPerfil: r.createdBy.type === "patient",
    vinculoStatus,
  };
}

const CPF_RE = /^\d{11}$/;
const RG_RE = /^\d{5,12}$/;
const LIFELINE_ID_RE = /^[A-Z]{3}\d{6}$/;

// Campo único com autodetecção de formato — nome, CPF, RG, e-mail ou
// LifeLine ID, nessa ordem de prioridade quando o texto bate mais de um.
export const searchPatientGlobal = createServerFn({ method: "POST" })
  .inputValidator(z.object({ token, query: z.string().min(2).max(160) }))
  .handler(async ({ data }) => {
    const doctor = await requireDoctor(data.token);
    if (!doctor) return UNAUTH;

    const raw = data.query.trim();
    const digitsOnly = /^\d+$/.test(raw);
    const codeNormalized = raw.replace(/[\s-]/g, "").toUpperCase();

    let registries: PatientRegistry[] = [];
    if (raw.includes("@")) {
      const r = await findRegistryByEmail(raw);
      registries = r ? [r] : [];
    } else if (digitsOnly && CPF_RE.test(raw)) {
      const r = await findRegistryByCpf(raw);
      registries = r ? [r] : [];
    } else if (LIFELINE_ID_RE.test(codeNormalized)) {
      const r = await findRegistryByPublicCode(codeNormalized);
      registries = r ? [r] : [];
    } else if (digitsOnly && RG_RE.test(raw)) {
      const r = await findRegistryByRg(raw);
      registries = r ? [r] : [];
    } else {
      registries = await searchRegistryByName(raw, 10);
    }

    const results = await Promise.all(registries.map((r) => toSearchResult(doctor.id, r)));
    return { ok: true as const, results };
  });

export const requestPatientAccess = createServerFn({ method: "POST" })
  .inputValidator(z.object({ token, globalId: z.string().min(1), purpose: z.enum(["perfil"]) }))
  .handler(async ({ data }) => {
    const doctor = await requireDoctor(data.token);
    if (!doctor) return UNAUTH;
    const registry = await findRegistryByGlobalId(data.globalId);
    if (!registry) return { ok: false as const, error: "not_found" as const };
    const request = await createAccessRequest(data.globalId, doctor.id, doctor.nome, data.purpose);
    return { ok: true as const, request };
  });

// Consome um token presencial (canal separado do vínculo em si) — sobe o
// paciente já vinculado de "sem_acesso" pra "com_acesso".
export const consumePresentialAccessToken = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({ token, globalId: z.string().min(1), accessCode: z.string().min(1).max(10) }),
  )
  .handler(async ({ data }) => {
    const doctor = await requireDoctor(data.token);
    if (!doctor) return UNAUTH;
    const tok = await findValidPresentialToken(data.globalId, "perfil", data.accessCode);
    if (!tok) return { ok: false as const, error: "invalid_or_expired_token" as const };
    await consumeToken(tok.id, doctor.id);
    return { ok: true as const };
  });

// Vincular é sempre permitido — sem token, sem checagem de elegibilidade. É
// só apontar o prontuário local pra identidade global; o ACESSO aos dados
// autodeclarados é decidido depois, por hasProfileAccess.
export const linkMyPatientToGlobalId = createServerFn({ method: "POST" })
  .inputValidator(z.object({ token, patientId: z.string().min(1), globalId: z.string().min(1) }))
  .handler(async ({ data }) => {
    const doctor = await requireDoctor(data.token);
    if (!doctor) return UNAUTH;
    const patient = await getPatient(doctor.id, data.patientId);
    if (!patient) return { ok: false as const, error: "not_found" as const };
    const registry = await findRegistryByGlobalId(data.globalId);
    if (!registry) return { ok: false as const, error: "not_found" as const };
    const linked = await linkPatientToGlobalId(doctor.id, data.patientId, data.globalId);
    if (!linked) return { ok: false as const, error: "already_linked_or_not_found" as const };
    return { ok: true as const, patient: linked };
  });

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

// BKL-37 — sobrepõe tipoSanguineo/alergias/pesoKg/alturaCm com o que o
// paciente autodeclarou no app, SE o médico tiver acesso liberado ao perfil
// (hasProfileAccess) — vínculo sozinho não basta.
async function withVinculo(doctorId: string, patients: Patient[]) {
  return Promise.all(
    patients.map(async (p) => {
      if (!p.globalId) return mergeAutodeclarado(p, undefined, false);
      const registry = await findRegistryByGlobalId(p.globalId);
      if (!registry) return mergeAutodeclarado(p, undefined, false);
      const evolutions = await listEvolutions(doctorId, p.id);
      const access = await hasProfileAccess(doctorId, p, registry, evolutions);
      return mergeAutodeclarado(p, registry, access);
    }),
  );
}

export const getWorkspace = createServerFn({ method: "POST" })
  .inputValidator(z.object({ token }))
  .handler(async ({ data }) => {
    const doctor = await requireDoctor(data.token);
    if (!doctor) return UNAUTH;
    const [patients, columns, appointments, charges, categories] = await Promise.all([
      listPatients(doctor.id, { includeArchived: true }),
      getBoardColumns(doctor.id),
      listAppointments(doctor.id),
      listCharges(doctor.id),
      listCategories(doctor.id),
    ]);
    return {
      ok: true as const,
      doctor: {
        nome: doctor.nome,
        email: doctor.email,
        avatarUrl: doctor.avatarUrl,
        preferredMetrics: doctor.preferredMetrics ?? [],
        calendarSettings: doctor.calendarSettings ?? DEFAULT_CALENDAR_SETTINGS,
      },
      patients: await withVinculo(doctor.id, patients),
      columns,
      appointments,
      charges,
      categories,
    };
  });

// Configuração da agenda (duração do slot, expediente) — antes só em
// localStorage por token, agora por médico (sincroniza entre dispositivos).
export const saveMyCalendarSettings = createServerFn({ method: "POST" })
  .inputValidator(
    z
      .object({
        token,
        slotMinutes: z.union([
          z.literal(15),
          z.literal(20),
          z.literal(30),
          z.literal(45),
          z.literal(60),
        ]),
        startHour: z.number().int().min(0).max(23),
        endHour: z.number().int().min(1).max(24),
        maxParallel: z
          .union([z.literal(1), z.literal(2), z.literal(3)])
          .optional()
          .default(1),
      })
      .refine((v) => v.startHour < v.endHour, {
        message: "startHour precisa ser antes de endHour",
      }),
  )
  .handler(async ({ data }) => {
    const doctor = await requireDoctor(data.token);
    if (!doctor) return UNAUTH;
    const settings: CalendarSettings = {
      slotMinutes: data.slotMinutes,
      startHour: data.startHour,
      endHour: data.endHour,
      maxParallel: data.maxParallel,
    };
    const updated = await updateDoctorCalendarSettings(doctor.id, settings);
    return updated
      ? {
          ok: true as const,
          calendarSettings: updated.calendarSettings ?? DEFAULT_CALENDAR_SETTINGS,
        }
      : { ok: false as const, error: "not_found" as const };
  });

// BUG-2: query dedicada pro calendário, sem passar pelo workspace inteiro
// (getWorkspace roda withVinculo, N+1 por paciente — caro só pra pegar
// agendamentos da janela visível).
export const listMyAppointments = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      token,
      from: z.string().refine((s) => !Number.isNaN(Date.parse(s)), "data inválida"),
      to: z.string().refine((s) => !Number.isNaN(Date.parse(s)), "data inválida"),
    }),
  )
  .handler(async ({ data }) => {
    const doctor = await requireDoctor(data.token);
    if (!doctor) return UNAUTH;
    const appointments = await listAppointmentsInRange(doctor.id, data.from, data.to);
    return { ok: true as const, appointments };
  });

// Métricas principais do header do prontuário (PRO-08) — nomes filtrados
// contra BIOMARKER_CATALOG; nomes desconhecidos são silenciosamente
// ignorados em vez de rejeitar a request inteira.
export const saveMyPreferredMetrics = createServerFn({ method: "POST" })
  .inputValidator(z.object({ token, metrics: z.array(z.string()).max(5) }))
  .handler(async ({ data }) => {
    const doctor = await requireDoctor(data.token);
    if (!doctor) return UNAUTH;
    const validNames = new Set<string>(BIOMARKER_CATALOG.map((b) => b.name));
    const metrics = data.metrics.filter((m) => validNames.has(m));
    const updated = await updateDoctorPreferredMetrics(doctor.id, metrics);
    return updated
      ? { ok: true as const, preferredMetrics: updated.preferredMetrics }
      : { ok: false as const, error: "not_found" as const };
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
      // BKL-37 — presente quando o médico já resolveu o vínculo global (busca
      // + token/elegibilidade) ANTES de criar o paciente localmente; ver
      // linkMyPatientToGlobalId sem patientId.
      globalId: z.string().min(1).optional(),
      ...CLINICAL_FIELDS,
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
      ...CLINICAL_FIELDS,
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
    return patient
      ? { ok: true as const, patient }
      : { ok: false as const, error: "not_found" as const };
  });

// "Minhas Notas" (PRO-01) — anotação do médico sobre o paciente, entre
// Histórico e Evolução no prontuário. Nunca exposta a rotas do paciente.
export const saveMyPatientNotes = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({ token, patientId: z.string().min(1), notasMedicas: z.string().max(4000) }),
  )
  .handler(async ({ data }) => {
    const doctor = await requireDoctor(data.token);
    if (!doctor) return UNAUTH;
    const patient = await updatePatient(doctor.id, data.patientId, {
      notasMedicas: data.notasMedicas.trim(),
    });
    return patient
      ? { ok: true as const, patient }
      : { ok: false as const, error: "not_found" as const };
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

const RECURRENCE = z
  .object({
    freq: z.enum(["none", "daily", "weekly", "monthly"]),
    count: z.number().int().min(0).max(23),
  })
  .optional();
const HEX_COLOR = z.string().regex(/^#[0-9a-fA-F]{6}$/, "cor precisa ser um hex válido (#rrggbb)");
const RECURRENCE_SCOPE = z.enum(["this", "following", "all"]).optional().default("this");
const LEMBRETES_MIN = z
  .array(
    z
      .number()
      .int()
      .min(0)
      .max(2 * 24 * 60),
  )
  .max(5);

export const scheduleAppointment = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      token,
      patientId: z.string().min(1).optional(),
      dateTime: z.string().refine((s) => !Number.isNaN(Date.parse(s)), "data/hora inválida"),
      note: z.string().max(200).nullish(),
      kind: z.enum(["consulta", "bloqueio"]).optional().default("consulta"),
      label: z.string().max(80).nullish(),
      durationMin: z.number().int().min(5).max(480).optional().default(30),
      allDay: z.boolean().optional().default(false),
      categoriaId: z.string().min(1).nullish(),
      cor: HEX_COLOR.nullish(),
      descricao: z.string().max(2000).nullish(),
      local: z.string().max(160).nullish(),
      lembretesMin: LEMBRETES_MIN.optional().default([]),
      recurrence: RECURRENCE,
      // BUG-13: chave de idempotência gerada uma vez no client por abertura
      // do dialog — duplo clique/retry com o mesmo requestId não duplica.
      requestId: z.string().min(1).max(100).optional(),
    }),
  )
  .handler(async ({ data }) => {
    const doctor = await requireDoctor(data.token);
    if (!doctor) return UNAUTH;
    const dateTimeIso = new Date(data.dateTime).toISOString();
    const recurrence = data.recurrence;
    const wantsRecurrence = recurrence && recurrence.freq !== "none" && recurrence.count > 0;

    if (data.kind === "bloqueio") {
      if (data.patientId) return { ok: false as const, error: "patient_not_allowed" as const };
      const input = {
        dateTime: dateTimeIso,
        note: data.note,
        kind: "bloqueio" as const,
        label: data.label,
        durationMin: data.allDay ? null : data.durationMin,
        allDay: data.allDay,
        categoriaId: data.categoriaId,
        cor: data.cor,
        descricao: data.descricao,
        local: data.local,
        lembretesMin: data.lembretesMin,
      };
      if (wantsRecurrence && recurrence) {
        const appointments = await createRecurringAppointments(
          doctor.id,
          input,
          { freq: recurrence.freq as "daily" | "weekly" | "monthly", count: recurrence.count },
          data.requestId,
        );
        return { ok: true as const, appointment: appointments[0], appointments };
      }
      const appointment = await createAppointment(doctor.id, input, data.requestId);
      return { ok: true as const, appointment };
    }

    if (!data.patientId) return { ok: false as const, error: "patient_required" as const };
    const patient = await getPatient(doctor.id, data.patientId);
    if (!patient) return { ok: false as const, error: "not_found" as const };

    // BUG-3: limite de consultas em paralelo no mesmo horário — bloqueio não
    // passa por aqui (kind "bloqueio" já retornou acima).
    const maxParallel =
      doctor.calendarSettings?.maxParallel ?? DEFAULT_CALENDAR_SETTINGS.maxParallel;
    const overlapping = await countOverlappingConsultas(doctor.id, dateTimeIso, data.durationMin);
    if (overlapping + 1 > maxParallel) {
      return { ok: false as const, error: "parallel_limit" as const };
    }

    if (wantsRecurrence && recurrence) {
      const appointments = await createRecurringAppointments(
        doctor.id,
        {
          patientId: data.patientId,
          dateTime: dateTimeIso,
          note: data.note,
          durationMin: data.allDay ? null : data.durationMin,
          allDay: data.allDay,
          lembretesMin: data.lembretesMin,
        },
        { freq: recurrence.freq as "daily" | "weekly" | "monthly", count: recurrence.count },
        data.requestId,
      );
      return { ok: true as const, appointment: appointments[0], appointments };
    }

    const appointment = await createAppointment(
      doctor.id,
      {
        patientId: data.patientId,
        dateTime: dateTimeIso,
        note: data.note,
        durationMin: data.allDay ? null : data.durationMin,
        allDay: data.allDay,
        lembretesMin: data.lembretesMin,
      },
      data.requestId,
    );
    return { ok: true as const, appointment };
  });

export const deleteMyAppointment = createServerFn({ method: "POST" })
  .inputValidator(z.object({ token, id: z.string().min(1), scope: RECURRENCE_SCOPE }))
  .handler(async ({ data }) => {
    const doctor = await requireDoctor(data.token);
    if (!doctor) return UNAUTH;
    const deletedCount = await deleteAppointment(doctor.id, data.id, data.scope);
    return deletedCount > 0
      ? { ok: true as const, deletedCount }
      : { ok: false as const, error: "not_found" as const };
  });

// Reabre o editor completo (dia/semana canvas ou lista) — diferente de
// updateMyAppointmentTiming (só dateTime/durationMin, drag/resize). Escopo de
// série (this/following/all) só importa quando o evento faz parte de uma
// série (recurrenceId); fora disso o servidor trata como "this" de qualquer forma.
export const updateMyAppointment = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      token,
      id: z.string().min(1),
      note: z.string().max(200).nullish(),
      label: z.string().max(80).nullish(),
      durationMin: z.number().int().min(5).max(480).nullish(),
      allDay: z.boolean().optional(),
      categoriaId: z.string().min(1).nullish(),
      cor: HEX_COLOR.nullish(),
      descricao: z.string().max(2000).nullish(),
      local: z.string().max(160).nullish(),
      lembretesMin: LEMBRETES_MIN.optional(),
      scope: RECURRENCE_SCOPE,
    }),
  )
  .handler(async ({ data }) => {
    const doctor = await requireDoctor(data.token);
    if (!doctor) return UNAUTH;
    const { token: _t, id, scope, ...patch } = data;
    const appointment = await updateAppointment(doctor.id, id, patch, scope);
    return appointment
      ? { ok: true as const, appointment }
      : { ok: false as const, error: "not_found" as const };
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

// Usado tanto por mover (drag, só dateTime) quanto por redimensionar (alça
// na borda do bloco, só durationMin) — cada chamador manda só o que mudou.
export const updateMyAppointmentTiming = createServerFn({ method: "POST" })
  .inputValidator(
    z
      .object({
        token,
        id: z.string().min(1),
        dateTime: z
          .string()
          .refine((s) => !Number.isNaN(Date.parse(s)), "data/hora inválida")
          .optional(),
        durationMin: z.number().int().min(5).max(480).optional(),
      })
      .refine((v) => v.dateTime !== undefined || v.durationMin !== undefined, {
        message: "informe dateTime e/ou durationMin",
      }),
  )
  .handler(async ({ data }) => {
    const doctor = await requireDoctor(data.token);
    if (!doctor) return UNAUTH;

    const dateTimeIso = data.dateTime ? new Date(data.dateTime).toISOString() : undefined;

    // BUG-3: mover/redimensionar uma consulta também precisa respeitar
    // maxParallel — o resultado final (novo horário e/ou nova duração)
    // não pode ultrapassar o limite do médico.
    if (dateTimeIso !== undefined || data.durationMin !== undefined) {
      const current = await getAppointment(doctor.id, data.id);
      if (!current) return { ok: false as const, error: "not_found" as const };
      if (current.kind === "consulta") {
        const finalDateTime = dateTimeIso ?? current.dateTime;
        const finalDuration = data.durationMin ?? current.durationMin ?? 30;
        const maxParallel =
          doctor.calendarSettings?.maxParallel ?? DEFAULT_CALENDAR_SETTINGS.maxParallel;
        const overlapping = await countOverlappingConsultas(
          doctor.id,
          finalDateTime,
          finalDuration,
          data.id,
        );
        if (overlapping + 1 > maxParallel) {
          return { ok: false as const, error: "parallel_limit" as const };
        }
      }
    }

    const appointment = await updateAppointmentTiming(doctor.id, data.id, {
      dateTime: dateTimeIso,
      durationMin: data.durationMin,
    });
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
  .inputValidator(z.object({ token, id: z.string().min(1), status: z.enum(["pendente", "pago"]) }))
  .handler(async ({ data }) => {
    const doctor = await requireDoctor(data.token);
    if (!doctor) return UNAUTH;
    const charge = await setChargeStatus(doctor.id, data.id, data.status);
    return charge
      ? { ok: true as const, charge }
      : { ok: false as const, error: "not_found" as const };
  });

export const generateChargePaymentLink = createServerFn({ method: "POST" })
  .inputValidator(z.object({ token, id: z.string().min(1), origin: z.string().max(200) }))
  .handler(async ({ data }) => {
    const doctor = await requireDoctor(data.token);
    if (!doctor) return UNAUTH;
    const charges = await listCharges(doctor.id);
    const charge = charges.find((c) => c.id === data.id);
    if (!charge) return { ok: false as const, error: "not_found" as const };
    const link = await createStripeCheckoutLink({
      descricao: charge.descricao,
      valorReais: charge.valor,
      successUrl: `${data.origin}/app/pacientes?pago=1`,
      cancelUrl: `${data.origin}/app/pacientes`,
    });
    if (!link.ok) return { ok: false as const, error: link.error, detail: link.detail };
    const updated = await setChargePaymentUrl(doctor.id, data.id, link.url);
    return updated
      ? { ok: true as const, charge: updated }
      : { ok: false as const, error: "not_found" as const };
  });

// ---------------------------------------------------------------------------
// Integrações — Memed (prescrição real) e WhatsApp Business (envio automático)
// ---------------------------------------------------------------------------

export const getMemedStatus = createServerFn({ method: "POST" })
  .inputValidator(z.object({ token }))
  .handler(async ({ data }) => {
    const doctor = await requireDoctor(data.token);
    if (!doctor) return UNAUTH;
    if (!isMemedConfigured()) return { ok: true as const, state: "not_configured" as const };
    if (!doctor.crm || !doctor.crmUf || !doctor.cpfMedico) {
      return { ok: true as const, state: "missing_profile" as const };
    }
    const result = await getMemedPrescriberToken(doctor);
    if (!result.ok) return { ok: true as const, state: "error" as const, detail: result.detail };
    return { ok: true as const, state: "ready" as const, memedToken: result.token };
  });

export const saveMemedProfile = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      token,
      crm: z.string().min(1).max(20),
      crmUf: z.string().length(2),
      cpfMedico: z.string().min(11).max(14),
      especialidade: z.string().min(2).max(80),
      crmCidade: z.string().min(2).max(80),
    }),
  )
  .handler(async ({ data }) => {
    const doctor = await requireDoctor(data.token);
    if (!doctor) return UNAUTH;
    const updated = await updateDoctorMemedProfile(doctor.id, {
      crm: data.crm,
      crmUf: data.crmUf,
      cpfMedico: data.cpfMedico,
      especialidade: data.especialidade,
      crmCidade: data.crmCidade,
    });
    // Perfil do prescritor mudou → o JWT em cache não vale mais.
    invalidateMemedToken(doctor.id);
    return updated ? { ok: true as const } : { ok: false as const, error: "not_found" as const };
  });

// Config para o componente client MemedPrescriptionWidget montar o embed
// real — token, scriptUrl e os dados de paciente/consultório já no formato
// exigido por setPaciente/setWorkplace. getMemedStatus continua sendo o
// endpoint "leve" só de status; este devolve o payload completo do widget.
export const getMemedWidgetConfig = createServerFn({ method: "POST" })
  .inputValidator(z.object({ token, patientId: z.string().min(1) }))
  .handler(async ({ data }) => {
    const doctor = await requireDoctor(data.token);
    if (!doctor) return UNAUTH;
    const patient = await getPatient(doctor.id, data.patientId);
    if (!patient) return { ok: false as const, error: "not_found" as const };
    if (!isMemedConfigured()) return { ok: false as const, error: "not_configured" as const };
    const result = await getMemedPrescriberToken(doctor);
    if (!result.ok) return { ok: false as const, error: result.error, detail: result.detail };
    // CPF inválido/incompleto quebra o setPaciente silenciosamente — sem 11
    // dígitos, envia withoutCpf em vez de mandar lixo para a Memed.
    const cpfDigits = (patient.cpf ?? "").replace(/\D/g, "");
    return {
      ok: true as const,
      token: result.token,
      scriptUrl: MEMED_SCRIPT_URL,
      likelyOffline: isMemedLikelyOffline(),
      patient: {
        idExterno: patient.id,
        nome: patient.nome,
        sexo:
          patient.sexo === "feminino"
            ? ("Feminino" as const)
            : patient.sexo === "masculino"
              ? ("Masculino" as const)
              : undefined,
        ...(cpfDigits.length === 11 ? { cpf: cpfDigits } : { withoutCpf: true as const }),
        data_nascimento: patient.nascimento
          ? patient.nascimento.split("-").reverse().join("/")
          : undefined,
        telefone: patient.telefone ?? undefined,
        email: patient.email ?? undefined,
      },
      // Local de atendimento sai impresso na receita (exigência do CFM) —
      // além de cidade/UF, manda o nome do consultório do prescritor.
      workplace: {
        city: doctor.crmCidade ?? undefined,
        state: doctor.crmUf ?? undefined,
        local_name: `Consultório ${doctor.nome}`,
      },
    };
  });

// Marca a receita como cancelada no prontuário quando a Memed emite
// prescricaoExcluida — antes o registro ficava listado como válido.
export const cancelMemedPrescriptionFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      token,
      evolutionId: z.string().min(1),
      memedPrescricaoId: z.string().min(1),
    }),
  )
  .handler(async ({ data }) => {
    const doctor = await requireDoctor(data.token);
    if (!doctor) return UNAUTH;
    const result = await cancelEvolutionPrescription(
      doctor.id,
      data.evolutionId,
      data.memedPrescricaoId,
    );
    if ("error" in result) return { ok: false as const, error: result.error };
    return { ok: true as const, evolution: result };
  });

// Grava no prontuário a referência da receita depois que a Memed assina
// (evento prescricaoImpressa do widget) — sem gerar código local, ver
// prescribeEvolutionMemed.
export const confirmMemedPrescription = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      token,
      evolutionId: z.string().min(1),
      patientId: z.string().min(1),
      memedPrescricaoId: z.string().min(1),
      medsResumo: z.array(z.string().max(200)).max(30),
      pdfUrl: z.string().url().nullish(),
    }),
  )
  .handler(async ({ data }) => {
    const doctor = await requireDoctor(data.token);
    if (!doctor) return UNAUTH;
    const patient = await getPatient(doctor.id, data.patientId);
    if (!patient) return { ok: false as const, error: "not_found" as const };
    const result = await prescribeEvolutionMemed(
      doctor.id,
      data.evolutionId,
      data.memedPrescricaoId,
      data.medsResumo,
      data.pdfUrl ?? null,
    );
    if ("error" in result) return { ok: false as const, error: result.error };
    return { ok: true as const, evolution: result };
  });

// Config para /app/memed-simulacao — prescritor e paciente sintéticos, nunca
// gravados em prontuário real. Exige sessão válida só para não deixar a rota
// anônima; NÃO exige crm/especialidade/etc. do médico logado.
export const getMemedSandboxConfig = createServerFn({ method: "POST" })
  .inputValidator(z.object({ token }))
  .handler(async ({ data }) => {
    const doctor = await requireDoctor(data.token);
    if (!doctor) return UNAUTH;
    const result = await getMemedSandboxToken();
    if (!result.ok) return { ok: false as const, error: result.error, detail: result.detail };
    return {
      ok: true as const,
      token: result.token,
      scriptUrl: MEMED_SCRIPT_URL,
      patient: {
        idExterno: "sandbox-patient",
        nome: "Paciente Teste",
        sexo: "Feminino" as const,
        cpf: "11144477735",
        data_nascimento: "01/01/1990",
        telefone: "11999999999",
        email: "paciente.teste@lifeline.doc",
      },
    };
  });

export const sendWhatsAppNow = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({ token, telefone: z.string().min(8).max(24), texto: z.string().min(1).max(1000) }),
  )
  .handler(async ({ data }) => {
    const doctor = await requireDoctor(data.token);
    if (!doctor) return UNAUTH;
    if (!isWhatsAppApiConfigured()) return { ok: false as const, error: "not_configured" as const };
    const result = await sendWhatsAppTextReal(data.telefone, data.texto);
    return result.ok
      ? { ok: true as const }
      : { ok: false as const, error: result.error, detail: result.detail };
  });

export const getIntegrationsStatus = createServerFn({ method: "POST" })
  .inputValidator(z.object({ token }))
  .handler(async ({ data }) => {
    const doctor = await requireDoctor(data.token);
    if (!doctor) return UNAUTH;
    return {
      ok: true as const,
      memed: isMemedConfigured(),
      whatsapp: isWhatsAppApiConfigured(),
      stripe: isStripeConfigured(),
    };
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
    const [evolutions, measurements, [merged]] = await Promise.all([
      listEvolutions(doctor.id, data.id),
      listMeasurements(doctor.id, data.id),
      withVinculo(doctor.id, [patient]),
    ]);
    return { ok: true as const, patient: merged, evolutions, measurements };
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
      servicosAplicados: z
        .array(
          z.object({
            serviceId: z.string().min(1),
            nome: z.string().max(80),
            preco: z.number(),
          }),
        )
        .max(10)
        .optional(),
    }),
  )
  .handler(async ({ data }) => {
    const doctor = await requireDoctor(data.token);
    if (!doctor) return UNAUTH;
    const patient = await getPatient(doctor.id, data.patientId);
    if (!patient) return { ok: false as const, error: "not_found" as const };
    if (data.evolutionId) {
      const r = await updateEvolution(
        doctor.id,
        data.evolutionId,
        data.evolucao,
        data.planoTerapeutico,
        data.servicosAplicados,
      );
      if ("error" in r) return { ok: false as const, error: r.error };
      return { ok: true as const, evolution: r };
    }
    const evolution = await createEvolution(
      doctor.id,
      data.patientId,
      data.evolucao,
      data.planoTerapeutico ?? "",
      data.servicosAplicados,
    );
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
      const a = await createAppointment(doctor.id, {
        patientId: carlos.id,
        dateTime: atLocal(0, 15, 30),
      });
      await setAppointmentStatus(doctor.id, a.id, "confirmada");
    }
    if (juliana) {
      const a = await createAppointment(doctor.id, {
        patientId: juliana.id,
        dateTime: atLocal(-6, 10),
      });
      await setAppointmentStatus(doctor.id, a.id, "faltou");
      await createCharge(doctor.id, {
        patientId: juliana.id,
        valor: 280,
        vencimento: ymdOffset(-10),
      });
    }
    if (roberto) {
      await createAppointment(doctor.id, { patientId: roberto.id, dateTime: atLocal(1, 9) });
      const c = await createCharge(doctor.id, {
        patientId: roberto.id,
        valor: 300,
        vencimento: ymdOffset(-3),
      });
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

// ---------------------------------------------------------------------------
// Extração de exames por IA (OCR/leitura de laudo)
// ---------------------------------------------------------------------------

export const extractExamDocument = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      token,
      fileBase64: z.string().min(1),
      mimeType: z.enum(["application/pdf", "image/jpeg", "image/png", "image/webp"]),
    }),
  )
  .handler(async ({ data }) => {
    const doctor = await requireDoctor(data.token);
    if (!doctor) return UNAUTH;
    try {
      const result = await extractBiomarkersFromDocument(data.fileBase64, data.mimeType);
      const items = await Promise.all(
        result.biomarkers.map(async (b) => {
          const match = resolveBiomarkerName(b.rawName);
          if (match) {
            // catálogo local já bateu — comportamento inalterado, mantém
            // faixa de referência calibrada do catálogo
            return {
              rawName: b.rawName,
              value: b.value,
              unit: match.unit ?? b.unit,
              refMin: match.min,
              refMax: match.max,
              matchedName: match.name,
              loincCode: match.loincCode ?? null,
              loincConfidence: match.loincCode ? ("exact" as const) : ("unmapped" as const),
            };
          }

          // catálogo não bateu — tenta LOINC como rede de segurança antes
          // de cair pra "não reconhecido" (intervenção manual)
          const loincMatch = await resolveLoincCode(b.rawName);
          return {
            rawName: b.rawName,
            value: b.value,
            unit: b.unit,
            refMin: null,
            refMax: null,
            // matchedName fica null propositalmente — sem faixa de
            // referência calibrada, o médico ainda precisa confirmar
            // manualmente o nome antes de virar biomarcador oficial, mas a
            // UI pode mostrar o nome LOINC sugerido (loincSuggestion) como
            // dica em vez de só "não reconhecido"
            matchedName: null,
            loincCode: loincMatch?.loincCode ?? null,
            loincConfidence: loincMatch ? loincMatch.confidence : ("unmapped" as const),
            loincSuggestion: loincMatch?.componentPt ?? null,
          };
        }),
      );
      return { ok: true as const, collectionDate: result.collectionDate, items };
    } catch (e) {
      return { ok: false as const, error: "extraction_failed" as const, detail: String(e) };
    }
  });

export const confirmExtractedMeasurements = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      token,
      patientId: z.string().min(1),
      date: YMD,
      label: z.string().max(80).optional().default("Exame · leitura por IA"),
      motivo: z.string().max(200).nullish(),
      items: z
        .array(
          z.object({
            name: z.string().min(1).max(60),
            value: z.number().finite(),
            unit: z.string().max(16),
            refMin: z.number().finite(),
            refMax: z.number().finite(),
          }),
        )
        .min(1)
        .max(200),
    }),
  )
  .handler(async ({ data }) => {
    const doctor = await requireDoctor(data.token);
    if (!doctor) return UNAUTH;
    const patient = await getPatient(doctor.id, data.patientId);
    if (!patient) return { ok: false as const, error: "not_found" as const };

    const existing = await listMeasurements(doctor.id, data.patientId);
    const seen = new Set(existing.map((m) => `${m.name}|${m.date}`));

    let added = 0;
    let skipped = 0;
    for (const item of data.items) {
      const key = `${item.name}|${data.date}`;
      if (seen.has(key)) {
        skipped++;
        continue;
      }
      await addMeasurement(doctor.id, {
        patientId: data.patientId,
        name: item.name,
        unit: item.unit,
        value: item.value,
        refMin: item.refMin,
        refMax: item.refMax,
        date: data.date,
        label: data.label,
        motivo: data.motivo || null,
      });
      seen.add(key);
      added++;
    }
    await bumpExams(doctor.id, data.patientId, added);
    return { ok: true as const, added, skipped };
  });
