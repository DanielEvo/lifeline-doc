import { useState, type FormEvent } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Activity, ArrowLeft, KeyRound, Loader2, Mail } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requestPatientPasswordReset } from "@/lib/api/patient-auth.functions";

export const Route = createFileRoute("/paciente/esqueci-senha")({
  head: () => ({
    meta: [
      { title: "LifeLine · Recuperar senha" },
      { name: "description", content: "Recupere o acesso à sua conta LifeLine de paciente." },
    ],
  }),
  component: PatientEsqueciSenhaPage,
});

function PatientEsqueciSenhaPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<{ devLink: string | null } | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (!email) {
      toast.error("Informe o e-mail da sua conta.");
      return;
    }
    setBusy(true);
    try {
      const r = await requestPatientPasswordReset({
        data: { email, origin: window.location.origin },
      });
      setSent({ devLink: r.devLink });
    } catch {
      toast.error("Não consegui enviar o link agora. Tente novamente.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-6">
      <div className="w-full max-w-sm">
        <Link to="/" className="mb-6 flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg brand-gradient">
            <Activity className="h-4 w-4 text-primary-foreground" strokeWidth={2.5} />
          </div>
          <span className="font-semibold">LifeLine</span>
        </Link>

        <div className="rounded-3xl border border-border bg-card p-6 shadow-xl shadow-primary/5">
          <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <KeyRound className="h-5 w-5" />
          </div>
          <h2 className="text-xl font-semibold tracking-tight">Esqueci minha senha</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Informe seu e-mail e enviaremos um link para criar uma nova senha. O link expira em 30
            minutos e só pode ser usado uma vez.
          </p>

          {sent ? (
            <div className="mt-5 space-y-4">
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-900/20 dark:text-emerald-200">
                Se o e-mail estiver cadastrado, um link foi enviado. Verifique sua caixa de entrada.
              </div>
              {sent.devLink ? (
                <div className="rounded-xl border border-dashed border-primary/40 bg-primary/5 p-3 text-xs">
                  <p className="mb-1 font-medium text-primary">
                    Modo desenvolvimento — envio de e-mail simulado
                  </p>
                  <p className="mb-2 text-muted-foreground">
                    Use este link para redefinir sua senha (expira em 30 min):
                  </p>
                  <a
                    href={sent.devLink}
                    className="block break-all rounded bg-background px-2 py-1.5 font-mono text-[11px] text-primary underline"
                  >
                    {sent.devLink}
                  </a>
                </div>
              ) : null}
              <Link
                to="/paciente/login"
                className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
              >
                <ArrowLeft className="h-3 w-3" /> Voltar ao login
              </Link>
            </div>
          ) : (
            <form onSubmit={submit} className="mt-5 space-y-3">
              <div className="space-y-1">
                <Label htmlFor="email" className="text-xs">
                  E-mail
                </Label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="voce@email.com"
                    maxLength={160}
                    className="pl-9"
                  />
                </div>
              </div>
              <Button
                type="submit"
                disabled={busy}
                className="press w-full brand-gradient text-primary-foreground shadow-md shadow-primary/30 hover:opacity-95"
              >
                {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
                Enviar link de recuperação
              </Button>
              <Link
                to="/paciente/login"
                className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground transition hover:text-foreground"
              >
                <ArrowLeft className="h-3 w-3" /> Voltar ao login
              </Link>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
