// Server functions exclusivas da bancada de prescrição (/app/memed-simulacao):
// histórico/exclusão de prescrição, protocolos de parceiro e impressão/
// template de receita. Sempre resolvidas a partir do prescritor SINTÉTICO
// (getMemedSandboxToken) — nunca usam token de um médico real, mesmo que a
// sessão logada seja de um médico com cadastro Memed completo.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireDoctor } from "../auth.server";
import {
  createMemedPartnerProtocol,
  deleteMemedPartnerProtocol,
  deleteMemedPrescription,
  getMemedDigitalPrescriptionLink,
  getMemedPrescriptionHistory,
  getMemedPrescriptionPdfUrl,
  getMemedPrintOptions,
  getMemedSandboxToken,
  isMemedConfigured,
  listMemedPartnerProtocols,
  setMemedPrintOptions,
  uploadMemedPrintTemplate,
  type SandboxDoctorOverrides,
} from "../memed.server";

const token = z.string().min(1);
const UNAUTH = { ok: false as const, error: "unauthorized" as const };

const overridesSchema = z
  .object({
    externalId: z.string().max(100).optional(),
    nome: z.string().max(120).optional(),
    crm: z.string().max(20).optional(),
    crmUf: z.string().max(2).optional(),
    cpfMedico: z.string().max(20).optional(),
    especialidade: z.string().max(120).optional(),
    crmCidade: z.string().max(120).optional(),
    dataNascimento: z.string().max(10).optional(),
    email: z.string().max(255).optional(),
  })
  .partial()
  .optional();

// Resolve o token do prescritor sintético (com os overrides atuais da
// bancada) uma vez por chamada — todas as funções abaixo dependem disso.
async function sandboxToken(overrides?: SandboxDoctorOverrides) {
  const result = await getMemedSandboxToken(overrides);
  if (!result.ok) return { ok: false as const, error: result.error, detail: result.detail };
  return { ok: true as const, token: result.token };
}

export const getMemedBenchHistory = createServerFn({ method: "POST" })
  .inputValidator(z.object({ token, overrides: overridesSchema }))
  .handler(async ({ data }) => {
    const doctor = await requireDoctor(data.token);
    if (!doctor) return UNAUTH;
    const t = await sandboxToken(data.overrides);
    if (!t.ok) return t;
    return getMemedPrescriptionHistory(t.token);
  });

export const deleteMemedBenchPrescription = createServerFn({ method: "POST" })
  .inputValidator(z.object({ token, overrides: overridesSchema, prescriptionId: z.string().min(1) }))
  .handler(async ({ data }) => {
    const doctor = await requireDoctor(data.token);
    if (!doctor) return UNAUTH;
    const t = await sandboxToken(data.overrides);
    if (!t.ok) return t;
    return deleteMemedPrescription(t.token, data.prescriptionId);
  });

export const getMemedBenchDigitalLink = createServerFn({ method: "POST" })
  .inputValidator(z.object({ token, overrides: overridesSchema, prescriptionId: z.string().min(1) }))
  .handler(async ({ data }) => {
    const doctor = await requireDoctor(data.token);
    if (!doctor) return UNAUTH;
    const t = await sandboxToken(data.overrides);
    if (!t.ok) return t;
    const link = await getMemedDigitalPrescriptionLink(t.token, data.prescriptionId);
    if (!link) return { ok: false as const, error: "memed_error" as const, detail: "Memed não devolveu link/código." };
    return { ok: true as const, ...link };
  });

export const getMemedBenchPrescriptionPdf = createServerFn({ method: "POST" })
  .inputValidator(z.object({ token, overrides: overridesSchema, prescriptionId: z.string().min(1) }))
  .handler(async ({ data }) => {
    const doctor = await requireDoctor(data.token);
    if (!doctor) return UNAUTH;
    const t = await sandboxToken(data.overrides);
    if (!t.ok) return t;
    return getMemedPrescriptionPdfUrl(t.token, data.prescriptionId);
  });

// Protocolos de parceiro são a nível de CONTA (api-key/secret-key), visíveis
// a todos os prescritores — não dependem do prescritor sintético.
export const listMemedBenchProtocols = createServerFn({ method: "POST" })
  .inputValidator(z.object({ token }))
  .handler(async ({ data }) => {
    const doctor = await requireDoctor(data.token);
    if (!doctor) return UNAUTH;
    if (!isMemedConfigured()) return { ok: false as const, error: "not_configured" as const };
    return listMemedPartnerProtocols();
  });

export const deleteMemedBenchProtocol = createServerFn({ method: "POST" })
  .inputValidator(z.object({ token, protocolId: z.string().min(1) }))
  .handler(async ({ data }) => {
    const doctor = await requireDoctor(data.token);
    if (!doctor) return UNAUTH;
    return deleteMemedPartnerProtocol(data.protocolId);
  });

export const createMemedBenchProtocol = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      token,
      nome: z.string().min(1).max(250),
      medicamentos: z.array(z.object({ nome: z.string().min(1).max(255), posologia: z.string().max(500).optional() })).min(1).max(30),
    }),
  )
  .handler(async ({ data }) => {
    const doctor = await requireDoctor(data.token);
    if (!doctor) return UNAUTH;
    return createMemedPartnerProtocol(data.nome, data.medicamentos);
  });

// Impressão / template de receita — sempre no prescritor sintético.
export const getMemedBenchPrintOptions = createServerFn({ method: "POST" })
  .inputValidator(z.object({ token, overrides: overridesSchema }))
  .handler(async ({ data }) => {
    const doctor = await requireDoctor(data.token);
    if (!doctor) return UNAUTH;
    const t = await sandboxToken(data.overrides);
    if (!t.ok) return t;
    return getMemedPrintOptions(t.token);
  });

export const setMemedBenchPrintOptions = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      token,
      overrides: overridesSchema,
      options: z
        .object({
          titulo: z.string().max(120).optional(),
          titulo_cor: z.string().max(9).optional(),
          subtitulo: z.string().max(120).optional(),
          subtitulo_cor: z.string().max(9).optional(),
          fonte: z.string().max(60).optional(),
          tamanho_fonte: z.number().min(6).max(40).optional(),
          rodape: z.string().max(300).optional(),
          rodape_cor: z.string().max(9).optional(),
        })
        .partial(),
    }),
  )
  .handler(async ({ data }) => {
    const doctor = await requireDoctor(data.token);
    if (!doctor) return UNAUTH;
    const t = await sandboxToken(data.overrides);
    if (!t.ok) return t;
    return setMemedPrintOptions(t.token, data.options);
  });

export const uploadMemedBenchPrintTemplate = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      token,
      overrides: overridesSchema,
      pdfBase64: z.string().min(1).max(8_000_000), // ~6MB decodificado, folga para um PDF de timbre simples
      fileName: z.string().max(120).default("timbre.pdf"),
    }),
  )
  .handler(async ({ data }) => {
    const doctor = await requireDoctor(data.token);
    if (!doctor) return UNAUTH;
    const t = await sandboxToken(data.overrides);
    if (!t.ok) return t;
    return uploadMemedPrintTemplate(t.token, data.pdfBase64, data.fileName);
  });
