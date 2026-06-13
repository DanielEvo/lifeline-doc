import { useMemo, useState } from "react";
import {
  Activity,
  Bell,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Circle,
  Clock,
  Download,
  Droplet,
  Facebook,
  FileText,
  Footprints,
  Heart,
  Home,
  KeyRound,
  Lock,
  Mail,
  Moon,
  Pencil,
  Pill,
  QrCode,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  TrendingDown,
  User as UserIcon,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { PageHeader } from "./whatsapp-simulator";

/* ============================================================
   TYPES & DATA
   ============================================================ */
type Screen = "home" | "history" | "exams" | "meds" | "profile";

const SCREENS: { id: Screen; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "home", label: "Início", icon: Home },
  { id: "history", label: "Histórico", icon: FileText },
  { id: "exams", label: "Exames", icon: CalendarDays },
  { id: "meds", label: "Remédios", icon: Pill },
  { id: "profile", label: "Perfil", icon: UserIcon },
];

type Metric = {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  value: number;
  unit: string;
  target: number;
  display: (v: number) => string;
  tone: string;
};

const INITIAL_METRICS: Metric[] = [
  { id: "steps", label: "Passos", icon: Footprints, value: 5421, unit: "passos", target: 8000, display: (v) => v.toLocaleString("pt-BR"), tone: "text-emerald-600" },
  { id: "water", label: "Hidratação", icon: Droplet, value: 1.4, unit: "L", target: 2, display: (v) => `${v.toLocaleString("pt-BR")}L`, tone: "text-cyan-600" },
  { id: "sleep", label: "Sono", icon: Moon, value: 6.33, unit: "h", target: 7, display: (v) => `${Math.floor(v)}h${String(Math.round((v % 1) * 60)).padStart(2, "0")}`, tone: "text-indigo-600" },
  { id: "hr", label: "Freq. cardíaca", icon: Heart, value: 72, unit: "bpm", target: 100, display: (v) => `${v} bpm`, tone: "text-rose-600" },
];

const INSIGHTS = [
  { id: "i1", text: "Você dormiu 40min a mais nos dias que tomou todos os remédios.", emoji: "💊→😴" },
  { id: "i2", text: "Sua frequência cardíaca em repouso caiu 4 bpm no último mês.", emoji: "📉❤️" },
  { id: "i3", text: "Você bebe mais água às quartas-feiras. Coincidência?", emoji: "💧" },
  { id: "i4", text: "Seus passos caem 30% quando chove. Faz sentido!", emoji: "🌧️🚶" },
];

const PRE_CONSULT_QUESTIONS = [
  "Como você está se sentindo em relação ao cansaço nas últimas semanas?",
  "Você notou alguma mudança no seu apetite ou disposição?",
  "Tem algo que você quer lembrar de perguntar para a Dra. Helena?",
];

/* ----- Meds ----- */
type Med = { id: string; name: string; dose: string; time: string; period: string; note: string; taken: boolean };
const INITIAL_MEDS: Med[] = [
  { id: "m1", name: "Sulfato Ferroso", dose: "40 mg · 1 cp", time: "07:00", period: "Manhã", note: "Em jejum, com suco de laranja", taken: true },
  { id: "m2", name: "Vitamina B12", dose: "1000 mcg · 1 cp", time: "08:30", period: "Café da manhã", note: "Após café", taken: true },
  { id: "m3", name: "Vitamina D3", dose: "2000 UI · 1 gota", time: "13:00", period: "Almoço", note: "Com refeição gordurosa", taken: false },
  { id: "m4", name: "Sulfato Ferroso", dose: "40 mg · 1 cp", time: "19:00", period: "Jantar", note: "2h após café/leite", taken: false },
  { id: "m5", name: "Magnésio Dimalato", dose: "300 mg · 1 cp", time: "22:00", period: "Noite", note: "Antes de dormir", taken: false },
];

/* ----- Exams ----- */
type ExamStatus = "upcoming" | "done";
type Exam = { id: string; day: number; month: string; monthIdx: number; year: number; title: string; lab: string; status: ExamStatus; result?: string; resultTone?: string };
const INITIAL_EXAMS: Exam[] = [
  { id: "e0", day: 10, month: "MAR", monthIdx: 2, year: 2026, title: "Hemograma", lab: "Lab. Fleury", status: "done", result: "Hb 11.2 ⚠", resultTone: "text-rose-600" },
  { id: "e1", day: 2, month: "ABR", monthIdx: 3, year: 2026, title: "Vitamina D", lab: "Lab. Sabin", status: "done", result: "Baixa ⚠", resultTone: "text-amber-600" },
  { id: "e2", day: 15, month: "MAI", monthIdx: 4, year: 2026, title: "TSH + T4 livre", lab: "Lab. Fleury", status: "done", result: "Normal", resultTone: "text-emerald-600" },
  { id: "e3", day: 12, month: "JUL", monthIdx: 6, year: 2026, title: "Hemograma completo", lab: "Lab. Fleury · 08:00", status: "upcoming" },
  { id: "e4", day: 18, month: "JUL", monthIdx: 6, year: 2026, title: "Ferritina + B12 + Zinco", lab: "Lab. Sabin · 09:30", status: "upcoming" },
  { id: "e5", day: 2, month: "AGO", monthIdx: 7, year: 2026, title: "Retorno Dra. Helena", lab: "Telemedicina · 14:00", status: "upcoming" },
];

/* ----- History (clinical timeline) ----- */
type HistoryEventStatus = "Saudável" | "Atenção" | "Alerta" | "Em acompanhamento";
type Biomarker = { name: string; value: string; ref: string; min: number; max: number; current: number; status: "ok" | "low" | "high" };
type HistoryEvent = {
  id: string;
  date: string;
  label: string;
  source: string;
  type: "consulta" | "exames" | "retorno";
  status: HistoryEventStatus;
  locked?: boolean;
  doctor?: string;
  biomarkers?: Biomarker[];
};

const HISTORY_EVENTS: HistoryEvent[] = [
  {
    id: "h1",
    date: "Mar 2023",
    label: "Check-up de rotina",
    source: "Lab. Fleury · Dra. Helena",
    type: "exames",
    status: "Saudável",
    biomarkers: [
      { name: "Hemoglobina", value: "13.8 g/dL", ref: "12–16 g/dL", min: 12, max: 16, current: 13.8, status: "ok" },
      { name: "Ferritina", value: "62 ng/mL", ref: "30–200 ng/mL", min: 30, max: 200, current: 62, status: "ok" },
      { name: "Vitamina D", value: "38 UI/mL", ref: "30–100 UI/mL", min: 30, max: 100, current: 38, status: "ok" },
      { name: "TSH", value: "2.1 mUI/L", ref: "0.4–4.0 mUI/L", min: 0.4, max: 4.0, current: 2.1, status: "ok" },
    ],
  },
  {
    id: "h2",
    date: "Jan 2024",
    label: "Consulta · Dr. Marcos Lima",
    source: "Clínica Geral",
    type: "consulta",
    status: "Em acompanhamento",
    locked: true,
    doctor: "Dr. Marcos Lima",
  },
  {
    id: "h3",
    date: "Set 2024",
    label: "Investigação de fadiga",
    source: "Lab. Fleury · Dra. Helena",
    type: "exames",
    status: "Atenção",
    biomarkers: [
      { name: "Hemoglobina", value: "12.4 g/dL", ref: "12–16 g/dL", min: 12, max: 16, current: 12.4, status: "ok" },
      { name: "Ferritina", value: "18 ng/mL", ref: "30–200 ng/mL", min: 30, max: 200, current: 18, status: "low" },
      { name: "Vitamina D", value: "19 UI/mL", ref: "30–100 UI/mL", min: 30, max: 100, current: 19, status: "low" },
    ],
  },
  {
    id: "h4",
    date: "Mai 2025",
    label: "Acompanhamento metabólico",
    source: "Lab. Sabin · Dra. Helena",
    type: "exames",
    status: "Atenção",
    biomarkers: [
      { name: "Hemoglobina", value: "11.9 g/dL", ref: "12–16 g/dL", min: 12, max: 16, current: 11.9, status: "low" },
      { name: "Ferritina", value: "22 ng/mL", ref: "30–200 ng/mL", min: 30, max: 200, current: 22, status: "low" },
      { name: "Vitamina B12", value: "210 pg/mL", ref: "200–900 pg/mL", min: 200, max: 900, current: 210, status: "ok" },
    ],
  },
  {
    id: "h5",
    date: "Jun 2026",
    label: "Consulta atual",
    source: "Telemedicina · Dra. Helena",
    type: "retorno",
    status: "Em acompanhamento",
  },
];

/* ============================================================
   MAIN COMPONENT
   ============================================================ */
export function PatientAppMockup({ onRestart }: { onRestart: () => void }) {
  const [onboarded, setOnboarded] = useState(false);
  const [screen, setScreen] = useState<Screen>("home");
  const [meds, setMeds] = useState<Med[]>(INITIAL_MEDS);
  const [exams, setExams] = useState<Exam[]>(INITIAL_EXAMS);
  const [metrics, setMetrics] = useState<Metric[]>(INITIAL_METRICS);

  const upcomingCount = exams.filter((e) => e.status === "upcoming").length;
  const takenMeds = meds.filter((m) => m.taken).length;

  const toggleMed = (id: string) =>
    setMeds((arr) => {
      const t = arr.find((x) => x.id === id);
      if (t && !t.taken) toast.success(`${t.name} registrado ✓`);
      return arr.map((x) => (x.id === id ? { ...x, taken: !x.taken } : x));
    });

  const completeExam = (id: string) =>
    setExams((arr) =>
      arr.map((x) =>
        x.id === id
          ? { ...x, status: "done" as ExamStatus, result: x.result ?? "Aguardando", resultTone: x.resultTone ?? "text-muted-foreground" }
          : x,
      ),
    );

  const updateMetric = (id: string, value: number) =>
    setMetrics((arr) => arr.map((m) => (m.id === id ? { ...m, value } : m)));

  return (
    <div className="mx-auto max-w-[1300px] p-6 lg:p-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <PageHeader
          eyebrow="Step D · Visão do paciente"
          title="O que Mariana vê no celular"
          desc="Onboarding, 5 telas navegáveis e identidade portátil LifeLine. Linguagem clínica, sem gamificação."
        />
        <Button variant="outline" onClick={onRestart}>
          <RotateCcw className="mr-1.5 h-4 w-4" />
          Refazer o fluxo
        </Button>
      </div>

      <div className="mt-8 grid items-start gap-8 lg:grid-cols-[380px_1fr]">
        {/* Phone */}
        <div className="mx-auto w-full max-w-[380px]">
          <div className="relative rounded-[2.5rem] border-[10px] border-slate-900 bg-slate-900 shadow-2xl">
            <div className="absolute left-1/2 top-0 z-10 h-6 w-32 -translate-x-1/2 rounded-b-2xl bg-slate-900" />
            <div className="overflow-hidden rounded-[2rem] bg-background">
              {!onboarded ? (
                <div className="h-[700px]">
                  <OnboardingScreen onEnter={() => setOnboarded(true)} />
                </div>
              ) : (
                <>
                  <PhoneStatusBar />
                  <PhoneHeader screen={screen} />
                  <div className="h-[600px] overflow-y-auto overscroll-contain [scrollbar-width:thin]">
                    {screen === "home" && (
                      <HomeScreen
                        metrics={metrics}
                        updateMetric={updateMetric}
                        takenMeds={takenMeds}
                        totalMeds={meds.length}
                        onGoMeds={() => setScreen("meds")}
                      />
                    )}
                    {screen === "history" && <HistoryScreen />}
                    {screen === "exams" && <ExamsScreen exams={exams} onComplete={completeExam} />}
                    {screen === "meds" && <MedsScreen meds={meds} onToggle={toggleMed} />}
                    {screen === "profile" && <ProfileScreen />}
                  </div>

                  <div className="flex items-center justify-around border-t border-border bg-card px-1 py-2">
                    {SCREENS.map((s) => {
                      const active = screen === s.id;
                      const badge =
                        s.id === "exams" && upcomingCount > 0
                          ? upcomingCount
                          : s.id === "meds"
                          ? meds.filter((m) => !m.taken).length || undefined
                          : undefined;
                      return (
                        <button
                          key={s.id}
                          onClick={() => setScreen(s.id)}
                          className={`relative flex flex-1 flex-col items-center gap-0.5 rounded-lg py-1.5 transition ${
                            active ? "text-primary" : "text-muted-foreground"
                          }`}
                        >
                          <div className="relative">
                            <s.icon className={`h-4 w-4 ${active ? "" : "opacity-70"}`} />
                            {badge !== undefined && (
                              <span className="absolute -right-2 -top-1.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-rose-500 px-1 text-[8px] font-bold text-white">
                                {badge}
                              </span>
                            )}
                          </div>
                          <span className="text-[9px] font-medium">{s.label}</span>
                          {active && <span className="h-0.5 w-6 rounded-full bg-primary" />}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Explanation */}
        <div className="space-y-4">
          <ExplainCard
            icon={ShieldCheck}
            tone="cyan"
            title="Identidade única e portátil"
            text="Cada paciente recebe um LifeLine ID criptografado. Médicos autorizados acessam o histórico completo via token sem precisar de novo cadastro."
          />
          <ExplainCard
            icon={Sparkles}
            tone="violet"
            title="Insights leves, nunca diagnóstico"
            text="O app sugere padrões observados (sono, hidratação, batimentos) em linguagem acolhedora — sem hipóteses clínicas. Diagnóstico fica com o médico."
          />
          <ExplainCard
            icon={CalendarDays}
            tone="emerald"
            title={`${upcomingCount} exames próximos`}
            text="Calendário mensal com filtros entre próximos e concluídos. Marcar um exame como feito atualiza o histórico e o contador."
          />
          <ExplainCard
            icon={Pill}
            tone="amber"
            title="Adesão em tempo real"
            text="Cada dose confirmada dispara um sinal para o painel da Dra. Helena — visualizando adesão sem precisar perguntar."
          />

          <div className="rounded-2xl border border-primary/30 bg-primary/5 p-5">
            <div className="text-sm font-semibold">Fluxo concluído</div>
            <p className="mt-2 text-sm text-muted-foreground">
              Triagem no WhatsApp → Kanban → SOAP com ICP-Brasil → app do paciente. Tente marcar um remédio ou concluir um exame.
            </p>
            <div className="mt-4 flex gap-2">
              <Button onClick={onRestart} className="brand-gradient text-primary-foreground">
                <RotateCcw className="mr-1.5 h-4 w-4" />
                Refazer demo
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   ONBOARDING
   ============================================================ */
function OnboardingScreen({ onEnter }: { onEnter: () => void }) {
  return (
    <div className="flex h-full flex-col bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 px-6 py-10 text-white">
      <div className="flex flex-1 flex-col items-center justify-center text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl brand-gradient shadow-lg shadow-primary/40">
          <Activity className="h-8 w-8 text-primary-foreground" strokeWidth={2.5} />
        </div>
        <div className="mt-4 text-2xl font-bold tracking-tight">LifeLine</div>
        <p className="mt-2 text-sm text-white/70">
          Seu histórico de saúde,<br />sempre com você.
        </p>

        <div className="mt-10 w-full space-y-2.5">
          <button
            onClick={onEnter}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-white py-3 text-sm font-semibold text-slate-900 transition hover:bg-white/90"
          >
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-emerald-500 text-[10px] font-bold text-white">G</span>
            Continuar com Google
          </button>
          <button
            onClick={onEnter}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#1877F2] py-3 text-sm font-semibold text-white transition hover:bg-[#1568d6]"
          >
            <Facebook className="h-4 w-4" />
            Continuar com Facebook
          </button>
          <button
            onClick={onEnter}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/5 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
          >
            <Mail className="h-4 w-4" />
            Criar conta com e-mail
          </button>
        </div>

        <button onClick={onEnter} className="mt-5 text-xs text-white/60 underline-offset-2 hover:underline">
          Já tem conta? Entrar
        </button>
      </div>

      <p className="mt-6 text-center text-[10px] leading-relaxed text-white/40">
        Seus dados são protegidos pela LGPD e nunca compartilhados sem sua autorização.
      </p>
    </div>
  );
}

/* ============================================================
   PHONE CHROME
   ============================================================ */
function PhoneStatusBar() {
  return (
    <div className="flex items-center justify-between bg-background px-5 pt-7 pb-1 text-[10px] font-medium">
      <span>14:32</span>
      <div className="flex items-center gap-1 text-muted-foreground">
        <span>5G</span>
        <span>100%</span>
      </div>
    </div>
  );
}

function PhoneHeader({ screen }: { screen: Screen }) {
  const title = SCREENS.find((s) => s.id === screen)?.label ?? "";
  return (
    <div className="flex items-center justify-between border-b border-border bg-card px-4 py-2.5">
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-rose-400 to-pink-500 text-[11px] font-bold text-white">
          MS
        </div>
        <div className="min-w-0">
          <div className="text-[12px] font-semibold leading-tight">Mariana Silva</div>
          <div className="text-[9px] text-muted-foreground">{title}</div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className="hidden font-mono text-[8px] text-muted-foreground sm:inline">LFL · 7H2A · 9KB1</span>
        <button className="relative rounded-full p-1.5 hover:bg-muted" aria-label="Notificações">
          <Bell className="h-4 w-4 text-muted-foreground" />
          <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-rose-500" />
        </button>
      </div>
    </div>
  );
}

/* ============================================================
   TELA 1 · INÍCIO
   ============================================================ */
function HomeScreen({
  metrics,
  updateMetric,
  takenMeds,
  totalMeds,
  onGoMeds,
}: {
  metrics: Metric[];
  updateMetric: (id: string, value: number) => void;
  takenMeds: number;
  totalMeds: number;
  onGoMeds: () => void;
}) {
  const today = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long" });
  const adherence = Math.round((takenMeds / totalMeds) * 100);

  return (
    <div className="px-4 py-3 pb-6">
      {/* Card hoje */}
      <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        Hoje · {today}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        {metrics.map((m) => (
          <MetricCard key={m.id} metric={m} onUpdate={(v) => updateMetric(m.id, v)} />
        ))}
      </div>
      <button className="mt-2 text-[10px] text-primary hover:underline">
        + Conectar Apple Health / Google Fit
      </button>

      {/* Insights */}
      <div className="mt-5 mb-2 flex items-center gap-1.5">
        <Sparkles className="h-3.5 w-3.5 text-primary" />
        <span className="text-xs font-semibold">Seus padrões esta semana</span>
      </div>
      <div className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="flex gap-2 pb-1">
          {INSIGHTS.map((i) => (
            <div
              key={i.id}
              className="w-[200px] shrink-0 rounded-xl border border-border bg-gradient-to-br from-cyan-50 to-background p-3"
            >
              <div className="text-base">{i.emoji}</div>
              <p className="mt-1 text-[11px] leading-snug text-foreground">{i.text}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Próxima consulta */}
      <div className="mt-5 rounded-2xl border border-primary/30 bg-primary/5 p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-primary" />
            <div>
              <div className="text-[11px] font-semibold">Dra. Helena Souza</div>
              <div className="text-[10px] text-muted-foreground">15 Jul · 14h · Telemedicina</div>
            </div>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="mt-3 rounded-lg bg-card p-2.5">
          <div className="text-[10px] font-semibold text-muted-foreground">Pense nisso antes da consulta 🤔</div>
          <ul className="mt-1.5 space-y-1.5">
            {PRE_CONSULT_QUESTIONS.map((q, idx) => (
              <li key={idx} className="flex gap-1.5 text-[10px] leading-snug text-foreground">
                <span className="text-primary">·</span>
                <span>{q}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Adesão */}
      <button
        onClick={onGoMeds}
        className="mt-3 flex w-full items-center gap-3 rounded-xl border border-border bg-card p-3 text-left"
      >
        <Pill className="h-4 w-4 text-violet-500" />
        <div className="flex-1">
          <div className="text-[11px] font-semibold">
            {takenMeds} de {totalMeds} remédios tomados hoje
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-violet-500 transition-all" style={{ width: `${adherence}%` }} />
          </div>
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground" />
      </button>
    </div>
  );
}

function MetricCard({ metric, onUpdate }: { metric: Metric; onUpdate: (v: number) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(metric.value));
  const pct = Math.min(100, (metric.value / metric.target) * 100);
  const Icon = metric.icon;

  const save = () => {
    const v = parseFloat(draft.replace(",", "."));
    if (!isNaN(v)) onUpdate(v);
    setEditing(false);
  };

  return (
    <div className="rounded-xl border border-border bg-card p-2.5">
      <div className="flex items-center justify-between">
        <Icon className={`h-3.5 w-3.5 ${metric.tone}`} />
        <button
          onClick={() => {
            setDraft(String(metric.value));
            setEditing((v) => !v);
          }}
          className="rounded p-0.5 text-muted-foreground hover:bg-muted"
          aria-label="Editar"
        >
          <Pencil className="h-2.5 w-2.5" />
        </button>
      </div>
      <div className="mt-1 text-[10px] text-muted-foreground">{metric.label}</div>
      {editing ? (
        <div className="mt-1 flex items-center gap-1">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && save()}
            autoFocus
            className="min-w-0 flex-1 rounded border border-border bg-background px-1 py-0.5 text-[11px]"
          />
          <button onClick={save} className="rounded bg-primary px-1.5 py-0.5 text-[9px] font-semibold text-primary-foreground">
            OK
          </button>
        </div>
      ) : (
        <div className="text-[12px] font-bold leading-tight">
          {metric.display(metric.value)}
          <span className="ml-1 text-[9px] font-normal text-muted-foreground">/ {metric.display(metric.target)}</span>
        </div>
      )}
      <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-muted">
        <div className={`h-full rounded-full ${metric.tone.replace("text-", "bg-")}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/* ============================================================
   TELA 2 · HISTÓRICO
   ============================================================ */
function HistoryScreen() {
  const [selected, setSelected] = useState<HistoryEvent | null>(null);

  return (
    <div className="px-4 py-3 pb-6">
      <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        Linha do tempo clínica
      </div>

      <div className="relative mt-3 pl-6">
        <div className="absolute left-[10px] top-2 bottom-2 w-0.5 bg-border" />
        <div className="space-y-2.5">
          {HISTORY_EVENTS.map((ev) => (
            <HistoryRow key={ev.id} ev={ev} onClick={() => !ev.locked && setSelected(ev)} active={selected?.id === ev.id} />
          ))}
        </div>
      </div>

      {selected && (
        <div className="mt-4 rounded-2xl border border-border bg-card p-3">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-[11px] font-semibold">{selected.label}</div>
              <div className="text-[9px] text-muted-foreground">{selected.date} · {selected.source}</div>
            </div>
            <button onClick={() => setSelected(null)} className="text-[10px] text-muted-foreground hover:text-foreground">
              ✕
            </button>
          </div>
          {selected.biomarkers ? (
            <div className="mt-3 space-y-2.5">
              {selected.biomarkers.map((b) => (
                <BiomarkerRow key={b.name} b={b} />
              ))}
            </div>
          ) : (
            <p className="mt-3 text-[10px] text-muted-foreground">
              Este registro é uma consulta sem exames associados.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function HistoryRow({ ev, onClick, active }: { ev: HistoryEvent; onClick: () => void; active: boolean }) {
  const typeIcon = ev.type === "consulta" ? Heart : ev.type === "retorno" ? FileText : Activity;
  const Icon = typeIcon;
  const statusTone =
    ev.status === "Saudável"
      ? "bg-emerald-100 text-emerald-700"
      : ev.status === "Atenção"
      ? "bg-amber-100 text-amber-700"
      : ev.status === "Alerta"
      ? "bg-rose-100 text-rose-700"
      : "bg-sky-100 text-sky-700";

  if (ev.locked) {
    return (
      <div
        className="relative flex items-center gap-2.5 rounded-xl border border-dashed border-border bg-muted/40 p-2.5 opacity-70"
        title="Autorize o acesso para ver este histórico"
      >
        <div className="absolute -left-[18px] flex h-4 w-4 items-center justify-center rounded-full bg-muted-foreground/40 ring-4 ring-card">
          <Lock className="h-2 w-2 text-card" />
        </div>
        <Lock className="h-3.5 w-3.5 text-muted-foreground" />
        <div className="flex-1 text-[10px] text-muted-foreground">
          <div className="font-medium">{ev.label}</div>
          <div className="text-[9px]">{ev.date} · acesso bloqueado</div>
        </div>
      </div>
    );
  }

  return (
    <button
      onClick={onClick}
      className={`relative flex w-full items-center gap-2.5 rounded-xl border bg-card p-2.5 text-left transition ${
        active ? "border-primary ring-1 ring-primary/30" : "border-border hover:border-primary/40"
      }`}
    >
      <div className="absolute -left-[18px] flex h-4 w-4 items-center justify-center rounded-full bg-primary ring-4 ring-card">
        <Icon className="h-2 w-2 text-primary-foreground" />
      </div>
      <div className="flex-1">
        <div className="flex items-center gap-1.5">
          <span className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground">{ev.date}</span>
          <span className={`rounded-full px-1.5 py-0.5 text-[8px] font-semibold ${statusTone}`}>{ev.status}</span>
        </div>
        <div className="mt-0.5 text-[11px] font-semibold leading-tight">{ev.label}</div>
        <div className="text-[9px] text-muted-foreground">{ev.source}</div>
      </div>
      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
    </button>
  );
}

function BiomarkerRow({ b }: { b: Biomarker }) {
  const fillPct = Math.min(100, Math.max(0, ((b.current - b.min) / (b.max - b.min)) * 100));
  const inRange = b.current >= b.min && b.current <= b.max;
  const barColor = inRange ? "bg-emerald-500" : b.status === "low" ? "bg-amber-500" : "bg-rose-500";
  const badge = inRange
    ? { label: "Normal", tone: "text-emerald-600", icon: CheckCircle2 }
    : b.status === "low"
    ? { label: "Baixo", tone: "text-amber-600", icon: TrendingDown }
    : { label: "Alto", tone: "text-rose-600", icon: TrendingDown };
  const Icon = badge.icon;

  return (
    <div className="rounded-lg border border-border bg-background p-2">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold">{b.name}</span>
        <span className="text-[11px] font-bold tabular-nums">{b.value}</span>
      </div>
      <div className="mt-0.5 flex items-center justify-between">
        <span className="text-[9px] text-muted-foreground">Ref: {b.ref}</span>
        <span className={`flex items-center gap-0.5 text-[9px] font-semibold ${badge.tone}`}>
          <Icon className="h-2.5 w-2.5" />
          {badge.label}
        </span>
      </div>
      <div className="relative mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
        <div className={`absolute inset-y-0 left-0 ${barColor}`} style={{ width: `${fillPct}%` }} />
      </div>
    </div>
  );
}

/* ============================================================
   TELA 3 · EXAMES
   ============================================================ */
const WEEK = ["D", "S", "T", "Q", "Q", "S", "S"];
const MONTHS = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"];
const MONTHS_LONG = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

function ExamsScreen({ exams, onComplete }: { exams: Exam[]; onComplete: (id: string) => void }) {
  const [filter, setFilter] = useState<"upcoming" | "done">("upcoming");
  const [monthIdx, setMonthIdx] = useState(6);
  const year = 2026;

  const upcomingCount = exams.filter((e) => e.status === "upcoming").length;
  const doneCount = exams.filter((e) => e.status === "done").length;
  const monthExams = exams.filter((e) => e.monthIdx === monthIdx && e.year === year);
  const markedDays = monthExams.map((e) => ({ day: e.day, status: e.status }));
  const filtered = exams.filter((e) => e.status === filter).sort((a, b) => (a.monthIdx - b.monthIdx) * 100 + (a.day - b.day));

  const firstDay = new Date(year, monthIdx, 1).getDay();
  const daysInMonth = new Date(year, monthIdx + 1, 0).getDate();
  const cells = Array.from({ length: 42 }, (_, i) => {
    const d = i - firstDay + 1;
    return d > 0 && d <= daysInMonth ? d : null;
  });
  const today = monthIdx === 6 ? 8 : -1;

  return (
    <div className="px-4 py-3 pb-6">
      <div className="flex items-center justify-between">
        <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          {MONTHS_LONG[monthIdx]} · {year}
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setMonthIdx((m) => Math.max(0, m - 1))} className="rounded-md border border-border bg-card px-1.5 py-0.5 text-[10px]">←</button>
          <span className="text-[10px] font-medium tabular-nums">{MONTHS[monthIdx]}</span>
          <button onClick={() => setMonthIdx((m) => Math.min(11, m + 1))} className="rounded-md border border-border bg-card px-1.5 py-0.5 text-[10px]">→</button>
        </div>
      </div>

      <div className="mt-2 rounded-2xl border border-border bg-card p-3">
        <div className="grid grid-cols-7 gap-1 text-center text-[9px] font-medium text-muted-foreground">
          {WEEK.map((d, i) => <span key={i}>{d}</span>)}
        </div>
        <div className="mt-1 grid grid-cols-7 gap-1">
          {cells.map((d, i) => {
            if (d === null) return <div key={i} className="h-8" />;
            const mark = markedDays.find((m) => m.day === d);
            const isToday = d === today;
            return (
              <div
                key={i}
                className={`relative flex h-8 items-center justify-center rounded-md text-[10px] ${
                  isToday
                    ? "bg-primary font-bold text-primary-foreground"
                    : mark?.status === "upcoming"
                    ? "bg-rose-100 font-semibold text-rose-700"
                    : mark?.status === "done"
                    ? "bg-emerald-100 font-semibold text-emerald-700"
                    : "text-foreground hover:bg-muted"
                }`}
              >
                {d}
                {mark && !isToday && (
                  <span className={`absolute bottom-0.5 h-1 w-1 rounded-full ${mark.status === "upcoming" ? "bg-rose-500" : "bg-emerald-500"}`} />
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-1.5 rounded-xl bg-muted p-1">
        <FilterPill active={filter === "upcoming"} onClick={() => setFilter("upcoming")} label="Próximos" count={upcomingCount} />
        <FilterPill active={filter === "done"} onClick={() => setFilter("done")} label="Concluídos" count={doneCount} />
      </div>

      <div className="mt-3 space-y-2">
        {filtered.length === 0 && (
          <div className="rounded-xl border border-dashed border-border p-4 text-center text-[11px] text-muted-foreground">
            Nenhum exame {filter === "upcoming" ? "próximo" : "concluído"} ainda.
          </div>
        )}
        {filtered.map((e) => (
          <div key={e.id} className="flex items-center gap-3 rounded-xl border border-border bg-card p-2.5">
            <div className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-lg bg-muted">
              <span className="text-base font-bold leading-none">{String(e.day).padStart(2, "0")}</span>
              <span className="text-[9px] font-medium text-muted-foreground">{e.month}</span>
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[11px] font-semibold">{e.title}</div>
              <div className="truncate text-[10px] text-muted-foreground">{e.lab}</div>
              {e.status === "done" && e.result && (
                <span className={`text-[9px] font-semibold ${e.resultTone}`}>{e.result}</span>
              )}
            </div>
            {e.status === "upcoming" ? (
              <button
                onClick={() => onComplete(e.id)}
                className="shrink-0 rounded-full border border-emerald-300 bg-emerald-50 px-2 py-1 text-[9px] font-semibold text-emerald-700 transition hover:bg-emerald-100"
              >
                Marcar como feito
              </button>
            ) : (
              <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-500" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function FilterPill({ active, onClick, label, count }: { active: boolean; onClick: () => void; label: string; count: number }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-[11px] font-medium transition ${
        active ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
      }`}
    >
      {label}
      <span className={`flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-bold tabular-nums ${active ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground"}`}>
        {count}
      </span>
    </button>
  );
}

/* ============================================================
   TELA 4 · REMÉDIOS
   ============================================================ */
function MedsScreen({ meds, onToggle }: { meds: Med[]; onToggle: (id: string) => void }) {
  const taken = meds.filter((m) => m.taken).length;
  const adherence = Math.round((taken / meds.length) * 100);

  return (
    <div className="px-4 py-3 pb-6">
      <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Hoje · seg, 08 jul</div>

      <div className="mt-2 rounded-2xl border border-border bg-card p-3">
        <div className="flex items-center gap-3">
          <div className="relative h-14 w-14">
            <svg viewBox="0 0 36 36" className="h-14 w-14 -rotate-90">
              <circle cx="18" cy="18" r="15" fill="none" stroke="currentColor" strokeWidth="3" className="text-muted" />
              <circle
                cx="18" cy="18" r="15" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"
                strokeDasharray={`${(adherence / 100) * 94.25} 94.25`}
                className="text-primary transition-all duration-500"
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center text-xs font-bold">{adherence}%</div>
          </div>
          <div className="flex-1">
            <div className="text-[10px] text-muted-foreground">Adesão de hoje</div>
            <div className="text-sm font-semibold">{taken} de {meds.length} tomados</div>
          </div>
        </div>
      </div>

      <div className="mt-3 text-[10px] font-semibold text-muted-foreground">Horários de hoje</div>
      <div className="mt-2 space-y-2">
        {meds.map((m) => (
          <div key={m.id} className={`flex items-start gap-3 rounded-xl border p-2.5 transition ${m.taken ? "border-emerald-200 bg-emerald-50/60" : "border-border bg-card"}`}>
            <div className="flex w-11 shrink-0 flex-col items-center">
              <div className="text-[8px] font-medium uppercase text-muted-foreground">{m.period}</div>
              <div className="mt-0.5 flex items-center gap-0.5 text-[11px] font-bold tabular-nums">
                <Clock className="h-2.5 w-2.5 text-muted-foreground" />
                {m.time}
              </div>
            </div>
            <div className="min-w-0 flex-1">
              <div className={`truncate text-[11px] font-semibold ${m.taken ? "line-through opacity-60" : ""}`}>{m.name}</div>
              <div className="text-[10px] text-muted-foreground">{m.dose}</div>
              <div className="mt-0.5 text-[9px] italic text-muted-foreground">{m.note}</div>
            </div>
            <button
              onClick={() => onToggle(m.id)}
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 transition ${m.taken ? "border-emerald-500 bg-emerald-500 text-white" : "border-muted-foreground/30 bg-background"}`}
              aria-label={m.taken ? "Desmarcar" : "Marcar tomado"}
            >
              {m.taken ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Circle className="h-3.5 w-3.5 text-transparent" />}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ============================================================
   TELA 5 · PERFIL
   ============================================================ */
function ProfileScreen() {
  const [tokenOpen, setTokenOpen] = useState(false);
  const [countdown] = useState("09:48");

  const personalData = useMemo(
    () => [
      { label: "Nome", value: "Mariana Silva", editable: false },
      { label: "Nascimento", value: "12/04/1987", editable: false },
      { label: "Sexo", value: "Feminino", editable: false },
      { label: "Tipo sanguíneo", value: "O+", editable: false },
      { label: "Peso atual", value: "64 kg", editable: true },
      { label: "Altura", value: "1,68 m", editable: true },
      { label: "Alergias", value: "Dipirona", editable: true },
    ],
    [],
  );

  const doctors = [
    { name: "Dra. Helena Souza", spec: "Endocrinologia", access: true },
    { name: "Dr. Marcos Lima", spec: "Clínica Geral", access: false },
  ];

  return (
    <div className="px-4 py-3 pb-6">
      {/* Personal */}
      <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Dados pessoais</div>
      <div className="mt-2 divide-y divide-border rounded-2xl border border-border bg-card">
        {personalData.map((d) => (
          <div key={d.label} className="flex items-center justify-between px-3 py-2">
            <div>
              <div className="text-[9px] text-muted-foreground">{d.label}</div>
              <div className="text-[11px] font-semibold">{d.value}</div>
            </div>
            {d.editable && (
              <button className="rounded p-1 text-muted-foreground hover:bg-muted" aria-label="Editar">
                <Pencil className="h-3 w-3" />
              </button>
            )}
          </div>
        ))}
      </div>

      {/* LifeLine ID */}
      <div className="mt-4 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">LifeLine ID</div>
      <div className="mt-2 rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/10 to-card p-3">
        <div className="flex items-center gap-1.5 text-[9px] text-muted-foreground">
          <ShieldCheck className="h-3 w-3 text-primary" /> Seu identificador único
        </div>
        <div className="mt-1 font-mono text-base font-bold tracking-wider">LFL · 7H2A · 9KB1</div>
        <button
          onClick={() => {
            setTokenOpen((v) => !v);
            if (!tokenOpen) toast.success("Token gerado · válido 10 min");
          }}
          className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-primary px-2.5 py-1.5 text-[10px] font-semibold text-primary-foreground"
        >
          <KeyRound className="h-3 w-3" />
          {tokenOpen ? "Ocultar token" : "Gerar token para médico"}
        </button>
        {tokenOpen && (
          <div className="mt-3 flex items-center gap-3 rounded-lg bg-card p-2.5 ring-1 ring-border">
            <div className="flex h-14 w-14 items-center justify-center rounded-md bg-background ring-1 ring-border">
              <QrCode className="h-10 w-10" />
            </div>
            <div className="flex-1">
              <div className="text-[8px] uppercase tracking-wider text-muted-foreground">Código</div>
              <div className="font-mono text-[11px] font-bold">LFL-8429-XQ7K</div>
              <div className="mt-0.5 inline-flex items-center gap-1 text-[9px] text-emerald-600">
                <Clock className="h-2.5 w-2.5" /> Expira em {countdown}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Doctors */}
      <div className="mt-4 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Médicos autorizados</div>
      <div className="mt-2 space-y-1.5">
        {doctors.map((d) => (
          <div key={d.name} className="flex items-center gap-2 rounded-xl border border-border bg-card p-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-[10px] font-bold">
              {d.name.split(" ").slice(-1)[0][0]}
            </div>
            <div className="flex-1 min-w-0">
              <div className="truncate text-[11px] font-semibold">{d.name}</div>
              <div className="text-[9px] text-muted-foreground">{d.spec}</div>
            </div>
            {d.access ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[9px] font-semibold text-emerald-700">
                <CheckCircle2 className="h-2.5 w-2.5" /> Ativo
              </span>
            ) : (
              <button className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[9px] font-semibold text-muted-foreground hover:bg-muted/80">
                <Lock className="h-2.5 w-2.5" /> Autorizar
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Privacy */}
      <div className="mt-4 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Privacidade</div>
      <div className="mt-2 divide-y divide-border rounded-2xl border border-border bg-card">
        <button className="flex w-full items-center justify-between px-3 py-2.5 text-left text-[11px] font-medium hover:bg-muted/40">
          <span className="flex items-center gap-2"><ShieldCheck className="h-3.5 w-3.5 text-muted-foreground" /> Seus dados</span>
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
        <button className="flex w-full items-center justify-between px-3 py-2.5 text-left text-[11px] font-medium hover:bg-muted/40">
          <span className="flex items-center gap-2"><Download className="h-3.5 w-3.5 text-muted-foreground" /> Exportar histórico (PDF)</span>
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
        <button className="flex w-full items-center justify-between px-3 py-2.5 text-left text-[11px] font-medium text-rose-600 hover:bg-rose-50">
          <span>Excluir conta</span>
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

/* ============================================================
   EXPLAIN CARD
   ============================================================ */
function ExplainCard({
  icon: Icon,
  tone,
  title,
  text,
}: {
  icon: React.ComponentType<{ className?: string }>;
  tone: "cyan" | "emerald" | "violet" | "amber";
  title: string;
  text: string;
}) {
  const tones: Record<string, string> = {
    cyan: "from-cyan-500 to-teal-500",
    emerald: "from-emerald-500 to-teal-500",
    violet: "from-violet-500 to-indigo-500",
    amber: "from-amber-500 to-orange-500",
  };
  return (
    <div className="flex gap-4 rounded-2xl border border-border bg-card p-5">
      <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${tones[tone]} text-white shadow`}>
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <div className="font-semibold">{title}</div>
        <p className="mt-1 text-sm text-muted-foreground">{text}</p>
      </div>
    </div>
  );
}
