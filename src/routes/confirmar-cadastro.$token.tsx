import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { CheckCircle2, Loader2, MailWarning } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  confirmEmailVerification,
  resendVerificationEmail,
} from "@/lib/api/auth.functions";
import { primeiroNome } from "@/lib/clinic-types";

export const Route = createFileRoute("/confirmar-cadastro/$token")({
  head: () => ({
    meta: [
      { title: "LifeLine · Confirmar cadastro" },
      { name: "description", content: "Confirme seu e-mail para ativar sua conta LifeLine." },
    ],
  }),
  component: ConfirmarCadastroPage,
});

function ConfirmarCadastroPage() {
  const { token } = Route.useParams();
  const navigate = useNavigate();
  const [estado, setEstado] = useState<"carregando" | "ok" | "erro">("carregando");
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [reenviando, setReenviando] = useState(false);
  const rodou = useRef(false);

  useEffect(() => {
    if (rodou.current) return;
    rodou.current = true;
    confirmEmailVerification({ data: { token } })
      .then((r) => {
        if (r.ok) {
          setNome(r.nome);
          setEstado("ok");
        } else setEstado("erro");
      })
      .catch(() => setEstado("erro"));
  }, [token]);

  const reenviar = async () => {
    if (!email || reenviando) return;
    setReenviando(true);
    try {
      await resendVerificationEmail({ data: { email, origin: window.location.origin } });
      toast.success("Se este e-mail estiver pendente, enviamos um novo link.");
    } catch {
      toast.error("Não consegui reenviar agora. Tente novamente.");
    } finally {
      setReenviando(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-6">
      <div className="w-full max-w-sm rounded-3xl border border-border bg-card p-7 text-center shadow-xl shadow-primary/5">
        {estado === "carregando" && (
          <>
            <Loader2 className="mx-auto h-7 w-7 animate-spin text-primary" />
            <p className="mt-4 text-sm text-muted-foreground">Confirmando seu e-mail…</p>
          </>
        )}

        {estado === "ok" && (
          <>
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/10">
              <CheckCircle2 className="h-6 w-6 text-emerald-600" />
            </div>
            <h1 className="mt-4 text-lg font-semibold tracking-tight">E-mail confirmado</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Tudo certo{nome ? `, ${primeiroNome(nome)}` : ""}. Sua conta já está ativa.
            </p>
            <Button
              type="button"
              onClick={() => navigate({ to: "/login" })}
              className="press mt-5 w-full brand-gradient text-primary-foreground"
            >
              Ir para o login
            </Button>
          </>
        )}

        {estado === "erro" && (
          <>
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500/10">
              <MailWarning className="h-6 w-6 text-amber-600" />
            </div>
            <h1 className="mt-4 text-lg font-semibold tracking-tight">Link inválido ou expirado</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Informe seu e-mail e enviamos um novo link de confirmação.
            </p>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="voce@email.com"
              maxLength={160}
              className="mt-4"
            />
            <Button
              type="button"
              variant="outline"
              onClick={reenviar}
              disabled={reenviando || !email}
              className="press mt-3 w-full"
            >
              {reenviando ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
              Reenviar e-mail de verificação
            </Button>
            <Link
              to="/login"
              className="mt-4 block text-xs text-muted-foreground transition hover:text-foreground"
            >
              Voltar para o login
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
