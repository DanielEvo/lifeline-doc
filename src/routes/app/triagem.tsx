import { useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  FileUp,
  Loader2,
  Search,
  UserCheck,
  UserPlus,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { lookupPatientByCode, submitPreCadastro } from "@/lib/api/clinic.functions";
import { ageFrom, type Patient } from "@/lib/clinic-types";
import { useClinic } from "@/lib/clinic-context";

export const Route = createFileRoute("/app/triagem")({
  component: PreCadastro,
});

const ACCEPTED_EXTS = [".pdf", ".jpg", ".jpeg", ".png"];

const QUEIXA_EXEMPLOS = [
  "Fadiga há 4 semanas, falta de ar ao subir escadas",
  "Dor de cabeça forte quase todo dia, piora com luz",
  "Peito apertando durante esforço",
];

type FileEntry = {
  file: File;
  state: "reading" | "done" | "error";
  errorMsg?: string;
};

function PreCadastro() {
  const { token } = useClinic();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Bloco 1
  const [idInput, setIdInput] = useState("");
  const [lookupDone, setLookupDone] = useState(false);
  const [foundPatient, setFoundPatient] = useState<Patient | null>(null);

  // Bloco 2
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [queixa, setQueixa] = useState("");

  // Bloco 3
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [dragging, setDragging] = useState(false);

  const lookupMut = useMutation({
    mutationFn: () => lookupPatientByCode({ data: { token, code: idInput } }),
    onSuccess: (r) => {
      setLookupDone(true);
      if (!r.ok) return toast.error("Sessão expirada.");
      setFoundPatient(r.patient);
    },
  });

  const submitMut = useMutation({
    mutationFn: () =>
      submitPreCadastro({
        data: {
          token,
          existingPatientId: foundPatient?.id,
          nome: foundPatient ? undefined : nome,
          telefone: foundPatient ? undefined : (telefone || null),
          queixa: foundPatient ? undefined : (queixa || undefined),
          fileNames: files.filter((f) => f.state === "done").map((f) => f.file.name),
        },
      }),
    onSuccess: (r) => {
      if (!r.ok) return toast.error("Não foi possível salvar.");
      qc.invalidateQueries({ queryKey: ["workspace"] });
      qc.invalidateQueries({ queryKey: ["workspace", "all"] });
      if (foundPatient) {
        toast.success(`Exames adicionados ao prontuário de ${r.patient.nome}.`);
      } else {
        toast.success(
          `${r.patient.nome} no painel! Código: ${r.patient.patientCode} — anote para o paciente.`,
          { duration: 7000 },
        );
      }
      navigate({ to: "/app" });
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

  function onDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(true);
  }
  function onDragLeave() {
    setDragging(false);
  }
  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files.length) processFiles(e.dataTransfer.files);
  }

  function removeFile(file: File) {
    setFiles((prev) => prev.filter((f) => f.file !== file));
  }

  const isExisting = !!foundPatient;
  const canSubmit = isExisting ? true : nome.trim().length >= 2;
  const doneFiles = files.filter((f) => f.state === "done");

  const age = foundPatient ? ageFrom(foundPatient.nascimento) : null;

  return (
    <div className="mx-auto max-w-2xl p-3 lg:p-5">
      <div className="text-[11px] font-medium uppercase tracking-wider text-primary">
        Entrada de paciente
      </div>
      <h1 className="text-xl font-semibold tracking-tight">Pré-cadastro</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Busque um paciente pelo ID ou cadastre um novo, depois anexe os exames.
      </p>

      {/* Bloco 1 — Busca por ID */}
      <div className="mt-4 rounded-2xl border border-border bg-card p-4">
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
              if (e.key === "Enter" && idInput.trim().length >= 3) lookupMut.mutate();
            }}
          />
          <Button
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
            Nenhum paciente com esse ID — cadastre abaixo.
          </p>
        )}

        {foundPatient && (
          <div className="mt-3 flex items-start gap-3 rounded-xl bg-emerald-50 p-3 ring-1 ring-emerald-200 dark:bg-emerald-950/40 dark:ring-emerald-800">
            <UserCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <div className="min-w-0">
              <div className="font-medium text-emerald-900 dark:text-emerald-100">
                Paciente já cadastrado
              </div>
              <div className="mt-0.5 text-sm text-emerald-800 dark:text-emerald-200">
                {foundPatient.nome}
                {age !== null && `, ${age} anos`}
                {foundPatient.telefone && ` · ${foundPatient.telefone}`}
                {foundPatient.convenio && ` · ${foundPatient.convenio}`}
              </div>
              <div className="mt-0.5 text-[11px] text-emerald-600 dark:text-emerald-400">
                Código: {foundPatient.patientCode}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Bloco 2 — Novo cadastro (oculto quando paciente encontrado) */}
      {!foundPatient && (
        <div className="mt-3 rounded-2xl border border-border bg-card p-4">
          <div className="flex items-center gap-1.5 text-sm font-medium">
            <UserPlus className="h-4 w-4 text-primary" />
            Novo paciente
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="pc-nome" className="text-xs">
                Nome *
              </Label>
              <Input
                id="pc-nome"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Maria de Souza"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="pc-tel" className="text-xs">
                Telefone / WhatsApp
              </Label>
              <Input
                id="pc-tel"
                value={telefone}
                onChange={(e) => setTelefone(e.target.value)}
                placeholder="(11) 99999-0000"
              />
            </div>
          </div>
          <div className="mt-3 space-y-1">
            <Label htmlFor="pc-queixa" className="text-xs">
              Queixa principal
            </Label>
            <Textarea
              id="pc-queixa"
              value={queixa}
              onChange={(e) => setQueixa(e.target.value)}
              rows={2}
              placeholder="Descreva o motivo da consulta…"
            />
            <div className="flex flex-wrap gap-1.5 pt-1">
              {QUEIXA_EXEMPLOS.map((ex) => (
                <button
                  key={ex}
                  onClick={() => setQueixa(ex)}
                  className="rounded-full border border-border bg-muted/50 px-2.5 py-1 text-[11px] text-muted-foreground transition hover:border-primary/40 hover:text-foreground"
                >
                  {ex.slice(0, 40)}…
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Bloco 3 — Dropzone */}
      <div className="mt-3 rounded-2xl border border-border bg-card p-4">
        <div className="flex items-center gap-1.5 text-sm font-medium">
          <FileUp className="h-4 w-4 text-primary" />
          Exames (opcional)
        </div>
        <div
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`mt-2 flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed px-4 py-6 text-center transition ${
            dragging
              ? "border-primary bg-primary/5"
              : "border-border bg-muted/30 hover:border-primary/40 hover:bg-muted/50"
          }`}
        >
          <FileUp className="h-6 w-6 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Arraste PDFs ou imagens aqui, ou{" "}
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
                {entry.state === "error" && (
                  <X className="h-3.5 w-3.5 shrink-0 text-red-500" />
                )}
                <span className="min-w-0 flex-1 truncate">{entry.file.name}</span>
                <span className="shrink-0 text-[11px] text-muted-foreground">
                  {entry.state === "reading" && "Lendo via OCR (simulado)…"}
                  {entry.state === "done" && "✓ lido"}
                  {entry.state === "error" && entry.errorMsg}
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    removeFile(entry.file);
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

      {/* Botão final */}
      <div className="mt-4 flex justify-end">
        <Button
          disabled={!canSubmit || submitMut.isPending}
          onClick={() => submitMut.mutate()}
          className="brand-gradient text-primary-foreground"
        >
          {submitMut.isPending ? (
            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
          ) : isExisting ? (
            <CheckCircle2 className="mr-1.5 h-4 w-4" />
          ) : (
            <UserPlus className="mr-1.5 h-4 w-4" />
          )}
          {isExisting
            ? doneFiles.length > 0
              ? "Salvar exames"
              : "Confirmar"
            : "Adicionar ao painel"}
        </Button>
      </div>
    </div>
  );
}
