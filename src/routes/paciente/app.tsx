// Tela do paciente — mesmo vocabulário visual do Step D da demo (moldura
// de celular + 5 tabs), mas ligada aos dados reais (perfil autodeclarado +
// exames pendentes vindos do OCR do paciente). Não inventa métricas fake:
// abas sem dados mostram estado vazio honesto.

import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  Activity,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  FileText,
  FileUp,
  FlaskConical,
  HeartPulse,
  Home,
  Loader2,
  LogOut,
  Pill,
  Save,
  ShieldCheck,
  User as UserIcon,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  confirmPatientMeasurements,
  extractExamDocumentPatient,
  getPatientTimeline,
  logoutPatient,
  updatePatientProfile,
} from "@/lib/api/patient-auth.functions";
import { BIOMARKER_CATALOG } from "@/lib/clinic-types";
import {
  clearPatientSession,
  getPatientSession,
  type PatientSession,
} from "@/lib/patient-session";
import {
  VerticalTimeline,
  type VerticalEvent,
} from "@/components/patient/vertical-timeline";

export const Route = createFileRoute("/paciente/app")({
  head: () => ({
    meta: [
      { title: "LifeLine · Meu histórico" },
      { name: "description", content: "Seu histórico de saúde no LifeLine." },
    ],
  }),
  component: PatientAppPage,
});

type PendingItem = {
  id: string;
  name: string;
  value: number;
  unit: string;
  collectionDate: string | null;
};

type Profile = {
  birthDate: string | null;
  sexo: "F" | "M" | "outro" | null;
  telefone: string | null;
  cpf: string | null;
  tipoSanguineo: string | null;
  alergias: string | null;
};

type TimelineData =
  | { status: "loading" }
  | { status: "ready"; profile: Profile; pending: PendingItem[] }
  | { status: "error"; msg: string };

type Tab = "home" | "history" | "exams" | "meds" | "profile";

const TABS: { id: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "home", label: "Início", icon: Home },
  { id: "history", label: "Histórico", icon: FileText },
  { id: "exams", label: "Exames", icon: CalendarDays },
  { id: "meds", label: "Remédios", icon: Pill },
  { id: "profile", label: "Perfil", icon: UserIcon },
];

function PatientAppPage() {
  const navigate = useNavigate();
  const [session, setSession] = useState<PatientSession | null>(null);
  const [state, setState] = useState<TimelineData>({ status: "loading" });
  const [tab, setTab] = useState<Tab>("home");
  const [uploadOpen, setUploadOpen] = useState(false);

  const load = async (token: string) => {
    try {
      const r = await getPatientTimeline({ data: { token } });
      if (!r.ok) {
        clearPatientSession();
        navigate({ to: "/paciente/login" });
        return;
      }
      setState({
        status: "ready",
        profile: r.profile as Profile,
        pending: r.pendingMeasurements as PendingItem[],
      });
    } catch {
      setState({ status: "error", msg: "Não consegui carregar agora." });
    }
  };

  useEffect(() => {
    const s = getPatientSession();
    if (!s) {
      navigate({ to: "/paciente/login" });
      return;
    }
    setSession(s);
    load(s.token);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate]);

  const handleLogout = async () => {
    const s = getPatientSession();
    if (s) {
      try {
        await logoutPatient({ data: { token: s.token } });
      } catch {
        // segue
      }
    }
    clearPatientSession();
    toast.success("Você saiu da sua conta.");
    navigate({ to: "/paciente/login" });
  };

  const firstName = session?.nome.split(" ")[0] ?? "";

  // Deriva a linha do tempo vertical a partir dos exames pendentes,
  // agrupando por mês/ano da coleta.
  const timelineEvents = useMemo<VerticalEvent[]>(() => {
    if (state.status !== "ready") return [];
    const groups = new Map<string, PendingItem[]>();
    for (const p of state.pending) {
      const key = (p.collectionDate ?? "").slice(0, 7) || "sem-data";
      groups.set(key, [...(groups.get(key) ?? []), p]);
    }
    const events: VerticalEvent[] = [];
    for (const [key, items] of groups.entries()) {
      const date = key === "sem-data" ? new Date().toISOString().slice(0, 10) : `${key}-01`;
      events.push({
        key: `exam-${key}`,
        kind: "exame",
        date,
        title: `Exames enviados (${items.length})`,
        summary: items.map((m) => `${m.name} ${m.value}${m.unit}`).join(" · "),
        status: "Pendente",
      });
    }
    return events.sort((a, b) => b.date.localeCompare(a.date));
  }, [state]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-muted/40 via-background to-muted/20">
      <header className="border-b border-border/60 bg-background/70 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <Link to="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg brand-gradient shadow-md shadow-primary/30">
              <Activity className="h-4 w-4 text-primary-foreground" strokeWidth={2.5} />
            </div>
            <span className="text-sm font-semibold tracking-tight">LifeLine</span>
          </Link>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleLogout}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            <LogOut className="mr-1.5 h-3.5 w-3.5" />
            Sair
          </Button>
        </div>
      </header>

      <main className="mx-auto grid max-w-5xl gap-8 px-4 py-10 md:grid-cols-[1fr_auto_1fr]">
        {/* painel lateral esquerdo — só em md+ */}
        <aside className="hidden md:flex md:flex-col md:justify-center">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Meu histórico</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">
            {firstName ? `Olá, ${firstName}` : "Olá"}
          </h1>
          <p className="mt-2 max-w-xs text-sm text-muted-foreground">
            Este é o LifeLine no seu bolso. Complete seu perfil, envie exames e acompanhe sua
            linha do tempo — os dados oficiais aparecem quando um médico vincular seu
            prontuário.
          </p>
          <div className="mt-4 inline-flex w-fit items-center gap-2 rounded-full border border-border bg-muted/50 px-3 py-1.5 text-[11px] text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
            Seus dados, sob seu controle
          </div>
        </aside>

        <PhoneFrame>
          <PhoneStatusBar />
          <PhoneHeader firstName={firstName} />

          <div className="min-h-0 flex-1 overflow-y-auto bg-muted/30 px-4 py-4">
            {state.status === "loading" && (
              <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin text-primary" />
                Carregando…
              </div>
            )}

            {state.status === "error" && (
              <div className="rounded-2xl border border-border bg-card p-6 text-center text-xs text-muted-foreground">
                {state.msg}
              </div>
            )}

            {state.status === "ready" && session && (
              <>
                {tab === "home" && (
                  <HomeTab
                    firstName={firstName}
                    pendingCount={state.pending.length}
                    profile={state.profile}
                    onGoTo={setTab}
                  />
                )}
                {tab === "history" && <HistoryTab events={timelineEvents} />}
                {tab === "exams" && (
                  <ExamsTab
                    pending={state.pending}
                    onOpenUpload={() => setUploadOpen(true)}
                  />
                )}
                {tab === "meds" && <EmptyMeds />}
                {tab === "profile" && (
                  <ProfileTab
                    token={session.token}
                    profile={state.profile}
                    onSaved={() => load(session.token)}
                    onLogout={handleLogout}
                  />
                )}
              </>
            )}
          </div>

          <TabBar active={tab} onChange={setTab} />
        </PhoneFrame>

        {/* espaço decorativo à direita — mantém a moldura centralizada em md+ */}
        <div className="hidden md:block" />
      </main>

      {state.status === "ready" && session && (
        <UploadPatientDialog
          open={uploadOpen}
          onOpenChange={setUploadOpen}
          token={session.token}
          onSaved={() => load(session.token)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Moldura de celular
// ---------------------------------------------------------------------------

function PhoneFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex h-[720px] w-full max-w-[400px] flex-col overflow-hidden rounded-[2.5rem] border-[10px] border-foreground/90 bg-card shadow-2xl shadow-primary/10">
      {children}
    </div>
  );
}

function PhoneStatusBar() {
  return (
    <div className="flex items-center justify-between bg-foreground/95 px-6 py-1.5 text-[10px] font-medium text-background">
      <span>9:41</span>
      <span className="flex items-center gap-1">
        <span>••••</span>
        <span>5G</span>
      </span>
    </div>
  );
}

function PhoneHeader({ firstName }: { firstName: string }) {
  return (
    <div className="flex items-center gap-3 border-b border-border bg-background px-4 py-3">
      <div className="flex h-9 w-9 items-center justify-center rounded-xl brand-gradient text-primary-foreground shadow">
        <Activity className="h-4 w-4" strokeWidth={2.5} />
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold tracking-tight">
          {firstName ? `Olá, ${firstName}` : "LifeLine"}
        </p>
        <p className="text-[10px] text-muted-foreground">Seu histórico de saúde</p>
      </div>
    </div>
  );
}

function TabBar({ active, onChange }: { active: Tab; onChange: (t: Tab) => void }) {
  return (
    <nav className="grid grid-cols-5 border-t border-border bg-background">
      {TABS.map((t) => {
        const Icon = t.icon;
        const isActive = t.id === active;
        return (
          <button
            key={t.id}
            onClick={() => onChange(t.id)}
            className={`flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium transition ${
              isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon className="h-4 w-4" />
            {t.label}
          </button>
        );
      })}
    </nav>
  );
}

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------

function HomeTab({
  firstName,
  pendingCount,
  profile,
  onGoTo,
}: {
  firstName: string;
  pendingCount: number;
  profile: Profile;
  onGoTo: (t: Tab) => void;
}) {
  const profileFilled =
    !!profile.birthDate &&
    !!profile.sexo &&
    !!profile.telefone &&
    !!profile.tipoSanguineo;

  return (
    <div className="space-y-3">
      <div className="rounded-2xl bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-4 ring-1 ring-primary/10">
        <p className="text-[10px] uppercase tracking-wide text-primary/80">Bem-vindo(a)</p>
        <h2 className="mt-0.5 text-lg font-semibold tracking-tight">
          {firstName ? `Olá, ${firstName}` : "Olá"}
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Seu histórico começa por aqui — envie seus exames e mantenha seu perfil atualizado.
        </p>
      </div>

      <button
        onClick={() => onGoTo("exams")}
        className="flex w-full items-center gap-3 rounded-2xl border border-border bg-card p-3 text-left transition hover:border-primary/40"
      >
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
          <FlaskConical className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">Exames enviados</p>
          <p className="text-[11px] text-muted-foreground">
            {pendingCount === 0
              ? "Nenhum exame ainda. Envie o primeiro."
              : `${pendingCount} aguardando revisão médica`}
          </p>
        </div>
      </button>

      <button
        onClick={() => onGoTo("profile")}
        className="flex w-full items-center gap-3 rounded-2xl border border-border bg-card p-3 text-left transition hover:border-primary/40"
      >
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <UserIcon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">
            {profileFilled ? "Perfil completo" : "Complete seu perfil"}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {profileFilled
              ? "Suas informações estão prontas."
              : "Nascimento, sexo, telefone e tipo sanguíneo."}
          </p>
        </div>
      </button>

      <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-4 text-center">
        <HeartPulse className="mx-auto h-6 w-6 text-primary/70" />
        <p className="mt-2 text-xs text-muted-foreground">
          Consultas oficiais aparecem quando um médico vincular seu prontuário.
        </p>
      </div>
    </div>
  );
}

function HistoryTab({ events }: { events: VerticalEvent[] }) {
  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold tracking-tight">Linha do tempo</h3>
        <p className="text-[11px] text-muted-foreground">
          Exames, consultas e cirurgias em ordem cronológica.
        </p>
      </div>
      <VerticalTimeline events={events} />
    </div>
  );
}

function ExamsTab({
  pending,
  onOpenUpload,
}: {
  pending: PendingItem[];
  onOpenUpload: () => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold tracking-tight">Meus exames</h3>
          <p className="text-[11px] text-muted-foreground">
            Envie PDFs ou fotos — a leitura é automática, mas só um médico valida.
          </p>
        </div>
        <Button
          size="sm"
          onClick={onOpenUpload}
          className="brand-gradient shrink-0 text-primary-foreground"
        >
          <FileUp className="mr-1.5 h-3.5 w-3.5" />
          Enviar
        </Button>
      </div>

      {pending.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-6 text-center text-xs text-muted-foreground">
          Você ainda não enviou nenhum exame.
        </div>
      ) : (
        <ul className="space-y-1.5">
          {pending.map((m) => (
            <li
              key={m.id}
              className="rounded-xl border border-border bg-card p-3 text-sm"
            >
              <div className="flex items-center justify-between gap-3">
                <p className="min-w-0 flex-1 truncate font-medium">{m.name}</p>
                <p className="shrink-0 font-semibold tabular-nums">
                  {m.value}
                  <span className="ml-1 text-[11px] font-normal text-muted-foreground">
                    {m.unit}
                  </span>
                </p>
              </div>
              <div className="mt-1 flex items-center justify-between text-[10px] text-muted-foreground">
                <span>
                  {m.collectionDate
                    ? `Coleta ${new Date(m.collectionDate).toLocaleDateString("pt-BR")}`
                    : "Sem data"}
                </span>
                <span className="rounded-full bg-muted px-2 py-0.5 uppercase tracking-wide">
                  Aguardando revisão
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function EmptyMeds() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <Pill className="h-7 w-7" />
      </div>
      <div>
        <p className="text-sm font-semibold">Nenhum medicamento prescrito</p>
        <p className="mx-auto mt-1 max-w-[240px] text-[11px] text-muted-foreground">
          Suas prescrições aparecem aqui quando um médico vincular seu histórico.
        </p>
      </div>
    </div>
  );
}

function ProfileTab({
  token,
  profile,
  onSaved,
  onLogout,
}: {
  token: string;
  profile: Profile;
  onSaved: () => void;
  onLogout: () => void;
}) {
  const [form, setForm] = useState({
    birthDate: profile.birthDate ?? "",
    sexo: (profile.sexo ?? "") as "" | "F" | "M" | "outro",
    telefone: profile.telefone ?? "",
    cpf: profile.cpf ?? "",
    tipoSanguineo: profile.tipoSanguineo ?? "",
    alergias: profile.alergias ?? "",
  });
  const [saving, setSaving] = useState(false);

  const dirty =
    form.birthDate !== (profile.birthDate ?? "") ||
    form.sexo !== (profile.sexo ?? "") ||
    form.telefone !== (profile.telefone ?? "") ||
    form.cpf !== (profile.cpf ?? "") ||
    form.tipoSanguineo !== (profile.tipoSanguineo ?? "") ||
    form.alergias !== (profile.alergias ?? "");

  const submit = async () => {
    setSaving(true);
    try {
      const r = await updatePatientProfile({
        data: {
          token,
          birthDate: form.birthDate || undefined,
          sexo: form.sexo || undefined,
          telefone: form.telefone || undefined,
          cpf: form.cpf || undefined,
          tipoSanguineo: form.tipoSanguineo || undefined,
          alergias: form.alergias || undefined,
        },
      });
      if (!r.ok) {
        toast.error("Não consegui salvar seu perfil.");
        return;
      }
      toast.success("Perfil atualizado.");
      onSaved();
    } catch {
      toast.error("Não consegui salvar seu perfil.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold tracking-tight">Seu perfil</h3>
        <p className="text-[11px] text-muted-foreground">
          Dados autodeclarados — visíveis para você e para o médico que autorizar.
        </p>
      </div>

      <div className="space-y-2.5 rounded-2xl border border-border bg-card p-3">
        <Field label="Data de nascimento">
          <Input
            type="date"
            value={form.birthDate}
            onChange={(e) => setForm({ ...form, birthDate: e.target.value })}
          />
        </Field>
        <Field label="Sexo">
          <Select
            value={form.sexo || undefined}
            onValueChange={(v) => setForm({ ...form, sexo: v as typeof form.sexo })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Selecionar" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="F">Feminino</SelectItem>
              <SelectItem value="M">Masculino</SelectItem>
              <SelectItem value="outro">Outro</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Telefone">
          <Input
            inputMode="tel"
            placeholder="(00) 00000-0000"
            value={form.telefone}
            onChange={(e) => setForm({ ...form, telefone: e.target.value })}
          />
        </Field>
        <Field label="Tipo sanguíneo">
          <Select
            value={form.tipoSanguineo || undefined}
            onValueChange={(v) => setForm({ ...form, tipoSanguineo: v })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Selecionar" />
            </SelectTrigger>
            <SelectContent>
              {["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"].map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field
          label="CPF (opcional)"
          hint="Usado no futuro para conectar a médicos que você já visitou — nunca automático."
        >
          <Input
            inputMode="numeric"
            placeholder="000.000.000-00"
            value={form.cpf}
            onChange={(e) => setForm({ ...form, cpf: e.target.value })}
          />
        </Field>
        <Field label="Alergias">
          <Textarea
            rows={2}
            placeholder="Ex.: dipirona, amendoim, látex"
            value={form.alergias}
            onChange={(e) => setForm({ ...form, alergias: e.target.value })}
          />
        </Field>

        <Button
          onClick={submit}
          disabled={!dirty || saving}
          className="brand-gradient w-full text-primary-foreground"
        >
          {saving ? (
            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-1.5 h-4 w-4" />
          )}
          Salvar perfil
        </Button>
      </div>

      <Button
        variant="outline"
        onClick={onLogout}
        className="w-full text-xs text-muted-foreground"
      >
        <LogOut className="mr-1.5 h-3.5 w-3.5" />
        Sair da conta
      </Button>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <Label className="text-[11px] font-medium text-muted-foreground">{label}</Label>
      <div className="mt-1">{children}</div>
      {hint && <p className="mt-1 text-[10px] text-muted-foreground/80">{hint}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Upload dialog — mesmo pipeline OCR do médico, escopo do paciente.
// ---------------------------------------------------------------------------

type FileEntry = {
  file: File;
  state: "reading" | "review" | "done" | "error";
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
};

const ACCEPTED_EXTS = [".pdf", ".jpg", ".jpeg", ".png"];

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function UploadPatientDialog({
  open,
  onOpenChange,
  token,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
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
      return { file, state: "reading" };
    });
    setFiles((prev) => [...prev, ...entries]);

    for (const entry of entries) {
      if (entry.state !== "reading") continue;
      try {
        const base64 = await fileToBase64(entry.file);
        const mimeType = entry.file.type || "application/pdf";
        const result = await extractExamDocumentPatient({
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          data: { token, fileBase64: base64, mimeType: mimeType as any },
        });
        if (!result.ok) {
          setFiles((prev) =>
            prev.map((f) =>
              f.file === entry.file
                ? { ...f, state: "error", errorMsg: "Falha na leitura do documento" }
                : f,
            ),
          );
          continue;
        }
        setFiles((prev) =>
          prev.map((f) =>
            f.file === entry.file
              ? {
                  ...f,
                  state: "review",
                  extracted: result.items,
                  collectionDate: result.collectionDate,
                }
              : f,
          ),
        );
      } catch {
        setFiles((prev) =>
          prev.map((f) =>
            f.file === entry.file
              ? { ...f, state: "error", errorMsg: "Erro ao processar arquivo" }
              : f,
          ),
        );
      }
    }
  }

  const confirmarExame = async (entry: FileEntry) => {
    if (!entry.extracted || entry.extracted.length === 0) return;
    const mapped = entry.extracted
      .map((it) => {
        const name = it.matchedName ?? it.manualOverrideName ?? null;
        if (!name) return null;
        return {
          rawName: it.rawName,
          name,
          value: it.value,
          unit: it.unit,
          refMin: it.refMin ?? null,
          refMax: it.refMax ?? null,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);

    if (mapped.length === 0) {
      toast.error("Nenhum biomarcador mapeado neste exame — reconheça antes de salvar.");
      return;
    }
    const r = await confirmPatientMeasurements({
      data: {
        token,
        date: entry.collectionDate || new Date().toISOString().slice(0, 10),
        items: mapped,
      },
    });
    if (!r.ok) {
      toast.error("Não consegui salvar seus exames.");
      return;
    }
    setFiles((prev) => prev.map((f) => (f.file === entry.file ? { ...f, state: "done" } : f)));
    toast.success(
      `${r.added} biomarcador${r.added === 1 ? "" : "es"} enviado${r.added === 1 ? "" : "s"} para revisão.`,
    );
    onSaved();
  };

  const doneCount = files.filter((f) => f.state === "done").length;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) setFiles([]);
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileUp className="h-4 w-4 text-primary" /> Meus exames
          </DialogTitle>
          <DialogDescription>
            Anexe PDFs ou imagens dos seus exames. O sistema lê o documento e identifica os
            biomarcadores — revise os valores antes de enviar.
          </DialogDescription>
        </DialogHeader>
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
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
          <p className="text-[11px] text-muted-foreground/70">.pdf · .jpg · .jpeg · .png</p>
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
                    {entry.state === "reading" && "Lendo documento…"}
                    {entry.state === "review" && "Revise abaixo"}
                    {entry.state === "done" && "✓ enviado"}
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
                                        xi === j
                                          ? { ...x, value: Number.isNaN(v) ? x.value : v }
                                          : x,
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
                    <Button
                      size="sm"
                      className="w-full brand-gradient text-primary-foreground"
                      disabled={entry.extracted.length === 0}
                      onClick={() => confirmarExame(entry)}
                    >
                      Confirmar e enviar
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
          <Button
            className="brand-gradient text-primary-foreground"
            disabled={doneCount === 0}
            onClick={() => {
              onOpenChange(false);
              setFiles([]);
            }}
          >
            Concluir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
