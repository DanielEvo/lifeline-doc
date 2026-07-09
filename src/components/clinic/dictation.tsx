// Ditado da consulta — como na demo: gravar → transcrição estruturada no
// servidor → blocos de sugestão que o médico aceita, edita ou descarta antes
// de entrarem na evolução. Nada entra no prontuário sem revisão humana.

import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Check, Loader2, Mic, MicOff, Pencil, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { transcribeConsult } from "@/lib/api/transcribe.functions";

type Block = {
  id: string;
  label: string;
  text: string;
  status: "pending" | "accepted" | "discarded";
};

export function Dictation({ onAppend }: { onAppend: (text: string) => void }) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [editing, setEditing] = useState<string | null>(null);

  useEffect(() => {
    if (!recording) return;
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [recording]);

  const transcrever = useMutation({
    mutationFn: (durationSec: number) => transcribeConsult({ data: { durationSec } }),
    onSuccess: (r) => {
      setBlocks([
        { id: "s", label: "Queixa", text: r.subjective, status: "pending" },
        { id: "a", label: "Avaliação", text: r.assessment, status: "pending" },
        { id: "p", label: "Conduta", text: r.plan, status: "pending" },
      ]);
      toast.message("Transcrição pronta", {
        description: "Revise os blocos antes de incorporar à evolução.",
      });
    },
    onError: () => toast.error("Não consegui transcrever agora."),
  });

  const start = () => {
    setRecording(true);
    setSeconds(0);
    setBlocks([]);
  };

  const stop = () => {
    setRecording(false);
    transcrever.mutate(seconds);
  };

  const accept = (b: Block) => {
    onAppend(b.text);
    setBlocks((all) => all.map((x) => (x.id === b.id ? { ...x, status: "accepted" } : x)));
  };

  const fmt = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  const pending = blocks.filter((b) => b.status === "pending");

  return (
    <div>
      <div className="flex items-center gap-2">
        {!recording ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={start}
            disabled={transcrever.isPending}
            className="text-xs"
          >
            {transcrever.isPending ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Mic className="mr-1.5 h-3.5 w-3.5" />
            )}
            {transcrever.isPending ? "Transcrevendo…" : "Ditar consulta"}
          </Button>
        ) : (
          <Button
            type="button"
            size="sm"
            onClick={stop}
            className="bg-red-600 text-white hover:bg-red-700"
          >
            <MicOff className="mr-1.5 h-3.5 w-3.5" />
            Parar · {fmt(seconds)}
          </Button>
        )}
        {recording && (
          <span className="flex items-center gap-1.5 text-[11px] text-red-600 dark:text-red-400">
            <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
            gravando — fale normalmente
          </span>
        )}
      </div>

      {pending.length > 0 && (
        <div className="mt-2 space-y-1.5">
          {blocks
            .filter((b) => b.status === "pending")
            .map((b) => (
              <div key={b.id} className="rounded-lg border border-primary/30 bg-primary/5 p-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-primary">
                    {b.label}
                  </span>
                  <div className="flex gap-0.5">
                    <button
                      onClick={() => accept(b)}
                      title="Incorporar à evolução"
                      className="rounded p-1 text-emerald-600 hover:bg-emerald-100 dark:hover:bg-emerald-950"
                    >
                      <Check className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => setEditing(editing === b.id ? null : b.id)}
                      title="Editar"
                      className="rounded p-1 text-muted-foreground hover:bg-muted"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() =>
                        setBlocks((all) =>
                          all.map((x) => (x.id === b.id ? { ...x, status: "discarded" } : x)),
                        )
                      }
                      title="Descartar"
                      className="rounded p-1 text-muted-foreground hover:bg-red-100 hover:text-red-600 dark:hover:bg-red-950"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                {editing === b.id ? (
                  <Textarea
                    value={b.text}
                    onChange={(e) =>
                      setBlocks((all) =>
                        all.map((x) => (x.id === b.id ? { ...x, text: e.target.value } : x)),
                      )
                    }
                    rows={2}
                    className="mt-1 text-xs"
                  />
                ) : (
                  <p className="mt-0.5 text-xs leading-snug text-foreground/90">{b.text}</p>
                )}
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
