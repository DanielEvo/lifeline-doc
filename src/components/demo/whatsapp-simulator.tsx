import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  CheckCheck,
  FileText,
  Image as ImageIcon,
  Loader2,
  MessageSquare,
  Paperclip,
  Phone,
  RotateCcw,
  Sparkles,
  UserPlus,
  Video,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useDemo, type ChatMessage } from "@/lib/demo-store";

type Flow = "new" | "return";

type Step = {
  label: string;
  desc: string;
  messages: ChatMessage[];
  toast?: string;
  onDone?: (ctx: { setSubjective: (s: string) => void; movePatient: (id: string, to: any) => void; patients: any[] }) => void;
};

const NEW_FLOW: Step[] = [
  {
    label: "Iniciar conversa",
    desc: "Bot abre a conversa e solicita o nome completo do paciente.",
    messages: [
      { id: "n-b1", from: "bot", text: "Olá! 👋 Sou o assistente da Dra. Helena. Para agendar sua consulta, preciso de alguns dados rápidos. Qual o seu nome completo?", ts: "14:01" },
    ],
  },
  {
    label: "Paciente responde com nome",
    desc: "Paciente envia o nome — o bot pede o CPF.",
    messages: [
      { id: "n-p1", from: "patient", text: "Mariana Silva", ts: "14:02" },
      { id: "n-b2", from: "bot", text: "Obrigado, Mariana! Agora preciso do seu CPF para criar seu cadastro com segurança 🔒", ts: "14:02" },
    ],
  },
  {
    label: "Paciente envia CPF",
    desc: "CPF validado, bot solicita e-mail e telefone.",
    messages: [
      { id: "n-p2", from: "patient", text: "123.456.789-00", ts: "14:03" },
      { id: "n-b3", from: "bot", text: "Perfeito! Qual o seu e-mail e telefone para contato?", ts: "14:03" },
    ],
  },
  {
    label: "Paciente envia contato",
    desc: "Cadastro concluído. Bot pergunta a queixa principal.",
    messages: [
      { id: "n-p3", from: "patient", text: "mariana@email.com · (11) 99999-0000", ts: "14:04" },
      { id: "n-b4", from: "bot", badge: "Cadastro criado", text: "✅ Cadastro criado! Agora me conta: qual é sua principal queixa hoje? Pode escrever ou mandar um áudio 🎤", ts: "14:04" },
    ],
  },
  {
    label: "Paciente descreve queixa",
    desc: "Queixa principal coletada e enviada ao briefing.",
    messages: [
      { id: "n-p4", from: "patient", text: "Estou com muito cansaço e falta de ar quando subo escadas", ts: "14:05" },
      { id: "n-b5", from: "bot", text: "Entendido 🙏 Você tem algum exame recente? Pode enviar em PDF ou foto aqui mesmo.", ts: "14:05" },
    ],
    onDone: ({ setSubjective }) =>
      setSubjective(
        "Paciente nova. Refere cansaço progressivo e dispneia aos médios esforços (subir escadas). Sem dor torácica, febre ou edema.",
      ),
  },
  {
    label: "Paciente envia exame (PDF)",
    desc: "OCR analisa o laudo e o briefing é enviado para a Dra. Helena.",
    messages: [
      { id: "n-p5", from: "patient", attachment: { kind: "pdf", name: "hemograma_mar2025.pdf" }, ts: "14:06" },
      { id: "n-b6", from: "bot", badge: "Lendo laudo via OCR…", text: "Processando os parâmetros do hemograma ⏳", ts: "14:06" },
      { id: "n-b7", from: "bot", badge: "Briefing enviado", text: "✅ Pronto! Identifiquei: Hemoglobina 11.2 g/dL (↓ queda em 18 meses), Ferritina 18 ng/mL. Briefing enviado à Dra. Helena 📋", ts: "14:07" },
    ],
    toast: "Briefing completo gerado · cadastro + queixa + exame OCR",
    onDone: ({ patients }) => {
      const m = patients.find((p) => p.id === "mariana");
      if (m) { m.hasBriefing = true; m.hasExams = true; m.examsCount = 1; }
    },
  },
];

const RETURN_FLOW: Step[] = [
  {
    label: "Iniciar conversa",
    desc: "Bot reconhece o número de Mariana e confirma o retorno.",
    messages: [
      { id: "r-b1", from: "bot", badge: "Paciente reconhecida", text: "Olá, Mariana! 😊 Que bom te ver por aqui. Sua consulta de retorno com a Dra. Helena é amanhã às 14h. Você fez os exames solicitados?", ts: "09:10" },
    ],
  },
  {
    label: "Paciente confirma exames",
    desc: "Paciente confirma que fez os exames — bot pede o laudo.",
    messages: [
      { id: "r-p1", from: "patient", text: "Sim, fiz semana passada!", ts: "09:11" },
      { id: "r-b2", from: "bot", text: "Ótimo! Pode enviar os laudos aqui que já organizo tudo para a Dra. Helena 📋", ts: "09:11" },
    ],
  },
  {
    label: "Paciente envia exame de retorno",
    desc: "OCR compara com o exame anterior e move o card no Kanban.",
    messages: [
      { id: "r-p2", from: "patient", attachment: { kind: "pdf", name: "hemograma_jun2026.pdf" }, ts: "09:13" },
      { id: "r-b3", from: "bot", badge: "Lendo laudo via OCR…", text: "Comparando com o exame anterior ⏳", ts: "09:13" },
      { id: "r-b4", from: "bot", badge: "Kanban atualizado", text: "✅ Recebi! Hemoglobina: 12.8 g/dL (↑ melhora de 1.6 em 3 meses). Ferritina: 42 ng/mL (↑ dentro do normal agora). Card atualizado no Kanban da Dra. Helena 🎯", ts: "09:14" },
    ],
    toast: "Card movido para \"Retorno Agendado\" automaticamente",
    onDone: ({ movePatient, patients }) => {
      movePatient("mariana", "retorno");
      const m = patients.find((p) => p.id === "mariana");
      if (m) { m.hasBriefing = true; m.hasExams = true; m.examsCount = 2; }
    },
  },
];

export function WhatsAppSimulator({ onComplete }: { onComplete: () => void }) {
  const { messages, pushMessages, resetChat, patients, movePatient, setSubjective } = useDemo();
  const [flow, setFlow] = useState<Flow>("new");
  const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const steps = flow === "new" ? NEW_FLOW : RETURN_FLOW;
  const allDone = progress >= steps.length;

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const switchFlow = (f: Flow) => {
    if (f === flow) return;
    setFlow(f);
    setProgress(0);
    resetChat();
  };

  const restart = () => {
    setProgress(0);
    resetChat();
  };

  const runNext = () => {
    if (busy || allDone) return;
    const step = steps[progress];
    setBusy(true);
    let i = 0;
    const tick = () => {
      if (i < step.messages.length) {
        pushMessages([step.messages[i]]);
        i += 1;
        setTimeout(tick, 650);
      } else {
        if (step.toast) toast.success(step.toast);
        step.onDone?.({ setSubjective, movePatient, patients });
        setProgress((p) => p + 1);
        setBusy(false);
      }
    };
    tick();
  };

  return (
    <div className="mx-auto max-w-7xl p-6 lg:p-10">
      <PageHeader
        eyebrow="Step A · Bot multi-agente"
        title="Bot multi-agente · Triagem inteligente"
        desc="Para pacientes novos: coleta cadastro, queixa e exames. Para retornos: identifica o paciente e atualiza o prontuário automaticamente — sem o médico precisar fazer nada."
      />

      <div className="mt-8 grid items-start gap-8 lg:grid-cols-[380px_1fr]">
        {/* Phone — same proportions as Step D */}
        <div className="mx-auto w-full max-w-[380px]">
          <div className="relative rounded-[2.5rem] border-[10px] border-slate-900 bg-slate-900 shadow-2xl shadow-slate-900/40">
            <div className="absolute left-1/2 top-0 z-10 h-6 w-32 -translate-x-1/2 rounded-b-2xl bg-slate-900" />
            <div className="overflow-hidden rounded-[2rem] bg-[#e5ddd5]">
              {/* WA header */}
              <div className="flex items-center gap-3 bg-[#075E54] px-4 py-3 pt-7 text-white">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-rose-400 to-pink-500 text-sm font-semibold">
                  DH
                </div>
                <div className="flex-1">
                  <div className="text-sm font-medium">Dra. Helena · LifeLine</div>
                  <div className="text-[11px] text-white/70">online · responde com IA</div>
                </div>
                <Video className="h-4 w-4 opacity-80" />
                <Phone className="h-4 w-4 opacity-80" />
              </div>

              {/* Messages */}
              <div
                ref={scrollRef}
                className="h-[420px] space-y-2 overflow-y-auto bg-[#e5ddd5] px-3 py-4"
              >
                {messages.length === 0 && (
                  <div className="mt-16 text-center text-xs text-slate-500">
                    {flow === "new"
                      ? "Paciente novo · use os botões à direita para iniciar →"
                      : "Paciente de retorno · use os botões à direita para iniciar →"}
                  </div>
                )}
                {messages.map((m) => <Bubble key={m.id} msg={m} />)}
                {busy && (
                  <div className="flex justify-start">
                    <div className="flex items-center gap-1.5 rounded-2xl rounded-tl-sm bg-white px-3 py-2 text-xs text-slate-500 shadow-sm">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      digitando…
                    </div>
                  </div>
                )}
              </div>

              {/* composer */}
              <div className="flex items-center gap-2 bg-[#f0f0f0] px-3 py-2">
                <Paperclip className="h-4 w-4 text-slate-400" />
                <div className="flex-1 rounded-full bg-white px-3 py-1.5 text-xs text-slate-400">
                  Mensagem
                </div>
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#075E54] text-white">
                  <MessageSquare className="h-4 w-4" />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Control panel */}
        <div className="space-y-4">
          {/* Flow selector */}
          <div className="rounded-xl border border-border bg-card p-1.5">
            <div className="grid grid-cols-2 gap-1">
              <FlowTab
                active={flow === "new"}
                onClick={() => switchFlow("new")}
                icon={<UserPlus className="h-4 w-4" />}
                label="Paciente novo"
              />
              <FlowTab
                active={flow === "return"}
                onClick={() => switchFlow("return")}
                icon={<RotateCcw className="h-4 w-4" />}
                label="Paciente de retorno"
              />
            </div>
          </div>

          {/* Step buttons */}
          <div className="space-y-3">
            {steps.map((s, idx) => (
              <ActionButton
                key={`${flow}-${idx}`}
                n={idx + 1}
                done={progress > idx}
                active={progress === idx && !busy}
                disabled={busy || progress !== idx}
                onClick={runNext}
                title={s.label}
                desc={s.desc}
              />
            ))}
          </div>

          {/* Restart */}
          {progress > 0 && (
            <button
              onClick={restart}
              className="text-xs text-muted-foreground underline-offset-4 hover:underline"
            >
              ↺ Reiniciar este fluxo
            </button>
          )}

          {/* Collected data card */}
          {allDone && flow === "new" && (
            <SummaryCard
              title="Briefing gerado"
              rows={[
                ["Paciente", "Mariana Silva · novo"],
                ["Queixa", "Fadiga + dispneia"],
                ["Cadastro", "criado agora"],
                ["Exames", "1 PDF · OCR concluído"],
                ["Resultados", "Hb 11.2 · Ferritina 18"],
              ]}
              onNext={onComplete}
            />
          )}
          {allDone && flow === "return" && (
            <SummaryCard
              title="Paciente identificada"
              rows={[
                ["Paciente", "Mariana Silva · retorno"],
                ["Última consulta", "Mar 2026"],
                ["Exames", "atualizados · melhora ↑"],
                ["Kanban", "card movido automaticamente"],
              ]}
              onNext={onComplete}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function FlowTab({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition ${
        active
          ? "brand-gradient text-primary-foreground shadow-sm"
          : "text-muted-foreground hover:bg-muted"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function SummaryCard({ title, rows, onNext }: { title: string; rows: [string, string][]; onNext: () => void }) {
  return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 animate-fade-in">
      <div className="flex items-center gap-2 text-emerald-800">
        <Sparkles className="h-4 w-4" />
        <span className="text-sm font-semibold">✦ {title}</span>
      </div>
      <dl className="mt-3 space-y-1.5 text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-3 text-emerald-900">
            <dt className="text-emerald-700">{k}</dt>
            <dd className="text-right font-medium">{v}</dd>
          </div>
        ))}
      </dl>
      <Button onClick={onNext} className="mt-4 w-full brand-gradient text-primary-foreground">
        Ir para o Painel Kanban
        <ArrowRight className="ml-1.5 h-4 w-4" />
      </Button>
    </div>
  );
}

function Bubble({ msg }: { msg: ChatMessage }) {
  const isBot = msg.from === "bot";
  return (
    <div className={`flex ${isBot ? "justify-start" : "justify-end"} animate-fade-in`}>
      <div
        className={`max-w-[78%] rounded-2xl px-3 py-2 text-[13px] leading-snug shadow-sm ${
          isBot ? "rounded-tl-sm bg-white text-slate-800" : "rounded-tr-sm bg-[#dcf8c6] text-slate-800"
        }`}
      >
        {msg.badge && (
          <div className="mb-1 inline-flex items-center gap-1 rounded-full bg-cyan-100 px-2 py-0.5 text-[10px] font-medium text-cyan-800">
            <Sparkles className="h-2.5 w-2.5" />
            {msg.badge}
          </div>
        )}
        {msg.attachment && (
          <div className="mb-1 flex items-center gap-2 rounded-lg bg-slate-100 px-2.5 py-2 text-slate-700">
            {msg.attachment.kind === "pdf" ? (
              <FileText className="h-4 w-4 text-rose-500" />
            ) : (
              <ImageIcon className="h-4 w-4 text-cyan-500" />
            )}
            <div className="flex-1 text-[11px] font-medium">{msg.attachment.name}</div>
          </div>
        )}
        {msg.text && <div>{msg.text}</div>}
        <div className="mt-1 flex items-center justify-end gap-1 text-[10px] text-slate-400">
          {msg.ts}
          {!isBot && <CheckCheck className="h-3 w-3 text-cyan-500" />}
        </div>
      </div>
    </div>
  );
}

function ActionButton({
  n,
  done,
  active,
  disabled,
  onClick,
  title,
  desc,
}: {
  n: number;
  done: boolean;
  active: boolean;
  disabled: boolean;
  onClick: () => void;
  title: string;
  desc: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`group w-full rounded-xl border p-4 text-left transition disabled:cursor-not-allowed ${
        done
          ? "border-emerald-200 bg-emerald-50"
          : active
          ? "border-primary/60 bg-card shadow-sm hover:-translate-y-0.5 hover:shadow-md"
          : "border-border bg-card opacity-60"
      }`}
    >
      <div className="flex items-start gap-3">
        <div
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-semibold ${
            done ? "bg-emerald-500 text-white" : "brand-gradient text-primary-foreground"
          }`}
        >
          {done ? <CheckCheck className="h-4 w-4" /> : n}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold">{title}</div>
          <div className="mt-0.5 text-xs text-muted-foreground">{desc}</div>
        </div>
        {active && (
          <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition group-hover:translate-x-1 group-hover:text-primary" />
        )}
      </div>
    </button>
  );
}

export function PageHeader({
  eyebrow,
  title,
  desc,
}: {
  eyebrow: string;
  title: string;
  desc: string;
}) {
  return (
    <div className="max-w-3xl">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-primary">{eyebrow}</div>
      <h1 className="mt-0.5 text-xl font-semibold tracking-tight md:text-2xl">{title}</h1>
      <p className="mt-1 text-xs text-muted-foreground md:text-sm">{desc}</p>
    </div>
  );
}
