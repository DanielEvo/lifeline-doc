// Pouso do OAuth do Google: troca code+state por uma sessão real no servidor
// e segue para o consultório. Erros voltam ao /login com aviso.

import { useEffect, useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { googleExchange } from "@/lib/api/auth.functions";
import { setSession } from "@/lib/session";

export const Route = createFileRoute("/auth/callback")({
  validateSearch: (search: Record<string, unknown>) => ({
    code: typeof search.code === "string" ? search.code : "",
    state: typeof search.state === "string" ? search.state : "",
  }),
  head: () => ({ meta: [{ title: "LifeLine · Entrando…" }] }),
  component: AuthCallback,
});

function AuthCallback() {
  const { code, state } = Route.useSearch();
  const navigate = useNavigate();
  const [erro, setErro] = useState<string | null>(null);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return; // StrictMode/replays: o code só vale uma vez
    ran.current = true;
    if (!code || !state) {
      navigate({ to: "/login" });
      return;
    }
    const redirectUri = `${window.location.origin}/auth/callback`;
    googleExchange({ data: { code, state, redirectUri } })
      .then((r) => {
        if (!r.ok) {
          setErro(r.error);
          toast.error(r.error);
          setTimeout(() => navigate({ to: "/login" }), 1800);
          return;
        }
        setSession({ token: r.token, nome: r.doctor.nome, email: r.doctor.email });
        toast.success(`Bem-vinda, ${r.doctor.nome.split(" ")[0]}!`, {
          description: "Abrindo seu consultório…",
        });
        navigate({ to: "/app" });
      })
      .catch(() => {
        setErro("Falha na conexão com o servidor.");
        setTimeout(() => navigate({ to: "/login" }), 1800);
      });
  }, [code, state, navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        {erro ? (
          <span>{erro} Voltando ao login…</span>
        ) : (
          <>
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            Confirmando com o Google…
          </>
        )}
      </div>
    </div>
  );
}
