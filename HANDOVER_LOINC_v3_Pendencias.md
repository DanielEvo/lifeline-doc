# Handover LOINC v3 — Pendências

Registrado ao final do patch `feat(loinc): seed loinc_pt_br + fuzzy fallback
no matching de biomarcadores`. Nada aqui foi implementado nesta rodada —
é só documentação de decisões conscientes e itens em aberto.

## 1. Códigos do PASSO 2 marcados como `loincCode: null`

Curadoria contra `loinc_pt_br_filtered.json` (14.598 entradas). Onde a
verificação falhou ou ficou ambígua, ficou `null` em vez de adivinhar —
errar um código LOINC corrompe agrupamento histórico silenciosamente.

| Biomarcador | Código sugerido no prompt original | Motivo do `null` |
|---|---|---|
| Zinco | `5763-8` | Não existe no subset. Só há "Zinco.protoporfirina" (teste diferente, não é zinco sérico). |
| Glicemia de jejum | `1558-6` | Código não existe no subset. "Glicose" (Sor/Plas, Qn) existe, mas com ~10 códigos LOINC distintos sem forma de desambiguar por método/coleta a partir dos campos disponíveis (component_pt, system, class, scale_typ). |
| T3 Livre | `3053-6` | **Erro no prompt original**: esse código é `Triiodotironina` (T3 **total**, sem qualificador `.livre`). O componente correto ("Triiodotironina.livre") existe no subset, mas com 4 códigos candidatos idênticos em component_pt/system/class/scale (14928-6, 29239-1, 3051-0, 35230-2) — nenhum escolhido para não inventar. |
| SHBG | `2986-8` | **Erro no prompt original**: esse código é Testosterona Total (reaproveitado incorretamente — já usado para "Testosterona Total" no catálogo). Não existe nenhuma entrada de SHBG (Globulina Transportadora de Hormônios Sexuais) no subset filtrado. |
| eGFR | (já indicado como null) | Confirmado: índice calculado, não bate com uma entrada LOINC simples. Só existem variantes "Taxa de Filtração glomerular/1.73 m2.previsto.{negro,não negro,feminino,masculino}" — fórmulas específicas, não um "eGFR" genérico. |
| HOMA-IR | (já indicado como null) | Confirmado: índice calculado, sem entrada LOINC direta. |
| Testosterona Livre Calculada | (já indicado como null) | Confirmado: calculado. |
| Testosterona Biodisponível | (já indicado como null) | Confirmado: calculado. |
| Não-HDL Colesterol | (sem código sugerido, "confirme se existe") | Existe, mas ambíguo: `43396-1` ("Colesterol.não HDL", Sor/Plas, Qn) e `70204-3` ("Colesterol não HDL", Soro/Plas, Qn) são candidatos igualmente plausíveis, diferindo só na grafia do `system`. Sem uma regra de desempate explícita (como a dada para Vitamina D), ficou `null`. |

Todos os demais ~40 códigos do prompt original foram confirmados corretos
contra o arquivo (`component_pt` bate com o conceito certo, incluindo os
pares total/livre como PSA Total vs. PSA Livre e T4 Total vs. T4 Livre).

## 2. Threshold de fuzzy match (0.35)

Não validado contra laudos reais — mesma pendência já registrada nos
handovers anteriores. `FUZZY_THRESHOLD` em `loinc-mapping.server.ts`.

## 3. `measurements.json` — ATUALIZAÇÃO em relação ao prompt original

O prompt original assumia que `measurements.server.ts` ainda usava só JSON
sem colunas LOINC. **Isso mudou**: o `git pull` desta sessão trouxe a
migração `20260726032223_...sql` (já aplicada, fora desta sessão) que criou
`public.measurements` em Postgres **já com** `loinc_code` e
`loinc_confidence`, e também `public.patient_pending_measurements`. Porém
`src/lib/measurements.server.ts` **continua** lendo/gravando em
`measurements.json` via `db.server.ts` — a tabela Postgres existe mas está
órfã, não conectada a nenhum código.

Migrar `measurements.server.ts` de JSON para a tabela Postgres (incluindo
migração dos dados existentes) é trabalho separado, maior que este patch, e
não foi feito aqui. Ver também se `patient_pending_measurements` é o destino
pretendido do fluxo de auto-declaração do paciente (BKL-37) — não investigado
nesta rodada.

## 4. UI de confirmação

Mostrar `loincSuggestion` ao lado do dropdown "não reconhecido" na tela de
confirmação de exame é trabalho de Lovable (frontend), não incluído neste
patch de Claude Code.

## 5. Seed e autovalidação não executados nesta sessão

`SUPABASE_SERVICE_ROLE_KEY` não está disponível no `.env` local (só a chave
publishable/anon) — `supabaseAdmin` não consegue autenticar neste ambiente.
Como consequência, **não foi possível rodar nesta sessão**:

- `scripts/seed-loinc.ts` (popular `loinc_pt_br`)
- Teste manual de `resolveLoincCode(...)` contra o banco real
- Confirmação de que a extensão `unaccent` foi instalada com sucesso pela
  migração `20260726040000_loinc-fuzzy-match.sql`

Rodar isso requer um ambiente com a service role key configurada (produção/
Lovable Cloud, ou exportá-la localmente antes de rodar
`bun run scripts/seed-loinc.ts`).
