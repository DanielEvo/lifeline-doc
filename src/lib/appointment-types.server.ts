// Server-only: catálogo de "Tipos de Atendimento" (ex.: "Telemedicina",
// "Exame Rápido", "Retorno") — exclusivo de consulta, separado de
// EventCategory (que é exclusiva de bloqueio/evento pessoal). Nunca hard
// delete — cada consulta já guarda o tipoAtendimentoId no momento da
// criação; desativar um tipo não muda a cor de consultas já criadas (mesmo
// princípio de snapshot já usado por EventCategory).

import { mutateRows, newId, nowIso, readRows } from "./db.server";
import type { AppointmentType } from "./clinic-types";

export type { AppointmentType } from "./clinic-types";

const FILE = "appointment-types.json";

export async function listAppointmentTypes(doctorId: string): Promise<AppointmentType[]> {
  const rows = await readRows<AppointmentType>(FILE);
  return rows
    .filter((t) => t.doctorId === doctorId)
    .sort((a, b) => a.nome.localeCompare(b.nome));
}

export async function createAppointmentType(
  doctorId: string,
  input: { nome: string; cor: string },
): Promise<AppointmentType> {
  const now = nowIso();
  const type: AppointmentType = {
    id: newId(),
    doctorId,
    nome: input.nome.trim(),
    cor: input.cor,
    ativo: true,
    createdAt: now,
    updatedAt: now,
  };
  await mutateRows<AppointmentType>(FILE, (rows) => {
    rows.push(type);
  });
  return type;
}

export async function updateAppointmentType(
  doctorId: string,
  id: string,
  patch: { nome?: string; cor?: string },
): Promise<AppointmentType | undefined> {
  let updated: AppointmentType | undefined;
  await mutateRows<AppointmentType>(FILE, (rows) => {
    const t = rows.find((r) => r.id === id && r.doctorId === doctorId);
    if (!t) return;
    if (patch.nome !== undefined) t.nome = patch.nome.trim();
    if (patch.cor !== undefined) t.cor = patch.cor;
    t.updatedAt = nowIso();
    updated = { ...t };
  });
  return updated;
}

export async function setAppointmentTypeActive(
  doctorId: string,
  id: string,
  ativo: boolean,
): Promise<boolean> {
  let ok = false;
  await mutateRows<AppointmentType>(FILE, (rows) => {
    const t = rows.find((r) => r.id === id && r.doctorId === doctorId);
    if (!t) return;
    t.ativo = ativo;
    t.updatedAt = nowIso();
    ok = true;
  });
  return ok;
}
