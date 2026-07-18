import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Activity, ArrowLeft, HeartPulse, Stethoscope } from "lucide-react";

import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/entrar")({
  head: () => ({
    meta: [
      { title: "LifeLine · Entrar" },
      { name: "description", content: "Escolha como quer entrar no LifeLine: médico ou paciente." },
    ],
  }),
  component: EntrarPage,
});

function EntrarPage() {
  const navigate = useNavigate();
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Brand panel */}
      <div className="relative hidden overflow-hidden bg-sidebar text-sidebar-foreground lg:flex lg:flex-col lg:justify-between lg:p-10">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -top-24 right-0 h-[380px] w-[380px] rounded-full bg-primary/25 blur-3xl" />
          <div className="absolute bottom-0 left-0 h-[300px] w-[300px] rounded-full bg-emerald-400/15 blur-3xl" />
        </div>
        <Link to="/" className="relative flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl brand-gradient shadow-lg shadow-primary/40">
            <Activity className="h-5 w-5 text-primary-foreground" strokeWidth={2.5} />
          </div>
          <span className="text-lg font-semibold tracking-tight">LifeLine</span>
        </Link>
        <div className="relative max-w-md">
          <h1 className="text-3xl font-semibold leading-tight tracking-tight">
            Uma ponte entre quem cuida e quem é cuidado.
          </h1>
          <p className="mt-4 text-sm text-sidebar-foreground/75">
            Médicos ganham tempo. Pacientes ganham histórico. Todo mundo ganha cuidado de verdade.
          </p>
        </div>
        <div className="relative text-[11px] text-sidebar-foreground/50">
          LGPD + CFM · Assinatura ICP-Brasil · Memed integrada
        </div>
      </div>

      {/* Choice card */}
      <div className="flex items-center justify-center bg-muted/30 p-6">
        <div className="w-full max-w-sm">
          <Link to="/" className="mb-6 flex items-center gap-2 lg:hidden">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg brand-gradient">
              <Activity className="h-4 w-4 text-primary-foreground" strokeWidth={2.5} />
            </div>
            <span className="font-semibold">LifeLine</span>
          </Link>

          <div className="rounded-3xl border border-border bg-card p-6 shadow-xl shadow-primary/5">
            <h2 className="text-xl font-semibold tracking-tight">Como você quer entrar?</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Escolha o perfil que combina com você agora.
            </p>

            <div className="mt-6 space-y-3">
              <Button
                onClick={() => navigate({ to: "/login" })}
                className="press h-auto w-full justify-start gap-3 rounded-2xl brand-gradient px-4 py-4 text-left text-primary-foreground shadow-md shadow-primary/30 hover:opacity-95"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/15">
                  <Stethoscope className="h-5 w-5" />
                </span>
                <span className="flex-1">
                  <span className="block text-sm font-semibold">Sou médico</span>
                  <span className="block text-[11px] font-normal opacity-90">
                    Consultório, agenda e prontuário
                  </span>
                </span>
              </Button>

              <Button
                variant="outline"
                onClick={() => navigate({ to: "/paciente/login" })}
                className="press h-auto w-full justify-start gap-3 rounded-2xl border-border px-4 py-4 text-left hover:bg-muted"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <HeartPulse className="h-5 w-5" />
                </span>
                <span className="flex-1">
                  <span className="block text-sm font-semibold">Sou paciente</span>
                  <span className="block text-[11px] font-normal text-muted-foreground">
                    Seu histórico de saúde, sempre com você
                  </span>
                </span>
              </Button>
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
            <Link to="/" className="inline-flex items-center gap-1 transition hover:text-foreground">
              <ArrowLeft className="h-3 w-3" />
              Voltar ao site
            </Link>
            <Link to="/demo" className="transition hover:text-foreground">
              Ver a demo sem cadastro →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
