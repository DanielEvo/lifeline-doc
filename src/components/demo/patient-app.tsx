import { useState } from "react";
import {
  Activity,
  Award,
  Bell,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
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

export function PatientAppMockup({ onRestart }: { onRestart: () => void }) {
  const [screen, setScreen] = useState<Screen>("home");

  return (
    <div className="mx-auto max-w-[1300px] p-6 lg:p-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <PageHeader
          eyebrow="Step D · Visão do paciente"
          title="O que Mariana vê no celular"
          desc="O LifeLine envia um link único e seguro. Navegue pelas telas: início, jornada gamificada, calendário de exames e lembretes de medicação."
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
              {/* status bar */}
              <div className="flex items-center justify-between bg-background px-5 pt-7 pb-2 text-[11px] font-medium">
                <span>14:32</span>
                <div className="flex items-center gap-1 text-muted-foreground">
                  <span>5G</span>
                  <span>100%</span>
                </div>
              </div>

              <div className="min-h-[640px]">
                {screen === "home" && <HomeScreen />}
                {screen === "journey" && <JourneyScreen />}
                {screen === "exams" && <ExamsScreen />}
                {screen === "meds" && <MedsScreen />}
              </div>

              {/* Bottom nav */}
              <div className="flex items-center justify-around border-t border-border bg-card px-2 py-2">
                {SCREENS.map((s) => {
                  const active = screen === s.id;
                  return (
                    <button
                      key={s.id}
                      onClick={() => setScreen(s.id)}
                      className={`flex flex-1 flex-col items-center gap-0.5 rounded-lg py-1.5 transition ${
                        active ? "text-primary" : "text-muted-foreground"
                      }`}
                    >
                      <s.icon className={`h-4 w-4 ${active ? "" : "opacity-70"}`} />
                      <span className="text-[9px] font-medium">{s.label}</span>
                      {active && <span className="h-0.5 w-6 rounded-full bg-primary" />}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Screen pager hint */}
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
            title="Jornada de saúde gamificada"
            text="Mariana vê sua evolução como uma trilha de conquistas. Cada exame em dia, cada hábito mantido, vira XP — transformando cuidado em hábito divertido."
          />
          <ExplainCard
            icon={CalendarDays}
            tone="emerald"
            title="Calendário de exames inteligente"
            text="A paciente vê histórico e próximos exames agendados pelo médico. Lembretes automáticos via WhatsApp e push reduzem o no-show em até 60%."
          />
          <ExplainCard
            icon={Pill}
            tone="violet"
            title="Medicação no horário certo"
            text="Cada remédio aparece com horário, dose e instruções. Mariana confirma com 1 toque — o médico vê adesão em tempo real no Kanban."
          />

          <div className="rounded-2xl border border-primary/30 bg-primary/5 p-5">
            <div className="text-sm font-semibold">Fluxo concluído 🎉</div>
            <p className="mt-2 text-sm text-muted-foreground">
              Você passou pela triagem no WhatsApp, viu o Kanban se atualizar, registrou um prontuário SOAP
              selado com ICP-Brasil e explorou as 4 telas do app do paciente. Quer refazer?
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
function HomeScreen() {
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
        <div className="mt-1 text-[10px] opacity-80">
          Seu identificador único — válido em qualquer médico LifeLine.
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-border bg-card p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-100 text-violet-600">
              <Pill className="h-4 w-4" />
            </div>
            <div>
              <div className="text-xs font-semibold">Prescrição ativa</div>
              <div className="text-[10px] text-muted-foreground">Memed · até Jun/2025</div>
            </div>
          </div>
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[9px] font-medium text-emerald-700">
            3 itens
          </span>
        </div>
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

/* ---------------- JOURNEY (gamified) ---------------- */
const QUESTS = [
  { year: "2023", title: "Check-up de rotina", xp: 120, done: true, icon: Star, tone: "from-emerald-400 to-teal-500" },
  { year: "2024", title: "Investigação fadiga", xp: 180, done: true, icon: FlaskConical, tone: "from-cyan-400 to-blue-500" },
  { year: "2025", title: "Reposição de ferro", xp: 240, done: true, icon: Flame, tone: "from-amber-400 to-orange-500" },
  { year: "2026", title: "Hemograma de controle", xp: 300, done: false, icon: Trophy, tone: "from-violet-400 to-fuchsia-500" },
  { year: "2026", title: "Conquista: B12 normalizada", xp: 150, done: false, icon: Award, tone: "from-slate-300 to-slate-400" },
];

function JourneyScreen() {
  const totalXP = QUESTS.filter((q) => q.done).reduce((a, q) => a + q.xp, 0);
  const nextLevel = 800;
  const pct = Math.min(100, (totalXP / nextLevel) * 100);

  return (
    <div className="bg-gradient-to-b from-amber-50 via-background to-background px-5 pb-6">
      <div className="pt-1">
        <div className="text-[11px] text-muted-foreground">Sua jornada de saúde</div>
        <div className="flex items-center gap-2">
          <Trophy className="h-5 w-5 text-amber-500" />
          <span className="text-lg font-semibold">Nível 4 · Guardiã</span>
        </div>
      </div>

      <div className="mt-3 rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-400 to-orange-500 p-4 text-white shadow-lg shadow-amber-500/30">
        <div className="flex items-center justify-between text-[11px] opacity-90">
          <span className="inline-flex items-center gap-1">
            <Sparkles className="h-3 w-3" /> XP total
          </span>
          <span>{totalXP} / {nextLevel}</span>
        </div>
        <div className="mt-2 text-2xl font-bold">{totalXP} XP</div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/20">
          <div className="h-full rounded-full bg-white" style={{ width: `${pct}%` }} />
        </div>
        <div className="mt-1.5 text-[10px] opacity-90">
          Faltam {nextLevel - totalXP} XP para o nível 5 · Vigilante
        </div>
      </div>

      {/* Streak */}
      <div className="mt-3 grid grid-cols-3 gap-2">
        <Badge icon={Flame} value="12" label="dias seguidos" tone="text-orange-500" />
        <Badge icon={CheckCircle2} value="08" label="exames em dia" tone="text-emerald-500" />
        <Badge icon={Zap} value="24" label="conquistas" tone="text-violet-500" />
      </div>

      {/* Quest trail */}
      <div className="mt-4 text-xs font-semibold text-muted-foreground">
        Trilha de conquistas
      </div>
      <div className="relative mt-2">
        <div className="absolute left-[19px] top-2 bottom-2 w-0.5 bg-gradient-to-b from-emerald-300 via-amber-300 to-muted" />
        <div className="space-y-2.5">
          {QUESTS.map((q, i) => (
            <div
              key={i}
              className={`relative flex items-center gap-3 rounded-xl border p-2.5 transition ${
                q.done
                  ? "border-border bg-card"
                  : "border-dashed border-muted-foreground/30 bg-muted/30 opacity-80"
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
                  <span className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground">
                    {q.year}
                  </span>
                  {q.done && <CheckCircle2 className="h-3 w-3 text-emerald-500" />}
                </div>
                <div className="truncate text-[11px] font-semibold">{q.title}</div>
              </div>
              <div className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold ${
                q.done ? "bg-amber-100 text-amber-700" : "bg-muted text-muted-foreground"
              }`}>
                +{q.xp} XP
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Badge({ icon: Icon, value, label, tone }: { icon: React.ComponentType<{ className?: string }>; value: string; label: string; tone: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-2 text-center">
      <Icon className={`mx-auto h-4 w-4 ${tone}`} />
      <div className="mt-1 text-sm font-bold">{value}</div>
      <div className="text-[9px] leading-tight text-muted-foreground">{label}</div>
    </div>
  );
}

/* ---------------- EXAMS ---------------- */
const UPCOMING = [
  { date: "12", month: "JUL", title: "Hemograma completo", lab: "Lab. Fleury · 08:00", tone: "bg-rose-100 text-rose-700", status: "Agendado" },
  { date: "18", month: "JUL", title: "Ferritina + B12 + Zinco", lab: "Lab. Sabin · 09:30", tone: "bg-cyan-100 text-cyan-700", status: "Jejum 8h" },
  { date: "02", month: "AGO", title: "Retorno Dra. Helena", lab: "Telemedicina · 14:00", tone: "bg-violet-100 text-violet-700", status: "Online" },
];

const HISTORY = [
  { date: "15/Mai", title: "TSH + T4 livre", result: "Normal", tone: "text-emerald-600" },
  { date: "02/Abr", title: "Vitamina D", result: "Baixa ⚠", tone: "text-amber-600" },
  { date: "10/Mar", title: "Hemograma", result: "Hb 11.2 ⚠", tone: "text-rose-600" },
];

const WEEK = ["D", "S", "T", "Q", "Q", "S", "S"];
const DAYS = Array.from({ length: 35 }, (_, i) => i - 2);
const MARKED = [12, 18];
const TODAY = 8;

function ExamsScreen() {
  return (
    <div className="px-5 pb-6 pt-1">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[11px] text-muted-foreground">Julho · 2026</div>
          <div className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-primary" />
            <span className="text-lg font-semibold">Meus exames</span>
          </div>
        </div>
        <button className="rounded-full bg-primary px-3 py-1.5 text-[10px] font-medium text-primary-foreground">
          + Agendar
        </button>
      </div>

      {/* Mini calendar */}
      <div className="mt-3 rounded-2xl border border-border bg-card p-3">
        <div className="grid grid-cols-7 gap-1 text-center text-[9px] font-medium text-muted-foreground">
          {WEEK.map((d, i) => (
            <span key={i}>{d}</span>
          ))}
        </div>
        <div className="mt-1 grid grid-cols-7 gap-1">
          {DAYS.map((d, i) => {
            const valid = d > 0 && d <= 31;
            const isToday = d === TODAY;
            const isMarked = MARKED.includes(d);
            return (
              <div
                key={i}
                className={`relative flex h-8 items-center justify-center rounded-md text-[10px] ${
                  !valid
                    ? "text-muted-foreground/30"
                    : isToday
                    ? "bg-primary font-bold text-primary-foreground"
                    : isMarked
                    ? "bg-rose-100 font-semibold text-rose-700"
                    : "text-foreground hover:bg-muted"
                }`}
              >
                {valid ? d : ""}
                {isMarked && !isToday && (
                  <span className="absolute bottom-0.5 h-1 w-1 rounded-full bg-rose-500" />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Upcoming */}
      <div className="mt-4 text-xs font-semibold text-muted-foreground">
        Próximos exames
      </div>
      <div className="mt-2 space-y-2">
        {UPCOMING.map((u, i) => (
          <button
            key={i}
            className="flex w-full items-center gap-3 rounded-xl border border-border bg-card p-2.5 text-left transition hover:border-primary/40"
          >
            <div className={`flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-lg ${u.tone}`}>
              <span className="text-base font-bold leading-none">{u.date}</span>
              <span className="text-[9px] font-medium">{u.month}</span>
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[11px] font-semibold">{u.title}</div>
              <div className="truncate text-[10px] text-muted-foreground">{u.lab}</div>
              <span className="mt-0.5 inline-block rounded-full bg-muted px-1.5 py-0.5 text-[8px] font-medium text-muted-foreground">
                {u.status}
              </span>
            </div>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          </button>
        ))}
      </div>

      {/* History */}
      <div className="mt-4 text-xs font-semibold text-muted-foreground">
        Histórico recente
      </div>
      <div className="mt-2 space-y-1.5">
        {HISTORY.map((h, i) => (
          <div key={i} className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2">
            <div>
              <div className="text-[11px] font-medium">{h.title}</div>
              <div className="text-[9px] text-muted-foreground">{h.date}</div>
            </div>
            <span className={`text-[10px] font-semibold ${h.tone}`}>{h.result}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------- MEDS ---------------- */
type Med = { id: string; name: string; dose: string; time: string; period: string; note: string; tone: string; taken: boolean };

const INITIAL_MEDS: Med[] = [
  { id: "m1", name: "Sulfato Ferroso", dose: "40 mg · 1 cp", time: "07:00", period: "Manhã", note: "Em jejum, com suco de laranja", tone: "from-rose-400 to-pink-500", taken: true },
  { id: "m2", name: "Vitamina B12", dose: "1000 mcg · 1 cp", time: "08:30", period: "Café da manhã", note: "Após café", tone: "from-amber-400 to-orange-500", taken: true },
  { id: "m3", name: "Vitamina D3", dose: "2000 UI · 1 gota", time: "13:00", period: "Almoço", note: "Com refeição gordurosa", tone: "from-yellow-400 to-amber-500", taken: false },
  { id: "m4", name: "Sulfato Ferroso", dose: "40 mg · 1 cp", time: "19:00", period: "Jantar", note: "2h após café/leite", tone: "from-rose-400 to-pink-500", taken: false },
  { id: "m5", name: "Magnésio Dimalato", dose: "300 mg · 1 cp", time: "22:00", period: "Noite", note: "Antes de dormir", tone: "from-indigo-400 to-violet-500", taken: false },
];

function MedsScreen() {
  const [meds, setMeds] = useState<Med[]>(INITIAL_MEDS);
  const toggle = (id: string) => {
    setMeds((m) => m.map((x) => (x.id === id ? { ...x, taken: !x.taken } : x)));
    const med = meds.find((x) => x.id === id);
    if (med && !med.taken) toast.success(`${med.name} registrado ✓`, { description: "Adesão enviada à Dra. Helena" });
  };
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

      {/* Adherence ring */}
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
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center text-sm font-bold">
            {adherence}%
          </div>
        </div>
        <div className="flex-1">
          <div className="text-[11px] opacity-80">Adesão de hoje</div>
          <div className="text-base font-semibold">{taken} de {meds.length} tomados</div>
          <div className="mt-1 text-[10px] opacity-80">Sua médica acompanha em tempo real</div>
        </div>
      </div>

      {/* Timeline */}
      <div className="mt-4 text-xs font-semibold text-muted-foreground">
        Horários de hoje
      </div>
      <div className="relative mt-2">
        <div className="absolute left-[27px] top-2 bottom-2 w-0.5 bg-border" />
        <div className="space-y-2">
          {meds.map((m) => (
            <div
              key={m.id}
              className={`relative flex items-start gap-3 rounded-xl border p-2.5 transition ${
                m.taken
                  ? "border-emerald-200 bg-emerald-50/60"
                  : "border-border bg-card"
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
                </div>
                <div className="text-[10px] text-muted-foreground">{m.dose}</div>
                <div className="mt-0.5 text-[9px] italic text-muted-foreground">{m.note}</div>
              </div>
              <button
                onClick={() => toggle(m.id)}
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 transition ${
                  m.taken
                    ? "border-emerald-500 bg-emerald-500 text-white"
                    : "border-muted-foreground/30 bg-background"
                }`}
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
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
