import { useMemo, useState } from "react";
import {
  Activity,
  Award,
  Bell,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Circle,
  Clock,
  Droplet,
  FlaskConical,
  Flame,
  Footprints,
  Heart,
  Home,
  KeyRound,
  Moon,
  Pill,
  QrCode,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Star,
  Trophy,
  UserPlus,
  Zap,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { PageHeader } from "./whatsapp-simulator";

const HABITS = [
  { id: "water", label: "Hidratação", icon: Droplet, target: "2L", value: "1.4L", color: "text-cyan-500" },
  { id: "steps", label: "Passos", icon: Footprints, target: "8.000", value: "5.421", color: "text-emerald-500" },
  { id: "sleep", label: "Sono", icon: Moon, target: "7h", value: "6h20", color: "text-indigo-500" },
  { id: "hr", label: "Frequência cardíaca", icon: Heart, target: "60–100", value: "72 bpm", color: "text-rose-500" },
];

type Screen = "home" | "journey" | "exams" | "meds";

const SCREENS: { id: Screen; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "home", label: "Início", icon: Home },
  { id: "journey", label: "Jornada", icon: Trophy },
  { id: "exams", label: "Exames", icon: CalendarDays },
  { id: "meds", label: "Remédios", icon: Pill },
];

/* ---------------- Shared data ---------------- */
type Med = {
  id: string;
  name: string;
  dose: string;
  time: string;
  period: string;
  note: string;
  tone: string;
  taken: boolean;
  xp: number;
};

const INITIAL_MEDS: Med[] = [
  { id: "m1", name: "Sulfato Ferroso", dose: "40 mg · 1 cp", time: "07:00", period: "Manhã", note: "Em jejum, com suco de laranja", tone: "from-rose-400 to-pink-500", taken: true, xp: 20 },
  { id: "m2", name: "Vitamina B12", dose: "1000 mcg · 1 cp", time: "08:30", period: "Café da manhã", note: "Após café", tone: "from-amber-400 to-orange-500", taken: true, xp: 20 },
  { id: "m3", name: "Vitamina D3", dose: "2000 UI · 1 gota", time: "13:00", period: "Almoço", note: "Com refeição gordurosa", tone: "from-yellow-400 to-amber-500", taken: false, xp: 20 },
  { id: "m4", name: "Sulfato Ferroso", dose: "40 mg · 1 cp", time: "19:00", period: "Jantar", note: "2h após café/leite", tone: "from-rose-400 to-pink-500", taken: false, xp: 20 },
  { id: "m5", name: "Magnésio Dimalato", dose: "300 mg · 1 cp", time: "22:00", period: "Noite", note: "Antes de dormir", tone: "from-indigo-400 to-violet-500", taken: false, xp: 20 },
];

type ExamStatus = "upcoming" | "done";
type Exam = {
  id: string;
  day: number;
  month: string; // label
  monthIdx: number; // 0..11 for sorting
  year: number;
  title: string;
  lab: string;
  status: ExamStatus;
  tone: string;
  result?: string;
  resultTone?: string;
  xp: number;
};

const INITIAL_EXAMS: Exam[] = [
  // Done
  { id: "e0", day: 10, month: "MAR", monthIdx: 2, year: 2026, title: "Hemograma", lab: "Lab. Fleury", status: "done", tone: "bg-rose-100 text-rose-700", result: "Hb 11.2 ⚠", resultTone: "text-rose-600", xp: 80 },
  { id: "e1", day: 2, month: "ABR", monthIdx: 3, year: 2026, title: "Vitamina D", lab: "Lab. Sabin", status: "done", tone: "bg-amber-100 text-amber-700", result: "Baixa ⚠", resultTone: "text-amber-600", xp: 60 },
  { id: "e2", day: 15, month: "MAI", monthIdx: 4, year: 2026, title: "TSH + T4 livre", lab: "Lab. Fleury", status: "done", tone: "bg-emerald-100 text-emerald-700", result: "Normal", resultTone: "text-emerald-600", xp: 60 },
  // Upcoming
  { id: "e3", day: 12, month: "JUL", monthIdx: 6, year: 2026, title: "Hemograma completo", lab: "Lab. Fleury · 08:00", status: "upcoming", tone: "bg-rose-100 text-rose-700", xp: 120 },
  { id: "e4", day: 18, month: "JUL", monthIdx: 6, year: 2026, title: "Ferritina + B12 + Zinco", lab: "Lab. Sabin · 09:30", status: "upcoming", tone: "bg-cyan-100 text-cyan-700", xp: 150 },
  { id: "e5", day: 2, month: "AGO", monthIdx: 7, year: 2026, title: "Retorno Dra. Helena", lab: "Telemedicina · 14:00", status: "upcoming", tone: "bg-violet-100 text-violet-700", xp: 100 },
];

const HISTORY_QUESTS = [
  { id: "h1", year: "2023", title: "Check-up de rotina", xp: 120, icon: Star, tone: "from-emerald-400 to-teal-500" },
  { id: "h2", year: "2024", title: "Investigação fadiga", xp: 180, icon: FlaskConical, tone: "from-cyan-400 to-blue-500" },
  { id: "h3", year: "2025", title: "Reposição de ferro", xp: 240, icon: Flame, tone: "from-amber-400 to-orange-500" },
];
const HISTORY_XP = HISTORY_QUESTS.reduce((s, q) => s + q.xp, 0);

const LEVELS = [
  { level: 1, name: "Iniciante", at: 0 },
  { level: 2, name: "Atenta", at: 200 },
  { level: 3, name: "Cuidadora", at: 450 },
  { level: 4, name: "Guardiã", at: 700 },
  { level: 5, name: "Vigilante", at: 1000 },
  { level: 6, name: "Mestra", at: 1400 },
];

export function PatientAppMockup({ onRestart }: { onRestart: () => void }) {
  const [screen, setScreen] = useState<Screen>("home");
  const [meds, setMeds] = useState<Med[]>(INITIAL_MEDS);
  const [exams, setExams] = useState<Exam[]>(INITIAL_EXAMS);

  const medsXP = meds.filter((m) => m.taken).reduce((s, m) => s + m.xp, 0);
  const examsXP = exams.filter((e) => e.status === "done").reduce((s, e) => s + e.xp, 0);
  const totalXP = HISTORY_XP + medsXP + examsXP;

  const currentLevel = [...LEVELS].reverse().find((l) => totalXP >= l.at) ?? LEVELS[0];
  const nextLevel = LEVELS.find((l) => l.at > totalXP) ?? LEVELS[LEVELS.length - 1];

  const upcomingCount = exams.filter((e) => e.status === "upcoming").length;

  const toggleMed = (id: string) =>
    setMeds((arr) => {
      const target = arr.find((x) => x.id === id);
      if (target && !target.taken) {
        toast.success(`${target.name} registrado ✓`, {
          description: `+${target.xp} XP · adesão enviada à Dra. Helena`,
        });
      }
      return arr.map((x) => (x.id === id ? { ...x, taken: !x.taken } : x));
    });

  const completeExam = (id: string) =>
    setExams((arr) => {
      const target = arr.find((x) => x.id === id);
      if (target && target.status === "upcoming") {
        toast.success(`Exame "${target.title}" concluído`, {
          description: `+${target.xp} XP · adicionado à sua trilha`,
        });
      }
      return arr.map((x) =>
        x.id === id
          ? { ...x, status: "done" as ExamStatus, result: x.result ?? "Aguardando", resultTone: x.resultTone ?? "text-muted-foreground" }
          : x,
      );
    });

  return (
    <div className="mx-auto max-w-[1300px] p-6 lg:p-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <PageHeader
          eyebrow="Step D · Visão do paciente"
          title="O que Mariana vê no celular"
          desc="Navegue pelas 4 telas. Cada remédio confirmado e cada exame concluído alimenta a linha do tempo gamificada e o contador de próximos exames em tempo real."
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
              <div className="flex items-center justify-between bg-background px-5 pt-7 pb-2 text-[11px] font-medium">
                <span>14:32</span>
                <div className="flex items-center gap-1 text-muted-foreground">
                  <span>5G</span>
                  <span>100%</span>
                </div>
              </div>

              <div className="h-[640px] overflow-y-auto overscroll-contain [scrollbar-width:thin]">
                {screen === "home" && (
                  <HomeScreen
                    totalXP={totalXP}
                    levelName={currentLevel.name}
                    upcomingCount={upcomingCount}
                    onGoExams={() => setScreen("exams")}
                    onGoMeds={() => setScreen("meds")}
                  />
                )}
                {screen === "journey" && (
                  <JourneyScreen
                    totalXP={totalXP}
                    currentLevel={currentLevel}
                    nextLevel={nextLevel}
                    meds={meds}
                    exams={exams}
                  />
                )}
                {screen === "exams" && (
                  <ExamsScreen exams={exams} onComplete={completeExam} />
                )}
                {screen === "meds" && <MedsScreen meds={meds} onToggle={toggleMed} />}
              </div>

              <div className="flex items-center justify-around border-t border-border bg-card px-2 py-2">
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
            </div>
          </div>

          <div className="mt-4 flex items-center justify-center gap-1.5">
            {SCREENS.map((s) => (
              <button
                key={s.id}
                onClick={() => setScreen(s.id)}
                className={`h-1.5 rounded-full transition-all ${
                  screen === s.id ? "w-6 bg-primary" : "w-1.5 bg-muted-foreground/30"
                }`}
                aria-label={s.label}
              />
            ))}
          </div>
        </div>

        {/* Explanation */}
        <div className="space-y-4">
          <ExplainCard
            icon={ShieldCheck}
            tone="cyan"
            title="Identidade única e portátil"
            text="Cada paciente ganha um LifeLine ID criptografado. Médicos autorizados acessam o histórico completo sem precisar criar cadastro de novo."
          />
          <ExplainCard
            icon={Trophy}
            tone="amber"
            title="Jornada de saúde reativa"
            text={`Atualmente nível "${currentLevel.name}" com ${totalXP} XP. Cada exame ou medicação concluída alimenta a trilha e desbloqueia o próximo marco.`}
          />
          <ExplainCard
            icon={CalendarDays}
            tone="emerald"
            title={`${upcomingCount} exames próximos`}
            text="Calendário mensal com filtros entre próximos e concluídos. Marcar um exame como feito atualiza a XP, o histórico e remove do contador."
          />
          <ExplainCard
            icon={Pill}
            tone="violet"
            title="Adesão em tempo real"
            text="Cada dose confirmada vale +20 XP e dispara um sinal para o painel da Dra. Helena — visualizando adesão sem precisar perguntar."
          />

          <div className="rounded-2xl border border-primary/30 bg-primary/5 p-5">
            <div className="text-sm font-semibold">Fluxo concluído 🎉</div>
            <p className="mt-2 text-sm text-muted-foreground">
              Triagem no WhatsApp → Kanban → SOAP com ICP-Brasil → app do paciente vivo. Tente marcar um remédio ou concluir um exame e veja a Jornada subir.
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

/* ---------------- HOME ---------------- */
function HomeScreen({
  totalXP,
  levelName,
  upcomingCount,
  onGoExams,
  onGoMeds,
}: {
  totalXP: number;
  levelName: string;
  upcomingCount: number;
  onGoExams: () => void;
  onGoMeds: () => void;
}) {
  const [authorized, setAuthorized] = useState(false);
  const [done, setDone] = useState<string[]>(["water"]);
  const toggleHabit = (id: string) =>
    setDone((d) => (d.includes(id) ? d.filter((x) => x !== id) : [...d, id]));

  return (
    <div className="bg-gradient-to-b from-primary/10 to-background px-5 pb-6">
      <div className="flex items-center justify-between pt-1">
        <div>
          <div className="text-[11px] text-muted-foreground">Bem-vinda,</div>
          <div className="text-lg font-semibold">Mariana 🌿</div>
        </div>
        <div className="relative">
          <Bell className="h-5 w-5 text-muted-foreground" />
          <span className="absolute -right-1 -top-1 flex h-2 w-2 rounded-full bg-rose-500" />
        </div>
      </div>

      <div className="mt-5 rounded-2xl brand-gradient p-4 text-primary-foreground shadow-lg shadow-primary/30">
        <div className="flex items-center justify-between text-[11px] opacity-80">
          <span className="inline-flex items-center gap-1">
            <ShieldCheck className="h-3 w-3" /> LifeLine ID
          </span>
          <span>seguro</span>
        </div>
        <div className="mt-2 font-mono text-lg tracking-wider">LFL · 7H2A · 9KB1</div>
        <div className="mt-1 text-[10px] opacity-80">Seu identificador único — válido em qualquer médico LifeLine.</div>
      </div>

      {/* Quick stats */}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button onClick={onGoExams} className="flex items-center gap-2 rounded-xl border border-border bg-card p-2.5 text-left">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600">
            <CalendarDays className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-base font-bold leading-none">{upcomingCount}</div>
            <div className="text-[9px] text-muted-foreground">próximos exames</div>
          </div>
        </button>
        <button onClick={onGoMeds} className="flex items-center gap-2 rounded-xl border border-border bg-card p-2.5 text-left">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-100 text-amber-600">
            <Trophy className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-base font-bold leading-none">{totalXP}</div>
            <div className="truncate text-[9px] text-muted-foreground">XP · {levelName}</div>
          </div>
        </button>
      </div>

      <div className="mt-3 rounded-xl border border-border bg-card p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-100 text-cyan-600">
              <UserPlus className="h-4 w-4" />
            </div>
            <div>
              <div className="text-xs font-semibold">Autorizar novo médico</div>
              <div className="text-[10px] text-muted-foreground">
                {authorized ? "Token gerado · válido 10 min" : "Compartilhe via QR ou token"}
              </div>
            </div>
          </div>
          <Switch
            checked={authorized}
            onCheckedChange={(v) => {
              setAuthorized(v);
              if (v) toast.success("Token de autorização gerado", { description: "LFL-AUTH-8429-XQ" });
            }}
          />
        </div>
        {authorized && (
          <div className="mt-3 flex items-center gap-3 rounded-lg bg-muted/60 p-3 animate-fade-in">
            <div className="flex h-16 w-16 items-center justify-center rounded-md bg-card ring-1 ring-border">
              <QrCode className="h-12 w-12" />
            </div>
            <div className="flex-1">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Token</div>
              <div className="font-mono text-sm font-semibold">LFL-8429-XQ</div>
              <div className="mt-1 inline-flex items-center gap-1 text-[10px] text-emerald-600">
                <KeyRound className="h-2.5 w-2.5" /> Expira em 09:48
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="mt-3 rounded-xl border border-border bg-card p-3">
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" />
            <span className="text-xs font-semibold">Hábitos diários</span>
          </div>
          <span className="text-[10px] text-muted-foreground">
            {done.length}/{HABITS.length}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {HABITS.map((h) => {
            const isDone = done.includes(h.id);
            return (
              <button
                key={h.id}
                onClick={() => toggleHabit(h.id)}
                className={`rounded-lg border p-2 text-left transition ${
                  isDone ? "border-emerald-300 bg-emerald-50" : "border-border bg-background"
                }`}
              >
                <div className="flex items-center justify-between">
                  <h.icon className={`h-3.5 w-3.5 ${h.color}`} />
                  {isDone && <CheckCircle2 className="h-3 w-3 text-emerald-500" />}
                </div>
                <div className="mt-1.5 text-[10px] text-muted-foreground">{h.label}</div>
                <div className="text-[11px] font-semibold">
                  {h.value} <span className="text-muted-foreground font-normal">/ {h.target}</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ---------------- JOURNEY ---------------- */
function JourneyScreen({
  totalXP,
  currentLevel,
  nextLevel,
  meds,
  exams,
}: {
  totalXP: number;
  currentLevel: { level: number; name: string; at: number };
  nextLevel: { level: number; name: string; at: number };
  meds: Med[];
  exams: Exam[];
}) {
  const span = Math.max(1, nextLevel.at - currentLevel.at);
  const pct = Math.min(100, Math.max(0, ((totalXP - currentLevel.at) / span) * 100));

  // Build the dynamic trail: history + done exams + today's confirmed meds + pending exams
  const trail = useMemo(() => {
    const items: { id: string; label: string; sub: string; xp: number; done: boolean; icon: React.ComponentType<{ className?: string }>; tone: string }[] = [];

    HISTORY_QUESTS.forEach((h) =>
      items.push({ id: h.id, label: h.title, sub: h.year, xp: h.xp, done: true, icon: h.icon, tone: h.tone }),
    );

    exams.forEach((e) =>
      items.push({
        id: e.id,
        label: e.title,
        sub: `${e.day}/${e.month} · ${e.year}`,
        xp: e.xp,
        done: e.status === "done",
        icon: e.status === "done" ? Award : FlaskConical,
        tone: e.status === "done" ? "from-emerald-400 to-teal-500" : "from-slate-300 to-slate-400",
      }),
    );

    const takenMeds = meds.filter((m) => m.taken).length;
    if (takenMeds > 0) {
      items.push({
        id: "meds-today",
        label: `Medicação · ${takenMeds} dose${takenMeds > 1 ? "s" : ""} hoje`,
        sub: "Hoje",
        xp: takenMeds * 20,
        done: true,
        icon: Pill,
        tone: "from-violet-400 to-indigo-500",
      });
    }

    return items;
  }, [exams, meds]);

  const doneCount = trail.filter((t) => t.done).length;
  const streak = 12;

  return (
    <div className="bg-gradient-to-b from-amber-50 via-background to-background px-5 pb-6">
      <div className="pt-1">
        <div className="text-[11px] text-muted-foreground">Sua jornada de saúde</div>
        <div className="flex items-center gap-2">
          <Trophy className="h-5 w-5 text-amber-500" />
          <span className="text-lg font-semibold">
            Nível {currentLevel.level} · {currentLevel.name}
          </span>
        </div>
      </div>

      <div className="mt-3 rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-400 to-orange-500 p-4 text-white shadow-lg shadow-amber-500/30">
        <div className="flex items-center justify-between text-[11px] opacity-90">
          <span className="inline-flex items-center gap-1">
            <Sparkles className="h-3 w-3" /> XP total
          </span>
          <span>
            {totalXP} / {nextLevel.at}
          </span>
        </div>
        <div className="mt-2 text-2xl font-bold">{totalXP} XP</div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/20">
          <div className="h-full rounded-full bg-white transition-all duration-500" style={{ width: `${pct}%` }} />
        </div>
        <div className="mt-1.5 text-[10px] opacity-90">
          {totalXP >= nextLevel.at
            ? "Nível máximo desta temporada"
            : `Faltam ${nextLevel.at - totalXP} XP para ${nextLevel.name}`}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <Badge icon={Flame} value={String(streak)} label="dias seguidos" tone="text-orange-500" />
        <Badge icon={CheckCircle2} value={String(doneCount)} label="marcos concluídos" tone="text-emerald-500" />
        <Badge icon={Zap} value={String(meds.filter((m) => m.taken).length)} label="doses hoje" tone="text-violet-500" />
      </div>

      <div className="mt-4 text-xs font-semibold text-muted-foreground">Trilha de conquistas</div>
      <div className="relative mt-2">
        <div className="absolute left-[19px] top-2 bottom-2 w-0.5 bg-gradient-to-b from-emerald-300 via-amber-300 to-muted" />
        <div className="space-y-2.5">
          {trail.map((q) => (
            <div
              key={q.id}
              className={`relative flex items-center gap-3 rounded-xl border p-2.5 transition ${
                q.done ? "border-border bg-card" : "border-dashed border-muted-foreground/30 bg-muted/30 opacity-80"
              }`}
            >
              <div
                className={`relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${q.tone} text-white shadow-md ${
                  !q.done && "grayscale"
                }`}
              >
                <q.icon className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground">{q.sub}</span>
                  {q.done && <CheckCircle2 className="h-3 w-3 text-emerald-500" />}
                </div>
                <div className="truncate text-[11px] font-semibold">{q.label}</div>
              </div>
              <div
                className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold ${
                  q.done ? "bg-amber-100 text-amber-700" : "bg-muted text-muted-foreground"
                }`}
              >
                +{q.xp} XP
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Badge({
  icon: Icon,
  value,
  label,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  value: string;
  label: string;
  tone: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-2 text-center">
      <Icon className={`mx-auto h-4 w-4 ${tone}`} />
      <div className="mt-1 text-sm font-bold tabular-nums">{value}</div>
      <div className="text-[9px] leading-tight text-muted-foreground">{label}</div>
    </div>
  );
}

/* ---------------- EXAMS ---------------- */
const WEEK = ["D", "S", "T", "Q", "Q", "S", "S"];
const MONTHS = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"];
const MONTHS_LONG = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

function ExamsScreen({ exams, onComplete }: { exams: Exam[]; onComplete: (id: string) => void }) {
  const [filter, setFilter] = useState<"upcoming" | "done">("upcoming");
  const [monthIdx, setMonthIdx] = useState(6); // JUL
  const year = 2026;

  const upcomingCount = exams.filter((e) => e.status === "upcoming").length;
  const doneCount = exams.filter((e) => e.status === "done").length;

  const monthExams = exams.filter((e) => e.monthIdx === monthIdx && e.year === year);
  const markedDays = monthExams.map((e) => ({ day: e.day, status: e.status }));

  const filtered = exams
    .filter((e) => e.status === filter)
    .sort((a, b) => (a.monthIdx - b.monthIdx) * 100 + (a.day - b.day));

  // Build calendar grid: first weekday offset for the chosen month
  const firstDay = new Date(year, monthIdx, 1).getDay();
  const daysInMonth = new Date(year, monthIdx + 1, 0).getDate();
  const cells = Array.from({ length: 42 }, (_, i) => {
    const d = i - firstDay + 1;
    return d > 0 && d <= daysInMonth ? d : null;
  });
  const today = monthIdx === 6 ? 8 : -1;

  return (
    <div className="px-5 pb-6 pt-1">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[11px] text-muted-foreground">
            {MONTHS_LONG[monthIdx]} · {year}
          </div>
          <div className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-primary" />
            <span className="text-lg font-semibold">Meus exames</span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setMonthIdx((m) => Math.max(0, m - 1))}
            className="rounded-md border border-border bg-card px-1.5 py-1 text-[10px]"
          >
            ←
          </button>
          <span className="text-[10px] font-medium tabular-nums">{MONTHS[monthIdx]}</span>
          <button
            onClick={() => setMonthIdx((m) => Math.min(11, m + 1))}
            className="rounded-md border border-border bg-card px-1.5 py-1 text-[10px]"
          >
            →
          </button>
        </div>
      </div>

      {/* Calendar */}
      <div className="mt-3 rounded-2xl border border-border bg-card p-3">
        <div className="grid grid-cols-7 gap-1 text-center text-[9px] font-medium text-muted-foreground">
          {WEEK.map((d, i) => (
            <span key={i}>{d}</span>
          ))}
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
                  <span
                    className={`absolute bottom-0.5 h-1 w-1 rounded-full ${
                      mark.status === "upcoming" ? "bg-rose-500" : "bg-emerald-500"
                    }`}
                  />
                )}
              </div>
            );
          })}
        </div>
        <div className="mt-2 flex items-center gap-3 text-[9px] text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-rose-500" /> próximo
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> concluído
          </span>
        </div>
      </div>

      {/* Filters */}
      <div className="mt-3 grid grid-cols-2 gap-1.5 rounded-xl bg-muted p-1">
        <FilterPill
          active={filter === "upcoming"}
          onClick={() => setFilter("upcoming")}
          label="Próximos"
          count={upcomingCount}
        />
        <FilterPill
          active={filter === "done"}
          onClick={() => setFilter("done")}
          label="Concluídos"
          count={doneCount}
        />
      </div>

      {/* List */}
      <div className="mt-3 space-y-2">
        {filtered.length === 0 && (
          <div className="rounded-xl border border-dashed border-border p-4 text-center text-[11px] text-muted-foreground">
            Nenhum exame {filter === "upcoming" ? "próximo" : "concluído"} ainda.
          </div>
        )}
        {filtered.map((e) => (
          <div key={e.id} className="flex items-center gap-3 rounded-xl border border-border bg-card p-2.5">
            <div className={`flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-lg ${e.tone}`}>
              <span className="text-base font-bold leading-none">{String(e.day).padStart(2, "0")}</span>
              <span className="text-[9px] font-medium">{e.month}</span>
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[11px] font-semibold">{e.title}</div>
              <div className="truncate text-[10px] text-muted-foreground">{e.lab}</div>
              <div className="mt-0.5 flex items-center gap-1.5">
                <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[8px] font-bold text-amber-700">
                  +{e.xp} XP
                </span>
                {e.status === "done" && e.result && (
                  <span className={`text-[9px] font-semibold ${e.resultTone}`}>{e.result}</span>
                )}
              </div>
            </div>
            {e.status === "upcoming" ? (
              <button
                onClick={() => onComplete(e.id)}
                className="shrink-0 rounded-full border border-emerald-300 bg-emerald-50 px-2 py-1 text-[9px] font-semibold text-emerald-700 transition hover:bg-emerald-100"
              >
                Concluir
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
      <span
        className={`flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-bold tabular-nums ${
          active ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground"
        }`}
      >
        {count}
      </span>
    </button>
  );
}

/* ---------------- MEDS ---------------- */
function MedsScreen({ meds, onToggle }: { meds: Med[]; onToggle: (id: string) => void }) {
  const taken = meds.filter((m) => m.taken).length;
  const adherence = Math.round((taken / meds.length) * 100);

  return (
    <div className="bg-gradient-to-b from-violet-50 via-background to-background px-5 pb-6 pt-1">
      <div>
        <div className="text-[11px] text-muted-foreground">Hoje · seg, 08 jul</div>
        <div className="flex items-center gap-2">
          <Pill className="h-5 w-5 text-violet-500" />
          <span className="text-lg font-semibold">Meus remédios</span>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-4 rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-500 to-indigo-600 p-4 text-white shadow-lg shadow-violet-500/30">
        <div className="relative h-16 w-16">
          <svg viewBox="0 0 36 36" className="h-16 w-16 -rotate-90">
            <circle cx="18" cy="18" r="15" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="3" />
            <circle
              cx="18"
              cy="18"
              r="15"
              fill="none"
              stroke="white"
              strokeWidth="3"
              strokeLinecap="round"
              strokeDasharray={`${(adherence / 100) * 94.25} 94.25`}
              className="transition-all duration-500"
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center text-sm font-bold">{adherence}%</div>
        </div>
        <div className="flex-1">
          <div className="text-[11px] opacity-80">Adesão de hoje</div>
          <div className="text-base font-semibold">
            {taken} de {meds.length} tomados
          </div>
          <div className="mt-1 text-[10px] opacity-80">+{taken * 20} XP enviados à Jornada</div>
        </div>
      </div>

      <div className="mt-4 text-xs font-semibold text-muted-foreground">Horários de hoje</div>
      <div className="relative mt-2">
        <div className="absolute left-[27px] top-2 bottom-2 w-0.5 bg-border" />
        <div className="space-y-2">
          {meds.map((m) => (
            <div
              key={m.id}
              className={`relative flex items-start gap-3 rounded-xl border p-2.5 transition ${
                m.taken ? "border-emerald-200 bg-emerald-50/60" : "border-border bg-card"
              }`}
            >
              <div className="flex w-12 shrink-0 flex-col items-center">
                <div className="text-[9px] font-medium text-muted-foreground">{m.period}</div>
                <div className="mt-0.5 flex items-center gap-0.5 text-[11px] font-bold tabular-nums">
                  <Clock className="h-2.5 w-2.5 text-muted-foreground" />
                  {m.time}
                </div>
              </div>
              <div
                className={`relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${m.tone} text-white shadow ${
                  m.taken && "opacity-60"
                }`}
              >
                <Pill className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className={`truncate text-[11px] font-semibold ${m.taken && "line-through opacity-60"}`}>
                    {m.name}
                  </span>
                  <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[8px] font-bold text-amber-700">
                    +{m.xp}
                  </span>
                </div>
                <div className="text-[10px] text-muted-foreground">{m.dose}</div>
                <div className="mt-0.5 text-[9px] italic text-muted-foreground">{m.note}</div>
              </div>
              <button
                onClick={() => onToggle(m.id)}
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 transition ${
                  m.taken ? "border-emerald-500 bg-emerald-500 text-white" : "border-muted-foreground/30 bg-background"
                }`}
                aria-label={m.taken ? "Desmarcar" : "Marcar tomado"}
              >
                {m.taken ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Circle className="h-3.5 w-3.5 text-transparent" />}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

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
