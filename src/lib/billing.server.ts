// Server-only: cobranças por médico. Modelo deliberadamente simples —
// valor + vencimento + pendente/pago. "Atrasada" é derivada (vencimento
// passado e ainda pendente), nunca gravada.

import { mutateRows, newId, nowIso, readRows } from "./db.server";
import type { Charge } from "./clinic-types";

const FILE = "charges.json";

export async function listCharges(doctorId: string): Promise<Charge[]> {
  const rows = await readRows<Charge>(FILE);
  return rows
    .filter((c) => c.doctorId === doctorId)
    .sort((a, b) => a.vencimento.localeCompare(b.vencimento));
}

export async function createCharge(
  doctorId: string,
  input: { patientId: string; descricao?: string; valor: number; vencimento: string },
): Promise<Charge> {
  const charge: Charge = {
    id: newId(),
    doctorId,
    patientId: input.patientId,
    descricao: input.descricao?.trim() || "Consulta",
    valor: Math.round(input.valor * 100) / 100,
    vencimento: input.vencimento,
    status: "pendente",
    pagoEm: null,
    paymentUrl: null,
    createdAt: nowIso(),
  };
  await mutateRows<Charge>(FILE, (rows) => {
    rows.push(charge);
  });
  return charge;
}

export async function setChargeStatus(
  doctorId: string,
  id: string,
  status: "pendente" | "pago",
): Promise<Charge | undefined> {
  let updated: Charge | undefined;
  await mutateRows<Charge>(FILE, (rows) => {
    const c = rows.find((r) => r.id === id && r.doctorId === doctorId);
    if (!c) return;
    c.status = status;
    c.pagoEm = status === "pago" ? nowIso() : null;
    updated = { ...c };
  });
  return updated;
}

export async function setChargePaymentUrl(
  doctorId: string,
  id: string,
  paymentUrl: string,
): Promise<Charge | undefined> {
  let updated: Charge | undefined;
  await mutateRows<Charge>(FILE, (rows) => {
    const c = rows.find((r) => r.id === id && r.doctorId === doctorId);
    if (!c) return;
    c.paymentUrl = paymentUrl;
    updated = { ...c };
  });
  return updated;
}
