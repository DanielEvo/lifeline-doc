import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  BookOpen,
  ChevronDown,
  ClipboardList,
  FlaskConical,
  KeyRound,
  Mail,
  MessageCircle,
  Mic,
  MicOff,
  Pencil,
  Pill,
  Save,
  Search,
  Sparkles,
  Stethoscope,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Line, LineChart, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip as UITooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useDemo } from "@/lib/demo-store";

// ---------- Clinical timeline entries ----------
type EventStatus = "Saudável" | "Atenção" | "Alerta" | "Em atendimento";
type EventType = "consulta" | "exames" | "retorno" | "alerta";

type ClinicalEvent = {
  id: string;
  year: string;
  date: string;
  title: string;
  description: string;
  type: EventType;
  status: EventStatus;
  summary: string;
};

const EVENTS: ClinicalEvent[] = [
  {
    id: "q2023",
    year: "2023",
    date: "Mar 2023",
    title: "Check-up de rotina",
    description: "Hemograma + bioquímica + vitaminas",
    type: "exames",
    status: "Saudável",
    summary: "Painel metabólico completo dentro da faixa de referência. Hb 13.4 · Ferritina 78 · Vit D 38.",
  },
  {
    id: "q2024",
    year: "2024",
    date: "Set 2024",
    title: "Investigação de fadiga",
    description: "Hemograma + perfil de ferro",
    type: "exames",
    status: "Atenção",
    summary: "Primeira queda significativa de hemoglobina. Ferritina caindo · Vit D limítrofe.",
  },
  {
    id: "q2025",
    year: "2025",
    date: "Mai 2025",
    title: "Retorno · acompanhamento metabólico",
    description: "Bioquímica + vitaminas",
    type: "retorno",
    status: "Atenção",
    summary: "Suplementação iniciada. B12 e Zinco abaixo do ideal. EAS com leucócitos +.",
  },
  {
    id: "q2026",
    year: "2026",
    date: "Jun 2026",
    title: "Consulta atual",
    description: "Briefing WhatsApp + 2 exames recentes",
    type: "consulta",
    status: "Em atendimento",
    summary: "Hb 11.2 · Ferritina 18 · Vit D 19. Queixa de fadiga + dispneia aos esforços.",
  },
];

// Quais biomarcadores foram efetivamente coletados em cada evento (drill-down)
const EVENT_BIOMARKERS: Record<string, string[]> = {
  q2023: ["Hemoglobina", "Ferritina", "Vitamina D", "Vitamina B12", "Zinco", "Creatinina"],
  q2024: ["Hemoglobina", "Ferritina"],
  q2025: ["Creatinina", "Vitamina D", "Vitamina B12", "Zinco"],
  q2026: ["Hemoglobina", "Ferritina"],
};

const TYPE_ICON: Record<EventType, React.ComponentType<{ className?: string }>> = {
  consulta: Stethoscope,
  exames: FlaskConical,
  retorno: ClipboardList,
  alerta: AlertTriangle,
};

const STATUS_STYLE: Record<EventStatus, { pill: string; node: string }> = {
  Saudável: {
    pill: "bg-emerald-100 text-emerald-700 ring-emerald-200",
    node: "from-emerald-400 to-emerald-600 ring-emerald-100",
  },
  Atenção: {
    pill: "bg-amber-100 text-amber-700 ring-amber-200",
    node: "from-amber-400 to-orange-500 ring-amber-100",
  },
  Alerta: {
    pill: "bg-rose-100 text-rose-700 ring-rose-200",
    node: "from-rose-400 to-rose-600 ring-rose-100",
  },
  "Em atendimento": {
    pill: "bg-sky-100 text-sky-700 ring-sky-200",
    node: "from-sky-400 to-cyan-500 ring-sky-100",
  },
};

// ---------- Biomarker historical series ----------
const BIOMARKER_DATES = ["Mar 23", "Set 24", "Mai 25", "Jun 26"] as const;
const BIOMARKERS = [
  { name: "Hemoglobina", min: 12, max: 16, unit: "g/dL", series: [13.4, 12.6, 11.9, 11.2] },
  { name: "Ferritina", min: 30, max: 200, unit: "ng/mL", series: [78, 42, 28, 18] },
  { name: "Vitamina D", min: 30, max: 100, unit: "ng/mL", series: [38, 29, 24, 19] },
  { name: "Vitamina B12", min: 300, max: 900, unit: "pg/mL", series: [520, 410, 290, 240] },
  { name: "Zinco", min: 70, max: 120, unit: "µg/dL", series: [95, 82, 68, 61] },
  { name: "Creatinina", min: 0.5, max: 1.1, unit: "mg/dL", series: [0.78, 0.82, 0.85, 0.9] },
] as const;

const MED_OPTIONS = [
  { name: "Sulfato Ferroso 40mg", desc: "1cp 2x/dia · 90 dias" },
  { name: "Vitamina B12 1000mcg", desc: "1cp/dia · 60 dias" },
  { name: "Ácido Fólico 5mg", desc: "1cp/dia · 60 dias" },
  { name: "Colecalciferol 50.000UI", desc: "1cp/semana · 8 semanas" },
];

const SIMILAR_CASES = [
  {
    id: "c1",
    age: 35,
    sex: "F",
    condition: "Anemia ferropriva · fadiga",
    treatment: "Sulfato ferroso 40mg + Vit C · 90 dias",
    outcome: "Resolvido",
  },
  {
    id: "c2",
    age: 42,
    sex: "F",
    condition: "Anemia + Vit D baixa",
    treatment: "Ferro EV + Colecalciferol 50.000UI",
    outcome: "Resolvido",
  },
  {
    id: "c3",
    age: 39,
    sex: "F",
    condition: "Fadiga crônica · ferritina 22",
    treatment: "Sulfato ferroso + B12 + reavaliação 60d",
    outcome: "Em acompanh.",
  },
];

const KB_ITEMS = [
  {
    title: "Kit anemia ferropriva — protocolo Dra. Helena",
    body: "Sulfato Ferroso 40mg 1cp 2x/dia em jejum + Vit C 500mg. Reavaliar ferritina e hemograma em 60 dias. Se intolerância gástrica, fracionar dose. Considerar Ferro EV se Hb < 9 ou má adesão.",
  },
  {
    title: "Orientações para paciente com fadiga crônica",
    body: "Higiene do sono · atividade física leve progressiva · suplementação conforme déficit · investigar hipotireoidismo e síndrome depressiva. Diário de sintomas por 14 dias.",
  },
  {
    title: "Quando indicar ferro EV vs oral",
    body: "Ferro EV: intolerância oral comprovada, má absorção (DII, bariátrica), perdas continuadas, necessidade de correção rápida (Hb < 8 sintomático). Caso contrário, via oral é primeira escolha.",
  },
];

type KbItem = (typeof KB_ITEMS)[number];

// ---------- Suggestion blocks (gravação → transcrição → validação) ----------
type SuggestionStatus = "pending" | "accepted" | "discarded";
type SuggestionBlock = {
  id: string;
  label: string;
  text: string;
  status: SuggestionStatus;
};

// Conteúdo de demonstração retornado pela "transcrição" ao parar a gravação
const TRANSCRIPT_BLOCKS: Omit<SuggestionBlock, "status">[] = [
  {
    id: "qp",
    label: "Queixa",
    text: "Paciente refere fadiga progressiva e dispneia aos esforços, há 3 meses.",
  },
  {
    id: "hda",
    label: "Histórico",
    text: "Piora nas últimas semanas. Hemograma de maio mostra Hb em queda contínua — 11.2 g/dL.",
  },
  {
    id: "plano",
    label: "Conduta",
    text: "Manter sulfato ferroso 40mg 2x/dia em jejum. Solicitar ferro sérico e ferritina de controle. Retorno em 60 dias.",
  },
];

const EVOLUCAO_DEFAULT =
  "Paciente relata fadiga progressiva e dispneia aos esforços (subir escadas). Sem dor torácica ou edema. Nega febre. Exames anexados via WhatsApp: Hb 11.2 g/dL · Ferritina 18 ng/mL · Vit D 19 ng/mL.";

const PLANO_DEFAULT =
  "Sulfato Ferroso 40mg 2x/dia em jejum + Vit C 500mg.\nFerro sérico e ferritina de controle solicitados.\nReavaliar em 60 dias.";

export function PatientTimelineSOAP({ onSeal, initialQuest }: { onSeal: () => void; initialQuest?: string }) {
  const { sealed, setSealed } = useDemo();

  // ---- Campo único de evolução ----
  const [evolucaoText, setEvolucaoText] = useState(EVOLUCAO_DEFAULT);
  const [evolucaoEditing, setEvolucaoEditing] = useState(false);
  const evolucaoRef = useRef<HTMLTextAreaElement | null>(null);

  // ---- Gravação + confirmação ----
  const [recording, setRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [confirmPopover, setConfirmPopover] = useState<"start" | "stop" | null>(null);
  const [suggestionBlocks, setSuggestionBlocks] = useState<SuggestionBlock[]>([]);

  // ---- Plano terapêutico + Memed ----
  const [planoText, setPlanoText] = useState(PLANO_DEFAULT);
  const [planoEditing, setPlanoEditing] = useState(false);
  const [medSearch, setMedSearch] = useState("");
  const [selectedMeds, setSelectedMeds] = useState<{ name: string; dosage: string; duration: string }[]>([]);
  const [memedOpen, setMemedOpen] = useState(false);

  // ---- Timeline + biomarcadores ----
  const [activeEvent, setActiveEvent] = useState<string>(initialQuest ?? "q2026");
  const [showAllBiomarkers, setShowAllBiomarkers] = useState(false);
  const [historyExpanded, setHistoryExpanded] = useState(true);
  const [arrivalPulse, setArrivalPulse] = useState<boolean>(Boolean(initialQuest));
  const timelineRef = useRef<HTMLDivElement | null>(null);

  // ---- Casos similares + Knowledge Base ----
  const [kbSearch, setKbSearch] = useState("");
  const [kbOpen, setKbOpen] = useState<KbItem | null>(null);
  const [activeChips, setActiveChips] = useState<string[]>(["Fadiga", "Ferritina <20"]);

  // ---- Acesso via token ----
  const [accessModal, setAccessModal] = useState(false);
  const [tokenA, setTokenA] = useState("");
  const [tokenB, setTokenB] = useState("");
  const [historyUnlocked, setHistoryUnlocked] = useState(false);

  useEffect(() => {
    if (!recording) return;
    const id = setInterval(() => setRecordSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [recording]);

  // Auto-resize do campo de evolução
  useEffect(() => {
    const el = evolucaoRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
  }, [evolucaoText, evolucaoEditing]);

  useEffect(() => {
    if (!arrivalPulse) return;
    timelineRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    const t = setTimeout(() => setArrivalPulse(false), 2400);
    return () => clearTimeout(t);
  }, [arrivalPulse]);

  const fmtTime = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  // ---- Gravação: pedir confirmação antes de iniciar/parar ----
  const requestStart = () => setConfirmPopover("start");
  const requestStop = () => setConfirmPopover("stop");
  const cancelConfirm = () => setConfirmPopover(null);

  const confirmStart = () => {
    setRecording(true);
    setRecordSeconds(0);
    setSuggestionBlocks([]);
    setConfirmPopover(null);
  };

  const confirmStop = () => {
    setRecording(false);
    setConfirmPopover(null);
    setSuggestionBlocks(TRANSCRIPT_BLOCKS.map((b) => ({ ...b, status: "pending" as SuggestionStatus })));
    toast.message("Transcrição gerada", { description: "Revise os blocos antes de incorporar à evolução." });
  };

  // ---- Blocos de sugestão: aceitar / editar / descartar ----
  const acceptBlock = (id: string) => {
    const block = suggestionBlocks.find((b) => b.id === id);
    if (!block) return;
    setEvolucaoText((prev) => (prev ? prev.trim() + "\n\n" : "") + block.text);
    setSuggestionBlocks((prev) => prev.map((b) => (b.id === id ? { ...b, status: "accepted" } : b)));
  };

  const discardBlock = (id: string) => {
    setSuggestionBlocks((prev) => prev.map((b) => (b.id === id ? { ...b, status: "discarded" } : b)));
  };

  const editBlock = (id: string, text: string) => {
    setSuggestionBlocks((prev) => prev.map((b) => (b.id === id ? { ...b, text } : b)));
  };

  const saveEvolucao = () => {
    setEvolucaoEditing(false);
    toast.success("Evolução salva ✓");
  };

  const savePlano = () => {
    setPlanoEditing(false);
    toast.success("Plano terapêutico salvo ✓");
  };

  const validateToken = () => {
    const a = tokenA.trim().toUpperCase();
    const b = tokenB.trim().toUpperCase();
    if (a.length >= 3 && b.length >= 3) {
      setHistoryUnlocked(true);
      setAccessModal(false);
      toast.success("Acesso autorizado ✓", { description: "Histórico completo de Mariana carregado." });
    } else {
      toast.error("Token expirado. Peça ao paciente gerar um novo.");
    }
  };

  const filtered = MED_OPTIONS.filter((m) => m.name.toLowerCase().includes(medSearch.toLowerCase()));
  const currentStatus: "Saudável" | "Em acompanhamento" | "Atenção" = "Em acompanhamento";

  const finalize = () => {
    setSealed(true);
    toast.success("Receita e orientações enviadas para Mariana via WhatsApp ✓", {
      description: "Link para o app LifeLine incluído na mensagem.",
      icon: <Mail className="h-4 w-4" />,
    });
    setTimeout(onSeal, 1400);
  };

  // Biomarcadores visíveis: só os do evento ativo, a menos que "Mostrar tudo" esteja ativo
  const visibleBiomarkers = useMemo(() => {
    if (showAllBiomarkers) return BIOMARKERS;
    const allowed = EVENT_BIOMARKERS[activeEvent] ?? BIOMARKERS.map((b) => b.name);
    return BIOMARKERS.filter((b) => allowed.includes(b.name));
  }, [activeEvent, showAllBiomarkers]);

  return (
    <div className="mx-auto max-w-[1500px] p-3 lg:p-5">
      <div className="max-w-3xl">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-primary">
          Step C · Mariana Silva · 38 anos
        </div>
      </div>

      {/* Patient header */}
      <div className="mt-6 overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-slate-900 via-slate-800 to-cyan-900 p-6 text-white shadow-xl">
        <div className="flex flex-wrap items-center gap-5">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-rose-400 to-pink-500 text-xl font-bold shadow-lg ring-4 ring-white/10">
            MS
          </div>
          <div className="flex-1 min-w-[220px]">
            <div className="text-lg font-semibold">Mariana Silva</div>
            <div className="text-xs text-white/70">38 anos · F · Histórico desde Mar 2023</div>
          </div>
          <div className="flex flex-wrap gap-2">
            {(
              [
                { key: "Saudável", active: "bg-emerald-500/30 text-emerald-100 ring-emerald-300/60" },
                { key: "Em acompanhamento", active: "bg-sky-500/30 text-sky-100 ring-sky-300/60" },
                { key: "Atenção", active: "bg-orange-500/30 text-orange-100 ring-orange-300/60" },
              ] as const
            ).map((p) => {
              const isActive = p.key === currentStatus;
              return (
                <span
                  key={p.key}
                  className={`rounded-full px-3 py-1.5 text-[11px] font-medium ring-1 ${
                    isActive ? p.active : "bg-white/5 text-white/50 ring-white/10"
                  }`}
                >
                  {p.key}
                </span>
              );
            })}
            <button
              onClick={() => setAccessModal(true)}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-medium ring-1 transition ${
                historyUnlocked
                  ? "bg-emerald-500/20 text-emerald-100 ring-emerald-300/40"
                  : "bg-white/10 text-white/90 ring-white/20 hover:bg-white/20"
              }`}
            >
              <KeyRound className="h-3 w-3" />
              {historyUnlocked ? "Histórico autorizado" : "Solicitar acesso ao histórico"}
            </button>
          </div>
        </div>
      </div>

      {/* ---------- Horizontal clinical timeline ---------- */}
      <div ref={timelineRef} className="mt-4">
        {historyExpanded ? (
          <div className="rounded-2xl border border-border bg-card px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Histórico clínico · {EVENTS.length} consultas
              </div>
              <button
                onClick={() => setHistoryExpanded(false)}
                className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <ChevronDown className="h-3.5 w-3.5 rotate-180" />
                Ocultar histórico
              </button>
            </div>
            <div className="relative mt-5 pt-2 pb-2">
              <div className="absolute left-3 right-3 top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-gradient-to-r from-emerald-300 via-cyan-400 to-rose-400" />
              <div className="absolute left-3 right-3 top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-[radial-gradient(circle,white_1.5px,transparent_2px)] bg-[length:8px_3px] opacity-40" />

              <div className="relative flex items-stretch justify-between gap-2">
                {EVENTS.map((e) => {
                  const isActive = activeEvent === e.id;
                  const st = STATUS_STYLE[e.status];
                  const Icon = TYPE_ICON[e.type];
                  return (
                    <button
                      key={e.id}
                      onClick={() => {
                        setActiveEvent(e.id);
                        setShowAllBiomarkers(false);
                      }}
                      className="group relative flex min-w-0 flex-1 flex-col items-center"
                      title={e.summary}
                    >
                      <div className="mb-1 text-[10px] font-medium text-muted-foreground">{e.date}</div>
                      <div
                        className={`relative z-10 flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br text-white shadow-md ring-4 ring-white transition-transform ${
                          st.node
                        } ${
                          isActive
                            ? `scale-110 ${arrivalPulse ? "animate-pulse ring-cyan-300" : ""}`
                            : "scale-90 opacity-80 group-hover:scale-100 group-hover:opacity-100"
                        }`}
                      >
                        <Icon className="h-4 w-4" />
                        {isActive && <span className="absolute -inset-1 -z-10 rounded-full bg-cyan-400/30 blur-sm" />}
                      </div>
                      <div
                        className={`mt-1.5 max-w-[110px] truncate text-[11px] font-medium leading-tight ${
                          isActive ? "text-foreground" : "text-foreground/60"
                        }`}
                      >
                        {e.title}
                      </div>
                      <span className={`mt-1 rounded-full px-1.5 py-0.5 text-[9px] font-medium ring-1 ${st.pill}`}>
                        {e.status}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setHistoryExpanded(true)}
            className="flex w-full items-center justify-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-[11px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <ChevronDown className="h-3.5 w-3.5" />
            Ver histórico ({EVENTS.length} consultas)
          </button>
        )}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        {/* ---------- MIDDLE: Briefing + Evolução (campo único) + Plano/Memed ---------- */}
        <div className="space-y-4">
          {/* CAMADA 1 — Briefing WhatsApp (read-only) */}
          <TooltipProvider delayDuration={150}>
            <UITooltip>
              <TooltipTrigger asChild>
                <div className="cursor-help rounded-2xl border border-border bg-slate-50 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500 text-white">
                      <MessageCircle className="h-3.5 w-3.5" />
                    </span>
                    <span className="text-sm font-semibold">Briefing pré-consulta</span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700 ring-1 ring-emerald-200">
                      📋 Via WhatsApp
                    </span>
                  </div>
                  <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-foreground/80">
                    Paciente relata fadiga progressiva e dispneia aos esforços (subir escadas). Sem dor torácica ou
                    edema. Nega febre. Hemograma de mar/2025 anexado via WhatsApp — Hb 11.2 g/dL, Ferritina 18 ng/mL.
                  </p>
                </div>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs">
                Gerado automaticamente a partir das mensagens do paciente no WhatsApp
              </TooltipContent>
            </UITooltip>
          </TooltipProvider>

          <div className="border-t border-border" />

          {/* CAMADA 2 — Evolução (campo único) + gravação com confirmação */}
          <div>
            <div className="flex items-center justify-between gap-2">
              <Label className="text-xs font-medium text-muted-foreground">Evolução</Label>
              {evolucaoEditing ? (
                <Button
                  type="button"
                  size="sm"
                  onClick={saveEvolucao}
                  className="h-7 bg-teal-600 text-xs text-white hover:bg-teal-700"
                >
                  <Save className="mr-1 h-3.5 w-3.5" />
                  Salvar evolução
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setEvolucaoEditing(true)}
                  className="h-7 text-xs"
                >
                  <Pencil className="mr-1 h-3.5 w-3.5" />
                  Editar evolução
                </Button>
              )}
            </div>
            <Textarea
              ref={evolucaoRef}
              value={evolucaoText}
              readOnly={!evolucaoEditing}
              onChange={(e) => setEvolucaoText(e.target.value)}
              placeholder="Escreva livremente ou grave a consulta abaixo..."
              style={{ overflowY: "hidden" }}
              className={`mt-1.5 min-h-[140px] resize-none bg-white text-sm focus-visible:ring-cyan-300 ${
                evolucaoEditing ? "border-cyan-400 ring-2 ring-cyan-100" : ""
              }`}
            />

            {/* Botão de gravação com confirmação */}
            <div className="relative mt-2 inline-block">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={recording ? requestStop : requestStart}
                className={recording ? "border-rose-300 bg-rose-50 text-rose-700 hover:bg-rose-100" : ""}
              >
                {recording ? (
                  <>
                    <MicOff className="mr-1.5 h-4 w-4" />
                    Parar gravação
                    <span className="ml-2 tabular-nums">{fmtTime(recordSeconds)}</span>
                  </>
                ) : (
                  <>
                    <Mic className="mr-1.5 h-4 w-4" />
                    Gravar consulta
                  </>
                )}
              </Button>

              {confirmPopover && (
                <div className="absolute left-0 top-full z-20 mt-2 w-64 rounded-xl border border-border bg-white p-3 shadow-lg">
                  <p className="text-xs font-medium text-foreground">
                    {confirmPopover === "start"
                      ? "Iniciar gravação da consulta?"
                      : "Parar gravação e gerar transcrição?"}
                  </p>
                  <div className="mt-2.5 flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      onClick={confirmPopover === "start" ? confirmStart : confirmStop}
                      className="h-7 bg-teal-600 text-[11px] text-white hover:bg-teal-700"
                    >
                      {confirmPopover === "start" ? "Iniciar" : "Parar"}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={cancelConfirm}
                      className="h-7 text-[11px]"
                    >
                      {confirmPopover === "start" ? "Cancelar" : "Continuar gravando"}
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {/* Blocos de sugestão da transcrição */}
            {suggestionBlocks.length > 0 && (
              <div className="mt-3 space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-sky-800">
                  <Sparkles className="h-3.5 w-3.5" />
                  Sugestões da transcrição — revise cada bloco
                </div>
                {suggestionBlocks.map((block) => (
                  <SuggestionCard
                    key={block.id}
                    block={block}
                    onAccept={() => acceptBlock(block.id)}
                    onDiscard={() => discardBlock(block.id)}
                    onEdit={(text) => editBlock(block.id, text)}
                  />
                ))}
              </div>
            )}
          </div>

          <div className="border-t border-border" />

          {/* CAMADA 3 — Plano Terapêutico + Prescrição Memed */}
          <div>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <ClipboardList className="h-3.5 w-3.5 text-muted-foreground" />
                <Label className="text-xs font-medium text-muted-foreground">Plano Terapêutico</Label>
              </div>
              {planoEditing ? (
                <Button
                  type="button"
                  size="sm"
                  onClick={savePlano}
                  className="h-7 bg-teal-600 text-xs text-white hover:bg-teal-700"
                >
                  <Save className="mr-1 h-3.5 w-3.5" />
                  Salvar plano
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setPlanoEditing(true)}
                  className="h-7 text-xs"
                >
                  <Pencil className="mr-1 h-3.5 w-3.5" />
                  Editar plano
                </Button>
              )}
            </div>

            {planoEditing ? (
              <AutoTextarea value={planoText} onChange={setPlanoText} placeholder="Descreva o plano terapêutico..." minHeight={80} />
            ) : (
              <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-foreground/80">{planoText}</p>
            )}

            {/* Prescrição Memed */}
            <div className="mt-4">
              <div className="mb-2 flex items-center gap-1.5">
                <Pill className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-[11px] font-semibold text-foreground/70">Prescrição Memed</span>
              </div>

              {selectedMeds.map((entry, idx) => (
                <div key={entry.name} className="mb-3 rounded-lg border border-border bg-white p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] font-semibold">{entry.name}</span>
                    <button
                      type="button"
                      onClick={() => setSelectedMeds((prev) => prev.filter((_, i) => i !== idx))}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      ×
                    </button>
                  </div>
                  <div className="mt-2 space-y-2">
                    <div>
                      <label className="text-[11px] font-medium text-muted-foreground">Dosagem e frequência</label>
                      <input
                        value={entry.dosage}
                        onChange={(e) =>
                          setSelectedMeds((prev) => prev.map((x, i) => (i === idx ? { ...x, dosage: e.target.value } : x)))
                        }
                        placeholder="Ex: 1 comprimido, 2 vezes ao dia"
                        className="mt-0.5 w-full rounded-md border border-border px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-teal-400"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-medium text-muted-foreground">Duração do tratamento</label>
                      <input
                        value={entry.duration}
                        onChange={(e) =>
                          setSelectedMeds((prev) => prev.map((x, i) => (i === idx ? { ...x, duration: e.target.value } : x)))
                        }
                        placeholder="Ex: 90 dias"
                        className="mt-0.5 w-full rounded-md border border-border px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-teal-400"
                      />
                    </div>
                  </div>
                </div>
              ))}

              {!memedOpen ? (
                <button
                  type="button"
                  onClick={() => setMemedOpen(true)}
                  className="block w-full rounded-lg border border-dashed border-border-strong px-3 py-2.5 text-center text-xs text-muted-foreground"
                >
                  + Adicionar medicamento à prescrição
                </button>
              ) : (
                <div className="rounded-lg border border-border bg-white p-2">
                  <input
                    autoFocus
                    value={medSearch}
                    onChange={(e) => setMedSearch(e.target.value)}
                    placeholder="Buscar medicamento..."
                    className="w-full rounded-md border border-border px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-teal-400"
                  />
                  <div className="mt-1.5 space-y-1">
                    {filtered.map((m) => (
                      <button
                        key={m.name}
                        type="button"
                        onClick={() => {
                          if (!selectedMeds.find((x) => x.name === m.name)) {
                            const parts = m.desc.split(" · ");
                            setSelectedMeds((prev) => [...prev, { name: m.name, dosage: parts[0] ?? "", duration: parts[1] ?? "" }]);
                          }
                          setMedSearch("");
                          setMemedOpen(false);
                        }}
                        className="flex w-full flex-col rounded-md px-2 py-1.5 text-left hover:bg-slate-50"
                      >
                        <span className="text-[12px] font-medium">{m.name}</span>
                        <span className="text-[10px] text-muted-foreground">{m.desc}</span>
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setMemedOpen(false);
                      setMedSearch("");
                    }}
                    className="mt-1.5 w-full text-center text-[10px] text-muted-foreground hover:text-foreground"
                  >
                    Fechar
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ---------- RIGHT: Biomarkers (drill-down) + collapsibles + sticky CTA ---------- */}
        <div className="space-y-5 lg:sticky lg:top-6 lg:self-start">
          <div className="rounded-3xl border border-border bg-card p-5">
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  PAINEL DE BIOMARCADORES
                </div>
                <div className="text-sm font-semibold">
                  {showAllBiomarkers ? "Todos os biomarcadores" : `Coletados em ${EVENTS.find((e) => e.id === activeEvent)?.date ?? ""}`}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAllBiomarkers((v) => !v)}
                className="shrink-0 rounded-full border border-border px-2.5 py-1 text-[10px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                {showAllBiomarkers ? "Ver só este evento" : "Mostrar tudo"}
              </button>
            </div>

            <div className="mt-4">
              {visibleBiomarkers.map((b, idx) => {
                const eventIds = ["q2023", "q2024", "q2025", "q2026"];
                const selIdx = Math.max(0, eventIds.indexOf(activeEvent));
                const current = b.series[selIdx];
                const prev = selIdx > 0 ? b.series[selIdx - 1] : b.series[selIdx];
                const below = current < b.min;
                const above = current > b.max;
                const inRef = !below && !above;
                const diff = current - prev;
                const diffAbs = Math.abs(diff);
                const diffStr = diffAbs % 1 === 0 ? String(Math.round(diffAbs)) : diffAbs.toFixed(1).replace(/\.0$/, "");
                const statusColor = inRef ? "#639922" : "#E24B4A";
                const valueColor = inRef ? "var(--text-success)" : "var(--text-danger)";
                const badgeBg = inRef ? "var(--bg-success)" : "var(--bg-danger)";
                const badgeText = inRef ? "var(--text-success)" : "var(--text-danger)";
                const badgeLabel = inRef || selIdx === 0 ? "✓ ref" : `${diff < 0 ? "↓" : "↑"} ${diffStr} vs anterior`;

                const data = b.series.map((v, i) => ({ date: BIOMARKER_DATES[i], value: v }));
                const yMin = Math.min(b.min, ...b.series) * 0.9;
                const yMax = Math.max(b.max, ...b.series) * 1.05;
                const selectedDate = BIOMARKER_DATES[selIdx];

                return (
                  <div
                    key={b.name}
                    style={{
                      marginBottom: idx === visibleBiomarkers.length - 1 ? 0 : 12,
                      paddingBottom: idx === visibleBiomarkers.length - 1 ? 0 : 12,
                      borderBottom: idx === visibleBiomarkers.length - 1 ? "none" : "0.5px solid var(--border)",
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-baseline gap-2">
                        <span style={{ fontSize: 13, fontWeight: 500 }}>{b.name}</span>
                        <span style={{ fontSize: 14, fontWeight: 600, color: valueColor }}>{current}</span>
                        <span style={{ fontSize: 10, color: "var(--text-muted)" }}>
                          {b.unit} · Ref: {b.min}–{b.max}
                        </span>
                      </div>
                      <span
                        className="font-medium"
                        style={{ fontSize: 11, borderRadius: 20, padding: "2px 8px", background: badgeBg, color: badgeText, whiteSpace: "nowrap" }}
                      >
                        {badgeLabel}
                      </span>
                    </div>
                    <div style={{ height: 120, width: "100%", marginTop: 6 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={data} margin={{ top: 6, right: 8, bottom: 4, left: 8 }}>
                          <YAxis hide domain={[yMin, yMax]} />
                          <XAxis dataKey="date" tick={{ fontSize: 10, fill: "var(--text-muted)" }} axisLine={false} tickLine={false} interval={0} />
                          <ReferenceArea y1={b.min} y2={b.max} fill="#22c55e" fillOpacity={0.08} />
                          <ReferenceLine y={b.max} stroke="#22c55e" strokeDasharray="3 3" strokeOpacity={0.4} />
                          <ReferenceLine y={b.min} stroke="#22c55e" strokeDasharray="3 3" strokeOpacity={0.4} />
                          <ReferenceLine x={selectedDate} stroke="var(--border-strong)" strokeDasharray="4 4" />
                          <Tooltip
                            cursor={{ stroke: "var(--border)", strokeWidth: 1 }}
                            contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid var(--border)", background: "var(--card)", padding: "4px 8px" }}
                            formatter={(v: number) => [`${v} ${b.unit}`, ""]}
                            labelStyle={{ fontSize: 10, color: "var(--text-muted)" }}
                            separator=""
                          />
                          <Line
                            type="monotone"
                            dataKey="value"
                            stroke={statusColor}
                            strokeWidth={2}
                            dot={(props: { cx?: number; cy?: number; index?: number; key?: string | number }) => {
                              const { cx, cy, index, key } = props;
                              if (cx == null || cy == null) return <g key={key ?? `empty-${index}`} />;
                              if (index === selIdx) {
                                return <circle key={key ?? `sel-${index}`} cx={cx} cy={cy} r={7} fill={statusColor} stroke="#fff" strokeWidth={2} />;
                              }
                              if (index === data.length - 1) {
                                return <circle key={key ?? `dot-${index}`} cx={cx} cy={cy} r={4} fill={statusColor} />;
                              }
                              return <g key={key ?? `empty-${index}`} />;
                            }}
                            isAnimationActive={false}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <Collapsible icon={Users} title="Casos com perfil similar" badge="3 pacientes">
            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "10px" }}>
              {(["Fadiga", "Ferritina <20", "35–45 anos", "+ filtro"] as const).map((label) => {
                const active = activeChips.includes(label);
                return (
                  <button
                    key={label}
                    onClick={() => setActiveChips((prev) => (prev.includes(label) ? prev.filter((c) => c !== label) : [...prev, label]))}
                    style={{
                      fontSize: "11px",
                      padding: "3px 10px",
                      borderRadius: "20px",
                      border: `0.5px solid ${active ? "var(--border-accent)" : "var(--border-strong)"}`,
                      background: active ? "var(--bg-accent)" : "var(--surface-1)",
                      color: active ? "var(--text-accent)" : "var(--text-secondary)",
                      fontWeight: active ? 500 : 400,
                      cursor: "pointer",
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            <div className="space-y-2">
              {SIMILAR_CASES.map((c) => (
                <div key={c.id} className="rounded-lg border border-border bg-white p-2.5 text-[11px]">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">
                      {c.age} anos · {c.sex}
                    </span>
                    <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">{c.outcome}</span>
                  </div>
                  <div className="mt-1 text-muted-foreground">{c.condition}</div>
                  <div className="mt-0.5 text-foreground/80">{c.treatment}</div>
                </div>
              ))}
              <div className="text-[10px] italic text-muted-foreground">Dados anonimizados · mesma médica</div>
            </div>
          </Collapsible>

          <Collapsible icon={BookOpen} title="Minha base de conhecimento">
            <div className="space-y-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
                <Input value={kbSearch} onChange={(e) => setKbSearch(e.target.value)} placeholder="Buscar protocolos..." className="h-8 pl-7 text-xs" />
              </div>
              {KB_ITEMS.map((k) => (
                <button
                  key={k.title}
                  type="button"
                  onClick={() => setKbOpen(k)}
                  className="block w-full rounded-lg border border-border bg-white px-2.5 py-2 text-left text-[11px] hover:border-cyan-300 hover:bg-cyan-50"
                >
                  <div className="font-medium">{k.title}</div>
                </button>
              ))}
            </div>
          </Collapsible>

          <Button onClick={finalize} disabled={sealed} className="w-full bg-teal-600 text-white shadow-md hover:bg-teal-700" size="lg">
            <Mail className="mr-2 h-4 w-4" />
            {sealed ? "Consulta finalizada" : "Finalizar consulta e enviar ao paciente"}
          </Button>
        </div>
      </div>

      {kbOpen && <KbModal item={kbOpen} onClose={() => setKbOpen(null)} />}

      {accessModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4" onClick={() => setAccessModal(false)}>
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/15 text-primary">
                <KeyRound className="h-4 w-4" />
              </div>
              <div>
                <div className="text-sm font-semibold">Solicitar acesso ao histórico</div>
                <div className="text-[11px] text-muted-foreground">Validação via token LifeLine</div>
              </div>
              <button onClick={() => setAccessModal(false)} className="ml-auto rounded p-1 text-muted-foreground hover:bg-muted">
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
              Peça ao paciente que abra o app LifeLine e gere um token em
              <span className="font-semibold text-foreground"> Perfil → Gerar token para médico</span>. Digite o código de 3 partes abaixo:
            </p>
            <div className="mt-4 flex items-center gap-2">
              <div className="flex h-10 items-center justify-center rounded-lg bg-muted px-3 font-mono text-sm font-bold text-muted-foreground">LFL</div>
              <span className="text-muted-foreground">·</span>
              <input
                value={tokenA}
                onChange={(e) => setTokenA(e.target.value.toUpperCase().slice(0, 4))}
                placeholder="7H2A"
                className="h-10 w-20 rounded-lg border border-border bg-background text-center font-mono text-sm font-bold tracking-wider focus:border-primary focus:outline-none"
              />
              <span className="text-muted-foreground">·</span>
              <input
                value={tokenB}
                onChange={(e) => setTokenB(e.target.value.toUpperCase().slice(0, 4))}
                placeholder="9KB1"
                className="h-10 w-20 rounded-lg border border-border bg-background text-center font-mono text-sm font-bold tracking-wider focus:border-primary focus:outline-none"
              />
              <button onClick={validateToken} className="ml-auto h-10 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground hover:bg-primary/90">
                Validar
              </button>
            </div>
            <p className="mt-3 text-[10px] text-muted-foreground">Tokens expiram em 10 minutos por segurança. Se inválido, peça ao paciente gerar um novo.</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- Suggestion card (gravação → transcrição → validação por bloco) ----------
function SuggestionCard({
  block,
  onAccept,
  onDiscard,
  onEdit,
}: {
  block: SuggestionBlock;
  onAccept: () => void;
  onDiscard: () => void;
  onEdit: (text: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const isResolved = block.status !== "pending";

  return (
    <div
      className={`rounded-lg border p-3 transition-opacity ${
        isResolved ? "border-border bg-slate-50 opacity-50" : "border-sky-200 bg-sky-50/70"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold text-sky-800">{block.label}</span>
        {block.status === "accepted" && <span className="text-[10px] text-emerald-700">Incorporado à evolução</span>}
        {block.status === "discarded" && <span className="text-[10px] text-muted-foreground">Descartado</span>}
      </div>

      {editing ? (
        <textarea
          autoFocus
          value={block.text}
          onChange={(e) => onEdit(e.target.value)}
          onBlur={() => setEditing(false)}
          className="mt-1.5 w-full resize-none rounded-md border border-sky-300 bg-white p-2 text-[12px] leading-relaxed focus:outline-none"
          rows={3}
        />
      ) : (
        <p className="mt-1 whitespace-pre-line text-[12px] leading-relaxed text-slate-700">{block.text}</p>
      )}

      {!isResolved && (
        <div className="mt-2 flex gap-2">
          <Button size="sm" onClick={onAccept} className="h-7 bg-sky-600 text-[11px] text-white hover:bg-sky-700">
            <Sparkles className="mr-1 h-3 w-3" />
            Aceitar
          </Button>
          <Button size="sm" variant="outline" onClick={() => setEditing(true)} className="h-7 text-[11px]">
            <Pencil className="mr-1 h-3 w-3" />
            Editar
          </Button>
          <Button size="sm" variant="ghost" onClick={onDiscard} className="h-7 text-[11px]">
            Descartar
          </Button>
        </div>
      )}
    </div>
  );
}

function AutoTextarea({
  value,
  onChange,
  disabled,
  placeholder,
  minHeight = 100,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  placeholder?: string;
  minHeight?: number;
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.max(minHeight, el.scrollHeight) + "px";
  }, [value, minHeight]);
  return (
    <textarea
      ref={ref}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      placeholder={placeholder}
      style={{ minHeight }}
      className="block w-full resize-none overflow-hidden rounded-lg border border-input bg-background p-3 text-[13px] leading-[1.7] outline-none transition-colors focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100 disabled:opacity-60"
    />
  );
}

function Collapsible({
  icon: Icon,
  title,
  badge,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  badge?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-2xl border border-border bg-card">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2 px-4 py-3 text-left">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <span className="flex-1 text-sm font-medium">{title}</span>
        {badge && <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">{badge}</span>}
        <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <div className="border-t border-border px-4 py-3">{children}</div>}
    </div>
  );
}

function KbModal({ item, onClose }: { item: KbItem; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[11px] font-medium uppercase tracking-wider text-cyan-700">Base de conhecimento</div>
            <div className="mt-0.5 text-base font-semibold">{item.title}</div>
          </div>
          <button onClick={onClose} className="rounded-md p-1 text-muted-foreground hover:bg-muted" aria-label="Fechar">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-4 text-sm leading-relaxed text-slate-700">{item.body}</div>
        <div className="mt-5 flex justify-end">
          <Button size="sm" onClick={onClose}>
            Fechar
          </Button>
        </div>
      </div>
    </div>
  );
}
