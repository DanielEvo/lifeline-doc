// Server-only: agenda de consultas por médico. Uma consulta pertence a um
// paciente e tem status simples (agendada → confirmada → realizada | faltou).
// "Faltou" alimenta a visão de reengajamento no painel de pacientes.
//
// Antes vivia em .data/appointments.json via db.server.ts — cujo persist()
// engole falha de escrita num catch{} vazio (comentário do próprio arquivo:
// "filesystem unavailable (edge runtime) — keep the in-memory copy"), ou
// seja perda de dado real em runtime edge. Migrado pra Postgres, mesmo
// padrão de criterios/docs/publications. `id`/`recurrence_id` continuam
// gerados por newId() (não são UUID) — ids de dados antigos (.data/appointments.json)
// foram preservados 1:1 na migração (scripts/migrate-appointments.ts), sem
// remapear nada.

import { nowIso, newId } from "./db.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type {
  Appointment,
  AppointmentStatus,
  RecurrenceFreq,
  RecurrenceScope,
} from "./clinic-types";

const DEFAULT_DURATION_MIN = 30;

// Update parcial da tabela — supabase-js rejeita Record<string, unknown> (não
// bate com o tipo gerado em types.ts), então tipamos explicitamente os campos
// que os patches abaixo de fato tocam.
type AppointmentUpdate = Partial<{
  updated_at: string;
  note: string | null;
  label: string | null;
  duration_min: number | null;
  all_day: boolean;
  categoria_id: string | null;
  cor: string | null;
  descricao: string | null;
  local: string | null;
  tipo_atendimento_id: string | null;
  lembretes_min: number[];
  date_time: string;
}>;

type AppointmentRow = {
  id: string;
  doctor_id: string;
  patient_id: string | null;
  date_time: string;
  duration_min: number | null;
  all_day: boolean;
  status: string;
  note: string | null;
  kind: string;
  label: string | null;
  categoria_id: string | null;
  cor: string | null;
  descricao: string | null;
  local: string | null;
  tipo_atendimento_id: string | null;
  recurrence_id: string | null;
  lembretes_min: number[];
  created_at: string;
  updated_at: string;
};

function fromRow(row: AppointmentRow): Appointment {
  return {
    id: row.id,
    doctorId: row.doctor_id,
    patientId: row.patient_id,
    dateTime: row.date_time,
    durationMin: row.duration_min,
    allDay: row.all_day,
    status: row.status as AppointmentStatus,
    note: row.note,
    kind: row.kind as "consulta" | "bloqueio",
    label: row.label,
    categoriaId: row.categoria_id,
    cor: row.cor,
    descricao: row.descricao,
    local: row.local,
    tipoAtendimentoId: row.tipo_atendimento_id,
    recurrenceId: row.recurrence_id,
    lembretesMin: row.lembretes_min ?? [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listAppointments(doctorId: string): Promise<Appointment[]> {
  const { data, error } = await supabaseAdmin
    .from("appointments")
    .select("*")
    .eq("doctor_id", doctorId)
    .order("date_time", { ascending: true });
  if (error) throw new Error(`Falha ao listar agenda: ${error.message}`);
  return (data ?? []).map(fromRow);
}

/** Mesma listagem, mas restrita a um range de datas — usada pelo calendário
 *  pra parar de depender do workspace inteiro (getWorkspace) só pra pegar
 *  agendamentos da janela visível. */
export async function listAppointmentsInRange(
  doctorId: string,
  from: string,
  to: string,
): Promise<Appointment[]> {
  const { data, error } = await supabaseAdmin
    .from("appointments")
    .select("*")
    .eq("doctor_id", doctorId)
    .gte("date_time", from)
    .lte("date_time", to)
    .order("date_time", { ascending: true });
  if (error) throw new Error(`Falha ao listar agenda: ${error.message}`);
  return (data ?? []).map(fromRow);
}

export async function getAppointment(
  doctorId: string,
  id: string,
): Promise<Appointment | undefined> {
  const { data, error } = await supabaseAdmin
    .from("appointments")
    .select("*")
    .eq("id", id)
    .eq("doctor_id", doctorId)
    .maybeSingle();
  if (error) throw new Error(`Falha ao buscar agendamento: ${error.message}`);
  return data ? fromRow(data) : undefined;
}

/** Quantas consultas (kind="consulta") do médico têm intervalo
 *  [dateTime, dateTime+durationMin) sobreposto ao candidato — usado pra
 *  validar maxParallel. Bloqueio não entra aqui (isso é bloqueioAt, no
 *  client, um mecanismo diferente). Janela de busca limitada a ±8h em volta
 *  do candidato (duração máxima de um evento é 480min/8h) pra não escanear a
 *  agenda inteira. */
export async function countOverlappingConsultas(
  doctorId: string,
  dateTime: string,
  durationMin: number,
  excludeId?: string,
): Promise<number> {
  const start = new Date(dateTime).getTime();
  const end = start + durationMin * 60_000;
  const windowStart = new Date(start - 8 * 60 * 60_000).toISOString();
  const windowEnd = new Date(end).toISOString();

  let query = supabaseAdmin
    .from("appointments")
    .select("id, date_time, duration_min")
    .eq("doctor_id", doctorId)
    .eq("kind", "consulta")
    .gte("date_time", windowStart)
    .lt("date_time", windowEnd);
  if (excludeId) query = query.neq("id", excludeId);

  const { data, error } = await query;
  if (error) throw new Error(`Falha ao checar sobreposição: ${error.message}`);

  return (data ?? []).filter((r) => {
    const rStart = new Date(r.date_time).getTime();
    const rEnd = rStart + (r.duration_min ?? DEFAULT_DURATION_MIN) * 60_000;
    return rStart < end && rEnd > start;
  }).length;
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
  tipoAtendimentoId?: string | null;
  lembretesMin?: number[];
};

function buildRow(doctorId: string, input: CreateAppointmentInput, now: string) {
  const allDay = input.allDay ?? false;
  return {
    id: newId(),
    doctor_id: doctorId,
    patient_id: input.patientId ?? null,
    date_time: input.dateTime,
    status: "agendada",
    note: input.note?.trim() || null,
    kind: input.kind ?? "consulta",
    label: input.label?.trim() || null,
    recurrence_id: input.recurrenceId ?? null,
    duration_min: allDay ? null : (input.durationMin ?? DEFAULT_DURATION_MIN),
    all_day: allDay,
    categoria_id: input.categoriaId ?? null,
    cor: input.cor ?? null,
    descricao: input.descricao?.trim() || null,
    local: input.local?.trim() || null,
    tipo_atendimento_id: input.tipoAtendimentoId ?? null,
    lembretes_min: input.lembretesMin ?? [],
    created_at: now,
    updated_at: now,
  };
}

/** BUG-13: requestId é a chave de idempotência — gerada uma vez no client
 *  por abertura do dialog de criação. Se o mesmo requestId chegar duas vezes
 *  (duplo clique, retry de rede), o unique index (doctor_id, request_id)
 *  rejeita o segundo INSERT com 23505 e devolvemos o agendamento já criado
 *  em vez de duplicar. */
export async function createAppointment(
  doctorId: string,
  input: CreateAppointmentInput,
  requestId?: string,
): Promise<Appointment> {
  const row = { ...buildRow(doctorId, input, nowIso()), request_id: requestId ?? null };
  const { data, error } = await supabaseAdmin.from("appointments").insert(row).select("*").single();
  if (error) {
    if (requestId && error.code === "23505") {
      const existing = await findByRequestId(doctorId, requestId);
      if (existing) return existing;
    }
    throw new Error(`Falha ao criar agendamento: ${error.message}`);
  }
  return fromRow(data);
}

async function findByRequestId(
  doctorId: string,
  requestId: string,
): Promise<Appointment | undefined> {
  const { data, error } = await supabaseAdmin
    .from("appointments")
    .select("*")
    .eq("doctor_id", doctorId)
    .eq("request_id", requestId)
    .maybeSingle();
  if (error) throw new Error(`Falha ao buscar agendamento existente: ${error.message}`);
  return data ? fromRow(data) : undefined;
}

/** Passo de data por frequência — "daily"/"weekly" usam setDate, que avança o
 *  campo de calendário (não milissegundos brutos), então DST não desloca o
 *  horário. "monthly" precisava de tratamento manual (BUG-7): setMonth sem
 *  clamp faz dia 31 + 1 mês (fev, 28/29 dias) virar 2 ou 3 de março em vez de
 *  ficar no último dia de fevereiro. Construir a data alvo por componentes
 *  locais (ano/mês/dia/hora) também evita qualquer surpresa de fuso. */
function stepDate(base: Date, freq: Exclude<RecurrenceFreq, "none">, n: number): Date {
  const d = new Date(base);
  if (freq === "daily") {
    d.setDate(d.getDate() + n);
    return d;
  }
  if (freq === "weekly") {
    d.setDate(d.getDate() + n * 7);
    return d;
  }
  // monthly
  const targetMonthIndex = d.getMonth() + n;
  const lastDayOfTargetMonth = new Date(d.getFullYear(), targetMonthIndex + 1, 0).getDate();
  return new Date(
    d.getFullYear(),
    targetMonthIndex,
    Math.min(d.getDate(), lastDayOfTargetMonth),
    d.getHours(),
    d.getMinutes(),
    d.getSeconds(),
    d.getMilliseconds(),
  );
}

/** Gera 1 + count ocorrências (mesma hora, avançando por freq), todas com o
 *  mesmo recurrenceId — usado tanto por consulta quanto por evento pessoal.
 *  BUG-13: cada ocorrência ganha "<requestId>:<indice>" como request_id, pra
 *  o retry/duplo-clique da série inteira ser idempotente linha a linha. */
export async function createRecurringAppointments(
  doctorId: string,
  input: CreateAppointmentInput,
  recurrence: { freq: Exclude<RecurrenceFreq, "none">; count: number },
  requestId?: string,
): Promise<Appointment[]> {
  const recurrenceId = newId();
  const base = new Date(input.dateTime);
  const now = nowIso();
  const rows = Array.from({ length: recurrence.count + 1 }, (_, i) => ({
    ...buildRow(
      doctorId,
      { ...input, dateTime: stepDate(base, recurrence.freq, i).toISOString(), recurrenceId },
      now,
    ),
    request_id: requestId ? `${requestId}:${i}` : null,
  }));
  const { data, error } = await supabaseAdmin.from("appointments").insert(rows).select("*");
  if (error) {
    if (requestId && error.code === "23505") {
      const existing = await findByRequestIdPrefix(doctorId, requestId);
      if (existing.length > 0) return existing;
    }
    throw new Error(`Falha ao criar série de agendamentos: ${error.message}`);
  }
  return data.map(fromRow);
}

async function findByRequestIdPrefix(doctorId: string, requestId: string): Promise<Appointment[]> {
  const { data, error } = await supabaseAdmin
    .from("appointments")
    .select("*")
    .eq("doctor_id", doctorId)
    .like("request_id", `${requestId}:%`)
    .order("date_time", { ascending: true });
  if (error) throw new Error(`Falha ao buscar série já criada: ${error.message}`);
  return (data ?? []).map(fromRow);
}

/** scope "this" apaga só a ocorrência; "following" apaga essa e as
 *  seguintes da mesma série (por dateTime); "all" apaga a série inteira.
 *  Fora de uma série (recurrenceId null), scope é sempre tratado como "this". */
export async function deleteAppointment(
  doctorId: string,
  id: string,
  scope: RecurrenceScope = "this",
): Promise<number> {
  const { data: target, error: targetError } = await supabaseAdmin
    .from("appointments")
    .select("id, date_time, recurrence_id")
    .eq("id", id)
    .eq("doctor_id", doctorId)
    .maybeSingle();
  if (targetError) throw new Error(`Falha ao buscar agendamento: ${targetError.message}`);
  if (!target) return 0;

  let ids = [target.id];
  if (scope !== "this" && target.recurrence_id) {
    let query = supabaseAdmin
      .from("appointments")
      .select("id")
      .eq("doctor_id", doctorId)
      .eq("recurrence_id", target.recurrence_id);
    if (scope !== "all") query = query.gte("date_time", target.date_time);
    const { data: siblings, error: siblingsError } = await query;
    if (siblingsError) throw new Error(`Falha ao buscar série: ${siblingsError.message}`);
    ids = (siblings ?? []).map((s) => s.id);
  }

  const { error, count } = await supabaseAdmin
    .from("appointments")
    .delete({ count: "exact" })
    .in("id", ids);
  if (error) throw new Error(`Falha ao remover agendamento: ${error.message}`);
  return count ?? 0;
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
  tipoAtendimentoId?: string | null;
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
  const { data: target, error: targetError } = await supabaseAdmin
    .from("appointments")
    .select("id, date_time, recurrence_id")
    .eq("id", id)
    .eq("doctor_id", doctorId)
    .maybeSingle();
  if (targetError) throw new Error(`Falha ao buscar agendamento: ${targetError.message}`);
  if (!target) return undefined;

  let ids = [target.id];
  if (scope !== "this" && target.recurrence_id) {
    let query = supabaseAdmin
      .from("appointments")
      .select("id")
      .eq("doctor_id", doctorId)
      .eq("recurrence_id", target.recurrence_id);
    if (scope !== "all") query = query.gte("date_time", target.date_time);
    const { data: siblings, error: siblingsError } = await query;
    if (siblingsError) throw new Error(`Falha ao buscar série: ${siblingsError.message}`);
    ids = (siblings ?? []).map((s) => s.id);
  }

  const patchRow: AppointmentUpdate = { updated_at: nowIso() };
  if (patch.note !== undefined) patchRow.note = patch.note;
  if (patch.label !== undefined) patchRow.label = patch.label;
  if (patch.durationMin !== undefined) patchRow.duration_min = patch.durationMin;
  if (patch.allDay !== undefined) patchRow.all_day = patch.allDay;
  if (patch.categoriaId !== undefined) patchRow.categoria_id = patch.categoriaId;
  if (patch.cor !== undefined) patchRow.cor = patch.cor;
  if (patch.descricao !== undefined) patchRow.descricao = patch.descricao;
  if (patch.local !== undefined) patchRow.local = patch.local;
  if (patch.tipoAtendimentoId !== undefined) patchRow.tipo_atendimento_id = patch.tipoAtendimentoId;
  if (patch.lembretesMin !== undefined) patchRow.lembretes_min = patch.lembretesMin;

  const { data: updatedRows, error } = await supabaseAdmin
    .from("appointments")
    .update(patchRow)
    .in("id", ids)
    .select("*");
  if (error) throw new Error(`Falha ao atualizar agendamento: ${error.message}`);
  const updated = updatedRows?.find((r) => r.id === id);
  return updated ? fromRow(updated) : undefined;
}

export async function setAppointmentStatus(
  doctorId: string,
  id: string,
  status: AppointmentStatus,
): Promise<Appointment | undefined> {
  const { data, error } = await supabaseAdmin
    .from("appointments")
    .update({ status, updated_at: nowIso() })
    .eq("id", id)
    .eq("doctor_id", doctorId)
    .select("*")
    .maybeSingle();
  if (error) throw new Error(`Falha ao atualizar status: ${error.message}`);
  return data ? fromRow(data) : undefined;
}

/** Usado tanto por mover (só dateTime, drag) quanto por redimensionar (só
 *  durationMin, alça na borda do bloco) — cada chamador manda só o campo
 *  que mudou. */
export async function updateAppointmentTiming(
  doctorId: string,
  id: string,
  patch: { dateTime?: string; durationMin?: number },
): Promise<Appointment | undefined> {
  const patchRow: AppointmentUpdate = { updated_at: nowIso() };
  if (patch.dateTime !== undefined) patchRow.date_time = patch.dateTime;
  if (patch.durationMin !== undefined) patchRow.duration_min = patch.durationMin;

  const { data, error } = await supabaseAdmin
    .from("appointments")
    .update(patchRow)
    .eq("id", id)
    .eq("doctor_id", doctorId)
    .select("*")
    .maybeSingle();
  if (error) throw new Error(`Falha ao atualizar horário: ${error.message}`);
  return data ? fromRow(data) : undefined;
}
