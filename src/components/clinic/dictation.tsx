// Ditado da consulta — grava áudio de verdade (MediaRecorder), com
// pausar/continuar → parar SÓ com confirmação → o áudio vai pro servidor,
// que transcreve e resume via Gemini → blocos de sugestão que
// o médico aceita, edita ou descarta antes de entrarem na evolução. Nada
// entra no prontuário sem revisão humana, e nenhum áudio fica gravado no
// disco — só o texto resultante é persistido.
//
// Resiliência de falha: se a transcrição falhar, o áudio já capturado
// (chunksRef) NUNCA é descartado — o médico pode tentar de novo sem
// regravar, ou baixar o áudio bruto como último recurso. Até 2 retries
// automáticos silenciosos acontecem antes de expor qualquer erro.
//
// Barra de progresso: a API do Gemini não expõe progresso real de uma
// chamada generateContent não-streamada — não existe "62% transcrito" de
// verdade. A barra abaixo é uma ESTIMATIVA baseada no tempo decorrido vs.
// duração da gravação, com teto de 92% até a resposta real chegar (nunca
// finge 100% antes da hora).

import { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  AlertTriangle,
  Check,
  CheckCheck,
  Download,
  Loader2,
  Mic,
  MicOff,
  Pause,
  Pencil,
  Play,
  RotateCcw,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { transcribeConsult } from "@/lib/api/transcribe.functions";
import { useClinic } from "@/lib/clinic-context";

type Block = {
  id: string;
  label: string;
  text: string;
  status: "pending" | "accepted" | "discarded";
  containsPatientReport?: boolean;
};

const PROGRESS_CEILING = 92;
const MS_PER_RECORDED_SECOND = 300;
const MIN_ESTIMATED_MS = 4000;

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

export function Dictation({
  sections,
  templateContent = "",
  onAcceptToSection,
}: {
  /** Cabeçalhos de seção do template ativo — vazio em modo "Texto livre". */
  sections: string[];
  /** Template ativo por inteiro — serve de instrução pra IA distribuir o texto. */
  templateContent?: string;
  onAcceptToSection: (label: string, text: string) => void;
}) {
  const { token } = useClinic();
  const [recording, setRecording] = useState(false);
  const [paused, setPaused] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [confirmStop, setConfirmStop] = useState(false);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const mimeTypeRef = useRef<string>("audio/webm");
  const progressStartRef = useRef<number | null>(null);
  const progressRafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!recording || paused) return;
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [recording, paused]);

  // Libera o microfone se o componente desmontar com gravação ativa.
  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (progressRafRef.current) cancelAnimationFrame(progressRafRef.current);
    };
  }, []);

  const transcrever = useMutation({
    mutationFn: async () => {
      const chunks = chunksRef.current;
      const mimeType = mimeTypeRef.current;
      const blob = new Blob(chunks, { type: mimeType });
      const audioBase64 = await blobToBase64(blob);
      return transcribeConsult({
        data: {
          token,
          audioBase64,
          mimeType,
          durationSec: seconds,
          templateSections: sections,
          templateContent: templateContent.slice(0, 4000),
        },
      });
    },
    // Falha transitória (rede, 429, timeout de upload) não deve expor erro
    // de cara — só depois de 2 tentativas silenciosas. Áudio vazio é erro
    // de conteúdo, não vale retry.
    retry: (failureCount, error) => {
      if (error instanceof Error && error.message.includes("Áudio vazio")) return false;
      return failureCount < 2;
    },
    retryDelay: (attempt) => attempt * 2000,
    onSuccess: (r) => {
      setProgress(100);
      setTimeout(() => setProgress(0), 700);
      setBlocks(
        r.blocks.map((b, i) => ({
          id: String(i),
          label: b.label,
          text: b.text,
          status: "pending",
          containsPatientReport: b.containsPatientReport,
        })),
      );
      toast.message("Transcrição pronta", {
        description: "Revise os blocos antes de incorporar à evolução.",
      });
    },
    onError: (err) => {
      setProgress(0);
      toast.error(err instanceof Error ? err.message : "Não consegui transcrever agora.", {
        description: 'Seu áudio continua salvo — use "Tentar novamente" abaixo, sem precisar regravar.',
      });
    },
  });

  // Progresso é uma estimativa (ver comentário no topo do arquivo), não o
  // retorno real da API — anima com easing até o teto enquanto a mutation
  // está pendente, e para assim que ela resolve.
  useEffect(() => {
    if (!transcrever.isPending) {
      if (progressRafRef.current) cancelAnimationFrame(progressRafRef.current);
      return;
    }
    const estimatedMs = Math.max(MIN_ESTIMATED_MS, seconds * MS_PER_RECORDED_SECOND);
    progressStartRef.current = Date.now();
    const tick = () => {
      const elapsed = Date.now() - (progressStartRef.current ?? Date.now());
      const ratio = Math.min(1, elapsed / estimatedMs);
      const eased = 1 - Math.pow(1 - ratio, 2);
      setProgress(Math.min(PROGRESS_CEILING, Math.round(eased * PROGRESS_CEILING)));
      progressRafRef.current = requestAnimationFrame(tick);
    };
    progressRafRef.current = requestAnimationFrame(tick);
    return () => {
      if (progressRafRef.current) cancelAnimationFrame(progressRafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transcrever.isPending]);

  const start = async () => {
    // Falhas de microfone têm causas bem diferentes (permissão negada, nenhum
    // dispositivo, contexto inseguro, navegador embutido). Mensagem genérica
    // deixava o médico sem saber o que corrigir.
    if (typeof window !== "undefined" && !window.isSecureContext) {
      toast.error("O microfone só funciona em conexão segura (https). Abra o site pelo endereço https://.");
      return;
    }
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      toast.error(
        "Este navegador não libera o microfone. Abra o LifeLine no Chrome, Edge ou Safari (fora do navegador interno do WhatsApp/Instagram).",
      );
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      const recorder = new MediaRecorder(stream, { mimeType: pickMimeType() });
      mimeTypeRef.current = recorder.mimeType || pickMimeType();
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.start();
      recorderRef.current = recorder;
      setRecording(true);
      setPaused(false);
      setSeconds(0);
      setBlocks([]);
      setProgress(0);
      transcrever.reset();
    } catch (err) {
      const name = err instanceof DOMException ? err.name : "";
      if (name === "NotAllowedError" || name === "SecurityError") {
        toast.error("Permissão de microfone bloqueada", {
          description:
            "Clique no cadeado ao lado do endereço do site → Microfone → Permitir, e tente de novo.",
        });
      } else if (name === "NotFoundError" || name === "OverconstrainedError") {
        toast.error("Nenhum microfone encontrado", {
          description: "Conecte um microfone ou fone com microfone e tente novamente.",
        });
      } else if (name === "NotReadableError" || name === "AbortError") {
        toast.error("O microfone está em uso por outro programa", {
          description: "Feche chamadas (Meet, Zoom, WhatsApp) e tente de novo.",
        });
      } else {
        toast.error("Não consegui acessar o microfone — verifique a permissão do navegador.");
      }
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
    onAcceptToSection(b.label, b.text);
    setBlocks((all) => all.map((x) => (x.id === b.id ? { ...x, status: "accepted" } : x)));
  };

  // Templates com várias seções (ex.: Anamnese, 8) tornam clicar bloco a
  // bloco custoso — atalho pra aceitar tudo de uma vez, mesma revisão que
  // aceitar individual só que em lote.
  const acceptAll = () => {
    blocks.filter((b) => b.status === "pending").forEach(accept);
  };

  // Rede de segurança final: se a transcrição falhar de vez, o médico ainda
  // sai com o áudio bruto em mãos em vez de perder a consulta inteira.
  const baixarAudio = () => {
    const blob = new Blob(chunksRef.current, { type: mimeTypeRef.current });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    a.href = url;
    a.download = `consulta-${ts}.webm`;
    a.click();
    URL.revokeObjectURL(url);
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

      {(transcrever.isPending || progress > 0) && (
        <div className="mt-2 w-56">
          <div className="mb-1 flex items-center justify-between text-[10px] text-muted-foreground">
            <span>{progress >= 100 ? "Concluído" : "Transcrevendo…"}</span>
            <span>{progress}%</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all duration-300 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {transcrever.isError && !recording && (
        <div className="mt-2 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-2.5 dark:border-amber-900 dark:bg-amber-950">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-amber-800 dark:text-amber-300">
              Não consegui transcrever — seu áudio de {fmt(seconds)} ainda está aqui.
            </p>
            <div className="mt-1.5 flex gap-2">
              <Button
                type="button"
                size="sm"
                onClick={() => transcrever.mutate()}
                disabled={transcrever.isPending}
                className="h-7 text-[11px]"
              >
                <RotateCcw className="mr-1 h-3 w-3" /> Tentar novamente
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={baixarAudio} className="h-7 text-[11px]">
                <Download className="mr-1 h-3 w-3" /> Baixar áudio
              </Button>
            </div>
          </div>
        </div>
      )}

      {pending.length > 0 && (
        <div className="mt-2 space-y-1.5">
          {pending.length > 1 && (
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground">
                {pending.length} sugestões pendentes
              </span>
              <button
                type="button"
                onClick={acceptAll}
                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium text-emerald-700 hover:bg-emerald-100 dark:text-emerald-400 dark:hover:bg-emerald-950"
              >
                <CheckCheck className="h-3 w-3" /> Aceitar todos
              </button>
            </div>
          )}
          {blocks
            .filter((b) => b.status === "pending")
            .map((b) => (
              <div key={b.id} className="rounded-lg border border-primary/30 bg-primary/5 p-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-primary">
                    {b.label}
                  </span>
                  {b.containsPatientReport && (
                    <span
                      title="Este bloco pode conter fala direta do paciente — revise com atenção antes de aceitar"
                      className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-medium text-amber-700 ring-1 ring-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:ring-amber-900"
                    >
                      🗣️ fala do paciente
                    </span>
                  )}
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
