## Ajustes no cabeçalho da "Evolução atual"

### 1. Remover a barra de "Histórico" com os chips
No cabeçalho do card **Evolução atual** existe hoje uma linha com o cadeado/selo + os chips *Consultas · Exames · Prescrições · Alergias* + o link *Solicitar autorização*. Toda essa faixa some — a solicitação de acesso já vive no botão *Solicitar histórico* da linha do tempo, e a visualização por consulta passa a acontecer pelo seletor de template (item 2).

Como consequência, as props `historicoAutorizado` e `onSolicitarHistorico` do `NovaEvolucao` deixam de ser necessárias e são removidas (junto com o estado `historicoAutorizado` na página do prontuário).

### 2. Novo modo "Histórico" no seletor de template
Ao lado dos pills existentes **Anamnese completa · 1ª consulta** e **Evolução · retorno**, adicionar um terceiro pill **Histórico** com o mesmo visual (mesma pílula arredondada, mesma tipografia e cores). O pill fica desabilitado quando não há consultas anteriores.

Ao selecioná-lo, aparece logo à direita um **dropdown** listando as consultas anteriores (mais recente primeiro), rotuladas por data + status (ex.: *12 mar 2025 · Selada*). Enquanto nenhuma consulta estiver escolhida, a área de escrita mostra um convite discreto: "Escolha uma consulta anterior para ver o histórico".

Quando uma consulta é escolhida, a área central da textarea é substituída por um bloco **somente leitura** com as mesmas quatro seções que já usamos hoje no `HistoricoConsultaPanel`:
- Diagnóstico
- Exames solicitados
- Medicamentos prescritos
- Relatórios

O rodapé com o botão *Salvar evolução* fica oculto neste modo (é histórico, não há o que salvar).

Ao voltar para *Anamnese* ou *Retorno*, o textarea reaparece com o conteúdo que estava sendo digitado (preservamos o texto em memória — não perdemos o rascunho ao alternar para *Histórico*).

### 3. Interação com o clique na linha do tempo
O clique num nó de **Consulta** na linha do tempo continua funcionando — só que agora, em vez de substituir o card inteiro pelo painel dedicado, ele:
- coloca o template em **Histórico**
- seleciona a consulta correspondente no dropdown

O componente `HistoricoConsultaPanel` (que hoje toma o lugar do `NovaEvolucao`) deixa de ser renderizado à parte — a mesma UI vira o conteúdo interno do modo *Histórico*.

---

### Detalhes técnicos

**Arquivos afetados**
- `src/routes/app/pacientes.$id.tsx`
  - Remover no `NovaEvolucao` o bloco JSX dos chips de histórico e do link *Solicitar autorização* (a barra logo abaixo do título).
  - Remover as props `historicoAutorizado` / `onSolicitarHistorico` do `NovaEvolucao` e seus usos.
  - Remover o estado `historicoAutorizado` e o `setHistoricoAutorizado` da página; o callback `onAutorizado` do `SolicitarHistoricoDialog` vira opcional/no-op.
  - Estender o `type template` de `"anamnese" | "soap"` para `"anamnese" | "soap" | "historico"`.
  - Adicionar um terceiro pill no array de templates; ao selecioná-lo, guardar `selectedHistoricoId` (id da evolução escolhida).
  - Renderizar `<Select>` com as evoluções anteriores ao lado dos pills quando `template === "historico"`.
  - Condicional na área principal: quando `template === "historico"`, renderizar as quatro seções do histórico (extraídas do atual `HistoricoConsultaPanel`) e esconder o textarea + botão *Salvar evolução*.
  - Passar as evoluções para o `NovaEvolucao` via nova prop `evolutions: Evolution[]`.
  - No `Prontuario`, deixar de renderizar `HistoricoConsultaPanel` como alternativa ao `NovaEvolucao`; em vez disso, quando `hist.activeConsulta` mudar, sincronizar o `template` e o `selectedHistoricoId` internos do `NovaEvolucao` (via prop controlada `activeHistoricoId` + callback `onActiveHistoricoChange`, ou via `useEffect` observando o id vindo por prop).

**Preservação do rascunho**
O `texto` já está no estado local do `NovaEvolucao`; alternar o template não o zera hoje (a função `applyTemplate` só troca quando o texto está vazio), então a preservação do rascunho ao entrar/sair de *Histórico* é automática.

**Regras de disabled**
- Pill *Histórico*: `disabled` quando `evolutions.length === 0`.
- Dropdown: só aparece com `template === "historico"`.
