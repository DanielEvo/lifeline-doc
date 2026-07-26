// Server functions do lado paciente dos dois canais de acesso (BKL-37) —
// mesmo padrão de patient-medications.functions.ts: createServerFn,
// requirePatient(token), zod inputValidator, retorno { ok: true/false }.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requirePatient } from "../patient-auth.server";
import {
  createPresentialToken,
  listPendingRequests,
  respondAccessRequest,
} from "../patient-access.server";

export const generateMyPresentialToken = createServerFn({ method: "POST" })
  .inputValidator(z.object({ token: z.string().min(1), purpose: z.enum(["perfil"]) }))
  .handler(async ({ data }) => {
    const patient = await requirePatient(data.token);
    if (!patient) return { ok: false as const, error: "unauthorized" as const };
    const accessToken = await createPresentialToken(patient.globalId, data.purpose);
    // createPresentialToken sempre gera code para o canal presencial — só o
    // canal "solicitacao" (respondAccessRequest) usa code:null.
    return { ok: true as const, code: accessToken.code as string, expiresAt: accessToken.expiresAt };
  });

export const listMyAccessRequests = createServerFn({ method: "POST" })
  .inputValidator(z.object({ token: z.string().min(1) }))
  .handler(async ({ data }) => {
    const patient = await requirePatient(data.token);
    if (!patient) return { ok: false as const, error: "unauthorized" as const };
    const requests = await listPendingRequests(patient.globalId);
    return {
      ok: true as const,
      requests: requests.map((r) => ({
        id: r.id,
        doctorNome: r.doctorNome,
        purpose: r.purpose,
        createdAt: r.createdAt,
      })),
    };
  });

export const respondMyAccessRequest = createServerFn({ method: "POST" })
  .inputValidator(z.object({ token: z.string().min(1), requestId: z.string().min(1), approve: z.boolean() }))
  .handler(async ({ data }) => {
    const patient = await requirePatient(data.token);
    if (!patient) return { ok: false as const, error: "unauthorized" as const };
    const result = await respondAccessRequest(data.requestId, patient.globalId, data.approve);
    if (!result) return { ok: false as const, error: "not_found" as const };
    return { ok: true as const };
  });
