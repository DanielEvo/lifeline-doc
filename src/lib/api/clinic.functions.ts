// Server functions da plataforma real do médico. TODAS exigem o token de
// sessão e resolvem o médico no servidor — o doctorId nunca vem do cliente.
// Métodos POST em tudo para o token nunca aparecer em URL/logs.

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
  type ClinicColumn,
} from "../patients.server";
import {
  createEvolution,
  listEvolutions,
  prescribeEvolution,
  sealEvolution,
  updateEvolution,
} from "../records.server";
import { extractTriage } from "../triage.server";

const token = z.string().min(1).max(80);
const COLUMN = z.enum(["triagem", "atendimento", "aguardando", "retorno", "estavel"]);

const patientFields = {
  nome: z.string().min(2).max(120),
  nascimento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
  sexo: z.enum(["feminino", "masculino", "outro"]).nullish(),
  cpf: z.string().max(20).nullish(),
  telefone: z.string().max(24).nullish(),
  email: z.string().email().max(160).nullish(),
  queixa: z.string().max(300).optional().default(""),
  column: COLUMN.optional(),
};

const UNAUTH = { ok: false as const, error: "unauthorized" as const };

export const getWorkspace = createServerFn({ method: "POST" })
  .inputValidator(z.object({ token, includeArchived: z.boolean().optional() }))
  .handler(async ({ data }) => {
    const doctor = await requireDoctor(data.token);
    if (!doctor) return UNAUTH;
    const patients = await listPatients(doctor.id, { includeArchived: data.includeArchived });
    return {
      ok: true as const,
      doctor: { nome: doctor.nome, email: doctor.email, avatarUrl: doctor.avatarUrl },
      patients,
    };
  });

export const createMyPatient = createServerFn({ method: "POST" })
  .inputValidator(z.object({ token, ...patientFields }))
  .handler(async ({ data }) => {
    const doctor = await requireDoctor(data.token);
    if (!doctor) return UNAUTH;
    const { token: _t, ...input } = data;
    const patient = await createPatient(doctor.id, input);
    return { ok: true as const, patient };
  });

export const updateMyPatient = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      token,
      id: z.string().min(1),
      nome: z.string().min(2).max(120).optional(),
      nascimento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
      sexo: z.enum(["feminino", "masculino", "outro"]).nullish(),
      cpf: z.string().max(20).nullish(),
      telefone: z.string().max(24).nullish(),
      email: z.string().email().max(160).nullish(),
      queixa: z.string().max(300).optional(),
      column: COLUMN.optional(),
      adherence: z.number().min(0).max(100).nullish(),
      criticalFlag: z.string().max(160).nullish(),
    }),
  )
  .handler(async ({ data }) => {
    const doctor = await requireDoctor(data.token);
    if (!doctor) return UNAUTH;
    const { token: _t, id, ...patch } = data;
    const patient = await updatePatient(doctor.id, id, patch);
    return patient ? { ok: true as const, patient } : { ok: false as const, error: "not_found" as const };
  });

export const moveMyPatient = createServerFn({ method: "POST" })
  .inputValidator(z.object({ token, id: z.string().min(1), to: COLUMN }))
  .handler(async ({ data }) => {
    const doctor = await requireDoctor(data.token);
    if (!doctor) return UNAUTH;
    const ok = await movePatient(doctor.id, data.id, data.to as ClinicColumn);
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

// Triagem IA real: extrai queixa estruturada da mensagem do paciente e,
// se `criar` vier true, já registra o paciente no painel do médico.
export const triageIntake = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      token,
      message: z.string().min(3).max(2000),
      nome: z.string().min(2).max(120).optional(),
      nascimento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
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
    const patient = await createPatient(doctor.id, {
      nome: data.nome,
      nascimento: data.nascimento,
      telefone: data.telefone,
      queixa: triage.complaint || data.message.slice(0, 120),
      column: triage.suggestedColumn === "atendimento" ? "atendimento" : "triagem",
      criticalFlag: triage.redFlags.length ? triage.redFlags.join(" · ") : null,
      briefing: triage.summary,
    });
    return { ok: true as const, triage, patient };
  });

export const importSamplePatients = createServerFn({ method: "POST" })
  .inputValidator(z.object({ token }))
  .handler(async ({ data }) => {
    const doctor = await requireDoctor(data.token);
    if (!doctor) return UNAUTH;
    const added = await importSamples(doctor.id);
    return { ok: true as const, added };
  });
