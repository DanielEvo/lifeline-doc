import { useState } from "react";
import {
  BookOpen,
  Search,
  X,
  Send,
  Paperclip,
  Sparkles,
  FileText,
  UserCog,
  FlaskConical,
  Upload,
  Plus,
  Globe,
  Filter,
  Trash2,
  Heart,
  Ban,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Protocolos (seed)
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
// Perfil médico (seed)
// ---------------------------------------------------------------------------

type ProfileSection = {
  id: string;
  icon: typeof UserCog;
  title: string;
  placeholder: string;
  value: string;
};

const PROFILE_SEED: ProfileSection[] = [
  {
    id: "sobre",
    icon: UserCog,
    title: "Perfil e formação",
    placeholder: "Ex: Clínico geral, 12 anos de prática, foco em medicina preventiva…",
    value:
      "Clínica geral com 12 anos de experiência. Foco em prevenção cardiovascular, medicina do estilo de vida e cuidado longitudinal de crônicos.",
  },
  {
    id: "estilo",
    icon: Sparkles,
    title: "Forma de trabalho",
    placeholder: "Como você conduz consultas, tempo médio, forma de comunicação…",
    value:
      "Consultas de 50 min. Prefiro decisão compartilhada, explicação em linguagem simples, prescrição sempre com racional escrito para o paciente.",
  },
  {
    id: "gosto",
    icon: Heart,
    title: "Coisas que gosto",
    placeholder: "Referências, condutas, autores, ferramentas que valoriza…",
    value:
      "Medicina baseada em evidências (Cochrane, UpToDate). Escala de risco global antes de estatina. Metas individualizadas em idosos.",
  },
  {
    id: "nao-gosto",
    icon: Ban,
    title: "Coisas que evito",
    placeholder: "Condutas, medicações, abordagens que prefere não usar…",
    value:
      "Polifarmácia sem revisão. Benzodiazepínico como primeira linha para insônia. Suplementos sem evidência.",
  },
];

// ---------------------------------------------------------------------------
// Conhecimento específico (seed)
// ---------------------------------------------------------------------------

type Doc = { id: string; name: string; kind: "pdf" | "book" | "paper"; size: string; date: string };

const DOCS_SEED: Doc[] = [
  { id: "1", name: "Harrison — Cap. Endocrinologia (2024).pdf", kind: "book", size: "18,2 MB", date: "há 2 semanas" },
  { id: "2", name: "Diretriz SBC 2024 — dislipidemia.pdf", kind: "paper", size: "3,1 MB", date: "há 1 mês" },
  { id: "3", name: "Meus resumos — DM2 fluxograma.pdf", kind: "pdf", size: "420 KB", date: "há 3 dias" },
  { id: "4", name: "NEJM — SGLT2 in HFpEF (2023).pdf", kind: "paper", size: "1,8 MB", date: "há 4 meses" },
];

// ---------------------------------------------------------------------------
// Science (seed)
// ---------------------------------------------------------------------------

type Source = { id: string; url: string; label: string; active: boolean };
type Study = {
  id: string;
  title: string;
  journal: string;
  date: string;
  tags: string[];
  summary: string;
};

const SOURCES_SEED: Source[] = [
  { id: "s1", url: "pubmed.ncbi.nlm.nih.gov", label: "PubMed", active: true },
  { id: "s2", url: "nejm.org", label: "NEJM", active: true },
  { id: "s3", url: "thelancet.com", label: "The Lancet", active: true },
  { id: "s4", url: "jamanetwork.com", label: "JAMA", active: false },
];

const STUDIES_SEED: Study[] = [
  {
    id: "st1",
    title: "Semaglutida 2,4 mg reduz eventos CV em obesos sem DM",
    journal: "NEJM",
    date: "há 3 dias",
    tags: ["obesidade", "cardiovascular", "GLP-1"],
    summary: "SELECT trial de 17.604 pacientes: redução de 20% em MACE em 3,3 anos.",
  },
  {
    id: "st2",
    title: "Rastreio de câncer colorretal aos 45 anos: custo-efetividade",
    journal: "The Lancet",
    date: "há 1 semana",
    tags: ["prevenção", "oncologia"],
    summary: "Meta-análise sugere ganho líquido de QALY com antecipação da idade de rastreio.",
  },
  {
    id: "st3",
    title: "Metformina e longevidade — revisão sistemática 2026",
    journal: "PubMed",
    date: "há 2 semanas",
    tags: ["diabetes", "envelhecimento", "metformina"],
    summary: "Sinais consistentes de redução de mortalidade all-cause em coortes de DM2.",
  },
];

// ---------------------------------------------------------------------------

type ChatMsg = { id: string; from: "user" | "ai"; text: string };
type TabId = "chat" | "protocolos" | "perfil" | "conhecimento" | "science";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
};

export function KnowledgeDrawer({ open, onOpenChange }: Props) {
  const [tab, setTab] = useState<TabId>("chat");

  // chat
  const [chatInput, setChatInput] = useState("");
  const [messages, setMessages] = useState<ChatMsg[]>([
    {
      id: "welcome",
      from: "ai",
      text: "Olá! Sou seu assistente clínico. Posso consultar seus protocolos, seu perfil, sua biblioteca e artigos recentes. O que precisa hoje?",
    },
  ]);

  const sendChat = () => {
    const t = chatInput.trim();
    if (!t) return;
    setMessages((m) => [
      ...m,
      { id: crypto.randomUUID(), from: "user", text: t },
      {
        id: crypto.randomUUID(),
        from: "ai",
        text: "(demo) Aqui entrará a resposta da IA usando seus protocolos, biblioteca e Science.",
      },
    ]);
    setChatInput("");
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

  // perfil
  const [profile, setProfile] = useState<ProfileSection[]>(PROFILE_SEED);

  // conhecimento
  const [docs] = useState<Doc[]>(DOCS_SEED);

  // science
  const [sources, setSources] = useState<Source[]>(SOURCES_SEED);
  const [newSource, setNewSource] = useState("");
  const [scienceFilter, setScienceFilter] = useState("");

  const addSource = () => {
    const v = newSource.trim();
    if (!v) return;
    setSources((s) => [
      ...s,
      { id: crypto.randomUUID(), url: v, label: v.replace(/^https?:\/\//, "").split("/")[0], active: true },
    ]);
    setNewSource("");
  };

  const studiesFiltered = scienceFilter.trim()
    ? STUDIES_SEED.filter((s) =>
        (s.title + s.summary + s.tags.join(" ")).toLowerCase().includes(scienceFilter.toLowerCase()),
      )
    : STUDIES_SEED;

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange} modal={false}>
        <SheetContent
          side="right"
          overlayClassName="bg-black/20"
          className="flex w-[420px] flex-col gap-0 p-0 sm:w-[480px] lg:w-[520px]"
        >
          <SheetHeader className="border-b border-border px-4 py-3">
            <SheetTitle className="flex items-center gap-2 text-sm">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg brand-gradient">
                <Sparkles className="h-3.5 w-3.5 text-primary-foreground" />
              </div>
              <div className="flex flex-col">
                <span>Assistente de conhecimento</span>
                <span className="text-[10px] font-normal text-muted-foreground">
                  Seu mini-GPT clínico
                </span>
              </div>
            </SheetTitle>
          </SheetHeader>

          <Tabs value={tab} onValueChange={(v) => setTab(v as TabId)} className="flex flex-1 flex-col overflow-hidden">
            <div className="border-b border-border px-2 pt-2">
              <TabsList className="grid h-auto w-full grid-cols-5 bg-muted/50 p-1">
                <TabTrigger value="chat" icon={Sparkles} label="Chat" />
                <TabTrigger value="protocolos" icon={BookOpen} label="Protocolos" />
                <TabTrigger value="perfil" icon={UserCog} label="Perfil" />
                <TabTrigger value="conhecimento" icon={FileText} label="Docs" />
                <TabTrigger value="science" icon={FlaskConical} label="Science" />
              </TabsList>
            </div>

            {/* ---------- CHAT ---------- */}
            <TabsContent value="chat" className="mt-0 flex flex-1 flex-col overflow-hidden data-[state=inactive]:hidden">
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
                  {["Protocolos", "Meus docs", "Science"].map((chip) => (
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
                    disabled={!chatInput.trim()}
                  >
                    <Send className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </TabsContent>

            {/* ---------- PROTOCOLOS ---------- */}
            <TabsContent value="protocolos" className="mt-0 flex flex-1 flex-col overflow-hidden data-[state=inactive]:hidden">
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

            {/* ---------- PERFIL ---------- */}
            <TabsContent value="perfil" className="mt-0 flex flex-1 flex-col overflow-hidden data-[state=inactive]:hidden">
              <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
                <p className="text-xs text-muted-foreground">
                  A IA usa isso para responder no seu estilo e evitar condutas que você não aprova.
                </p>
                {profile.map((sec) => (
                  <div key={sec.id} className="rounded-xl border border-border bg-card p-3">
                    <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                      <sec.icon className="h-3.5 w-3.5 text-primary" />
                      {sec.title}
                    </div>
                    <Textarea
                      value={sec.value}
                      onChange={(e) =>
                        setProfile((p) =>
                          p.map((s) => (s.id === sec.id ? { ...s, value: e.target.value } : s)),
                        )
                      }
                      placeholder={sec.placeholder}
                      className="min-h-[80px] resize-none text-sm"
                    />
                  </div>
                ))}
              </div>
            </TabsContent>

            {/* ---------- CONHECIMENTO ---------- */}
            <TabsContent value="conhecimento" className="mt-0 flex flex-1 flex-col overflow-hidden data-[state=inactive]:hidden">
              <div className="px-4 pt-3 pb-2">
                <button className="flex w-full flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-border bg-muted/30 py-6 text-center transition hover:border-primary/50 hover:bg-primary/5">
                  <Upload className="h-5 w-5 text-primary" />
                  <div className="text-sm font-medium">Carregar arquivo</div>
                  <div className="text-[11px] text-muted-foreground">
                    PDFs, livros, papers, resumos — até 50 MB
                  </div>
                </button>
              </div>
              <div className="flex-1 overflow-y-auto px-4 pb-4">
                <div className="mb-2 mt-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  Sua biblioteca · {docs.length} arquivos
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
                        <div className="text-[11px] text-muted-foreground">
                          {d.kind === "book" ? "Livro" : d.kind === "paper" ? "Artigo" : "PDF"} ·{" "}
                          {d.size} · {d.date}
                        </div>
                      </div>
                      <button
                        className="text-muted-foreground hover:text-destructive"
                        aria-label="Remover"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </TabsContent>

            {/* ---------- SCIENCE ---------- */}
            <TabsContent value="science" className="mt-0 flex flex-1 flex-col overflow-hidden data-[state=inactive]:hidden">
              <div className="space-y-3 border-b border-border px-4 py-3">
                <div>
                  <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    Fontes monitoradas
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {sources.map((s) => (
                      <button
                        key={s.id}
                        onClick={() =>
                          setSources((prev) =>
                            prev.map((x) => (x.id === s.id ? { ...x, active: !x.active } : x)),
                          )
                        }
                        className={cn(
                          "flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] transition",
                          s.active
                            ? "border-primary/40 bg-primary/10 text-primary"
                            : "border-border bg-muted/40 text-muted-foreground line-through",
                        )}
                      >
                        <Globe className="h-2.5 w-2.5" />
                        {s.label}
                      </button>
                    ))}
                  </div>
                  <div className="mt-2 flex gap-1.5">
                    <Input
                      value={newSource}
                      onChange={(e) => setNewSource(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && addSource()}
                      placeholder="Adicionar site (ex: nature.com)"
                      className="h-8 text-xs"
                    />
                    <Button size="sm" variant="outline" className="h-8" onClick={addSource}>
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                <div className="relative">
                  <Filter className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={scienceFilter}
                    onChange={(e) => setScienceFilter(e.target.value)}
                    placeholder="Filtrar por tema (ex: diabetes, cardiologia)…"
                    className="h-8 pl-8 text-xs"
                  />
                </div>
              </div>
              <div className="flex-1 overflow-y-auto px-4 py-3">
                <ul className="space-y-2">
                  {studiesFiltered.map((s) => (
                    <li
                      key={s.id}
                      className="rounded-xl border border-border bg-card p-3 transition hover:border-primary/40"
                    >
                      <div className="mb-1 flex items-center gap-2 text-[10px] text-muted-foreground">
                        <span className="font-medium text-primary">{s.journal}</span>
                        <span>·</span>
                        <span>{s.date}</span>
                      </div>
                      <div className="text-sm font-medium leading-snug">{s.title}</div>
                      <div className="mt-1.5 text-xs text-muted-foreground">{s.summary}</div>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {s.tags.map((t) => (
                          <span
                            key={t}
                            className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground"
                          >
                            #{t}
                          </span>
                        ))}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </TabsContent>
          </Tabs>
        </SheetContent>
      </Sheet>

      {/* Modal com texto completo do protocolo */}
      <Dialog open={!!active} onOpenChange={(v) => { if (!v) setActive(null); }}>
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
      className="flex flex-col items-center gap-0.5 px-1 py-1.5 text-[10px] data-[state=active]:bg-background data-[state=active]:shadow-sm"
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </TabsTrigger>
  );
}
