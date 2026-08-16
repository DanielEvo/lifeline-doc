// Listas de apoio ao cadastro do prescritor.
// Especialidades conforme a Resolução CFM 2.221/2018 (55 especialidades).

// Tipos de registro profissional aceitos pela Memed (board_code, §11 do
// handover). Rótulo só pra exibição — o código enviado à Memed é sempre a
// sigla, nunca o texto depois do travessão.
export const BOARD_CODE_LABELS: Record<string, string> = {
  CRM: "Medicina",
  CRO: "Odontologia",
  COREN: "Enfermagem",
  CRMV: "Medicina Veterinária",
  CRF: "Farmácia",
  CRN: "Nutrição",
  CREFITO: "Fisioterapia / Terapia Ocupacional",
  CRP: "Psicologia",
  CRFa: "Fonoaudiologia",
  CREF: "Educação Física",
};

export const BOARD_CODE_OPTIONS = Object.entries(BOARD_CODE_LABELS).map(
  ([codigo, label]) => `${codigo} — ${label}`,
);

export function boardCodeFromOption(option: string): string {
  return option.split(" — ")[0]?.trim() ?? option;
}

export function optionFromBoardCode(code: string): string {
  return code && BOARD_CODE_LABELS[code] ? `${code} — ${BOARD_CODE_LABELS[code]}` : code;
}

export const UFS = [
  "AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB",
  "PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO",
];

export const ESPECIALIDADES = [
  "Acupuntura",
  "Alergia e Imunologia",
  "Anestesiologia",
  "Angiologia",
  "Cardiologia",
  "Cirurgia Cardiovascular",
  "Cirurgia da Mão",
  "Cirurgia de Cabeça e Pescoço",
  "Cirurgia do Aparelho Digestivo",
  "Cirurgia Geral",
  "Cirurgia Oncológica",
  "Cirurgia Pediátrica",
  "Cirurgia Plástica",
  "Cirurgia Torácica",
  "Cirurgia Vascular",
  "Clínica Médica",
  "Coloproctologia",
  "Dermatologia",
  "Endocrinologia e Metabologia",
  "Endoscopia",
  "Gastroenterologia",
  "Genética Médica",
  "Geriatria",
  "Ginecologia e Obstetrícia",
  "Hematologia e Hemoterapia",
  "Homeopatia",
  "Infectologia",
  "Mastologia",
  "Medicina de Emergência",
  "Medicina de Família e Comunidade",
  "Medicina do Trabalho",
  "Medicina do Tráfego",
  "Medicina Esportiva",
  "Medicina Física e Reabilitação",
  "Medicina Intensiva",
  "Medicina Legal e Perícia Médica",
  "Medicina Nuclear",
  "Medicina Preventiva e Social",
  "Nefrologia",
  "Neurocirurgia",
  "Neurologia",
  "Nutrologia",
  "Oftalmologia",
  "Oncologia Clínica",
  "Ortopedia e Traumatologia",
  "Otorrinolaringologia",
  "Patologia",
  "Patologia Clínica/Medicina Laboratorial",
  "Pediatria",
  "Pneumologia",
  "Psiquiatria",
  "Radiologia e Diagnóstico por Imagem",
  "Radioterapia",
  "Reumatologia",
  "Urologia",
];

export type CepEndereco = {
  cep: string;
  logradouro: string;
  bairro: string;
  cidade: string;
  uf: string;
};

/** Consulta o CEP no ViaCEP (público, sem chave). Retorna null se não existir. */
export async function buscarCep(cepBruto: string): Promise<CepEndereco | null> {
  const cep = cepBruto.replace(/\D/g, "");
  if (cep.length !== 8) return null;
  const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
  if (!res.ok) return null;
  const j = (await res.json()) as Record<string, string> & { erro?: boolean | string };
  if (j.erro) return null;
  return {
    cep: j["cep"] ?? "",
    logradouro: j["logradouro"] ?? "",
    bairro: j["bairro"] ?? "",
    cidade: j["localidade"] ?? "",
    uf: j["uf"] ?? "",
  };
}

/** Municípios de uma UF via API pública do IBGE. */
export async function municipiosDaUf(uf: string): Promise<string[]> {
  if (!uf) return [];
  const res = await fetch(
    `https://servicodados.ibge.gov.br/api/v1/localidades/estados/${uf}/municipios`,
  );
  if (!res.ok) return [];
  const j = (await res.json()) as Array<{ nome: string }>;
  return j.map((m) => m.nome);
}

export function formatarCep(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}
