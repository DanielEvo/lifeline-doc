// Página pública de verificação de receita digital emitida pelo LifeLine.
// Substitui o antigo link https://memed.com.br/r/{code} — que era um URL
// simbólico e retornava 404 fora do ambiente Memed. Quando a integração
// real da Memed está ativa e emitiu URL própria, a receita usa aquela URL
// diretamente; esta página cobre o fluxo local (código verificável LFL-).

import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { ArrowLeft, CheckCircle2, Pill, ShieldCheck } from "lucide-react";

import { getPrescriptionByCode } from "@/lib/api/receita.functions";

const prescriptionQuery = (code: string) =>
  queryOptions({
    queryKey: ["prescription", code],
    queryFn: async () => {
      const res = await getPrescriptionByCode({ data: { code } });
      if (!res.ok) throw notFound();
      return res.prescription;
    },
    staleTime: 60_000,
  });

export const Route = createFileRoute("/receita/$code")({
  head: ({ params }) => ({
    meta: [
      { title: `Receita ${params.code} · LifeLine` },
      {
        name: "description",
        content: `Verificação da receita digital ${params.code} emitida pelo LifeLine.`,
      },
      { property: "og:title", content: `Receita ${params.code}` },
      {
        property: "og:description",
        content: "Prescrição digital verificável emitida pelo LifeLine.",
      },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(prescriptionQuery(params.code)),
  component: ReceitaPage,
  errorComponent: () => <NotFoundReceita />,
  notFoundComponent: () => <NotFoundReceita />,
});

function ReceitaPage() {
  const { code } = Route.useParams();
  const { data } = useSuspenseQuery(prescriptionQuery(code));

  const emittedAt = new Date(data.createdAt).toLocaleString("pt-BR", {
    dateStyle: "long",
    timeStyle: "short",
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-emerald-50/40 px-4 py-10 dark:from-slate-950 dark:via-background dark:to-emerald-950/10">
      <div className="mx-auto max-w-xl">
        <Link
          to="/"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" /> LifeLine
        </Link>

        <div className="mt-4 overflow-hidden rounded-2xl bg-white shadow-xl ring-1 ring-border/60 dark:bg-card">
          <div className="flex items-center gap-3 bg-gradient-to-r from-emerald-600 to-teal-600 px-6 py-5 text-white">
            <ShieldCheck className="h-8 w-8" />
            <div>
              <div className="text-[11px] uppercase tracking-widest opacity-80">
                Receita digital verificável
              </div>
              <div className="font-mono text-lg font-semibold">{data.code}</div>
            </div>
          </div>

          <div className="space-y-4 px-6 py-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
                  Paciente
                </div>
                <div className="text-base font-semibold text-foreground">{data.patient}</div>
              </div>
              <div className="text-right">
                <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
                  Emitida em
                </div>
                <div className="text-sm text-foreground">{emittedAt}</div>
              </div>
            </div>

            <div>
              <div className="mb-1.5 flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
                <Pill className="h-3 w-3" /> Medicamentos prescritos
              </div>
              <ul className="space-y-1.5">
                {data.meds.map((m, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-2 rounded-lg bg-muted/40 px-3 py-2 text-sm text-foreground"
                  >
                    <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-600" />
                    <span>{m}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-[11px] leading-relaxed text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
              <strong>Autenticidade:</strong> este documento foi emitido por um médico
              autenticado no LifeLine e registrado com código único{" "}
              <span className="font-mono">{data.code}</span>. A validade legal da prescrição
              observa a Resolução CFM 2.299/2021 e a integração Memed (Sinapse Prescrição),
              quando ativa no consultório emissor.
            </div>
          </div>
        </div>

        <p className="mt-4 text-center text-[11px] text-muted-foreground">
          LifeLine · Prontuário e prescrição para médicos
        </p>
      </div>
    </div>
  );
}

function NotFoundReceita() {
  const { code } = Route.useParams();
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <ShieldCheck className="mx-auto h-10 w-10 text-muted-foreground" />
        <h1 className="mt-3 text-xl font-semibold text-foreground">Receita não encontrada</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          O código <span className="font-mono">{code}</span> não corresponde a nenhuma
          prescrição emitida por este consultório.
        </p>
        <Link
          to="/"
          className="mt-6 inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Voltar ao LifeLine
        </Link>
      </div>
    </div>
  );
}
