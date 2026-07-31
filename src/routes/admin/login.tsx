import { useEffect, useState, type FormEvent } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Loader2, Lock, Shield, User } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { adminLogin } from "@/lib/api/admin-auth.functions";
import { getAdminSession, setAdminSession } from "@/lib/admin-session";

export const Route = createFileRoute("/admin/login")({
  head: () => ({
    meta: [{ title: "LifeLine · Admin" }],
  }),
  component: AdminLoginPage,
});

function AdminLoginPage() {
  const navigate = useNavigate();
  const [login, setLogin] = useState("");
  const [senha, setSenha] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (getAdminSession()) navigate({ to: "/admin" });
  }, [navigate]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (!login || !senha) {
      toast.error("Preencha login e senha.");
      return;
    }
    setBusy(true);
    try {
      const r = await adminLogin({ data: { login, senha } });
      if (r.ok) {
        setAdminSession({ token: r.token });
        navigate({ to: "/admin" });
      } else {
        toast.error(r.error);
      }
    } catch {
      toast.error("Não consegui conectar agora. Tente novamente.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-6">
      <div className="w-full max-w-sm">
        <div className="rounded-3xl border border-border bg-card p-6 shadow-xl shadow-primary/5">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-muted text-muted-foreground">
              <Shield className="h-4.5 w-4.5" />
            </span>
            <div>
              <h2 className="text-lg font-semibold tracking-tight">Acesso administrativo</h2>
              <p className="text-xs text-muted-foreground">Painel de testes — uso interno</p>
            </div>
          </div>

          <form onSubmit={submit} className="mt-5 space-y-3">
            <div className="space-y-1">
              <Label htmlFor="login" className="text-xs">
                Login
              </Label>
              <div className="relative">
                <User className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="login"
                  value={login}
                  onChange={(e) => setLogin(e.target.value)}
                  maxLength={120}
                  autoComplete="username"
                  className="pl-9"
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="senha" className="text-xs">
                Senha
              </Label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <PasswordInput
                  id="senha"
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  maxLength={120}
                  autoComplete="current-password"
                  className="pl-9"
                />
              </div>
            </div>
            <Button type="submit" disabled={busy} className="w-full">
              {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
              Entrar
            </Button>
          </form>
        </div>

        <Link
          to="/entrar"
          className="mt-4 inline-flex items-center gap-1 text-xs text-muted-foreground transition hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" />
          Voltar
        </Link>
      </div>
    </div>
  );
}
