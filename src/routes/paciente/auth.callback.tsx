// Pouso do OAuth do Google (lado paciente): troca code+state por uma sessão
// real no servidor e segue para o histórico. Espelha src/routes/auth.callback.tsx
// (médico) — mesma lógica, sessão e storage key diferentes.

import { useEffect, useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { patientGoogleExchange } from "@/lib/api/patient-auth.functions";
import { setPatientSession } from "@/lib/patient-session";

export const Route = createFileRoute("/paciente/auth/callback")({
  validateSearch: (search: Record<string, unknown>) => ({
    code: typeof search.code === "string" ? search.code : "",
    state: typeof search.state === "string" ? search.state : "",
  }),
  head: () => ({ meta: [{ title: "LifeLine · Entrando…" }] }),
  component: PatientAuthCallback,
});

function PatientAuthCallback() {
  const { code, state } = Route.useSearch();
  const navigate = useNavigate();
  const [erro, setErro] = useState<string | null>(null);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return; // StrictMode/replays: o code só vale uma vez
    ran.current = true;
    if (!code || !state) {
      navigate({ to: "/paciente/login" });
      return;
    }
    const redirectUri = `${window.location.origin}/paciente/auth/callback`;
    patientGoogleExchange({ data: { code, state, redirectUri } })
      .then((r) => {
        if (!r.ok) {
          setErro(r.error);
          toast.error(r.error);
          setTimeout(() => navigate({ to: "/paciente/login" }), 1800);
          return;
        }
        setPatientSession({ token: r.token, nome: r.patient.nome, email: r.patient.email });
        toast.success(`Olá, ${r.patient.nome.split(" ")[0]}!`, {
          description: "Abrindo seu histórico…",
        });
        navigate({ to: "/paciente/app" });
      })
      .catch(() => {
        setErro("Falha na conexão com o servidor.");
        setTimeout(() => navigate({ to: "/paciente/login" }), 1800);
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
