import { createStart, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";

// Versão tolerante do attachSupabaseAuth gerado
// (src/integrations/supabase/auth-attacher.ts). Mesma função — anexar o
// bearer token do Supabase Auth nas chamadas de server fn — mas sem
// derrubar o app quando o Supabase não está configurado.
//
// Por que isto existe: o middleware gerado toca o client Supabase, que
// LANÇA se VITE_SUPABASE_URL/VITE_SUPABASE_PUBLISHABLE_KEY faltarem. Como
// ele é um functionMiddleware GLOBAL, esse throw acontecia antes de
// qualquer RPC sair do navegador — ou seja, um ambiente sem Supabase
// configurado quebrava TODA a aplicação (login, pacientes, prontuário,
// admin), não só as telas que dependem de Supabase. Médico e paciente
// autenticam por sessão própria (auth.server.ts / patient-auth.server.ts),
// então Supabase Auth aqui é opcional: sem ele, seguimos sem o header.
const attachSupabaseAuthSafe = createMiddleware({ type: "function" }).client(async ({ next }) => {
  try {
    const { supabase } = await import("@/integrations/supabase/client");
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (token) return next({ headers: { Authorization: `Bearer ${token}` } });
  } catch {
    // Supabase não configurado neste ambiente — segue sem bearer token.
  }
  return next({ headers: {} });
});

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

export const startInstance = createStart(() => ({
  functionMiddleware: [attachSupabaseAuthSafe],
  requestMiddleware: [errorMiddleware],
}));
