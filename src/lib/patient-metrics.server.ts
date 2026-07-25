// Métricas de autocuidado autodeclaradas pelo paciente (feature "Métricas de
// autocuidado" da Início do app do paciente). Fica em patient_metrics.json.
// Mesmo padrão de patient-medications.server.ts: mutateRows/readRows/newId/
// nowIso de "./db.server".

import { mutateRows, newId, nowIso, readRows } from "./db.server";

// Só estas 4 no MVP — SEM cruzamento com adesão de remédios (decisão de
// escopo desta rodada). Cada métrica é 100% autodeclarada.
export type MetricKind = "passos" | "hidratacao" | "sono" | "fc";

export type PatientMetricEntry = {
  id: string;
  globalId: string;
  date: string;
  kind: MetricKind;
  value: number;
  updatedAt: string;
};

const METRICS = "patient_metrics.json";

export async function setMetric(
  globalId: string,
  date: string,
  kind: MetricKind,
  value: number,
): Promise<PatientMetricEntry> {
  let result!: PatientMetricEntry;
  await mutateRows<PatientMetricEntry>(METRICS, (rows) => {
    const existing = rows.find(
      (r) => r.globalId === globalId && r.date === date && r.kind === kind,
    );
    if (existing) {
      Object.assign(existing, { value, updatedAt: nowIso() });
      result = existing;
      return rows;
    }
    const created: PatientMetricEntry = {
      id: newId(),
      globalId,
      date,
      kind,
      value,
      updatedAt: nowIso(),
    };
    rows.push(created);
    result = created;
    return rows;
  });
  return result;
}

export async function getMetricsForDate(
  globalId: string,
  date: string,
): Promise<PatientMetricEntry[]> {
  const rows = await readRows<PatientMetricEntry>(METRICS);
  return rows.filter((r) => r.globalId === globalId && r.date === date);
}

// NÃO preenche com zero nem interpola — null é o estado honesto de "sem
// dado", a UI decide como mostrar.
export async function getMetricHistory(
  globalId: string,
  kind: MetricKind,
  days: number,
): Promise<{ date: string; value: number | null }[]> {
  const rows = await readRows<PatientMetricEntry>(METRICS);
  const mine = rows.filter((r) => r.globalId === globalId && r.kind === kind);

  const result: { date: string; value: number | null }[] = [];
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const date = d.toISOString().slice(0, 10);
    const entry = mine.find((m) => m.date === date);
    result.push({ date, value: entry ? entry.value : null });
  }
  return result;
}
