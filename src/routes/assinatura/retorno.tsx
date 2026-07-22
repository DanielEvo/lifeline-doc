import { createFileRoute, Link } from '@tanstack/react-router';
import { CheckCircle2 } from 'lucide-react';

export const Route = createFileRoute('/assinatura/retorno')({
  head: () => ({
    meta: [
      { title: 'LifeLine · Assinatura confirmada' },
      { name: 'description', content: 'Sua assinatura LifeLine Pro foi processada.' },
    ],
  }),
  validateSearch: (search: Record<string, unknown>): { session_id?: string } => ({
    session_id: typeof search.session_id === 'string' ? search.session_id : undefined,
  }),
  component: ReturnPage,
});

function ReturnPage() {
  const { session_id } = Route.useSearch();

  return (
    <div className="min-h-screen bg-muted/30 flex items-center justify-center p-4">
      <div className="max-w-md rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600">
          <CheckCircle2 className="h-8 w-8" />
        </div>
        <h1 className="mt-4 text-xl font-semibold tracking-tight">
          {session_id ? 'Assinatura confirmada!' : 'Retorno do checkout'}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {session_id
            ? 'Recursos Pro já estão liberados. Bem-vindo ao LifeLine.'
            : 'Não recebemos identificação da sessão de pagamento.'}
        </p>
        <div className="mt-6 flex flex-col gap-2">
          <Link
            to="/app"
            className="rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Ir para o consultório
          </Link>
          <Link
            to="/assinatura"
            className="rounded-lg border border-border px-4 py-2.5 text-sm hover:bg-muted"
          >
            Ver minha assinatura
          </Link>
        </div>
      </div>
    </div>
  );
}
