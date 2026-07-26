// Server-only: resolução de biomarcadores sem correspondência no
// BIOMARKER_CATALOG local contra a base LOINC PT-BR (Postgres, 14.598
// códigos, tradução oficial HL7 Brazil). Só é chamado quando o catálogo
// curado (resolveBiomarkerName) não bate — é uma rede de segurança para
// reduzir intervenção manual do médico, não uma substituição do catálogo,
// que carrega faixas de referência calibradas que o LOINC não tem.
//
// Pendências (ver HANDOVER_LOINC_v3_Pendencias.md): threshold de fuzzy match
// (0.35) ainda não validado contra laudos reais.

import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type LoincMatch = {
  loincCode: string;
  componentPt: string;
  shortName: string | null;
  confidence: "exact" | "fuzzy";
  similarity: number; // 0-1, útil para telemetria/threshold tuning futuro
};

const FUZZY_THRESHOLD = 0.35; // não validado contra laudos reais, ver pendências

function normalize(s: string): string {
  // NFD decompõe "á" em "a" + marca de acento; \p{Mn} (Mark, nonspacing)
  // remove a marca — mesmo efeito de unaccent() sem depender da extensão.
  return s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Mn}/gu, "");
}

/**
 * Resolve um nome de biomarcador (texto livre extraído do laudo) contra a
 * base LOINC PT-BR. Tenta match exato normalizado primeiro (barato, sem
 * trigram), cai para similaridade pg_trgm se não achar. Retorna null se nada
 * bater acima do threshold — o item fica "unmapped" e ainda pode ser salvo
 * pelo médico, só não entra na comparação histórica automática por LOINC.
 */
export async function resolveLoincCode(rawName: string): Promise<LoincMatch | null> {
  const normalized = normalize(rawName);
  if (!normalized) return null;

  // 1) match exato contra component_pt — usa o texto bruto do laudo (o
  // índice não é normalizado, então comparamos como veio)
  const { data: exactRows, error: exactError } = await supabaseAdmin
    .from("loinc_pt_br")
    .select("loinc_code, component_pt, short_name")
    .ilike("component_pt", rawName.trim());

  if (exactError) {
    console.error(`[loinc-mapping] Erro no match exato: ${exactError.message}`);
  } else if (exactRows && exactRows.length > 0) {
    const row = exactRows[0];
    return {
      loincCode: row.loinc_code,
      componentPt: row.component_pt,
      shortName: row.short_name,
      confidence: "exact",
      similarity: 1,
    };
  }

  // 2) fuzzy via pg_trgm — usa a extensão já confirmada instalada no
  // projeto (schema `extensions`). Ordena por similaridade decrescente,
  // pega o melhor candidato acima do threshold.
  const { data: fuzzyRows, error: fuzzyError } = await supabaseAdmin.rpc("loinc_fuzzy_match", {
    search_term: normalized,
    min_similarity: FUZZY_THRESHOLD,
  });

  if (fuzzyError) {
    console.error(`[loinc-mapping] Erro no match fuzzy: ${fuzzyError.message}`);
    return null;
  }
  if (!fuzzyRows || fuzzyRows.length === 0) return null;

  const best = fuzzyRows[0];
  return {
    loincCode: best.loinc_code,
    componentPt: best.component_pt,
    shortName: best.short_name,
    confidence: "fuzzy",
    similarity: best.similarity,
  };
}
