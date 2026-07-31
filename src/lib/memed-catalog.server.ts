// Server-only: catálogo local de itens da Memed colhidos pelo médico
// (IDs reais "a…/e…/f…" vindos dos protocolos) + medicamentos próprios que
// ele cadastra à mão. Persistido em .data/memed_catalog.json.

import { mutateRows, newId, nowIso, readRows } from "./db.server";

const FILE = "memed_catalog.json";

export type CatalogEntry = {
  id: string;
  doctorId: string;
  memedId: string | null;
  nome: string;
  tipo: "med" | "exame" | "formula" | "livre";
  via: string | null;
  controlClass: string | null;
  posologiaPadrao: string | null;
  usos: number;
  origem: "colhido" | "manual";
  createdAt: string;
};

export type CatalogInput = {
  memedId?: string | null;
  nome: string;
  tipo?: CatalogEntry["tipo"];
  via?: string | null;
  controlClass?: string | null;
  posologiaPadrao?: string | null;
  origem?: CatalogEntry["origem"];
};

const norm = (s: string) => s.trim().toLowerCase();

export async function listCatalog(doctorId: string): Promise<CatalogEntry[]> {
  const rows = await readRows<CatalogEntry>(FILE);
  return rows.filter((r) => r.doctorId === doctorId).sort((a, b) => b.usos - a.usos);
}

export async function upsertEntry(doctorId: string, input: CatalogInput): Promise<CatalogEntry> {
  let saved!: CatalogEntry;
  await mutateRows<CatalogEntry>(FILE, (rows) => {
    const idx = rows.findIndex(
      (r) =>
        r.doctorId === doctorId &&
        (input.memedId ? r.memedId === input.memedId : norm(r.nome) === norm(input.nome)),
    );
    if (idx >= 0) {
      const prev = rows[idx]!;
      saved = {
        ...prev,
        memedId: input.memedId ?? prev.memedId,
        nome: input.nome || prev.nome,
        tipo: input.tipo ?? prev.tipo,
        via: input.via ?? prev.via,
        controlClass: input.controlClass ?? prev.controlClass,
        posologiaPadrao: input.posologiaPadrao ?? prev.posologiaPadrao,
        origem: input.origem ?? prev.origem,
      };
      rows[idx] = saved;
      return rows;
    }
    saved = {
      id: newId(),
      doctorId,
      memedId: input.memedId ?? null,
      nome: input.nome,
      tipo: input.tipo ?? "livre",
      via: input.via ?? null,
      controlClass: input.controlClass ?? null,
      posologiaPadrao: input.posologiaPadrao ?? null,
      usos: 0,
      origem: input.origem ?? "manual",
      createdAt: nowIso(),
    };
    rows.push(saved);
    return rows;
  });
  return saved;
}

export async function bumpUso(doctorId: string, entryId: string): Promise<void> {
  await mutateRows<CatalogEntry>(FILE, (rows) => {
    const row = rows.find((r) => r.id === entryId && r.doctorId === doctorId);
    if (row) row.usos += 1;
    return rows;
  });
}

export async function findByNome(doctorId: string, termo: string): Promise<CatalogEntry[]> {
  const t = norm(termo);
  if (!t) return [];
  return (await listCatalog(doctorId)).filter((r) => norm(r.nome).includes(t));
}
