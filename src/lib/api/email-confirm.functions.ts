// Confirmação pública de troca de e-mail do paciente — SEM autenticação.
// O token de uso único (gerado em patients.server.ts ao médico trocar um
// e-mail já cadastrado) é a única credencial; não expõe nome do médico nem
// qualquer outro dado do prontuário além do necessário para a decisão.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
  confirmEmailChange,
  findPatientByEmailToken,
  rejectEmailChange,
} from "../patients.server";

const tokenSchema = z.object({ token: z.string().min(10).max(80) });

export const getPendingEmailChange = createServerFn({ method: "POST" })
  .inputValidator(tokenSchema)
  .handler(async ({ data }) => {
    const p = await findPatientByEmailToken(data.token);
    if (!p || !p.pendingEmail) return { ok: false as const };
    return {
      ok: true as const,
      nome: p.nome,
      currentEmail: p.email,
      pendingEmail: p.pendingEmail,
      requestedAt: p.pendingEmailRequestedAt,
    };
  });

export const confirmMyEmailChange = createServerFn({ method: "POST" })
  .inputValidator(tokenSchema)
  .handler(async ({ data }) => {
    const p = await confirmEmailChange(data.token);
    if (!p) return { ok: false as const, error: "not_found" as const };
    return { ok: true as const, email: p.email };
  });

export const rejectMyEmailChange = createServerFn({ method: "POST" })
  .inputValidator(tokenSchema)
  .handler(async ({ data }) => {
    const p = await rejectEmailChange(data.token);
    if (!p) return { ok: false as const, error: "not_found" as const };
    return { ok: true as const };
  });
