// Standalone: migra .data/appointments.json (JSON store, db.server.ts) pra
// public.appointments (Postgres). Upsert por id — pode ser rodado de novo
// sem duplicar (idempotente). Ver HANDOVER da agenda: db.server.ts.persist()
// engole falhas de escrita em runtime edge; Postgres é a correção.
//
// Execução: bun run scripts/migrate-appointments.ts (precisa de
// SUPABASE_SERVICE_ROLE_KEY no ambiente — não disponível localmente nesta
// sessão, ver HANDOVER_LOINC_v3_Pendencias.md).

import { promises as fs } from "node:fs";
import path from "node:path";
import { supabaseAdmin } from "../src/integrations/supabase/client.server";

type JsonAppointment = {
  id: string;
  doctorId: string;
  patientId: string | null;
  dateTime: string;
  durationMin: number | null;
  allDay?: boolean;
  status: string;
  note: string | null;
  kind?: "consulta" | "bloqueio";
  label?: string | null;
  recurrenceId?: string | null;
  categoriaId?: string | null;
  cor?: string | null;
  descricao?: string | null;
  local?: string | null;
  lembretesMin?: number[];
  createdAt: string;
  updatedAt: string;
};

const BATCH_SIZE = 500;

function toRow(a: JsonAppointment) {
  return {
    id: a.id,
    doctor_id: a.doctorId,
    patient_id: a.patientId,
    date_time: a.dateTime,
    duration_min: a.durationMin,
    all_day: a.allDay ?? false,
    status: a.status,
    note: a.note,
    kind: a.kind ?? "consulta",
    label: a.label ?? null,
    categoria_id: a.categoriaId ?? null,
    cor: a.cor ?? null,
    descricao: a.descricao ?? null,
    local: a.local ?? null,
    recurrence_id: a.recurrenceId ?? null,
    lembretes_min: a.lembretesMin ?? [],
    created_at: a.createdAt,
    updated_at: a.updatedAt,
  };
}

async function main() {
  const filePath = path.join(process.cwd(), ".data", "appointments.json");
  const raw = await fs.readFile(filePath, "utf-8").catch(() => "[]");
  const appointments = JSON.parse(raw) as JsonAppointment[];

  if (appointments.length === 0) {
    console.log("Nenhum appointment em .data/appointments.json — nada a migrar.");
    return;
  }

  const rows = appointments.map(toRow);
  const totalBatches = Math.ceil(rows.length / BATCH_SIZE);

  for (let i = 0; i < totalBatches; i++) {
    const batch = rows.slice(i * BATCH_SIZE, (i + 1) * BATCH_SIZE);
    const { error } = await supabaseAdmin
      .from("appointments")
      .upsert(batch, { onConflict: "id", ignoreDuplicates: true });
    if (error) throw new Error(`Lote ${i + 1}/${totalBatches} falhou: ${error.message}`);
    console.log(`Lote ${i + 1}/${totalBatches} inserido — ${batch.length} linhas`);
  }

  const { count, error: countError } = await supabaseAdmin
    .from("appointments")
    .select("*", { count: "exact", head: true });
  if (countError) throw new Error(`Falha ao contar linhas: ${countError.message}`);

  console.log(
    `Total em appointments: ${count} (origem tinha ${rows.length} — igual ou maior é ok se já rodou antes)`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
