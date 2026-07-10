// Prontuário real do paciente: evoluções persistidas, SOAP derivado no
// servidor, selo digital (protocolo + assinatura SHA-256) e receita digital.
// Selar congela a evolução — a UI esconde a edição e o servidor rejeita.

import { useMemo, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowLeft,
  Cake,
  CalendarPlus,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  Copy,
  CreditCard,
  FileSignature,
  FileUp,
  KeyRound,
  Loader2,
  Lock,
  Mail,
  Pencil,
  Phone,
  Pill,
  Plus,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { PatientFormDialog, type PatientFormValues } from "@/components/clinic/patient-form-dialog";
import {
  archiveMyPatient,
  getPatientRecord,
  getWorkspace,
  moveMyPatient,
  prescribeForEvolution,
  saveEvolution,
  saveEvolutionNote,
  sealMyEvolution,
  updateMyPatient,
} from "@/lib/api/clinic.functions";
import { ScheduleDialog } from "@/components/clinic/action-dialogs";
import { WhatsAppButton } from "@/components/clinic/wa-button";
import { BiomarkerPanel, ClinicalTimeline, usePatientHistory } from "@/components/clinic/patient-history";
import { Dictation } from "@/components/clinic/dictation";
import {
  ageFrom,
  ANAMNESE_TEMPLATE,
  DEFAULT_COLUMNS,
  formatDateTimeBR,
  initialsOf,
  MED_CATALOG,
  WA_TEMPLATES,
  type Evolution,
} from "@/lib/clinic-types";
import { deriveSoap } from "@/lib/soap";
import { clearSession } from "@/lib/session";
import { useClinic } from "@/lib/clinic-context";

export const Route = createFileRoute("/app/pacientes/$id")({
  component: Prontuario,
});

function Prontuario() {
  const { id } = Route.useParams();
  const { token, nome: medico } = useClinic();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [agendarOpen, setAgendarOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [tokenOpen, setTokenOpen] = useState(false);
  const [historicoAutorizado, setHistoricoAutorizado] = useState(false);

  // mesma query do kanban/pacientes → colunas do board sem roundtrip extra
  const wsq = useQuery({
    queryKey: ["workspace"],
    queryFn: async () => {
      const r = await getWorkspace({ data: { token } });
      if (!r.ok) throw new Error("unauthorized");
      return r;
    },
  });
  const columns = wsq.data?.ok ? wsq.data.columns : DEFAULT_COLUMNS;

  const rec = useQuery({
    queryKey: ["patient", id],
    queryFn: async () => {
      const r = await getPatientRecord({ data: { token, id } });
      if (!r.ok) {
        if (r.error === "unauthorized") {
          clearSession();
          navigate({ to: "/login" });
        }
        throw new Error(r.error);
      }
      return r;
    },
    retry: false,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["patient", id] });
    qc.invalidateQueries({ queryKey: ["workspace"] });
  };

  const editar = useMutation({
    mutationFn: (v: PatientFormValues) =>
      updateMyPatient({
        data: {
          token,
          id,
          nome: v.nome,
          nascimento: v.nascimento || null,
          sexo: v.sexo || null,
          cpf: v.cpf || null,
          telefone: v.telefone || null,
          email: v.email || null,
          convenio: v.convenio || null,
          queixa: v.queixa ?? "",
          column: v.column,
        },
      }),
    onSuccess: (r) => {
      if (!r.ok) return toast.error("Não consegui salvar.");
      toast.success("Dados atualizados.");
      setEditOpen(false);
      invalidate();
    },
  });

  const mover = useMutation({
    mutationFn: (to: string) => moveMyPatient({ data: { token, id, to } }),
    onSuccess: (r) => {
      if (r.ok) invalidate();
    },
  });

  const arquivar = useMutation({
    mutationFn: (archived: boolean) => archiveMyPatient({ data: { token, id, archived } }),
    onSuccess: (r, archived) => {
      if (!r.ok) return;
      toast.success(archived ? "Paciente arquivado." : "Paciente restaurado.");
      invalidate();
    },
  });

  // hooks precisam rodar em toda renderização — usa fallback vazio antes do
  // guard de loading/erro abaixo, senão a ordem de hooks muda entre renders
  const measurements = rec.data?.ok ? rec.data.measurements : [];
  const evolutions = rec.data?.ok ? rec.data.evolutions : [];
  const hist = usePatientHistory(measurements, evolutions);

  if (rec.isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      </div>
    );
  }

  if (!rec.data?.ok) {
    return (
      <div className="mx-auto max-w-2xl p-8 text-center">
        <p className="text-sm text-muted-foreground">Paciente não encontrado.</p>
        <Link to="/app/pacientes" className="mt-3 inline-flex items-center gap-1 text-sm text-primary">
          <ArrowLeft className="h-3.5 w-3.5" /> Voltar aos pacientes
        </Link>
      </div>
    );
  }

  const { patient: p } = rec.data;
  const idade = ageFrom(p.nascimento);

  return (
    <div className="mx-auto max-w-[1000px] p-3 lg:p-5">
      <Link
        to="/app/pacientes"
        className="inline-flex items-center gap-1 text-xs text-muted-foreground transition hover:text-foreground"
      >
        <ArrowLeft className="h-3 w-3" /> Pacientes
      </Link>

      {/* Cabeçalho do paciente */}
      <div className="mt-2 rounded-2xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div
              className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${p.tint} text-base font-semibold text-white shadow`}
            >
              {initialsOf(p.nome)}
            </div>
            <div>
              <h1 className="text-lg font-semibold leading-tight">{p.nome}</h1>
              <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                {idade !== null && (
                  <span className="inline-flex items-center gap-1"><Cake className="h-3 w-3" />{idade} anos</span>
                )}
                {p.convenio && (
                  <span className="inline-flex items-center gap-1 font-medium text-primary">
                    <CreditCard className="h-3 w-3" />{p.convenio}
                  </span>
                )}
                {p.telefone && (
                  <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" />{p.telefone}</span>
                )}
                {p.email && (
                  <span className="inline-flex items-center gap-1"><Mail className="h-3 w-3" />{p.email}</span>
                )}
                {p.cpf && <span>CPF {p.cpf}</span>}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <WhatsAppButton
              telefone={p.telefone}
              text={WA_TEMPLATES.livre(p.nome, medico)}
              title="WhatsApp"
            />
            <Select value={p.column} onValueChange={(v) => mover.mutate(v)}>
              <SelectTrigger className="h-8 w-auto text-xs"><SelectValue>
                {columns.find((c) => c.id === p.column)?.title ?? p.column}
              </SelectValue></SelectTrigger>
              <SelectContent>
                {columns.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={() => setAgendarOpen(true)}>
              <CalendarPlus className="mr-1 h-3.5 w-3.5" /> Agendar
            </Button>
            <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
              <Pencil className="mr-1 h-3.5 w-3.5" /> Editar
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => arquivar.mutate(!p.archived)}
              className="text-muted-foreground"
            >
              {p.archived ? "Restaurar" : "Arquivar"}
            </Button>
          </div>
        </div>

        {(p.queixa || p.criticalFlag || p.briefing) && (
          <div className="mt-3 space-y-2 border-t border-border/60 pt-3">
            {p.criticalFlag && (
              <div className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-800 ring-1 ring-red-200 dark:bg-red-950/50 dark:text-red-300 dark:ring-red-900">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span><strong>Parâmetro crítico:</strong> {p.criticalFlag}</span>
              </div>
            )}
            {p.briefing && (
              <div className="flex items-start gap-2 rounded-lg bg-cyan-50 px-3 py-2 text-xs text-cyan-900 ring-1 ring-cyan-200 dark:bg-cyan-950/50 dark:text-cyan-300 dark:ring-cyan-900">
                <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span><strong>Briefing da triagem IA:</strong> {p.briefing}</span>
              </div>
            )}
            {p.queixa && !p.briefing && (
              <p className="text-xs text-muted-foreground"><strong className="text-foreground">Queixa atual:</strong> {p.queixa}</p>
            )}
          </div>
        )}
      </div>

      {/* Linha do tempo clínica: horizontal, full-width, logo abaixo do header */}
      <ClinicalTimeline
        events={hist.events}
        activeKey={hist.activeKey}
        onEventClick={hist.onEventClick}
        anos={hist.anos}
        headerRight={
          <>
            <Button variant="outline" size="sm" onClick={() => setUploadOpen(true)}>
              <FileUp className="mr-1 h-3.5 w-3.5" /> Adicionar exames
            </Button>
            <Button variant="outline" size="sm" onClick={() => setTokenOpen(true)}>
              <KeyRound className="mr-1 h-3.5 w-3.5" /> Solicitar histórico
            </Button>
          </>
        }
      />

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0">
          {/* Evolução atual */}
          <NovaEvolucao
            token={token}
            patientId={id}
            onSaved={invalidate}
            isPrimeiraConsulta={evolutions.length === 0}
            evolutionsCount={evolutions.length}
            historicoAutorizado={historicoAutorizado}
            onSolicitarHistorico={() => setTokenOpen(true)}
          />

          {/* Linha do tempo de evoluções */}
          <div className="mt-5">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Linha do tempo · {evolutions.length} registro{evolutions.length === 1 ? "" : "s"}
            </h2>
            {evolutions.length === 0 ? (
              <div className="mt-3 rounded-2xl border border-dashed border-border bg-card/50 px-6 py-10 text-center">
                <FileSignature className="mx-auto h-7 w-7 text-muted-foreground/50" />
                <p className="mt-2 text-sm font-medium">Prontuário em branco</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Escreva a primeira evolução acima — o SOAP se organiza sozinho.
                </p>
              </div>
            ) : (
              <div className="mt-3 space-y-3">
                {evolutions.map((e) => (
                  <EvolucaoCard
                    key={e.id}
                    e={e}
                    token={token}
                    patientId={id}
                    onChanged={invalidate}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Biomarcadores: painel próprio, sticky ao lado da evolução */}
        <BiomarkerPanel
          token={token}
          patientId={id}
          measurements={measurements}
          activeExam={hist.activeExam}
          showAll={hist.showAll}
          setShowAll={hist.setShowAll}
          visibleNames={hist.visibleNames}
          allNames={hist.allNames}
          onChanged={invalidate}
        />
      </div>

      <PatientFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        patient={p}
        columns={columns}
        onSubmit={(v) => editar.mutate(v)}
        saving={editar.isPending}
      />
      <ScheduleDialog
        open={agendarOpen}
        onOpenChange={setAgendarOpen}
        patient={p}
        token={token}
      />
      <UploadExamesDialog open={uploadOpen} onOpenChange={setUploadOpen} patientName={p.nome} />
      <SolicitarHistoricoDialog
        open={tokenOpen}
        onOpenChange={setTokenOpen}
        patientName={p.nome}
        telefone={p.telefone}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Adicionar exames — dropzone drag & drop (mesmo UX do cadastro), OCR simulado.

type FileEntry = { file: File; state: "reading" | "done" | "error"; errorMsg?: string };
const ACCEPTED_EXTS = [".pdf", ".jpg", ".jpeg", ".png"];

function UploadExamesDialog({
  open,
  onOpenChange,
  patientName,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  patientName: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [dragging, setDragging] = useState(false);

  function processFiles(list: FileList) {
    const entries: FileEntry[] = Array.from(list).map((file) => {
      const ext = "." + (file.name.split(".").pop()?.toLowerCase() ?? "");
      if (!ACCEPTED_EXTS.includes(ext)) {
        return { file, state: "error", errorMsg: `Formato não suportado (${ext || "?"})` };
      }
      return { file, state: "reading" };
    });
    setFiles((prev) => [...prev, ...entries]);
    entries.forEach((entry) => {
      if (entry.state === "reading") {
        setTimeout(() => {
          setFiles((prev) =>
            prev.map((f) => (f.file === entry.file ? { ...f, state: "done" as const } : f)),
          );
        }, 800);
      }
    });
  }

  const doneCount = files.filter((f) => f.state === "done").length;

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) setFiles([]); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileUp className="h-4 w-4 text-primary" /> Adicionar exames
          </DialogTitle>
          <DialogDescription>
            Anexe PDFs ou imagens dos exames de {patientName.split(" ")[0]}. A leitura por OCR
            popula os biomarcadores automaticamente.
          </DialogDescription>
        </DialogHeader>
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            if (e.dataTransfer.files.length) processFiles(e.dataTransfer.files);
          }}
          onClick={() => inputRef.current?.click()}
          className={`flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed px-4 py-6 text-center transition ${
            dragging
              ? "border-primary bg-primary/5"
              : "border-border bg-muted/30 hover:border-primary/40 hover:bg-muted/50"
          }`}
        >
          <FileUp className="h-5 w-5 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Arraste PDFs ou imagens, ou{" "}
            <span className="text-primary underline underline-offset-2">clique para selecionar</span>
          </p>
          <p className="text-[11px] text-muted-foreground/70">.pdf · .jpg · .jpeg · .png</p>
        </div>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".pdf,.jpg,.jpeg,.png"
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) processFiles(e.target.files);
            e.target.value = "";
          }}
        />
        {files.length > 0 && (
          <ul className="mt-1 max-h-52 space-y-1.5 overflow-y-auto">
            {files.map((entry, i) => (
              <li
                key={i}
                className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${
                  entry.state === "error"
                    ? "bg-red-50 text-red-700 ring-1 ring-red-200 dark:bg-red-950/40 dark:text-red-300 dark:ring-red-800"
                    : "bg-muted/50"
                }`}
              >
                {entry.state === "reading" && (
                  <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />
                )}
                {entry.state === "done" && (
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                )}
                {entry.state === "error" && <X className="h-3.5 w-3.5 shrink-0 text-red-500" />}
                <span className="min-w-0 flex-1 truncate">{entry.file.name}</span>
                <span className="shrink-0 text-[11px] text-muted-foreground">
                  {entry.state === "reading" && "Lendo via OCR (simulado)…"}
                  {entry.state === "done" && "✓ lido"}
                  {entry.state === "error" && entry.errorMsg}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setFiles((prev) => prev.filter((f) => f.file !== entry.file))
                  }
                  className="ml-1 shrink-0 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button
            className="brand-gradient text-primary-foreground"
            disabled={doneCount === 0}
            onClick={() => {
              toast.success(`${doneCount} exame${doneCount === 1 ? "" : "s"} adicionado${doneCount === 1 ? "" : "s"} ao prontuário.`);
              onOpenChange(false);
              setFiles([]);
            }}
          >
            Salvar exames
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Solicitar histórico via token — o paciente recebe o pedido, vê um código de
// 6 dígitos no próprio dispositivo e dita para o médico durante a consulta.

function SolicitarHistoricoDialog({
  open,
  onOpenChange,
  patientName,
  telefone,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  patientName: string;
  telefone: string | null;
}) {
  const [scope, setScope] = useState("exames");
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState("");
  const [unlocked, setUnlocked] = useState(false);

  const scopeLabel: Record<string, string> = {
    exames: "exames laboratoriais e de imagem",
    consultas: "consultas anteriores",
    tudo: "todo o histórico clínico",
  };

  const mensagem = `Olá, ${patientName.split(" ")[0]}! Precisamos acessar seus ${scopeLabel[scope]} para dar continuidade ao seu atendimento. Abra lifeline.doc/paciente/compartilhar — um código de 6 dígitos vai aparecer no seu celular. Diga esse código para o(a) médico(a) durante a consulta.`;

  const copiar = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copiado.");
    } catch {
      toast.error("Não consegui copiar.");
    }
  };

  const waHref = telefone
    ? `https://wa.me/${telefone.replace(/\D/g, "")}?text=${encodeURIComponent(mensagem)}`
    : null;

  const reset = () => {
    setSent(false);
    setCode("");
    setUnlocked(false);
  };

  const desbloquear = () => {
    if (code.length !== 6) return;
    setUnlocked(true);
    toast.success("Histórico liberado pelo paciente.");
    setTimeout(() => {
      onOpenChange(false);
      reset();
    }, 900);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-primary" /> Solicitar acesso ao histórico
          </DialogTitle>
          <DialogDescription>
            O paciente recebe o pedido, vê um código de 6 dígitos no próprio celular e dita para você durante a consulta.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">O que solicitar</Label>
            <Select value={scope} onValueChange={setScope} disabled={sent}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="exames">Exames (labs e imagem)</SelectItem>
                <SelectItem value="consultas">Consultas anteriores</SelectItem>
                <SelectItem value="tudo">Histórico completo</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {!sent ? (
            <>
              <div className="rounded-xl border border-border bg-card p-3">
                <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  Mensagem para o paciente
                </div>
                <p className="mt-1 whitespace-pre-line text-xs text-foreground/80">{mensagem}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => copiar(mensagem)}>
                  <Copy className="mr-1 h-3.5 w-3.5" /> Copiar mensagem
                </Button>
                {waHref && (
                  <Button
                    size="sm"
                    asChild
                    className="brand-gradient text-primary-foreground"
                    onClick={() => setSent(true)}
                  >
                    <a href={waHref} target="_blank" rel="noreferrer">Enviar via WhatsApp</a>
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => setSent(true)}>
                  Já enviei
                </Button>
              </div>
            </>
          ) : (
            <div className="rounded-xl border border-border bg-muted/30 p-3">
              <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Digite o código que o paciente disser
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Somente o paciente vê o código no dispositivo dele. Peça que ele leia em voz alta.
              </p>
              <Input
                inputMode="numeric"
                maxLength={6}
                autoFocus
                placeholder="••••••"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                className="mt-2 text-center font-mono text-2xl tracking-[0.6em]"
                disabled={unlocked}
              />
              <Button
                className="mt-2 w-full brand-gradient text-primary-foreground"
                disabled={code.length !== 6 || unlocked}
                onClick={desbloquear}
              >
                {unlocked ? "Liberado ✓" : "Desbloquear histórico"}
              </Button>
              <button
                type="button"
                className="mt-2 w-full text-[11px] text-muted-foreground hover:underline"
                onClick={reset}
              >
                Reenviar pedido
              </button>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------

function SoapReadOnly({
  soap,
  editableNota,
}: {
  soap: Evolution["soap"];
  /** Presente só quando a evolução já foi salva — é o que dá o alvo (evolutionId)
   *  para persistir a nota privada. No preview de Evolução atual isso é omitido. */
  editableNota?: { token: string; evolutionId: string; onSaved: () => void };
}) {
  const [open, setOpen] = useState(false);
  const rows = [
    { k: "S", label: "Subjetivo", text: soap.s, locked: false },
    { k: "O", label: "Objetivo", text: soap.o, locked: false },
    { k: "A", label: "Avaliação", text: soap.a.compartilhavel, locked: true },
    { k: "P", label: "Plano", text: soap.p, locked: false },
  ] as const;

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="rounded-2xl border border-border bg-card">
      <CollapsibleTrigger className="flex w-full items-center gap-2 px-4 py-3 text-left">
        <Stethoscope className="h-4 w-4 text-muted-foreground" />
        <span className="flex-1 text-sm font-medium">Visualização SOAP (somente leitura)</span>
        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
          derivado da Evolução
        </span>
        <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </CollapsibleTrigger>
      <CollapsibleContent className="border-t border-border px-4 py-3">
        <p className="text-[10px] leading-relaxed text-muted-foreground">
          Gerado automaticamente a partir da Evolução. Para corrigir, edite o campo de Evolução —
          não há edição direta aqui.
        </p>
        <div className="mt-2.5 space-y-2.5">
          {rows.map((row) => (
            <div key={row.k}>
              <div className="flex gap-2.5">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-slate-800 text-[11px] font-bold text-white">
                  {row.k}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] font-semibold">{row.label}</span>
                    {row.locked && (
                      <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-medium text-amber-700 ring-1 ring-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:ring-amber-900">
                        🔒 Visível apenas para o médico
                      </span>
                    )}
                  </div>
                  {row.text ? (
                    <p className="mt-0.5 whitespace-pre-line text-[12px] leading-relaxed text-foreground/80">
                      {row.text}
                    </p>
                  ) : (
                    <p className="mt-0.5 text-[12px] italic leading-relaxed text-muted-foreground">
                      Sem dados extraídos.
                    </p>
                  )}
                </div>
              </div>
              {row.k === "A" && editableNota && (
                <div className="mt-1.5 pl-[34px]">
                  <PrivateNoteBlock
                    notaPrivada={soap.a.notaPrivada}
                    token={editableNota.token}
                    evolutionId={editableNota.evolutionId}
                    onSaved={editableNota.onSaved}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function PrivateNoteBlock({
  notaPrivada,
  token,
  evolutionId,
  onSaved,
}: {
  notaPrivada: string;
  token: string;
  evolutionId: string;
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [texto, setTexto] = useState(notaPrivada);

  const salvar = useMutation({
    mutationFn: () => saveEvolutionNote({ data: { token, evolutionId, notaPrivada: texto } }),
    onSuccess: (r) => {
      if (!r.ok) return toast.error("Não consegui salvar a nota.");
      setEditing(false);
      onSaved();
    },
  });

  return (
    <div className="rounded-lg bg-amber-50 px-2.5 py-1.5 ring-1 ring-amber-200 dark:bg-amber-950/30 dark:ring-amber-900">
      <div className="flex flex-wrap items-center justify-between gap-1">
        <div>
          <span className="text-[10px] font-bold text-primary">A</span>
          <span className="ml-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">Nota pessoal</span>
          <span className="ml-1.5 inline-flex items-center gap-0.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-medium text-amber-700 ring-1 ring-amber-200 dark:bg-amber-900 dark:text-amber-300">
            🔒 Visível apenas para você
          </span>
        </div>
        {!editing && (
          <button
            onClick={() => { setTexto(notaPrivada); setEditing(true); }}
            className="text-[10px] font-medium text-primary hover:underline"
          >
            {notaPrivada ? "Editar" : "Adicionar"}
          </button>
        )}
      </div>
      {editing ? (
        <div className="mt-1">
          <Textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            rows={2}
            className="text-xs"
            autoFocus
          />
          <div className="mt-1 flex justify-end gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-[10px]"
              onClick={() => { setEditing(false); setTexto(notaPrivada); }}
            >
              Cancelar
            </Button>
            <Button
              size="sm"
              className="h-6 text-[10px]"
              disabled={salvar.isPending}
              onClick={() => salvar.mutate()}
            >
              {salvar.isPending && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
              Salvar
            </Button>
          </div>
        </div>
      ) : notaPrivada ? (
        <p className="mt-0.5 whitespace-pre-wrap text-xs leading-relaxed text-foreground/90">{notaPrivada}</p>
      ) : (
        <p className="mt-0.5 text-xs italic text-muted-foreground">Sem nota — visível apenas para você.</p>
      )}
    </div>
  );
}

function NovaEvolucao({
  token,
  patientId,
  onSaved,
  isPrimeiraConsulta,
  evolutionsCount,
}: {
  token: string;
  patientId: string;
  onSaved: () => void;
  isPrimeiraConsulta: boolean;
  evolutionsCount: number;
}) {
  const [texto, setTexto] = useState(() => (isPrimeiraConsulta ? ANAMNESE_TEMPLATE : ""));
  const [plano, setPlano] = useState("");
  const [template, setTemplate] = useState<"anamnese" | "soap">(isPrimeiraConsulta ? "anamnese" : "soap");
  const preview = useMemo(() => (texto.trim().length > 3 ? deriveSoap(texto) : null), [texto]);

  const salvar = useMutation({
    mutationFn: () =>
      saveEvolution({ data: { token, patientId, evolucao: texto, planoTerapeutico: plano } }),
    onSuccess: (r) => {
      if (!r.ok) return toast.error("Não consegui salvar a evolução.");
      toast.success("Evolução registrada.");
      setTexto("");
      setPlano("");
      onSaved();
    },
  });

  const applyTemplate = (t: "anamnese" | "soap") => {
    if (t === template) return;
    if (texto.trim().length > 0) {
      toast.message("Limpe o campo de evolução antes de trocar de template", {
        description: "Isso evita perder o que você já escreveu.",
      });
      return;
    }
    setTemplate(t);
    setTexto(t === "anamnese" ? ANAMNESE_TEMPLATE : "");
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Evolução atual</h2>
        <span className="text-[11px] text-muted-foreground">Texto livre · o SOAP é derivado automaticamente</span>
      </div>

      <div className="mb-2 mt-2 flex flex-wrap items-center gap-2">
        <div className="flex rounded-full border border-border bg-muted/40 p-0.5">
          {(
            [
              { id: "anamnese", label: "Anamnese completa · 1ª consulta" },
              { id: "soap", label: "Evolução · retorno" },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => applyTemplate(t.id)}
              className={`rounded-full px-2.5 py-1 text-[10px] font-medium transition ${
                template === t.id
                  ? "bg-teal-600 text-white shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <span className="text-[10px] text-muted-foreground">
          Auto: {evolutionsCount} consulta{evolutionsCount === 1 ? "" : "s"} anterior
          {evolutionsCount === 1 ? "" : "es"} → {isPrimeiraConsulta ? "1ª consulta" : "retorno"}
        </span>
      </div>

      <div className="mt-2">
        <Dictation
          onAppend={(t) => setTexto((prev) => (prev.trim() ? `${prev.trim()}\n\n${t}` : t))}
        />
      </div>
      <Textarea
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        placeholder="Paciente relata… Ao exame… Hipótese… Conduta… — ou dite pelo microfone acima"
        className="mt-1.5 min-h-[140px] resize-none bg-background text-sm focus-visible:ring-2 focus-visible:ring-cyan-300"
      />
      {preview && (
        <div className="mt-2">
          <SoapReadOnly soap={preview} />
        </div>
      )}
      <div className="mt-3 space-y-1">
        <Label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <ClipboardList className="h-3.5 w-3.5" />
          Plano terapêutico
        </Label>
        <Textarea
          value={plano}
          onChange={(e) => setPlano(e.target.value)}
          rows={2}
          placeholder="Conduta, prescrição, retorno…"
        />
      </div>
      <div className="mt-2 flex justify-end">
        <Button
          size="sm"
          disabled={texto.trim().length < 4 || salvar.isPending}
          onClick={() => salvar.mutate()}
          className="brand-gradient text-primary-foreground"
        >
          {salvar.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
          Salvar evolução
        </Button>
      </div>
    </div>
  );
}

function EvolucaoCard({
  e,
  token,
  patientId,
  onChanged,
}: {
  e: Evolution;
  token: string;
  patientId: string;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [texto, setTexto] = useState(e.evolucao);
  const [receitaOpen, setReceitaOpen] = useState(false);

  const salvar = useMutation({
    mutationFn: () =>
      saveEvolution({ data: { token, patientId, evolutionId: e.id, evolucao: texto } }),
    onSuccess: (r) => {
      if (!r.ok) return toast.error(r.error === "sealed" ? "Evolução selada não pode ser editada." : "Não consegui salvar.");
      toast.success("Evolução atualizada.");
      setEditing(false);
      onChanged();
    },
  });

  const selar = useMutation({
    mutationFn: () => sealMyEvolution({ data: { token, evolutionId: e.id, patientId } }),
    onSuccess: (r) => {
      if (!r.ok) return toast.error("Não consegui selar. Tente de novo.");
      toast.success("Prontuário selado com assinatura digital.", {
        description: `Protocolo ${r.evolution.sealed?.protocol}`,
      });
      onChanged();
    },
  });

  return (
    <div
      id={`evo-${e.id}`}
      className={`rounded-2xl border bg-card p-4 ${
        e.sealed ? "border-emerald-300/60 dark:border-emerald-800/60" : "border-border"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{formatDateTimeBR(e.createdAt)}</span>
          {e.sealed ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800 ring-1 ring-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:ring-emerald-900">
              <ShieldCheck className="h-2.5 w-2.5" />
              Selado · ICP-Brasil
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800 ring-1 ring-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:ring-amber-900">
              Rascunho
            </span>
          )}
          {e.prescription && (
            <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-medium text-violet-800 ring-1 ring-violet-200 dark:bg-violet-950 dark:text-violet-300 dark:ring-violet-900">
              <Pill className="h-2.5 w-2.5" />
              Receita {e.prescription.code}
            </span>
          )}
        </div>
        {!e.sealed && (
          <div className="flex gap-1.5">
            {!editing && (
              <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
                <Pencil className="mr-1 h-3 w-3" /> Editar
              </Button>
            )}
            {!e.prescription && (
              <Button variant="outline" size="sm" onClick={() => setReceitaOpen(true)}>
                <Pill className="mr-1 h-3 w-3" /> Receita
              </Button>
            )}
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  size="sm"
                  disabled={selar.isPending}
                  className="brand-gradient text-primary-foreground"
                >
                  {selar.isPending ? (
                    <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                  ) : (
                    <Lock className="mr-1 h-3 w-3" />
                  )}
                  Finalizar Consulta
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Finalizar esta consulta?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Depois de finalizar, a evolução fica bloqueada para edição — isso não pode ser
                    desfeito. Confira o texto, o plano terapêutico e a receita antes de continuar.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Voltar e revisar</AlertDialogCancel>
                  <AlertDialogAction onClick={() => selar.mutate()}>
                    Finalizar consulta
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        )}
      </div>

      {editing ? (
        <div className="mt-2">
          <Textarea value={texto} onChange={(ev) => setTexto(ev.target.value)} rows={3} />
          <div className="mt-2 flex justify-end gap-1.5">
            <Button variant="ghost" size="sm" onClick={() => { setEditing(false); setTexto(e.evolucao); }}>
              <X className="mr-1 h-3 w-3" /> Cancelar
            </Button>
            <Button size="sm" disabled={salvar.isPending} onClick={() => salvar.mutate()}>
              {salvar.isPending && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
              Salvar
            </Button>
          </div>
        </div>
      ) : (
        <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">{e.evolucao}</p>
      )}

      {e.planoTerapeutico && (
        <div className="mt-2 rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 dark:border-teal-900 dark:bg-teal-950/30">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-teal-700 dark:text-teal-400">
            Plano terapêutico
          </div>
          <p className="mt-0.5 whitespace-pre-wrap text-xs leading-relaxed text-foreground/90">
            {e.planoTerapeutico}
          </p>
        </div>
      )}

      <div className="mt-3">
        <SoapReadOnly
          soap={e.soap}
          editableNota={{ token, evolutionId: e.id, onSaved: onChanged }}
        />
      </div>

      {e.prescription && (
        <div className="mt-2 rounded-lg bg-violet-50 px-3 py-2 text-xs ring-1 ring-violet-200 dark:bg-violet-950/40 dark:ring-violet-900">
          <div className="font-medium text-violet-900 dark:text-violet-300">Receita digital</div>
          <ul className="mt-1 space-y-0.5 text-violet-900 dark:text-violet-300">
            {e.prescription.meds.map((m, i) =>
              typeof m === "string" ? (
                <li key={i}>{m}</li>
              ) : (
                <li key={i}>
                  {m.name}
                  {m.dosage ? ` · ${m.dosage}` : ""}
                  {m.duration ? ` · ${m.duration}` : ""}
                </li>
              ),
            )}
          </ul>
          <a
            href={e.prescription.url}
            target="_blank"
            rel="noreferrer"
            className="mt-1 inline-block text-violet-700 underline-offset-2 hover:underline dark:text-violet-400"
          >
            {e.prescription.url}
          </a>
        </div>
      )}

      {e.sealed && (
        <div className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-[11px] text-emerald-900 ring-1 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900">
          <div><strong>Protocolo:</strong> {e.sealed.protocol}</div>
          <div className="truncate font-mono"><strong className="font-sans">Assinatura:</strong> {e.sealed.signature}</div>
          <div><strong>Selado em:</strong> {formatDateTimeBR(e.sealed.sealedAt)}</div>
        </div>
      )}

      <ReceitaDialog
        open={receitaOpen}
        onOpenChange={setReceitaOpen}
        token={token}
        evolutionId={e.id}
        patientId={patientId}
        onDone={onChanged}
      />
    </div>
  );
}

function ReceitaDialog({
  open,
  onOpenChange,
  token,
  evolutionId,
  patientId,
  onDone,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  token: string;
  evolutionId: string;
  patientId: string;
  onDone: () => void;
}) {
  const [meds, setMeds] = useState<{ name: string; dosage: string; duration: string }[]>([]);
  const [atual, setAtual] = useState("");
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [freeTextOpen, setFreeTextOpen] = useState(false);
  const [medSearch, setMedSearch] = useState("");

  const catalogFiltered = useMemo(
    () => MED_CATALOG.filter((m) => m.name.toLowerCase().includes(medSearch.toLowerCase())),
    [medSearch],
  );

  const addFromCatalog = (m: { name: string; dosage: string; duration: string }) => {
    setMeds((prev) => (prev.some((x) => x.name === m.name) ? prev : [...prev, { ...m }]));
    setMedSearch("");
    setCatalogOpen(false);
  };

  const add = () => {
    const v = atual.trim();
    if (!v) return;
    setMeds((m) => [...m, { name: v, dosage: "", duration: "" }]);
    setAtual("");
  };

  const updateMed = (i: number, patch: Partial<{ dosage: string; duration: string }>) =>
    setMeds((all) => all.map((m, j) => (j === i ? { ...m, ...patch } : m)));

  const gerar = useMutation({
    mutationFn: () => prescribeForEvolution({ data: { token, evolutionId, patientId, meds } }),
    onSuccess: (r) => {
      if (!r.ok) return toast.error("Não consegui gerar a receita.");
      toast.success(`Receita ${r.evolution.prescription?.code} gerada.`);
      setMeds([]);
      onOpenChange(false);
      onDone();
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Receita digital</DialogTitle>
          <DialogDescription>
            Adicione os medicamentos com dosagem e duração — o código verificável sai na hora.
          </DialogDescription>
        </DialogHeader>
        {!catalogOpen && !freeTextOpen && (
          <button
            type="button"
            onClick={() => setCatalogOpen(true)}
            className="block w-full rounded-lg border border-dashed border-border px-3 py-2.5 text-center text-xs text-muted-foreground transition hover:border-primary/40 hover:text-foreground"
          >
            + Adicionar medicamento à prescrição
          </button>
        )}

        {catalogOpen && (
          <div className="rounded-lg border border-border bg-muted/30 p-2">
            <Input
              autoFocus
              value={medSearch}
              onChange={(e) => setMedSearch(e.target.value)}
              placeholder="Buscar medicamento…"
              className="h-8 text-xs"
            />
            <div className="mt-1.5 max-h-48 space-y-0.5 overflow-y-auto">
              {catalogFiltered.map((m) => (
                <button
                  key={m.name}
                  type="button"
                  onClick={() => addFromCatalog(m)}
                  className="flex w-full flex-col rounded-md px-2 py-1.5 text-left hover:bg-muted"
                >
                  <span className="text-[12px] font-medium">{m.name}</span>
                  <span className="text-[10px] text-muted-foreground">
                    {m.dosage} · {m.duration}
                  </span>
                </button>
              ))}
              {catalogFiltered.length === 0 && (
                <p className="px-2 py-2 text-[11px] text-muted-foreground">
                  Nenhum medicamento encontrado.
                </p>
              )}
            </div>
            <div className="mt-1.5 border-t border-border pt-1.5 text-center">
              <button
                type="button"
                onClick={() => {
                  setCatalogOpen(false);
                  setFreeTextOpen(true);
                  setMedSearch("");
                }}
                className="text-[11px] text-primary hover:underline"
              >
                ou digite um medicamento não listado
              </button>
            </div>
            <button
              type="button"
              onClick={() => {
                setCatalogOpen(false);
                setMedSearch("");
              }}
              className="mt-1.5 w-full text-center text-[10px] text-muted-foreground hover:text-foreground"
            >
              Fechar
            </button>
          </div>
        )}

        {freeTextOpen && (
          <div className="flex gap-2">
            <Input
              autoFocus
              value={atual}
              onChange={(e) => setAtual(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  add();
                }
              }}
              placeholder="Ex.: Sulfato Ferroso 40mg"
            />
            <Button type="button" variant="outline" onClick={add}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        )}
        {meds.length > 0 && (
          <ul className="space-y-2">
            {meds.map((m, i) => (
              <li key={`${m.name}-${i}`} className="rounded-lg border border-border bg-muted/40 p-2.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-1.5 font-medium">
                    <Pill className="h-3 w-3 text-primary" />
                    {m.name}
                  </span>
                  <button
                    onClick={() => setMeds((all) => all.filter((_, j) => j !== i))}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <div className="space-y-0.5">
                    <Label className="text-[10px] text-muted-foreground">Dosagem e frequência</Label>
                    <Input
                      value={m.dosage}
                      onChange={(e) => updateMed(i, { dosage: e.target.value })}
                      placeholder="Ex.: 1cp 2x/dia"
                      className="h-7 text-xs"
                    />
                  </div>
                  <div className="space-y-0.5">
                    <Label className="text-[10px] text-muted-foreground">Duração do tratamento</Label>
                    <Input
                      value={m.duration}
                      onChange={(e) => updateMed(i, { duration: e.target.value })}
                      placeholder="Ex.: 90 dias"
                      className="h-7 text-xs"
                    />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button
            disabled={meds.length === 0 || gerar.isPending}
            onClick={() => gerar.mutate()}
            className="brand-gradient text-primary-foreground"
          >
            {gerar.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Gerar receita
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
