// Draft de biomarcadores enviados pelo paciente (TECH-13).
// Fica em patient_pending_measurements.json — NUNCA em measurements.json,
// que é o histórico clínico validado pelo médico. Todo item nasce com
// confirmedByDoctor:false; a promoção para o histórico oficial acontece
// no lado do médico, em outra rodada.

import { mutateRows, newId, nowIso, readRows } from "./db.server";

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
  createdAt: string;
};

const PENDING = "patient_pending_measurements.json";

export type PendingInput = {
  rawName: string;
  matchedName: string | null;
  value: number;
  unit: string;
  refMin: number | null;
  refMax: number | null;
  collectionDate: string | null;
};

export async function addPendingMeasurements(
  globalId: string,
  items: PendingInput[],
): Promise<PendingMeasurement[]> {
  const now = nowIso();
  const created: PendingMeasurement[] = items.map((i) => ({
    id: newId(),
    globalId,
    rawName: i.rawName,
    matchedName: i.matchedName,
    value: i.value,
    unit: i.unit,
    refMin: i.refMin,
    refMax: i.refMax,
    collectionDate: i.collectionDate,
    confirmedByDoctor: false,
    createdAt: now,
  }));
  await mutateRows<PendingMeasurement>(PENDING, (rows) => {
    rows.push(...created);
  });
  return created;
}

export async function listPendingMeasurements(globalId: string): Promise<PendingMeasurement[]> {
  const rows = await readRows<PendingMeasurement>(PENDING);
  return rows
    .filter((r) => r.globalId === globalId)
    .sort((a, b) => (b.collectionDate ?? b.createdAt).localeCompare(a.collectionDate ?? a.createdAt));
}
