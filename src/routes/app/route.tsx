// Layout da plataforma do médico (/app/*): guarda de sessão + casca com
// sidebar. Os dados clínicos são reais — cada página busca via server fns
// autenticadas; aqui só vive a identidade e a navegação.

import { useEffect, useState } from "react";
import { Outlet, createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  Activity,
  BookOpen,
  KanbanSquare,
  Loader2,
  LogOut,
  MessageSquarePlus,
  Users,
} from "lucide-react";
import { toast } from "sonner";

import { getMe, logout as logoutFn } from "@/lib/api/auth.functions";
import { clearSession, getSession, type DoctorSession } from "@/lib/session";
import { ClinicProvider, DoctorAvatar, type Clinic } from "@/lib/clinic-context";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { KnowledgeDrawer } from "@/components/clinic/knowledge-drawer";

export const Route = createFileRoute("/app")({
  head: () => ({
    meta: [
      { title: "LifeLine · Consultório" },
      { name: "description", content: "Plataforma do médico LifeLine: painel do dia, pacientes e prontuário." },
    ],
  }),
  component: AppLayout,
});

function AppLayout() {
  const navigate = useNavigate();
  const [clinic, setClinic] = useState<Clinic | null>(null);

  // Guarda: sem sessão local → login; com sessão → valida token no servidor
  // e sincroniza o perfil (nome/avatar podem ter mudado no Google).
  useEffect(() => {
    const s: DoctorSession | null = getSession();
    if (!s) {
      navigate({ to: "/login" });
      return;
    }
    setClinic({ token: s.token, nome: s.nome, email: s.email, avatarUrl: null });
    getMe({ data: { token: s.token } })
      .then((r) => {
        if (!r.ok) {
          clearSession();
          toast.error("Sessão expirada. Entre novamente.");
          navigate({ to: "/login" });
          return;
        }
        setClinic({ token: s.token, ...r.doctor });
      })
      .catch(() => {
        /* offline — segue com a sessão local */
      });
  }, [navigate]);

  if (!clinic) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/30">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
          Abrindo seu consultório…
        </div>
      </div>
    );
  }

  return (
    <ClinicProvider value={clinic}>
      <Shell clinic={clinic} />
    </ClinicProvider>
  );
}

const NAV = [
  { to: "/app" as const, label: "Painel do dia", icon: KanbanSquare, exact: true },
  { to: "/app/pacientes" as const, label: "Pacientes", icon: Users, exact: false },
  { to: "/app/triagem" as const, label: "Nova triagem", icon: MessageSquarePlus, exact: false },
];

function Shell({ clinic }: { clinic: Clinic }) {
  const navigate = useNavigate();

  const sair = async () => {
    const s = getSession();
    clearSession();
    if (s) logoutFn({ data: { token: s.token } }).catch(() => {});
    toast.success("Você saiu. Até logo!");
    navigate({ to: "/login" });
  };

  const linkCls = (active: boolean) =>
    `flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition ${
      active
        ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-md shadow-primary/30"
        : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground"
    }`;

  return (
    <div className="flex min-h-screen bg-muted/30">
      {/* Sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground md:flex">
        <div className="flex h-16 items-center gap-2 border-b border-sidebar-border px-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl brand-gradient shadow-lg shadow-primary/40">
            <Activity className="h-5 w-5 text-primary-foreground" strokeWidth={2.5} />
          </div>
          <div>
            <div className="text-sm font-semibold">LifeLine</div>
            <div className="text-[11px] text-sidebar-foreground/60">Consultório</div>
          </div>
        </div>

        <nav className="flex-1 space-y-1 p-3">
          <div className="px-3 py-2 text-[11px] font-medium uppercase tracking-wider text-sidebar-foreground/50">
            Clínica
          </div>
          {NAV.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              activeOptions={{ exact: n.exact }}
              className={linkCls(false)}
              activeProps={{ className: linkCls(true) }}
            >
              <n.icon className="h-4 w-4 shrink-0" />
              <span className="flex-1 text-left leading-tight">{n.label}</span>
            </Link>
          ))}
        </nav>

        <div className="border-t border-sidebar-border p-3">
          <div className="flex items-center gap-2.5 rounded-lg px-3 py-2">
            <DoctorAvatar clinic={clinic} className="h-9 w-9 text-xs" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{clinic.nome}</div>
              <div className="truncate text-[11px] text-sidebar-foreground/60">{clinic.email}</div>
            </div>
            <ThemeToggle />
          </div>
          <button
            onClick={sair}
            className="mt-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-sidebar-foreground/80 transition hover:bg-sidebar-accent hover:text-sidebar-foreground"
          >
            <LogOut className="h-4 w-4" />
            Sair
          </button>
        </div>
      </aside>

      {/* Top bar mobile */}
      <div className="md:hidden">
        <div className="fixed inset-x-0 top-0 z-30 flex items-center gap-2 border-b border-border bg-background/95 px-3 py-2 backdrop-blur">
          <div className="flex h-7 w-7 items-center justify-center rounded-md brand-gradient">
            <Activity className="h-3.5 w-3.5 text-primary-foreground" strokeWidth={2.5} />
          </div>
          <span className="text-sm font-semibold">LifeLine</span>
          <div className="ml-auto flex items-center gap-1">
            {NAV.map((n) => (
              <Link
                key={n.to}
                to={n.to}
                aria-label={n.label}
                activeOptions={{ exact: n.exact }}
                className="rounded-md px-2 py-1 text-muted-foreground"
                activeProps={{ className: "rounded-md bg-primary px-2 py-1 text-primary-foreground" }}
              >
                <n.icon className="h-4 w-4" />
              </Link>
            ))}
            <button onClick={sair} aria-label="Sair" className="rounded-md px-2 py-1 text-muted-foreground">
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="h-12" />
      </div>

      <main className="flex-1 overflow-x-hidden">
        <Outlet />
      </main>
    </div>
  );
}
