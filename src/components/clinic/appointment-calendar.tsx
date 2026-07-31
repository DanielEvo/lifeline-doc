// Calendário de consultas — visão dia/semana/mês, canvas contínuo (pixel por
// minuto) com paralelização real: eventos sobrepostos dividem colunas lado a
// lado (como Google Agenda), estreitando conforme mais se acumulam — sem
// teto artificial. Duração é arrastável (borda inferior do bloco); mover é
// drag & drop; criar é clique em área vazia (abre confirmação).

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bell,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Loader2,
  Lock,
  Plus,
  Search,
  Settings2,
  Trash2,
  XCircle,
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
import { Skeleton } from "@/components/ui/skeleton";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { createMyCategory } from "@/lib/api/categories.functions";
import {
  deleteMyAppointment,
  listMyAppointments,
  saveMyCalendarSettings,
  scheduleAppointment,
  setMyAppointmentStatus,
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
  type AppointmentStatus,
  type CalendarSettings,
  type EventCategory,
  type Patient,
  type RecurrenceFreq,
  type RecurrenceScope,
} from "@/lib/clinic-types";

type View = "dia" | "semana" | "mes" | "ano" | "lista" | "custom";

// px por minuto do canvas contínuo — 30min ≈ 48px, altura na mesma ordem de
// grandeza do grid antigo de linha fixa (36px por slot). Zoom de densidade
// (Parte 3, item 4) multiplica essa base por um fator 0,8x-2x escolhido pelo
// médico — 0,8x deixa o dia inteiro mais compacto na tela, 2x amplia detalhe.
const PX_PER_MIN_BASE = 1.6;
const ZOOM_MIN = 0.8;
const ZOOM_MAX = 2;
const ZOOM_DEFAULT = 1;
const MIN_BLOCK_PX = 22; // clamp mínimo — consulta de 15min não vira lasca ilegível
const FALLBACK_COLOR = "#64748b"; // slate-500 — bloqueio sem cor/categoria ainda

export const DRAG_PATIENT_KEY = "application/x-patient-id";
const DRAG_KEY = DRAG_PATIENT_KEY;
const DRAG_APPT = "application/x-appointment-id";
// BUG-5: precisa da duração do evento arrastado no onDrop pra checar
// interseção real com bloqueios, não só o instante inicial.
const DRAG_APPT_DURATION = "application/x-appointment-duration";

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
  // BUG-9: agrupa itens do mesmo cluster de sobreposição — usado pra somar
  // o overflow (">3 colunas") num único chip "+N mais" por cluster, não por
  // totalCols (dois clusters independentes no mesmo dia podem coincidir em
  // totalCols sem serem a mesma sobreposição).
  clusterId: number;
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
  let clusterId = 0;

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
        clusterId,
      });
    }
    // totalCols só é conhecido depois de posicionar todo mundo do cluster
    const totalCols = colEnds.length;
    for (let i = result.length - cluster.length; i < result.length; i++)
      result[i].totalCols = totalCols;
    clusterId++;
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

/** Bloqueio que intersecta o intervalo [candidate, candidate+durationMin) —
 *  usado pra rejeitar drop (mover ou criar). BUG-5: antes só testava o
 *  instante inicial do candidato, então um evento de 60min solto 5min antes
 *  de um bloqueio de 30min atravessava o bloqueio inteiro sem ser barrado. */
function bloqueioAt(
  dayAppts: Appointment[],
  candidate: Date,
  durationMin: number,
): Appointment | undefined {
  const startMin = candidate.getHours() * 60 + candidate.getMinutes();
  const endMin = startMin + durationMin;
  return dayAppts.find((a) => {
    if (a.kind !== "bloqueio") return false;
    const { startMin: s, durationMin: d } = apptRange(a);
    return startMin < s + d && endMin > s;
  });
}

/** Parte 3, item 8: mesma lógica de countOverlappingConsultas (agenda.server.ts),
 *  só que client-side e sobre o que já está carregado na tela — dá feedback
 *  visual imediato (antes do submit); quem decide de verdade continua sendo
 *  o servidor, que vê a agenda inteira, não só o dia renderizado. */
function countOverlappingConsultasLocal(
  dayAppts: Appointment[],
  candidateStartMin: number,
  durationMin: number,
  excludeId?: string,
): number {
  const candidateEndMin = candidateStartMin + durationMin;
  return dayAppts.filter((a) => {
    if (a.kind !== "consulta" || a.id === excludeId) return false;
    const { startMin, durationMin: d } = apptRange(a);
    return startMin < candidateEndMin && startMin + d > candidateStartMin;
  }).length;
}

function timeFromClientY(
  columnEl: HTMLElement,
  clientY: number,
  day: Date,
  settings: CalendarSettings,
  pxPerMin: number,
): Date {
  const rect = columnEl.getBoundingClientRect();
  const rawMin = (clientY - rect.top) / pxPerMin;
  // Movimentação é sempre livre num grid fino de SNAP_MIN — a duração de slot
  // configurada é só um default "soft" pra novos eventos, nunca uma trava.
  const snapped = Math.round(rawMin / SNAP_MIN) * SNAP_MIN;
  const totalMin = (settings.endHour - settings.startHour) * 60;
  const clamped = Math.max(0, Math.min(totalMin - SNAP_MIN, snapped));
  const d = new Date(day);
  d.setHours(settings.startHour, 0, 0, 0);
  d.setMinutes(d.getMinutes() + clamped);
  return d;
}

/** Granularidade fina de arrasto (mover/redimensionar/criar). Independente
 *  do slotMinutes configurado, que só define a duração sugerida. */
const SNAP_MIN = 5;
/** Faixa à direita da coluna que nunca é coberta por eventos — garante que
 *  sempre dá pra clicar/soltar em cima de um horário já ocupado e criar um
 *  atendimento em paralelo. */
const RESERVE_PX = 18;
// BUG-9: acima disso, colunas viram tiras ilegíveis — a partir da 4ª,
// agrupa no chip "+N mais" em vez de espremer mais uma coluna.
const MAX_VISIBLE_COLS = 3;

const REMINDER_CHECK_MS = 30_000;
// Referência estável pro estado "ainda carregando" da query de agendamentos —
// evita recriar um array novo a cada render (quebraria memoização a jusante).
const EMPTY_APPOINTMENTS: Appointment[] = [];

// BUG-14: chaves de persistência de visão/densidade/cursor.
const VIEW_KEY = "lifeline:agenda-view";
const CURSOR_KEY = "lifeline:agenda-cursor";
const CUSTOM_DAYS_KEY = "lifeline:agenda-custom-days";
const ZOOM_KEY = "lifeline:agenda-zoom";

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

/** Janela de datas [from, to] a buscar do servidor pra cada visão (BUG-2) —
 *  generosa o bastante pra cobrir spillover de dias adjacentes (mês/lista),
 *  sem precisar bater exatamente com o que cada view renderiza. "Lista" é
 *  aberta pra frente por natureza (mostra "todos os próximos eventos"); em
 *  vez de buscar o futuro inteiro, limitamos a 180 dias — uma janela grande
 *  o bastante pra qualquer uso prático, sem virar uma query sem fim. */
function getViewRange(
  view: View,
  cursor: Date,
  customDayCount: number,
): { from: string; to: string } {
  const pad = (d: Date, days: number) => addDays(d, days);
  let from: Date;
  let to: Date;
  if (view === "dia") {
    from = cursor;
    to = addDays(cursor, 1);
  } else if (view === "semana") {
    from = startOfWeek(cursor);
    to = addDays(from, 7);
  } else if (view === "custom") {
    from = cursor;
    to = addDays(cursor, customDayCount);
  } else if (view === "mes") {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    from = startOfWeek(first);
    to = addDays(from, 42);
  } else if (view === "ano") {
    from = new Date(cursor.getFullYear(), 0, 1);
    to = new Date(cursor.getFullYear() + 1, 0, 1);
  } else {
    // lista
    from = cursor;
    to = addDays(cursor, 180);
  }
  return { from: pad(from, -3).toISOString(), to: pad(to, 3).toISOString() };
}

export function AppointmentCalendar({
  token,
  patients,
  categories,
  calendarSettings,
  onOpenPatient,
}: {
  token: string;
  patients: Patient[];
  categories: EventCategory[];
  calendarSettings: CalendarSettings;
  onOpenPatient?: (p: Patient) => void;
}) {
  const qc = useQueryClient();
  // BUG-14: visão/densidade/cursor persistem entre visitas (mesmo padrão de
  // localStorage já usado pela largura do painel de conhecimento) — trocar
  // de página e voltar não reseta mais pra "semana"/hoje. "Hoje" continua ali
  // pra voltar rápido se o médico quiser. Lido em useEffect (client-only) em
  // vez do inicializador do useState — este componente também roda em SSR,
  // onde `window` não existe.
  const [view, setView] = useState<View>("semana");
  const [cursor, setCursor] = useState<Date>(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });
  // Visão "N dias" — quantidade configurável (padrão 4, como o Google
  // Agenda oferece "3 dias"/"4 dias" fixos).
  const [customDayCount, setCustomDayCount] = useState(4);
  // Parte 3, item 4: zoom de densidade — multiplica PX_PER_MIN_BASE.
  const [zoom, setZoom] = useState(ZOOM_DEFAULT);
  const pxPerMin = PX_PER_MIN_BASE * zoom;

  useEffect(() => {
    const savedView = window.localStorage.getItem(VIEW_KEY);
    const validViews: View[] = ["dia", "semana", "mes", "ano", "lista", "custom"];
    if (validViews.includes(savedView as View)) setView(savedView as View);

    const savedCursor = window.localStorage.getItem(CURSOR_KEY);
    if (savedCursor) {
      const parsed = fromYmd(savedCursor);
      if (!Number.isNaN(parsed.getTime())) setCursor(parsed);
    }

    const savedDays = Number(window.localStorage.getItem(CUSTOM_DAYS_KEY));
    if (savedDays >= 2 && savedDays <= 14) setCustomDayCount(savedDays);

    const savedZoom = Number(window.localStorage.getItem(ZOOM_KEY));
    if (savedZoom >= ZOOM_MIN && savedZoom <= ZOOM_MAX) setZoom(savedZoom);
  }, []);

  useEffect(() => window.localStorage.setItem(VIEW_KEY, view), [view]);
  useEffect(() => window.localStorage.setItem(CURSOR_KEY, ymd(cursor)), [cursor]);
  useEffect(
    () => window.localStorage.setItem(CUSTOM_DAYS_KEY, String(customDayCount)),
    [customDayCount],
  );
  useEffect(() => window.localStorage.setItem(ZOOM_KEY, String(zoom)), [zoom]);

  // BUG-2: query dedicada, desacoplada de ["workspace"] — o calendário busca
  // seus próprios agendamentos, escopados à janela visível (evita o N+1 de
  // withVinculo em getWorkspace só pra desenhar o grid).
  const range = useMemo(
    () => getViewRange(view, cursor, customDayCount),
    [view, cursor, customDayCount],
  );
  const apptsKey = ["appointments", range.from, range.to] as const;
  const apptsQuery = useQuery({
    queryKey: apptsKey,
    queryFn: async () => {
      const r = await listMyAppointments({ data: { token, ...range } });
      if (!r.ok) throw new Error("Sessão expirada. Recarregue a página.");
      return r.appointments;
    },
  });
  const appointments = apptsQuery.data ?? EMPTY_APPOINTMENTS;
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
  // BUG-12: decisão explícita — hiddenCategoryIds/showConsultas é só um
  // filtro VISUAL do grid (TimeGrid/MonthGrid/YearGrid/ListView, todos
  // recebem visibleAppointments abaixo). Lembretes, busca (EventSearch) e o
  // mini-calendário (CategorySidebar) usam `appointments` cru de propósito —
  // esconder uma categoria não deveria fazer o médico "esquecer" que aquele
  // evento existe ou deixar de ser lembrado dele.
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

  // BUG-2/4: otimistic update — mesmo padrão já usado pelo `mover` do Kanban
  // em routes/app/index.tsx (onMutate cancela+snapshot+aplica, onError
  // restaura, onSettled invalida o prefixo inteiro — cobre todas as janelas).
  const parallelLimitMsg = () =>
    `Limite de ${settings.maxParallel} atendimento${settings.maxParallel > 1 ? "s" : ""} em paralelo atingido nesse horário.`;

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
      requestId: string;
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
          requestId: v.requestId,
        },
      }),
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: apptsKey });
      const prev = qc.getQueryData<Appointment[]>(apptsKey);
      const tempId = `temp-${crypto.randomUUID()}`;
      const now = new Date().toISOString();
      const optimistic: Appointment = {
        id: tempId,
        doctorId: "",
        patientId: v.patientId,
        dateTime: v.dateTime,
        durationMin: v.allDay ? null : v.durationMin,
        allDay: v.allDay,
        status: "agendada",
        note: v.note,
        kind: v.kind,
        label: v.label,
        categoriaId: v.categoriaId,
        cor: v.cor,
        descricao: v.descricao,
        local: v.local,
        recurrenceId: null,
        lembretesMin: v.lembretesMin,
        createdAt: now,
        updatedAt: now,
      };
      qc.setQueryData<Appointment[]>(apptsKey, (old) => [...(old ?? []), optimistic]);
      return { prev, tempId };
    },
    onSuccess: (r, v, ctx) => {
      if (!r.ok) {
        if (ctx?.prev) qc.setQueryData(apptsKey, ctx.prev);
        if (r.error === "parallel_limit") return toast.error(parallelLimitMsg());
        return toast.error(
          v.kind === "bloqueio" ? "Não consegui bloquear o horário." : "Não consegui agendar.",
        );
      }
      const created = "appointments" in r ? (r.appointments ?? [r.appointment]) : [r.appointment];
      qc.setQueryData<Appointment[]>(apptsKey, (old) => [
        ...(old ?? []).filter((a) => a.id !== ctx?.tempId),
        ...created,
      ]);
      if (v.kind === "bloqueio") {
        toast.success("Evento pessoal criado.");
      } else {
        const nome = (
          pending?.patient?.nome ??
          byId.get(v.patientId ?? "")?.nome ??
          "Paciente"
        ).split(" ")[0];
        const criados = created.length;
        toast.success(
          criados > 1
            ? `${nome} agendado(a) ${criados}x a partir de ${new Date(v.dateTime).toLocaleDateString("pt-BR")}.`
            : `${nome} agendado(a) para ${new Date(v.dateTime).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}.`,
        );
      }
      closeDialog();
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(apptsKey, ctx.prev);
      toast.error("Não consegui agendar. Tente de novo.");
    },
    onSettled: () => {
      submittingRef.current = false;
      qc.invalidateQueries({ queryKey: ["appointments"] });
    },
  });

  // Exclusão só acontece de dentro do editor completo agora (sem X inline no
  // canvas) — scope importa quando o evento faz parte de uma série. Só o id
  // clicado some otimisticamente; o resto da série ("following"/"all") só
  // termina de sumir quando o onSettled invalida e reconcilia com o servidor.
  const excluirEvento = useMutation({
    mutationFn: (v: { id: string; scope: RecurrenceScope }) =>
      deleteMyAppointment({ data: { token, id: v.id, scope: v.scope } }),
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: apptsKey });
      const prev = qc.getQueryData<Appointment[]>(apptsKey);
      qc.setQueryData<Appointment[]>(apptsKey, (old) => (old ?? []).filter((a) => a.id !== v.id));
      return { prev };
    },
    onSuccess: (r, _v, ctx) => {
      // Sucesso já foi comunicado na hora do clique (excluirComDesfazer) —
      // aqui só corrige se a exclusão de verdade (pós-janela de desfazer)
      // falhar depois de já ter dito "removido" pro médico.
      if (!r.ok) {
        if (ctx?.prev) qc.setQueryData(apptsKey, ctx.prev);
        toast.error("Não consegui remover o evento — ele voltou pra agenda.");
      }
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(apptsKey, ctx.prev);
      toast.error("Não consegui remover o evento — ele voltou pra agenda.");
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["appointments"] }),
  });

  // Parte 3, item 1: "desfazer" de verdade pra exclusão — em vez de excluir
  // na hora, remove otimisticamente da tela e só chama o servidor depois da
  // janela de 5s (se o médico não desfizer). Diferente de mover/redimensionar
  // (que já efetivaram e só "desfazem" invertendo a mutação): aqui a ação
  // destrutiva ainda nem aconteceu quando o toast aparece.
  const pendingDeleteRef = useRef<{
    timeoutId: ReturnType<typeof setTimeout>;
    prev: Appointment[] | undefined;
  } | null>(null);

  const excluirComDesfazer = (id: string, scope: RecurrenceScope) => {
    const prev = qc.getQueryData<Appointment[]>(apptsKey);
    qc.setQueryData<Appointment[]>(apptsKey, (old) => (old ?? []).filter((a) => a.id !== id));
    setEditingId(null);
    const timeoutId = setTimeout(() => {
      pendingDeleteRef.current = null;
      excluirEvento.mutate({ id, scope });
    }, 5000);
    pendingDeleteRef.current = { timeoutId, prev };
    toast.success("Evento removido.", {
      action: {
        label: "Desfazer",
        onClick: () => {
          if (!pendingDeleteRef.current) return;
          clearTimeout(pendingDeleteRef.current.timeoutId);
          qc.setQueryData(apptsKey, pendingDeleteRef.current.prev);
          pendingDeleteRef.current = null;
        },
      },
      duration: 5000,
    });
  };

  // Reabre o editor completo (diferente de atualizarTiming, que só cuida de
  // dateTime/durationMin via drag/resize) — fora do escopo do otimistic
  // update pedido (BUG-2/4 é só criar/mover/redimensionar/excluir), o modal
  // já mantém o usuário esperando de qualquer forma.
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
      qc.invalidateQueries({ queryKey: ["appointments"] });
    },
  });

  // BUG-10: status muda na hora (mesmo padrão do apptStatus em
  // pacientes.index.tsx) — invalida ["workspace"] também porque o Kanban lê
  // status de lá pras badges "faltou"/reengajamento.
  const atualizarStatus = useMutation({
    mutationFn: (v: { id: string; status: AppointmentStatus }) =>
      setMyAppointmentStatus({ data: { token, ...v } }),
    onSuccess: (r) => {
      if (!r.ok) return toast.error("Não consegui atualizar o status.");
      toast.success("Status atualizado.");
      qc.invalidateQueries({ queryKey: ["appointments"] });
      qc.invalidateQueries({ queryKey: ["workspace"] });
    },
  });

  // Mesma mutação serve mover (só dateTime, drag) e redimensionar (só
  // durationMin, alça na borda do bloco) — updateMyAppointmentTiming aceita
  // qualquer um dos dois independentemente.
  const atualizarTiming = useMutation({
    mutationFn: (v: { id: string; dateTime?: string; durationMin?: number }) =>
      updateMyAppointmentTiming({ data: { token, ...v } }),
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: apptsKey });
      const prev = qc.getQueryData<Appointment[]>(apptsKey);
      qc.setQueryData<Appointment[]>(apptsKey, (old) =>
        (old ?? []).map((a) =>
          a.id === v.id
            ? {
                ...a,
                dateTime: v.dateTime ?? a.dateTime,
                durationMin: v.durationMin ?? a.durationMin,
              }
            : a,
        ),
      );
      return { prev };
    },
    onSuccess: (r, v, ctx) => {
      if (!r.ok) {
        if (ctx?.prev) qc.setQueryData(apptsKey, ctx.prev);
        if (r.error === "parallel_limit") return toast.error(parallelLimitMsg());
        return toast.error(
          v.durationMin !== undefined ? "Não consegui redimensionar." : "Não consegui remarcar.",
        );
      }
      // Desfazer (Parte 3, item 1): mover/redimensionar já efetiva na hora
      // (nada é destruído), então desfazer é só chamar a mesma mutação de
      // volta com o valor original, capturado no snapshot do onMutate.
      const original = ctx?.prev?.find((a) => a.id === v.id);
      const undoAction = original
        ? {
            label: "Desfazer",
            onClick: () =>
              atualizarTiming.mutate(
                v.durationMin !== undefined
                  ? { id: v.id, durationMin: original.durationMin ?? 30 }
                  : { id: v.id, dateTime: original.dateTime },
              ),
          }
        : undefined;

      // Parte 3, item 7: mover um evento que já passou não é bloqueado (o
      // médico pode ter um motivo real), mas ganha um aviso mais visível e
      // uma janela maior de "desfazer" — evita que um arrasto sem querer em
      // cima de uma consulta antiga passe despercebido.
      if (v.dateTime !== undefined && original && isPastAppt(original)) {
        toast.warning("Você moveu um evento que já tinha passado.", {
          description: "Se foi sem querer, dá pra desfazer.",
          action: undoAction,
          duration: 8000,
        });
        return;
      }

      toast.success(
        v.durationMin !== undefined
          ? `Duração ajustada para ${v.durationMin}min.`
          : `Remarcado para ${new Date(r.appointment.dateTime).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}.`,
        undoAction ? { action: undoAction, duration: 5000 } : undefined,
      );
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(apptsKey, ctx.prev);
      toast.error("Não consegui atualizar.");
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["appointments"] }),
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

  // BUG-13: requestId estável por abertura do dialog — duplo clique em
  // "Confirmar" reenvia o MESMO id, e o servidor devolve o agendamento já
  // criado em vez de duplicar (unique index em doctor_id+request_id).
  const requestIdRef = useRef<string>(crypto.randomUUID());
  const submittingRef = useRef(false);

  const openConfirm = (patientId: string, dateTime: string) => {
    const p = byId.get(patientId);
    if (!p) return;
    resetDialogFields();
    requestIdRef.current = crypto.randomUUID();
    setPending({ patient: p, dateTime });
  };

  const openEmptySlot = (dateTime: string, durationMin?: number) => {
    resetDialogFields();
    requestIdRef.current = crypto.randomUUID();
    if (durationMin) setDuracaoMin(durationMin);
    setPending({ patient: null, dateTime });
  };

  const chosenPatientId = pending?.patient?.id ?? selectedPatientId;
  const canConfirm = isBloqueio || !!chosenPatientId;
  const effectiveCor =
    corOverride ?? (categoriaId ? (categoriesById.get(categoriaId)?.cor ?? null) : null);

  const confirmar = () => {
    // BUG-13: guard síncrono — não depende de agendar.isPending (que só
    // atualiza no próximo render; um duplo clique real pode disparar as
    // duas chamadas antes da primeira re-renderização).
    if (submittingRef.current) return;
    if (!pending) return;
    submittingRef.current = true;
    const recurrence = { freq: recorrenciaFreq, count: recorrenciaFreq === "none" ? 0 : vezes };
    const requestId = requestIdRef.current;
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
        requestId,
      });
      return;
    }
    if (!chosenPatientId) {
      submittingRef.current = false;
      return;
    }
    agendar.mutate({
      patientId: chosenPatientId,
      dateTime: pending.dateTime,
      note: note.trim() || null,
      kind: "consulta",
      label: null,
      durationMin: duracaoMin,
      allDay,
      categoriaId: null,
      cor: null,
      descricao: null,
      local: null,
      lembretesMin,
      recurrence,
      requestId,
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
              zoom={zoom}
              onZoomChange={setZoom}
            />
          </div>
        </div>

        {/* Corpo */}
        <div className="p-2">
          {apptsQuery.isLoading && !apptsQuery.data ? (
            <AgendaSkeleton />
          ) : (
            <>
              {view === "dia" && (
                <TimeGrid
                  days={[cursor]}
                  settings={settings}
                  appointments={visibleAppointments}
                  byId={byId}
                  pxPerMin={pxPerMin}
                  onDropPatient={openConfirm}
                  onMoveAppointment={(id, dateTime) => atualizarTiming.mutate({ id, dateTime })}
                  onResizeAppointment={(id, durationMin) =>
                    atualizarTiming.mutate({ id, durationMin })
                  }
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
                  pxPerMin={pxPerMin}
                  onDropPatient={openConfirm}
                  onMoveAppointment={(id, dateTime) => atualizarTiming.mutate({ id, dateTime })}
                  onResizeAppointment={(id, durationMin) =>
                    atualizarTiming.mutate({ id, durationMin })
                  }
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
                  pxPerMin={pxPerMin}
                  onDropPatient={openConfirm}
                  onMoveAppointment={(id, dateTime) => atualizarTiming.mutate({ id, dateTime })}
                  onResizeAppointment={(id, durationMin) =>
                    atualizarTiming.mutate({ id, durationMin })
                  }
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
            </>
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
                  {/* BUG-8: allDay deixa de ser exclusivo de evento pessoal */}
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
            onDelete={(scope) => excluirComDesfazer(editingAppt.id, scope)}
            onStatusChange={(status) => atualizarStatus.mutate({ id: editingAppt.id, status })}
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
  onStatusChange,
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
  onStatusChange: (status: AppointmentStatus) => void;
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
          allDay,
          durationMin: allDay ? null : duracaoMin,
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
              {/* BUG-10: status muda na hora, sem passar pelo "Salvar" */}
              <div className="space-y-1">
                <Label className="text-xs">Status</Label>
                <Select
                  value={appt.status}
                  onValueChange={(v) => onStatusChange(v as AppointmentStatus)}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="agendada">Agendada</SelectItem>
                    <SelectItem value="confirmada">Confirmada</SelectItem>
                    <SelectItem value="realizada">Realizada</SelectItem>
                    <SelectItem value="faltou">Faltou</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {/* BUG-8: allDay deixa de ser exclusivo de evento pessoal */}
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
  zoom,
  onZoomChange,
}: {
  settings: CalendarSettings;
  onChange: (s: CalendarSettings) => void;
  customDayCount: number;
  onCustomDayCountChange: (n: number) => void;
  zoom: number;
  onZoomChange: (n: number) => void;
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
          <Label className="text-[11px]">Consultas em paralelo (mesmo horário)</Label>
          <Select
            value={String(settings.maxParallel)}
            onValueChange={(v) =>
              onChange({ ...settings, maxParallel: Number(v) as CalendarSettings["maxParallel"] })
            }
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[1, 2, 3].map((n) => (
                <SelectItem key={n} value={String(n)}>
                  até {n}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <Label className="text-[11px]">Zoom (densidade)</Label>
            <span className="text-[11px] tabular-nums text-muted-foreground">
              {zoom.toFixed(1)}x
            </span>
          </div>
          <Slider
            value={[zoom]}
            onValueChange={([v]) => onZoomChange(v)}
            min={ZOOM_MIN}
            max={ZOOM_MAX}
            step={0.1}
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

/** Parte 3, item 12: só aparece no primeiro carregamento (sem cache ainda) —
 *  evita que "sem eventos ainda" pareça igual a "carregando" e evita salto
 *  de layout (altura parecida com a do grid real, max-h-[70vh]). */
function AgendaSkeleton() {
  return (
    <div className="max-h-[70vh] space-y-2 overflow-hidden p-2">
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} className="flex items-center gap-2">
          <Skeleton className="h-3 w-10 shrink-0" />
          <Skeleton className="h-8 flex-1" />
        </div>
      ))}
    </div>
  );
}

function TimeGrid({
  days,
  settings,
  appointments,
  byId,
  pxPerMin,
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
  pxPerMin: number;
  onDropPatient: (patientId: string, dateTime: string) => void;
  onMoveAppointment: (appointmentId: string, dateTime: string) => void;
  onResizeAppointment: (appointmentId: string, durationMin: number) => void;
  onOpenEditor: (id: string) => void;
  onSlotClick: (dateTime: string, durationMin?: number) => void;
}) {
  // O expediente configurado é só o padrão da janela visível: se existir
  // evento fora dele nos dias mostrados, o canvas estica pra que nada que o
  // médico agendou fique invisível.
  const gridSettings = useMemo(() => {
    const dayKeys = new Set(days.map((d) => ymd(d)));
    let startHour = settings.startHour;
    let endHour = settings.endHour;
    for (const a of appointments) {
      if (a.allDay) continue;
      const d = new Date(a.dateTime);
      if (!dayKeys.has(ymd(d))) continue;
      const endMin = d.getHours() * 60 + d.getMinutes() + (a.durationMin ?? 30);
      startHour = Math.min(startHour, d.getHours());
      endHour = Math.max(endHour, Math.min(24, Math.ceil(endMin / 60)));
    }
    if (startHour === settings.startHour && endHour === settings.endHour) return settings;
    return { ...settings, startHour, endHour };
  }, [settings, appointments, days]);

  const ticks = useMemo(() => {
    const arr: Tick[] = [];
    for (let h = gridSettings.startHour; h < gridSettings.endHour; h++) {
      for (let m = 0; m < 60; m += gridSettings.slotMinutes)
        arr.push({ hour: h, minute: m, isHour: m === 0 });
    }
    return arr;
  }, [gridSettings.startHour, gridSettings.endHour, gridSettings.slotMinutes]);

  const canvasHeightPx = (gridSettings.endHour - gridSettings.startHour) * 60 * pxPerMin;

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

  // BUG-15: o canvas vira uma região com scroll próprio (em vez da página
  // inteira rolar) — assim dá pra ancorar o scroll inicial em "agora" (ou no
  // primeiro evento do dia, se "agora" estiver fora do expediente) e fazer
  // auto-scroll ao arrastar perto da borda de cima/baixo.
  const scrollRef = useRef<HTMLDivElement>(null);
  const daysKey = days.map(ymd).join(",");
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const withinHours =
      days.some((d) => ymd(d) === todayKey) &&
      nowMin >= gridSettings.startHour * 60 &&
      nowMin < gridSettings.endHour * 60;
    let anchorMin: number | null = withinHours ? nowMin : null;
    if (anchorMin === null) {
      const allTimed = [...timedByDay.values()].flat();
      if (allTimed.length > 0) {
        const earliest = allTimed.reduce(
          (min, a) => Math.min(min, apptRange(a).startMin),
          Infinity,
        );
        anchorMin = Number.isFinite(earliest) ? earliest : null;
      }
    }
    if (anchorMin === null) return;
    const anchorPx = (anchorMin - gridSettings.startHour * 60) * pxPerMin;
    el.scrollTop = Math.max(0, anchorPx - el.clientHeight / 3);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só reancora quando o conjunto de dias exibidos ou o zoom mudam, não a cada tick/re-render
  }, [daysKey, pxPerMin]);

  const AUTOSCROLL_EDGE_PX = 40;
  const AUTOSCROLL_STEP_PX = 12;
  const autoScrollNearEdge = (clientY: number) => {
    const el = scrollRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (clientY - rect.top < AUTOSCROLL_EDGE_PX) {
      el.scrollTop = Math.max(0, el.scrollTop - AUTOSCROLL_STEP_PX);
    } else if (rect.bottom - clientY < AUTOSCROLL_EDGE_PX) {
      el.scrollTop = Math.min(el.scrollHeight, el.scrollTop + AUTOSCROLL_STEP_PX);
    }
  };

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
              day={d}
              appts={allDayByDay.get(ymd(d)) ?? []}
              byId={byId}
              onOpenEditor={onOpenEditor}
              onMoveAppointment={onMoveAppointment}
            />
          ))}
        </div>
      )}

      <div
        ref={scrollRef}
        className="flex max-h-[70vh] min-w-[560px] overflow-y-auto border-t border-border"
        onDragOver={(e) => autoScrollNearEdge(e.clientY)}
        onPointerMove={(e) => autoScrollNearEdge(e.clientY)}
      >
        <TimeGutter ticks={ticks} settings={gridSettings} pxPerMin={pxPerMin} />
        {days.map((d) => (
          <DayColumn
            key={ymd(d)}
            day={d}
            isToday={ymd(d) === todayKey}
            settings={gridSettings}
            officeHours={settings}
            timedAppts={timedByDay.get(ymd(d)) ?? []}
            byId={byId}
            ticks={ticks}
            canvasHeightPx={canvasHeightPx}
            pxPerMin={pxPerMin}
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

function TimeGutter({
  ticks,
  settings,
  pxPerMin,
}: {
  ticks: Tick[];
  settings: CalendarSettings;
  pxPerMin: number;
}) {
  return (
    <div className="relative w-14 shrink-0">
      {ticks
        .filter((t) => t.isHour)
        .map((t) => (
          <div
            key={t.hour}
            className="absolute right-1.5 -translate-y-1/2 text-[10px] tabular-nums text-muted-foreground"
            style={{ top: (t.hour - settings.startHour) * 60 * pxPerMin }}
          >
            {String(t.hour).padStart(2, "0")}:00
          </div>
        ))}
    </div>
  );
}

function AllDayCell({
  day,
  appts,
  byId,
  onOpenEditor,
  onMoveAppointment,
}: {
  day: Date;
  appts: Appointment[];
  byId: Map<string, Patient>;
  onOpenEditor: (id: string) => void;
  onMoveAppointment: (appointmentId: string, dateTime: string) => void;
}) {
  // BUG-8: blocos "dia inteiro" agora podem ser arrastados pra outro dia
  // (o horário não importa pra allDay, só a data — meia-noite local do dia
  // alvo é suficiente). Redimensionar pra abranger vários dias exigiria um
  // campo de data-fim que o modelo não tem hoje; fica fora desta rodada.
  const [hover, setHover] = useState(false);
  return (
    <div
      className={`min-w-[120px] flex-1 space-y-0.5 border-l border-border p-0.5 transition ${hover ? "bg-primary/5" : ""}`}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes(DRAG_APPT)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        setHover(true);
      }}
      onDragLeave={() => setHover(false)}
      onDrop={(e) => {
        setHover(false);
        const apptId = e.dataTransfer.getData(DRAG_APPT);
        if (!apptId) return;
        onMoveAppointment(apptId, toIsoLocal(day));
      }}
    >
      {appts.map((a) => {
        const patient = a.patientId ? byId.get(a.patientId) : undefined;
        const color =
          a.kind === "bloqueio"
            ? (a.cor ?? FALLBACK_COLOR)
            : (TINT_TO_HEX[patient?.tint ?? ""] ?? FALLBACK_COLOR);
        return (
          <div
            key={a.id}
            draggable
            role="button"
            tabIndex={0}
            onDragStart={(e) => {
              e.dataTransfer.setData(DRAG_APPT, a.id);
              e.dataTransfer.effectAllowed = "move";
            }}
            onClick={(e) => {
              e.stopPropagation();
              onOpenEditor(a.id);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onOpenEditor(a.id);
              }
            }}
            className={`flex cursor-grab items-center gap-1 truncate rounded px-1.5 py-0.5 text-[10px] font-medium text-white transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing ${isPastAppt(a) ? "opacity-50" : ""}`}
            style={{ backgroundColor: color }}
            title={`${a.label ?? patient?.nome ?? ""} — arraste pra mover de dia`}
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
  officeHours,
  timedAppts,
  byId,
  ticks,
  canvasHeightPx,
  pxPerMin,
  onDropPatient,
  onMoveAppointment,
  onResizeAppointment,
  onOpenEditor,
  onSlotClick,
}: {
  day: Date;
  isToday: boolean;
  settings: CalendarSettings;
  // Parte 3, item 6: expediente configurado de verdade (antes do grid
  // esticar pra caber evento fora de hora) — usado só pra sombrear/avisar.
  officeHours: CalendarSettings;
  timedAppts: Appointment[];
  byId: Map<string, Patient>;
  ticks: Tick[];
  canvasHeightPx: number;
  pxPerMin: number;
  onDropPatient: (patientId: string, dateTime: string) => void;
  onMoveAppointment: (appointmentId: string, dateTime: string) => void;
  onResizeAppointment: (appointmentId: string, durationMin: number) => void;
  onOpenEditor: (id: string) => void;
  onSlotClick: (dateTime: string, durationMin?: number) => void;
}) {
  const colRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState(false);
  // Parte 3, item 8: preview de conflito de paralelismo (borda âmbar) antes
  // do submit — cálculo local, só um indicativo rápido.
  const [hoverConflict, setHoverConflict] = useState(false);
  // Criar arrastando: clique simples (delta abaixo do limiar) cria com
  // duração default; arrastar desenha a duração ao vivo, snapada ao slot.
  const [dragCreate, setDragCreate] = useState<{ startY: number; currentY: number } | null>(null);
  const layouted = useMemo(() => layoutTimedAppointments(timedAppts), [timedAppts]);

  // BUG-9: separa o que renderiza como bloco normal do que vira overflow
  // ("+N mais"), agrupado por cluster de sobreposição.
  const { visibleBlocks, overflowGroups } = useMemo(() => {
    const visible: Layouted[] = [];
    const overflowByCluster = new Map<number, Layouted[]>();
    for (const item of layouted) {
      if (item.totalCols <= MAX_VISIBLE_COLS || item.col < MAX_VISIBLE_COLS - 1) {
        visible.push(item);
      } else {
        const arr = overflowByCluster.get(item.clusterId) ?? [];
        arr.push(item);
        overflowByCluster.set(item.clusterId, arr);
      }
    }
    const groups = [...overflowByCluster.values()].map((items) => ({
      items,
      startMin: Math.min(...items.map((i) => i.startMin)),
      endMin: Math.max(...items.map((i) => i.startMin + i.durationMin)),
    }));
    return { visibleBlocks: visible, overflowGroups: groups };
  }, [layouted]);

  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const nowWithinHours =
    isToday && nowMin >= settings.startHour * 60 && nowMin < settings.endHour * 60;
  const nowTop = (nowMin - settings.startHour * 60) * pxPerMin;

  const resolveDrop = (e: React.DragEvent): Date | null => {
    if (!colRef.current) return null;
    return timeFromClientY(colRef.current, e.clientY, day, settings, pxPerMin);
  };

  // Parte 3, item 6: fora do expediente NUNCA bloqueia — só avisa. O médico
  // decide; o sistema só sinaliza que aquele horário não é o "normal" dele.
  const warnIfOutsideOfficeHours = (candidate: Date) => {
    const candidateMin = candidate.getHours() * 60 + candidate.getMinutes();
    if (candidateMin < officeHours.startHour * 60 || candidateMin >= officeHours.endHour * 60) {
      toast.warning(
        `Fora do seu expediente configurado (${officeHours.startHour}h–${officeHours.endHour}h) — agendado mesmo assim.`,
      );
    }
  };

  const dragPreview = useMemo(() => {
    if (!dragCreate || !colRef.current) return null;
    const rect = colRef.current.getBoundingClientRect();
    const top = Math.min(dragCreate.startY, dragCreate.currentY) - rect.top;
    const height = Math.max(Math.abs(dragCreate.currentY - dragCreate.startY), MIN_BLOCK_PX);
    const startCandidate = timeFromClientY(
      colRef.current,
      Math.min(dragCreate.startY, dragCreate.currentY),
      day,
      settings,
      pxPerMin,
    );
    const candidateStartMin = startCandidate.getHours() * 60 + startCandidate.getMinutes();
    const durationMin = Math.max(SNAP_MIN, height / pxPerMin);
    const conflict =
      countOverlappingConsultasLocal(timedAppts, candidateStartMin, durationMin) + 1 >
      settings.maxParallel;
    return { top: Math.max(0, top), height, conflict };
  }, [dragCreate, day, settings, pxPerMin, timedAppts]);

  // Parte 3, item 6: sombrear as horas fora do expediente configurado que só
  // aparecem porque um evento fora de hora esticou o grid (settings aqui já
  // vem esticado; officeHours é o valor original do médico).
  const beforeHoursPx =
    officeHours.startHour > settings.startHour
      ? (officeHours.startHour - settings.startHour) * 60 * pxPerMin
      : 0;
  const afterHoursPx =
    officeHours.endHour < settings.endHour
      ? (settings.endHour - officeHours.endHour) * 60 * pxPerMin
      : 0;

  return (
    <div
      ref={colRef}
      className={`relative min-w-[120px] flex-1 border-l border-border transition ${
        hoverConflict ? "bg-amber-500/10" : hover ? "bg-primary/5" : ""
      }`}
      style={{ height: canvasHeightPx }}
      onDragOver={(e) => {
        // Preview otimista: dataTransfer.getData() não é legível durante
        // dragover (só no drop), então usamos SNAP_MIN como duração — o
        // destaque visual é só indicativo, quem decide de verdade é o onDrop.
        const candidate = resolveDrop(e);
        if (!candidate || bloqueioAt(timedAppts, candidate, SNAP_MIN)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        setHover(true);
        const candidateMin = candidate.getHours() * 60 + candidate.getMinutes();
        setHoverConflict(
          countOverlappingConsultasLocal(timedAppts, candidateMin, SNAP_MIN) + 1 >
            settings.maxParallel,
        );
      }}
      onDragLeave={() => {
        setHover(false);
        setHoverConflict(false);
      }}
      onDrop={(e) => {
        setHover(false);
        setHoverConflict(false);
        const candidate = resolveDrop(e);
        if (!candidate) return;
        const apptId = e.dataTransfer.getData(DRAG_APPT);
        const durationMin = apptId
          ? Number(e.dataTransfer.getData(DRAG_APPT_DURATION)) || 30
          : settings.slotMinutes;
        const blocking = bloqueioAt(timedAppts, candidate, durationMin);
        if (blocking) {
          // BUG-6: drop rejeitado deixa de ser silencioso.
          toast.error(`Esse horário está bloqueado por "${blocking.label || "Bloqueado"}".`);
          return;
        }
        warnIfOutsideOfficeHours(candidate);
        const iso = toIsoLocal(candidate);
        if (apptId) {
          onMoveAppointment(apptId, iso);
          return;
        }
        const patientId = e.dataTransfer.getData(DRAG_KEY) || e.dataTransfer.getData("text/plain");
        if (patientId) onDropPatient(patientId, iso);
      }}
      onPointerDown={(e) => {
        if (e.target !== colRef.current || !colRef.current) return; // ignora cliques vindos de um bloco (a faixa livre à direita continua clicável)
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
        const dragThresholdPx = 8;
        const startY = Math.min(dragCreate.startY, e.clientY);
        setDragCreate(null);
        const startCandidate = timeFromClientY(colRef.current, startY, day, settings, pxPerMin);
        warnIfOutsideOfficeHours(startCandidate);
        if (deltaPx < dragThresholdPx) {
          onSlotClick(toIsoLocal(startCandidate)); // clique simples — duração default
          return;
        }
        const rawMin = deltaPx / pxPerMin;
        const snappedMin = Math.max(SNAP_MIN, Math.round(rawMin / SNAP_MIN) * SNAP_MIN);
        onSlotClick(toIsoLocal(startCandidate), snapToDurationOption(snappedMin));
      }}
      onContextMenu={(e) => {
        // BUG-3: "+ paralelo" — botão direito na coluna abre a criação nesse
        // horário mesmo em cima de um bloco já ocupado (RESERVE_PX deixa de
        // ser o único jeito de agendar em paralelo).
        e.preventDefault();
        if (!colRef.current) return;
        const candidate = timeFromClientY(colRef.current, e.clientY, day, settings, pxPerMin);
        onSlotClick(toIsoLocal(candidate));
      }}
    >
      {beforeHoursPx > 0 && (
        <div
          className="pointer-events-none absolute inset-x-0 top-0 bg-muted/50"
          style={{ height: beforeHoursPx }}
        />
      )}
      {afterHoursPx > 0 && (
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 bg-muted/50"
          style={{ height: afterHoursPx }}
        />
      )}

      {ticks.map((t, i) => (
        <div
          key={i}
          className={`pointer-events-none absolute inset-x-0 border-t ${t.isHour ? "border-border" : "border-border/40"}`}
          style={{ top: (t.hour - settings.startHour) * 60 * pxPerMin + t.minute * pxPerMin }}
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
          className={`pointer-events-none absolute inset-x-1 z-10 rounded-md border-2 border-dashed ${
            dragPreview.conflict
              ? "border-amber-500 bg-amber-500/10"
              : "border-primary bg-primary/10"
          }`}
          style={{ top: dragPreview.top, height: dragPreview.height }}
        />
      )}

      {visibleBlocks.map(({ appt, col, totalCols, startMin, durationMin }) => (
        <EventBlock
          key={appt.id}
          appt={appt}
          patient={appt.patientId ? byId.get(appt.patientId) : undefined}
          top={(startMin - settings.startHour * 60) * pxPerMin}
          height={Math.max(durationMin * pxPerMin, MIN_BLOCK_PX)}
          col={col}
          totalCols={Math.min(totalCols, MAX_VISIBLE_COLS)}
          pxPerMin={pxPerMin}
          onOpenEditor={onOpenEditor}
          onResize={onResizeAppointment}
          onAddParallel={onSlotClick}
          onMove={onMoveAppointment}
        />
      ))}

      {overflowGroups.map((group) => (
        <OverflowChip
          key={group.items[0].clusterId}
          top={(group.startMin - settings.startHour * 60) * pxPerMin}
          height={Math.max((group.endMin - group.startMin) * pxPerMin, MIN_BLOCK_PX)}
          col={MAX_VISIBLE_COLS - 1}
          totalCols={MAX_VISIBLE_COLS}
          items={group.items.map((i) => i.appt)}
          byId={byId}
          onOpenEditor={onOpenEditor}
        />
      ))}
    </div>
  );
}

function OverflowChip({
  top,
  height,
  col,
  totalCols,
  items,
  byId,
  onOpenEditor,
}: {
  top: number;
  height: number;
  col: number;
  totalCols: number;
  items: Appointment[];
  byId: Map<string, Patient>;
  onOpenEditor: (id: string) => void;
}) {
  const gutterPx = 2;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          className="absolute overflow-hidden rounded-md border border-dashed border-border bg-muted px-1.5 py-1 text-left text-[10px] font-medium text-muted-foreground transition hover:bg-muted/70"
          style={{
            top,
            height,
            left: `calc((100% - ${RESERVE_PX}px) * ${col / totalCols} + ${gutterPx}px)`,
            width: `calc((100% - ${RESERVE_PX}px) / ${totalCols} - ${gutterPx * 2}px)`,
          }}
        >
          +{items.length} mais
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-1.5" align="start">
        <div className="space-y-0.5">
          {items.map((a) => {
            const patient = a.patientId ? byId.get(a.patientId) : undefined;
            return (
              <button
                key={a.id}
                type="button"
                onClick={() => onOpenEditor(a.id)}
                className="flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-left text-xs hover:bg-accent"
              >
                <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
                  {formatHourBR(a.dateTime)}
                </span>
                <span className="truncate">{a.label || patient?.nome || "Evento"}</span>
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function EventBlock({
  appt,
  patient,
  top,
  height,
  col,
  totalCols,
  pxPerMin,
  onAddParallel,
  onOpenEditor,
  onResize,
  onMove,
}: {
  appt: Appointment;
  patient: Patient | undefined;
  top: number;
  height: number;
  col: number;
  totalCols: number;
  pxPerMin: number;
  onAddParallel: (dateTime: string, durationMin?: number) => void;
  onOpenEditor: (id: string) => void;
  onResize: (id: string, durationMin: number) => void;
  onMove: (id: string, dateTime: string) => void;
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
  const gutterPx = 2;

  // BUG-10: status vira sinal visual — "faltou" sobrepõe a cor do paciente
  // (mais importante que o tint pra identificar de relance), "confirmada"
  // ganha um contorno, "realizada" ganha um check. Bloqueio não tem status
  // que importe.
  const borderColor = !isBloqueio && appt.status === "faltou" ? "#ef4444" : color;
  const StatusIcon =
    !isBloqueio && appt.status === "realizada"
      ? CheckCircle2
      : !isBloqueio && appt.status === "faltou"
        ? XCircle
        : null;

  return (
    <div
      draggable={!isBloqueio}
      role="button"
      tabIndex={0}
      onDragStart={(e) => {
        e.dataTransfer.setData(DRAG_APPT, appt.id);
        e.dataTransfer.setData(DRAG_APPT_DURATION, String(appt.durationMin ?? 30));
        e.dataTransfer.effectAllowed = "move";
      }}
      onClick={(e) => {
        e.stopPropagation();
        onOpenEditor(appt.id);
      }}
      onKeyDown={(e) => {
        // Parte 3, item 13: teclado — Enter/Espaço abre o editor, Shift+Seta
        // move em passos de SNAP_MIN (mesma granularidade fina do drag).
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpenEditor(appt.id);
          return;
        }
        if (e.shiftKey && (e.key === "ArrowUp" || e.key === "ArrowDown") && !isBloqueio) {
          e.preventDefault();
          const deltaMin = e.key === "ArrowUp" ? -SNAP_MIN : SNAP_MIN;
          const next = new Date(appt.dateTime);
          next.setMinutes(next.getMinutes() + deltaMin);
          onMove(appt.id, toIsoLocal(next));
        }
      }}
      onContextMenu={(e) => {
        // BUG-3: "+ paralelo" — botão direito no próprio bloco também abre a
        // criação nesse mesmo horário/duração, sem precisar mirar a faixa
        // livre (RESERVE_PX).
        if (isBloqueio) return;
        e.preventDefault();
        e.stopPropagation();
        onAddParallel(appt.dateTime, appt.durationMin ?? undefined);
      }}
      title={
        isBloqueio
          ? `${appt.label || "Bloqueado"} — clique pra editar`
          : `${patient?.nome ?? ""} · ${formatHourBR(appt.dateTime)}${appt.note ? ` · ${appt.note}` : ""} — clique pra editar, arraste pra remarcar, puxe a borda de baixo pra mudar a duração, Shift+seta pra mover`
      }
      className={`group absolute cursor-pointer overflow-hidden rounded-md px-1.5 py-1 text-[10px] leading-tight transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
        isBloqueio ? "bg-slate-200 dark:bg-slate-800/70" : "active:cursor-grabbing"
      } ${isPastAppt(appt) ? "opacity-50" : ""} ${
        !isBloqueio && appt.status === "confirmada" ? "ring-1 ring-inset ring-primary/50" : ""
      }`}
      style={{
        top,
        height: displayHeight,
        left: `calc((100% - ${RESERVE_PX}px) * ${col / totalCols} + ${gutterPx}px)`,
        width: `calc((100% - ${RESERVE_PX}px) / ${totalCols} - ${gutterPx * 2}px)`,
        ...(isBloqueio
          ? {}
          : { backgroundColor: hexToRgba(color, 0.14), borderLeft: `3px solid ${borderColor}` }),
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
            {StatusIcon && (
              <StatusIcon
                className={`h-2.5 w-2.5 shrink-0 ${appt.status === "faltou" ? "text-destructive" : "text-emerald-600 dark:text-emerald-400"}`}
              />
            )}
            <span className="shrink-0 text-[9px] opacity-70">{initialsOf(patient.nome)}</span>
            <span className="truncate">{patient.nome.split(" ")[0]}</span>
            <span className="ml-auto shrink-0 text-[9px] font-normal text-muted-foreground">
              {formatHourBR(appt.dateTime)}
            </span>
          </div>
        )
      )}

      {!isBloqueio && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onAddParallel(appt.dateTime, appt.durationMin ?? undefined);
          }}
          title="Agendar em paralelo neste horário"
          aria-label="Agendar em paralelo neste horário"
          className="absolute right-0.5 top-0.5 z-10 flex h-3.5 w-3.5 items-center justify-center rounded-sm bg-background/80 text-foreground opacity-0 shadow-sm transition group-hover:opacity-100 hover:bg-background"
        >
          <Plus className="h-2.5 w-2.5" />
        </button>
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
            const deltaMin = resizeDeltaPx / pxPerMin;
            const snapped = Math.max(
              SNAP_MIN,
              Math.round((baseDuration + deltaMin) / SNAP_MIN) * SNAP_MIN,
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
