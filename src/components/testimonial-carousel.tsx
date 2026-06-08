import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Quote } from "lucide-react";

type Testimonial = {
  quote: string;
  name: string;
  role: string;
  initials: string;
  tint: string;
};

const TESTIMONIALS: Testimonial[] = [
  {
    quote:
      "Eu não me tornei médica para passar metade do meu dia digitando em softwares engessados. Eu me tornei médica para cuidar de pessoas. O LifeLine me devolveu o tempo de olhar nos olhos dos meus pacientes.",
    name: "Dra. Helena Moraes",
    role: "Endocrinologista · Consultório próprio · São Paulo",
    initials: "HM",
    tint: "from-cyan-400 to-teal-500",
  },
  {
    quote:
      "Em 60 dias eu reduzi meu pajama time de 2h30 para 20 minutos. O briefing chega pronto no WhatsApp e o prontuário se monta sozinho. Voltei a jantar com meus filhos.",
    name: "Dr. Renato Vasconcelos",
    role: "Clínico Geral · Belo Horizonte",
    initials: "RV",
    tint: "from-emerald-400 to-teal-500",
  },
  {
    quote:
      "Pela primeira vez consegui ver a evolução da hemoglobina da minha paciente em 4 anos sem pedir pasta nenhuma. O diagnóstico que demoraria 3 consultas saiu na primeira.",
    name: "Dra. Camila Ferraz",
    role: "Hematologista · Hospital Sírio-Libanês",
    initials: "CF",
    tint: "from-violet-400 to-indigo-500",
  },
  {
    quote:
      "A Memed integrada nativamente é o detalhe que mostra que quem construiu o LifeLine entende o consultório de verdade. Não é mais um software de TI — é uma ferramenta clínica.",
    name: "Dr. Pedro Lacerda",
    role: "Cardiologista · Clínica Particular · Curitiba",
    initials: "PL",
    tint: "from-rose-400 to-orange-500",
  },
  {
    quote:
      "Minhas pacientes chegam preparadas. Eu chego preparada. A consulta vira conversa, não interrogatório. Isso muda absolutamente tudo na relação médico-paciente.",
    name: "Dra. Marina Sato",
    role: "Ginecologista · Florianópolis",
    initials: "MS",
    tint: "from-amber-400 to-orange-500",
  },
];

export function TestimonialCarousel() {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return;
    const t = setInterval(() => {
      setIndex((i) => (i + 1) % TESTIMONIALS.length);
    }, 6500);
    return () => clearInterval(t);
  }, [paused]);

  const go = (dir: number) =>
    setIndex((i) => (i + dir + TESTIMONIALS.length) % TESTIMONIALS.length);

  return (
    <section className="border-y border-border bg-muted/40 py-24">
      <div className="mx-auto max-w-5xl px-6">
        <div className="mx-auto mb-10 max-w-2xl text-center">
          <div className="text-sm font-medium text-primary">A voz de quem usa</div>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">
            Médicos que recuperaram o tempo de cuidar.
          </h2>
        </div>

        <div
          className="relative"
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
        >
          <div className="relative overflow-hidden rounded-3xl bg-card p-8 shadow-xl shadow-primary/5 md:p-14">
            <Quote className="absolute -top-5 left-8 h-12 w-12 rounded-full bg-primary p-3 text-primary-foreground shadow-lg" />

            <div className="relative min-h-[300px] md:min-h-[260px]">
              {TESTIMONIALS.map((t, i) => {
                const active = i === index;
                return (
                  <div
                    key={t.name}
                    aria-hidden={!active}
                    className={`absolute inset-0 transition-all duration-700 ease-out ${
                      active
                        ? "translate-x-0 opacity-100"
                        : i < index
                        ? "-translate-x-6 opacity-0"
                        : "translate-x-6 opacity-0"
                    }`}
                  >
                    <blockquote className="text-xl font-medium leading-relaxed tracking-tight text-foreground md:text-2xl lg:text-[1.7rem]">
                      "{t.quote}"
                    </blockquote>
                    <div className="mt-8 flex items-center gap-4">
                      <div
                        className={`flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br ${t.tint} text-base font-semibold text-white shadow-md`}
                      >
                        {t.initials}
                      </div>
                      <div>
                        <div className="font-semibold tracking-tight">{t.name}</div>
                        <div className="text-sm text-muted-foreground">{t.role}</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Controls */}
            <div className="mt-2 flex items-center justify-between gap-4 pt-4">
              <div className="flex items-center gap-2">
                {TESTIMONIALS.map((_, i) => {
                  const active = i === index;
                  return (
                    <button
                      key={i}
                      onClick={() => setIndex(i)}
                      aria-label={`Ir para depoimento ${i + 1}`}
                      className={`h-1.5 rounded-full transition-all duration-500 ${
                        active ? "w-10 bg-primary" : "w-4 bg-border hover:bg-muted-foreground/40"
                      }`}
                    />
                  );
                })}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => go(-1)}
                  aria-label="Depoimento anterior"
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition hover:border-primary hover:text-primary"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  onClick={() => go(1)}
                  aria-label="Próximo depoimento"
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition hover:border-primary hover:text-primary"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
