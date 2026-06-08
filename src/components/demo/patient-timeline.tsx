import { useState } from "react";
import {
  Activity,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  FileText,
  Lock,
  Pill,
  Search,
  Stethoscope,
  TrendingDown,
} from "lucide-react";
import { toast } from "sonner";
import {
  Area,
  AreaChart,
  CartesianGrid,
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

const HEMOGLOBIN = [
  { date: "Out 22", value: 13.2 },
  { date: "Mar 23", value: 12.9 },
  { date: "Set 23", value: 12.6 },
  { date: "Mar 24", value: 12.1 },
  { date: "Out 24", value: 11.8 },
  { date: "Mar 25", value: 11.2 },
];

const TIMELINE = [
  { date: "Out 2024", title: "Consulta de retorno", tag: "Consulta", text: "Sem queixas. Hb 11.8. Sugerida suplementação." },
  { date: "Mar 2024", title: "Exame de sangue", tag: "Exame", text: "Hemograma completo + ferro. Hb 12.1 g/dL." },
  { date: "Set 2023", title: "Consulta inicial", tag: "Consulta", text: "Triagem cardiológica de rotina." },
  { date: "Out 2022", title: "Check-up anual", tag: "Exame", text: "Painel metabólico completo. Hb 13.2 g/dL." },
];

const MED_OPTIONS = [
  { name: "Sulfato Ferroso 40mg", desc: "1cp 2x/dia · 90 dias" },
  { name: "Vitamina B12 1000mcg", desc: "1cp/dia · 60 dias" },
  { name: "Ácido Fólico 5mg", desc: "1cp/dia · 60 dias" },
];

export function PatientTimelineSOAP({ onSeal }: { onSeal: () => void }) {
  const { subjective, setSubjective, sealed, setSealed } = useDemo();
  const [objetivo, setObjetivo] = useState({ pa: "118/76", peso: "62", fc: "82" });
  const [diag, setDiag] = useState("");
  const [plano, setPlano] = useState("");
  const [medSearch, setMedSearch] = useState("");
  const [selectedMeds, setSelectedMeds] = useState<string[]>([]);

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
        title="Linha do Tempo & Prontuário SOAP"
        desc="Tudo o que aconteceu com Mariana em um único feed cronológico, com gráficos vivos dos parâmetros laboratoriais."
      />

      <div className="mt-8 grid gap-6 lg:grid-cols-[440px_1fr]">
        {/* Timeline */}
        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-rose-400 to-pink-500 text-white font-semibold">
              MS
            </div>
            <div>
              <div className="font-semibold">Mariana Silva</div>
              <div className="text-xs text-muted-foreground">38 anos · F · Convênio Particular</div>
            </div>
          </div>

          {/* Chart */}
          <div className="mt-5 rounded-xl border border-border bg-muted/40 p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  Evolução temporal
                </div>
                <div className="text-sm font-semibold">Hemoglobina (g/dL) · 36 meses</div>
              </div>
              <div className="flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-medium text-rose-700">
                <TrendingDown className="h-3 w-3" />
                -2.0 g/dL
              </div>
            </div>
            <div className="mt-3 h-40">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={HEMOGLOBIN} margin={{ top: 5, right: 5, bottom: 0, left: -20 }}>
                  <defs>
                    <linearGradient id="hb" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="0%" stopColor="oklch(0.62 0.12 200)" stopOpacity={0.5} />
                      <stop offset="100%" stopColor="oklch(0.62 0.12 200)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="oklch(0.92 0.01 240)" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="oklch(0.5 0.02 250)" />
                  <YAxis tick={{ fontSize: 10 }} stroke="oklch(0.5 0.02 250)" domain={[10, 14]} />
                  <Tooltip
                    contentStyle={{
                      borderRadius: 8,
                      border: "1px solid oklch(0.92 0.01 240)",
                      fontSize: 12,
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="value"
                    stroke="oklch(0.55 0.14 200)"
                    strokeWidth={2}
                    fill="url(#hb)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-2 text-[11px] text-muted-foreground">
              Referência feminino adulto: 12 – 16 g/dL
            </div>
          </div>

          {/* Events */}
          <div className="mt-6">
            <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Histórico
            </div>
            <div className="relative mt-3 space-y-4 border-l border-border pl-5">
              <TimelineItem
                date="Agora"
                title="Briefing WhatsApp + 2 exames"
                tag="IA"
                text="Queixa: fadiga + dispneia. Hb 11.2, Ferritina 18."
                live
              />
              {TIMELINE.map((t) => (
                <TimelineItem key={t.title} {...t} />
              ))}
            </div>
          </div>
        </div>

        {/* SOAP */}
        <div className="space-y-4">
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
              rows={2}
              placeholder="Hipótese diagnóstica (ex.: anemia ferropriva CID D50.9)"
              maxLength={500}
              className="resize-none"
            />
          </SoapBlock>

          <SoapBlock letter="P" name="Plano + Prescrição Memed" icon={Pill} tone="violet">
            <Textarea
              value={plano}
              onChange={(e) => setPlano(e.target.value)}
              rows={2}
              placeholder="Conduta clínica e orientações"
              maxLength={500}
              className="resize-none"
            />

            <div className="mt-4 rounded-xl border border-violet-200 bg-violet-50/60 p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-md bg-gradient-to-br from-violet-500 to-indigo-500 text-white">
                    <Pill className="h-3.5 w-3.5" />
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
                      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
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
          </SoapBlock>

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

function TimelineItem({
  date,
  title,
  tag,
  text,
  live,
}: {
  date: string;
  title: string;
  tag: string;
  text: string;
  live?: boolean;
}) {
  return (
    <div className="relative">
      <div
        className={`absolute -left-[27px] flex h-4 w-4 items-center justify-center rounded-full ring-4 ring-card ${
          live ? "bg-primary animate-pulse" : "bg-muted-foreground/40"
        }`}
      />
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs font-semibold">{title}</div>
        <span
          className={`rounded-full px-1.5 py-0.5 text-[9px] font-medium ${
            tag === "IA"
              ? "bg-cyan-100 text-cyan-700"
              : tag === "Exame"
              ? "bg-emerald-100 text-emerald-700"
              : "bg-slate-100 text-slate-700"
          }`}
        >
          {tag}
        </span>
      </div>
      <div className="text-[10px] text-muted-foreground">{date}</div>
      <div className="mt-1 text-xs text-foreground/80">{text}</div>
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
