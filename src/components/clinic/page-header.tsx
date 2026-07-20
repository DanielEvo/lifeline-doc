// Header padrão das páginas de lista do /app (Painel do dia, Pacientes…).
// A ação primária é sempre o último item do grupo à direita, alinhada com a
// linha eyebrow+título — nunca com o `subtitle`. Isso garante que o botão
// fique na MESMA altura e tamanho em toda página, exista ou não subtitle
// (ex.: "Painel do dia" tem stats abaixo do título, "Pacientes" não).

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
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[11px] font-medium uppercase tracking-wider text-primary">{eyebrow}</div>
          <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        </div>
        <div className="flex items-center gap-2">
          {secondaryActions}
          {primaryAction}
        </div>
      </div>
      {subtitle}
    </div>
  );
}
