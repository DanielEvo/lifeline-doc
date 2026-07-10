import { useState } from "react";
import { BookOpen, Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

// ---------------------------------------------------------------------------
// Protocolo seed — dados estáticos (sem CRUD por enquanto)
// ---------------------------------------------------------------------------

type Protocol = {
  id: string;
  title: string;
  tags: string[];
  body: string;
};

const PROTOCOLS: Protocol[] = [
  {
    id: "anemia-ferropriva",
    title: "Kit anemia ferropriva",
    tags: ["anemia", "ferritina", "hemoglobina", "ferro"],
    body: `**Critérios diagnósticos**
Hb < 12 g/dL (F) ou < 13 g/dL (M) + ferritina < 30 ng/mL.
Ferritina < 12 ng/mL confirma depleção; entre 12–30 ng/mL é sugestivo.

**Investigação obrigatória**
• Hemograma completo + reticulócitos
• Ferritina, ferro sérico, TIBC, saturação de transferrina
• Pesquisar causa: EDA se > 50 anos ou sintomas GI; colonoscopia conforme risco

**Reposição oral (1ª linha)**
Sulfato ferroso 40 mg de ferro elementar, 2–3×/dia, em jejum (30 min antes das refeições) com vitamina C para aumentar absorção.
Reavaliar hemograma em 4–8 semanas; manter por 3–6 meses após normalização da Hb para repor estoques.

**Monitoramento**
• Ferritina alvo ≥ 50 ng/mL ao final do tratamento
• Efeitos adversos comuns: constipação, náusea — orientar tomar com alimento se intolerância (reduz absorção ~40 %)

**IV/parenteral**
Indicar se: intolerância oral refratária, má absorção, anemia grave sintomática ou pré-cirúrgico.`,
  },
  {
    id: "hipotireoidismo-subclínico",
    title: "Hipotireoidismo subclínico",
    tags: ["TSH", "tireóide", "hipotireoidismo", "levotiroxina"],
    body: `**Definição**
TSH elevado (4–10 µUI/mL) com T4 livre normal. Assintomático na maioria.

**Quando tratar**
• TSH > 10 µUI/mL: tratar sempre
• TSH 4–10 µUI/mL: considerar se sintomas, gestante, infertilidade, dislipidemia ou anticorpos anti-TPO positivos

**Levotiroxina**
Dose inicial: 25–50 mcg/dia (idosos e cardiopatas: 12,5–25 mcg).
Tomar em jejum, 30–60 min antes do café. Afastar soja, cálcio e ferro por ≥ 4 h.
Titular a cada 6–8 semanas com TSH; alvo TSH 0,5–2,5 µUI/mL em adultos jovens.

**Rastreio**
Anti-TPO para avaliar progressão para hipotireoidismo manifesto (~2 %/ano se positivo).`,
  },
  {
    id: "rastreio-dm2",
    title: "Rastreio DM2 / pré-diabetes",
    tags: ["diabetes", "glicemia", "HbA1c", "metformina", "DM2"],
    body: `**Critérios diagnósticos (ADA 2024)**
• DM2: glicemia jejum ≥ 126 mg/dL, ou 2h TOTG ≥ 200 mg/dL, ou HbA1c ≥ 6,5 %
• Pré-diabetes: jejum 100–125, ou 2h 140–199, ou HbA1c 5,7–6,4 %

**Rastreio**
Iniciar aos 35 anos em adultos sem fatores de risco; mais cedo se: obesidade (IMC ≥ 25), HAS, dislipidemia, histórico familiar 1º grau, SÍNDROME-metabólica, histórico de DMG ou PCOS.
Intervalo: a cada 3 anos se normal; anual se pré-diabetes.

**Pré-diabetes — intervenção**
• Mudança de estilo de vida: ↓ 7 % do peso corporal + 150 min/semana exercício moderado
• Metformina 500 mg 2×/dia: considerar se IMC ≥ 35, < 60 anos, ou histórico de DMG
• Reavaliar HbA1c a cada 6–12 meses

**DM2 estabelecido — primeira linha**
Metformina 500 mg com jantar × 1–2 semanas → 500 mg 2×/dia → titular até 1 g 2×/dia conforme tolerância. Alvo HbA1c individualizado (geralmente < 7 % em adultos saudáveis).`,
  },
  {
    id: "cefaleia-cronica",
    title: "Investigação cefaleia crônica",
    tags: ["cefaleia", "enxaqueca", "migrânea", "dor de cabeça"],
    body: `**Classificação ICHD-3 (simplificada)**
• Migrânea: 4–72 h, unilateral, pulsátil, intensidade moderada-grave, náusea/fotofobia
• Cefaleia tensional episódica: bilateral, em pressão/aperto, leve-moderada, sem náusea
• Cefaleia crônica diária: ≥ 15 dias/mês por > 3 meses — investigar abuso analgésico (> 10–15 dias/mês)

**Red flags (investigar imagem)**
Início em trovoada ("thunderclap"), progressão em semanas, febre + rigidez nucal, déficit focal, > 50 anos sem histórico, pós-trauma, imunossuprimido.

**Diário de cefaleia**
Solicitar registro: data, duração, intensidade (0–10), gatilhos, medicação usada, resposta.

**Abordagem aguda (migrânea)**
Leve-moderada: AINEs (ibuprofeno 400–600 mg) ou paracetamol.
Moderada-grave: triptanos (sumatriptano 50–100 mg VO ou 6 mg SC); associar antiemético se náusea.

**Profilaxia (≥ 4 crises/mês ou incapacitante)**
1ª linha: propranolol 40–160 mg/dia, amitriptilina 10–75 mg/noite, topiramato 25–100 mg/dia ou valproato.
Duração mínima: 3–6 meses antes de avaliar eficácia.`,
  },
  {
    id: "sindrome-metabolica",
    title: "Síndrome metabólica — critérios e abordagem",
    tags: ["síndrome metabólica", "obesidade", "triglicerídeos", "HDL", "hipertensão"],
    body: `**Critérios (IDF/AHA 2009 — 3 de 5)**
1. Circunferência abdominal: > 90 cm (H) / > 80 cm (M) — critério latino
2. Triglicerídeos ≥ 150 mg/dL (ou em tratamento)
3. HDL < 40 mg/dL (H) ou < 50 mg/dL (M) (ou em tratamento)
4. PA ≥ 130/85 mmHg (ou em tratamento)
5. Glicemia jejum ≥ 100 mg/dL (ou DM2 diagnosticado)

**Risco cardiovascular**
Multiplica o risco de DM2 (5×) e evento CV (2×). Calcular escore de risco global (Framingham / PCE).

**Intervenção — estilo de vida (pilar principal)**
• Perda de 5–10 % do peso melhora todos os componentes
• Dieta mediterrânea ou DASH; reduzir açúcar, carboidratos refinados e gordura trans
• Exercício aeróbico 150–300 min/semana + resistência 2×/semana

**Farmacológico**
Tratar cada componente conforme guideline próprio (anti-hipertensivos, estatinas, metformina).
Não existe medicamento "para síndrome metabólica" — o alvo é cada componente.

**Seguimento**
Reavaliação em 3 meses: peso, PA, glicemia, lipídios.`,
  },
  {
    id: "vitamina-d",
    title: "Deficiência de vitamina D — reposição",
    tags: ["vitamina D", "colecalciferol", "25-OH", "osteoporose"],
    body: `**Interpretação (25-OH vitamina D)**
• Deficiência grave: < 10 ng/mL
• Deficiência: 10–19 ng/mL
• Insuficiência: 20–29 ng/mL
• Suficiência: ≥ 30 ng/mL (maioria dos consensos; alguns preferem ≥ 40)
• Toxicidade: > 100 ng/mL (cuidado acima de 80)

**Reposição (adultos)**
Deficiência: colecalciferol 50.000 UI/semana VO × 8–12 semanas → manutenção.
Insuficiência: 7.000–14.000 UI/semana ou 1.000–2.000 UI/dia.
Manutenção: 1.000–2.000 UI/dia (ajustar conforme nível e exposição solar).

**Grupos de risco para dose maior**
Obesos (1,5–2× a dose-padrão), má absorção intestinal, uso de rifampicina ou anticonvulsivantes.

**Monitoramento**
Dosar 25-OH após 3 meses de reposição; após atingir suficiência, repetir anualmente.
Não é necessário dosar rotineiramente cálcio sérico em doses ≤ 4.000 UI/dia.`,
  },
];

// ---------------------------------------------------------------------------

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
};

export function KnowledgeDrawer({ open, onOpenChange }: Props) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState<Protocol | null>(null);

  const filtered = query.trim()
    ? PROTOCOLS.filter((p) => {
        const q = query.toLowerCase();
        return (
          p.title.toLowerCase().includes(q) ||
          p.tags.some((t) => t.toLowerCase().includes(q)) ||
          p.body.toLowerCase().includes(q)
        );
      })
    : PROTOCOLS;

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange} modal={false}>
        <SheetContent
          side="right"
          overlayClassName="bg-black/20"
          className="w-[340px] sm:w-[400px] flex flex-col gap-0 p-0"
        >
          <SheetHeader className="border-b border-border px-4 py-3">
            <SheetTitle className="flex items-center gap-2 text-sm">
              <BookOpen className="h-4 w-4 text-primary" />
              Base de conhecimento
            </SheetTitle>
          </SheetHeader>

          <div className="px-4 pt-3 pb-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar protocolo…"
                className="pl-8 text-sm"
              />
              {query && (
                <button
                  onClick={() => setQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-4 pb-4">
            {filtered.length === 0 ? (
              <p className="mt-6 text-center text-sm text-muted-foreground">
                Nenhum protocolo encontrado.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {filtered.map((p) => (
                  <li key={p.id}>
                    <button
                      onClick={() => setActive(p)}
                      className="w-full rounded-xl border border-border bg-card px-3 py-2.5 text-left transition hover:border-primary/40 hover:bg-primary/5"
                    >
                      <div className="text-sm font-medium">{p.title}</div>
                      <div className="mt-0.5 flex flex-wrap gap-1">
                        {p.tags.slice(0, 3).map((t) => (
                          <span
                            key={t}
                            className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground"
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Modal com texto completo do protocolo */}
      <Dialog open={!!active} onOpenChange={(v) => { if (!v) setActive(null); }}>
        <DialogContent className="max-h-[80vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-primary" />
              {active?.title}
            </DialogTitle>
          </DialogHeader>
          {active && (
            <div className="mt-2 space-y-3 text-sm leading-relaxed text-foreground/90 whitespace-pre-wrap">
              {active.body.split("\n").map((line, i) => {
                if (line.startsWith("**") && line.endsWith("**")) {
                  return (
                    <p key={i} className="font-semibold text-foreground mt-3 first:mt-0">
                      {line.replace(/\*\*/g, "")}
                    </p>
                  );
                }
                if (line.startsWith("•")) {
                  return (
                    <p key={i} className="pl-3">
                      {line}
                    </p>
                  );
                }
                return line ? <p key={i}>{line}</p> : <div key={i} className="h-1" />;
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
