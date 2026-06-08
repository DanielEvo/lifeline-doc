import { useState, type FormEvent } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  Activity,
  ArrowRight,
  CheckCircle2,
  FileText,
  MessageSquare,
  Sparkles,
  Stethoscope,
  ShieldCheck,
  Workflow,
  Zap,
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

export const Route = createFileRoute("/")({
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Header />
      <Hero />
      <ValueGrid />
      <FlowStrip />
      <LeadForm />
      <Footer />
    </div>
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
          <a href="#features" className="transition hover:text-foreground">Features</a>
          <a href="#flow" className="transition hover:text-foreground">Como funciona</a>
          <a href="#pricing" className="transition hover:text-foreground">Pricing</a>
          <a href="#lead" className="transition hover:text-foreground">Contato</a>
        </nav>
        <Link to="/demo">
          <Button className="brand-gradient text-primary-foreground shadow-md shadow-primary/30 hover:opacity-95">
            Launch Free Demo
            <ArrowRight className="ml-1.5 h-4 w-4" />
          </Button>
        </Link>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-40 left-1/2 h-[500px] w-[800px] -translate-x-1/2 rounded-full bg-primary/20 blur-3xl" />
        <div className="absolute top-40 right-0 h-[400px] w-[400px] rounded-full bg-emerald-300/20 blur-3xl" />
      </div>
      <div className="mx-auto max-w-7xl px-6 pt-20 pb-24 lg:pt-28 lg:pb-32">
        <div className="grid items-center gap-12 lg:grid-cols-[1.1fr_1fr]">
          <div className="animate-fade-in">
            <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-3 py-1 text-xs font-medium text-muted-foreground backdrop-blur">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              Plataforma médica com IA · LGPD + CFM compliant
            </div>
            <h1 className="mt-6 text-4xl font-semibold leading-[1.05] tracking-tight md:text-5xl lg:text-6xl">
              Elimine o <span className="text-brand-gradient">trabalho administrativo invisível</span> do seu consultório.
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">
              O LifeLine é o primeiro ecossistema médico com triagem por IA via WhatsApp,
              Prontuário em Linha do Tempo e Kanban de Atendimento. Tudo integrado.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/demo">
                <Button size="lg" className="brand-gradient text-primary-foreground shadow-lg shadow-primary/30 hover:opacity-95">
                  Testar Demo Interativa
                  <ArrowRight className="ml-1.5 h-4 w-4" />
                </Button>
              </Link>
              <a href="#lead">
                <Button size="lg" variant="outline" className="border-border bg-card">
                  Receber Mais Informações
                </Button>
              </a>
            </div>
            <div className="mt-10 flex flex-wrap items-center gap-x-8 gap-y-3 text-sm text-muted-foreground">
              <Stat value="-72%" label="tempo em tarefas administrativas" />
              <Stat value="3,4x" label="exames recebidos antes da consulta" />
              <Stat value="100%" label="prontuários selados (ICP-Brasil)" />
            </div>
          </div>
          <HeroVisual />
        </div>
      </div>
    </section>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <div className="text-xl font-semibold text-foreground">{value}</div>
      <div className="text-xs">{label}</div>
    </div>
  );
}

function HeroVisual() {
  return (
    <div className="relative animate-scale-in">
      <div className="absolute -inset-4 -z-10 rounded-3xl brand-gradient opacity-20 blur-2xl" />
      <div className="rounded-3xl border border-border bg-card/80 p-3 shadow-2xl shadow-primary/10 backdrop-blur">
        {/* Mock dashboard preview */}
        <div className="rounded-2xl bg-gradient-to-br from-slate-900 to-slate-800 p-5 text-slate-100">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-2.5 w-2.5 rounded-full bg-rose-400" />
              <div className="h-2.5 w-2.5 rounded-full bg-amber-400" />
              <div className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
            </div>
            <span className="text-xs text-slate-400">LifeLine · Painel</span>
          </div>
          <div className="mt-5 grid grid-cols-4 gap-2">
            {["Triagem", "Atendimento", "Aguardando", "Recebidos"].map((c, i) => (
              <div key={c} className="rounded-lg bg-slate-700/40 p-2">
                <div className="text-[10px] text-slate-400">{c}</div>
                <div className="mt-2 space-y-1.5">
                  <div className="h-8 rounded bg-slate-600/40" />
                  {i === 0 && <div className="h-8 rounded bg-cyan-500/30 ring-1 ring-cyan-400/60" />}
                  {i === 3 && <div className="h-8 rounded bg-emerald-500/30" />}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 rounded-lg bg-slate-700/40 p-3">
            <div className="flex items-center justify-between text-[11px] text-slate-300">
              <span>Hemoglobina (g/dL) — 36 meses</span>
              <span className="text-emerald-400">▲ estável</span>
            </div>
            <svg viewBox="0 0 240 60" className="mt-2 w-full">
              <defs>
                <linearGradient id="hg" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="oklch(0.7 0.14 200)" stopOpacity="0.6" />
                  <stop offset="100%" stopColor="oklch(0.7 0.14 200)" stopOpacity="0" />
                </linearGradient>
              </defs>
              <path d="M0 40 L30 35 L60 42 L90 30 L120 33 L150 22 L180 26 L210 18 L240 22 L240 60 L0 60 Z" fill="url(#hg)" />
              <path d="M0 40 L30 35 L60 42 L90 30 L120 33 L150 22 L180 26 L210 18 L240 22" fill="none" stroke="oklch(0.7 0.14 200)" strokeWidth="2" />
            </svg>
          </div>
        </div>
      </div>
      <div className="absolute -bottom-6 -left-6 hidden rounded-2xl border border-border bg-card p-3 shadow-xl md:block">
        <div className="flex items-center gap-2 text-xs">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100">
            <MessageSquare className="h-4 w-4 text-emerald-600" />
          </div>
          <div>
            <div className="font-medium">Briefing pronto</div>
            <div className="text-muted-foreground">Mariana enviou 2 exames</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ValueGrid() {
  const items = [
    {
      icon: MessageSquare,
      tag: "WhatsApp + IA",
      title: "Triagem e Exames no WhatsApp",
      desc: "A IA conversa com o paciente antes da consulta, extrai queixas e organiza automaticamente o histórico laboratorial. Sem app, sem login, sem fricção.",
      tint: "from-emerald-400 to-teal-500",
    },
    {
      icon: FileText,
      tag: "Prontuário SOAP",
      title: "Visual Prontuário SOAP",
      desc: "Workspace clínico limpo que substitui as planilhas dos anos 2000 por uma linha do tempo elegante — como uma rede social do paciente.",
      tint: "from-cyan-400 to-sky-500",
    },
    {
      icon: ShieldCheck,
      tag: "API Memed",
      title: "API Memed Integrada",
      desc: "Prescrições digitais com certificado ICP-Brasil, incluso nativamente na assinatura. Imutabilidade legal com um clique.",
      tint: "from-violet-400 to-indigo-500",
    },
  ];
  return (
    <section id="features" className="border-y border-border/60 bg-muted/40 py-24">
      <div className="mx-auto max-w-7xl px-6">
        <div className="mx-auto max-w-2xl text-center">
          <div className="text-sm font-medium text-primary">A dor que resolvemos</div>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">
            Três horas administrativas por dia. Devolvemos para você.
          </h2>
          <p className="mt-4 text-muted-foreground">
            Cada peça do LifeLine foi desenhada para eliminar uma fricção real do dia clínico.
          </p>
        </div>
        <div className="mt-14 grid gap-6 md:grid-cols-3">
          {items.map((it) => (
            <div
              key={it.title}
              className="group relative overflow-hidden rounded-2xl border border-border bg-card p-7 shadow-sm transition hover:-translate-y-1 hover:shadow-xl hover:shadow-primary/10"
            >
              <div className={`mb-5 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br ${it.tint} shadow-lg`}>
                <it.icon className="h-6 w-6 text-white" strokeWidth={2.25} />
              </div>
              <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{it.tag}</div>
              <h3 className="mt-1 text-xl font-semibold">{it.title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{it.desc}</p>
              <div className="mt-6 flex items-center gap-1.5 text-sm font-medium text-primary opacity-0 transition group-hover:opacity-100">
                Ver no demo <ArrowRight className="h-3.5 w-3.5" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function FlowStrip() {
  const steps = [
    { icon: MessageSquare, label: "Paciente conversa no WhatsApp" },
    { icon: Zap, label: "IA extrai queixa + OCR de exames" },
    { icon: Workflow, label: "Card aparece no Kanban" },
    { icon: Stethoscope, label: "Médico atende com timeline completa" },
    { icon: ShieldCheck, label: "Prontuário selado · prescrição Memed" },
  ];
  return (
    <section id="flow" className="py-24">
      <div className="mx-auto max-w-7xl px-6">
        <div className="mx-auto max-w-2xl text-center">
          <div className="text-sm font-medium text-primary">Fluxo end-to-end</div>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">
            Da mensagem do paciente ao prontuário assinado — sem trocar de aba.
          </h2>
        </div>
        <div className="mt-12 grid gap-3 md:grid-cols-5">
          {steps.map((s, i) => (
            <div key={s.label} className="relative">
              <div className="flex h-full flex-col items-start gap-3 rounded-xl border border-border bg-card p-5">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <s.icon className="h-4.5 w-4.5" />
                </div>
                <div className="text-xs font-medium text-muted-foreground">Passo {i + 1}</div>
                <div className="text-sm font-medium leading-snug">{s.label}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function LeadForm() {
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ nome: "", email: "", whatsapp: "", especialidade: "" });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!form.nome || !form.email) {
      toast.error("Preencha pelo menos nome e e-mail.");
      return;
    }
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      setForm({ nome: "", email: "", whatsapp: "", especialidade: "" });
      toast.success("Obrigado! Recebemos seu interesse.", {
        description: "Nossa equipe entrará em contato em até 1 dia útil com planos personalizados.",
        icon: <CheckCircle2 className="h-4 w-4" />,
        duration: 6000,
      });
    }, 900);
  };

  return (
    <section id="lead" className="relative overflow-hidden py-24">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-b from-muted/40 to-background" />
      <div className="mx-auto grid max-w-6xl gap-12 px-6 lg:grid-cols-[1fr_1.1fr]">
        <div>
          <div className="text-sm font-medium text-primary">Vamos conversar</div>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">
            Receba materiais, planos e um onboarding guiado.
          </h2>
          <p className="mt-4 max-w-md text-muted-foreground">
            Em 15 minutos uma especialista clínica mostra como o LifeLine se encaixa
            no seu consultório atual — incluindo Memed, agenda e Google Calendar.
          </p>
          <ul className="mt-8 space-y-3 text-sm">
            {[
              "Demonstração 1:1 com caso real da sua especialidade",
              "Migração assistida de prontuário antigo",
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
          className="rounded-2xl border border-border bg-card p-7 shadow-xl shadow-primary/5"
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
                  placeholder="(11) 99999-0000"
                  value={form.whatsapp}
                  onChange={(e) => setForm({ ...form, whatsapp: e.target.value })}
                  maxLength={20}
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
              {loading ? "Enviando..." : "Quero Receber Mais Informações e Planos"}
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
    <footer className="border-t border-border bg-muted/30 py-10">
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
