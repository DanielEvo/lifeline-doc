// Personalizar o kanban: renomear, adicionar, remover e reordenar colunas.
// Salva no servidor por médico; pacientes de colunas removidas migram para a
// primeira coluna automaticamente (board.server).

import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Loader2, Plus, Settings2, Trash2 } from "lucide-react";
import { toast } from "sonner";

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
import { saveMyBoard } from "@/lib/api/clinic.functions";
import type { BoardColumn } from "@/lib/clinic-types";

type Draft = { id?: string; title: string; hint: string };

export function BoardDialog({
  open,
  onOpenChange,
  columns,
  token,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  columns: BoardColumn[];
  token: string;
}) {
  const qc = useQueryClient();
  const [drafts, setDrafts] = useState<Draft[]>([]);

  useEffect(() => {
    if (open) setDrafts(columns.map((c) => ({ id: c.id, title: c.title, hint: c.hint })));
  }, [open, columns]);

  const set = (i: number, patch: Partial<Draft>) =>
    setDrafts((ds) => ds.map((d, j) => (j === i ? { ...d, ...patch } : d)));

  const move = (i: number, dir: -1 | 1) =>
    setDrafts((ds) => {
      const j = i + dir;
      if (j < 0 || j >= ds.length) return ds;
      const next = [...ds];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  const valid = drafts.length >= 1 && drafts.every((d) => d.title.trim().length >= 2);

  const salvar = useMutation({
    mutationFn: () =>
      saveMyBoard({
        data: {
          token,
          columns: drafts.map((d) => ({
            id: d.id,
            title: d.title.trim(),
            hint: d.hint.trim() || undefined,
          })),
        },
      }),
    onSuccess: (r) => {
      if (!r.ok) return toast.error("Não consegui salvar o painel.");
      toast.success("Painel personalizado!");
      onOpenChange(false);
      qc.invalidateQueries({ queryKey: ["workspace"] });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings2 className="h-4 w-4 text-primary" />
            Personalizar painel
          </DialogTitle>
          <DialogDescription>
            Renomeie as etapas do seu fluxo, mude a ordem ou crie novas. Pacientes de colunas
            removidas voltam para a primeira etapa.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
          {drafts.map((d, i) => (
            <div key={d.id ?? `new-${i}`} className="flex items-center gap-1.5 rounded-xl border border-border bg-muted/30 p-2">
              <div className="flex flex-col">
                <button
                  onClick={() => move(i, -1)}
                  disabled={i === 0}
                  className="rounded p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30"
                  aria-label="Mover para cima"
                >
                  <ArrowUp className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => move(i, 1)}
                  disabled={i === drafts.length - 1}
                  className="rounded p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30"
                  aria-label="Mover para baixo"
                >
                  <ArrowDown className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="min-w-0 flex-1 space-y-1">
                <Input
                  value={d.title}
                  onChange={(e) => set(i, { title: e.target.value })}
                  maxLength={28}
                  placeholder="Nome da etapa"
                  className="h-8 text-sm"
                />
                <Input
                  value={d.hint}
                  onChange={(e) => set(i, { hint: e.target.value })}
                  maxLength={48}
                  placeholder="Descrição curta (opcional)"
                  className="h-7 text-xs text-muted-foreground"
                />
              </div>
              <button
                onClick={() => setDrafts((ds) => ds.filter((_, j) => j !== i))}
                disabled={drafts.length <= 1}
                className="rounded-lg p-1.5 text-muted-foreground transition hover:bg-red-50 hover:text-red-600 disabled:opacity-30 dark:hover:bg-red-950"
                aria-label="Remover coluna"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>

        <Button
          variant="outline"
          size="sm"
          disabled={drafts.length >= 7}
          onClick={() => setDrafts((ds) => [...ds, { title: "", hint: "" }])}
          className="w-full border-dashed"
        >
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Adicionar etapa {drafts.length >= 7 ? "(máx. 7)" : ""}
        </Button>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button
            disabled={!valid || salvar.isPending}
            onClick={() => salvar.mutate()}
            className="brand-gradient text-primary-foreground"
          >
            {salvar.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Salvar painel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
