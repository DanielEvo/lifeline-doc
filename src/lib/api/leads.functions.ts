import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { addLead, listLeads } from "../store.server";

export const submitLead = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      nome: z.string().min(1).max(120),
      email: z.string().email().max(160),
      whatsapp: z.string().max(40).default(""),
      especialidade: z.string().max(60).default(""),
    }),
  )
  .handler(async ({ data }) => addLead(data));

export const getLeads = createServerFn({ method: "GET" }).handler(async () =>
  listLeads(),
);
