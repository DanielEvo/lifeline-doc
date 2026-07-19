import { useState, type FormEvent } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Activity, ArrowLeft, Loader2, Lock, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { resetPassword } from "@/lib/api/auth.functions";

export const Route = createFileRoute("/redefinir-senha")({
  validateSearch: (search: Record<string, unknown>) => ({
    token: typeof search.token === "string" ? search.token : "",
  }),
  head: () => ({ meta: [{ title: "LifeLine · Redefinir senha" }] }),
  component: RedefinirSenhaPage,
});

function RedefinirSenhaPage() {
  const { token } = Route.useSearch();
  const navigate = useNavigate();
  const [pass, setPass] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (!token) {
      toast.error("Link inválido. Peça um novo em Esqueci minha senha.");
      return;
    }
    if (pass.length < 6) {
      toast.error("A senha precisa de pelo menos 6 caracteres.");
      return;
    }
    if (pass !== confirm) {
      toast.error("As senhas não conferem.");
      return;
    }
    setBusy(true);
    try {
      const r = await resetPassword({ data: { token, newPassword: pass } });
      if (r.ok) {
        toast.success("Senha alterada!", { description: "Entre novamente com a nova senha." });
        navigate({ to: "/login" });
      } else {
        toast.error(r.error);
      }
    } catch {
      toast.error("Não consegui redefinir agora. Tente novamente.");
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
            <ShieldCheck className="h-5 w-5" />
          </div>
          <h2 className="text-xl font-semibold tracking-tight">Nova senha</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Escolha uma senha nova. Ao confirmar, você será deslogado de todas as sessões ativas.
          </p>

          <form onSubmit={submit} className="mt-5 space-y-3">
            <div className="space-y-1">
              <Label htmlFor="pass" className="text-xs">
                Nova senha
              </Label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="pass"
                  type="password"
                  value={pass}
                  onChange={(e) => setPass(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                  maxLength={120}
                  className="pl-9"
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="confirm" className="text-xs">
                Confirmar senha
              </Label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="confirm"
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="Digite de novo"
                  maxLength={120}
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
              Salvar nova senha
            </Button>
            <Link
              to="/login"
              className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground transition hover:text-foreground"
            >
              <ArrowLeft className="h-3 w-3" /> Voltar ao login
            </Link>
          </form>
        </div>
      </div>
    </div>
  );
}
