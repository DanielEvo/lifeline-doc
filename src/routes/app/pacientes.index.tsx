// Painel de Pacientes — o cadastro completo do consultório em uma tela:
// busca, filtro por status, arquivados, e ações diretas (prontuário, editar
// status, arquivar). Dados 100% do servidor, por médico.

import { useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Archive,
  ArchiveRestore,
  FileText,
  Loader2,
  Phone,
  Plus,
  Search,
  Users,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PatientFormDialog, type PatientFormValues } from "@/components/clinic/patient-form-dialog";
import {
  archiveMyPatient,
  createMyPatient,
  getWorkspace,
  moveMyPatient,
} from "@/lib/api/clinic.functions";
import {
  ageFrom,
  CLINIC_COLUMNS,
  formatDateBR,
  initialsOf,
  type ClinicColumn,
  type Patient,
} from "@/lib/clinic-types";
import { clearSession } from "@/lib/session";
import { useClinic } from "@/lib/clinic-context";

export const Route = createFileRoute("/app/pacientes/")({
  component: PainelPacientes,
});

const COLUMN_BADGE: Record<ClinicColumn, string> = {
  triagem: "bg-sky-100 text-sky-800 ring-sky-200 dark:bg-sky-950 dark:text-sky-300 dark:ring-sky-900",
  atendimento: "bg-violet-100 text-violet-800 ring-violet-200 dark:bg-violet-950 dark:text-violet-300 dark:ring-violet-900",
  aguardando: "bg-amber-100 text-amber-800 ring-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:ring-amber-900",
  retorno: "bg-emerald-100 text-emerald-800 ring-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:ring-emerald-900",
  estavel: "bg-slate-100 text-slate-700 ring-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-800",
};

function PainelPacientes() {
  const { token } = useClinic();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [statusFiltro, setStatusFiltro] = useState<"todos" | ClinicColumn>("todos");
  const [verArquivados, setVerArquivados] = useState(false);
  const [novoOpen, setNovoOpen] = useState(false);

  const ws = useQuery({
    queryKey: ["workspace", "all"],
    queryFn: async () => {
      const r = await getWorkspace({ data: { token, includeArchived: true } });
      if (!r.ok) {
        clearSession();
        navigate({ to: "/login" });
        throw new Error("unauthorized");
      }
      return r;
    },
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["workspace"] });
    qc.invalidateQueries({ queryKey: ["workspace", "all"] });
  };

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
      toast.success(`${r.patient.nome} cadastrado.`);
      setNovoOpen(false);
      invalidate();
    },
  });

  const arquivar = useMutation({
    mutationFn: (v: { id: string; archived: boolean }) =>
      archiveMyPatient({ data: { token, ...v } }),
    onSuccess: (r, v) => {
      if (!r.ok) return;
      toast.success(v.archived ? "Paciente arquivado." : "Paciente restaurado.");
      invalidate();
    },
  });

  const mover = useMutation({
    mutationFn: (v: { id: string; to: ClinicColumn }) => moveMyPatient({ data: { token, ...v } }),
    onSuccess: (r) => {
      if (r.ok) invalidate();
    },
  });

  const all = ws.data?.ok ? ws.data.patients : [];
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return all.filter((p) => {
      if (p.archived !== verArquivados) return false;
      if (statusFiltro !== "todos" && p.column !== statusFiltro) return false;
      if (!needle) return true;
      return [p.nome, p.queixa, p.cpf ?? "", p.telefone ?? "", p.email ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [all, q, statusFiltro, verArquivados]);

  const ativos = all.filter((p) => !p.archived);
  const criticos = ativos.filter((p) => p.criticalFlag).length;
  const novosSemana = ativos.filter(
    (p) => Date.now() - Date.parse(p.createdAt) < 7 * 24 * 3600 * 1000,
  ).length;

  if (ws.isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1200px] p-3 lg:p-5">
      {/* Header + stats */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[11px] font-medium uppercase tracking-wider text-primary">Cadastro do consultório</div>
          <h1 className="text-xl font-semibold tracking-tight">Pacientes</h1>
        </div>
        <Button onClick={() => setNovoOpen(true)} className="brand-gradient text-primary-foreground">
          <Plus className="mr-1.5 h-4 w-4" />
          Novo paciente
        </Button>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 sm:max-w-md">
        <Stat label="Ativos" value={ativos.length} />
        <Stat label="Críticos" value={criticos} tone={criticos > 0 ? "red" : undefined} />
        <Stat label="Novos (7d)" value={novosSemana} />
      </div>

      {/* Toolbar */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-52 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por nome, CPF, telefone, queixa…"
            className="pl-9"
          />
        </div>
        <Select value={statusFiltro} onValueChange={(v) => setStatusFiltro(v as typeof statusFiltro)}>
          <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os status</SelectItem>
            {CLINIC_COLUMNS.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
          <Switch checked={verArquivados} onCheckedChange={setVerArquivados} />
          Arquivados
        </label>
      </div>

      {/* Tabela */}
      <div className="mt-4 overflow-hidden rounded-2xl border border-border bg-card">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center px-6 py-12 text-center">
            <Users className="h-8 w-8 text-muted-foreground/50" />
            <p className="mt-3 text-sm font-medium">
              {verArquivados ? "Nenhum paciente arquivado" : q || statusFiltro !== "todos" ? "Nada com esses filtros" : "Nenhum paciente ainda"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {verArquivados || q || statusFiltro !== "todos"
                ? "Ajuste a busca ou os filtros acima."
                : "Cadastre o primeiro para começar o dia."}
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Paciente</TableHead>
                <TableHead className="hidden md:table-cell">Contato</TableHead>
                <TableHead className="hidden lg:table-cell">Queixa atual</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden sm:table-cell">Desde</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((p) => (
                <LinhaPaciente
                  key={p.id}
                  p={p}
                  onAbrir={() => navigate({ to: "/app/pacientes/$id", params: { id: p.id } })}
                  onMover={(to) => mover.mutate({ id: p.id, to })}
                  onArquivar={() => arquivar.mutate({ id: p.id, archived: !p.archived })}
                />
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <PatientFormDialog
        open={novoOpen}
        onOpenChange={setNovoOpen}
        onSubmit={(v) => criar.mutate(v)}
        saving={criar.isPending}
      />
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "red" }) {
  return (
    <div className="rounded-xl border border-border bg-card px-3 py-2">
      <div className={`text-lg font-semibold ${tone === "red" ? "text-red-600 dark:text-red-400" : ""}`}>{value}</div>
      <div className="text-[11px] text-muted-foreground">{label}</div>
    </div>
  );
}

function LinhaPaciente({
  p,
  onAbrir,
  onMover,
  onArquivar,
}: {
  p: Patient;
  onAbrir: () => void;
  onMover: (to: ClinicColumn) => void;
  onArquivar: () => void;
}) {
  const idade = ageFrom(p.nascimento);
  const col = CLINIC_COLUMNS.find((c) => c.id === p.column);
  return (
    <TableRow className="cursor-pointer" onClick={onAbrir}>
      <TableCell>
        <div className="flex items-center gap-2.5">
          <div
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${p.tint} text-[11px] font-semibold text-white`}
          >
            {initialsOf(p.nome)}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-sm font-medium">
              <span className="truncate">{p.nome}</span>
              {p.criticalFlag && <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-red-500" />}
            </div>
            <div className="text-[11px] text-muted-foreground">
              {idade !== null ? `${idade} anos` : "—"}
              {p.sexo ? ` · ${p.sexo}` : ""}
            </div>
          </div>
        </div>
      </TableCell>
      <TableCell className="hidden md:table-cell">
        {p.telefone ? (
          <span className="inline-flex items-center gap-1.5 text-xs">
            <Phone className="h-3 w-3 text-muted-foreground" />
            {p.telefone}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell className="hidden max-w-56 lg:table-cell">
        <span className="line-clamp-1 text-xs text-foreground/80">{p.queixa || "—"}</span>
      </TableCell>
      <TableCell onClick={(e) => e.stopPropagation()}>
        <Select value={p.column} onValueChange={(v) => onMover(v as ClinicColumn)}>
          <SelectTrigger
            className={`h-7 w-auto gap-1.5 rounded-full border-0 px-2.5 text-[11px] font-medium ring-1 ${COLUMN_BADGE[p.column]}`}
          >
            <SelectValue>{col?.title}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {CLINIC_COLUMNS.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell className="hidden text-xs text-muted-foreground sm:table-cell">
        {formatDateBR(p.createdAt)}
      </TableCell>
      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-end gap-1">
          <Button variant="ghost" size="sm" onClick={onAbrir} title="Abrir prontuário">
            <FileText className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onArquivar}
            title={p.archived ? "Restaurar" : "Arquivar"}
          >
            {p.archived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}
