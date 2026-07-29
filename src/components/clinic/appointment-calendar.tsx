// Calendário de consultas — visão dia/semana/mês com drag & drop de pacientes.
// Arraste um paciente da lista acima até um slot; abre confirmação e agenda.
// Slots são configuráveis (15/20/30/45/60 min) e o expediente (início/fim) é
// salvo em localStorage por médico. Um alerta laranja aparece quando 3+
// pacientes caem no mesmo horário; a partir do 4º o slot bloqueia o drop.

import { Fragment, useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Lock,
  Settings2,
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
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { deleteMyAppointment, scheduleAppointment, rescheduleAppointment } from "@/lib/api/clinic.functions";
import {
  formatHourBR,
  initialsOf,
  type Appointment,
  type Patient,
} from "@/lib/clinic-types";

type View = "dia" | "semana" | "mes";

type CalendarSettings = {
  slotMinutes: 15 | 20 | 30 | 45 | 60;
  startHour: number; // 0-23
  endHour: number; // 1-24
};

const DEFAULTS: CalendarSettings = { slotMinutes: 30, startHour: 8, endHour: 19 };
const MAX_PARALLEL = 3;
export const DRAG_PATIENT_KEY = "application/x-patient-id";
const DRAG_KEY = DRAG_PATIENT_KEY;
const DRAG_APPT = "application/x-appointment-id";

const WEEKDAYS_SHORT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const MONTHS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

function toIsoLocal(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:00`;
}
function ymd(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
function startOfWeek(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - x.getDay());
  return x;
}
function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function loadSettings(token: string): CalendarSettings {
  try {
    const raw = localStorage.getItem(`clinic:cal:${token}`);
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {}
  return DEFAULTS;
}
function saveSettings(token: string, s: CalendarSettings) {
  try {
    localStorage.setItem(`clinic:cal:${token}`, JSON.stringify(s));
  } catch {}
}

export function AppointmentCalendar({
  token,
  patients,
  appointments,
  onOpenPatient,
}: {
  token: string;
  patients: Patient[];
  appointments: Appointment[];
  onOpenPatient?: (p: Patient) => void;
}) {
  const qc = useQueryClient();
  const [view, setView] = useState<View>("semana");
  const [cursor, setCursor] = useState<Date>(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [settings, setSettings] = useState<CalendarSettings>(() => loadSettings(token));
  const [pending, setPending] = useState<{ patient: Patient | null; dateTime: string } | null>(null);
  const [note, setNote] = useState("");
  const [isBloqueio, setIsBloqueio] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [selectedPatientId, setSelectedPatientId] = useState("");
  const [repetir, setRepetir] = useState(false);
  const [vezes, setVezes] = useState(4);

  useEffect(() => saveSettings(token, settings), [token, settings]);

  const byId = useMemo(() => new Map(patients.map((p) => [p.id, p])), [patients]);

  const resetDialogFields = () => {
    setNote("");
    setIsBloqueio(false);
    setMotivo("");
    setSelectedPatientId("");
    setRepetir(false);
    setVezes(4);
  };

  const closeDialog = () => {
    setPending(null);
    resetDialogFields();
  };

  const agendar = useMutation({
    mutationFn: (v: {
      patientId: string | null;
      dateTime: string;
      note: string | null;
      kind: "consulta" | "bloqueio";
      label: string | null;
      recurrenceWeeks: number;
    }) =>
      scheduleAppointment({
        data: {
          token,
          patientId: v.patientId ?? undefined,
          dateTime: v.dateTime,
          note: v.note,
          kind: v.kind,
          label: v.label,
          recurrenceWeeks: v.recurrenceWeeks,
        },
      }),
    onSuccess: (r, v) => {
      if (!r.ok) return toast.error(v.kind === "bloqueio" ? "Não consegui bloquear o horário." : "Não consegui agendar.");
      if (v.kind === "bloqueio") {
        toast.success("Horário bloqueado.");
      } else {
        const nome = (pending?.patient?.nome ?? byId.get(v.patientId ?? "")?.nome ?? "Paciente").split(" ")[0];
        const criados = "appointments" in r ? r.appointments?.length ?? 1 : 1;
        toast.success(
          criados > 1
            ? `${nome} agendado(a) ${criados}x, toda semana a partir de ${new Date(v.dateTime).toLocaleDateString("pt-BR")}.`
            : `${nome} agendado(a) para ${new Date(v.dateTime).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}.`,
        );
      }
      closeDialog();
      qc.invalidateQueries({ queryKey: ["workspace"] });
    },
  });

  const excluirBloqueio = useMutation({
    mutationFn: (id: string) => deleteMyAppointment({ data: { token, id } }),
    onSuccess: (r) => {
      if (!r.ok) return toast.error("Não consegui remover o bloqueio.");
      toast.success("Bloqueio removido.");
      qc.invalidateQueries({ queryKey: ["workspace"] });
    },
  });

  const remarcar = useMutation({
    mutationFn: (v: { id: string; dateTime: string }) =>
      rescheduleAppointment({ data: { token, ...v } }),
    onSuccess: (r) => {
      if (!r.ok) return toast.error("Não consegui remarcar.");
      toast.success(
        `Remarcado para ${new Date(r.appointment.dateTime).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}.`,
      );
      qc.invalidateQueries({ queryKey: ["workspace"] });
    },
    onError: () => toast.error("Não consegui remarcar."),
  });

  const shift = (dir: -1 | 1) => {
    const d = new Date(cursor);
    if (view === "dia") d.setDate(d.getDate() + dir);
    else if (view === "semana") d.setDate(d.getDate() + dir * 7);
    else d.setMonth(d.getMonth() + dir);
    setCursor(d);
  };
  const goToday = () => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    setCursor(d);
  };

  const label = useMemo(() => {
    if (view === "mes") return `${MONTHS[cursor.getMonth()]} ${cursor.getFullYear()}`;
    if (view === "semana") {
      const s = startOfWeek(cursor);
      const e = addDays(s, 6);
      return `${s.getDate().toString().padStart(2, "0")}/${(s.getMonth() + 1).toString().padStart(2, "0")} – ${e.getDate().toString().padStart(2, "0")}/${(e.getMonth() + 1).toString().padStart(2, "0")} · ${cursor.getFullYear()}`;
    }
    return cursor.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" });
  }, [view, cursor]);

  const openConfirm = (patientId: string, dateTime: string) => {
    const p = byId.get(patientId);
    if (!p) return;
    resetDialogFields();
    setPending({ patient: p, dateTime });
  };

  const openEmptySlot = (dateTime: string) => {
    resetDialogFields();
    setPending({ patient: null, dateTime });
  };

  const chosenPatientId = pending?.patient?.id ?? selectedPatientId;
  const canConfirm = isBloqueio || !!chosenPatientId;

  const confirmar = () => {
    if (!pending) return;
    if (isBloqueio) {
      agendar.mutate({
        patientId: null,
        dateTime: pending.dateTime,
        note: null,
        kind: "bloqueio",
        label: motivo.trim() || null,
        recurrenceWeeks: 0,
      });
      return;
    }
    if (!chosenPatientId) return;
    agendar.mutate({
      patientId: chosenPatientId,
      dateTime: pending.dateTime,
      note: note.trim() || null,
      kind: "consulta",
      label: null,
      recurrenceWeeks: repetir ? vezes : 0,
    });
  };

  return (
    <div className="mt-4 rounded-2xl border border-border bg-card">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
        <CalendarDays className="h-4 w-4 text-primary" />
        <span className="text-sm font-semibold">Agenda</span>
        <div className="ml-1 flex items-center gap-0.5">
          <Button variant="ghost" size="sm" onClick={() => shift(-1)} className="h-7 w-7 p-0">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={goToday} className="h-7 px-2 text-xs">
            Hoje
          </Button>
          <Button variant="ghost" size="sm" onClick={() => shift(1)} className="h-7 w-7 p-0">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="text-xs font-medium capitalize text-muted-foreground">{label}</div>

        <div className="ml-auto flex items-center gap-2">
          <div className="flex rounded-lg border border-border p-0.5">
            {(["dia", "semana", "mes"] as View[]).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`rounded-md px-2.5 py-1 text-[11px] font-medium capitalize transition ${
                  view === v
                    ? "bg-primary text-primary-foreground shadow"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {v === "mes" ? "mês" : v}
              </button>
            ))}
          </div>
          <SettingsPopover settings={settings} onChange={setSettings} />
        </div>
      </div>

      {/* Corpo */}
      <div className="p-2">
        {view === "dia" && (
          <TimeGrid
            days={[cursor]}
            settings={settings}
            appointments={appointments}
            byId={byId}
            onDropPatient={openConfirm}
            onMoveAppointment={(id, dateTime) => remarcar.mutate({ id, dateTime })}
            onOpenPatient={onOpenPatient}
            onSlotClick={openEmptySlot}
            onDeleteBloqueio={(id) => excluirBloqueio.mutate(id)}
          />
        )}
        {view === "semana" && (
          <TimeGrid
            days={Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(cursor), i))}
            settings={settings}
            appointments={appointments}
            byId={byId}
            onDropPatient={openConfirm}
            onMoveAppointment={(id, dateTime) => remarcar.mutate({ id, dateTime })}
            onOpenPatient={onOpenPatient}
            onSlotClick={openEmptySlot}
            onDeleteBloqueio={(id) => excluirBloqueio.mutate(id)}
          />
        )}
        {view === "mes" && (
          <MonthGrid
            cursor={cursor}
            appointments={appointments}
            onPickDay={(d) => { setCursor(d); setView("dia"); }}
          />
        )}
      </div>

      <div className="border-t border-border px-3 py-2 text-[11px] text-muted-foreground">
        Dica: arraste um card de consulta para outro horário para remarcar.
        Até {MAX_PARALLEL} pacientes por horário — o 3º dispara alerta.
      </div>


      {/* Confirmação */}
      <Dialog open={!!pending} onOpenChange={(o) => !o && closeDialog()}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{isBloqueio ? "Bloquear horário" : "Confirmar agendamento"}</DialogTitle>
            <DialogDescription>
              {pending &&
                new Date(pending.dateTime).toLocaleString("pt-BR", {
                  weekday: "short",
                  day: "2-digit",
                  month: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            {!isBloqueio &&
              (pending?.patient ? (
                <div className="text-sm font-medium">{pending.patient.nome}</div>
              ) : (
                <div className="space-y-1">
                  <Label className="text-xs">Paciente</Label>
                  <Select value={selectedPatientId} onValueChange={setSelectedPatientId}>
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue placeholder="Selecionar paciente" />
                    </SelectTrigger>
                    <SelectContent>
                      {patients.map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}

            <label className="flex items-center justify-between gap-2 text-xs">
              <span>Bloquear horário (sem paciente)</span>
              <Switch checked={isBloqueio} onCheckedChange={setIsBloqueio} />
            </label>

            {isBloqueio ? (
              <div className="space-y-1">
                <Label htmlFor="ap-motivo" className="text-xs">Motivo</Label>
                <Input
                  id="ap-motivo"
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  placeholder="Almoço, bloqueio administrativo…"
                  maxLength={80}
                />
              </div>
            ) : (
              <>
                <div className="space-y-1">
                  <Label htmlFor="ap-nota" className="text-xs">Observação (opcional)</Label>
                  <Input
                    id="ap-nota"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Retorno, avaliação de exames…"
                    maxLength={200}
                  />
                </div>
                <label className="flex items-center justify-between gap-2 text-xs">
                  <span>Repetir semanalmente</span>
                  <Switch checked={repetir} onCheckedChange={setRepetir} />
                </label>
                {repetir && (
                  <div className="space-y-1">
                    <Label htmlFor="ap-vezes" className="text-xs">Quantas vezes</Label>
                    <Input
                      id="ap-vezes"
                      type="number"
                      min={1}
                      max={11}
                      value={vezes}
                      onChange={(e) => setVezes(Math.max(1, Math.min(11, Number(e.target.value) || 1)))}
                    />
                  </div>
                )}
              </>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>Cancelar</Button>
            <Button
              disabled={agendar.isPending || !canConfirm}
              onClick={confirmar}
              className="brand-gradient text-primary-foreground"
            >
              {agendar.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              {isBloqueio ? "Bloquear" : "Confirmar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------------------------------------------------------------------------

function SettingsPopover({
  settings,
  onChange,
}: {
  settings: CalendarSettings;
  onChange: (s: CalendarSettings) => void;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-7 gap-1.5 px-2 text-[11px]">
          <Settings2 className="h-3.5 w-3.5" />
          {settings.slotMinutes}min · {settings.startHour}h–{settings.endHour}h
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 space-y-3" align="end">
        <div className="text-xs font-semibold">Configurar agenda</div>
        <div className="space-y-1">
          <Label className="text-[11px]">Duração do slot</Label>
          <Select
            value={String(settings.slotMinutes)}
            onValueChange={(v) => onChange({ ...settings, slotMinutes: Number(v) as CalendarSettings["slotMinutes"] })}
          >
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {[15, 20, 30, 45, 60].map((m) => (
                <SelectItem key={m} value={String(m)}>{m} minutos</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-[11px]">Início</Label>
            <Input
              type="number"
              min={0}
              max={23}
              value={settings.startHour}
              onChange={(e) => {
                const v = Math.max(0, Math.min(23, Number(e.target.value) || 0));
                onChange({ ...settings, startHour: v, endHour: Math.max(v + 1, settings.endHour) });
              }}
              className="h-8 text-xs"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[11px]">Fim</Label>
            <Input
              type="number"
              min={1}
              max={24}
              value={settings.endHour}
              onChange={(e) => {
                const v = Math.max(1, Math.min(24, Number(e.target.value) || 24));
                onChange({ ...settings, endHour: Math.max(settings.startHour + 1, v) });
              }}
              className="h-8 text-xs"
            />
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ---------------------------------------------------------------------------

function TimeGrid({
  days,
  settings,
  appointments,
  byId,
  onDropPatient,
  onMoveAppointment,
  onOpenPatient,
  onSlotClick,
  onDeleteBloqueio,
}: {
  days: Date[];
  settings: CalendarSettings;
  appointments: Appointment[];
  byId: Map<string, Patient>;
  onDropPatient: (patientId: string, dateTime: string) => void;
  onMoveAppointment: (appointmentId: string, dateTime: string) => void;
  onOpenPatient?: (p: Patient) => void;
  onSlotClick: (dateTime: string) => void;
  onDeleteBloqueio: (id: string) => void;
}) {
  const { slotMinutes, startHour, endHour } = settings;
  const slotsPerHour = 60 / slotMinutes;
  const rows: Array<{ hour: number; minute: number }> = [];
  for (let h = startHour; h < endHour; h++) {
    for (let s = 0; s < slotsPerHour; s++) {
      rows.push({ hour: h, minute: s * slotMinutes });
    }
  }

  // index appointments by day-ymd + slot key
  const bucket = useMemo(() => {
    const map = new Map<string, Appointment[]>();
    for (const a of appointments) {
      const d = new Date(a.dateTime);
      // snap to slot start
      const snapped = Math.floor(d.getMinutes() / slotMinutes) * slotMinutes;
      const key = `${ymd(d)}#${d.getHours()}:${snapped}`;
      const arr = map.get(key) ?? [];
      arr.push(a);
      map.set(key, arr);
    }
    return map;
  }, [appointments, slotMinutes]);

  const todayKey = ymd(new Date());

  return (
    <div className="overflow-x-auto">
      <div
        className="grid min-w-[520px] gap-px bg-border"
        style={{ gridTemplateColumns: `56px repeat(${days.length}, minmax(120px, 1fr))` }}
      >
        {/* header */}
        <div className="bg-card" />
        {days.map((d) => {
          const isToday = ymd(d) === todayKey;
          return (
            <div
              key={ymd(d)}
              className={`bg-card px-2 py-1.5 text-center text-[11px] ${
                isToday ? "text-primary font-semibold" : "text-muted-foreground"
              }`}
            >
              <div>{WEEKDAYS_SHORT[d.getDay()]}</div>
              <div className="text-sm">{d.getDate().toString().padStart(2, "0")}</div>
            </div>
          );
        })}
        {/* rows */}
        {rows.map((r) => (
          <Fragment key={`row-${r.hour}-${r.minute}`}>
            <div className="flex items-start justify-end bg-card px-1.5 py-1 text-[10px] tabular-nums text-muted-foreground">
              {r.minute === 0 ? `${String(r.hour).padStart(2, "0")}:00` : ""}
            </div>
            {days.map((d) => {
              const slotDate = new Date(d);
              slotDate.setHours(r.hour, r.minute, 0, 0);
              const key = `${ymd(d)}#${r.hour}:${r.minute}`;
              const appts = bucket.get(key) ?? [];
              return (
                <Slot
                  key={key}
                  slotDate={slotDate}
                  appts={appts}
                  byId={byId}
                  onDropPatient={onDropPatient}
                  onMoveAppointment={onMoveAppointment}
                  onOpenPatient={onOpenPatient}
                  onSlotClick={onSlotClick}
                  onDeleteBloqueio={onDeleteBloqueio}
                />
              );
            })}
          </Fragment>
        ))}
      </div>
    </div>
  );
}

function Slot({
  slotDate,
  appts,
  byId,
  onDropPatient,
  onMoveAppointment,
  onOpenPatient,
  onSlotClick,
  onDeleteBloqueio,
}: {
  slotDate: Date;
  appts: Appointment[];
  byId: Map<string, Patient>;
  onDropPatient: (patientId: string, dateTime: string) => void;
  onMoveAppointment: (appointmentId: string, dateTime: string) => void;
  onOpenPatient?: (p: Patient) => void;
  onSlotClick: (dateTime: string) => void;
  onDeleteBloqueio: (id: string) => void;
}) {
  const [hover, setHover] = useState(false);
  const targetIso = toIsoLocal(slotDate);
  const bloqueio = appts.find((a) => a.kind === "bloqueio");

  // horário bloqueado: nem drop nem clique-pra-agendar funcionam aqui — só o X remove
  if (bloqueio) {
    return (
      <div className="relative flex min-h-[36px] items-start gap-1 bg-slate-200 p-1 dark:bg-slate-800/70">
        <Lock className="mt-0.5 h-2.5 w-2.5 shrink-0 text-slate-500 dark:text-slate-400" />
        <span className="min-w-0 flex-1 truncate text-[10px] font-medium text-slate-600 dark:text-slate-300">
          {bloqueio.label || "Bloqueado"}
        </span>
        <button
          type="button"
          title="Remover bloqueio"
          onClick={() => onDeleteBloqueio(bloqueio.id)}
          className="shrink-0 text-slate-500 hover:text-red-600 dark:text-slate-400 dark:hover:text-red-400"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
    );
  }

  const full = appts.length >= MAX_PARALLEL;
  const warn = appts.length >= 2; // 2 já sinaliza; 3 é o limite

  return (
    <div
      onDragOver={(e) => {
        // aceita drop se houver espaço OU se for reordenação dentro do mesmo slot
        const types = e.dataTransfer.types;
        const isAppt = types.includes(DRAG_APPT);
        if (full && !(isAppt && appts.some((a) => new Date(a.dateTime).getTime() === slotDate.getTime()))) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        setHover(true);
      }}
      onDragLeave={() => setHover(false)}
      onDrop={(e) => {
        setHover(false);
        const apptId = e.dataTransfer.getData(DRAG_APPT);
        if (apptId) {
          // não remarca se o card foi solto no mesmo slot
          const sameSlot = appts.some((a) => a.id === apptId);
          if (sameSlot) return;
          if (full) return;
          onMoveAppointment(apptId, targetIso);
          return;
        }
        if (full) return;
        const patientId = e.dataTransfer.getData(DRAG_KEY) || e.dataTransfer.getData("text/plain");
        if (patientId) onDropPatient(patientId, targetIso);
      }}
      onClick={() => {
        if (appts.length === 0) onSlotClick(targetIso);
      }}
      className={`relative min-h-[36px] bg-card p-0.5 transition ${
        appts.length === 0 ? "cursor-pointer hover:bg-primary/5" : ""
      } ${hover ? "bg-primary/10 ring-1 ring-primary" : ""} ${full ? "bg-red-50 dark:bg-red-950/40" : ""}`}
    >
      {appts.length >= MAX_PARALLEL && (
        <div className="absolute right-1 top-1 flex items-center gap-0.5 rounded-full bg-red-500/90 px-1.5 py-0.5 text-[9px] font-semibold text-white">
          <AlertTriangle className="h-2.5 w-2.5" />
          cheio
        </div>
      )}
      {appts.length === 2 && (
        <div className="absolute right-1 top-1 rounded-full bg-amber-500/90 px-1.5 py-0.5 text-[9px] font-semibold text-white">
          2 em paralelo
        </div>
      )}
      <div className="flex flex-wrap gap-0.5">
        {appts.map((a) => {
          if (!a.patientId) return null;
          const p = byId.get(a.patientId);
          if (!p) return null;
          return (
            <button
              key={a.id}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData(DRAG_APPT, a.id);
                e.dataTransfer.effectAllowed = "move";
              }}
              onClick={(e) => {
                e.stopPropagation();
                onOpenPatient?.(p);
              }}
              title={`${p.nome} · ${formatHourBR(a.dateTime)}${a.note ? ` · ${a.note}` : ""} — arraste para remarcar`}
              className={`flex max-w-full cursor-grab items-center gap-1 truncate rounded-md bg-gradient-to-br ${p.tint} px-1.5 py-0.5 text-[10px] font-medium text-white shadow active:cursor-grabbing ${
                warn ? "ring-1 ring-amber-400" : ""
              }`}
            >
              <span className="text-[9px] opacity-80">{initialsOf(p.nome)}</span>
              <span className="truncate">{p.nome.split(" ")[0]}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function MonthGrid({
  cursor,
  appointments,
  onPickDay,
}: {
  cursor: Date;
  appointments: Appointment[];
  onPickDay: (d: Date) => void;
}) {
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const start = startOfWeek(first);
  const days = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  const todayKey = ymd(new Date());

  const perDay = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of appointments) {
      const k = ymd(new Date(a.dateTime));
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return m;
  }, [appointments]);

  return (
    <div>
      <div className="grid grid-cols-7 gap-px bg-border text-[10px] font-medium uppercase text-muted-foreground">
        {WEEKDAYS_SHORT.map((d) => (
          <div key={d} className="bg-card px-2 py-1 text-center">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-px bg-border">
        {days.map((d) => {
          const inMonth = d.getMonth() === cursor.getMonth();
          const count = perDay.get(ymd(d)) ?? 0;
          const isToday = ymd(d) === todayKey;
          return (
            <button
              key={ymd(d)}
              onClick={() => onPickDay(d)}
              className={`flex min-h-[68px] flex-col items-start gap-1 bg-card p-1.5 text-left transition hover:bg-primary/5 ${
                inMonth ? "" : "opacity-40"
              }`}
            >
              <span className={`text-xs font-semibold ${isToday ? "text-primary" : ""}`}>
                {d.getDate()}
              </span>
              {count > 0 && (
                <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                  {count} {count === 1 ? "consulta" : "consultas"}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
