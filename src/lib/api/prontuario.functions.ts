import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { makePrescriptionCode, makeProtocol, makeSignature } from "../domain.server";
import {
  addConsultation,
  addPrescription,
  listConsultations,
  listPrescriptions,
} from "../store.server";

// Seal a consultation → authoritative digital signature (SHA-256), protocol
// number and timestamp, the ICP-Brasil-style legal seal. Persisted so /admin
// can show how many records were sealed during testing.
export const sealConsultation = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      patient: z.string().max(120).default("Mariana Silva"),
      subjective: z.string().max(2000).default(""),
      assessment: z.string().max(2000).default(""),
      plan: z.string().max(2000).default(""),
    }),
  )
  .handler(async ({ data }) => {
    await new Promise((r) => setTimeout(r, 700));
    const protocol = makeProtocol();
    const signedAt = new Date().toISOString();
    const signature = makeSignature(
      `${data.patient}|${data.subjective}|${data.assessment}|${data.plan}|${protocol}|${signedAt}`,
    );
    await addConsultation({
      patient: data.patient,
      protocol,
      signature,
      signedAt,
      summary: data.assessment || data.subjective.slice(0, 120),
    });
    return { protocol, signature, signedAt };
  });

// Generate a digital prescription (Memed-style) → returns a verifiable code + link.
export const prescribe = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      patient: z.string().max(120).default("Mariana Silva"),
      meds: z.array(z.string().max(120)).min(1).max(20),
    }),
  )
  .handler(async ({ data }) => {
    await new Promise((r) => setTimeout(r, 600));
    const code = makePrescriptionCode();
    await addPrescription({ code, patient: data.patient, meds: data.meds });
    return {
      code,
      url: `https://memed.com.br/r/${code}`,
      createdAt: new Date().toISOString(),
    };
  });

export const getConsultations = createServerFn({ method: "GET" }).handler(async () =>
  listConsultations(),
);

export const getPrescriptions = createServerFn({ method: "GET" }).handler(async () =>
  listPrescriptions(),
);
