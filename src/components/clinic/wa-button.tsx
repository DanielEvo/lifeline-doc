// Botão WhatsApp: abre wa.me com a mensagem contextual já escrita.
// Sem telefone cadastrado, fica desabilitado com dica do porquê.

import { waLink } from "@/lib/clinic-types";

export function WhatsAppButton({
  telefone,
  text,
  title,
  size = "sm",
}: {
  telefone: string | null;
  text: string;
  title: string;
  size?: "sm" | "md";
}) {
  const cls =
    size === "md"
      ? "inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm transition hover:bg-emerald-700"
      : "inline-flex h-8 w-8 items-center justify-center rounded-lg text-emerald-600 transition hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950";

  if (!telefone) {
    return (
      <span
        title="Sem WhatsApp cadastrado"
        className={`${cls} cursor-not-allowed opacity-40`}
        aria-disabled
      >
        <WaIcon />
        {size === "md" && "WhatsApp"}
      </span>
    );
  }

  return (
    <a
      href={waLink(telefone, text)}
      target="_blank"
      rel="noreferrer"
      title={title}
      onClick={(e) => e.stopPropagation()}
      className={cls}
    >
      <WaIcon />
      {size === "md" && title}
    </a>
  );
}

function WaIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
      <path d="M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.96-.94 1.16-.17.2-.35.22-.64.07-.3-.15-1.26-.46-2.4-1.47-.88-.79-1.48-1.76-1.65-2.06-.17-.3-.02-.46.13-.6.13-.14.3-.35.44-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.8.37-.27.3-1.04 1.02-1.04 2.5 0 1.47 1.07 2.9 1.22 3.1.15.2 2.1 3.2 5.1 4.49.71.3 1.27.49 1.7.63.72.23 1.37.2 1.88.12.58-.09 1.76-.72 2-1.42.25-.7.25-1.3.18-1.42-.07-.12-.27-.2-.57-.35Z" />
      <path d="M12.05 2a9.9 9.9 0 0 0-8.57 14.86L2 22l5.28-1.38A9.9 9.9 0 1 0 12.05 2Zm0 18.1c-1.6 0-3.16-.43-4.52-1.24l-.32-.19-3.13.82.84-3.05-.21-.34a8.2 8.2 0 1 1 7.34 4Z" />
    </svg>
  );
}
