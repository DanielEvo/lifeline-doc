// Rota de QA/dev: exercita o widget real da Memed com prescritor e paciente
// sintéticos, sem depender do CRM do médico logado e sem gravar nada em
// prontuário real. Link discreto no rodapé do /app — não é fluxo clínico.

import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { FlaskConical, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { MemedPrescriptionWidget } from "@/components/clinic/memed-prescription-widget";
import { getMemedSandboxConfig } from "@/lib/api/clinic.functions";
import { useClinic } from "@/lib/clinic-context";

export const Route = createFileRoute("/app/memed-simulacao")({
  component: MemedSimulacao,
});

function MemedSimulacao() {
  const { token } = useClinic();
  const [loaded, setLoaded] = useState(false);

  const sandbox = useMutation({
    mutationFn: () => getMemedSandboxConfig({ data: { token } }),
    onSuccess: (r) => {
      if (r.ok) setLoaded(true);
    },
  });

  const config = sandbox.data;

  return (
    <div className="flex min-h-screen flex-col">
      <div className="sticky top-0 z-20 flex items-center justify-center gap-2 bg-amber-500 px-4 py-2 text-center text-xs font-medium text-amber-950">
        🧪 AMBIENTE DE TESTE — dados fictícios, sem validade legal, não use com pacientes reais
      </div>

      <div className="mx-auto w-full max-w-3xl flex-1 space-y-4 p-6">
        <div className="flex items-center gap-2">
          <FlaskConical className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-semibold">Simulação do widget Memed</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Carrega o módulo oficial da Memed com um prescritor e um paciente fictícios — ferramenta
          de QA para validar o embed sem depender de CRM cadastrado. Nada aqui é salvo no
          prontuário.
        </p>

        {!loaded && (
          <Button onClick={() => sandbox.mutate()} disabled={sandbox.isPending}>
            {sandbox.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Carregar simulação
          </Button>
        )}

        {config?.ok === false && config.error === "not_configured" && (
          <p className="rounded-lg bg-muted/50 px-3 py-2.5 text-xs text-muted-foreground">
            Memed não configurada neste ambiente — cole{" "}
            <code className="rounded bg-muted px-1">MEMED_API_KEY</code> e{" "}
            <code className="rounded bg-muted px-1">MEMED_SECRET_KEY</code> (chaves de
            homologação) no seu <code className="rounded bg-muted px-1">.env</code> e recarregue a
            página.
          </p>
        )}
        {config?.ok === false && config.error !== "not_configured" && (
          <p className="rounded-lg bg-red-50 px-3 py-2.5 text-xs text-red-700 ring-1 ring-red-200 dark:bg-red-950/40 dark:text-red-300 dark:ring-red-900">
            Não consegui falar com a Memed agora. O ambiente de homologação (compartilhado entre
            parceiros) fica indisponível fora do horário comercial — 0h–6h em dias úteis, e o dia
            inteiro em fins de semana. Tente de novo dentro desse horário.
          </p>
        )}

        {loaded && config?.ok && (
          <MemedPrescriptionWidget
            token={config.token}
            scriptUrl={config.scriptUrl}
            patient={config.patient}
            onPrescricaoImpressa={(data) => {
              console.log("[memed-simulacao] prescricaoImpressa", data);
              toast.success("Simulação concluída — nada foi salvo.");
            }}
          />
        )}
      </div>
    </div>
  );
}
