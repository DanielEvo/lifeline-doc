// Calendário de consultas — visão dia/semana/mês, canvas contínuo (pixel por
// minuto) com paralelização real: eventos sobrepostos dividem colunas lado a
// lado (como Google Agenda), estreitando conforme mais se acumulam — sem
// teto artificial. Duração é arrastável (borda inferior do bloco); mover é
// drag & drop; criar é clique em área vazia (abre confirmação).

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Lock,
  Plus,
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
import { Textarea } from "@/components/ui/textarea";
import { createMyCategory } from "@/lib/api/categories.functions";
import {
  deleteMyAppointment,
  saveMyCalendarSettings,
  scheduleAppointment,
  updateMyAppointmentTiming,
} from "@/lib/api/clinic.functions";
import {
  DEFAULT_CALENDAR_SETTINGS,
  EVENT_COLOR_SWATCHES,
  formatHourBR,
  initialsOf,
  TINT_TO_HEX,
  type Appointment,
  type CalendarSettings,
  type EventCategory,
  type Patient,
  type RecurrenceFreq,
} from "@/lib/clinic-types";

type View = "dia" | "semana" | "mes" | "lista";

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
  const endMs = appt.allDay ? start.setHours(23, 59, 59, 999) : start.getTime() + (appt.durationMin ?? 30) * 60000;
  return endMs < Date.now();
}

// ---------------------------------------------------------------------------
// Layout de sobreposição — o coração da paralelização: agrupa eventos do dia
// em clusters mutuamente sobrepostos (varredura por horário de início) e,
// dentro de cada cluster, atribui coluna por first-fit guloso. Sem teto —
// colunas só estreitam conforme mais eventos se acumulam, igual Google Agenda.

type Layouted = { appt: Appointment; col: number; totalCols: number; startMin: number; durationMin: number };

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
      result.push({ appt: item.appt, col, totalCols: -1, startMin: item.startMin, durationMin: item.durationMin });
    }
    // totalCols só é conhecido depois de posicionar todo mundo do cluster
    const totalCols = colEnds.length;
    for (let i = result.length - cluster.length; i < result.length; i++) result[i].totalCols = totalCols;
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

function timeFromClientY(columnEl: HTMLElement, clientY: number, day: Date, settings: CalendarSettings): Date {
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
  const [settings, setSettingsLocal] = useState<CalendarSettings>(calendarSettings);
  // servidor é a fonte da verdade (PRO-XX) — sincroniza se mudar por fora
  // (ex.: outra aba salvando configurações diferentes).
  useEffect(() => setSettingsLocal(calendarSettings), [calendarSettings]);

  const [pending, setPending] = useState<{ patient: Patient | null; dateTime: string } | null>(null);
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
          recurrence: v.recurrence,
        },
      }),
    onSuccess: (r, v) => {
      if (!r.ok) return toast.error(v.kind === "bloqueio" ? "Não consegui bloquear o horário." : "Não consegui agendar.");
      if (v.kind === "bloqueio") {
        toast.success("Evento pessoal criado.");
      } else {
        const nome = (pending?.patient?.nome ?? byId.get(v.patientId ?? "")?.nome ?? "Paciente").split(" ")[0];
        const criados = "appointments" in r ? r.appointments?.length ?? 1 : 1;
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

  const excluirBloqueio = useMutation({
    mutationFn: (id: string) => deleteMyAppointment({ data: { token, id } }),
    onSuccess: (r) => {
      if (!r.ok) return toast.error("Não consegui remover o evento.");
      toast.success("Evento removido.");
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
      if (!r.ok) return toast.error(v.durationMin !== undefined ? "Não consegui redimensionar." : "Não consegui remarcar.");
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
  const effectiveCor = corOverride ?? (categoriaId ? categoriesById.get(categoriaId)?.cor ?? null : null);

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
            <SettingsPopover settings={settings} onChange={persistSettings} />
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
              onOpenPatient={onOpenPatient}
              onSlotClick={openEmptySlot}
              onDeleteBloqueio={(id) => excluirBloqueio.mutate(id)}
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
              onOpenPatient={onOpenPatient}
              onSlotClick={openEmptySlot}
              onDeleteBloqueio={(id) => excluirBloqueio.mutate(id)}
            />
          )}
          {view === "mes" && (
            <MonthGrid
              cursor={cursor}
              appointments={visibleAppointments}
              onPickDay={(d) => { setCursor(d); setView("dia"); }}
            />
          )}
        </div>

        <div className="border-t border-border px-3 py-2 text-[11px] text-muted-foreground">
          Dica: arraste um evento pra outro horário pra remarcar, ou puxe a borda de baixo pra mudar a duração.
          Sobreposições dividem colunas automaticamente — sem limite.
        </div>


        {/* Confirmação */}
        <Dialog open={!!pending} onOpenChange={(o) => !o && closeDialog()}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>{isBloqueio ? "Novo evento pessoal" : "Confirmar agendamento"}</DialogTitle>
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
                <>
                  <div className="space-y-1">
                    <Label htmlFor="ap-motivo" className="text-xs">Título</Label>
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
                      <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Sem categoria" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none">Sem categoria</SelectItem>
                        {categories.filter((c) => c.ativo).map((c) => (
                          <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
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
                    <Label htmlFor="ap-descricao" className="text-xs">Descrição (opcional)</Label>
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
                    <Label htmlFor="ap-local" className="text-xs">Local (opcional)</Label>
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
                    <Label htmlFor="ap-nota" className="text-xs">Observação (opcional)</Label>
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

              <RecurrencePicker freq={recorrenciaFreq} onFreqChange={setRecorrenciaFreq} count={vezes} onCountChange={setVezes} />
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={closeDialog}>Cancelar</Button>
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
      </div>
    </div>
  );
}

const DURATION_OPTIONS = [15, 30, 45, 60, 90, 120];

function DurationSelect({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <Select value={String(value)} onValueChange={(v) => onChange(Number(v))}>
      <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
      <SelectContent>
        {DURATION_OPTIONS.map((m) => (
          <SelectItem key={m} value={String(m)}>{m} minutos</SelectItem>
        ))}
      </SelectContent>
    </Select>
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
        <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
        <SelectContent>
          {(Object.keys(RECURRENCE_LABEL) as RecurrenceFreq[]).map((f) => (
            <SelectItem key={f} value={f}>{RECURRENCE_LABEL[f]}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      {freq !== "none" && (
        <div className="space-y-1 pt-1">
          <Label htmlFor="ap-vezes" className="text-xs">Quantas vezes</Label>
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
}: {
  token: string;
  categories: EventCategory[];
  hiddenCategoryIds: Set<string>;
  onToggleCategory: (id: string) => void;
  showConsultas: boolean;
  onToggleConsultas: (v: boolean) => void;
  cursor: Date;
  onPickDate: (d: Date) => void;
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
      <MiniMonthPicker cursor={cursor} onPick={onPickDate} />

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
        {categories.filter((c) => c.ativo).map((c) => (
          <label key={c.id} className="flex cursor-pointer items-center gap-2 rounded px-0.5 py-1 text-xs hover:bg-muted/50">
            <input
              type="checkbox"
              checked={!hiddenCategoryIds.has(c.id)}
              onChange={() => onToggleCategory(c.id)}
              className="h-3.5 w-3.5 rounded accent-primary"
            />
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: c.cor }} />
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
            <Button size="sm" variant="outline" className="h-6 flex-1 text-[11px]" onClick={() => setCreating(false)}>
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

function MiniMonthPicker({ cursor, onPick }: { cursor: Date; onPick: (d: Date) => void }) {
  const [miniCursor, setMiniCursor] = useState(cursor);
  const first = new Date(miniCursor.getFullYear(), miniCursor.getMonth(), 1);
  const start = startOfWeek(first);
  const days = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  const todayKey = ymd(new Date());
  const selectedKey = ymd(cursor);

  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold">
          {MONTHS[miniCursor.getMonth()]} {miniCursor.getFullYear()}
        </span>
        <div className="flex gap-0.5">
          <button
            type="button"
            onClick={() => setMiniCursor(new Date(miniCursor.getFullYear(), miniCursor.getMonth() - 1, 1))}
            className="rounded p-0.5 text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setMiniCursor(new Date(miniCursor.getFullYear(), miniCursor.getMonth() + 1, 1))}
            className="rounded p-0.5 text-muted-foreground hover:text-foreground"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <div className="mt-1 grid grid-cols-7 gap-0.5 text-center text-[9px] text-muted-foreground">
        {WEEKDAYS_SHORT.map((d) => <div key={d}>{d[0]}</div>)}
      </div>
      <div className="mt-0.5 grid grid-cols-7 gap-0.5">
        {days.map((d) => {
          const inMonth = d.getMonth() === miniCursor.getMonth();
          const isToday = ymd(d) === todayKey;
          const isSelected = ymd(d) === selectedKey;
          return (
            <button
              key={ymd(d)}
              type="button"
              onClick={() => onPick(d)}
              className={`rounded-full py-0.5 text-[10px] transition hover:bg-primary/10 ${
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
            </button>
          );
        })}
      </div>
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
  onResizeAppointment: (appointmentId: string, durationMin: number) => void;
  onOpenPatient?: (p: Patient) => void;
  onSlotClick: (dateTime: string) => void;
  onDeleteBloqueio: (id: string) => void;
}) {
  const ticks = useMemo(() => {
    const arr: Tick[] = [];
    for (let h = settings.startHour; h < settings.endHour; h++) {
      for (let m = 0; m < 60; m += settings.slotMinutes) arr.push({ hour: h, minute: m, isHour: m === 0 });
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
            <AllDayCell key={ymd(d)} appts={allDayByDay.get(ymd(d)) ?? []} byId={byId} onDeleteBloqueio={onDeleteBloqueio} />
          ))}
        </div>
      )}

      <div className="flex min-w-[560px] border-t border-border">
        <TimeGutter ticks={ticks} settings={settings} />
        {days.map((d) => (
          <DayColumn
            key={ymd(d)}
            day={d}
            settings={settings}
            timedAppts={timedByDay.get(ymd(d)) ?? []}
            byId={byId}
            ticks={ticks}
            canvasHeightPx={canvasHeightPx}
            onDropPatient={onDropPatient}
            onMoveAppointment={onMoveAppointment}
            onResizeAppointment={onResizeAppointment}
            onOpenPatient={onOpenPatient}
            onSlotClick={onSlotClick}
            onDeleteBloqueio={onDeleteBloqueio}
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
  onDeleteBloqueio,
}: {
  appts: Appointment[];
  byId: Map<string, Patient>;
  onDeleteBloqueio: (id: string) => void;
}) {
  return (
    <div className="min-w-[120px] flex-1 space-y-0.5 border-l border-border p-0.5">
      {appts.map((a) => {
        const patient = a.patientId ? byId.get(a.patientId) : undefined;
        const color = a.kind === "bloqueio" ? (a.cor ?? FALLBACK_COLOR) : (TINT_TO_HEX[patient?.tint ?? ""] ?? FALLBACK_COLOR);
        return (
          <div
            key={a.id}
            className="flex items-center gap-1 truncate rounded px-1.5 py-0.5 text-[10px] font-medium text-white"
            style={{ backgroundColor: color }}
            title={a.label ?? patient?.nome ?? ""}
          >
            <span className="truncate">{a.label || patient?.nome || "Evento"}</span>
            {a.kind === "bloqueio" && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteBloqueio(a.id);
                }}
                className="ml-auto shrink-0"
              >
                <X className="h-2.5 w-2.5" />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

function DayColumn({
  day,
  settings,
  timedAppts,
  byId,
  ticks,
  canvasHeightPx,
  onDropPatient,
  onMoveAppointment,
  onResizeAppointment,
  onOpenPatient,
  onSlotClick,
  onDeleteBloqueio,
}: {
  day: Date;
  settings: CalendarSettings;
  timedAppts: Appointment[];
  byId: Map<string, Patient>;
  ticks: Tick[];
  canvasHeightPx: number;
  onDropPatient: (patientId: string, dateTime: string) => void;
  onMoveAppointment: (appointmentId: string, dateTime: string) => void;
  onResizeAppointment: (appointmentId: string, durationMin: number) => void;
  onOpenPatient?: (p: Patient) => void;
  onSlotClick: (dateTime: string) => void;
  onDeleteBloqueio: (id: string) => void;
}) {
  const colRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState(false);
  const layouted = useMemo(() => layoutTimedAppointments(timedAppts), [timedAppts]);

  const resolveDrop = (e: React.DragEvent): Date | null => {
    if (!colRef.current) return null;
    return timeFromClientY(colRef.current, e.clientY, day, settings);
  };

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
      onClick={(e) => {
        if (e.target !== colRef.current || !colRef.current) return; // ignora cliques que vieram de um bloco
        const candidate = timeFromClientY(colRef.current, e.clientY, day, settings);
        onSlotClick(toIsoLocal(candidate));
      }}
    >
      {ticks.map((t, i) => (
        <div
          key={i}
          className={`pointer-events-none absolute inset-x-0 border-t ${t.isHour ? "border-border" : "border-border/40"}`}
          style={{ top: (t.hour - settings.startHour) * 60 * PX_PER_MIN + t.minute * PX_PER_MIN }}
        />
      ))}

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
          onOpenPatient={onOpenPatient}
          onDeleteBloqueio={onDeleteBloqueio}
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
  onOpenPatient,
  onDeleteBloqueio,
  onResize,
}: {
  appt: Appointment;
  patient: Patient | undefined;
  top: number;
  height: number;
  col: number;
  totalCols: number;
  slotMinutes: number;
  onOpenPatient?: (p: Patient) => void;
  onDeleteBloqueio: (id: string) => void;
  onResize: (id: string, durationMin: number) => void;
}) {
  const [resizeDeltaPx, setResizeDeltaPx] = useState<number | null>(null);
  const startYRef = useRef(0);
  const baseDuration = appt.durationMin ?? 30;
  const isBloqueio = appt.kind === "bloqueio";
  const color = isBloqueio ? (appt.cor ?? FALLBACK_COLOR) : (TINT_TO_HEX[patient?.tint ?? ""] ?? FALLBACK_COLOR);
  const displayHeight = resizeDeltaPx !== null ? Math.max(MIN_BLOCK_PX, height + resizeDeltaPx) : height;
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
        if (!isBloqueio && patient) onOpenPatient?.(patient);
      }}
      title={
        isBloqueio
          ? appt.label || "Bloqueado"
          : `${patient?.nome ?? ""} · ${formatHourBR(appt.dateTime)}${appt.note ? ` · ${appt.note}` : ""} — arraste pra remarcar, puxe a borda de baixo pra mudar a duração`
      }
      className={`group absolute overflow-hidden rounded-md px-1.5 py-1 text-[10px] leading-tight transition ${
        isBloqueio ? "cursor-default bg-slate-200 dark:bg-slate-800/70" : "cursor-grab active:cursor-grabbing"
      }`}
      style={{
        top,
        height: displayHeight,
        left: `calc(${col * widthPct}% + ${gutterPx}px)`,
        width: `calc(${widthPct}% - ${gutterPx * 2}px)`,
        ...(isBloqueio ? {} : { backgroundColor: hexToRgba(color, 0.14), borderLeft: `3px solid ${color}` }),
      }}
    >
      {isBloqueio ? (
        <div className="flex h-full items-start gap-1">
          <Lock className="mt-0.5 h-2.5 w-2.5 shrink-0 text-slate-500 dark:text-slate-400" />
          <span className="min-w-0 flex-1 truncate font-medium text-slate-600 dark:text-slate-300">
            {appt.label || "Bloqueado"}
          </span>
          <button
            type="button"
            title="Remover bloqueio"
            onClick={(e) => {
              e.stopPropagation();
              onDeleteBloqueio(appt.id);
            }}
            className="shrink-0 text-slate-500 hover:text-red-600 dark:text-slate-400 dark:hover:text-red-400"
          >
            <X className="h-3 w-3" />
          </button>
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
            const snapped = Math.max(slotMinutes, Math.round((baseDuration + deltaMin) / slotMinutes) * slotMinutes);
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
