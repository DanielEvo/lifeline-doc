// Nova triagem — a porta de entrada real: cole a mensagem do paciente
// (como chegaria pelo WhatsApp), a IA extrai a queixa estruturada e o
// paciente entra direto no painel do dia com briefing pronto.

import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowRight,
  Loader2,
  MessageSquarePlus,
  Sparkles,
  UserPlus,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { triageIntake } from "@/lib/api/clinic.functions";
import { useClinic } from "@/lib/clinic-context";

export const Route = createFileRoute("/app/triagem")({
  component: NovaTriagem,
});

const EXEMPLOS = [
  "Estou muito cansada há umas 4 semanas, falta de ar quando subo escada.",
  "Dor de cabeça forte quase todo dia, piora com luz.",
  "Meu peito está apertando quando faço esforço, começou ontem.",
];

type TriageData = {
  complaint: string;
  symptoms: string[];
  redFlags: string[];
  duration: string | null;
  urgency: "baixa" | "média" | "alta";
  summary: string;
  followUpQuestion: string;
  suggestedColumn: "triagem" | "atendimento";
};

function NovaTriagem() {
  const { token } = useClinic();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [mensagem, setMensagem] = useState("");
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [resultado, setResultado] = useState<TriageData | null>(null);

  const analisar = useMutation({
    mutationFn: () => triageIntake({ data: { token, message: mensagem } }),
    onSuccess: (r) => {
      if (!r.ok) return toast.error("Sessão expirada — entre novamente.");
      setResultado(r.triage);
    },
  });

  const criar = useMutation({
    mutationFn: () =>
      triageIntake({
        data: { token, message: mensagem, nome, telefone: telefone || null, criar: true },
      }),
    onSuccess: (r) => {
      if (!r.ok || !("patient" in r) || !r.patient)
        return toast.error("Não consegui criar o paciente.");
      qc.invalidateQueries({ queryKey: ["workspace"] });
      qc.invalidateQueries({ queryKey: ["workspace", "all"] });
      toast.success(`${r.patient.nome} triado e adicionado ao painel!`, {
        description: r.triage.urgency === "alta" ? "Urgência alta — já em atendimento." : undefined,
      });
      navigate({ to: "/app" });
    },
  });

  const urgencyTone =
    resultado?.urgency === "alta"
      ? "bg-red-100 text-red-800 ring-red-200 dark:bg-red-950 dark:text-red-300 dark:ring-red-900"
      : resultado?.urgency === "média"
        ? "bg-amber-100 text-amber-800 ring-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:ring-amber-900"
        : "bg-emerald-100 text-emerald-800 ring-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:ring-emerald-900";

  return (
    <div className="mx-auto max-w-2xl p-3 lg:p-5">
      <div className="text-[11px] font-medium uppercase tracking-wider text-primary">Entrada de paciente</div>
      <h1 className="text-xl font-semibold tracking-tight">Nova triagem</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Cole a mensagem do paciente como ela chegou (WhatsApp, telefone, recepção). A IA extrai a
        queixa e monta o briefing.
      </p>

      <div className="mt-4 rounded-2xl border border-border bg-card p-4">
        <Label htmlFor="tr-msg" className="text-xs">Mensagem do paciente</Label>
        <Textarea
          id="tr-msg"
          value={mensagem}
          onChange={(e) => {
            setMensagem(e.target.value);
            setResultado(null);
          }}
          rows={3}
          placeholder="“Doutora, estou com…”"
          className="mt-1"
        />
        <div className="mt-2 flex flex-wrap gap-1.5">
          {EXEMPLOS.map((ex) => (
            <button
              key={ex}
              onClick={() => {
                setMensagem(ex);
                setResultado(null);
              }}
              className="rounded-full border border-border bg-muted/50 px-2.5 py-1 text-[11px] text-muted-foreground transition hover:border-primary/40 hover:text-foreground"
            >
              {ex.slice(0, 42)}…
            </button>
          ))}
        </div>
        <div className="mt-3 flex justify-end">
          <Button
            disabled={mensagem.trim().length < 4 || analisar.isPending}
            onClick={() => analisar.mutate()}
            className="brand-gradient text-primary-foreground"
          >
            {analisar.isPending ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="mr-1.5 h-4 w-4" />
            )}
            Analisar com IA
          </Button>
        </div>
      </div>

      {resultado && (
        <div className="mt-4 rounded-2xl border border-primary/30 bg-card p-4 shadow-lg shadow-primary/5">
          <div className="flex items-center justify-between">
            <h2 className="inline-flex items-center gap-1.5 text-sm font-semibold">
              <Sparkles className="h-4 w-4 text-primary" />
              Briefing gerado
            </h2>
            <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ${urgencyTone}`}>
              urgência {resultado.urgency}
            </span>
          </div>

          <p className="mt-2 text-sm text-foreground/90">{resultado.summary}</p>

          <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
            <div className="rounded-lg bg-muted/60 px-3 py-2">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Queixa principal</div>
              <div className="mt-0.5 font-medium">{resultado.complaint || "—"}</div>
            </div>
            <div className="rounded-lg bg-muted/60 px-3 py-2">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Duração</div>
              <div className="mt-0.5 font-medium">{resultado.duration ?? "não informada"}</div>
            </div>
            {resultado.symptoms.length > 0 && (
              <div className="rounded-lg bg-muted/60 px-3 py-2 sm:col-span-2">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Sintomas identificados</div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {resultado.symptoms.map((s) => (
                    <span key={s} className="rounded-full bg-background px-2 py-0.5 ring-1 ring-border">{s}</span>
                  ))}
                </div>
              </div>
            )}
            {resultado.redFlags.length > 0 && (
              <div className="rounded-lg bg-red-50 px-3 py-2 ring-1 ring-red-200 dark:bg-red-950/50 dark:ring-red-900 sm:col-span-2">
                <div className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-red-700 dark:text-red-300">
                  <AlertTriangle className="h-3 w-3" /> Sinais de alerta
                </div>
                <div className="mt-0.5 text-red-800 dark:text-red-300">{resultado.redFlags.join(" · ")}</div>
              </div>
            )}
          </div>

          {/* Identificação e criação */}
          <div className="mt-4 border-t border-border/60 pt-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="tr-nome" className="text-xs">Nome do paciente *</Label>
                <Input
                  id="tr-nome"
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  placeholder="Maria de Souza"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="tr-tel" className="text-xs">WhatsApp</Label>
                <Input
                  id="tr-tel"
                  value={telefone}
                  onChange={(e) => setTelefone(e.target.value)}
                  placeholder="(11) 99999-0000"
                />
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between gap-2">
              <span className="text-[11px] text-muted-foreground">
                Entra em <strong>{resultado.suggestedColumn === "atendimento" ? "Em Atendimento" : "Triagem"}</strong>
                {resultado.urgency === "alta" ? " pela urgência alta" : ""}
              </span>
              <Button
                disabled={nome.trim().length < 2 || criar.isPending}
                onClick={() => criar.mutate()}
                className="brand-gradient text-primary-foreground"
              >
                {criar.isPending ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <UserPlus className="mr-1.5 h-4 w-4" />
                )}
                Adicionar ao painel
                <ArrowRight className="ml-1 h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </div>
      )}

      {!resultado && !analisar.isPending && (
        <div className="mt-6 flex items-start gap-2.5 rounded-xl bg-muted/40 px-4 py-3 text-xs text-muted-foreground">
          <MessageSquarePlus className="mt-0.5 h-4 w-4 shrink-0" />
          Em produção, esta triagem roda sozinha no WhatsApp do consultório — o paciente conversa
          com a IA e chega aqui já triado. Esta tela cobre a entrada manual.
        </div>
      )}
    </div>
  );
}
