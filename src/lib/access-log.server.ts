// SEC-05 — log de acesso auditável: quem acessou qual prontuário, quando e
// por qual canal. Append-only (mesmo padrão JSON de db.server.ts). Consulta
// exposta só no /admin por ora — uma tela dedicada por paciente/médico fica
// pra próxima rodada, junto de LGP-04 (direitos do titular).

import { mutateRows, newId, nowIso, readRows } from "./db.server";

export type AccessLogEntry = {
  id: string;
  actorType: "doctor" | "patient";
  actorId: string;
  actorNome: string;
  patientId: string; // prontuário acessado
  patientNome: string;
  action: "view_record";
  channel: "web";
  createdAt: string;
};

const FILE = "access_log.json";
const MAX_LISTED = 200;

/** Nunca deixa uma falha de log travar o acesso clínico em si. */
export async function logAccess(entry: Omit<AccessLogEntry, "id" | "createdAt">): Promise<void> {
  try {
    const row: AccessLogEntry = { id: newId(), createdAt: nowIso(), ...entry };
    await mutateRows<AccessLogEntry>(FILE, (rows) => {
      rows.push(row);
    });
  } catch (e) {
    console.error("[access-log] falha ao gravar acesso:", e);
  }
}

export async function listAccessLog(): Promise<{ rows: AccessLogEntry[]; total: number }> {
  const rows = await readRows<AccessLogEntry>(FILE);
  const sorted = rows.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return { rows: sorted.slice(0, MAX_LISTED), total: rows.length };
}
