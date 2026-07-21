// Ditado da consulta — grava áudio de verdade (MediaRecorder), com
// pausar/continuar → parar SÓ com confirmação → o áudio vai pro servidor,
// que transcreve e resume via Lovable AI Gateway → blocos de sugestão que
// o médico aceita, edita ou descarta antes de entrarem na evolução. Nada
// entra no prontuário sem revisão humana, e nenhum áudio fica gravado no
// disco — só o texto resultante é persistido.

import { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Check, Loader2, Mic, MicOff, Pause, Pencil, Play, X } from "lucide-react";
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

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(",")[1] ?? "");
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/** Primeiro tipo suportado pelo navegador, na ordem de preferência. */
function pickMimeType(): string {
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"];
  for (const c of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported?.(c)) return c;
  }
  return "audio/webm";
}

export function Dictation({ onAppend }: { onAppend: (text: string) => void }) {
  const [recording, setRecording] = useState(false);
  const [paused, setPaused] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [confirmStop, setConfirmStop] = useState(false);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [editing, setEditing] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (!recording || paused) return;
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [recording, paused]);

  // Libera o microfone se o componente desmontar com gravação ativa.
  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const transcrever = useMutation({
    mutationFn: async () => {
      const chunks = chunksRef.current;
      const mimeType = recorderRef.current?.mimeType || "audio/webm";
      const blob = new Blob(chunks, { type: mimeType });
      const audioBase64 = await blobToBase64(blob);
      return transcribeConsult({ data: { audioBase64, mimeType, durationSec: seconds } });
    },
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
    onError: (err) => toast.error(err instanceof Error ? err.message : "Não consegui transcrever agora."),
  });

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      const recorder = new MediaRecorder(stream, { mimeType: pickMimeType() });
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.start();
      recorderRef.current = recorder;
      setRecording(true);
      setPaused(false);
      setSeconds(0);
      setBlocks([]);
    } catch {
      toast.error("Não consegui acessar o microfone — verifique a permissão do navegador.");
    }
  };

  const requestStop = () => setConfirmStop(true);
  const cancelStop = () => setConfirmStop(false);

  const confirmStopAndTranscribe = () => {
    const recorder = recorderRef.current;
    setConfirmStop(false);
    if (!recorder) return;
    recorder.onstop = () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      transcrever.mutate();
    };
    recorder.stop();
    setRecording(false);
    setPaused(false);
  };

  const togglePause = () => {
    const recorder = recorderRef.current;
    if (!recorder) return;
    if (paused) {
      recorder.resume();
      setPaused(false);
    } else {
      recorder.pause();
      setPaused(true);
    }
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
            {transcrever.isPending ? "Transcrevendo…" : "Transcrever consulta"}
          </Button>
        ) : (
          <>
            {!paused ? (
              <Button type="button" variant="outline" size="sm" onClick={togglePause} className="text-xs">
                <Pause className="mr-1.5 h-3.5 w-3.5" />
                Pausar
              </Button>
            ) : (
              <Button type="button" variant="outline" size="sm" onClick={togglePause} className="text-xs">
                <Play className="mr-1.5 h-3.5 w-3.5" />
                Continuar
              </Button>
            )}

            <div className="relative">
              <Button
                type="button"
                size="sm"
                onClick={requestStop}
                className="bg-red-600 text-xs text-white hover:bg-red-700"
              >
                <MicOff className="mr-1.5 h-3.5 w-3.5" />
                Parar · {fmt(seconds)}
              </Button>

              {confirmStop && (
                <div className="absolute left-0 top-full z-20 mt-2 w-64 rounded-xl border border-border bg-white p-3 shadow-lg dark:bg-card">
                  <p className="text-xs font-medium text-foreground">
                    Parar gravação e gerar transcrição?
                  </p>
                  <div className="mt-2.5 flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      onClick={confirmStopAndTranscribe}
                      className="h-7 bg-teal-600 text-[11px] text-white hover:bg-teal-700"
                    >
                      Parar
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={cancelStop}
                      className="h-7 text-[11px]"
                    >
                      Continuar gravando
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {recording && !paused && (
          <span className="flex items-center gap-1.5 text-[11px] text-red-600 dark:text-red-400">
            <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
            gravando — fale normalmente
          </span>
        )}
        {recording && paused && (
          <span className="text-[11px] text-muted-foreground">pausado — {fmt(seconds)}</span>
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
