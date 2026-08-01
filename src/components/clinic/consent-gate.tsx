// LGP-01 — tela bloqueante de aceite de termos, compartilhada entre médico
// (/app) e paciente (/paciente/app). Só aparece quando a conta ainda não
// aceitou a versão vigente (CONSENT_VERSION) — contas novas por e-mail já
// aceitam no próprio formulário de cadastro; isto cobre Google OAuth, acesso
// rápido de demo e contas antigas migradas sem consentimento registrado.

import { useState } from "react";
import { Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { CONSENT_TEXT } from "@/lib/consent";

export function ConsentGate({
  onAccept,
  onLogout,
}: {
  onAccept: () => Promise<boolean>;
  onLogout: () => void;
}) {
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!checked || busy) return;
    setBusy(true);
    try {
      const ok = await onAccept();
      if (!ok) toast.error("Não consegui salvar seu aceite agora. Tente de novo.");
    } catch {
      toast.error("Não consegui salvar seu aceite agora. Tente de novo.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-6">
      <div className="w-full max-w-md rounded-3xl border border-border bg-card p-7 shadow-xl shadow-primary/5">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10">
          <ShieldCheck className="h-6 w-6 text-primary" />
        </div>
        <h1 className="mt-4 text-center text-lg font-semibold tracking-tight">Antes de continuar</h1>
        <p className="mt-1.5 text-center text-sm text-muted-foreground">
          Atualizamos nossos Termos de Uso e Política de Privacidade — precisamos do seu aceite
          explícito pra seguir.
        </p>
        <label className="mt-5 flex items-start gap-2.5 rounded-xl border border-border bg-muted/40 p-3 text-xs leading-relaxed text-foreground/90">
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0"
          />
          {CONSENT_TEXT}
        </label>
        <Button onClick={submit} disabled={!checked || busy} className="mt-4 w-full">
          {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
          Aceitar e continuar
        </Button>
        <button
          type="button"
          onClick={onLogout}
          className="mt-3 w-full text-center text-xs text-muted-foreground transition hover:text-foreground"
        >
          Sair
        </button>
      </div>
    </div>
  );
}
