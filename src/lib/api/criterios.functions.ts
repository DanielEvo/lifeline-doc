// Server functions de Meus Critérios — mesmo padrão de templates.functions.ts:
// token de sessão obrigatório, doctorId resolvido no servidor, POST em tudo.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireDoctor } from "../auth.server";
import {
  createCriterio,
  deleteCriterio,
  listCriterios,
  setCriterioKind,
} from "../criterios.server";

const token = z.string().min(1).max(80);
const UNAUTH = { ok: false as const, error: "unauthorized" as const };

export const listMyCriterios = createServerFn({ method: "POST" })
  .inputValidator(z.object({ token }))
  .handler(async ({ data }) => {
    const doctor = await requireDoctor(data.token);
    if (!doctor) return UNAUTH;
    const criterios = await listCriterios(doctor.id);
    return { ok: true as const, criterios };
  });

export const saveMyCriterio = createServerFn({ method: "POST" })
  .inputValidator(z.object({ token, rawText: z.string().min(3).max(500) }))
  .handler(async ({ data }) => {
    const doctor = await requireDoctor(data.token);
    if (!doctor) return UNAUTH;
    const criterio = await createCriterio(doctor.id, data.rawText);
    return { ok: true as const, criterio };
  });

export const setMyCriterioKind = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      token,
      id: z.string().min(1),
      kind: z.enum(["regra", "metrica", "estilo"]),
    }),
  )
  .handler(async ({ data }) => {
    const doctor = await requireDoctor(data.token);
    if (!doctor) return UNAUTH;
    const criterio = await setCriterioKind(doctor.id, data.id, data.kind);
    return criterio
      ? { ok: true as const, criterio }
      : { ok: false as const, error: "not_found" as const };
  });

export const deleteMyCriterio = createServerFn({ method: "POST" })
  .inputValidator(z.object({ token, id: z.string().min(1) }))
  .handler(async ({ data }) => {
    const doctor = await requireDoctor(data.token);
    if (!doctor) return UNAUTH;
    const ok = await deleteCriterio(doctor.id, data.id);
    return ok ? { ok: true as const } : { ok: false as const, error: "not_found" as const };
  });
