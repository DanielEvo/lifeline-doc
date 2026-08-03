// Tela "Histórico" do app do paciente — linha do tempo vertical encostada na
// esquerda (mesmo vocabulário visual da timeline do médico) e, no restante da
// largura, o consolidado de biomarcadores do evento selecionado + acesso ao
// arquivo original. Envio de novos exames vive aqui (saiu da aba Exames).

import { useMemo, useState } from "react";
import {
  FileText,
  FileUp,
  FlaskConical,
  Scissors,
  Stethoscope,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import type { PatientHistoryEntry } from "@/lib/patient-demo-data";

const ICON: Record<PatientHistoryEntry["kind"], LucideIcon> = {
  exame: FlaskConical,
  consulta: Stethoscope,
  cirurgia: Scissors,
};

const NODE_TONE: Record<PatientHistoryEntry["status"], string> = {
  Saudável: "from-emerald-400 to-emerald-600",
  Atenção: "from-amber-400 to-orange-500",
  Alerta: "from-rose-400 to-rose-600",
  Pendente: "from-slate-300 to-slate-500",
};

const PILL: Record<PatientHistoryEntry["status"], string> = {
  Saudável: "bg-emerald-100 text-emerald-700 ring-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:ring-emerald-900",
  Atenção: "bg-amber-100 text-amber-700 ring-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:ring-amber-900",
  Alerta: "bg-rose-100 text-rose-700 ring-rose-200 dark:bg-rose-950 dark:text-rose-300 dark:ring-rose-900",
  Pendente: "bg-muted text-muted-foreground ring-border",
};

function fmtShort(ymd: string): { mes: string; ano: string } {
  const d = new Date(`${ymd}T00:00:00`);
  const mes = d.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "");
  return { mes: mes.toUpperCase(), ano: String(d.getFullYear()) };
}

function fmtLong(ymd: string): string {
  const d = new Date(`${ymd}T00:00:00`);
  const s = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function PatientHistoryScreen({
  entries,
  onOpenUpload,
  demoOn,
  onToggleDemo,
}: {
  entries: PatientHistoryEntry[];
  onOpenUpload: () => void;
  demoOn: boolean;
  onToggleDemo: (on: boolean) => void;
}) {
  const ordered = useMemo(
    () => [...entries].sort((a, b) => b.date.localeCompare(a.date)),
    [entries],
  );
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const selected =
    ordered.find((e) => e.key === selectedKey) ?? ordered[0] ?? null;

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold tracking-tight">Meu histórico</h3>
          <p className="text-[11px] text-muted-foreground">
            Exames e consultas em ordem cronológica.
          </p>
        </div>
        <Button
          size="sm"
          onClick={onOpenUpload}
          className="brand-gradient shrink-0 text-primary-foreground"
        >
          <FileUp className="mr-1.5 h-3.5 w-3.5" />
          Enviar
        </Button>
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

      {ordered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border/70 px-4 py-8 text-center">
          <FlaskConical className="mx-auto h-6 w-6 text-muted-foreground/50" />
          <p className="mt-2 text-xs text-muted-foreground">
            Sua linha do tempo começa quando você enviar seu primeiro exame ou
            quando um médico vincular uma consulta ao seu histórico.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-[58px_1fr] gap-2">
          {/* Linha do tempo vertical — canto esquerdo */}
          <div className="relative">
            <div className="absolute bottom-3 left-[18px] top-3 w-0.5 bg-border" />
            <ul className="space-y-3">
              {ordered.map((ev) => {
                const Icon = ICON[ev.kind];
                const active = selected?.key === ev.key;
                const { mes, ano } = fmtShort(ev.date);
                return (
                  <li key={ev.key} className="relative">
                    <button
                      onClick={() => setSelectedKey(ev.key)}
                      className="flex w-full flex-col items-center gap-0.5"
                      aria-label={ev.title}
                    >
                      <span
                        className={`z-10 flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br text-white shadow ring-4 ring-muted/30 transition ${
                          NODE_TONE[ev.status]
                        } ${active ? "scale-110 ring-primary/30" : "opacity-80"}`}
                      >
                        <Icon className="h-4 w-4" />
                      </span>
                      <span
                        className={`text-[9px] font-semibold leading-tight ${
                          active ? "text-foreground" : "text-muted-foreground"
                        }`}
                      >
                        {mes}
                      </span>
                      <span className="text-[9px] leading-none text-muted-foreground">{ano}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* Consolidado do evento selecionado */}
          {selected && (
            <div className="space-y-2">
              <div className="rounded-2xl border border-border bg-card p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-[12px] font-semibold">{selected.title}</p>
                    <p className="truncate text-[10px] text-muted-foreground">
                      {fmtLong(selected.date)} · {selected.source}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-semibold ring-1 ${PILL[selected.status]}`}
                  >
                    {selected.status}
                  </span>
                </div>
                {selected.demo && (
                  <p className="mt-1 text-[9px] uppercase tracking-wide text-primary/70">
                    Dado de exemplo
                  </p>
                )}
              </div>

              {selected.biomarkers.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border p-4 text-center text-[10px] text-muted-foreground">
                  Sem biomarcadores registrados neste evento.
                </div>
              ) : (
                <div className="space-y-2 rounded-2xl border border-border bg-card p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Consolidado de biomarcadores
                  </p>
                  {selected.biomarkers.map((b) => (
                    <BiomarkerRow key={b.name} b={b} />
                  ))}
                </div>
              )}

              <button
                disabled={!selected.fileName}
                onClick={() => {
                  /* visualização do PDF original entra quando o arquivo for
                     guardado no storage — hoje só o extrato fica salvo */
                }}
                className="flex w-full items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-left text-[10px] transition enabled:hover:border-primary/40 disabled:opacity-60"
              >
                <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">
                  {selected.fileName
                    ? `Ver arquivo original · ${selected.fileName}`
                    : "Arquivo original não disponível"}
                </span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function BiomarkerRow({
  b,
}: {
  b: { name: string; value: number; unit: string; min: number; max: number };
}) {
  const span = b.max - b.min || 1;
  const lo = b.min - span * 0.4;
  const hi = b.max + span * 0.4;
  const pct = Math.max(2, Math.min(98, ((b.value - lo) / (hi - lo)) * 100));
  const inRange = b.value >= b.min && b.value <= b.max;
  const refStart = ((b.min - lo) / (hi - lo)) * 100;
  const refWidth = ((b.max - b.min) / (hi - lo)) * 100;

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-[10px] font-medium">{b.name}</span>
        <span
          className={`shrink-0 text-[10px] font-bold tabular-nums ${
            inRange ? "text-emerald-600" : "text-amber-600"
          }`}
        >
          {b.value}
          <span className="ml-0.5 font-normal text-muted-foreground">{b.unit}</span>
        </span>
      </div>
      <div className="relative mt-1 h-1.5 rounded-full bg-muted">
        <div
          className="absolute inset-y-0 rounded-full bg-emerald-500/25"
          style={{ left: `${refStart}%`, width: `${refWidth}%` }}
        />
        <div
          className={`absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-background ${
            inRange ? "bg-emerald-500" : "bg-amber-500"
          }`}
          style={{ left: `${pct}%` }}
        />
      </div>
      <p className="mt-0.5 text-[9px] text-muted-foreground">
        Referência {b.min}–{b.max} {b.unit}
      </p>
    </div>
  );
}
