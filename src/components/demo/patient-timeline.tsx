import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Award,
  CalendarDays,
  CheckCircle2,
  Droplet,
  FileText,
  FlaskConical,
  Heart,
  Lock,
  Pill,
  Search,
  Sparkles,
  Star,
  Stethoscope,
  Target,
  TestTube,
  Trophy,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceArea,
  ReferenceDot,
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

// ---------- Quest checkpoints ----------
type QuestState = "completed" | "current" | "alert";
type Quest = {
  id: string;
  year: string;
  date: string;
  title: string;
  subtitle: string;
  state: QuestState;
  xp: number;
  badge: string;
  icon: React.ComponentType<{ className?: string }>;
  summary: string;
};

const QUESTS: Quest[] = [
  {
    id: "q2023",
    year: "2023",
    date: "Mar 2023",
    title: "Check-up de Rotina",
    subtitle: "Painel anual completo",
    state: "completed",
    xp: 120,
    badge: "Saudável",
    icon: Heart,
    summary:
      "Painel metabólico completo dentro da faixa ótima. Hb 13.4 · Ferritina 78 · Vit D 38.",
  },
  {
    id: "q2024",
    year: "2024",
    date: "Set 2024",
    title: "Investigação de Fadiga",
    subtitle: "Hemograma + perfil de ferro",
    state: "completed",
    xp: 200,
    badge: "Alerta inicial",
    icon: FlaskConical,
    summary:
      "Primeira queda significativa de hemoglobina. Ferritina caindo · Vit D limítrofe.",
  },
  {
    id: "q2025",
    year: "2025",
    date: "Mai 2025",
    title: "Acompanhamento Metabólico",
    subtitle: "Bioquímica + vitaminas",
    state: "completed",
    xp: 260,
    badge: "Watchlist",
    icon: TestTube,
    summary:
      "Suplementação iniciada. B12 e Zinco abaixo do ideal. EAS com leucócitos +.",
  },
  {
    id: "q2026",
    year: "2026",
    date: "Agora · Jun 2026",
    title: "Triagem Atual",
    subtitle: "Briefing WhatsApp + 2 exames",
    state: "alert",
    xp: 340,
    badge: "Quest ativa",
    icon: AlertTriangle,
    summary:
      "Hb 11.2 · Ferritina 18 · Vit D 19. Queixa de fadiga + dispneia.",
  },
];

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
  const [diag, setDiag] = useState("");
  const [plano, setPlano] = useState("");
  const [medSearch, setMedSearch] = useState("");
  const [selectedMeds, setSelectedMeds] = useState<string[]>([]);
  const [activeQuest, setActiveQuest] = useState<string>(initialQuest ?? "q2026");
  const [activePanel, setActivePanel] = useState<string>(initialPanel ?? "hemo");
  const [arrivalPulse, setArrivalPulse] = useState<boolean>(
    Boolean(initialQuest || initialPanel),
  );
  const timelineRef = useRef<HTMLDivElement | null>(null);

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

  const totalXp = QUESTS.reduce((a, q) => a + q.xp, 0);
  const progressPct = Math.min(
    100,
    (QUESTS.filter((q) => q.state === "completed").length / QUESTS.length) * 100,
  );

  const filtered = MED_OPTIONS.filter((m) =>
    m.name.toLowerCase().includes(medSearch.toLowerCase()),
  );

  const seal = () => {
    setSealed(true);
    toast.success("Prontuário selado com sucesso", {
      description: "Assinatura ICP-Brasil aplicada · imutabilidade legal garantida.",
      icon: <Lock className="h-4 w-4" />,
    });
    setTimeout(onSeal, 1200);
  };

  return (
    <div className="mx-auto max-w-[1500px] p-6 lg:p-10">
      <PageHeader
        eyebrow="Step C · Mariana Silva · 38 anos"
        title="Health Quest Timeline & Prontuário SOAP"
        desc="Toda a jornada clínica de Mariana em um mapa gamificado — checkpoints anuais, biomarcadores multidimensionais e prontuário SOAP ao vivo."
      />

      {/* Patient hero / XP bar */}
      <div className="mt-6 overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-slate-900 via-slate-800 to-cyan-900 p-6 text-white shadow-xl">
        <div className="flex flex-wrap items-center gap-5">
          <div className="relative">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-rose-400 to-pink-500 text-xl font-bold shadow-lg ring-4 ring-white/10">
              MS
            </div>
            <div className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full bg-amber-400 text-slate-900 shadow-md">
              <Trophy className="h-3.5 w-3.5" />
            </div>
          </div>
          <div className="flex-1 min-w-[220px]">
            <div className="flex items-center gap-2">
              <span className="text-lg font-semibold">Mariana Silva</span>
              <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider">
                LVL 4 · Paciente Engajada
              </span>
            </div>
            <div className="text-xs text-white/60">
              38 anos · F · 3 anos de histórico clínico digital
            </div>
            <div className="mt-3">
              <div className="flex items-center justify-between text-[11px] text-white/70">
                <span>Quest Progress · {QUESTS.filter((q) => q.state === "completed").length}/{QUESTS.length} checkpoints</span>
                <span className="flex items-center gap-1">
                  <Star className="h-3 w-3 text-amber-300" />
                  {totalXp} XP
                </span>
              </div>
              <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-emerald-400 via-cyan-400 to-teal-300 transition-all duration-700"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            {["Saudável", "Watchlist", "Quest ativa"].map((b, i) => (
              <div
                key={b}
                className={`flex flex-col items-center justify-center rounded-xl px-3 py-2 text-[10px] font-medium ${
                  i === 2
                    ? "bg-rose-500/20 text-rose-200 ring-1 ring-rose-400/40"
                    : i === 1
                    ? "bg-amber-500/20 text-amber-200 ring-1 ring-amber-400/40"
                    : "bg-emerald-500/20 text-emerald-200 ring-1 ring-emerald-400/40"
                }`}
              >
                <Award className="mb-1 h-4 w-4" />
                {b}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[460px_1fr]">
        {/* ---------- LEFT: Gamified vertical timeline ---------- */}
        <div className="rounded-3xl border border-border bg-gradient-to-b from-card via-card to-cyan-50/40 p-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Health Quest Map
              </div>
              <div className="text-base font-semibold">Linha do Tempo · 2023 → 2026</div>
            </div>
            <div className="flex items-center gap-1 rounded-full bg-cyan-100 px-2.5 py-1 text-[10px] font-medium text-cyan-800">
              <Target className="h-3 w-3" />
              4 checkpoints
            </div>
          </div>

          <div className="relative mt-8 pl-2">
            {/* Central track */}
            <div className="absolute left-[34px] top-2 bottom-2 w-1.5 rounded-full bg-gradient-to-b from-emerald-300 via-cyan-300 to-rose-300" />
            <div className="space-y-5">
              {QUESTS.map((q, idx) => {
                const Icon = q.icon;
                const isActive = activeQuest === q.id;
                const tone =
                  q.state === "completed"
                    ? "from-emerald-400 to-emerald-600 ring-emerald-200"
                    : q.state === "current"
                    ? "from-cyan-400 to-teal-500 ring-cyan-200"
                    : "from-rose-400 to-orange-500 ring-rose-200 animate-pulse";
                return (
                  <button
                    key={q.id}
                    onClick={() => setActiveQuest(q.id)}
                    className={`group relative flex w-full items-stretch gap-4 rounded-2xl border p-3 text-left transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg ${
                      isActive
                        ? "border-cyan-400 bg-white shadow-md ring-2 ring-cyan-200"
                        : "border-border bg-white/70 hover:border-cyan-300"
                    }`}
                  >
                    {/* Node */}
                    <div className="relative z-10 flex flex-col items-center">
                      <div
                        className={`flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br ${tone} text-white shadow-md ring-4`}
                      >
                        <Icon className="h-6 w-6" />
                      </div>
                      <span className="mt-1 rounded-full bg-slate-900 px-1.5 py-0.5 text-[9px] font-bold text-white">
                        {q.year}
                      </span>
                    </div>
                    {/* Card */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold leading-tight">
                            {q.title}
                          </div>
                          <div className="text-[11px] text-muted-foreground">{q.date}</div>
                        </div>
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                            q.state === "completed"
                              ? "bg-emerald-100 text-emerald-700"
                              : q.state === "current"
                              ? "bg-cyan-100 text-cyan-700"
                              : "bg-rose-100 text-rose-700"
                          }`}
                        >
                          {q.badge}
                        </span>
                      </div>
                      <div className="mt-1 text-[11px] text-foreground/75">
                        {q.subtitle}
                      </div>
                      <div className="mt-2 flex items-center justify-between">
                        <div className="flex items-center gap-1.5 text-[10px] font-medium text-amber-600">
                          <Zap className="h-3 w-3" />
                          +{q.xp} XP
                        </div>
                        {isActive && (
                          <span className="rounded-full bg-cyan-600 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white">
                            Selecionado
                          </span>
                        )}
                      </div>
                      {isActive && (
                        <div className="mt-2 rounded-lg bg-cyan-50 p-2 text-[11px] text-cyan-900 ring-1 ring-cyan-200 animate-fade-in">
                          {q.summary}
                        </div>
                      )}
                    </div>
                    {/* Connector check */}
                    {idx < QUESTS.length - 1 && q.state === "completed" && (
                      <div className="absolute -bottom-3 left-[34px] z-20 flex h-6 w-6 -translate-x-1/2 items-center justify-center rounded-full bg-emerald-500 text-white shadow ring-2 ring-white">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* ---------- RIGHT: Biomarker dashboard + SOAP ---------- */}
        <div className="space-y-5">
          {/* Panel tabs */}
          <div className="rounded-3xl border border-border bg-card p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  Biomarker Dashboard
                </div>
                <div className="text-base font-semibold">
                  Painel multiparamétrico · 4 anos
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {PANELS.map((p) => {
                  const Icon = p.icon;
                  const isActive = activePanel === p.id;
                  return (
                    <button
                      key={p.id}
                      onClick={() => setActivePanel(p.id)}
                      className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all ${
                        isActive
                          ? `bg-gradient-to-r ${p.tint} text-white shadow-md`
                          : "bg-muted text-muted-foreground hover:bg-muted/70"
                      }`}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {p.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              {panel.series.map((s) => (
                <BiomarkerChart key={s.key} series={s} activeQuest={activeQuest} />
              ))}
            </div>
          </div>

          {/* SOAP */}
          <div className="grid gap-4 md:grid-cols-2">
            <SoapBlock letter="S" name="Subjetivo" icon={Stethoscope} tone="cyan">
              <Textarea
                value={subjective}
                onChange={(e) => setSubjective(e.target.value)}
                rows={4}
                placeholder="Anote a queixa principal..."
                maxLength={1500}
                className="resize-none"
              />
              {subjective && (
                <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-cyan-100 px-2.5 py-1 text-[11px] font-medium text-cyan-800">
                  <CheckCircle2 className="h-3 w-3" />
                  Pré-preenchido a partir do WhatsApp
                </div>
              )}
            </SoapBlock>

            <SoapBlock letter="O" name="Objetivo" icon={Activity} tone="emerald">
              <div className="grid grid-cols-3 gap-3">
                <Field label="PA (mmHg)" value={objetivo.pa} onChange={(v) => setObjetivo({ ...objetivo, pa: v })} />
                <Field label="Peso (kg)" value={objetivo.peso} onChange={(v) => setObjetivo({ ...objetivo, peso: v })} />
                <Field label="FC (bpm)" value={objetivo.fc} onChange={(v) => setObjetivo({ ...objetivo, fc: v })} />
              </div>
            </SoapBlock>

            <SoapBlock letter="A" name="Avaliação" icon={FileText} tone="amber">
              <Textarea
                value={diag}
                onChange={(e) => setDiag(e.target.value)}
                rows={3}
                placeholder="Hipótese diagnóstica (ex.: anemia ferropriva CID D50.9)"
                maxLength={500}
                className="resize-none"
              />
            </SoapBlock>

            <SoapBlock letter="P" name="Plano + Memed" icon={Pill} tone="violet">
              <Textarea
                value={plano}
                onChange={(e) => setPlano(e.target.value)}
                rows={3}
                placeholder="Conduta clínica e orientações"
                maxLength={500}
                className="resize-none"
              />
            </SoapBlock>
          </div>

          {/* Memed */}
          <div className="rounded-2xl border border-violet-200 bg-violet-50/60 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-md bg-gradient-to-br from-violet-500 to-indigo-500 text-white">
                  <Pill className="h-4 w-4" />
                </div>
                <div>
                  <div className="text-sm font-semibold">Prescrever via Memed</div>
                  <div className="text-[11px] text-muted-foreground">ICP-Brasil · nativo</div>
                </div>
              </div>
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                Integrado
              </span>
            </div>
            <div className="relative mt-3">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={medSearch}
                onChange={(e) => setMedSearch(e.target.value)}
                placeholder="Buscar medicamento..."
                className="pl-9"
                maxLength={80}
              />
            </div>
            {medSearch && (
              <div className="mt-2 space-y-1 rounded-lg border border-violet-200 bg-card">
                {filtered.length === 0 && (
                  <div className="p-3 text-xs text-muted-foreground">Nenhum medicamento encontrado.</div>
                )}
                {filtered.map((m) => (
                  <button
                    key={m.name}
                    type="button"
                    onClick={() => {
                      if (!selectedMeds.includes(m.name)) setSelectedMeds([...selectedMeds, m.name]);
                      setMedSearch("");
                    }}
                    className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-violet-50"
                  >
                    <div>
                      <div className="font-medium">{m.name}</div>
                      <div className="text-[11px] text-muted-foreground">{m.desc}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
            {selectedMeds.length > 0 && (
              <div className="mt-3 space-y-1.5">
                {selectedMeds.map((m) => (
                  <div key={m} className="flex items-center justify-between rounded-md bg-card px-3 py-1.5 text-xs ring-1 ring-violet-200">
                    <span className="font-medium">{m}</span>
                    <button
                      onClick={() => setSelectedMeds(selectedMeds.filter((s) => s !== m))}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      remover
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Seal */}
          <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card p-4">
            <div className="flex items-center gap-2 text-sm">
              <CalendarDays className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Atendimento iniciado às 14:18 · 12 min</span>
            </div>
            <div className="ml-auto flex items-center gap-2">
              {sealed && (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-medium text-emerald-800">
                  <Lock className="h-3 w-3" />
                  Selado · ICP-Brasil
                </span>
              )}
              <Button
                onClick={seal}
                disabled={sealed}
                className="brand-gradient text-primary-foreground shadow-md"
              >
                <Lock className="mr-1.5 h-4 w-4" />
                {sealed ? "Prontuário selado" : "Salvar e Selar Prontuário"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function BiomarkerChart({
  series,
  activeQuest,
}: {
  series: Series;
  activeQuest: string;
}) {
  const activePoint = series.data.find((d) => d.quest === activeQuest);
  const latest = series.data[series.data.length - 1].value;
  const inRange = latest >= series.min && latest <= series.max;
  return (
    <div className="rounded-2xl border border-border bg-gradient-to-b from-white to-slate-50 p-3 transition-all hover:shadow-md">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs font-semibold">{series.label}</div>
          <div className="text-[10px] text-muted-foreground">
            Faixa ótima: {series.min}–{series.max} {series.unit}
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
    </div>
  );
}

function SoapBlock({
  letter,
  name,
  icon: Icon,
  tone,
  children,
}: {
  letter: string;
  name: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: "cyan" | "emerald" | "amber" | "violet";
  children: React.ReactNode;
}) {
  const tones: Record<string, string> = {
    cyan: "from-cyan-500 to-teal-500",
    emerald: "from-emerald-500 to-teal-500",
    amber: "from-amber-500 to-orange-500",
    violet: "from-violet-500 to-indigo-500",
  };
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="mb-3 flex items-center gap-3">
        <div className={`flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br ${tones[tone]} text-white font-semibold`}>
          {letter}
        </div>
        <div>
          <div className="text-sm font-semibold">{name}</div>
          <div className="text-[11px] text-muted-foreground flex items-center gap-1">
            <Icon className="h-3 w-3" />
            SOAP
          </div>
        </div>
      </div>
      {children}
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[11px] text-muted-foreground">{label}</Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} maxLength={20} />
    </div>
  );
}
