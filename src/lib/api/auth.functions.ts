import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
  createDoctor,
  createSession,
  findDoctorByEmail,
  findDoctorByToken,
  revokeSession,
  verifyPassword,
} from "../auth.server";

type AuthResult =
  | { ok: true; token: string; doctor: { nome: string; email: string } }
  | { ok: false; error: string };

export const registerDoctor = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      nome: z.string().min(2).max(120),
      email: z.string().email().max(160),
      password: z.string().min(6).max(120),
    }),
  )
  .handler(async ({ data }): Promise<AuthResult> => {
    const existing = await findDoctorByEmail(data.email);
    if (existing) return { ok: false, error: "Este e-mail já tem cadastro. Faça login." };
    const doctor = await createDoctor({ ...data, provider: "email" });
    const token = await createSession(doctor.id);
    return { ok: true, token, doctor: { nome: doctor.nome, email: doctor.email } };
  });

export const loginDoctor = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      email: z.string().email().max(160),
      password: z.string().min(1).max(120),
    }),
  )
  .handler(async ({ data }): Promise<AuthResult> => {
    const doctor = await findDoctorByEmail(data.email);
    if (!doctor) return { ok: false, error: "E-mail não encontrado. Crie sua conta." };
    if (doctor.provider === "google" && !doctor.passHash)
      return { ok: false, error: "Esta conta usa login com Google." };
    if (!verifyPassword(doctor, data.password))
      return { ok: false, error: "Senha incorreta. Tente novamente." };
    const token = await createSession(doctor.id);
    return { ok: true, token, doctor: { nome: doctor.nome, email: doctor.email } };
  });

// Google OAuth simulado para o demo: sem app OAuth configurado, o botão
// autentica uma conta Google de demonstração — mas passa pelo mesmo fluxo
// real de conta + sessão do backend.
export const googleLogin = createServerFn({ method: "POST" })
  .inputValidator(z.object({}).optional())
  .handler(async (): Promise<AuthResult> => {
    await new Promise((r) => setTimeout(r, 700)); // latência do redirect OAuth
    const email = "helena.costa@lifeline.med.br";
    let doctor = await findDoctorByEmail(email);
    if (!doctor) {
      doctor = await createDoctor({ nome: "Dra. Helena Costa", email, provider: "google" });
    }
    const token = await createSession(doctor.id);
    return { ok: true, token, doctor: { nome: doctor.nome, email: doctor.email } };
  });

export const getMe = createServerFn({ method: "POST" })
  .inputValidator(z.object({ token: z.string().min(1) }))
  .handler(async ({ data }) => {
    const doctor = await findDoctorByToken(data.token);
    return doctor ? { ok: true as const, doctor: { nome: doctor.nome, email: doctor.email } } : { ok: false as const };
  });

export const logout = createServerFn({ method: "POST" })
  .inputValidator(z.object({ token: z.string().min(1) }))
  .handler(async ({ data }) => {
    await revokeSession(data.token);
    return { ok: true as const };
  });
