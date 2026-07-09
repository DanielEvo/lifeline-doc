// Server-only JSON persistence shared by every collection (.data/*.json).
// Single-node store: reads hit an in-memory cache, writes are serialized per
// collection so concurrent server-fn calls can't interleave and drop rows.
// Swap this module for Postgres/Supabase without touching callers.

import crypto from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

const DATA_DIR = path.join(process.cwd(), ".data");

const mem: Record<string, unknown[]> = {};
const queues: Record<string, Promise<unknown>> = {};

async function load<T>(name: string): Promise<T[]> {
  if (mem[name]) return mem[name] as T[];
  try {
    const raw = await fs.readFile(path.join(DATA_DIR, name), "utf-8");
    mem[name] = JSON.parse(raw) as T[];
  } catch {
    mem[name] = [];
  }
  return mem[name] as T[];
}

async function persist<T>(name: string, rows: T[]): Promise<void> {
  mem[name] = rows;
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    const tmp = path.join(DATA_DIR, `${name}.tmp`);
    await fs.writeFile(tmp, JSON.stringify(rows, null, 2), "utf-8");
    await fs.rename(tmp, path.join(DATA_DIR, name));
  } catch {
    // filesystem unavailable (edge runtime) — keep the in-memory copy
  }
}

export async function readRows<T>(name: string): Promise<T[]> {
  return [...(await load<T>(name))] as T[];
}

/** Read-modify-write with per-collection serialization. Return the new rows
 *  from `fn` (or mutate in place and return nothing). */
export async function mutateRows<T>(name: string, fn: (rows: T[]) => T[] | void): Promise<T[]> {
  const run = async () => {
    const rows = await load<T>(name);
    const next = fn(rows) ?? rows;
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
