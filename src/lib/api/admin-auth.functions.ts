// createServerFn's finas sobre admin-auth.server.ts — mesmo padrão de
// retorno { ok, error } de auth.functions.ts. Nunca revela se foi o login ou
// a senha que errou (ver admin-auth.server::loginAdmin).

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
  changeAdminCredentials,
  loginAdmin,
  logoutAdmin,
  requireAdminSession,
} from "../admin-auth.server";

export const adminLogin = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      login: z.string().min(1).max(120),
      senha: z.string().min(1).max(120),
    }),
  )
  .handler(async ({ data }) => {
    const r = await loginAdmin(data.login, data.senha);
    if (!r.ok) {
      return {
        ok: false as const,
        error:
          r.error === "locked"
            ? "Muitas tentativas. Aguarde 15 minutos."
            : "Login ou senha incorretos.",
      };
    }
    return { ok: true as const, token: r.token };
  });

export const adminGetMe = createServerFn({ method: "POST" })
  .inputValidator(z.object({ token: z.string().min(1) }))
  .handler(async ({ data }) => ({ ok: await requireAdminSession(data.token) }));

export const adminLogout = createServerFn({ method: "POST" })
  .inputValidator(z.object({ token: z.string().min(1) }))
  .handler(async ({ data }) => {
    await logoutAdmin(data.token);
    return { ok: true as const };
  });

export const adminChangeCredentials = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      token: z.string().min(1),
      novoLogin: z.string().min(3).max(60),
      novaSenha: z.string().min(6).max(120),
      senhaAtual: z.string().min(1).max(120),
    }),
  )
  .handler(async ({ data }) => {
    const r = await changeAdminCredentials(
      data.token,
      data.novoLogin,
      data.novaSenha,
      data.senhaAtual,
    );
    return r.ok ? { ok: true as const } : { ok: false as const, error: r.error };
  });
