import { useEffect, useRef, useState } from "react";
import { Loader2, AlertTriangle } from "lucide-react";

export type MemedPatientPayload = {
  idExterno: string;
  nome: string;
  sexo?: "Masculino" | "Feminino";
  cpf?: string;
  withoutCpf?: boolean;
  data_nascimento?: string; // formato dd/mm/aaaa
  telefone?: string;
  email?: string;
};

export type MemedWorkplacePayload = {
  city?: string;
  state?: string;
  local_name?: string;
  address?: string;
  phone?: string;
};

declare global {
  interface Window {
    MdSinapsePrescricao?: {
      event: { add: (name: string, cb: (module: { name: string }) => void) => void };
    };
    MdHub?: {
      command: { send: (module: string, command: string, payload: unknown) => Promise<unknown> };
      event: { add: (name: string, cb: (data: unknown) => void) => void };
      module: { show: (name: string) => Promise<unknown> };
    };
  }
}

export function MemedPrescriptionWidget({
  token,
  scriptUrl,
  patient,
  workplace,
  onPrescricaoImpressa,
}: {
  token: string;
  scriptUrl: string;
  patient: MemedPatientPayload;
  workplace?: MemedWorkplacePayload;
  onPrescricaoImpressa: (data: unknown) => void;
}) {
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const errorMsgRef = useRef<string>("Não consegui carregar o módulo da Memed.");
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    const prevScript = document.getElementById("memed-sinapse-script");
    prevScript?.remove(); // widget não suporta duas instâncias simultâneas na página

    const script = document.createElement("script");
    script.id = "memed-sinapse-script";
    script.src = scriptUrl;
    script.async = true;
    script.setAttribute("data-token", token);
    script.onerror = () => {
      if (cancelled) return;
      errorMsgRef.current =
        "Falha ao carregar o script da Memed. Fora do horário comercial, o ambiente de " +
        "homologação fica indisponível (0h–6h dias úteis e fins de semana).";
      setStatus("error");
    };
    document.body.appendChild(script);

    let pollId: ReturnType<typeof setInterval> | null = null;
    const attachModuleInit = () => {
      if (!window.MdSinapsePrescricao) return false;
      window.MdSinapsePrescricao.event.add("core:moduleInit", async (module) => {
        if (module.name !== "plataforma.prescricao" || cancelled) return;
        try {
          await window.MdHub!.command.send("plataforma.prescricao", "setPaciente", patient);
          if (workplace) {
            await window.MdHub!.command.send("plataforma.prescricao", "setWorkplace", workplace);
          }
          window.MdHub!.event.add("prescricaoImpressa", onPrescricaoImpressa);
          await window.MdHub!.module.show("plataforma.prescricao");
          if (!cancelled) setStatus("ready");
        } catch {
          if (!cancelled) {
            errorMsgRef.current = "Falha ao inicializar a prescrição com os dados do paciente.";
            setStatus("error");
          }
        }
      });
      return true;
    };

    if (!attachModuleInit()) {
      pollId = setInterval(() => {
        if (attachModuleInit() && pollId) clearInterval(pollId);
      }, 150);
    }

    return () => {
      cancelled = true;
      if (pollId) clearInterval(pollId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (status === "error") {
    return (
      <div className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2.5 text-xs text-red-700 ring-1 ring-red-200 dark:bg-red-950/40 dark:text-red-300 dark:ring-red-900">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>{errorMsgRef.current}</span>
      </div>
    );
  }

  return (
    <div>
      {status === "loading" && (
        <div className="flex min-h-[300px] items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando módulo Memed…
        </div>
      )}
      {/* min-width 820px é exigência conhecida do embed Memed — não reduzir.
          NÃO CONFIRMADO no /docs/primeiros-passos fornecido; validar contra
          a doc completa de frontend antes de remover esta nota. */}
      <div ref={containerRef} style={{ minWidth: 820, minHeight: 700 }} className="w-full" />
    </div>
  );
}
