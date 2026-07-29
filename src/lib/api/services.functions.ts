// Server functions do catálogo de produtos/serviços — mesmo padrão de
// clinic.functions.ts: token de sessão obrigatório, doctorId resolvido no
// servidor, POST em tudo.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireDoctor } from "../auth.server";
import { createService, listServices, setServiceActive, updateService } from "../services.server";

const token = z.string().min(1).max(80);
const UNAUTH = { ok: false as const, error: "unauthorized" as const };

export const listMyServices = createServerFn({ method: "POST" })
  .inputValidator(z.object({ token }))
  .handler(async ({ data }) => {
    const doctor = await requireDoctor(data.token);
    if (!doctor) return UNAUTH;
    const services = await listServices(doctor.id);
    return { ok: true as const, services };
  });

export const createMyService = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      token,
      nome: z.string().min(2).max(80),
      descricao: z.string().max(300).nullish(),
      preco: z.number().positive().max(100_000),
      duracaoMin: z.number().int().min(5).max(480).nullish(),
    }),
  )
  .handler(async ({ data }) => {
    const doctor = await requireDoctor(data.token);
    if (!doctor) return UNAUTH;
    const service = await createService(doctor.id, {
      nome: data.nome,
      descricao: data.descricao,
      preco: data.preco,
      duracaoMin: data.duracaoMin,
    });
    return { ok: true as const, service };
  });

export const updateMyService = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      token,
      id: z.string().min(1),
      nome: z.string().min(2).max(80).optional(),
      descricao: z.string().max(300).nullish(),
      preco: z.number().positive().max(100_000).optional(),
      duracaoMin: z.number().int().min(5).max(480).nullish(),
    }),
  )
  .handler(async ({ data }) => {
    const doctor = await requireDoctor(data.token);
    if (!doctor) return UNAUTH;
    const { token: _t, id, ...patch } = data;
    const service = await updateService(doctor.id, id, patch);
    return service ? { ok: true as const, service } : { ok: false as const, error: "not_found" as const };
  });

export const setMyServiceActive = createServerFn({ method: "POST" })
  .inputValidator(z.object({ token, id: z.string().min(1), ativo: z.boolean() }))
  .handler(async ({ data }) => {
    const doctor = await requireDoctor(data.token);
    if (!doctor) return UNAUTH;
    const ok = await setServiceActive(doctor.id, data.id, data.ativo);
    return ok ? { ok: true as const } : { ok: false as const, error: "not_found" as const };
  });
