// Prontuário real do paciente: evoluções persistidas, SOAP derivado no
// servidor, selo digital (protocolo + assinatura SHA-256) e receita digital.
// Selar congela a evolução — a UI esconde a edição e o servidor rejeita.

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowLeft,
  Cake,
  CalendarClock,
  CalendarPlus,
  Check,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  Clock,
  Copy,
  CreditCard,
  FileSignature,
  FileText,
  FileUp,
  KeyRound,
  Loader2,
  Lock,
  Mail,
  NotebookPen,
  Pencil,
  Phone,
  Pill,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  TrendingDown,
  TrendingUp,
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
  confirmExtractedMeasurements,
  cancelMemedPrescriptionFn,
  confirmMemedPrescription,
  extractExamDocument,
  getDoctorProfile,
  getMemedWidgetConfig,
  getPatientRecord,
  getWorkspace,
  moveMyPatient,
  prescribeForEvolution,
  saveEvolution,
  saveEvolutionNote,
  saveMemedProfile,
  saveMyPatientNotes,
  saveMyPreferredMetrics,
  sealMyEvolution,
  setMyAppointmentStatus,
  updateMyAppointmentTiming,
  updateMyPatient,
} from "@/lib/api/clinic.functions";
import { invalidateWorkspace, ScheduleDialog } from "@/components/clinic/action-dialogs";
import { listMyServices } from "@/lib/api/services.functions";
import {
  deleteMyTemplate,
  generateMyTemplateDraft,
  listMyTemplates,
  saveMyTemplate,
} from "@/lib/api/templates.functions";
import type { EvolutionTemplate } from "@/lib/templates.server";
import { WhatsAppButton } from "@/components/clinic/wa-button";
import { BiomarkerPanel, ClinicalTimeline, usePatientHistory } from "@/components/clinic/patient-history";
import { Dictation } from "@/components/clinic/dictation";
import { MemedPrescriptionWidget } from "@/components/clinic/memed-prescription-widget";
import {
  ageFrom,
  ANAMNESE_TEMPLATE,
  BIOMARKER_CATALOG,
  calcImc,
  DEFAULT_COLUMNS,
  ETILISMO_LABEL,
  formatBRL,
  formatDateBR,
  formatDateTimeBR,
  formatHourBR,
  initialsOf,
  isConsultaAppointment,
  localDateTimeToIso,
  isOutOfRange,
  MED_CATALOG,
  parseTemplateSections,
  TABAGISMO_LABEL,
  TEMPLATE_PADRAO,
  WA_TEMPLATES,
  type Appointment,
  type Evolution,
  type Measurement,
  type Patient,
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
  const doctorMetrics = wsq.data?.ok ? wsq.data.doctor.preferredMetrics : [];

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
          passaporte: v.passaporte || null,
          telefone: v.telefone || null,
          email: v.email || null,
          convenio: v.convenio || null,
          queixa: v.queixa ?? "",
          column: v.column,
          tipoSanguineo: v.tipoSanguineo || null,
          tabagismo: (v.tabagismo || null) as "nunca" | "ex_fumante" | "fumante" | null,
          etilismo: (v.etilismo || null) as "nunca" | "ex_etilista" | "etilista" | null,
          comorbidades: v.comorbidades ?? [],
          alergias: v.alergias || null,
          medicacaoContinua: v.medicacaoContinua || null,
          pesoKg: v.pesoKg ? Number(v.pesoKg) : null,
          alturaCm: v.alturaCm ? Number(v.alturaCm) : null,
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
  // Biomarcadores ficam no Postgres; se a tabela estiver fora, o resto do
  // prontuário ainda abre — mas o médico PRECISA saber que a lista de exames
  // está incompleta, senão "sem exames" parece resultado clínico.
  const measurementsUnavailable = rec.data?.ok ? rec.data.measurementsUnavailable : false;
  const hist = usePatientHistory(measurements, evolutions);

  // "foco" de uma métrica principal (PRO-08): reaproveita o showAll existente
  // do BiomarkerPanel (garante que o gráfico esteja na lista) e rola até ele
  // assim que o DOM tiver o card — mesmo padrão de sincronização por id do
  // NovaEvolucao (activeHistoricoId).
  const [pendingFocusMetric, setPendingFocusMetric] = useState<string | null>(null);
  useEffect(() => {
    if (!pendingFocusMetric) return;
    const el = document.getElementById(`biomarker-${pendingFocusMetric}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "nearest" });
      setPendingFocusMetric(null);
    }
  }, [pendingFocusMetric, hist.showAll]);
  const onFocusMetric = (name: string) => {
    hist.setShowAll(true);
    setPendingFocusMetric(name);
  };

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
              {(p.tipoSanguineo || p.tabagismo || p.etilismo || (p.pesoKg && p.alturaCm) || (p.comorbidades && p.comorbidades.length > 0) || p.alergias) && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {p.tipoSanguineo && (
                    <span className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-medium text-red-700 ring-1 ring-red-200 dark:bg-red-950/50 dark:text-red-300 dark:ring-red-900">
                      Tipo {p.tipoSanguineo}
                    </span>
                  )}
                  {p.tabagismo && p.tabagismo !== "nunca" && (
                    <span className="rounded-full bg-orange-50 px-2 py-0.5 text-[10px] font-medium text-orange-700 ring-1 ring-orange-200 dark:bg-orange-950/50 dark:text-orange-300 dark:ring-orange-900">
                      {TABAGISMO_LABEL[p.tabagismo]}
                    </span>
                  )}
                  {p.etilismo && p.etilismo !== "nunca" && (
                    <span className="rounded-full bg-orange-50 px-2 py-0.5 text-[10px] font-medium text-orange-700 ring-1 ring-orange-200 dark:bg-orange-950/50 dark:text-orange-300 dark:ring-orange-900">
                      {ETILISMO_LABEL[p.etilismo]}
                    </span>
                  )}
                  {p.pesoKg && p.alturaCm && (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground ring-1 ring-border">
                      {p.pesoKg}kg · {p.alturaCm}cm · IMC {calcImc(p.pesoKg, p.alturaCm)}
                    </span>
                  )}
                  {p.comorbidades?.map((c) => (
                    <span key={c} className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700 ring-1 ring-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:ring-amber-900">
                      {c}
                    </span>
                  ))}
                  {p.alergias && (
                    <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-medium text-rose-700 ring-1 ring-rose-200 dark:bg-rose-950/50 dark:text-rose-300 dark:ring-rose-900">
                      ⚠ Alergia: {p.alergias}
                    </span>
                  )}
                </div>
              )}
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

        {measurementsUnavailable && (
          <div className="mt-3 flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-800 ring-1 ring-red-200 dark:bg-red-950/50 dark:text-red-300 dark:ring-red-900">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              <strong>Exames indisponíveis agora:</strong> não consegui ler o histórico de
              biomarcadores deste paciente. O resto do prontuário está completo, mas{" "}
              <strong>não interprete a ausência de exames como resultado clínico</strong> — recarregue
              a página em instantes ou avise o suporte se persistir.
            </span>
          </div>
        )}

        <PreferredMetricsHeader
          doctorMetrics={doctorMetrics}
          measurements={measurements}
          onFocusMetric={onFocusMetric}
          token={token}
          onChanged={() => qc.invalidateQueries({ queryKey: ["workspace"] })}
        />

        {p.pendingEmail && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 ring-1 ring-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:ring-amber-900">
            <span>
              <strong>E-mail pendente de confirmação:</strong> {p.pendingEmail} — o paciente precisa
              aprovar antes de valer.
            </span>
            <WhatsAppButton
              telefone={p.telefone}
              text={WA_TEMPLATES.confirmarEmail(
                p.nome,
                `${typeof window !== "undefined" ? window.location.origin : ""}/confirmar-email/${p.pendingEmailToken}`,
                medico,
              )}
              title="Enviar link de confirmação"
              size="md"
            />
          </div>
        )}
      </div>

      <MiniAgenda
        appointments={
          wsq.data?.ok
            ? wsq.data.appointments.filter((a) => isConsultaAppointment(a) && a.patientId === id)
            : []
        }
        token={token}
        onAgendar={() => setAgendarOpen(true)}
      />

      {/* Linha do tempo clínica: horizontal, full-width, logo abaixo do header */}
      <ClinicalTimeline
        events={hist.events}
        activeKey={hist.activeKey}
        activeConsultaKey={hist.activeConsultaKey}
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

      <MinhasNotas token={token} patientId={id} notasMedicas={p.notasMedicas} onSaved={invalidate} />

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
        <div className="min-w-0">
          <NovaEvolucao
            token={token}
            patientId={id}
            onSaved={invalidate}
            isPrimeiraConsulta={evolutions.length === 0}
            evolutionsCount={evolutions.length}
            evolutions={evolutions}
            activeHistoricoId={hist.activeConsulta?.evolutionId ?? null}
            onActiveHistoricoChange={(id) => hist.setActiveConsulta(id)}
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
                    patient={p}
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
      <UploadExamesDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        patientName={p.nome}
        patientId={id}
        token={token}
        onSaved={invalidate}
      />
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
// Métricas principais (PRO-08) — chips de biomarcadores em destaque no header,
// configuráveis por médico (até 5, do BIOMARKER_CATALOG). Clique num chip com
// dado foca o gráfico correspondente no painel de biomarcadores. Mostra
// "estava → está" (não só o valor atual) — é a leitura mais rápida pra saber
// se o paciente está melhorando ou piorando sem abrir o gráfico.

type MetricInfo = { latest: Measurement; prev: Measurement | null; trend: "up" | "down" | null };

function metricInfoFor(measurements: Measurement[], name: string): MetricInfo | null {
  const series = measurements.filter((m) => m.name === name).sort((a, b) => b.date.localeCompare(a.date));
  if (series.length === 0) return null;
  const [latest, prev] = series;
  const trend: MetricInfo["trend"] =
    prev && prev.value !== latest.value ? (latest.value > prev.value ? "up" : "down") : null;
  return { latest, prev: prev ?? null, trend };
}

function PreferredMetricsHeader({
  doctorMetrics,
  measurements,
  onFocusMetric,
  token,
  onChanged,
}: {
  doctorMetrics: string[];
  measurements: Measurement[];
  onFocusMetric: (name: string) => void;
  token: string;
  onChanged: () => void;
}) {
  const [configOpen, setConfigOpen] = useState(false);

  return (
    <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-border/60 pt-3">
      {doctorMetrics.length === 0 ? (
        <button
          type="button"
          onClick={() => setConfigOpen(true)}
          className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-2.5 py-1 text-[11px] text-muted-foreground transition hover:border-primary/40 hover:text-foreground"
        >
          <Plus className="h-3 w-3" /> Escolher métricas principais
        </button>
      ) : (
        <>
          {doctorMetrics.map((name) => {
            const info = metricInfoFor(measurements, name);
            if (!info) {
              return (
                <span
                  key={name}
                  className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-[11px] text-muted-foreground ring-1 ring-border"
                >
                  {name}: sem dado ainda
                </span>
              );
            }
            const out = isOutOfRange(info.latest);
            const TrendIcon = info.trend === "up" ? TrendingUp : info.trend === "down" ? TrendingDown : null;
            const tooltip = info.prev
              ? `${name}: ${formatDateBR(info.prev.date)} ${info.prev.value} → ${formatDateBR(info.latest.date)} ${info.latest.value} ${info.latest.unit}`
              : `Ver ${name} no painel de biomarcadores`;
            return (
              <button
                key={name}
                type="button"
                onClick={() => onFocusMetric(name)}
                title={tooltip}
                className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary ring-1 ring-primary/30 transition hover:bg-primary/15"
              >
                {name}:
                {info.prev && (
                  <span className="font-normal text-primary/60">{info.prev.value} →</span>
                )}
                {TrendIcon && <TrendIcon className={`h-3 w-3 ${out ? "text-rose-500" : ""}`} />}
                <strong className={`font-semibold ${out ? "text-rose-600 dark:text-rose-400" : ""}`}>
                  {info.latest.value}
                </strong>{" "}
                {info.latest.unit}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setConfigOpen(true)}
            title="Editar métricas principais"
            className="ml-0.5 text-muted-foreground/50 transition hover:text-foreground"
          >
            <Pencil className="h-3 w-3" />
          </button>
        </>
      )}

      <PreferredMetricsDialog
        open={configOpen}
        onOpenChange={setConfigOpen}
        token={token}
        initial={doctorMetrics}
        onSaved={onChanged}
      />
    </div>
  );
}

// Ordem alfabética (pt-BR) computada uma vez — a ordem de BIOMARKER_CATALOG
// é por painel clínico, não por nome, e essa lista é uma busca por texto.
const SORTED_BIOMARKER_CATALOG = [...BIOMARKER_CATALOG].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));

function PreferredMetricsDialog({
  open,
  onOpenChange,
  token,
  initial,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  token: string;
  initial: string[];
  onSaved: () => void;
}) {
  const [selected, setSelected] = useState<string[]>(initial);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (open) {
      setSelected(initial);
      setQuery("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const toggle = (name: string) => {
    setSelected((prev) => {
      if (prev.includes(name)) return prev.filter((x) => x !== name);
      if (prev.length >= 5) {
        toast.message("Máximo de 5 métricas — remova uma antes de adicionar outra.");
        return prev;
      }
      return [...prev, name];
    });
  };

  // Selecionadas sempre aparecem, mesmo sem bater com a busca — senão parece
  // que a seleção sumiu quando o médico digita pra achar a próxima.
  const needle = query.trim().toLowerCase();
  const visible = SORTED_BIOMARKER_CATALOG.filter(
    (b) => selected.includes(b.name) || b.name.toLowerCase().includes(needle),
  );
  const cheia = selected.length >= 5;

  const salvar = useMutation({
    mutationFn: () => saveMyPreferredMetrics({ data: { token, metrics: selected } }),
    onSuccess: (r) => {
      if (!r.ok) return toast.error("Não consegui salvar.");
      toast.success("Métricas principais atualizadas.");
      onOpenChange(false);
      onSaved();
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Métricas principais</DialogTitle>
          <DialogDescription>
            Escolha até 5 biomarcadores para aparecerem em destaque no topo do prontuário.
          </DialogDescription>
        </DialogHeader>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar biomarcador…"
            className="h-8 pl-8 text-xs"
          />
        </div>
        <div className="flex max-h-64 flex-wrap gap-1.5 overflow-y-auto">
          {visible.length === 0 ? (
            <p className="w-full py-4 text-center text-xs text-muted-foreground">
              Nenhum biomarcador encontrado para "{query}".
            </p>
          ) : (
            visible.map((b) => {
              const active = selected.includes(b.name);
              const disabled = !active && cheia;
              return (
                <button
                  key={b.name}
                  type="button"
                  disabled={disabled}
                  onClick={() => toggle(b.name)}
                  title={disabled ? "Máximo de 5 — remova uma antes de adicionar outra" : undefined}
                  className={`rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 transition ${
                    active
                      ? "bg-primary/10 text-primary ring-primary/40"
                      : disabled
                        ? "cursor-not-allowed bg-muted text-muted-foreground/40 ring-border/60"
                        : "bg-muted text-muted-foreground ring-border hover:text-foreground"
                  }`}
                >
                  {b.name}
                </button>
              );
            })
          )}
        </div>
        <div className="text-[11px] text-muted-foreground">{selected.length}/5 selecionadas</div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button
            disabled={salvar.isPending}
            onClick={() => salvar.mutate()}
            className="brand-gradient text-primary-foreground"
          >
            {salvar.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Adicionar exames — dropzone drag & drop (mesmo UX do cadastro), leitura via
// IA (Gemini) com revisão do médico antes de gravar qualquer biomarcador.

type FileEntry = {
  file: File;
  // PAC-03 — "queued" cobre o tempo entre o drop e o processamento de fato:
  // a extração roda um arquivo por vez, então o resto da fila precisa de um
  // estado visível diferente de "lendo agora".
  state: "queued" | "reading" | "review" | "done" | "error";
  errorMsg?: string;
  extracted?: {
    rawName: string;
    value: number;
    unit: string;
    refMin: number | null;
    refMax: number | null;
    matchedName: string | null;
    manualOverrideName?: string | null;
  }[];
  collectionDate?: string | null;
  /** true = usuário já viu o aviso de descarte parcial e pediu pra confirmar mesmo assim */
  confirmingDiscard?: boolean;
  /** razão clínica da solicitação — aparece no card da linha do tempo */
  motivo?: string;
};
const ACCEPTED_EXTS = [".pdf", ".jpg", ".jpeg", ".png"];
// PAC-04 — mesmo teto declarado no servidor (clinic.functions.ts).
const MAX_EXAM_FILE_MB = 15;
const MAX_EXAM_FILE_BYTES = MAX_EXAM_FILE_MB * 1024 * 1024;

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ---------------------------------------------------------------------------
// Mini-agenda nativa do paciente — próximas consultas + histórico curto,
// direto na tela do prontuário, sem sair para a agenda geral.

function MiniAgenda({
  appointments,
  token,
  onAgendar,
}: {
  appointments: Appointment[];
  token: string;
  onAgendar: () => void;
}) {
  const qc = useQueryClient();
  const [reagendando, setReagendando] = useState<string | null>(null);
  const [novaData, setNovaData] = useState("");
  const [novaHora, setNovaHora] = useState("");

  const upcoming = [...appointments]
    .filter((a) => a.status !== "faltou" && a.status !== "realizada")
    .sort((a, b) => a.dateTime.localeCompare(b.dateTime));
  const past = [...appointments]
    .filter((a) => a.status === "faltou" || a.status === "realizada")
    .sort((a, b) => b.dateTime.localeCompare(a.dateTime))
    .slice(0, 3);

  const status = useMutation({
    mutationFn: (v: { id: string; status: Appointment["status"] }) =>
      setMyAppointmentStatus({ data: { token, ...v } }),
    onSuccess: (r) => {
      if (!r.ok) return toast.error("Não consegui atualizar a consulta.");
      invalidateWorkspace(qc);
    },
  });

  const reagendar = useMutation({
    mutationFn: (v: { id: string; dateTime: string }) =>
      updateMyAppointmentTiming({ data: { token, ...v } }),
    onSuccess: (r) => {
      if (!r.ok) return toast.error("Não consegui remarcar.");
      toast.success("Consulta remarcada.");
      setReagendando(null);
      invalidateWorkspace(qc);
    },
  });

  return (
    <div className="mt-3 rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold">
          <CalendarClock className="h-4 w-4 text-primary" /> Agenda
        </h2>
        <Button variant="outline" size="sm" onClick={onAgendar}>
          <CalendarPlus className="mr-1 h-3.5 w-3.5" /> Agendar
        </Button>
      </div>

      {upcoming.length === 0 && past.length === 0 && (
        <p className="mt-2 text-xs text-muted-foreground">Nenhuma consulta agendada ainda.</p>
      )}

      {upcoming.length > 0 && (
        <ul className="mt-2 space-y-1.5">
          {upcoming.map((a) => (
            <li
              key={a.id}
              className="flex flex-wrap items-center gap-2 rounded-lg bg-muted/40 px-2.5 py-1.5 text-xs"
            >
              <span className="font-medium">
                {formatDateBR(a.dateTime)} · {formatHourBR(a.dateTime)}
              </span>
              <span
                className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                  a.status === "confirmada"
                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {a.status === "confirmada" ? "Confirmada" : "Agendada"}
              </span>
              {a.note && <span className="text-muted-foreground">· {a.note}</span>}
              <span className="ml-auto flex items-center gap-1.5">
                {reagendando === a.id ? (
                  <>
                    <input
                      type="date"
                      value={novaData}
                      onChange={(e) => setNovaData(e.target.value)}
                      className="rounded border border-border bg-background px-1 py-0.5 text-[11px]"
                    />
                    <input
                      type="time"
                      value={novaHora}
                      onChange={(e) => setNovaHora(e.target.value)}
                      className="rounded border border-border bg-background px-1 py-0.5 text-[11px]"
                    />
                    <button
                      type="button"
                      disabled={!novaData || !novaHora || reagendar.isPending}
                      onClick={() => reagendar.mutate({ id: a.id, dateTime: localDateTimeToIso(novaData, novaHora) })}
                      className="rounded bg-primary px-1.5 py-0.5 text-[11px] font-medium text-primary-foreground disabled:opacity-50"
                    >
                      OK
                    </button>
                    <button
                      type="button"
                      onClick={() => setReagendando(null)}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </>
                ) : (
                  <>
                    {a.status !== "confirmada" && (
                      <button
                        type="button"
                        title="Confirmar"
                        onClick={() => status.mutate({ id: a.id, status: "confirmada" })}
                        className="text-muted-foreground hover:text-emerald-600"
                      >
                        <Check className="h-3.5 w-3.5" />
                      </button>
                    )}
                    <button
                      type="button"
                      title="Remarcar"
                      onClick={() => {
                        setReagendando(a.id);
                        setNovaData(a.dateTime.slice(0, 10));
                        setNovaHora(a.dateTime.slice(11, 16));
                      }}
                      className="text-muted-foreground hover:text-primary"
                    >
                      <CalendarClock className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      title="Marcar falta"
                      onClick={() => status.mutate({ id: a.id, status: "faltou" })}
                      className="text-muted-foreground hover:text-red-600"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}

      {past.length > 0 && (
        <div className="mt-2 border-t border-border/60 pt-2">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Anteriores
          </p>
          <ul className="mt-1 space-y-1">
            {past.map((a) => (
              <li key={a.id} className="flex items-center gap-2 text-[11px] text-muted-foreground">
                <span>{formatDateBR(a.dateTime)}</span>
                <span className={a.status === "faltou" ? "text-red-600 dark:text-red-400" : ""}>
                  {a.status === "realizada" ? "Realizada" : "Faltou"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function UploadExamesDialog({
  open,
  onOpenChange,
  patientName,
  patientId,
  token,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  patientName: string;
  patientId: string;
  token: string;
  onSaved: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [dragging, setDragging] = useState(false);

  async function processFiles(list: FileList) {
    const incoming = Array.from(list);
    const entries: FileEntry[] = incoming.map((file) => {
      const ext = "." + (file.name.split(".").pop()?.toLowerCase() ?? "");
      if (!ACCEPTED_EXTS.includes(ext)) {
        return { file, state: "error", errorMsg: `Formato não suportado (${ext || "?"})` };
      }
      if (file.size > MAX_EXAM_FILE_BYTES) {
        return { file, state: "error", errorMsg: `Arquivo muito grande (máx. ${MAX_EXAM_FILE_MB}MB)` };
      }
      return { file, state: "queued" };
    });
    setFiles((prev) => [...prev, ...entries]);

    for (const entry of entries) {
      if (entry.state !== "queued") continue;
      setFiles((prev) => prev.map((f) => (f.file === entry.file ? { ...f, state: "reading" } : f)));
      try {
        const base64 = await fileToBase64(entry.file);
        const mimeType = entry.file.type || "application/pdf";
        const result = await extractExamDocument({
          data: { token, fileBase64: base64, mimeType: mimeType as any },
        });
        if (!result.ok) {
          const errorMsg =
            result.error === "ocr_limit"
              ? "Limite diário de leituras por IA atingido — tente de novo amanhã"
              : "Falha na leitura do documento";
          setFiles((prev) =>
            prev.map((f) => (f.file === entry.file ? { ...f, state: "error", errorMsg } : f)),
          );
          continue;
        }
        setFiles((prev) =>
          prev.map((f) =>
            f.file === entry.file
              ? { ...f, state: "review", extracted: result.items, collectionDate: result.collectionDate }
              : f,
          ),
        );
      } catch {
        setFiles((prev) =>
          prev.map((f) =>
            f.file === entry.file ? { ...f, state: "error", errorMsg: "Erro ao processar arquivo" } : f,
          ),
        );
      }
    }
  }

  const confirmarExame = async (entry: FileEntry, force = false) => {
    if (!entry.extracted || entry.extracted.length === 0) return;
    const mapped = entry.extracted
      .map((it) => {
        const name = it.matchedName ?? it.manualOverrideName ?? null;
        if (!name) return null;
        return { name, value: it.value, unit: it.unit, refMin: it.refMin ?? 0, refMax: it.refMax ?? 0 };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);

    if (mapped.length === 0) {
      toast.error("Nenhum biomarcador mapeado neste exame — reconheça ou lance manualmente.");
      return;
    }
    const unmappedCount = entry.extracted.length - mapped.length;
    // Descarte parcial não pode ser silencioso — exige uma confirmação explícita
    // antes de gravar, ou o médico pode não perceber que um resultado sumiu.
    if (unmappedCount > 0 && !force) {
      setFiles((prev) =>
        prev.map((f) => (f.file === entry.file ? { ...f, confirmingDiscard: true } : f)),
      );
      return;
    }
    const r = await confirmExtractedMeasurements({
      data: {
        token,
        patientId,
        date: entry.collectionDate || new Date().toISOString().slice(0, 10),
        motivo: entry.motivo?.trim() || null,
        items: mapped,
      },
    });
    if (!r.ok) {
      toast.error("Não consegui salvar os exames.");
      return;
    }
    setFiles((prev) => prev.map((f) => (f.file === entry.file ? { ...f, state: "done" } : f)));
    const skippedTxt = r.skipped > 0 ? ` · ${r.skipped} já existia${r.skipped === 1 ? "" : "m"} (ignorado${r.skipped === 1 ? "" : "s"})` : "";
    toast.success(`${r.added} biomarcador${r.added === 1 ? "" : "es"} adicionado${r.added === 1 ? "" : "s"} ao histórico${skippedTxt}.`);
    onSaved();
  };

  const doneCount = files.filter((f) => f.state === "done").length;
  // OCR-04 — confirmação em lote: só entram arquivos 100% reconhecidos
  // (nenhum biomarcador sem correspondência), pra nunca descartar nada
  // silenciosamente em massa. Descarte parcial continua exigindo revisão
  // individual (fluxo confirmingDiscard acima).
  const [bulkBusy, setBulkBusy] = useState(false);
  const bulkConfirmable = files.filter(
    (f) =>
      f.state === "review" &&
      f.extracted &&
      f.extracted.length > 0 &&
      f.extracted.every((it) => it.matchedName || it.manualOverrideName),
  );
  const confirmarTodos = async () => {
    if (bulkBusy) return;
    setBulkBusy(true);
    try {
      for (const entry of bulkConfirmable) await confirmarExame(entry);
    } finally {
      setBulkBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) setFiles([]); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileUp className="h-4 w-4 text-primary" /> Adicionar exames
          </DialogTitle>
          <DialogDescription>
            Anexe PDFs ou imagens dos exames de {patientName.split(" ")[0]}. O sistema lê o
            documento e identifica os biomarcadores — revise os valores antes de salvar.
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
          <p className="text-[11px] text-muted-foreground/70">
            .pdf · .jpg · .jpeg · .png · máx. {MAX_EXAM_FILE_MB}MB por arquivo
          </p>
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
          <ul className="mt-1 max-h-72 space-y-1.5 overflow-y-auto">
            {bulkConfirmable.length > 1 && (
              <li>
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full"
                  disabled={bulkBusy}
                  onClick={confirmarTodos}
                >
                  {bulkBusy ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  Confirmar todos os {bulkConfirmable.length} reconhecidos automaticamente
                </Button>
              </li>
            )}
            {files.map((entry, i) => (
              <li
                key={i}
                className={`rounded-lg px-3 py-2 text-sm ${
                  entry.state === "error"
                    ? "bg-red-50 text-red-700 ring-1 ring-red-200 dark:bg-red-950/40 dark:text-red-300 dark:ring-red-800"
                    : "bg-muted/50"
                }`}
              >
                <div className="flex items-center gap-2">
                  {entry.state === "queued" && (
                    <Clock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  )}
                  {entry.state === "reading" && (
                    <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />
                  )}
                  {entry.state === "review" && (
                    <ClipboardList className="h-3.5 w-3.5 shrink-0 text-primary" />
                  )}
                  {entry.state === "done" && (
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                  )}
                  {entry.state === "error" && <X className="h-3.5 w-3.5 shrink-0 text-red-500" />}
                  <span className="min-w-0 flex-1 truncate">{entry.file.name}</span>
                  <span className="shrink-0 text-[11px] text-muted-foreground">
                    {entry.state === "queued" && "Na fila…"}
                    {entry.state === "reading" && "Lendo documento…"}
                    {entry.state === "review" && "Revise abaixo"}
                    {entry.state === "done" && "✓ salvo"}
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
                </div>
                {entry.state === "review" && entry.extracted && (
                  <div className="mt-2 space-y-1.5 border-t border-border/60 pt-2">
                    {entry.extracted.length === 0 && (
                      <p className="text-[11px] text-muted-foreground">
                        Nenhum biomarcador identificado neste arquivo.
                      </p>
                    )}
                    {entry.extracted.map((it, j) => (
                      <div
                        key={j}
                        className={`flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs ${
                          it.matchedName || it.manualOverrideName
                            ? "bg-background ring-1 ring-border"
                            : "bg-muted/40 text-muted-foreground opacity-70"
                        }`}
                      >
                        {it.matchedName ? (
                          <span className="min-w-0 flex-1 truncate">{it.matchedName}</span>
                        ) : (
                          <Select
                            value={it.manualOverrideName ?? undefined}
                            onValueChange={(val) => {
                              setFiles((prev) =>
                                prev.map((f, fi) =>
                                  fi === i
                                    ? {
                                        ...f,
                                        extracted: f.extracted!.map((x, xi) =>
                                          xi === j ? { ...x, manualOverrideName: val } : x,
                                        ),
                                      }
                                    : f,
                                ),
                              );
                            }}
                          >
                            <SelectTrigger className="h-6 min-w-0 flex-1 text-xs">
                              <SelectValue placeholder={`${it.rawName} · não reconhecido`} />
                            </SelectTrigger>
                            <SelectContent>
                              {BIOMARKER_CATALOG.map((b) => (
                                <SelectItem key={b.name} value={b.name} className="text-xs">
                                  {b.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                        <input
                          type="number"
                          value={it.value}
                          onChange={(e) => {
                            const v = e.target.valueAsNumber;
                            setFiles((prev) =>
                              prev.map((f, fi) =>
                                fi === i
                                  ? {
                                      ...f,
                                      extracted: f.extracted!.map((x, xi) =>
                                        xi === j ? { ...x, value: Number.isNaN(v) ? x.value : v } : x,
                                      ),
                                    }
                                  : f,
                              ),
                            );
                          }}
                          className="w-16 rounded border border-border bg-background px-1 py-0.5 text-right text-xs"
                        />
                        <input
                          type="text"
                          value={it.unit}
                          onChange={(e) => {
                            const val = e.target.value;
                            setFiles((prev) =>
                              prev.map((f, fi) =>
                                fi === i
                                  ? {
                                      ...f,
                                      extracted: f.extracted!.map((x, xi) =>
                                        xi === j ? { ...x, unit: val } : x,
                                      ),
                                    }
                                  : f,
                              ),
                            );
                          }}
                          className="w-14 rounded border border-border bg-background px-1 py-0.5 text-xs"
                        />
                      </div>
                    ))}
                    {entry.extracted.length > 0 && (
                      <input
                        type="text"
                        value={entry.motivo ?? ""}
                        onChange={(e) => {
                          const val = e.target.value;
                          setFiles((prev) =>
                            prev.map((f, fi) => (fi === i ? { ...f, motivo: val } : f)),
                          );
                        }}
                        placeholder="Motivo da solicitação (opcional) — ex.: investigar fadiga"
                        maxLength={200}
                        className="w-full rounded border border-border bg-background px-2 py-1 text-xs placeholder:text-muted-foreground/60"
                      />
                    )}
                    {entry.confirmingDiscard ? (
                      (() => {
                        const mappedCount = entry.extracted.filter(
                          (it) => it.matchedName || it.manualOverrideName,
                        ).length;
                        const discardCount = entry.extracted.length - mappedCount;
                        return (
                          <div className="rounded-lg bg-amber-50 p-2.5 ring-1 ring-amber-200 dark:bg-amber-950/40 dark:ring-amber-900">
                            <p className="text-[11px] text-amber-800 dark:text-amber-300">
                              {mappedCount} de {entry.extracted.length} biomarcador
                              {entry.extracted.length === 1 ? "" : "es"} ser
                              {mappedCount === 1 ? "á" : "ão"} salvo{mappedCount === 1 ? "" : "s"} —{" "}
                              <strong>{discardCount} sem correspondência será{discardCount === 1 ? "" : "ão"} ignorado{discardCount === 1 ? "" : "s"}</strong>.
                            </p>
                            <div className="mt-2 flex gap-1.5">
                              <Button
                                size="sm"
                                variant="outline"
                                className="flex-1"
                                onClick={() =>
                                  setFiles((prev) =>
                                    prev.map((f) =>
                                      f.file === entry.file ? { ...f, confirmingDiscard: false } : f,
                                    ),
                                  )
                                }
                              >
                                Voltar e mapear
                              </Button>
                              <Button
                                size="sm"
                                className="flex-1 brand-gradient text-primary-foreground"
                                onClick={() => confirmarExame(entry, true)}
                              >
                                Salvar mesmo assim
                              </Button>
                            </div>
                          </div>
                        );
                      })()
                    ) : (
                      <Button
                        size="sm"
                        className="w-full brand-gradient text-primary-foreground"
                        disabled={entry.extracted.length === 0}
                        onClick={() => confirmarExame(entry)}
                      >
                        Confirmar e salvar
                      </Button>
                    )}
                  </div>
                )}
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
  onAutorizado,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  patientName: string;
  telefone: string | null;
  onAutorizado?: () => void;
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
    onAutorizado?.();
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

// "Minhas Notas" (PRO-01) — anotação do médico entre Histórico e Evolução.
// Auto-save debounced; nunca chamamos isso de "privado"/"confidencial" na UI
// (§6.3 do PRD) — é um registro médico comum, só não aparece para o paciente.
function MinhasNotas({
  token,
  patientId,
  notasMedicas,
  onSaved,
}: {
  token: string;
  patientId: string;
  notasMedicas: string | null;
  onSaved: () => void;
}) {
  const [texto, setTexto] = useState(notasMedicas ?? "");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Troca de paciente → resincroniza com o valor persistido (novo id, novo texto).
  useEffect(() => {
    setTexto(notasMedicas ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientId]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const salvar = useMutation({
    mutationFn: (v: string) =>
      saveMyPatientNotes({ data: { token, patientId, notasMedicas: v } }),
    onSuccess: (r) => {
      if (!r.ok) return toast.error("Não consegui salvar a nota.");
      onSaved();
    },
  });

  const [aberto, setAberto] = useState(false);

  const onChange = (v: string) => {
    setTexto(v);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => salvar.mutate(v), 600);
  };

  return (
    <div className="mt-4 rounded-2xl border border-border bg-card p-4">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        className="flex w-full items-center justify-between gap-2 text-left"
      >
        <h2 className="flex items-center gap-1.5 text-sm font-semibold">
          <NotebookPen className="h-4 w-4 text-primary" /> Minhas Notas
        </h2>
        <span className="flex items-center gap-2">
          {salvar.isPending && <span className="text-[11px] text-muted-foreground">Salvando…</span>}
          {!aberto && texto.trim() && (
            <span className="text-[11px] text-muted-foreground">{texto.trim().length} car.</span>
          )}
          <ChevronDown
            className={`h-4 w-4 text-muted-foreground transition-transform ${aberto ? "rotate-180" : ""}`}
          />
        </span>
      </button>
      {aberto && (
        <>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Não aparece para o paciente. Como qualquer registro médico, pode ser objeto de requisição
            judicial.
          </p>
          <Textarea
            value={texto}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Anotações livres sobre este paciente…"
            maxLength={4000}
            className="mt-2 min-h-[80px] resize-none bg-background text-sm"
          />
        </>
      )}
    </div>
  );
}

type TemplateMode =
  | "historico"
  | "padrao"
  | "anamnese"
  | "texto_livre"
  | "ephemeral"
  | `custom:${string}`;

function contentForTemplate(
  mode: TemplateMode,
  myTemplates: EvolutionTemplate[],
  ephemeralConteudo: string,
): string {
  if (mode === "padrao") return TEMPLATE_PADRAO;
  if (mode === "anamnese") return ANAMNESE_TEMPLATE;
  if (mode === "texto_livre") return "";
  if (mode === "ephemeral") return ephemeralConteudo;
  if (mode.startsWith("custom:")) {
    const id = mode.slice("custom:".length);
    return myTemplates.find((t) => t.id === id)?.conteudo ?? "";
  }
  return "";
}

const HEADER_LINE_RE = /^([A-ZÀ-Ú][A-ZÀ-Ú\s]{1,40}):\s*$/;

/** Insere o texto de um bloco aceito do ditado embaixo do cabeçalho certo:
 *  se o cabeçalho já existe no texto atual, entra logo abaixo dele; senão é
 *  criado na posição correta segundo `ordem` (seções do template ativo) —
 *  assim aceitar fora de ordem ainda resulta num texto organizado. */
function inserirNaSecao(label: string, texto: string, textoAtual: string, ordem: string[]): string {
  const norm = (s: string) => s.trim().toLowerCase();
  if (textoAtual.trim().length === 0) {
    return `${label.toUpperCase()}:\n${texto}\n\n`;
  }

  const lines = textoAtual.split("\n");
  const headerIdx = lines.findIndex((l) => {
    const m = l.trim().match(HEADER_LINE_RE);
    return m ? norm(m[1]) === norm(label) : false;
  });
  if (headerIdx !== -1) {
    const next = [...lines];
    next.splice(headerIdx + 1, 0, texto);
    return next.join("\n");
  }

  const myPos = ordem.findIndex((s) => norm(s) === norm(label));
  let insertAt = lines.length;
  if (myPos !== -1) {
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].trim().match(HEADER_LINE_RE);
      if (!m) continue;
      const otherPos = ordem.findIndex((s) => norm(s) === norm(m[1]));
      if (otherPos !== -1 && otherPos > myPos) {
        insertAt = i;
        break;
      }
    }
  }
  const next = [...lines];
  next.splice(insertAt, 0, `${label.toUpperCase()}:`, texto, "");
  return next.join("\n");
}

function NovaEvolucao({
  token,
  patientId,
  onSaved,
  isPrimeiraConsulta,
  evolutionsCount,
  evolutions,
  activeHistoricoId,
  onActiveHistoricoChange,
}: {
  token: string;
  patientId: string;
  onSaved: () => void;
  isPrimeiraConsulta: boolean;
  evolutionsCount: number;
  evolutions: Evolution[];
  activeHistoricoId: string | null;
  onActiveHistoricoChange: (id: string | null) => void;
}) {
  const qc = useQueryClient();
  // "Padrão" ativo por default — zero tela em branco, sem forçar anamnese
  // completa na 1ª consulta (isso é o ajuste de UX do PRO-02/PRO-03).
  const [texto, setTexto] = useState<string>(() => TEMPLATE_PADRAO);
  const [template, setTemplate] = useState<TemplateMode>("padrao");
  // Conteúdo de um template gerado via IA e aplicado sem salvar (Dialog
  // "+ Criar template" → "Usar sem salvar") — não persiste, só fica ativo
  // nesta sessão de edição.
  const [ephemeralConteudo, setEphemeralConteudo] = useState("");
  const [createTemplateOpen, setCreateTemplateOpen] = useState(false);
  // Conteúdo pra abrir o dialog já no passo "estrutura + nome", pulando a
  // descrição — usado por "Salvar como template" (semeia com o texto atual).
  const [templateDialogSeed, setTemplateDialogSeed] = useState<string | null>(null);
  // Consulta selecionada dentro do modo "Histórico". Mantida separada do id
  // pilotado pelo pai (linha do tempo) mas sincronizada via useEffect abaixo.
  const [historicoId, setHistoricoId] = useState<string | null>(null);
  const preview = useMemo(() => (texto.trim().length > 3 ? deriveSoap(texto) : null), [texto]);

  // Produtos/serviços aplicados nesta evolução — snapshot de nome/preço vai
  // junto no save (AGD-04); só os ativos entram na seleção.
  const svc = useQuery({
    queryKey: ["services"],
    queryFn: () => listMyServices({ data: { token } }),
  });
  const activeServices = svc.data?.ok ? svc.data.services.filter((s) => s.ativo) : [];
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);
  const toggleService = (id: string) =>
    setSelectedServiceIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  // Templates salvos do médico (PRO-02/PRO-03) — cada um vira uma pill própria.
  const tmpl = useQuery({
    queryKey: ["templates"],
    queryFn: () => listMyTemplates({ data: { token } }),
  });
  const myTemplates = useMemo(
    () => (tmpl.data?.ok ? tmpl.data.templates : []),
    [tmpl.data],
  );

  // Sincroniza com o clique na linha do tempo: quando o pai muda
  // `activeHistoricoId`, entramos em modo Histórico com aquela consulta.
  useEffect(() => {
    if (activeHistoricoId) {
      setTemplate("historico");
      setHistoricoId(activeHistoricoId);
    } else if (historicoId !== null) {
      setHistoricoId(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeHistoricoId]);

  const salvar = useMutation({
    mutationFn: () => {
      const servicosAplicados = activeServices
        .filter((s) => selectedServiceIds.includes(s.id))
        .map((s) => ({ serviceId: s.id, nome: s.nome, preco: s.preco }));
      return saveEvolution({ data: { token, patientId, evolucao: texto, servicosAplicados } });
    },
    onSuccess: (r) => {
      if (!r.ok) return toast.error("Não consegui salvar a evolução.");
      toast.success("Evolução registrada.");
      setTexto("");
      setSelectedServiceIds([]);
      onSaved();
    },
  });

  const applyTemplate = (mode: TemplateMode) => {
    if (mode === template) return;
    if (mode !== "historico") onActiveHistoricoChange(null);
    setTemplate(mode);
    // Só preenche se o campo estiver vazio — nunca sobrescreve rascunho.
    if (mode !== "historico" && texto.trim().length === 0) {
      setTexto(contentForTemplate(mode, myTemplates, ephemeralConteudo));
    }
  };

  const selecionarConsulta = (id: string) => {
    setHistoricoId(id);
    onActiveHistoricoChange(id);
  };

  const deletarTemplate = useMutation({
    mutationFn: (id: string) => deleteMyTemplate({ data: { token, id } }),
    onSuccess: (r, id) => {
      if (!r.ok) return toast.error("Não consegui apagar o template.");
      qc.invalidateQueries({ queryKey: ["templates"] });
      // Template apagado era o ativo → volta pro Padrão, sem perder rascunho.
      if (template === `custom:${id}`) {
        setTemplate("padrao");
        if (texto.trim().length === 0) setTexto(TEMPLATE_PADRAO);
      }
      toast.success("Template apagado.");
    },
  });

  const templatesPills: { id: TemplateMode; label: string; disabled?: boolean }[] = [
    { id: "historico", label: "Histórico", disabled: evolutions.length === 0 },
    { id: "padrao", label: "Padrão" },
    { id: "anamnese", label: "Anamnese completa" },
    { id: "texto_livre", label: "Texto livre" },
    ...myTemplates.map((t) => ({ id: `custom:${t.id}` as TemplateMode, label: t.nome })),
  ];

  // Deriva das seções JÁ VISÍVEIS no texto (não do template selecionado) —
  // se o médico só clicou numa pill pra espiar (texto não-vazio não é
  // sobrescrito), o ditado precisa organizar embaixo do que está na tela,
  // não embaixo de um template que nem chegou a ser aplicado. "Texto livre"
  // fica sempre sem seção, mesmo que o texto acidentalmente pareça ter uma.
  const activeSections = useMemo(() => {
    if (template === "historico" || template === "texto_livre") return [];
    if (texto.trim().length > 0) return parseTemplateSections(texto);
    return parseTemplateSections(contentForTemplate(template, myTemplates, ephemeralConteudo));
  }, [template, texto, myTemplates, ephemeralConteudo]);

  // Template ativo por inteiro (cabeçalhos + instruções que o médico tenha
  // escrito nele) — vira o "prompt" que orienta a distribuição do ditado.
  const activeTemplateContent = useMemo(() => {
    if (template === "historico" || template === "texto_livre") return "";
    return contentForTemplate(template, myTemplates, ephemeralConteudo);
  }, [template, myTemplates, ephemeralConteudo]);

  const consultaSelecionada = historicoId
    ? evolutions.find((e) => e.id === historicoId) ?? null
    : null;

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Evolução atual</h2>
        <span className="text-[11px] text-muted-foreground">Texto livre · o SOAP é derivado automaticamente</span>
      </div>

      <div className="mb-2 mt-2 flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap items-center rounded-full border border-border bg-muted/40 p-0.5">
          {templatesPills.map((t) => {
            const isCustom = t.id.startsWith("custom:");
            return (
              <span key={t.id} className="group inline-flex items-center">
                <button
                  type="button"
                  disabled={t.disabled}
                  title={t.label}
                  onClick={() => applyTemplate(t.id)}
                  className={`max-w-[160px] truncate rounded-full px-2.5 py-1.5 text-[10px] font-medium transition ${
                    template === t.id
                      ? "bg-teal-600 text-white shadow-sm"
                      : t.disabled
                        ? "cursor-not-allowed text-muted-foreground/70"
                        : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {t.label}
                </button>
                {isCustom && (
                  <button
                    type="button"
                    title={`Apagar template "${t.label}"`}
                    onClick={(e) => {
                      e.stopPropagation();
                      deletarTemplate.mutate(t.id.slice("custom:".length));
                    }}
                    className="hidden shrink-0 rounded-full p-0.5 text-muted-foreground/50 transition hover:text-red-600 group-hover:inline-flex"
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                )}
              </span>
            );
          })}
        </div>
        <button
          type="button"
          onClick={() => {
            setTemplateDialogSeed(null);
            setCreateTemplateOpen(true);
          }}
          className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-2.5 py-1.5 text-[10px] text-muted-foreground transition hover:border-primary/40 hover:text-foreground"
        >
          <Plus className="h-3 w-3" /> Criar template
        </button>
        {template === "historico" && (
          <Select
            value={historicoId ?? ""}
            onValueChange={(v) => selecionarConsulta(v)}
          >
            <SelectTrigger className="h-7 w-auto min-w-[220px] text-[11px]">
              <SelectValue placeholder="Escolha uma consulta anterior…" />
            </SelectTrigger>
            <SelectContent>
              {[...evolutions]
                .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
                .map((e) => {
                  const dataFmt = new Date(e.createdAt).toLocaleDateString("pt-BR", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                  });
                  return (
                    <SelectItem key={e.id} value={e.id}>
                      {dataFmt} · {e.sealed ? "Selada" : "Rascunho"}
                    </SelectItem>
                  );
                })}
            </SelectContent>
          </Select>
        )}
      </div>

      {template === "historico" ? (
        <HistoricoConsultaContent evolution={consultaSelecionada} />
      ) : (
        <>
          <div className="mt-2">
            <Dictation
              sections={activeSections}
              templateContent={activeTemplateContent}
              onAcceptToSection={(label, t) =>
                setTexto((prev) => inserirNaSecao(label, t, prev, activeSections))
              }
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

          {activeServices.length > 0 && (
            <div className="mt-2.5">
              <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Produtos/serviços aplicados
              </div>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {activeServices.map((s) => {
                  const selected = selectedServiceIds.includes(s.id);
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => toggleService(s.id)}
                      className={`rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 transition ${
                        selected
                          ? "bg-primary/10 text-primary ring-primary/40"
                          : "bg-muted text-muted-foreground ring-border hover:text-foreground"
                      }`}
                    >
                      {s.nome} · {formatBRL(s.preco)}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="mt-2 flex justify-end gap-1.5">
            <Button
              size="sm"
              variant="outline"
              disabled={texto.trim().length === 0}
              title="Guardar a estrutura de cabeçalhos deste texto como um template reutilizável"
              onClick={() => {
                setTemplateDialogSeed(texto);
                setCreateTemplateOpen(true);
              }}
            >
              Salvar como template
            </Button>
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
        </>
      )}

      <CreateTemplateDialog
        open={createTemplateOpen}
        onOpenChange={setCreateTemplateOpen}
        token={token}
        initialConteudo={templateDialogSeed}
        onTemplateSaved={(t) => {
          qc.invalidateQueries({ queryKey: ["templates"] });
          setTemplate(`custom:${t.id}`);
          if (texto.trim().length === 0) setTexto(t.conteudo);
        }}
        onUseWithoutSaving={(conteudo) => {
          setEphemeralConteudo(conteudo);
          setTemplate("ephemeral");
          if (texto.trim().length === 0) setTexto(conteudo);
        }}
      />
    </div>
  );
}

// "+ Criar template" (PRO-03) — descrição em linguagem natural → IA monta só
// a estrutura (cabeçalhos) → rascunho editável → salvar (persiste, vira pill
// própria) ou usar sem salvar (aplica na evolução atual, não persiste). Sem
// LOVABLE_API_KEY configurada, cai direto no modo manual (textarea vazio).
// `initialConteudo` pula direto pro passo "estrutura + nome" — usado por
// "Salvar como template" (semeado com o texto da evolução atual).
function CreateTemplateDialog({
  open,
  onOpenChange,
  token,
  initialConteudo,
  onTemplateSaved,
  onUseWithoutSaving,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  token: string;
  initialConteudo?: string | null;
  onTemplateSaved: (t: EvolutionTemplate) => void;
  onUseWithoutSaving: (conteudo: string) => void;
}) {
  const [descricao, setDescricao] = useState("");
  const [rascunho, setRascunho] = useState<string | null>(null);
  const [nome, setNome] = useState("");
  // Semeado (veio de "Salvar como template") → não tem passo de descrição
  // pra "Recomeçar" nem sentido em "Usar sem salvar" (o conteúdo já É a
  // evolução atual).
  const seeded = !!initialConteudo;

  useEffect(() => {
    if (open && initialConteudo) setRascunho(initialConteudo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const reset = () => {
    setDescricao("");
    setRascunho(null);
    setNome("");
  };

  const gerar = useMutation({
    mutationFn: () => generateMyTemplateDraft({ data: { token, descricao } }),
    onSuccess: (r) => {
      if (!r.ok) {
        if (r.error === "not_configured") {
          toast.message("IA não configurada — edite o template manualmente.");
          setRascunho("");
        } else {
          toast.error("Não consegui gerar o rascunho.");
        }
        return;
      }
      setRascunho(r.conteudo);
    },
  });

  const salvar = useMutation({
    mutationFn: () => saveMyTemplate({ data: { token, nome, conteudo: rascunho ?? "" } }),
    onSuccess: (r) => {
      if (!r.ok) return toast.error("Não consegui salvar o template.");
      toast.success("Template salvo.");
      onTemplateSaved(r.template);
      onOpenChange(false);
      reset();
    },
  });

  const usarSemSalvar = () => {
    onUseWithoutSaving(rascunho ?? "");
    onOpenChange(false);
    reset();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset(); }}>
      <DialogContent className="flex max-h-[85vh] w-[calc(100vw-2rem)] max-w-lg flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>{seeded ? "Salvar como template" : "Criar template de evolução"}</DialogTitle>
          <DialogDescription>
            {seeded
              ? "A estrutura abaixo veio da evolução atual — dê um nome pra reaproveitar depois."
              : "Descreva o tipo de consulta em linguagem natural — a IA monta só a estrutura (cabeçalhos), nunca preenche dado clínico."}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-0.5">
          {rascunho === null ? (
            <div className="space-y-2">
              <Textarea
                autoFocus
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                placeholder="Ex.: retorno de paciente com hipertensão"
                rows={3}
                className="w-full resize-none text-sm"
              />
              <Button
                className="w-full brand-gradient text-primary-foreground"
                disabled={descricao.trim().length < 3 || gerar.isPending}
                onClick={() => gerar.mutate()}
              >
                {gerar.isPending ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="mr-1.5 h-4 w-4" />
                )}
                Gerar com IA
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <Label className="text-xs">Estrutura do template</Label>
              <Textarea
                value={rascunho}
                onChange={(e) => setRascunho(e.target.value)}
                rows={8}
                className="w-full font-mono text-xs"
              />
              <p className="text-[11px] leading-snug text-muted-foreground">
                Estas seções guiam o ditado: ao transcrever a consulta, o texto é
                distribuído automaticamente nestes cabeçalhos.
              </p>
              <Label className="text-xs">Nome do template</Label>
              <Input
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Ex.: Retorno HAS"
                maxLength={60}
                className="w-full"
              />
            </div>
          )}
        </div>

        <DialogFooter className="mt-2 flex flex-wrap gap-2 sm:flex-wrap sm:justify-end sm:space-x-0">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          {rascunho !== null && !seeded && (
            <Button variant="outline" size="sm" onClick={() => setRascunho(null)}>
              Recomeçar
            </Button>
          )}
          {rascunho !== null && (
            <>
              {!seeded && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={usarSemSalvar}
                  disabled={rascunho.trim().length === 0}
                >
                  Usar sem salvar
                </Button>
              )}
              <Button
                size="sm"
                disabled={nome.trim().length < 2 || rascunho.trim().length === 0 || salvar.isPending}
                onClick={() => salvar.mutate()}
                className="brand-gradient text-primary-foreground"
              >
                {salvar.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                Salvar template
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Conteúdo somente-leitura do modo "Histórico" — reaproveita a divisão em
// quatro seções (Diagnóstico, Exames solicitados, Medicamentos prescritos,
// Relatórios) do painel dedicado antigo.
function HistoricoConsultaContent({ evolution }: { evolution: Evolution | null }) {
  if (!evolution) {
    return (
      <div className="mt-3 rounded-xl border border-dashed border-border/70 px-4 py-6 text-center">
        <FileText className="mx-auto h-6 w-6 text-muted-foreground/50" />
        <p className="mt-2 text-xs text-muted-foreground">
          Escolha uma consulta anterior no seletor acima para ver o histórico.
        </p>
      </div>
    );
  }

  const dataFmt = new Date(evolution.createdAt).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  const shortId = evolution.id.slice(0, 6).toUpperCase();
  const diagnostico = evolution.soap.a.compartilhavel || "";
  const meds = evolution.prescription?.meds ?? [];
  const evolText = evolution.evolucao ?? "";
  const extractSection = (label: RegExp) => {
    const m = evolText.match(new RegExp(`${label.source}\\s*[:\\-]?\\s*([\\s\\S]*?)(?:\\n\\s*\\n|$)`, "i"));
    return m?.[1]?.trim() ?? "";
  };
  const examesSolicitados = extractSection(/Exames?\s+solicitad[ao]s?/i);
  const relatorios = extractSection(/Relat[óo]rios?/i);

  const secoes: { label: string; icon: typeof ClipboardList; content: ReactNode }[] = [
    {
      label: "Diagnóstico",
      icon: Stethoscope,
      content: diagnostico ? (
        <p className="whitespace-pre-line text-sm">{diagnostico}</p>
      ) : (
        <p className="text-xs italic text-muted-foreground">Sem diagnóstico registrado.</p>
      ),
    },
    {
      label: "Exames solicitados",
      icon: ClipboardList,
      content: examesSolicitados ? (
        <p className="whitespace-pre-line text-sm">{examesSolicitados}</p>
      ) : (
        <p className="text-xs italic text-muted-foreground">Nenhum exame solicitado nesta consulta.</p>
      ),
    },
    {
      label: "Medicamentos prescritos",
      icon: Pill,
      content: meds.length > 0 ? (
        <ul className="space-y-1.5">
          {meds.map((m, i) => (
            <li key={i} className="rounded-lg border border-border bg-background px-2.5 py-1.5">
              <div className="text-sm font-medium">{m.name}</div>
              <div className="text-[11px] text-muted-foreground">{m.dosage} · {m.duration}</div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs italic text-muted-foreground">Nenhuma prescrição nesta consulta.</p>
      ),
    },
    {
      label: "Relatórios",
      icon: FileText,
      content: relatorios ? (
        <p className="whitespace-pre-line text-sm">{relatorios}</p>
      ) : (
        <p className="text-xs italic text-muted-foreground">Sem relatórios anexados.</p>
      ),
    },
  ];

  return (
    <div className="mt-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-1 text-[10px] font-semibold uppercase tracking-wider text-primary">
        <span>Histórico · Consulta #{shortId}</span>
        <span className="text-muted-foreground">
          {evolution.sealed ? "Consulta selada" : "Evolução em aberto"} · {dataFmt}
        </span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {secoes.map((s) => (
          <section key={s.label} className="rounded-xl border border-border bg-background p-3">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              <s.icon className="h-3.5 w-3.5 text-primary" />
              {s.label}
            </div>
            <div className="mt-1.5">{s.content}</div>
          </section>
        ))}
      </div>
    </div>
  );
}


function EvolucaoCard({
  e,
  token,
  patientId,
  patient,
  onChanged,
}: {
  e: Evolution;
  token: string;
  patientId: string;
  patient: Patient;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [texto, setTexto] = useState(e.evolucao);
  const [receitaOpen, setReceitaOpen] = useState(false);
  // Ao finalizar a consulta, oferece marcar o retorno na hora — evita o
  // paciente sair sem próximo agendamento definido.
  const [retornoOpen, setRetornoOpen] = useState(false);

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
      setRetornoOpen(true);
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

      {e.servicosAplicados.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {e.servicosAplicados.map((s) => (
            <span
              key={s.serviceId}
              className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary ring-1 ring-primary/30"
            >
              {s.nome} · {formatBRL(s.preco)}
            </span>
          ))}
        </div>
      )}

      <div className="mt-3">
        <SoapReadOnly
          soap={e.soap}
          editableNota={{ token, evolutionId: e.id, onSaved: onChanged }}
        />
      </div>

      {e.prescription && (
        <div
          className={`mt-2 rounded-lg px-3 py-2 text-xs ring-1 ${
            e.prescription.canceledAt
              ? "bg-muted text-muted-foreground ring-border line-through decoration-1"
              : "bg-violet-50 ring-violet-200 dark:bg-violet-950/40 dark:ring-violet-900"
          }`}
        >
          <div className="font-medium text-violet-900 dark:text-violet-300">
            Receita digital{e.prescription.canceledAt ? " · cancelada" : ""}
          </div>
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
            href={
              e.prescription.url && !e.prescription.url.startsWith("https://memed.com.br/r/")
                ? e.prescription.url
                : `/receita/${e.prescription.code}`
            }
            target="_blank"
            rel="noreferrer"
            className="mt-1 inline-block text-violet-700 underline-offset-2 hover:underline dark:text-violet-400"
          >
            Ver receita /receita/{e.prescription.code}
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
      <ScheduleDialog
        open={retornoOpen}
        onOpenChange={setRetornoOpen}
        patient={patient}
        token={token}
        title="Agendar retorno"
        defaultDaysAhead={30}
        defaultNote="Retorno"
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

  // Config do widget real da Memed — quando ok:true, o dialog abre o embed
  // oficial em vez do formulário de catálogo mock. `showWidget` trava o modo
  // assim que decidido, para a query parar de re-disparar enquanto o widget
  // já está montado; reseta quando o dialog fecha.
  const [showWidget, setShowWidget] = useState(false);
  const widgetConfig = useQuery({
    queryKey: ["memed-widget-config", patientId],
    queryFn: () => getMemedWidgetConfig({ data: { token, patientId } }),
    enabled: open && !showWidget,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (widgetConfig.data?.ok) setShowWidget(true);
  }, [widgetConfig.data]);

  useEffect(() => {
    if (!open) setShowWidget(false);
  }, [open]);

  const memedErrorToastedRef = useRef(false);
  useEffect(() => {
    const isMemedError =
      widgetConfig.data?.ok === false &&
      (widgetConfig.data.error === "memed_error" ||
        widgetConfig.data.error === "memed_offline" ||
        widgetConfig.data.error === "invalid_credentials");

    if (isMemedError && !memedErrorToastedRef.current) {
      toast.error("Memed indisponível agora — use a receita local abaixo.");
      memedErrorToastedRef.current = true;
    } else if (!isMemedError) {
      memedErrorToastedRef.current = false;
    }
  }, [widgetConfig.data]);

  const [crmForm, setCrmForm] = useState({
    crm: "",
    crmUf: "",
    cpfMedico: "",
    especialidade: "",
    crmCidade: "",
    dataNascimento: "",
    telefoneMedico: "",
    localAtendimento: "",
  });

  // Pré-preenche com o que já está no cadastro do médico (/app/perfil).
  const doctorProfile = useQuery({
    queryKey: ["doctor-profile"],
    queryFn: () => getDoctorProfile({ data: { token } }),
    enabled: open,
    staleTime: 60_000,
  });
  useEffect(() => {
    if (doctorProfile.data?.ok) {
      const p = doctorProfile.data.profile;
      setCrmForm({
        crm: p.crm,
        crmUf: p.crmUf,
        cpfMedico: p.cpfMedico,
        especialidade: p.especialidade,
        crmCidade: p.crmCidade,
        dataNascimento: p.dataNascimento,
        telefoneMedico: p.telefoneMedico,
        localAtendimento: p.localAtendimento,
      });
    }
  }, [doctorProfile.data]);
  const saveMemed = useMutation({
    mutationFn: () => saveMemedProfile({ data: { token, ...crmForm } }),
    onSuccess: (r) => {
      if (!r.ok) return toast.error("Não consegui salvar o CRM.");
      toast.success("CRM salvo — gerando token Memed…");
      widgetConfig.refetch();
    },
  });

  const confirmMemed = useMutation({
    mutationFn: (vars: { memedPrescricaoId: string; medsResumo: string[]; pdfUrl: string | null }) =>
      confirmMemedPrescription({ data: { token, evolutionId, patientId, ...vars } }),
    onSuccess: (r) => {
      if (!r.ok)
        return toast.error("Receita assinada na Memed, mas não consegui salvar a referência no prontuário.");
      toast.success("Receita Memed emitida e vinculada ao prontuário.");
      onOpenChange(false);
      onDone();
    },
  });

  const cancelMemed = useMutation({
    mutationFn: (vars: { memedPrescricaoId: string }) =>
      cancelMemedPrescriptionFn({ data: { token, evolutionId, ...vars } }),
    onSuccess: (r) => {
      if (!r.ok) return;
      toast.message("Receita excluída na Memed — marcada como cancelada no prontuário.");
      onDone();
    },
  });

  const handlePrescricaoExcluida = (raw: unknown) => {
    const data = raw as { prescricao?: { id?: string | number } };
    const id = data?.prescricao?.id != null ? String(data.prescricao.id) : null;
    if (!id) return;
    cancelMemed.mutate({ memedPrescricaoId: id });
  };

  const handlePrescricaoImpressa = (raw: unknown) => {
    const data = raw as {
      prescricao?: { id?: string | number; url?: string };
      medicamentos?: Array<{ nome?: string } | string>;
    };
    const memedPrescricaoId = data?.prescricao?.id != null ? String(data.prescricao.id) : null;
    if (!memedPrescricaoId) {
      toast.error("Memed não retornou o id da prescrição — não consegui salvar no prontuário.");
      return;
    }
    const medsResumo = Array.isArray(data.medicamentos)
      ? data.medicamentos
          .map((m) => (typeof m === "string" ? m : (m?.nome ?? "")))
          .filter((n): n is string => n.length > 0)
      : [];
    confirmMemed.mutate({ memedPrescricaoId, medsResumo, pdfUrl: data?.prescricao?.url || null });
  };

  if (showWidget && widgetConfig.data?.ok) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              Receita digital
              {widgetConfig.data.environment === "sandbox" && (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">
                  Ambiente de testes (Memed sandbox)
                </span>
              )}
            </DialogTitle>
            <DialogDescription>
              Prescreva pelo módulo oficial da Memed — a assinatura digital sai direto daqui.
            </DialogDescription>
          </DialogHeader>
          {widgetConfig.data.likelyOffline && (
            <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800 ring-1 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900">
              Fora do horário de atendimento do ambiente de prescrição — se o módulo não abrir, use a
              receita local.
            </p>
          )}
          <MemedPrescriptionWidget
            key={`${patientId}-${widgetConfig.data.token.slice(-12)}`}
            token={widgetConfig.data.token}
            scriptUrl={widgetConfig.data.scriptUrl}
            patient={widgetConfig.data.patient}
            workplace={widgetConfig.data.workplace}
            onPrescricaoImpressa={handlePrescricaoImpressa}
            onPrescricaoExcluida={handlePrescricaoExcluida}
          />
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Receita digital</DialogTitle>
          <DialogDescription>
            Adicione os medicamentos com dosagem e duração — o código verificável sai na hora.
          </DialogDescription>
        </DialogHeader>

        {widgetConfig.data?.ok === false && widgetConfig.data.error === "not_configured" && (
          <p className="rounded-lg bg-muted/50 px-3 py-2 text-[11px] text-muted-foreground">
            Prescrição digital via Memed (integração real) não configurada — defina{" "}
            <code className="rounded bg-muted px-1">MEMED_API_KEY</code> e{" "}
            <code className="rounded bg-muted px-1">MEMED_SECRET_KEY</code> no ambiente. Por enquanto a
            receita abaixo é registrada localmente, com código verificável próprio.
          </p>
        )}
        {widgetConfig.data?.ok === false && widgetConfig.data.error === "missing_profile" && (
          <div className="space-y-1.5 rounded-lg bg-amber-50 px-3 py-2 ring-1 ring-amber-200 dark:bg-amber-950/40 dark:ring-amber-900">
            <p className="text-[11px] text-amber-800 dark:text-amber-300">
              Memed configurada — falta seu CRM para emitir prescrição digital real. Complete tudo em{" "}
              <Link to="/app/perfil" className="font-medium underline">
                Meu perfil
              </Link>
              .
            </p>
            <div className="flex gap-1.5">
              <input
                value={crmForm.crm}
                onChange={(e) => setCrmForm((f) => ({ ...f, crm: e.target.value }))}
                placeholder="CRM"
                className="w-20 rounded border border-border bg-background px-1.5 py-1 text-xs"
              />
              <input
                value={crmForm.crmUf}
                onChange={(e) => setCrmForm((f) => ({ ...f, crmUf: e.target.value.toUpperCase() }))}
                placeholder="UF"
                maxLength={2}
                className="w-12 rounded border border-border bg-background px-1.5 py-1 text-xs"
              />
              <input
                value={crmForm.cpfMedico}
                onChange={(e) => setCrmForm((f) => ({ ...f, cpfMedico: e.target.value }))}
                placeholder="CPF"
                className="flex-1 rounded border border-border bg-background px-1.5 py-1 text-xs"
              />
            </div>
            <div className="flex gap-1.5">
              <input
                value={crmForm.especialidade}
                onChange={(e) => setCrmForm((f) => ({ ...f, especialidade: e.target.value }))}
                placeholder="Especialidade"
                className="flex-1 rounded border border-border bg-background px-1.5 py-1 text-xs"
              />
              <input
                value={crmForm.crmCidade}
                onChange={(e) => setCrmForm((f) => ({ ...f, crmCidade: e.target.value }))}
                placeholder="Cidade do CRM"
                className="flex-1 rounded border border-border bg-background px-1.5 py-1 text-xs"
              />
              <input
                type="date"
                value={crmForm.dataNascimento}
                onChange={(e) => setCrmForm((f) => ({ ...f, dataNascimento: e.target.value }))}
                title="Data de nascimento — exigida pela Memed"
                className="w-36 rounded border border-border bg-background px-1.5 py-1 text-xs"
              />
            </div>
            {/* Telefone e local de atendimento saem impressos no cabeçalho da
                receita (exigência do CFM) — opcionais aqui para não travar o
                cadastro mínimo do prescritor. */}
            <div className="flex gap-1.5">
              <input
                value={crmForm.telefoneMedico}
                onChange={(e) => setCrmForm((f) => ({ ...f, telefoneMedico: e.target.value }))}
                placeholder="Telefone do consultório"
                className="flex-1 rounded border border-border bg-background px-1.5 py-1 text-xs"
              />
              <input
                value={crmForm.localAtendimento}
                onChange={(e) => setCrmForm((f) => ({ ...f, localAtendimento: e.target.value }))}
                placeholder="Local de atendimento"
                className="flex-1 rounded border border-border bg-background px-1.5 py-1 text-xs"
              />
              <Button
                size="sm"
                className="text-xs"
                disabled={
                  !crmForm.crm ||
                  !crmForm.crmUf ||
                  !crmForm.cpfMedico ||
                  !crmForm.especialidade ||
                  !crmForm.crmCidade ||
                  !crmForm.dataNascimento ||
                  saveMemed.isPending
                }
                onClick={() => saveMemed.mutate()}
              >
                Salvar
              </Button>
            </div>
          </div>
        )}
        {widgetConfig.data?.ok === false && widgetConfig.data.error === "memed_error" && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-[11px] text-red-700 ring-1 ring-red-200 dark:bg-red-950/40 dark:text-red-300 dark:ring-red-900">
            Não consegui conectar ao módulo da Memed agora — use a receita local abaixo.
          </p>
        )}
        {widgetConfig.data?.ok === false && widgetConfig.data.error === "memed_offline" && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-[11px] text-amber-800 ring-1 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900">
            O serviço de prescrição digital está fora do ar neste momento (indisponibilidade do
            provedor, não é problema no seu cadastro). Use a receita local abaixo e tente de novo
            mais tarde.
          </p>
        )}
        {widgetConfig.data?.ok === false && widgetConfig.data.error === "invalid_credentials" && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-[11px] text-red-700 ring-1 ring-red-200 dark:bg-red-950/40 dark:text-red-300 dark:ring-red-900">
            As credenciais de prescrição digital deste ambiente foram recusadas — a receita local
            abaixo continua funcionando enquanto isso é corrigido.
          </p>
        )}

        {widgetConfig.data?.ok === false && widgetConfig.data.error === "prescritor_inativo" && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-[11px] text-red-700 ring-1 ring-red-200 dark:bg-red-950/40 dark:text-red-300 dark:ring-red-900">
            Seu cadastro de prescritor está inativo na Memed — fale com o suporte deles para
            reativar. Por enquanto, use a receita local abaixo.
          </p>
        )}
        {widgetConfig.data?.ok === false && widgetConfig.data.error === "missing_cpf" && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-[11px] text-amber-800 ring-1 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900">
            Prescrição digital exige CPF (ou passaporte) do paciente cadastrado — é uma exigência da
            RDC 1000/25. Complete o cadastro do paciente e tente de novo, ou use a receita local
            abaixo.
          </p>
        )}

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
            {widgetConfig.data?.ok === false &&
            (widgetConfig.data.error === "memed_error" ||
              widgetConfig.data.error === "memed_offline" ||
              widgetConfig.data.error === "invalid_credentials")
              ? "Gerar receita local (sem Memed)"
              : "Gerar receita"}

          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
