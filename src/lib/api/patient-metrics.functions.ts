// Server functions da feature "Métricas de autocuidado" do app do paciente —
// mesmo padrão de patient-medications.functions.ts: createServerFn,
// requirePatient(token), zod inputValidator, retorno { ok: true/false }.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requirePatient } from "../patient-auth.server";
import {
  getMetricHistory,
  getMetricsForDate,
  setMetric,
  type MetricKind,
} from "../patient-metrics.server";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const METRIC_KINDS = ["passos", "hidratacao", "sono", "fc", "peso", "altura"] as const;

// Mesmos limites de CLINICAL_FIELDS (peso 0-500, altura 0-280) em clinic.functions.ts
// — evita que o autodeclarado do paciente aceite algo que o lado médico rejeitaria.
const METRIC_LIMITS: Partial<Record<(typeof METRIC_KINDS)[number], { min: number; max: number }>> = {
  peso: { min: 0, max: 500 },
  altura: { min: 0, max: 280 },
};

export const getMyTodayMetrics = createServerFn({ method: "POST" })
  .inputValidator(z.object({ token: z.string().min(1) }))
  .handler(async ({ data }) => {
    const patient = await requirePatient(data.token);
    if (!patient) return { ok: false as const, error: "unauthorized" as const };
    const date = new Date().toISOString().slice(0, 10);
    const entries = await getMetricsForDate(patient.globalId, date);
    const metrics = METRIC_KINDS.map((kind) => ({
      kind,
      value: entries.find((e) => e.kind === kind)?.value ?? null,
    }));
    return { ok: true as const, date, metrics };
  });

export const setMyMetric = createServerFn({ method: "POST" })
  .inputValidator(
    z
      .object({
        token: z.string().min(1),
        date: z.string().regex(DATE_RE),
        kind: z.enum(METRIC_KINDS),
        value: z.number().positive(),
      })
      .refine(
        (v) => {
          const limit = METRIC_LIMITS[v.kind];
          return !limit || (v.value >= limit.min && v.value <= limit.max);
        },
        { message: "Valor fora do limite aceito para esta métrica", path: ["value"] },
      ),
  )
  .handler(async ({ data }) => {
    const patient = await requirePatient(data.token);
    if (!patient) return { ok: false as const, error: "unauthorized" as const };
    const entry = await setMetric(
      patient.globalId,
      data.date,
      data.kind as MetricKind,
      data.value,
    );
    return { ok: true as const, entry: { kind: entry.kind, value: entry.value } };
  });

export const getMyMetricHistory = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      token: z.string().min(1),
      kind: z.enum(METRIC_KINDS),
      days: z.number().int().min(1).max(90),
    }),
  )
  .handler(async ({ data }) => {
    const patient = await requirePatient(data.token);
    if (!patient) return { ok: false as const, error: "unauthorized" as const };
    const history = await getMetricHistory(patient.globalId, data.kind as MetricKind, data.days);
    return { ok: true as const, history };
  });
