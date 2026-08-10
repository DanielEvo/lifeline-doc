// Server functions da bancada de prescrição: catálogo local do médico +
// colheita de IDs reais da Memed. Chaves da Memed só existem aqui no servidor.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireDoctor } from "../auth.server";
import {
  listCatalog,
  upsertEntry,
  type CatalogEntry,
} from "../memed-catalog.server";
import { getMemedSandboxToken, isMemedConfigured, memedFetch } from "../memed.server";

const token = z.string().min(1);
const UNAUTH = { ok: false as const, error: "unauthorized" as const };

const MEMED_API_BASE = () =>
  process.env["MEMED_API_URL"] || "https://integrations.api.memed.com.br/v1";

export const listMyMemedCatalog = createServerFn({ method: "POST" })
  .inputValidator(z.object({ token }))
  .handler(async ({ data }) => {
    const doctor = await requireDoctor(data.token);
    if (!doctor) return UNAUTH;
    const itens: CatalogEntry[] = await listCatalog(doctor.id);
    return { ok: true as const, itens };
  });

function tipoFromMemedId(id: string): CatalogEntry["tipo"] {
  const p = id.trim().charAt(0).toLowerCase();
  if (p === "a") return "med";
  if (p === "e") return "exame";
  if (p === "f") return "formula";
  return "livre";
}

export const harvestMemedProtocolIds = createServerFn({ method: "POST" })
  .inputValidator(z.object({ token }))
  .handler(async ({ data }) => {
    const doctor = await requireDoctor(data.token);
    if (!doctor) return UNAUTH;
    if (!isMemedConfigured()) return { ok: false as const, error: "not_configured" as const };

    const prescriber = await getMemedSandboxToken();
    if (!prescriber.ok) {
      return { ok: false as const, error: prescriber.error, detail: prescriber.detail };
    }

    try {
      // fetch() cru aqui não tinha timeout — se o endpoint de protocolos da
      // Memed travar (ambiente de homologação documentado como instável),
      // essa chamada ficava pendurada pra sempre e o botão "Colher IDs"
      // nunca saía do estado de loading. memedFetch já tem timeout de 8s +
      // 1 retry, mesmo tratamento usado nas outras chamadas à Memed.
      const res = await memedFetch(
        `${MEMED_API_BASE()}/protocolos?token=${encodeURIComponent(prescriber.token)}`,
        { headers: { Accept: "application/vnd.api+json" } },
      );
      const json = (await res.json().catch(() => null)) as any;
      if (!res.ok) {
        return {
          ok: false as const,
          error: "memed_error" as const,
          detail: JSON.stringify(json)?.slice(0, 300),
        };
      }
      const protocolos: any[] = Array.isArray(json?.data) ? json.data : [];
      let colhidos = 0;
      for (const p of protocolos) {
        const meds: any[] = p?.attributes?.medicamentos ?? [];
        for (const m of meds) {
          const memedId = m?.id ? String(m.id) : null;
          if (!memedId) continue;
          const nome = String(m?.nome ?? m?.name ?? memedId);
          await upsertEntry(doctor.id, {
            memedId,
            nome,
            tipo: tipoFromMemedId(memedId),
            via: m?.via ? String(m.via) : null,
            posologiaPadrao: m?.posologia ? String(m.posologia) : null,
            origem: "colhido",
          });
          colhidos += 1;
        }
      }
      return { ok: true as const, colhidos };
    } catch (e) {
      return { ok: false as const, error: "memed_error" as const, detail: String(e) };
    }
  });

export const searchMemedIngredients = createServerFn({ method: "POST" })
  .inputValidator(z.object({ token, termo: z.string().min(2).max(80) }))
  .handler(async ({ data }) => {
    const doctor = await requireDoctor(data.token);
    if (!doctor) return UNAUTH;
    if (!isMemedConfigured()) return { ok: false as const, error: "not_configured" as const };

    const apiKey = process.env["MEMED_API_KEY"]!;
    const secretKey = process.env["MEMED_SECRET_KEY"]!;
    const qs =
      `api-key=${encodeURIComponent(apiKey)}&secret-key=${encodeURIComponent(secretKey)}` +
      `&terms=${encodeURIComponent(data.termo)}&limit=10&order[field]=name&order[sort]=ASC`;

    try {
      // Mesma correção: fetch() cru sem timeout — a bancada agora chama
      // isso automaticamente pra CADA medicamento ao carregar um cenário
      // (ver carregarNoMemed em memed-simulacao.tsx). Se travar sem
      // timeout, o Promise.all de resolução de IDs nunca completa e nada
      // é adicionado ao módulo, em silêncio total.
      const res = await memedFetch(`${MEMED_API_BASE()}/drugs/ingredients?${qs}`, {
        headers: { Accept: "application/vnd.api+json" },
      });
      const json = (await res.json().catch(() => null)) as any;
      if (!res.ok) {
        return {
          ok: false as const,
          error: "memed_error" as const,
          detail: JSON.stringify(json)?.slice(0, 300),
        };
      }
      const lista = (Array.isArray(json?.data) ? json.data : []).map((d: any) => ({
        id: String(d?.id ?? ""),
        nome: String(d?.attributes?.name ?? d?.attributes?.nome ?? ""),
      }));
      return { ok: true as const, itens: lista.filter((i: { nome: string }) => i.nome) };
    } catch (e) {
      return { ok: false as const, error: "memed_error" as const, detail: String(e) };
    }
  });

export const saveMyMedication = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      token,
      nome: z.string().min(2).max(140),
      via: z.string().max(40).optional(),
      controlClass: z.string().max(10).optional(),
      posologiaPadrao: z.string().max(300).optional(),
    }),
  )
  .handler(async ({ data }) => {
    const doctor = await requireDoctor(data.token);
    if (!doctor) return UNAUTH;
    const entry = await upsertEntry(doctor.id, {
      memedId: null,
      nome: data.nome,
      tipo: "livre",
      via: data.via ?? null,
      controlClass: data.controlClass ?? null,
      posologiaPadrao: data.posologiaPadrao ?? null,
      origem: "manual",
    });
    return { ok: true as const, entry };
  });
