// Tela de desbloqueio do admin. Rota pública dentro do layout /admin,
// mas o beforeLoad do layout NÃO exige sessão nesta pathname.

import { useState, type FormEvent } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { adminUnlock } from "@/lib/api/admin.functions";

export const Route = createFileRoute("/admin/entrar")({
  head: () => ({ meta: [{ title: "LifeLine · Admin" }] }),
  component: AdminEntrar,
});

function AdminEntrar() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy || !password) return;
    setBusy(true);
    try {
      const r = await adminUnlock({ data: { password } });
      if (r.ok) {
        toast.success("Acesso liberado.");
        navigate({ to: "/admin" });
      } else {
        toast.error(r.error);
      }
    } catch {
      toast.error("Falha na conexão.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-6">
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-sm"
      >
        <div className="mb-4 flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" />
          <div>
            <h1 className="text-base font-semibold">Painel de admin</h1>
            <p className="text-xs text-muted-foreground">
              Acesso restrito à equipe de desenvolvimento.
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">Senha mestra</Label>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
            autoComplete="current-password"
          />
        </div>

        <Button type="submit" className="mt-4 w-full" disabled={busy}>
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Entrar
        </Button>
      </form>
    </div>
  );
}
