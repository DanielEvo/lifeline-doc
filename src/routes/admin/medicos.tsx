// Contas de médicos — resetar senha, entrar como, apagar.

import { useState } from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { Key, LogIn, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  adminDeleteDoctor,
  adminImpersonateDoctor,
  adminListDoctors,
  adminResetDoctorPassword,
} from "@/lib/api/admin.functions";
import { setSession } from "@/lib/session";

export const Route = createFileRoute("/admin/medicos")({
  loader: () => adminListDoctors(),
  component: AdminMedicos,
});

function AdminMedicos() {
  const { rows } = Route.useLoaderData();
  const router = useRouter();
  const [resetOn, setResetOn] = useState<string | null>(null);
  const [newPass, setNewPass] = useState("");
  const [busy, setBusy] = useState(false);

  const impersonate = async (doctorId: string) => {
    const r = await adminImpersonateDoctor({ data: { doctorId } });
    if (!r.ok) return toast.error(r.error);
    setSession({ token: r.token, nome: r.nome, email: r.email });
    toast.success(`Entrando como ${r.nome}…`);
    window.open("/app", "_blank");
  };

  const remove = async (doctorId: string, nome: string) => {
    if (!confirm(`Apagar a conta de ${nome}? Isso remove login e sessões.`)) return;
    await adminDeleteDoctor({ data: { doctorId } });
    toast.success("Conta apagada.");
    router.invalidate();
  };

  const resetSubmit = async () => {
    if (!resetOn || newPass.length < 6) return;
    setBusy(true);
    try {
      const r = await adminResetDoctorPassword({ data: { doctorId: resetOn, newPassword: newPass } });
      if (!r.ok) return toast.error(r.error);
      toast.success("Senha redefinida. Sessões antigas revogadas.");
      setResetOn(null);
      setNewPass("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <h1 className="mb-1 text-xl font-semibold">Médicos</h1>
      <p className="mb-6 text-sm text-muted-foreground">{rows.length} contas cadastradas.</p>

      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-2 font-medium">Nome</th>
              <th className="px-4 py-2 font-medium">E-mail</th>
              <th className="px-4 py-2 font-medium">Provider</th>
              <th className="px-4 py-2 font-medium">Criada em</th>
              <th className="px-4 py-2 text-right font-medium">Ações</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                  Nenhum médico cadastrado ainda.
                </td>
              </tr>
            )}
            {rows.map((d) => (
              <tr key={d.id} className="border-t border-border">
                <td className="px-4 py-3 font-medium">{d.nome}</td>
                <td className="px-4 py-3 text-muted-foreground">{d.email}</td>
                <td className="px-4 py-3 text-xs">
                  <span className="rounded-full bg-muted px-2 py-0.5">{d.provider}</span>
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground">
                  {new Date(d.createdAt).toLocaleDateString("pt-BR")}
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-1">
                    <Button size="sm" variant="ghost" onClick={() => impersonate(d.id)} title="Entrar como">
                      <LogIn className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setResetOn(d.id)} title="Resetar senha">
                      <Key className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => remove(d.id, d.nome)}
                      title="Apagar"
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={resetOn !== null} onOpenChange={(o) => !o && setResetOn(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova senha</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="newpass">Senha (mín. 6 caracteres)</Label>
            <Input
              id="newpass"
              type="text"
              value={newPass}
              onChange={(e) => setNewPass(e.target.value)}
              autoFocus
            />
            <p className="text-xs text-muted-foreground">
              Todas as sessões ativas desse médico serão revogadas.
            </p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setResetOn(null)}>
              Cancelar
            </Button>
            <Button onClick={resetSubmit} disabled={busy || newPass.length < 6}>
              Redefinir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
