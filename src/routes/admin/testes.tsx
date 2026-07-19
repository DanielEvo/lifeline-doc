// Painel de testes original — feedback, leads, receitas, prontuários selados.
// Migrado do antigo /admin.tsx para dentro do novo layout admin.

import { createFileRoute } from "@tanstack/react-router";
import { Inbox, Lock, MessageCircle, Pill, Users } from "lucide-react";

import { getFeedback } from "@/lib/api/feedback.functions";
import { getLeads } from "@/lib/api/leads.functions";
import { getConsultations, getPrescriptions } from "@/lib/api/prontuario.functions";
import type {
  ConsultationEntry,
  FeedbackEntry,
  LeadEntry,
  PrescriptionEntry,
} from "@/lib/store.server";

export const Route = createFileRoute("/admin/testes")({
  loader: async () => {
    const [fb, leads, consults, rx] = await Promise.all([
      getFeedback(),
      getLeads(),
      getConsultations(),
      getPrescriptions(),
    ]);
    return { fb, leads, consults, rx };
  },
  component: AdminTestes,
});

const RATING_EMOJI: Record<string, string> = {
  adorei: "🤩",
  ok: "🙂",
  confuso: "😕",
};

function AdminTestes() {
  const { fb, leads, consults, rx } = Route.useLoaderData();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="mb-1 text-xl font-semibold">Painel de testes</h1>
        <p className="text-sm text-muted-foreground">
          Feedback dos médicos, prontuários selados, receitas e leads.
        </p>
      </div>

      <section>
        <div className="mb-3 flex items-center gap-2">
          <MessageCircle className="h-4 w-4 text-primary" />
          <h2 className="text-base font-semibold">Feedback</h2>
          <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
            {fb.total}
          </span>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {(["adorei", "ok", "confuso"] as const).map((k) => (
            <div key={k} className="rounded-2xl border border-border bg-card p-4 text-center">
              <div className="text-2xl">{RATING_EMOJI[k]}</div>
              <div className="mt-1 text-2xl font-bold tabular-nums">{fb.counts[k] ?? 0}</div>
              <div className="text-[11px] capitalize text-muted-foreground">{k}</div>
            </div>
          ))}
        </div>
        <div className="mt-4 space-y-2">
          {fb.rows.length === 0 && <EmptyState label="Nenhum feedback ainda." />}
          {fb.rows.map((r: FeedbackEntry) => (
            <div key={r.id} className="flex items-start gap-3 rounded-xl border border-border bg-card p-3">
              <span className="text-xl leading-none">{RATING_EMOJI[r.rating] ?? "•"}</span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                  <span className="rounded-full bg-muted px-2 py-0.5 font-medium">{r.step}</span>
                  <span>{new Date(r.createdAt).toLocaleString("pt-BR")}</span>
                </div>
                {r.note && <p className="mt-1 text-sm text-foreground/90">{r.note}</p>}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-center gap-2">
          <Lock className="h-4 w-4 text-primary" />
          <h2 className="text-base font-semibold">Prontuários selados</h2>
          <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
            {consults.total}
          </span>
        </div>
        <div className="space-y-2">
          {consults.rows.length === 0 && <EmptyState label="Nenhum prontuário selado." />}
          {consults.rows.map((c: ConsultationEntry) => (
            <div key={c.id} className="rounded-xl border border-border bg-card p-3">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                <span className="font-semibold">{c.patient}</span>
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                  {c.protocol}
                </span>
                <span className="ml-auto text-[11px] text-muted-foreground">
                  {new Date(c.signedAt).toLocaleString("pt-BR")}
                </span>
              </div>
              <div className="mt-1 truncate font-mono text-[11px] text-muted-foreground">
                {c.signature}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-center gap-2">
          <Pill className="h-4 w-4 text-primary" />
          <h2 className="text-base font-semibold">Receitas</h2>
          <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
            {rx.total}
          </span>
        </div>
        <div className="space-y-2">
          {rx.rows.length === 0 && <EmptyState label="Nenhuma receita gerada." />}
          {rx.rows.map((p: PrescriptionEntry) => (
            <div
              key={p.id}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-border bg-card p-3 text-sm"
            >
              <span className="font-semibold">{p.patient}</span>
              <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-medium text-violet-700 dark:bg-violet-500/15 dark:text-violet-300">
                {p.code}
              </span>
              <span className="text-[11px] text-muted-foreground">{p.meds.join(", ")}</span>
              <span className="ml-auto text-[11px] text-muted-foreground">
                {new Date(p.createdAt).toLocaleString("pt-BR")}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-center gap-2">
          <Users className="h-4 w-4 text-primary" />
          <h2 className="text-base font-semibold">Leads do site</h2>
          <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
            {leads.total}
          </span>
        </div>
        <div className="space-y-2">
          {leads.rows.length === 0 && <EmptyState label="Nenhum lead ainda." />}
          {leads.rows.map((l: LeadEntry) => (
            <div
              key={l.id}
              className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-border bg-card p-3 text-sm"
            >
              <span className="font-semibold">{l.nome}</span>
              <span className="text-muted-foreground">{l.email}</span>
              {l.whatsapp && <span className="text-muted-foreground">{l.whatsapp}</span>}
              {l.especialidade && (
                <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium">
                  {l.especialidade}
                </span>
              )}
              <span className="ml-auto text-[11px] text-muted-foreground">
                {new Date(l.createdAt).toLocaleString("pt-BR")}
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
      <Inbox className="h-6 w-6 opacity-50" />
      {label}
    </div>
  );
}
