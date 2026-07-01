import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { extractTriage } from "../triage.server";

// Live triage: takes whatever the patient (tester) types and returns a
// structured briefing, exactly like the production AI would. Runs server-side.
export const triagePatient = createServerFn({ method: "POST" })
  .inputValidator(z.object({ message: z.string().min(1).max(1000) }))
  .handler(async ({ data }) => {
    // small artificial latency so the "typing…" state reads as real work
    await new Promise((r) => setTimeout(r, 500));
    return extractTriage(data.message);
  });
