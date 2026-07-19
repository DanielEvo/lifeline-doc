// Sessão do admin — bypass do login normal, protegida por senha mestra.
// Cookie httpOnly criptografado (useSession do TanStack Start server).
// Separada por completo das sessões de médico/paciente.

import { useSession } from "@tanstack/react-start/server";
import { createHash, timingSafeEqual } from "node:crypto";

type AdminSessionData = { unlocked?: boolean; since?: string };

function sessionConfig() {
  const password = process.env.ADMIN_SESSION_SECRET;
  if (!password) throw new Error("ADMIN_SESSION_SECRET não configurado");
  return {
    password,
    name: "lifeline-admin",
    maxAge: 60 * 60 * 24 * 7, // 7 dias
    cookie: {
      httpOnly: true,
      secure: true,
      sameSite: "lax" as const,
      path: "/",
    },
  };
}

export async function getAdminSession() {
  return useSession<AdminSessionData>(sessionConfig());
}

export async function isAdminUnlocked(): Promise<boolean> {
  const s = await getAdminSession();
  return s.data.unlocked === true;
}

/** Compara senha via SHA-256 + timing-safe. */
export function checkAdminPassword(input: string): boolean {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) return false;
  const a = createHash("sha256").update(input, "utf8").digest();
  const b = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(a, b);
}
