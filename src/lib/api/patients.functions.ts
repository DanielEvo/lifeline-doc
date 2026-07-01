import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { SEED_BOARD, initials, type BoardColumn } from "../domain.server";

const COLUMN = z.enum(["triagem", "atendimento", "aguardando", "recebidos"]);

// The day's board — server source of truth for the Kanban seed.
export const getBoard = createServerFn({ method: "GET" }).handler(async () => ({
  patients: SEED_BOARD,
}));

// Turn a triage result into a new patient card (e.g. a walk-in triaged by AI).
export const createPatientFromTriage = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      name: z.string().min(1).max(120),
      age: z.number().int().min(0).max(120).default(0),
      reason: z.string().max(200).default(""),
      urgency: z.enum(["baixa", "média", "alta"]).default("baixa"),
    }),
  )
  .handler(async ({ data }) => {
    const column: BoardColumn = data.urgency === "alta" ? "atendimento" : "triagem";
    return {
      id: `p-${Date.now().toString(36)}`,
      name: data.name,
      age: data.age,
      reason: data.reason,
      column,
      hasBriefing: true,
      hasExams: false,
      examsCount: 0,
      initials: initials(data.name),
      tint: "from-rose-400 to-pink-500",
    };
  });

// Move a card between columns (echoes the validated move; the board is seed-only
// so the demo session stays per-tester and resettable).
export const moveColumn = createServerFn({ method: "POST" })
  .inputValidator(z.object({ id: z.string().min(1), to: COLUMN }))
  .handler(async ({ data }) => ({ ok: true as const, id: data.id, to: data.to }));
