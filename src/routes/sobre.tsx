import { createFileRoute, Link } from "@tanstack/react-router";
import { Activity, ArrowRight, Heart, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ImpactStatsSection } from "@/components/impact-stats";
import { TestimonialCarousel } from "@/components/testimonial-carousel";

export const Route = createFileRoute("/sobre")({
  head: () => ({
    meta: [
      { title: "Nossa Missão — LifeLine" },
      { name: "description", content: "Por que três desenvolvedores decidiram construir uma ponte entre médicos exaustos e pacientes ansiosos. Conheça o manifesto LifeLine." },
      { property: "og:title", content: "Nossa Missão — LifeLine" },
      { property: "og:description", content: "Atrás de cada prontuário, existe uma vida. Atrás de cada consulta, existe um médico exausto." },
    ],
  }),
  component: SobrePage,
});

function SobrePage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Header />
      <Hero />
      <Manifesto />
      <Testimonial />
      <ImpactStatsSection
        eyebrow="O incêndio que ninguém vê"
        title="60% dos dados em saúde, perdidos. 795 mil vidas, por ano."
        subtitle="Estes não são números abstratos. São pacientes que carregam pastas de papel entre clínicas, médicos digitando às 23h, diagnósticos que chegam tarde demais."
      />
      <Founders />
      <CTASection />
      <Footer />
    </div>
  );
}

function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
        <Link to="/" className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl brand-gradient shadow-lg shadow-primary/30">
            <Activity className="h-5 w-5 text-primary-foreground" strokeWidth={2.5} />
          </div>
          <span className="text-lg font-semibold tracking-tight">LifeLine</span>
        </Link>
        <nav className="hidden items-center gap-8 text-sm text-muted-foreground md:flex">
          <Link to="/" className="transition hover:text-foreground">Home</Link>
          <Link to="/sobre" className="font-medium text-foreground">Sobre</Link>
          <Link to="/demo" className="transition hover:text-foreground">Demo</Link>
        </nav>
        <Link to="/demo">
          <Button className="brand-gradient text-primary-foreground shadow-md shadow-primary/30 hover:opacity-95">
            Launch Free Demo
            <ArrowRight className="ml-1.5 h-4 w-4" />
          </Button>
        </Link>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden bg-slate-950 text-white">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-40 left-1/2 h-[600px] w-[900px] -translate-x-1/2 rounded-full bg-cyan-500/15 blur-3xl" />
        <div className="absolute bottom-0 right-0 h-[400px] w-[500px] rounded-full bg-teal-400/10 blur-3xl" />
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, white 1px, transparent 0)",
            backgroundSize: "32px 32px",
          }}
        />
      </div>
      <div className="relative mx-auto max-w-5xl px-6 pt-28 pb-28 lg:pt-36 lg:pb-36">
        <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.04] px-3 py-1 text-xs font-medium text-white/70 backdrop-blur">
          <Heart className="h-3.5 w-3.5 text-rose-300" />
          Nossa missão
        </div>
        <h1 className="mt-7 text-4xl font-semibold leading-[1.05] tracking-tight md:text-6xl lg:text-7xl">
          Atrás de cada prontuário, <br />
          <span className="bg-gradient-to-r from-cyan-300 via-teal-200 to-emerald-300 bg-clip-text text-transparent">
            existe uma vida.
          </span>
          <br />
          Atrás de cada consulta, <br />
          <span className="text-white/60">existe um médico exausto.</span>
        </h1>
        <p className="mt-8 max-w-2xl text-lg leading-relaxed text-white/65">
          O LifeLine não nasceu de uma planilha de negócios. Nasceu da incredulidade
          de ver pessoas que dedicam a vida a cuidar dos outros sendo consumidas por
          papelada, softwares engessados e dados desconectados.
        </p>
      </div>
    </section>
  );
}

function Manifesto() {
  return (
    <section className="py-24">
      <div className="mx-auto grid max-w-6xl gap-16 px-6 lg:grid-cols-[1fr_1.4fr]">
        <div>
          <div className="text-sm font-medium text-primary">O Manifesto</div>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">
            Três desenvolvedores. Uma indignação compartilhada.
          </h2>
          <div className="mt-6 inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            <Sparkles className="h-3.5 w-3.5" />
            Construído por quem viu de perto
          </div>
        </div>
        <div className="space-y-6 text-base leading-relaxed text-foreground/85">
          <p>
            Tudo começou em uma sala de espera. Um de nós acompanhava a mãe em mais
            uma consulta, carregando pela quarta vez a mesma pasta plástica
            transbordando de exames impressos. <strong className="text-foreground">Hemogramas de 2019, ressonâncias de 2021,
            receitas perdidas no meio.</strong> A médica, gentil, tentava reconstruir três anos
            de história em quinze minutos.
          </p>
          <p>
            Do outro lado da mesa, vimos algo que nos atravessou: uma profissional
            brilhante, formada em uma das melhores faculdades do país, digitando
            campos repetitivos em um software desenhado nos anos 2000. Olhos no
            monitor, não na paciente. Não por escolha — por sobrevivência.
          </p>
          <p>
            Descobrimos depois que isso tem nome: <strong className="text-foreground">pajama time</strong> — as horas que
            médicos passam em casa, de pijama, depois do jantar, terminando
            prontuários. É o turno invisível. É o que rouba o casamento, o filho, o
            sono. É o que transforma vocação em burnout.
          </p>
          <p>
            E do lado do paciente? A ansiedade de ser o mensageiro do próprio corpo.
            De repetir a história clínica em cada balcão. De saber que o exame de
            sangue tirado na clínica A nunca vai chegar ao especialista da clínica B.
          </p>
          <p className="text-lg font-medium text-foreground">
            Decidimos construir a ponte. Uma plataforma que devolvesse ao médico o
            tempo de olhar nos olhos, e ao paciente a tranquilidade de ser visto como
            uma história inteira — não como um envelope pardo.
          </p>
        </div>
      </div>
    </section>
  );
}

function Testimonial() {
  return (
    <section className="border-y border-border bg-muted/40 py-24">
      <div className="mx-auto max-w-4xl px-6">
        <div className="relative rounded-3xl bg-card p-10 shadow-xl shadow-primary/5 md:p-14">
          <Quote className="absolute -top-5 left-8 h-12 w-12 rounded-full bg-primary p-3 text-primary-foreground shadow-lg" />
          <blockquote className="text-2xl font-medium leading-relaxed tracking-tight text-foreground md:text-3xl">
            "Eu não me tornei médica para passar metade do meu dia digitando em
            softwares engessados. Eu me tornei médica para{" "}
            <span className="text-brand-gradient">cuidar de pessoas</span>. O LifeLine
            me devolveu o tempo de olhar nos olhos dos meus pacientes."
          </blockquote>
          <div className="mt-8 flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full brand-gradient text-lg font-semibold text-primary-foreground">
              HM
            </div>
            <div>
              <div className="font-semibold">Dra. Helena Moraes</div>
              <div className="text-sm text-muted-foreground">
                Endocrinologista · Consultório próprio em São Paulo
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Founders() {
  const team = [
    { name: "Rafael Andrade", role: "Engenharia & IA", initials: "RA", tint: "from-cyan-400 to-teal-500" },
    { name: "Júlia Mendonça", role: "Produto & Design Clínico", initials: "JM", tint: "from-violet-400 to-indigo-500" },
    { name: "Bruno Tavares", role: "Infraestrutura & Segurança", initials: "BT", tint: "from-emerald-400 to-teal-500" },
  ];
  return (
    <section className="py-24">
      <div className="mx-auto max-w-6xl px-6">
        <div className="mx-auto max-w-2xl text-center">
          <div className="text-sm font-medium text-primary">Quem está por trás</div>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">
            Três fundadores. Um compromisso clínico.
          </h2>
          <p className="mt-4 text-muted-foreground">
            Engenheiros, designers e pesquisadores que escolheram dedicar suas
            carreiras a uma única pergunta: como devolver tempo a quem cuida?
          </p>
        </div>
        <div className="mt-14 grid gap-6 md:grid-cols-3">
          {team.map((m) => (
            <div
              key={m.name}
              className="rounded-2xl border border-border bg-card p-7 text-center shadow-sm transition hover:-translate-y-1 hover:shadow-xl hover:shadow-primary/10"
            >
              <div
                className={`mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br ${m.tint} text-2xl font-semibold text-white shadow-lg`}
              >
                {m.initials}
              </div>
              <div className="mt-5 text-lg font-semibold">{m.name}</div>
              <div className="mt-1 text-sm text-muted-foreground">{m.role}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function CTASection() {
  return (
    <section className="relative overflow-hidden py-24">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-b from-muted/40 to-background" />
      <div className="mx-auto max-w-3xl px-6 text-center">
        <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
          Junte-se ao movimento que devolve o tempo à medicina.
        </h2>
        <p className="mt-4 text-muted-foreground">
          Veja em 3 minutos como o LifeLine elimina o turno invisível.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link to="/demo">
            <Button size="lg" className="brand-gradient text-primary-foreground shadow-lg shadow-primary/30 hover:opacity-95">
              Testar Demo Interativa
              <ArrowRight className="ml-1.5 h-4 w-4" />
            </Button>
          </Link>
          <Link to="/" hash="lead">
            <Button size="lg" variant="outline">Falar com a equipe</Button>
          </Link>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-border bg-muted/30 py-10">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-6 text-sm text-muted-foreground md:flex-row">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-md brand-gradient">
            <Activity className="h-3.5 w-3.5 text-primary-foreground" strokeWidth={2.5} />
          </div>
          <span>© {new Date().getFullYear()} LifeLine · Saúde inteligente para consultórios</span>
        </div>
        <div className="flex gap-6">
          <Link to="/" className="hover:text-foreground">Home</Link>
          <Link to="/sobre" className="hover:text-foreground">Sobre</Link>
          <Link to="/demo" className="hover:text-foreground">Demo</Link>
        </div>
      </div>
    </footer>
  );
}
