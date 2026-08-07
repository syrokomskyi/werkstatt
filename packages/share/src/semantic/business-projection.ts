/*
<MODULE_CONTRACT>
<purpose>RFC-0148: pure projectors that map canonical business-schema data into the semantic model, plus the projection visibility boundary. Framework-agnostic and side-effect-free, so the disk llms path and the Astro JSON-LD path project every business file identically. Lives in @warpgogol/share (not @warpgogol/pbp) because @warpgogol/pbp depends on @warpgogol/site-kernel-content — placing the projectors here keeps the node disk loader cycle-free.</purpose>
<non-goals>
  <item>Do not read files — pure mapping over already-loaded data.</item>
  <item>Do not project privacy-sensitive domains (external-services, compliance).</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0148: initial projection registry — offer + location projectors and the visibility boundary.</item>
  <item>RFC-0287: added projectWeb for the Agent Surface knowledge tier.</item>
  <item>RFC-0373: added projectServices for business service catalog projection.</item>
</CHANGE_SUMMARY>
*/

import type {
  SemanticOffer,
  SemanticLocation,
  SemanticPerson,
  SemanticService,
  SemanticWeb,
} from "./models.ts";

/**
 * RFC-0148 privacy boundary. `public` projects to AI (llms) + JSON-LD; `pageMeta`
 * is build-time only (e.g. legal-page dates → sitemap lastmod); `none` is never
 * projected to any public output. `externalServices` (vendor names/addresses)
 * and `compliance` (internal GoBD dates) are deliberately `none`.
 */
export const BUSINESS_DOMAIN_VISIBILITY = {
  company: "public",
  legal: "public",
  contact: "public",
  offer: "public",
  service: "public",
  location: "public",
  web: "public",
  people: "public",
  trust: "public",
  faq: "public",
  meta: "pageMeta",
  compliance: "none",
  externalServices: "none",
} as const;

export type BusinessDomain = keyof typeof BUSINESS_DOMAIN_VISIBILITY;
export type BusinessVisibility = (typeof BUSINESS_DOMAIN_VISIBILITY)[BusinessDomain];

const PRICE_LABELS: ReadonlyArray<readonly [string, string]> = [
  ["monthly", "Monthly"],
  ["yearly", "Yearly"],
  ["setup", "Setup"],
];

/** RFC-0147/RFC-0148: project the canonical offer (price + guarantees + growth modules + terms). */
export function projectOffer(data: Record<string, unknown> | undefined): SemanticOffer | undefined {
  if (!data) return undefined;

  const price = (data["price"] ?? {}) as Record<string, unknown>;
  const currency = typeof data["currency"] === "string" ? (data["currency"] as string) : undefined;
  const prices = PRICE_LABELS.filter(
    ([key]) => typeof price[key] === "string" && (price[key] as string).length > 0,
  ).map(([key, label]) => ({
    id: key,
    label,
    amount: price[key] as string,
    ...(currency ? { currency } : {}),
  }));

  const rawGuarantees = (data["guarantees"] ?? {}) as Record<
    string,
    { label?: string; detail?: string } | undefined
  >;
  const guarantees = Object.entries(rawGuarantees)
    .filter(([, g]) => g && typeof g.label === "string" && g.label.length > 0)
    .map(([id, g]) => ({
      id,
      label: g!.label as string,
      ...(g!.detail ? { detail: g!.detail } : {}),
    }));

  const rawGrowthModules = (data["growthModules"] ?? {}) as Record<
    string,
    { label?: string; description?: string; price?: string } | undefined
  >;
  const growthModules = Object.entries(rawGrowthModules)
    .filter(([, m]) => m && typeof m.label === "string" && m.label.length > 0)
    .map(([id, m]) => ({
      id,
      label: m!.label as string,
      ...(m!.description ? { description: m!.description } : {}),
      ...(m!.price ? { price: m!.price } : {}),
    }));

  const changePrice = typeof data["changePrice"] === "string" ? data["changePrice"] : undefined;
  const hourlyRate = typeof data["hourlyRate"] === "string" ? data["hourlyRate"] : undefined;
  const billingDay = typeof data["billingDay"] === "string" ? data["billingDay"] : undefined;
  const rawCapacity = data["capacity"] as Record<string, unknown> | undefined;
  const rawSlotRange = rawCapacity?.["slotRange"] as Record<string, unknown> | undefined;
  const capacity =
    rawCapacity &&
    rawCapacity["enabled"] === true &&
    typeof rawCapacity["timezone"] === "string" &&
    typeof rawCapacity["startsAt"] === "string" &&
    (rawCapacity["cadence"] === "monthly" || rawCapacity["cadence"] === "fixed-days") &&
    typeof rawSlotRange?.["min"] === "number" &&
    typeof rawSlotRange?.["max"] === "number" &&
    typeof rawCapacity["maxSlotsPerWave"] === "number"
      ? {
          enabled: true,
          timezone: rawCapacity["timezone"],
          startsAt: rawCapacity["startsAt"],
          cadence: rawCapacity["cadence"] as "monthly" | "fixed-days",
          ...(typeof rawCapacity["cadenceDays"] === "number"
            ? { cadenceDays: rawCapacity["cadenceDays"] }
            : {}),
          slotRange: { min: rawSlotRange["min"], max: rawSlotRange["max"] },
          maxSlotsPerWave: rawCapacity["maxSlotsPerWave"],
          availabilityStatus: "unknown" as const,
        }
      : undefined;

  if (
    prices.length === 0 &&
    guarantees.length === 0 &&
    growthModules.length === 0 &&
    !capacity &&
    !changePrice &&
    !hourlyRate &&
    !billingDay
  )
    return undefined;

  return {
    ...(prices.length ? { prices } : {}),
    ...(guarantees.length ? { guarantees } : {}),
    ...(growthModules.length ? { growthModules } : {}),
    ...(capacity ? { capacity } : {}),
    ...(changePrice ? { changePrice } : {}),
    ...(hourlyRate ? { hourlyRate } : {}),
    ...(billingDay ? { billingDay } : {}),
  };
}

/** RFC-0200: project canonical Person records into SemanticPerson[]. Bio becomes
 * the person description; `lifespan.died` drives `isDeceased` + `deathDate`;
 * `affiliations`/`sameAs` are carried for governance derivation + entity grounding.
 * Records without a name are dropped. Order preserved (loaders pre-sort by `order`). */
export function projectPeople(
  records: ReadonlyArray<Record<string, unknown>> | undefined,
): SemanticPerson[] {
  if (!records?.length) return [];
  const people: SemanticPerson[] = [];
  for (const r of records) {
    const name = typeof r["name"] === "string" ? (r["name"] as string).trim() : "";
    if (!name) continue;
    const bio = typeof r["bio"] === "string" ? (r["bio"] as string).trim() : "";
    const role = typeof r["role"] === "string" ? (r["role"] as string).trim() : "";
    const affiliations = Array.isArray(r["affiliations"])
      ? (r["affiliations"] as unknown[]).filter((a): a is string => typeof a === "string")
      : [];
    const sameAs = Array.isArray(r["sameAs"])
      ? (r["sameAs"] as unknown[]).filter((s): s is string => typeof s === "string")
      : [];
    const lifespan = (r["lifespan"] ?? undefined) as Record<string, unknown> | undefined;
    const born = lifespan?.["born"];
    const died = lifespan?.["died"];

    /* RFC-0512: map location string ("City, Region") → SemanticPerson.address. */
    const locationRaw = typeof r["location"] === "string" ? (r["location"] as string).trim() : "";
    let address: SemanticPerson["address"] | undefined;
    if (locationRaw) {
      const parts = locationRaw.split(",").map((s) => s.trim());
      address = {
        addressLocality: parts[0] ?? "",
        ...(parts[1] ? { addressRegion: parts[1] } : {}),
        addressCountry: "DE",
      };
    }

    /* RFC-0512: map capabilities → SemanticPerson.knowsAbout. */
    const capabilities = Array.isArray(r["capabilities"])
      ? (r["capabilities"] as unknown[]).filter((c): c is string => typeof c === "string")
      : [];

    /* RFC-0512: map organization name → SemanticPerson.affiliation. */
    const orgName =
      typeof r["organizationName"] === "string" ? (r["organizationName"] as string).trim() : "";

    people.push({
      name,
      ...(role ? { role } : {}),
      ...(bio ? { description: bio } : {}),
      ...(affiliations.length ? { affiliations } : {}),
      ...(born != null ? { birthDate: String(born) } : {}),
      ...(died != null ? { deathDate: String(died), isDeceased: true } : {}),
      ...(sameAs.length ? { sameAs } : {}),
      ...(address ? { address } : {}),
      ...(capabilities.length ? { knowsAbout: capabilities } : {}),
      ...(orgName ? { affiliation: { name: orgName } } : {}),
    });
  }
  return people;
}

/** RFC-0148: project location (NAP locality/region/country + service area). */
export function projectLocation(
  data: Record<string, unknown> | undefined,
): SemanticLocation | undefined {
  if (!data) return undefined;

  const place = (key: string): string | undefined => {
    const node = data[key] as { name?: unknown } | undefined;
    return typeof node?.name === "string" && node.name.length > 0 ? node.name : undefined;
  };

  const locality = place("city");
  const region = place("region");
  const country = place("country");
  const serviceAreaRaw = data["serviceArea"];
  const serviceArea = Array.isArray(serviceAreaRaw)
    ? serviceAreaRaw.filter((s): s is string => typeof s === "string" && s.length > 0)
    : undefined;

  if (!locality && !region && !country && !(serviceArea && serviceArea.length)) return undefined;
  return {
    ...(locality ? { locality } : {}),
    ...(region ? { region } : {}),
    ...(country ? { country } : {}),
    ...(serviceArea && serviceArea.length ? { serviceArea } : {}),
  };
}

/** RFC-0373: project business service catalog entries into SemanticService[].
 * Records without a name are dropped. Order preserved (loaders pre-sort by `order`). */
export function projectServices(
  records: ReadonlyArray<Record<string, unknown>> | undefined,
): SemanticService[] {
  if (!records?.length) return [];
  const services: SemanticService[] = [];
  for (const r of records) {
    const name = typeof r["name"] === "string" ? (r["name"] as string).trim() : "";
    if (!name) continue;
    const slug = typeof r["slug"] === "string" ? (r["slug"] as string) : "";
    const description =
      typeof r["description"] === "string" ? (r["description"] as string).trim() : "";
    services.push({
      id: slug || name,
      name,
      ...(description ? { description } : {}),
    });
  }
  return services;
}

/**
 * RFC-0287: project the business web/domain identity record (business/{lang}/web.md
 * — primaryUrl, statusUrl, domains.{primary,german}). A thin, faithful passthrough of
 * an already-validated, stable cross-app shape — not a generic business-file dump.
 */
export function projectWeb(data: Record<string, unknown> | undefined): SemanticWeb | undefined {
  if (!data) return undefined;

  const primaryUrl = typeof data["primaryUrl"] === "string" ? data["primaryUrl"] : undefined;
  const statusUrl = typeof data["statusUrl"] === "string" ? data["statusUrl"] : undefined;
  const domainsRaw = (data["domains"] ?? {}) as Record<string, unknown>;
  const primary = typeof domainsRaw["primary"] === "string" ? domainsRaw["primary"] : undefined;
  const german = typeof domainsRaw["german"] === "string" ? domainsRaw["german"] : undefined;

  if (!primaryUrl && !statusUrl && !primary && !german) return undefined;
  return {
    ...(primaryUrl ? { primaryUrl } : {}),
    ...(statusUrl ? { statusUrl } : {}),
    ...(primary || german
      ? { domains: { ...(primary ? { primary } : {}), ...(german ? { german } : {}) } }
      : {}),
  };
}
