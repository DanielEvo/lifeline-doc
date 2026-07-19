// Server fns do painel admin. Todas exigem sessão admin desbloqueada,
// exceto adminUnlock e adminStatus. NÃO reutilizar em outros contextos —
// esse namespace tem permissão total sobre dados clínicos.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import crypto from "node:crypto";

import {
  checkAdminPassword,
  getAdminSession,
  isAdminUnlocked,
} from "../admin-session.server";
import { mutateRows, readRows, nowIso } from "../db.server";
import type { Doctor } from "../auth.server";
import type { PatientAccount } from "../patient-auth.server";
import type { PatientRegistry } from "../patients-registry.server";
import { createSession } from "../auth.server";
import { createPatientSession } from "../patient-auth.server";

const DOCTORS = "doctors.json";
const SESSIONS = "sessions.json";
const PATIENT_ACCOUNTS = "patient_accounts.json";
const PATIENT_SESSIONS = "patient_sessions.json";
const REGISTRY = "patients_registry.json";

async function requireAdmin() {
  if (!(await isAdminUnlocked())) {
    throw new Error("unauthorized");
  }
}

function hashPassword(password: string, salt: string) {
  return crypto.createHash("sha256").update(`${salt}:${password}`).digest("hex");
}

type PublicAccount = Omit<Doctor, "passHash" | "salt">;
function stripSecrets<T extends { passHash: string | null; salt: string | null }>(
  row: T,
): Omit<T, "passHash" | "salt"> {
  const { passHash: _p, salt: _s, ...rest } = row;
  return rest;
}
export type { PublicAccount };

// ---------- Sessão admin ----------

export const adminUnlock = createServerFn({ method: "POST" })
  .inputValidator(z.object({ password: z.string().min(1).max(200) }))
  .handler(async ({ data }) => {
    if (!checkAdminPassword(data.password)) {
      return { ok: false as const, error: "Senha incorreta." };
    }
    const s = await getAdminSession();
    await s.update({ unlocked: true, since: nowIso() });
    return { ok: true as const };
  });

export const adminLock = createServerFn({ method: "POST" }).handler(async () => {
  const s = await getAdminSession();
  await s.clear();
  return { ok: true as const };
});

export const adminStatus = createServerFn({ method: "GET" }).handler(async () => {
  return { unlocked: await isAdminUnlocked() };
});

// ---------- Dashboard ----------

export const adminDashboard = createServerFn({ method: "GET" }).handler(async () => {
  await requireAdmin();
  const [doctors, patients, registry] = await Promise.all([
    readRows<Doctor>(DOCTORS),
    readRows<PatientAccount>(PATIENT_ACCOUNTS),
    readRows<PatientRegistry>(REGISTRY),
  ]);
  return {
    doctors: doctors.length,
    patients: patients.length,
    registry: registry.length,
  };
});

// ---------- Médicos ----------

export const adminListDoctors = createServerFn({ method: "GET" }).handler(async () => {
  await requireAdmin();
  const rows = await readRows<Doctor>(DOCTORS);
  return { rows: rows.map(stripSecrets) };
});

export const adminResetDoctorPassword = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({ doctorId: z.string().min(1), newPassword: z.string().min(6).max(120) }),
  )
  .handler(async ({ data }) => {
    await requireAdmin();
    const salt = crypto.randomBytes(12).toString("hex");
    const passHash = hashPassword(data.newPassword, salt);
    let found = false;
    await mutateRows<Doctor>(DOCTORS, (rows) => {
      const d = rows.find((x) => x.id === data.doctorId);
      if (d) {
        d.salt = salt;
        d.passHash = passHash;
        found = true;
      }
    });
    if (!found) return { ok: false as const, error: "Médico não encontrado." };
    await mutateRows<{ doctorId: string }>(SESSIONS, (rows) =>
      rows.filter((s) => s.doctorId !== data.doctorId),
    );
    return { ok: true as const };
  });

export const adminDeleteDoctor = createServerFn({ method: "POST" })
  .inputValidator(z.object({ doctorId: z.string().min(1) }))
  .handler(async ({ data }) => {
    await requireAdmin();
    await mutateRows<Doctor>(DOCTORS, (rows) => rows.filter((x) => x.id !== data.doctorId));
    await mutateRows<{ doctorId: string }>(SESSIONS, (rows) =>
      rows.filter((s) => s.doctorId !== data.doctorId),
    );
    return { ok: true as const };
  });

export const adminImpersonateDoctor = createServerFn({ method: "POST" })
  .inputValidator(z.object({ doctorId: z.string().min(1) }))
  .handler(async ({ data }) => {
    await requireAdmin();
    const doctors = await readRows<Doctor>(DOCTORS);
    const d = doctors.find((x) => x.id === data.doctorId);
    if (!d) return { ok: false as const, error: "Médico não encontrado." };
    const token = await createSession(d.id);
    return { ok: true as const, token, nome: d.nome, email: d.email };
  });

// ---------- Pacientes (contas) ----------

export const adminListPatients = createServerFn({ method: "GET" }).handler(async () => {
  await requireAdmin();
  const rows = await readRows<PatientAccount>(PATIENT_ACCOUNTS);
  return { rows: rows.map(stripSecrets) };
});

export const adminResetPatientPassword = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({ patientId: z.string().min(1), newPassword: z.string().min(6).max(120) }),
  )
  .handler(async ({ data }) => {
    await requireAdmin();
    const salt = crypto.randomBytes(12).toString("hex");
    const passHash = hashPassword(data.newPassword, salt);
    let found = false;
    await mutateRows<PatientAccount>(PATIENT_ACCOUNTS, (rows) => {
      const p = rows.find((x) => x.id === data.patientId);
      if (p) {
        p.salt = salt;
        p.passHash = passHash;
        found = true;
      }
    });
    if (!found) return { ok: false as const, error: "Paciente não encontrado." };
    await mutateRows<{ patientId: string }>(PATIENT_SESSIONS, (rows) =>
      rows.filter((s) => s.patientId !== data.patientId),
    );
    return { ok: true as const };
  });

export const adminDeletePatient = createServerFn({ method: "POST" })
  .inputValidator(z.object({ patientId: z.string().min(1) }))
  .handler(async ({ data }) => {
    await requireAdmin();
    await mutateRows<PatientAccount>(PATIENT_ACCOUNTS, (rows) =>
      rows.filter((x) => x.id !== data.patientId),
    );
    await mutateRows<{ patientId: string }>(PATIENT_SESSIONS, (rows) =>
      rows.filter((s) => s.patientId !== data.patientId),
    );
    return { ok: true as const };
  });

export const adminImpersonatePatient = createServerFn({ method: "POST" })
  .inputValidator(z.object({ patientId: z.string().min(1) }))
  .handler(async ({ data }) => {
    await requireAdmin();
    const patients = await readRows<PatientAccount>(PATIENT_ACCOUNTS);
    const p = patients.find((x) => x.id === data.patientId);
    if (!p) return { ok: false as const, error: "Paciente não encontrado." };
    const token = await createPatientSession(p.id);
    return { ok: true as const, token, nome: p.nome, email: p.email };
  });

// ---------- Registry global ----------

export const adminListRegistry = createServerFn({ method: "GET" }).handler(async () => {
  await requireAdmin();
  const rows = await readRows<PatientRegistry>(REGISTRY);
  return { rows };
});
