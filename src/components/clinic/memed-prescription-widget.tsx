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
      // payload opcional: comandos como "logout" (plataforma.sdk) não levam
      // nenhum — a doc oficial chama `send("plataforma.sdk", "logout")` sem
      // 3º argumento.
      command: { send: (module: string, command: string, payload?: unknown) => Promise<unknown> };
      event: { add: (name: string, cb: (data: unknown) => void) => void };
      module: { show: (name: string) => Promise<unknown> };
    };
  }
}

export type MemedWidgetApi = {
  addItem: (payload: Record<string, unknown>) => Promise<unknown>;
  newPrescription: () => Promise<unknown>;
};

export function MemedPrescriptionWidget({
  token,
  scriptUrl,
  patient,
  workplace,
  onPrescricaoImpressa,
  onPrescricaoExcluida,
  onReady,
}: {
  token: string;
  scriptUrl: string;
  patient: MemedPatientPayload;
  workplace?: MemedWorkplacePayload;
  onPrescricaoImpressa: (data: unknown) => void;
  onPrescricaoExcluida?: (data: unknown) => void;
  onReady?: (api: MemedWidgetApi) => void;
}) {
  // "ready-to-show": módulo inicializado (setPaciente/setWorkplace feitos),
  // mas MdHub.module.show ainda não foi chamado — a doc pede explicitamente
  // que `show` rode no clique de um botão, não sozinho dentro do listener
  // de core:moduleInit.
  const [status, setStatus] = useState<"loading" | "ready-to-show" | "ready" | "error">("loading");
  const errorMsgRef = useRef<string>("Não consegui carregar o módulo da Memed.");
  const containerRef = useRef<HTMLDivElement>(null);
  const abrirRef = useRef<() => void>(() => {});
  // Callbacks sempre atualizados sem re-montar o embed.
  const impressaRef = useRef(onPrescricaoImpressa);
  const excluidaRef = useRef(onPrescricaoExcluida);
  const readyRef = useRef(onReady);
  impressaRef.current = onPrescricaoImpressa;
  excluidaRef.current = onPrescricaoExcluida;
  readyRef.current = onReady;
  // Evita despachar duas vezes o mesmo evento quando a Memed reemite.
  const handledRef = useRef<Set<string>>(new Set());

  const patientKey = patient.idExterno;

  useEffect(() => {
    let cancelled = false;
    handledRef.current = new Set();
    setStatus("loading");
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

    const eventKey = (name: string, data: unknown) => {
      const d = data as { prescricao?: { id?: string | number } };
      return `${name}:${d?.prescricao?.id ?? JSON.stringify(data)?.slice(0, 80)}`;
    };
    const onImpressa = (data: unknown) => {
      if (cancelled) return;
      const k = eventKey("impressa", data);
      if (handledRef.current.has(k)) return;
      handledRef.current.add(k);
      impressaRef.current(data);
    };
    const onExcluida = (data: unknown) => {
      if (cancelled) return;
      const k = eventKey("excluida", data);
      if (handledRef.current.has(k)) return;
      handledRef.current.add(k);
      excluidaRef.current?.(data);
    };

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
          window.MdHub!.event.add("prescricaoImpressa", onImpressa);
          // Evento marcado como obrigatório pela Memed para autorização das
          // credenciais de produção — precisa estar sempre registrado.
          window.MdHub!.event.add("prescricaoExcluida", onExcluida);
          try {
            await window.MdHub!.command.send("plataforma.prescricao", "setFeatureToggle", {
              historyPrescription: false,
              dropdownSync: false,
              guidesOnboarding: false,
              enableAlerts: true,
              setPatientAllergy: true,
            });
          } catch {
            // toggles são um ajuste fino: falha aqui não invalida o módulo
          }
          abrirRef.current = () => {
            void window.MdHub!.module.show("plataforma.prescricao").then(() => {
              if (cancelled) return;
              setStatus("ready");
              readyRef.current?.({
                addItem: (payload) =>
                  window.MdHub!.command.send("plataforma.prescricao", "addItem", payload),
                newPrescription: () =>
                  window.MdHub!.command.send("plataforma.prescricao", "newPrescription", {}),
              });
            });
          };
          if (!cancelled) setStatus("ready-to-show");
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
      // cancelled corta qualquer callback tardio: o MdHub não expõe remoção de
      // listener, então o guard é o que impede evento duplicado depois de
      // fechar o dialog ou trocar de paciente.
      cancelled = true;
      if (pollId) clearInterval(pollId);
      document.getElementById("memed-sinapse-script")?.remove();
    };
    // Remonta quando muda o prescritor (token) ou o paciente — antes o embed
    // ficava preso ao primeiro paciente montado.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, scriptUrl, patientKey]);


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
      {status === "ready-to-show" && (
        <div className="flex min-h-[300px] flex-col items-center justify-center gap-3">
          <p className="text-sm text-muted-foreground">
            Prescritor e paciente carregados — pronto para prescrever.
          </p>
          <button
            type="button"
            onClick={() => abrirRef.current()}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90"
          >
            Abrir prescrição Memed
          </button>
        </div>
      )}
      {/* min-width 820px é exigência conhecida do embed Memed — não reduzir.
          O wrapper rola horizontalmente para não estourar o dialog em telas
          menores que 900px (notebook), em vez de cortar o módulo. Fica
          sempre montado no DOM (a Memed pode depender disso pra encontrar
          onde inserir o iframe) — só escondido visualmente até o clique em
          "Abrir prescrição", que é quando `MdHub.module.show` de fato roda. */}
      <div className={`w-full overflow-x-auto ${status === "ready" ? "" : "hidden"}`}>
        <div ref={containerRef} style={{ minWidth: 820, minHeight: 700 }} className="w-full" />
      </div>
    </div>
  );
}
