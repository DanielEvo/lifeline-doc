// Draft de biomarcadores enviados pelo paciente (TECH-13) — Postgres (tabela
// `patient_pending_measurements`, RLS deny-all/service-role-only). Fica
// SEPARADO de `measurements` (histórico clínico validado pelo médico). Todo
// item nasce com confirmedByDoctor:false; a promoção pro histórico oficial
// acontece no lado do médico.
//
// DAT-02: a tabela já existia no Postgres (com RLS) desde uma migração
// anterior, mas o app nunca foi religado pra usá-la — este arquivo
// substitui o antigo patient_pending_measurements.json local.

import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type PendingMeasurement = {
  id: string;
  globalId: string;
  rawName: string;
  matchedName: string | null;
  value: number;
  unit: string;
  refMin: number | null;
  refMax: number | null;
  collectionDate: string | null;
  confirmedByDoctor: boolean;
  loincCode: string | null;
  loincConfidence: "exact" | "fuzzy" | "unmapped";
  createdAt: string;
};

type Row = {
  id: string;
  global_id: string;
  raw_name: string;
  matched_name: string | null;
  value: number;
  unit: string;
  ref_min: number | null;
  ref_max: number | null;
  collection_date: string | null;
  confirmed_by_doctor: boolean;
  loinc_code: string | null;
  loinc_confidence: string;
  created_at: string;
};

function fromRow(row: Row): PendingMeasurement {
  return {
    id: row.id,
    globalId: row.global_id,
    rawName: row.raw_name,
    matchedName: row.matched_name,
    value: row.value,
    unit: row.unit,
    refMin: row.ref_min,
    refMax: row.ref_max,
    collectionDate: row.collection_date,
    confirmedByDoctor: row.confirmed_by_doctor,
    loincCode: row.loinc_code,
    loincConfidence: (row.loinc_confidence as PendingMeasurement["loincConfidence"]) ?? "unmapped",
    createdAt: row.created_at,
  };
}

export type PendingInput = {
  rawName: string;
  matchedName: string | null;
  value: number;
  unit: string;
  refMin: number | null;
  refMax: number | null;
  collectionDate: string | null;
  loincCode?: string | null;
  loincConfidence?: PendingMeasurement["loincConfidence"];
};

export async function addPendingMeasurements(
  globalId: string,
  items: PendingInput[],
): Promise<PendingMeasurement[]> {
  const { data, error } = await supabaseAdmin
    .from("patient_pending_measurements")
    .insert(
      items.map((i) => ({
        global_id: globalId,
        raw_name: i.rawName,
        matched_name: i.matchedName,
        value: i.value,
        unit: i.unit,
        ref_min: i.refMin,
        ref_max: i.refMax,
        collection_date: i.collectionDate,
        confirmed_by_doctor: false,
        loinc_code: i.loincCode ?? null,
        loinc_confidence: i.loincConfidence ?? "unmapped",
      })),
    )
    .select("*");
  if (error) throw new Error(`Falha ao salvar exames pendentes: ${error.message}`);
  return (data ?? []).map(fromRow);
}

export async function listPendingMeasurements(globalId: string): Promise<PendingMeasurement[]> {
  const { data, error } = await supabaseAdmin
    .from("patient_pending_measurements")
    .select("*")
    .eq("global_id", globalId);
  if (error) throw new Error(`Falha ao listar exames pendentes: ${error.message}`);
  return (data ?? [])
    .map(fromRow)
    .sort((a, b) => (b.collectionDate ?? b.createdAt).localeCompare(a.collectionDate ?? a.createdAt));
}
