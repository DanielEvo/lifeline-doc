// Server-only auth: doctor accounts with salted SHA-256 password hashing and
// token sessions, persisted in .data/*.json (same pattern as store.server.ts).
// Google sign-in is simulated (no OAuth app configured) but flows through the
// same account + session machinery, so the client experience is identical.

import crypto from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

const DATA_DIR = path.join(process.cwd(), ".data");

const mem: Record<string, unknown[]> = {};

async function readRows<T>(name: string): Promise<T[]> {
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

async function writeRows<T>(name: string, rows: T[]): Promise<void> {
  mem[name] = rows;
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(path.join(DATA_DIR, name), JSON.stringify(rows, null, 2), "utf-8");
  } catch {
    // memory-only fallback
  }
}

export type Doctor = {
  id: string;
  nome: string;
  email: string;
  passHash: string | null; // null for Google accounts
  salt: string | null;
  provider: "email" | "google";
  createdAt: string;
};

type Session = { token: string; doctorId: string; createdAt: string };

function id() {
  return crypto.randomBytes(8).toString("hex");
}

function hashPassword(password: string, salt: string) {
  return crypto.createHash("sha256").update(`${salt}:${password}`).digest("hex");
}

export async function findDoctorByEmail(email: string): Promise<Doctor | undefined> {
  const rows = await readRows<Doctor>("doctors.json");
  return rows.find((d) => d.email.toLowerCase() === email.toLowerCase());
}

export async function createDoctor(input: {
  nome: string;
  email: string;
  password?: string;
  provider: "email" | "google";
}): Promise<Doctor> {
  const rows = await readRows<Doctor>("doctors.json");
  const salt = input.password ? crypto.randomBytes(12).toString("hex") : null;
  const doctor: Doctor = {
    id: id(),
    nome: input.nome,
    email: input.email,
    passHash: input.password && salt ? hashPassword(input.password, salt) : null,
    salt,
    provider: input.provider,
    createdAt: new Date().toISOString(),
  };
  rows.push(doctor);
  await writeRows("doctors.json", rows);
  return doctor;
}

export function verifyPassword(doctor: Doctor, password: string): boolean {
  if (!doctor.passHash || !doctor.salt) return false;
  return hashPassword(password, doctor.salt) === doctor.passHash;
}

export async function createSession(doctorId: string): Promise<string> {
  const rows = await readRows<Session>("sessions.json");
  const token = crypto.randomBytes(24).toString("hex");
  rows.push({ token, doctorId, createdAt: new Date().toISOString() });
  await writeRows("sessions.json", rows);
  return token;
}

export async function findDoctorByToken(token: string): Promise<Doctor | undefined> {
  const sessions = await readRows<Session>("sessions.json");
  const s = sessions.find((x) => x.token === token);
  if (!s) return undefined;
  const doctors = await readRows<Doctor>("doctors.json");
  return doctors.find((d) => d.id === s.doctorId);
}

export async function revokeSession(token: string): Promise<void> {
  const sessions = await readRows<Session>("sessions.json");
  await writeRows(
    "sessions.json",
    sessions.filter((x) => x.token !== token),
  );
}
