import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  Activity,
  KanbanSquare,
  LineChart as LineChartIcon,
  Loader2,
  LogOut,
  MessageSquare,
  RotateCcw,
  Smartphone,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { DemoProvider, useDemo } from "@/lib/demo-store";
import { WhatsAppSimulator } from "@/components/demo/whatsapp-simulator";
import { KanbanBoard } from "@/components/demo/kanban-board";
import { PatientTimelineSOAP } from "@/components/demo/patient-timeline";
import { PatientAppMockup } from "@/components/demo/patient-app";
import { getMe, logout as logoutFn } from "@/lib/api/auth.functions";
import { clearSession, getSession, type DoctorSession } from "@/lib/session";

const TAB_IDS = ["whatsapp", "kanban", "timeline", "patient"] as const;
type TabId = (typeof TAB_IDS)[number];

export const Route = createFileRoute("/app")({
  validateSearch: (search: Record<string, unknown>): { tab?: TabId } => {
    const t = search.tab;
    return typeof t === "string" && (TAB_IDS as readonly string[]).includes(t)
      ? { tab: t as TabId }
      : {};
  },
  head: () => ({
    meta: [
      { title: "LifeLine · Consultório" },
      { name: "description", content: "Área do médico LifeLine: triagem, painel do dia, prontuário e app do paciente." },
    ],
  }),
  component: AppPage,
});

function AppPage() {
  const navigate = useNavigate();
  const [session, setSessionState] = useState<DoctorSession | null>(null);
  const [checking, setChecking] = useState(true);

  // Guard: sem sessão → login. Com sessão → valida o token no servidor.
  useEffect(() => {
    const s = getSession();
    if (!s) {
      navigate({ to: "/login" });
      return;
    }
    setSessionState(s);
    setChecking(false);
    getMe({ data: { token: s.token } })
      .then((r) => {
        if (!r.ok) {
          clearSession();
          toast.error("Sessão expirada. Entre novamente.");
          navigate({ to: "/login" });
        }
      })
      .catch(() => {
        /* offline — mantém a sessão local */
      });
  }, [navigate]);

  if (checking || !session) {
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
    <DemoProvider>
      <Workspace session={session} />
    </DemoProvider>
  );
}

function Workspace({ session }: { session: DoctorSession }) {
  const { tab: initialTab } = Route.useSearch();
  const navigate = useNavigate();
  const [tab, setTab] = useState<TabId>(initialTab ?? "kanban");
  const { resetChat } = useDemo();

  const initials = session.nome
    .replace(/^(dra?\.?\s+)/i, "")
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");

  const nav = [
    { id: "whatsapp" as const, label: "Triagem WhatsApp", icon: MessageSquare },
    { id: "kanban" as const, label: "Painel do dia", icon: KanbanSquare },
    { id: "timeline" as const, label: "Prontuário", icon: LineChartIcon },
    { id: "patient" as const, label: "App do Paciente", icon: Smartphone },
  ];

  const sair = async () => {
    const s = getSession();
    clearSession();
    if (s) logoutFn({ data: { token: s.token } }).catch(() => {});
    toast.success("Você saiu. Até logo!");
    navigate({ to: "/login" });
  };

  return (
    <div className="flex min-h-screen bg-muted/30">
      {/* Sidebar */}
      <aside className="hidden w-72 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground md:flex">
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
            Hoje
          </div>
          {nav.map((n) => {
            const active = tab === n.id;
            return (
              <button
                key={n.id}
                onClick={() => setTab(n.id)}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition ${
                  active
                    ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-md shadow-primary/30"
                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                }`}
              >
                <n.icon className="h-4 w-4 shrink-0" />
                <span className="flex-1 text-left leading-tight">{n.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="border-t border-sidebar-border p-3">
          {/* Doctor identity */}
          <div className="flex items-center gap-2.5 rounded-lg px-3 py-2">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full brand-gradient text-xs font-bold text-primary-foreground">
              {initials || "DR"}
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">{session.nome}</div>
              <div className="truncate text-[11px] text-sidebar-foreground/60">{session.email}</div>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={resetChat}
            className="mt-1 w-full justify-start text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground"
          >
            <RotateCcw className="mr-2 h-4 w-4" />
            Reiniciar dia
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={sair}
            className="mt-1 w-full justify-start text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground"
          >
            <LogOut className="mr-2 h-4 w-4" />
            Sair
          </Button>
        </div>
      </aside>

      {/* Mobile top nav */}
      <div className="md:hidden">
        <div className="fixed inset-x-0 top-0 z-30 flex items-center gap-2 border-b border-border bg-background/95 px-3 py-2 backdrop-blur">
          <div className="flex h-7 w-7 items-center justify-center rounded-md brand-gradient">
            <Activity className="h-3.5 w-3.5 text-primary-foreground" strokeWidth={2.5} />
          </div>
          <span className="text-sm font-semibold">LifeLine</span>
          <span className="truncate text-xs text-muted-foreground">· {session.nome}</span>
          <div className="ml-auto flex items-center gap-1 overflow-x-auto">
            {nav.map((n) => (
              <button
                key={n.id}
                onClick={() => setTab(n.id)}
                aria-label={n.label}
                className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs ${
                  tab === n.id ? "bg-primary text-primary-foreground" : "text-muted-foreground"
                }`}
              >
                <n.icon className="h-3.5 w-3.5" />
              </button>
            ))}
            <button
              onClick={sair}
              aria-label="Sair"
              className="rounded-md px-2 py-1 text-muted-foreground"
            >
              <LogOut className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        <div className="h-12" />
      </div>

      {/* Main */}
      <main className="flex-1 overflow-x-hidden">
        {tab === "whatsapp" && <WhatsAppSimulator onComplete={() => setTab("kanban")} />}
        {tab === "kanban" && <KanbanBoard onOpenPatient={() => setTab("timeline")} />}
        {tab === "timeline" && <PatientTimelineSOAP onSeal={() => setTab("patient")} />}
        {tab === "patient" && <PatientAppMockup onRestart={() => setTab("whatsapp")} />}
      </main>
    </div>
  );
}
