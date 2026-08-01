import { useEffect, useState, type FormEvent } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Activity, ArrowLeft, HeartPulse, Loader2, Lock, Mail, MailCheck, User } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import {
  loginPatient,
  patientGoogleAuthStart,
  patientGoogleLogin,
  registerPatient,
  resendPatientVerificationEmail,
} from "@/lib/api/patient-auth.functions";
import { getPatientSession, setPatientSession } from "@/lib/patient-session";
import { CONSENT_TEXT } from "@/lib/consent";

export const Route = createFileRoute("/paciente/login")({
  head: () => ({
    meta: [
      { title: "LifeLine · Acessar meu histórico" },
      {
        name: "description",
        content: "Entre no LifeLine e tenha seu histórico de saúde sempre com você.",
      },
    ],
  }),
  component: PatientLoginPage,
});

type Mode = "login" | "register";

function PatientLoginPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("login");
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [busy, setBusy] = useState<"form" | "google" | "resend" | null>(null);
  // Cadastro por e-mail não loga: fica nesta tela até confirmar o e-mail.
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  // Sem provedor de e-mail configurado (RESEND_API_KEY ausente), o backend
  // devolve o link de confirmação direto — sem isso o cadastro por e-mail
  // fica travado pra sempre neste ambiente.
  const [devLink, setDevLink] = useState<string | null>(null);

  useEffect(() => {
    if (getPatientSession()) navigate({ to: "/paciente/app" });
  }, [navigate]);

  const finish = (r: { token: string; patient: { nome: string; email: string } }) => {
    setPatientSession({ token: r.token, nome: r.patient.nome, email: r.patient.email });
    toast.success(`Olá, ${r.patient.nome.split(" ")[0]}!`, {
      description: "Abrindo seu histórico…",
    });
    navigate({ to: "/paciente/app" });
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (!email || !password || (mode === "register" && !nome)) {
      toast.error("Preencha todos os campos.");
      return;
    }
    if (mode === "register" && password.length < 6) {
      toast.error("A senha precisa de pelo menos 6 caracteres.");
      return;
    }
    if (mode === "register" && !consentAccepted) {
      toast.error("Aceite os Termos de Uso e a Política de Privacidade para continuar.");
      return;
    }
    setBusy("form");
    try {
      if (mode === "register") {
        const r = await registerPatient({
          data: { nome, email, password, origin: window.location.origin, consentAccepted: true },
        });
        if (r.ok) {
          setPendingEmail(r.email);
          setDevLink(r.devLink ?? null);
        } else toast.error(r.error);
      } else {
        const r = await loginPatient({ data: { email, password } });
        if (r.ok) finish(r);
        else toast.error(r.error);
      }
    } catch {
      toast.error("Não consegui conectar agora. Tente novamente.");
    } finally {
      setBusy(null);
    }
  };

  const resend = async () => {
    if (busy || !pendingEmail) return;
    setBusy("resend");
    try {
      const r = await resendPatientVerificationEmail({
        data: { email: pendingEmail, origin: window.location.origin },
      });
      setDevLink(r.devLink ?? null);
      toast.success("Link reenviado. Confira sua caixa de entrada.");
    } catch {
      toast.error("Não consegui reenviar agora. Tente novamente.");
    } finally {
      setBusy(null);
    }
  };



  // OAuth real quando o servidor tem credenciais Google; sem elas (dev),
  // cai no login simulado — mesma conta + sessão reais no backend, mesmo
  // padrão do lado médico (src/routes/login.tsx).
  const withGoogle = async () => {
    if (busy) return;
    setBusy("google");
    try {
      const redirectUri = `${window.location.origin}/paciente/auth/callback`;
      const start = await patientGoogleAuthStart({ data: { redirectUri } });
      if (start.url) {
        window.location.assign(start.url);
        return; // segue no /paciente/auth/callback
      }
      const r = await patientGoogleLogin({ data: {} });
      if (r.ok) finish(r);
      else toast.error(r.error);
    } catch {
      toast.error("Não consegui conectar ao Google agora.");
    } finally {
      setBusy(null);
    }
  };

  if (pendingEmail) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/30 p-6">
        <div className="w-full max-w-sm rounded-3xl border border-border bg-card p-7 text-center shadow-xl shadow-primary/5">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10">
            <MailCheck className="h-6 w-6 text-primary" />
          </div>
          <h2 className="mt-4 text-lg font-semibold tracking-tight">Verifique seu e-mail</h2>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Enviamos um link de confirmação para{" "}
            <span className="font-medium text-foreground">{pendingEmail}</span>. Clique nele para
            ativar sua conta.
          </p>
          {devLink && (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-left text-[11px] text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
              <p className="font-medium">
                Este ambiente não tem envio de e-mail configurado (RESEND_API_KEY).
              </p>
              <p className="mt-1">
                Use o link direto pra confirmar o cadastro:{" "}
                <a href={devLink} className="break-all font-semibold underline">
                  {devLink}
                </a>
              </p>
            </div>
          )}
          <Button
            type="button"
            variant="outline"
            onClick={resend}
            disabled={busy !== null}
            className="press mt-5 w-full"
          >
            {busy === "resend" ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
            Reenviar e-mail de verificação
          </Button>
          <button
            type="button"
            onClick={() => {
              setPendingEmail(null);
              setDevLink(null);
              setMode("login");
            }}
            className="mt-4 w-full text-xs text-muted-foreground transition hover:text-foreground"
          >
            Voltar para o login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Brand panel */}
      <div className="relative hidden overflow-hidden bg-sidebar text-sidebar-foreground lg:flex lg:flex-col lg:justify-between lg:p-10">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -top-24 right-0 h-[380px] w-[380px] rounded-full bg-primary/25 blur-3xl" />
          <div className="absolute bottom-0 left-0 h-[300px] w-[300px] rounded-full bg-emerald-400/15 blur-3xl" />
        </div>
        <Link to="/" className="relative flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl brand-gradient shadow-lg shadow-primary/40">
            <Activity className="h-5 w-5 text-primary-foreground" strokeWidth={2.5} />
          </div>
          <span className="text-lg font-semibold tracking-tight">LifeLine</span>
        </Link>
        <div className="relative max-w-md">
          <div className="mb-6 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/20 text-primary">
            <HeartPulse className="h-6 w-6" />
          </div>
          <h1 className="text-3xl font-semibold leading-tight tracking-tight">
            Seu histórico de saúde, sempre com você.
          </h1>
        </div>
        <div className="relative text-[11px] text-sidebar-foreground/50">
          LGPD + CFM · Seus dados, sob seu controle
        </div>
      </div>

      {/* Auth card */}
      <div className="flex items-center justify-center bg-muted/30 p-6">
        <div className="w-full max-w-sm">
          <Link to="/" className="mb-6 flex items-center gap-2 lg:hidden">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg brand-gradient">
              <Activity className="h-4 w-4 text-primary-foreground" strokeWidth={2.5} />
            </div>
            <span className="font-semibold">LifeLine</span>
          </Link>

          <div className="rounded-3xl border border-border bg-card p-6 shadow-xl shadow-primary/5">
            <h2 className="text-xl font-semibold tracking-tight">
              {mode === "login" ? "Acessar meu histórico" : "Criar minha conta"}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {mode === "login"
                ? "Bem-vindo de volta. Sua saúde te espera."
                : "Leva menos de um minuto — sem cartão."}
            </p>

            <button
              type="button"
              onClick={withGoogle}
              disabled={busy !== null}
              className="press mt-5 flex w-full items-center justify-center gap-2.5 rounded-xl border border-border bg-background px-4 py-2.5 text-sm font-medium transition hover:bg-muted disabled:opacity-60"
            >
              {busy === "google" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
                  <path fill="#4285F4" d="M23.5 12.27c0-.85-.08-1.66-.22-2.45H12v4.64h6.45a5.52 5.52 0 0 1-2.4 3.62v3h3.88c2.27-2.09 3.57-5.17 3.57-8.81Z" />
                  <path fill="#34A853" d="M12 24c3.24 0 5.96-1.07 7.94-2.91l-3.88-3c-1.08.72-2.45 1.15-4.06 1.15-3.12 0-5.77-2.11-6.71-4.95H1.28v3.1A12 12 0 0 0 12 24Z" />
                  <path fill="#FBBC05" d="M5.29 14.29a7.2 7.2 0 0 1 0-4.58v-3.1H1.28a12 12 0 0 0 0 10.78l4.01-3.1Z" />
                  <path fill="#EA4335" d="M12 4.76c1.76 0 3.34.6 4.58 1.79l3.44-3.44A11.98 11.98 0 0 0 1.28 6.61l4.01 3.1C6.23 6.87 8.88 4.76 12 4.76Z" />
                </svg>
              )}
              Entrar com Google
            </button>

            <div className="my-4 flex items-center gap-3 text-[11px] text-muted-foreground">
              <span className="h-px flex-1 bg-border" />
              ou com e-mail
              <span className="h-px flex-1 bg-border" />
            </div>

            <form onSubmit={submit} className="space-y-3">
              {mode === "register" && (
                <div className="space-y-1">
                  <Label htmlFor="nome" className="text-xs">
                    Nome completo
                  </Label>
                  <div className="relative">
                    <User className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="nome"
                      value={nome}
                      onChange={(e) => setNome(e.target.value)}
                      placeholder="Mariana Silva"
                      maxLength={120}
                      className="pl-9"
                    />
                  </div>
                </div>
              )}
              <div className="space-y-1">
                <Label htmlFor="email" className="text-xs">
                  E-mail
                </Label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="voce@email.com"
                    maxLength={160}
                    className="pl-9"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="password" className="text-xs">
                  Senha
                </Label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <PasswordInput
                    id="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={mode === "register" ? "Mínimo 6 caracteres" : "Sua senha"}
                    maxLength={120}
                    className="pl-9"
                  />
                </div>
                {mode === "login" && (
                  <div className="pt-0.5 text-right">
                    <Link
                      to="/paciente/esqueci-senha"
                      className="text-[11px] text-muted-foreground transition hover:text-foreground"
                    >
                      Esqueci minha senha
                    </Link>
                  </div>
                )}
              </div>

              {mode === "register" && (
                <label className="flex items-start gap-2 text-[11px] leading-relaxed text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={consentAccepted}
                    onChange={(e) => setConsentAccepted(e.target.checked)}
                    className="mt-0.5 h-3.5 w-3.5 shrink-0"
                  />
                  {CONSENT_TEXT}
                </label>
              )}

              <Button
                type="submit"
                disabled={busy !== null || (mode === "register" && !consentAccepted)}
                className="press w-full brand-gradient text-primary-foreground shadow-md shadow-primary/30 hover:opacity-95"
              >
                {busy === "form" ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : null}
                {mode === "login" ? "Entrar" : "Criar conta e entrar"}
              </Button>
            </form>

            <button
              type="button"
              onClick={() => setMode(mode === "login" ? "register" : "login")}
              className="mt-4 w-full text-center text-xs text-muted-foreground transition hover:text-foreground"
            >
              {mode === "login" ? (
                <>
                  Primeira vez aqui? <span className="font-semibold text-primary">Criar conta</span>
                </>
              ) : (
                <>
                  Já tem conta? <span className="font-semibold text-primary">Entrar</span>
                </>
              )}
            </button>
          </div>

          <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
            <Link to="/entrar" className="inline-flex items-center gap-1 transition hover:text-foreground">
              <ArrowLeft className="h-3 w-3" />
              Sou médico
            </Link>
            <Link to="/" className="transition hover:text-foreground">
              Voltar ao site →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
