// Dialogs de ação rápida do consultório: agendar consulta e lançar cobrança.
// Pequenos de propósito — duas perguntas e pronto, o médico volta pro fluxo.

import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CalendarPlus, DollarSign, Loader2 } from "lucide-react";
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
import { createMyCharge, scheduleAppointment } from "@/lib/api/clinic.functions";
import { todayIso, type Patient } from "@/lib/clinic-types";

export function invalidateWorkspace(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["workspace"] });
}

export function ScheduleDialog({
  open,
  onOpenChange,
  patient,
  token,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  patient: Patient | null;
  token: string;
}) {
  const qc = useQueryClient();
  const [data, setData] = useState(todayIso());
  const [hora, setHora] = useState("09:00");
  const [nota, setNota] = useState("");

  useEffect(() => {
    if (open) {
      setData(todayIso());
      setHora("09:00");
      setNota("");
    }
  }, [open]);

  const agendar = useMutation({
    mutationFn: () =>
      scheduleAppointment({
        data: {
          token,
          patientId: patient!.id,
          dateTime: `${data}T${hora}:00`,
          note: nota || null,
        },
      }),
    onSuccess: (r) => {
      if (!r.ok) return toast.error("Não consegui agendar.");
      toast.success(`Consulta de ${patient?.nome.split(" ")[0]} marcada.`, {
        description: `${data.split("-").reverse().join("/")} às ${hora}`,
      });
      onOpenChange(false);
      invalidateWorkspace(qc);
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarPlus className="h-4 w-4 text-primary" />
            Agendar consulta
          </DialogTitle>
          <DialogDescription>{patient?.nome}</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="ag-data" className="text-xs">Data</Label>
            <Input id="ag-data" type="date" value={data} onChange={(e) => setData(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="ag-hora" className="text-xs">Hora</Label>
            <Input id="ag-hora" type="time" value={hora} onChange={(e) => setHora(e.target.value)} />
          </div>
          <div className="col-span-2 space-y-1">
            <Label htmlFor="ag-nota" className="text-xs">Observação (opcional)</Label>
            <Input id="ag-nota" value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Retorno, avaliação de exames…" maxLength={200} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button
            disabled={!data || !hora || agendar.isPending}
            onClick={() => agendar.mutate()}
            className="brand-gradient text-primary-foreground"
          >
            {agendar.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Agendar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ChargeDialog({
  open,
  onOpenChange,
  patient,
  token,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  patient: Patient | null;
  token: string;
}) {
  const qc = useQueryClient();
  const [valor, setValor] = useState("");
  const [vencimento, setVencimento] = useState(todayIso());
  const [descricao, setDescricao] = useState("");

  useEffect(() => {
    if (open) {
      setValor("");
      setVencimento(todayIso());
      setDescricao("");
    }
  }, [open]);

  const valorNum = Number(valor.replace(",", "."));

  const cobrar = useMutation({
    mutationFn: () =>
      createMyCharge({
        data: {
          token,
          patientId: patient!.id,
          valor: valorNum,
          vencimento,
          descricao: descricao || undefined,
        },
      }),
    onSuccess: (r) => {
      if (!r.ok) return toast.error("Não consegui lançar a cobrança.");
      toast.success(`Cobrança lançada para ${patient?.nome.split(" ")[0]}.`);
      onOpenChange(false);
      invalidateWorkspace(qc);
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-primary" />
            Nova cobrança
          </DialogTitle>
          <DialogDescription>{patient?.nome}</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="cb-valor" className="text-xs">Valor (R$)</Label>
            <Input
              id="cb-valor"
              inputMode="decimal"
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              placeholder="350,00"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="cb-venc" className="text-xs">Vencimento</Label>
            <Input id="cb-venc" type="date" value={vencimento} onChange={(e) => setVencimento(e.target.value)} />
          </div>
          <div className="col-span-2 space-y-1">
            <Label htmlFor="cb-desc" className="text-xs">Descrição</Label>
            <Input id="cb-desc" value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Consulta" maxLength={120} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button
            disabled={!Number.isFinite(valorNum) || valorNum <= 0 || !vencimento || cobrar.isPending}
            onClick={() => cobrar.mutate()}
            className="brand-gradient text-primary-foreground"
          >
            {cobrar.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Lançar cobrança
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
