// Server-only prontuário: evoluções clínicas por paciente, com selo digital
// (assinatura SHA-256 + protocolo) e receita digital. Selar congela o texto —
// updates em evolução selada são rejeitados aqui, não só na UI.
// A atividade real também alimenta os contadores do /admin (store.server).

import { mutateRows, newId, nowIso, readRows } from "./db.server";
import { makePrescriptionCode, makeProtocol, makeSignature } from "./domain.server";
import { deriveSoap } from "./soap";
import { addConsultation, addPrescription } from "./store.server";
import type { Evolution, PrescriptionMed } from "./clinic-types";

export type { Evolution } from "./clinic-types";

const FILE = "evolutions.json";

export async function listEvolutions(doctorId: string, patientId: string): Promise<Evolution[]> {
  const rows = await readRows<Evolution>(FILE);
  return rows
    .filter((e) => e.doctorId === doctorId && e.patientId === patientId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function createEvolution(
  doctorId: string,
  patientId: string,
  evolucao: string,
  planoTerapeutico: string,
): Promise<Evolution> {
  const now = nowIso();
  const entry: Evolution = {
    id: newId(),
    doctorId,
    patientId,
    evolucao: evolucao.trim(),
    planoTerapeutico: planoTerapeutico.trim(),
    soap: deriveSoap(evolucao),
    sealed: null,
    prescription: null,
    createdAt: now,
    updatedAt: now,
  };
  await mutateRows<Evolution>(FILE, (rows) => {
    rows.unshift(entry);
  });
  return entry;
}

export async function updateEvolution(
  doctorId: string,
  id: string,
  evolucao: string,
  /** Ausente = não mexe no plano já salvo (ex.: só reeditando o texto da evolução). */
  planoTerapeutico?: string,
): Promise<Evolution | { error: "sealed" | "not_found" }> {
  let result: Evolution | { error: "sealed" | "not_found" } = { error: "not_found" };
  await mutateRows<Evolution>(FILE, (rows) => {
    const e = rows.find((r) => r.id === id && r.doctorId === doctorId);
    if (!e) return;
    if (e.sealed) {
      result = { error: "sealed" };
      return;
    }
    e.evolucao = evolucao.trim();
    if (planoTerapeutico !== undefined) e.planoTerapeutico = planoTerapeutico.trim();
    // notaPrivada não é derivada do texto — preserva o que o médico já anotou
    const derived = deriveSoap(evolucao);
    e.soap = { ...derived, a: { ...derived.a, notaPrivada: e.soap.a.notaPrivada } };
    e.updatedAt = nowIso();
    result = { ...e };
  });
  return result;
}

export async function updateEvolutionNote(
  doctorId: string,
  id: string,
  notaPrivada: string,
): Promise<Evolution | { error: "not_found" }> {
  let result: Evolution | { error: "not_found" } = { error: "not_found" };
  await mutateRows<Evolution>(FILE, (rows) => {
    const e = rows.find((r) => r.id === id && r.doctorId === doctorId);
    if (!e) return;
    e.soap.a.notaPrivada = notaPrivada.trim();
    e.updatedAt = nowIso();
    result = { ...e };
  });
  return result;
}

export async function sealEvolution(
  doctorId: string,
  id: string,
  patientName: string,
): Promise<Evolution | { error: "sealed" | "not_found" }> {
  let sealedEvo: Evolution | null = null;
  let error: "sealed" | "not_found" = "not_found";
  await mutateRows<Evolution>(FILE, (rows) => {
    const e = rows.find((r) => r.id === id && r.doctorId === doctorId);
    if (!e) return;
    if (e.sealed) {
      error = "sealed";
      return;
    }
    const protocol = makeProtocol();
    const sealedAt = nowIso();
    const signature = makeSignature(`${doctorId}|${e.patientId}|${e.evolucao}|${protocol}|${sealedAt}`);
    e.sealed = { protocol, signature, sealedAt };
    e.updatedAt = sealedAt;
    sealedEvo = { ...e };
  });
  if (!sealedEvo) return { error };
  const evo: Evolution = sealedEvo;
  if (evo.sealed) {
    await addConsultation({
      patient: patientName,
      protocol: evo.sealed.protocol,
      signature: evo.sealed.signature,
      signedAt: evo.sealed.sealedAt,
      summary: evo.soap.a.compartilhavel || evo.evolucao.slice(0, 120),
    });
  }
  return evo;
}

export async function prescribeEvolution(
  doctorId: string,
  id: string,
  patientName: string,
  meds: PrescriptionMed[],
): Promise<Evolution | { error: "not_found" }> {
  let updated: Evolution | null = null;
  const code = makePrescriptionCode();
  await mutateRows<Evolution>(FILE, (rows) => {
    const e = rows.find((r) => r.id === id && r.doctorId === doctorId);
    if (!e) return;
    e.prescription = {
      code,
      meds,
      // URL interna verificável — antes apontava para memed.com.br/r/{code},
      // que retornava 404 pois o código é gerado localmente. Quando a Memed
      // real emite um link próprio (via widget Sinapse), essa URL é
      // sobrescrita no fluxo do embed.
      url: `/receita/${code}`,
      createdAt: nowIso(),
    };
    e.updatedAt = nowIso();
    updated = { ...e };
  });
  if (!updated) return { error: "not_found" };
  // log de atividade do /admin é só texto — resume dosagem quando houver
  await addPrescription({
    code,
    patient: patientName,
    meds: meds.map((m) => (m.dosage ? `${m.name} (${m.dosage})` : m.name)),
  });
  return updated;
}
