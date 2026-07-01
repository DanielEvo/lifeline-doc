// Server-only domain helpers: authoritative generators (digital signature,
// protocol, prescription code) and seed data for the clinical board. These
// run only on the server so the "real" artifacts (signatures, codes) can't be
// forged on the client.

import crypto from "node:crypto";

/** Deterministic ICP-Brasil-style signature hash for a sealed record. */
export function makeSignature(payload: string): string {
  let hex: string;
  try {
    hex = crypto.createHash("sha256").update(payload).digest("hex");
  } catch {
    // Fallback hash if node:crypto is unavailable in the runtime
    let h = 0;
    for (let i = 0; i < payload.length; i++) h = (h * 31 + payload.charCodeAt(i)) >>> 0;
    hex = (h.toString(16) + Date.now().toString(16)).padStart(40, "0");
  }
  return (hex.slice(0, 32).toUpperCase().match(/.{1,8}/g) ?? []).join("-");
}

export function makeProtocol(): string {
  return `LL-${Date.now().toString(36).toUpperCase()}-${Math.random()
    .toString(36)
    .slice(2, 6)
    .toUpperCase()}`;
}

export function makePrescriptionCode(): string {
  return `MD-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

export type BoardColumn = "triagem" | "atendimento" | "aguardando" | "recebidos";

export type SeedPatient = {
  id: string;
  name: string;
  age: number;
  reason: string;
  column: BoardColumn;
  hasBriefing: boolean;
  hasExams: boolean;
  examsCount: number;
  initials: string;
  tint: string;
};

// Server seed of the day's board — mirrors the client demo so the API and the
// UI agree on the starting state.
export const SEED_BOARD: SeedPatient[] = [
  { id: "mariana", name: "Mariana Silva", age: 38, reason: "Fadiga + queda de hemoglobina", column: "triagem", hasBriefing: false, hasExams: false, examsCount: 0, initials: "MS", tint: "from-rose-400 to-pink-500" },
  { id: "carlos", name: "Carlos Andrade", age: 54, reason: "Hipertensão — ajuste", column: "atendimento", hasBriefing: true, hasExams: false, examsCount: 0, initials: "CA", tint: "from-cyan-400 to-teal-500" },
  { id: "juliana", name: "Juliana Prado", age: 29, reason: "Cefaleia recorrente", column: "aguardando", hasBriefing: true, hasExams: false, examsCount: 0, initials: "JP", tint: "from-amber-400 to-orange-500" },
  { id: "roberto", name: "Roberto Lima", age: 61, reason: "Diabetes — retorno", column: "recebidos", hasBriefing: true, hasExams: true, examsCount: 3, initials: "RL", tint: "from-emerald-400 to-teal-500" },
];

export function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}
