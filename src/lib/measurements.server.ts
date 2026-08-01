// Server-only: resultados de exames (biomarcadores) por paciente — Postgres
// (tabela `measurements`, RLS deny-all/service-role-only). Cada linha carrega
// a própria faixa de referência — o gráfico e o status do evento são
// derivados, nunca gravados.
//
// DAT-02: a tabela já existia no Postgres (com RLS) desde uma migração
// anterior, mas o app nunca foi religado pra usá-la — este arquivo
// substitui o antigo measurements.json local.

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Measurement } from "./clinic-types";

type Row = {
  id: string;
  doctor_id: string;
  patient_id: string;
  name: string;
  unit: string;
  value: number;
  ref_min: number;
  ref_max: number;
  date: string;
  label: string;
  motivo: string | null;
  loinc_code: string | null;
  loinc_confidence: string;
  created_at: string;
};

function fromRow(row: Row): Measurement {
  return {
    id: row.id,
    doctorId: row.doctor_id,
    patientId: row.patient_id,
    name: row.name,
    unit: row.unit,
    value: row.value,
    refMin: row.ref_min,
    refMax: row.ref_max,
    date: row.date,
    label: row.label,
    motivo: row.motivo,
    loincCode: row.loinc_code,
    loincConfidence: (row.loinc_confidence as Measurement["loincConfidence"]) ?? "unmapped",
    createdAt: row.created_at,
  };
}

export async function listMeasurements(doctorId: string, patientId: string): Promise<Measurement[]> {
  const { data, error } = await supabaseAdmin
    .from("measurements")
    .select("*")
    .eq("doctor_id", doctorId)
    .eq("patient_id", patientId)
    .order("date", { ascending: true });
  if (error) throw new Error(`Falha ao listar biomarcadores: ${error.message}`);
  return (data ?? []).map(fromRow);
}

export async function addMeasurement(
  doctorId: string,
  input: {
    patientId: string;
    name: string;
    unit: string;
    value: number;
    refMin: number;
    refMax: number;
    date: string;
    label: string;
    motivo?: string | null;
    loincCode?: string | null;
    loincConfidence?: Measurement["loincConfidence"];
  },
): Promise<Measurement> {
  const { data, error } = await supabaseAdmin
    .from("measurements")
    .insert({
      doctor_id: doctorId,
      patient_id: input.patientId,
      name: input.name,
      unit: input.unit,
      value: input.value,
      ref_min: input.refMin,
      ref_max: input.refMax,
      date: input.date,
      label: input.label,
      motivo: input.motivo ?? null,
      loinc_code: input.loincCode ?? null,
      loinc_confidence: input.loincConfidence ?? "unmapped",
    })
    .select("*")
    .single();
  if (error || !data) throw new Error(`Falha ao salvar biomarcador: ${error?.message}`);
  return fromRow(data);
}

export async function removeMeasurement(doctorId: string, id: string): Promise<boolean> {
  const { error, count } = await supabaseAdmin
    .from("measurements")
    .delete({ count: "exact" })
    .eq("id", id)
    .eq("doctor_id", doctorId);
  if (error) throw new Error(`Falha ao remover biomarcador: ${error.message}`);
  return (count ?? 0) > 0;
}
