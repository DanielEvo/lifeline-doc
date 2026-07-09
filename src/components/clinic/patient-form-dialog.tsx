// Cadastro/edição de paciente — o mesmo dialog serve o Kanban, o painel de
// pacientes e o prontuário. Validação zod + react-hook-form; a gravação real
// acontece na server fn autenticada passada em `onSubmit`.

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2 } from "lucide-react";

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
import { CLINIC_COLUMNS, type Patient } from "@/lib/clinic-types";

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
  queixa: z.string().max(300).optional(),
  column: z.enum(["triagem", "atendimento", "aguardando", "retorno", "estavel"]),
});

export type PatientFormValues = z.infer<typeof schema>;

export function PatientFormDialog({
  open,
  onOpenChange,
  patient,
  onSubmit,
  saving,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  patient?: Patient | null; // presente = edição
  onSubmit: (values: PatientFormValues) => Promise<void> | void;
  saving: boolean;
}) {
  const form = useForm<PatientFormValues>({
    resolver: zodResolver(schema),
    defaultValues: { nome: "", nascimento: "", sexo: "", cpf: "", telefone: "", email: "", queixa: "", column: "triagem" },
  });

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
            queixa: patient.queixa,
            column: patient.column,
          }
        : { nome: "", nascimento: "", sexo: "", cpf: "", telefone: "", email: "", queixa: "", column: "triagem" },
    );
  }, [open, patient, form]);

  const err = form.formState.errors;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{patient ? "Editar paciente" : "Novo paciente"}</DialogTitle>
          <DialogDescription>
            {patient
              ? "Os dados alimentam o prontuário e o painel do dia."
              : "Só o nome é obrigatório — complete o resto quando tiver."}
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={form.handleSubmit((v) => onSubmit(v))}
          className="grid grid-cols-2 gap-3"
        >
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

          <div className="space-y-1">
            <Label htmlFor="pf-tel" className="text-xs">WhatsApp / Telefone</Label>
            <Input id="pf-tel" {...form.register("telefone")} placeholder="(11) 99999-0000" />
          </div>

          <div className="col-span-2 space-y-1">
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
              onValueChange={(v) => form.setValue("column", v as PatientFormValues["column"])}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CLINIC_COLUMNS.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <DialogFooter className="col-span-2 mt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving} className="brand-gradient text-primary-foreground">
              {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              {patient ? "Salvar alterações" : "Cadastrar paciente"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
