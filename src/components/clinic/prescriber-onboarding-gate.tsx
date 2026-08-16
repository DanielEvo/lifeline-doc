// Gate bloqueante de primeiro acesso — cadastro do prescritor (PRD 8.8).
// Motivado por compliance, não só UX: LifeLine_Referencia_Memed.md, Seção 11
// ("Autorização para Credenciais de Produção"), lista Nome, Sobrenome,
// Registro Profissional+UF, E-mail, Especialidade, Data de Nascimento e CPF
// como requisito pra Memed liberar (e não revogar) a chave de produção. Mesmo
// padrão visual do ConsentGate — aparece DEPOIS dele no cascade de route.tsx,
// consentimento sempre vem antes de cadastro de negócio. Os mesmos campos
// continuam editáveis depois, em /app/perfil.

import { useState } from "react";
import { IdCard, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { saveMemedProfile } from "@/lib/api/clinic.functions";
import type { BoardCode } from "@/lib/auth.server";
import { BOARD_CODE_OPTIONS, ESPECIALIDADES, UFS, boardCodeFromOption } from "@/lib/br-locations";

export function PrescriberOnboardingGate({
  token,
  nomeAtual,
  onComplete,
  onLogout,
}: {
  token: string;
  nomeAtual: string;
  onComplete: (nomeCompleto: string) => void;
  onLogout: () => void;
}) {
  // nomeAtual vem do cadastro (e-mail/senha ou nome do perfil Google) — só
  // pré-preenche o primeiro campo, sempre editável. Sem título (Dr./Dra.):
  // é implícito, ninguém mais nesta plataforma usa a conta além do médico dono.
  const [nome, setNome] = useState(nomeAtual);
  const [sobrenome, setSobrenome] = useState("");
  const [boardOption, setBoardOption] = useState("");
  const [crm, setCrm] = useState("");
  const [crmUf, setCrmUf] = useState("");
  const [cpfMedico, setCpfMedico] = useState("");
  const [especialidade, setEspecialidade] = useState("");
  const [crmCidade, setCrmCidade] = useState("");
  const [dataNascimento, setDataNascimento] = useState("");
  const [busy, setBusy] = useState(false);

  const boardCode = boardCodeFromOption(boardOption);
  const cpfDigits = cpfMedico.replace(/\D/g, "");

  const erros: string[] = [];
  if (nome.trim().length < 1) erros.push("Informe seu nome.");
  if (sobrenome.trim().length < 1) erros.push("Informe seu sobrenome.");
  if (!boardCode) erros.push("Selecione o tipo de registro profissional.");
  if (crm.trim().length < 1) erros.push("Informe o número do registro.");
  if (crmUf.trim().length !== 2) erros.push("Informe a UF do registro.");
  if (cpfDigits.length !== 11) erros.push("O CPF deve ter 11 dígitos.");
  if (especialidade.trim().length < 2) erros.push("Informe a especialidade.");
  if (crmCidade.trim().length < 2) erros.push("Informe a cidade de atuação.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dataNascimento)) erros.push("Informe sua data de nascimento.");
  const podeSalvar = erros.length === 0 && !busy;

  const submit = async () => {
    if (!podeSalvar) return;
    setBusy(true);
    try {
      const r = await saveMemedProfile({
        data: {
          token,
          nome: nome.trim(),
          sobrenome: sobrenome.trim(),
          boardCode: boardCode as BoardCode,
          crm: crm.trim(),
          crmUf: crmUf.trim().toUpperCase(),
          cpfMedico: cpfDigits,
          especialidade: especialidade.trim(),
          crmCidade: crmCidade.trim(),
          dataNascimento,
        },
      });
      if (!r.ok) {
        toast.error("Não consegui salvar seu cadastro agora. Tente de novo.");
        return;
      }
      onComplete(`${nome.trim()} ${sobrenome.trim()}`.trim());
    } catch {
      toast.error("Não consegui salvar seu cadastro agora. Tente de novo.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-6">
      <div className="w-full max-w-lg rounded-3xl border border-border bg-card p-7 shadow-xl shadow-primary/5">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10">
          <IdCard className="h-6 w-6 text-primary" />
        </div>
        <h1 className="mt-4 text-center text-lg font-semibold tracking-tight">
          Complete seu cadastro de prescritor
        </h1>
        <p className="mt-1.5 text-center text-sm text-muted-foreground">
          Esses dados habilitam a prescrição digital e saem no cabeçalho da receita. Leva menos de
          um minuto — dá pra ajustar depois em "Meu perfil".
        </p>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="og-nome">Nome</Label>
            <Input id="og-nome" value={nome} onChange={(e) => setNome(e.target.value)} maxLength={120} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="og-sobrenome">Sobrenome</Label>
            <Input
              id="og-sobrenome"
              value={sobrenome}
              onChange={(e) => setSobrenome(e.target.value)}
              maxLength={120}
            />
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="og-registro-tipo">Registro profissional</Label>
            <SearchableSelect
              id="og-registro-tipo"
              value={boardOption}
              onChange={setBoardOption}
              options={BOARD_CODE_OPTIONS}
              allowCustom={false}
              placeholder="Selecione seu conselho…"
              searchPlaceholder="Buscar…"
              emptyText="Não encontrado."
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="og-crm">
              Número do registro{boardCode ? ` (${boardCode})` : ""}
            </Label>
            <Input id="og-crm" placeholder="123456" maxLength={20} value={crm} onChange={(e) => setCrm(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="og-crmUf">UF do registro</Label>
            <SearchableSelect
              id="og-crmUf"
              value={crmUf}
              onChange={(uf) => setCrmUf(uf)}
              options={UFS}
              allowCustom={false}
              placeholder="UF…"
              searchPlaceholder="Buscar UF…"
              emptyText="UF não encontrada."
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="og-cpf">CPF</Label>
            <Input
              id="og-cpf"
              placeholder="Somente números"
              maxLength={14}
              inputMode="numeric"
              value={cpfMedico}
              onChange={(e) => setCpfMedico(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="og-dataNascimento">Data de nascimento</Label>
            <Input
              id="og-dataNascimento"
              type="date"
              value={dataNascimento}
              onChange={(e) => setDataNascimento(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="og-especialidade">Especialidade</Label>
            <SearchableSelect
              id="og-especialidade"
              value={especialidade}
              onChange={setEspecialidade}
              options={ESPECIALIDADES}
              placeholder="Selecione…"
              searchPlaceholder="Buscar especialidade…"
              emptyText="Digite para usar uma especialidade própria."
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="og-cidade">Cidade de atuação</Label>
            <Input
              id="og-cidade"
              placeholder="Sua cidade"
              maxLength={80}
              value={crmCidade}
              onChange={(e) => setCrmCidade(e.target.value)}
            />
          </div>
        </div>

        {erros.length > 0 && (
          <ul className="mt-4 space-y-0.5 text-[11px] text-amber-700 dark:text-amber-400">
            {erros.map((e) => (
              <li key={e}>· {e}</li>
            ))}
          </ul>
        )}

        <Button onClick={submit} disabled={!podeSalvar} className="mt-4 w-full">
          {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
          Salvar e continuar
        </Button>
        <button
          type="button"
          onClick={onLogout}
          className="mt-3 w-full text-center text-xs text-muted-foreground transition hover:text-foreground"
        >
          Sair
        </button>
      </div>
    </div>
  );
}
