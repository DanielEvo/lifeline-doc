// Server function pública: consulta uma prescrição pelo código verificável
// (LFL-XXXX). Usado pela página /receita/$code que substitui o antigo link
// falso https://memed.com.br/r/… (que retornava 404 fora do domínio Memed).

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { listPrescriptions } from "../store.server";

export const getPrescriptionByCode = createServerFn({ method: "GET" })
  .inputValidator(z.object({ code: z.string().min(1).max(64) }))
  .handler(async ({ data }) => {
    const { rows } = await listPrescriptions();
    const found = rows.find((r) => r.code.toLowerCase() === data.code.toLowerCase());
    if (!found) return { ok: false as const, error: "not_found" as const };
    return {
      ok: true as const,
      prescription: {
        code: found.code,
        patient: found.patient,
        meds: found.meds,
        createdAt: found.createdAt,
      },
    };
  });
