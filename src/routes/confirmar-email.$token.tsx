// Página pública (sem login) que o paciente abre a partir do link enviado
// pelo médico via WhatsApp para confirmar (ou recusar) a troca do e-mail
// cadastrado no prontuário. O token de uso único é a única credencial.

import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Activity, CheckCircle2, Loader2, Mail, ShieldAlert, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  confirmMyEmailChange,
  getPendingEmailChange,
  rejectMyEmailChange,
} from "@/lib/api/email-confirm.functions";

export const Route = createFileRoute("/confirmar-email/$token")({
  head: () => ({
    meta: [{ title: "LifeLine · Confirmar e-mail" }],
  }),
  component: ConfirmarEmailPage,
});

type Info = { nome: string; currentEmail: string | null; pendingEmail: string };
type Status = "loading" | "found" | "not_found" | "confirmed" | "rejected";

function ConfirmarEmailPage() {
  const { token } = Route.useParams();
  const [status, setStatus] = useState<Status>("loading");
  const [info, setInfo] = useState<Info | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getPendingEmailChange({ data: { token } }).then((r) => {
      if (!r.ok) return setStatus("not_found");
      setInfo({ nome: r.nome, currentEmail: r.currentEmail, pendingEmail: r.pendingEmail });
      setStatus("found");
    });
  }, [token]);

  const confirmar = async () => {
    setBusy(true);
    const r = await confirmMyEmailChange({ data: { token } });
    setBusy(false);
    if (r.ok) setStatus("confirmed");
  };

  const recusar = async () => {
    setBusy(true);
    await rejectMyEmailChange({ data: { token } });
    setBusy(false);
    setStatus("rejected");
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-6">
      <div className="w-full max-w-sm rounded-3xl border border-border bg-card p-6 shadow-xl">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl brand-gradient shadow-lg shadow-primary/40">
            <Activity className="h-5 w-5 text-primary-foreground" strokeWidth={2.5} />
          </div>
          <span className="font-semibold">LifeLine</span>
        </div>

        {status === "loading" && (
          <div className="mt-8 flex flex-col items-center py-6 text-center">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <p className="mt-3 text-sm text-muted-foreground">Verificando o link…</p>
          </div>
        )}

        {status === "not_found" && (
          <div className="mt-8 flex flex-col items-center py-6 text-center">
            <ShieldAlert className="h-8 w-8 text-amber-500" />
            <h1 className="mt-3 text-lg font-semibold">Link inválido ou já usado</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Peça ao seu médico para gerar um novo link de confirmação.
            </p>
          </div>
        )}

        {status === "found" && info && (
          <>
            <h1 className="mt-6 text-lg font-semibold tracking-tight">
              Olá, {info.nome.split(" ")[0]}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Seu médico pediu para atualizar o e-mail do seu cadastro. Confirme só se foi você quem pediu essa mudança.
            </p>
            <div className="mt-4 space-y-2 rounded-xl bg-muted/50 p-3 text-sm">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Mail className="h-3.5 w-3.5" />
                <span>Atual: {info.currentEmail ?? "nenhum cadastrado"}</span>
              </div>
              <div className="flex items-center gap-2 font-medium text-foreground">
                <Mail className="h-3.5 w-3.5 text-primary" />
                <span>Novo: {info.pendingEmail}</span>
              </div>
            </div>
            <div className="mt-5 flex gap-2">
              <Button variant="outline" className="flex-1" disabled={busy} onClick={recusar}>
                Não fui eu
              </Button>
              <Button
                className="flex-1 brand-gradient text-primary-foreground"
                disabled={busy}
                onClick={confirmar}
              >
                {busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                Confirmar
              </Button>
            </div>
          </>
        )}

        {status === "confirmed" && (
          <div className="mt-8 flex flex-col items-center py-6 text-center">
            <CheckCircle2 className="h-8 w-8 text-emerald-500" />
            <h1 className="mt-3 text-lg font-semibold">E-mail atualizado</h1>
            <p className="mt-1 text-sm text-muted-foreground">Pode fechar esta página.</p>
          </div>
        )}

        {status === "rejected" && (
          <div className="mt-8 flex flex-col items-center py-6 text-center">
            <XCircle className="h-8 w-8 text-rose-500" />
            <h1 className="mt-3 text-lg font-semibold">Troca cancelada</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Seu e-mail cadastrado não foi alterado. Avise seu médico se você não reconhece esse pedido.
            </p>
          </div>
        )}

        <Link to="/" className="mt-6 block text-center text-xs text-muted-foreground hover:text-foreground">
          lifeline.med.br
        </Link>
      </div>
    </div>
  );
}
