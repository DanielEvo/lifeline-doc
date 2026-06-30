import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Activity,
  ArrowLeft,
  KanbanSquare,
  LineChart as LineChartIcon,
  MessageSquare,
  RotateCcw,
  Smartphone,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { DemoProvider } from "@/lib/demo-store";
import { WhatsAppSimulator } from "@/components/demo/whatsapp-simulator";
import { KanbanBoard } from "@/components/demo/kanban-board";
import { PatientTimelineSOAP } from "@/components/demo/patient-timeline";
import { PatientAppMockup } from "@/components/demo/patient-app";
import { useDemo } from "@/lib/demo-store";

const TAB_IDS = ["whatsapp", "kanban", "timeline", "patient"] as const;
type TabId = (typeof TAB_IDS)[number];
const QUEST_IDS = ["q2023", "q2024", "q2025", "q2026"] as const;
type QuestId = (typeof QUEST_IDS)[number];
export const Route = createFileRoute("/demo")({
  validateSearch: (
    search: Record<string, unknown>,
  ): { tab?: TabId; quest?: QuestId } => {
    const out: { tab?: TabId; quest?: QuestId } = {};
    const t = search.tab;
    if (typeof t === "string" && (TAB_IDS as readonly string[]).includes(t)) out.tab = t as TabId;
    const q = search.quest;
    if (typeof q === "string" && (QUEST_IDS as readonly string[]).includes(q)) out.quest = q as QuestId;
    return out;
  },
  head: () => ({
    meta: [
      { title: "LifeLine · Demo Interativa" },
      { name: "description", content: "Demo interativa do ecossistema LifeLine: WhatsApp, Kanban, Prontuário SOAP e App do Paciente." },
    ],
  }),
  component: DemoPage,
});

function DemoPage() {
  return (
    <DemoProvider>
      <DemoShell />
    </DemoProvider>
  );
}

function DemoShell() {
  const { tab: initialTab, quest: initialQuest } = Route.useSearch();
  const [tab, setTab] = useState<TabId>(initialTab ?? "whatsapp");
  const { resetChat } = useDemo();

  const nav = [
    { id: "whatsapp" as const, label: "Simulador de WhatsApp", icon: MessageSquare, hint: "Step A" },
    { id: "kanban" as const, label: "Painel Kanban", icon: KanbanSquare, hint: "Step B" },
    { id: "timeline" as const, label: "Linha do Tempo do Paciente", icon: LineChartIcon, hint: "Step C" },
    { id: "patient" as const, label: "App do Paciente", icon: Smartphone, hint: "Step D" },
  ];

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
            <div className="text-[11px] text-sidebar-foreground/60">Demo · Dra. Helena</div>
          </div>
        </div>
        <nav className="flex-1 space-y-1 p-3">
          <div className="px-3 py-2 text-[11px] font-medium uppercase tracking-wider text-sidebar-foreground/50">
            Fluxo clínico
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
                <span className={`text-[10px] font-medium ${active ? "text-sidebar-primary-foreground/80" : "text-sidebar-foreground/50"}`}>
                  {n.hint}
                </span>
              </button>
            );
          })}
        </nav>
        <div className="border-t border-sidebar-border p-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={resetChat}
            className="w-full justify-start text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground"
          >
            <RotateCcw className="mr-2 h-4 w-4" />
            Reiniciar demo
          </Button>
          <Link to="/">
            <Button variant="ghost" size="sm" className="mt-1 w-full justify-start text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Voltar ao site
            </Button>
          </Link>
        </div>
      </aside>

      {/* Mobile top nav */}
      <div className="md:hidden">
        <div className="fixed inset-x-0 top-0 z-30 flex items-center gap-2 border-b border-border bg-background/95 px-3 py-2 backdrop-blur">
          <Link to="/" className="rounded-md p-1.5 hover:bg-muted">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="flex h-7 w-7 items-center justify-center rounded-md brand-gradient">
            <Activity className="h-3.5 w-3.5 text-primary-foreground" strokeWidth={2.5} />
          </div>
          <span className="text-sm font-semibold">LifeLine</span>
          <div className="ml-auto flex gap-1 overflow-x-auto">
            {nav.map((n) => (
              <button
                key={n.id}
                onClick={() => setTab(n.id)}
                className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs ${
                  tab === n.id ? "bg-primary text-primary-foreground" : "text-muted-foreground"
                }`}
              >
                <n.icon className="h-3.5 w-3.5" />
              </button>
            ))}
          </div>
        </div>
        <div className="h-12" />
      </div>

      {/* Main */}
      <main className="flex-1 overflow-x-hidden">
        {tab === "whatsapp" && <WhatsAppSimulator onComplete={() => setTab("kanban")} />}
        {tab === "kanban" && <KanbanBoard onOpenPatient={() => setTab("timeline")} />}
        {tab === "timeline" && (
          <PatientTimelineSOAP
            onSeal={() => setTab("patient")}
            initialQuest={initialQuest}
          />
        )}
        {tab === "patient" && <PatientAppMockup onRestart={() => setTab("whatsapp")} />}
      </main>
    </div>
  );
}
