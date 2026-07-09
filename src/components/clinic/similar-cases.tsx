// Casos similares — apoio à decisão como na demo: base anonimizada com
// filtros categorizados (OR dentro da categoria, AND entre categorias).
// Colapsado por padrão para não disputar atenção com o prontuário.

import { useMemo, useState } from "react";
import { ChevronDown, Users } from "lucide-react";

type SimilarCase = {
  id: string;
  age: number;
  sex: "F" | "M";
  complaint: string;
  biomarkers: string[];
  condition: string;
  treatment: string;
  outcome: string;
};

const CASES: SimilarCase[] = [
  { id: "c1", age: 35, sex: "F", complaint: "Fadiga", biomarkers: ["Ferritina", "Hemoglobina"], condition: "Anemia ferropriva · fadiga", treatment: "Sulfato ferroso 40mg + Vit C · 90 dias", outcome: "Resolvido" },
  { id: "c2", age: 42, sex: "F", complaint: "Fadiga", biomarkers: ["Vitamina D", "Hemoglobina"], condition: "Anemia + Vit D baixa", treatment: "Ferro EV + Colecalciferol 50.000UI", outcome: "Resolvido" },
  { id: "c3", age: 39, sex: "F", complaint: "Fadiga", biomarkers: ["Ferritina"], condition: "Fadiga crônica · ferritina 22", treatment: "Sulfato ferroso + B12 + reavaliação 60d", outcome: "Em acompanh." },
  { id: "c4", age: 51, sex: "M", complaint: "Dispneia", biomarkers: ["Hemoglobina"], condition: "Anemia leve · dispneia aos esforços", treatment: "Investigação GI + ferro oral", outcome: "Em acompanh." },
  { id: "c5", age: 29, sex: "F", complaint: "Cefaleia", biomarkers: ["Vitamina D"], condition: "Cefaleia tensional · Vit D baixa", treatment: "Colecalciferol + higiene do sono", outcome: "Resolvido" },
];

const FILTERS = [
  { id: "complaint" as const, label: "Queixa", options: ["Fadiga", "Dispneia", "Cefaleia"] },
  { id: "biomarker" as const, label: "Biomarcador", options: ["Hemoglobina", "Ferritina", "Vitamina D"] },
];

export function SimilarCases() {
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState<Record<string, string[]>>({ complaint: [], biomarker: [] });

  const toggle = (cat: string, opt: string) =>
    setSel((prev) => ({
      ...prev,
      [cat]: prev[cat].includes(opt) ? prev[cat].filter((o) => o !== opt) : [...prev[cat], opt],
    }));

  const filtered = useMemo(
    () =>
      CASES.filter((c) => {
        if (sel.complaint.length && !sel.complaint.includes(c.complaint)) return false;
        if (sel.biomarker.length && !c.biomarkers.some((b) => sel.biomarker.includes(b))) return false;
        return true;
      }),
    [sel],
  );

  return (
    <div className="mt-5 rounded-2xl border border-border bg-card">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <span className="flex items-center gap-2 text-sm font-semibold">
          <Users className="h-4 w-4 text-primary" />
          Casos similares
          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
            base anonimizada · demonstração
          </span>
        </span>
        <ChevronDown className={`h-4 w-4 text-muted-foreground transition ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="border-t border-border/60 px-4 pb-4 pt-3">
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {FILTERS.map((f) => (
              <div key={f.id} className="flex items-center gap-1.5">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{f.label}:</span>
                {f.options.map((opt) => {
                  const active = sel[f.id].includes(opt);
                  return (
                    <button
                      key={opt}
                      onClick={() => toggle(f.id, opt)}
                      className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ring-1 transition ${
                        active
                          ? "bg-primary text-primary-foreground ring-primary"
                          : "bg-card text-muted-foreground ring-border hover:text-foreground"
                      }`}
                    >
                      {opt}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>

          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {filtered.map((c) => (
              <div key={c.id} className="rounded-xl border border-border bg-muted/30 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-muted-foreground">
                    {c.sex} · {c.age} anos · {c.complaint}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ${
                      c.outcome === "Resolvido"
                        ? "bg-emerald-100 text-emerald-700 ring-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:ring-emerald-900"
                        : "bg-sky-100 text-sky-700 ring-sky-200 dark:bg-sky-950 dark:text-sky-300 dark:ring-sky-900"
                    }`}
                  >
                    {c.outcome}
                  </span>
                </div>
                <div className="mt-1 text-xs font-medium">{c.condition}</div>
                <div className="mt-0.5 text-[11px] text-muted-foreground">{c.treatment}</div>
              </div>
            ))}
            {filtered.length === 0 && (
              <p className="col-span-2 py-4 text-center text-xs text-muted-foreground">
                Nenhum caso com esses filtros.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
