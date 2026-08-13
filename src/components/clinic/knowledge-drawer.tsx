import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { askKnowledgeAssistant } from "@/lib/knowledge-chat.functions";
import {
  listMyCriterios,
  saveMyCriterio,
  setMyCriterioKind,
  deleteMyCriterio,
} from "@/lib/api/criterios.functions";
import {
  listMyDocs,
  getMyDocUploadUrl,
  registerMyDoc,
  getMyDocOpenUrl,
  deleteMyDoc,
} from "@/lib/api/docs.functions";
import {
  searchMyPublications,
  addMyPublication,
  discardMyPublication,
} from "@/lib/api/publications.functions";
import { supabase } from "@/integrations/supabase/client";
import type { Criterio, CriterioKind } from "@/lib/criterios.server";
import type { Doc } from "@/lib/docs.server";
import type { Publication } from "@/lib/publications.server";
import { toast } from "sonner";
import {
  BookOpen,
  Search,
  X,
  Send,
  Paperclip,
  Sparkles,
  FileText,
  ListChecks,
  Upload,
  Plus,
  Filter,
  Trash2,
  Download,
  ExternalLink,
} from "lucide-react";

/** Resumo rápido para o médico: prioriza o trecho de conclusão do abstract
 *  (CONCLUSION/CONCLUSIONS/INTERPRETATION) e cai para as últimas frases. */
function conclusaoDe(abstract: string): string {
  const texto = abstract.replace(/\s+/g, " ").trim();
  const marcador = texto.match(
    /(?:conclusions?(?:\s+and\s+relevance)?|interpretation|conclus(?:ão|ões))\s*[:.\-—]\s*(.+)$/i,
  );
  if (marcador?.[1]) return marcador[1].trim();
  const frases = texto.split(/(?<=[.!?])\s+/);
  return frases.slice(-2).join(" ").trim() || texto;
}

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Protocolos (seed) — fora do escopo desta rodada, continua estático.
// ---------------------------------------------------------------------------

type Protocol = {
  id: string;
  title: string;
  tags: string[];
  body: string;
};

const PROTOCOLS: Protocol[] = [
  {
    id: "anemia-ferropriva",
    title: "Kit anemia ferropriva",
    tags: ["anemia", "ferritina", "hemoglobina", "ferro"],
    body: `**Critérios diagnósticos**
Hb < 12 g/dL (F) ou < 13 g/dL (M) + ferritina < 30 ng/mL.

**Reposição oral (1ª linha)**
Sulfato ferroso 40 mg de ferro elementar, 2–3×/dia, em jejum com vitamina C.
Reavaliar hemograma em 4–8 semanas; manter por 3–6 meses após normalização.`,
  },
  {
    id: "hipotireoidismo-subclínico",
    title: "Hipotireoidismo subclínico",
    tags: ["TSH", "tireóide", "levotiroxina"],
    body: `**Quando tratar**
TSH > 10 sempre. TSH 4–10: gestante, sintomas, anti-TPO+, infertilidade.

**Levotiroxina**
25–50 mcg/dia (idosos 12,5–25). Jejum, longe de cálcio/ferro. Titular TSH 6–8 sem.`,
  },
  {
    id: "rastreio-dm2",
    title: "Rastreio DM2 / pré-diabetes",
    tags: ["diabetes", "HbA1c", "metformina"],
    body: `**Diagnóstico**
DM2: jejum ≥126, HbA1c ≥6,5%, TOTG 2h ≥200.
Pré-DM: 100–125 / 5,7–6,4% / 140–199.

**1ª linha**
Metformina 500 mg → 1 g 2×/dia. Alvo HbA1c <7%.`,
  },
  {
    id: "cefaleia-cronica",
    title: "Cefaleia crônica",
    tags: ["cefaleia", "enxaqueca", "triptano"],
    body: `**Red flags**
Thunderclap, febre + rigidez, déficit focal, >50a sem histórico.

**Profilaxia (≥4 crises/mês)**
Propranolol, amitriptilina, topiramato — 3–6 meses.`,
  },
  {
    id: "vitamina-d",
    title: "Vitamina D — reposição",
    tags: ["vitamina D", "colecalciferol"],
    body: `**Faixas (25-OH)**
Deficiência <20, insuficiência 20–29, suficiência ≥30.

**Reposição**
Deficiência: 50.000 UI/sem × 8–12 sem. Manutenção 1.000–2.000 UI/dia.`,
  },
];

// ---------------------------------------------------------------------------

type ChatMsg = { id: string; from: "user" | "ai"; text: string };
type TabId = "chat" | "criterios" | "protocolos" | "documentos";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  token: string;
  /** Reporta a largura atual para a barra de ícones compartilhada. */
  onWidthChange?: (w: number) => void;
};

const LARGURA_PADRAO = 380;
const LARGURA_MIN = 300;
const LARGURA_MAX = 900;
const LARGURA_KEY = "lifeline:kb-largura";

export function KnowledgeDrawer({ open, onOpenChange, token, onWidthChange }: Props) {
  const [tab, setTab] = useState<TabId>("chat");

  // largura ajustável do painel (persistida por médico/navegador)
  const [largura, setLargura] = useState(LARGURA_PADRAO);
  const [redimensionando, setRedimensionando] = useState(false);

  useEffect(() => {
    const salvo = Number(window.localStorage.getItem(LARGURA_KEY));
    if (salvo >= LARGURA_MIN && salvo <= LARGURA_MAX) setLargura(salvo);
  }, []);

  useEffect(() => {
    onWidthChange?.(largura);
  }, [largura, onWidthChange]);


  const iniciarResize = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    setRedimensionando(true);
    const mover = (ev: PointerEvent) => {
      const nova = Math.min(LARGURA_MAX, Math.max(LARGURA_MIN, window.innerWidth - ev.clientX));
      setLargura(nova);
    };
    const soltar = () => {
      setRedimensionando(false);
      window.removeEventListener("pointermove", mover);
      window.removeEventListener("pointerup", soltar);
      document.body.style.userSelect = "";
      setLargura((l) => {
        window.localStorage.setItem(LARGURA_KEY, String(l));
        return l;
      });
    };
    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", mover);
    window.addEventListener("pointerup", soltar);
  };


  // chat
  const [chatInput, setChatInput] = useState("");
  const [messages, setMessages] = useState<ChatMsg[]>([
    {
      id: "welcome",
      from: "ai",
      text: "Olá! Sou seu assistente clínico. Posso consultar seus critérios, protocolos e documentos. O que precisa hoje?",
    },
  ]);
  const [sending, setSending] = useState(false);

  const sendChat = async () => {
    const t = chatInput.trim();
    if (!t || sending) return;
    const userMsg: ChatMsg = { id: crypto.randomUUID(), from: "user", text: t };
    const history = [...messages, userMsg];
    setMessages(history);
    setChatInput("");
    setSending(true);
    const placeholderId = crypto.randomUUID();
    setMessages((m) => [...m, { id: placeholderId, from: "ai", text: "…" }]);
    try {
      const payload = history
        .filter((m) => m.id !== "welcome")
        .map((m) => ({
          role: (m.from === "user" ? "user" : "assistant") as "user" | "assistant",
          content: m.text,
        }));
      const result = await askKnowledgeAssistant({ data: { token, messages: payload } });
      if (!result.ok) {
        const msg =
          result.error === "not_configured"
            ? "Assistente de IA não configurado neste ambiente."
            : result.error === "generation_failed"
              ? "Não consegui consultar o assistente agora. Tente de novo."
              : "Sessão expirada. Recarregue a página.";
        throw new Error(msg);
      }
      setMessages((m) => m.map((x) => (x.id === placeholderId ? { ...x, text: result.reply } : x)));
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro ao consultar assistente.";
      setMessages((m) => m.filter((x) => x.id !== placeholderId));
      toast.error(msg);
    } finally {
      setSending(false);
    }
  };

  // protocolos
  const [pQuery, setPQuery] = useState("");
  const [active, setActive] = useState<Protocol | null>(null);
  const protocolsFiltered = pQuery.trim()
    ? PROTOCOLS.filter((p) => {
        const q = pQuery.toLowerCase();
        return (
          p.title.toLowerCase().includes(q) ||
          p.tags.some((t) => t.toLowerCase().includes(q)) ||
          p.body.toLowerCase().includes(q)
        );
      })
    : PROTOCOLS;

  // meus critérios
  const [criterios, setCriterios] = useState<Criterio[]>([]);
  const [criteriosLoaded, setCriteriosLoaded] = useState(false);
  const [newCriterioText, setNewCriterioText] = useState("");
  const [savingCriterio, setSavingCriterio] = useState(false);

  // documentos
  const [docs, setDocs] = useState<Doc[]>([]);
  const [docsLoaded, setDocsLoaded] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // publicações (busca sob demanda dentro de Documentos)
  const [topicsInput, setTopicsInput] = useState("");
  const [searchingPubs, setSearchingPubs] = useState(false);
  const [pubResults, setPubResults] = useState<Publication[]>([]);
  const [pubActionId, setPubActionId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    if (!criteriosLoaded) {
      listMyCriterios({ data: { token } })
        .then((res) => {
          if (res.ok) {
            setCriterios(res.criterios);
            setCriteriosLoaded(true);
          }
        })
        .catch(() => {});
    }
    if (!docsLoaded) {
      listMyDocs({ data: { token } })
        .then((res) => {
          if (res.ok) {
            setDocs(res.docs);
            setDocsLoaded(true);
          }
        })
        .catch(() => {});
    }
  }, [open, token, criteriosLoaded, docsLoaded]);

  const addCriterio = async () => {
    const text = newCriterioText.trim();
    if (!text || savingCriterio) return;
    setSavingCriterio(true);
    try {
      const res = await saveMyCriterio({ data: { token, rawText: text } });
      if (!res.ok) throw new Error("Não foi possível salvar o critério.");
      setCriterios((cs) => [res.criterio, ...cs]);
      setNewCriterioText("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar critério.");
    } finally {
      setSavingCriterio(false);
    }
  };

  const toggleCriterioBadge = async (criterio: Criterio) => {
    const nextKind: CriterioKind = criterio.kind === "metrica" ? "estilo" : "metrica";
    try {
      const res = await setMyCriterioKind({ data: { token, id: criterio.id, kind: nextKind } });
      if (!res.ok) throw new Error("Não foi possível atualizar.");
      setCriterios((cs) => cs.map((c) => (c.id === criterio.id ? res.criterio : c)));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao atualizar critério.");
    }
  };

  const removeCriterio = async (id: string) => {
    try {
      const res = await deleteMyCriterio({ data: { token, id } });
      if (!res.ok) throw new Error("Não foi possível remover.");
      setCriterios((cs) => cs.filter((c) => c.id !== id));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao remover critério.");
    }
  };

  const handleFileSelected = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    try {
      const target = await getMyDocUploadUrl({ data: { token, fileName: file.name } });
      if (!target.ok) throw new Error("Não foi possível preparar o upload.");
      const { error: uploadError } = await supabase.storage
        .from("doctor-docs")
        .uploadToSignedUrl(target.path, target.uploadToken, file);
      if (uploadError) throw new Error(uploadError.message);
      const format = file.name.toLowerCase().endsWith(".pdf") ? ("pdf" as const) : null;
      const reg = await registerMyDoc({
        data: { token, name: file.name, format, storagePath: target.path, sizeBytes: file.size },
      });
      if (!reg.ok) throw new Error("Não foi possível registrar o documento.");
      setDocs((d) => [reg.doc, ...d]);
      toast.success("Documento enviado.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao enviar documento.");
    } finally {
      setUploading(false);
    }
  };

  const openDoc = async (docId: string) => {
    try {
      const res = await getMyDocOpenUrl({ data: { token, docId } });
      if (!res.ok) throw new Error("Documento não encontrado.");
      window.open(res.url, "_blank", "noopener,noreferrer");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao abrir documento.");
    }
  };

  const removeDoc = async (docId: string) => {
    try {
      const res = await deleteMyDoc({ data: { token, docId } });
      if (!res.ok) throw new Error("Não foi possível remover.");
      setDocs((d) => d.filter((x) => x.id !== docId));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao remover documento.");
    }
  };

  const searchPublications = async () => {
    const topics = topicsInput
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    if (topics.length === 0 || searchingPubs) return;
    setSearchingPubs(true);
    try {
      const res = await searchMyPublications({ data: { token, topics } });
      if (!res.ok) throw new Error("Não foi possível buscar publicações.");
      setPubResults(res.publications);
      if (res.publications.length === 0)
        toast.info("Nenhuma publicação nova encontrada para esses temas.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao buscar publicações.");
    } finally {
      setSearchingPubs(false);
    }
  };

  const addPublication = async (id: string) => {
    setPubActionId(id);
    try {
      const res = await addMyPublication({ data: { token, id } });
      if (!res.ok) throw new Error("Não foi possível adicionar.");
      setPubResults((r) => r.filter((p) => p.id !== id));
      const docsRes = await listMyDocs({ data: { token } });
      if (docsRes.ok) setDocs(docsRes.docs);
      toast.success("Adicionada aos Documentos.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao adicionar publicação.");
    } finally {
      setPubActionId(null);
    }
  };

  const discardPublication = async (id: string) => {
    setPubActionId(id);
    try {
      const res = await discardMyPublication({ data: { token, id } });
      if (!res.ok) throw new Error("Não foi possível descartar.");
      setPubResults((r) => r.filter((p) => p.id !== id));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao descartar publicação.");
    } finally {
      setPubActionId(null);
    }
  };

  return (
    <>
      {/* Painel lateral sobreposto, altura total da tela e largura ajustável
          pelo médico (arrastando a borda esquerda). Fica sempre montado — o
          botão-livro embutido na própria borda abre/fecha, como a sidebar. */}
      <aside
        style={{ width: largura }}
        className={cn(
          "fixed inset-y-0 right-0 z-40 flex max-w-[95vw] flex-col gap-0 border-l border-border bg-background shadow-2xl transition-transform duration-300",
          open ? "translate-x-0" : "translate-x-full",
        )}
        aria-hidden={!open}
      >
        {/* Alça de redimensionamento */}
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Redimensionar assistente"
          onPointerDown={iniciarResize}
          onDoubleClick={() => setLargura(LARGURA_PADRAO)}
          className={cn(
            "absolute inset-y-0 left-0 z-10 w-1.5 cursor-col-resize bg-transparent transition-colors hover:bg-primary/40",
            redimensionando && "bg-primary/60",
          )}
        />

        <div className="flex items-center gap-2 border-b border-border px-4 py-3 text-sm font-semibold">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg brand-gradient">
            <Sparkles className="h-3.5 w-3.5 text-primary-foreground" />
          </div>
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="truncate">Assistente de conhecimento</span>
            <span className="text-[10px] font-normal text-muted-foreground">
              Seu mini-GPT clínico
            </span>
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            aria-label="Fechar"
            className="text-muted-foreground transition hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>


          <Tabs
            value={tab}
            onValueChange={(v) => setTab(v as TabId)}
            className="flex flex-1 flex-col overflow-hidden"
          >
            <div className="border-b border-border px-2 pt-2">
              <TabsList className="grid h-auto w-full grid-cols-4 bg-muted/50 p-1">
                <TabTrigger value="chat" icon={Sparkles} label="Chat" />
                <TabTrigger value="criterios" icon={ListChecks} label="Meus Critérios" />
                <TabTrigger value="protocolos" icon={BookOpen} label="Protocolos" />
                <TabTrigger value="documentos" icon={FileText} label="Documentos" />
              </TabsList>
            </div>

            {/* ---------- CHAT ---------- */}
            <TabsContent
              value="chat"
              className="mt-0 flex flex-1 flex-col overflow-hidden data-[state=inactive]:hidden"
            >
              <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
                {messages.map((m) => (
                  <div
                    key={m.id}
                    className={cn(
                      "flex gap-2",
                      m.from === "user" ? "justify-end" : "justify-start",
                    )}
                  >
                    {m.from === "ai" && (
                      <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md brand-gradient">
                        <Sparkles className="h-3 w-3 text-primary-foreground" />
                      </div>
                    )}
                    <div
                      className={cn(
                        "max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed",
                        m.from === "user"
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-foreground",
                      )}
                    >
                      {m.text}
                    </div>
                  </div>
                ))}
              </div>

              <div className="border-t border-border bg-background/60 p-3">
                <div className="mb-2 flex flex-wrap gap-1.5">
                  {["Meus Critérios", "Protocolos", "Documentos"].map((chip) => (
                    <Badge key={chip} variant="secondary" className="cursor-pointer text-[10px]">
                      <Filter className="mr-1 h-2.5 w-2.5" />
                      {chip}
                    </Badge>
                  ))}
                </div>
                <div className="flex items-end gap-2 rounded-2xl border border-border bg-card p-2 focus-within:border-primary/40">
                  <button
                    className="mb-1 text-muted-foreground hover:text-foreground"
                    aria-label="Anexar"
                  >
                    <Paperclip className="h-4 w-4" />
                  </button>
                  <Textarea
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        sendChat();
                      }
                    }}
                    placeholder="Pergunte algo baseado no seu conhecimento…"
                    className="min-h-[36px] flex-1 resize-none border-0 bg-transparent p-1 text-sm shadow-none focus-visible:ring-0"
                    rows={1}
                  />
                  <Button
                    size="icon"
                    className="h-8 w-8 shrink-0 rounded-xl"
                    onClick={sendChat}
                    disabled={!chatInput.trim() || sending}
                  >
                    <Send className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </TabsContent>

            {/* ---------- MEUS CRITÉRIOS ---------- */}
            <TabsContent
              value="criterios"
              className="mt-0 flex flex-1 flex-col overflow-hidden data-[state=inactive]:hidden"
            >
              <div className="border-b border-border px-4 pt-3 pb-3">
                <p className="mb-2 text-xs text-muted-foreground">
                  Escreva uma regra, um valor ou uma preferência de trabalho — a IA classifica
                  sozinha e sempre respeita isso nas respostas.
                </p>
                <div className="flex items-end gap-2 rounded-xl border border-border bg-card p-2 focus-within:border-primary/40">
                  <Textarea
                    value={newCriterioText}
                    onChange={(e) => setNewCriterioText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        addCriterio();
                      }
                    }}
                    placeholder="Ex: Nunca uso benzodiazepínico como 1ª linha para insônia."
                    className="min-h-[36px] flex-1 resize-none border-0 bg-transparent p-1 text-sm shadow-none focus-visible:ring-0"
                    rows={1}
                  />
                  <Button
                    size="icon"
                    className="h-8 w-8 shrink-0 rounded-xl"
                    onClick={addCriterio}
                    disabled={!newCriterioText.trim() || savingCriterio}
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto px-4 py-3">
                {criterios.length === 0 ? (
                  <p className="mt-6 text-center text-sm text-muted-foreground">
                    Nenhum critério cadastrado ainda.
                  </p>
                ) : (
                  <ul className="space-y-1.5">
                    {criterios.map((c) => (
                      <li
                        key={c.id}
                        className="rounded-xl border border-border bg-card px-3 py-2.5"
                      >
                        <div className="flex items-start gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium">{c.label}</div>
                            <div className="mt-0.5 text-xs text-muted-foreground">{c.rawText}</div>
                          </div>
                          <button
                            className="mt-0.5 text-muted-foreground hover:text-destructive"
                            aria-label="Remover"
                            onClick={() => removeCriterio(c.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        <button onClick={() => toggleCriterioBadge(c)} className="mt-2">
                          <Badge
                            variant={c.kind === "metrica" ? "outline" : "secondary"}
                            className="cursor-pointer text-[10px]"
                          >
                            {c.kind === "metrica" ? "Usado em análises" : "Aplicado sempre"}
                          </Badge>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </TabsContent>

            {/* ---------- PROTOCOLOS ---------- */}
            <TabsContent
              value="protocolos"
              className="mt-0 flex flex-1 flex-col overflow-hidden data-[state=inactive]:hidden"
            >
              <div className="px-4 pt-3 pb-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={pQuery}
                    onChange={(e) => setPQuery(e.target.value)}
                    placeholder="Buscar protocolo…"
                    className="pl-8 text-sm"
                  />
                  {pQuery && (
                    <button
                      onClick={() => setPQuery("")}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
              <div className="flex-1 overflow-y-auto px-4 pb-4">
                {protocolsFiltered.length === 0 ? (
                  <p className="mt-6 text-center text-sm text-muted-foreground">
                    Nenhum protocolo encontrado.
                  </p>
                ) : (
                  <ul className="space-y-1.5">
                    {protocolsFiltered.map((p) => (
                      <li key={p.id}>
                        <button
                          onClick={() => setActive(p)}
                          className="w-full rounded-xl border border-border bg-card px-3 py-2.5 text-left transition hover:border-primary/40 hover:bg-primary/5"
                        >
                          <div className="text-sm font-medium">{p.title}</div>
                          <div className="mt-0.5 flex flex-wrap gap-1">
                            {p.tags.slice(0, 3).map((t) => (
                              <span
                                key={t}
                                className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground"
                              >
                                {t}
                              </span>
                            ))}
                          </div>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <Button variant="outline" size="sm" className="mt-3 w-full">
                  <Plus className="mr-1.5 h-3.5 w-3.5" /> Novo protocolo
                </Button>
              </div>
            </TabsContent>

            {/* ---------- DOCUMENTOS ---------- */}
            <TabsContent
              value="documentos"
              className="mt-0 flex flex-1 flex-col overflow-hidden data-[state=inactive]:hidden"
            >
              <div className="flex-1 overflow-y-auto px-4 py-3">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,application/pdf"
                  className="hidden"
                  onChange={(e) => {
                    void handleFileSelected(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="flex w-full flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-border bg-muted/30 py-6 text-center transition hover:border-primary/50 hover:bg-primary/5 disabled:opacity-60"
                >
                  <Upload className="h-5 w-5 text-primary" />
                  <div className="text-sm font-medium">
                    {uploading ? "Enviando…" : "Carregar arquivo"}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    PDFs, livros, papers, resumos — até 50 MB
                  </div>
                </button>

                <div className="mb-2 mt-4 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  Sua biblioteca · {docs.length} {docs.length === 1 ? "item" : "itens"}
                </div>
                <ul className="space-y-1.5">
                  {docs.map((d) => (
                    <li
                      key={d.id}
                      className="flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-2.5"
                    >
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <FileText className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{d.name}</div>
                        <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                          <Badge
                            variant={d.origin === "publicacao" ? "outline" : "secondary"}
                            className="text-[10px]"
                          >
                            {d.origin === "publicacao" ? "Publicação" : "Anexo"}
                          </Badge>
                          <span>{new Date(d.createdAt).toLocaleDateString("pt-BR")}</span>
                        </div>
                      </div>
                      <button
                        className="text-muted-foreground hover:text-foreground"
                        aria-label="Abrir"
                        onClick={() => openDoc(d.id)}
                      >
                        <Download className="h-3.5 w-3.5" />
                      </button>
                      <button
                        className="text-muted-foreground hover:text-destructive"
                        aria-label="Remover"
                        onClick={() => removeDoc(d.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>

                {/* Publicações — descoberta sob demanda (PubMed/JAMA/NEJM) */}
                <div className="mt-5 border-t border-border pt-4">
                  <div className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    Buscar publicações
                  </div>
                  <div className="flex gap-1.5">
                    <Input
                      value={topicsInput}
                      onChange={(e) => setTopicsInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && searchPublications()}
                      placeholder="Temas, separados por vírgula (ex: diabetes, SGLT2)"
                      className="h-8 text-xs"
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 shrink-0"
                      onClick={searchPublications}
                      disabled={!topicsInput.trim() || searchingPubs}
                    >
                      {searchingPubs ? "Buscando…" : "Buscar agora"}
                    </Button>
                  </div>

                  {pubResults.length > 0 && (
                    <ul className="mt-3 space-y-2">
                      {pubResults.map((p) => (
                        <li key={p.id} className="rounded-xl border border-border bg-card p-3">
                          <div className="mb-1 flex items-center gap-2 text-[10px] text-muted-foreground">
                            <span className="font-medium text-primary">{p.journal}</span>
                            {p.publishedAt && (
                              <>
                                <span>·</span>
                                <span>{p.publishedAt}</span>
                              </>
                            )}
                          </div>
                          <a
                            href={p.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm font-medium leading-snug hover:text-primary hover:underline"
                          >
                            {p.title}
                          </a>
                          {p.abstract && (
                            <div className="mt-1.5 rounded-lg bg-muted/40 p-2">
                              <div className="mb-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                                Conclusão
                              </div>
                              <p className="line-clamp-4 text-xs leading-relaxed text-foreground/80">
                                {conclusaoDe(p.abstract)}
                              </p>
                            </div>
                          )}
                          <div className="mt-2 flex flex-wrap items-center gap-1.5">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs"
                              asChild
                            >
                              <a href={p.url} target="_blank" rel="noopener noreferrer">
                                <ExternalLink className="mr-1 h-3 w-3" /> Ler documento
                              </a>
                            </Button>
                            <Button
                              size="sm"
                              className="h-7 text-xs"
                              disabled={pubActionId === p.id}
                              onClick={() => addPublication(p.id)}
                            >
                              Adicionar
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 text-xs"
                              disabled={pubActionId === p.id}
                              onClick={() => discardPublication(p.id)}
                            >
                              Descartar
                            </Button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </TabsContent>
          </Tabs>
      </aside>


      {/* Modal com texto completo do protocolo */}
      <Dialog
        open={!!active}
        onOpenChange={(v) => {
          if (!v) setActive(null);
        }}
      >
        <DialogContent className="max-h-[80vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-primary" />
              {active?.title}
            </DialogTitle>
          </DialogHeader>
          {active && (
            <div className="mt-2 space-y-3 text-sm leading-relaxed text-foreground/90 whitespace-pre-wrap">
              {active.body.split("\n").map((line, i) => {
                if (line.startsWith("**") && line.endsWith("**")) {
                  return (
                    <p key={i} className="font-semibold text-foreground mt-3 first:mt-0">
                      {line.replace(/\*\*/g, "")}
                    </p>
                  );
                }
                if (line.startsWith("•")) {
                  return (
                    <p key={i} className="pl-3">
                      {line}
                    </p>
                  );
                }
                return line ? <p key={i}>{line}</p> : <div key={i} className="h-1" />;
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function TabTrigger({
  value,
  icon: Icon,
  label,
}: {
  value: string;
  icon: typeof BookOpen;
  label: string;
}) {
  return (
    <TabsTrigger
      value={value}
      className="flex flex-col items-center gap-0.5 px-1 py-1.5 text-center text-[10px] leading-tight data-[state=active]:bg-background data-[state=active]:shadow-sm"
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </TabsTrigger>
  );
}
