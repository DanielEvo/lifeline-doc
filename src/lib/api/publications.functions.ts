// Server functions de Publicações (busca sob demanda) — mesmo padrão de
// templates.functions.ts.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireDoctor } from "../auth.server";
import {
  confirmarPublicacao,
  descartarPublicacao,
  listPublications,
  searchPublications,
} from "../publications.server";

const token = z.string().min(1).max(80);
const UNAUTH = { ok: false as const, error: "unauthorized" as const };

export const searchMyPublications = createServerFn({ method: "POST" })
  .inputValidator(z.object({ token, topics: z.array(z.string().min(1).max(60)).min(1).max(5) }))
  .handler(async ({ data }) => {
    const doctor = await requireDoctor(data.token);
    if (!doctor) return UNAUTH;
    const publications = await searchPublications(doctor.id, data.topics);
    return { ok: true as const, publications };
  });

export const listMyPublications = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({ token, status: z.enum(["novo", "adicionado", "descartado"]).optional() }),
  )
  .handler(async ({ data }) => {
    const doctor = await requireDoctor(data.token);
    if (!doctor) return UNAUTH;
    const publications = await listPublications(doctor.id, data.status);
    return { ok: true as const, publications };
  });

export const addMyPublication = createServerFn({ method: "POST" })
  .inputValidator(z.object({ token, id: z.string().min(1) }))
  .handler(async ({ data }) => {
    const doctor = await requireDoctor(data.token);
    if (!doctor) return UNAUTH;
    const publication = await confirmarPublicacao(doctor.id, data.id);
    return publication
      ? { ok: true as const, publication }
      : { ok: false as const, error: "not_found" as const };
  });

export const discardMyPublication = createServerFn({ method: "POST" })
  .inputValidator(z.object({ token, id: z.string().min(1) }))
  .handler(async ({ data }) => {
    const doctor = await requireDoctor(data.token);
    if (!doctor) return UNAUTH;
    const publication = await descartarPublicacao(doctor.id, data.id);
    return publication
      ? { ok: true as const, publication }
      : { ok: false as const, error: "not_found" as const };
  });
