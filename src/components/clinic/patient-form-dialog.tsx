// Cadastro/edição de paciente — o mesmo dialog serve o Kanban, o painel de
// pacientes e o prontuário. Validação zod + react-hook-form; a gravação real
// acontece na server fn autenticada passada em `onSubmit`. As opções de
// status vêm do board do médico (kanban flexível).
//
// Patch A.1 — no modo CRIAÇÃO (sem `patient`) o dialog absorve o antigo
// pré-cadastro: busca por ID (dedupe) + dropzone de exames com OCR simulado.
// No modo EDIÇÃO nada disso aparece. A orquestração de gravação fica no
// chamador via `onSubmit(values, intake)`.

import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { useMutation } from "@tanstack/react-query";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  CheckCircle2,
  FileUp,
  Loader2,
  Search,
  UserCheck,
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { lookupPatientByCode } from "@/lib/api/clinic.functions";
import { useClinic } from "@/lib/clinic-context";
import { ageFrom, CONVENIOS, type BoardColumn, type Patient } from "@/lib/clinic-types";

const schema = z.object({
  nome: z.string().min(2, "Nome muito curto").max(120),
  nascimento: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida")
    .or(z.literal(""))
    .optional(),
  sexo: z.enum(["feminino", "masculino", "outro", ""]).optional(),
  cpf: z
    .string()
    .regex(/^(\d{3}\.?\d{3}\.?\d{3}-?\d{2})?$/, "CPF inválido")
    .optional(),
  telefone: z.string().max(24).optional(),
  email: z.string().email("E-mail inválido").max(160).or(z.literal("")).optional(),
  convenio: z.string().max(60).optional(),
  queixa: z.string().max(300).optional(),
  column: z.string().min(1),
});

export type PatientFormValues = z.infer<typeof schema>;

export type PatientIntake = { foundPatient: Patient | null; fileNames: string[] };

const ACCEPTED_EXTS = [".pdf", ".jpg", ".jpeg", ".png"];

type FileEntry = { file: File; state: "reading" | "done" | "error"; errorMsg?: string };

export function PatientFormDialog({
  open,
  onOpenChange,
  patient,
  columns,
  onSubmit,
  saving,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  patient?: Patient | null; // presente = edição
  columns: BoardColumn[];
  // No modo criação, o 2º argumento carrega busca-por-ID + exames anexados.
  onSubmit: (values: PatientFormValues, intake?: PatientIntake) => Promise<void> | void;
  saving: boolean;
}) {
  const isEdit = !!patient;
  const firstCol = columns[0]?.id ?? "triagem";
  const blank: PatientFormValues = {
    nome: "",
    nascimento: "",
    sexo: "",
    cpf: "",
    telefone: "",
    email: "",
    convenio: "",
    queixa: "",
    column: firstCol,
  };

  const form = useForm<PatientFormValues>({
    resolver: zodResolver(schema),
    defaultValues: blank,
  });

  // ----- Estado do intake (só relevante no modo criação) -----
  const { token } = useClinic();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [idInput, setIdInput] = useState("");
  const [lookupDone, setLookupDone] = useState(false);
  const [foundPatient, setFoundPatient] = useState<Patient | null>(null);
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [dragging, setDragging] = useState(false);

  const resetIntake = () => {
    setIdInput("");
    setLookupDone(false);
    setFoundPatient(null);
    setFiles([]);
    setDragging(false);
  };

  useEffect(() => {
    if (!open) return;
    form.reset(
      patient
        ? {
            nome: patient.nome,
            nascimento: patient.nascimento ?? "",
            sexo: patient.sexo ?? "",
            cpf: patient.cpf ?? "",
            telefone: patient.telefone ?? "",
            email: patient.email ?? "",
            convenio: patient.convenio ?? "",
            queixa: patient.queixa,
            column: patient.column,
          }
        : blank,
    );
    resetIntake();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, patient]);

  const lookupMut = useMutation({
    mutationFn: () => lookupPatientByCode({ data: { token, code: idInput } }),
    onSuccess: (r) => {
      setLookupDone(true);
      if (!r.ok) return toast.error("Sessão expirada.");
      setFoundPatient(r.patient);
    },
  });

  function processFiles(fileList: FileList) {
    const entries: FileEntry[] = Array.from(fileList).map((file) => {
      const ext = "." + (file.name.split(".").pop()?.toLowerCase() ?? "");
      if (!ACCEPTED_EXTS.includes(ext)) {
        return { file, state: "error" as const, errorMsg: `Formato não suportado (${ext || "?"})` };
      }
      return { file, state: "reading" as const };
    });
    setFiles((prev) => [...prev, ...entries]);
    entries.forEach((entry) => {
      if (entry.state === "reading") {
        setTimeout(() => {
          setFiles((prev) =>
            prev.map((f) => (f.file === entry.file ? { ...f, state: "done" as const } : f)),
          );
        }, 800);
      }
    });
  }

  const doneNames = files.filter((f) => f.state === "done").map((f) => f.file.name);

  const err = form.formState.errors;

  // Submissão: edição e cadastro-novo passam pela validação zod; paciente
  // encontrado por ID dispensa o formulário (só anexa exames).
  const submitNew = form.handleSubmit((v) =>
    onSubmit(v, isEdit ? undefined : { foundPatient: null, fileNames: doneNames }),
  );
  const submitFound = () =>
    onSubmit(form.getValues(), { foundPatient, fileNames: doneNames });

  const showForm = isEdit || !foundPatient; // esconde campos quando achou por ID
  const submitLabel = isEdit
    ? "Salvar alterações"
    : foundPatient
      ? doneNames.length > 0
        ? "Salvar exames"
        : "Confirmar"
      : "Cadastrar paciente";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar paciente" : "Novo paciente"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Contato, convênio e status podem mudar. Identidade (nome, nascimento, sexo, CPF) é fixa após o cadastro."
              : "Busque por ID para reencontrar um paciente, ou cadastre um novo. Anexe exames se tiver."}
          </DialogDescription>
        </DialogHeader>

        {/* Identidade — somente leitura no modo edição; nome/nascimento/sexo/CPF
            não são exibidos como campos editáveis (dado fixo pós-cadastro). */}
        {isEdit && patient && (
          <div className="rounded-xl border border-border bg-muted/30 p-3">
            <div className="text-sm font-medium">{patient.nome}</div>
            <div className="mt-0.5 text-[11px] text-muted-foreground">
              {ageFrom(patient.nascimento) !== null && `${ageFrom(patient.nascimento)} anos`}
              {patient.sexo && ` · ${patient.sexo}`}
              {patient.cpf && ` · CPF ${patient.cpf}`}
              {patient.patientCode && ` · Código ${patient.patientCode}`}
            </div>
          </div>
        )}

        {/* Bloco de busca por ID — só no modo criação */}
        {!isEdit && (
          <div className="rounded-xl border border-border bg-muted/30 p-3">
            <Label className="text-xs font-medium">ID do paciente (opcional)</Label>
            <div className="mt-1.5 flex gap-2">
              <Input
                value={idInput}
                onChange={(e) => {
                  setIdInput(e.target.value.toUpperCase());
                  setLookupDone(false);
                  setFoundPatient(null);
                }}
                placeholder="LFL-XXXX"
                className="font-mono uppercase"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    if (idInput.trim().length >= 3) lookupMut.mutate();
                  }
                }}
              />
              <Button
                type="button"
                variant="outline"
                disabled={idInput.trim().length < 3 || lookupMut.isPending}
                onClick={() => lookupMut.mutate()}
              >
                {lookupMut.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Search className="h-4 w-4" />
                )}
                <span className="ml-1.5">Buscar</span>
              </Button>
            </div>

            {lookupDone && !foundPatient && (
              <p className="mt-2 text-[12px] text-amber-600 dark:text-amber-400">
                Nenhum paciente com esse ID — preencha o cadastro abaixo.
              </p>
            )}

            {foundPatient && (
              <div className="mt-3 flex items-start gap-3 rounded-lg bg-emerald-50 p-3 ring-1 ring-emerald-200 dark:bg-emerald-950/40 dark:ring-emerald-800">
                <UserCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-emerald-900 dark:text-emerald-100">
                    Paciente já cadastrado
                  </div>
                  <div className="mt-0.5 text-sm text-emerald-800 dark:text-emerald-200">
                    {foundPatient.nome}
                    {ageFrom(foundPatient.nascimento) !== null && `, ${ageFrom(foundPatient.nascimento)} anos`}
                    {foundPatient.telefone && ` · ${foundPatient.telefone}`}
                    {foundPatient.convenio && ` · ${foundPatient.convenio}`}
                  </div>
                  <div className="mt-0.5 text-[11px] text-emerald-600 dark:text-emerald-400">
                    Código: {foundPatient.patientCode} · anexe os exames abaixo
                  </div>
                </div>
                <button
                  type="button"
                  onClick={resetIntake}
                  className="shrink-0 text-emerald-600 hover:text-emerald-800 dark:text-emerald-400"
                  title="Limpar"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>
        )}

        {/* Campos de cadastro — escondidos quando achou paciente por ID.
            Nome/nascimento/sexo/CPF só aparecem no cadastro NOVO — no modo
            edição são fixos e já foram mostrados no card de identidade acima. */}
        {showForm && (
          <form onSubmit={submitNew} className="grid grid-cols-2 gap-3">
            {!isEdit && (
              <>
                <div className="col-span-2 space-y-1">
                  <Label htmlFor="pf-nome" className="text-xs">Nome completo *</Label>
                  <Input id="pf-nome" {...form.register("nome")} placeholder="Maria de Souza" />
                  {err.nome && <p className="text-[11px] text-destructive">{err.nome.message}</p>}
                </div>

                <div className="space-y-1">
                  <Label htmlFor="pf-nasc" className="text-xs">Nascimento</Label>
                  <Input id="pf-nasc" type="date" {...form.register("nascimento")} />
                  {err.nascimento && <p className="text-[11px] text-destructive">{err.nascimento.message}</p>}
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Sexo</Label>
                  <Select
                    value={form.watch("sexo") || ""}
                    onValueChange={(v) => form.setValue("sexo", v as PatientFormValues["sexo"])}
                  >
                    <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="feminino">Feminino</SelectItem>
                      <SelectItem value="masculino">Masculino</SelectItem>
                      <SelectItem value="outro">Outro</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label htmlFor="pf-cpf" className="text-xs">CPF</Label>
                  <Input id="pf-cpf" {...form.register("cpf")} placeholder="000.000.000-00" />
                  {err.cpf && <p className="text-[11px] text-destructive">{err.cpf.message}</p>}
                </div>
              </>
            )}

            <div className="space-y-1">
              <Label htmlFor="pf-tel" className="text-xs">WhatsApp / Telefone</Label>
              <Input id="pf-tel" {...form.register("telefone")} placeholder="(11) 99999-0000" />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Convênio / plano</Label>
              <Select
                value={form.watch("convenio") || ""}
                onValueChange={(v) => form.setValue("convenio", v)}
              >
                <SelectTrigger><SelectValue placeholder="Particular ou convênio" /></SelectTrigger>
                <SelectContent>
                  {CONVENIOS.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label htmlFor="pf-email" className="text-xs">E-mail</Label>
              <Input id="pf-email" type="email" {...form.register("email")} placeholder="paciente@email.com" />
              {err.email && <p className="text-[11px] text-destructive">{err.email.message}</p>}
            </div>

            <div className="col-span-2 space-y-1">
              <Label htmlFor="pf-queixa" className="text-xs">Motivo / queixa atual</Label>
              <Textarea id="pf-queixa" rows={2} {...form.register("queixa")} placeholder="Ex.: fadiga há 4 semanas + dispneia aos esforços" />
            </div>

            <div className="col-span-2 space-y-1">
              <Label className="text-xs">Status no painel</Label>
              <Select
                value={form.watch("column")}
                onValueChange={(v) => form.setValue("column", v)}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {columns.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {/* submit nativo do form (Enter) */}
            <button type="submit" className="hidden" aria-hidden />
          </form>
        )}

        {/* Dropzone de exames — só no modo criação, em ambos os caminhos */}
        {!isEdit && (
          <div className="rounded-xl border border-border bg-card p-3">
            <div className="flex items-center gap-1.5 text-sm font-medium">
              <FileUp className="h-4 w-4 text-primary" />
              Exames (opcional)
            </div>
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
              onClick={() => fileInputRef.current?.click()}
              className={`mt-2 flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed px-4 py-5 text-center transition ${
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
              ref={fileInputRef}
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
              <ul className="mt-3 space-y-1.5">
                {files.map((entry, i) => (
                  <li
                    key={i}
                    className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${
                      entry.state === "error"
                        ? "bg-red-50 text-red-700 ring-1 ring-red-200 dark:bg-red-950/40 dark:text-red-300 dark:ring-red-800"
                        : "bg-muted/50"
                    }`}
                  >
                    {entry.state === "reading" && (
                      <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />
                    )}
                    {entry.state === "done" && (
                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                    )}
                    {entry.state === "error" && <X className="h-3.5 w-3.5 shrink-0 text-red-500" />}
                    <span className="min-w-0 flex-1 truncate">{entry.file.name}</span>
                    <span className="shrink-0 text-[11px] text-muted-foreground">
                      {entry.state === "reading" && "Lendo documento…"}
                      {entry.state === "done" && "✓ lido"}
                      {entry.state === "error" && entry.errorMsg}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setFiles((prev) => prev.filter((f) => f.file !== entry.file));
                      }}
                      className="ml-1 shrink-0 text-muted-foreground hover:text-foreground"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <DialogFooter className="mt-1">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            type="button"
            disabled={saving}
            onClick={() => (foundPatient ? submitFound() : submitNew())}
            className="brand-gradient text-primary-foreground"
          >
            {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            {submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
