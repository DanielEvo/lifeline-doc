// Server functions do catálogo de categorias de eventos pessoais — mesmo
// padrão de services.functions.ts: token de sessão obrigatório, doctorId
// resolvido no servidor, POST em tudo.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireDoctor } from "../auth.server";
import { createCategory, listCategories, setCategoryActive, updateCategory } from "../categories.server";

const token = z.string().min(1).max(80);
const HEX_COLOR = z.string().regex(/^#[0-9a-fA-F]{6}$/, "cor precisa ser um hex válido (#rrggbb)");
const UNAUTH = { ok: false as const, error: "unauthorized" as const };

export const listMyCategories = createServerFn({ method: "POST" })
  .inputValidator(z.object({ token }))
  .handler(async ({ data }) => {
    const doctor = await requireDoctor(data.token);
    if (!doctor) return UNAUTH;
    const categories = await listCategories(doctor.id);
    return { ok: true as const, categories };
  });

export const createMyCategory = createServerFn({ method: "POST" })
  .inputValidator(z.object({ token, nome: z.string().min(2).max(40), cor: HEX_COLOR }))
  .handler(async ({ data }) => {
    const doctor = await requireDoctor(data.token);
    if (!doctor) return UNAUTH;
    const category = await createCategory(doctor.id, { nome: data.nome, cor: data.cor });
    return { ok: true as const, category };
  });

export const updateMyCategory = createServerFn({ method: "POST" })
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
    const category = await updateCategory(doctor.id, id, patch);
    return category ? { ok: true as const, category } : { ok: false as const, error: "not_found" as const };
  });

export const setMyCategoryActive = createServerFn({ method: "POST" })
  .inputValidator(z.object({ token, id: z.string().min(1), ativo: z.boolean() }))
  .handler(async ({ data }) => {
    const doctor = await requireDoctor(data.token);
    if (!doctor) return UNAUTH;
    const ok = await setCategoryActive(doctor.id, data.id, data.ativo);
    return ok ? { ok: true as const } : { ok: false as const, error: "not_found" as const };
  });
