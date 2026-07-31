// Casos similares — apoio à decisão: base anonimizada com filtros
// categorizados (OR dentro da categoria, AND entre categorias).
// Vive como sidebar própria, ao lado da Base de Conhecimento.

import { useEffect, useMemo, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Check, ChevronDown, UsersRound, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

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
  { id: "age" as const, label: "Faixa etária", options: ["18–34", "35–45", "46+"] },
  { id: "sex" as const, label: "Sexo", options: ["F", "M"] },
];

function ageBucket(age: number): string {
  if (age <= 34) return "18–34";
  if (age <= 45) return "35–45";
  return "46+";
}

// Dropdown com busca e seleção múltipla (substitui os antigos chips-botão).
function MultiSelect({
  label,
  options,
  selected,
  onToggle,
  onClear,
}: {
  label: string;
  options: string[];
  selected: string[];
  onToggle: (opt: string) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const resumo =
    selected.length === 0
      ? "Todos"
      : selected.length === 1
        ? selected[0]
        : `${selected.length} selecionados`;

  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              "flex w-full items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-1.5 text-left text-xs transition hover:border-primary/50",
              selected.length > 0 && "border-primary/60 text-foreground",
            )}
          >
            <span className="min-w-0 flex-1 truncate">{resumo}</span>
            {selected.length > 0 && (
              <span
                role="button"
                tabIndex={0}
                aria-label={`Limpar ${label}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onClear();
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.stopPropagation();
                    onClear();
                  }
                }}
                className="shrink-0 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </span>
            )}
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-56 p-0">
          <Command>
            <CommandInput placeholder={`Buscar ${label.toLowerCase()}…`} className="h-9 text-xs" />
            <CommandList>
              <CommandEmpty className="py-4 text-center text-xs text-muted-foreground">
                Nada encontrado.
              </CommandEmpty>
              <CommandGroup>
                {options.map((opt) => {
                  const active = selected.includes(opt);
                  return (
                    <CommandItem key={opt} value={opt} onSelect={() => onToggle(opt)} className="text-xs">
                      <span
                        className={cn(
                          "mr-2 flex h-4 w-4 items-center justify-center rounded border",
                          active ? "border-primary bg-primary text-primary-foreground" : "border-border",
                        )}
                      >
                        {active && <Check className="h-3 w-3" />}
                      </span>
                      {opt}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}

export function SimilarCases() {
  const [sel, setSel] = useState<Record<string, string[]>>({
    complaint: [],
    biomarker: [],
    age: [],
    sex: [],
  });

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
        if (sel.age.length && !sel.age.includes(ageBucket(c.age))) return false;
        if (sel.sex.length && !sel.sex.includes(c.sex)) return false;
        return true;
      }),
    [sel],
  );

  return (
    <>
      <p className="text-xs text-muted-foreground">
        Base anonimizada · demonstração — perfis clínicos parecidos.
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {FILTERS.map((f) => (
          <MultiSelect
            key={f.id}
            label={f.label}
            options={f.options}
            selected={sel[f.id]}
            onToggle={(opt) => toggle(f.id, opt)}
            onClear={() => setSel((prev) => ({ ...prev, [f.id]: [] }))}
          />
        ))}
      </div>

      <div className="mt-4 grid gap-2">
        {filtered.map((c) => (
          <div key={c.id} className="rounded-xl border border-border bg-muted/30 p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="min-w-0 truncate text-[11px] text-muted-foreground">
                {c.sex} · {c.age} anos · {c.complaint}
              </span>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ${
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
          <p className="py-4 text-center text-xs text-muted-foreground">
            Nenhum caso com esses filtros.
          </p>
        )}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Sidebar de perfis similares — mesmo comportamento da Base de Conhecimento:
// sobreposta, altura total, largura ajustável e persistida.

const LARGURA_PADRAO = 380;
const LARGURA_MIN = 300;
const LARGURA_MAX = 900;
const LARGURA_KEY = "lifeline:perfis-largura";

export function SimilarCasesDrawer({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [largura, setLargura] = useState(LARGURA_PADRAO);
  const [redimensionando, setRedimensionando] = useState(false);

  useEffect(() => {
    const salvo = Number(window.localStorage.getItem(LARGURA_KEY));
    if (salvo >= LARGURA_MIN && salvo <= LARGURA_MAX) setLargura(salvo);
  }, []);

  const iniciarResize = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    setRedimensionando(true);
    const mover = (ev: PointerEvent) => {
      const nova = Math.min(LARGURA_MAX, Math.max(LARGURA_MIN, window.innerWidth - ev.clientX));
      setLargura(nova);
    };
    const soltar = () => {
      setRedimensionando(false);
      window.removeEventListener("pointermove", mover);
      window.removeEventListener("pointerup", soltar);
      document.body.style.userSelect = "";
      setLargura((l) => {
        window.localStorage.setItem(LARGURA_KEY, String(l));
        return l;
      });
    };
    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", mover);
    window.addEventListener("pointerup", soltar);
  };

  return (
    <aside
      style={{ width: largura }}
      className={cn(
        "fixed inset-y-0 right-0 z-40 flex max-w-[95vw] flex-col border-l border-border bg-background shadow-2xl transition-transform duration-300",
        open ? "translate-x-0" : "translate-x-full",
      )}
      aria-hidden={!open}
    >
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Redimensionar perfis similares"
        onPointerDown={iniciarResize}
        onDoubleClick={() => setLargura(LARGURA_PADRAO)}
        className={cn(
          "absolute inset-y-0 left-0 z-10 w-1.5 cursor-col-resize bg-transparent transition-colors hover:bg-primary/40",
          redimensionando && "bg-primary/60",
        )}
      />

      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        aria-label={open ? "Fechar perfis similares" : "Perfis similares"}
        title="Perfis similares"
        className="absolute -left-9 top-[4.25rem] z-10 flex h-9 w-9 items-center justify-center rounded-l-xl border border-r-0 border-border bg-background text-muted-foreground shadow-md transition hover:text-foreground"
      >
        <UsersRound className="h-4 w-4" />
      </button>

      <div className="flex items-center gap-2 border-b border-border px-4 py-3 text-sm font-semibold">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
          <UsersRound className="h-3.5 w-3.5 text-primary" />
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate">Perfis similares</span>
          <span className="text-[10px] font-normal text-muted-foreground">
            Casos anonimizados parecidos
          </span>
        </div>
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          aria-label="Fechar"
          className="text-muted-foreground transition hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <SimilarCases />
      </div>
    </aside>
  );
}
