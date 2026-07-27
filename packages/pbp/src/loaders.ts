/*
<MODULE_CONTRACT>
<purpose>Typed locale-aware loaders for all PBP entities with deep-merge language fallback (RFC-0466, RFC-0008 pattern).</purpose>
<non-goals>
  <item>Does not perform raw content parsing or validation outside of schema dispatch.</item>
  <item>Does not include UI logic or presentation-related functionality.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Established by RFC-0466 — typed locale-aware loaders for all PBP Wave 1 entities.</item>
</CHANGE_SUMMARY>
*/

import { getCollection, getEntry } from "astro:content";
import type { CollectionEntry } from "astro:content";
import { getEntryLanguage, stripEntryLanguage, toDataEntryId } from "@gogol/share/content";
import { emitPipelineLogEvent } from "@gogol/site-kernel-content";
import { pbpSchemaById } from "./schemas/index.js";
import { validateSchemaId } from "./schema-id.js";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export const PBP_DEFAULT_LANGUAGE_CODE = "de";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PbpEntry = CollectionEntry<"business-profile">;

export type PbpRepeatableEntry<TData> = {
  id: string;
  slug: string;
  data: TData;
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const entityCache = new Map<string, Promise<unknown>>();
const collectionCache = new Map<string, Promise<PbpRepeatableEntry<unknown>[]>>();

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function deepMerge<T>(base: T, overlay: Partial<T>): T {
  if (!isPlainObject(base) || !isPlainObject(overlay)) {
    return (overlay ?? base) as T;
  }
  const result: Record<string, unknown> = { ...base };
  for (const key of Object.keys(overlay)) {
    const baseVal = (base as Record<string, unknown>)[key];
    const overlayVal = (overlay as Record<string, unknown>)[key];
    if (isPlainObject(baseVal) && isPlainObject(overlayVal)) {
      result[key] = deepMerge(baseVal, overlayVal);
    } else if (overlayVal !== undefined) {
      result[key] = overlayVal;
    }
  }
  return result as T;
}

function parseEntityData(schemaId: string, data: unknown): unknown {
  const schema = pbpSchemaById[schemaId];
  if (!schema) {
    throw new Error(`Unknown PBP schema ID "${schemaId}". No Zod schema registered.`);
  }
  return schema.parse(data);
}

// ---------------------------------------------------------------------------
// Singleton loaders (business, legal-identity, brand)
// ---------------------------------------------------------------------------

async function loadSingleton<T>(
  entityType: string,
  languageCode: string,
  cacheKey: string,
): Promise<T> {
  const cached = entityCache.get(cacheKey);
  if (cached) return cached as Promise<T>;

  const promise = (async () => {
    const schemaId = Object.keys(pbpSchemaById).find(
      (id) => validateSchemaId(id).entity === entityType,
    );
    if (!schemaId) {
      throw new Error(`No schema registered for entity type "${entityType}".`);
    }

    const defaultId = toDataEntryId(`${entityType}.${PBP_DEFAULT_LANGUAGE_CODE}`);
    const localizedId = toDataEntryId(`${entityType}.${languageCode}`);

    let defaultEntry: PbpEntry | undefined;
    let localizedEntry: PbpEntry | undefined;

    try {
      defaultEntry = await getEntry("business-profile", defaultId);
    } catch {
      // default may not exist
    }

    if (languageCode !== PBP_DEFAULT_LANGUAGE_CODE) {
      try {
        localizedEntry = await getEntry("business-profile", localizedId);
      } catch {
        // localized may not exist — fallback to default
      }
    }

    if (!defaultEntry && !localizedEntry) {
      throw new Error(
        `PBP content directory not found at src/content/business-profile/. Create PBP content files first (RFC-0468).`,
      );
    }

    const baseData = defaultEntry?.data ?? {};
    const overlayData = localizedEntry?.data ?? {};
    const merged = deepMerge(baseData, overlayData);

    return parseEntityData(schemaId, merged) as T;
  })();

  entityCache.set(cacheKey, promise);
  return promise;
}

// ---------------------------------------------------------------------------
// Repeatable loaders (places, contact-points, products, offerings, etc.)
// ---------------------------------------------------------------------------

async function loadRepeatable<T>(
  entityType: string,
  languageCode: string,
  cacheKey: string,
): Promise<PbpRepeatableEntry<T>[]> {
  const cached = collectionCache.get(cacheKey);
  if (cached) return cached as Promise<PbpRepeatableEntry<T>[]>;

  const promise = (async () => {
    const schemaId = Object.keys(pbpSchemaById).find(
      (id) => validateSchemaId(id).entity === entityType,
    );
    if (!schemaId) {
      throw new Error(`No schema registered for entity type "${entityType}".`);
    }

    const entries = await getCollection("business-profile");
    const filtered = entries.filter((entry: PbpEntry) => {
      const lang = getEntryLanguage(entry.id);
      return lang === languageCode || lang === PBP_DEFAULT_LANGUAGE_CODE;
    });

    const bySlug = new Map<string, { base?: PbpEntry; overlay?: PbpEntry }>();

    for (const entry of filtered) {
      const lang = getEntryLanguage(entry.id);
      const slug = stripEntryLanguage(entry.id);
      if (!bySlug.has(slug)) bySlug.set(slug, {});
      const slot = bySlug.get(slug)!;
      if (lang === PBP_DEFAULT_LANGUAGE_CODE) slot.base = entry;
      else if (lang === languageCode) slot.overlay = entry;
    }

    const result: PbpRepeatableEntry<T>[] = [];
    for (const [slug, { base, overlay }] of bySlug) {
      if (!base && !overlay) continue;
      const baseData = base?.data ?? {};
      const overlayData = overlay?.data ?? {};
      const merged = deepMerge(baseData, overlayData);
      const parsed = parseEntityData(schemaId, merged) as T;
      result.push({
        id: toDataEntryId(slug),
        slug,
        data: parsed,
      });
    }

    return result;
  })();

  collectionCache.set(cacheKey, promise);
  return promise as Promise<PbpRepeatableEntry<T>[]>;
}

// ---------------------------------------------------------------------------
// Public loader functions
// ---------------------------------------------------------------------------

export async function getPbpBusiness(languageCode = PBP_DEFAULT_LANGUAGE_CODE) {
  return loadSingleton<unknown>("business", languageCode, `business:${languageCode}`);
}

export async function getPbpLegalIdentity(languageCode = PBP_DEFAULT_LANGUAGE_CODE) {
  return loadSingleton<unknown>("legal-identity", languageCode, `legal-identity:${languageCode}`);
}

export async function getPbpBrand(languageCode = PBP_DEFAULT_LANGUAGE_CODE) {
  return loadSingleton<unknown>("brand", languageCode, `brand:${languageCode}`);
}

export async function getPbpPlaces(languageCode = PBP_DEFAULT_LANGUAGE_CODE) {
  return loadRepeatable<unknown>("place", languageCode, `place:${languageCode}`);
}

export async function getPbpContactPoints(languageCode = PBP_DEFAULT_LANGUAGE_CODE) {
  return loadRepeatable<unknown>("contact-point", languageCode, `contact-point:${languageCode}`);
}

export async function getPbpWebPresences(languageCode = PBP_DEFAULT_LANGUAGE_CODE) {
  return loadRepeatable<unknown>("web-presence", languageCode, `web-presence:${languageCode}`);
}

export async function getPbpProducts(languageCode = PBP_DEFAULT_LANGUAGE_CODE) {
  return loadRepeatable<unknown>("product", languageCode, `product:${languageCode}`);
}

export async function getPbpProductGroups(languageCode = PBP_DEFAULT_LANGUAGE_CODE) {
  return loadRepeatable<unknown>("product-group", languageCode, `product-group:${languageCode}`);
}

export async function getPbpProductVariants(languageCode = PBP_DEFAULT_LANGUAGE_CODE) {
  return loadRepeatable<unknown>(
    "product-variant",
    languageCode,
    `product-variant:${languageCode}`,
  );
}

export async function getPbpCatalog(languageCode = PBP_DEFAULT_LANGUAGE_CODE) {
  return loadSingleton<unknown>("catalog", languageCode, `catalog:${languageCode}`);
}

export async function getPbpCatalogEntries(languageCode = PBP_DEFAULT_LANGUAGE_CODE) {
  return loadRepeatable<unknown>("catalog-entry", languageCode, `catalog-entry:${languageCode}`);
}

export async function getPbpOfferings(languageCode = PBP_DEFAULT_LANGUAGE_CODE) {
  return loadRepeatable<unknown>("offering", languageCode, `offering:${languageCode}`);
}

export async function getPbpPolicies(languageCode = PBP_DEFAULT_LANGUAGE_CODE) {
  return loadRepeatable<unknown>("policy", languageCode, `policy:${languageCode}`);
}

export async function getPbpSlaPolicies(languageCode = PBP_DEFAULT_LANGUAGE_CODE) {
  return loadRepeatable<unknown>("sla-policy", languageCode, `sla-policy:${languageCode}`);
}

export async function getPbpGuaranteePolicies(languageCode = PBP_DEFAULT_LANGUAGE_CODE) {
  return loadRepeatable<unknown>(
    "guarantee-policy",
    languageCode,
    `guarantee-policy:${languageCode}`,
  );
}

export async function getPbpOwnershipPolicies(languageCode = PBP_DEFAULT_LANGUAGE_CODE) {
  return loadRepeatable<unknown>(
    "ownership-policy",
    languageCode,
    `ownership-policy:${languageCode}`,
  );
}

export async function getPbpExitPolicies(languageCode = PBP_DEFAULT_LANGUAGE_CODE) {
  return loadRepeatable<unknown>("exit-policy", languageCode, `exit-policy:${languageCode}`);
}

export async function getPbpDataRetentionPolicies(languageCode = PBP_DEFAULT_LANGUAGE_CODE) {
  return loadRepeatable<unknown>(
    "data-retention-policy",
    languageCode,
    `data-retention-policy:${languageCode}`,
  );
}

export async function getPbpClaims(languageCode = PBP_DEFAULT_LANGUAGE_CODE) {
  return loadRepeatable<unknown>("claim", languageCode, `claim:${languageCode}`);
}

export async function getPbpEvidenceSources(languageCode = PBP_DEFAULT_LANGUAGE_CODE) {
  return loadRepeatable<unknown>(
    "evidence-source",
    languageCode,
    `evidence-source:${languageCode}`,
  );
}

export async function getPbpDisclosures(languageCode = PBP_DEFAULT_LANGUAGE_CODE) {
  return loadRepeatable<unknown>("disclosure", languageCode, `disclosure:${languageCode}`);
}

export async function getPbpPublicDocuments(languageCode = PBP_DEFAULT_LANGUAGE_CODE) {
  return loadRepeatable<unknown>(
    "public-document",
    languageCode,
    `public-document:${languageCode}`,
  );
}

export async function getPbpCategories(languageCode = PBP_DEFAULT_LANGUAGE_CODE) {
  return loadRepeatable<unknown>("category", languageCode, `category:${languageCode}`);
}
