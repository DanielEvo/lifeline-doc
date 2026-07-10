// Prontuário real do paciente: evoluções persistidas, SOAP derivado no
// servidor, selo digital (protocolo + assinatura SHA-256) e receita digital.
// Selar congela a evolução — a UI esconde a edição e o servidor rejeita.

import { useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowLeft,
  Cake,
  CalendarPlus,
  CreditCard,
  FileSignature,
  Loader2,
  Lock,
  Mail,
  Pencil,
  Phone,
  Pill,
  Plus,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
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
  sealMyEvolution,
  updateMyPatient,
} from "@/lib/api/clinic.functions";
import { ScheduleDialog } from "@/components/clinic/action-dialogs";
import { WhatsAppButton } from "@/components/clinic/wa-button";
import { PatientHistory } from "@/components/clinic/patient-history";
import { Dictation } from "@/components/clinic/dictation";
import { SimilarCases } from "@/components/clinic/similar-cases";
import {
  ageFrom,
  DEFAULT_COLUMNS,
  formatDateTimeBR,
  initialsOf,
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

  const { patient: p, evolutions, measurements } = rec.data;
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
            <Button variant="outline" size="sm" onClick={() => setKbOpen(true)}>
              <BookOpen className="mr-1 h-3.5 w-3.5" /> Base de conhecimento
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

      {/* Histórico clínico: linha do tempo + biomarcadores (como na demo, com dados reais) */}
      <PatientHistory
        token={token}
        patientId={id}
        measurements={measurements}
        evolutions={evolutions}
        onChanged={invalidate}
      />

      {/* Nova evolução */}
      <NovaEvolucao token={token} patientId={id} onSaved={invalidate} />

      {/* Linha do tempo */}
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

      {/* Apoio à decisão */}
      <SimilarCases />

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
      <KnowledgeDrawer open={kbOpen} onOpenChange={setKbOpen} />
    </div>
  );
}

// ---------------------------------------------------------------------------

function SoapGrid({ soap }: { soap: Evolution["soap"] }) {
  const items = [
    { k: "S", label: "Subjetivo", text: soap.s },
    { k: "O", label: "Objetivo", text: soap.o },
    { k: "A", label: "Avaliação", text: soap.a },
    { k: "P", label: "Plano", text: soap.p },
  ].filter((i) => i.text);
  if (items.length === 0) return null;
  return (
    <div className="grid gap-1.5 sm:grid-cols-2">
      {items.map((i) => (
        <div key={i.k} className="rounded-lg bg-muted/60 px-2.5 py-1.5">
          <span className="text-[10px] font-bold text-primary">{i.k}</span>
          <span className="ml-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">{i.label}</span>
          <p className="mt-0.5 text-xs leading-relaxed text-foreground/90">{i.text}</p>
        </div>
      ))}
    </div>
  );
}

function NovaEvolucao({
  token,
  patientId,
  onSaved,
}: {
  token: string;
  patientId: string;
  onSaved: () => void;
}) {
  const [texto, setTexto] = useState("");
  const preview = useMemo(() => (texto.trim().length > 3 ? deriveSoap(texto) : null), [texto]);

  const salvar = useMutation({
    mutationFn: () => saveEvolution({ data: { token, patientId, evolucao: texto } }),
    onSuccess: (r) => {
      if (!r.ok) return toast.error("Não consegui salvar a evolução.");
      toast.success("Evolução registrada.");
      setTexto("");
      onSaved();
    },
  });

  return (
    <div className="mt-4 rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Nova evolução</h2>
        <span className="text-[11px] text-muted-foreground">Texto livre · o SOAP é derivado automaticamente</span>
      </div>
      <div className="mt-2">
        <Dictation
          onAppend={(t) => setTexto((prev) => (prev.trim() ? `${prev.trim()}\n\n${t}` : t))}
        />
      </div>
      <Textarea
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        rows={3}
        placeholder="Paciente relata… Ao exame… Hipótese… Conduta… — ou dite pelo microfone acima"
        className="mt-2"
      />
      {preview && (
        <div className="mt-2">
          <SoapGrid soap={preview} />
        </div>
      )}
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
            <Button
              size="sm"
              disabled={selar.isPending}
              onClick={() => selar.mutate()}
              className="brand-gradient text-primary-foreground"
            >
              {selar.isPending ? (
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              ) : (
                <Lock className="mr-1 h-3 w-3" />
              )}
              Selar
            </Button>
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

      <div className="mt-3">
        <SoapGrid soap={e.soap} />
      </div>

      {e.prescription && (
        <div className="mt-2 rounded-lg bg-violet-50 px-3 py-2 text-xs ring-1 ring-violet-200 dark:bg-violet-950/40 dark:ring-violet-900">
          <div className="font-medium text-violet-900 dark:text-violet-300">
            Receita digital · {e.prescription.meds.join(" · ")}
          </div>
          <a
            href={e.prescription.url}
            target="_blank"
            rel="noreferrer"
            className="text-violet-700 underline-offset-2 hover:underline dark:text-violet-400"
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
  const [meds, setMeds] = useState<string[]>([]);
  const [atual, setAtual] = useState("");

  const add = () => {
    const v = atual.trim();
    if (!v) return;
    setMeds((m) => [...m, v]);
    setAtual("");
  };

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
            Adicione os medicamentos com posologia — o código verificável sai na hora.
          </DialogDescription>
        </DialogHeader>
        <div className="flex gap-2">
          <Input
            value={atual}
            onChange={(e) => setAtual(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
            placeholder="Ex.: Sulfato Ferroso 40mg — 2x/dia em jejum"
          />
          <Button type="button" variant="outline" onClick={add}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        {meds.length > 0 && (
          <ul className="space-y-1">
            {meds.map((m, i) => (
              <li
                key={`${m}-${i}`}
                className="flex items-center justify-between rounded-lg bg-muted/60 px-3 py-1.5 text-xs"
              >
                <span className="inline-flex items-center gap-1.5">
                  <Pill className="h-3 w-3 text-primary" />
                  {m}
                </span>
                <button
                  onClick={() => setMeds((all) => all.filter((_, j) => j !== i))}
                  className="text-muted-foreground hover:text-foreground"
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
