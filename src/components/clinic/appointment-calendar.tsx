// Calendário de consultas — visão dia/semana/mês, canvas contínuo (pixel por
// minuto) com paralelização real: eventos sobrepostos dividem colunas lado a
// lado (como Google Agenda), estreitando conforme mais se acumulam — sem
// teto artificial. Duração é arrastável (borda inferior do bloco); mover é
// drag & drop; criar é clique em área vazia (abre confirmação).

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Bell,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Loader2,
  Lock,
  Plus,
  Search,
  Settings2,
  Trash2,
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { createMyCategory } from "@/lib/api/categories.functions";
import {
  deleteMyAppointment,
  saveMyCalendarSettings,
  scheduleAppointment,
  updateMyAppointment,
  updateMyAppointmentTiming,
} from "@/lib/api/clinic.functions";
import {
  DEFAULT_CALENDAR_SETTINGS,
  EVENT_COLOR_SWATCHES,
  formatHourBR,
  initialsOf,
  REMINDER_PRESETS,
  TINT_TO_HEX,
  type Appointment,
  type CalendarSettings,
  type EventCategory,
  type Patient,
  type RecurrenceFreq,
  type RecurrenceScope,
} from "@/lib/clinic-types";

type View = "dia" | "semana" | "mes" | "ano" | "lista" | "custom";

// px por minuto do canvas contínuo — 30min ≈ 48px, altura na mesma ordem de
// grandeza do grid antigo de linha fixa (36px por slot).
const PX_PER_MIN = 1.6;
const MIN_BLOCK_PX = 22; // clamp mínimo — consulta de 15min não vira lasca ilegível
const FALLBACK_COLOR = "#64748b"; // slate-500 — bloqueio sem cor/categoria ainda

export const DRAG_PATIENT_KEY = "application/x-patient-id";
const DRAG_KEY = DRAG_PATIENT_KEY;
const DRAG_APPT = "application/x-appointment-id";

const WEEKDAYS_SHORT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const MONTHS = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

function toIsoLocal(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:00`;
}
function ymd(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
function fromYmd(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
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
function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Cor de um evento — consulta usa a cor do próprio paciente (tint), evento
 *  pessoal usa a própria cor resolvida (categoria ou sobrescrita). */
function resolveApptColor(appt: Appointment, byId: Map<string, Patient>): string {
  if (appt.kind === "bloqueio") return appt.cor ?? FALLBACK_COLOR;
  const patient = appt.patientId ? byId.get(appt.patientId) : undefined;
  return TINT_TO_HEX[patient?.tint ?? ""] ?? FALLBACK_COLOR;
}

/** Evento já terminou (dia todo conta até o fim do dia) — usado pra
 *  esmaecer eventos passados no canvas. */
function isPastAppt(appt: Appointment): boolean {
  const start = new Date(appt.dateTime);
  const endMs = appt.allDay
    ? start.setHours(23, 59, 59, 999)
    : start.getTime() + (appt.durationMin ?? 30) * 60000;
  return endMs < Date.now();
}

// ---------------------------------------------------------------------------
// Layout de sobreposição — o coração da paralelização: agrupa eventos do dia
// em clusters mutuamente sobrepostos (varredura por horário de início) e,
// dentro de cada cluster, atribui coluna por first-fit guloso. Sem teto —
// colunas só estreitam conforme mais eventos se acumulam, igual Google Agenda.

type Layouted = {
  appt: Appointment;
  col: number;
  totalCols: number;
  startMin: number;
  durationMin: number;
};

function apptRange(a: Appointment): { startMin: number; durationMin: number } {
  const d = new Date(a.dateTime);
  return { startMin: d.getHours() * 60 + d.getMinutes(), durationMin: a.durationMin ?? 30 };
}

function layoutTimedAppointments(appts: Appointment[]): Layouted[] {
  const sorted = [...appts].sort((a, b) => a.dateTime.localeCompare(b.dateTime));
  const result: Layouted[] = [];
  let cluster: { appt: Appointment; startMin: number; durationMin: number }[] = [];
  let clusterEndMin = -Infinity;

  const flush = () => {
    if (cluster.length === 0) return;
    const colEnds: number[] = [];
    for (const item of cluster) {
      const end = item.startMin + item.durationMin;
      let col = colEnds.findIndex((e) => e <= item.startMin);
      if (col === -1) {
        col = colEnds.length;
        colEnds.push(end);
      } else {
        colEnds[col] = end;
      }
      result.push({
        appt: item.appt,
        col,
        totalCols: -1,
        startMin: item.startMin,
        durationMin: item.durationMin,
      });
    }
    // totalCols só é conhecido depois de posicionar todo mundo do cluster
    const totalCols = colEnds.length;
    for (let i = result.length - cluster.length; i < result.length; i++)
      result[i].totalCols = totalCols;
    cluster = [];
  };

  for (const a of sorted) {
    const { startMin, durationMin } = apptRange(a);
    if (cluster.length > 0 && startMin >= clusterEndMin) {
      flush();
      clusterEndMin = -Infinity;
    }
    cluster.push({ appt: a, startMin, durationMin });
    clusterEndMin = Math.max(clusterEndMin, startMin + durationMin);
  }
  flush();
  return result;
}

/** Bloqueio no caminho de um horário candidato — usado pra rejeitar drop
 *  (mover ou criar) que caia dentro do intervalo de um evento pessoal. */
function bloqueioAt(dayAppts: Appointment[], candidate: Date): Appointment | undefined {
  const startMin = candidate.getHours() * 60 + candidate.getMinutes();
  return dayAppts.find((a) => {
    if (a.kind !== "bloqueio") return false;
    const { startMin: s, durationMin } = apptRange(a);
    return startMin >= s && startMin < s + durationMin;
  });
}

function timeFromClientY(
  columnEl: HTMLElement,
  clientY: number,
  day: Date,
  settings: CalendarSettings,
): Date {
  const rect = columnEl.getBoundingClientRect();
  const rawMin = (clientY - rect.top) / PX_PER_MIN;
  const snapped = Math.round(rawMin / settings.slotMinutes) * settings.slotMinutes;
  const totalMin = (settings.endHour - settings.startHour) * 60;
  const clamped = Math.max(0, Math.min(totalMin - settings.slotMinutes, snapped));
  const d = new Date(day);
  d.setHours(settings.startHour, 0, 0, 0);
  d.setMinutes(d.getMinutes() + clamped);
  return d;
}

const REMINDER_CHECK_MS = 30_000;

/** Dispara os lembretes configurados (Appointment.lembretesMin) via toast
 *  enquanto o app está aberto — não existe infra de push/e-mail no projeto,
 *  então isso é deliberadamente client-side e não sobrevive a fechar a aba.
 *  `firedRef` evita repetir o mesmo toast a cada tick do intervalo. */
function useAppointmentReminders(appointments: Appointment[], byId: Map<string, Patient>) {
  const firedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const check = () => {
      const now = Date.now();
      for (const a of appointments) {
        if (a.lembretesMin.length === 0) continue;
        const start = new Date(a.dateTime).getTime();
        if (start <= now) continue;
        for (const min of a.lembretesMin) {
          const key = `${a.id}:${min}`;
          if (firedRef.current.has(key)) continue;
          if (now >= start - min * 60_000) {
            firedRef.current.add(key);
            const patient = a.patientId ? byId.get(a.patientId) : undefined;
            const label = a.label || patient?.nome || "Evento";
            toast(`Lembrete: ${label} às ${formatHourBR(a.dateTime)}`, {
              icon: <Bell className="h-4 w-4" />,
            });
          }
        }
      }
    };
    check();
    const id = setInterval(check, REMINDER_CHECK_MS);
    return () => clearInterval(id);
  }, [appointments, byId]);
}

export function AppointmentCalendar({
  token,
  patients,
  appointments,
  categories,
  calendarSettings,
  onOpenPatient,
}: {
  token: string;
  patients: Patient[];
  appointments: Appointment[];
  categories: EventCategory[];
  calendarSettings: CalendarSettings;
  onOpenPatient?: (p: Patient) => void;
}) {
  const qc = useQueryClient();
  const [view, setView] = useState<View>("semana");
  const [cursor, setCursor] = useState<Date>(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });
  // Visão "N dias" — quantidade configurável (padrão 4, como o Google
  // Agenda oferece "3 dias"/"4 dias" fixos); só client-side, não persiste.
  const [customDayCount, setCustomDayCount] = useState(4);
  const [settings, setSettingsLocal] = useState<CalendarSettings>(calendarSettings);
  // servidor é a fonte da verdade (PRO-XX) — sincroniza se mudar por fora
  // (ex.: outra aba salvando configurações diferentes).
  useEffect(() => setSettingsLocal(calendarSettings), [calendarSettings]);

  const [pending, setPending] = useState<{ patient: Patient | null; dateTime: string } | null>(
    null,
  );
  const [note, setNote] = useState("");
  const [isBloqueio, setIsBloqueio] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [selectedPatientId, setSelectedPatientId] = useState("");
  const [duracaoMin, setDuracaoMin] = useState(30);
  const [recorrenciaFreq, setRecorrenciaFreq] = useState<RecurrenceFreq>("none");
  const [vezes, setVezes] = useState(4);
  const [categoriaId, setCategoriaId] = useState<string | null>(null);
  const [corOverride, setCorOverride] = useState<string | null>(null);
  const [allDay, setAllDay] = useState(false);
  const [descricao, setDescricao] = useState("");
  const [local, setLocal] = useState("");
  const [lembretesMin, setLembretesMin] = useState<number[]>([]);

  // Editor completo (reabre em cima de evento já existente) — separado do
  // dialog de criação acima; guarda só o id pra ficar sincronizado se
  // `appointments` mudar (evita fechar em estado desatualizado).
  const [editingId, setEditingId] = useState<string | null>(null);
  const editingAppt = editingId ? (appointments.find((a) => a.id === editingId) ?? null) : null;

  // Filtro da sidebar — só visual/local, não persiste (mesmo padrão do
  // showAll do painel de biomarcadores: estado de sessão, não config salva).
  const [hiddenCategoryIds, setHiddenCategoryIds] = useState<Set<string>>(new Set());
  const [showConsultas, setShowConsultas] = useState(true);

  const salvarSettings = useMutation({
    mutationFn: (s: CalendarSettings) => saveMyCalendarSettings({ data: { token, ...s } }),
    onSuccess: (r) => {
      if (!r.ok) toast.error("Não consegui salvar as configurações da agenda.");
      qc.invalidateQueries({ queryKey: ["workspace"] });
    },
  });
  const persistSettings = (s: CalendarSettings) => {
    setSettingsLocal(s); // feedback imediato, sem esperar o roundtrip
    salvarSettings.mutate(s);
  };

  const byId = useMemo(() => new Map(patients.map((p) => [p.id, p])), [patients]);
  const categoriesById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  // Lembretes disparam pra todos os eventos, independente do filtro da
  // sidebar (hiddenCategoryIds/showConsultas é só visual do grid).
  useAppointmentReminders(appointments, byId);

  const visibleAppointments = useMemo(
    () =>
      appointments.filter((a) => {
        if (a.kind === "consulta") return showConsultas;
        return !a.categoriaId || !hiddenCategoryIds.has(a.categoriaId);
      }),
    [appointments, showConsultas, hiddenCategoryIds],
  );

  const resetDialogFields = () => {
    setNote("");
    setIsBloqueio(false);
    setMotivo("");
    setSelectedPatientId("");
    setDuracaoMin(settings.slotMinutes);
    setRecorrenciaFreq("none");
    setVezes(4);
    setCategoriaId(null);
    setCorOverride(null);
    setAllDay(false);
    setDescricao("");
    setLocal("");
    setLembretesMin([]);
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
      durationMin: number;
      allDay: boolean;
      categoriaId: string | null;
      cor: string | null;
      descricao: string | null;
      local: string | null;
      lembretesMin: number[];
      recurrence: { freq: RecurrenceFreq; count: number };
    }) =>
      scheduleAppointment({
        data: {
          token,
          patientId: v.patientId ?? undefined,
          dateTime: v.dateTime,
          note: v.note,
          kind: v.kind,
          label: v.label,
          durationMin: v.durationMin,
          allDay: v.allDay,
          categoriaId: v.categoriaId,
          cor: v.cor,
          descricao: v.descricao,
          local: v.local,
          lembretesMin: v.lembretesMin,
          recurrence: v.recurrence,
        },
      }),
    onSuccess: (r, v) => {
      if (!r.ok)
        return toast.error(
          v.kind === "bloqueio" ? "Não consegui bloquear o horário." : "Não consegui agendar.",
        );
      if (v.kind === "bloqueio") {
        toast.success("Evento pessoal criado.");
      } else {
        const nome = (
          pending?.patient?.nome ??
          byId.get(v.patientId ?? "")?.nome ??
          "Paciente"
        ).split(" ")[0];
        const criados = "appointments" in r ? (r.appointments?.length ?? 1) : 1;
        toast.success(
          criados > 1
            ? `${nome} agendado(a) ${criados}x a partir de ${new Date(v.dateTime).toLocaleDateString("pt-BR")}.`
            : `${nome} agendado(a) para ${new Date(v.dateTime).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}.`,
        );
      }
      closeDialog();
      qc.invalidateQueries({ queryKey: ["workspace"] });
    },
  });

  // Exclusão só acontece de dentro do editor completo agora (sem X inline no
  // canvas) — scope importa quando o evento faz parte de uma série.
  const excluirEvento = useMutation({
    mutationFn: (v: { id: string; scope: RecurrenceScope }) =>
      deleteMyAppointment({ data: { token, id: v.id, scope: v.scope } }),
    onSuccess: (r) => {
      if (!r.ok) return toast.error("Não consegui remover o evento.");
      toast.success(
        r.deletedCount > 1 ? `${r.deletedCount} eventos removidos.` : "Evento removido.",
      );
      setEditingId(null);
      qc.invalidateQueries({ queryKey: ["workspace"] });
    },
  });

  // Reabre o editor completo (diferente de atualizarTiming, que só cuida de
  // dateTime/durationMin via drag/resize).
  const editarEvento = useMutation({
    mutationFn: (v: {
      id: string;
      scope: RecurrenceScope;
      note?: string | null;
      label?: string | null;
      durationMin?: number | null;
      allDay?: boolean;
      categoriaId?: string | null;
      cor?: string | null;
      descricao?: string | null;
      local?: string | null;
      lembretesMin?: number[];
    }) => updateMyAppointment({ data: { token, ...v } }),
    onSuccess: (r) => {
      if (!r.ok) return toast.error("Não consegui salvar as alterações.");
      toast.success("Evento atualizado.");
      setEditingId(null);
      qc.invalidateQueries({ queryKey: ["workspace"] });
    },
  });

  // Mesma mutação serve mover (só dateTime, drag) e redimensionar (só
  // durationMin, alça na borda do bloco) — updateMyAppointmentTiming aceita
  // qualquer um dos dois independentemente.
  const atualizarTiming = useMutation({
    mutationFn: (v: { id: string; dateTime?: string; durationMin?: number }) =>
      updateMyAppointmentTiming({ data: { token, ...v } }),
    onSuccess: (r, v) => {
      if (!r.ok)
        return toast.error(
          v.durationMin !== undefined ? "Não consegui redimensionar." : "Não consegui remarcar.",
        );
      toast.success(
        v.durationMin !== undefined
          ? `Duração ajustada para ${v.durationMin}min.`
          : `Remarcado para ${new Date(r.appointment.dateTime).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}.`,
      );
      qc.invalidateQueries({ queryKey: ["workspace"] });
    },
    onError: () => toast.error("Não consegui atualizar."),
  });

  const shift = (dir: -1 | 1) => {
    const d = new Date(cursor);
    if (view === "dia" || view === "lista") d.setDate(d.getDate() + dir);
    else if (view === "semana") d.setDate(d.getDate() + dir * 7);
    else if (view === "custom") d.setDate(d.getDate() + dir * customDayCount);
    else if (view === "ano") d.setFullYear(d.getFullYear() + dir);
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
    if (view === "ano") return `${cursor.getFullYear()}`;
    if (view === "semana") {
      const s = startOfWeek(cursor);
      const e = addDays(s, 6);
      return `${s.getDate().toString().padStart(2, "0")}/${(s.getMonth() + 1).toString().padStart(2, "0")} – ${e.getDate().toString().padStart(2, "0")}/${(e.getMonth() + 1).toString().padStart(2, "0")} · ${cursor.getFullYear()}`;
    }
    if (view === "custom") {
      const e = addDays(cursor, customDayCount - 1);
      return `${cursor.getDate().toString().padStart(2, "0")}/${(cursor.getMonth() + 1).toString().padStart(2, "0")} – ${e.getDate().toString().padStart(2, "0")}/${(e.getMonth() + 1).toString().padStart(2, "0")} · ${cursor.getFullYear()}`;
    }
    if (view === "lista") {
      return `A partir de ${cursor.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" })}`;
    }
    return cursor.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" });
  }, [view, cursor, customDayCount]);

  const openConfirm = (patientId: string, dateTime: string) => {
    const p = byId.get(patientId);
    if (!p) return;
    resetDialogFields();
    setPending({ patient: p, dateTime });
  };

  const openEmptySlot = (dateTime: string, durationMin?: number) => {
    resetDialogFields();
    if (durationMin) setDuracaoMin(durationMin);
    setPending({ patient: null, dateTime });
  };

  const chosenPatientId = pending?.patient?.id ?? selectedPatientId;
  const canConfirm = isBloqueio || !!chosenPatientId;
  const effectiveCor =
    corOverride ?? (categoriaId ? (categoriesById.get(categoriaId)?.cor ?? null) : null);

  const confirmar = () => {
    if (!pending) return;
    const recurrence = { freq: recorrenciaFreq, count: recorrenciaFreq === "none" ? 0 : vezes };
    if (isBloqueio) {
      agendar.mutate({
        patientId: null,
        dateTime: pending.dateTime,
        note: null,
        kind: "bloqueio",
        label: motivo.trim() || null,
        durationMin: duracaoMin,
        allDay,
        categoriaId,
        cor: effectiveCor,
        descricao: descricao.trim() || null,
        local: local.trim() || null,
        lembretesMin,
        recurrence,
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
      durationMin: duracaoMin,
      allDay: false,
      categoriaId: null,
      cor: null,
      descricao: null,
      local: null,
      lembretesMin,
      recurrence,
    });
  };

  return (
    <div className="mt-4 flex overflow-hidden rounded-2xl border border-border bg-card">
      <CategorySidebar
        token={token}
        categories={categories}
        hiddenCategoryIds={hiddenCategoryIds}
        onToggleCategory={(id) =>
          setHiddenCategoryIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
          })
        }
        showConsultas={showConsultas}
        onToggleConsultas={setShowConsultas}
        cursor={cursor}
        onPickDate={setCursor}
        appointments={appointments}
      />

      <div className="min-w-0 flex-1">
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
            <EventSearch
              appointments={appointments}
              byId={byId}
              onJump={(appt) => {
                const d = new Date(appt.dateTime);
                d.setHours(0, 0, 0, 0);
                setCursor(d);
                setView("dia");
                setEditingId(appt.id);
              }}
            />
            <div className="flex flex-wrap rounded-lg border border-border p-0.5">
              {(["dia", "custom", "semana", "mes", "ano", "lista"] as View[]).map((v) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={`rounded-md px-2.5 py-1 text-[11px] font-medium capitalize transition ${
                    view === v
                      ? "bg-primary text-primary-foreground shadow"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {v === "mes" ? "mês" : v === "custom" ? `${customDayCount}d` : v}
                </button>
              ))}
            </div>
            <SettingsPopover
              settings={settings}
              onChange={persistSettings}
              customDayCount={customDayCount}
              onCustomDayCountChange={setCustomDayCount}
            />
          </div>
        </div>

        {/* Corpo */}
        <div className="p-2">
          {view === "dia" && (
            <TimeGrid
              days={[cursor]}
              settings={settings}
              appointments={visibleAppointments}
              byId={byId}
              onDropPatient={openConfirm}
              onMoveAppointment={(id, dateTime) => atualizarTiming.mutate({ id, dateTime })}
              onResizeAppointment={(id, durationMin) => atualizarTiming.mutate({ id, durationMin })}
              onOpenEditor={setEditingId}
              onSlotClick={openEmptySlot}
            />
          )}
          {view === "semana" && (
            <TimeGrid
              days={Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(cursor), i))}
              settings={settings}
              appointments={visibleAppointments}
              byId={byId}
              onDropPatient={openConfirm}
              onMoveAppointment={(id, dateTime) => atualizarTiming.mutate({ id, dateTime })}
              onResizeAppointment={(id, durationMin) => atualizarTiming.mutate({ id, durationMin })}
              onOpenEditor={setEditingId}
              onSlotClick={openEmptySlot}
            />
          )}
          {view === "custom" && (
            <TimeGrid
              days={Array.from({ length: customDayCount }, (_, i) => addDays(cursor, i))}
              settings={settings}
              appointments={visibleAppointments}
              byId={byId}
              onDropPatient={openConfirm}
              onMoveAppointment={(id, dateTime) => atualizarTiming.mutate({ id, dateTime })}
              onResizeAppointment={(id, durationMin) => atualizarTiming.mutate({ id, durationMin })}
              onOpenEditor={setEditingId}
              onSlotClick={openEmptySlot}
            />
          )}
          {view === "mes" && (
            <MonthGrid
              cursor={cursor}
              appointments={visibleAppointments}
              byId={byId}
              onPickDay={(d) => {
                setCursor(d);
                setView("dia");
              }}
            />
          )}
          {view === "ano" && (
            <YearGrid
              cursor={cursor}
              appointments={visibleAppointments}
              onPickDay={(d) => {
                setCursor(d);
                setView("dia");
              }}
              onPickMonth={(d) => {
                setCursor(d);
                setView("mes");
              }}
            />
          )}
          {view === "lista" && (
            <ListView
              cursor={cursor}
              appointments={visibleAppointments}
              byId={byId}
              onOpenEditor={setEditingId}
            />
          )}
        </div>

        <div className="border-t border-border px-3 py-2 text-[11px] text-muted-foreground">
          Dica: arraste um evento pra outro horário pra remarcar, ou puxe a borda de baixo pra mudar
          a duração. Sobreposições dividem colunas automaticamente — sem limite.
        </div>

        {/* Confirmação */}
        <Dialog open={!!pending} onOpenChange={(o) => !o && closeDialog()}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>
                {isBloqueio ? "Novo evento pessoal" : "Confirmar agendamento"}
              </DialogTitle>
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

            <div className="max-h-[60vh] space-y-3 overflow-y-auto pr-1">
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
                          <SelectItem key={p.id} value={p.id}>
                            {p.nome}
                          </SelectItem>
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
                <>
                  <div className="space-y-1">
                    <Label htmlFor="ap-motivo" className="text-xs">
                      Título
                    </Label>
                    <Input
                      id="ap-motivo"
                      value={motivo}
                      onChange={(e) => setMotivo(e.target.value)}
                      placeholder="Almoço, reunião, dentista…"
                      maxLength={80}
                    />
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs">Categoria</Label>
                    <Select
                      value={categoriaId ?? "__none"}
                      onValueChange={(v) => setCategoriaId(v === "__none" ? null : v)}
                    >
                      <SelectTrigger className="h-9 text-sm">
                        <SelectValue placeholder="Sem categoria" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none">Sem categoria</SelectItem>
                        {categories
                          .filter((c) => c.ativo)
                          .map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.nome}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs">Cor</Label>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {EVENT_COLOR_SWATCHES.map((sw) => (
                        <button
                          key={sw}
                          type="button"
                          onClick={() => setCorOverride(sw)}
                          className={`h-5 w-5 rounded-full ring-2 transition ${
                            effectiveCor === sw ? "ring-foreground" : "ring-transparent"
                          }`}
                          style={{ backgroundColor: sw }}
                          title={sw}
                        />
                      ))}
                      <input
                        type="color"
                        value={effectiveCor ?? FALLBACK_COLOR}
                        onChange={(e) => setCorOverride(e.target.value)}
                        className="h-5 w-6 cursor-pointer rounded border border-border bg-transparent p-0"
                        title="Cor personalizada"
                      />
                    </div>
                  </div>

                  <label className="flex items-center justify-between gap-2 text-xs">
                    <span>Dia inteiro</span>
                    <Switch checked={allDay} onCheckedChange={setAllDay} />
                  </label>

                  {!allDay && (
                    <div className="space-y-1">
                      <Label className="text-xs">Duração</Label>
                      <DurationSelect value={duracaoMin} onChange={setDuracaoMin} />
                    </div>
                  )}

                  <div className="space-y-1">
                    <Label htmlFor="ap-descricao" className="text-xs">
                      Descrição (opcional)
                    </Label>
                    <Textarea
                      id="ap-descricao"
                      value={descricao}
                      onChange={(e) => setDescricao(e.target.value)}
                      rows={2}
                      maxLength={2000}
                      className="text-sm"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="ap-local" className="text-xs">
                      Local (opcional)
                    </Label>
                    <Input
                      id="ap-local"
                      value={local}
                      onChange={(e) => setLocal(e.target.value)}
                      placeholder="Consultório, sala 2…"
                      maxLength={160}
                    />
                  </div>
                </>
              ) : (
                <>
                  <div className="space-y-1">
                    <Label className="text-xs">Duração</Label>
                    <DurationSelect value={duracaoMin} onChange={setDuracaoMin} />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="ap-nota" className="text-xs">
                      Observação (opcional)
                    </Label>
                    <Input
                      id="ap-nota"
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="Retorno, avaliação de exames…"
                      maxLength={200}
                    />
                  </div>
                </>
              )}

              <ReminderPicker selected={lembretesMin} onChange={setLembretesMin} />

              <RecurrencePicker
                freq={recorrenciaFreq}
                onFreqChange={setRecorrenciaFreq}
                count={vezes}
                onCountChange={setVezes}
              />
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={closeDialog}>
                Cancelar
              </Button>
              <Button
                disabled={agendar.isPending || !canConfirm}
                onClick={confirmar}
                className="brand-gradient text-primary-foreground"
              >
                {agendar.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                {isBloqueio ? "Criar evento" : "Confirmar"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {editingAppt && (
          <EventEditorDialog
            key={editingAppt.id}
            appt={editingAppt}
            patient={editingAppt.patientId ? byId.get(editingAppt.patientId) : undefined}
            categories={categories}
            onClose={() => setEditingId(null)}
            onOpenPatient={onOpenPatient}
            onSave={(patch, scope) => editarEvento.mutate({ id: editingAppt.id, scope, ...patch })}
            onDelete={(scope) => excluirEvento.mutate({ id: editingAppt.id, scope })}
            saving={editarEvento.isPending}
            deleting={excluirEvento.isPending}
          />
        )}
      </div>
    </div>
  );
}

const DURATION_OPTIONS = [15, 30, 45, 60, 90, 120];

/** Arredonda pro valor mais próximo de DURATION_OPTIONS — criar arrastando
 *  gera minutos em múltiplos do slot (15/20/30...), que nem sempre batem
 *  com um item do Select; sem isso o Select ficava sem seleção visível. */
function snapToDurationOption(min: number): number {
  return DURATION_OPTIONS.reduce((best, opt) =>
    Math.abs(opt - min) < Math.abs(best - min) ? opt : best,
  );
}

function DurationSelect({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <Select value={String(value)} onValueChange={(v) => onChange(Number(v))}>
      <SelectTrigger className="h-9 text-sm">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {DURATION_OPTIONS.map((m) => (
          <SelectItem key={m} value={String(m)}>
            {m} minutos
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Chips de múltipla seleção (igual ao menu de lembrete do Google Agenda) —
 *  disparo é só client-side (toast) enquanto o app está aberto, ver
 *  useAppointmentReminders. */
function ReminderPicker({
  selected,
  onChange,
}: {
  selected: number[];
  onChange: (v: number[]) => void;
}) {
  const set = new Set(selected);
  const toggle = (min: number) => {
    const next = new Set(set);
    if (next.has(min)) next.delete(min);
    else next.add(min);
    onChange([...next].sort((a, b) => a - b));
  };
  return (
    <div className="space-y-1">
      <Label className="flex items-center gap-1 text-xs">
        <Bell className="h-3 w-3" /> Lembretes
      </Label>
      <div className="flex flex-wrap gap-1.5">
        {REMINDER_PRESETS.map((p) => (
          <button
            key={p.minutes}
            type="button"
            onClick={() => toggle(p.minutes)}
            className={`rounded-full border px-2 py-0.5 text-[11px] transition ${
              set.has(p.minutes)
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:border-primary/40"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>
    </div>
  );
}

const RECURRENCE_LABEL: Record<RecurrenceFreq, string> = {
  none: "Não repetir",
  daily: "Diariamente",
  weekly: "Semanalmente",
  monthly: "Mensalmente",
};

function RecurrencePicker({
  freq,
  onFreqChange,
  count,
  onCountChange,
}: {
  freq: RecurrenceFreq;
  onFreqChange: (f: RecurrenceFreq) => void;
  count: number;
  onCountChange: (n: number) => void;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">Repetir</Label>
      <Select value={freq} onValueChange={(v) => onFreqChange(v as RecurrenceFreq)}>
        <SelectTrigger className="h-9 text-sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {(Object.keys(RECURRENCE_LABEL) as RecurrenceFreq[]).map((f) => (
            <SelectItem key={f} value={f}>
              {RECURRENCE_LABEL[f]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {freq !== "none" && (
        <div className="space-y-1 pt-1">
          <Label htmlFor="ap-vezes" className="text-xs">
            Quantas vezes
          </Label>
          <Input
            id="ap-vezes"
            type="number"
            min={1}
            max={23}
            value={count}
            onChange={(e) => onCountChange(Math.max(1, Math.min(23, Number(e.target.value) || 1)))}
          />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Editor completo — reabre em cima de um evento já existente (canvas dia/
// semana ou lista). Diferente do dialog de criação: nunca navega direto pro
// prontuário (isso agora é um botão dedicado "Ver prontuário" dentro do
// próprio editor) e é o único lugar de onde dá pra excluir (sem X inline).

type EditPatch = {
  note?: string | null;
  label?: string | null;
  durationMin?: number | null;
  allDay?: boolean;
  categoriaId?: string | null;
  cor?: string | null;
  descricao?: string | null;
  local?: string | null;
  lembretesMin?: number[];
};

function EventEditorDialog({
  appt,
  patient,
  categories,
  onClose,
  onOpenPatient,
  onSave,
  onDelete,
  saving,
  deleting,
}: {
  appt: Appointment;
  patient: Patient | undefined;
  categories: EventCategory[];
  onClose: () => void;
  onOpenPatient?: (p: Patient) => void;
  onSave: (patch: EditPatch, scope: RecurrenceScope) => void;
  onDelete: (scope: RecurrenceScope) => void;
  saving: boolean;
  deleting: boolean;
}) {
  const isBloqueio = appt.kind === "bloqueio";
  const isRecurring = !!appt.recurrenceId;
  const categoriesById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);

  const [note, setNote] = useState(appt.note ?? "");
  const [label, setLabel] = useState(appt.label ?? "");
  const [duracaoMin, setDuracaoMin] = useState(appt.durationMin ?? 30);
  const [allDay, setAllDay] = useState(appt.allDay);
  const [categoriaId, setCategoriaId] = useState<string | null>(appt.categoriaId);
  const [corOverride, setCorOverride] = useState<string | null>(appt.cor);
  const [descricao, setDescricao] = useState(appt.descricao ?? "");
  const [local, setLocal] = useState(appt.local ?? "");
  const [lembretesMin, setLembretesMin] = useState<number[]>(appt.lembretesMin);
  const [scope, setScope] = useState<RecurrenceScope>("this");
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const effectiveCor =
    corOverride ?? (categoriaId ? (categoriesById.get(categoriaId)?.cor ?? null) : null);

  const salvar = () => {
    const patch: EditPatch = isBloqueio
      ? {
          label: label.trim() || null,
          allDay,
          durationMin: allDay ? null : duracaoMin,
          categoriaId,
          cor: effectiveCor,
          descricao: descricao.trim() || null,
          local: local.trim() || null,
          lembretesMin,
        }
      : {
          note: note.trim() || null,
          durationMin: duracaoMin,
          lembretesMin,
        };
    onSave(patch, scope);
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{isBloqueio ? "Editar evento pessoal" : "Editar consulta"}</DialogTitle>
          <DialogDescription>
            {new Date(appt.dateTime).toLocaleString("pt-BR", {
              weekday: "short",
              day: "2-digit",
              month: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] space-y-3 overflow-y-auto pr-1">
          {!isBloqueio && patient && (
            <div className="flex items-center justify-between gap-2 rounded-lg border border-border p-2">
              <div className="text-sm font-medium">{patient.nome}</div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 gap-1 text-xs"
                onClick={() => onOpenPatient?.(patient)}
              >
                Ver prontuário <ExternalLink className="h-3 w-3" />
              </Button>
            </div>
          )}

          {isBloqueio ? (
            <>
              <div className="space-y-1">
                <Label htmlFor="edit-titulo" className="text-xs">
                  Título
                </Label>
                <Input
                  id="edit-titulo"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  maxLength={80}
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Categoria</Label>
                <Select
                  value={categoriaId ?? "__none"}
                  onValueChange={(v) => setCategoriaId(v === "__none" ? null : v)}
                >
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="Sem categoria" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">Sem categoria</SelectItem>
                    {categories
                      .filter((c) => c.ativo)
                      .map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.nome}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Cor</Label>
                <div className="flex flex-wrap items-center gap-1.5">
                  {EVENT_COLOR_SWATCHES.map((sw) => (
                    <button
                      key={sw}
                      type="button"
                      onClick={() => setCorOverride(sw)}
                      className={`h-5 w-5 rounded-full ring-2 transition ${
                        effectiveCor === sw ? "ring-foreground" : "ring-transparent"
                      }`}
                      style={{ backgroundColor: sw }}
                      title={sw}
                    />
                  ))}
                  <input
                    type="color"
                    value={effectiveCor ?? FALLBACK_COLOR}
                    onChange={(e) => setCorOverride(e.target.value)}
                    className="h-5 w-6 cursor-pointer rounded border border-border bg-transparent p-0"
                    title="Cor personalizada"
                  />
                </div>
              </div>

              <label className="flex items-center justify-between gap-2 text-xs">
                <span>Dia inteiro</span>
                <Switch checked={allDay} onCheckedChange={setAllDay} />
              </label>

              {!allDay && (
                <div className="space-y-1">
                  <Label className="text-xs">Duração</Label>
                  <DurationSelect value={duracaoMin} onChange={setDuracaoMin} />
                </div>
              )}

              <div className="space-y-1">
                <Label htmlFor="edit-descricao" className="text-xs">
                  Descrição (opcional)
                </Label>
                <Textarea
                  id="edit-descricao"
                  value={descricao}
                  onChange={(e) => setDescricao(e.target.value)}
                  rows={2}
                  maxLength={2000}
                  className="text-sm"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="edit-local" className="text-xs">
                  Local (opcional)
                </Label>
                <Input
                  id="edit-local"
                  value={local}
                  onChange={(e) => setLocal(e.target.value)}
                  maxLength={160}
                />
              </div>
            </>
          ) : (
            <>
              <div className="space-y-1">
                <Label className="text-xs">Duração</Label>
                <DurationSelect value={duracaoMin} onChange={setDuracaoMin} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="edit-nota" className="text-xs">
                  Observação (opcional)
                </Label>
                <Input
                  id="edit-nota"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  maxLength={200}
                />
              </div>
            </>
          )}

          <ReminderPicker selected={lembretesMin} onChange={setLembretesMin} />

          {isRecurring && (
            <div className="space-y-1 rounded-lg border border-border p-2">
              <Label className="text-xs">Esta consulta faz parte de uma série. Aplicar a:</Label>
              <Select value={scope} onValueChange={(v) => setScope(v as RecurrenceScope)}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="this">Esta ocorrência</SelectItem>
                  <SelectItem value="following">Esta e as seguintes</SelectItem>
                  <SelectItem value="all">Todas as ocorrências</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {confirmingDelete && (
            <div className="space-y-2 rounded-lg border border-destructive/40 bg-destructive/5 p-2">
              <div className="text-xs text-destructive">
                {isRecurring
                  ? "Excluir de acordo com o escopo selecionado acima?"
                  : "Excluir este evento? Essa ação não pode ser desfeita."}
              </div>
              <div className="flex gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 flex-1 text-xs"
                  onClick={() => setConfirmingDelete(false)}
                >
                  Cancelar
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  className="h-7 flex-1 text-xs"
                  disabled={deleting}
                  onClick={() => onDelete(scope)}
                >
                  {deleting && <Loader2 className="mr-1 h-3 w-3 animate-spin" />} Confirmar exclusão
                </Button>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="flex-row items-center sm:justify-between">
          <Button
            type="button"
            variant="ghost"
            className="gap-1.5 text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={() => setConfirmingDelete(true)}
            disabled={confirmingDelete}
          >
            <Trash2 className="h-4 w-4" /> Excluir
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              disabled={saving}
              onClick={salvar}
              className="brand-gradient text-primary-foreground"
            >
              {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} Salvar
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Sidebar — mini-calendário pra navegação rápida + lista de categorias com
// checkbox (mostra/esconde no grid; "Consultas" é um pseudo-toggle fixo, não
// uma EventCategory de verdade, só pra manter a mesma interação de checkbox
// por "agenda" que o Google Agenda usa em tudo). Colapsa em telas estreitas.

function CategorySidebar({
  token,
  categories,
  hiddenCategoryIds,
  onToggleCategory,
  showConsultas,
  onToggleConsultas,
  cursor,
  onPickDate,
  appointments,
}: {
  token: string;
  categories: EventCategory[];
  hiddenCategoryIds: Set<string>;
  onToggleCategory: (id: string) => void;
  showConsultas: boolean;
  onToggleConsultas: (v: boolean) => void;
  cursor: Date;
  onPickDate: (d: Date) => void;
  appointments: Appointment[];
}) {
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [nome, setNome] = useState("");
  const [cor, setCor] = useState<string>(EVENT_COLOR_SWATCHES[0]);

  const criar = useMutation({
    mutationFn: () => createMyCategory({ data: { token, nome, cor } }),
    onSuccess: (r) => {
      if (!r.ok) return toast.error("Não consegui criar a categoria.");
      toast.success("Categoria criada.");
      setNome("");
      setCor(EVENT_COLOR_SWATCHES[0]);
      setCreating(false);
      qc.invalidateQueries({ queryKey: ["workspace"] });
    },
  });

  return (
    <aside className="hidden w-52 shrink-0 border-r border-border p-3 lg:block">
      <MiniMonthPicker cursor={cursor} onPick={onPickDate} appointments={appointments} />

      <div className="mt-4 space-y-0.5">
        <div className="px-0.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Agendas
        </div>
        <label className="flex cursor-pointer items-center gap-2 rounded px-0.5 py-1 text-xs hover:bg-muted/50">
          <input
            type="checkbox"
            checked={showConsultas}
            onChange={(e) => onToggleConsultas(e.target.checked)}
            className="h-3.5 w-3.5 rounded accent-primary"
          />
          <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-primary" />
          <span className="truncate">Consultas</span>
        </label>
        {categories
          .filter((c) => c.ativo)
          .map((c) => (
            <label
              key={c.id}
              className="flex cursor-pointer items-center gap-2 rounded px-0.5 py-1 text-xs hover:bg-muted/50"
            >
              <input
                type="checkbox"
                checked={!hiddenCategoryIds.has(c.id)}
                onChange={() => onToggleCategory(c.id)}
                className="h-3.5 w-3.5 rounded accent-primary"
              />
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: c.cor }}
              />
              <span className="truncate">{c.nome}</span>
            </label>
          ))}
      </div>

      {creating ? (
        <div className="mt-2 space-y-1.5 rounded-lg border border-border p-2">
          <Input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Nome da categoria"
            className="h-7 text-xs"
            maxLength={40}
            autoFocus
          />
          <div className="flex flex-wrap gap-1">
            {EVENT_COLOR_SWATCHES.map((sw) => (
              <button
                key={sw}
                type="button"
                onClick={() => setCor(sw)}
                className={`h-5 w-5 rounded-full ring-2 transition ${cor === sw ? "ring-foreground" : "ring-transparent"}`}
                style={{ backgroundColor: sw }}
              />
            ))}
          </div>
          <div className="flex gap-1">
            <Button
              size="sm"
              variant="outline"
              className="h-6 flex-1 text-[11px]"
              onClick={() => setCreating(false)}
            >
              Cancelar
            </Button>
            <Button
              size="sm"
              className="h-6 flex-1 text-[11px]"
              disabled={nome.trim().length < 2 || criar.isPending}
              onClick={() => criar.mutate()}
            >
              Salvar
            </Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="mt-2 flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
        >
          <Plus className="h-3 w-3" /> Nova categoria
        </button>
      )}
    </aside>
  );
}

function MiniMonthPicker({
  cursor,
  onPick,
  appointments,
}: {
  cursor: Date;
  onPick: (d: Date) => void;
  appointments: Appointment[];
}) {
  const [miniCursor, setMiniCursor] = useState(cursor);
  const first = new Date(miniCursor.getFullYear(), miniCursor.getMonth(), 1);
  const start = startOfWeek(first);
  const days = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  const todayKey = ymd(new Date());
  const selectedKey = ymd(cursor);

  // Densidade — só conta quantos eventos caem no dia, sem diferenciar tipo
  // (o filtro de tipo já existe na lista de categorias logo abaixo).
  const countByDay = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of appointments) {
      const k = ymd(new Date(a.dateTime));
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return m;
  }, [appointments]);

  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold">
          {MONTHS[miniCursor.getMonth()]} {miniCursor.getFullYear()}
        </span>
        <div className="flex gap-0.5">
          <button
            type="button"
            onClick={() =>
              setMiniCursor(new Date(miniCursor.getFullYear(), miniCursor.getMonth() - 1, 1))
            }
            className="rounded p-0.5 text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() =>
              setMiniCursor(new Date(miniCursor.getFullYear(), miniCursor.getMonth() + 1, 1))
            }
            className="rounded p-0.5 text-muted-foreground hover:text-foreground"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <div className="mt-1 grid grid-cols-7 gap-0.5 text-center text-[9px] text-muted-foreground">
        {WEEKDAYS_SHORT.map((d) => (
          <div key={d}>{d[0]}</div>
        ))}
      </div>
      <div className="mt-0.5 grid grid-cols-7 gap-0.5">
        {days.map((d) => {
          const inMonth = d.getMonth() === miniCursor.getMonth();
          const isToday = ymd(d) === todayKey;
          const isSelected = ymd(d) === selectedKey;
          const count = countByDay.get(ymd(d)) ?? 0;
          return (
            <button
              key={ymd(d)}
              type="button"
              onClick={() => onPick(d)}
              className={`relative rounded-full py-0.5 text-[10px] transition hover:bg-primary/10 ${
                isSelected
                  ? "bg-primary text-primary-foreground hover:bg-primary"
                  : isToday
                    ? "font-semibold text-primary"
                    : inMonth
                      ? "text-foreground"
                      : "text-muted-foreground/40"
              }`}
            >
              {d.getDate()}
              {inMonth && count > 0 && (
                <span className="absolute inset-x-0 -bottom-0.5 flex justify-center gap-px">
                  {Array.from({ length: Math.min(3, count) }, (_, i) => (
                    <span
                      key={i}
                      className={`h-[3px] w-[3px] rounded-full ${isSelected ? "bg-primary-foreground" : "bg-primary"}`}
                    />
                  ))}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Busca global — texto livre (paciente, título, descrição, local, obs.) +
// filtro por tipo. Resultado clicável pula o cursor pro dia do evento, troca
// pra visão Dia e já abre o editor completo (mesmo caminho de EventBlock).

const DIACRITICS_RE = /[̀-ͯ]/g;

function normalizeForSearch(s: string): string {
  return s.normalize("NFD").replace(DIACRITICS_RE, "").toLowerCase();
}

type SearchKindFilter = "todos" | "consulta" | "bloqueio";
const SEARCH_KIND_LABEL: Record<SearchKindFilter, string> = {
  todos: "Todos",
  consulta: "Consultas",
  bloqueio: "Pessoal",
};

function EventSearch({
  appointments,
  byId,
  onJump,
}: {
  appointments: Appointment[];
  byId: Map<string, Patient>;
  onJump: (appt: Appointment) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [kindFilter, setKindFilter] = useState<SearchKindFilter>("todos");

  const results = useMemo(() => {
    const q = normalizeForSearch(query.trim());
    if (q.length < 2) return [];
    return appointments
      .filter((a) => kindFilter === "todos" || a.kind === kindFilter)
      .filter((a) => {
        const patient = a.patientId ? byId.get(a.patientId) : undefined;
        const haystack = normalizeForSearch(
          [a.label, patient?.nome, a.descricao, a.local, a.note].filter(Boolean).join(" "),
        );
        return haystack.includes(q);
      })
      .sort((a, b) => a.dateTime.localeCompare(b.dateTime))
      .slice(0, 8);
  }, [appointments, byId, query, kindFilter]);

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setQuery("");
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex h-7 items-center gap-1.5 rounded-lg border border-border px-2 text-[11px] text-muted-foreground transition hover:text-foreground"
        >
          <Search className="h-3.5 w-3.5" /> Buscar
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 space-y-2 p-2" align="start">
        <Input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Paciente, título, descrição, local…"
          className="h-8 text-sm"
        />
        <div className="flex gap-1">
          {(Object.keys(SEARCH_KIND_LABEL) as SearchKindFilter[]).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setKindFilter(k)}
              className={`rounded-full border px-2 py-0.5 text-[10px] transition ${
                kindFilter === k
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:border-primary/40"
              }`}
            >
              {SEARCH_KIND_LABEL[k]}
            </button>
          ))}
        </div>
        <div className="max-h-64 space-y-1 overflow-y-auto">
          {query.trim().length < 2 ? (
            <div className="p-2 text-center text-xs text-muted-foreground">
              Digite ao menos 2 letras.
            </div>
          ) : results.length === 0 ? (
            <div className="p-2 text-center text-xs text-muted-foreground">Nada encontrado.</div>
          ) : (
            results.map((a) => {
              const patient = a.patientId ? byId.get(a.patientId) : undefined;
              const label = a.label || patient?.nome || "Evento";
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => {
                    onJump(a);
                    setOpen(false);
                    setQuery("");
                  }}
                  className="flex w-full items-center gap-2 rounded-md border-l-4 bg-muted/30 px-2 py-1.5 text-left text-xs transition hover:bg-muted/60"
                  style={{ borderLeftColor: resolveApptColor(a, byId) }}
                >
                  <span className="w-20 shrink-0 tabular-nums text-muted-foreground">
                    {new Date(a.dateTime).toLocaleDateString("pt-BR", {
                      day: "2-digit",
                      month: "2-digit",
                    })}{" "}
                    · {formatHourBR(a.dateTime)}
                  </span>
                  <span className="truncate font-medium">{label}</span>
                </button>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ---------------------------------------------------------------------------

function SettingsPopover({
  settings,
  onChange,
  customDayCount,
  onCustomDayCountChange,
}: {
  settings: CalendarSettings;
  onChange: (s: CalendarSettings) => void;
  customDayCount: number;
  onCustomDayCountChange: (n: number) => void;
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
            onValueChange={(v) =>
              onChange({ ...settings, slotMinutes: Number(v) as CalendarSettings["slotMinutes"] })
            }
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[15, 20, 30, 45, 60].map((m) => (
                <SelectItem key={m} value={String(m)}>
                  {m} minutos
                </SelectItem>
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
        <div className="space-y-1">
          <Label className="text-[11px]">Dias exibidos (visão "N dias")</Label>
          <Input
            type="number"
            min={2}
            max={14}
            value={customDayCount}
            onChange={(e) =>
              onCustomDayCountChange(Math.max(2, Math.min(14, Number(e.target.value) || 4)))
            }
            className="h-8 text-xs"
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ---------------------------------------------------------------------------
// Canvas contínuo — dia/semana. Cada DayColumn é um canvas relativo de altura
// fixa (px por minuto); blocos são posicionados absolutamente por
// top/height/left/width — sem grid CSS de linha fixa.

type Tick = { hour: number; minute: number; isHour: boolean };

function TimeGrid({
  days,
  settings,
  appointments,
  byId,
  onDropPatient,
  onMoveAppointment,
  onResizeAppointment,
  onOpenEditor,
  onSlotClick,
}: {
  days: Date[];
  settings: CalendarSettings;
  appointments: Appointment[];
  byId: Map<string, Patient>;
  onDropPatient: (patientId: string, dateTime: string) => void;
  onMoveAppointment: (appointmentId: string, dateTime: string) => void;
  onResizeAppointment: (appointmentId: string, durationMin: number) => void;
  onOpenEditor: (id: string) => void;
  onSlotClick: (dateTime: string, durationMin?: number) => void;
}) {
  const ticks = useMemo(() => {
    const arr: Tick[] = [];
    for (let h = settings.startHour; h < settings.endHour; h++) {
      for (let m = 0; m < 60; m += settings.slotMinutes)
        arr.push({ hour: h, minute: m, isHour: m === 0 });
    }
    return arr;
  }, [settings.startHour, settings.endHour, settings.slotMinutes]);

  const canvasHeightPx = (settings.endHour - settings.startHour) * 60 * PX_PER_MIN;

  const { timedByDay, allDayByDay } = useMemo(() => {
    const timed = new Map<string, Appointment[]>();
    const allDay = new Map<string, Appointment[]>();
    for (const a of appointments) {
      const key = ymd(new Date(a.dateTime));
      const target = a.allDay ? allDay : timed;
      target.set(key, [...(target.get(key) ?? []), a]);
    }
    return { timedByDay: timed, allDayByDay: allDay };
  }, [appointments]);

  const hasAllDay = days.some((d) => (allDayByDay.get(ymd(d))?.length ?? 0) > 0);
  const todayKey = ymd(new Date());

  return (
    <div className="overflow-x-auto">
      <div className="flex min-w-[560px]">
        <div className="w-14 shrink-0" />
        {days.map((d) => {
          const isToday = ymd(d) === todayKey;
          return (
            <div
              key={ymd(d)}
              className={`flex-1 min-w-[120px] border-l border-border px-2 py-1.5 text-center text-[11px] ${
                isToday ? "text-primary font-semibold" : "text-muted-foreground"
              }`}
            >
              <div>{WEEKDAYS_SHORT[d.getDay()]}</div>
              <div className="text-sm">{d.getDate().toString().padStart(2, "0")}</div>
            </div>
          );
        })}
      </div>

      {hasAllDay && (
        <div className="flex min-w-[560px] border-t border-border">
          <div className="flex w-14 shrink-0 items-center justify-end pr-1.5 text-[9px] text-muted-foreground">
            dia todo
          </div>
          {days.map((d) => (
            <AllDayCell
              key={ymd(d)}
              appts={allDayByDay.get(ymd(d)) ?? []}
              byId={byId}
              onOpenEditor={onOpenEditor}
            />
          ))}
        </div>
      )}

      <div className="flex min-w-[560px] border-t border-border">
        <TimeGutter ticks={ticks} settings={settings} />
        {days.map((d) => (
          <DayColumn
            key={ymd(d)}
            day={d}
            isToday={ymd(d) === todayKey}
            settings={settings}
            timedAppts={timedByDay.get(ymd(d)) ?? []}
            byId={byId}
            ticks={ticks}
            canvasHeightPx={canvasHeightPx}
            onDropPatient={onDropPatient}
            onMoveAppointment={onMoveAppointment}
            onResizeAppointment={onResizeAppointment}
            onOpenEditor={onOpenEditor}
            onSlotClick={onSlotClick}
          />
        ))}
      </div>
    </div>
  );
}

function TimeGutter({ ticks, settings }: { ticks: Tick[]; settings: CalendarSettings }) {
  return (
    <div className="relative w-14 shrink-0">
      {ticks
        .filter((t) => t.isHour)
        .map((t) => (
          <div
            key={t.hour}
            className="absolute right-1.5 -translate-y-1/2 text-[10px] tabular-nums text-muted-foreground"
            style={{ top: (t.hour - settings.startHour) * 60 * PX_PER_MIN }}
          >
            {String(t.hour).padStart(2, "0")}:00
          </div>
        ))}
    </div>
  );
}

function AllDayCell({
  appts,
  byId,
  onOpenEditor,
}: {
  appts: Appointment[];
  byId: Map<string, Patient>;
  onOpenEditor: (id: string) => void;
}) {
  return (
    <div className="min-w-[120px] flex-1 space-y-0.5 border-l border-border p-0.5">
      {appts.map((a) => {
        const patient = a.patientId ? byId.get(a.patientId) : undefined;
        const color =
          a.kind === "bloqueio"
            ? (a.cor ?? FALLBACK_COLOR)
            : (TINT_TO_HEX[patient?.tint ?? ""] ?? FALLBACK_COLOR);
        return (
          <div
            key={a.id}
            onClick={(e) => {
              e.stopPropagation();
              onOpenEditor(a.id);
            }}
            className={`flex cursor-pointer items-center gap-1 truncate rounded px-1.5 py-0.5 text-[10px] font-medium text-white ${isPastAppt(a) ? "opacity-50" : ""}`}
            style={{ backgroundColor: color }}
            title={a.label ?? patient?.nome ?? ""}
          >
            {a.kind === "bloqueio" && <Lock className="h-2.5 w-2.5 shrink-0" />}
            <span className="truncate">{a.label || patient?.nome || "Evento"}</span>
          </div>
        );
      })}
    </div>
  );
}

function DayColumn({
  day,
  isToday,
  settings,
  timedAppts,
  byId,
  ticks,
  canvasHeightPx,
  onDropPatient,
  onMoveAppointment,
  onResizeAppointment,
  onOpenEditor,
  onSlotClick,
}: {
  day: Date;
  isToday: boolean;
  settings: CalendarSettings;
  timedAppts: Appointment[];
  byId: Map<string, Patient>;
  ticks: Tick[];
  canvasHeightPx: number;
  onDropPatient: (patientId: string, dateTime: string) => void;
  onMoveAppointment: (appointmentId: string, dateTime: string) => void;
  onResizeAppointment: (appointmentId: string, durationMin: number) => void;
  onOpenEditor: (id: string) => void;
  onSlotClick: (dateTime: string, durationMin?: number) => void;
}) {
  const colRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState(false);
  // Criar arrastando: clique simples (delta abaixo do limiar) cria com
  // duração default; arrastar desenha a duração ao vivo, snapada ao slot.
  const [dragCreate, setDragCreate] = useState<{ startY: number; currentY: number } | null>(null);
  const layouted = useMemo(() => layoutTimedAppointments(timedAppts), [timedAppts]);

  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const nowWithinHours =
    isToday && nowMin >= settings.startHour * 60 && nowMin < settings.endHour * 60;
  const nowTop = (nowMin - settings.startHour * 60) * PX_PER_MIN;

  const resolveDrop = (e: React.DragEvent): Date | null => {
    if (!colRef.current) return null;
    return timeFromClientY(colRef.current, e.clientY, day, settings);
  };

  const dragPreview = useMemo(() => {
    if (!dragCreate || !colRef.current) return null;
    const rect = colRef.current.getBoundingClientRect();
    const top = Math.min(dragCreate.startY, dragCreate.currentY) - rect.top;
    const height = Math.max(Math.abs(dragCreate.currentY - dragCreate.startY), MIN_BLOCK_PX);
    return { top: Math.max(0, top), height };
  }, [dragCreate]);

  return (
    <div
      ref={colRef}
      className={`relative min-w-[120px] flex-1 border-l border-border transition ${hover ? "bg-primary/5" : ""}`}
      style={{ height: canvasHeightPx }}
      onDragOver={(e) => {
        const candidate = resolveDrop(e);
        if (!candidate || bloqueioAt(timedAppts, candidate)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        setHover(true);
      }}
      onDragLeave={() => setHover(false)}
      onDrop={(e) => {
        setHover(false);
        const candidate = resolveDrop(e);
        if (!candidate || bloqueioAt(timedAppts, candidate)) return;
        const iso = toIsoLocal(candidate);
        const apptId = e.dataTransfer.getData(DRAG_APPT);
        if (apptId) {
          onMoveAppointment(apptId, iso);
          return;
        }
        const patientId = e.dataTransfer.getData(DRAG_KEY) || e.dataTransfer.getData("text/plain");
        if (patientId) onDropPatient(patientId, iso);
      }}
      onPointerDown={(e) => {
        if (e.target !== colRef.current || !colRef.current) return; // ignora cliques vindos de um bloco
        if (e.button !== 0) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        setDragCreate({ startY: e.clientY, currentY: e.clientY });
      }}
      onPointerMove={(e) => {
        if (!dragCreate) return;
        setDragCreate((prev) => (prev ? { ...prev, currentY: e.clientY } : prev));
      }}
      onPointerUp={(e) => {
        if (!dragCreate || !colRef.current) return;
        const deltaPx = Math.abs(e.clientY - dragCreate.startY);
        const dragThresholdPx = settings.slotMinutes * PX_PER_MIN * 0.6;
        const startY = Math.min(dragCreate.startY, e.clientY);
        setDragCreate(null);
        const startCandidate = timeFromClientY(colRef.current, startY, day, settings);
        if (deltaPx < dragThresholdPx) {
          onSlotClick(toIsoLocal(startCandidate)); // clique simples — duração default
          return;
        }
        const rawMin = deltaPx / PX_PER_MIN;
        const snappedMin = Math.max(
          settings.slotMinutes,
          Math.round(rawMin / settings.slotMinutes) * settings.slotMinutes,
        );
        onSlotClick(toIsoLocal(startCandidate), snapToDurationOption(snappedMin));
      }}
    >
      {ticks.map((t, i) => (
        <div
          key={i}
          className={`pointer-events-none absolute inset-x-0 border-t ${t.isHour ? "border-border" : "border-border/40"}`}
          style={{ top: (t.hour - settings.startHour) * 60 * PX_PER_MIN + t.minute * PX_PER_MIN }}
        />
      ))}

      {nowWithinHours && (
        <div
          className="pointer-events-none absolute inset-x-0 z-10 flex items-center"
          style={{ top: nowTop }}
        >
          <span className="-ml-[3px] h-2 w-2 shrink-0 rounded-full bg-red-500" />
          <span className="h-px w-full bg-red-500" />
        </div>
      )}

      {dragPreview && (
        <div
          className="pointer-events-none absolute inset-x-1 z-10 rounded-md border-2 border-dashed border-primary bg-primary/10"
          style={{ top: dragPreview.top, height: dragPreview.height }}
        />
      )}

      {layouted.map(({ appt, col, totalCols, startMin, durationMin }) => (
        <EventBlock
          key={appt.id}
          appt={appt}
          patient={appt.patientId ? byId.get(appt.patientId) : undefined}
          top={(startMin - settings.startHour * 60) * PX_PER_MIN}
          height={Math.max(durationMin * PX_PER_MIN, MIN_BLOCK_PX)}
          col={col}
          totalCols={totalCols}
          slotMinutes={settings.slotMinutes}
          onOpenEditor={onOpenEditor}
          onResize={onResizeAppointment}
        />
      ))}
    </div>
  );
}

function EventBlock({
  appt,
  patient,
  top,
  height,
  col,
  totalCols,
  slotMinutes,
  onOpenEditor,
  onResize,
}: {
  appt: Appointment;
  patient: Patient | undefined;
  top: number;
  height: number;
  col: number;
  totalCols: number;
  slotMinutes: number;
  onOpenEditor: (id: string) => void;
  onResize: (id: string, durationMin: number) => void;
}) {
  const [resizeDeltaPx, setResizeDeltaPx] = useState<number | null>(null);
  const startYRef = useRef(0);
  const baseDuration = appt.durationMin ?? 30;
  const isBloqueio = appt.kind === "bloqueio";
  const color = isBloqueio
    ? (appt.cor ?? FALLBACK_COLOR)
    : (TINT_TO_HEX[patient?.tint ?? ""] ?? FALLBACK_COLOR);
  const displayHeight =
    resizeDeltaPx !== null ? Math.max(MIN_BLOCK_PX, height + resizeDeltaPx) : height;
  const widthPct = 100 / totalCols;
  const gutterPx = 2;

  return (
    <div
      draggable={!isBloqueio}
      onDragStart={(e) => {
        e.dataTransfer.setData(DRAG_APPT, appt.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      onClick={(e) => {
        e.stopPropagation();
        onOpenEditor(appt.id);
      }}
      title={
        isBloqueio
          ? `${appt.label || "Bloqueado"} — clique pra editar`
          : `${patient?.nome ?? ""} · ${formatHourBR(appt.dateTime)}${appt.note ? ` · ${appt.note}` : ""} — clique pra editar, arraste pra remarcar, puxe a borda de baixo pra mudar a duração`
      }
      className={`group absolute cursor-pointer overflow-hidden rounded-md px-1.5 py-1 text-[10px] leading-tight transition ${
        isBloqueio ? "bg-slate-200 dark:bg-slate-800/70" : "active:cursor-grabbing"
      } ${isPastAppt(appt) ? "opacity-50" : ""}`}
      style={{
        top,
        height: displayHeight,
        left: `calc(${col * widthPct}% + ${gutterPx}px)`,
        width: `calc(${widthPct}% - ${gutterPx * 2}px)`,
        ...(isBloqueio
          ? {}
          : { backgroundColor: hexToRgba(color, 0.14), borderLeft: `3px solid ${color}` }),
      }}
    >
      {isBloqueio ? (
        <div className="flex h-full items-start gap-1">
          <Lock className="mt-0.5 h-2.5 w-2.5 shrink-0 text-slate-500 dark:text-slate-400" />
          <span className="min-w-0 flex-1 truncate font-medium text-slate-600 dark:text-slate-300">
            {appt.label || "Bloqueado"}
          </span>
        </div>
      ) : (
        patient && (
          <div className="flex items-center gap-1 font-medium text-foreground">
            <span className="shrink-0 text-[9px] opacity-70">{initialsOf(patient.nome)}</span>
            <span className="truncate">{patient.nome.split(" ")[0]}</span>
            <span className="ml-auto shrink-0 text-[9px] font-normal text-muted-foreground">
              {formatHourBR(appt.dateTime)}
            </span>
          </div>
        )
      )}

      {!isBloqueio && (
        <div
          onPointerDown={(e) => {
            e.stopPropagation();
            e.preventDefault();
            e.currentTarget.setPointerCapture(e.pointerId);
            startYRef.current = e.clientY;
            setResizeDeltaPx(0);
          }}
          onPointerMove={(e) => {
            if (resizeDeltaPx === null) return;
            setResizeDeltaPx(e.clientY - startYRef.current);
          }}
          onPointerUp={() => {
            if (resizeDeltaPx === null) return;
            const deltaMin = resizeDeltaPx / PX_PER_MIN;
            const snapped = Math.max(
              slotMinutes,
              Math.round((baseDuration + deltaMin) / slotMinutes) * slotMinutes,
            );
            setResizeDeltaPx(null);
            if (snapped !== baseDuration) onResize(appt.id, snapped);
          }}
          className="absolute inset-x-0 bottom-0 h-1.5 cursor-ns-resize opacity-0 group-hover:opacity-100"
          style={{ backgroundColor: color }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Visão Lista — cronológica a partir do cursor, agrupada por dia, sobre o
// mesmo visibleAppointments já filtrado (sem paginação/fetch novo).

function ListView({
  cursor,
  appointments,
  byId,
  onOpenEditor,
}: {
  cursor: Date;
  appointments: Appointment[];
  byId: Map<string, Patient>;
  onOpenEditor: (id: string) => void;
}) {
  const cursorKey = ymd(cursor);

  const grouped = useMemo(() => {
    const upcoming = appointments
      .filter((a) => ymd(new Date(a.dateTime)) >= cursorKey)
      .sort((a, b) => a.dateTime.localeCompare(b.dateTime));
    const byDay = new Map<string, Appointment[]>();
    for (const a of upcoming) {
      const k = ymd(new Date(a.dateTime));
      byDay.set(k, [...(byDay.get(k) ?? []), a]);
    }
    return [...byDay.entries()];
  }, [appointments, cursorKey]);

  if (grouped.length === 0) {
    return (
      <div className="p-6 text-center text-sm text-muted-foreground">
        Nenhum evento a partir desta data.
      </div>
    );
  }

  return (
    <div className="divide-y divide-border">
      {grouped.map(([dayKey, dayAppts]) => (
        <div key={dayKey} className="py-2">
          <div className="px-2 pb-1 text-xs font-semibold capitalize text-muted-foreground">
            {fromYmd(dayKey).toLocaleDateString("pt-BR", {
              weekday: "long",
              day: "2-digit",
              month: "long",
            })}
          </div>
          <div className="space-y-1">
            {dayAppts.map((a) => {
              const patient = a.patientId ? byId.get(a.patientId) : undefined;
              const label = a.label || patient?.nome || "Evento";
              return (
                <div
                  key={a.id}
                  onClick={() => onOpenEditor(a.id)}
                  className={`flex cursor-pointer items-center gap-2 rounded-md border-l-4 bg-muted/30 px-2 py-1.5 text-xs hover:bg-muted/60 ${isPastAppt(a) ? "opacity-50" : ""}`}
                  style={{ borderLeftColor: resolveApptColor(a, byId) }}
                >
                  <span className="w-14 shrink-0 tabular-nums text-muted-foreground">
                    {a.allDay ? "Dia todo" : formatHourBR(a.dateTime)}
                  </span>
                  <span className="truncate font-medium">{label}</span>
                  {a.kind === "bloqueio" && (
                    <Lock className="ml-auto h-3 w-3 shrink-0 text-muted-foreground" />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

const MONTH_CHIP_ROW_PX = 15; // altura aproximada de 1 chip (linha + gap de 2px)
const MONTH_DAY_HEADER_PX = 20; // espaço do número do dia + padding da célula
const MONTH_WEEK_ROWS = 6;

function MonthGrid({
  cursor,
  appointments,
  byId,
  onPickDay,
}: {
  cursor: Date;
  appointments: Appointment[];
  byId: Map<string, Patient>;
  onPickDay: (d: Date) => void;
}) {
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const start = startOfWeek(first);
  const days = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  const todayKey = ymd(new Date());

  const gridRef = useRef<HTMLDivElement>(null);
  // Densidade dinâmica — mede a altura real disponível por semana e calcula
  // quantos chips cabem antes de colapsar em "+N mais" (nunca menos de 1).
  // Dia/semana nunca colapsam (ver backlog); só o mês tem esse comportamento.
  const [chipCapacity, setChipCapacity] = useState(3);
  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const measure = () => {
      const rowHeight = el.clientHeight / MONTH_WEEK_ROWS;
      const capacity = Math.floor((rowHeight - MONTH_DAY_HEADER_PX) / MONTH_CHIP_ROW_PX);
      setChipCapacity(Math.max(1, capacity));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const perDay = useMemo(() => {
    const m = new Map<string, Appointment[]>();
    for (const a of appointments) {
      const k = ymd(new Date(a.dateTime));
      m.set(k, [...(m.get(k) ?? []), a]);
    }
    return m;
  }, [appointments]);

  return (
    <div>
      <div className="grid grid-cols-7 gap-px bg-border text-[10px] font-medium uppercase text-muted-foreground">
        {WEEKDAYS_SHORT.map((d) => (
          <div key={d} className="bg-card px-2 py-1 text-center">
            {d}
          </div>
        ))}
      </div>
      <div
        ref={gridRef}
        className="grid grid-cols-7 auto-rows-fr gap-px bg-border"
        style={{ minHeight: 560 }}
      >
        {days.map((d) => {
          const inMonth = d.getMonth() === cursor.getMonth();
          const dayAppts = perDay.get(ymd(d)) ?? [];
          const shown = dayAppts.slice(0, chipCapacity);
          const overflow = dayAppts.length - shown.length;
          const isToday = ymd(d) === todayKey;
          return (
            <button
              key={ymd(d)}
              onClick={() => onPickDay(d)}
              className={`flex flex-col items-start gap-0.5 bg-card p-1.5 text-left transition hover:bg-primary/5 ${
                inMonth ? "" : "opacity-40"
              }`}
            >
              <span className={`text-xs font-semibold ${isToday ? "text-primary" : ""}`}>
                {d.getDate()}
              </span>
              <div className="flex w-full flex-col gap-0.5">
                {shown.map((a) => {
                  const patient = a.patientId ? byId.get(a.patientId) : undefined;
                  const label = a.label || patient?.nome || "Evento";
                  return (
                    <span
                      key={a.id}
                      className="w-full truncate rounded px-1 py-0.5 text-[9px] font-medium text-white"
                      style={{ backgroundColor: resolveApptColor(a, byId) }}
                      title={label}
                    >
                      {!a.allDay && `${formatHourBR(a.dateTime)} `}
                      {label}
                    </span>
                  );
                })}
                {overflow > 0 && (
                  <span className="px-1 text-[9px] font-medium text-muted-foreground">
                    +{overflow} mais
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Visão Ano — 12 mini-meses do ano do cursor; clique no dia vai pra Dia,
// clique no nome do mês vai pra Mês. Densidade por bolinhas, mesmo padrão do
// mini-calendário da sidebar.

function YearGrid({
  cursor,
  appointments,
  onPickDay,
  onPickMonth,
}: {
  cursor: Date;
  appointments: Appointment[];
  onPickDay: (d: Date) => void;
  onPickMonth: (d: Date) => void;
}) {
  const year = cursor.getFullYear();
  const todayKey = ymd(new Date());

  const countByDay = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of appointments) {
      const k = ymd(new Date(a.dateTime));
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return m;
  }, [appointments]);

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {MONTHS.map((monthName, monthIdx) => {
        const first = new Date(year, monthIdx, 1);
        const start = startOfWeek(first);
        const days = Array.from({ length: 42 }, (_, i) => addDays(start, i));
        return (
          <div key={monthName} className="rounded-lg border border-border p-2">
            <button
              type="button"
              onClick={() => onPickMonth(first)}
              className="mb-1 text-xs font-semibold capitalize hover:text-primary"
            >
              {monthName}
            </button>
            <div className="grid grid-cols-7 gap-0.5 text-center text-[8px] text-muted-foreground">
              {WEEKDAYS_SHORT.map((d) => (
                <div key={d}>{d[0]}</div>
              ))}
            </div>
            <div className="mt-0.5 grid grid-cols-7 gap-0.5">
              {days.map((d) => {
                const inMonth = d.getMonth() === monthIdx;
                const count = countByDay.get(ymd(d)) ?? 0;
                const isToday = ymd(d) === todayKey;
                return (
                  <button
                    key={ymd(d)}
                    type="button"
                    onClick={() => inMonth && onPickDay(d)}
                    disabled={!inMonth}
                    className={`relative rounded-full py-0.5 text-[9px] transition ${
                      !inMonth
                        ? "text-transparent"
                        : isToday
                          ? "bg-primary font-semibold text-primary-foreground"
                          : "text-foreground hover:bg-primary/10"
                    }`}
                  >
                    {inMonth ? d.getDate() : "·"}
                    {inMonth && count > 0 && !isToday && (
                      <span className="absolute inset-x-0 -bottom-0.5 flex justify-center">
                        <span className="h-[3px] w-[3px] rounded-full bg-primary" />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
