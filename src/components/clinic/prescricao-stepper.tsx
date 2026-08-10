import { Check, Loader2 } from "lucide-react";

export type PrescricaoStep =
  | "carregando"
  | "pronto-pra-abrir"
  | "aberto"
  | "itens-carregados"
  | "aguardando-geracao"
  | "resultado-comparado";

const STEPS: { key: PrescricaoStep; label: string }[] = [
  { key: "carregando", label: "Carregando" },
  { key: "pronto-pra-abrir", label: "Pronto pra abrir" },
  { key: "aberto", label: "Aberto" },
  { key: "itens-carregados", label: "Itens carregados" },
  { key: "aguardando-geracao", label: "Aguardando geração" },
  { key: "resultado-comparado", label: "Resultado comparado" },
];

// Presentacional puro: recebe a etapa atual da bancada de teste e destaca
// onde a pessoa está no fluxo carregando → ... → resultado comparado.
export function PrescricaoStepper({
  current,
  spinning = false,
}: {
  current: PrescricaoStep;
  spinning?: boolean;
}) {
  const currentIdx = STEPS.findIndex((s) => s.key === current);

  return (
    <ol className="flex flex-wrap items-center gap-x-1 gap-y-2 text-[11px]">
      {STEPS.map((step, idx) => {
        const done = idx < currentIdx;
        const active = idx === currentIdx;
        return (
          <li key={step.key} className="flex items-center gap-1">
            <span
              className={`flex items-center gap-1 rounded-full px-2 py-1 font-medium transition-colors ${
                active
                  ? "bg-primary text-primary-foreground"
                  : done
                    ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300"
                    : "bg-muted text-muted-foreground"
              }`}
            >
              {done && <Check className="h-3 w-3" />}
              {active && spinning && <Loader2 className="h-3 w-3 animate-spin" />}
              {step.label}
            </span>
            {idx < STEPS.length - 1 && <span className="text-muted-foreground/40">→</span>}
          </li>
        );
      })}
    </ol>
  );
}
