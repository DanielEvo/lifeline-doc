// Aba "Consultas" do app do paciente — calendário mensal com marcações e
// lista de consultas passadas e futuras (mesmo vocabulário visual da tela de
// agenda da demo). Sem dado real ainda: só o que o paciente importar como
// exemplo aparece aqui; o restante fica em estado vazio honesto.

import { useState } from "react";
import { CalendarDays, CheckCircle2, Clock, Sparkles } from "lucide-react";

import type { PatientConsulta } from "@/lib/patient-demo-data";

const WEEK = ["D", "S", "T", "Q", "Q", "S", "S"];
const MONTHS_LONG = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];
const MONTHS_SHORT = [
  "JAN", "FEV", "MAR", "ABR", "MAI", "JUN",
  "JUL", "AGO", "SET", "OUT", "NOV", "DEZ",
];

export function PatientConsultasScreen({
  consultas,
  demoOn,
  onToggleDemo,
}: {
  consultas: PatientConsulta[];
  demoOn: boolean;
  onToggleDemo: (on: boolean) => void;
}) {
  const today = new Date();
  const [cursor, setCursor] = useState({
    year: today.getFullYear(),
    month: today.getMonth(),
  });
  const [filter, setFilter] = useState<"agendada" | "realizada">("agendada");

  const parse = (d: string) => new Date(`${d}T00:00:00`);
  const monthItems = consultas.filter((c) => {
    const d = parse(c.date);
    return d.getFullYear() === cursor.year && d.getMonth() === cursor.month;
  });

  const agendadas = consultas.filter((c) => c.status === "agendada").length;
  const realizadas = consultas.filter((c) => c.status === "realizada").length;
  const filtered = consultas
    .filter((c) => c.status === filter)
    .sort((a, b) =>
      filter === "agendada" ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date),
    );

  const firstDay = new Date(cursor.year, cursor.month, 1).getDay();
  const daysInMonth = new Date(cursor.year, cursor.month + 1, 0).getDate();
  const cells = Array.from({ length: 42 }, (_, i) => {
    const d = i - firstDay + 1;
    return d > 0 && d <= daysInMonth ? d : null;
  });
  const todayDay =
    today.getFullYear() === cursor.year && today.getMonth() === cursor.month
      ? today.getDate()
      : -1;

  const step = (delta: number) =>
    setCursor((c) => {
      const d = new Date(c.year, c.month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold tracking-tight">Minhas consultas</h3>
        <p className="text-[11px] text-muted-foreground">
          O que já aconteceu e o que está por vir.
        </p>
      </div>

      <button
        onClick={() => onToggleDemo(!demoOn)}
        className={`flex w-full items-center gap-2 rounded-xl border px-3 py-2 text-left text-[10px] transition ${
          demoOn
            ? "border-primary/40 bg-primary/5 text-primary"
            : "border-dashed border-border text-muted-foreground hover:border-primary/40"
        }`}
      >
        <Sparkles className="h-3.5 w-3.5 shrink-0" />
        <span className="min-w-0 flex-1">
          {demoOn
            ? "Dados de exemplo ativos — toque para remover"
            : "Importar dados de exemplo para explorar a tela"}
        </span>
      </button>

      <div className="flex items-center justify-between">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          {MONTHS_LONG[cursor.month]} · {cursor.year}
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => step(-1)}
            className="rounded-md border border-border bg-card px-1.5 py-0.5 text-[10px]"
            aria-label="Mês anterior"
          >
            ←
          </button>
          <button
            onClick={() => step(1)}
            className="rounded-md border border-border bg-card px-1.5 py-0.5 text-[10px]"
            aria-label="Próximo mês"
          >
            →
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-3">
        <div className="grid grid-cols-7 gap-1 text-center text-[9px] font-medium text-muted-foreground">
          {WEEK.map((d, i) => (
            <span key={i}>{d}</span>
          ))}
        </div>
        <div className="mt-1 grid grid-cols-7 gap-1">
          {cells.map((d, i) => {
            if (d === null) return <div key={i} className="h-8" />;
            const mark = monthItems.find((c) => parse(c.date).getDate() === d);
            const isToday = d === todayDay;
            return (
              <div
                key={i}
                className={`relative flex h-8 items-center justify-center rounded-md text-[10px] ${
                  isToday
                    ? "bg-primary font-bold text-primary-foreground"
                    : mark?.status === "agendada"
                      ? "bg-sky-100 font-semibold text-sky-700 dark:bg-sky-950 dark:text-sky-300"
                      : mark?.status === "realizada"
                        ? "bg-emerald-100 font-semibold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                        : "text-foreground"
                }`}
              >
                {d}
                {mark && !isToday && (
                  <span
                    className={`absolute bottom-0.5 h-1 w-1 rounded-full ${
                      mark.status === "agendada" ? "bg-sky-500" : "bg-emerald-500"
                    }`}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-1.5 rounded-xl bg-muted p-1">
        <FilterPill
          active={filter === "agendada"}
          onClick={() => setFilter("agendada")}
          label="Próximas"
          count={agendadas}
        />
        <FilterPill
          active={filter === "realizada"}
          onClick={() => setFilter("realizada")}
          label="Realizadas"
          count={realizadas}
        />
      </div>

      <div className="space-y-2">
        {filtered.length === 0 && (
          <div className="rounded-xl border border-dashed border-border p-5 text-center text-[11px] text-muted-foreground">
            <CalendarDays className="mx-auto mb-1.5 h-5 w-5 text-muted-foreground/50" />
            Nenhuma consulta {filter === "agendada" ? "agendada" : "realizada"} por aqui.
          </div>
        )}
        {filtered.map((c) => {
          const d = parse(c.date);
          return (
            <div
              key={c.id}
              className="flex items-center gap-3 rounded-xl border border-border bg-card p-2.5"
            >
              <div className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-lg bg-muted">
                <span className="text-base font-bold leading-none">
                  {String(d.getDate()).padStart(2, "0")}
                </span>
                <span className="text-[9px] font-medium text-muted-foreground">
                  {MONTHS_SHORT[d.getMonth()]}
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[11px] font-semibold">{c.title}</div>
                <div className="truncate text-[10px] text-muted-foreground">
                  {c.hora} · {c.local}
                </div>
                {c.resultado && (
                  <div className="truncate text-[9px] text-emerald-600">{c.resultado}</div>
                )}
              </div>
              {c.status === "agendada" ? (
                <Clock className="h-4 w-4 shrink-0 text-sky-500" />
              ) : (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FilterPill({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
}) {
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
