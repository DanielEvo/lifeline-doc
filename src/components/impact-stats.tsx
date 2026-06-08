import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, ArrowRight, Brain, Database, HeartPulse } from "lucide-react";

export type ImpactStat = {
  value: number;
  suffix?: string;
  prefix?: string;
  decimals?: number;
  headline: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  tint: string;
  cta?: { label: string; to: string; search?: Record<string, string> };
};

export const IMPACT_STATS: ImpactStat[] = [
  {
    value: 60,
    suffix: "%",
    headline: "dos dados em saúde são desperdiçados",
    description: "Silos, papel e softwares que não conversam entre si. A informação existe — mas nunca chega na hora da decisão.",
    icon: Database,
    tint: "from-cyan-400 to-teal-500",
    cta: { label: "Ver a Linha do Tempo do LifeLine", to: "/demo", search: { tab: "timeline" } },
  },
  {
    value: 48,
    suffix: "%",
    headline: "dos hospitais compartilham dados — e nunca recebem de volta",
    description: "O paradoxo da informação: instituições enviam, poucas integram. O paciente vira mensageiro do próprio prontuário.",
    icon: HeartPulse,
    tint: "from-violet-400 to-indigo-500",
    cta: { label: "Ver o App do Paciente unificado", to: "/demo", search: { tab: "patient" } },
  },
  {
    value: 42,
    suffix: "%",
    headline: "dos médicos sofrem com Burnout administrativo",
    description: "O fenômeno do '1.2 FTE': jornadas extras invisíveis (pajama time) só para digitar papelada. Cuidar virou minoria do dia.",
    icon: Brain,
    tint: "from-emerald-400 to-teal-500",
    cta: { label: "Ver o Kanban que devolve tempo", to: "/demo", search: { tab: "kanban" } },
  },
  {
    value: 795000,
    headline: "vidas perdidas ou incapacitadas por ano por erros de diagnóstico",
    description: "A maioria evitável com cruzamento histórico de exames. Quando a linha do tempo está completa, o diagnóstico chega antes.",
    icon: AlertTriangle,
    tint: "from-rose-400 to-orange-500",
    cta: { label: "Simular triagem por IA no WhatsApp", to: "/demo", search: { tab: "whatsapp" } },
  },
];

function useCountUp(target: number, durationMs = 1600, start = false) {
  const [val, setVal] = useState(0);
  const startedRef = useRef(false);
  useEffect(() => {
    if (!start || startedRef.current) return;
    startedRef.current = true;
    const t0 = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / durationMs);
      const eased = 1 - Math.pow(1 - p, 3);
      setVal(target * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs, start]);
  return val;
}

function formatNumber(n: number, decimals = 0) {
  if (n >= 1000) {
    return Math.round(n).toLocaleString("pt-BR");
  }
  return n.toFixed(decimals);
}

function StatCard({ stat, inView }: { stat: ImpactStat; inView: boolean }) {
  const v = useCountUp(stat.value, 1800, inView);
  const Icon = stat.icon;
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] p-7 backdrop-blur transition hover:-translate-y-1 hover:border-white/20 hover:bg-white/[0.06]">
      <div className={`mb-5 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br ${stat.tint} shadow-lg`}>
        <Icon className="h-5 w-5 text-white" />
      </div>
      <div className="flex items-baseline gap-1">
        <span className="text-5xl font-semibold tracking-tight text-white tabular-nums md:text-6xl">
          {stat.prefix}
          {formatNumber(v, stat.decimals ?? 0)}
        </span>
        {stat.suffix && (
          <span className="text-3xl font-semibold text-white/70">{stat.suffix}</span>
        )}
      </div>
      <h3 className="mt-3 text-base font-medium leading-snug text-white/90">{stat.headline}</h3>
      <p className="mt-2.5 text-sm leading-relaxed text-white/55">{stat.description}</p>
      {stat.cta && (
        <Link
          to={stat.cta.to}
          search={stat.cta.search as never}
          className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-cyan-300 transition hover:text-cyan-200"
        >
          {stat.cta.label}
          <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
        </Link>
      )}
    </div>
  );
}

export function ImpactStatsSection({
  variant = "full",
  title = "A urgência por trás de cada consulta",
  eyebrow = "Por que LifeLine existe",
  subtitle = "Os dados do sistema de saúde global escancaram um colapso silencioso. O LifeLine foi desenhado para atacar cada um destes números.",
}: {
  variant?: "full" | "compact";
  title?: string;
  eyebrow?: string;
  subtitle?: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && setInView(true)),
      { threshold: 0.15 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <section
      ref={ref}
      className="relative overflow-hidden bg-slate-950 py-24 text-white"
    >
      <div className="pointer-events-none absolute inset-0 -z-0">
        <div className="absolute -top-32 left-1/4 h-[420px] w-[420px] rounded-full bg-cyan-500/15 blur-3xl" />
        <div className="absolute bottom-0 right-0 h-[380px] w-[380px] rounded-full bg-rose-500/10 blur-3xl" />
      </div>
      <div className="relative mx-auto max-w-7xl px-6">
        <div className="mx-auto max-w-2xl text-center">
          <div className="text-sm font-medium text-cyan-300">{eyebrow}</div>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">{title}</h2>
          {variant === "full" && (
            <p className="mt-4 text-white/60">{subtitle}</p>
          )}
        </div>
        <div className="mt-14 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
          {IMPACT_STATS.map((s) => (
            <StatCard key={s.headline} stat={s} inView={inView} />
          ))}
        </div>
      </div>
    </section>
  );
}
