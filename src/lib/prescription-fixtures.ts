// Massa de teste estática da bancada de prescrição (/app/memed-simulacao).
// CLIENT-SAFE: nunca importar nada de *.server.ts aqui.
//
// `predictRx` é a PREVISÃO do LifeLine de como a Memed deve quebrar os
// documentos. A verdade é o retorno real do evento prescricaoImpressa —
// a bancada existe justamente para comparar previsão × realidade.

export type RxKind =
  | "simples"
  | "especial"
  | "atb"
  | "notif_b"
  | "notif_a"
  | "notif_esp"
  | "lab"
  | "imagem"
  | "atestado";

export const RX_LABEL: Record<RxKind, { label: string; sub?: string }> = {
  simples: { label: "Receita simples", sub: "Via única · branca" },
  especial: { label: "Controle especial", sub: "Branca · 2 vias · C1/C4/C5" },
  atb: { label: "Antimicrobiano", sub: "2 vias · retenção" },
  notif_b: { label: "Notificação B", sub: "Azul · B1/B2" },
  notif_a: { label: "Notificação A", sub: "Amarela · A1/A2/A3" },
  notif_esp: { label: "Notificação especial", sub: "Branca · C2 retinoides" },
  lab: { label: "Pedido laboratorial" },
  imagem: { label: "Pedido de imagem", sub: "Exige CID + justificativa" },
  atestado: { label: "Atestado" },
};

export type ControlList = "C1" | "C2" | "C4" | "C5" | "B1" | "B2" | "A1" | "ATB";

export type FixtureItem = {
  key: string;
  nome: string;
  tipo: "med" | "lab" | "imagem" | "atestado";
  via?: string;
  lista?: ControlList | null;
  posologia?: string;
  indicacoes?: string;
  cid?: string;
  justificativa?: string;
  aviso?: string;
};

export function predictRx(item: FixtureItem): RxKind {
  if (item.tipo === "lab") return "lab";
  if (item.tipo === "imagem") return "imagem";
  if (item.tipo === "atestado") return "atestado";
  switch (item.lista) {
    case "C1":
    case "C4":
    case "C5":
      return "especial";
    case "C2":
      return "notif_esp";
    case "B1":
    case "B2":
      return "notif_b";
    case "A1":
      return "notif_a";
    case "ATB":
      return "atb";
    default:
      return "simples";
  }
}

export type Scenario = { nome: string; desc: string; itens: FixtureItem[] };

const cruzamento: FixtureItem[] = [
  {
    key: "x-losartana",
    nome: "Losartana potássica 50mg",
    tipo: "med",
    via: "oral",
    lista: null,
    posologia: "1 comprimido via oral pela manhã, uso contínuo",
  },
  {
    key: "x-sertralina",
    nome: "Sertralina 50mg",
    tipo: "med",
    via: "oral",
    lista: "C1",
    posologia: "1 comprimido via oral pela manhã por 30 dias",
  },
  {
    key: "x-clonazepam",
    nome: "Clonazepam 2mg",
    tipo: "med",
    via: "oral",
    lista: "B1",
    posologia: "1 comprimido via oral à noite por 30 dias",
  },
  {
    key: "x-morfina",
    nome: "Sulfato de morfina 10mg",
    tipo: "med",
    via: "oral",
    lista: "A1",
    posologia: "1 comprimido via oral a cada 12 horas por 10 dias",
  },
  {
    key: "x-glicerina",
    nome: "Supositório de glicerina 12%",
    tipo: "med",
    via: "retal",
    lista: null,
    posologia: "1 supositório por via retal, se necessário",
  },
  {
    key: "x-tobramicina",
    nome: "Tobramicina colírio 0,3%",
    tipo: "med",
    via: "ocular",
    lista: null,
    posologia: "1 gota em cada olho a cada 6 horas por 7 dias",
  },
  {
    key: "x-cipro-oto",
    nome: "Ciprofloxacino solução otológica 0,35%",
    tipo: "med",
    via: "otológica",
    lista: "ATB",
    posologia: "3 gotas no ouvido afetado a cada 12 horas por 7 dias",
    aviso: "RDC 20/2011 mira antimicrobiano sistêmico; tópico a verificar",
  },
  {
    key: "x-isotretinoina",
    nome: "Isotretinoína creme 0,05%",
    tipo: "med",
    via: "dermatológica",
    lista: "C2",
    posologia: "Aplicar fina camada na face à noite",
    aviso:
      "C2 cobre retinoides de uso SISTÊMICO; uso tópico pode não exigir notificação — verificar no teste",
  },
  {
    key: "x-ceftriaxona",
    nome: "Ceftriaxona 1g",
    tipo: "med",
    via: "intramuscular",
    lista: "ATB",
    posologia: "1 frasco-ampola IM a cada 24 horas por 5 dias",
  },
  {
    key: "x-omeprazol-iv",
    nome: "Omeprazol sódico 40mg injetável",
    tipo: "med",
    via: "intravenoso",
    lista: null,
    posologia: "1 frasco IV a cada 24 horas por 3 dias",
  },
  {
    key: "x-testosterona",
    nome: "Cipionato de testosterona 200mg/2ml",
    tipo: "med",
    via: "subcutâneo",
    lista: "C5",
    posologia: "0,5ml por via subcutânea a cada 7 dias",
  },
  {
    key: "x-budesonida",
    nome: "Budesonida spray nasal 50mcg",
    tipo: "med",
    via: "nasal",
    lista: null,
    posologia: "1 jato em cada narina 1x ao dia por 30 dias",
  },
  { key: "x-hemograma", nome: "Hemograma completo", tipo: "lab", indicacoes: "Jejum não obrigatório" },
  { key: "x-lipidico", nome: "Perfil lipídico", tipo: "lab", indicacoes: "Jejum de 12 horas" },
  { key: "x-tsh", nome: "TSH e T4 livre", tipo: "lab", indicacoes: "Coleta pela manhã" },
  { key: "x-creatinina", nome: "Creatinina sérica", tipo: "lab", indicacoes: "Controle de função renal" },
  { key: "x-ferritina", nome: "Ferritina", tipo: "lab", indicacoes: "Investigação de anemia" },
  {
    key: "x-rx-torax",
    nome: "Radiografia de tórax PA e perfil",
    tipo: "imagem",
    cid: "J18.9",
    justificativa: "Tosse produtiva com febre há 5 dias",
  },
  {
    key: "x-usg-abd",
    nome: "Ultrassonografia de abdome total",
    tipo: "imagem",
    cid: "R10.4",
    justificativa: "Dor abdominal difusa em investigação",
  },
  {
    key: "x-tc-cranio",
    nome: "Tomografia computadorizada de crânio sem contraste",
    tipo: "imagem",
    cid: "R51",
    justificativa: "Cefaleia de início súbito",
  },
  {
    key: "x-rm-joelho",
    nome: "Ressonância magnética de joelho direito",
    tipo: "imagem",
    cid: "M23.2",
    justificativa: "Instabilidade articular pós-trauma",
  },
  {
    key: "x-atestado",
    nome: "Atestado de afastamento por 3 dias",
    tipo: "atestado",
    cid: "J18.9",
    justificativa: "Repouso domiciliar",
  },
];

export const SCENARIOS: Scenario[] = [
  {
    nome: "Cruzamento completo",
    desc: "12 medicamentos cobrindo todas as vias × controle, 5 exames laboratoriais, 4 de imagem com CID e 1 atestado.",
    itens: cruzamento,
  },
  {
    nome: "Só controlados",
    desc: "Um representante de cada faixa de controle — o teste mais rápido de quebra de documentos.",
    itens: [
      {
        key: "c-sertralina",
        nome: "Sertralina 50mg",
        tipo: "med",
        via: "oral",
        lista: "C1",
        posologia: "1 comprimido via oral pela manhã por 30 dias",
      },
      {
        key: "c-clonazepam",
        nome: "Clonazepam 2mg",
        tipo: "med",
        via: "oral",
        lista: "B1",
        posologia: "1 comprimido via oral à noite por 30 dias",
      },
      {
        key: "c-isotretinoina",
        nome: "Isotretinoína creme 0,05%",
        tipo: "med",
        via: "dermatológica",
        lista: "C2",
        posologia: "Aplicar fina camada na face à noite",
        aviso:
          "C2 cobre retinoides de uso SISTÊMICO; uso tópico pode não exigir notificação — verificar no teste",
      },
      {
        key: "c-testosterona",
        nome: "Cipionato de testosterona 200mg/2ml",
        tipo: "med",
        via: "intramuscular",
        lista: "C5",
        posologia: "1ml IM a cada 21 dias",
      },
      {
        key: "c-ceftriaxona",
        nome: "Ceftriaxona 1g",
        tipo: "med",
        via: "intramuscular",
        lista: "ATB",
        posologia: "1 frasco-ampola IM a cada 24 horas por 5 dias",
      },
    ],
  },
  {
    nome: "Limite de 3 na C1",
    desc: "4 substâncias C1 distintas — testa se a Memed quebra em 2 documentos de controle especial.",
    itens: [
      {
        key: "l-amitriptilina",
        nome: "Amitriptilina 25mg",
        tipo: "med",
        via: "oral",
        lista: "C1",
        posologia: "1 comprimido via oral à noite por 30 dias",
      },
      {
        key: "l-sertralina",
        nome: "Sertralina 50mg",
        tipo: "med",
        via: "oral",
        lista: "C1",
        posologia: "1 comprimido via oral pela manhã por 30 dias",
      },
      {
        key: "l-quetiapina",
        nome: "Quetiapina 25mg",
        tipo: "med",
        via: "oral",
        lista: "C1",
        posologia: "1 comprimido via oral à noite por 30 dias",
      },
      {
        key: "l-biperideno",
        nome: "Biperideno 2mg",
        tipo: "med",
        via: "oral",
        lista: "C1",
        posologia: "1 comprimido via oral 2x ao dia por 30 dias",
      },
    ],
  },
  {
    nome: "Só exames",
    desc: "3 laboratoriais e 3 de imagem — confirma se pedidos saem em documentos separados por natureza.",
    itens: [
      { key: "e-hemograma", nome: "Hemograma completo", tipo: "lab", indicacoes: "Jejum não obrigatório" },
      { key: "e-glicemia", nome: "Glicemia de jejum", tipo: "lab", indicacoes: "Jejum de 8 horas" },
      { key: "e-tsh", nome: "TSH", tipo: "lab", indicacoes: "Coleta pela manhã" },
      {
        key: "e-rx-torax",
        nome: "Radiografia de tórax PA",
        tipo: "imagem",
        cid: "J18.9",
        justificativa: "Tosse produtiva com febre",
      },
      {
        key: "e-usg-tireoide",
        nome: "Ultrassonografia de tireoide",
        tipo: "imagem",
        cid: "E04.9",
        justificativa: "Nódulo palpável cervical",
      },
      {
        key: "e-mamografia",
        nome: "Mamografia bilateral",
        tipo: "imagem",
        cid: "Z12.3",
        justificativa: "Rastreamento de rotina",
      },
    ],
  },
  {
    nome: "Consulta típica",
    desc: "O caso do dia a dia: dois medicamentos simples, dois exames e uma imagem.",
    itens: [
      {
        key: "t-losartana",
        nome: "Losartana potássica 50mg",
        tipo: "med",
        via: "oral",
        lista: null,
        posologia: "1 comprimido via oral pela manhã, uso contínuo",
      },
      {
        key: "t-dipirona",
        nome: "Dipirona sódica 500mg",
        tipo: "med",
        via: "oral",
        lista: null,
        posologia: "1 comprimido via oral a cada 6 horas, se dor ou febre",
      },
      { key: "t-hemograma", nome: "Hemograma completo", tipo: "lab", indicacoes: "Jejum não obrigatório" },
      { key: "t-lipidico", nome: "Perfil lipídico", tipo: "lab", indicacoes: "Jejum de 12 horas" },
      {
        key: "t-rx-torax",
        nome: "Radiografia de tórax PA e perfil",
        tipo: "imagem",
        cid: "J18.9",
        justificativa: "Tosse produtiva com febre há 5 dias",
      },
    ],
  },
];
