// Server-only persistence shared by every collection.
//
// Antes: arquivos JSON em .data/*.json. No runtime de produção (Worker/edge)
// o filesystem é somente-leitura, então toda escrita caía silenciosamente no
// cache em memória — e cada isolate novo começava vazio. Efeito prático: a
// sessão do médico "caía" depois de ~1 min de uso (o isolate que gravou o
// token não era o mesmo que a validava) e o ditado morria em "Sessão
// expirada", porque requireDoctor não achava mais o token.
//
// Agora: uma tabela interna no Postgres (public.kv_collections) guarda cada
// coleção como um documento JSON. Acesso só pelo service_role (RLS ligada,
// sem policy). A API para os callers continua idêntica.

import crypto from "node:crypto";

import { supabaseAdmin } from "@/integrations/supabase/client.server";

const TABLE = "kv_collections";
/** Cache curto: leituras repetidas no mesmo request não batem no banco,
 *  mas o isolate nunca serve dado velho por muito tempo. */
const CACHE_TTL_MS = 2000;

type Entry = { rows: unknown[]; at: number };

const mem: Record<string, Entry> = {};
const queues: Record<string, Promise<unknown>> = {};

async function fetchRows<T>(name: string): Promise<T[]> {
  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .select("rows")
    .eq("name", name)
    .maybeSingle();
  if (error) throw error;
  const rows = (data?.rows ?? []) as T[];
  return Array.isArray(rows) ? rows : [];
}

async function load<T>(name: string, fresh = false): Promise<T[]> {
  const cached = mem[name];
  if (!fresh && cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.rows as T[];
  try {
    const rows = await fetchRows<T>(name);
    mem[name] = { rows, at: Date.now() };
    return rows;
  } catch {
    // Banco indisponível — segue com a última cópia conhecida.
    return (cached?.rows ?? []) as T[];
  }
}

async function persist<T>(name: string, rows: T[]): Promise<void> {
  mem[name] = { rows, at: Date.now() };
  const { error } = await supabaseAdmin
    .from(TABLE)
    .upsert({ name, rows: rows as never, updated_at: new Date().toISOString() }, { onConflict: "name" });
  if (error) throw new Error(`Falha ao gravar ${name}: ${error.message}`);
}

export async function readRows<T>(name: string): Promise<T[]> {
  return [...(await load<T>(name))] as T[];
}

/** Read-modify-write com serialização por coleção. `fn` devolve as novas
 *  linhas (ou muta no lugar e não devolve nada). */
export async function mutateRows<T>(name: string, fn: (rows: T[]) => T[] | void): Promise<T[]> {
  const run = async () => {
    // Sempre relê do banco antes de mutar: outro isolate pode ter gravado.
    const rows = await load<T>(name, true);
    const copy = [...rows];
    const next = fn(copy) ?? copy;
    await persist(name, next);
    return next;
  };
  const queued = (queues[name] ?? Promise.resolve()).then(run, run);
  queues[name] = queued.catch(() => {});
  return queued;
}

export function newId(bytes = 8): string {
  return crypto.randomBytes(bytes).toString("hex");
}

export function nowIso(): string {
  return new Date().toISOString();
}
