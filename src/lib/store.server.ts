// Server-only persistence for the demo. Writes to a local .data/*.json file
// so doctor feedback and leads survive across requests during a test session;
// falls back to in-memory if the filesystem isn't writable (e.g. edge runtime).

import { promises as fs } from "node:fs";
import path from "node:path";

const DATA_DIR = path.join(process.cwd(), ".data");

const mem: Record<string, unknown[]> = {};

async function readFile<T>(name: string): Promise<T[]> {
  if (mem[name]) return mem[name] as T[];
  try {
    const raw = await fs.readFile(path.join(DATA_DIR, name), "utf-8");
    const parsed = JSON.parse(raw) as T[];
    mem[name] = parsed;
    return parsed;
  } catch {
    mem[name] = [];
    return [];
  }
}

async function writeFile<T>(name: string, rows: T[]): Promise<void> {
  mem[name] = rows;
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(path.join(DATA_DIR, name), JSON.stringify(rows, null, 2), "utf-8");
  } catch {
    // in-memory only — degrade gracefully
  }
}

export type FeedbackEntry = {
  id: string;
  rating: string;
  note: string;
  step: string;
  createdAt: string;
};

export type LeadEntry = {
  id: string;
  nome: string;
  email: string;
  whatsapp: string;
  especialidade: string;
  createdAt: string;
};

function id() {
  return Math.random().toString(36).slice(2, 10);
}

export async function addFeedback(input: { rating: string; note: string; step: string }) {
  const rows = await readFile<FeedbackEntry>("feedback.json");
  const entry: FeedbackEntry = {
    id: id(),
    rating: input.rating,
    note: input.note,
    step: input.step,
    createdAt: new Date().toISOString(),
  };
  rows.unshift(entry);
  await writeFile("feedback.json", rows);
  return { ok: true as const, total: rows.length };
}

export async function listFeedback() {
  const rows = await readFile<FeedbackEntry>("feedback.json");
  const counts = rows.reduce<Record<string, number>>((acc, r) => {
    acc[r.rating] = (acc[r.rating] ?? 0) + 1;
    return acc;
  }, {});
  return { rows, total: rows.length, counts };
}

export async function addLead(input: {
  nome: string;
  email: string;
  whatsapp: string;
  especialidade: string;
}) {
  const rows = await readFile<LeadEntry>("leads.json");
  const entry: LeadEntry = { id: id(), createdAt: new Date().toISOString(), ...input };
  rows.unshift(entry);
  await writeFile("leads.json", rows);
  return { ok: true as const, total: rows.length };
}

export async function listLeads() {
  const rows = await readFile<LeadEntry>("leads.json");
  return { rows, total: rows.length };
}

export type ConsultationEntry = {
  id: string;
  patient: string;
  protocol: string;
  signature: string;
  signedAt: string;
  summary: string;
};

export async function addConsultation(input: {
  patient: string;
  protocol: string;
  signature: string;
  signedAt: string;
  summary: string;
}) {
  const rows = await readFile<ConsultationEntry>("consultations.json");
  rows.unshift({ id: id(), ...input });
  await writeFile("consultations.json", rows);
  return { ok: true as const, total: rows.length };
}

export async function listConsultations() {
  const rows = await readFile<ConsultationEntry>("consultations.json");
  return { rows, total: rows.length };
}

export type PrescriptionEntry = {
  id: string;
  code: string;
  patient: string;
  meds: string[];
  createdAt: string;
};

export async function addPrescription(input: { code: string; patient: string; meds: string[] }) {
  const rows = await readFile<PrescriptionEntry>("prescriptions.json");
  rows.unshift({ id: id(), createdAt: new Date().toISOString(), ...input });
  await writeFile("prescriptions.json", rows);
  return { ok: true as const, total: rows.length };
}

export async function listPrescriptions() {
  const rows = await readFile<PrescriptionEntry>("prescriptions.json");
  return { rows, total: rows.length };
}
