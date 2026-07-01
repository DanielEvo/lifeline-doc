import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
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
  .handler(async ({ data }) => {
    // Persist to Lovable Cloud database (public.leads) using the
    // publishable key — the table's RLS policy allows anon inserts.
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_PUBLISHABLE_KEY;

    if (url && key) {
      const supabase = createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
      });
      const { error } = await supabase.from("leads").insert({
        nome: data.nome,
        email: data.email,
        whatsapp: data.whatsapp ?? "",
        especialidade: data.especialidade ?? "",
      });
      if (error) {
        console.error("[leads] insert failed:", error.message);
        throw new Error("Não foi possível salvar seu cadastro. Tente novamente.");
      }
    }

    // Keep the local file-based mirror so the /admin dashboard keeps working.
    return addLead(data);
  });

export const getLeads = createServerFn({ method: "GET" }).handler(async () =>
  listLeads(),
);
