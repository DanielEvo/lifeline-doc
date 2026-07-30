// Server-only: Meus Critérios — plano "Verdade" do Knowledge Base (ver
// LifeLine_KnowledgeBase_Assistente_IA.md). O médico escreve em linguagem
// natural numa caixa única; a IA classifica em regra/métrica/estilo sem expor
// esse vocabulário técnico na UI. Regra e Estilo são sempre injetados no
// system prompt do chat (knowledge-chat.functions.ts); Métrica fica
// registrada mas, nesta rodada, não alimenta nenhuma agregação (ver
// HANDOVER_LOINC_v3_Pendencias.md — measurements ainda não migrou para
// Postgres, pré-requisito de TECH-20).

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { callLovableChat } from "./knowledge-chat.functions";

export type CriterioKind = "regra" | "metrica" | "estilo";

export type Criterio = {
  id: string;
  doctorId: string;
  label: string;
  kind: CriterioKind;
  rawText: string;
  createdAt: string;
  updatedAt: string;
};

function fromRow(row: {
  id: string;
  doctor_id: string;
  label: string;
  kind: string;
  raw_text: string;
  created_at: string;
  updated_at: string;
}): Criterio {
  return {
    id: row.id,
    doctorId: row.doctor_id,
    label: row.label,
    kind: row.kind as CriterioKind,
    rawText: row.raw_text,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listCriterios(doctorId: string): Promise<Criterio[]> {
  const { data, error } = await supabaseAdmin
    .from("criterios")
    .select("*")
    .eq("doctor_id", doctorId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Falha ao listar critérios: ${error.message}`);
  return (data ?? []).map(fromRow);
}

const CLASSIFY_SYSTEM = `Você classifica uma frase que um médico escreveu sobre sua própria prática clínica.
Devolva SOMENTE um JSON válido, sem markdown, no formato exato:
{"kind": "regra" | "metrica" | "estilo", "label": "..."}

Critérios de classificação:
- "regra": a frase trava uma ação (ex: "nunca uso X como 1ª linha", "não prescrevo Y para gestantes"). Nunca pode ser contrariada.
- "metrica": a frase define um valor numérico ou threshold que filtra/segmenta pacientes (ex: "ferritina baixa é abaixo de 30", "HbA1c controlado é abaixo de 7%").
- "estilo": a frase descreve tom, preferência ou forma de trabalho, sem travar nada (ex: "prefiro decisão compartilhada", "explico com linguagem simples").

"label" é um rótulo curto (3-6 palavras) que resume a frase para exibir numa lista, ex: "Ferritina baixa" ou "Benzodiazepínico em insônia".`;

function parseClassification(reply: string): { kind: CriterioKind; label: string } | null {
  const cleaned = reply
    .trim()
    .replace(/^```(json)?/i, "")
    .replace(/```$/, "")
    .trim();
  try {
    const parsed = JSON.parse(cleaned) as { kind?: string; label?: string };
    if (parsed.kind === "regra" || parsed.kind === "metrica" || parsed.kind === "estilo") {
      return { kind: parsed.kind, label: (parsed.label ?? "").trim() || "Critério" };
    }
    return null;
  } catch {
    return null;
  }
}

/** Classifica o texto livre do médico. Se a IA falhar ou responder algo
 *  ilegível, cai para "estilo" — é a categoria mais segura (nunca trava uma
 *  ação por engano) e fica visível para o médico corrigir com um toque. */
export async function classifyCriterio(
  rawText: string,
): Promise<{ kind: CriterioKind; label: string }> {
  try {
    const reply = await callLovableChat([{ role: "user", content: rawText }], {
      system: CLASSIFY_SYSTEM,
    });
    const parsed = parseClassification(reply);
    if (parsed) return parsed;
  } catch (err) {
    console.error("[criterios] classificação falhou, usando default:", err);
  }
  return { kind: "estilo", label: rawText.slice(0, 60) };
}

export async function createCriterio(doctorId: string, rawText: string): Promise<Criterio> {
  const { kind, label } = await classifyCriterio(rawText);
  const { data, error } = await supabaseAdmin
    .from("criterios")
    .insert({ doctor_id: doctorId, label, kind, raw_text: rawText })
    .select("*")
    .single();
  if (error || !data) throw new Error(`Falha ao salvar critério: ${error?.message}`);
  return fromRow(data);
}

/** Correção manual pelo médico via badge (Seção 3.2 do doc): um toque alterna
 *  entre "aplicado sempre" (regra ou estilo) e "usado em análises" (métrica).
 *  Ao sair de métrica, o default é "estilo" — o médico ainda pode editar o
 *  texto para deixar mais explícito se quer que vire regra. */
export async function setCriterioKind(
  doctorId: string,
  id: string,
  kind: CriterioKind,
): Promise<Criterio | undefined> {
  const { data, error } = await supabaseAdmin
    .from("criterios")
    .update({ kind, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("doctor_id", doctorId)
    .select("*")
    .maybeSingle();
  if (error) throw new Error(`Falha ao atualizar critério: ${error.message}`);
  return data ? fromRow(data) : undefined;
}

export async function deleteCriterio(doctorId: string, id: string): Promise<boolean> {
  const { error, count } = await supabaseAdmin
    .from("criterios")
    .delete({ count: "exact" })
    .eq("id", id)
    .eq("doctor_id", doctorId);
  if (error) throw new Error(`Falha ao remover critério: ${error.message}`);
  return (count ?? 0) > 0;
}

/** Usado pelo chat (knowledge-chat.functions.ts) para montar o bloco de
 *  contexto sempre injetado no system prompt — só Regra e Estilo, nunca
 *  Métrica (que não é uma instrução, é um valor de cálculo). */
export async function listAlwaysAppliedCriterios(doctorId: string): Promise<Criterio[]> {
  const { data, error } = await supabaseAdmin
    .from("criterios")
    .select("*")
    .eq("doctor_id", doctorId)
    .in("kind", ["regra", "estilo"])
    .order("created_at", { ascending: true });
  if (error) throw new Error(`Falha ao listar critérios: ${error.message}`);
  return (data ?? []).map(fromRow);
}
