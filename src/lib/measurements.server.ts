// Server-only: resultados de exames (biomarcadores) por paciente. Cada linha
// carrega a própria faixa de referência — o gráfico e o status do evento são
// derivados, nunca gravados.

import { mutateRows, newId, nowIso, readRows } from "./db.server";
import type { Measurement } from "./clinic-types";

const FILE = "measurements.json";

export async function listMeasurements(doctorId: string, patientId: string): Promise<Measurement[]> {
  const rows = await readRows<Measurement>(FILE);
  return rows
    .filter((m) => m.doctorId === doctorId && m.patientId === patientId)
    .sort((a, b) => a.date.localeCompare(b.date));
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
  },
): Promise<Measurement> {
  const m: Measurement = { id: newId(), doctorId, ...input, createdAt: nowIso() };
  await mutateRows<Measurement>(FILE, (rows) => {
    rows.push(m);
  });
  return m;
}

export async function removeMeasurement(doctorId: string, id: string): Promise<boolean> {
  let ok = false;
  await mutateRows<Measurement>(FILE, (rows) => {
    const i = rows.findIndex((m) => m.id === id && m.doctorId === doctorId);
    if (i < 0) return;
    rows.splice(i, 1);
    ok = true;
  });
  return ok;
}
