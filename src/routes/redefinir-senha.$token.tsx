import { useState, type FormEvent } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Loader2, Lock, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { resetPassword } from "@/lib/api/auth.functions";

export const Route = createFileRoute("/redefinir-senha/$token")({
  head: () => ({
    meta: [
      { title: "LifeLine · Nova senha" },
      { name: "description", content: "Crie uma nova senha para sua conta LifeLine." },
    ],
  }),
  component: RedefinirSenhaPage,
});

function RedefinirSenhaPage() {
  const { token } = Route.useParams();
  const navigate = useNavigate();
  const [senha, setSenha] = useState("");
  const [confirma, setConfirma] = useState("");
  const [busy, setBusy] = useState(false);
  const [invalido, setInvalido] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (senha.length < 6) {
      toast.error("A senha precisa de pelo menos 6 caracteres.");
      return;
    }
    if (senha !== confirma) {
      toast.error("As senhas não coincidem.");
      return;
    }
    setBusy(true);
    try {
      const r = await resetPassword({ data: { token, novaSenha: senha } });
      if (r.ok) {
        toast.success("Senha alterada. Entre com a nova senha.");
        navigate({ to: "/login" });
      } else {
        setInvalido(true);
      }
    } catch {
      toast.error("Não consegui conectar agora. Tente novamente.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-6">
      <div className="w-full max-w-sm rounded-3xl border border-border bg-card p-7 shadow-xl shadow-primary/5">
        {invalido ? (
          <div className="text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500/10">
              <ShieldAlert className="h-6 w-6 text-amber-600" />
            </div>
            <h1 className="mt-4 text-lg font-semibold tracking-tight">Link inválido ou expirado</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Este link já foi usado ou passou dos 30 minutos. Peça um novo para continuar.
            </p>
            <Link
              to="/esqueci-senha"
              className="press mt-5 inline-flex w-full items-center justify-center rounded-xl brand-gradient px-4 py-2.5 text-sm font-medium text-primary-foreground"
            >
              Pedir um novo link
            </Link>
          </div>
        ) : (
          <>
            <h1 className="text-lg font-semibold tracking-tight">Criar nova senha</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Ao salvar, todas as sessões abertas nesta conta serão encerradas.
            </p>
            <form onSubmit={submit} className="mt-5 space-y-3">
              <div className="space-y-1">
                <Label htmlFor="senha" className="text-xs">
                  Nova senha
                </Label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="senha"
                    type="password"
                    value={senha}
                    onChange={(e) => setSenha(e.target.value)}
                    placeholder="Mínimo 6 caracteres"
                    maxLength={120}
                    className="pl-9"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="confirma" className="text-xs">
                  Confirmar senha
                </Label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="confirma"
                    type="password"
                    value={confirma}
                    onChange={(e) => setConfirma(e.target.value)}
                    placeholder="Repita a nova senha"
                    maxLength={120}
                    className="pl-9"
                  />
                </div>
              </div>
              <Button
                type="submit"
                disabled={busy}
                className="press w-full brand-gradient text-primary-foreground"
              >
                {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
                Salvar nova senha
              </Button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
