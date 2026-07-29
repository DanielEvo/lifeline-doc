// Catálogo de produtos/serviços do consultório — cadastro simples que
// alimenta os chips de "serviços aplicados" na Evolução (ver pacientes.$id).
// Nunca some da base: desativar só tira da seleção em novas evoluções,
// evoluções antigas guardam o snapshot de nome/preço de quando foram salvas.

import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Package, Pencil, Plus } from "lucide-react";
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
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PageHeader } from "@/components/clinic/page-header";
import {
  createMyService,
  listMyServices,
  setMyServiceActive,
  updateMyService,
} from "@/lib/api/services.functions";
import { formatBRL, type Service } from "@/lib/clinic-types";
import { useClinic } from "@/lib/clinic-context";

export const Route = createFileRoute("/app/produtos/")({
  component: PainelProdutos,
});

function PainelProdutos() {
  const { token } = useClinic();
  const qc = useQueryClient();
  const [novoOpen, setNovoOpen] = useState(false);
  const [editando, setEditando] = useState<Service | null>(null);

  const q = useQuery({
    queryKey: ["services"],
    queryFn: async () => {
      const r = await listMyServices({ data: { token } });
      return r;
    },
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["services"] });

  const toggleAtivo = useMutation({
    mutationFn: (v: { id: string; ativo: boolean }) => setMyServiceActive({ data: { token, ...v } }),
    onSuccess: (r, v) => {
      if (!r.ok) return toast.error("Não consegui atualizar.");
      toast.success(v.ativo ? "Serviço reativado." : "Serviço desativado.");
      invalidate();
    },
  });

  const services = q.data?.ok ? q.data.services : [];

  if (q.isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1000px] p-3 lg:p-5">
      <PageHeader
        eyebrow="Cadastro"
        title="Produtos e Serviços"
        subtitle={
          <p className="mt-1 text-xs text-muted-foreground">
            Itens que aparecem como opção ao registrar uma evolução — consultas, retornos, exames, etc.
          </p>
        }
        primaryAction={
          <Button onClick={() => setNovoOpen(true)} className="brand-gradient text-primary-foreground">
            <Plus className="mr-1.5 h-4 w-4" />
            Novo produto/serviço
          </Button>
        }
      />

      <div className="mt-4 rounded-2xl border border-border bg-card">
        {services.length === 0 ? (
          <div className="flex flex-col items-center px-6 py-12 text-center">
            <Package className="h-8 w-8 text-muted-foreground/50" />
            <p className="mt-3 text-sm font-medium">Nenhum produto ou serviço cadastrado</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Cadastre o primeiro — ele fica disponível na tela de Evolução.
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Nome</TableHead>
                <TableHead className="hidden sm:table-cell">Duração</TableHead>
                <TableHead>Preço</TableHead>
                <TableHead>Ativo</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {services.map((s) => (
                <TableRow key={s.id} className={s.ativo ? "" : "opacity-60"}>
                  <TableCell>
                    <div className="text-sm font-medium">{s.nome}</div>
                    {s.descricao && (
                      <div className="line-clamp-1 text-xs text-muted-foreground">{s.descricao}</div>
                    )}
                  </TableCell>
                  <TableCell className="hidden text-xs text-muted-foreground sm:table-cell">
                    {s.duracaoMin ? `${s.duracaoMin} min` : "—"}
                  </TableCell>
                  <TableCell className="text-sm font-medium tabular-nums">{formatBRL(s.preco)}</TableCell>
                  <TableCell>
                    <Switch
                      checked={s.ativo}
                      onCheckedChange={(v) => toggleAtivo.mutate({ id: s.id, ativo: v })}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" onClick={() => setEditando(s)} title="Editar">
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <ServiceFormDialog
        open={novoOpen}
        onOpenChange={setNovoOpen}
        token={token}
        onSaved={invalidate}
      />
      <ServiceFormDialog
        open={!!editando}
        onOpenChange={(o) => !o && setEditando(null)}
        token={token}
        service={editando}
        onSaved={() => {
          invalidate();
          setEditando(null);
        }}
      />
    </div>
  );
}

function ServiceFormDialog({
  open,
  onOpenChange,
  token,
  service,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  token: string;
  /** Presente = editando um serviço existente; ausente = criando um novo. */
  service?: Service | null;
  onSaved: () => void;
}) {
  const [nome, setNome] = useState("");
  const [descricao, setDescricao] = useState("");
  const [preco, setPreco] = useState("");
  const [duracaoMin, setDuracaoMin] = useState("");

  useEffect(() => {
    setNome(service?.nome ?? "");
    setDescricao(service?.descricao ?? "");
    setPreco(service ? String(service.preco).replace(".", ",") : "");
    setDuracaoMin(service?.duracaoMin ? String(service.duracaoMin) : "");
  }, [open, service]);

  const precoNum = Number(preco.replace(",", "."));
  const duracaoNum = duracaoMin.trim() ? Number(duracaoMin) : null;

  const salvar = useMutation({
    mutationFn: async (): Promise<
      { ok: true; service: Service } | { ok: false; error: "unauthorized" | "not_found" }
    > => {
      if (service) {
        return updateMyService({
          data: {
            token,
            id: service.id,
            nome,
            descricao: descricao || null,
            preco: precoNum,
            duracaoMin: duracaoNum,
          },
        });
      }
      return createMyService({
        data: {
          token,
          nome,
          descricao: descricao || null,
          preco: precoNum,
          duracaoMin: duracaoNum,
        },
      });
    },
    onSuccess: (r) => {
      if (!r.ok) return toast.error("Não consegui salvar.");
      toast.success(service ? "Produto/serviço atualizado." : "Produto/serviço cadastrado.");
      onOpenChange(false);
      onSaved();
    },
  });

  const valido = nome.trim().length >= 2 && Number.isFinite(precoNum) && precoNum > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-4 w-4 text-primary" />
            {service ? "Editar produto/serviço" : "Novo produto/serviço"}
          </DialogTitle>
          <DialogDescription>Aparece como opção ao registrar uma evolução.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 space-y-1">
            <Label htmlFor="sv-nome" className="text-xs">Nome</Label>
            <Input
              id="sv-nome"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Consulta, Retorno, Avaliação…"
              maxLength={80}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="sv-preco" className="text-xs">Preço (R$)</Label>
            <Input
              id="sv-preco"
              inputMode="decimal"
              value={preco}
              onChange={(e) => setPreco(e.target.value)}
              placeholder="350,00"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="sv-duracao" className="text-xs">Duração (min)</Label>
            <Input
              id="sv-duracao"
              type="number"
              min={5}
              max={480}
              value={duracaoMin}
              onChange={(e) => setDuracaoMin(e.target.value)}
              placeholder="30"
            />
          </div>
          <div className="col-span-2 space-y-1">
            <Label htmlFor="sv-desc" className="text-xs">Descrição (opcional)</Label>
            <Input
              id="sv-desc"
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Detalhe curto do que está incluso"
              maxLength={300}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button
            disabled={!valido || salvar.isPending}
            onClick={() => salvar.mutate()}
            className="brand-gradient text-primary-foreground"
          >
            {salvar.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
