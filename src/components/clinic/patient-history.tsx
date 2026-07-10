// Histórico clínico do paciente — dois blocos independentes que compartilham
// estado via `usePatientHistory`: a linha do tempo horizontal (ClinicalTimeline)
// e o painel de biomarcadores (BiomarkerPanel). Eventos de exame (agrupados por
// data+rótulo, status derivado da faixa de referência) e consultas (evoluções
// seladas/rascunho) convivem na mesma timeline. Clicar num exame filtra os
// gráficos do painel de biomarcadores; clicar numa consulta rola até o card
// da evolução correspondente.

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  FlaskConical,
  Loader2,
  Plus,
  ShieldCheck,
  Stethoscope,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { toast } from "sonner";
import {
  Line,
  LineChart,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { addMyMeasurement } from "@/lib/api/clinic.functions";
import {
  BIOMARKER_CATALOG,
  examStatus,
  isOutOfRange,
  todayIso,
  type Evolution,
  type Measurement,
} from "@/lib/clinic-types";

export type ExamEvent = {
  key: string;
  kind: "exame";
  date: string; // yyyy-mm-dd
  label: string;
  markers: Measurement[];
  status: ReturnType<typeof examStatus>;
};

export type ConsultaEvent = {
  key: string;
  kind: "consulta";
  date: string;
  evolutionId: string;
  sealed: boolean;
  assessment: string;
  plan: string;
  hasPrescription: boolean;
  evolucaoSnippet: string;
};

export type TimelineEvent = ExamEvent | ConsultaEvent;

const STATUS_PILL: Record<string, string> = {
  Saudável: "bg-emerald-100 text-emerald-700 ring-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:ring-emerald-900",
  Atenção: "bg-amber-100 text-amber-700 ring-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:ring-amber-900",
  Alerta: "bg-rose-100 text-rose-700 ring-rose-200 dark:bg-rose-950 dark:text-rose-300 dark:ring-rose-900",
  Selada: "bg-emerald-100 text-emerald-700 ring-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:ring-emerald-900",
  Rascunho: "bg-sky-100 text-sky-700 ring-sky-200 dark:bg-sky-950 dark:text-sky-300 dark:ring-sky-900",
};

const NODE_TONE: Record<string, string> = {
  Saudável: "from-emerald-400 to-emerald-600",
  Atenção: "from-amber-400 to-orange-500",
  Alerta: "from-rose-400 to-rose-600",
  Selada: "from-emerald-400 to-teal-500",
  Rascunho: "from-sky-400 to-cyan-500",
};

function fmtMonthYear(ymd: string): string {
  const d = new Date(`${ymd}T00:00:00`);
  const s = d.toLocaleDateString("pt-BR", { month: "short", year: "numeric" });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function fmtShort(ymd: string): string {
  const d = new Date(`${ymd}T00:00:00`);
  return d.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }).replace(". de ", " ");
}

// ---------------------------------------------------------------------------
// Estado compartilhado entre ClinicalTimeline e BiomarkerPanel — levantado
// para a página do prontuário, que instancia o hook uma vez e distribui os
// dois pedaços via props.

export function usePatientHistory(measurements: Measurement[], evolutions: Evolution[]) {
  // eventos de exame: agrupa por data+rótulo
  const examEvents = useMemo<ExamEvent[]>(() => {
    const groups = new Map<string, Measurement[]>();
    for (const m of measurements) {
      const key = `${m.date}|${m.label}`;
      groups.set(key, [...(groups.get(key) ?? []), m]);
    }
    return [...groups.entries()].map(([key, markers]) => ({
      key,
      kind: "exame" as const,
      date: markers[0].date,
      label: markers[0].label,
      markers,
      status: examStatus(markers),
    }));
  }, [measurements]);

  const events = useMemo<TimelineEvent[]>(() => {
    const consultas: ConsultaEvent[] = evolutions.map((e) => ({
      key: `evo-${e.id}`,
      kind: "consulta",
      date: e.createdAt.slice(0, 10),
      evolutionId: e.id,
      sealed: !!e.sealed,
      assessment: e.soap.a.compartilhavel,
      // planoTerapeutico é o campo dedicado (novo); evoluções antigas caem no P do SOAP derivado
      plan: e.planoTerapeutico || e.soap.p,
      hasPrescription: !!e.prescription,
      evolucaoSnippet: e.evolucao,
    }));
    return [...examEvents, ...consultas].sort((a, b) => a.date.localeCompare(b.date));
  }, [examEvents, evolutions]);

  const [activeKey, setActiveKey] = useState<string | null>(null);
  const lastExamKey = examEvents.length ? examEvents[examEvents.length - 1].key : null;
  useEffect(() => {
    // evento ativo padrão: o exame mais recente
    setActiveKey((k) => (k && events.some((e) => e.key === k) ? k : lastExamKey));
  }, [lastExamKey, events]);

  const [showAll, setShowAll] = useState(false);

  const allNames = useMemo(() => [...new Set(measurements.map((m) => m.name))], [measurements]);
  const activeExam = examEvents.find((e) => e.key === activeKey);
  const visibleNames = useMemo(() => {
    if (showAll || !activeExam) return allNames;
    return [...new Set(activeExam.markers.map((m) => m.name))];
  }, [showAll, activeExam, allNames]);

  const onEventClick = (ev: TimelineEvent) => {
    if (ev.kind === "exame") {
      setActiveKey(ev.key);
      setShowAll(false);
      return;
    }
    document.getElementById(ev.key)?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const anos = new Set(events.map((e) => e.date.slice(0, 4))).size;

  return {
    events,
    activeKey,
    onEventClick,
    anos,
    showAll,
    setShowAll,
    activeExam,
    visibleNames,
    allNames,
  };
}

// ---------------------------------------------------------------------------
// Linha do tempo — horizontal, full-width, com scroll lateral.

export function ClinicalTimeline({
  events,
  activeKey,
  onEventClick,
  anos,
  headerRight,
}: {
  events: TimelineEvent[];
  activeKey: string | null;
  onEventClick: (ev: TimelineEvent) => void;
  anos: number;
  headerRight?: ReactNode;
}) {
  return (
    <div className="mt-4 rounded-2xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">
          Histórico clínico
          {events.length > 0 && (
            <span className="ml-2 text-[11px] font-normal text-muted-foreground">
              {events.length} evento{events.length === 1 ? "" : "s"} · {anos} ano{anos === 1 ? "" : "s"}
            </span>
          )}
        </h2>
        {headerRight && <div className="flex items-center gap-2">{headerRight}</div>}
      </div>


      {events.length === 0 ? (
        <div className="mt-3 rounded-xl border border-dashed border-border/70 px-4 py-6 text-center">
          <FlaskConical className="mx-auto h-6 w-6 text-muted-foreground/50" />
          <p className="mt-2 text-xs text-muted-foreground">
            Registre o primeiro exame — a linha do tempo e os gráficos de evolução nascem daqui.
          </p>
        </div>
      ) : (
        <div className="relative mt-3 overflow-x-auto pb-1">
          <div className="absolute left-0 right-0 top-[13px] h-0.5 bg-border" />
          <div className="relative flex gap-3">
            {events.map((ev) => (
              <TimelineCard
                key={ev.key}
                ev={ev}
                active={ev.key === activeKey}
                onClick={() => onEventClick(ev)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function TimelineCard({
  ev,
  active,
  onClick,
}: {
  ev: TimelineEvent;
  active: boolean;
  onClick: () => void;
}) {
  const status = ev.kind === "exame" ? ev.status : ev.sealed ? "Selada" : "Rascunho";
  const Icon = ev.kind === "exame" ? FlaskConical : ev.sealed ? ShieldCheck : Stethoscope;
  const title =
    ev.kind === "exame" ? ev.label : ev.sealed ? "Consulta selada" : "Evolução em aberto";
  const summary =
    ev.kind === "exame"
      ? ev.markers.map((m) => `${m.name} ${m.value}`).join(" · ")
      : ev.assessment || ev.evolucaoSnippet;

  return (
    <button
      onClick={onClick}
      className={`w-48 shrink-0 rounded-xl border p-2.5 text-left transition hover:-translate-y-0.5 hover:shadow-md ${
        active ? "border-primary bg-primary/5 ring-1 ring-primary/30" : "border-border bg-card"
      }`}
    >
      <div className="flex items-center gap-2">
        <span
          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-white shadow ${NODE_TONE[status]}`}
        >
          <Icon className="h-3 w-3" />
        </span>
        <span className="text-[11px] font-semibold text-muted-foreground">
          {fmtMonthYear(ev.date)}
        </span>
      </div>
      <div className="mt-1.5 line-clamp-1 text-xs font-medium">{title}</div>
      <div className="mt-0.5 line-clamp-2 min-h-7 text-[11px] leading-snug text-muted-foreground">
        {summary}
      </div>
      <span className={`mt-1.5 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ${STATUS_PILL[status]}`}>
        {status}
      </span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Painel de biomarcadores — vive à parte, sticky ao lado do bloco de evolução.

export function BiomarkerPanel({
  token,
  patientId,
  measurements,
  activeExam,
  showAll,
  setShowAll,
  visibleNames,
  allNames,
  onChanged,
}: {
  token: string;
  patientId: string;
  measurements: Measurement[];
  activeExam: ExamEvent | undefined;
  showAll: boolean;
  setShowAll: (v: boolean) => void;
  visibleNames: string[];
  allNames: string[];
  onChanged: () => void;
}) {
  const [addOpen, setAddOpen] = useState(false);

  return (
    <div className="flex h-full flex-col rounded-2xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Biomarcadores</h2>
        <Button variant="outline" size="sm" onClick={() => setAddOpen(true)}>
          <Plus className="mr-1 h-3.5 w-3.5" />
          Registrar exame
        </Button>
      </div>

      {allNames.length === 0 ? (
        <div className="mt-3 rounded-xl border border-dashed border-border/70 px-4 py-6 text-center">
          <FlaskConical className="mx-auto h-6 w-6 text-muted-foreground/50" />
          <p className="mt-2 text-xs text-muted-foreground">
            Nenhum biomarcador ainda — registre um exame para ver os gráficos aqui.
          </p>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="mb-2 mt-3 flex flex-wrap items-center justify-between gap-1">
            <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              {allNames.length} biomarcador{allNames.length === 1 ? "" : "es"}
            </div>
            {allNames.length > visibleNames.length ? (
              <button
                onClick={() => setShowAll(true)}
                className="text-[11px] font-medium text-primary hover:underline"
              >
                Mostrar todos ({allNames.length})
              </button>
            ) : showAll && activeExam ? (
              <button
                onClick={() => setShowAll(false)}
                className="text-[11px] font-medium text-primary hover:underline"
              >
                Só do evento
              </button>
            ) : null}
          </div>
          {activeExam && !showAll && (
            <div className="mb-2 text-[11px] text-primary">
              {activeExam.label} · {fmtMonthYear(activeExam.date)}
            </div>
          )}
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
            {visibleNames.map((name) => (
              <BiomarkerChart key={name} name={name} measurements={measurements} />
            ))}
          </div>
        </div>
      )}

      <AddExamDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        token={token}
        patientId={patientId}
        onDone={onChanged}
      />
    </div>
  );
}

function BiomarkerChart({ name, measurements }: { name: string; measurements: Measurement[] }) {
  const series = measurements
    .filter((m) => m.name === name)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (series.length === 0) return null;
  const last = series[series.length - 1];
  const prev = series.length > 1 ? series[series.length - 2] : null;
  const out = isOutOfRange(last);
  const trendDown = prev !== null && last.value < prev.value;
  const data = series.map((m) => ({ x: fmtShort(m.date), v: m.value }));
  const vals = series.map((m) => m.value).concat([last.refMin, last.refMax]);
  const yMin = Math.min(...vals);
  const yMax = Math.max(...vals);
  const pad = (yMax - yMin || 1) * 0.15;

  return (
    <div className={`rounded-xl border p-2.5 ${out ? "border-rose-300/70 dark:border-rose-800" : "border-border"}`}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-xs font-medium">{name}</span>
        <span className={`flex items-center gap-1 text-xs font-semibold tabular-nums ${out ? "text-rose-600 dark:text-rose-400" : "text-foreground"}`}>
          {series.length > 1 &&
            (trendDown ? (
              <TrendingDown className={`h-3 w-3 ${out ? "text-rose-500" : "text-muted-foreground"}`} />
            ) : (
              <TrendingUp className={`h-3 w-3 ${out ? "text-rose-500" : "text-muted-foreground"}`} />
            ))}
          {last.value} <span className="font-normal text-muted-foreground">{last.unit}</span>
        </span>
      </div>
      <div className="mt-1 h-20">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
            <ReferenceArea y1={last.refMin} y2={last.refMax} fill="#10b981" fillOpacity={0.08} />
            <XAxis dataKey="x" tick={{ fontSize: 9 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
            <YAxis hide domain={[yMin - pad, yMax + pad]} />
            <Tooltip
              contentStyle={{ fontSize: 11, borderRadius: 8, padding: "4px 8px" }}
              formatter={(v) => [`${v} ${last.unit}`, name]}
            />
            <Line
              type="monotone"
              dataKey="v"
              stroke="#0891b2"
              strokeWidth={2}
              dot={({ cx, cy, payload, index }) => {
                const m = series[index];
                const bad = m && isOutOfRange(m);
                return (
                  <circle
                    key={`${name}-${index}`}
                    cx={cx}
                    cy={cy}
                    r={bad ? 3.5 : 2.5}
                    fill={bad ? "#e11d48" : "#0891b2"}
                    stroke="#fff"
                    strokeWidth={1}
                  />
                );
              }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="text-[10px] text-muted-foreground">
        ref {last.refMin}–{last.refMax} {last.unit}
      </div>
    </div>
  );
}

function AddExamDialog({
  open,
  onOpenChange,
  token,
  patientId,
  onDone,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  token: string;
  patientId: string;
  onDone: () => void;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState<string>(BIOMARKER_CATALOG[0].name);
  const [custom, setCustom] = useState({ nome: "", unit: "", min: "", max: "" });
  const [valor, setValor] = useState("");
  const [date, setDate] = useState(todayIso());
  const [label, setLabel] = useState("");

  useEffect(() => {
    if (open) {
      setValor("");
      setDate(todayIso());
      setLabel("");
    }
  }, [open]);

  const isCustom = name === "__outro";
  const valorNum = Number(valor.replace(",", "."));
  const cat = BIOMARKER_CATALOG.find((b) => b.name === name);
  const valid =
    Number.isFinite(valorNum) &&
    !!date &&
    (isCustom ? custom.nome.trim().length >= 2 && Number.isFinite(Number(custom.min)) && Number.isFinite(Number(custom.max)) : !!cat);

  const salvar = useMutation({
    mutationFn: () =>
      addMyMeasurement({
        data: {
          token,
          patientId,
          name: isCustom ? custom.nome.trim() : name,
          value: valorNum,
          date,
          label: label || undefined,
          ...(isCustom
            ? { unit: custom.unit, refMin: Number(custom.min), refMax: Number(custom.max) }
            : {}),
        },
      }),
    onSuccess: (r) => {
      if (!r.ok) return toast.error("Não consegui registrar o exame.");
      toast.success(`${r.measurement.name} registrado.`);
      onOpenChange(false);
      onDone();
      qc.invalidateQueries({ queryKey: ["workspace"] });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FlaskConical className="h-4 w-4 text-primary" />
            Registrar exame
          </DialogTitle>
          <DialogDescription>
            O resultado entra na linha do tempo e no gráfico do biomarcador.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 space-y-1">
            <Label className="text-xs">Biomarcador</Label>
            <Select value={name} onValueChange={setName}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {BIOMARKER_CATALOG.map((b) => (
                  <SelectItem key={b.name} value={b.name}>
                    {b.name} <span className="text-muted-foreground">({b.unit})</span>
                  </SelectItem>
                ))}
                <SelectItem value="__outro">Outro exame…</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {isCustom && (
            <>
              <div className="space-y-1">
                <Label className="text-xs">Nome do exame</Label>
                <Input value={custom.nome} onChange={(e) => setCustom({ ...custom, nome: e.target.value })} placeholder="Ex.: PCR" maxLength={60} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Unidade</Label>
                <Input value={custom.unit} onChange={(e) => setCustom({ ...custom, unit: e.target.value })} placeholder="mg/L" maxLength={16} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Ref. mínima</Label>
                <Input inputMode="decimal" value={custom.min} onChange={(e) => setCustom({ ...custom, min: e.target.value })} placeholder="0" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Ref. máxima</Label>
                <Input inputMode="decimal" value={custom.max} onChange={(e) => setCustom({ ...custom, max: e.target.value })} placeholder="5" />
              </div>
            </>
          )}

          <div className="space-y-1">
            <Label className="text-xs">Resultado {!isCustom && cat ? `(${cat.unit})` : ""}</Label>
            <Input inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="11.2" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Data da coleta</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="col-span-2 space-y-1">
            <Label className="text-xs">Rótulo do exame (agrupa na linha do tempo)</Label>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Ex.: Hemograma + perfil de ferro" maxLength={80} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button
            disabled={!valid || salvar.isPending}
            onClick={() => salvar.mutate()}
            className="brand-gradient text-primary-foreground"
          >
            {salvar.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Registrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
