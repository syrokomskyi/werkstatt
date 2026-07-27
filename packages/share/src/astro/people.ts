/*
<MODULE_CONTRACT>
<purpose>
  RFC-0508: build-time enumeration of canonical Participant records for the data-driven
  People section. Reads the `people` content collection, applies RFC-0008 default-language
  deep-merge, and returns records sorted by `order` then slug. Also resolves each
  participant's live profile-page URL (when one is registered) so the section can link
  a card to it. Mirrors articles.ts.
</purpose>
<non-goals>
  <item>Do not render — the People section owns presentation.</item>
  <item>Do not validate the Participant contract — participant.validate owns that.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0200: initial implementation.</item>
  <item>RFC-0508: renamed getPeopleForSection to getParticipantsForSection, PersonView to ParticipantView. Added participantType/visibility/status fields and filters. Re-export participantPageId.</item>
  <item>RFC-0510: extended ParticipantView with responsibility, authority, evidence, consent fields projected from merged Participant data.</item>
  <item>RFC-0511: extended ParticipantView with publicName, capabilities, and aiAgent sub-object for AI-agent profile synthesis.</item>
  <item>RFC-0512: extended ParticipantView with relationshipType, lastReviewedAt, languages, sameAs for JSON endpoint generation.</item>
</CHANGE_SUMMARY>
*/

import { getCollection } from "astro:content";
import { getEntryLanguage, stripEntryLanguage, toDataEntryId } from "../content/entity-id.ts";
import { getRouteRegistry, resolveLocalizedPagePath } from "./routes.ts";
import { participantPageId } from "./people-routes.ts";
import type { LivePhoto } from "../schemas/live-photo.ts";

export { participantPageId } from "./people-routes.ts";
/** @deprecated Use participantPageId instead. */
export { participantPageId as personPageId } from "./people-routes.ts";

/** A Participant record resolved for section rendering. */
export interface ParticipantView {
  slug: string;
  name: string;
  role?: string;
  photo?: string;
  bio?: string;
  affiliations: string[];
  location?: string;
  statement?: string;
  stats?: Array<{ label: string; value: string }>;
  cta?: { label: string; target: string };
  order?: number;
  /** RFC-0202: opt-in living-photo config for the portrait. */
  live?: LivePhoto;
  /** Resolved localized profile-page URL when a live route exists; else null. */
  profileUrl: string | null;
  /** RFC-0508: participant type discriminator. */
  participantType?: string;
  /** RFC-0508: visibility filter. */
  visibility?: string;
  /** RFC-0508: lifecycle status. */
  status?: string;
  /** RFC-0510: responsibility block data (summary, scope, pbpReferences). */
  responsibility?: {
    summary: string;
    scope?: string;
    pbpReferences?: string[];
  };
  /** RFC-0510: authority block data (canSignFor, canCommitTo, escalationRoute). */
  authority?: {
    canSignFor?: string[];
    canCommitTo?: string[];
    escalationRoute?: string;
  };
  /** RFC-0510: evidence block data (claims, disclosures). */
  evidence?: {
    claims?: Array<{ claimId: string; sourceRef: string; verifiedAt: string }>;
    disclosures?: Array<{ type: string; text: string; url?: string }>;
  };
  /** RFC-0510: consent record for profile gating. */
  consent?: {
    consentRecordId: string;
    approvedFields: string[];
    approvedMedia?: string[];
    consentDate: string;
    withdrawalRoute?: string;
    profileReviewer: string;
  };
  /** RFC-0511: canonical public name (top-level, distinct from human-specific `name`). */
  publicName?: string;
  /** RFC-0511: capability list for AI-agent participants. */
  capabilities?: string[];
  /** RFC-0511: AI-agent sub-object with autonomy, purpose, rights, accountability, technical stand. */
  aiAgent?: {
    purposeStatement: string;
    autonomyLevel: string;
    rightsMatrix?: Array<{
      action: string;
      status: string;
      dataAccess?: string;
    }>;
    accountableHumanId: string;
    escalationRoute?: string;
    technicalStand?: {
      modelFamily?: string;
      lastEvaluatedAt?: string;
      nextEvaluationAt?: string;
      agentId?: string;
      toolsetVersion?: string;
    };
    knownLimitations?: string[];
  };
  /** RFC-0508: relationship type (founder, board, team, etc.). */
  relationshipType?: string;
  /** RFC-0513: last review date for lifecycle tracking. */
  lastReviewedAt?: string;
  /** RFC-0508: languages spoken by the participant. */
  languages?: string[];
  /** RFC-0200: social/profile URLs for entity grounding. */
  sameAs?: string[];
}

/** @deprecated Use ParticipantView instead. */
export type PersonView = ParticipantView;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** RFC-0008 deep-merge: override wins; arrays/scalars replaced wholesale. */
function deepMerge<T>(base: T, override: unknown): T {
  if (override == null) return base;
  if (!isPlainObject(base) || !isPlainObject(override)) return override as T;
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(override)) {
    if (v === undefined) continue;
    out[k] = isPlainObject(out[k]) && isPlainObject(v) ? deepMerge(out[k], v) : v;
  }
  return out as T;
}

/**
 * Return all canonical Participant records for `lang`, RFC-0008-merged onto the
 * default-language anchor and sorted by `order` then slug. Each record carries a
 * resolved `profileUrl` when a live profile route exists for that language.
 * RFC-0508: filters to `visibility: public` by default.
 */
export async function getParticipantsForSection(lang: string): Promise<ParticipantView[]> {
  const { defaultLanguage, byPageId } = await getRouteRegistry();

  const entries = await getCollection("people");
  const peopleEntries = entries;

  // Group by schema-id (<slug>) → { de?: data, <lang>?: data }
  const bySchemaId = new Map<
    string,
    { fallback?: Record<string, unknown>; localized?: Record<string, unknown> }
  >();
  for (const entry of peopleEntries) {
    const entryLang = getEntryLanguage(entry.id) ?? defaultLanguage;
    const schemaId = stripEntryLanguage(toDataEntryId(entry.id));
    const slot = bySchemaId.get(schemaId) ?? {};
    if (entryLang === defaultLanguage) slot.fallback = entry.data as Record<string, unknown>;
    if (entryLang === lang) slot.localized = entry.data as Record<string, unknown>;
    bySchemaId.set(schemaId, slot);
  }

  const views: ParticipantView[] = [];
  for (const [schemaId, slot] of bySchemaId) {
    if (!slot.fallback) continue; // default-language anchor required (RFC-0008)
    const merged =
      lang === defaultLanguage ? slot.fallback : deepMerge(slot.fallback, slot.localized);
    const slug = typeof merged["slug"] === "string" ? (merged["slug"] as string) : schemaId;

    // RFC-0508: filter out private participants from public section rendering
    const visibility = typeof merged["visibility"] === "string" ? merged["visibility"] : undefined;
    if (visibility === "private") continue;

    const hasRoute = byPageId.has(participantPageId(slug));
    const profileUrl = hasRoute
      ? await resolveLocalizedPagePath(participantPageId(slug), lang)
      : null;

    views.push({
      slug,
      name: String(merged["name"] ?? ""),
      role: typeof merged["role"] === "string" ? (merged["role"] as string) : undefined,
      photo: typeof merged["photo"] === "string" ? (merged["photo"] as string) : undefined,
      bio: typeof merged["bio"] === "string" ? (merged["bio"] as string) : undefined,
      affiliations: Array.isArray(merged["affiliations"])
        ? (merged["affiliations"] as unknown[]).filter((a): a is string => typeof a === "string")
        : [],
      location: typeof merged["location"] === "string" ? (merged["location"] as string) : undefined,
      statement:
        typeof merged["statement"] === "string" ? (merged["statement"] as string) : undefined,
      stats: Array.isArray(merged["stats"])
        ? (merged["stats"] as ParticipantView["stats"])
        : undefined,
      cta: isPlainObject(merged["cta"]) ? (merged["cta"] as ParticipantView["cta"]) : undefined,
      order: typeof merged["order"] === "number" ? (merged["order"] as number) : undefined,
      live: isPlainObject(merged["live"]) ? (merged["live"] as LivePhoto) : undefined,
      profileUrl,
      participantType:
        typeof merged["participantType"] === "string" ? merged["participantType"] : undefined,
      visibility: typeof visibility === "string" ? visibility : undefined,
      status: typeof merged["status"] === "string" ? merged["status"] : undefined,
      responsibility: isPlainObject(merged["responsibility"])
        ? (merged["responsibility"] as ParticipantView["responsibility"])
        : undefined,
      authority: isPlainObject(merged["authority"])
        ? (merged["authority"] as ParticipantView["authority"])
        : undefined,
      evidence: isPlainObject(merged["evidence"])
        ? (merged["evidence"] as ParticipantView["evidence"])
        : undefined,
      consent: isPlainObject(merged["consent"])
        ? (merged["consent"] as ParticipantView["consent"])
        : undefined,
      publicName:
        typeof merged["publicName"] === "string" ? (merged["publicName"] as string) : undefined,
      capabilities: Array.isArray(merged["capabilities"])
        ? (merged["capabilities"] as unknown[]).filter((c): c is string => typeof c === "string")
        : undefined,
      aiAgent: isPlainObject(merged["aiAgent"])
        ? (merged["aiAgent"] as ParticipantView["aiAgent"])
        : undefined,
    });
  }

  views.sort((a, b) => {
    const ao = a.order ?? Number.MAX_SAFE_INTEGER;
    const bo = b.order ?? Number.MAX_SAFE_INTEGER;
    return ao !== bo ? ao - bo : a.slug.localeCompare(b.slug);
  });
  return views;
}

/** @deprecated Use getParticipantsForSection instead. */
export async function getPeopleForSection(lang: string): Promise<ParticipantView[]> {
  return getParticipantsForSection(lang);
}

/** Filter selector for a People/Participant section (mirrors the archetype `select` prop). */
export interface PeopleSelect {
  slugs?: string[];
  affiliation?: string;
  participantType?: string;
  status?: string;
  visibility?: string;
  all?: boolean;
}

/** Apply a People/Participant section's `select` to the full record list (preserving order; slugs honor the given order). */
export function selectPeople(
  all: ParticipantView[],
  select: PeopleSelect | undefined,
): ParticipantView[] {
  if (select?.slugs?.length) {
    const bySlug = new Map(all.map((p) => [p.slug, p]));
    return select.slugs.map((s) => bySlug.get(s)).filter((p): p is ParticipantView => Boolean(p));
  }
  let filtered = all;
  if (select?.affiliation) {
    filtered = filtered.filter((p) => p.affiliations.includes(select.affiliation as string));
  }
  if (select?.participantType) {
    filtered = filtered.filter((p) => p.participantType === select.participantType);
  }
  if (select?.status) {
    filtered = filtered.filter((p) => p.status === select.status);
  }
  if (select?.visibility) {
    filtered = filtered.filter((p) => p.visibility === select.visibility);
  }
  return filtered;
}
