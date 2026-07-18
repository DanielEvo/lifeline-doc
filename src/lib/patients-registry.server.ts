// Registro global de identidade de paciente (TECH-13).
// patients_registry.json é a fonte única do "quem é essa pessoa no mundo":
// nome, documentos, contato, perfil autodeclarado. Vive em namespace
// separado tanto das contas de médico (doctors.json) quanto das entradas
// clínicas por médico (patients.json). O vínculo entre uma conta de
// paciente e um prontuário mantido por um médico é decidido em outra
// rodada — por ora ninguém procura registry por CPF, só grava.

import { mutateRows, newId, nowIso, readRows } from "./db.server";

export type PatientRegistry = {
  globalId: string;
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
    updatedAt: string;
  } | null;
};

const REGISTRY = "patients_registry.json";

export async function createRegistryEntry(
  input: Omit<PatientRegistry, "globalId" | "createdAt" | "createdBy" | "patientProfile">,
  createdBy: PatientRegistry["createdBy"],
): Promise<PatientRegistry> {
  const entry: PatientRegistry = {
    globalId: newId(),
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

export type ProfileUpdate = {
  birthDate?: string;
  sexo?: "F" | "M" | "outro";
  telefone?: string;
  cpf?: string;
  tipoSanguineo?: string;
  alergias?: string;
};

export async function updateRegistryProfile(
  globalId: string,
  profile: ProfileUpdate,
): Promise<PatientRegistry | undefined> {
  let updated: PatientRegistry | undefined;
  await mutateRows<PatientRegistry>(REGISTRY, (rows) => {
    for (const r of rows) {
      if (r.globalId !== globalId) continue;
      if (profile.birthDate !== undefined) r.birthDate = profile.birthDate;
      if (profile.sexo !== undefined) r.sexo = profile.sexo;
      if (profile.telefone !== undefined) r.telefone = profile.telefone;
      if (profile.cpf !== undefined) r.cpf = profile.cpf;
      r.patientProfile = {
        tipoSanguineo: profile.tipoSanguineo ?? r.patientProfile?.tipoSanguineo,
        alergias: profile.alergias ?? r.patientProfile?.alergias,
        updatedAt: nowIso(),
      };
      updated = r;
      break;
    }
  });
  return updated;
}
