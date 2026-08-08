// Server functions do catálogo de Tipos de Atendimento — mesmo padrão de
// categories.functions.ts: token de sessão obrigatório, doctorId resolvido
// no servidor, POST em tudo.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireDoctor } from "../auth.server";
import {
  createAppointmentType,
  listAppointmentTypes,
  setAppointmentTypeActive,
  updateAppointmentType,
} from "../appointment-types.server";

const token = z.string().min(1).max(80);
const HEX_COLOR = z.string().regex(/^#[0-9a-fA-F]{6}$/, "cor precisa ser um hex válido (#rrggbb)");
const UNAUTH = { ok: false as const, error: "unauthorized" as const };

export const listMyAppointmentTypes = createServerFn({ method: "POST" })
  .inputValidator(z.object({ token }))
  .handler(async ({ data }) => {
    const doctor = await requireDoctor(data.token);
    if (!doctor) return UNAUTH;
    const appointmentTypes = await listAppointmentTypes(doctor.id);
    return { ok: true as const, appointmentTypes };
  });

export const createMyAppointmentType = createServerFn({ method: "POST" })
  .inputValidator(z.object({ token, nome: z.string().min(2).max(40), cor: HEX_COLOR }))
  .handler(async ({ data }) => {
    const doctor = await requireDoctor(data.token);
    if (!doctor) return UNAUTH;
    const appointmentType = await createAppointmentType(doctor.id, { nome: data.nome, cor: data.cor });
    return { ok: true as const, appointmentType };
  });

export const updateMyAppointmentType = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      token,
      id: z.string().min(1),
      nome: z.string().min(2).max(40).optional(),
      cor: HEX_COLOR.optional(),
    }),
  )
  .handler(async ({ data }) => {
    const doctor = await requireDoctor(data.token);
    if (!doctor) return UNAUTH;
    const { token: _t, id, ...patch } = data;
    const appointmentType = await updateAppointmentType(doctor.id, id, patch);
    return appointmentType
      ? { ok: true as const, appointmentType }
      : { ok: false as const, error: "not_found" as const };
  });

export const setMyAppointmentTypeActive = createServerFn({ method: "POST" })
  .inputValidator(z.object({ token, id: z.string().min(1), ativo: z.boolean() }))
  .handler(async ({ data }) => {
    const doctor = await requireDoctor(data.token);
    if (!doctor) return UNAUTH;
    const ok = await setAppointmentTypeActive(doctor.id, data.id, data.ativo);
    return ok ? { ok: true as const } : { ok: false as const, error: "not_found" as const };
  });
