// Contexto da sessão clínica (token + identidade do médico). Vive FORA dos
// arquivos de rota de propósito: o code-splitting do TanStack Router duplica
// módulos de rota em chunks separados — um contexto criado lá vira duas
// instâncias e o Provider "some". Aqui há uma instância só.

import { createContext, useContext, type ReactNode } from "react";

import { initialsOf } from "./clinic-types";

export type Clinic = { token: string; nome: string; email: string; avatarUrl: string | null };

const ClinicCtx = createContext<Clinic | null>(null);

export function ClinicProvider({ value, children }: { value: Clinic; children: ReactNode }) {
  return <ClinicCtx.Provider value={value}>{children}</ClinicCtx.Provider>;
}

export function useClinic(): Clinic {
  const v = useContext(ClinicCtx);
  if (!v) throw new Error("useClinic fora do layout /app");
  return v;
}

export function DoctorAvatar({ clinic, className }: { clinic: Clinic; className?: string }) {
  if (clinic.avatarUrl) {
    return (
      <img
        src={clinic.avatarUrl}
        alt={clinic.nome}
        referrerPolicy="no-referrer"
        className={`shrink-0 rounded-full object-cover ${className ?? "h-9 w-9"}`}
      />
    );
  }
  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-full brand-gradient font-bold text-primary-foreground ${className ?? "h-9 w-9 text-xs"}`}
    >
      {initialsOf(clinic.nome) || "DR"}
    </div>
  );
}
