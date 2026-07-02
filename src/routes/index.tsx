import { useState, type FormEvent } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  Activity,
  ArrowRight,
  CheckCheck,
  CheckCircle2,
  FileText,
  Lock,
  MessageSquare,
  Pill,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ImpactStatsSection } from "@/components/impact-stats";
import { Reveal } from "@/components/reveal";
import { SectionHeading } from "@/components/ui/section-heading";
import { ThemeToggle } from "@/components/theme-toggle";
import { submitLead } from "@/lib/api/leads.functions";

export const Route = createFileRoute("/")({
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Header />
      <Hero />
      <ProductShowcase />
      <ImpactStatsSection variant="compact" />
      <LeadForm />
      <Footer />
    </div>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} className="group relative transition hover:text-foreground">
      {children}
      <span className="absolute -bottom-1 left-0 h-0.5 w-0 rounded-full bg-primary transition-all duration-300 group-hover:w-full" />
    </a>
  );
}

function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
        <Link to="/" className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl brand-gradient shadow-lg shadow-primary/30">
            <Activity className="h-5 w-5 text-primary-foreground" strokeWidth={2.5} />
          </div>
          <span className="text-lg font-semibold tracking-tight">LifeLine</span>
        </Link>
        <nav className="hidden items-center gap-8 text-sm text-muted-foreground md:flex">
          <NavLink href="#features">Como funciona</NavLink>
          <NavLink href="#impact">Resultados</NavLink>
          <Link to="/sobre" className="group relative transition hover:text-foreground">
            Sobre
            <span className="absolute -bottom-1 left-0 h-0.5 w-0 rounded-full bg-primary transition-all duration-300 group-hover:w-full" />
          </Link>
          <NavLink href="#lead">Contato</NavLink>
        </nav>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Link to="/demo">
            <Button className="press brand-gradient text-primary-foreground shadow-md shadow-primary/30 transition hover:shadow-lg hover:shadow-primary/40 hover:opacity-95">
              Testar grátis
              <ArrowRight className="ml-1.5 h-4 w-4" />
            </Button>
          </Link>
        </div>
      </div>
    </header>
  );
}

/* ============================ HERO ============================ */
function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 -z-10">
        {/* soft top wash so the hero isn't flat white */}
        <div className="absolute inset-0 bg-gradient-to-b from-primary/[0.07] via-transparent to-transparent dark:from-primary/[0.05]" />
        {/* colored mesh — present in light, subtle in dark */}
        <div className="animate-aurora absolute -top-40 left-1/4 h-[480px] w-[680px] -translate-x-1/2 rounded-full bg-primary/30 blur-3xl dark:bg-primary/20" />
        <div className="animate-aurora-alt absolute -top-16 right-0 h-[420px] w-[420px] rounded-full bg-emerald-300/30 blur-3xl dark:bg-emerald-400/15" />
        <div className="animate-float absolute top-44 left-1/2 h-[320px] w-[320px] -translate-x-1/2 rounded-full bg-cyan-300/25 blur-3xl dark:bg-cyan-400/10" />
        <div className="absolute -bottom-10 right-1/4 h-[300px] w-[300px] rounded-full bg-violet-300/20 blur-3xl dark:bg-violet-400/10" />
        <div
          className="absolute inset-0 opacity-[0.04] dark:opacity-[0.05]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)",
            backgroundSize: "30px 30px",
          }}
        />
      </div>

      <div className="mx-auto max-w-7xl px-6 pt-14 pb-14 lg:pt-20 lg:pb-20">
        <div className="grid items-center gap-10 lg:grid-cols-[1.05fr_1fr]">
          <div className="animate-fade-in">
            <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-3 py-1 text-xs font-medium text-muted-foreground backdrop-blur">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
              </span>
              IA para consultórios e clínicas · LGPD + CFM
            </div>

            <h1 className="mt-5 text-[2rem] font-semibold leading-[1.05] tracking-tight md:text-5xl lg:text-[3.2rem]">
              O paciente chega triado.{" "}
              <span className="text-brand-gradient">O prontuário, quase pronto.</span>
            </h1>

            <p className="mt-4 max-w-xl text-base leading-relaxed text-muted-foreground md:text-lg">
              A LifeLine conversa com seu paciente pelo WhatsApp, lê os exames e
              organiza tudo antes da consulta. Você só revisa, atende e assina.
            </p>

            <div className="mt-6 flex flex-wrap items-center gap-4">
              <Link to="/demo">
                <Button
                  size="lg"
                  className="press brand-gradient text-primary-foreground shadow-lg shadow-primary/30 transition hover:-translate-y-0.5 hover:shadow-xl hover:shadow-primary/40 hover:opacity-95"
                >
                  Ver a demo interativa
                  <ArrowRight className="ml-1.5 h-4 w-4" />
                </Button>
              </Link>
              <a
                href="#lead"
                className="group inline-flex items-center gap-1.5 text-sm font-medium text-foreground/80 transition hover:text-foreground"
              >
                Falar com um especialista
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </a>
            </div>

            <div className="mt-7 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs font-medium text-muted-foreground">
              {["LGPD", "CFM", "Assinatura ICP-Brasil", "Memed integrada"].map((t) => (
                <span key={t} className="inline-flex items-center gap-1.5">
                  <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
                  {t}
                </span>
              ))}
            </div>
          </div>

          <HeroVisual />
        </div>
      </div>
    </section>
  );
}

function HeroVisual() {
  return (
    <div className="relative animate-scale-in">
      <div className="absolute -inset-6 -z-10 rounded-[2rem] brand-gradient opacity-15 blur-2xl" />

      <div className="rounded-3xl border border-border bg-card shadow-2xl shadow-primary/20 ring-1 ring-primary/5">
        <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-rose-400 to-pink-500 text-xs font-bold text-white">
              MS
            </div>
            <div>
              <div className="text-sm font-semibold leading-tight">Mariana Silva</div>
              <div className="text-[11px] text-muted-foreground">38 anos · consulta hoje 14h</div>
            </div>
          </div>
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
            <Sparkles className="h-2.5 w-2.5" />
            Pronto
          </span>
        </div>

        <div className="space-y-3.5 p-5">
          <div>
            <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Queixa principal
            </div>
            <div className="rounded-xl border border-border bg-background p-3">
              <p className="text-[13px] leading-snug text-foreground/90">
                Fadiga há 4 semanas + falta de ar ao subir escadas.
              </p>
              <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-cyan-100 px-2 py-0.5 text-[10px] font-medium text-cyan-800 dark:bg-cyan-500/15 dark:text-cyan-300">
                <CheckCheck className="h-3 w-3" /> coletado via WhatsApp
              </span>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-background p-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium text-muted-foreground">
                Hemoglobina · 4 anos
              </span>
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-600 dark:text-rose-300">
                11.2 g/dL ▾
              </span>
            </div>
            <svg viewBox="0 0 260 56" className="mt-2 w-full overflow-visible">
              <defs>
                <linearGradient id="hero-hb" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="oklch(0.65 0.2 25)" stopOpacity="0.25" />
                  <stop offset="100%" stopColor="oklch(0.65 0.2 25)" stopOpacity="0" />
                </linearGradient>
              </defs>
              <path d="M0 12 L86 23 L173 35 L260 46 L260 56 L0 56 Z" fill="url(#hero-hb)" />
              <path
                d="M0 12 L86 23 L173 35 L260 46"
                fill="none"
                stroke="oklch(0.65 0.2 25)"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {[
                [0, 12],
                [86, 23],
                [173, 35],
                [260, 46],
              ].map(([x, y]) => (
                <circle key={`${x}`} cx={x} cy={y} r="3.5" fill="oklch(0.65 0.2 25)" stroke="white" strokeWidth="1.5" />
              ))}
            </svg>
          </div>

          <div className="flex items-center justify-between rounded-xl brand-gradient px-4 py-2.5 text-primary-foreground">
            <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold">
              <Lock className="h-3.5 w-3.5" /> Selar prontuário
            </span>
            <span className="text-[11px] opacity-90">ICP-Brasil</span>
          </div>
        </div>
      </div>

      <div className="absolute -left-5 -top-5 hidden w-52 rounded-2xl border border-border bg-card p-3 shadow-xl md:block">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-500/15">
            <MessageSquare className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="text-[11px] font-semibold">Briefing gerado</div>
        </div>
        <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">
          Mariana respondeu e enviou 2 exames pelo WhatsApp.
        </p>
      </div>

      <div className="absolute -bottom-5 -right-4 hidden items-center gap-2 rounded-2xl border border-border bg-card px-3.5 py-2.5 shadow-xl md:flex">
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-indigo-500 text-white">
          <Pill className="h-3.5 w-3.5" />
        </div>
        <div>
          <div className="text-[11px] font-semibold leading-tight">Receita enviada</div>
          <div className="text-[10px] text-muted-foreground">via Memed</div>
        </div>
      </div>
    </div>
  );
}

/* ===================== PRODUCT SHOWCASE (tabbed) ===================== */
const ACTS = [
  {
    tab: "Antes",
    n: "01",
    kicker: "Antes da consulta",
    title: "A triagem acontece sozinha",
    desc: "A IA conversa com o paciente no WhatsApp, entende a queixa e lê os exames por OCR. Sem app e sem login para ele.",
    bullets: ["Briefing pronto quando você abre o painel", "Exames já anexados ao histórico"],
  },
  {
    tab: "Durante",
    n: "02",
    kicker: "Durante a consulta",
    title: "O prontuário se escreve com você",
    desc: "Abra o paciente e veja anos de evolução numa linha do tempo. O SOAP já vem preenchido com o que o WhatsApp coletou.",
    bullets: ["Curvas de exames lado a lado", "Você revisa, em vez de digitar"],
  },
  {
    tab: "Depois",
    n: "03",
    kicker: "Depois da consulta",
    title: "Receita e selo num clique",
    desc: "Prescreva pela Memed sem sair do prontuário e sele com assinatura ICP-Brasil. Validade legal e imutável.",
    bullets: ["Receita digital integrada", "Paciente acompanha tudo no app"],
  },
];

function ProductShowcase() {
  const [active, setActive] = useState(0);
  const a = ACTS[active];
  const visuals = [<WhatsappPreview />, <TimelinePreview />, <MemedPreview />];

  return (
    <section id="features" className="border-y border-border/60 bg-gradient-to-b from-primary/[0.05] via-muted/30 to-background py-16 dark:from-primary/[0.03]">
      <div className="mx-auto max-w-6xl px-6">
        <Reveal>
          <SectionHeading
            eyebrow="Como funciona"
            title="Metade do seu dia não é medicina."
            subtitle={'Do primeiro "oi" no WhatsApp à receita assinada — num fluxo só, sem trocar de aba.'}
          />
        </Reveal>

        {/* Tabs */}
        <div className="mx-auto mt-8 flex max-w-md gap-1.5 rounded-full border border-border bg-card p-1.5 shadow-sm">
          {ACTS.map((act, i) => (
            <button
              key={act.tab}
              onClick={() => setActive(i)}
              className={`press flex-1 rounded-full px-3 py-2 text-sm font-medium transition ${
                i === active
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <span className={i === active ? "opacity-70" : "text-primary"}>{act.n}</span>{" "}
              {act.tab}
            </button>
          ))}
        </div>

        {/* Panel */}
        <div className="mt-10 grid items-center gap-10 lg:grid-cols-2">
          <div key={`t-${active}`} className="animate-fade-in lg:order-1">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              {a.kicker}
            </div>
            <h3 className="mt-2 text-2xl font-semibold tracking-tight md:text-3xl">{a.title}</h3>
            <p className="mt-3 max-w-md text-[15px] leading-relaxed text-muted-foreground">
              {a.desc}
            </p>
            <ul className="mt-5 space-y-2.5">
              {a.bullets.map((b) => (
                <li key={b} className="flex items-start gap-2.5 text-sm font-medium">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                  {b}
                </li>
              ))}
            </ul>
            <Link to="/demo" className="mt-6 inline-flex">
              <Button className="press brand-gradient text-primary-foreground shadow-md shadow-primary/30 hover:opacity-95">
                Ver na demo
                <ArrowRight className="ml-1.5 h-4 w-4" />
              </Button>
            </Link>
          </div>

          <div key={`v-${active}`} className="relative animate-fade-in lg:order-2">
            <div className="absolute -inset-4 -z-10 rounded-[2rem] bg-gradient-to-br from-primary/10 to-emerald-500/5 opacity-70 blur-2xl" />
            {visuals[active]}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---- Showcase visuals (real product snippets) ---- */
function WhatsappPreview() {
  return (
    <div className="overflow-hidden rounded-3xl border border-border bg-card shadow-xl">
      <div className="flex items-center gap-2.5 bg-[#075E54] px-4 py-3 text-white">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-rose-400 to-pink-500 text-[11px] font-semibold">
          DH
        </div>
        <div className="flex-1">
          <div className="text-[13px] font-medium leading-tight">Dra. Helena · LifeLine</div>
          <div className="text-[10px] text-white/70">online · responde com IA</div>
        </div>
        <MessageSquare className="h-4 w-4 opacity-80" />
      </div>
      <div className="space-y-2 bg-[#e5ddd5] px-3 py-4 dark:bg-[#0b141a]">
        <ChatBubble bot>Como você está se sentindo nos últimos dias?</ChatBubble>
        <ChatBubble>Cansada, com falta de ar quando subo escada.</ChatBubble>
        <ChatBubble bot badge="Briefing gerado">
          Anotado! Queixa: fadiga + dispneia. Pode mandar o hemograma 👇
        </ChatBubble>
        <div className="flex justify-end">
          <div className="flex items-center gap-2 rounded-2xl rounded-tr-sm bg-[#dcf8c6] px-3 py-2 text-slate-800 shadow-sm dark:bg-emerald-900/40 dark:text-emerald-50">
            <FileText className="h-4 w-4 text-rose-500" />
            <span className="text-[12px] font-medium">hemograma_mar2026.pdf</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function ChatBubble({
  children,
  bot,
  badge,
}: {
  children: React.ReactNode;
  bot?: boolean;
  badge?: string;
}) {
  return (
    <div className={`flex ${bot ? "justify-start" : "justify-end"}`}>
      <div
        className={`max-w-[80%] rounded-2xl px-3 py-2 text-[12px] leading-snug shadow-sm ${
          bot
            ? "rounded-tl-sm bg-white text-slate-800 dark:bg-slate-800 dark:text-slate-100"
            : "rounded-tr-sm bg-[#dcf8c6] text-slate-800 dark:bg-emerald-900/40 dark:text-emerald-50"
        }`}
      >
        {badge && (
          <div className="mb-1 inline-flex items-center gap-1 rounded-full bg-cyan-100 px-2 py-0.5 text-[9px] font-medium text-cyan-800 dark:bg-cyan-500/20 dark:text-cyan-200">
            <Sparkles className="h-2.5 w-2.5" />
            {badge}
          </div>
        )}
        <div>{children}</div>
      </div>
    </div>
  );
}

function TimelinePreview() {
  const pts = [
    { y: 2023, hb: "13.4" },
    { y: 2024, hb: "12.6" },
    { y: 2025, hb: "11.9" },
    { y: 2026, hb: "11.2" },
  ];
  return (
    <div className="rounded-3xl border border-border bg-card p-5 shadow-xl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-rose-400 to-pink-500 text-xs font-bold text-white">
            MS
          </div>
          <div className="text-sm font-semibold">Mariana Silva</div>
        </div>
        <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-medium text-rose-700 dark:bg-rose-500/15 dark:text-rose-300">
          Anemia em investigação
        </span>
      </div>

      <div className="relative mt-6">
        <div className="absolute inset-x-3 top-3 h-0.5 bg-gradient-to-r from-emerald-300 via-cyan-300 to-rose-300" />
        <div className="relative grid grid-cols-4">
          {pts.map((p, i) => (
            <div key={p.y} className="flex flex-col items-center gap-1.5">
              <div
                className={`h-6 w-6 rounded-full ring-2 ring-card ${
                  i === pts.length - 1
                    ? "bg-gradient-to-br from-rose-400 to-orange-500"
                    : "bg-gradient-to-br from-emerald-400 to-emerald-600"
                }`}
              />
              <span className="text-[10px] font-bold">{p.y}</span>
              <span className="text-[10px] text-muted-foreground">{p.hb}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-5 rounded-xl border border-border bg-background p-3">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-gradient-to-br from-cyan-500 to-teal-500 text-[11px] font-bold text-white">
            S
          </span>
          <span className="text-[11px] font-semibold">Subjetivo</span>
          <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-cyan-100 px-2 py-0.5 text-[9px] font-medium text-cyan-800 dark:bg-cyan-500/15 dark:text-cyan-300">
            <CheckCheck className="h-2.5 w-2.5" /> via WhatsApp
          </span>
        </div>
        <p className="mt-2 text-[12px] leading-snug text-muted-foreground">
          Fadiga progressiva há 4 semanas, dispneia aos esforços. Hb 11.2 · Ferritina 18.
        </p>
      </div>
    </div>
  );
}

function MemedPreview() {
  const meds = [
    { name: "Sulfato Ferroso 40mg", dose: "1cp 2x/dia · 90 dias" },
    { name: "Vitamina B12 1000mcg", dose: "1cp/dia · 60 dias" },
    { name: "Colecalciferol 50.000UI", dose: "1cp/semana · 8 sem" },
  ];
  return (
    <div className="rounded-3xl border border-border bg-card p-5 shadow-xl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-indigo-500 text-white">
            <Pill className="h-4 w-4" />
          </div>
          <div>
            <div className="text-sm font-semibold">Receita digital</div>
            <div className="text-[11px] text-muted-foreground">Memed · nativo</div>
          </div>
        </div>
        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
          Integrado
        </span>
      </div>

      <div className="mt-4 space-y-2">
        {meds.map((m) => (
          <div
            key={m.name}
            className="flex items-center justify-between rounded-xl border border-border bg-background px-3 py-2.5"
          >
            <div>
              <div className="text-[12px] font-semibold">{m.name}</div>
              <div className="text-[10px] text-muted-foreground">{m.dose}</div>
            </div>
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          </div>
        ))}
      </div>

      <div className="mt-4 flex items-center justify-between rounded-xl bg-muted/60 px-4 py-3">
        <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold">
          <Lock className="h-3.5 w-3.5 text-primary" /> Prontuário selado
        </span>
        <span className="text-[10px] text-muted-foreground">Assinatura ICP-Brasil</span>
      </div>
    </div>
  );
}

/* ========================= LEAD FORM ========================= */
function maskPhoneBR(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : "";
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

function LeadForm() {
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ nome: "", email: "", whatsapp: "", especialidade: "" });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.nome || !form.email) {
      toast.error("Preencha pelo menos nome e e-mail.");
      return;
    }
    setLoading(true);
    try {
      await submitLead({ data: form });
      setForm({ nome: "", email: "", whatsapp: "", especialidade: "" });
      toast.success("Obrigado! Recebemos seu interesse.", {
        description: "Nossa equipe entrará em contato em até 1 dia útil com planos personalizados.",
        icon: <CheckCircle2 className="h-4 w-4" />,
        duration: 6000,
      });
    } catch {
      toast.error("Não consegui enviar agora. Tente novamente em instantes.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section id="lead" className="relative overflow-hidden border-t border-border/60 py-16">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-b from-muted/40 to-background" />
      <div className="mx-auto grid max-w-6xl gap-10 px-6 lg:grid-cols-[1fr_1.1fr]">
        <div>
          <div className="text-sm font-medium text-primary">Vamos conversar</div>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">
            Veja a LifeLine no seu consultório.
          </h2>
          <p className="mt-4 max-w-md text-muted-foreground">
            Em 15 minutos, uma especialista clínica mostra como a LifeLine se encaixa
            na sua rotina — de consultório solo a clínica com vários médicos — incluindo
            Memed, agenda e Google Calendar.
          </p>
          <ul className="mt-6 space-y-3 text-sm">
            {[
              "Demonstração 1:1 com caso real da sua especialidade",
              "Migração assistida do prontuário antigo",
              "Período de teste estendido (30 dias)",
            ].map((b) => (
              <li key={b} className="flex items-start gap-2.5">
                <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-500" />
                <span>{b}</span>
              </li>
            ))}
          </ul>
        </div>
        <form
          onSubmit={submit}
          className="rounded-2xl border border-border bg-card p-6 shadow-xl shadow-primary/5"
        >
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="nome">Nome completo</Label>
              <Input
                id="nome"
                placeholder="Dra. Ana Beatriz"
                value={form.nome}
                onChange={(e) => setForm({ ...form, nome: e.target.value })}
                maxLength={120}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">E-mail profissional</Label>
              <Input
                id="email"
                type="email"
                placeholder="ana@consultorio.com.br"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                maxLength={160}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="whatsapp">WhatsApp</Label>
                <Input
                  id="whatsapp"
                  type="tel"
                  inputMode="tel"
                  placeholder="(11) 99999-0000"
                  value={form.whatsapp}
                  onChange={(e) => setForm({ ...form, whatsapp: maskPhoneBR(e.target.value) })}
                  maxLength={16}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="esp">Especialidade médica</Label>
                <Select
                  value={form.especialidade}
                  onValueChange={(v) => setForm({ ...form, especialidade: v })}
                >
                  <SelectTrigger id="esp">
                    <SelectValue placeholder="Selecionar" />
                  </SelectTrigger>
                  <SelectContent>
                    {[
                      "Clínica Geral",
                      "Cardiologia",
                      "Endocrinologia",
                      "Pediatria",
                      "Ginecologia",
                      "Dermatologia",
                      "Psiquiatria",
                      "Outra",
                    ].map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button
              type="submit"
              size="lg"
              disabled={loading}
              className="w-full brand-gradient text-primary-foreground shadow-md hover:opacity-95"
            >
              {loading ? "Enviando..." : "Quero ver uma demonstração"}
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              Seus dados são protegidos. Não compartilhamos com terceiros.
            </p>
          </div>
        </form>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-border bg-muted/30 py-8">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-6 text-sm text-muted-foreground md:flex-row">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-md brand-gradient">
            <Activity className="h-3.5 w-3.5 text-primary-foreground" strokeWidth={2.5} />
          </div>
          <span>© {new Date().getFullYear()} LifeLine · Saúde inteligente para consultórios</span>
        </div>
        <div className="flex gap-6">
          <a href="#" className="hover:text-foreground">Privacidade</a>
          <a href="#" className="hover:text-foreground">Termos</a>
          <a href="#" className="hover:text-foreground">LGPD</a>
        </div>
      </div>
    </footer>
  );
}
