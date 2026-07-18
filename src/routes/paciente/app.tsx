import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Activity, HeartPulse, Loader2, LogOut, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  getPatientTimeline,
  logoutPatient,
} from "@/lib/api/patient-auth.functions";
import {
  clearPatientSession,
  getPatientSession,
  type PatientSession,
} from "@/lib/patient-session";

export const Route = createFileRoute("/paciente/app")({
  head: () => ({
    meta: [
      { title: "LifeLine · Meu histórico" },
      { name: "description", content: "Seu histórico de saúde no LifeLine." },
    ],
  }),
  component: PatientAppPage,
});

type TimelineState =
  | { status: "loading" }
  | { status: "unlinked" }
  | { status: "error"; msg: string };

function PatientAppPage() {
  const navigate = useNavigate();
  const [session, setSession] = useState<PatientSession | null>(null);
  const [state, setState] = useState<TimelineState>({ status: "loading" });

  useEffect(() => {
    const s = getPatientSession();
    if (!s) {
      navigate({ to: "/paciente/login" });
      return;
    }
    setSession(s);
    getPatientTimeline({ data: { token: s.token } })
      .then((r) => {
        if (!r.ok) {
          clearPatientSession();
          navigate({ to: "/paciente/login" });
          return;
        }
        // linked:false por ora (vínculo com prontuário ainda não decidido)
        setState({ status: "unlinked" });
      })
      .catch(() => setState({ status: "error", msg: "Não consegui carregar agora." }));
  }, [navigate]);

  const handleLogout = async () => {
    const s = getPatientSession();
    if (s) {
      try {
        await logoutPatient({ data: { token: s.token } });
      } catch {
        // segue com limpeza local
      }
    }
    clearPatientSession();
    toast.success("Você saiu da sua conta.");
    navigate({ to: "/paciente/login" });
  };

  const firstName = session?.nome.split(" ")[0] ?? "";

  return (
    <div className="min-h-screen bg-muted/30">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4">
          <Link to="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg brand-gradient shadow-md shadow-primary/30">
              <Activity className="h-4 w-4 text-primary-foreground" strokeWidth={2.5} />
            </div>
            <span className="text-sm font-semibold tracking-tight">LifeLine</span>
          </Link>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleLogout}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            <LogOut className="mr-1.5 h-3.5 w-3.5" />
            Sair
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8">
        {/* Greeting */}
        <div className="mb-6">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Meu histórico
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            {firstName ? `Olá, ${firstName}` : "Olá"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Aqui vai aparecer sua linha do tempo de saúde assim que um médico liberar acesso.
          </p>
        </div>

        {/* State */}
        {state.status === "loading" && (
          <div className="flex items-center justify-center rounded-3xl border border-border bg-card p-16 text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin text-primary" />
            Carregando…
          </div>
        )}

        {state.status === "error" && (
          <div className="rounded-3xl border border-border bg-card p-10 text-center text-sm text-muted-foreground">
            {state.msg}
          </div>
        )}

        {state.status === "unlinked" && (
          <div className="rounded-3xl border border-border bg-card p-10 text-center shadow-sm">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <HeartPulse className="h-8 w-8" />
            </div>
            <h2 className="mt-5 text-lg font-semibold tracking-tight">
              Aguardando seu médico liberar o acesso ao seu histórico.
            </h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
              Quando um profissional vincular seu prontuário à sua conta, exames, consultas e
              medicamentos aparecem aqui — organizados numa única linha do tempo.
            </p>
            <div className="mx-auto mt-6 inline-flex items-center gap-2 rounded-full border border-border bg-muted/50 px-3 py-1.5 text-[11px] text-muted-foreground">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
              Seus dados, sob seu controle
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
