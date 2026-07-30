// Server functions dos templates de Evolução (PRO-02/PRO-03) — mesmo padrão
// de clinic.functions.ts: token de sessão obrigatório, doctorId resolvido no
// servidor, POST em tudo.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireDoctor } from "../auth.server";
import {
  createTemplate,
  deleteTemplate,
  generateTemplateDraft,
  listTemplates,
  updateTemplate,
} from "../templates.server";

const token = z.string().min(1).max(80);
const UNAUTH = { ok: false as const, error: "unauthorized" as const };

export const listMyTemplates = createServerFn({ method: "POST" })
  .inputValidator(z.object({ token }))
  .handler(async ({ data }) => {
    const doctor = await requireDoctor(data.token);
    if (!doctor) return UNAUTH;
    const templates = await listTemplates(doctor.id);
    return { ok: true as const, templates };
  });

export const saveMyTemplate = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      token,
      id: z.string().min(1).optional(),
      nome: z.string().min(2).max(60),
      conteudo: z.string().max(4000),
    }),
  )
  .handler(async ({ data }) => {
    const doctor = await requireDoctor(data.token);
    if (!doctor) return UNAUTH;
    if (data.id) {
      const template = await updateTemplate(doctor.id, data.id, {
        nome: data.nome,
        conteudo: data.conteudo,
      });
      return template
        ? { ok: true as const, template }
        : { ok: false as const, error: "not_found" as const };
    }
    const template = await createTemplate(doctor.id, data.nome, data.conteudo);
    return { ok: true as const, template };
  });

export const deleteMyTemplate = createServerFn({ method: "POST" })
  .inputValidator(z.object({ token, id: z.string().min(1) }))
  .handler(async ({ data }) => {
    const doctor = await requireDoctor(data.token);
    if (!doctor) return UNAUTH;
    const ok = await deleteTemplate(doctor.id, data.id);
    return ok ? { ok: true as const } : { ok: false as const, error: "not_found" as const };
  });

export const generateMyTemplateDraft = createServerFn({ method: "POST" })
  .inputValidator(z.object({ token, descricao: z.string().min(3).max(300) }))
  .handler(async ({ data }) => {
    const doctor = await requireDoctor(data.token);
    if (!doctor) return UNAUTH;
    if (!process.env.LOVABLE_API_KEY) {
      return { ok: false as const, error: "not_configured" as const };
    }
    try {
      const conteudo = await generateTemplateDraft(data.descricao);
      return { ok: true as const, conteudo };
    } catch (e) {
      return { ok: false as const, error: "generation_failed" as const, detail: String(e) };
    }
  });
