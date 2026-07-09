// Painel do dia — o Kanban REAL do consultório. Cards vêm do servidor
// (scoped ao médico logado), arrastar entre colunas persiste, clicar abre o
// prontuário. Consultório vazio oferece cadastro ou personas de exemplo.

import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  FileCheck2,
  Loader2,
  Pill,
  Plus,
  Sparkles,
  Stethoscope,
  UserPlus,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { PatientFormDialog, type PatientFormValues } from "@/components/clinic/patient-form-dialog";
import {
  createMyPatient,
  getWorkspace,
  importSamplePatients,
  moveMyPatient,
} from "@/lib/api/clinic.functions";
import {
  ageFrom,
  CLINIC_COLUMNS,
  initialsOf,
  type ClinicColumn,
  type Patient,
} from "@/lib/clinic-types";
import { clearSession } from "@/lib/session";
import { useClinic } from "@/lib/clinic-context";

export const Route = createFileRoute("/app/")({
  component: PainelDoDia,
});

function PainelDoDia() {
  const { token } = useClinic();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [hoverCol, setHoverCol] = useState<ClinicColumn | null>(null);
  const [novoOpen, setNovoOpen] = useState(false);

  const ws = useQuery({
    queryKey: ["workspace"],
    queryFn: async () => {
      const r = await getWorkspace({ data: { token } });
      if (!r.ok) {
        clearSession();
        navigate({ to: "/login" });
        throw new Error("unauthorized");
      }
      return r;
    },
  });

  const mover = useMutation({
    mutationFn: (v: { id: string; to: ClinicColumn }) =>
      moveMyPatient({ data: { token, ...v } }),
    onMutate: async (v) => {
      // otimista: o card muda de coluna na hora; o servidor confirma depois
      await qc.cancelQueries({ queryKey: ["workspace"] });
      const prev = qc.getQueryData<typeof ws.data>(["workspace"]);
      qc.setQueryData<typeof ws.data>(["workspace"], (old) =>
        old && old.ok
          ? { ...old, patients: old.patients.map((p) => (p.id === v.id ? { ...p, column: v.to } : p)) }
          : old,
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(["workspace"], ctx.prev);
      toast.error("Não consegui mover o card. Tente de novo.");
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["workspace"] }),
  });

  const criar = useMutation({
    mutationFn: (v: PatientFormValues) =>
      createMyPatient({
        data: {
          token,
          nome: v.nome,
          nascimento: v.nascimento || null,
          sexo: v.sexo || null,
          cpf: v.cpf || null,
          telefone: v.telefone || null,
          email: v.email || null,
          queixa: v.queixa ?? "",
          column: v.column,
        },
      }),
    onSuccess: (r) => {
      if (!r.ok) return toast.error("Não consegui cadastrar. Tente de novo.");
      toast.success(`${r.patient.nome} no painel!`);
      setNovoOpen(false);
      qc.invalidateQueries({ queryKey: ["workspace"] });
    },
  });

  const importar = useMutation({
    mutationFn: () => importSamplePatients({ data: { token } }),
    onSuccess: (r) => {
      if (!r.ok) return;
      toast.success(`${r.added} pacientes de exemplo importados.`);
      qc.invalidateQueries({ queryKey: ["workspace"] });
    },
  });

  if (ws.isLoading || !ws.data?.ok) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      </div>
    );
  }

  const patients = ws.data.patients;
  const criticos = patients.filter((p) => p.criticalFlag).length;
  const emAtendimento = patients.filter((p) => p.column === "atendimento").length;
  const hoje = new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });

  const onDrop = (col: ClinicColumn) => {
    if (draggingId) {
      const p = patients.find((x) => x.id === draggingId);
      if (p && p.column !== col) mover.mutate({ id: draggingId, to: col });
      setDraggingId(null);
      setHoverCol(null);
    }
  };

  return (
    <div className="mx-auto max-w-[1400px] p-3 lg:p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[11px] font-medium uppercase tracking-wider text-primary">{hoje}</div>
          <h1 className="text-xl font-semibold tracking-tight">Painel do dia</h1>
          <div className="mt-1 flex flex-wrap gap-3 text-xs text-muted-foreground">
            <span><strong className="text-foreground">{patients.length}</strong> pacientes ativos</span>
            <span><strong className="text-foreground">{emAtendimento}</strong> em atendimento</span>
            {criticos > 0 && (
              <span className="text-red-600 dark:text-red-400">
                <strong>{criticos}</strong> com parâmetro crítico
              </span>
            )}
          </div>
        </div>
        <Button onClick={() => setNovoOpen(true)} className="brand-gradient text-primary-foreground">
          <Plus className="mr-1.5 h-4 w-4" />
          Novo paciente
        </Button>
      </div>

      {patients.length === 0 ? (
        <EmptyClinic
          onNovo={() => setNovoOpen(true)}
          onImport={() => importar.mutate()}
          importing={importar.isPending}
        />
      ) : (
        <div className="mt-6 grid gap-3 lg:grid-cols-3 xl:grid-cols-5">
          {CLINIC_COLUMNS.map((col) => {
            const cards = patients.filter((p) => p.column === col.id);
            const isHover = hoverCol === col.id;
            return (
              <div
                key={col.id}
                onDragOver={(e) => {
                  e.preventDefault();
                  setHoverCol(col.id);
                }}
                onDragLeave={() => setHoverCol((c) => (c === col.id ? null : c))}
                onDrop={() => onDrop(col.id)}
                className={`flex flex-col rounded-2xl border bg-card/60 p-2.5 transition ${
                  isHover ? "border-primary bg-primary/5 ring-2 ring-primary/30" : "border-border"
                }`}
              >
                <div className="mb-2.5 flex items-center justify-between px-1">
                  <div>
                    <div className="text-sm font-semibold leading-tight">{col.title}</div>
                    <div className="text-[11px] text-muted-foreground">{col.hint}</div>
                  </div>
                  <div className="flex h-6 min-w-6 items-center justify-center rounded-full bg-muted px-2 text-xs font-medium text-muted-foreground">
                    {cards.length}
                  </div>
                </div>
                <div className="flex-1 space-y-2">
                  {cards.map((p) => (
                    <PatientKanbanCard
                      key={p.id}
                      p={p}
                      onClick={() => navigate({ to: "/app/pacientes/$id", params: { id: p.id } })}
                      onDragStart={() => setDraggingId(p.id)}
                      onDragEnd={() => setDraggingId(null)}
                      dragging={draggingId === p.id}
                    />
                  ))}
                  {cards.length === 0 && (
                    <div className="rounded-lg border border-dashed border-border/60 py-5 text-center text-[11px] text-muted-foreground">
                      Solte um card aqui
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <PatientFormDialog
        open={novoOpen}
        onOpenChange={setNovoOpen}
        onSubmit={(v) => criar.mutate(v)}
        saving={criar.isPending}
      />
    </div>
  );
}

function EmptyClinic({
  onNovo,
  onImport,
  importing,
}: {
  onNovo: () => void;
  onImport: () => void;
  importing: boolean;
}) {
  return (
    <div className="mt-10 flex flex-col items-center rounded-3xl border border-dashed border-border bg-card/50 px-6 py-14 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl brand-gradient shadow-lg shadow-primary/30">
        <Stethoscope className="h-7 w-7 text-primary-foreground" />
      </div>
      <h2 className="mt-4 text-lg font-semibold">Seu consultório está pronto</h2>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">
        Cadastre seu primeiro paciente — ou importe cinco personas de exemplo para sentir o fluxo
        antes de colocar dados reais.
      </p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        <Button onClick={onNovo} className="brand-gradient text-primary-foreground">
          <UserPlus className="mr-1.5 h-4 w-4" />
          Cadastrar primeiro paciente
        </Button>
        <Button variant="outline" onClick={onImport} disabled={importing}>
          {importing && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
          Importar pacientes de exemplo
        </Button>
      </div>
    </div>
  );
}

export function PatientKanbanCard({
  p,
  onClick,
  onDragStart,
  onDragEnd,
  dragging,
}: {
  p: Patient;
  onClick: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  dragging: boolean;
}) {
  const idade = ageFrom(p.nascimento);
  return (
    <button
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onClick}
      className={`group w-full rounded-xl border border-border bg-card p-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/10 ${
        dragging ? "opacity-50" : ""
      }`}
    >
      <div className="flex items-start gap-2.5">
        <div
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${p.tint} text-xs font-semibold text-white shadow`}
        >
          {initialsOf(p.nome)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">{p.nome}</div>
          <div className="text-[11px] text-muted-foreground">
            {idade !== null ? `${idade} anos` : "idade não informada"}
          </div>
          {p.queixa && <div className="mt-0.5 line-clamp-2 text-xs text-foreground/80">{p.queixa}</div>}
        </div>
      </div>

      {(p.briefing || p.criticalFlag || p.examsCount > 0 || typeof p.adherence === "number") && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {p.criticalFlag && (
            <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-800 ring-1 ring-red-200 dark:bg-red-950 dark:text-red-300 dark:ring-red-900">
              <AlertTriangle className="h-2.5 w-2.5" />
              {p.criticalFlag}
            </span>
          )}
          {p.briefing && (
            <span className="inline-flex items-center gap-1 rounded-full bg-cyan-100 px-2 py-0.5 text-[10px] font-medium text-cyan-800 ring-1 ring-cyan-200 dark:bg-cyan-950 dark:text-cyan-300 dark:ring-cyan-900">
              <Sparkles className="h-2.5 w-2.5" />
              Briefing IA
            </span>
          )}
          {p.examsCount > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-800 ring-1 ring-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:ring-emerald-900">
              <FileCheck2 className="h-2.5 w-2.5" />
              {p.examsCount} exame{p.examsCount > 1 ? "s" : ""}
            </span>
          )}
          {typeof p.adherence === "number" && (
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ${
                p.adherence < 60
                  ? "bg-amber-100 text-amber-800 ring-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:ring-amber-900"
                  : "bg-slate-100 text-slate-700 ring-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-800"
              }`}
            >
              <Pill className="h-2.5 w-2.5" />
              {p.adherence}% adesão
            </span>
          )}
        </div>
      )}
    </button>
  );
}
