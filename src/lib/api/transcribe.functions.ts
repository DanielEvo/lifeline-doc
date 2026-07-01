import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// Voice-note transcription for the consultation. In production this is a
// speech-to-text + structuring LLM call; for the demo it returns a realistic
// SOAP draft so the doctor can dictate instead of type. Runs server-side.
export const transcribeConsult = createServerFn({ method: "POST" })
  .inputValidator(z.object({ durationSec: z.number().min(0).max(7200) }))
  .handler(async ({ data }) => {
    await new Promise((r) => setTimeout(r, 1100));
    return {
      durationSec: data.durationSec,
      subjective:
        "Paciente refere fadiga progressiva há cerca de 4 semanas, com dispneia aos médios esforços (subir escadas). Nega dor torácica, febre ou sangramentos visíveis. Sono e apetite preservados.",
      assessment:
        "Anemia ferropriva provável (CID D50.9) — Hb 11.2 g/dL, Ferritina 18 ng/mL. Investigar causa da espoliação de ferro.",
      plan:
        "Iniciar sulfato ferroso 40 mg 2x/dia por 90 dias. Solicitar EPF e pesquisa de sangue oculto nas fezes. Reavaliar com hemograma + ferritina em 60 dias. Orientação alimentar (ferro + vitamina C).",
    };
  });
