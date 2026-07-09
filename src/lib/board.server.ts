// Server-only: configuração do kanban por médico. O board é flexível —
// o médico renomeia, adiciona, remove e reordena colunas; pacientes de
// colunas removidas migram para a primeira coluna restante.

import { mutateRows, newId, nowIso, readRows } from "./db.server";
import { DEFAULT_COLUMNS, type BoardColumn } from "./clinic-types";
import type { Patient } from "./clinic-types";

type BoardRow = { doctorId: string; columns: BoardColumn[]; updatedAt: string };

const FILE = "boards.json";
const PATIENTS_FILE = "patients.json";

export async function getBoardColumns(doctorId: string): Promise<BoardColumn[]> {
  const rows = await readRows<BoardRow>(FILE);
  const row = rows.find((b) => b.doctorId === doctorId);
  return row?.columns ?? DEFAULT_COLUMNS;
}

/** Valida um id de coluna contra o board do médico; cai na primeira. */
export function resolveColumn(columns: BoardColumn[], wanted: string | undefined): string {
  if (wanted && columns.some((c) => c.id === wanted)) return wanted;
  return columns[0]?.id ?? DEFAULT_COLUMNS[0].id;
}

export async function saveBoardColumns(
  doctorId: string,
  input: Array<{ id?: string; title: string; hint?: string }>,
): Promise<BoardColumn[]> {
  const columns: BoardColumn[] = input.map((c) => ({
    id: c.id || newId(4),
    title: c.title.trim(),
    hint: c.hint?.trim() ?? "",
  }));

  await mutateRows<BoardRow>(FILE, (rows) => {
    const i = rows.findIndex((b) => b.doctorId === doctorId);
    const row: BoardRow = { doctorId, columns, updatedAt: nowIso() };
    if (i >= 0) rows[i] = row;
    else rows.push(row);
  });

  // migra pacientes que ficaram em colunas removidas
  const valid = new Set(columns.map((c) => c.id));
  const fallback = columns[0].id;
  await mutateRows<Patient>(PATIENTS_FILE, (rows) => {
    for (const p of rows) {
      if (p.doctorId === doctorId && !valid.has(p.column)) {
        p.column = fallback;
        p.updatedAt = nowIso();
      }
    }
  });

  return columns;
}
