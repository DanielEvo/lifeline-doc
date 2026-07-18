import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  Activity,
  CheckCircle2,
  ClipboardList,
  FileUp,
  FlaskConical,
  HeartPulse,
  Loader2,
  LogOut,
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

function PatientAppPage() {
  const navigate = useNavigate();
  const [session, setSession] = useState<PatientSession | null>(null);
  const [state, setState] = useState<TimelineData>({ status: "loading" });
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

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4">
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

      <main className="mx-auto max-w-3xl space-y-5 px-4 py-8">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Meu histórico</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            {firstName ? `Olá, ${firstName}` : "Olá"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Complete seu perfil e envie exames — eles ficam com você até um médico revisar.
          </p>
        </div>

        {state.status === "loading" && (
          <div className="flex items-center justify-center rounded-3xl border border-border bg-card p-16 text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin text-primary" />
            Carregando…
          </div>
        )}

        {state.status === "error" && (
          <div className="rounded-3xl border border-border bg-card p-10 text-center text-sm text-muted-foreground">
            {state.msg}
          </div>
        )}

        {state.status === "ready" && session && (
          <>
            <ProfileCard
              token={session.token}
              profile={state.profile}
              onSaved={() => load(session.token)}
            />

            <ExamsCard
              pending={state.pending}
              onOpenUpload={() => setUploadOpen(true)}
            />

            <UnlinkedCard />

            <UploadPatientDialog
              open={uploadOpen}
              onOpenChange={setUploadOpen}
              token={session.token}
              onSaved={() => load(session.token)}
            />
          </>
        )}
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Perfil autodeclarado
// ---------------------------------------------------------------------------

function ProfileCard({
  token,
  profile,
  onSaved,
}: {
  token: string;
  profile: Profile;
  onSaved: () => void;
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
    <section className="rounded-3xl border border-border bg-card p-6 shadow-sm">
      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <UserIcon className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-base font-semibold tracking-tight">Complete seu perfil</h2>
          <p className="text-xs text-muted-foreground">
            Dados autodeclarados — visíveis apenas para você e para o médico que você autorizar.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
        <Field label="CPF (opcional)" hint="Usado no futuro para conectar a médicos que você já visitou — nunca automático.">
          <Input
            inputMode="numeric"
            placeholder="000.000.000-00"
            value={form.cpf}
            onChange={(e) => setForm({ ...form, cpf: e.target.value })}
          />
        </Field>
        <Field label="Alergias" className="sm:col-span-2">
          <Textarea
            rows={2}
            placeholder="Ex.: dipirona, amendoim, látex"
            value={form.alergias}
            onChange={(e) => setForm({ ...form, alergias: e.target.value })}
          />
        </Field>
      </div>

      <div className="mt-4 flex justify-end">
        <Button
          onClick={submit}
          disabled={!dirty || saving}
          className="brand-gradient text-primary-foreground"
        >
          {saving ? (
            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-1.5 h-4 w-4" />
          )}
          Salvar perfil
        </Button>
      </div>
    </section>
  );
}

function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      <div className="mt-1">{children}</div>
      {hint && <p className="mt-1 text-[11px] text-muted-foreground/80">{hint}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Meus exames — lista + botão de upload
// ---------------------------------------------------------------------------

function ExamsCard({
  pending,
  onOpenUpload,
}: {
  pending: PendingItem[];
  onOpenUpload: () => void;
}) {
  return (
    <section className="rounded-3xl border border-border bg-card p-6 shadow-sm">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <FlaskConical className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-semibold tracking-tight">Meus exames</h2>
            <p className="text-xs text-muted-foreground">
              Envie PDFs ou fotos — a leitura é automática, mas só um médico valida.
            </p>
          </div>
        </div>
        <Button
          size="sm"
          onClick={onOpenUpload}
          className="brand-gradient text-primary-foreground"
        >
          <FileUp className="mr-1.5 h-4 w-4" />
          Enviar exame
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
              className="flex items-center justify-between gap-3 rounded-xl bg-muted/40 px-3 py-2 text-sm"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{m.name}</p>
                {m.collectionDate && (
                  <p className="text-[11px] text-muted-foreground">
                    Coleta {new Date(m.collectionDate).toLocaleDateString("pt-BR")}
                  </p>
                )}
              </div>
              <div className="shrink-0 text-right">
                <p className="font-semibold tabular-nums">
                  {m.value}
                  <span className="ml-1 text-[11px] font-normal text-muted-foreground">{m.unit}</span>
                </p>
              </div>
              <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                Aguardando revisão médica
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Estado "unlinked" — histórico oficial só aparece via médico
// ---------------------------------------------------------------------------

function UnlinkedCard() {
  return (
    <section className="rounded-3xl border border-border bg-card p-8 text-center shadow-sm">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <HeartPulse className="h-7 w-7" />
      </div>
      <h2 className="mt-4 text-base font-semibold tracking-tight">
        Aguardando seu médico liberar o acesso ao seu histórico.
      </h2>
      <p className="mx-auto mt-1.5 max-w-md text-sm text-muted-foreground">
        Consultas, prescrições e laudos oficiais aparecem aqui quando um profissional vincular seu
        prontuário à sua conta.
      </p>
      <div className="mx-auto mt-4 inline-flex items-center gap-2 rounded-full border border-border bg-muted/50 px-3 py-1.5 text-[11px] text-muted-foreground">
        <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
        Seus dados, sob seu controle
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Upload dialog — replica UploadExamesDialog do médico (mesmo pipeline OCR).
// Não usa patientId; só o token do paciente. Escreve em pending_measurements.
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
