
## O que vai mudar

Dois fluxos independentes — médico e paciente — sem misturar contas.

### 1) Login com Google de verdade

Hoje o backend já tem o fluxo OAuth 2.0 real implementado (`googleAuthUrl`, `exchangeGoogleCode`, state HMAC-assinado, `/auth/callback`). Ele só cai no "modo demo" (persona fixa) quando as variáveis `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET` não estão configuradas. O mesmo vale para o lado paciente, que reaproveita esses helpers.

**O que preciso de você:** criar credenciais no Google Cloud Console e me passar os dois valores para eu salvar como secrets (via formulário seguro, não em texto):

1. Acesse https://console.cloud.google.com/apis/credentials
2. "Criar credenciais" → "ID do cliente OAuth" → tipo "Aplicativo da Web"
3. Em **URIs de redirecionamento autorizados**, adicione TODOS estes (médico e paciente compartilham o mesmo callback, mas precisamos cobrir preview + produção + dev local):
   - `https://lifeline-doc.lovable.app/auth/callback`
   - `https://lifeline-doc.lovable.app/paciente/auth/callback`
   - `https://id-preview--908a1f64-b354-430b-bf2d-4d4c6207b563.lovable.app/auth/callback`
   - `https://id-preview--908a1f64-b354-430b-bf2d-4d4c6207b563.lovable.app/paciente/auth/callback`
   - `http://localhost:8080/auth/callback`
   - `http://localhost:8080/paciente/auth/callback`
4. Em **Domínios autorizados** da tela de consentimento: `lovable.app`
5. Copie **Client ID** e **Client Secret** — eu vou pedir esses dois via formulário seguro.

**Código que muda:**
- Criar `src/routes/paciente/auth.callback.tsx` (espelha `src/routes/auth.callback.tsx`, chama `patientGoogleExchange` e redireciona para `/paciente/app`).
- Nenhuma outra alteração no fluxo Google — assim que os secrets existirem, `googleAuthStart` passa a devolver a URL real e o "modo demo" some sozinho.

### 2) Fluxo completo de senha

Backend novo, espelhado para médico e paciente (arquivos separados, tabelas JSON separadas — nunca cruzam):

**Backend — médico** (`src/lib/auth.server.ts` + `src/lib/api/auth.functions.ts`):
- Novo arquivo `password_resets.json` com registros `{ token, doctorId, createdAt, expiresAt, usedAt }`.
- `createPasswordReset(email)` — gera token aleatório (32 bytes hex), TTL 30 min, sempre retorna sucesso silencioso (não vaza se o e-mail existe).
- `consumePasswordReset(token, newPassword)` — valida existência, expiração, `usedAt=null`; marca `usedAt`, atualiza `passHash`/`salt` do médico, **revoga todas as sessões ativas** dessa conta (por segurança).
- Server fns: `requestPasswordReset({email})` e `resetPassword({token, newPassword})`.

**Backend — paciente** (`src/lib/patient-auth.server.ts` + `src/lib/api/patient-auth.functions.ts`):
- Arquivo separado `patient_password_resets.json`.
- Funções análogas: `requestPatientPasswordReset`, `resetPatientPassword`.

**Simulação de e-mail (por enquanto):** a server fn `requestPasswordReset` retorna `{ ok: true, devLink: string | null }`. Quando não há infra de e-mail configurada, `devLink` traz a URL completa (`${origem}/redefinir-senha?token=...` ou `/paciente/redefinir-senha?token=...`). A tela mostra o link clicável direto — depois é só trocar por envio real de e-mail sem mexer no resto do fluxo.

**Frontend — 4 telas novas:**

1. `src/routes/esqueci-senha.tsx` — campo de e-mail, botão "Enviar link", mostra o `devLink` numa caixa destacada quando volta.
2. `src/routes/redefinir-senha.tsx` — lê `?token=` da URL, dois campos (nova senha + confirmação, mínimo 6 chars, precisam bater), chama `resetPassword`, redireciona para `/login` com toast "Senha alterada, entre novamente".
3. `src/routes/paciente/esqueci-senha.tsx` — idem, chama `requestPatientPasswordReset`.
4. `src/routes/paciente/redefinir-senha.tsx` — idem, chama `resetPatientPassword`, redireciona para `/paciente/login`.

**Ganchos nas telas existentes:**
- `src/routes/login.tsx`: link discreto "Esqueci minha senha" abaixo do campo de senha → `/esqueci-senha`.
- `src/routes/paciente/login.tsx`: mesmo link → `/paciente/esqueci-senha`.

### Regras de segurança respeitadas

- Token de reset: 32 bytes aleatórios, uso único (`usedAt`), expira em 30 min.
- Requisição de reset nunca revela se o e-mail está cadastrado (mensagem genérica "Se o e-mail existir, um link será enviado" + `devLink` só aparece quando de fato criamos o token).
- Ao trocar a senha, **todas as sessões ativas daquela conta são revogadas** — quem estava logado precisa entrar de novo.
- Namespaces 100% separados entre médico e paciente (tabelas, server fns, rotas).

## Diagrama de rotas

```text
Médico:            /login  ──►  /esqueci-senha  ──►  /redefinir-senha?token=…  ──►  /login
Paciente:  /paciente/login  ──►  /paciente/esqueci-senha  ──►  /paciente/redefinir-senha?token=…  ──►  /paciente/login
Google:    /login (ou /paciente/login) ──► Google ──► /auth/callback (ou /paciente/auth/callback) ──► /app (ou /paciente/app)
```

## Fora de escopo desta rodada

- Envio real de e-mail (fica simulado com link na tela, como você autorizou).
- Rate limiting nas requisições de reset (dá para adicionar depois).
- "Trocar senha estando logado" (fluxo diferente, não pedido).

## Ordem de execução (quando você aprovar)

1. Backend do reset (médico e paciente).
2. 4 telas novas + link "Esqueci minha senha" nos dois logins.
3. Rota `/paciente/auth/callback`.
4. Pedir `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET` via formulário seguro.
