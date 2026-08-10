import { useEffect, useRef, useState } from "react";
import { Loader2, AlertTriangle } from "lucide-react";

export type MemedPatientPayload = {
  idExterno: string;
  nome: string;
  sexo?: "Masculino" | "Feminino";
  cpf?: string;
  // RDC 1000/25: paciente estrangeiro entra por passaporte no lugar do CPF.
  passaporte?: string;
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
      // hide confirmado na doc oficial (doc.memed.com.br/docs/frontend/
      // comandos-mdhub/) — MdHub.module.hide('plataforma.prescricao').
      module: { show: (name: string) => Promise<unknown>; hide: (name: string) => Promise<unknown> };
    };
  }
}

export type MemedWidgetApi = {
  addItem: (payload: Record<string, unknown>) => Promise<unknown>;
  newPrescription: () => Promise<unknown>;
  hide: () => Promise<unknown>;
};

export function MemedPrescriptionWidget({
  token,
  scriptUrl,
  patient,
  workplace,
  onPrescricaoImpressa,
  onPrescricaoExcluida,
  onReady,
  openLabel,
  openHint,
  onStatusChange,
}: {
  token: string;
  scriptUrl: string;
  patient: MemedPatientPayload;
  workplace?: MemedWorkplacePayload;
  onPrescricaoImpressa: (data: unknown) => void;
  onPrescricaoExcluida?: (data: unknown) => void;
  onReady?: (api: MemedWidgetApi) => void;
  // Customização opcional do estado "pronto pra abrir" — usado pela bancada
  // de teste para deixar claro que abrir também vai carregar o cenário.
  // Sem esses props o texto padrão ("Abrir prescrição Memed") é preservado,
  // então o fluxo real de prescrição não é afetado.
  openLabel?: string;
  openHint?: string;
  // Notifica cada transição de status — opcional, usado pela bancada de
  // teste para alimentar o indicador de progresso. Não afeta o fluxo real.
  onStatusChange?: (status: "loading" | "ready-to-show" | "ready" | "error") => void;
}) {
  // "ready-to-show": módulo inicializado (setPaciente/setWorkplace feitos),
  // mas MdHub.module.show ainda não foi chamado — a doc pede explicitamente
  // que `show` rode no clique de um botão, não sozinho dentro do listener
  // de core:moduleInit.
  const [status, _setStatus] = useState<"loading" | "ready-to-show" | "ready" | "error">("loading");
  const errorMsgRef = useRef<string>("Não consegui carregar o módulo da Memed.");
  const containerRef = useRef<HTMLDivElement>(null);
  const abrirRef = useRef<() => void>(() => {});
  // Callbacks sempre atualizados sem re-montar o embed.
  const impressaRef = useRef(onPrescricaoImpressa);
  const excluidaRef = useRef(onPrescricaoExcluida);
  const readyRef = useRef(onReady);
  const statusChangeRef = useRef(onStatusChange);
  impressaRef.current = onPrescricaoImpressa;
  excluidaRef.current = onPrescricaoExcluida;
  readyRef.current = onReady;
  statusChangeRef.current = onStatusChange;
  const setStatus = (next: "loading" | "ready-to-show" | "ready" | "error") => {
    _setStatus(next);
    statusChangeRef.current?.(next);
  };
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
              // O link de compartilhamento nativo da Memed pula o código de
              // desbloqueio (§10 do handover) — o envio ao paciente é feito
              // pelo LifeLine via get-digital-prescription-link, que sempre
              // acompanha o link com o código.
              allowShareModal: false,
            });
          } catch {
            // toggles são um ajuste fino: falha aqui não invalida o módulo
          }
          abrirRef.current = () => {
            // Antes isso não tinha .catch() nem timeout: se a promise de
            // show() rejeitasse OU simplesmente nunca resolvesse (a Memed
            // desenha a tela dela direto no DOM, independente de nós — ela
            // pode aparecer visualmente mesmo sem essa promise nunca
            // confirmar nada pro nosso lado), o botão ficava preso em
            // "ready-to-show" pra sempre, sem nenhum sinal de erro. Isso
            // batia exatamente com o sintoma relatado: módulo abre
            // visualmente, mas addItem nunca dispara porque onReady nunca
            // chegou a ser chamado.
            let settled = false;
            const timeoutId = setTimeout(() => {
              if (settled || cancelled) return;
              settled = true;
              errorMsgRef.current =
                "A Memed não confirmou a abertura do módulo em 10s (module.show() ficou pendurado). " +
                "O módulo pode ter aparecido na tela mesmo assim — mas sem essa confirmação não é " +
                "seguro chamar addItem.";
              setStatus("error");
            }, 10_000);
            window.MdHub!.module
              .show("plataforma.prescricao")
              .then(() => {
                if (settled || cancelled) return;
                settled = true;
                clearTimeout(timeoutId);
                setStatus("ready");
                readyRef.current?.({
                  addItem: (payload) =>
                    window.MdHub!.command.send("plataforma.prescricao", "addItem", payload),
                  newPrescription: () =>
                    window.MdHub!.command.send("plataforma.prescricao", "newPrescription", {}),
                  hide: () => window.MdHub!.module.hide("plataforma.prescricao"),
                });
              })
              .catch((err: unknown) => {
                if (settled || cancelled) return;
                settled = true;
                clearTimeout(timeoutId);
                errorMsgRef.current = `A Memed rejeitou a abertura do módulo: ${
                  err instanceof Error ? err.message : String(err)
                }`;
                setStatus("error");
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
      // Sem logout + limpeza do DOM, o SDK deixava o iframe e o estado do
      // prescritor anterior na página: ao reabrir a receita (ou trocar de
      // paciente) o módulo reaparecia com o paciente antigo, ou nem
      // inicializava porque o MdHub já se considerava montado.
      try {
        void window.MdHub?.command.send("plataforma.sdk", "logout");
      } catch {
        // SDK pode nem ter carregado — nada a desfazer nesse caso
      }
      document.getElementById("memed-sinapse-script")?.remove();
      document
        .querySelectorAll(
          '#memed-container, [id^="memed"], iframe[src*="memed"], [class^="md-"], #mdhub-container',
        )
        .forEach((el) => {
          if (el.id !== "memed-sinapse-script") el.remove();
        });
      delete window.MdHub;
      delete window.MdSinapsePrescricao;
    };

    // Remonta quando muda o prescritor (token) ou o paciente — antes o embed
    // ficava preso ao primeiro paciente montado.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, scriptUrl, patientKey]);


  // Retry sem recarregar a página inteira: manda hide() pra tentar limpar
  // qualquer estado preso do lado da Memed antes de tentar show() de novo.
  // hide() usa o mesmo mecanismo de postMessage sem timeout do MdHub (ver
  // command.send no código-fonte oficial) — por isso corre contra um
  // timeout próprio de 2s aqui, pra não deixar o próprio botão de retry
  // travado também.
  async function tentarNovamente() {
    try {
      await Promise.race([
        window.MdHub?.module.hide("plataforma.prescricao") ?? Promise.resolve(),
        new Promise((resolve) => setTimeout(resolve, 2000)),
      ]);
    } catch {
      // módulo pode nem ter chegado a inicializar — nada a desfazer
    }
    setStatus("ready-to-show");
  }

  if (status === "error") {
    return (
      <div className="flex flex-col items-start gap-2.5 rounded-lg bg-red-50 px-3 py-2.5 text-xs text-red-700 ring-1 ring-red-200 dark:bg-red-950/40 dark:text-red-300 dark:ring-red-900">
        <div className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{errorMsgRef.current}</span>
        </div>
        <button
          type="button"
          onClick={() => void tentarNovamente()}
          className="rounded-lg bg-red-700 px-3 py-1.5 text-xs font-medium text-white transition hover:opacity-90 dark:bg-red-800"
        >
          Tentar de novo
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      {status === "loading" && (
        <div className="flex min-h-[300px] items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando módulo Memed…
        </div>
      )}
      {status === "ready-to-show" && (
        <div className="flex min-h-[300px] flex-col items-center justify-center gap-3">
          <p className="text-sm text-muted-foreground">
            {openHint ?? "Prescritor e paciente carregados — pronto para prescrever."}
          </p>
          <button
            type="button"
            onClick={() => abrirRef.current()}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90"
          >
            {openLabel ?? "Abrir prescrição Memed"}
          </button>
        </div>
      )}
      {/* min-width/height reduzidos pela metade de novo (640x700 → 320x350)
          a pedido do usuário — era originalmente 820x700, e o handover
          técnico da Memed (Lacuna #4) registra que 820 nunca foi confirmado
          em nenhuma página oficial da doc.
          MUDANÇA IMPORTANTE: antes esse container ficava com `hidden`
          (display:none) até status virar "ready". Suspeita nova, motivada
          pelo diagnóstico confirmado de que module.show() trava sem nunca
          resolver: se a Memed tenta medir/inicializar o iframe dela dentro
          (ou perto d)o nosso container no momento exato em que chamamos
          show(), um elemento com display:none tem 0×0 de dimensão e não
          participa de layout/paint — isso é uma causa clássica de SDKs de
          terceiro travarem esperando uma condição de visibilidade que
          nunca chega. Trocado por `absolute` fora da tela (mantém
          dimensões reais, só tira da área visível) em vez de display:none.
          Ainda é uma hipótese, não confirmada — se não resolver o
          travamento, volte para a versão com `hidden`. */}
      <div
        className={`w-full overflow-x-auto ${
          status === "ready" ? "" : "invisible absolute left-0 top-0 -z-10"
        }`}
      >
        <div ref={containerRef} style={{ minWidth: 320, minHeight: 350 }} className="w-full" />
      </div>
    </div>
  );
}
