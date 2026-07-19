import { useEffect, useState, type FormEvent } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Activity, ArrowLeft, CheckCircle2, Loader2, Lock, Mail, User } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { googleAuthStart, googleLogin, loginDoctor, registerDoctor } from "@/lib/api/auth.functions";
import { getSession, setSession } from "@/lib/session";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "LifeLine · Entrar" },
      { name: "description", content: "Acesse o consultório LifeLine — login com Google ou e-mail." },
    ],
  }),
  component: LoginPage,
});

type Mode = "login" | "register";

function LoginPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("login");
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState<"form" | "google" | null>(null);

  // Já logado → direto para o consultório
  useEffect(() => {
    if (getSession()) navigate({ to: "/app" });
  }, [navigate]);

  const finish = (r: { token: string; doctor: { nome: string; email: string } }) => {
    setSession({ token: r.token, nome: r.doctor.nome, email: r.doctor.email });
    toast.success(`Bem-vinda, ${r.doctor.nome.split(" ")[0]}!`, {
      description: "Abrindo seu consultório…",
    });
    navigate({ to: "/app" });
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
    setBusy("form");
    try {
      const r =
        mode === "register"
          ? await registerDoctor({ data: { nome, email, password } })
          : await loginDoctor({ data: { email, password } });
      if (r.ok) finish(r);
      else toast.error(r.error);
    } catch {
      toast.error("Não consegui conectar agora. Tente novamente.");
    } finally {
      setBusy(null);
    }
  };

  // OAuth real quando o servidor tem credenciais Google; sem elas (dev),
  // cai no login simulado — mesma conta + sessão reais no backend.
  const withGoogle = async () => {
    if (busy) return;
    setBusy("google");
    try {
      const redirectUri = `${window.location.origin}/auth/callback`;
      const start = await googleAuthStart({ data: { redirectUri } });
      if (start.url) {
        window.location.assign(start.url);
        return; // segue no /auth/callback
      }
      const r = await googleLogin({ data: {} });
      if (r.ok) finish(r);
      else toast.error(r.error);
    } catch {
      toast.error("Não consegui conectar ao Google agora.");
    } finally {
      setBusy(null);
    }
  };

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
          <h1 className="text-3xl font-semibold leading-tight tracking-tight">
            Seu consultório, do primeiro "oi" à receita assinada.
          </h1>
          <ul className="mt-6 space-y-3 text-sm text-sidebar-foreground/80">
            {[
              "Paciente chega triado pelo WhatsApp",
              "Prontuário com anos de evolução numa tela",
              "Receita Memed e selo digital num clique",
            ].map((b) => (
              <li key={b} className="flex items-start gap-2.5">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                {b}
              </li>
            ))}
          </ul>
        </div>
        <div className="relative text-[11px] text-sidebar-foreground/50">
          LGPD + CFM · Assinatura ICP-Brasil · Memed integrada
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
              {mode === "login" ? "Entrar no consultório" : "Criar sua conta"}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {mode === "login"
                ? "Bem-vinda de volta. Seus pacientes esperam."
                : "Leva menos de um minuto — sem cartão."}
            </p>

            {/* Google */}
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
                      placeholder="Dra. Ana Beatriz"
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
                    placeholder="ana@consultorio.com.br"
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
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={mode === "register" ? "Mínimo 6 caracteres" : "Sua senha"}
                    maxLength={120}
                    className="pl-9"
                  />
                </div>
              </div>
              <Button
                type="submit"
                disabled={busy !== null}
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
            <Link to="/" className="inline-flex items-center gap-1 transition hover:text-foreground">
              <ArrowLeft className="h-3 w-3" />
              Voltar ao site
            </Link>
            <Link to="/demo" className="transition hover:text-foreground">
              Ver a demo sem cadastro →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
