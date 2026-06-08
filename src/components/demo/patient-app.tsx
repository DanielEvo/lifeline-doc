import { useState } from "react";
import {
  Activity,
  Bell,
  CheckCircle2,
  Droplet,
  Footprints,
  Heart,
  KeyRound,
  Moon,
  Pill,
  QrCode,
  RotateCcw,
  ShieldCheck,
  UserPlus,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { PageHeader } from "./whatsapp-simulator";

const HABITS = [
  { id: "water", label: "Hidratação", icon: Droplet, target: "2L", value: "1.4L", color: "text-cyan-500" },
  { id: "steps", label: "Passos", icon: Footprints, target: "8.000", value: "5.421", color: "text-emerald-500" },
  { id: "sleep", label: "Sono", icon: Moon, target: "7h", value: "6h20", color: "text-indigo-500" },
  { id: "hr", label: "Frequência cardíaca", icon: Heart, target: "60–100", value: "72 bpm", color: "text-rose-500" },
];

export function PatientAppMockup({ onRestart }: { onRestart: () => void }) {
  const [authorized, setAuthorized] = useState(false);
  const [done, setDone] = useState<string[]>(["water"]);

  const toggleHabit = (id: string) =>
    setDone((d) => (d.includes(id) ? d.filter((x) => x !== id) : [...d, id]));

  return (
    <div className="mx-auto max-w-[1300px] p-6 lg:p-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <PageHeader
          eyebrow="Step D · Visão do paciente"
          title="O que Mariana vê no celular"
          desc="O LifeLine envia um link único e seguro. Sem app obrigatório — mas se o paciente quiser, a versão mobile organiza tudo."
        />
        <Button variant="outline" onClick={onRestart}>
          <RotateCcw className="mr-1.5 h-4 w-4" />
          Refazer o fluxo
        </Button>
      </div>

      <div className="mt-8 grid items-start gap-8 lg:grid-cols-[380px_1fr]">
        {/* Phone */}
        <div className="mx-auto w-full max-w-[380px]">
          <div className="relative rounded-[2.5rem] border-[10px] border-slate-900 bg-slate-900 shadow-2xl">
            <div className="absolute left-1/2 top-0 z-10 h-6 w-32 -translate-x-1/2 rounded-b-2xl bg-slate-900" />
            <div className="overflow-hidden rounded-[2rem] bg-background">
              {/* status bar */}
              <div className="flex items-center justify-between bg-background px-5 pt-7 pb-2 text-[11px] font-medium">
                <span>14:32</span>
                <div className="flex items-center gap-1 text-muted-foreground">
                  <span>5G</span>
                  <span>100%</span>
                </div>
              </div>
              <div className="bg-gradient-to-b from-primary/10 to-background px-5 pb-6">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-[11px] text-muted-foreground">Bem-vinda,</div>
                    <div className="text-lg font-semibold">Mariana 🌿</div>
                  </div>
                  <div className="relative">
                    <Bell className="h-5 w-5 text-muted-foreground" />
                    <span className="absolute -right-1 -top-1 flex h-2 w-2 rounded-full bg-rose-500" />
                  </div>
                </div>

                {/* Unique ID */}
                <div className="mt-5 rounded-2xl brand-gradient p-4 text-primary-foreground shadow-lg shadow-primary/30">
                  <div className="flex items-center justify-between text-[11px] opacity-80">
                    <span className="inline-flex items-center gap-1">
                      <ShieldCheck className="h-3 w-3" /> LifeLine ID
                    </span>
                    <span>seguro</span>
                  </div>
                  <div className="mt-2 font-mono text-lg tracking-wider">LFL · 7H2A · 9KB1</div>
                  <div className="mt-1 text-[10px] opacity-80">
                    Seu identificador único — válido em qualquer médico LifeLine.
                  </div>
                </div>

                {/* Active prescription */}
                <div className="mt-4 rounded-xl border border-border bg-card p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-100 text-violet-600">
                        <Pill className="h-4 w-4" />
                      </div>
                      <div>
                        <div className="text-xs font-semibold">Prescrição ativa</div>
                        <div className="text-[10px] text-muted-foreground">Memed · até Jun/2025</div>
                      </div>
                    </div>
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[9px] font-medium text-emerald-700">
                      3 itens
                    </span>
                  </div>
                  <div className="mt-2 space-y-1 text-[11px] text-foreground/80">
                    <div>· Sulfato Ferroso 40mg — 2x/dia</div>
                    <div>· Vitamina B12 1000mcg — 1x/dia</div>
                  </div>
                </div>

                {/* Authorize new doctor */}
                <div className="mt-3 rounded-xl border border-border bg-card p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-100 text-cyan-600">
                        <UserPlus className="h-4 w-4" />
                      </div>
                      <div>
                        <div className="text-xs font-semibold">Autorizar novo médico</div>
                        <div className="text-[10px] text-muted-foreground">
                          {authorized ? "Token gerado · válido 10 min" : "Compartilhe via QR ou token"}
                        </div>
                      </div>
                    </div>
                    <Switch
                      checked={authorized}
                      onCheckedChange={(v) => {
                        setAuthorized(v);
                        if (v) toast.success("Token de autorização gerado", { description: "LFL-AUTH-8429-XQ" });
                      }}
                    />
                  </div>
                  {authorized && (
                    <div className="mt-3 flex items-center gap-3 rounded-lg bg-muted/60 p-3 animate-fade-in">
                      <div className="flex h-16 w-16 items-center justify-center rounded-md bg-card ring-1 ring-border">
                        <QrCode className="h-12 w-12" />
                      </div>
                      <div className="flex-1">
                        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Token</div>
                        <div className="font-mono text-sm font-semibold">LFL-8429-XQ</div>
                        <div className="mt-1 inline-flex items-center gap-1 text-[10px] text-emerald-600">
                          <KeyRound className="h-2.5 w-2.5" /> Expira em 09:48
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Habits */}
                <div className="mt-3 rounded-xl border border-border bg-card p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Activity className="h-4 w-4 text-primary" />
                      <span className="text-xs font-semibold">Hábitos diários</span>
                    </div>
                    <span className="text-[10px] text-muted-foreground">
                      {done.length}/{HABITS.length}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {HABITS.map((h) => {
                      const isDone = done.includes(h.id);
                      return (
                        <button
                          key={h.id}
                          onClick={() => toggleHabit(h.id)}
                          className={`rounded-lg border p-2 text-left transition ${
                            isDone ? "border-emerald-300 bg-emerald-50" : "border-border bg-background"
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <h.icon className={`h-3.5 w-3.5 ${h.color}`} />
                            {isDone && <CheckCircle2 className="h-3 w-3 text-emerald-500" />}
                          </div>
                          <div className="mt-1.5 text-[10px] text-muted-foreground">{h.label}</div>
                          <div className="text-[11px] font-semibold">
                            {h.value} <span className="text-muted-foreground font-normal">/ {h.target}</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Explanation */}
        <div className="space-y-4">
          <ExplainCard
            icon={ShieldCheck}
            tone="cyan"
            title="Identidade única e portátil"
            text="Cada paciente ganha um LifeLine ID criptografado. Médicos autorizados acessam o histórico completo sem precisar criar cadastro de novo."
          />
          <ExplainCard
            icon={UserPlus}
            tone="emerald"
            title="Autorização granular"
            text="O paciente decide quem vê o quê — autoriza um novo médico com um token ou QR Code temporário. Revoga quando quiser."
          />
          <ExplainCard
            icon={Pill}
            tone="violet"
            title="Prescrições e hábitos no bolso"
            text="A prescrição Memed aparece automaticamente. O paciente registra hidratação, sono e atividade — e tudo retorna para o gráfico do médico."
          />

          <div className="rounded-2xl border border-primary/30 bg-primary/5 p-5">
            <div className="text-sm font-semibold">Fluxo concluído 🎉</div>
            <p className="mt-2 text-sm text-muted-foreground">
              Você passou pela triagem no WhatsApp, viu o Kanban se atualizar, registrou um prontuário SOAP
              selado com ICP-Brasil e viu a experiência completa do paciente. Quer refazer ou voltar ao site?
            </p>
            <div className="mt-4 flex gap-2">
              <Button onClick={onRestart} className="brand-gradient text-primary-foreground">
                <RotateCcw className="mr-1.5 h-4 w-4" />
                Refazer demo
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ExplainCard({
  icon: Icon,
  tone,
  title,
  text,
}: {
  icon: React.ComponentType<{ className?: string }>;
  tone: "cyan" | "emerald" | "violet";
  title: string;
  text: string;
}) {
  const tones: Record<string, string> = {
    cyan: "from-cyan-500 to-teal-500",
    emerald: "from-emerald-500 to-teal-500",
    violet: "from-violet-500 to-indigo-500",
  };
  return (
    <div className="flex gap-4 rounded-2xl border border-border bg-card p-5">
      <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${tones[tone]} text-white shadow`}>
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <div className="font-semibold">{title}</div>
        <p className="mt-1 text-sm text-muted-foreground">{text}</p>
      </div>
    </div>
  );
}
