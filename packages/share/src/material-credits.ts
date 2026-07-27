/*
<MODULE_CONTRACT>
<purpose>
  RFC-0220 Material Credits helpers shared by UI and Site OS commands. Parses sidecar
  YAML records, resolves localized/default-language fallback, and builds simple
  schema.org CreativeWork-style payloads from the same structured source.
</purpose>
<non-goals>
  <item>Do not scan the filesystem; callers supply raw sidecar maps.</item>
  <item>Do not render UI; @warpgogol/ui owns presentation.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0220: initial helper surface for material credit sidecars.</item>
  <item>RFC-0227: buildMaterialCreditJsonLd emits @id for page-graph linking.</item>
</CHANGE_SUMMARY>
*/

import { parse as parseYaml } from "yaml";
import {
  type MaterialCredit,
  type MaterialCreditLabels,
  type MaterialKind,
  type MaterialTarget,
  type MaterialSourceType,
  type MaterialCreditStatus,
  type UsageBasisType,
  materialCreditSchema,
  materialTargetKey,
  formatMaterialCreditLine,
  labelForSourceType,
  labelForStatus,
  labelForUsageBasis,
} from "./schemas/material-credit.ts";

// RFC-0488: re-export label mapping helpers for @warpgogol/share/material-credits consumers.
export {
  labelForSourceType,
  labelForStatus,
  labelForUsageBasis,
} from "./schemas/material-credit.ts";
export type {
  MaterialSourceType,
  MaterialCreditStatus,
  UsageBasisType,
} from "./schemas/material-credit.ts";

export interface MaterialCreditRecord {
  file: string;
  lang?: string;
  credit: MaterialCredit;
}

export type RawMaterialCreditMap = Record<string, string | { default?: string }>;

function rawToString(raw: string | { default?: string }): string {
  return typeof raw === "string" ? raw : (raw.default ?? "");
}

export function langFromCreditPath(path: string): string | undefined {
  const match = path.match(/\/src\/content\/[^/]+\/([^/]+)\//);
  if (!match) return undefined;
  const segment = match[1];
  // RFC-0220: language-agnostic asset folders (surface/assets/, shared/assets/)
  // carry no lang segment; the sidecar itself is the canonical record.
  return segment === "assets" || segment === "media" ? undefined : segment;
}

export function parseMaterialCreditMap(rawMap: RawMaterialCreditMap): MaterialCreditRecord[] {
  const records: MaterialCreditRecord[] = [];
  for (const [file, raw] of Object.entries(rawMap)) {
    const parsed = parseYaml(rawToString(raw));
    const credit = materialCreditSchema.parse(parsed);
    records.push({ file, lang: langFromCreditPath(file), credit });
  }
  return records;
}

export function findMaterialCredit(
  records: MaterialCreditRecord[],
  target: MaterialTarget,
  lang: string,
  defaultLang: string,
): MaterialCredit | null {
  const candidates = lang === defaultLang ? [lang, undefined] : [lang, defaultLang, undefined];
  for (const candidateLang of candidates) {
    const key = materialTargetKey(target, candidateLang);
    const record = records.find((item) => {
      const recordLang = item.credit.target.lang ?? item.lang;
      return materialTargetKey(item.credit.target, recordLang) === key;
    });
    if (record) return record.credit;
  }
  return null;
}

export function creditByTarget(
  rawMap: RawMaterialCreditMap,
  target: MaterialTarget,
  lang: string,
  defaultLang: string,
): MaterialCredit | null {
  return findMaterialCredit(parseMaterialCreditMap(rawMap), target, lang, defaultLang);
}

export function schemaTypeForMaterial(
  kind: MaterialKind,
): "ImageObject" | "VideoObject" | "CreativeWork" {
  if (kind === "image") return "ImageObject";
  if (kind === "video") return "VideoObject";
  return "CreativeWork";
}

/**
 * RFC-0227: stable @id for a material credit node, derived from the content URL.
 * Used by both the disclosure <script> and any page-graph associatedMedia reference.
 */
export function materialCreditAtId(contentUrl?: string, targetId?: string): string | undefined {
  const base = contentUrl ?? (targetId ? `urn:material:${targetId}` : undefined);
  return base ? `${base}#material` : undefined;
}

export function buildMaterialCreditJsonLd(
  credit: MaterialCredit,
  contentUrl?: string,
  labels?: MaterialCreditLabels,
): Record<string, unknown> {
  const creators = credit.parties.filter(
    (party) => party.role === "creator" || party.role === "coCreator",
  );
  const creator =
    creators.length === 1
      ? {
          "@type": creators[0].kind === "Organization" ? "Organization" : "Person",
          name: creators[0].name,
          url: creators[0].url,
        }
      : creators.map((party) => ({
          "@type": party.kind === "Organization" ? "Organization" : "Person",
          name: party.name,
          ...(party.url ? { url: party.url } : {}),
        }));

  const copyrightHolder = resolveCopyrightHolder(credit);
  const copyrightYear =
    credit.license.copyrightYear ?? copyrightYearFromNotice(credit.license.copyrightNotice);
  // RFC-0227: stable @id for page-graph linking.
  const atId = materialCreditAtId(contentUrl, credit.target.id);

  return {
    "@type": schemaTypeForMaterial(credit.target.kind),
    ...(atId ? { "@id": atId } : {}),
    ...(contentUrl ? { contentUrl } : {}),
    name: credit.title ?? credit.target.id,
    ...(labels ? { creditText: formatMaterialCreditLine(credit, labels) } : {}),
    creator,
    ...(copyrightHolder ? { copyrightHolder } : {}),
    ...(copyrightYear ? { copyrightYear } : {}),
    ...(credit.license.copyrightNotice ? { copyrightNotice: credit.license.copyrightNotice } : {}),
    // RFC-0223: only emit a URL as schema.org license; the human label stays in creditText.
    ...(credit.license.url ? { license: credit.license.url } : {}),
    ...(credit.license.acquireLicensePage
      ? { acquireLicensePage: credit.license.acquireLicensePage }
      : {}),
    ...(credit.createdAt ? { dateCreated: credit.createdAt } : {}),
  };
}

function copyrightYearFromNotice(notice?: string): number | undefined {
  const match = notice?.match(/\b(\d{4})\b/);
  return match ? Number(match[1]) : undefined;
}

function resolveCopyrightHolder(credit: MaterialCredit): Record<string, unknown> | undefined {
  const holder = credit.parties.find((party) => party.role === "rightsHolder");
  if (holder) {
    return {
      "@type": holder.kind === "Person" ? "Person" : "Organization",
      name: holder.name,
      ...(holder.url ? { url: holder.url } : {}),
    };
  }
  const fromNotice = credit.license.copyrightNotice
    ?.match(/©\s*\d{0,4}\s*([^.]+?)\.?\s*(?:All rights|$)/i)?.[1]
    ?.trim();
  return fromNotice ? { "@type": "Organization", name: fromNotice } : undefined;
}
