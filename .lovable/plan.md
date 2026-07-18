## Objetivo

Reformular `/paciente/app` para ficar visualmente igual ao Step D da demo (mockup de celular com 5 tabs), mantendo os dados reais (perfil editável + exames pendentes vindos de `getPatientTimeline`) e adicionando uma **linha do tempo vertical** — a versão vertical do `ClinicalTimeline` que hoje existe no app do médico (`src/components/clinic/patient-history.tsx`).

## Escopo

Só frontend. Não mexer em:
- `src/components/demo/patient-app.tsx` (é a demo pública, fica intacto como referência visual).
- `src/components/clinic/patient-history.tsx` (timeline horizontal do médico permanece).
- Server functions de paciente (`patient-auth.functions.ts`, `patient-measurements.server.ts`, `patients-registry.server.ts`). O contrato de dados atual já basta.

## Mudanças

### 1. `src/routes/paciente/app.tsx` — reescrita da UI

Manter a rota, o guard de sessão, `getPatientTimeline`, `updatePatientProfile`, `extractExamDocumentPatient`, `confirmPatientMeasurements`, `logoutPatient` — nenhuma chamada de API muda.

Trocar o layout atual (cards empilhados numa página larga) por um **mockup de celular centralizado** inspirado em `src/components/demo/patient-app.tsx`:

- Moldura de celular (largura fixa ~380px, cantos arredondados, sombra), status bar simulada e header com nome + botão Sair.
- Bottom tab bar com as mesmas 5 abas da demo: **Início · Histórico · Exames · Remédios · Perfil**.
- Só as abas que têm dados reais no backend recebem conteúdo real; as outras mostram um estado vazio honesto ("Em breve — sincronize com seu médico"), sem inventar métricas fake:
  - **Início**: saudação + resumo (nome, próximo campo pendente do perfil, contagem de exames enviados). Sem passos/hidratação/sono fake.
  - **Histórico**: **linha do tempo vertical** (item 2 abaixo). Enquanto `unlinked`, mostra o card "Aguardando seu médico liberar…" que já existe.
  - **Exames**: `ExamsCard` atual + `UploadPatientDialog` atual (mesmo pipeline OCR do médico, já implementado).
  - **Remédios**: estado vazio "Nenhum medicamento prescrito ainda."
  - **Perfil**: `ProfileCard` atual (formulário editável de nascimento/sexo/telefone/tipo sanguíneo/alergias/CPF), mais botão Sair.

Fora da moldura, num painel discreto ao lado (só em ≥md), manter um bloco explicativo curto sobre o que é o app — no mobile o mockup ocupa a tela toda.

### 2. Nova timeline vertical

Criar `src/components/patient/vertical-timeline.tsx` reaproveitando o vocabulário visual do `ClinicalTimeline` horizontal (nós circulares gradiente por status, pill de status, ícones `FlaskConical`/`Stethoscope`/`Scissors`), mas em orientação vertical:

- Linha central vertical (`w-0.5 bg-border`) com nós à esquerda e cards à direita.
- Mesmos três tipos: Exames (agrupados por mês/ano), Consultas, Cirurgias.
- Cada card mostra data, título, resumo curto e pill de status.
- Como o backend do paciente ainda não expõe consultas/cirurgias vinculadas, a fonte inicial vem de `state.pending` (grupos por mês → nó "Exames · <mês>") + placeholder "Aguardando médico" quando vazio. Fica pronto para receber `evolutions`/`surgeries` quando o backend liberar.

### Detalhes técnicos

- Moldura de celular: componentes locais no próprio arquivo da rota (`PhoneFrame`, `PhoneHeader`, `TabBar`) — não importar de `src/components/demo/*` porque aquilo é conteúdo público hard-coded para a landing.
- Tokens: só semânticos (`bg-card`, `text-muted-foreground`, `brand-gradient`), sem cores cruas.
- Responsivo: `<md` o mockup ocupa `w-full max-w-[420px]`; `≥md` fica centralizado com painel lateral explicativo.
- Sem novas dependências.

## Fora de escopo

- Não implementar dados fake de passos/hidratação/sono/insights que existem no `patient-app.tsx` da demo — a demo é marketing; a rota real só mostra o que o backend tem.
- Não criar tabelas/endpoints de consultas ou medicamentos do paciente agora (fica para quando o médico começar a vincular).
