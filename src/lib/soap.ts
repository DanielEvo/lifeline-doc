// Derivação heurística S/O/A/P a partir do texto livre de Evolução.
// Puro e isomórfico: o cliente usa para preview em tempo real, o servidor
// recalcula na gravação (fonte autoritativa). Regras por palavras-chave —
// substituível por extração LLM sem mudar a interface.

import type { Soap } from "./clinic-types";

export type { Soap } from "./clinic-types";

const A_KEYS = ["anemia", "ferropriv", "hipótese", "hipotese", "diagnóst", "diagnost", "cid", "síndrome", "sindrome", "provável", "provavel", "avaliaç", "suspeita"];
const P_KEYS = ["sulfato", "ferroso", "colecalciferol", "ácido fólico", "acido folico", "prescre", "solicit", "reavali", "retorno", "manter", "iniciar", "suplement", "conduta", "orient", "tratamento", "encaminh", "ferro sérico", "ferro serico"];
const O_KEYS = ["g/dl", "ng/ml", "mg/dl", "pg/ml", "µg/dl", "mmhg", "bpm", "hemograma", "exame", "ferritina", "hemoglobina", "hb ", "vit d", "vitamina", "biomarc", "pressão", "pressao", "fc ", "fr ", "sat"];

export function deriveSoap(text: string): Soap {
  const sentences = text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const has = (str: string, arr: string[]) => arr.some((k) => str.toLowerCase().includes(k));
  const bucket: Record<keyof Soap, string[]> = { s: [], o: [], a: [], p: [] };
  for (const sen of sentences) {
    if (has(sen, A_KEYS)) bucket.a.push(sen);
    else if (has(sen, P_KEYS)) bucket.p.push(sen);
    else if (has(sen, O_KEYS)) bucket.o.push(sen);
    else bucket.s.push(sen);
  }
  return {
    s: bucket.s.join(" "),
    o: bucket.o.join(" "),
    a: bucket.a.join(" "),
    p: bucket.p.join(" "),
  };
}
