import { useState, type FormEvent } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Loader2, MailCheck } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requestPasswordReset } from "@/lib/api/auth.functions";

export const Route = createFileRoute("/esqueci-senha")({
  head: () => ({
    meta: [
      { title: "LifeLine · Recuperar senha" },
      { name: "description", content: "Receba um link para criar uma nova senha no LifeLine." },
    ],
  }),
  component: EsqueciSenhaPage,
});

function EsqueciSenhaPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [enviado, setEnviado] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy || !email) return;
    setBusy(true);
    try {
      await requestPasswordReset({ data: { email, origin: window.location.origin } });
      setEnviado(true);
    } catch {
      toast.error("Não consegui conectar agora. Tente novamente.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-6">
      <div className="w-full max-w-sm">
        <div className="rounded-3xl border border-border bg-card p-7 shadow-xl shadow-primary/5">
          {enviado ? (
            <div className="text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10">
                <MailCheck className="h-6 w-6 text-primary" />
              </div>
              <h1 className="mt-4 text-lg font-semibold tracking-tight">Verifique seu e-mail</h1>
              <p className="mt-1.5 text-sm text-muted-foreground">
                Se este e-mail estiver cadastrado, enviamos um link para criar uma nova senha. Ele
                vale por 30 minutos.
              </p>
            </div>
          ) : (
            <>
              <h1 className="text-lg font-semibold tracking-tight">Esqueci minha senha</h1>
              <p className="mt-1.5 text-sm text-muted-foreground">
                Informe seu e-mail e enviamos um link para criar uma nova senha.
              </p>
              <form onSubmit={submit} className="mt-5 space-y-3">
                <div className="space-y-1">
                  <Label htmlFor="email" className="text-xs">
                    E-mail
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="ana@consultorio.com.br"
                    maxLength={160}
                  />
                </div>
                <Button
                  type="submit"
                  disabled={busy || !email}
                  className="press w-full brand-gradient text-primary-foreground"
                >
                  {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
                  Enviar link
                </Button>
              </form>
            </>
          )}
        </div>
        <Link
          to="/login"
          className="mt-4 inline-flex items-center gap-1 text-xs text-muted-foreground transition hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" />
          Voltar para o login
        </Link>
      </div>
    </div>
  );
}
