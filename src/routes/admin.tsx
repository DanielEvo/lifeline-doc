import { useEffect, useState, type FormEvent } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  Inbox,
  KeyRound,
  Loader2,
  Lock,
  MessageCircle,
  Pill,
  RefreshCw,
  Users,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { adminChangeCredentials, adminGetMe, adminLogout } from "@/lib/api/admin-auth.functions";
import { getFeedback } from "@/lib/api/feedback.functions";
import { getLeads } from "@/lib/api/leads.functions";
import { getConsultations, getPrescriptions } from "@/lib/api/prontuario.functions";
import { clearAdminSession, getAdminSession } from "@/lib/admin-session";
import type {
  ConsultationEntry,
  FeedbackEntry,
  LeadEntry,
  PrescriptionEntry,
} from "@/lib/store.server";

export const Route = createFileRoute("/admin")({
  head: () => ({ meta: [{ title: "LifeLine · Painel de testes" }] }),
  component: Admin,
});

const RATING_EMOJI: Record<string, string> = {
  adorei: "🤩",
  ok: "🙂",
  confuso: "😕",
};

type PanelData = {
  fb: { rows: FeedbackEntry[]; total: number; counts: Record<string, number> };
  leads: { rows: LeadEntry[]; total: number };
  consults: { rows: ConsultationEntry[]; total: number };
  rx: { rows: PrescriptionEntry[]; total: number };
};

function Admin() {
  const navigate = useNavigate();
  const [token, setToken] = useState<string | null>(null);
  const [data, setData] = useState<PanelData | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // Guarda: sem sessão local → login; com sessão → valida token no servidor.
  useEffect(() => {
    const s = getAdminSession();
    if (!s) {
      navigate({ to: "/admin/login" });
      return;
    }
    adminGetMe({ data: { token: s.token } })
      .then((r) => {
        if (!r.ok) {
          clearAdminSession();
          toast.error("Sessão expirada. Entre novamente.");
          navigate({ to: "/admin/login" });
          return;
        }
        setToken(s.token);
      })
      .catch(() => setToken(s.token)); // offline — segue com a sessão local
  }, [navigate]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    Promise.all([
      getFeedback({ data: { token } }),
      getLeads({ data: { token } }),
      getConsultations({ data: { token } }),
      getPrescriptions({ data: { token } }),
    ])
      .then(([fb, leads, consults, rx]) => {
        if (cancelled) return;
        if (!fb.ok || !leads.ok || !consults.ok || !rx.ok) {
          clearAdminSession();
          toast.error("Sessão expirada. Entre novamente.");
          navigate({ to: "/admin/login" });
          return;
        }
        setData({ fb, leads, consults, rx });
      })
      .catch(() => {
        if (!cancelled) toast.error("Não consegui carregar os dados agora.");
      });
    return () => {
      cancelled = true;
    };
  }, [token, refreshKey, navigate]);

  const sair = async () => {
    if (token) adminLogout({ data: { token } }).catch(() => {});
    clearAdminSession();
    navigate({ to: "/admin/login" });
  };

  if (!token || !data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/30">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
          Carregando painel…
        </div>
      </div>
    );
  }

  const { fb, leads, consults, rx } = data;

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-3 px-5">
          <Link to="/" className="rounded-md p-1.5 hover:bg-muted">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <span className="text-sm font-semibold">Painel de testes</span>
          <span className="text-[11px] text-muted-foreground">feedback dos médicos · leads</span>
          <Button
            variant="outline"
            size="sm"
            className="ml-auto"
            onClick={() => setRefreshKey((k) => k + 1)}
          >
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            Atualizar
          </Button>
          <Button variant="ghost" size="sm" onClick={sair}>
            Sair
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-8 px-5 py-8">
        <CredentialsSection token={token} onChanged={sair} />

        {/* Feedback summary */}
        <section>
          <div className="mb-3 flex items-center gap-2">
            <MessageCircle className="h-4 w-4 text-primary" />
            <h2 className="text-base font-semibold">Feedback dos médicos</h2>
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
              <div
                key={r.id}
                className="flex items-start gap-3 rounded-xl border border-border bg-card p-3"
              >
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

        {/* Sealed consultations */}
        <section>
          <div className="mb-3 flex items-center gap-2">
            <Lock className="h-4 w-4 text-primary" />
            <h2 className="text-base font-semibold">Prontuários selados</h2>
            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
              {consults.total}
            </span>
          </div>
          <div className="space-y-2">
            {consults.rows.length === 0 && <EmptyState label="Nenhum prontuário selado ainda." />}
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

        {/* Prescriptions */}
        <section>
          <div className="mb-3 flex items-center gap-2">
            <Pill className="h-4 w-4 text-primary" />
            <h2 className="text-base font-semibold">Receitas digitais</h2>
            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
              {rx.total}
            </span>
          </div>
          <div className="space-y-2">
            {rx.rows.length === 0 && <EmptyState label="Nenhuma receita gerada ainda." />}
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

        {/* Leads */}
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
      </main>
    </div>
  );
}

function CredentialsSection({ token, onChanged }: { token: string; onChanged: () => void }) {
  const [novoLogin, setNovoLogin] = useState("");
  const [novaSenha, setNovaSenha] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [senhaAtual, setSenhaAtual] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (!novoLogin || !novaSenha || !confirmar || !senhaAtual) {
      toast.error("Preencha todos os campos.");
      return;
    }
    if (novaSenha.length < 6) {
      toast.error("A nova senha precisa de pelo menos 6 caracteres.");
      return;
    }
    if (novaSenha !== confirmar) {
      toast.error("As senhas não coincidem.");
      return;
    }
    setBusy(true);
    try {
      const r = await adminChangeCredentials({
        data: { token, novoLogin, novaSenha, senhaAtual },
      });
      if (r.ok) {
        toast.success("Credenciais atualizadas. Entre novamente.");
        onChanged();
      } else {
        toast.error(r.error);
      }
    } catch {
      toast.error("Não consegui salvar agora. Tente novamente.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section>
      <div className="mb-3 flex items-center gap-2">
        <KeyRound className="h-4 w-4 text-primary" />
        <h2 className="text-base font-semibold">Trocar credenciais</h2>
      </div>
      <form
        onSubmit={submit}
        className="grid gap-3 rounded-2xl border border-border bg-card p-4 sm:grid-cols-2"
      >
        <div className="space-y-1">
          <Label htmlFor="novoLogin" className="text-xs">
            Novo login
          </Label>
          <Input
            id="novoLogin"
            value={novoLogin}
            onChange={(e) => setNovoLogin(e.target.value)}
            maxLength={60}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="senhaAtual" className="text-xs">
            Senha atual
          </Label>
          <Input
            id="senhaAtual"
            type="password"
            value={senhaAtual}
            onChange={(e) => setSenhaAtual(e.target.value)}
            maxLength={120}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="novaSenha" className="text-xs">
            Nova senha
          </Label>
          <Input
            id="novaSenha"
            type="password"
            value={novaSenha}
            onChange={(e) => setNovaSenha(e.target.value)}
            maxLength={120}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="confirmar" className="text-xs">
            Confirmar nova senha
          </Label>
          <Input
            id="confirmar"
            type="password"
            value={confirmar}
            onChange={(e) => setConfirmar(e.target.value)}
            maxLength={120}
          />
        </div>
        <div className="sm:col-span-2">
          <Button type="submit" disabled={busy} size="sm">
            {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
            Salvar novas credenciais
          </Button>
        </div>
      </form>
    </section>
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
