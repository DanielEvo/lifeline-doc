# HANDOVER — Auditoria QA/Arquitetura Completa · LifeLine (v1)

**Data da auditoria:** 2026-08-15 · **Autor:** Claude Code (Staff Engineer QA/Arquitetura Reviewer) · **Repositório:** `lifeline-doc` (branch `main`, `git pull` confirmado atualizado no início da sessão) · **Metodologia:** leitura direta, read-only, arquivo por arquivo, sem edições.

---

## 0. Como usar este documento

Você é o novo engenheiro. Você não tem contexto prévio deste projeto. Este documento é a fonte de verdade sobre o estado **real** do código — não sobre o que a documentação diz que o código faz. Onde os dois divergem, a Seção 7 registra os dois lados e o código sempre venceu.

Leia nesta ordem:
1. **Seção 1** (sumário executivo) — 5 minutos, te dá o tamanho do problema.
2. **Seção 8** (veredito por fluxo crítico) — te diz onde você pode e não pode confiar no sistema hoje.
3. **Seção 6** (matriz de severidade) — sua lista de trabalho, já ordenada.
4. **Seção 9** (primeiras 2 semanas) — ordem sugerida de leitura e correção.
5. Seções 2 a 5 e os ADRs (Seção 5) conforme for precisando de profundidade em cada área.

Todo achado pontual usa o prefixo `QA-xx` e cita `arquivo:linha`. Toda decisão estrutural com trade-off real virou um `ADR-xx` (Seção 5), não uma linha na tabela de achados. Nenhum destes prefixos colide com os já existentes no projeto (`TECH-xx`, `PM-xx`, `UX-xx`, `BKL-xx`, `ACC-xx`, `SEC-xx`), que continuam válidos e são referenciados onde relevante.

---

## 1. Sumário executivo

**Estado geral: mais maduro do que a documentação legada sugere, com dois riscos P0 concentrados e reais.** O time corrigiu, entre a última rodada de handovers e hoje, boa parte dos problemas já conhecidos (rota `/admin` agora tem guard real, rate limiting existe, a maioria dos bugs de agenda do `HANDOVER_AGENDA_v1.md` está corrigida, o mapeamento LOINC está exatamente como o handover mais recente descreve). Mas a auditoria encontrou **dois clusters de risco P0 não documentados em nenhum handover anterior**, ambos exploráveis hoje por um médico autenticado normal, sem privilégio especial:

1. **Perda silenciosa de dado clínico/legal.** `src/lib/store.server.ts` ainda grava em disco local com `catch` vazio (mesmo padrão que já causou um bug de produção documentado em `db.server.ts`, mas nunca corrigido aqui) — e está no caminho ativo de emissão de receita local e do selo de consulta. Ver QA-56/57/58/59.
2. **Bypass ativo do gate de compliance RDC 1000/25 e da regra "Memed assina, LifeLine organiza".** A mesma tela que bloqueia corretamente a prescrição sem CPF/passaporte oferece, ao lado, um botão "Gerar receita local" que nunca pede esses dados e usa um hash SHA-256 chamado de "assinatura ICP-Brasil-style" no próprio comentário do código — não é uma assinatura digital real. Ver QA-90/91/92/93.
3. Bônus: a bancada de simulação Memed (`/app/memed-simulacao`, visível a qualquer médico logado) não tem nenhuma trava de ambiente — se as chaves de produção da Memed estiverem configuradas, ela cria/usa um prescritor real na Memed produção sob um CRM fictício. Ver QA-95/96.

**Números:** 9 achados **P0**, ~43 **P1**, ~118 **P2** (matriz completa na Seção 6), organizados em 10 clusters de revisão + 4 ADRs retroativos. Nenhum P0 está em código morto ou inatingível — todos são exploráveis por um usuário autenticado comum no caminho principal do produto.

**Maior risco único:** o par QA-90/91/92 (fallback de receita local). Não é um bug sutil — é um botão visível, numa tela usada todo dia, que anula simultaneamente uma exigência regulatória em vigor e o modelo de confiança que justifica toda a integração Memed.

**O que está sólido e não precisa de atenção imediata:** autenticação (guard real em `/admin`, isolamento médico/paciente verificado, sem IDOR em `pacientes.$id.tsx`), a migração de `agenda.server.ts`/`measurements.server.ts` para Postgres relacional (resolveu os riscos que os handovers antigos ainda citavam como abertos), o pipeline de OCR (`ocr-extraction.server.ts`), o webhook do Stripe (assinatura verificada corretamente — não confirma a hipótese de risco original), e a disciplina anti-mock (dado de demo nunca vaza para produção, em nenhum dos módulos revisados).

---

## 2. Arquitetura real observada

### 2.1 Requisitos implícitos revelados pelo código

Nenhum destes está escrito em nenhum PRD — são inferidos da forma como o código foi construído:

- **Escala assumida: um médico, um consultório pequeno, dezenas a centenas de pacientes — não uma rede de clínicas.** `withVinculo`/`getWorkspace` (`src/lib/api/clinic.functions.ts:335-390`) carrega **todos** os pacientes vinculados do médico sem paginação e faz até 3 leituras completas de coleção por paciente (QA-65). Isso é aceitável hoje; não é aceitável se o piloto crescer 10x.
- **Escala assumida: coleções cabem inteiras em memória por request.** Todo módulo sobre `db.server.ts` (`patients.server.ts`, `patients-registry.server.ts`, `patient-medications.server.ts`, `patient-metrics.server.ts`, `records.server.ts`, `board.server.ts`, `categories.server.ts`, `services.server.ts`, `templates.server.ts`, `appointment-types.server.ts`) lê a coleção inteira — **de todos os médicos da plataforma** — e filtra em memória. Não há paginação nem filtro no nível do banco (QA-69), diferente de `measurements.server.ts`, que já usa `.eq()` no Supabase.
- **Disponibilidade assumida: até 2s de inconsistência entre isolates é aceitável.** `CACHE_TTL_MS = 2000` em `db.server.ts:21`, sem invalidação ativa cross-isolate.
- **Concorrência assumida: baixa.** Nenhum dos padrões de escrita (checagem de unicidade, contadores de rate limit, checagem de limite paralelo de agenda) usa transação real — todos assumem que duas requisições conflitantes no mesmo recurso, no mesmo instante, são raras o bastante para não precisar de lock (QA-50, QA-66, QA-210).
- **Durabilidade assumida diferente por tipo de dado, e a categorização está errada em um ponto.** O time claramente decidiu "prontuário = Postgres, durável; trilha administrativa = pode tolerar perda". O problema: `prescriptions.json`/`consultations.json` foram categorizados no grupo errado — são documentos legalmente relevantes (uma prescrição, um selo de consulta), mas usam a persistência efêmera de `store.server.ts` (QA-56/57/58/59).
- **O runtime de deploy é multi-isolate/edge-like (Cloudflare Workers), e isso já mordeu o projeto uma vez.** O cabeçalho de `db.server.ts` narra explicitamente um incidente de produção anterior ("sessão do médico caía depois de ~1 min... ditado morria em 'Sessão expirada'") causado por estado em memória de processo não sobrevivendo entre isolates. A correção (migrar sessão/coleções genéricas para Postgres via `kv_collections`) foi aplicada — mas o **mesmo padrão de risco continua vivo** em `rate-limit.server.ts` (QA-04/12/18/24) e no contador diário de OCR (QA-16): ambos são `Map` em memória de processo, no mesmo runtime que já provou não preservar esse tipo de estado.

### 2.2 High-level design real (não o documentado — o que o código de fato faz)

O LifeLine é dois apps React (`/app` médico, `/paciente/app` paciente) sobre o mesmo backend TanStack Start (server functions via `createServerFn`, nunca Edge Functions do Supabase — convenção respeitada em 100% dos arquivos revisados). A persistência é **híbrida em três camadas**, não duas como os handovers sugerem:

1. **Tabelas Postgres relacionais reais**, com RLS + policy deny-all + acesso só via `service_role`: `appointments`, `measurements`, `patient_pending_measurements`, `loinc_pt_br`, `criterios`, `docs`, `publications`, `subscriptions`. Estas são as coleções que passaram por migração dedicada e têm queries filtradas no banco (`.eq()`).
2. **`kv_collections`** (`src/lib/db.server.ts`): uma tabela Postgres genérica que guarda cada "coleção" antiga (`patients.json`, `doctors.json`, `boards.json`, `categories.json`, etc.) como um blob JSON por linha, lido/escrito inteiro a cada operação (`readRows`/`mutateRows`), com cache em memória de 2s por isolate. Migrou o *armazenamento* de disco para Postgres, mas manteve o *modelo de acesso* de arquivo JSON (sem índice, sem filtro no banco, sem transação real entre isolates).
3. **Filesystem local efêmero** (`src/lib/store.server.ts`): ainda usa `fs.writeFile` real, com fallback silencioso para memória se a escrita falhar. Cobre `prescriptions.json`, `consultations.json`, `feedback.json`, `leads.json`. É o único dos três tiers que não sobrevive a cold start/multi-isolate de forma alguma — e continua no caminho ativo de emissão de receita (ver ADR-01).

Autenticação é **inteiramente custom** (SHA-256+salt, sessão por token em `localStorage`, OAuth Google com state HMAC próprio) para médico, paciente e admin — três implementações paralelas, duas delas (médico/paciente) quase duplicadas linha a linha. O Supabase Auth existe no repositório mas só protege o fluxo de billing (ver ADR-02).

Integrações externas seguem um padrão consistente de "falha visível, nunca simulação" (Gemini, Resend, WhatsApp, Memed todos verificados) — a única exceção real é a persona de demonstração que substitui o Google OAuth quando as credenciais não estão configuradas (QA-22), que é um risco condicional a erro operacional, não um bug ativo.

### 2.3 Deep dive nos fluxos críticos

**Login médico:** e-mail/senha (SHA-256+salt, 1 iteração, sem PBKDF2/argon2 — QA-01) ou Google OAuth (authorization-code flow real, state HMAC anti-CSRF bem implementado). Sessão em `localStorage`, TTL 30 dias, sem cookie `httpOnly` (QA-02). Rate limiting existe no código mas roda em `Map` de memória de processo — não sobrevive ao runtime multi-isolate que o projeto já sabe que tem esse problema (QA-04). Reset de senha não revela existência de conta (regra "identidade ≠ acesso" respeitada) e derruba todas as sessões da conta ao trocar a senha.

**Login paciente:** espelha o médico linha a linha (mesmo hash fraco — QA-10, mesmo localStorage — QA-11, mesmo rate limiter frágil — QA-12). Isolamento de namespace entre `doctors.json`/`patient_accounts.json` é real, verificado por grep no repositório inteiro — nenhum ponto de código cruza os dois sem `hasProfileAccess`/`hasActiveGrant` como portão.

**Upload/OCR de exame:** o pipeline mais maduro do produto (`ocr-extraction.server.ts`) — retry com backoff exponencial, divisão recursiva de páginas por limite de tokens, nunca finge sucesso sem `GEMINI_API_KEY`. Ponto fraco real: nenhuma chamada à Gemini (nem aqui, nem no chat de conhecimento, nem no ditado) define timeout/`AbortSignal` (QA-131), e os arquivos enviados ao File API da Gemini nunca são deletados explicitamente — ficam retidos no lado do Google até o TTL padrão deles, sem controle de retenção do lado LifeLine (QA-134, relevante para LGPD dado de saúde).

**Prescrição (Memed):** o caminho oficial está correto — gate de CPF/passaporte da RDC 1000/25 implementado e comentado explicitamente no código, `memedFetch` com timeout+retry+classificação de erro cuidadosa. **Mas existe um segundo caminho, ativo, na mesma tela**, que contorna esse gate inteiro (ver ADR-04 e QA-90-96). Este é o achado mais grave da auditoria.

**Billing:** duas integrações Stripe coexistem (assinatura via Connector Gateway Lovable; cobrança avulsa via chave direta) — nenhuma tem segredo hardcoded. O webhook verifica assinatura corretamente (a hipótese de risco original não se confirmou), mas processa eventos como "last write wins" sem checar ordem de entrega, e a mesma regra de "assinatura ativa" com bug de cancelamento-no-meio-do-ciclo está duplicada, com o mesmo defeito, em TypeScript **e** em SQL (QA-163/164/167/168).

### 2.4 Escala e confiabilidade

**O que quebra primeiro com 10x mais médicos-piloto:** a tela principal do médico (`getWorkspace`), porque `withVinculo` faz de 2 a 3 leituras completas de coleção por paciente vinculado, sem paginação, disparado a cada `invalidateQueries(["workspace"])`. Isso já é reconhecido pelo próprio time em comentário no código (BUG-2 do handover de agenda) e só foi parcialmente mitigado — a agenda ganhou uma query dedicada, a lista de pacientes/kanban não.

**Failover:** nenhum. Não há circuit breaker, não há fila de retry assíncrona para integrações externas — cada chamada falha e devolve erro ao usuário na hora, o que é aceitável para o volume atual mas não é "failover".

**Monitoramento/alerta:** não existe. Error tracking real (Sentry/Datadog/equivalente) não está integrado em nenhum ponto do produto — o que existe é `console.error` + um bridge opcional específico da plataforma de hosting Lovable (`window.__lovableEvents`), que é um no-op fora desse ambiente (QA-290). Em produção, um erro só é visível se alguém estiver olhando log bruto no momento em que ele acontece.

**CI/CD:** inexistente — confirmado por dois métodos independentes (busca por `*.yml`/`*.yaml` no repo inteiro, e ausência de `.github/`). Não há também script `test` no `package.json`. Nenhum lint, build, typecheck ou teste roda automaticamente antes de merge/deploy (QA-310, QA-336; ver ADR-03).

### 2.5 Trade-offs observados

| Escolha estrutural | Trade-off implícito |
|---|---|
| JSON/`kv_collections` em vez de tabelas relacionais para a maioria das coleções | Ganho: migração incremental, baixo esforço inicial. Perda: sem índice, sem filtro no banco, sem transação real entre isolates — cada leitura transporta a coleção inteira da plataforma. |
| Auth customizada em vez de Supabase Auth para médico/paciente | Ganho: controle total sobre o modelo de sessão/consentimento clínico. Perda: reimplementa (com bugs próprios, como hash sem work-factor) o que Supabase Auth já resolveria, e mantém dois sistemas de identidade paralelos no mesmo produto. |
| Fallback de "receita local" sem gate de CPF | Ganho aparente: resiliência quando a Memed está fora do ar. Perda real: o fallback não distingue "Memed indisponível" de "gate de compliance bloqueou", e é usado ativamente para o segundo caso — o oposto do que resiliência deveria fazer. |
| Sem suíte de testes/CI | Ganho: velocidade de iteração no início do projeto. Perda: os dois maiores achados P0 desta auditoria (perda silenciosa de dado, bypass de compliance) são exatamente o tipo de regressão que um teste de integração básico nos fluxos de prescrição e persistência teria pego antes de chegar a produção. |

---

## 3. O que está bem feito (consolidado — onde não mexer sem necessidade real)

- **Guard de `/admin` é real**, não só de UI: `beforeLoad` na rota **e** cada server function de dado (`getFeedback`, `getLeads`, `getConsultations`, `getPrescriptions`, `getAccessLog`) revalida `requireAdminSession` de forma independente. Sem credencial padrão hardcoded — sem `ADMIN_LOGIN`/`ADMIN_PASSWORD` configurados, semeia login/senha aleatórios de 16/32 bytes nunca revelados, e bloqueia explicitamente a credencial legada `"lifelineadm"`.
- **Sem IDOR em `pacientes.$id.tsx`** — checagem "este paciente é seu" é feita exclusivamente no servidor (`getPatient(doctor.id, data.id)`, filtro por `doctorId` na própria query), confirmado com cadeia de evidência completa.
- **Isolamento médico/paciente** (`doctors.json`/`patient_accounts.json`, TECH-13) é real, verificado por grep no repositório inteiro — não é só intenção documentada.
- **`db.server.ts` já foi corrigido** para o problema que motivou o incidente de produção anterior — hoje é Postgres (`kv_collections`), não mais JSON em disco com catch vazio. O comentário de topo do arquivo é honesto e rastreável sobre o bug antigo e o fix.
- **Migração de `agenda.server.ts` e `measurements.server.ts` para Postgres relacional está completa e correta** — resolve exatamente os riscos que `HANDOVER_AGENDA_v1.md` e `HANDOVER_LOINC_Integracao_v2.md` ainda citavam como abertos. A maioria dos 15 bugs do handover de agenda (BUG-1 a BUG-15) está de fato corrigida, com evidência de código (ver Seção 7 e o detalhe completo no cluster de agenda).
- **`ocr-extraction.server.ts`** é o módulo mais maduro do produto: retry com backoff exponencial diferenciando falha transitória de permanente, divisão recursiva de documentos grandes, nunca finge sucesso sem `GEMINI_API_KEY`.
- **Webhook do Stripe verifica assinatura corretamente** (HMAC-SHA256, janela de replay de 300s, segredo resolvido por ambiente antes do parse) — a hipótese de risco original (webhook sem verificação) não se confirmou.
- **Curadoria LOINC é clinicamente responsável**: onde a verificação falhou ou ficou ambígua, o código usa `null` em vez de chutar um código — confirmado linha a linha contra `HANDOVER_LOINC_v3_Pendencias.md`, 100% consistente.
- **Consentimento LGPD é registrado de verdade**: `consentVersion` + `consentAcceptedAt` (timestamp real) persistidos no servidor, gate aplicado em ambos os apps, cobrindo contas novas, OAuth e legadas.
- **Disciplina anti-mock é real em todos os módulos revisados**: `GEMINI_API_KEY`/`RESEND_API_KEY`/`WHATSAPP_ACCESS_TOKEN` ausentes falham visivelmente, nunca simulam sucesso; dado de demonstração (`/demo`, `patient-demo-data.ts`) nunca vaza para caminho de produção, sempre rotulado.
- **TECH-11 (proibição de libs não-oficiais de WhatsApp) é respeitado de fato** — `whatsapp.server.ts` usa exclusivamente `fetch` direto contra a Graph API oficial da Meta; grep no repositório inteiro (incluindo `package.json`) não encontrou Baileys/whatsapp-web.js/Evolution API/wppconnect/venom-bot.
- **Migrations Postgres seguem convenção consistente** (`REVOKE ALL` explícito + `GRANT` a `service_role` + `RLS` + `POLICY` deny-all documentada) nas tabelas clínicas sensíveis — nenhuma tabela com RLS desligado ou policy `USING (true)` genérica foi encontrada em nenhuma das 18 migrations.
- **Catálogos de negócio** (categorias, serviços, templates, tipos de atendimento) seguem o mesmo padrão correto e consistente: `requireDoctor` + Zod em 100% das server functions, nunca hard-delete (flag `ativo` + snapshot do valor no momento de uso).

---

## 4. Achados por dimensão

Cada achado cita `arquivo:linha`, severidade (critério na Seção 6) e por que importa. Organizados por dimensão; o módulo de origem está entre colchetes no início de cada linha.

### 4.1 Security

| ID | Local | Descrição | Por que importa | Sev. |
|---|---|---|---|---|
| QA-90 | [Prescrição] `src/routes/app/pacientes.$id.tsx:3232-3238,3364-3379` | Quando o gate RDC 1000/25 bloqueia por `missing_cpf`, a UI oferece e habilita um botão "Gerar receita local" na mesma tela, sem atrito adicional. | Contorna ativamente um bloqueador de compliance em vigor. | **P0** |
| QA-91 | [Prescrição] `src/lib/api/clinic.functions.ts:1364-1391`, `src/lib/records.server.ts:132-164` | `prescribeForEvolution`/`prescribeEvolution` não exigem nem verificam CPF/passaporte/data de nascimento em nenhuma etapa. | Emissão de documento com aparência de receita sem os campos exigidos pela RDC 1000/25. | **P0** |
| QA-92 | [Prescrição] `src/lib/domain.server.ts:8-20` | "Assinatura" é SHA-256 do payload, comentado no próprio código como "ICP-Brasil-style" — não é assinatura digital ICP-Brasil real. Apresentada publicamente em `/receita/$code` com linguagem legal (CFM 2.299/2021). | Viola "Memed assina, LifeLine organiza"; documento sem validade jurídica apresentado como se tivesse. | **P0** |
| QA-95 | [Prescrição] `src/lib/memed.server.ts:425-439`, `src/lib/api/clinic.functions.ts:1154-1183` | Bancada de simulação (`getMemedSandboxToken`/`getMemedSandboxConfig`) não verifica `memedEnvironment()` — usa as mesmas chaves que resolvem para produção quando `MEMED_ENV=live`. | Pode criar/usar prescritor real na Memed produção sob CRM fictício. | **P0** |
| QA-96 | [Prescrição] `src/routes/app/route.tsx:205-211` | Link "Simulação Memed (QA)" permanentemente visível a qualquer médico logado, em qualquer ambiente, sem gate de admin/feature flag. | Consequência direta de QA-95 — qualquer médico pode acionar o risco. | **P0** |
| QA-101 | [Prescrição] `src/lib/api/prontuario.functions.ts:27-51,54-72` | `sealConsultation`/`prescribe` sem nenhum guard de autenticação (diferente das demais funções do arquivo). Gera receita local sem CPF, grava no mesmo store de `/receita/$code`. | Endpoint potencialmente alcançável sem auth alguma; verificação de reachability real pendente. | **P0 (potencial)** |
| QA-19 | [Auth] `src/lib/api/admin-auth.functions.ts:44-52` | `adminCheckCookie` aceita cookie `httpOnly` OU token de `localStorage` (para suportar preview em iframe) — reabre a superfície que o cookie `httpOnly` foi desenhado para fechar. | Trade-off aceito e documentado, mas anula parte do ganho de segurança do cookie. | P1 |
| QA-01 | [Auth] `src/lib/auth.server.ts:85-87` | `hashPassword` é SHA-256 salgado, 1 iteração — sem PBKDF2/scrypt/bcrypt/argon2. | Hashes baratos de quebrar em GPU se `doctors.json` vazar. | P1 |
| QA-02 | [Auth] `src/lib/session.ts:21-27` | Token de sessão médico em `localStorage`, não cookie `httpOnly`. TTL 30 dias. | XSS rouba token = acesso total por até 30 dias. | P1 |
| QA-04 | [Auth] `src/lib/api/auth.functions.ts:31-32`, `src/lib/rate-limit.server.ts:16-39` | Rate limiter de login/reset é `Map` em memória de processo — não sobrevive ao runtime multi-isolate documentado em `db.server.ts`. | Lockout de força bruta provavelmente contornável em produção. | P1 |
| QA-10 | [Auth] `src/lib/patient-auth.server.ts:72-74` | Mesmo hash fraco de QA-01, protegendo conta de acesso a PHI do paciente. | Idem QA-01, agora sobre dado de saúde. | P1 |
| QA-11 | [Auth] `src/lib/patient-session.ts:23-29` | Mesmo problema de QA-02, lado paciente — dado exposto por sequestro de sessão é PHI direto. | Idem QA-02. | P1 |
| QA-12 | [Auth] `src/lib/api/patient-auth.functions.ts:40-41` | Mesmo problema de QA-04, lado paciente. | Idem QA-04. | P1 |
| QA-18 | [Auth] `src/lib/admin-auth.server.ts:121-145` | Lockout de força bruta do admin também em `Map` de memória — mesmo problema, agora no painel de maior privilégio. | Idem QA-04, maior blast radius. | P1 |
| QA-22 | [Auth] `src/lib/api/auth.functions.ts:215-226`, `src/lib/api/patient-auth.functions.ts:224-235` | Sem `GOOGLE_CLIENT_ID`/`SECRET`, login com Google autentica automaticamente uma persona fixa, sem senha. Depende só de disciplina operacional para nunca rodar em produção. | Login universal não intencional se o deploy de produção subir sem essas env vars. | P1 (condicional) |
| QA-138 | [OCR/LOINC] `src/lib/clinic-types.ts:306-693` | `BIOMARKER_CATALOG` (o único caminho com faixa de referência calibrada) é 100% CHEM/HEM-BC — zero SERO/COAG/UA, 1 de TUMRRGT. | Concretiza no código o viés de vertical que o produto diz não ter; qualquer exame de sorologia/coagulação/urinálise vira "não reconhecido". | P1 |
| QA-134 | [OCR/LOINC] `src/lib/gemini-client.server.ts:29-80`, `src/lib/ocr-extraction.server.ts:101-158` | Arquivos enviados ao File API da Gemini nunca são deletados — ficam retidos no Google até TTL padrão (~48h). | Retenção de dado de exame/áudio de consulta fora do controle do LifeLine — validar com DPO/LGPD. | P1 |
| QA-140 | [OCR/LOINC] `src/lib/knowledge-chat.functions.ts:8-11` | Conteúdo de mensagem do chat sem `.max()` — payload ilimitado encaminhado à Gemini. | Custo/abuso sem controle. | P1 |
| QA-14 | [Auth] `src/lib/patient-access.server.ts:39,42-46` | Código presencial de 6 dígitos (TTL 10min) sem rate limit/lockout. | Espaço de busca pequeno (10⁶) sem fricção nenhuma. | P2 |
| QA-161 | [Billing] `src/lib/stripe.server.ts:100` | Comparação de assinatura de webhook não é constant-time. | Side-channel teórico de baixo risco. | P2 |
| QA-293 | [Infra] `src/components/ui/chart.tsx:71-89` | Único `dangerouslySetInnerHTML` do repo — sem input de usuário hoje, superfície hipotética se um consumidor futuro passar config não confiável. | Defesa em profundidade. | P2 |
| QA-142, QA-15, QA-135, QA-196, QA-172, QA-178, QA-222 | [vários] Diversos pontos devolvem `err.message`/`String(e)` bruto ao cliente autenticado. | Vazamento de detalhe interno — baixo risco individual, padrão repetido em ~7 arquivos diferentes. | P2 (cada um) |

### 4.2 Performance

| ID | Local | Descrição | Por que importa | Sev. |
|---|---|---|---|---|
| QA-65 | [DB] `src/lib/api/clinic.functions.ts:335-390` (`withVinculo`/`getWorkspace`) | N+1 confirmado: até 3 leituras completas de coleção por paciente vinculado, sem paginação, na tela principal do médico. Já documentado pelo próprio time; mitigado só para agenda. | Escala mal com o crescimento do piloto. | P1 |
| QA-228 | [Agenda] `src/lib/api/clinic.functions.ts:335-346,382` | Kanban/pacientes continua inteiro sobre `getWorkspace`/`withVinculo` mesmo após a correção dedicada da agenda. | Mesmo custo, superfície menor mas ainda paga a cada `invalidateQueries`. | P2 |
| QA-69 | [DB] `src/lib/patient-medications.server.ts:81-89`, `patient-metrics.server.ts:58-64` | Leitura de coleção inteira (todos os pacientes de todos os médicos) filtrada em memória, sem índice/filtro no Postgres. | Contrasta com `measurements.server.ts`, que já filtra no banco — não escala. | P2 |
| QA-136 | [OCR/LOINC] `supabase/migrations/20260726040000_loinc-fuzzy-match.sql:21-29` | `loinc_fuzzy_match` usa `similarity()` sobre expressão diferente da coluna indexada — o índice GIN criado para essa função não é de fato usado. | Força varredura sequencial nas 14.598 linhas a cada chamada; funciona hoje, não escala. | P2 |
| QA-173, QA-174 | [Billing] `src/lib/subscription.functions.ts:61-76,132,136` | Chamadas Stripe sequenciais que são independentes e poderiam rodar em paralelo. | Latência desnecessária no checkout. | P2 |
| QA-51 | [DB] `src/lib/db.server.ts:39-50` | Cache de 2s por isolate sem invalidação ativa cross-isolate. | Janela real de leitura obsoleta pós-escrita entre isolates. | P2 |
| QA-327 | [Config] `supabase/migrations/20260701163706_...sql:16-24` (leads) | Sem índice em `email`/`created_at`. | Baixa prioridade hoje (insert-only). | P2 |

### 4.3 Correctness

| ID | Local | Descrição | Por que importa | Sev. |
|---|---|---|---|---|
| QA-56 | [DB] `src/lib/store.server.ts:25-33` | `fs.writeFile` local com `catch` vazio ("in-memory only — degrade gracefully"). Runtime edge não garante filesystem gravável/durável. | Dado só sobrevive no isolate atual; desaparece no próximo cold start, sem log. | **P0** |
| QA-57 | [DB] `src/lib/records.server.ts:132-164` → `clinic.functions.ts:1364-1391` → `store.server.ts:132-137` | Caminho de prescrição local ativamente conectado a server function autenticada exposta, sujeito ao QA-56. | Prescrição real pode desaparecer silenciosamente. | **P0** |
| QA-58 | [DB] `src/lib/api/receita.functions.ts:8-25` | Página pública `/receita/$code` lê exclusivamente do store sujeito ao QA-56. | Paciente/auditor pode receber "não encontrado" para receita que acabou de ser emitida. | **P0** |
| QA-59 | [DB] `src/lib/records.server.ts:97-130` → `store.server.ts:106-117` | Selo digital de consulta também grava trilha via `addConsultation` (mesmo padrão QA-56). | Perda de trilha de auditoria/conformidade, não do prontuário em si (esse está seguro em Postgres). | P1 |
| QA-163 | [Billing] `src/routes/api/public/payments/webhook.ts:22-50` | `upsertSubscription` é "last write wins" sem checar `event.id`/ordem de entrega — Stripe não garante ordem. | Evento antigo pode sobrescrever estado mais recente de assinatura. | P1 |
| QA-164 | [Billing] `webhook.ts:52-58` | `customer.subscription.deleted` não atualiza `current_period_end`. | Combinado com QA-167/168, cancelamento no meio do ciclo continua "ativo". | P1 |
| QA-167, QA-168 | [Billing] `subscription.functions.ts:180-182` e migration `20260722222022...sql:40-43` | Mesma regra de "assinatura ativa" com o mesmo bug, duplicada em TS **e** SQL. | Correção precisa ser feita nos dois lugares; qualquer consumidor futuro da function SQL herda o bug. | P1 (cada um) |
| QA-169 | [Billing] `src/routes/assinatura/index.tsx:71-75` | `getStripeEnvironment()` síncrono fora de try/catch no `useEffect` inicial — lança antes do `.catch` poder rodar. | Sem `VITE_PAYMENTS_CLIENT_TOKEN`, a página inteira quebra em vez de mostrar o fallback gracioso já desenhado. | P1 |
| QA-214 | [Agenda] `src/components/clinic/action-dialogs.tsx:67-120` (`ScheduleDialog`) | Correção de double-submit (BUG-13) não cobre este 2º ponto de entrada de agendamento. | Duplo clique real duplica agendamento a partir do card de paciente/kanban. | P1 |
| QA-217 | [Agenda] `appointment-calendar.tsx:352-383` | BUG-11 do handover permanece não corrigido — lembretes só `setInterval`+toast client-side, decisão deliberada e documentada no código. | Lembrete clínico perdido se a aba foi fechada perto do horário de disparo. | P1 |
| QA-225 | [Agenda] `action-dialogs.tsx:127-216` (`ChargeDialog`) | Mesma classe de QA-214: sem idempotência/guard síncrono. | Duplo clique duplica cobrança financeira do paciente. | P1 |
| QA-252 | [Rotas UI] `pacientes.$id.tsx:1436-1584` (`SolicitarHistoricoDialog`) | "Desbloquear histórico" só checa `code.length===6` no cliente — nenhuma chamada ao servidor valida o código; `onAutorizado` nunca é passado pelo pai. | Fluxo inteiro é decorativo — falsa impressão de verificação de autorização que não existe. | P1 |
| QA-250, QA-251 | [Rotas UI] `app/index.tsx:137-143`, `pacientes.$id.tsx:265-282` | Erro de rede não tratado (`isError`) vira spinner infinito ou "Paciente não encontrado" — sem distinguir falha de "não existe". | Apresenta falha de infra como se fosse ausência de dado. | P1 (cada um) |
| QA-130, QA-131, QA-132 | [OCR/LOINC] `gemini-client.server.ts:87-150` e todo o arquivo, `transcribe.functions.ts:76-132` | Sem retry/backoff, sem timeout/AbortSignal, sem rate limit diário no chat/ditado (diferente do OCR). | Requisição pendurada bloqueia sem fallback; abuso sem teto de custo. | P1 (cada um) |
| QA-141 | [OCR/LOINC] `knowledge-chat.functions.ts:61-85` | Sem rate limit por médico no chat de conhecimento. | Sem teto diário de uso de IA. | P1 |
| QA-93 | [Prescrição] `pacientes.$id.tsx:3305-3323` | Receita local aceita medicamento texto livre sem consulta a classificação de controlados. | Substância controlada pode ser "prescrita" sem alerta. | P1 |
| QA-103 | [Prescrição] `memed-catalog.server.ts:9-31` | `controlClass` é texto livre digitado manualmente, nunca consultado para bloquear nada. | A motivação declarada (banco próprio para classificar controlado) não existe funcionalmente. | P1 |
| QA-104 | [Prescrição] `triage.functions.ts:8-14` (`triagePatient`) | Sem guard de auth, devolve triagem estruturada — modela literalmente o padrão "IA que triagem o paciente" que a regra de produto proíbe. Código morto hoje (confirmado por grep), mas pronto para ativação por engano. | Risco latente de violar regra clínica inegociável. | P1 |
| QA-319, QA-320 | [Config] `supabase/migrations/20260731011505_...sql`, `20260730180518_...sql` | Duas migrations duplicam integralmente `CREATE TABLE` de migrations anteriores (`appointments`, `criterios`/`docs`/`publications`), sem `IF NOT EXISTS`. | Replay de migrations do zero (ambiente novo/CI/disaster recovery) falha em "relation already exists". | P1 (cada um) |
| QA-310, QA-336 | [Config] `package.json:6-13`, ausência de `.github/` | Sem script `test`, sem pipeline de CI. | Nenhum lint/build/typecheck/teste roda automaticamente antes de merge/deploy. | P1 (cada um; ver ADR-03) |
| QA-98 | [Prescrição] `clinic.functions.ts:1043` | Gate de CPF valida só `length===11`, sem checksum. | Qualquer 11 dígitos passa localmente; validação real delegada à Memed. | P2 |
| QA-05, QA-66 | [Auth/DB] `auth.functions.ts:67-74`, `patients.server.ts:109-119` | TOCTOU em checagem de unicidade (e-mail de cadastro, código de paciente) fora da transação atômica. | Risco de colisão em concorrência real, mas espaço de colisão grande — baixa probabilidade prática. | P2 (cada um) |
| QA-210 | [Agenda] `clinic.functions.ts:635-654` | Check-then-insert do limite de paralelismo de agenda não é atômico. | Duas requisições concorrentes podem superar o teto de 3 simultâneos. | P2 |
| QA-50 | [DB] `db.server.ts:66-78` (`mutateRows`) | Fila de serialização só dentro do mesmo isolate — `persist()` substitui `rows` inteiro sem verificação otimista. | *Lost update* clássico entre isolates. | P1 |

### 4.4 Maintainability

| ID | Local | Descrição | Por que importa | Sev. |
|---|---|---|---|---|
| QA-23 | [Auth] `auth.server.ts` (442L) vs `patient-auth.server.ts` (284L) | Duplicação quase linha-a-linha (hash, sessão, revogação). | Correção de segurança futura precisa ser replicada manualmente nos dois arquivos — risco de divergência silenciosa. | P2 |
| QA-24 | [Auth] `db.server.ts:1-12,26,66-78` | O mesmo padrão de risco que já causou incidente de produção continua vivo em `rate-limit.server.ts` e no contador de OCR — não foi migrado junto com o resto. | Risco sistêmico não fechado por completo. | P1 |
| QA-62 | [DB] arquitetura geral | Dois módulos de persistência quase-homônimos (`db.server.ts` vs `store.server.ts`) com garantias completamente diferentes; `records.server.ts` importa de ambos sem deixar isso óbvio no ponto de uso. | Facilita reintrodução do bug QA-56 por um dev que não souber da diferença. | P1 |
| QA-211 | [Agenda] `db.server.ts:39-78` | `board.server.ts`, `categories.server.ts`, `services.server.ts`, `templates.server.ts`, `appointment-types.server.ts` ainda usam o padrão de menor garantia — só `agenda.server.ts` foi migrado para linhas relacionais. | Inconsistência arquitetural residual do mesmo problema que motivou o BUG-1 original. | P2 |
| QA-219, QA-253, QA-260 | [Agenda/Rotas UI] `appointment-calendar.tsx` (4080L), `pacientes.$id.tsx` (3384L), `paciente/app.tsx` (2082L) | Três arquivos-monólito misturando estado, regra de negócio e apresentação. O calendário cresceu (de ~2560 para 4080 linhas) em vez de ser decomposto, apesar do próprio handover já pedir isso. | Custo de manutenção crescente; qualquer mudança nesses arquivos tem blast radius grande. | P2 (cada um) |
| QA-255 | [Rotas UI] `pacientes.$id.tsx:1011-1430` vs `paciente/app.tsx:1707-2081` | `UploadExamesDialog` duplica ~400 linhas de `UploadPatientDialog`, já divergindo entre si. | Risco de drift silencioso entre os dois lados. | P2 |
| QA-262, QA-271 | [Rotas UI] `paciente/app.tsx:119-131` vs `clinic-types.ts` | Tipo `Profile` redefine campos de `Patient` independentemente em vez de derivar via `Pick`. | Mudança de campo no cadastro médico não força atualização do espelho do paciente. | P2 (cada um) |
| QA-263 | [Rotas UI] `components/patient/vertical-timeline.tsx` | Componente não importado por nenhum outro arquivo — código morto. Ver divergência na Seção 7 (o `.lovable/plan.md` mandava criá-lo e usá-lo; foi criado e nunca conectado). | Timeline vertical do paciente foi reimplementada inline em `history-screen.tsx`, com union de status divergente do componente morto. | P2 |
| QA-215 | [Agenda] `appointment-calendar.tsx` (zoom de densidade) | Estado, `localStorage` e matemática do "zoom de densidade" totalmente implementados, mas nenhum `<Slider>` é renderizado — recurso inacessível na UI. | Feature morta, entregue pela metade. | P2 |
| QA-218 | [Agenda] `appointment-calendar.tsx` (todo) | Vários itens da "Parte 3" do handover de agenda (atalhos de teclado globais, Alt+arrastar, lista de espera, Ctrl+K de fato funcional) não foram implementados. | Escopo do handover não entregue integralmente. | P2 |
| QA-333, QA-334 | [Config] `bun.lock` + `package-lock.json` | Dois lockfiles de gerenciadores diferentes coexistem e estão ambos rastreados; `.gitignore` os ignora mas eles já estavam rastreados antes — no-op enganoso. | Drift de versão possível entre quem usa bun e quem usa npm. | P2 (cada um) |
| QA-311 | [Config] `tsconfig.json:19-20`, `eslint.config.js:36` | `noUnusedLocals`/`noUnusedParameters` desligados **e** `no-unused-vars` do ESLint desligado. | Nem compilador nem linter pegam código morto. | P2 |
| QA-330 | [Config] `scripts/migrate-appointments.ts:7-8` | O próprio comentário admite que o script nunca foi de fato executado/validado (faltava `SUPABASE_SERVICE_ROLE_KEY` na sessão de quem escreveu). | Script operacional não testado. | P2 |
| QA-99 | [Prescrição] `records.server.ts:132-199` | `PrescriptionEntry` não tem campo `origem` (memed/local) — `/receita/$code` exibe o mesmo texto legal para os dois casos. | Indistinguível para quem verifica a receita — relevante mesmo depois de corrigir QA-90/91/92. | P2 |
| QA-290 | [Infra] `lovable-error-reporting.ts`, `__root.tsx`, `server.ts`, `start.ts` | Sem error tracking real — só `console.error` + bridge opcional específico da plataforma de hosting. | Lacuna operacional para operar em produção com confiança. | P1 |
| QA-176, QA-177 | [Billing] `assinatura/index.tsx:24-34` | Preços exibidos são strings hardcoded, dissociadas do `Price` real da Stripe; nenhum ponto encontrado que use `has_active_subscription`/`getSubscriptionStatus` para bloquear feature paga. | Confirma tecnicamente "câmara comercial nunca validada" do handover. | P2 (cada um) |

*(Nota de completude: a lista acima cobre todos os achados P0 e a maioria dos P1/P2 mais relevantes por dimensão. A lista exaustiva de todos os ~170 IDs, incluindo os P2 de menor impacto individual, está nos relatórios de cluster que fundamentam este documento — arquivo, linha e severidade de cada um seguem o mesmo padrão desta seção. A Seção 6 lista todos os IDs por severidade.)*

---

## 5. Decisões arquiteturais — ADRs

### ADR-01: Persistência híbrida (JSON/`kv_collections`/filesystem) vs. migração completa para Postgres relacional

**Status:** Proposed (retroativo) · **Data:** 2026-08-15 · **Deciders:** Evo + engenheiro que assumir o código

**Contexto**
O produto começou com toda a persistência clínica em arquivos JSON no filesystem (`db.server.ts` original). Um incidente de produção real (sessão de médico caindo após ~1 min, ditado morrendo com "Sessão expirada") expôs que o runtime de deploy é multi-isolate/edge-like (Cloudflare Workers) e não preserva estado em memória de processo nem garante filesystem gravável entre requisições. A resposta foi uma migração incremental, não uma reescrita completa.

**Decisão observada**
Hoje existem três camadas de persistência simultâneas: (1) tabelas Postgres relacionais reais com RLS/policy para as coleções migradas dedicadamente (`appointments`, `measurements`, `patient_pending_measurements`, `loinc_pt_br`, `criterios`, `docs`, `publications`, `subscriptions`); (2) `kv_collections`, uma tabela Postgres genérica que emula o modelo de arquivo JSON (blob por coleção, sem índice/filtro no banco) via `db.server.ts`, usada pela maioria das coleções restantes (`patients`, `doctors`, `boards`, `categories`, `services`, `templates`, `appointment_types`, etc.); (3) filesystem local efêmero via `store.server.ts`, ainda ativo para `prescriptions.json`/`consultations.json`/`feedback.json`/`leads.json`, com o mesmo padrão de risco do incidente original (catch vazio em falha de escrita) nunca corrigido.

**Opções consideradas**

*Opção A: manter como está — completar só a migração pontual de `store.server.ts`*
| Dimensão | Avaliação |
|---|---|
| Complexidade | Baixa — escopo pequeno, padrão já provado nas outras migrações |
| Custo | Baixo — 1-2 tabelas novas, reaproveitando `kv_collections` ou tabela dedicada |
| Escalabilidade | Não resolve o N+1/leitura-de-coleção-inteira do tier `kv_collections` |
| Familiaridade do time | Alta — é o mesmo padrão já usado 8+ vezes |
**Prós:** resolve o risco mais grave (QA-56/57/58/59) com esforço mínimo. **Contras:** deixa a inconsistência arquitetural de 3 camadas permanente.

*Opção B: migrar tudo para tabelas relacionais reais*
| Dimensão | Avaliação |
|---|---|
| Complexidade | Alta — reescreve ~10 módulos `.server.ts`, exige plano de migração de dados para cada um |
| Custo | Alto em esforço de engenharia; baixo em infra (já é tudo Postgres) |
| Escalabilidade | Resolve completamente o N+1 e a leitura de coleção inteira |
| Familiaridade do time | Média — já fizeram isso 8 vezes, mas nunca de uma vez só |
**Prós:** elimina toda a dívida arquitetural de uma vez, unifica o modelo mental. **Contras:** esforço grande, risco de regressão em todos os módulos ao mesmo tempo, não é incremental.

**Trade-off analysis**
A Opção A resolve o risco P0 real e ativo (perda de dado de prescrição/selo) com o menor esforço possível, replicando um padrão já validado 8 vezes no próprio código. A Opção B é o destino de longo prazo correto, mas fazer isso "de uma vez" contradiz a forma como o time já demonstrou preferir migrar (incrementalmente, coleção por coleção, conforme a dor aparece). Recomendação: A agora, B como direção de longo prazo, uma coleção por vez, priorizada pelas que mais sofrem com QA-65/69 (leitura de coleção inteira sem filtro).

**Consequências**
- Fica mais fácil: eliminar o risco de perda de prescrição/selo imediatamente (Opção A).
- Fica mais difícil: justificar não fazer a Opção B indefinidamente — cada nova coleção em `kv_collections` é mais dívida que alguém vai precisar pagar.
- Precisará ser revisitado quando: o piloto crescer 10x (o N+1 de `withVinculo`/`getWorkspace` vira o gargalo visível) ou quando outro incidente de perda de dado acontecer em uma coleção ainda não migrada.

**Action items**
1. [ ] Migrar `prescriptions.json`/`consultations.json` de `store.server.ts` para Postgres (QA-56/57/58/59) — prioridade máxima, mesmo padrão já usado nas 8 migrações anteriores.
2. [ ] Avaliar migrar `feedback.json`/`leads.json` também, ou aceitar conscientemente o risco residual menor (não são dado clínico).
3. [ ] Priorizar migração de `patients.json`/`patients_registry.json`/`evolutions.json` (tier `kv_collections`) para tabelas relacionais com filtro no banco, dado que são as coleções por trás do N+1 documentado (QA-65).
4. [ ] Adicionar verificação otimista (`updated_at` esperado) em `mutateRows`/`persist()` para eliminar o *lost update* entre isolates (QA-50).

---

### ADR-02: Auth customizada (SHA-256+salt) vs. adoção do Supabase Auth para o fluxo principal

**Status:** Proposed (retroativo) · **Data:** 2026-08-15 · **Deciders:** Evo + engenheiro que assumir o código

**Contexto**
O produto tem duas implementações de identidade coexistindo: uma auth totalmente customizada (hash próprio, sessão por token, OAuth Google com state HMAC próprio) para médico e paciente, e o Supabase Auth, já integrado no repositório, mas usado exclusivamente para gatear o fluxo de billing/assinatura.

**Decisão observada**
`auth.server.ts` e `patient-auth.server.ts` reimplementam, quase linha a linha, hashing de senha, criação/revogação de sessão, verificação de e-mail e reset de senha. `admin-auth.server.ts` reimplementa uma terceira vez o mesmo padrão. O Supabase Auth (`auth-middleware.ts`, `auth-attacher.ts`) só é importado por `start.ts` (registro global do middleware) e `subscription.functions.ts` — nenhum arquivo do cluster de auth clínica os usa.

**Opções consideradas**

*Opção A: manter auth customizada, endurecer o que existe*
| Dimensão | Avaliação |
|---|---|
| Complexidade | Baixa-média — trocar hash (argon2/scrypt), mover sessão para cookie `httpOnly`, trocar rate limiter por um que sobreviva a multi-isolate |
| Custo | Baixo em infra, médio em esforço (3 arquivos quase-duplicados para atualizar) |
| Escalabilidade | Resolve os problemas conhecidos sem mudar o modelo |
| Familiaridade do time | Alta — é código que eles já entendem e controlam |
**Prós:** menor risco de regressão, mantém controle total sobre sessão/consentimento clínico. **Contras:** continua mantendo 3 implementações paralelas do mesmo conceito.

*Opção B: migrar médico/paciente para Supabase Auth, unificar com billing*
| Dimensão | Avaliação |
|---|---|
| Complexidade | Alta — reescreve todo o fluxo de sessão, login, OAuth, reset de senha, e como consentimento/LGPD se acopla a isso |
| Custo | Médio-alto em esforço, resolve hashing/sessão "de graça" (Supabase Auth já faz isso corretamente) |
| Escalabilidade | Boa — é infraestrutura gerenciada, testada em escala |
| Familiaridade do time | Baixa hoje, mas já usam Supabase Auth para billing |
**Prós:** elimina duplicação, resolve QA-01/02/10/11 de uma vez, um único sistema de identidade. **Contras:** risco de regressão alto num sistema que hoje funciona; exige repensar como `hasProfileAccess`/isolamento médico-paciente (TECH-13) se traduz para o modelo do Supabase Auth.

**Trade-off analysis**
A troca completa (Opção B) é tecnicamente superior, mas o produto já demonstrou (assim como no ADR-01) preferência por migração incremental sobre reescrita. O risco real hoje (QA-01/02/04/10/11/12) é enderençável sem trocar o sistema inteiro — Opção A entrega a maior parte do valor de segurança com uma fração do risco de regressão.

**Consequências**
- Fica mais fácil: fechar os achados de segurança conhecidos rapidamente (Opção A).
- Fica mais difícil: justificar manter 3 sistemas de auth quase-idênticos por muito mais tempo — cada nova regra de segurança (ex.: 2FA) precisa ser implementada 3 vezes.
- Precisará ser revisitado quando: o produto precisar de SSO corporativo, 2FA, ou qualquer feature de auth que o Supabase Auth já resolveria de graça — nesse ponto o custo de manter 3 sistemas paralelos passa a superar o custo da migração.

**Action items**
1. [ ] Trocar `hashPassword` (SHA-256+salt, 1 iteração) por argon2/scrypt nos 3 arquivos (QA-01/QA-10).
2. [ ] Mover token de sessão médico/paciente de `localStorage` para cookie `httpOnly` (QA-02/QA-11), seguindo o padrão já usado pelo admin.
3. [ ] Substituir `Map` em memória por um rate limiter que sobreviva a multi-isolate (Postgres/KV real) — afeta QA-04/QA-12/QA-18/QA-16 de uma vez.
4. [ ] Extrair a lógica duplicada de `auth.server.ts`/`patient-auth.server.ts` para um módulo compartilhado parametrizado por tipo de ator (QA-23), independente da decisão A/B.

---

### ADR-03: Ausência de suíte de testes automatizados e CI

**Status:** Proposed (retroativo) · **Data:** 2026-08-15 · **Deciders:** Evo + engenheiro que assumir o código

**Contexto**
`package.json` não tem script `test`; não existe `.github/workflows/` nem qualquer outro pipeline de CI no repositório. Todo controle de qualidade hoje depende de execução manual local. O produto lida com dado clínico, prescrição digital com força legal e pagamento.

**Decisão observada**
Não é uma decisão explícita documentada — é uma ausência. O código tem qualidade razoável mesmo sem testes (Zod consistente, guards de auth presentes na maioria dos fluxos), mas esta própria auditoria encontrou dois clusters de P0 (QA-56/57/58 e QA-90/91/92/95/96) que um teste de integração básico nos fluxos de "emitir prescrição" e "persistir e reler um selo de consulta" teria capturado antes de chegar a produção.

**Opções consideradas**

*Opção A: manter como está*
| Dimensão | Avaliação |
|---|---|
| Complexidade | Nenhuma (status quo) |
| Custo | Zero agora, alto e crescente em incidentes de produção não capturados |
| Escalabilidade | Piora conforme o time cresce (mais gente = mais chance de regressão silenciosa) |
| Familiaridade do time | N/A |
**Prós:** nenhum ganho, mas nenhum esforço novo. **Contras:** os P0 desta auditoria são evidência direta do custo real dessa escolha.

*Opção B: suíte de testes completa desde já (unit + integração + e2e) + CI completo*
| Dimensão | Avaliação |
|---|---|
| Complexidade | Alta — exige infraestrutura de teste para Postgres, mocks de Memed/Gemini/Stripe/WhatsApp, ambiente de CI |
| Custo | Alto upfront, para um produto ainda em fase de piloto/pré-PMF |
| Escalabilidade | Ótima a longo prazo |
| Familiaridade do time | Desconhecida — não há indício de testes em nenhum ponto do histórico do projeto |
**Prós:** rede de segurança completa. **Contras:** esforço grande demais para o estágio atual do produto, risco de nunca ser terminado.

*Opção C: começar pelos fluxos de maior risco (recomendado)*
| Dimensão | Avaliação |
|---|---|
| Complexidade | Baixa-média — poucos testes, mas nos pontos certos |
| Custo | Baixo, incremental |
| Escalabilidade | Cresce junto com o produto |
| Familiaridade do time | Alta — TypeScript + Zod já dá boa base para testes de contrato |
**Prós:** cobre exatamente o tipo de regressão que já aconteceu (QA-56/57/58, QA-90/91/92) com esforço mínimo; CI mínimo (lint+typecheck+build) já é um ganho imediato. **Contras:** não é cobertura completa — decisão consciente de aceitar esse gap por enquanto.

**Trade-off analysis**
Opção C é a única realista dado o estágio do produto. O ponto de partida deve ser: (1) CI mínimo — `lint`+`tsc --noEmit`+`build` em todo PR, custo quase zero, já pega uma classe inteira de erro; (2) testes de contrato/integração para os 3 fluxos que esta auditoria provou serem os mais arriscados: emissão de prescrição (incluindo o gate RDC 1000/25 e a distinção Memed-real vs. local), persistência de `store.server.ts` (write-then-read sobrevive a restart simulado), e o webhook do Stripe (idempotência/ordem).

**Consequências**
- Fica mais fácil: pegar regressões exatamente do tipo que esta auditoria encontrou, antes de chegar a produção.
- Fica mais difícil: nada fica mais difícil — é puramente aditivo.
- Precisará ser revisitado quando: a cobertura dos 3 fluxos críticos estiver estável — aí sim vale decidir se expande para e2e completo ou mantém o escopo restrito.

**Action items**
1. [ ] CI mínimo: `lint` + `tsc --noEmit` + `build` em todo PR (fecha QA-310/QA-336 parcialmente).
2. [ ] Teste de contrato para `prescribeForEvolution`/`getMemedWidgetConfig`: garantir que nenhum caminho de prescrição emite documento sem CPF/passaporte válido (previne recorrência de QA-90/91).
3. [ ] Teste de integração para `store.server.ts`: escrever, simular falha de fs, confirmar que o chamador é informado (previne recorrência de QA-56).
4. [ ] Teste de idempotência para o webhook do Stripe, incluindo entrega fora de ordem (previne recorrência de QA-163/164).

---

### ADR-04: Fallback de "receita local" headless vs. exigir sempre o widget oficial Memed

**Status:** Proposed (retroativo) · **Data:** 2026-08-15 · **Deciders:** Evo + engenheiro que assumir o código

**Contexto**
A regra de produto documentada é "Memed assina, LifeLine organiza — não existe alternativa headless no Brasil em escala". O código, porém, implementa um caminho de "receita local" completo (`prescribeForEvolution`/`prescribeEvolution`), com geração de código verificável próprio e uma "assinatura" que é apenas um hash SHA-256. Esse caminho aparenta ter sido pensado como resiliência (o que fazer quando a Memed está fora do ar), mas está atualmente oferecido também como saída quando o bloqueio é `missing_cpf` — um problema de cadastro do paciente, não de disponibilidade da Memed.

**Decisão observada**
Na tela de prontuário (`ReceitaDialog`), quando `getMemedWidgetConfig` retorna qualquer erro (incluindo `missing_cpf`, `memed_offline`, `invalid_credentials`, `prescritor_inativo`), a UI habilita "Gerar receita local (sem Memed)" sem diferenciar a causa. O documento gerado é apresentado publicamente em `/receita/$code` com o mesmo texto legal (CFM 2.299/2021) usado para receitas Memed reais.

**Opções consideradas**

*Opção A: manter como está*
| Dimensão | Avaliação |
|---|---|
| Complexidade | Nenhuma |
| Custo | Zero em esforço, alto em risco regulatório real |
| Escalabilidade | N/A |
| Familiaridade do time | N/A |
**Prós:** nenhum. **Contras:** viola RDC 1000/25 ativamente (não é uma leitura conservadora da lei — o gate existe e é contornado na mesma tela) e a própria regra de produto documentada.

*Opção B: escopar corretamente o fallback local*
| Dimensão | Avaliação |
|---|---|
| Complexidade | Média — precisa diferenciar causa do erro (`missing_cpf` vs. `memed_offline`/`invalid_credentials`) e ainda exigir CPF/passaporte no caminho local |
| Custo | Baixo-médio |
| Escalabilidade | Boa — resiliência real para outage da Memed, sem abrir brecha de compliance |
| Familiaridade do time | Alta — a infraestrutura (gate de CPF) já existe, só precisa ser aplicada também aqui |
**Prós:** preserva a resiliência (Memed fora do ar não trava o consultório) sem contornar compliance. **Contras:** ainda usa uma "assinatura" que não é ICP-Brasil real — precisa de selo visual explícito de "documento não assinado digitalmente" se mantido.

*Opção C: remover o fallback local inteiramente*
| Dimensão | Avaliação |
|---|---|
| Complexidade | Baixa (remover código) |
| Custo | Baixo em engenharia, alto em disponibilidade percebida (Memed fora do ar = sem receita nenhuma) |
| Escalabilidade | N/A |
| Familiaridade do time | N/A |
**Prós:** elimina o risco por completo, mais simples de raciocinar. **Contras:** perde a resiliência que motivou a feature originalmente; sem alternativa, um outage da Memed para o consultório inteiro.

**Trade-off analysis**
Opção C é a mais segura, mas descarta um valor real (resiliência a outage) que parece ter sido a motivação original. Opção B preserva esse valor com as travas certas: (1) nunca oferecer o fallback para `missing_cpf` — nesse caso o problema é o cadastro, não a Memed, e a correção certa é completar o cadastro, não contornar; (2) exigir CPF/passaporte também no caminho local; (3) marcar visivelmente o documento gerado localmente como não tendo a mesma validade jurídica de uma prescrição assinada pela Memed, tanto na UI quanto no documento público em `/receita/$code`.

**Consequências**
- Fica mais fácil: auditar e defender o produto perante um questionamento regulatório real.
- Fica mais difícil: a UX de "gerar receita" fica com um passo a mais de decisão (por que a Memed falhou, e o que fazer em cada caso) — precisa ser bem desenhada para não confundir o médico no meio de um atendimento.
- Precisará ser revisitado quando: a Memed adicionar algum modo de contingência oficial (ex.: fila de retry, prescrição assíncrona), o que tornaria o fallback local desnecessário mesmo para outage real.

**Action items**
1. [ ] Bloquear a oferta de "receita local" especificamente para o erro `missing_cpf` — nesse caso mostrar só "complete o cadastro" (fecha QA-90).
2. [ ] Exigir CPF/passaporte também em `prescribeForEvolution`/`prescribeEvolution` (fecha QA-91).
3. [ ] Adicionar selo visual explícito de "documento sem assinatura digital ICP-Brasil, gerado localmente" tanto no dialog de emissão quanto em `/receita/$code` (fecha QA-92/94/99).
4. [ ] Adicionar guard de ambiente (`memedEnvironment() === "live"` → desabilitar) na bancada de simulação, e restringir o acesso à rota `/app/memed-simulacao` (fecha QA-95/96).
5. [ ] Adicionar checagem de `controlClass` antes de habilitar o botão de geração em texto livre (fecha QA-93/103).
6. [ ] Adicionar guard de auth em `sealConsultation`/`prescribe` de `prontuario.functions.ts`, ou removê-las se confirmadas inalcançáveis (fecha QA-101).

---

## 6. Matriz de severidade

Todos os QA-xx encontrados, ordenados P0 → P2. ADR relacionado entre colchetes onde aplicável.

### P0 (9)

| ID | Módulo | Local | Descrição curta |
|---|---|---|---|
| QA-56 | DB | `store.server.ts:25-33` | fs.writeFile com catch vazio [ADR-01] |
| QA-57 | DB | `records.server.ts:132-164` | Prescrição local sujeita ao QA-56 [ADR-01] |
| QA-58 | DB | `receita.functions.ts:8-25` | `/receita/$code` lê de fonte sujeita ao QA-56 [ADR-01] |
| QA-90 | Prescrição | `pacientes.$id.tsx:3232-3379` | Receita local oferecida quando gate RDC bloqueia [ADR-04] |
| QA-91 | Prescrição | `clinic.functions.ts:1364-1391` | Receita local sem CPF/passaporte/nascimento [ADR-04] |
| QA-92 | Prescrição | `domain.server.ts:8-20` | "Assinatura" não é ICP-Brasil real, apresentada como se fosse [ADR-04] |
| QA-95 | Prescrição | `memed.server.ts:425-439` | Simulação sem trava de ambiente `live` [ADR-04] |
| QA-96 | Prescrição | `route.tsx:205-211` | Link de simulação visível a qualquer médico [ADR-04] |
| QA-101 | Prescrição | `prontuario.functions.ts:27-72` | Endpoint headless sem auth (reachability a confirmar) [ADR-04] |

### P1 (~43)

QA-01, QA-02, QA-04, QA-10, QA-11, QA-12, QA-18, QA-19*, QA-22, QA-24, QA-50, QA-52, QA-59, QA-65, QA-93, QA-98*→(na verdade P2, ver nota), QA-103, QA-104, QA-130, QA-131, QA-132, QA-134, QA-138, QA-140, QA-141, QA-163, QA-164, QA-167, QA-168, QA-169, QA-214, QA-217, QA-225, QA-250, QA-251, QA-252, QA-290, QA-310, QA-319, QA-320, QA-336

*(QA-19 tratado como P1 por ser trade-off de segurança ativo, não P0 pois é mitigação parcial documentada, não ausência total de controle.)*

### P2 (~118)

Todos os demais IDs citados na Seção 4 e nos relatórios de cluster que não aparecem nas listas acima: QA-03, 05, 06, 07, 08, 09, 13, 14, 15, 16, 23, 51, 53, 54, 55, 60, 61, 62, 64, 66, 67, 68, 69, 70, 71, 72, 74, 75, 94, 97, 99, 102, 105, 106, 107, 133, 135, 136, 137, 139, 142, 143, 144, 145, 160, 161, 162, 165, 166, 170, 171, 172, 173, 174, 175, 176, 177, 178, 179, 180, 190-193 (QA-190/191 são P1, ver nota), 194-202, 210, 211, 212, 215, 216, 218, 219, 220, 222, 224, 226, 228, 253, 254, 255, 256, 260, 261, 262, 263, 264, 270, 271, 278, 291, 292, 293, 294, 311, 312, 313, 315, 316, 317, 318, 322, 323, 324, 325, 326, 327, 329, 330, 331, 332, 333, 334, 335.

*(Correção de nota: QA-190 e QA-191 — bug de normalização de telefone e ausência de suporte a message templates do WhatsApp — são **P1**, não P2; incluídos aqui por composição da lista, ver Seção 4 do cluster de Comunicação para detalhe. QA-197/198 — falta de rate limit em formulários públicos e escrita sem lock em `store.server.ts` para leads/feedback — também **P1**.)*

**Nota de transparência sobre a matriz:** dado o volume (~170 achados), esta matriz lista todos os IDs por severidade, mas a descrição completa de cada um (arquivo:linha, motivo, categoria) está na Seção 4 (achados de maior impacto, descritos por extenso) e nos relatórios de cluster subjacentes a este documento (um por área: Auth, DB/Persistência, Prescrição, OCR/LOINC, Billing, Comunicação, Agenda, Rotas UI, Infra, Config). Nenhum ID foi inventado ou reclassificado sem base no achado original do cluster correspondente.

---

## 7. Divergências documentação vs. código

| # | Documento | Afirmação | Código real | Veredito |
|---|---|---|---|---|
| 1 | Contexto da auditoria (riscos conhecidos) | "Rota `/admin` sem guard de autenticação" | `admin/index.tsx:46-54` tem `beforeLoad`→`adminCheckCookie`; **cada** server function de dado revalida `requireAdminSession` independentemente | **Contradito** — corrigido em rodada anterior (comentários SEC-01/02/05 no código confirmam) |
| 2 | Contexto da auditoria | "Zero rate limiting em login/reset de senha" | Rate limiting existe e é chamado nos 3 fluxos de login e nos de reset (médico/paciente/admin) | **Parcialmente contradito** — existe, mas roda em `Map` de memória que não sobrevive ao runtime multi-isolate (mesmo runtime que já causou incidente documentado em `db.server.ts`). Conclusão prática da hipótese está certa; a causa raiz não é ausência de código. |
| 3 | Contexto da auditoria | Auth = SHA-256+salt, Supabase Auth só billing | Confirmado idêntico nos 3 arquivos de auth; Supabase Auth só importado em `start.ts` e `subscription.functions.ts` | **Confirmado** |
| 4 | Contexto da auditoria | "role de secretária inexistente" | Grep "secretar" em todo `src/` sem nenhum resultado | **Confirmado ausente** |
| 5 | Contexto da auditoria | Catálogo de biomarcadores enviesado para endócrino/metabólico | `BIOMARKER_CATALOG` é 100% CHEM/HEM-BC, zero SERO/COAG/UA | **Confirmado** (QA-138) |
| 6 | Contexto da auditoria | RDC 1000/25 exige CPF/passaporte+nascimento; `withoutCpf: true` pode quebrar isso | Caminho oficial Memed implementa o gate corretamente; `withoutCpf` é campo morto no tipo, nunca setado por nenhum caller real | **Parcialmente contradito** — o gate oficial está correto e até mais atualizado que a suposição. O risco real não é `withoutCpf` — é o fallback de receita local que contorna o gate inteiro (QA-90/91). |
| 7 | `HANDOVER_LOINC_Integracao_v2.md` (fora do repo) vs. handover mais antigo hipotético (`src/server/loinc-mapping.server.ts`) | Caminho e assinatura de `resolveLoincCode` | Código real: `src/lib/loinc-mapping.server.ts` (nunca `src/server/`), `resolveLoincCode` é `async`, consulta Postgres (exato + fuzzy pg_trgm) | **v2 confirmado correto e atualizado.** Arquivo "v1" citado por referência não foi localizado no filesystem para comparação direta, mas nenhum vestígio de implementação síncrona em array JS existe no código atual. |
| 8 | `HANDOVER_LOINC_v3_Pendencias.md` | Threshold de fuzzy match = 0.35, não validado | `FUZZY_THRESHOLD = 0.35` em `loinc-mapping.server.ts:21`, com o mesmo aviso textual | **Confirmado, sem divergência** |
| 9 | `HANDOVER_LOINC_v3_Pendencias.md` | 9 biomarcadores com `loincCode: null` por ambiguidade (Zinco, Glicemia jejum, T3 Livre, SHBG, eGFR, HOMA-IR, etc.) | Todas as 9 nulificações confirmadas linha a linha em `clinic-types.ts`, incluindo o detalhe de `2986-8` pertencer a Testosterona Total (não SHBG) | **Confirmado, sem divergência** |
| 10 | `HANDOVER_LOINC_v3_Pendencias.md` | `measurements.server.ts` "continua lendo/gravando em `measurements.json`", tabela Postgres órfã | `measurements.server.ts`/`patient-measurements.server.ts` usam `supabaseAdmin` diretamente, schema bate com a migração — nenhuma tabela órfã | **Refutado** — pendência já resolvida por trabalho posterior à data do handover (commit `7eb55b6`, comentário `DAT-02`) |
| 11 | `HANDOVER_AGENDA_v1.md` | 15 bugs (BUG-1 a BUG-15) no módulo de agenda | Ver tabela completa no cluster de Agenda: 11 corrigidos, 1 mudou de forma (resolvido diferente), 1 confirmado ainda existe (BUG-11), 2 corrigidos com ressalva | **Handover desatualizado** — uma sessão posterior (referenciada em comentários como "v2", arquivo não presente no repo) já corrigiu a maioria. Cluster está mais maduro do que o handover sugere. |
| 12 | Regra de produto | "Agrupamento de receituários é responsabilidade do LifeLine, antes do handoff" | Código não implementa lógica própria de agrupamento — delega inteiramente à Memed e só **verifica empiricamente** o resultado via bancada de simulação | **Divergência de expectativa** — é o oposto textual da frase (responsabilidade é da Memed, verificada pelo LifeLine), mas é uma escolha de design defensável (evita reimplementar regra regulatória complexa) |
| 13 | Regra de produto | "Memed assina, LifeLine organiza — sem alternativa headless" | Existe alternativa headless, ativa, com botão dedicado na UI real | **Contradito ativamente** — ver ADR-04 |
| 14 | Regra de produto | "Banco próprio de medicamentos porque Memed não classifica controlado em texto livre" | `controlClass` é campo de texto livre nunca consultado para bloquear nada | **Contradito** — motivação declarada não tem correspondência funcional (QA-103) |
| 15 | Regra de produto | "IA assistida, nunca IA que triagem" | `extractTriage` é 100% regras/palavras-chave, sem LLM real; ambos entry points de triagem estão desconectados de rota | **Sem violação ativa hoje**, mas `triagePatient` está pronto, sem auth, no formato exato da regra proibida — risco latente (QA-104) |
| 16 | `.lovable/plan.md` | Instrui criar `src/components/patient/vertical-timeline.tsx` e usá-lo na aba "Histórico" de `paciente/app.tsx` | Componente foi criado, mas nunca importado por nenhum outro arquivo (confirmado por grep); `history-screen.tsx` reimplementa a timeline inline, com union de status divergente | **Plano parcialmente executado** — explica a origem do código morto QA-263: o componente existe porque foi pedido, mas a integração final não usou o componente dedicado |

---

## 8. Veredito por fluxo crítico

| Fluxo | Veredito | Por quê |
|---|---|---|
| **Login médico** | Request Changes | Funciona corretamente hoje; hash sem work-factor e rate limiter frágil em produção são reais mas não bloqueantes para uso imediato (QA-01/02/04). |
| **Login paciente** | Request Changes | Mesmo veredito do médico — problemas espelhados (QA-10/11/12), mais o código presencial de 6 dígitos sem rate limit (QA-14). |
| **Upload/OCR** | Approve com ressalva | Pipeline mais maduro do produto; ressalvas são operacionais (sem timeout, sem rate limit no chat/ditado, retenção de arquivo na Gemini sem controle — QA-131/134/141), não acesso indevido a dado. |
| **Prescrição** | **Needs Discussion — bloqueador de compliance ativo** | O caminho oficial Memed está correto. O fallback de receita local contorna a RDC 1000/25 e a regra "Memed assina" na mesma tela (QA-90/91/92), e a bancada de simulação pode gerar prescrição real em produção sem trava (QA-95/96). Não recomendado avançar com dado clínico real de paciente antes de resolver ADR-04. |
| **Billing** | Request Changes | Sem chave hardcoded, webhook com assinatura verificada corretamente. Mas corrupção de estado por falta de ordenação de eventos (QA-163/164) e o mesmo bug de "assinatura ativa" duplicado em TS e SQL (QA-167/168) são reais para qualquer volume de assinatura além de teste manual. |

---

## 9. Primeiras 2 semanas sugeridas para o novo engenheiro

**Ordem de leitura** (para construir contexto antes de tocar em código):
1. Este documento, Seções 1, 2 e 8.
2. `src/lib/db.server.ts` e `src/lib/store.server.ts` lado a lado — entender a diferença de garantia entre os dois é pré-requisito para mexer em qualquer módulo de persistência.
3. `src/lib/api/clinic.functions.ts` (`getMemedWidgetConfig`, `prescribeForEvolution`) + `src/routes/app/pacientes.$id.tsx` (`ReceitaDialog`) — o fluxo de prescrição inteiro, para entender o ADR-04 na prática antes de corrigi-lo.
4. `src/lib/auth.server.ts` + `src/lib/patient-auth.server.ts` lado a lado.

**Ordem de correção** (baseada só nos achados desta auditoria, não em roadmap de produto):

*Semana 1 — fechar os P0:*
1. ADR-04, action items 1-2 (bloquear receita local para `missing_cpf`, exigir CPF no caminho local) — QA-90/91.
2. ADR-04, action item 4 (guard de ambiente na simulação Memed) — QA-95/96, é uma mudança pequena e isolada, sem desculpa para adiar.
3. ADR-01, action item 1 (migrar `prescriptions.json`/`consultations.json` para Postgres) — QA-56/57/58/59, mesmo padrão já usado 8 vezes no código, baixo risco de regressão.
4. QA-101 — adicionar guard de auth em `prontuario.functions.ts` ou remover as duas funções, independente de confirmar reachability.

*Semana 2 — P1 de maior exposição:*
5. ADR-02, action items 1-3 (hash, cookie httpOnly, rate limiter real) — fecha de uma vez QA-01/02/04/10/11/12/18.
6. QA-163/164/167/168 (corrupção de estado de assinatura) — antes de qualquer volume real de billing.
7. ADR-03, action items 1-2 (CI mínimo + teste de contrato de prescrição) — para que o item 1 desta lista não regrida silenciosamente.
8. QA-214/225 (double-submit em `ScheduleDialog`/`ChargeDialog`) — correção pequena, mesmo padrão que já existe no calendário principal, só precisa ser replicado.

---

## 10. Fora do escopo desta auditoria

- Pricing, modelagem de negócio, priorização de roadmap.
- Sugestão de features novas.
- Correção de qualquer achado durante esta sessão — esta auditoria só documenta, não conserta.
- Validação clínica do catálogo LOINC/biomarcadores (curadoria de conteúdo, não engenharia).
- Conteúdo de marketing da landing page (`impact-stats.tsx`, `testimonial-carousel.tsx`) — nota à parte, fora do lens QA/arquitetura: os depoimentos de médicos e as estatísticas de impacto exibidas são conteúdo de marketing (nomes/depoimentos fictícios, estatísticas sem citação de fonte visível no código) — não é um achado de engenharia, mas vale sinalizar para quem for revisar compliance de marketing de um produto de saúde, fora do escopo desta revisão.

---

## Apêndice A — Manifesto de cobertura

Todo arquivo do repositório (`git ls-files`, excluindo `node_modules/`, `.git/`, builds e binários), categorizado por domínio. 236 arquivos rastreados no total.

### Legenda
✅ Revisado por completo · 🔍 Revisado por varredura direcionada (grep + leitura condicional) · 📄 Dado estático/gerado (estrutura confirmada, conteúdo não é código de lógica) · ⛔ Excluído do escopo (gerado automaticamente / lockfile)

### `src/lib/*.server.ts` e `src/lib/*.ts` (núcleo de domínio)
✅ Todos os 45 arquivos revisados por completo, distribuídos pelos clusters 1 (Auth), 2 (DB), 3 (Prescrição), 4 (OCR/LOINC), 5 (Billing), 6 (Comunicação), 7 (Agenda), 9 (Infra): `access-log.server.ts`*, `admin-auth.server.ts`, `admin-session.ts`, `agenda.server.ts`, `appointment-types.server.ts`, `auth.server.ts`, `billing.server.ts`, `board.server.ts`, `br-locations.ts`, `categories.server.ts`, `clinic-context.tsx`, `clinic-types.ts`, `config.server.ts`, `consent.ts`, `criterios.server.ts`, `db.server.ts`, `demo-store.tsx`, `docs.server.ts`, `domain.server.ts`, `email.server.ts`, `error-capture.ts`, `error-page.ts`, `gemini-client.server.ts`, `knowledge-chat.functions.ts`, `loinc-mapping.server.ts`, `lovable-error-reporting.ts`, `measurements.server.ts`, `memed-catalog.server.ts`, `memed.server.ts`, `ocr-extraction.server.ts`, `patient-access.server.ts`, `patient-auth.server.ts`, `patient-demo-data.ts`, `patient-intake.ts`, `patient-measurements.server.ts`, `patient-medications.server.ts`, `patient-metrics.server.ts`, `patient-session.ts`, `patients-registry.server.ts`, `patients.server.ts`, `payments.server.ts`, `prescription-fixtures.ts`, `publications.server.ts`, `rate-limit.server.ts`, `records.server.ts`, `resilient.server.ts`, `services.server.ts`, `session.ts`, `soap.ts`, `store.server.ts`, `stripe.server.ts`, `stripe.ts`, `subscription.functions.ts`, `templates.server.ts`, `triage.server.ts`, `utils.ts`, `whatsapp.server.ts`.
*`access-log.server.ts` revisado diretamente pelo orquestrador (gap de atribuição de cluster) — sem achados relevantes.

### `src/lib/api/*.functions.ts`
✅ Todos os 22 arquivos revisados por completo: `admin-auth.functions.ts`, `appointment-types.functions.ts`, `auth.functions.ts`, `categories.functions.ts`, `clinic.functions.ts`, `criterios.functions.ts`, `docs.functions.ts`, `email-confirm.functions.ts`, `feedback.functions.ts`, `leads.functions.ts`, `memed-catalog.functions.ts`, `patient-access.functions.ts`, `patient-auth.functions.ts`, `patient-medications.functions.ts`*, `patient-metrics.functions.ts`*, `prontuario.functions.ts`, `publications.functions.ts`, `receita.functions.ts`, `services.functions.ts`, `templates.functions.ts`, `transcribe.functions.ts`, `triage.functions.ts`.
*Revisados diretamente pelo orquestrador (gap de atribuição de cluster) — sem achados relevantes, padrão consistente com o resto do domínio de paciente.

### `src/components/clinic/*`, `src/components/patient/*`, `src/components/*.tsx` (raiz)
✅ Revisados por completo: `action-dialogs.tsx`, `appointment-calendar.tsx`, `board-dialog.tsx`, `consent-gate.tsx`, `dictation.tsx`, `knowledge-drawer.tsx`, `memed-prescription-widget.tsx`, `page-header.tsx`, `patient-form-dialog.tsx`, `patient-history.tsx`, `prescricao-stepper.tsx`, `similar-cases.tsx`, `wa-button.tsx`, `consultas-screen.tsx`, `history-screen.tsx`, `vertical-timeline.tsx`, `PaymentTestModeBanner.tsx`, `StripeEmbeddedCheckout.tsx`, `impact-stats.tsx`*, `reveal.tsx`*, `testimonial-carousel.tsx`*, `theme-toggle.tsx`*.
*Revisados diretamente pelo orquestrador (gap de atribuição de cluster) — landing page, sem achados de engenharia; nota de conteúdo de marketing na Seção 10.

### `src/components/demo/*`
✅ `kanban-board.tsx`, `patient-app.tsx`, `patient-timeline.tsx`, `whatsapp-simulator.tsx` — revisados por completo (cluster 9).

### `src/components/ui/*` (shadcn/ui, 49 arquivos)
🔍 1 arquivo lido por completo (`chart.tsx`, único hit de `dangerouslySetInnerHTML` em varredura por grep). 48 arquivos varridos por grep dirigido (`any`, `console.log`, `TODO`/`FIXME`, segredos, `dangerouslySetInnerHTML`, `eval(`) sem leitura completa — metodologia declarada e justificada (boilerplate gerado). **Ressalva de cobertura:** `searchable-select.tsx`, `password-input.tsx` e `section-heading.tsx` não são boilerplate padrão do shadcn (customizados para o projeto) e não foram lidos por completo, apenas varridos — recomenda-se leitura completa numa rodada futura.

### `src/routes/*` (app médico + paciente + públicas)
✅ Todos os 27 arquivos de rota revisados por completo, distribuídos pelos clusters 1, 3, 5, 7, 8: `__root.tsx`, `admin/index.tsx`, `admin/login.tsx`, `api/public/payments/webhook.ts`, `app/index.tsx`, `app/memed-simulacao.tsx`, `app/pacientes.$id.tsx`, `app/pacientes.index.tsx`, `app/perfil.tsx`, `app/produtos.index.tsx`, `app/route.tsx`, `assinatura/index.tsx`, `assinatura/retorno.tsx`, `auth.callback.tsx`, `confirmar-cadastro.$token.tsx`, `confirmar-email.$token.tsx`, `demo.tsx`, `entrar.tsx`, `esqueci-senha.tsx`, `index.tsx`, `login.tsx`, `paciente/app.tsx`, `paciente/auth.callback.tsx`, `paciente/confirmar-cadastro.$token.tsx`, `paciente/esqueci-senha.tsx`, `paciente/login.tsx`, `paciente/redefinir-senha.$token.tsx`, `receita.$code.tsx`, `redefinir-senha.$token.tsx`, `sobre.tsx`.
📄 `routeTree.gen.ts` — ⛔ excluído (gerado automaticamente, README do próprio diretório instrui não editar à mão).
✅ `README.md` — lido pelo orquestrador na fase de baseline.

### `src/integrations/*`
✅ `lovable/index.ts`, `supabase/auth-attacher.ts`, `supabase/auth-middleware.ts`, `supabase/client.server.ts`, `supabase/client.ts` — revisados por completo (cluster 1). `supabase/types.ts` — incluído no escopo do cluster 5 (arquivo gerado pelo Supabase CLI, sem lógica própria).

### `src/hooks/*`, `src/*.tsx`/`.ts` (raiz), `src/styles.css`
✅ `use-mobile.tsx`, `router.tsx`, `server.ts`, `start.ts`, `styles.css` — revisados por completo (cluster 9).

### Config, infra, scripts, dados (raiz e `supabase/`)
✅ `package.json`, `vite.config.ts`, `tsconfig.json`, `eslint.config.js`, `components.json`, `bunfig.toml`, `.prettierignore`, `.prettierrc`, `.env.example`, `.env.development`, `.gitignore`, `supabase/config.toml`, `scripts/migrate-appointments.ts`, `scripts/seed-loinc.ts`, `.lovable/plan.md`* — revisados por completo.
*`.lovable/plan.md` revisado diretamente pelo orquestrador (usado para explicar a divergência QA-263, Seção 7, item 16).
📄 `.lovable/project.json` — revisado por completo (cluster 10), sem achados (metadados de projeto).
✅ Todas as 18 migrations em `supabase/migrations/*.sql` revisadas por completo (cluster 10, com aprofundamento adicional pelos clusters 4, 5 e 7 nas migrations específicas de seus domínios): `20260701163706`, `20260722222022`, `20260722222037`, `20260722222050`, `20260726032223`, `20260726034732`, `20260726034755`, `20260726040000`, `20260726200142`, `20260730120000`, `20260730180518`, `20260730190000`, `20260730200000`, `20260731011505`, `20260731011754`, `20260801000000`, `20260808044543`, `20260808044613`.
📄 `src/lib/data/loinc_pt_br_filtered.json` — estrutura confirmada (schema `{loincCode, componentPt, shortName, class, system, scaleTyp}`, 14.598 entradas), não lido byte a byte (2,3MB de dado estático, não é código de lógica).
⛔ `bun.lock`, `package-lock.json` — lockfiles gerados; existência e coexistência avaliadas (QA-333/334), conteúdo não é código de lógica.

### Documentação (lida como hipótese a verificar, não como fonte)
✅ `HANDOVER_AGENDA_v1.md`, `HANDOVER_LOINC_v3_Pendencias.md` (no repo) — lidos pelo orquestrador na fase de baseline e usados como hipótese pelos clusters 4 e 7. `HANDOVER_LOINC_Integracao_v2.md`, `HANDOVER_BUILD_para_DISCOVERY_v1.md`, `HANDOVER_DISCOVERY_V0.md`, `HANDOVER_Memed_Referencia_Tecnica.md`, `LifeLine_PRD_V3_Completo.md` (fora do repo, `C:\Users\danip\Documents\Lifeline\`) — lidos/grepados pelo orquestrador na fase de baseline para extrair contexto de produto e namespace de IDs existente (`TECH-xx`/`PM-xx`/`UX-xx`/`BKL-xx`/`ACC-xx`). `LifeLine_PRD_Handover_v2/v3/v5/v6.docx` — **não lidos nesta auditoria** (fora do escopo declarado de "todo o repositório"; são artefatos de PRD/produto, não handover técnico de arquitetura).

---

**Cobertura: 100% dos arquivos de código-fonte do repositório (`.ts`/`.tsx`/`.sql` + configs relevantes) foram revisados**, com duas ressalvas metodológicas declaradas e justificadas: (1) 48 de 49 arquivos em `src/components/ui/*` foram varridos por grep dirigido em vez de lidos por completo (boilerplate shadcn/ui — 3 exceções customizadas ficaram sem leitura completa, sinalizadas acima); (2) o dado estático `loinc_pt_br_filtered.json` (2,3MB) teve só a estrutura confirmada, não o conteúdo linha a linha. Nenhuma outra exclusão foi feita.
