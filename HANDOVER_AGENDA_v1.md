# HANDOVER — Agenda (Calendário Clínico) · LifeLine

> Prompt de handover para execução via Claude Code. Copie este arquivo inteiro
> como prompt inicial da sessão.

---

## Contexto do projeto

LifeLine — SaaS médico brasileiro. React 19 + TanStack Start/Router (file-based)
+ Tailwind v4 + shadcn/ui + TanStack Query. Deploy alvo: runtime tipo edge
(Cloudflare Workers) — env vars bindam por request, nunca em module scope.

**Persistência híbrida (importante):** o dado clínico principal vive em arquivos
JSON `.data/*.json` via `src/lib/db.server.ts` (`readRows`/`mutateRows`/`newId`/
`nowIso`). O Supabase/Postgres já é usado para `leads`, `loinc_pt_br`,
`measurements`, `patient_pending_measurements`, `criterios`, `docs`,
`publications`, `subscriptions`.

**Convenções inegociáveis:**
- Client nunca chama lógica de servidor direto — sempre via server function em
  `src/lib/api/*.functions.ts`, consumida com `useQuery`/`useMutation`.
- Todo `.server.ts` usa `mutateRows`/`readRows`/`newId`/`nowIso`, guards
  `requireDoctor(token)` / `requirePatient(token)`, validação Zod, toasts sonner
  no client.
- Anti-mock: nada de dado fake em caminho de produção. Integração sem env var
  falha de forma visível, nunca simula sucesso.
- Toda copy é pt-BR. IA nunca aparece na copy do médico.
- Arquivos que declaram `createServerFn` devem ser wrappers finos: só imports,
  tipos e as declarações exportadas. Helpers de runtime vão para módulo
  importado ou para dentro do handler.
- Nunca criar Supabase Edge Functions. Server logic = `createServerFn`.
  Webhooks/APIs públicas = rotas em `src/routes/api/public/*`.
- Toda tabela nova em `public` precisa de `GRANT` + RLS + policies na MESMA
  migration, nessa ordem: CREATE TABLE → GRANT → ENABLE RLS → CREATE POLICY.

## Arquivos envolvidos

| Arquivo | Papel |
|---|---|
| `src/components/clinic/appointment-calendar.tsx` | ~2.560 linhas. Todo o calendário: views dia/semana/N-dias/mês/ano/lista, drag & drop, resize, diálogos de criação e edição, sidebar de categorias, lembretes |
| `src/lib/agenda.server.ts` | CRUD de agendamentos sobre `appointments.json` |
| `src/lib/api/clinic.functions.ts` | `getWorkspace`, `scheduleAppointment`, `deleteMyAppointment`, `updateMyAppointment`, `updateMyAppointmentTiming`, `saveMyCalendarSettings` |
| `src/lib/clinic-types.ts` | `Appointment`, `AppointmentStatus`, `CalendarSettings`, `EventCategory`, `DEFAULT_CALENDAR_SETTINGS` |
| `src/lib/db.server.ts` | Persistência JSON com cache em memória |
| `src/routes/app/index.tsx` | Monta `<AppointmentCalendar>`; dona da query `["workspace"]` |

---

## PARTE 1 — BUGS CRÍTICOS (fazer primeiro)

### BUG-1 · Evento criado desaparece (causa raiz: persistência efêmera)
`db.server.ts:persist()` escreve em `.data/*.json` e engole a falha num
`catch {}` vazio, mantendo só `mem[name]`. No runtime edge não há filesystem
durável e cada isolate tem cache próprio: o `invalidateQueries(["workspace"])`
disparado logo após criar pode ser servido por outro isolate, que não conhece o
evento. Resultado: toast de sucesso + bloco que nunca aparece, e perda de dado
em qualquer cold start.

**Correção:** migrar a coleção `appointments` para Postgres (Lovable Cloud).
- Migration com `CREATE TABLE public.appointments`, GRANT (`authenticated`,
  `service_role`; sem `anon`), `ENABLE ROW LEVEL SECURITY` e policy default-deny
  (o acesso é via server function com service role, seguindo o padrão já usado
  em `measurements`).
- Colunas espelhando o tipo `Appointment`: `id`, `doctor_id`, `patient_id`,
  `date_time timestamptz`, `status`, `note`, `kind`, `label`, `recurrence_id`,
  `duration_min`, `all_day`, `categoria_id`, `cor`, `descricao`, `local`,
  `lembretes_min int[]`, `created_at`, `updated_at`.
  Índices: `(doctor_id, date_time)` e `(doctor_id, recurrence_id)`.
- Reescrever `agenda.server.ts` mantendo **exatamente** as mesmas assinaturas
  exportadas, para não tocar em nenhum caller.
- Script de migração dos dados existentes de `appointments.json`, idempotente.
- Não migrar as outras coleções neste passo — escopo é a agenda.

### BUG-2 · Criação sem atualização otimista + refetch pesado
`agendar.onSuccess` chama `invalidateQueries(["workspace"])`. O `getWorkspace`
roda `withVinculo`, que faz N+1 (registry + evoluções **por paciente**). Em
consultório grande são segundos de espera até o bloco aparecer.

**Correção:**
- Criar query dedicada `["appointments", { from, to }]` alimentada por uma nova
  server function `listMyAppointments({ token, from, to })`, com range derivado
  da view atual. O calendário deixa de depender de `["workspace"]` para
  agendamentos (continua usando para pacientes/categorias).
- `onMutate` otimista em criar/mover/redimensionar/excluir, com rollback em
  `onError` e `invalidateQueries` só em `onSettled`.

### BUG-3 · Não é possível paralelizar de forma usável
`RESERVE_PX = 18` deixa apenas 18px na borda direita da coluna como área
clicável sobre horário ocupado; `onPointerDown` retorna cedo quando
`e.target !== colRef.current`, e clique no bloco abre o editor. O limite de
"até 3 pacientes em paralelo" nunca foi implementado em lugar nenhum.

**Correção:**
- Ação explícita "+ paralelo" no hover do bloco (ícone discreto no canto
  superior direito) e no menu de contexto (botão direito na coluna), abrindo o
  diálogo de criação já com o mesmo `dateTime` e a mesma duração.
- `maxParallel: 1 | 2 | 3` em `CalendarSettings` (default 1), persistido via
  `saveMyCalendarSettings`, com controle no popover de configurações.
- Validar no servidor em `scheduleAppointment` e `updateMyAppointmentTiming`:
  ao exceder `maxParallel` retornar `{ ok: false, error: "parallel_limit" }`;
  o client mostra toast explicativo, não silencia.
- Manter a faixa `RESERVE_PX` como atalho, mas ela deixa de ser o único caminho.

### BUG-4 · Drag e resize "piscam"
`atualizarTiming` não tem `onMutate`; o bloco volta à posição antiga até o
refetch. Aplicar o mesmo tratamento otimista do BUG-2.

---

## PARTE 2 — BUGS FUNCIONAIS

- **BUG-5 · `bloqueioAt` só testa o instante inicial.** Um evento de 60min solto
  5min antes de um bloqueio atravessa o bloqueio inteiro. Trocar por teste de
  interseção de intervalos `[start, start+duration)`.
- **BUG-6 · Drop rejeitado é silencioso.** `onDrop` faz `return` sem feedback.
  Emitir toast: "Esse horário está bloqueado por *{label}*."
- **BUG-7 · Recorrência frágil.** `stepDate` usa `setMonth` nativo: dia 31 vira
  dia 3 do mês seguinte, e `toISOString()` não trata horário de verão. Fixar o
  dia do mês (clamp no último dia válido) e preservar hora local.
- **BUG-8 · `allDay` só existe para evento pessoal.** Em consulta o `confirmar()`
  força `allDay: false`, e blocos all-day não são arrastáveis. Unificar.
- **BUG-9 · Sem "+N mais" em sobreposição.** Acima de `maxParallel` visível, os
  blocos viram tiras ilegíveis. Renderizar no máximo 3 colunas e um chip
  "+N mais" que abre popover com a lista.
- **BUG-10 · `AppointmentStatus` é morto na UI.** `agendada | confirmada |
  realizada | faltou` existe no tipo e no servidor mas não aparece na agenda.
  Expor como cor/estilo de borda no bloco e como seletor no editor; propagar a
  mudança para o Kanban.
- **BUG-11 · Lembretes só valem com a aba aberta.** `useAppointmentReminders` é
  toast client-side com `firedRef`; recarregar perde o disparo. Mover para
  server-side, reaproveitando a Meta WhatsApp Cloud API já implementada em
  `whatsapp.server.ts` (nunca lib não-oficial). Sem env var → falha visível.
- **BUG-12 · Filtro da sidebar é inconsistente.** Eventos escondidos por
  categoria ainda expandem `gridSettings` e ainda disparam lembretes visuais.
  Definir: o filtro é só visual do grid; documentar no código e alinhar o
  cálculo de `gridSettings` ao conjunto visível.
- **BUG-13 · Sem guard anti-duplo-clique.** Dois cliques rápidos em "Confirmar"
  criam dois agendamentos. Desabilitar por `agendar.isPending` em todos os
  caminhos + chave de idempotência no servidor.
- **BUG-14 · Visão/densidade/cursor não persistem.** Trocar de página reseta
  para "semana"/hoje. Persistir em `localStorage` (mesmo padrão do painel de
  conhecimento).
- **BUG-15 · Scroll inicial inútil.** O grid abre em `startHour`. Ancorar no
  "agora" (ou no primeiro evento do dia) e adicionar auto-scroll ao arrastar
  perto do topo/base.

---

## PARTE 3 — MELHORIAS DE UX E FLUIDEZ

**Fluidez**
1. **Desfazer** em toast (5s) para remarcar, redimensionar e excluir.
2. **Atalhos:** `D`/`S`/`M` (dia/semana/mês), `←`/`→` navegar, `T` hoje, `N`
   novo evento, `Esc` fechar, `Delete` remover selecionado.
3. **`Alt` + arrastar duplica** o evento em vez de mover (retornos em série).
4. **Zoom de densidade** (0,8×–2× sobre `PX_PER_MIN`) para caber o dia inteiro.
5. **Mini-mapa mensal** na sidebar para pular datas sem trocar de visão.

**Prevenção de erro**
6. Sombrear fora do expediente e **avisar (não impedir)** ao soltar ali.
7. Confirmação sutil ao mover evento já passado.
8. Feedback visual de conflito (borda âmbar) ao ultrapassar `maxParallel`,
   antes do submit.

**Fluxo clínico**
9. **`Ctrl+K`**: buscar paciente e pular direto ao próximo agendamento dele.
10. **Ações rápidas no hover** do bloco: abrir prontuário, confirmar por
    WhatsApp, remarcar, agendar paralelo.
11. **Lista de espera** com sugestão de encaixe quando um horário vaga.

**Estado e acessibilidade**
12. Skeleton no grid enquanto carrega (sem salto de layout) e empty state.
13. `role="button"` + `tabIndex` nos blocos; mover por teclado com
    `Shift + ↑/↓`.

---

## Ordem de execução sugerida

| Fase | Entrega |
|---|---|
| **1 — Corrigir** | BUG-1, BUG-2, BUG-4, BUG-13 |
| **2 — Paralelizar** | BUG-3, BUG-5, BUG-6, BUG-9 |
| **3 — Fluidez** | BUG-14, BUG-15 + melhorias 1, 2, 4, 6, 12 |
| **4 — Clínico** | BUG-8, BUG-10, BUG-11 + melhorias 9, 10, 11 |

Entregar uma fase por vez, com typecheck limpo ao final de cada uma. Não
refatorar o `appointment-calendar.tsx` inteiro de uma vez: ele é grande, mas a
quebra em componentes deve acontecer de forma incremental, junto das fases, e
não como passo isolado.

## Critérios de aceite

- Criar evento (clique simples, arrasto, drop de paciente) faz o bloco aparecer
  **imediatamente** e ele continua lá após F5 e após redeploy.
- É possível criar 2 e 3 atendimentos no mesmo horário por ação explícita; a
  4ª tentativa com `maxParallel: 3` é recusada com mensagem clara.
- Mover/redimensionar não pisca e é desfazível.
- Nenhum dado simulado em caminho de produção; integração sem chave falha
  visivelmente.
- Toda copy nova em pt-BR, tom clínico objetivo.
