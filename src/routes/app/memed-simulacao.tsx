// Bancada de teste de prescrição (/app/memed-simulacao): carrega o widget
// oficial da Memed com prescritor e paciente sintéticos e permite injetar
// cenários clínicos completos para comparar a PREVISÃO do LifeLine de quebra
// de documentos com o RESULTADO REAL devolvido pela Memed. Também exercita,
// num único lugar, praticamente toda a superfície documentada da Memed
// (alergias, condições especiais, histórico, protocolos, template de
// impressão) — pra permitir testar/depurar qualquer parte da integração
// sem precisar reproduzir o cenário num prontuário real.
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
  FileDown,
  FlaskConical,
  History,
  Link2,
  Loader2,
  Pencil,
  Plus,
  Printer,
  RefreshCw,
  RotateCcw,
  Search,
  Trash2,
  Upload,
  Wrench,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  MemedPrescriptionWidget,
  type MemedLogEntry,
  type MemedWidgetApi,
} from "@/components/clinic/memed-prescription-widget";
import { PrescricaoStepper, type PrescricaoStep } from "@/components/clinic/prescricao-stepper";
import {
  checkMemedKeys,
  getMemedSandboxConfig,
  getMemedSandboxDefaults,
} from "@/lib/api/clinic.functions";
import {
  harvestMemedProtocolIds,
  listMyMemedCatalog,
  saveMyMedication,
  searchMemedIngredients,
} from "@/lib/api/memed-catalog.functions";
import {
  createMemedBenchProtocol,
  deleteMemedBenchPrescription,
  deleteMemedBenchProtocol,
  getMemedBenchDigitalLink,
  getMemedBenchHistory,
  getMemedBenchPrescriptionPdf,
  getMemedBenchPrintOptions,
  listMemedBenchProtocols,
  setMemedBenchPrintOptions,
  uploadMemedBenchPrintTemplate,
} from "@/lib/api/memed-bench.functions";
import { useClinic } from "@/lib/clinic-context";
import { predictRx, RX_LABEL, SCENARIOS, type FixtureItem } from "@/lib/prescription-fixtures";

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

const CONDICOES = [
  { id: 1, label: "Aeronauta" },
  { id: 2, label: "Atleta (antidoping)" },
  { id: 3, label: "Gestante" },
  { id: 4, label: "Lactante" },
];

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

type PrescriberForm = {
  externalId: string;
  nome: string;
  crm: string;
  crmUf: string;
  cpfMedico: string;
  especialidade: string;
  crmCidade: string;
  dataNascimento: string;
  email: string;
};

const BLANK_PRESCRIBER: PrescriberForm = {
  externalId: "",
  nome: "",
  crm: "",
  crmUf: "",
  cpfMedico: "",
  especialidade: "",
  crmCidade: "",
  dataNascimento: "",
  email: "",
};

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

  // ── Editor rápido do prescritor de teste ──────────────────────────────
  // Dados 100% fictícios — nunca associados a um médico real. Editáveis pra
  // permitir corrigir na hora quando a Memed rejeita o cadastro sintético
  // (CPF já usado sob outro external_id, CRM inválido etc.), sem precisar
  // mexer em variável de ambiente e reimplantar.
  const [prescriber, setPrescriber] = useState<PrescriberForm>(BLANK_PRESCRIBER);
  const [prescriberTouched, setPrescriberTouched] = useState(false);

  const defaults = useQuery({
    queryKey: ["memed-sandbox-defaults"],
    queryFn: () => getMemedSandboxDefaults({ data: { token } }),
  });
  useEffect(() => {
    if (defaults.data?.ok && !prescriberTouched) {
      setPrescriber(defaults.data.defaults);
    }
  }, [defaults.data, prescriberTouched]);

  // ── Log unificado de comandos MdHub e eventos ─────────────────────────
  const [logEntries, setLogEntries] = useState<MemedLogEntry[]>([]);
  const [logAberto, setLogAberto] = useState(false);
  const logErros = logEntries.filter((e) => !e.ok).length;
  function registrarLog(entry: MemedLogEntry) {
    setLogEntries((prev) => [entry, ...prev].slice(0, 80));
    if (!entry.ok) setLogAberto(true);
  }

  // ── Alergias e condições especiais (fazem parte do setPaciente/setAllergy) ──
  const [alergiaTermo, setAlergiaTermo] = useState("");
  const [alergiasSelecionadas, setAlergiasSelecionadas] = useState<{ id: string; nome: string }[]>([]);
  const [condicoes, setCondicoes] = useState<number[]>([]);
  const buscaAlergia = useMutation({
    mutationFn: (t: string) => searchMemedIngredients({ data: { token, termo: t } }),
  });

  // ── Toolbar do módulo ──────────────────────────────────────────────────
  const [reabrirId, setReabrirId] = useState("");
  const [temaEscolhido, setTemaEscolhido] = useState<"1" | "2" | "3" | "4">("1");

  // ── Histórico e protocolos ─────────────────────────────────────────────
  const [historicoAberto, setHistoricoAberto] = useState(false);
  const historico = useMutation({
    mutationFn: () => getMemedBenchHistory({ data: { token, overrides: prescriber } }),
  });
  const excluirRx = useMutation({
    mutationFn: (id: string) =>
      deleteMemedBenchPrescription({ data: { token, overrides: prescriber, prescriptionId: id } }),
    onSuccess: (r) => {
      if (r.ok) {
        toast.success("Prescrição excluída na Memed.");
        historico.mutate();
      } else {
        toast.error("Não consegui excluir essa prescrição.");
      }
    },
  });
  const protocolos = useMutation({
    mutationFn: () => listMemedBenchProtocols({ data: { token } }),
  });
  const excluirProtocolo = useMutation({
    mutationFn: (id: string) => deleteMemedBenchProtocol({ data: { token, protocolId: id } }),
    onSuccess: (r) => {
      if (r.ok) {
        toast.success("Protocolo excluído.");
        protocolos.mutate();
      } else {
        toast.error("Não consegui excluir esse protocolo.");
      }
    },
  });
  const [novoProtocolo, setNovoProtocolo] = useState({ nome: "", medicamentos: "" });
  const criarProtocolo = useMutation({
    mutationFn: () =>
      createMemedBenchProtocol({
        data: {
          token,
          nome: novoProtocolo.nome.trim(),
          medicamentos: novoProtocolo.medicamentos
            .split("\n")
            .map((l) => l.trim())
            .filter(Boolean)
            .map((nome) => ({ nome })),
        },
      }),
    onSuccess: (r) => {
      if (r.ok) {
        toast.success("Protocolo institucional criado — visível a todos os prescritores.");
        setNovoProtocolo({ nome: "", medicamentos: "" });
        protocolos.mutate();
      } else {
        toast.error("Não consegui criar o protocolo.");
      }
    },
  });

  // ── Template de receita / impressão ───────────────────────────────────
  const [templateAberto, setTemplateAberto] = useState(false);
  const [printForm, setPrintForm] = useState({
    titulo: "",
    titulo_cor: "",
    subtitulo: "",
    subtitulo_cor: "",
    fonte: "",
    tamanho_fonte: "",
    rodape: "",
    rodape_cor: "",
  });
  const printOptions = useMutation({
    mutationFn: () => getMemedBenchPrintOptions({ data: { token, overrides: prescriber } }),
    onSuccess: (r) => {
      if (r.ok) {
        const o = r.options;
        setPrintForm({
          titulo: String(o.titulo ?? ""),
          titulo_cor: String(o.titulo_cor ?? ""),
          subtitulo: String(o.subtitulo ?? ""),
          subtitulo_cor: String(o.subtitulo_cor ?? ""),
          fonte: String(o.fonte ?? ""),
          tamanho_fonte: o.tamanho_fonte != null ? String(o.tamanho_fonte) : "",
          rodape: String(o.rodape ?? ""),
          rodape_cor: String(o.rodape_cor ?? ""),
        });
      }
    },
  });
  const salvarPrint = useMutation({
    mutationFn: () =>
      setMemedBenchPrintOptions({
        data: {
          token,
          overrides: prescriber,
          options: {
            titulo: printForm.titulo || undefined,
            titulo_cor: printForm.titulo_cor || undefined,
            subtitulo: printForm.subtitulo || undefined,
            subtitulo_cor: printForm.subtitulo_cor || undefined,
            fonte: printForm.fonte || undefined,
            tamanho_fonte: printForm.tamanho_fonte ? Number(printForm.tamanho_fonte) : undefined,
            rodape: printForm.rodape || undefined,
            rodape_cor: printForm.rodape_cor || undefined,
          },
        },
      }),
    onSuccess: (r) => {
      if (r.ok) toast.success("Configuração de impressão salva no prescritor sintético.");
      else toast.error("Não consegui salvar a configuração de impressão.");
    },
  });
  const uploadTemplate = useMutation({
    mutationFn: async (file: File) => {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });
      return uploadMemedBenchPrintTemplate({
        data: { token, overrides: prescriber, pdfBase64: base64, fileName: file.name },
      });
    },
    onSuccess: (r) => {
      if (r.ok) toast.success("Timbre importado — cabeçalho/rodapé recortados pela Memed.");
      else toast.error("Não consegui importar o PDF de timbre.");
    },
  });
  const [dictForm, setDictForm] = useState({
    protocolPlural: "",
    protocolSingular: "",
    protocolSaved: "",
  });

  // ── Link e PDF de uma prescrição gerada nesta sessão ──────────────────
  const linkRx = useMutation({
    mutationFn: (id: string) =>
      getMemedBenchDigitalLink({ data: { token, overrides: prescriber, prescriptionId: id } }),
  });
  const pdfRx = useMutation({
    mutationFn: (id: string) =>
      getMemedBenchPrescriptionPdf({ data: { token, overrides: prescriber, prescriptionId: id } }),
  });
  const resultadoId = (() => {
    const r = resultado as { prescricao?: { id?: string | number } } | null;
    return r?.prescricao?.id != null ? String(r.prescricao.id) : null;
  })();

  const keyCheck = useMutation({
    mutationFn: () => checkMemedKeys({ data: { token } }),
  });

  const sandbox = useMutation({
    mutationFn: () => getMemedSandboxConfig({ data: { token, overrides: prescriber } }),
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
  const buscaMemedCacheRef = useRef<
    Map<string, { id: string | null; motivo: string; viaBusca: boolean }>
  >(new Map());

  // Antes isso devolvia só string|null — uma busca que FALHOU (rede,
  // not_configured, erro da Memed) virava idêntica a "não achou nada",
  // escondendo a causa real do mesmo jeito que o catch mudo de addItem
  // escondia falhas antes. Agora carrega o motivo junto.
  // A busca (/drugs/ingredients) devolve o PRINCÍPIO ATIVO, não a
  // apresentação — o `id` encontrado pode não ser específico pra essa
  // dosagem (diferente de um id vindo do catálogo pessoal do médico, que é
  // sempre uma apresentação exata). Sem repetir a dosagem em algum lugar,
  // a prescrição pode sair sem indicar "25mg" em canto nenhum. Extrai a
  // parte removida na busca (tudo a partir do primeiro token com dígito)
  // pra recolocar na posologia quando o id vier da busca.
  function extrairDosagem(nome: string): string {
    const m = nome.match(/\s+(\S*\d[\s\S]*)$/);
    return m ? m[1]!.trim() : "";
  }

  async function resolverIdViaBuscaMemed(
    nome: string,
  ): Promise<{ id: string | null; motivo: string; viaBusca: boolean }> {
    const cache = buscaMemedCacheRef.current;
    if (cache.has(nome)) return cache.get(nome)!;
    // A Memed devolveu "Any ingredients match with terms..." pra
    // "Amitriptilina 25mg" — /drugs/ingredients busca por PRINCÍPIO ATIVO,
    // não pelo nome completo com dosagem. Tenta o nome cheio primeiro, e
    // se não achar, tenta versões progressivamente mais curtas: sem a
    // dosagem/forma (tudo antes do primeiro token com dígito), depois só
    // a primeira palavra como último recurso.
    const semDosagem = nome.replace(/\s+\S*\d\S*.*$/, "").trim();
    const primeiraPalavra = nome.trim().split(/\s+/)[0] ?? nome;
    const candidatos = Array.from(
      new Set([nome.trim(), semDosagem, primeiraPalavra].filter((t) => t.length >= 2)),
    );

    let resultado: { id: string | null; motivo: string; viaBusca: boolean } = {
      id: null,
      motivo: "nenhum termo de busca válido",
      viaBusca: true,
    };
    for (const termo of candidatos) {
      try {
        const r = await searchMemedIngredients({ data: { token, termo } });
        if (r.ok && r.itens.length > 0) {
          resultado = {
            id: r.itens[0]!.id,
            motivo: `achado buscando "${termo}": "${r.itens[0]!.nome}" (${r.itens.length} candidato(s))`,
            viaBusca: true,
          };
          break;
        }
        const detalheBruto = !r.ok && "detail" in r && r.detail ? ` — ${r.detail}` : "";
        resultado = {
          id: null,
          motivo: r.ok
            ? `"${termo}" não retornou resultado`
            : `"${termo}" falhou (${r.error})${detalheBruto}`,
          viaBusca: true,
        };
      } catch (e) {
        resultado = {
          id: null,
          motivo: `"${termo}" lançou exceção: ${e instanceof Error ? e.message : String(e)}`,
          viaBusca: true,
        };
      }
    }
    cache.set(nome, resultado);
    return resultado;
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

    // Alergias marcadas na bancada — enviadas uma vez, assim que o módulo
    // está pronto pra aceitar comandos.
    if (alergiasSelecionadas.length > 0) {
      try {
        await api.setAllergy(alergiasSelecionadas.map((a) => Number(a.id)).filter((n) => !Number.isNaN(n)));
      } catch {
        // já registrado no log de comandos — não bloqueia o carregamento dos itens
      }
    }

    // Resolve os IDs reais de TODOS os medicamentos em paralelo, antes do
    // loop de addItem (que precisa ser sequencial) — catálogo pessoal do
    // médico tem prioridade; sem match ali, busca a base real da Memed.
    // Só medicamentos passam por isso: a doc da Memed não lista nenhum
    // endpoint de busca separado para exames/laboratoriais, então esses
    // continuam indo por texto livre como antes (não são substância
    // controlada — não deveria ter a mesma exigência de catálogo).
    const idsPorItem = new Map<string, { id: string | null; motivo: string; viaBusca: boolean }>();
    await Promise.all(
      cenario.itens
        .filter((item) => item.tipo === "med")
        .map(async (item) => {
          const match = entries.find(
            (e) => e.nome.trim().toLowerCase() === item.nome.trim().toLowerCase() && e.memedId,
          );
          if (match?.memedId) {
            idsPorItem.set(item.key, {
              id: match.memedId,
              motivo: "catálogo pessoal",
              viaBusca: false,
            });
            return;
          }
          idsPorItem.set(item.key, await resolverIdViaBuscaMemed(item.nome));
        }),
    );

    // addItem usa MdHub.command.send por baixo — confirmado no código-fonte
    // oficial (src/command.js) que esse mecanismo NÃO TEM NENHUM TIMEOUT: se
    // a resposta via postMessage nunca chegar, a promise fica pendurada pra
    // sempre. Sem esse timeout, um item travado parava o loop inteiro.
    async function tentarAddItem(payload: Record<string, unknown>): Promise<unknown> {
      const timeoutMsg = "addItem não respondeu em 8s (comando MdHub sem timeout nativo travou)";
      return Promise.race([
        api.addItem(payload),
        new Promise((_, reject) => setTimeout(() => reject(new Error(timeoutMsg)), 8_000)),
      ]);
    }

    let comId = 0;
    let textoLivre = 0;
    let falhas = 0;
    const diag: { item: string; ok: boolean; detalhe: string }[] = [];
    for (const item of cenario.itens) {
      try {
        let payload: Record<string, unknown>;
        let origem: string;
        // Só o id do catálogo PESSOAL do médico (colhido de um protocolo
        // real salvo dentro da Memed) é garantidamente uma apresentação
        // comercial exata. O id de uma busca por princípio ativo às vezes
        // é só o ingrediente genérico — confirmado ao vivo: a Memed
        // recusa com "Não foi possível inserir o item na prescrição"
        // quando isso acontece. Só nesse caso vale tentar de novo em
        // texto livre — id do catálogo pessoal falhando é um problema
        // real que não deveria ser escondido por um fallback silencioso.
        let fallbackTextoLivre: Record<string, unknown> | null = null;

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
          } else {
            payload = { nome: item.nome, posologia: item.indicacoes ?? item.justificativa ?? "" };
            origem = "texto livre";
          }
        } else {
          const resolvido = idsPorItem.get(item.key);
          const textoLivrePadrao = {
            nome: item.nome,
            posologia: item.posologia ?? item.indicacoes ?? "",
          };
          if (resolvido?.id) {
            // id vindo de busca é do princípio ativo, não necessariamente
            // da apresentação exata — repõe a dosagem na posologia pra não
            // sair uma prescrição de "Amitriptilina" sem dizer "25mg" em
            // lugar nenhum. id do catálogo pessoal já é uma apresentação
            // específica, então não precisa disso.
            const dosagem = resolvido.viaBusca ? extrairDosagem(item.nome) : "";
            const posologiaComDosagem = dosagem
              ? `${dosagem} — ${item.posologia ?? ""}`
              : (item.posologia ?? "");
            payload = { id: resolvido.id, posologia: posologiaComDosagem };
            origem = `Memed (${resolvido.id}) — ${resolvido.motivo}`;
            if (resolvido.viaBusca) fallbackTextoLivre = textoLivrePadrao;
          } else {
            payload = textoLivrePadrao;
            origem = `texto livre — ${resolvido?.motivo ?? "sem tentativa de busca"}`;
          }
        }

        // Guardado mesmo quando NÃO lança exceção: addItem pode resolver
        // "com sucesso" sem o item de fato aparecer no módulo — sem isso,
        // não teríamos como distinguir "resolveu vazio" de "resolveu com o
        // item confirmado" só olhando o toast de sucesso.
        let resposta: unknown;
        try {
          resposta = await tentarAddItem(payload);
          if ("id" in payload) comId += 1;
          else textoLivre += 1;
        } catch (eId) {
          if (!fallbackTextoLivre) throw eId;
          resposta = await tentarAddItem(fallbackTextoLivre);
          origem = `texto livre — id rejeitado pela Memed: ${
            eId instanceof Error ? eId.message : String(eId)
          }`;
          textoLivre += 1;
        }
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

        {/* ── EDITOR RÁPIDO DO PRESCRITOR DE TESTE ────────────────────── */}
        <Card className="space-y-3 border-l-4 border-l-amber-500 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Pencil className="h-4 w-4 text-amber-600" />
              <span className="text-sm font-medium">Prescritor de teste</span>
              <Badge variant="secondary" className="text-[10px] uppercase tracking-wide">
                dados fictícios — nunca um médico real
              </Badge>
            </div>
            {prescriberTouched && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  if (defaults.data?.ok) setPrescriber(defaults.data.defaults);
                  setPrescriberTouched(false);
                }}
              >
                <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                Restaurar padrão
              </Button>
            )}
          </div>
          <p className="text-[11px] leading-snug text-muted-foreground">
            Se a Memed rejeitar o cadastro sintético (CPF já usado sob outro ID, CRM inválido etc.),
            ajuste os campos abaixo e recarregue — não precisa mexer em variável de ambiente.
          </p>
          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
            {(
              [
                ["externalId", "ID externo"],
                ["nome", "Nome"],
                ["crm", "Registro (CRM)"],
                ["crmUf", "UF"],
                ["cpfMedico", "CPF (teste)"],
                ["especialidade", "Especialidade"],
                ["crmCidade", "Cidade"],
                ["dataNascimento", "Nascimento (yyyy-mm-dd)"],
                ["email", "E-mail"],
              ] as [keyof PrescriberForm, string][]
            ).map(([field, label]) => (
              <div key={field} className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">{label}</Label>
                <Input
                  value={prescriber[field]}
                  onChange={(e) => {
                    setPrescriber({ ...prescriber, [field]: e.target.value });
                    setPrescriberTouched(true);
                  }}
                  className="h-8 text-xs font-mono"
                />
              </div>
            ))}
          </div>
          <Button
            size="sm"
            disabled={sandbox.isPending}
            onClick={() => {
              setLoaded(false);
              sandbox.mutate();
            }}
          >
            {sandbox.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            {loaded ? "Recarregar com estes dados" : "Carregar simulação"}
          </Button>
        </Card>

        {/* ── LOG DE COMANDOS E EVENTOS — colapsado por padrão, abre sozinho em erro ── */}
        <Collapsible open={logAberto} onOpenChange={setLogAberto}>
          <Card className="p-3">
            <CollapsibleTrigger asChild>
              <button type="button" className="flex w-full items-center justify-between text-left">
                <span className="flex items-center gap-1.5 text-sm font-medium">
                  <Code2 className="h-4 w-4 text-muted-foreground" />
                  Log de comandos e eventos
                  {logEntries.length > 0 && (
                    <Badge variant="secondary" className="text-[10px]">
                      {logEntries.length}
                    </Badge>
                  )}
                  {logErros > 0 && (
                    <Badge className="bg-red-100 text-[10px] text-red-800 dark:bg-red-950/50 dark:text-red-300">
                      {logErros} falha(s)
                    </Badge>
                  )}
                </span>
                <ChevronDown
                  className={`h-4 w-4 text-muted-foreground transition-transform ${logAberto ? "rotate-180" : ""}`}
                />
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-3">
              {logEntries.length === 0 ? (
                <p className="text-[11px] text-muted-foreground">
                  Nenhum comando enviado ainda — carregue a simulação para começar a registrar.
                </p>
              ) : (
                <ul className="max-h-72 space-y-1 overflow-y-auto font-mono text-[11px]">
                  {logEntries.map((e, idx) => (
                    <li
                      key={idx}
                      className={e.ok ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400"}
                    >
                      {e.ok ? "✓" : "✗"} [{e.kind}] {e.label}
                      <span className="text-muted-foreground"> — {e.detail || "(sem detalhe)"}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CollapsibleContent>
          </Card>
        </Collapsible>

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

            <div className="max-h-[45vh] space-y-2 overflow-y-auto pr-1">
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

            {/* Alergias e condições — fazem parte do setPaciente/setAllergy */}
            <div className="space-y-2 border-t pt-3">
              <Label className="text-xs">Alergias do paciente teste</Label>
              <div className="flex gap-2">
                <Input
                  value={alergiaTermo}
                  onChange={(e) => setAlergiaTermo(e.target.value)}
                  placeholder="Buscar princípio ativo"
                  className="h-8 text-xs"
                />
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  disabled={alergiaTermo.trim().length < 2 || buscaAlergia.isPending}
                  onClick={() => buscaAlergia.mutate(alergiaTermo.trim())}
                  aria-label="Buscar princípio ativo para alergia"
                >
                  {buscaAlergia.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Search className="h-3.5 w-3.5" />
                  )}
                </Button>
              </div>
              {buscaAlergia.data?.ok && (
                <div className="flex flex-wrap gap-1.5">
                  {buscaAlergia.data.itens.slice(0, 6).map((i: { id: string; nome: string }) => (
                    <Button
                      key={i.id}
                      variant="outline"
                      size="sm"
                      className="h-6 text-[10px]"
                      onClick={() => {
                        if (alergiasSelecionadas.some((a) => a.id === i.id)) return;
                        setAlergiasSelecionadas([...alergiasSelecionadas, i]);
                        setAlergiaTermo("");
                      }}
                    >
                      <Plus className="mr-1 h-3 w-3" />
                      {i.nome}
                    </Button>
                  ))}
                </div>
              )}
              {alergiasSelecionadas.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {alergiasSelecionadas.map((a) => (
                    <Badge key={a.id} variant="secondary" className="gap-1 text-[10px]">
                      {a.nome}
                      <button
                        type="button"
                        onClick={() =>
                          setAlergiasSelecionadas(alergiasSelecionadas.filter((x) => x.id !== a.id))
                        }
                        aria-label={`Remover ${a.nome}`}
                      >
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
              <p className="text-[10px] text-muted-foreground">
                Enviadas via setAllergy assim que o módulo abre — recarregue os itens para reenviar.
              </p>

              <Label className="mt-2 block text-xs">Condições especiais</Label>
              <div className="space-y-1.5">
                {CONDICOES.map((c) => (
                  <label key={c.id} className="flex items-center gap-2 text-[11px]">
                    <Checkbox
                      checked={condicoes.includes(c.id)}
                      onCheckedChange={(v) =>
                        setCondicoes(v ? [...condicoes, c.id] : condicoes.filter((x) => x !== c.id))
                      }
                    />
                    {c.label}
                  </label>
                ))}
              </div>
              <p className="text-[10px] text-muted-foreground">
                Vai junto do setPaciente inicial — mude e recarregue a simulação para aplicar.
              </p>
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
                  <span className="mt-1.5 block font-medium">
                    Ajuste os dados do prescritor de teste acima e tente de novo.
                  </span>
                </p>
              )}

            {config && "prescriber" in config && config.prescriber && (
              <div className="rounded-lg bg-muted/40 px-3 py-2.5 text-[11px] leading-relaxed text-muted-foreground ring-1 ring-border">
                <p className="mb-1 font-medium text-foreground">
                  Confirmação — o que a Memed recebeu (ecoado pelo servidor)
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
                    {config.prescriber.crm}/{config.prescriber.crmUf} ·{" "}
                    {config.prescriber.crmCidade}
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

                {/* Toolbar de ações do módulo — desabilitada até o widget
                    estar pronto, mesmo padrão de "Recarregar itens" acima. */}
                <div className="flex flex-wrap items-center gap-1.5 border-y py-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-[11px]"
                    disabled={moduleStatus !== "ready"}
                    onClick={() => void apiRef.current?.newPrescription()}
                  >
                    Nova prescrição
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-[11px]"
                    disabled={moduleStatus !== "ready"}
                    onClick={() => void apiRef.current?.hide()}
                  >
                    Fechar módulo
                  </Button>
                  <div className="flex items-center gap-1">
                    <Input
                      value={reabrirId}
                      onChange={(e) => setReabrirId(e.target.value)}
                      placeholder="ID da prescrição"
                      className="h-7 w-32 text-[11px]"
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-[11px]"
                      disabled={moduleStatus !== "ready" || reabrirId.trim().length === 0}
                      onClick={() => void apiRef.current?.viewPrescription(reabrirId.trim())}
                    >
                      Reabrir por ID
                    </Button>
                  </div>
                  <div className="flex items-center gap-1">
                    <select
                      value={temaEscolhido}
                      onChange={(e) => setTemaEscolhido(e.target.value as "1" | "2" | "3" | "4")}
                      className="h-7 rounded-md border border-input bg-background px-1.5 text-[11px]"
                    >
                      <option value="1">Tema 1</option>
                      <option value="2">Tema 2</option>
                      <option value="3">Tema 3</option>
                      <option value="4">Tema 4</option>
                    </select>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-[11px]"
                      disabled={moduleStatus !== "ready"}
                      onClick={() =>
                        void apiRef.current?.activateReceiptTheme(Number(temaEscolhido) as 1 | 2 | 3 | 4)
                      }
                    >
                      Ativar tema de receituário
                    </Button>
                  </div>
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
                  patient={{ ...config.patient, categoriesConditions: condicoes.length ? condicoes : undefined }}
                  openLabel={`Abrir e carregar: ${cenario.nome}`}
                  openHint="Isso abre o módulo Memed e já injeta todos os itens do cenário selecionado — sem precisar clicar em mais nada."
                  onStatusChange={setModuleStatus}
                  onCommandLog={registrarLog}
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

            {resultadoId && (
              <div className="flex flex-wrap gap-1.5 border-t pt-2.5">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-[11px]"
                  disabled={linkRx.isPending}
                  onClick={() => linkRx.mutate(resultadoId)}
                >
                  <Link2 className="mr-1.5 h-3 w-3" />
                  Link + código de desbloqueio
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-[11px]"
                  disabled={pdfRx.isPending}
                  onClick={() => pdfRx.mutate(resultadoId)}
                >
                  <FileDown className="mr-1.5 h-3 w-3" />
                  Baixar PDF
                </Button>
              </div>
            )}
            {linkRx.data && (
              <p className="text-[11px] text-muted-foreground">
                {linkRx.data.ok ? (
                  <>
                    <a href={linkRx.data.link} target="_blank" rel="noreferrer" className="text-primary underline">
                      abrir link
                    </a>{" "}
                    · código: <span className="font-mono">{linkRx.data.unlockCode}</span>
                  </>
                ) : (
                  "Memed não devolveu link/código para esta prescrição."
                )}
              </p>
            )}
            {pdfRx.data && (
              <p className="text-[11px] text-muted-foreground">
                {pdfRx.data.ok ? (
                  <a href={pdfRx.data.url} target="_blank" rel="noreferrer" className="text-primary underline">
                    abrir PDF
                  </a>
                ) : (
                  "Memed não devolveu o PDF para esta prescrição."
                )}
              </p>
            )}

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

        {/* ── HISTÓRICO E PROTOCOLOS ──────────────────────────────────── */}
        <Collapsible open={historicoAberto} onOpenChange={setHistoricoAberto}>
          <Card className="p-4">
            <CollapsibleTrigger asChild>
              <button type="button" className="flex w-full items-center justify-between text-left">
                <span className="flex items-center gap-1.5 text-sm font-medium">
                  <History className="h-4 w-4 text-muted-foreground" />
                  Histórico e protocolos
                </span>
                <ChevronDown
                  className={`h-4 w-4 text-muted-foreground transition-transform ${historicoAberto ? "rotate-180" : ""}`}
                />
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-4 grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Prescrições do prescritor sintético</Label>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-[11px]"
                    disabled={historico.isPending}
                    onClick={() => historico.mutate()}
                  >
                    {historico.isPending && <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />}
                    Buscar histórico
                  </Button>
                </div>
                {historico.data?.ok && historico.data.itens.length === 0 && (
                  <p className="text-[11px] text-muted-foreground">Nenhuma prescrição encontrada.</p>
                )}
                {historico.data?.ok && (
                  <ul className="space-y-1.5">
                    {historico.data.itens.map((p) => (
                      <li
                        key={p.id}
                        className="flex items-center justify-between gap-2 rounded-lg border p-2 text-[11px]"
                      >
                        <div className="min-w-0">
                          <p className="truncate font-mono">{p.id}</p>
                          <p className="truncate text-muted-foreground">
                            {p.data ?? "—"} · {p.medicamentos.join(", ") || "sem itens listados"}
                          </p>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 shrink-0 text-red-600"
                          disabled={excluirRx.isPending}
                          onClick={() => excluirRx.mutate(p.id)}
                          aria-label="Excluir prescrição"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
                {historico.data && !historico.data.ok && (
                  <p className="text-[11px] text-muted-foreground">
                    Não consegui buscar o histórico —{" "}
                    {("detail" in historico.data && historico.data.detail) || historico.data.error}.
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Protocolos do parceiro (todos os prescritores)</Label>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-[11px]"
                    disabled={protocolos.isPending}
                    onClick={() => protocolos.mutate()}
                  >
                    {protocolos.isPending && <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />}
                    Listar protocolos
                  </Button>
                </div>
                {protocolos.data?.ok && (
                  <ul className="space-y-1.5">
                    {protocolos.data.itens.map((p) => (
                      <li key={p.id} className="flex items-center justify-between gap-2 rounded-lg border p-2 text-[11px]">
                        <span className="truncate">{p.nome} · {p.itens} item(ns)</span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 shrink-0 text-red-600"
                          disabled={excluirProtocolo.isPending}
                          onClick={() => excluirProtocolo.mutate(p.id)}
                          aria-label="Excluir protocolo"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="space-y-1.5 border-t pt-2.5">
                  <Label className="text-[10px] text-muted-foreground">Criar protocolo institucional</Label>
                  <Input
                    value={novoProtocolo.nome}
                    onChange={(e) => setNovoProtocolo({ ...novoProtocolo, nome: e.target.value })}
                    placeholder="Nome do protocolo"
                    className="h-8 text-xs"
                  />
                  <Textarea
                    value={novoProtocolo.medicamentos}
                    onChange={(e) => setNovoProtocolo({ ...novoProtocolo, medicamentos: e.target.value })}
                    placeholder={"Um item por linha, texto livre\nEx.: Dipirona 500mg"}
                    className="min-h-16 text-xs"
                  />
                  <Button
                    size="sm"
                    disabled={
                      novoProtocolo.nome.trim().length < 2 ||
                      novoProtocolo.medicamentos.trim().length === 0 ||
                      criarProtocolo.isPending
                    }
                    onClick={() => criarProtocolo.mutate()}
                  >
                    {criarProtocolo.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                    Criar — visível a todos os prescritores
                  </Button>
                </div>
              </div>
            </CollapsibleContent>
          </Card>
        </Collapsible>

        {/* ── TEMPLATE DE RECEITA (IMPRESSÃO) ─────────────────────────── */}
        <Collapsible open={templateAberto} onOpenChange={setTemplateAberto}>
          <Card className="p-4">
            <CollapsibleTrigger asChild>
              <button type="button" className="flex w-full items-center justify-between text-left">
                <span className="flex items-center gap-1.5 text-sm font-medium">
                  <Printer className="h-4 w-4 text-muted-foreground" />
                  Template de receita (impressão)
                </span>
                <ChevronDown
                  className={`h-4 w-4 text-muted-foreground transition-transform ${templateAberto ? "rotate-180" : ""}`}
                />
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-4 space-y-4">
              <p className="text-[11px] text-muted-foreground">
                Aplica no prescritor SINTÉTICO da bancada — nunca num médico real. Fica salvo na
                conta Memed de teste até ser trocado de novo.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={printOptions.isPending}
                  onClick={() => printOptions.mutate()}
                >
                  {printOptions.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                  Carregar configuração atual
                </Button>
              </div>
              <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
                {(
                  [
                    ["titulo", "Título"],
                    ["titulo_cor", "Cor do título (#hex)"],
                    ["subtitulo", "Subtítulo"],
                    ["subtitulo_cor", "Cor do subtítulo (#hex)"],
                    ["fonte", "Fonte"],
                    ["tamanho_fonte", "Tamanho da fonte"],
                    ["rodape", "Rodapé"],
                    ["rodape_cor", "Cor do rodapé (#hex)"],
                  ] as [keyof typeof printForm, string][]
                ).map(([field, label]) => (
                  <div key={field} className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground">{label}</Label>
                    <Input
                      value={printForm[field]}
                      onChange={(e) => setPrintForm({ ...printForm, [field]: e.target.value })}
                      className="h-8 text-xs"
                    />
                  </div>
                ))}
              </div>
              <Button size="sm" disabled={salvarPrint.isPending} onClick={() => salvarPrint.mutate()}>
                {salvarPrint.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                Salvar configuração de impressão
              </Button>

              <div className="space-y-1.5 border-t pt-3">
                <Label className="text-xs">Importar timbre próprio (PDF de cabeçalho/rodapé)</Label>
                <input
                  type="file"
                  accept="application/pdf"
                  className="block text-[11px]"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) uploadTemplate.mutate(file);
                    e.target.value = "";
                  }}
                />
                {uploadTemplate.isPending && (
                  <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" /> Enviando…
                  </p>
                )}
                <p className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  <Upload className="h-3 w-3" /> A Memed recorta cabeçalho/rodapé automaticamente do PDF enviado.
                </p>
              </div>

              <div className="space-y-1.5 border-t pt-3">
                <Label className="text-xs">Renomear "Protocolos" no módulo aberto (setDictionary)</Label>
                <div className="grid gap-2 sm:grid-cols-3">
                  <Input
                    value={dictForm.protocolPlural}
                    onChange={(e) => setDictForm({ ...dictForm, protocolPlural: e.target.value })}
                    placeholder="Plural (ex.: Modelos de receita)"
                    className="h-8 text-xs"
                  />
                  <Input
                    value={dictForm.protocolSingular}
                    onChange={(e) => setDictForm({ ...dictForm, protocolSingular: e.target.value })}
                    placeholder="Singular"
                    className="h-8 text-xs"
                  />
                  <Input
                    value={dictForm.protocolSaved}
                    onChange={(e) => setDictForm({ ...dictForm, protocolSaved: e.target.value })}
                    placeholder="Mensagem ao salvar"
                    className="h-8 text-xs"
                  />
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={moduleStatus !== "ready"}
                  onClick={() =>
                    void apiRef.current?.setDictionary({
                      protocolPlural: dictForm.protocolPlural || undefined,
                      protocolSingular: dictForm.protocolSingular || undefined,
                      protocolSaved: dictForm.protocolSaved || undefined,
                    })
                  }
                >
                  Aplicar no módulo aberto
                </Button>
                {moduleStatus !== "ready" && (
                  <p className="text-[10px] text-muted-foreground">Abra o módulo Memed acima primeiro.</p>
                )}
              </div>
            </CollapsibleContent>
          </Card>
        </Collapsible>

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
