import { Check, Loader2, X } from "lucide-react";

export type PrescricaoStep =
  | "carregando"
  | "erro"
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
  // "erro" não é uma etapa própria do fluxo — é uma parada no passo
  // "Carregando" (é onde toda falha de config acontece hoje). Usa o mesmo
  // índice, só troca o ícone/cor pra vermelho em vez de girar pra sempre.
  const isError = current === "erro";
  const effectiveCurrent = isError ? "carregando" : current;
  const currentIdx = STEPS.findIndex((s) => s.key === effectiveCurrent);

  return (
    <ol className="flex flex-wrap items-center gap-x-1 gap-y-2 text-[11px]">
      {STEPS.map((step, idx) => {
        const done = idx < currentIdx;
        const active = idx === currentIdx;
        const activeError = active && isError;
        return (
          <li key={step.key} className="flex items-center gap-1">
            <span
              className={`flex items-center gap-1 rounded-full px-2 py-1 font-medium transition-colors ${
                activeError
                  ? "bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-300"
                  : active
                    ? "bg-primary text-primary-foreground"
                    : done
                      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300"
                      : "bg-muted text-muted-foreground"
              }`}
            >
              {done && <Check className="h-3 w-3" />}
              {activeError && <X className="h-3 w-3" />}
              {active && !isError && spinning && <Loader2 className="h-3 w-3 animate-spin" />}
              {activeError ? "Erro" : step.label}
            </span>
            {idx < STEPS.length - 1 && <span className="text-muted-foreground/40">→</span>}
          </li>
        );
      })}
    </ol>
  );
}
