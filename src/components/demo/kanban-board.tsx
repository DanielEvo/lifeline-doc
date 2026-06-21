import { useState } from "react";
import { AlertTriangle, ArrowRight, FileCheck2, MessageSquareText, MoreHorizontal, Pill, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useDemo, COLUMNS, type KanbanColumnId, type PatientCard } from "@/lib/demo-store";
import { PageHeader } from "./whatsapp-simulator";

export function KanbanBoard({ onOpenPatient }: { onOpenPatient: () => void }) {
  const { patients, movePatient } = useDemo();
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [hoverCol, setHoverCol] = useState<KanbanColumnId | null>(null);

  const onDrop = (col: KanbanColumnId) => {
    if (draggingId) {
      movePatient(draggingId, col);
      setDraggingId(null);
      setHoverCol(null);
    }
  };

  return (
    <div className="mx-auto max-w-[1400px] p-3 lg:p-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <PageHeader
          eyebrow="Step B · Pipeline clínico"
          title="Painel Kanban"
          desc="O fluxo do consultório em uma única tela. Arraste cards entre colunas ou clique para abrir o prontuário."
        />
        <Button
          onClick={() => {
            const m = patients.find((p) => p.id === "mariana");
            if (m) onOpenPatient();
          }}
          className="brand-gradient text-primary-foreground"
        >
          Abrir prontuário de Mariana
          <ArrowRight className="ml-1.5 h-4 w-4" />
        </Button>
      </div>

      <div className="mt-8 grid gap-4 lg:grid-cols-3 xl:grid-cols-5">
        {COLUMNS.map((col) => {
          const cards = patients.filter((p) => p.column === col.id);
          const isHover = hoverCol === col.id;
          return (
            <div
              key={col.id}
              onDragOver={(e) => {
                e.preventDefault();
                setHoverCol(col.id);
              }}
              onDragLeave={() => setHoverCol((c) => (c === col.id ? null : c))}
              onDrop={() => onDrop(col.id)}
              className={`flex flex-col rounded-2xl border bg-card/60 p-3 transition ${
                isHover ? "border-primary bg-primary/5 ring-2 ring-primary/30" : "border-border"
              }`}
            >
              <div className="mb-3 flex items-center justify-between px-1">
                <div>
                  <div className="text-sm font-semibold leading-tight">{col.title}</div>
                  <div className="text-[11px] text-muted-foreground">{col.hint}</div>
                </div>
                <div className="flex h-6 min-w-6 items-center justify-center rounded-full bg-muted px-2 text-xs font-medium text-muted-foreground">
                  {cards.length}
                </div>
              </div>
              <div className="flex-1 space-y-2.5">
                {cards.map((p) => (
                  <Card
                    key={p.id}
                    p={p}
                    onClick={() => p.id === "mariana" && onOpenPatient()}
                    onDragStart={() => setDraggingId(p.id)}
                    onDragEnd={() => setDraggingId(null)}
                    dragging={draggingId === p.id}
                  />
                ))}
                {cards.length === 0 && (
                  <div className="rounded-lg border border-dashed border-border/60 py-6 text-center text-[11px] text-muted-foreground">
                    Solte um card aqui
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Card({
  p,
  onClick,
  onDragStart,
  onDragEnd,
  dragging,
}: {
  p: PatientCard;
  onClick: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  dragging: boolean;
}) {
  const highlight = p.id === "mariana" && p.hasBriefing;
  return (
    <button
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onClick}
      className={`group w-full rounded-xl border bg-card p-3.5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg hover:shadow-primary/10 ${
        dragging ? "opacity-50" : ""
      } ${highlight ? "border-primary/50 ring-1 ring-primary/30" : "border-border"}`}
    >
      <div className="flex items-start gap-3">
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${p.tint} text-sm font-semibold text-white shadow`}
        >
          {p.initials}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <div className="truncate text-sm font-semibold">{p.name}</div>
            <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="text-[11px] text-muted-foreground">{p.age} anos</div>
          <div className="mt-1 line-clamp-2 text-xs text-foreground/80">{p.reason}</div>
        </div>
      </div>

      {(p.hasBriefing || p.hasExams || p.criticalFlag || typeof p.adherence === "number") && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {p.criticalFlag && (
            <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-800 ring-1 ring-red-200">
              <AlertTriangle className="h-2.5 w-2.5" />
              Parâmetro crítico · {p.criticalFlag}
            </span>
          )}
          {p.hasBriefing && (
            <span className="inline-flex items-center gap-1 rounded-full bg-cyan-100 px-2 py-0.5 text-[10px] font-medium text-cyan-800 ring-1 ring-cyan-200 animate-pulse">
              <Sparkles className="h-2.5 w-2.5" />
              Briefing WhatsApp pronto
            </span>
          )}
          {p.hasExams && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-800 ring-1 ring-emerald-200">
              <FileCheck2 className="h-2.5 w-2.5" />
              {p.examsCount} exame{p.examsCount > 1 ? "s" : ""} anexado{p.examsCount > 1 ? "s" : ""}
            </span>
          )}
          {typeof p.adherence === "number" && (
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ${
                p.adherence < 60
                  ? "bg-amber-100 text-amber-800 ring-amber-200"
                  : "bg-slate-100 text-slate-700 ring-slate-200"
              }`}
            >
              <Pill className="h-2.5 w-2.5" />
              {p.adherence}% adesão hoje
            </span>
          )}
        </div>
      )}

      {p.id === "mariana" && (
        <div className="mt-3 flex items-center gap-1.5 border-t border-border/60 pt-2.5 text-[10px] text-muted-foreground">
          <MessageSquareText className="h-3 w-3" />
          Última msg · há 2 min
        </div>
      )}
    </button>
  );
}
