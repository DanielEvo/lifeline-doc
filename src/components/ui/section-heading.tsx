import { cn } from "@/lib/utils";

/**
 * SectionHeading — the canonical "eyebrow + title + subtitle" block used at the
 * top of marketing/section content. Centralizes the type scale and spacing so
 * every section reads consistently. Replaces the ad-hoc copies that were
 * duplicated across the landing, impact stats and About pages.
 */
export function SectionHeading({
  eyebrow,
  title,
  subtitle,
  align = "center",
  tone = "default",
  className,
}: {
  eyebrow?: string;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  align?: "center" | "left";
  tone?: "default" | "invert";
  className?: string;
}) {
  return (
    <div
      className={cn(
        align === "center" ? "mx-auto max-w-2xl text-center" : "max-w-2xl",
        className,
      )}
    >
      {eyebrow && (
        <div className={cn("text-sm font-medium", tone === "invert" ? "text-cyan-300" : "text-primary")}>
          {eyebrow}
        </div>
      )}
      <h2 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">{title}</h2>
      {subtitle && (
        <p className={cn("mt-3", tone === "invert" ? "text-white/60" : "text-muted-foreground")}>
          {subtitle}
        </p>
      )}
    </div>
  );
}
