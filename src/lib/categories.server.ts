// Server-only: categorias/cores de eventos pessoais da agenda (ex.: "Pessoal",
// "Administrativo", "Financeiro"). Nunca hard delete — cada evento pessoal já
// guarda a própria cor resolvida no momento da criação (Appointment.cor),
// então desativar uma categoria nunca muda a cor de eventos já criados (mesmo
// princípio de snapshot do catálogo de produtos/serviços).

import { mutateRows, newId, nowIso, readRows } from "./db.server";
import type { EventCategory } from "./clinic-types";

export type { EventCategory } from "./clinic-types";

const FILE = "categories.json";

export async function listCategories(doctorId: string): Promise<EventCategory[]> {
  const rows = await readRows<EventCategory>(FILE);
  return rows
    .filter((c) => c.doctorId === doctorId)
    .sort((a, b) => a.nome.localeCompare(b.nome));
}

export async function createCategory(
  doctorId: string,
  input: { nome: string; cor: string },
): Promise<EventCategory> {
  const now = nowIso();
  const category: EventCategory = {
    id: newId(),
    doctorId,
    nome: input.nome.trim(),
    cor: input.cor,
    ativo: true,
    createdAt: now,
    updatedAt: now,
  };
  await mutateRows<EventCategory>(FILE, (rows) => {
    rows.push(category);
  });
  return category;
}

export async function updateCategory(
  doctorId: string,
  id: string,
  patch: { nome?: string; cor?: string },
): Promise<EventCategory | undefined> {
  let updated: EventCategory | undefined;
  await mutateRows<EventCategory>(FILE, (rows) => {
    const c = rows.find((r) => r.id === id && r.doctorId === doctorId);
    if (!c) return;
    if (patch.nome !== undefined) c.nome = patch.nome.trim();
    if (patch.cor !== undefined) c.cor = patch.cor;
    c.updatedAt = nowIso();
    updated = { ...c };
  });
  return updated;
}

export async function setCategoryActive(
  doctorId: string,
  id: string,
  ativo: boolean,
): Promise<boolean> {
  let ok = false;
  await mutateRows<EventCategory>(FILE, (rows) => {
    const c = rows.find((r) => r.id === id && r.doctorId === doctorId);
    if (!c) return;
    c.ativo = ativo;
    c.updatedAt = nowIso();
    ok = true;
  });
  return ok;
}
