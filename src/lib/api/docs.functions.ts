// Server functions de Documentos (Anexos + Publicações unificados) — mesmo
// padrão de templates.functions.ts.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireDoctor } from "../auth.server";
import {
  createUploadTarget,
  deleteDoc,
  getDocOpenUrl,
  listDocs,
  registerAnexo,
} from "../docs.server";

const token = z.string().min(1).max(80);
const UNAUTH = { ok: false as const, error: "unauthorized" as const };

export const listMyDocs = createServerFn({ method: "POST" })
  .inputValidator(z.object({ token }))
  .handler(async ({ data }) => {
    const doctor = await requireDoctor(data.token);
    if (!doctor) return UNAUTH;
    const docs = await listDocs(doctor.id);
    return { ok: true as const, docs };
  });

export const getMyDocUploadUrl = createServerFn({ method: "POST" })
  .inputValidator(z.object({ token, fileName: z.string().min(1).max(200) }))
  .handler(async ({ data }) => {
    const doctor = await requireDoctor(data.token);
    if (!doctor) return UNAUTH;
    const target = await createUploadTarget(doctor.id, data.fileName);
    return { ok: true as const, ...target };
  });

export const registerMyDoc = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      token,
      name: z.string().min(1).max(200),
      format: z.enum(["pdf", "book", "paper"]).nullable(),
      storagePath: z.string().min(1),
      sizeBytes: z.number().nonnegative().nullable(),
    }),
  )
  .handler(async ({ data }) => {
    const doctor = await requireDoctor(data.token);
    if (!doctor) return UNAUTH;
    const doc = await registerAnexo(doctor.id, {
      name: data.name,
      format: data.format,
      storagePath: data.storagePath,
      sizeBytes: data.sizeBytes,
    });
    return { ok: true as const, doc };
  });

export const getMyDocOpenUrl = createServerFn({ method: "POST" })
  .inputValidator(z.object({ token, docId: z.string().min(1) }))
  .handler(async ({ data }) => {
    const doctor = await requireDoctor(data.token);
    if (!doctor) return UNAUTH;
    const url = await getDocOpenUrl(doctor.id, data.docId);
    return url ? { ok: true as const, url } : { ok: false as const, error: "not_found" as const };
  });

export const deleteMyDoc = createServerFn({ method: "POST" })
  .inputValidator(z.object({ token, docId: z.string().min(1) }))
  .handler(async ({ data }) => {
    const doctor = await requireDoctor(data.token);
    if (!doctor) return UNAUTH;
    const ok = await deleteDoc(doctor.id, data.docId);
    return ok ? { ok: true as const } : { ok: false as const, error: "not_found" as const };
  });
