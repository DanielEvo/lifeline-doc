// Bancada de teste de prescrição (/app/memed-simulacao): carrega o widget
// oficial da Memed com prescritor e paciente sintéticos e permite injetar
// cenários clínicos completos para comparar a PREVISÃO do LifeLine de quebra
// de documentos com o RESULTADO REAL devolvido pela Memed.
// Nada aqui grava em prontuário real.

import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ChevronDown,
  Code2,
  Copy,
  Download,
  ExternalLink,
  FlaskConical,
  Loader2,
  RefreshCw,
  Search,
  Wrench,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  MemedPrescriptionWidget,
  type MemedWidgetApi,
} from "@/components/clinic/memed-prescription-widget";
import { PrescricaoStepper, type PrescricaoStep } from "@/components/clinic/prescricao-stepper";
import { checkMemedKeys, getMemedSandboxConfig } from "@/lib/api/clinic.functions";
import {
  harvestMemedProtocolIds,
  listMyMemedCatalog,
  saveMyMedication,
  searchMemedIngredients,
} from "@/lib/api/memed-catalog.functions";
import { useClinic } from "@/lib/clinic-context";
import {
  predictRx,
  RX_LABEL,
  SCENARIOS,
  type FixtureItem,
} from "@/lib/prescription-fixtures";

// Mensagem específica por tipo de erro devolvido pela Memed — o `detail` bruto
// vai junto porque é onde aparece a causa real (ex.: "Cadastro do profissional
// com CRM ... já existe").
const MEMED_ERROR_MESSAGES: Record<string, string> = {
  unauthorized: "Sessão expirada — entre novamente para usar a bancada.",
  missing_profile:
    "Perfil do prescritor de teste está incompleto — não deveria acontecer no sandbox.",
  prescritor_inativo:
    "O prescritor sintético da bancada está com status Inativo na Memed. É preciso contatar o suporte Memed.",
  invalid_credentials:
    "As chaves foram rejeitadas nesta chamada específica, mesmo com o par ativo no check-key.",
  memed_error: "Erro inesperado ao falar com a Memed. Veja o detalhe abaixo.",
};

export const Route = createFileRoute("/app/memed-simulacao")({
  component: MemedSimulacao,
  head: () => ({
    meta: [
      { title: "Bancada de prescrição · LifeLine" },
      {
        name: "description",
        content:
          "Ambiente de teste do módulo de prescrição: cenários clínicos, catálogo de itens e comparação entre previsão e resultado real.",
      },
      { property: "og:title", content: "Bancada de prescrição · LifeLine" },
      {
        property: "og:description",
        content: "Teste cenários de receita e confira como os documentos são agrupados.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

type CatalogEntryView = {
  id: string;
  memedId: string | null;
  nome: string;
  tipo: string;
  posologiaPadrao: string | null;
  usos: number;
};

type ItensState = "pendente" | "carregando" | "carregado";
type ModuleStatus = "loading" | "ready-to-show" | "ready" | "error";

function MemedSimulacao() {
  const { token } = useClinic();
  const [loaded, setLoaded] = useState(false);
  const [scenarioIdx, setScenarioIdx] = useState(0);
  const [widgetApi, setWidgetApi] = useState<MemedWidgetApi | null>(null);
  const [moduleStatus, setModuleStatus] = useState<ModuleStatus>("loading");
  const [itensState, setItensState] = useState<ItensState>("pendente");
  const [resultado, setResultado] = useState<unknown>(null);
  // Diagnóstico da última tentativa de carregar itens — mostrado direto na
  // tela (não só no console) porque addItem pode simplesmente RESOLVER sem
  // o item aparecer de fato no módulo, sem lançar nenhuma exceção. Nesse
  // caso um painel que só aparece "quando há erro" nunca apareceria.
  const [diagCarga, setDiagCarga] = useState<{ item: string; ok: boolean; detalhe: string }[]>([]);
  const [verJson, setVerJson] = useState(false);
  const [ferramentasAbertas, setFerramentasAbertas] = useState(false);
  const [termo, setTermo] = useState("");
  const [novo, setNovo] = useState({ nome: "", via: "", controlClass: "" });
  const apiRef = useRef<MemedWidgetApi | null>(null);

  const keyCheck = useMutation({
    mutationFn: () => checkMemedKeys({ data: { token } }),
  });

  const sandbox = useMutation({
    mutationFn: () => getMemedSandboxConfig({ data: { token } }),
    onSuccess: (r) => {
      if (r.ok) setLoaded(true);
    },
  });
  const config = sandbox.data;

  const catalogo = useQuery({
    queryKey: ["memed-catalog"],
    queryFn: () => listMyMemedCatalog({ data: { token } }),
  });
  const entries: CatalogEntryView[] =
    catalogo.data && catalogo.data.ok ? (catalogo.data.itens as CatalogEntryView[]) : [];

  const cenario = SCENARIOS[scenarioIdx]!;

  const previsao = useMemo(() => {
    const grupos: Record<string, FixtureItem[]> = {};
    for (const item of cenario.itens) {
      const kind = predictRx(item);
      (grupos[kind] ??= []).push(item);
    }
    return grupos;
  }, [cenario]);

  // Cenário trocado com o módulo já aberto: os itens carregados eram do
  // cenário anterior, então sinaliza que é preciso recarregar em vez de
  // deixar o passo "itens carregados" mentindo sobre o que está no módulo.
  useEffect(() => {
    setItensState("pendente");
    setDiagCarga([]);
  }, [scenarioIdx]);

  const harvest = useMutation({
    mutationFn: () => harvestMemedProtocolIds({ data: { token } }),
    onSuccess: (r) => {
      if (r.ok) {
        toast.success(`${r.colhidos} item(ns) importado(s) da Memed.`);
        catalogo.refetch();
      } else if (r.error === "not_configured") {
        toast.error("Memed não configurada neste ambiente.");
      } else {
        toast.error("Não consegui falar com a Memed agora.");
      }
    },
  });

  const busca = useMutation({
    mutationFn: (t: string) => searchMemedIngredients({ data: { token, termo: t } }),
  });

  const salvarMed = useMutation({
    mutationFn: () =>
      saveMyMedication({
        data: {
          token,
          nome: novo.nome.trim(),
          via: novo.via.trim() || undefined,
          controlClass: novo.controlClass.trim() || undefined,
        },
      }),
    onSuccess: (r) => {
      if (r.ok) {
        toast.success("Medicamento salvo no seu catálogo.");
        setNovo({ nome: "", via: "", controlClass: "" });
        catalogo.refetch();
      }
    },
  });

  // Cache de buscas por nome na base real da Memed (/v1/drugs/ingredients),
  // pra não repetir a mesma busca de rede toda vez que o cenário é
  // recarregado nesta sessão. Nomes inventados do fixture não existem no
  // catálogo da Memed por definição — essa busca resolve pro princípio
  // ativo mais próximo, que É um item real e catalogado.
  const buscaMemedCacheRef = useRef<Map<string, string | null>>(new Map());

  async function resolverIdViaBuscaMemed(nome: string): Promise<string | null> {
    const cache = buscaMemedCacheRef.current;
    if (cache.has(nome)) return cache.get(nome)!;
    try {
      const r = await searchMemedIngredients({ data: { token, termo: nome } });
      const id = r.ok && r.itens.length > 0 ? r.itens[0]!.id : null;
      cache.set(nome, id);
      return id;
    } catch {
      cache.set(nome, null);
      return null;
    }
  }

  async function carregarNoMemed(api: MemedWidgetApi, opts?: { warmupMs?: number }) {
    setItensState("carregando");
    setDiagCarga([]);
    // Margem de segurança só no auto-carregamento (onReady): `module.show()`
    // resolve quando a Memed ACEITA o comando de abrir, não necessariamente
    // quando a UI interna do iframe já terminou de montar e está pronta pra
    // aceitar addItem. No fluxo antigo de 2 cliques essa folga sempre existia
    // de graça (o tempo entre abrir e a pessoa clicar em "carregar" à mão).
    if (opts?.warmupMs) {
      await new Promise((resolve) => setTimeout(resolve, opts.warmupMs));
    }

    // Resolve os IDs reais de TODOS os medicamentos em paralelo, antes do
    // loop de addItem (que precisa ser sequencial) — catálogo pessoal do
    // médico tem prioridade; sem match ali, busca a base real da Memed.
    // Só medicamentos passam por isso: a doc da Memed não lista nenhum
    // endpoint de busca separado para exames/laboratoriais, então esses
    // continuam indo por texto livre como antes (não são substância
    // controlada — não deveria ter a mesma exigência de catálogo).
    const idsPorItem = new Map<string, string | null>();
    await Promise.all(
      cenario.itens
        .filter((item) => item.tipo === "med")
        .map(async (item) => {
          const match = entries.find(
            (e) => e.nome.trim().toLowerCase() === item.nome.trim().toLowerCase() && e.memedId,
          );
          idsPorItem.set(item.key, match?.memedId ?? (await resolverIdViaBuscaMemed(item.nome)));
        }),
    );

    let comId = 0;
    let textoLivre = 0;
    let falhas = 0;
    const diag: { item: string; ok: boolean; detalhe: string }[] = [];
    for (const item of cenario.itens) {
      try {
        let payload: Record<string, unknown>;
        let origem: string;
        if (item.tipo === "lab" || item.tipo === "imagem") {
          const match = entries.find(
            (e) => e.nome.trim().toLowerCase() === item.nome.trim().toLowerCase() && e.memedId,
          );
          if (match?.memedId) {
            payload = {
              id: match.memedId,
              indicacoes: item.indicacoes ?? item.justificativa ?? "",
            };
            origem = `catálogo (${match.memedId})`;
            comId += 1;
          } else {
            payload = { nome: item.nome, posologia: item.indicacoes ?? item.justificativa ?? "" };
            origem = "texto livre";
            textoLivre += 1;
          }
        } else {
          const id = idsPorItem.get(item.key) ?? null;
          if (id) {
            payload = { id, posologia: item.posologia ?? "" };
            origem = `Memed (${id})`;
            comId += 1;
          } else {
            payload = { nome: item.nome, posologia: item.posologia ?? item.indicacoes ?? "" };
            origem = "texto livre — não encontrado na base da Memed";
            textoLivre += 1;
          }
        }
        // Guardado mesmo quando NÃO lança exceção: addItem pode resolver
        // "com sucesso" sem o item de fato aparecer no módulo — sem isso,
        // não teríamos como distinguir "resolveu vazio" de "resolveu com o
        // item confirmado" só olhando o toast de sucesso.
        const resposta = await api.addItem(payload);
        diag.push({
          item: item.nome,
          ok: true,
          detalhe: `[${origem}] ${JSON.stringify(resposta ?? null)}`,
        });
      } catch (e) {
        // Antes isso caía no mesmo balde de "texto livre" — uma falha real
        // de addItem virava sucesso mentiroso no toast, escondendo o
        // problema.
        falhas += 1;
        const detalhe = e instanceof Error ? e.message : JSON.stringify(e);
        diag.push({ item: item.nome, ok: false, detalhe });
      }
    }
    setItensState("carregado");
    setDiagCarga(diag);
    console.info("[bancada] diagnóstico do carregamento", diag);
    if (falhas > 0) {
      toast.error(
        `${falhas} item(ns) não entraram no módulo — veja o diagnóstico abaixo do botão "Recarregar itens".`,
      );
    } else {
      toast.success(
        `${comId} com id real da Memed, ${textoLivre} como texto livre — confira o diagnóstico abaixo.`,
      );
    }
  }

  function exportarSessao() {
    const blob = new Blob(
      [
        JSON.stringify(
          {
            cenario: cenario.nome,
            previsao: Object.fromEntries(
              Object.entries(previsao).map(([k, v]) => [k, v.map((i) => i.nome)]),
            ),
            resultadoReal: agruparResultado(resultado),
            payloadCru: resultado,
          },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `bancada-prescricao-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // config?.ok === false tem prioridade sobre tudo — sem isso, `loaded`
  // nunca vira true numa falha e o passo fica preso em "carregando" com o
  // spinner girando pra sempre, mesmo com o card de erro já visível.
  const attemptFailed = config?.ok === false;

  const currentStep: PrescricaoStep = attemptFailed
    ? "erro"
    : !loaded || moduleStatus === "loading"
      ? "carregando"
      : moduleStatus === "error"
        ? "erro"
        : moduleStatus === "ready-to-show"
          ? "pronto-pra-abrir"
          : itensState === "pendente"
            ? "aberto"
            : itensState === "carregando"
              ? "itens-carregados"
              : !resultado
                ? "aguardando-geracao"
                : "resultado-comparado";

  const stepSpinning =
    !attemptFailed &&
    (currentStep === "carregando" ||
      (currentStep === "itens-carregados" && itensState === "carregando") ||
      currentStep === "aguardando-geracao");

  return (
    <div className="flex min-h-screen flex-col">
      <div className="sticky top-0 z-20 flex items-center justify-center gap-2 bg-amber-500 px-4 py-2 text-center text-xs font-medium text-amber-950">
        🧪 AMBIENTE DE TESTE — dados fictícios, sem validade legal, não use com pacientes reais
      </div>

      <div className="mx-auto w-full max-w-7xl flex-1 space-y-4 p-6">
        <div className="flex items-center gap-2">
          <FlaskConical className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-semibold">Bancada de prescrição</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Monte cenários clínicos completos, injete no módulo oficial e compare a previsão de
          agrupamento do LifeLine com os documentos que a Memed realmente gera.
        </p>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={keyCheck.isPending}
            onClick={() => keyCheck.mutate()}
          >
            {keyCheck.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Verificar chaves Memed
          </Button>
          {keyCheck.data && (
            <span
              className={`text-xs ${
                keyCheck.data.ok && keyCheck.data.result.ok
                  ? "text-emerald-700 dark:text-emerald-400"
                  : "text-red-700 dark:text-red-400"
              }`}
            >
              {!keyCheck.data.ok
                ? "Sessão expirada."
                : keyCheck.data.result.ok
                  ? "Par de chaves ativo na Memed."
                  : keyCheck.data.result.error === "not_configured"
                    ? "Memed não configurada neste ambiente."
                    : keyCheck.data.result.error === "network_error"
                      ? "Sem resposta da Memed (provável indisponibilidade do ambiente)."
                      : `Chaves inválidas — ${keyCheck.data.result.detail ?? "verifique o par configurado"}.`}
            </span>
          )}
        </div>

        <Card className="p-3">
          <PrescricaoStepper current={currentStep} spinning={stepSpinning} />
        </Card>

        {/* ── GRID PRINCIPAL — cenário / módulo Memed / resultado ────────── */}
        <div className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)_300px]">
          {/* ── COLUNA A — cenário ─────────────────────────────────────── */}
          <Card className="space-y-3 p-4">
            <Label className="text-xs">Cenário</Label>
            <div className="flex flex-wrap gap-1.5">
              {SCENARIOS.map((s, i) => (
                <Button
                  key={s.nome}
                  variant={i === scenarioIdx ? "default" : "outline"}
                  size="sm"
                  onClick={() => setScenarioIdx(i)}
                >
                  {s.nome}
                </Button>
              ))}
            </div>
            <p className="text-[11px] leading-snug text-muted-foreground">{cenario.desc}</p>

            <div className="max-h-[65vh] space-y-2 overflow-y-auto pr-1">
              {cenario.itens.map((item) => {
                const kind = predictRx(item);
                return (
                  <div key={item.key} className="rounded-lg border p-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{item.nome}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {item.posologia ?? item.indicacoes ?? item.justificativa ?? "—"}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 shrink-0"
                        onClick={() => {
                          navigator.clipboard.writeText(item.nome);
                          toast.success("Copiado");
                        }}
                        aria-label={`Copiar ${item.nome}`}
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    <Badge variant="secondary" className="mt-1.5 text-[10px]">
                      {RX_LABEL[kind].label}
                      {RX_LABEL[kind].sub ? ` · ${RX_LABEL[kind].sub}` : ""}
                    </Badge>
                    {item.aviso && (
                      <div className="mt-1.5 flex items-start gap-1.5 rounded bg-amber-50 px-2 py-1.5 text-[11px] text-amber-800 ring-1 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-200 dark:ring-amber-900">
                        <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                        <span>{item.aviso}</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>

          {/* ── COLUNA B — módulo Memed ────────────────────────────────── */}
          <div className="space-y-3">
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
                homologação) no seu <code className="rounded bg-muted px-1">.env</code> e recarregue
                a página.
              </p>
            )}
            {config?.ok === false && config.error === "memed_offline" && config.likelyOffline && (
              <p className="rounded-lg bg-red-50 px-3 py-2.5 text-xs text-red-700 ring-1 ring-red-200 dark:bg-red-950/40 dark:text-red-300 dark:ring-red-900">
                Não consegui falar com a Memed agora. O ambiente de homologação (compartilhado entre
                parceiros) fica indisponível fora do horário comercial — 0h–6h em dias úteis, e o
                dia inteiro em fins de semana. Tente de novo dentro desse horário.
              </p>
            )}
            {config?.ok === false && config.error === "memed_offline" && !config.likelyOffline && (
              <p className="rounded-lg bg-red-50 px-3 py-2.5 text-xs text-red-700 ring-1 ring-red-200 dark:bg-red-950/40 dark:text-red-300 dark:ring-red-900">
                A Memed respondeu com erro de indisponibilidade (5xx/429), mas estamos dentro do
                horário comercial. Provável falha pontual do lado da Memed. Tente novamente em
                alguns minutos.
              </p>
            )}
            {config?.ok === false &&
              config.error !== "not_configured" &&
              config.error !== "memed_offline" && (
                <p className="rounded-lg bg-red-50 px-3 py-2.5 text-xs text-red-700 ring-1 ring-red-200 dark:bg-red-950/40 dark:text-red-300 dark:ring-red-900">
                  {MEMED_ERROR_MESSAGES[config.error] ?? `Erro: ${config.error}`}
                  {"detail" in config && config.detail ? ` — ${config.detail}` : ""}
                </p>
              )}

            {config && "prescriber" in config && config.prescriber && (
              <div className="rounded-lg bg-muted/40 px-3 py-2.5 text-[11px] leading-relaxed text-muted-foreground ring-1 ring-border">
                <p className="mb-1 font-medium text-foreground">
                  Dados enviados do prescritor de simulação
                </p>
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
                  <dt>ID externo</dt>
                  <dd className="font-mono">{config.prescriber.externalId}</dd>
                  <dt>Nome</dt>
                  <dd>{config.prescriber.nome}</dd>
                  <dt>CPF</dt>
                  <dd className="font-mono">{config.prescriber.cpfMasked}</dd>
                  <dt>CRM</dt>
                  <dd className="font-mono">
                    {config.prescriber.crm}/{config.prescriber.crmUf} · {config.prescriber.crmCidade}
                  </dd>
                  <dt>Especialidade</dt>
                  <dd>{config.prescriber.especialidade}</dd>
                  <dt>Nascimento</dt>
                  <dd className="font-mono">{config.prescriber.dataNascimento}</dd>
                  <dt>E-mail</dt>
                  <dd className="font-mono">{config.prescriber.email}</dd>
                </dl>
              </div>
            )}

            {/* NÃO usar Dialog/Radix aqui: o script da Memed injeta o iframe
                direto no DOM global (ver cleanup em
                memed-prescription-widget.tsx, que faz
                document.querySelectorAll em seletores como [id^="memed"] —
                não escopado a nenhum container React). Isso pôs os nós da
                Memed FORA da subárvore do DialogContent no DOM real, então
                o "fechar ao clicar fora" do Radix tratava qualquer clique
                dentro do próprio módulo Memed como clique fora do dialog —
                fechando-o, o que desmontava o widget e disparava o cleanup
                (logout + remoção dos nós) NO MEIO do carregamento dos
                itens. Por isso os itens paravam de carregar E qualquer
                clique voltava pra tela da bancada. Renderizado solto aqui,
                sem Dialog — a Memed vai continuar se comportando como um
                overlay de tela cheia por conta própria (isso é inerente ao
                SDK dela, não dá pra evitar de dentro do nosso container),
                mas pelo menos não corta a própria sessão no meio. */}
            {loaded && config?.ok && (
              <Card className="space-y-3 p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs text-muted-foreground">
                    Cenário: <span className="font-medium text-foreground">{cenario.nome}</span>
                  </p>
                  {moduleStatus === "ready" && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={itensState === "carregando"}
                      onClick={() => {
                        if (apiRef.current) void carregarNoMemed(apiRef.current);
                      }}
                    >
                      {itensState === "carregando" ? (
                        <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                      ) : (
                        <RefreshCw className="mr-1.5 h-4 w-4" />
                      )}
                      Recarregar itens
                    </Button>
                  )}
                </div>
                {diagCarga.length > 0 && (
                  <div className="rounded-lg bg-muted/50 px-3 py-2.5 text-xs ring-1 ring-border">
                    <p className="mb-1.5 font-medium text-foreground">
                      Diagnóstico do último carregamento — resposta bruta que a Memed devolveu pra
                      cada item (mesmo quando não deu erro, mas o item não apareceu):
                    </p>
                    <ul className="space-y-1 font-mono text-[11px]">
                      {diagCarga.map((d, idx) => (
                        <li
                          key={idx}
                          className={
                            d.ok
                              ? "text-emerald-700 dark:text-emerald-400"
                              : "text-red-700 dark:text-red-400"
                          }
                        >
                          {d.ok ? "✓" : "✗"} {d.item}: {d.detalhe || "(resposta vazia)"}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <MemedPrescriptionWidget
                  token={config.token}
                  scriptUrl={config.scriptUrl}
                  patient={config.patient}
                  openLabel={`Abrir e carregar: ${cenario.nome}`}
                  openHint="Isso abre o módulo Memed e já injeta todos os itens do cenário selecionado — sem precisar clicar em mais nada."
                  onStatusChange={setModuleStatus}
                  onReady={(api) => {
                    apiRef.current = api;
                    setWidgetApi(api);
                    void carregarNoMemed(api, { warmupMs: 800 });
                  }}
                  onPrescricaoImpressa={(data) => {
                    setResultado(data);
                    toast.success("Resultado recebido — nada foi salvo.");
                  }}
                  onPrescricaoExcluida={(data) => {
                    console.log("[bancada] prescricaoExcluida", data);
                    toast.message("Prescrição excluída no módulo.");
                  }}
                />
              </Card>
            )}
          </div>

          {/* ── COLUNA C — resultado real ──────────────────────────────── */}
          <Card className="space-y-3 p-4">
            <div className="flex items-center justify-between gap-2">
              <Label className="text-xs">Resultado real da Memed</Label>
              <Button variant="outline" size="sm" onClick={exportarSessao}>
                <Download className="mr-1.5 h-3.5 w-3.5" />
                Exportar
              </Button>
            </div>
            <ResultadoReal data={resultado} />
            {resultado != null && (
              <Collapsible open={verJson} onOpenChange={setVerJson}>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="sm" className="w-full justify-between">
                    <span className="flex items-center gap-1.5">
                      <Code2 className="h-3.5 w-3.5" />
                      Ver JSON completo
                    </span>
                    <ChevronDown
                      className={`h-3.5 w-3.5 transition-transform ${verJson ? "rotate-180" : ""}`}
                    />
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <pre className="mt-2 max-h-72 overflow-auto rounded bg-muted p-2 text-[10px]">
                    {JSON.stringify(resultado, null, 2)}
                  </pre>
                </CollapsibleContent>
              </Collapsible>
            )}
          </Card>
        </div>

        {/* ── FERRAMENTAS SECUNDÁRIAS DO CATÁLOGO ─────────────────────── */}
        <Collapsible open={ferramentasAbertas} onOpenChange={setFerramentasAbertas}>
          <Card className="p-4">
            <CollapsibleTrigger asChild>
              <button type="button" className="flex w-full items-center justify-between text-left">
                <span className="flex items-center gap-1.5 text-sm font-medium">
                  <Wrench className="h-4 w-4 text-muted-foreground" />
                  Ferramentas do catálogo
                </span>
                <ChevronDown
                  className={`h-4 w-4 text-muted-foreground transition-transform ${
                    ferramentasAbertas ? "rotate-180" : ""
                  }`}
                />
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-4 grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label className="text-xs">Sugestões (mais usados)</Label>
                {entries.length === 0 ? (
                  <p className="text-[11px] text-muted-foreground">
                    Catálogo vazio — colha os IDs dos protocolos ou salve um medicamento seu.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {entries.slice(0, 20).map((e) => (
                      <Button
                        key={e.id}
                        variant="outline"
                        size="sm"
                        disabled={!widgetApi}
                        onClick={async () => {
                          try {
                            await apiRef.current?.addItem(
                              e.memedId
                                ? { id: e.memedId, posologia: e.posologiaPadrao ?? "" }
                                : { nome: e.nome, posologia: e.posologiaPadrao ?? "" },
                            );
                            toast.success(`${e.nome} adicionado.`);
                          } catch {
                            toast.error("Não consegui adicionar este item.");
                          }
                        }}
                      >
                        {e.nome}
                      </Button>
                    ))}
                  </div>
                )}

                <div className="space-y-2 border-t pt-3">
                  <Label className="text-xs">Colher IDs dos protocolos</Label>
                  <p className="text-[11px] leading-snug text-muted-foreground">
                    Monte o cenário no módulo, salve como Protocolo, e clique aqui para importar os
                    IDs reais da Memed.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={harvest.isPending}
                    onClick={() => harvest.mutate()}
                  >
                    {harvest.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                    Colher IDs dos protocolos
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-xs">Não encontrei o item</Label>
                <div className="flex gap-2">
                  <Input
                    value={termo}
                    onChange={(e) => setTermo(e.target.value)}
                    placeholder="Buscar princípio ativo"
                    className="text-sm"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    disabled={termo.trim().length < 2 || busca.isPending}
                    onClick={() => busca.mutate(termo.trim())}
                    aria-label="Buscar princípio ativo"
                  >
                    {busca.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Search className="h-4 w-4" />
                    )}
                  </Button>
                </div>
                {busca.data?.ok && (
                  <ul className="space-y-1">
                    {busca.data.itens.length === 0 && (
                      <li className="text-[11px] text-muted-foreground">Nada encontrado.</li>
                    )}
                    {busca.data.itens.map((i: { id: string; nome: string }) => (
                      <li key={i.id} className="text-xs">
                        {i.nome}
                      </li>
                    ))}
                  </ul>
                )}
                {busca.data && !busca.data.ok && (
                  <p className="text-[11px] text-muted-foreground">
                    Busca indisponível neste ambiente.
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label className="text-xs">Salvar um medicamento seu</Label>
                <Input
                  value={novo.nome}
                  onChange={(e) => setNovo({ ...novo, nome: e.target.value })}
                  placeholder="Nome"
                  className="text-sm"
                />
                <div className="flex gap-2">
                  <Input
                    value={novo.via}
                    onChange={(e) => setNovo({ ...novo, via: e.target.value })}
                    placeholder="Via"
                    className="text-sm"
                  />
                  <Input
                    value={novo.controlClass}
                    onChange={(e) => setNovo({ ...novo, controlClass: e.target.value })}
                    placeholder="Classe (C1, B1…)"
                    className="text-sm"
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    disabled={novo.nome.trim().length < 2 || salvarMed.isPending}
                    onClick={() => salvarMed.mutate()}
                  >
                    {salvarMed.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                    Salvar no catálogo
                  </Button>
                  {novo.nome.trim().length >= 2 && (
                    <Button variant="ghost" size="sm" asChild>
                      <a
                        href={`https://www.google.com/search?q=${encodeURIComponent(
                          `${novo.nome} bula anvisa portaria 344`,
                        )}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                        Conferir classe
                      </a>
                    </Button>
                  )}
                </div>
              </div>
            </CollapsibleContent>
          </Card>
        </Collapsible>
      </div>
    </div>
  );
}

type MemedResultItem = { nome?: string; tipo?: string; receituario?: string };

function agruparResultado(data: unknown): Record<string, MemedResultItem[]> | null {
  const meds = (data as { medicamentos?: unknown } | null)?.medicamentos;
  if (!Array.isArray(meds)) return null;
  const grupos: Record<string, MemedResultItem[]> = {};
  for (const m of meds as MemedResultItem[]) {
    const key = String(m?.receituario ?? "sem receituário");
    (grupos[key] ??= []).push(m);
  }
  return grupos;
}

function ResultadoReal({ data }: { data: unknown }) {
  if (data == null) {
    return (
      <p className="text-[11px] text-muted-foreground">
        Gere uma prescrição no módulo para ver como a Memed agrupou os documentos.
      </p>
    );
  }
  const grupos = agruparResultado(data);
  if (!grupos || Object.keys(grupos).length === 0) {
    return (
      <pre className="max-h-72 overflow-auto rounded bg-muted p-2 text-[10px]">
        {JSON.stringify(data, null, 2)}
      </pre>
    );
  }
  return (
    <div className="space-y-2">
      {Object.entries(grupos).map(([receituario, itens]) => (
        <div key={receituario} className="rounded-lg border p-2.5">
          <p className="text-xs font-medium">{receituario}</p>
          <ul className="mt-1 space-y-0.5">
            {itens.map((i, idx) => (
              <li key={idx} className="text-[11px] text-muted-foreground">
                {i.nome ?? "—"}
                {i.tipo ? ` · ${i.tipo}` : ""}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
