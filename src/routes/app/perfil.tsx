// Cadastro dos dados do médico (prescritor). É daqui que saem as sugestões
// de pré-preenchimento do cabeçalho da receita: CRM/UF, especialidade,
// cidade, telefone e local de atendimento.

import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { IdCard, Loader2, MapPin, Save, Stethoscope } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { getDoctorProfile, saveMemedProfile } from "@/lib/api/clinic.functions";
import { useClinic } from "@/lib/clinic-context";
import {
  ESPECIALIDADES,
  UFS,
  buscarCep,
  formatarCep,
  municipiosDaUf,
} from "@/lib/br-locations";

export const Route = createFileRoute("/app/perfil")({
  head: () => ({
    meta: [
      { title: "Meu perfil de prescritor · LifeLine" },
      {
        name: "description",
        content:
          "Cadastre CRM, especialidade e local de atendimento para pré-preencher o cabeçalho das receitas.",
      },
      { property: "og:title", content: "Meu perfil de prescritor · LifeLine" },
      {
        property: "og:description",
        content: "Dados do médico usados no cabeçalho das receitas digitais.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PerfilPage,
});

const VAZIO = {
  crm: "",
  crmUf: "",
  cpfMedico: "",
  especialidade: "",
  crmCidade: "",
  telefoneMedico: "",
  localAtendimento: "",
};


function PerfilPage() {
  const { token, nome, email } = useClinic();
  const qc = useQueryClient();
  const [form, setForm] = useState(VAZIO);

  const perfil = useQuery({
    queryKey: ["doctor-profile"],
    queryFn: () => getDoctorProfile({ data: { token } }),
    staleTime: 30_000,
  });

  useEffect(() => {
    if (perfil.data?.ok) {
      const p = perfil.data.profile;
      setForm({
        crm: p.crm,
        crmUf: p.crmUf,
        cpfMedico: p.cpfMedico,
        especialidade: p.especialidade,
        crmCidade: p.crmCidade,
        telefoneMedico: p.telefoneMedico,
        localAtendimento: p.localAtendimento,
      });
    }
  }, [perfil.data]);

  const salvar = useMutation({
    mutationFn: () =>
      saveMemedProfile({
        data: {
          token,
          crm: form.crm.trim(),
          crmUf: form.crmUf.trim().toUpperCase(),
          cpfMedico: form.cpfMedico.replace(/\D/g, ""),
          especialidade: form.especialidade.trim(),
          crmCidade: form.crmCidade.trim(),
          telefoneMedico: form.telefoneMedico.trim() || null,
          localAtendimento: form.localAtendimento.trim() || null,
        },
      }),
    onSuccess: (r) => {
      if (!r.ok) return toast.error("Não consegui salvar seus dados.");
      toast.success("Dados salvos — as receitas já saem com esse cabeçalho.");
      qc.invalidateQueries({ queryKey: ["doctor-profile"] });
      qc.invalidateQueries({ queryKey: ["memed-widget-config"] });
    },
    onError: () => toast.error("Não consegui salvar seus dados."),
  });

  const cpfDigits = form.cpfMedico.replace(/\D/g, "");
  const erros: string[] = [];
  if (form.crm.trim().length < 1) erros.push("Informe o número do CRM.");
  if (form.crmUf.trim().length !== 2) erros.push("Informe a UF do CRM (2 letras).");
  if (cpfDigits.length !== 11) erros.push("O CPF deve ter 11 dígitos.");
  if (form.especialidade.trim().length < 2) erros.push("Informe a especialidade.");
  if (form.crmCidade.trim().length < 2) erros.push("Informe a cidade de atuação.");
  const podeSalvar = erros.length === 0 && !salvar.isPending;

  const campo = (k: keyof typeof VAZIO) => ({
    value: form[k],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value })),
  });

  return (
    <div className="mx-auto max-w-3xl space-y-5 p-4 md:p-6">
      <header className="space-y-1">
        <h1 className="flex items-center gap-2 text-xl font-semibold">
          <IdCard className="h-5 w-5 text-primary" />
          Meu perfil de prescritor
        </h1>
        <p className="text-sm text-muted-foreground">
          Esses dados pré-preenchem o cabeçalho das receitas e habilitam a prescrição digital.
        </p>
      </header>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Identificação</CardTitle>
          <CardDescription>
            {nome} · {email}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="crm">CRM</Label>
            <Input id="crm" placeholder="123456" maxLength={20} {...campo("crm")} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="crmUf">UF do CRM</Label>
            <select
              id="crmUf"
              value={form.crmUf}
              onChange={(e) => setForm((f) => ({ ...f, crmUf: e.target.value }))}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">Selecione…</option>
              {UFS.map((uf) => (
                <option key={uf} value={uf}>
                  {uf}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cpf">CPF</Label>
            <Input
              id="cpf"
              placeholder="Somente números"
              maxLength={14}
              inputMode="numeric"
              {...campo("cpfMedico")}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="especialidade">Especialidade</Label>
            <Input
              id="especialidade"
              placeholder="Clínica médica"
              maxLength={80}
              {...campo("especialidade")}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Stethoscope className="h-4 w-4 text-primary" />
            Consultório
          </CardTitle>
          <CardDescription>Sai impresso no cabeçalho da receita.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="cidade">Cidade de atuação</Label>
            <Input id="cidade" placeholder="São Paulo" maxLength={80} {...campo("crmCidade")} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="telefone">Telefone do consultório</Label>
            <Input
              id="telefone"
              placeholder="(11) 90000-0000"
              maxLength={20}
              {...campo("telefoneMedico")}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="local">Local de atendimento</Label>
            <Input
              id="local"
              placeholder="Clínica LifeLine — Rua Exemplo, 100"
              maxLength={120}
              {...campo("localAtendimento")}
            />
            <p className="text-[11px] text-muted-foreground">
              Sem preenchimento, a receita usa "Consultório {nome}".
            </p>
          </div>
        </CardContent>
      </Card>

      {perfil.data?.ok && !perfil.data.memedConfigurada && (
        <p className="rounded-lg bg-muted/50 px-3 py-2 text-[11px] text-muted-foreground">
          A prescrição digital com assinatura ainda não está configurada neste ambiente — os dados
          acima continuam valendo para o cabeçalho da receita local.
        </p>
      )}

      {erros.length > 0 && (
        <ul className="space-y-0.5 text-[11px] text-amber-700 dark:text-amber-400">
          {erros.map((e) => (
            <li key={e}>· {e}</li>
          ))}
        </ul>
      )}

      <div className="flex items-center gap-3">
        <Button onClick={() => salvar.mutate()} disabled={!podeSalvar}>
          {salvar.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-2 h-4 w-4" />
          )}
          Salvar dados
        </Button>
        {perfil.isLoading && (
          <span className="text-xs text-muted-foreground">Carregando seu cadastro…</span>
        )}
      </div>
    </div>
  );
}
