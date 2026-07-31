---
id: RFC-0512
title: Team machine-readable profiles — JSON endpoints and Schema.org
status: implemented
kind: architecture
scope: workspace
owners:
- architecture
reviewers:
- human:andrii-syrokomskyi
createdAt: &id001 2026-07-24
updatedAt: 2026-07-24
enhancedAt: 2026-07-24
supersedes: []
supersededBy: null
amends:
- RFC-0200
amendedBy: []
related:
- RFC-0192
- RFC-0200
- RFC-0478
- RFC-0479
- RFC-0480
- RFC-0498
- RFC-0508
- RFC-0509
- RFC-0510
- RFC-0511
- RFC-0513
satisfies:
- DNA-53
breaksC: true
versionBump: minor
commands:
  proposed:
  - participant.json.validate
  added:
  - participant.json.validate
  changed:
  - seo.structured-data.validate
  - surface.contract.validate
  removed:
  - sites-check-postbuild
appsImpacted:
- warpgogol-com
packagesImpacted:
- '@gogol/share'
- '@gogol/ontology'
- '@gogol/site-kernel-checks'
- '@gogol/site-kernel-handoff'
- '@warpgogol/ontology'
successSignals:
- Each public human profile page emits Person + BreadcrumbList JSON-LD with name, jobTitle, address (city-level), url, image, sameAs, and knowsAbout (from capabilities).
- Each public AI-agent profile page emits SoftwareApplication + BreadcrumbList JSON-LD with name, applicationCategory, description, operatingSystem (Web), and provider (the accountable human's Person).
- The team hub page emits CollectionPage + BreadcrumbList JSON-LD with hasPart listing all public, active participants.
- A public JSON endpoint at /team/profiles.json lists all public, active participants with slug, participantType, publicName, role/purpose, profileUrl, and status.
- Individual JSON endpoints at /team/[slug]/profile.json (human) and /team/ki-agenten/[slug]/profile.json (AI agent) expose the full public participant record.
- 'JSON endpoints exclude all private fields: consent.consentRecordId, profileOwner, retentionClass, aiAgent.technicalStand.agentId, aiAgent.technicalStand.toolsetVersion, aiAgent.rightsMatrix.dataAccess.'
- The jsonld-types.yaml C-contract includes Person, SoftwareApplication, and CollectionPage type definitions for team pages.
- participant.json.validate enforces JSON endpoint shape, private field exclusion, and JSON-LD type compliance.
- No personal data (birth year, family medical history, refugee status) appears in JSON-LD or JSON endpoints without consent.
nonGoals:
- Does not define the Participant data model — that is RFC-0508.
- Does not define the profile page structure — that is RFC-0510 (human) and RFC-0511 (AI agent).
- Does not define the team hub page — that is RFC-0509.
- Does not implement W3C Verifiable Credentials — JSON endpoints are plain JSON, not signed VC.
- Does not create a REST API with authentication — the JSON endpoints are public, static, build-time generated files.
- Does not define JSON endpoints for organization units, external specialists, or partner organizations — deferred to a future RFC when those participant types are populated.
implementedAt: *id001

---

# RFC-0512: Team machine-readable profiles — JSON endpoints and Schema.org

## Context

RFC-0200 emits Person JSON-LD on profile pages with `name`, `jobTitle`, `image`, and `sameAs`. There are no public JSON endpoints for participant data. An external expert review (file 16.1, sections 6–7) requires:

1. **Schema.org alignment** — human profiles emit `Person`, AI-agent profiles emit `SoftwareApplication`, the team hub emits `CollectionPage`.
2. **Public JSON endpoints** — machine-readable profiles for crawlers, partners, and integrations.
3. **Private field exclusion** — consent records, internal IDs, full ACLs, and technical internals are never in public output.

## Problem

1. **No JSON endpoints.** There is no `/team/profiles.json` or `/team/[slug]/profile.json`. Machine consumers cannot retrieve structured participant data without scraping HTML.

2. **Incomplete JSON-LD.** The current Person JSON-LD has `name`, `jobTitle`, `image`, `sameAs` but is missing `address`, `knowsAbout`, `url`, and `description`. AI-agent profiles have no JSON-LD type at all.

3. **No CollectionPage for the hub.** The team hub (RFC-0509) needs `CollectionPage` JSON-LD with `hasPart` listing all public participants.

4. **No private field filtering.** The Participant record (RFC-0508) contains private fields (`consent.consentRecordId`, `profileOwner`, `retentionClass`, `aiAgent.technicalStand.agentId`, `aiAgent.rightsMatrix.dataAccess`). There is no mechanism to filter these from public JSON output.

5. **No consent enforcement in JSON.** Personal data (birth year, personal background) in JSON-LD/JSON must be gated by `consent.approvedFields` — the same gate that applies to HTML rendering.

## Decision

### JSON-LD emission

#### Human profile pages — Person + BreadcrumbList

```json
{
  "@context": "https://schema.org",
  "@type": "Person",
  "@id": "https://warpgogol.com/team/andrii-syrokomskyi/#person",
  "name": "Andrii Syrokomskyi",
  "jobTitle": "Gründer und technischer Leiter",
  "description": "Programmierer und Entwickler hochlastfähiger Systeme. Mehr als 25 Jahre Berufserfahrung.",
  "url": "https://warpgogol.com/team/andrii-syrokomskyi/",
  "image": "https://warpgogol.com/.../andrii-portrait.webp",
  "address": {
    "@type": "PostalAddress",
    "addressLocality": "Backnang",
    "addressRegion": "Baden-Württemberg",
    "addressCountry": "DE"
  },
  "knowsAbout": [
    "Geschäftsprozessautomatisierung",
    "Architektur hochlastfähiger Systeme",
    "Qualitätssicherung"
  ],
  "sameAs": [
    "https://linkedin.com/in/syrokomskyi"
  ],
  "affiliation": {
    "@type": "Organization",
    "name": "Warpgogol"
  }
}
```

**Consent-gated fields:**

- `address` — the entire `PostalAddress` object is only included when `consent.approvedFields` includes `location`. `addressCountry` is not emitted separately when `location` consent is absent — the whole `address` node is omitted to avoid partial location leakage.
- `image` — only included when `consent.approvedFields` includes `photo`
- `sameAs` — only included when `consent.approvedFields` includes `sameAs`
- `description` — professional summary only; personal background is never in JSON-LD

**Never in JSON-LD:**

- `birthDate` / `lifespan.born` — even with consent, birth year is not in Schema.org output
- Personal background details (family, medical, refugee status)
- `consent` record (the fact of consent is private; only the result is visible)
- `profileOwner`, `retentionClass`

#### AI-agent profile pages — SoftwareApplication + BreadcrumbList

```json
{
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "@id": "https://warpgogol.com/team/ki-agenten/mira/#software",
  "name": "Mira",
  "applicationCategory": "BusinessApplication",
  "description": "Automatisierte Inhaltsprüfung und Strukturierung von Geschäftsprofilen.",
  "url": "https://warpgogol.com/team/ki-agenten/mira/",
  "operatingSystem": "Web",
  "provider": {
    "@type": "Person",
    "name": "Andrii Syrokomskyi",
    "url": "https://warpgogol.com/team/andrii-syrokomskyi/"
  },
  "offers": {
    "@type": "Offer",
    "price": "0",
    "priceCurrency": "EUR",
    "availability": "https://schema.org/InStock"
  }
}
```

**Never in AI-agent JSON-LD:**

- `aiAgent.technicalStand.agentId`, `aiAgent.technicalStand.toolsetVersion`
- `aiAgent.rightsMatrix.dataAccess` details
- `aiAgent.technicalStand.modelProvider` (internal)
- Internal `accountableHumanId` (the `provider` uses the human's public name and URL)

#### Team hub page — CollectionPage + BreadcrumbList

```json
{
  "@context": "https://schema.org",
  "@type": "CollectionPage",
  "@id": "https://warpgogol.com/team/#collection",
  "name": "Team",
  "description": "Verantwortliche Personen, Teams und KI-Systeme bei Warpgogol.",
  "url": "https://warpgogol.com/team/",
  "hasPart": [
    {
      "@type": "Person",
      "name": "Andrii Syrokomskyi",
      "url": "https://warpgogol.com/team/andrii-syrokomskyi/"
    },
    {
      "@type": "SoftwareApplication",
      "name": "Mira",
      "url": "https://warpgogol.com/team/ki-agenten/mira/"
    }
  ]
}
```

### JSON endpoints

Three public JSON endpoints, generated at build time as static files:

#### 1. `/team/profiles.json` — participant directory

```json
{
  "generatedAt": "2026-07-24T12:00:00Z",
  "participants": [
    {
      "slug": "andrii-syrokomskyi",
      "participantType": "human",
      "publicName": "Andrii Syrokomskyi",
      "role": "Gründer und technischer Leiter",
      "status": "active",
      "profileUrl": "https://warpgogol.com/team/andrii-syrokomskyi/",
      "profileJsonUrl": "https://warpgogol.com/team/andrii-syrokomskyi/profile.json"
    },
    {
      "slug": "mira",
      "participantType": "ai-agent",
      "publicName": "Mira",
      "purpose": "Automatisierte Inhaltsprüfung und Strukturierung von Geschäftsprofilen.",
      "status": "active",
      "profileUrl": "https://warpgogol.com/team/ki-agenten/mira/",
      "profileJsonUrl": "https://warpgogol.com/team/ki-agenten/mira/profile.json"
    }
  ]
}
```

#### 2. `/team/[slug]/profile.json` — human participant detail

```json
{
  "slug": "andrii-syrokomskyi",
  "participantType": "human",
  "publicName": "Andrii Syrokomskyi",
  "role": "Gründer und technischer Leiter",
  "status": "active",
  "relationshipType": "founder",
  "location": "Backnang, Baden-Württemberg",
  "languages": ["Deutsch", "Ukrainisch", "Russisch", "Englisch"],
  "responsibilities": [
    "Architektur und technische Leitung der Warpgogol-Plattform",
    "Geschäftsprozessautomatisierung für kleine und mittlere Unternehmen"
  ],
  "decisionAuthority": [
    "Technologie- und Architekturentscheidungen",
    "Aufnahme und Kündigung von Kundenverhältnissen"
  ],
  "capabilities": [
    "Geschäftsprozessautomatisierung",
    "Architektur hochlastfähiger Systeme"
  ],
  "evidenceRefs": [
    {
      "label": "Digitale Reife der Unternehmen in Deutschland",
      "url": "https://zenodo.org/records/20478155",
      "evidenceStatus": "verified"
    }
  ],
  "contributionRefs": [
    {
      "label": "Marathon Stuttgart",
      "url": "https://my.raceresult.com/317721/results",
      "kind": "publication"
    }
  ],
  "profileUrl": "https://warpgogol.com/team/andrii-syrokomskyi/",
  "sameAs": [
    "https://linkedin.com/in/syrokomskyi"
  ],
  "hasConsent": true,
  "consentApprovedFields": ["bio", "photo", "location", "sameAs"],
  "lastReviewedAt": "2026-07-24"
}
```

**`hasConsent` and `consentApprovedFields` are intentionally public.** They provide GDPR transparency: a machine consumer can verify that the person has consented to the display of their data and which fields are covered. The private `consent.consentRecordId` (the internal audit trail reference) is never exposed — only the boolean fact and the field-name list are public.

**Consent-gated fields in JSON:**

- `location` — only included when `consent.approvedFields` includes `location`
- `sameAs` — only included when `consent.approvedFields` includes `sameAs`
- `languages` — always included (professional relevance)

**Never in human JSON:**

- `lifespan.born`, `lifespan.died` (birth/death year)
- `bio` (personal background prose — available in HTML, not in JSON)
- `consent.consentRecordId` (the ID is private; only `hasConsent: true` and `consentApprovedFields` are public)
- `profileOwner`, `retentionClass`
- `photo` asset token (the resolved URL is in JSON-LD `image`; the JSON endpoint does not duplicate it)

#### 3. `/team/ki-agenten/[slug]/profile.json` — AI-agent participant detail

```json
{
  "slug": "mira",
  "participantType": "ai-agent",
  "publicName": "Mira",
  "status": "active",
  "relationshipType": "operated-ai-system",
  "purpose": "Automatisierte Inhaltsprüfung und Strukturierung von Geschäftsprofilen.",
  "autonomyLevel": "A2",
  "autonomyLabel": "Autonome Ausführung mit Freigabe",
  "capabilities": [
    "Inhaltsprüfung",
    "Strukturierung von Geschäftsprofilen"
  ],
  "knownLimitations": [
    "Keine autonomen Preisentscheidungen",
    "Keine Kundenkommunikation ohne Freigabe"
  ],
  "accountableHuman": {
    "slug": "andrii-syrokomskyi",
    "publicName": "Andrii Syrokomskyi",
    "profileUrl": "https://warpgogol.com/team/andrii-syrokomskyi/"
  },
  "escalationRoute": "E-Mail an hi@warpgogol.com mit Betreff 'KI-Eskalation'",
  "technicalStand": {
    "modelFamily": "Claude 4",
    "lastEvaluatedAt": "2026-07-01",
    "nextEvaluationAt": "2026-10-01"
  },
  "rightsSummary": [
    { "action": "Inhaltsprüfung", "status": "allowed" },
    { "action": "Strukturierung", "status": "allowed" },
    { "action": "Preisentscheidungen", "status": "prohibited" },
    { "action": "Kundenkommunikation", "status": "approval-required" }
  ],
  "profileUrl": "https://warpgogol.com/team/ki-agenten/mira/",
  "lastReviewedAt": "2026-07-01"
}
```

**Never in AI-agent JSON:**

- `aiAgent.technicalStand.agentId`, `aiAgent.technicalStand.toolsetVersion`
- `aiAgent.technicalStand.modelProvider`
- `aiAgent.rightsMatrix.dataAccess` (the `rightsSummary` shows only `action` → `status`)
- `aiAgent.operationalOwnerId`, `aiAgent.technicalMaintainerId` (internal)

### Private field filter

A central `filterPublicParticipant` function strips private fields before generating JSON endpoints or JSON-LD:

```ts
// packages/share/src/astro/participant-json.ts

export function filterPublicParticipant(
  participant: ParticipantData,
  lang: string,
): PublicParticipantJson {
  const consent = participant.consent;
  const approved = new Set(consent?.approvedFields ?? []);

  const base = {
    slug: participant.slug,
    participantType: participant.participantType,
    publicName: participant.publicName,
    status: participant.status,
    relationshipType: participant.relationshipType,
    lastReviewedAt: participant.lastReviewedAt,
  };

  if (participant.participantType === "human") {
    return {
      ...base,
      role: participant.role,
      responsibilities: participant.responsibilities,
      decisionAuthority: participant.decisionAuthority,
      capabilities: participant.capabilities,
      evidenceRefs: participant.evidenceRefs,
      contributionRefs: participant.contributionRefs,
      languages: participant.languages,
      // Consent-gated
      ...(approved.has("location") ? { location: participant.location } : {}),
      ...(approved.has("sameAs") ? { sameAs: participant.sameAs } : {}),
      hasConsent: Boolean(consent),
      consentApprovedFields: consent?.approvedFields ?? [],
    };
  }

  if (participant.participantType === "ai-agent") {
    const ai = participant.aiAgent!;
    return {
      ...base,
      purpose: ai.purposeStatement,
      autonomyLevel: ai.autonomyLevel,
      autonomyLabel: autonomyLabel(ai.autonomyLevel, lang),
      capabilities: participant.capabilities,
      knownLimitations: ai.knownLimitations,
      accountableHuman: {
        slug: ai.accountableHumanId,
        // Resolved at generation time
      },
      escalationRoute: ai.escalationRoute,
      technicalStand: {
        modelFamily: ai.technicalStand?.modelFamily,
        lastEvaluatedAt: ai.technicalStand?.lastEvaluatedAt,
        nextEvaluationAt: ai.technicalStand?.nextEvaluationAt,
      },
      rightsSummary: ai.rightsMatrix?.map((r) => ({ action: r.action, status: r.status })),
    };
  }

  return base;
}
```

### Build-time generation

JSON endpoints are generated at build time as static files in `dist/`:

- `dist/team/profiles.json`
- `dist/team/[slug]/profile.json` (for each public human)
- `dist/team/ki-agenten/[slug]/profile.json` (for each public AI agent)

The generation happens in a new `participant.json.generate` step in `build.prepare`, reading the people collection, filtering to public/active, applying `filterPublicParticipant`, and writing static JSON files. This step runs after content collection is loaded but before HTML rendering, so that `participant.json.validate` (in `sites-check-postbuild`) can scan the built `dist/` JSON files.

### jsonld-types.yaml C-contract update

```yaml
# Added to types:
  - "@type": Person
    required: [name, url]
    optional: [jobTitle, description, image, address, knowsAbout, sameAs, affiliation]
  - "@type": SoftwareApplication
    required: [name, applicationCategory, url]
    optional: [description, operatingSystem, provider, offers]

# Added to surfacePolicy:
  - surface: team-hub
    depth: 0
    requiredTypes: [CollectionPage, BreadcrumbList]
    prohibitedTypes: [LocalBusiness, Service, Offer, BookAction, Article, FAQPage]
  - surface: team-profile-human
    depth: 0
    requiredTypes: [Person, BreadcrumbList]
    prohibitedTypes: [LocalBusiness, Service, Offer, BookAction, CollectionPage, FAQPage]
  - surface: team-profile-ai-agent
    depth: 0
    requiredTypes: [SoftwareApplication, BreadcrumbList]
    prohibitedTypes: [LocalBusiness, Service, Offer, BookAction, CollectionPage, Person, FAQPage]
```

## Architectural fit

- **RFC-0200 (amended):** Person JSON-LD is extended with `address`, `knowsAbout`, `description`, `affiliation`. The JSON-LD is emitted by the `structured-data` component on the profile page.
- **RFC-0508:** The Participant data model provides all fields. `filterPublicParticipant` strips private fields.
- **RFC-0509:** The team hub emits `CollectionPage` JSON-LD with `hasPart`.
- **RFC-0510/0511:** The profile page synthesis includes the `structured-data` component with the correct JSON-LD type per participant type.
- **RFC-0498:** Follows the structured-data policy pattern — `surfacePolicy` in `jsonld-types.yaml` maps surfaces to required/prohibited types.
- **RFC-0480:** `breaksC: true` — new JSON endpoints and new JSON-LD types are external surface changes.
- **DNA-53 (Semantic fingerprint governance):** The C-contract changes to `jsonld-types.yaml` and `url-schema.yaml` alter the platform semantic hash. `platform.consistency.validate` detects the hash change and verifies that `versionBump: minor` is declared. The migrator (see below) advances `migratorCursor` so that `mission.migrate` can apply the change to registered Sternsystemen.
- **DNA-24 (Block-declarative pages):** Not directly satisfied — JSON endpoints are static build-time files, not block-declarative pages. The JSON-LD injection into the `structured-data` block on profile pages is already governed by RFC-0200/RFC-0498. Removed from `satisfies[]`.

## Design

### CLI surface

```sh
# Validate JSON endpoints and JSON-LD emission.
pnpm exec site-kernel run participant.json.validate --site warpgogol-com --json
```

### File system responsibilities

| Path | Edit |
| --- | --- |
| `packages/share/src/astro/participant-json.ts` | New file: `filterPublicParticipant`, `buildPersonJsonLd`, `buildSoftwareApplicationJsonLd`, `buildTeamHubCollectionPageJsonLd`, `generateParticipantJsonEndpoints` |
| `packages/share/src/astro/page-handler/resolve-route.ts` | For profile pages, replace the Person node from `buildPersonNode` with the extended `buildPersonJsonLd` output in the `@graph`. Non-profile pages (home, about) continue using `buildPersonNode` unchanged. |
| `packages/share/src/semantic/models.ts` | Extend `SemanticPerson` with `address?: { addressLocality: string; addressRegion?: string; addressCountry: string }`, `knowsAbout?: string[]`, `affiliation?: { name: string; url?: string }` |
| `packages/share/src/semantic/business-projection.ts` | Extend `projectPeople` to map `location`, `capabilities` (→ `knowsAbout`), and organization affiliation into the new `SemanticPerson` fields |
| `packages/share/src/semantic/jsonld/person.ts` | Extend `buildPersonNode` to emit `address`, `knowsAbout`, `affiliation` when present on `SemanticPerson` (backward-compatible — fields are optional) |
| `packages/os/site-kernel-checks/src/participant-json.ts` | New file: `participant.json.validate` |
| `packages/ontology/src/external-surfaces/jsonld-types.yaml` | Add `Person`, `SoftwareApplication` types; add `team-hub`, `team-profile-human`, `team-profile-ai-agent` surface policies |
| `packages/ontology/src/external-surfaces/url-schema.yaml` | Add `/team/profiles.json`, `/team/[slug]/profile.json`, `/team/ki-agenten/[slug]/profile.json` patterns |
| `packages/os/site-kernel-handoff/src/migrators/rfc-0512.ts` | New file: no-op migrator (registers in `registry.ts`). The change is to C-contract files and build-time generation, not to authored data — no data transformation is needed. |
| `packages/os/site-kernel-handoff/src/migrators/registry.ts` | Append `rfc-0512` to the migrator registry |
| `packages/os/site-kernel-checks/AGENTS.md` | Add `participant.json.validate` to the command inventory |
| `docs/technology.xml` | Add `participant.json.generate` and `participant.json.validate` to the command surface |
| `docs/knowledge-graph.xml` | Add RFC-0512 relationships to the semantic graph |

### Output format

`participant.json.validate --json` returns:

```json
{
  "command": "participant.json.validate",
  "status": "pass",
  "site": "warpgogol-com",
  "checked": {
    "profilesJsonExists": true,
    "humanProfilesChecked": 1,
    "aiAgentProfilesChecked": 1,
    "privateFieldScan": { "violations": 0, "fieldsScanned": 14 },
    "jsonldTypeCompliance": { "human": "Person", "aiAgent": "SoftwareApplication", "hub": "CollectionPage" }
  },
  "violations": []
}
```

### Failure modes

| Condition                                               | Exit code | Severity     |
| ------------------------------------------------------- | --------- | ------------ |
| `profiles.json` missing from `dist/`                    | 1         | error        |
| Private field found in any JSON endpoint                | 1         | error        |
| `lifespan.born` or `lifespan.died` in human JSON        | 1         | error        |
| Consent-gated field present without consent             | 1         | error        |
| JSON-LD `@type` mismatch on profile/hub page            | 1         | error        |
| No public participants (empty state)                    | 0         | pass (no-op) |
| JSON endpoint exists for a retired/inactive participant | 1         | error        |

### participant.json.validate rules

- `/team/profiles.json` exists and lists all public, active participants.
- Each participant in `profiles.json` has `slug`, `participantType`, `publicName`, `status`, `profileUrl`, `profileJsonUrl`.
- `/team/[slug]/profile.json` exists for each public human participant.
- `/team/ki-agenten/[slug]/profile.json` exists for each public AI-agent participant.
- No JSON endpoint contains: `consent.consentRecordId`, `profileOwner`, `retentionClass`, `aiAgent.technicalStand.agentId`, `aiAgent.technicalStand.toolsetVersion`, `aiAgent.rightsMatrix.dataAccess`.
- Human JSON endpoints do not contain `lifespan.born` or `lifespan.died`.
- Human JSON endpoints do not contain `location` or `sameAs` when consent is not granted for those fields.
- AI-agent JSON endpoints contain `rightsSummary` (action → status) but not `rightsMatrix.dataAccess`.
- JSON-LD on human profile pages has `@type: Person`.
- JSON-LD on AI-agent profile pages has `@type: SoftwareApplication`.
- JSON-LD on the team hub has `@type: CollectionPage` with `hasPart`.
- **Empty state:** If no public, active participants exist, `profiles.json` is still generated with `participants: []` and the validator no-op passes (exit 0).

## Rollout

- **Phase 0 — Filter + JSON-LD.** Implement `filterPublicParticipant`, `buildPersonJsonLd`, `buildSoftwareApplicationJsonLd`, `buildTeamHubCollectionPageJsonLd`. Inject JSON-LD into profile page synthesis. Update `jsonld-types.yaml`.
- **Phase 1 — JSON endpoints.** Generate static JSON files at build time. Update `url-schema.yaml`.
- **Phase 2 — Validation.** Ship `participant.json.validate` and join `sites-check-postbuild` (it scans built `dist/` JSON files, so it must run after the build step).
- **Phase 3 — Migrator.** Register no-op migrator `rfc-0512` in `packages/os/site-kernel-handoff/src/migrators/registry.ts`. The migrator advances `migratorCursor` without transforming data — the change is to C-contract files and build-time generation only.

## Alternatives considered

- **Use a single JSON endpoint with query parameters (e.g. `/api/participants?type=human`).** Rejected — the endpoints are static build-time files, not a dynamic API. Static files are simpler, cacheable, and require no server runtime.
- **Emit `Person` JSON-LD for AI agents.** Rejected — AI agents are not persons. `SoftwareApplication` is the correct Schema.org type for an AI system with a provider.
- **Include `birthDate` in Person JSON-LD with consent.** Rejected — birth year is sensitive personal data. Even with consent, it should not be in Schema.org output. The expert recommends minimizing personal data in machine-readable formats.

## Risks

- **JSON endpoints expose too much.** Mitigated by `filterPublicParticipant` and `participant.json.validate` checking for private field absence.
- **Consent-gated fields in JSON vs HTML mismatch.** The same `consent.approvedFields` gate applies to both HTML rendering and JSON output. `participant.json.validate` checks consistency.
- **CollectionPage `hasPart` grows large.** With 1–20 participants, this is not a concern. If the team grows beyond 50, a paginated endpoint may be needed (future RFC).

## Acceptance criteria

- [x] `filterPublicParticipant` in `packages/share/src/astro/participant-json.ts` strips private fields. (evidence: packages/share/src/astro/participant-json.ts:1)
- [x] Human profile pages emit `Person + BreadcrumbList` JSON-LD with `name`, `jobTitle`, `description`, `url`, `address` (consent-gated), `knowsAbout`, `sameAs` (consent-gated), `affiliation`. (evidence: packages/share/src/astro/participant-json.ts:1)
- [x] AI-agent profile pages emit `SoftwareApplication + BreadcrumbList` JSON-LD with `name`, `applicationCategory`, `description`, `url`, `operatingSystem`, `provider`. (evidence: packages/share/src/astro/participant-json.ts:1)
- [x] Team hub page emits `CollectionPage + BreadcrumbList` JSON-LD with `hasPart` listing all public, active participants. (evidence: packages/share/src/astro/participant-json.ts:1)
- [x] `/team/profiles.json` is generated at build time and lists all public, active participants. (evidence: packages/share/src/astro/participant-json.ts:1)
- [x] `/team/[slug]/profile.json` is generated for each public human participant. (evidence: packages/share/src/astro/participant-json.ts:1)
- [x] `/team/ki-agenten/[slug]/profile.json` is generated for each public AI-agent participant. (evidence: packages/share/src/astro/participant-json.ts:1)
- [x] No JSON endpoint contains `consent.consentRecordId`, `profileOwner`, `retentionClass`, `aiAgent.technicalStand.agentId`, `aiAgent.technicalStand.toolsetVersion`, or `aiAgent.rightsMatrix.dataAccess`. (evidence: packages/share/src/astro/participant-json.ts:1)
- [x] No human JSON endpoint contains `lifespan.born` or `lifespan.died`. (evidence: packages/share/src/astro/participant-json.ts:1)
- [x] `jsonld-types.yaml` includes `Person`, `SoftwareApplication` types and `team-hub`, `team-profile-human`, `team-profile-ai-agent` surface policies. (evidence: packages/ontology/src/external-surfaces/jsonld-types.yaml:1)
- [x] `participant.json.validate` passes and is registered in `sites-check-postbuild`. (evidence: packages/os/site-kernel-checks/src/participant-json-validate.ts:1)
- [x] `surface.contract.validate` passes with the updated C-contract. (evidence: packages/os/site-kernel-checks/src/surface-contract-validate.ts:1)
- [x] `seo.structured-data.validate` passes for all team pages. (evidence: packages/os/site-kernel-checks/src/seo-structured-data-validate.ts:1)
- [x] No-op migrator `rfc-0512` is registered in `packages/os/site-kernel-handoff/src/migrators/registry.ts`. (evidence: packages/os/site-kernel-handoff/src/migrators/registry.ts:1)
- [x] `rfc.validate` passes on this file before merging. (evidence: docs/rfcs/archive/implemented/rfc-0512-team-machine-readable-profiles-json-endpoints-and-schema-org.md:1)

## Implementation notes for agents

- Agents MUST use `filterPublicParticipant` before generating any JSON output — never serialize the raw Participant record.
- Agents MUST gate `location` and `sameAs` in human JSON behind `consent.approvedFields`.
- Agents MUST NOT include `lifespan.born`, `lifespan.died`, `bio` (personal prose), `consent.consentRecordId`, `profileOwner`, or `retentionClass` in any JSON endpoint.
- Agents MUST NOT include `aiAgent.technicalStand.agentId`, `aiAgent.technicalStand.toolsetVersion`, `aiAgent.technicalStand.modelProvider`, or `aiAgent.rightsMatrix.dataAccess` in any public output.
- Agents MUST use `SoftwareApplication` (not `Person`) for AI-agent JSON-LD.
- Agents MUST link the AI-agent `provider` to the accountable human's public profile URL.
- Agents MUST register the no-op migrator `rfc-0512` in the migrator registry before requesting RFC acceptance (RFC-0479).
- Agents MUST follow RFC-0224 (accepted→implemented transition) and RFC-0330 (verification evidence) when moving this RFC to `implemented`.
- Agents MUST update `docs/technology.xml` and `docs/knowledge-graph.xml` (Compass sync) when implementing this RFC.
- Agents MUST NOT create a parallel JSON-LD builder for non-profile pages — the existing `buildPersonNode` in `packages/share/src/semantic/jsonld/person.ts` is extended with optional fields; only profile pages use the new `buildPersonJsonLd` from `participant-json.ts` to replace the Person node in the `@graph`.
