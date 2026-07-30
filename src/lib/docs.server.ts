// Server-only: biblioteca "Documentos" do Knowledge Base — une anexos
// enviados manualmente pelo médico e publicações curadas a partir do feed de
// descoberta (ver publications.server.ts e Seção 4.6 do documento de
// concepção). Upload real vai direto do browser pro Supabase Storage via
// signed upload URL — não passa o arquivo pelo server fn, evitando o limite
// de body de requests em produção.

import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type DocOrigin = "anexo" | "publicacao";
export type DocFormat = "pdf" | "book" | "paper";

export type Doc = {
  id: string;
  doctorId: string;
  name: string;
  origin: DocOrigin;
  format: DocFormat | null;
  storagePath: string | null;
  sizeBytes: number | null;
  sourcePublicationId: string | null;
  createdAt: string;
};

const BUCKET = "doctor-docs";

function fromRow(row: {
  id: string;
  doctor_id: string;
  name: string;
  origin: string;
  format: string | null;
  storage_path: string | null;
  size_bytes: number | null;
  source_publication_id: string | null;
  created_at: string;
}): Doc {
  return {
    id: row.id,
    doctorId: row.doctor_id,
    name: row.name,
    origin: row.origin as DocOrigin,
    format: row.format as DocFormat | null,
    storagePath: row.storage_path,
    sizeBytes: row.size_bytes,
    sourcePublicationId: row.source_publication_id,
    createdAt: row.created_at,
  };
}

export async function listDocs(doctorId: string): Promise<Doc[]> {
  const { data, error } = await supabaseAdmin
    .from("docs")
    .select("*")
    .eq("doctor_id", doctorId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Falha ao listar documentos: ${error.message}`);
  return (data ?? []).map(fromRow);
}

function sanitizeFileName(name: string): string {
  return name.replace(/[^\w.-]+/g, "_").slice(-120);
}

/** Gera uma signed upload URL de uso único — o browser sobe o arquivo direto
 *  pro bucket com essa URL/token, sem o servidor tocar nos bytes. */
export async function createUploadTarget(
  doctorId: string,
  fileName: string,
): Promise<{ signedUrl: string; uploadToken: string; path: string }> {
  const path = `${doctorId}/${randomUUID()}-${sanitizeFileName(fileName)}`;
  const { data, error } = await supabaseAdmin.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) throw new Error(`Falha ao preparar upload: ${error?.message}`);
  return { signedUrl: data.signedUrl, uploadToken: data.token, path: data.path };
}

/** Registra a linha em `docs` depois que o upload (via signed URL) já
 *  terminou no browser — o servidor nunca viu o conteúdo do arquivo. */
export async function registerAnexo(
  doctorId: string,
  input: { name: string; format: DocFormat | null; storagePath: string; sizeBytes: number | null },
): Promise<Doc> {
  const { data, error } = await supabaseAdmin
    .from("docs")
    .insert({
      doctor_id: doctorId,
      name: input.name,
      origin: "anexo",
      format: input.format,
      storage_path: input.storagePath,
      size_bytes: input.sizeBytes,
    })
    .select("*")
    .single();
  if (error || !data) throw new Error(`Falha ao registrar documento: ${error?.message}`);
  return fromRow(data);
}

/** URL para abrir/baixar um doc: signed do storage para anexo, ou a URL
 *  externa da publicação original para origin "publicacao" (nunca guardamos
 *  o PDF de uma publicação — só o abstract, Seção 4.2 do documento). */
export async function getDocOpenUrl(doctorId: string, docId: string): Promise<string | null> {
  const { data: doc, error } = await supabaseAdmin
    .from("docs")
    .select("*")
    .eq("id", docId)
    .eq("doctor_id", doctorId)
    .maybeSingle();
  if (error) throw new Error(`Falha ao buscar documento: ${error.message}`);
  if (!doc) return null;

  if (doc.origin === "anexo") {
    if (!doc.storage_path) return null;
    const { data, error: signError } = await supabaseAdmin.storage
      .from(BUCKET)
      .createSignedUrl(doc.storage_path, 60 * 5);
    if (signError || !data) throw new Error(`Falha ao assinar URL: ${signError?.message}`);
    return data.signedUrl;
  }

  if (!doc.source_publication_id) return null;
  const { data: pub } = await supabaseAdmin
    .from("publications")
    .select("url")
    .eq("id", doc.source_publication_id)
    .maybeSingle();
  return pub?.url ?? null;
}

/** Remove um doc. Se a origem for "publicacao", a publicação original não é
 *  apagada — ela volta para status "novo" (Seção 4.6, regra 3 do documento),
 *  para que o médico consiga readicioná-la depois pelo feed de descoberta. */
export async function deleteDoc(doctorId: string, docId: string): Promise<boolean> {
  const { data: doc, error } = await supabaseAdmin
    .from("docs")
    .select("*")
    .eq("id", docId)
    .eq("doctor_id", doctorId)
    .maybeSingle();
  if (error) throw new Error(`Falha ao buscar documento: ${error.message}`);
  if (!doc) return false;

  if (doc.origin === "anexo" && doc.storage_path) {
    const { error: removeError } = await supabaseAdmin.storage
      .from(BUCKET)
      .remove([doc.storage_path]);
    if (removeError)
      console.error("[docs] falha ao remover arquivo do storage:", removeError.message);
  }

  if (doc.origin === "publicacao" && doc.source_publication_id) {
    const { error: revertError } = await supabaseAdmin
      .from("publications")
      .update({ status: "novo", status_changed_at: new Date().toISOString(), linked_doc_id: null })
      .eq("id", doc.source_publication_id)
      .eq("doctor_id", doctorId);
    if (revertError) console.error("[docs] falha ao reverter publicação:", revertError.message);
  }

  const { error: deleteError, count } = await supabaseAdmin
    .from("docs")
    .delete({ count: "exact" })
    .eq("id", docId)
    .eq("doctor_id", doctorId);
  if (deleteError) throw new Error(`Falha ao remover documento: ${deleteError.message}`);
  return (count ?? 0) > 0;
}
