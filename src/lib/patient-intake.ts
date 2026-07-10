// Orquestração client-side do fluxo "Novo paciente" unificado (Patch A.1):
// o mesmo dialog cadastra um paciente novo OU anexa exames a um já existente
// (encontrado por ID). Reaproveita as server fns validadas — createMyPatient
// (cadastro completo) e submitPreCadastro (dedupe + OCR simulado de exames) —
// sem duplicar lógica nem perder campos do formulário.

import { createMyPatient, submitPreCadastro } from "./api/clinic.functions";
import type { Patient } from "./clinic-types";
import type { PatientFormValues } from "@/components/clinic/patient-form-dialog";

export type PatientIntakePayload = {
  values: PatientFormValues;
  /** Paciente casado pela busca por ID — quando presente, só anexamos exames. */
  foundPatient: Patient | null;
  /** Nomes dos arquivos já "lidos" pelo OCR simulado. */
  fileNames: string[];
};

type IntakeResult =
  | { ok: true; patient: Patient; mode: "novo" | "exames" }
  | { ok: false; error: string; mode: "novo" | "exames" };

export async function runPatientIntake(
  token: string,
  { values, foundPatient, fileNames }: PatientIntakePayload,
): Promise<IntakeResult> {
  // Caminho 1 — paciente encontrado pelo ID: apenas anexa exames. A coluna
  // (status no painel) NÃO muda, por decisão do patch.
  if (foundPatient) {
    const r = await submitPreCadastro({
      data: { token, existingPatientId: foundPatient.id, fileNames },
    });
    return r.ok
      ? { ok: true, patient: r.patient, mode: "exames" }
      : { ok: false, error: "not_found", mode: "exames" };
  }

  // Caminho 2 — paciente novo: cria com os campos COMPLETOS do formulário
  // (createMyPatient), preservando nascimento/sexo/cpf/email/convênio/coluna.
  const created = await createMyPatient({
    data: {
      token,
      nome: values.nome,
      nascimento: values.nascimento || null,
      sexo: values.sexo || null,
      cpf: values.cpf || null,
      telefone: values.telefone || null,
      email: values.email || null,
      convenio: values.convenio || null,
      queixa: values.queixa ?? "",
      column: values.column,
    },
  });
  if (!created.ok) return { ok: false, error: created.error, mode: "novo" };

  // Se houver exames anexados, reaproveita o OCR simulado apontando para o
  // paciente recém-criado (sem tocar nos campos já gravados).
  if (fileNames.length > 0) {
    const withExams = await submitPreCadastro({
      data: { token, existingPatientId: created.patient.id, fileNames },
    });
    if (withExams.ok) return { ok: true, patient: withExams.patient, mode: "novo" };
  }

  return { ok: true, patient: created.patient, mode: "novo" };
}
