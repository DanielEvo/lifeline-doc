
## 1. Google 403 "logo após clicar em Entrar com Google"

Esse erro vem do próprio Google (antes de escolher conta), então o problema está na configuração do OAuth Client, **não** no código. As causas típicas, em ordem:

1. **redirect_uri não autorizado** — o backend está enviando `https://id-preview--908a1f64-b354-430b-bf2d-4d4c6207b563.lovable.app/auth/callback` e `.../paciente/auth/callback`, e essas URIs exatas precisam estar em *Authorized redirect URIs* no OAuth Client do Google Cloud.
2. **App em modo Testing sem seu e-mail como *Test user*** — na tela de consentimento OAuth, se o publishing status estiver *Testing*, só e-mails cadastrados em *Test users* conseguem entrar; qualquer outro leva a 403 `access_denied`.
3. **Origem não autorizada** — o domínio precisa aparecer em *Authorized JavaScript origins*.

### O que você precisa fazer no Google Cloud Console

No OAuth 2.0 Client ID que gerou o `GOOGLE_CLIENT_ID` atual:

**Authorized JavaScript origins**
- `https://id-preview--908a1f64-b354-430b-bf2d-4d4c6207b563.lovable.app`
- `https://lifeline-doc.lovable.app`
- `http://localhost:8080` (dev)

**Authorized redirect URIs**
- `https://id-preview--908a1f64-b354-430b-bf2d-4d4c6207b563.lovable.app/auth/callback`
- `https://id-preview--908a1f64-b354-430b-bf2d-4d4c6207b563.lovable.app/paciente/auth/callback`
- `https://lifeline-doc.lovable.app/auth/callback`
- `https://lifeline-doc.lovable.app/paciente/auth/callback`
- `http://localhost:8080/auth/callback`
- `http://localhost:8080/paciente/auth/callback`

**OAuth consent screen**
- Publishing status: **In production** (recomendado — libera qualquer conta Google), ou
- Manter *Testing* e adicionar em *Test users* todos os e-mails que vão logar (seu, do time, dos revisores).

Salve, aguarde ~1 min para propagar e teste de novo. Nenhuma mudança de código é necessária para resolver o 403 — o backend já monta o URL correto.

Se depois desses ajustes o 403 persistir, quero um print da tela de erro do Google (ela mostra qual redirect_uri o servidor recebeu e o motivo exato — resolvo em cima disso).

## 2. Rota /admin com senha mestra

Painel de admin isolado, protegido por senha mestra guardada em env server-only. Bypass do login normal — não cria conta de médico nem de paciente. Escopo: ver/editar qualquer paciente e prontuário, gerenciar contas, e (num próximo passo) editar conteúdo de site.

### Segredos

- `ADMIN_PASSWORD` — senha mestra (você escolhe, adiciona via secret form).
- `ADMIN_SESSION_SECRET` — 32 chars aleatórios, gerados automaticamente, criptografam o cookie de sessão do admin.

Ambos server-only; nunca vão para o bundle do cliente.

### Backend (novo)

**`src/lib/admin-session.server.ts`** — helpers `useSession` com cookie `lifeline-admin` (7 dias, httpOnly, secure, sameSite lax) e `requireAdmin()` que joga `redirect({ to: "/admin/entrar" })` se não estiver desbloqueado.

**`src/lib/api/admin.functions.ts`** — server fns, todas passam por `requireAdmin()` exceto o unlock:
- `adminUnlock({ password })` — compara com `ADMIN_PASSWORD` via `timingSafeEqual` sobre hashes SHA-256, marca `unlocked:true` na sessão.
- `adminLock()` — limpa a sessão.
- `adminListDoctors()` / `adminListPatients()` — lê `doctors.json` / `patient_accounts.json`, devolve sem `passHash`/`salt`.
- `adminListRegistry()` — lê `patients_registry.json`.
- `adminResetDoctorPassword({ doctorId, newPassword })` / `adminResetPatientPassword({ patientId, newPassword })` — gera novo salt+hash, revoga todas as sessões do usuário.
- `adminDeleteDoctor({ doctorId })` / `adminDeletePatient({ patientId })` — remove conta e sessões (registry preservado — dado clínico).
- `adminImpersonateDoctor({ doctorId })` — cria uma sessão real (via `createSession`) e devolve o token, para o admin abrir /app "como o médico". Mesma coisa para paciente com `createPatientSession`.
- `adminListPatientsForDoctor({ doctorId })` — lista prontuários acessíveis, reusando funções existentes de `patients.server.ts`.

### Frontend (novo)

**`src/routes/admin/entrar.tsx`** — tela pública, campo de senha único, chama `adminUnlock`. Erro genérico se falhar. Sucesso → `/admin`.

**`src/routes/admin/route.tsx`** — layout com `beforeLoad` chamando `requireAdmin()` via server fn (throw redirect para `/admin/entrar` se cookie inválido). Sidebar com: Dashboard, Médicos, Pacientes, Registry, Conteúdo. Botão "Sair" chama `adminLock`.

**`src/routes/admin/index.tsx`** — contagens rápidas (nº de médicos, pacientes, entradas do registry).

**`src/routes/admin/medicos.tsx`** — tabela de médicos com ações: resetar senha (dialog), apagar, "entrar como" (chama `adminImpersonateDoctor`, salva o token retornado em `localStorage` via `setSession` e navega para `/app` numa nova aba).

**`src/routes/admin/pacientes.tsx`** — mesma coisa para contas de paciente, com "entrar como" abrindo `/paciente/app`.

**`src/routes/admin/registry.tsx`** — leitura das entradas globais de paciente (globalId, perfil autodeclarado, criador).

**`src/routes/admin/conteudo.tsx`** — placeholder por enquanto: lista das rotas públicas (`/`, `/sobre`, `/demo`) com nota "edição inline em próxima iteração — hoje o conteúdo é código". (Editar essas páginas via UI exige um CMS; posso montar num patch seguinte se você quiser.)

### O que NÃO muda
- Nada nas rotas de médico (`/login`, `/app/*`) ou paciente (`/paciente/*`).
- Nenhum arquivo existente de auth.
- A rota `/admin` atual (`src/routes/admin.tsx` — vou checar o que faz e substituir pelo layout novo, se for placeholder; se tiver conteúdo relevante, movo para `/admin/legacy`).

### Depois do plano aprovado, vou pedir

- `ADMIN_PASSWORD` via secret form (você define o valor).
- `ADMIN_SESSION_SECRET` é gerado automaticamente (não precisa fornecer).

Depois de aprovado, aplico tudo em uma leva de edits e valido typecheck.
