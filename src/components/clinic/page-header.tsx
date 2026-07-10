// Header padrão das páginas de lista do /app (Painel do dia, Pacientes…).
// A ação primária é sempre o último item do grupo à direita — a borda
// direita da página ancora sempre no mesmo lugar, com ou sem
// secondaryActions, então o botão nunca pula de posição entre páginas.

import type { ReactNode } from "react";

export function PageHeader({
  eyebrow,
  title,
  subtitle,
  secondaryActions,
  primaryAction,
}: {
  eyebrow: string;
  title: string;
  subtitle?: ReactNode;
  secondaryActions?: ReactNode;
  primaryAction: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <div className="text-[11px] font-medium uppercase tracking-wider text-primary">{eyebrow}</div>
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {subtitle}
      </div>
      <div className="flex items-center gap-2">
        {secondaryActions}
        {primaryAction}
      </div>
    </div>
  );
}
