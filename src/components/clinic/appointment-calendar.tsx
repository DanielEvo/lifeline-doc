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
  Settings2,
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
import { scheduleAppointment, rescheduleAppointment } from "@/lib/api/clinic.functions";
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
const DRAG_KEY = "application/x-patient-id";
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
  const [pending, setPending] = useState<{ patient: Patient; dateTime: string } | null>(null);
  const [note, setNote] = useState("");

  useEffect(() => saveSettings(token, settings), [token, settings]);

  const byId = useMemo(() => new Map(patients.map((p) => [p.id, p])), [patients]);

  const agendar = useMutation({
    mutationFn: (v: { patientId: string; dateTime: string; note: string | null }) =>
      scheduleAppointment({ data: { token, ...v } }),
    onSuccess: (r) => {
      if (!r.ok) return toast.error("Não consegui agendar.");
      toast.success(
        `${pending?.patient.nome.split(" ")[0]} agendado(a) para ${new Date(pending!.dateTime).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}.`,
      );
      setPending(null);
      setNote("");
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
    setPending({ patient: p, dateTime });
    setNote("");
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
      <Dialog open={!!pending} onOpenChange={(o) => !o && setPending(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Confirmar agendamento</DialogTitle>
            <DialogDescription>
              {pending?.patient.nome} ·{" "}
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
          <DialogFooter>
            <Button variant="outline" onClick={() => setPending(null)}>Cancelar</Button>
            <Button
              disabled={agendar.isPending}
              onClick={() =>
                pending &&
                agendar.mutate({
                  patientId: pending.patient.id,
                  dateTime: pending.dateTime,
                  note: note.trim() || null,
                })
              }
              className="brand-gradient text-primary-foreground"
            >
              {agendar.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Confirmar
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
}: {
  days: Date[];
  settings: CalendarSettings;
  appointments: Appointment[];
  byId: Map<string, Patient>;
  onDropPatient: (patientId: string, dateTime: string) => void;
  onMoveAppointment: (appointmentId: string, dateTime: string) => void;
  onOpenPatient?: (p: Patient) => void;
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
                  onOpenPatient={onOpenPatient}
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
  onOpenPatient,
}: {
  slotDate: Date;
  appts: Appointment[];
  byId: Map<string, Patient>;
  onDropPatient: (patientId: string, dateTime: string) => void;
  onOpenPatient?: (p: Patient) => void;
}) {
  const [hover, setHover] = useState(false);
  const full = appts.length >= MAX_PARALLEL;
  const warn = appts.length >= 2; // 2 já sinaliza; 3 é o limite

  return (
    <div
      onDragOver={(e) => {
        if (full) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
        setHover(true);
      }}
      onDragLeave={() => setHover(false)}
      onDrop={(e) => {
        setHover(false);
        if (full) return;
        const id = e.dataTransfer.getData(DRAG_KEY) || e.dataTransfer.getData("text/plain");
        if (id) onDropPatient(id, toIsoLocal(slotDate));
      }}
      className={`relative min-h-[36px] bg-card p-0.5 transition ${
        hover ? "bg-primary/10 ring-1 ring-primary" : ""
      } ${full ? "bg-red-50 dark:bg-red-950/40" : ""}`}
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
          const p = byId.get(a.patientId);
          if (!p) return null;
          return (
            <button
              key={a.id}
              onClick={() => onOpenPatient?.(p)}
              title={`${p.nome} · ${formatHourBR(a.dateTime)}${a.note ? ` · ${a.note}` : ""}`}
              className={`flex max-w-full items-center gap-1 truncate rounded-md bg-gradient-to-br ${p.tint} px-1.5 py-0.5 text-[10px] font-medium text-white shadow ${
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
