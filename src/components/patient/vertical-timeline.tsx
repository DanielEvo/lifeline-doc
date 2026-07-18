// Linha do tempo vertical do paciente — mesmo vocabulário visual da
// ClinicalTimeline horizontal do médico (nós circulares gradiente por status,
// ícones por categoria, pill de status), mas com o eixo virando de lado.
// Fonte inicial: exames pendentes agrupados por mês/ano. Consultas e cirurgias
// ficam prontas para quando o backend do paciente expuser esses dados.

import { FlaskConical, Scissors, Stethoscope, type LucideIcon } from "lucide-react";

export type VerticalEvent = {
  key: string;
  kind: "exame" | "consulta" | "cirurgia";
  date: string; // yyyy-mm-dd
  title: string;
  summary?: string;
  status: "Saudável" | "Atenção" | "Alerta" | "Selada" | "Rascunho" | "Pendente";
};

const STATUS_PILL: Record<VerticalEvent["status"], string> = {
  Saudável: "bg-emerald-100 text-emerald-700 ring-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:ring-emerald-900",
  Atenção: "bg-amber-100 text-amber-700 ring-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:ring-amber-900",
  Alerta: "bg-rose-100 text-rose-700 ring-rose-200 dark:bg-rose-950 dark:text-rose-300 dark:ring-rose-900",
  Selada: "bg-emerald-100 text-emerald-700 ring-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:ring-emerald-900",
  Rascunho: "bg-sky-100 text-sky-700 ring-sky-200 dark:bg-sky-950 dark:text-sky-300 dark:ring-sky-900",
  Pendente: "bg-muted text-muted-foreground ring-border",
};

const NODE_TONE: Record<VerticalEvent["status"], string> = {
  Saudável: "from-emerald-400 to-emerald-600",
  Atenção: "from-amber-400 to-orange-500",
  Alerta: "from-rose-400 to-rose-600",
  Selada: "from-emerald-400 to-teal-500",
  Rascunho: "from-sky-400 to-cyan-500",
  Pendente: "from-slate-300 to-slate-500",
};

const ICON: Record<VerticalEvent["kind"], LucideIcon> = {
  exame: FlaskConical,
  consulta: Stethoscope,
  cirurgia: Scissors,
};

function fmtMonthYear(ymd: string): string {
  const d = new Date(`${ymd}T00:00:00`);
  const s = d.toLocaleDateString("pt-BR", { month: "short", year: "numeric" });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function VerticalTimeline({ events }: { events: VerticalEvent[] }) {
  if (events.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border/70 px-4 py-8 text-center">
        <FlaskConical className="mx-auto h-6 w-6 text-muted-foreground/50" />
        <p className="mt-2 text-xs text-muted-foreground">
          Sua linha do tempo começa quando você enviar seu primeiro exame ou
          quando um médico vincular uma consulta ao seu histórico.
        </p>
      </div>
    );
  }

  return (
    <div className="relative pl-2">
      <div className="absolute bottom-2 left-[15px] top-2 w-0.5 bg-border" />
      <ul className="space-y-3">
        {events.map((ev) => {
          const Icon = ICON[ev.kind];
          return (
            <li key={ev.key} className="relative flex gap-3">
              <span
                className={`z-10 mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-white shadow ring-4 ring-background ${NODE_TONE[ev.status]}`}
              >
                <Icon className="h-3.5 w-3.5" />
              </span>
              <div className="min-w-0 flex-1 rounded-xl border border-border bg-card p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {fmtMonthYear(ev.date)}
                  </span>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ${STATUS_PILL[ev.status]}`}
                  >
                    {ev.status}
                  </span>
                </div>
                <div className="mt-1 truncate text-xs font-medium">{ev.title}</div>
                {ev.summary && (
                  <div className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-muted-foreground">
                    {ev.summary}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
