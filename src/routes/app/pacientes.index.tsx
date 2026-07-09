// Painel de Pacientes — o centro de comando do consultório em 4 visões:
//   Todos     → cadastro completo (busca, convênio, status, arquivados)
//   Hoje      → agenda do dia com manhã/tarde/noite e confirmação por WhatsApp
//   Faltas    → quem sumiu e precisa de reengajamento (1 clique no WhatsApp)
//   Cobranças → quem paga, quem deve, quem atrasou — cobrança pronta no zap
// Os stats do topo são clicáveis e levam direto à visão certa.
// Tudo vem de UMA query (workspace) — o kanban usa a mesma, então qualquer
// ajuste aqui reflete lá na hora (e vice-versa).

import { useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Archive,
  ArchiveRestore,
  CalendarClock,
  CalendarPlus,
  Check,
  DollarSign,
  FileText,
  Loader2,
  Plus,
  Search,
  UserX,
  Users,
  X,
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
import { ChargeDialog, ScheduleDialog } from "@/components/clinic/action-dialogs";
import { WhatsAppButton } from "@/components/clinic/wa-button";
import {
  archiveMyPatient,
  createMyPatient,
  getWorkspace,
  moveMyPatient,
  setMyAppointmentStatus,
  setMyChargeStatus,
} from "@/lib/api/clinic.functions";
import {
  ageFrom,
  formatBRL,
  formatDateBR,
  formatHourBR,
  initialsOf,
  isOverdue,
  isSameLocalDay,
  periodOf,
  PERIOD_LABEL,
  todayIso,
  WA_TEMPLATES,
  type Appointment,
  type BoardColumn,
  type Charge,
  type DayPeriod,
  type Patient,
} from "@/lib/clinic-types";
import { clearSession } from "@/lib/session";
import { useClinic } from "@/lib/clinic-context";

export const Route = createFileRoute("/app/pacientes/")({
  component: PainelPacientes,
});

type View = "todos" | "hoje" | "faltas" | "cobrancas";

const COLUMN_TONES = [
  "bg-sky-100 text-sky-800 ring-sky-200 dark:bg-sky-950 dark:text-sky-300 dark:ring-sky-900",
  "bg-violet-100 text-violet-800 ring-violet-200 dark:bg-violet-950 dark:text-violet-300 dark:ring-violet-900",
  "bg-amber-100 text-amber-800 ring-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:ring-amber-900",
  "bg-emerald-100 text-emerald-800 ring-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:ring-emerald-900",
  "bg-slate-100 text-slate-700 ring-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-800",
  "bg-rose-100 text-rose-800 ring-rose-200 dark:bg-rose-950 dark:text-rose-300 dark:ring-rose-900",
  "bg-cyan-100 text-cyan-800 ring-cyan-200 dark:bg-cyan-950 dark:text-cyan-300 dark:ring-cyan-900",
];

function PainelPacientes() {
  const { token, nome: medico } = useClinic();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [view, setView] = useState<View>("todos");
  const [q, setQ] = useState("");
  const [statusFiltro, setStatusFiltro] = useState<string>("todos");
  const [convenioFiltro, setConvenioFiltro] = useState<string>("todos");
  const [verArquivados, setVerArquivados] = useState(false);
  const [periodo, setPeriodo] = useState<"todas" | DayPeriod>("todas");
  const [cobrancaFiltro, setCobrancaFiltro] = useState<"abertas" | "atrasadas" | "pagas">("abertas");

  const [novoOpen, setNovoOpen] = useState(false);
  const [agendarPara, setAgendarPara] = useState<Patient | null>(null);
  const [cobrarDe, setCobrarDe] = useState<Patient | null>(null);

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

  const invalidate = () => qc.invalidateQueries({ queryKey: ["workspace"] });

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
          convenio: v.convenio || null,
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
    mutationFn: (v: { id: string; to: string }) => moveMyPatient({ data: { token, ...v } }),
    onSuccess: (r) => {
      if (r.ok) invalidate();
    },
  });

  const apptStatus = useMutation({
    mutationFn: (v: { id: string; status: Appointment["status"] }) =>
      setMyAppointmentStatus({ data: { token, ...v } }),
    onSuccess: (r, v) => {
      if (!r.ok) return;
      toast.success(v.status === "realizada" ? "Consulta concluída." : v.status === "faltou" ? "Falta registrada." : "Status atualizado.");
      invalidate();
    },
  });

  const chargeStatus = useMutation({
    mutationFn: (v: { id: string; status: Charge["status"] }) =>
      setMyChargeStatus({ data: { token, ...v } }),
    onSuccess: (r, v) => {
      if (!r.ok) return;
      toast.success(v.status === "pago" ? "Pagamento registrado. 💚" : "Cobrança reaberta.");
      invalidate();
    },
  });

  // ---------------- derivações ----------------
  const data = ws.data?.ok ? ws.data : null;
  const patients = useMemo(() => data?.patients ?? [], [data]);
  const columns: BoardColumn[] = useMemo(() => data?.columns ?? [], [data]);
  const appointments = useMemo(() => data?.appointments ?? [], [data]);
  const charges = useMemo(() => data?.charges ?? [], [data]);

  const byId = useMemo(() => new Map(patients.map((p) => [p.id, p])), [patients]);
  const colTone = (colId: string) =>
    COLUMN_TONES[Math.max(0, columns.findIndex((c) => c.id === colId)) % COLUMN_TONES.length];

  const hoje = todayIso();
  const consultasHoje = useMemo(
    () => appointments.filter((a) => isSameLocalDay(a.dateTime, hoje)),
    [appointments, hoje],
  );

  // faltas a reengajar: a ÚLTIMA consulta do paciente foi "faltou"
  const faltas = useMemo(() => {
    const last = new Map<string, Appointment>();
    for (const a of appointments) last.set(a.patientId, a); // já vem ordenado por data
    return [...last.values()].filter((a) => a.status === "faltou");
  }, [appointments]);

  const pendentes = charges.filter((c) => c.status === "pendente");
  const aReceber = pendentes.reduce((s, c) => s + c.valor, 0);
  const atrasadas = pendentes.filter(isOverdue);
  const ativos = patients.filter((p) => !p.archived);

  const needle = q.trim().toLowerCase();
  const matches = (p: Patient | undefined) =>
    !needle ||
    (p &&
      [p.nome, p.queixa, p.cpf ?? "", p.telefone ?? "", p.email ?? "", p.convenio ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(needle));

  const convenios = useMemo(
    () => [...new Set(patients.map((p) => p.convenio).filter(Boolean))] as string[],
    [patients],
  );

  const listaTodos = useMemo(
    () =>
      patients.filter((p) => {
        if (p.archived !== verArquivados) return false;
        if (statusFiltro !== "todos" && p.column !== statusFiltro) return false;
        if (convenioFiltro !== "todos" && p.convenio !== convenioFiltro) return false;
        return matches(p);
      }),
    [patients, verArquivados, statusFiltro, convenioFiltro, needle],
  );

  const listaHoje = useMemo(
    () =>
      consultasHoje.filter((a) => {
        if (periodo !== "todas" && periodOf(a.dateTime) !== periodo) return false;
        return matches(byId.get(a.patientId));
      }),
    [consultasHoje, periodo, needle, byId],
  );

  const listaFaltas = useMemo(
    () => faltas.filter((a) => matches(byId.get(a.patientId))),
    [faltas, needle, byId],
  );

  const listaCobrancas = useMemo(
    () =>
      charges.filter((c) => {
        if (cobrancaFiltro === "abertas" && c.status !== "pendente") return false;
        if (cobrancaFiltro === "atrasadas" && !isOverdue(c)) return false;
        if (cobrancaFiltro === "pagas" && c.status !== "pago") return false;
        return matches(byId.get(c.patientId));
      }),
    [charges, cobrancaFiltro, needle, byId],
  );

  if (ws.isLoading || !data) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      </div>
    );
  }

  const abrir = (p: Patient) => navigate({ to: "/app/pacientes/$id", params: { id: p.id } });

  return (
    <div className="mx-auto max-w-[1200px] p-3 lg:p-5">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[11px] font-medium uppercase tracking-wider text-primary">Centro de comando</div>
          <h1 className="text-xl font-semibold tracking-tight">Pacientes</h1>
        </div>
        <Button onClick={() => setNovoOpen(true)} className="brand-gradient text-primary-foreground">
          <Plus className="mr-1.5 h-4 w-4" />
          Novo paciente
        </Button>
      </div>

      {/* Stats clicáveis → visão */}
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatCard
          active={view === "hoje"}
          onClick={() => setView("hoje")}
          icon={CalendarClock}
          value={`${consultasHoje.length}`}
          label="consultas hoje"
        />
        <StatCard
          active={view === "cobrancas"}
          onClick={() => { setView("cobrancas"); setCobrancaFiltro("abertas"); }}
          icon={DollarSign}
          value={formatBRL(aReceber)}
          label={atrasadas.length > 0 ? `a receber · ${atrasadas.length} em atraso` : "a receber"}
          tone={atrasadas.length > 0 ? "red" : undefined}
        />
        <StatCard
          active={view === "faltas"}
          onClick={() => setView("faltas")}
          icon={UserX}
          value={`${faltas.length}`}
          label="faltas a reengajar"
          tone={faltas.length > 0 ? "amber" : undefined}
        />
        <StatCard
          active={view === "todos"}
          onClick={() => setView("todos")}
          icon={Users}
          value={`${ativos.length}`}
          label="pacientes ativos"
        />
      </div>

      {/* Toolbar: visões + busca + filtros contextuais */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <div className="flex rounded-xl border border-border bg-card p-0.5">
          {(
            [
              ["todos", "Todos"],
              ["hoje", "Hoje"],
              ["faltas", "Faltas"],
              ["cobrancas", "Cobranças"],
            ] as [View, string][]
          ).map(([v, label]) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                view === v ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="relative min-w-44 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar paciente…"
            className="h-9 pl-9"
          />
        </div>

        {view === "todos" && (
          <>
            <Select value={statusFiltro} onValueChange={setStatusFiltro}>
              <SelectTrigger className="h-9 w-44 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os status</SelectItem>
                {columns.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={convenioFiltro} onValueChange={setConvenioFiltro}>
              <SelectTrigger className="h-9 w-40 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os convênios</SelectItem>
                {convenios.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
              <Switch checked={verArquivados} onCheckedChange={setVerArquivados} />
              Arquivados
            </label>
          </>
        )}

        {view === "hoje" && (
          <div className="flex gap-1">
            {(["todas", "manha", "tarde", "noite"] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPeriodo(p)}
                className={`rounded-full px-3 py-1 text-[11px] font-medium ring-1 transition ${
                  periodo === p
                    ? "bg-primary text-primary-foreground ring-primary"
                    : "bg-card text-muted-foreground ring-border hover:text-foreground"
                }`}
              >
                {p === "todas" ? "Todas" : PERIOD_LABEL[p]}
              </button>
            ))}
          </div>
        )}

        {view === "cobrancas" && (
          <div className="flex gap-1">
            {(
              [
                ["abertas", "Pendentes"],
                ["atrasadas", "Atrasadas"],
                ["pagas", "Pagas"],
              ] as const
            ).map(([v, label]) => (
              <button
                key={v}
                onClick={() => setCobrancaFiltro(v)}
                className={`rounded-full px-3 py-1 text-[11px] font-medium ring-1 transition ${
                  cobrancaFiltro === v
                    ? "bg-primary text-primary-foreground ring-primary"
                    : "bg-card text-muted-foreground ring-border hover:text-foreground"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Conteúdo da visão */}
      <div className="mt-4 overflow-hidden rounded-2xl border border-border bg-card">
        {view === "todos" && (
          <VistaTodos
            lista={listaTodos}
            columns={columns}
            colTone={colTone}
            medico={medico}
            onAbrir={abrir}
            onMover={(id, to) => mover.mutate({ id, to })}
            onArquivar={(p) => arquivar.mutate({ id: p.id, archived: !p.archived })}
            onAgendar={setAgendarPara}
            onCobrar={setCobrarDe}
            vazioMsg={verArquivados ? "Nenhum paciente arquivado." : "Nenhum paciente com esses filtros."}
          />
        )}
        {view === "hoje" && (
          <VistaHoje
            lista={listaHoje}
            byId={byId}
            medico={medico}
            onAbrir={abrir}
            onStatus={(id, status) => apptStatus.mutate({ id, status })}
            onAgendar={setAgendarPara}
          />
        )}
        {view === "faltas" && (
          <VistaFaltas
            lista={listaFaltas}
            byId={byId}
            medico={medico}
            onAbrir={abrir}
            onAgendar={setAgendarPara}
          />
        )}
        {view === "cobrancas" && (
          <VistaCobrancas
            lista={listaCobrancas}
            byId={byId}
            medico={medico}
            onAbrir={abrir}
            onStatus={(id, status) => chargeStatus.mutate({ id, status })}
            filtro={cobrancaFiltro}
          />
        )}
      </div>

      {/* Dialogs */}
      <PatientFormDialog
        open={novoOpen}
        onOpenChange={setNovoOpen}
        columns={columns}
        onSubmit={(v) => criar.mutate(v)}
        saving={criar.isPending}
      />
      <ScheduleDialog
        open={!!agendarPara}
        onOpenChange={(o) => !o && setAgendarPara(null)}
        patient={agendarPara}
        token={token}
      />
      <ChargeDialog
        open={!!cobrarDe}
        onOpenChange={(o) => !o && setCobrarDe(null)}
        patient={cobrarDe}
        token={token}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------

function StatCard({
  icon: Icon,
  value,
  label,
  onClick,
  active,
  tone,
}: {
  icon: typeof Users;
  value: string;
  label: string;
  onClick: () => void;
  active: boolean;
  tone?: "red" | "amber";
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-xl border px-3 py-2.5 text-left transition hover:-translate-y-0.5 hover:shadow-md ${
        active ? "border-primary bg-primary/5 ring-1 ring-primary/30" : "border-border bg-card"
      }`}
    >
      <div className="flex items-center gap-2">
        <Icon
          className={`h-4 w-4 shrink-0 ${
            tone === "red" ? "text-red-500" : tone === "amber" ? "text-amber-500" : "text-primary"
          }`}
        />
        <span className="truncate text-base font-semibold leading-tight">{value}</span>
      </div>
      <div className="mt-0.5 truncate text-[11px] text-muted-foreground">{label}</div>
    </button>
  );
}

function Avatar({ p, onClick }: { p: Patient; onClick?: () => void }) {
  return (
    <div className="flex min-w-0 cursor-pointer items-center gap-2.5" onClick={onClick}>
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
        <div className="truncate text-[11px] text-muted-foreground">
          {ageFrom(p.nascimento) !== null ? `${ageFrom(p.nascimento)} anos` : "—"}
          {p.convenio ? ` · ${p.convenio}` : ""}
        </div>
      </div>
    </div>
  );
}

function Vazio({ icon: Icon, titulo, sub }: { icon: typeof Users; titulo: string; sub: string }) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      <Icon className="h-8 w-8 text-muted-foreground/50" />
      <p className="mt-3 text-sm font-medium">{titulo}</p>
      <p className="mt-1 text-xs text-muted-foreground">{sub}</p>
    </div>
  );
}

function VistaTodos({
  lista,
  columns,
  colTone,
  medico,
  onAbrir,
  onMover,
  onArquivar,
  onAgendar,
  onCobrar,
  vazioMsg,
}: {
  lista: Patient[];
  columns: BoardColumn[];
  colTone: (id: string) => string;
  medico: string;
  onAbrir: (p: Patient) => void;
  onMover: (id: string, to: string) => void;
  onArquivar: (p: Patient) => void;
  onAgendar: (p: Patient) => void;
  onCobrar: (p: Patient) => void;
  vazioMsg: string;
}) {
  if (lista.length === 0)
    return <Vazio icon={Users} titulo={vazioMsg} sub="Ajuste a busca ou cadastre um novo paciente." />;
  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead>Paciente</TableHead>
          <TableHead className="hidden lg:table-cell">Queixa atual</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="hidden sm:table-cell">Desde</TableHead>
          <TableHead className="text-right">Ações</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {lista.map((p) => (
          <TableRow key={p.id} className="cursor-pointer" onClick={() => onAbrir(p)}>
            <TableCell><Avatar p={p} /></TableCell>
            <TableCell className="hidden max-w-52 lg:table-cell">
              <span className="line-clamp-1 text-xs text-foreground/80">{p.queixa || "—"}</span>
            </TableCell>
            <TableCell onClick={(e) => e.stopPropagation()}>
              <Select value={p.column} onValueChange={(v) => onMover(p.id, v)}>
                <SelectTrigger
                  className={`h-7 w-auto gap-1.5 rounded-full border-0 px-2.5 text-[11px] font-medium ring-1 ${colTone(p.column)}`}
                >
                  <SelectValue>
                    {columns.find((c) => c.id === p.column)?.title ?? p.column}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {columns.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </TableCell>
            <TableCell className="hidden text-xs text-muted-foreground sm:table-cell">
              {formatDateBR(p.createdAt)}
            </TableCell>
            <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-end gap-0.5">
                <WhatsAppButton
                  telefone={p.telefone}
                  text={WA_TEMPLATES.livre(p.nome, medico)}
                  title="Mensagem no WhatsApp"
                />
                <Button variant="ghost" size="sm" onClick={() => onAgendar(p)} title="Agendar consulta">
                  <CalendarPlus className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="sm" onClick={() => onCobrar(p)} title="Nova cobrança">
                  <DollarSign className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="sm" onClick={() => onAbrir(p)} title="Abrir prontuário">
                  <FileText className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onArquivar(p)}
                  title={p.archived ? "Restaurar" : "Arquivar"}
                >
                  {p.archived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
                </Button>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

const APPT_TONE: Record<Appointment["status"], string> = {
  agendada: "bg-sky-100 text-sky-800 ring-sky-200 dark:bg-sky-950 dark:text-sky-300 dark:ring-sky-900",
  confirmada: "bg-emerald-100 text-emerald-800 ring-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:ring-emerald-900",
  realizada: "bg-slate-100 text-slate-600 ring-slate-200 dark:bg-slate-900 dark:text-slate-400 dark:ring-slate-800",
  faltou: "bg-red-100 text-red-800 ring-red-200 dark:bg-red-950 dark:text-red-300 dark:ring-red-900",
};

function VistaHoje({
  lista,
  byId,
  medico,
  onAbrir,
  onStatus,
  onAgendar,
}: {
  lista: Appointment[];
  byId: Map<string, Patient>;
  medico: string;
  onAbrir: (p: Patient) => void;
  onStatus: (id: string, status: Appointment["status"]) => void;
  onAgendar: (p: Patient) => void;
}) {
  if (lista.length === 0)
    return (
      <Vazio
        icon={CalendarClock}
        titulo="Nenhuma consulta neste período"
        sub="Agende pela lista de pacientes — o botão de calendário em cada linha."
      />
    );
  return (
    <ul className="divide-y divide-border">
      {lista.map((a) => {
        const p = byId.get(a.patientId);
        if (!p) return null;
        const aberta = a.status === "agendada" || a.status === "confirmada";
        return (
          <li key={a.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
            <div className="w-14 text-sm font-semibold tabular-nums text-primary">
              {formatHourBR(a.dateTime)}
            </div>
            <div className="min-w-0 flex-1">
              <Avatar p={p} onClick={() => onAbrir(p)} />
              {a.note && <div className="mt-0.5 pl-[42px] text-[11px] text-muted-foreground">{a.note}</div>}
            </div>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ${APPT_TONE[a.status]}`}>
              {a.status}
            </span>
            <div className="flex items-center gap-0.5">
              {aberta && (
                <>
                  <WhatsAppButton
                    telefone={p.telefone}
                    text={WA_TEMPLATES.confirmar(p.nome, formatHourBR(a.dateTime), medico)}
                    title="Confirmar por WhatsApp"
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onStatus(a.id, "realizada")}
                    title="Consulta realizada"
                    className="text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700 dark:text-emerald-400 dark:hover:bg-emerald-950"
                  >
                    <Check className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onStatus(a.id, "faltou")}
                    title="Paciente faltou"
                    className="text-red-500 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </>
              )}
              {a.status === "faltou" && (
                <Button variant="outline" size="sm" onClick={() => onAgendar(p)} className="text-xs">
                  Reagendar
                </Button>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function VistaFaltas({
  lista,
  byId,
  medico,
  onAbrir,
  onAgendar,
}: {
  lista: Appointment[];
  byId: Map<string, Patient>;
  medico: string;
  onAbrir: (p: Patient) => void;
  onAgendar: (p: Patient) => void;
}) {
  if (lista.length === 0)
    return (
      <Vazio
        icon={UserX}
        titulo="Ninguém para reengajar 🎉"
        sub="Quando um paciente faltar e não remarcar, ele aparece aqui."
      />
    );
  return (
    <ul className="divide-y divide-border">
      {lista.map((a) => {
        const p = byId.get(a.patientId);
        if (!p) return null;
        return (
          <li key={a.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
            <div className="min-w-0 flex-1">
              <Avatar p={p} onClick={() => onAbrir(p)} />
            </div>
            <span className="text-xs text-muted-foreground">
              faltou em {formatDateBR(a.dateTime)}
            </span>
            <div className="flex items-center gap-1.5">
              <WhatsAppButton
                telefone={p.telefone}
                text={WA_TEMPLATES.reengajar(p.nome, medico)}
                title="Chamar no WhatsApp"
                size="md"
              />
              <Button variant="outline" size="sm" onClick={() => onAgendar(p)} className="text-xs">
                <CalendarPlus className="mr-1 h-3.5 w-3.5" />
                Reagendar
              </Button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function VistaCobrancas({
  lista,
  byId,
  medico,
  onAbrir,
  onStatus,
  filtro,
}: {
  lista: Charge[];
  byId: Map<string, Patient>;
  medico: string;
  onAbrir: (p: Patient) => void;
  onStatus: (id: string, status: Charge["status"]) => void;
  filtro: "abertas" | "atrasadas" | "pagas";
}) {
  if (lista.length === 0)
    return (
      <Vazio
        icon={DollarSign}
        titulo={filtro === "pagas" ? "Nenhum pagamento registrado ainda" : "Nada a receber aqui 🎉"}
        sub="Lance cobranças pela lista de pacientes — o botão $ em cada linha."
      />
    );
  return (
    <ul className="divide-y divide-border">
      {lista.map((c) => {
        const p = byId.get(c.patientId);
        if (!p) return null;
        const overdue = isOverdue(c);
        return (
          <li key={c.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
            <div className="min-w-0 flex-1">
              <Avatar p={p} onClick={() => onAbrir(p)} />
            </div>
            <div className="text-right">
              <div className="text-sm font-semibold tabular-nums">{formatBRL(c.valor)}</div>
              <div className={`text-[11px] ${overdue ? "font-medium text-red-600 dark:text-red-400" : "text-muted-foreground"}`}>
                {c.status === "pago"
                  ? `pago em ${c.pagoEm ? formatDateBR(c.pagoEm) : "—"}`
                  : `${overdue ? "venceu" : "vence"} em ${c.vencimento.split("-").reverse().join("/")}`}
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              {c.status === "pendente" ? (
                <>
                  <WhatsAppButton
                    telefone={p.telefone}
                    text={WA_TEMPLATES.cobrar(
                      p.nome,
                      formatBRL(c.valor),
                      c.vencimento.split("-").reverse().join("/"),
                      medico,
                    )}
                    title="Cobrar no WhatsApp"
                    size="md"
                  />
                  <Button variant="outline" size="sm" onClick={() => onStatus(c.id, "pago")} className="text-xs">
                    <Check className="mr-1 h-3.5 w-3.5" />
                    Recebi
                  </Button>
                </>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onStatus(c.id, "pendente")}
                  className="text-xs text-muted-foreground"
                >
                  Reabrir
                </Button>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
