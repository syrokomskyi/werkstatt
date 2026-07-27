/*
<MODULE_CONTRACT>
<purpose>
RFC-0512: public participant JSON endpoints and Schema.org JSON-LD builders for team
profile pages. Provides filterPublicParticipant (strips private fields, applies consent
gating), buildPersonJsonLd / buildSoftwareApplicationJsonLd / buildTeamHubCollectionPageJsonLd
(extended JSON-LD for profile pages), and generateParticipantJsonEndpoints (writes static
JSON files to dist/ at build time).
</purpose>
<non-goals>
  <item>Do not load content collections — callers pass already-resolved ParticipantView records.</item>
  <item>Do not validate participant schema — participant.validate owns that.</item>
  <item>Do not emit JSON-LD for non-profile pages — buildPersonNode in jsonld/person.ts handles those.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0512: initial creation — filterPublicParticipant, JSON-LD builders, JSON endpoint generator.</item>
</CHANGE_SUMMARY>
*/

import type { JsonLdNode } from "../semantic/jsonld/types.ts";
import type { ParticipantView } from "./people.ts";

/* ─── Public JSON types ─── */

export type PublicParticipantJson = {
  slug: string;
  participantType: string;
  publicName: string;
  status: string;
  relationshipType?: string;
  lastReviewedAt?: string;
  [key: string]: unknown;
};

export type ProfilesJson = {
  generatedAt: string;
  participants: Array<{
    slug: string;
    participantType: string;
    publicName: string;
    status: string;
    profileUrl: string;
    profileJsonUrl: string;
    role?: string;
    purpose?: string;
  }>;
};

/* ─── Private field filter ─── */

const PRIVATE_FIELDS = new Set([
  "consentRecordId",
  "profileOwner",
  "retentionClass",
  "agentId",
  "toolsetVersion",
  "modelProvider",
  "dataAccess",
  "operationalOwnerId",
  "technicalMaintainerId",
]);

function isPublicActive(p: ParticipantView): boolean {
  return p.visibility === "public" && p.status === "active";
}

function hasConsentField(p: ParticipantView, field: string): boolean {
  const approved = p.consent?.approvedFields;
  return Array.isArray(approved) && approved.includes(field);
}

/**
 * RFC-0512: Strip private fields and apply consent gating before generating
 * JSON endpoints or JSON-LD. Never serialize the raw Participant record.
 */
export function filterPublicParticipant(
  p: ParticipantView,
  _lang: string,
): PublicParticipantJson {
  const consent = p.consent;
  const approved = new Set(consent?.approvedFields ?? []);

  const base: PublicParticipantJson = {
    slug: p.slug,
    participantType: p.participantType ?? "human",
    publicName: p.publicName ?? p.name,
    status: p.status ?? "active",
    ...(p.relationshipType ? { relationshipType: p.relationshipType } : {}),
    ...(p.lastReviewedAt ? { lastReviewedAt: p.lastReviewedAt } : {}),
  };

  if (base.participantType === "human") {
    return {
      ...base,
      ...(p.role ? { role: p.role } : {}),
      ...(p.responsibility ? { responsibilities: [p.responsibility.summary] } : {}),
      ...(p.authority?.canSignFor?.length
        ? { decisionAuthority: p.authority.canSignFor }
        : {}),
      ...(p.capabilities?.length ? { capabilities: p.capabilities } : {}),
      ...(p.evidence?.claims?.length
        ? {
            evidenceRefs: p.evidence.claims.map((c) => ({
              label: c.claimId,
              url: c.sourceRef,
              evidenceStatus: "verified",
            })),
          }
        : {}),
      ...(p.languages?.length ? { languages: p.languages } : {}),
      ...(approved.has("location") && p.location ? { location: p.location } : {}),
      ...(approved.has("sameAs") && p.sameAs?.length ? { sameAs: p.sameAs } : {}),
      hasConsent: Boolean(consent),
      consentApprovedFields: consent?.approvedFields ?? [],
    };
  }

  if (base.participantType === "ai-agent") {
    const ai = p.aiAgent;
    if (!ai) return base;

    return {
      ...base,
      purpose: ai.purposeStatement,
      ...(ai.autonomyLevel ? { autonomyLevel: ai.autonomyLevel } : {}),
      ...(p.capabilities?.length ? { capabilities: p.capabilities } : {}),
      ...(ai.knownLimitations?.length ? { knownLimitations: ai.knownLimitations } : {}),
      ...(ai.accountableHumanId
        ? {
            accountableHuman: {
              slug: ai.accountableHumanId,
            },
          }
        : {}),
      ...(ai.escalationRoute ? { escalationRoute: ai.escalationRoute } : {}),
      ...(ai.technicalStand
        ? {
            technicalStand: {
              ...(ai.technicalStand.modelFamily
                ? { modelFamily: ai.technicalStand.modelFamily }
                : {}),
              ...(ai.technicalStand.lastEvaluatedAt
                ? { lastEvaluatedAt: ai.technicalStand.lastEvaluatedAt }
                : {}),
              ...(ai.technicalStand.nextEvaluationAt
                ? { nextEvaluationAt: ai.technicalStand.nextEvaluationAt }
                : {}),
            },
          }
        : {}),
      ...(ai.rightsMatrix?.length
        ? {
            rightsSummary: ai.rightsMatrix.map((r) => ({
              action: r.action,
              status: r.status,
            })),
          }
        : {}),
    };
  }

  return base;
}

/* ─── JSON-LD builders for profile pages ─── */

/**
 * RFC-0512: Build extended Person JSON-LD for human profile pages.
 * Replaces the Person node from buildPersonNode in the @graph for profile pages.
 * Excludes birthDate (even with consent). Address is consent-gated.
 */
export function buildPersonJsonLd(
  p: ParticipantView,
  siteUrl: string,
  _lang: string,
): JsonLdNode {
  const profileUrl = `${siteUrl}/team/${p.slug}/`;
  const consent = p.consent;
  const approved = new Set(consent?.approvedFields ?? []);

  const node: JsonLdNode = {
    "@type": "Person",
    "@id": `${profileUrl}#person`,
    name: p.publicName ?? p.name,
    ...(p.role ? { jobTitle: p.role } : {}),
    ...(p.bio ? { description: p.bio } : {}),
    url: profileUrl,
  };

  if (approved.has("photo") && p.photo) {
    node.image = p.photo;
  }

  /* Address: entire PostalAddress gated by "location" consent. */
  if (approved.has("location") && p.location) {
    const parts = p.location.split(",").map((s) => s.trim());
    node.address = {
      "@type": "PostalAddress",
      addressLocality: parts[0] ?? "",
      ...(parts[1] ? { addressRegion: parts[1] } : {}),
      addressCountry: "DE",
    };
  }

  if (p.capabilities?.length) {
    node.knowsAbout = p.capabilities;
  }

  if (approved.has("sameAs") && p.sameAs?.length) {
    node.sameAs = p.sameAs;
  }

  node.affiliation = {
    "@type": "Organization",
    name: "Webgogol",
  };

  return node;
}

/**
 * RFC-0512: Build SoftwareApplication JSON-LD for AI-agent profile pages.
 */
export function buildSoftwareApplicationJsonLd(
  p: ParticipantView,
  siteUrl: string,
  _lang: string,
): JsonLdNode {
  const ai = p.aiAgent;
  const profileUrl = `${siteUrl}/team/ki-agenten/${p.slug}/`;

  const node: JsonLdNode = {
    "@type": "SoftwareApplication",
    "@id": `${profileUrl}#software`,
    name: p.publicName ?? p.name,
    applicationCategory: "BusinessApplication",
    ...(ai?.purposeStatement ? { description: ai.purposeStatement } : {}),
    url: profileUrl,
    operatingSystem: "Web",
  };

  if (ai?.accountableHumanId) {
    node.provider = {
      "@type": "Person",
      name: ai.accountableHumanId,
      url: `${siteUrl}/team/${ai.accountableHumanId}/`,
    };
  }

  node.offers = {
    "@type": "Offer",
    price: "0",
    priceCurrency: "EUR",
    availability: "https://schema.org/InStock",
  };

  return node;
}

/**
 * RFC-0512: Build CollectionPage JSON-LD for the team hub page.
 * hasPart lists all public, active participants.
 */
export function buildTeamHubCollectionPageJsonLd(
  participants: ReadonlyArray<ParticipantView>,
  siteUrl: string,
): JsonLdNode {
  const publicActive = participants.filter(isPublicActive);

  const hasPart = publicActive.map((p) => {
    const isAiAgent = p.participantType === "ai-agent";
    const profileUrl = isAiAgent
      ? `${siteUrl}/team/ki-agenten/${p.slug}/`
      : `${siteUrl}/team/${p.slug}/`;

    return {
      "@type": isAiAgent ? "SoftwareApplication" : "Person",
      name: p.publicName ?? p.name,
      url: profileUrl,
    };
  });

  return {
    "@type": "CollectionPage",
    "@id": `${siteUrl}/team/#collection`,
    name: "Team",
    description: "Verantwortliche Personen, Teams und KI-Systeme bei Webgogol.",
    url: `${siteUrl}/team/`,
    hasPart,
  };
}

/* ─── JSON endpoint generator ─── */

/**
 * RFC-0512: Generate static JSON endpoint data for build-time emission.
 * Returns the data objects — the caller (build.prepare step) writes them to dist/.
 */
export function generateParticipantJsonEndpoints(
  participants: ReadonlyArray<ParticipantView>,
  siteUrl: string,
  generatedAt: string,
): {
  profilesJson: ProfilesJson;
  humanProfiles: Array<{ slug: string; data: PublicParticipantJson }>;
  aiAgentProfiles: Array<{ slug: string; data: PublicParticipantJson }>;
} {
  const publicActive = participants.filter(isPublicActive);

  const profilesJson: ProfilesJson = {
    generatedAt,
    participants: publicActive.map((p) => {
      const isAiAgent = p.participantType === "ai-agent";
      const profileUrl = isAiAgent
        ? `${siteUrl}/team/ki-agenten/${p.slug}/`
        : `${siteUrl}/team/${p.slug}/`;
      const profileJsonUrl = isAiAgent
        ? `${siteUrl}/team/ki-agenten/${p.slug}/profile.json`
        : `${siteUrl}/team/${p.slug}/profile.json`;

      return {
        slug: p.slug,
        participantType: p.participantType ?? "human",
        publicName: p.publicName ?? p.name,
        status: p.status ?? "active",
        profileUrl,
        profileJsonUrl,
        ...(p.role && !isAiAgent ? { role: p.role } : {}),
        ...(isAiAgent && p.aiAgent?.purposeStatement
          ? { purpose: p.aiAgent.purposeStatement }
          : {}),
      };
    }),
  };

  const humanProfiles = publicActive
    .filter((p) => p.participantType === "human")
    .map((p) => ({ slug: p.slug, data: filterPublicParticipant(p, "de") }));

  const aiAgentProfiles = publicActive
    .filter((p) => p.participantType === "ai-agent")
    .map((p) => ({ slug: p.slug, data: filterPublicParticipant(p, "de") }));

  return { profilesJson, humanProfiles, aiAgentProfiles };
}

/* ─── Private field scan helper (used by participant.json.validate) ─── */

/**
 * RFC-0512: Scan a public JSON object for private field leakage.
 * Returns a list of violated field paths (empty = clean).
 */
export function scanPrivateFields(obj: Record<string, unknown>): string[] {
  const violations: string[] = [];

  function scan(value: unknown, path: string): void {
    if (typeof value !== "object" || value === null) return;
    if (Array.isArray(value)) {
      value.forEach((item, i) => scan(item, `${path}[${i}]`));
      return;
    }
    const record = value as Record<string, unknown>;
    for (const [key, val] of Object.entries(record)) {
      const fieldPath = path ? `${path}.${key}` : key;
      if (PRIVATE_FIELDS.has(key)) {
        violations.push(fieldPath);
      }
      scan(val, fieldPath);
    }
  }

  scan(obj, "");
  return violations;
}
