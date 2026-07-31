// Bancada de teste de prescrição (/app/memed-simulacao): carrega o widget
// oficial da Memed com prescritor e paciente sintéticos e permite injetar
// cenários clínicos completos para comparar a PREVISÃO do LifeLine de quebra
// de documentos com o RESULTADO REAL devolvido pela Memed.
// Nada aqui grava em prontuário real.

import { useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  Copy,
  Download,
  ExternalLink,
  FlaskConical,
  Loader2,
  Search,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  MemedPrescriptionWidget,
  type MemedWidgetApi,
} from "@/components/clinic/memed-prescription-widget";
import { getMemedSandboxConfig } from "@/lib/api/clinic.functions";
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

function MemedSimulacao() {
  const { token } = useClinic();
  const [loaded, setLoaded] = useState(false);
  const [scenarioIdx, setScenarioIdx] = useState(0);
  const [widgetApi, setWidgetApi] = useState<MemedWidgetApi | null>(null);
  const [resultado, setResultado] = useState<unknown>(null);
  const [termo, setTermo] = useState("");
  const [novo, setNovo] = useState({ nome: "", via: "", controlClass: "" });
  const apiRef = useRef<MemedWidgetApi | null>(null);

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

  async function carregarNoMemed() {
    const api = apiRef.current;
    if (!api) return;
    let doCatalogo = 0;
    let livres = 0;
    for (const item of cenario.itens) {
      const match = entries.find(
        (e) => e.nome.trim().toLowerCase() === item.nome.trim().toLowerCase() && e.memedId,
      );
      try {
        if (match?.memedId) {
          await api.addItem(
            item.tipo === "lab" || item.tipo === "imagem"
              ? { id: match.memedId, indicacoes: item.indicacoes ?? item.justificativa ?? "" }
              : { id: match.memedId, posologia: item.posologia ?? "" },
          );
          doCatalogo += 1;
        } else {
          await api.addItem({ nome: item.nome, posologia: item.posologia ?? item.indicacoes ?? "" });
          livres += 1;
        }
      } catch {
        livres += 1;
      }
    }
    toast.success(`${doCatalogo} do catálogo, ${livres} como texto livre`);
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

        <div className="grid gap-6 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
          {/* ── COLUNA ESQUERDA — bancada ─────────────────────────────── */}
          <div className="space-y-4">
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

              <div className="space-y-2">
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

              <Button
                className="w-full"
                disabled={!widgetApi}
                onClick={() => void carregarNoMemed()}
              >
                <Sparkles className="mr-1.5 h-4 w-4" />
                Carregar no Memed
              </Button>
              {!widgetApi && (
                <p className="text-[11px] text-muted-foreground">
                  Disponível assim que o módulo ao lado terminar de carregar.
                </p>
              )}
            </Card>

            <Card className="space-y-2 p-4">
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
            </Card>

            <Card className="space-y-2 p-4">
              <Label className="text-xs">Colher IDs dos protocolos</Label>
              <p className="text-[11px] leading-snug text-muted-foreground">
                Monte o cenário no módulo ao lado, salve como Protocolo, e clique aqui para importar
                os IDs reais da Memed.
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
            </Card>

            <Card className="space-y-3 p-4">
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

              <div className="space-y-2 border-t pt-3">
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
            </Card>
          </div>

          {/* ── COLUNA DIREITA — widget + resultado ───────────────────── */}
          <div className="space-y-4">
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
            {config?.ok === false && config.error !== "not_configured" && (
              <p className="rounded-lg bg-red-50 px-3 py-2.5 text-xs text-red-700 ring-1 ring-red-200 dark:bg-red-950/40 dark:text-red-300 dark:ring-red-900">
                Não consegui falar com a Memed agora. O ambiente de homologação (compartilhado entre
                parceiros) fica indisponível fora do horário comercial — 0h–6h em dias úteis, e o
                dia inteiro em fins de semana. Tente de novo dentro desse horário.
              </p>
            )}

            {loaded && config?.ok && (
              <MemedPrescriptionWidget
                token={config.token}
                scriptUrl={config.scriptUrl}
                patient={config.patient}
                onReady={(api) => {
                  apiRef.current = api;
                  setWidgetApi(api);
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
            )}

            <Card className="space-y-3 p-4">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-xs">Resultado real da Memed</Label>
                <Button variant="outline" size="sm" onClick={exportarSessao}>
                  <Download className="mr-1.5 h-3.5 w-3.5" />
                  Exportar sessão
                </Button>
              </div>
              <ResultadoReal data={resultado} />
            </Card>
          </div>
        </div>
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
