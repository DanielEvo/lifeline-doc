// Server-only: catálogo de produtos/serviços do médico (ex.: "Consulta",
// "Retorno", "Avaliação nutricional"). Nunca hard delete — evoluções antigas
// guardam um snapshot (nome/preço) do momento em que o serviço foi aplicado,
// então desativar não pode quebrar registros já feitos (mesma lógica do
// selo digital: prontuário não se altera retroativamente).

import { mutateRows, newId, nowIso, readRows } from "./db.server";
import type { Service } from "./clinic-types";

export type { Service } from "./clinic-types";

const FILE = "services.json";

export async function listServices(doctorId: string): Promise<Service[]> {
  const rows = await readRows<Service>(FILE);
  return rows
    .filter((s) => s.doctorId === doctorId)
    .sort((a, b) => a.nome.localeCompare(b.nome));
}

export async function createService(
  doctorId: string,
  input: { nome: string; descricao?: string | null; preco: number; duracaoMin?: number | null },
): Promise<Service> {
  const now = nowIso();
  const service: Service = {
    id: newId(),
    doctorId,
    nome: input.nome.trim(),
    descricao: input.descricao?.trim() || null,
    preco: input.preco,
    duracaoMin: input.duracaoMin ?? null,
    ativo: true,
    createdAt: now,
    updatedAt: now,
  };
  await mutateRows<Service>(FILE, (rows) => {
    rows.push(service);
  });
  return service;
}

export async function updateService(
  doctorId: string,
  id: string,
  patch: { nome?: string; descricao?: string | null; preco?: number; duracaoMin?: number | null },
): Promise<Service | undefined> {
  let updated: Service | undefined;
  await mutateRows<Service>(FILE, (rows) => {
    const s = rows.find((r) => r.id === id && r.doctorId === doctorId);
    if (!s) return;
    if (patch.nome !== undefined) s.nome = patch.nome.trim();
    if (patch.descricao !== undefined) s.descricao = patch.descricao?.trim() || null;
    if (patch.preco !== undefined) s.preco = patch.preco;
    if (patch.duracaoMin !== undefined) s.duracaoMin = patch.duracaoMin;
    s.updatedAt = nowIso();
    updated = { ...s };
  });
  return updated;
}

export async function setServiceActive(
  doctorId: string,
  id: string,
  ativo: boolean,
): Promise<boolean> {
  let ok = false;
  await mutateRows<Service>(FILE, (rows) => {
    const s = rows.find((r) => r.id === id && r.doctorId === doctorId);
    if (!s) return;
    s.ativo = ativo;
    s.updatedAt = nowIso();
    ok = true;
  });
  return ok;
}
