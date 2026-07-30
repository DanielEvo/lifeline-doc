// Server-only: descoberta de Publicações (PubMed + JAMA + NEJM), sob demanda
// via botão "Buscar agora" (sem cron/job diário nesta rodada — ver Seção 4 do
// documento de concepção e a decisão do médico de adiar a coleta automática).
// Fontes só gratuitas e oficiais (TECH-22): PubMed E-utilities (API oficial),
// JAMA/NEJM via RSS oficial. The Lancet e fontes fechadas continuam entrando
// só por upload manual em Documentos (label "Anexo").

import { XMLParser } from "fast-xml-parser";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type PublicationSource = "pubmed" | "jama" | "nejm";
export type PublicationStatus = "novo" | "adicionado" | "descartado";

export type Publication = {
  id: string;
  doctorId: string;
  source: PublicationSource;
  doi: string | null;
  title: string;
  journal: string;
  publishedAt: string | null;
  abstract: string | null;
  url: string;
  matchedTopics: string[];
  status: PublicationStatus;
  statusChangedAt: string | null;
  linkedDocId: string | null;
  createdAt: string;
};

type RawPublication = Omit<
  Publication,
  "id" | "doctorId" | "status" | "statusChangedAt" | "linkedDocId" | "createdAt"
>;

function fromRow(row: {
  id: string;
  doctor_id: string;
  source: string;
  doi: string | null;
  title: string;
  journal: string;
  published_at: string | null;
  abstract: string | null;
  url: string;
  matched_topics: string[];
  status: string;
  status_changed_at: string | null;
  linked_doc_id: string | null;
  created_at: string;
}): Publication {
  return {
    id: row.id,
    doctorId: row.doctor_id,
    source: row.source as PublicationSource,
    doi: row.doi,
    title: row.title,
    journal: row.journal,
    publishedAt: row.published_at,
    abstract: row.abstract,
    url: row.url,
    matchedTopics: row.matched_topics ?? [],
    status: row.status as PublicationStatus,
    statusChangedAt: row.status_changed_at,
    linkedDocId: row.linked_doc_id,
    createdAt: row.created_at,
  };
}

function normalize(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Mn}/gu, "");
}

function matchedTopicsIn(text: string, topics: string[]): string[] {
  const normalizedText = normalize(text);
  return topics.filter((t) => normalizedText.includes(normalize(t)));
}

// ---------------------------------------------------------------------------
// PubMed (NCBI E-utilities) — esearch para achar PMIDs, efetch (XML) para
// título/journal/data/abstract/DOI num único request estruturado.
// ---------------------------------------------------------------------------

const xmlParser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });

function asArray<T>(value: T | T[] | undefined | null): T[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function textOf(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (typeof value === "object" && "#text" in (value as Record<string, unknown>)) {
    return textOf((value as Record<string, unknown>)["#text"]);
  }
  // Título/abstract podem vir com sub-tags (itálico etc.) — junta os textos.
  if (typeof value === "object") {
    return Object.values(value as Record<string, unknown>)
      .map(textOf)
      .join(" ")
      .trim();
  }
  return "";
}

// Formas mínimas do XML que realmente lemos — o resto do documento (PubMed
// efetch / RSS) tem muito mais campos, mas só tipamos o que é consumido.
type XmlText = string | number | { "#text"?: unknown } | undefined;

type PubmedArticleXml = {
  MedlineCitation?: {
    PMID?: XmlText;
    Article?: {
      ArticleTitle?: XmlText;
      Journal?: {
        Title?: XmlText;
        JournalIssue?: {
          PubDate?: { Year?: string | number; Month?: string | number; Day?: string | number };
        };
      };
      Abstract?: { AbstractText?: XmlText | XmlText[] };
    };
  };
  PubmedData?: {
    ArticleIdList?: {
      ArticleId?:
        | { "@_IdType"?: string; "#text"?: unknown }
        | Array<{ "@_IdType"?: string; "#text"?: unknown }>;
    };
  };
};

type RssItemXml = { title?: XmlText; description?: XmlText; pubDate?: XmlText; link?: XmlText };

async function searchPubmed(topics: string[]): Promise<RawPublication[]> {
  if (topics.length === 0) return [];
  const apiKey = process.env.PUBMED_API_KEY;
  const term = topics.map((t) => `(${t}[Title/Abstract])`).join(" OR ");

  const esearchUrl = new URL("https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi");
  esearchUrl.searchParams.set("db", "pubmed");
  esearchUrl.searchParams.set("retmode", "json");
  esearchUrl.searchParams.set("retmax", "15");
  esearchUrl.searchParams.set("sort", "date");
  esearchUrl.searchParams.set("term", term);
  if (apiKey) esearchUrl.searchParams.set("api_key", apiKey);

  const esearchRes = await fetch(esearchUrl);
  if (!esearchRes.ok) throw new Error(`PubMed esearch falhou (${esearchRes.status})`);
  const esearchJson = (await esearchRes.json()) as { esearchresult?: { idlist?: string[] } };
  const ids = esearchJson.esearchresult?.idlist ?? [];
  if (ids.length === 0) return [];

  const efetchUrl = new URL("https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi");
  efetchUrl.searchParams.set("db", "pubmed");
  efetchUrl.searchParams.set("rettype", "abstract");
  efetchUrl.searchParams.set("retmode", "xml");
  efetchUrl.searchParams.set("id", ids.join(","));
  if (apiKey) efetchUrl.searchParams.set("api_key", apiKey);

  const efetchRes = await fetch(efetchUrl);
  if (!efetchRes.ok) throw new Error(`PubMed efetch falhou (${efetchRes.status})`);
  const xml = await efetchRes.text();
  const parsed = xmlParser.parse(xml) as {
    PubmedArticleSet?: { PubmedArticle?: unknown | unknown[] };
  };
  const articles = asArray(parsed.PubmedArticleSet?.PubmedArticle) as PubmedArticleXml[];

  return articles.map((article): RawPublication => {
    const citation = article.MedlineCitation ?? {};
    const pmid = textOf(citation.PMID);
    const articleData = citation.Article ?? {};
    const title = textOf(articleData.ArticleTitle) || "(sem título)";
    const journal = textOf(articleData.Journal?.Title) || "PubMed";

    const pubDate = articleData.Journal?.JournalIssue?.PubDate;
    let publishedAt: string | null = null;
    if (pubDate?.Year) {
      const month = pubDate.Month ? String(pubDate.Month).padStart(2, "0") : "01";
      const monthNum = /^\d+$/.test(month) ? month : "01"; // meses por extenso (ex: "Jan") — sem tabela de tradução, usa 01
      const day = pubDate.Day ? String(pubDate.Day).padStart(2, "0") : "01";
      publishedAt = `${pubDate.Year}-${monthNum}-${day}`;
    }

    const abstractParts = asArray(articleData.Abstract?.AbstractText);
    const abstract = abstractParts.map(textOf).filter(Boolean).join(" ") || null;

    const articleIds = asArray(article.PubmedData?.ArticleIdList?.ArticleId);
    const doiEntry = articleIds.find((a) => a?.["@_IdType"] === "doi");
    const doi = doiEntry ? textOf(doiEntry) : null;

    return {
      source: "pubmed",
      doi,
      title,
      journal,
      publishedAt,
      abstract,
      url: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
      matchedTopics: matchedTopicsIn(`${title} ${abstract ?? ""}`, topics),
    };
  });
}

// ---------------------------------------------------------------------------
// JAMA / NEJM — feeds RSS oficiais (edição atual). Sem endpoint de busca por
// tema, então o filtro por tópicos acontece aqui, em cima do RSS.
// ---------------------------------------------------------------------------

const RSS_FEEDS: Array<{ source: PublicationSource; url: string }> = [
  { source: "jama", url: "https://jamanetwork.com/rss/site_3/67.xml" },
  { source: "nejm", url: "https://www.nejm.org/action/showFeed?jc=nejm&type=etoc&feed=rss" },
];

async function fetchRssFeed(
  source: PublicationSource,
  url: string,
  topics: string[],
): Promise<RawPublication[]> {
  const res = await fetch(url, {
    headers: { Accept: "application/rss+xml, application/xml, text/xml" },
  });
  if (!res.ok) {
    console.error(`[publications] RSS ${source} falhou (${res.status})`);
    return [];
  }
  const xml = await res.text();
  const parsed = xmlParser.parse(xml) as { rss?: { channel?: { item?: unknown | unknown[] } } };
  const items = asArray(parsed.rss?.channel?.item) as RssItemXml[];

  return items
    .map((item): RawPublication => {
      const title = textOf(item.title);
      const description = textOf(item.description);
      const pubDateRaw = textOf(item.pubDate);
      const publishedAt = pubDateRaw ? new Date(pubDateRaw).toISOString().slice(0, 10) : null;
      return {
        source,
        doi: null,
        title,
        journal: source === "jama" ? "JAMA" : "NEJM",
        publishedAt,
        abstract: description || null,
        url: textOf(item.link),
        matchedTopics: matchedTopicsIn(`${title} ${description}`, topics),
      };
    })
    .filter((pub) => pub.matchedTopics.length > 0);
}

async function searchJamaNejmRss(topics: string[]): Promise<RawPublication[]> {
  if (topics.length === 0) return [];
  const results = await Promise.all(RSS_FEEDS.map((f) => fetchRssFeed(f.source, f.url, topics)));
  return results.flat();
}

// ---------------------------------------------------------------------------
// Persistência — upsert como "novo", sem duplicar nem "ressuscitar" algo já
// descartado/adicionado (o unique index cobre isso; on conflict do nothing
// preserva a linha existente e o status que o médico já deu a ela).
// ---------------------------------------------------------------------------

export async function searchPublications(
  doctorId: string,
  topics: string[],
): Promise<Publication[]> {
  const cleanTopics = topics.map((t) => t.trim()).filter(Boolean);
  if (cleanTopics.length === 0) return [];

  const [pubmed, rss] = await Promise.all([
    searchPubmed(cleanTopics).catch((err) => {
      console.error("[publications] busca PubMed falhou:", err);
      return [] as RawPublication[];
    }),
    searchJamaNejmRss(cleanTopics).catch((err) => {
      console.error("[publications] busca RSS falhou:", err);
      return [] as RawPublication[];
    }),
  ]);
  const found = [...pubmed, ...rss];

  // Dedupe em código, não via ON CONFLICT: os índices únicos são parciais
  // (WHERE doi IS NULL / IS NOT NULL) e o PostgREST não consegue casar uma
  // cláusula ON CONFLICT com índice parcial — o upsert falhava inteiro e a
  // busca voltava vazia.
  const { data: existingRows, error: existingError } = await supabaseAdmin
    .from("publications")
    .select("doi, title, source")
    .eq("doctor_id", doctorId);
  if (existingError)
    console.error("[publications] falha ao ler existentes:", existingError.message);

  const existingDois = new Set((existingRows ?? []).map((r) => r.doi).filter(Boolean));
  const existingKeys = new Set((existingRows ?? []).map((r) => `${r.title}::${r.source}`));

  const seen = new Set<string>();
  const toInsert = found.filter((p) => {
    const key = p.doi ? `doi:${p.doi}` : `t:${p.title}::${p.source}`;
    if (seen.has(key)) return false;
    seen.add(key);
    if (p.doi) return !existingDois.has(p.doi);
    return !existingKeys.has(`${p.title}::${p.source}`);
  });

  if (toInsert.length > 0) {
    const { error } = await supabaseAdmin
      .from("publications")
      .insert(toInsert.map((p) => ({ doctor_id: doctorId, ...toInsertRow(p) })));
    if (error) console.error("[publications] insert falhou:", error.message);
  }


  return listPublications(doctorId, "novo");
}

function toInsertRow(p: RawPublication) {
  return {
    source: p.source,
    doi: p.doi,
    title: p.title,
    journal: p.journal,
    published_at: p.publishedAt,
    abstract: p.abstract,
    url: p.url,
    matched_topics: p.matchedTopics,
  };
}

export async function listPublications(
  doctorId: string,
  status?: PublicationStatus,
): Promise<Publication[]> {
  let query = supabaseAdmin.from("publications").select("*").eq("doctor_id", doctorId);
  if (status) query = query.eq("status", status);
  const { data, error } = await query.order("created_at", { ascending: false });
  if (error) throw new Error(`Falha ao listar publicações: ${error.message}`);
  return (data ?? []).map(fromRow);
}

/** Adicionar (Seção 4.6): cria o Doc espelhado com origin "publicacao" e
 *  muda o status para "adicionado". */
export async function confirmarPublicacao(
  doctorId: string,
  id: string,
): Promise<Publication | undefined> {
  const { data: pub, error } = await supabaseAdmin
    .from("publications")
    .select("*")
    .eq("id", id)
    .eq("doctor_id", doctorId)
    .maybeSingle();
  if (error) throw new Error(`Falha ao buscar publicação: ${error.message}`);
  if (!pub) return undefined;

  const { data: doc, error: docError } = await supabaseAdmin
    .from("docs")
    .insert({
      doctor_id: doctorId,
      name: pub.title,
      origin: "publicacao",
      source_publication_id: pub.id,
    })
    .select("id")
    .single();
  if (docError || !doc)
    throw new Error(`Falha ao criar documento da publicação: ${docError?.message}`);

  const { data: updated, error: updateError } = await supabaseAdmin
    .from("publications")
    .update({
      status: "adicionado",
      status_changed_at: new Date().toISOString(),
      linked_doc_id: doc.id,
    })
    .eq("id", id)
    .eq("doctor_id", doctorId)
    .select("*")
    .single();
  if (updateError || !updated)
    throw new Error(`Falha ao confirmar publicação: ${updateError?.message}`);
  return fromRow(updated);
}

export async function descartarPublicacao(
  doctorId: string,
  id: string,
): Promise<Publication | undefined> {
  const { data, error } = await supabaseAdmin
    .from("publications")
    .update({ status: "descartado", status_changed_at: new Date().toISOString() })
    .eq("id", id)
    .eq("doctor_id", doctorId)
    .select("*")
    .maybeSingle();
  if (error) throw new Error(`Falha ao descartar publicação: ${error.message}`);
  return data ? fromRow(data) : undefined;
}
