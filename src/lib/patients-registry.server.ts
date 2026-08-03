// Registro global de identidade de paciente (TECH-13).
// patients_registry.json é a fonte única do "quem é essa pessoa no mundo":
// nome, documentos, contato, perfil autodeclarado. Vive em namespace
// separado tanto das contas de médico (doctors.json) quanto das entradas
// clínicas por médico (patients.json). O vínculo entre uma conta de
// paciente e um prontuário mantido por um médico é feito via globalId
// (BKL-37) — ver linkPatientToGlobalId em patients.server.ts.

import { mutateRows, newId, nowIso, readRows } from "./db.server";
import type { Patient } from "./clinic-types";

export type PatientRegistry = {
  globalId: string;
  /** LifeLine ID público — 3 letras + 6 dígitos, tudo aleatório, sem separadores. */
  publicCode: string;
  fullName: string;
  cpf?: string;
  rg?: string;
  email?: string;
  telefone?: string;
  birthDate?: string;
  sexo?: "F" | "M" | "outro";
  createdBy: { type: "doctor" | "patient"; id: string };
  createdAt: string;
  patientProfile?: {
    tipoSanguineo?: string;
    alergias?: string;
    pesoKg?: number | null;
    alturaCm?: number | null;
    /** Autodeclaradas pelo paciente — nunca viram fato clínico sozinhas. */
    comorbidades?: string[];
    historicoFamiliar?: string;
    updatedAt: string;
  } | null;

};

const REGISTRY = "patients_registry.json";

// Sem I/O — evita confusão com 1/0 na leitura em voz alta pelo paciente.
const CODE_LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ";

function generatePublicCode(): string {
  let letters = "";
  for (let i = 0; i < 3; i++) letters += CODE_LETTERS[Math.floor(Math.random() * CODE_LETTERS.length)];
  let digits = "";
  for (let i = 0; i < 6; i++) digits += Math.floor(Math.random() * 10);
  return `${letters}${digits}`;
}

function normalizePublicCode(code: string): string {
  return code.trim().toUpperCase().replace(/[\s-]/g, "");
}

function normalizeCpf(cpf: string): string {
  return cpf.replace(/\D/g, "");
}

function normalizeRg(rg: string): string {
  return rg.trim().toUpperCase();
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function createRegistryEntry(
  input: Omit<PatientRegistry, "globalId" | "publicCode" | "createdAt" | "createdBy" | "patientProfile">,
  createdBy: PatientRegistry["createdBy"],
): Promise<PatientRegistry> {
  const rows = await readRows<PatientRegistry>(REGISTRY);
  let publicCode = "";
  for (let attempt = 0; attempt < 10; attempt++) {
    const candidate = generatePublicCode();
    if (!rows.some((r) => r.publicCode === candidate)) {
      publicCode = candidate;
      break;
    }
  }
  if (!publicCode) throw new Error("Falha ao gerar LifeLine ID único após 10 tentativas");

  const entry: PatientRegistry = {
    globalId: newId(),
    publicCode,
    ...input,
    createdBy,
    createdAt: nowIso(),
    patientProfile: null,
  };
  await mutateRows<PatientRegistry>(REGISTRY, (rows) => {
    rows.push(entry);
  });
  return entry;
}

export async function findRegistryByGlobalId(
  globalId: string,
): Promise<PatientRegistry | undefined> {
  const rows = await readRows<PatientRegistry>(REGISTRY);
  return rows.find((r) => r.globalId === globalId);
}

export async function findRegistryByPublicCode(
  code: string,
): Promise<PatientRegistry | undefined> {
  const normalized = normalizePublicCode(code);
  const rows = await readRows<PatientRegistry>(REGISTRY);
  return rows.find((r) => r.publicCode === normalized);
}

export async function findRegistryByCpf(cpf: string): Promise<PatientRegistry | undefined> {
  const normalized = normalizeCpf(cpf);
  if (!normalized) return undefined;
  const rows = await readRows<PatientRegistry>(REGISTRY);
  return rows.find((r) => r.cpf && normalizeCpf(r.cpf) === normalized);
}

export async function findRegistryByRg(rg: string): Promise<PatientRegistry | undefined> {
  const normalized = normalizeRg(rg);
  if (!normalized) return undefined;
  const rows = await readRows<PatientRegistry>(REGISTRY);
  return rows.find((r) => r.rg && normalizeRg(r.rg) === normalized);
}

export async function findRegistryByEmail(email: string): Promise<PatientRegistry | undefined> {
  const normalized = normalizeEmail(email);
  if (!normalized) return undefined;
  const rows = await readRows<PatientRegistry>(REGISTRY);
  return rows.find((r) => r.email && normalizeEmail(r.email) === normalized);
}

export async function searchRegistryByName(
  nomeParcial: string,
  limit = 10,
): Promise<PatientRegistry[]> {
  const needle = nomeParcial.trim().toLowerCase();
  if (!needle) return [];
  const rows = await readRows<PatientRegistry>(REGISTRY);
  return rows.filter((r) => r.fullName.toLowerCase().includes(needle)).slice(0, limit);
}

export type ProfileUpdate = {
  birthDate?: string;
  sexo?: "F" | "M" | "outro";
  telefone?: string;
  cpf?: string;
  tipoSanguineo?: string;
  alergias?: string;
  pesoKg?: number;
  alturaCm?: number;
};

export async function updateRegistryProfile(
  globalId: string,
  profile: ProfileUpdate,
): Promise<PatientRegistry | undefined> {
  let updated: PatientRegistry | undefined;
  await mutateRows<PatientRegistry>(REGISTRY, (rows) => {
    for (const r of rows) {
      if (r.globalId !== globalId) continue;
      // Identidade trava após o primeiro valor gravado — espelha a trava já
      // existente no lado médico (updatePatient não deixa reeditar nascimento/
      // sexo/CPF depois do cadastro). telefone e o perfil autodeclarado
      // continuam livres.
      if (profile.birthDate !== undefined && r.birthDate == null) r.birthDate = profile.birthDate;
      if (profile.sexo !== undefined && r.sexo == null) r.sexo = profile.sexo;
      if (profile.cpf !== undefined && r.cpf == null) r.cpf = profile.cpf;
      if (profile.telefone !== undefined) r.telefone = profile.telefone;
      r.patientProfile = {
        tipoSanguineo: profile.tipoSanguineo ?? r.patientProfile?.tipoSanguineo,
        alergias: profile.alergias ?? r.patientProfile?.alergias,
        pesoKg: profile.pesoKg ?? r.patientProfile?.pesoKg,
        alturaCm: profile.alturaCm ?? r.patientProfile?.alturaCm,
        updatedAt: nowIso(),
      };
      updated = r;
      break;
    }
  });
  return updated;
}

// ---------------------------------------------------------------------------
// BKL-37 — mescla dos campos autodeclarados pelo paciente por cima do
// cadastro do médico. Vínculo (patient.globalId) e ACESSO (hasAccess, já
// calculado pelo chamador via hasProfileAccess) são decisões independentes:
// só mergeia os campos quando as duas coisas são verdadeiras. Só sobrepõe
// campos que o paciente de fato preencheu; o resto do cadastro (nome,
// queixa, etc.) continua vindo do médico.
// ---------------------------------------------------------------------------

export type VinculoStatus = "sem_vinculo" | "sem_acesso" | "com_acesso";

export function mergeAutodeclarado(
  patient: Patient,
  registry: PatientRegistry | undefined,
  hasAccess: boolean,
): Patient & { vinculo: VinculoStatus } {
  if (!patient.globalId || !registry) {
    return { ...patient, vinculo: "sem_vinculo" };
  }
  if (!hasAccess) {
    return { ...patient, vinculo: "sem_acesso" };
  }
  const profile = registry.patientProfile;
  return {
    ...patient,
    tipoSanguineo: profile?.tipoSanguineo ?? patient.tipoSanguineo,
    alergias: profile?.alergias ?? patient.alergias,
    pesoKg: profile?.pesoKg ?? patient.pesoKg,
    alturaCm: profile?.alturaCm ?? patient.alturaCm,
    vinculo: "com_acesso",
  };
}
