import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  BookOpen,
  ChevronDown,
  ClipboardList,
  Droplet,
  FileText,
  FlaskConical,
  Lightbulb,
  Lock,
  Mail,
  Mic,
  MicOff,
  Pencil,
  Pill,
  RefreshCw,
  Save,
  Search,
  Sparkles,
  Stethoscope,
  TestTube,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceArea,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useDemo } from "@/lib/demo-store";
import { PageHeader } from "./whatsapp-simulator";

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
    summary:
      "Painel metabólico completo dentro da faixa de referência. Hb 13.4 · Ferritina 78 · Vit D 38.",
  },
  {
    id: "q2024",
    year: "2024",
    date: "Set 2024",
    title: "Investigação de fadiga",
    description: "Hemograma + perfil de ferro",
    type: "exames",
    status: "Atenção",
    summary:
      "Primeira queda significativa de hemoglobina. Ferritina caindo · Vit D limítrofe.",
  },
  {
    id: "q2025",
    year: "2025",
    date: "Mai 2025",
    title: "Retorno · acompanhamento metabólico",
    description: "Bioquímica + vitaminas",
    type: "retorno",
    status: "Atenção",
    summary:
      "Suplementação iniciada. B12 e Zinco abaixo do ideal. EAS com leucócitos +.",
  },
  {
    id: "q2026",
    year: "2026",
    date: "Jun 2026",
    title: "Consulta atual",
    description: "Briefing WhatsApp + 2 exames recentes",
    type: "consulta",
    status: "Em atendimento",
    summary:
      "Hb 11.2 · Ferritina 18 · Vit D 19. Queixa de fadiga + dispneia aos esforços.",
  },
];

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

// ---------- Multi-parameter biomarker data ----------
type Series = {
  key: string;
  label: string;
  unit: string;
  min: number;
  max: number;
  domain: [number, number];
  data: { quest: string; date: string; value: number }[];
};

type Panel = {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  tint: string;
  series: Series[];
};

const PANELS: Panel[] = [
  {
    id: "hemo",
    label: "Hemograma & Ferro",
    icon: Droplet,
    tint: "from-rose-500 to-red-500",
    series: [
      {
        key: "hb",
        label: "Hemoglobina",
        unit: "g/dL",
        min: 12,
        max: 16,
        domain: [10, 16],
        data: [
          { quest: "q2023", date: "Mar 23", value: 13.4 },
          { quest: "q2024", date: "Set 24", value: 12.6 },
          { quest: "q2025", date: "Mai 25", value: 11.9 },
          { quest: "q2026", date: "Jun 26", value: 11.2 },
        ],
      },
      {
        key: "ferritin",
        label: "Ferritina",
        unit: "ng/mL",
        min: 30,
        max: 200,
        domain: [0, 200],
        data: [
          { quest: "q2023", date: "Mar 23", value: 78 },
          { quest: "q2024", date: "Set 24", value: 42 },
          { quest: "q2025", date: "Mai 25", value: 28 },
          { quest: "q2026", date: "Jun 26", value: 18 },
        ],
      },
    ],
  },
  {
    id: "vit",
    label: "Vitaminas & Minerais",
    icon: Sparkles,
    tint: "from-amber-500 to-orange-500",
    series: [
      {
        key: "vitd",
        label: "Vitamina D",
        unit: "ng/mL",
        min: 30,
        max: 60,
        domain: [0, 70],
        data: [
          { quest: "q2023", date: "Mar 23", value: 38 },
          { quest: "q2024", date: "Set 24", value: 29 },
          { quest: "q2025", date: "Mai 25", value: 24 },
          { quest: "q2026", date: "Jun 26", value: 19 },
        ],
      },
      {
        key: "b12",
        label: "Vitamina B12",
        unit: "pg/mL",
        min: 300,
        max: 900,
        domain: [100, 900],
        data: [
          { quest: "q2023", date: "Mar 23", value: 520 },
          { quest: "q2024", date: "Set 24", value: 410 },
          { quest: "q2025", date: "Mai 25", value: 290 },
          { quest: "q2026", date: "Jun 26", value: 240 },
        ],
      },
      {
        key: "zn",
        label: "Zinco Sérico",
        unit: "µg/dL",
        min: 70,
        max: 120,
        domain: [40, 130],
        data: [
          { quest: "q2023", date: "Mar 23", value: 95 },
          { quest: "q2024", date: "Set 24", value: 82 },
          { quest: "q2025", date: "Mai 25", value: 68 },
          { quest: "q2026", date: "Jun 26", value: 61 },
        ],
      },
    ],
  },
  {
    id: "bio",
    label: "Bioquímica & Urina",
    icon: TestTube,
    tint: "from-cyan-500 to-teal-500",
    series: [
      {
        key: "creat",
        label: "Creatinina",
        unit: "mg/dL",
        min: 0.5,
        max: 1.1,
        domain: [0.3, 1.3],
        data: [
          { quest: "q2023", date: "Mar 23", value: 0.78 },
          { quest: "q2024", date: "Set 24", value: 0.82 },
          { quest: "q2025", date: "Mai 25", value: 0.85 },
          { quest: "q2026", date: "Jun 26", value: 0.9 },
        ],
      },
      {
        key: "leuko",
        label: "EAS · Leucócitos",
        unit: "p/campo",
        min: 0,
        max: 5,
        domain: [0, 20],
        data: [
          { quest: "q2023", date: "Mar 23", value: 2 },
          { quest: "q2024", date: "Set 24", value: 3 },
          { quest: "q2025", date: "Mai 25", value: 8 },
          { quest: "q2026", date: "Jun 26", value: 14 },
        ],
      },
      {
        key: "nit",
        label: "EAS · Nitrito",
        unit: "(0=neg / 1=pos)",
        min: 0,
        max: 0,
        domain: [0, 1.2],
        data: [
          { quest: "q2023", date: "Mar 23", value: 0 },
          { quest: "q2024", date: "Set 24", value: 0 },
          { quest: "q2025", date: "Mai 25", value: 1 },
          { quest: "q2026", date: "Jun 26", value: 1 },
        ],
      },
    ],
  },
];

const MED_OPTIONS = [
  { name: "Sulfato Ferroso 40mg", desc: "1cp 2x/dia · 90 dias" },
  { name: "Vitamina B12 1000mcg", desc: "1cp/dia · 60 dias" },
  { name: "Ácido Fólico 5mg", desc: "1cp/dia · 60 dias" },
  { name: "Colecalciferol 50.000UI", desc: "1cp/semana · 8 semanas" },
];

const PREFILL_S =
  "Paciente relata fadiga progressiva e dispneia aos esforços (subir escadas). Sem dor torácica ou edema. Nega febre. Hemograma de mar/2025 anexado via WhatsApp — Hb 11.2 g/dL, Ferritina 18 ng/mL.";

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
    body:
      "Sulfato Ferroso 40mg 1cp 2x/dia em jejum + Vit C 500mg. Reavaliar ferritina e hemograma em 60 dias. Se intolerância gástrica, fracionar dose. Considerar Ferro EV se Hb < 9 ou má adesão.",
  },
  {
    title: "Orientações para paciente com fadiga crônica",
    body:
      "Higiene do sono · atividade física leve progressiva · suplementação conforme déficit · investigar hipotireoidismo e síndrome depressiva. Diário de sintomas por 14 dias.",
  },
  {
    title: "Quando indicar ferro EV vs oral",
    body:
      "Ferro EV: intolerância oral comprovada, má absorção (DII, bariátrica), perdas continuadas, necessidade de correção rápida (Hb < 8 sintomático). Caso contrário, via oral é primeira escolha.",
  },
];

type KbItem = (typeof KB_ITEMS)[number];

export function PatientTimelineSOAP({
  onSeal,
  initialQuest,
  initialPanel,
}: {
  onSeal: () => void;
  initialQuest?: string;
  initialPanel?: string;
}) {
  const { subjective, setSubjective, sealed, setSealed } = useDemo();
  const [objetivo, setObjetivo] = useState({ pa: "118/76", peso: "62", fc: "82" });
  const [objetivoNotes, setObjetivoNotes] = useState("");
  const [diag, setDiag] = useState("");
  const [plano, setPlano] = useState("");
  const [planTab, setPlanTab] = useState<"clinico" | "memed">("clinico");
  const [planSuggested, setPlanSuggested] = useState(false);
  const [medSearch, setMedSearch] = useState("");
  const [selectedMeds, setSelectedMeds] = useState<string[]>([]);
  const [activeEvent, setActiveEvent] = useState<string>(initialQuest ?? "q2026");
  const [activePanel, setActivePanel] = useState<string>(initialPanel ?? "hemo");
  const [expandedSeries, setExpandedSeries] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [kbSearch, setKbSearch] = useState("");
  const [kbOpen, setKbOpen] = useState<KbItem | null>(null);
  const [arrivalPulse, setArrivalPulse] = useState<boolean>(
    Boolean(initialQuest || initialPanel),
  );
  const timelineRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!subjective) setSubjective(PREFILL_S);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!arrivalPulse) return;
    timelineRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    const t = setTimeout(() => setArrivalPulse(false), 2400);
    return () => clearTimeout(t);
  }, [arrivalPulse]);

  const panel = useMemo(
    () => PANELS.find((p) => p.id === activePanel)!,
    [activePanel],
  );

  const expanded = useMemo(() => {
    if (!expandedSeries) return null;
    for (const p of PANELS) {
      const s = p.series.find((x) => x.key === expandedSeries);
      if (s) return s;
    }
    return null;
  }, [expandedSeries]);

  const filtered = MED_OPTIONS.filter((m) =>
    m.name.toLowerCase().includes(medSearch.toLowerCase()),
  );

  const currentStatus: "Saudável" | "Em acompanhamento" | "Atenção" = "Em acompanhamento";

  const toggleRecording = () => {
    setRecording((r) => {
      const next = !r;
      toast.success(next ? "Gravação iniciada" : "Gravação finalizada", {
        description: next
          ? "Áudio da consulta sendo capturado para transcrição."
          : "Transcrição será anexada ao prontuário.",
        icon: next ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />,
      });
      return next;
    });
  };

  const finalize = () => {
    setSealed(true);
    toast.success("Receita e orientações enviadas para Mariana via WhatsApp ✓", {
      description: "Link para o app LifeLine incluído na mensagem.",
      icon: <Mail className="h-4 w-4" />,
    });
    setTimeout(onSeal, 1400);
  };


  // Group events by year for the anchor display
  const grouped = useMemo(() => {
    const map = new Map<string, ClinicalEvent[]>();
    for (const e of EVENTS) {
      if (!map.has(e.year)) map.set(e.year, []);
      map.get(e.year)!.push(e);
    }
    return Array.from(map.entries());
  }, []);

  return (
    <div className="mx-auto max-w-[1500px] p-6 lg:p-10">
      <PageHeader
        eyebrow="Step C · Mariana Silva · 38 anos"
        title="Linha do Tempo do Paciente & Prontuário SOAP"
        desc="Histórico clínico longitudinal de Mariana — consultas, exames e biomarcadores — integrado ao prontuário SOAP em tempo real."
      />

      {/* Patient header */}
      <div className="mt-6 overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-slate-900 via-slate-800 to-cyan-900 p-6 text-white shadow-xl">
        <div className="flex flex-wrap items-center gap-5">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-rose-400 to-pink-500 text-xl font-bold shadow-lg ring-4 ring-white/10">
            MS
          </div>
          <div className="flex-1 min-w-[220px]">
            <div className="text-lg font-semibold">Mariana Silva</div>
            <div className="text-xs text-white/60">
              38 anos · F · Histórico desde Mar 2023
            </div>
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
                    isActive ? p.active : "bg-white/5 text-white/40 ring-white/10"
                  }`}
                >
                  {p.key}
                </span>
              );
            })}
          </div>

        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[380px_minmax(0,1fr)_360px]">
        {/* ---------- LEFT: Clinical timeline ---------- */}
        <div
          ref={timelineRef}
          className="rounded-3xl border border-border bg-card p-6"
        >
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Histórico clínico
              </div>
              <div className="text-base font-semibold">Linha do tempo · 2023 → 2026</div>
            </div>
            <div className="rounded-full bg-muted px-2.5 py-1 text-[10px] font-medium text-muted-foreground">
              {EVENTS.length} registros
            </div>
          </div>

          <div className="mt-6 space-y-6">
            {grouped.map(([year, items]) => (
              <div key={year} className="relative pl-12">
                <div className="absolute left-0 top-1 flex h-8 w-9 items-center justify-center rounded-md bg-slate-900 text-[11px] font-bold text-white shadow">
                  {year}
                </div>
                <div className="absolute left-[18px] top-10 bottom-0 w-px bg-border" />

                <div className="space-y-3">
                  {items.map((e) => {
                    const Icon = TYPE_ICON[e.type];
                    const isActive = activeEvent === e.id;
                    const st = STATUS_STYLE[e.status];
                    return (
                      <button
                        key={e.id}
                        onClick={() => setActiveEvent(e.id)}
                        className={`relative flex w-full items-stretch gap-3 rounded-2xl border p-3 text-left transition-all hover:-translate-y-0.5 hover:shadow-md ${
                          isActive
                            ? `border-cyan-400 bg-white shadow-sm ring-2 ring-cyan-100 ${
                                arrivalPulse ? "ring-4 ring-cyan-300 animate-pulse" : ""
                              }`
                            : "border-border bg-white/70 hover:border-cyan-200"
                        }`}
                      >
                        <div
                          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${st.node} text-white shadow ring-4`}
                        >
                          <Icon className="h-5 w-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="text-sm font-semibold leading-tight">
                                {e.title}
                              </div>
                              <div className="text-[11px] text-muted-foreground">
                                {e.date}
                              </div>
                            </div>
                            <span
                              className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ${st.pill}`}
                            >
                              {e.status}
                            </span>
                          </div>
                          <div className="mt-1 text-[11px] text-foreground/75">
                            {e.description}
                          </div>
                          {isActive && (
                            <div className="mt-2 rounded-lg bg-slate-50 p-2 text-[11px] text-slate-700 ring-1 ring-border">
                              {e.summary}
                            </div>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ---------- MIDDLE: SOAP vertical stack ---------- */}
        <div className="space-y-5">
          <div className="rounded-2xl border border-border bg-card p-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Prontuário SOAP
              </div>
              <div className="text-sm font-semibold">Consulta atual · Mariana Silva</div>
            </div>
            <Button
              onClick={toggleRecording}
              variant={recording ? "default" : "outline"}
              size="sm"
              className={recording ? "bg-rose-500 text-white hover:bg-rose-600" : ""}
            >
              {recording ? (
                <>
                  <MicOff className="mr-1.5 h-4 w-4" />
                  Parar gravação
                </>
              ) : (
                <>
                  <Mic className="mr-1.5 h-4 w-4" />
                  Gravar consulta
                </>
              )}
            </Button>
          </div>

          {/* S */}
          <SoapBlock
            letter="S"
            name="Subjetivo"
            tone="cyan"
            headerNote={
              <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-medium text-sky-700 ring-1 ring-sky-200">
                <RefreshCw className="h-3 w-3" />
                Pré-preenchido via WhatsApp
              </span>
            }
          >
            {(locked) => (
              <SubjectiveBody
                value={subjective}
                onChange={setSubjective}
                locked={locked}
              />
            )}
          </SoapBlock>

          {/* O */}
          <SoapBlock letter="O" name="Objetivo" tone="emerald">
            {(locked) => (
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-3">
                  <Field
                    label="PA (mmHg)"
                    value={objetivo.pa}
                    disabled={locked}
                    onChange={(v) => setObjetivo({ ...objetivo, pa: v })}
                  />
                  <Field
                    label="Peso (kg)"
                    value={objetivo.peso}
                    disabled={locked}
                    onChange={(v) => setObjetivo({ ...objetivo, peso: v })}
                  />
                  <Field
                    label="FC (bpm)"
                    value={objetivo.fc}
                    disabled={locked}
                    onChange={(v) => setObjetivo({ ...objetivo, fc: v })}
                  />
                </div>
                <AutoTextarea
                  value={objetivoNotes}
                  onChange={setObjetivoNotes}
                  disabled={locked}
                  placeholder="Exame físico e dados objetivos adicionais..."
                />
              </div>
            )}
          </SoapBlock>

          {/* A */}
          <SoapBlock
            letter="A"
            name="Avaliação"
            tone="amber"
            headerNote={
              <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600 ring-1 ring-slate-200">
                <Lock className="h-3 w-3" />
                Visível apenas para o médico
              </span>
            }
          >
            {(locked) => (
              <AutoTextarea
                value={diag}
                onChange={setDiag}
                disabled={locked}
                placeholder="Impressão clínica e hipóteses diagnósticas..."
              />
            )}
          </SoapBlock>

          {/* P */}
          <SoapBlock
            letter="P"
            name="Plano"
            tone="violet"
            headerNote={
              planTab === "memed" ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700 ring-1 ring-emerald-200">
                  ICP-Brasil · nativo
                </span>
              ) : null
            }
          >
            {(locked) => (
              <div className="space-y-3">
                <div className="inline-flex rounded-lg bg-muted p-1 text-xs">
                  <button
                    type="button"
                    onClick={() => setPlanTab("clinico")}
                    className={`rounded-md px-3 py-1.5 font-medium transition-colors ${
                      planTab === "clinico"
                        ? "bg-white text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Plano clínico
                  </button>
                  <button
                    type="button"
                    onClick={() => setPlanTab("memed")}
                    className={`rounded-md px-3 py-1.5 font-medium transition-colors ${
                      planTab === "memed"
                        ? "bg-white text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Prescrição Memed
                  </button>
                </div>

                {planTab === "clinico" ? (
                  <div className="space-y-2">
                    <AutoTextarea
                      value={plano}
                      onChange={setPlano}
                      disabled={locked}
                      placeholder="Condutas, orientações e solicitações de exame..."
                    />
                    {!locked && !planSuggested && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setPlanSuggested(true)}
                        className="text-xs"
                      >
                        <Lightbulb className="mr-1.5 h-3.5 w-3.5" />
                        Sugerir plano com base no S/O
                      </Button>
                    )}
                    {planSuggested && (
                      <SuggestionBox
                        title="Sugestão da IA"
                        text={`1. Considerar reposição de ferro oral (Sulfato Ferroso 40mg/dia).
2. Solicitar ferritina de controle em 60 dias.
3. Orientar hidratação e repouso relativo.
4. Retorno em 45 dias ou antes se piora.`}
                        onAccept={() => {
                          setPlano(
                            (p) =>
                              (p ? p + "\n\n" : "") +
                              "1. Considerar reposição de ferro oral (Sulfato Ferroso 40mg/dia).\n2. Solicitar ferritina de controle em 60 dias.\n3. Orientar hidratação e repouso relativo.\n4. Retorno em 45 dias ou antes se piora.",
                          );
                          setPlanSuggested(false);
                          toast.success("Sugestão aplicada ao plano");
                        }}
                        onIgnore={() => setPlanSuggested(false)}
                      />
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        value={medSearch}
                        onChange={(e) => setMedSearch(e.target.value)}
                        placeholder="Buscar medicamento..."
                        className="pl-9"
                        maxLength={80}
                        disabled={locked}
                      />
                    </div>
                    {medSearch && (
                      <div className="space-y-1 rounded-lg border border-violet-200 bg-card">
                        {filtered.length === 0 && (
                          <div className="p-3 text-xs text-muted-foreground">
                            Nenhum medicamento encontrado.
                          </div>
                        )}
                        {filtered.map((m) => (
                          <button
                            key={m.name}
                            type="button"
                            onClick={() => {
                              if (!selectedMeds.includes(m.name))
                                setSelectedMeds([...selectedMeds, m.name]);
                              setMedSearch("");
                            }}
                            className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-violet-50"
                          >
                            <div>
                              <div className="font-medium">{m.name}</div>
                              <div className="text-[11px] text-muted-foreground">
                                {m.desc}
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                    {selectedMeds.length > 0 && (
                      <div className="space-y-1.5">
                        {selectedMeds.map((m) => (
                          <div
                            key={m}
                            className="flex items-center justify-between rounded-md bg-violet-50 px-3 py-1.5 text-xs ring-1 ring-violet-200"
                          >
                            <span className="font-medium">{m}</span>
                            <button
                              onClick={() =>
                                setSelectedMeds(selectedMeds.filter((s) => s !== m))
                              }
                              className="text-muted-foreground hover:text-destructive"
                            >
                              remover
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </SoapBlock>
        </div>

        {/* ---------- RIGHT: Biomarkers + collapsibles + sticky CTA ---------- */}
        <div className="space-y-5 lg:sticky lg:top-6 lg:self-start">
          <div className="rounded-3xl border border-border bg-card p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  Painel de biomarcadores
                </div>
                <div className="text-sm font-semibold">Tendência · 4 anos</div>
              </div>
              <div className="flex flex-wrap gap-1">
                {PANELS.map((p) => {
                  const Icon = p.icon;
                  const isActive = activePanel === p.id;
                  return (
                    <button
                      key={p.id}
                      onClick={() => setActivePanel(p.id)}
                      className={`flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-medium transition-all ${
                        isActive
                          ? `bg-gradient-to-r ${p.tint} text-white shadow`
                          : "bg-muted text-muted-foreground hover:bg-muted/70"
                      }`}
                      title={p.label}
                    >
                      <Icon className="h-3 w-3" />
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mt-4 space-y-3">
              {panel.series.map((s) => (
                <BiomarkerChart
                  key={s.key}
                  series={s}
                  activeQuest={activeEvent}
                  onExpand={() => setExpandedSeries(s.key)}
                />
              ))}
            </div>

            {expanded && (
              <ExpandedSeries
                series={expanded}
                onClose={() => setExpandedSeries(null)}
              />
            )}
          </div>

          <Collapsible
            icon={Users}
            title="Casos com perfil similar"
            badge="3 pacientes"
          >
            <div className="space-y-2">
              {SIMILAR_CASES.map((c) => (
                <div
                  key={c.id}
                  className="rounded-lg border border-border bg-white p-2.5 text-[11px]"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">{c.age} anos · {c.sex}</span>
                    <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
                      {c.outcome}
                    </span>
                  </div>
                  <div className="mt-1 text-muted-foreground">{c.condition}</div>
                  <div className="mt-0.5 text-foreground/80">{c.treatment}</div>
                </div>
              ))}
              <div className="text-[10px] italic text-muted-foreground">
                Dados anonimizados · mesma médica
              </div>
            </div>
          </Collapsible>

          <Collapsible
            icon={BookOpen}
            title="Minha base de conhecimento"
          >
            <div className="space-y-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={kbSearch}
                  onChange={(e) => setKbSearch(e.target.value)}
                  placeholder="Buscar protocolos..."
                  className="h-8 pl-7 text-xs"
                />
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

          <Button
            onClick={finalize}
            disabled={sealed}
            className="w-full bg-teal-600 text-white shadow-md hover:bg-teal-700"
            size="lg"
          >
            <Mail className="mr-2 h-4 w-4" />
            {sealed ? "Consulta finalizada" : "Finalizar consulta e enviar ao paciente"}
          </Button>
        </div>
      </div>

      {kbOpen && (
        <KbModal item={kbOpen} onClose={() => setKbOpen(null)} />
      )}
    </div>
  );
}


function BiomarkerChart({
  series,
  activeQuest,
  onExpand,
}: {
  series: Series;
  activeQuest: string;
  onExpand: () => void;
}) {
  const activePoint = series.data.find((d) => d.quest === activeQuest);
  const latest = series.data[series.data.length - 1].value;
  const inRange = latest >= series.min && latest <= series.max;
  return (
    <button
      type="button"
      onClick={onExpand}
      className="text-left rounded-2xl border border-border bg-gradient-to-b from-white to-slate-50 p-3 transition-all hover:shadow-md hover:border-cyan-300"
    >
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs font-semibold">{series.label}</div>
          <div className="text-[10px] text-muted-foreground">
            Ref: {series.min}–{series.max} {series.unit}
          </div>
        </div>
        <div
          className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
            inRange
              ? "bg-emerald-100 text-emerald-700"
              : "bg-rose-100 text-rose-700"
          }`}
        >
          {latest} {series.unit.split(" ")[0]}
        </div>
      </div>
      <div className="mt-2 h-28">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={series.data} margin={{ top: 5, right: 5, bottom: 0, left: -25 }}>
            <defs>
              <linearGradient id={`g-${series.key}`} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="oklch(0.62 0.12 200)" stopOpacity={0.45} />
                <stop offset="100%" stopColor="oklch(0.62 0.12 200)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="oklch(0.92 0.01 240)" strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="date" tick={{ fontSize: 9 }} stroke="oklch(0.5 0.02 250)" />
            <YAxis tick={{ fontSize: 9 }} stroke="oklch(0.5 0.02 250)" domain={series.domain} />
            <ReferenceArea
              y1={series.min}
              y2={series.max}
              fill="oklch(0.85 0.12 150)"
              fillOpacity={0.18}
            />
            <Tooltip
              contentStyle={{
                borderRadius: 8,
                border: "1px solid oklch(0.92 0.01 240)",
                fontSize: 11,
              }}
              formatter={(v: number) => [`${v} ${series.unit}`, series.label]}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke="oklch(0.55 0.14 200)"
              strokeWidth={2}
              fill={`url(#g-${series.key})`}
            />
            {activePoint && (
              <ReferenceDot
                x={activePoint.date}
                y={activePoint.value}
                r={6}
                fill="oklch(0.65 0.2 25)"
                stroke="white"
                strokeWidth={2}
              />
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-1 text-right text-[10px] text-muted-foreground">
        clique para expandir série histórica
      </div>
    </button>
  );
}

function ExpandedSeries({
  series,
  onClose,
}: {
  series: Series;
  onClose: () => void;
}) {
  return (
    <div className="mt-5 rounded-2xl border border-cyan-200 bg-gradient-to-b from-cyan-50/40 to-white p-4">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs font-medium uppercase tracking-wider text-cyan-700">
            Série histórica completa
          </div>
          <div className="text-sm font-semibold">
            {series.label}{" "}
            <span className="text-xs font-normal text-muted-foreground">
              · referência {series.min}–{series.max} {series.unit}
            </span>
          </div>
        </div>
        <button
          onClick={onClose}
          className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Fechar série expandida"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="mt-3 h-64">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={series.data} margin={{ top: 10, right: 10, bottom: 0, left: -10 }}>
            <defs>
              <linearGradient id={`gx-${series.key}`} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="oklch(0.62 0.12 200)" stopOpacity={0.45} />
                <stop offset="100%" stopColor="oklch(0.62 0.12 200)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="oklch(0.92 0.01 240)" strokeDasharray="3 3" />
            <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="oklch(0.5 0.02 250)" />
            <YAxis tick={{ fontSize: 11 }} stroke="oklch(0.5 0.02 250)" domain={series.domain} />
            <Tooltip
              contentStyle={{
                borderRadius: 8,
                border: "1px solid oklch(0.92 0.01 240)",
                fontSize: 12,
              }}
              formatter={(v: number) => [`${v} ${series.unit}`, series.label]}
            />
            <ReferenceLine
              y={series.min}
              stroke="oklch(0.6 0.15 150)"
              strokeDasharray="4 4"
              label={{ value: `mín ${series.min}`, position: "insideTopLeft", fontSize: 10, fill: "oklch(0.45 0.15 150)" }}
            />
            <ReferenceLine
              y={series.max}
              stroke="oklch(0.6 0.15 150)"
              strokeDasharray="4 4"
              label={{ value: `máx ${series.max}`, position: "insideTopLeft", fontSize: 10, fill: "oklch(0.45 0.15 150)" }}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke="oklch(0.55 0.14 200)"
              strokeWidth={2.5}
              fill={`url(#gx-${series.key})`}
              dot={{ r: 4, fill: "oklch(0.55 0.14 200)", stroke: "white", strokeWidth: 2 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-3 grid grid-cols-4 gap-2 text-center">
        {series.data.map((d) => {
          const out = d.value < series.min || d.value > series.max;
          return (
            <div
              key={d.date}
              className={`rounded-lg border px-2 py-1.5 ${
                out
                  ? "border-rose-200 bg-rose-50 text-rose-700"
                  : "border-emerald-200 bg-emerald-50 text-emerald-700"
              }`}
            >
              <div className="text-[10px] text-muted-foreground">{d.date}</div>
              <div className="text-sm font-semibold">{d.value}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SoapBlock({
  letter,
  name,
  tone,
  headerNote,
  children,
}: {
  letter: string;
  name: string;
  tone: "cyan" | "emerald" | "amber" | "violet";
  headerNote?: React.ReactNode;
  children: (locked: boolean) => React.ReactNode;
}) {
  const [locked, setLocked] = useState(false);
  const tones: Record<string, string> = {
    cyan: "from-cyan-500 to-teal-500",
    emerald: "from-emerald-500 to-teal-500",
    amber: "from-amber-500 to-orange-500",
    violet: "from-violet-500 to-indigo-500",
  };

  const toggle = () => {
    if (!locked) toast.success(`${name} salvo`);
    setLocked((l) => !l);
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-5 focus-within:border-cyan-400 focus-within:ring-2 focus-within:ring-cyan-100 transition-colors">
      <div className="mb-3 flex items-center gap-3">
        <div
          className={`flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br ${tones[tone]} text-white font-semibold`}
        >
          {letter}
        </div>
        <div className="flex-1">
          <div className="text-sm font-semibold">{name}</div>
        </div>
        {headerNote}
        <button
          onClick={toggle}
          type="button"
          className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium transition-colors ${
            locked
              ? "border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100"
              : "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
          }`}
        >
          {locked ? <Pencil className="h-3 w-3" /> : <Save className="h-3 w-3" />}
          {locked ? "Editar" : "Salvar"}
        </button>
      </div>
      {children(locked)}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[11px] text-muted-foreground">{label}</Label>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={20}
        disabled={disabled}
      />
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

function SubjectiveBody({
  value,
  onChange,
  locked,
}: {
  value: string;
  onChange: (v: string) => void;
  locked: boolean;
}) {
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [showSuggestion, setShowSuggestion] = useState(false);

  useEffect(() => {
    if (!recording) return;
    const t = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [recording]);

  const fmt = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  const toggle = () => {
    if (recording) {
      setRecording(false);
      setShowSuggestion(true);
    } else {
      setElapsed(0);
      setRecording(true);
      setShowSuggestion(false);
    }
  };

  const suggestion =
    "Paciente menciona melhora com repouso. Piora ao caminhar mais de 100m.";

  return (
    <div className="space-y-2">
      <AutoTextarea value={value} onChange={onChange} disabled={locked} />
      <button
        type="button"
        onClick={toggle}
        disabled={locked}
        className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[11px] font-medium transition-colors ${
          recording
            ? "border-rose-300 bg-rose-50 text-rose-700"
            : "border-border bg-background text-foreground/80 hover:bg-muted"
        } disabled:opacity-50`}
      >
        {recording ? (
          <>
            <span className="h-2 w-2 animate-pulse rounded-full bg-rose-500" />
            Gravando · {fmt(elapsed)}
          </>
        ) : (
          <>
            <Mic className="h-3 w-3" />
            Gravar e transcrever
          </>
        )}
      </button>
      {showSuggestion && (
        <SuggestionBox
          title="Sugestão da transcrição"
          text={`"${suggestion}"`}
          onAccept={() => {
            onChange((value ? value + " " : "") + suggestion);
            setShowSuggestion(false);
            toast.success("Sugestão incorporada ao S");
          }}
          onIgnore={() => setShowSuggestion(false)}
        />
      )}
    </div>
  );
}

function SuggestionBox({
  title,
  text,
  onAccept,
  onIgnore,
}: {
  title: string;
  text: string;
  onAccept: () => void;
  onIgnore: () => void;
}) {
  return (
    <div className="rounded-lg border border-sky-200 bg-sky-50/70 p-3">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold text-sky-800">
        <Lightbulb className="h-3.5 w-3.5" />
        {title}
      </div>
      <div className="mt-1 whitespace-pre-line text-[12px] leading-relaxed text-slate-700">
        {text}
      </div>
      <div className="mt-2 flex gap-2">
        <Button size="sm" onClick={onAccept} className="h-7 bg-sky-600 text-white hover:bg-sky-700 text-[11px]">
          Aceitar
        </Button>
        <Button size="sm" variant="outline" onClick={onIgnore} className="h-7 text-[11px]">
          Ignorar
        </Button>
      </div>
    </div>
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
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-4 py-3 text-left"
      >
        <Icon className="h-4 w-4 text-muted-foreground" />
        <span className="flex-1 text-sm font-medium">{title}</span>
        {badge && (
          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
            {badge}
          </span>
        )}
        <ChevronDown
          className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
        />
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
            <div className="text-[11px] font-medium uppercase tracking-wider text-cyan-700">
              Base de conhecimento
            </div>
            <div className="mt-0.5 text-base font-semibold">{item.title}</div>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:bg-muted"
            aria-label="Fechar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-4 text-sm leading-relaxed text-slate-700">{item.body}</div>
        <div className="mt-5 flex justify-end">
          <Button size="sm" onClick={onClose}>Fechar</Button>
        </div>
      </div>
    </div>
  );
}

