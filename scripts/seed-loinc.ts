// Standalone: popula public.loinc_pt_br a partir de src/lib/data/loinc_pt_br_filtered.json
// (14.598 códigos LOINC PT-BR, subset CHEM/SERO/HEM-BC/COAG/UA/TUMRRGT).
// Upsert em lotes por loinc_code — pode ser rodado de novo sem duplicar.
//
// Execução: bun run scripts/seed-loinc.ts (npx tsx exigiria node/npm, não
// disponíveis neste ambiente — bun já está instalado e roda TS direto).

import { supabaseAdmin } from "../src/integrations/supabase/client.server";
import rawEntries from "../src/lib/data/loinc_pt_br_filtered.json";

type RawEntry = {
  loincCode: string;
  componentPt: string;
  shortName: string | null;
  class: string;
  system: string | null;
  scaleTyp: string | null;
};

type Row = {
  loinc_code: string;
  component_pt: string;
  short_name: string | null;
  class: string;
  system: string | null;
  scale_typ: string | null;
};

const BATCH_SIZE = 500;

function toRow(e: RawEntry): Row {
  return {
    loinc_code: e.loincCode,
    component_pt: e.componentPt,
    short_name: e.shortName,
    class: e.class,
    system: e.system,
    scale_typ: e.scaleTyp,
  };
}

async function main() {
  const entries = rawEntries as RawEntry[];
  const rows = entries.map(toRow);
  const totalBatches = Math.ceil(rows.length / BATCH_SIZE);

  for (let i = 0; i < totalBatches; i++) {
    const batch = rows.slice(i * BATCH_SIZE, (i + 1) * BATCH_SIZE);
    const { error } = await supabaseAdmin
      .from("loinc_pt_br")
      .upsert(batch, { onConflict: "loinc_code" });
    if (error) throw new Error(`Lote ${i + 1}/${totalBatches} falhou: ${error.message}`);
    console.log(`Lote ${i + 1}/${totalBatches} inserido — ${batch.length} linhas`);
  }

  const { count, error: countError } = await supabaseAdmin
    .from("loinc_pt_br")
    .select("*", { count: "exact", head: true });
  if (countError) throw new Error(`Falha ao contar linhas: ${countError.message}`);

  console.log(`Total em loinc_pt_br: ${count} (esperado: ${rows.length})`);
  if (count !== rows.length) {
    throw new Error(`Divergência: banco tem ${count}, JSON de origem tem ${rows.length}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
