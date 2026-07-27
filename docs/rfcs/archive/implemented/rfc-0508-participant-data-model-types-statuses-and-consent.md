---
id: RFC-0508
title: "Participant data model — canonical Participant entity, types, statuses, and consent"
status: implemented
kind: architecture
scope: workspace
owners:
  - architecture
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-07-24
updatedAt: 2026-07-23
implementedAt: 2026-07-23
enhancedAt: 2026-07-24
supersedes: []
supersededBy:
amends:
  - RFC-0200
amendedBy: []
related:
  - RFC-0008
  - RFC-0024
  - RFC-0152
  - RFC-0200
  - RFC-0471
  - RFC-0478
  - RFC-0479
  - RFC-0480
  - RFC-0509
  - RFC-0510
  - RFC-0511
  - RFC-0512
  - RFC-0513
satisfies:
  - DNA-24
  - DNA-53
breaksC: false
versionBump: minor
commands:
  proposed:
    - participant.validate
  added:
    - participant.validate
  changed:
    - sites-check.run
  removed:
    - people.validate
appsImpacted:
  - webgogol-com
packagesImpacted:
  - "@gogol/share"
  - "@gogol/site-kernel-checks"
successSignals:
  - "The people collection supports six participant types: human, ai-agent, organization-unit, external-specialist, partner-organization, service-account — each with a closed vocabulary and type-specific required fields."
  - "Every Participant record carries: participantId, participantType, publicName, slug, status, relationshipType, and type-specific responsibility/authority/evidence fields."
  - "service-account participants are private by default and do not appear in any public surface."
  - "Human participants carry a consent record (consentRecordId, approvedFields, consentDate, profileReviewer) before they can be publicly visible."
  - "AI-agent participants carry an accountableHumanId — no public AI-agent profile exists without a named responsible human."
  - "participant.validate enforces the Participant contract, type-specific required fields, consent requirements, and public/private separation."
  - "Existing Person records (Andrii) are migrated to participantType: human with no loss of authored content."
nonGoals:
  - "Does not create new routes or pages — that is RFC-0509 (team hub), RFC-0510 (human profile restructure), and RFC-0511 (AI-agent profile)."
  - "Does not define the visual presentation of participant profiles — that is RFC-0509/0510/0511."
  - "Does not define JSON endpoints or Schema.org emission — that is RFC-0512."
  - "Does not define lifecycle transitions or retirement workflows — that is RFC-0513."
  - "Does not implement W3C Verifiable Credentials — the data model is forward-compatible but VC signing is out of scope."
---

# RFC-0508: Participant data model — canonical Participant entity, types, statuses, and consent

## Context

RFC-0200 introduced the People module with a canonical Person record per human per language, an embeddable People section, and gated per-member profile pages. The Person schema supports `name`, `role`, `photo`, `bio`, `affiliations`, `lifespan`, spotlight fields, and `page.enabled`. This model treats every record as a human — there is no concept of AI-agent participants, organizational units, external specialists, or partner organizations.

An external expert review (file 16.1) identifies a systemic gap: the team module should be a **public responsibility registry** that supports multiple participant types — humans, AI agents, teams, external specialists, partners — each with responsibility, authority, evidence, and accountability fields. The current Person schema cannot express these.

## Problem

1. **Single participant type.** The Person schema assumes every record is a human. AI agents, organizational units, and external specialists cannot be represented. The expert requires a `Participant` abstraction with six types.

2. **No responsibility/authority model.** The Person schema has `role` (a job title string) and `statement` (a freeform sentence) but no structured fields for responsibilities, decision authority, capabilities, prohibited actions, or evidence references. The expert requires a structured responsibility and authority model.

3. **No consent or public/private separation.** The Person schema has no consent record. Sensitive personal data (birth year, residence status, family medical history) lives alongside professional data with no gate. The expert requires explicit consent with approved fields, review date, and withdrawal route.

4. **No AI-agent accountability.** There is no `accountableHumanId` field. The expert requires every public AI-agent profile to name a responsible human.

5. **No lifecycle status.** The Person schema has no `status` field. The expert requires statuses (active, on-leave, former, retired, suspended, draft) to manage lifecycle transitions.

## Decision

Extend the `people` content collection to support a **Participant** abstraction. The collection name remains `people` (no migration of file paths), but records gain a `participantType` discriminator that selects type-specific required fields. The existing Person schema becomes the `human` participant type.

### Participant types

| Type | slug | Public by default | Key distinctions |
| --- | --- | --- | --- |
| Human | `human` | yes (with consent) | lifespan, personal background, consent record |
| AI-agent | `ai-agent` | yes (with accountableHumanId) | autonomyLevel, capabilities, prohibitedActions, technicalStand |
| Organization unit | `organization-unit` | yes | unitType, parentUnitId, leadParticipantId |
| External specialist | `external-specialist` | yes | organization, contractPeriod, scope |
| Partner organization | `partner-organization` | yes | organizationName, partnershipType, contactRoute |
| Service account | `service-account` | **no** | never public; internal automation only |

### Relationship types

```text
founder
employee
contractor
partner
advisor
operated-ai-system
former-member
```

`service-account` participants use `operated-ai-system` or no relationship type (internal only).

### Status vocabulary

| Status | Applies to | Meaning |
| --- | --- | --- |
| `active` | all | currently contributing |
| `temporarily-unavailable` | all | short-term pause |
| `on-leave` | human | personal leave |
| `former` | all | no longer contributing; profile retained for organizational significance |
| `retired` | all | formally retired; contact actions removed |
| `suspended` | all | under review; public visibility suppressed |
| `draft` | all | not yet published; not visible on any public surface |

### Canonical Participant schema

```ts
// packages/share/src/schemas/participant.ts

export const PARTICIPANT_TYPES = [
  "human",
  "ai-agent",
  "organization-unit",
  "external-specialist",
  "partner-organization",
  "service-account",
] as const;
export type ParticipantType = (typeof PARTICIPANT_TYPES)[number];

export const PARTICIPANT_RELATIONSHIPS = [
  "founder",
  "employee",
  "contractor",
  "partner",
  "advisor",
  "operated-ai-system",
  "former-member",
] as const;
export type ParticipantRelationship = (typeof PARTICIPANT_RELATIONSHIPS)[number];

export const PARTICIPANT_STATUSES = [
  "active",
  "temporarily-unavailable",
  "on-leave",
  "former",
  "retired",
  "suspended",
  "draft",
] as const;
export type ParticipantStatus = (typeof PARTICIPANT_STATUSES)[number];

export const participantSchema = z.object({
  // Identity
  slug: z.string(),
  participantType: z.enum(PARTICIPANT_TYPES),
  publicName: z.string(),
  relationshipType: z.enum(PARTICIPANT_RELATIONSHIPS).optional(),
  status: z.enum(PARTICIPANT_STATUSES).default("draft"),

  // Responsibility and authority (all types)
  responsibilities: z.array(z.string()).optional(),
  decisionAuthority: z.array(z.string()).optional(),
  capabilities: z.array(z.string()).optional(),
  prohibitedActions: z.array(z.string()).optional(),

  // Evidence and contributions
  evidenceRefs: z.array(z.object({
    label: z.string(),
    url: z.string().url().optional(),
    evidenceStatus: z.enum(["verified", "claimed", "unverified"]).default("claimed"),
  })).optional(),
  contributionRefs: z.array(z.object({
    label: z.string(),
    url: z.string().url().optional(),
    kind: z.enum(["product", "project", "research", "article", "methodology", "standard", "publication", "case-study"]).optional(),
  })).optional(),

  // Organization
  organizationUnitIds: z.array(z.string()).optional(),
  reportsToParticipantId: z.string().optional(),
  accountableParticipantId: z.string().optional(),

  // Contact
  location: z.string().optional(),
  languages: z.array(z.string()).optional(),
  contactModes: z.array(z.string()).optional(),
  publicContactRoute: z.string().optional(),

  // Lifecycle
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  lastReviewedAt: z.string().optional(),
  nextReviewAt: z.string().optional(),

  // Visibility
  visibility: z.enum(["public", "private"]).default("private"),
  profileOwner: z.string().optional(),
  retentionClass: z.enum(["permanent", "standard", "short-term"]).default("standard"),

  // Human-specific (participantType: human)
  name: z.string().optional(),
  role: z.string().optional(),
  photo: z.string().optional(),
  bio: z.string().optional(),
  affiliations: z.array(z.enum(PERSON_AFFILIATIONS)).default([]),
  // NOTE: PERSON_AFFILIATIONS is imported from packages/share/src/schemas/person.ts (retained by RFC-0471).
  order: z.number().int().nonnegative().optional(),
  lifespan: z.object({
    born: z.union([z.string(), z.number()]).optional(),
    died: z.union([z.string(), z.number()]).optional(),
  }).strict().optional(),
  statement: z.string().optional(),
  stats: z.array(z.object({ label: z.string(), value: z.string() }).strict()).optional(),
  cta: z.object({ label: z.string(), target: z.string() }).strict().optional(),
  sameAs: z.array(z.string().url()).optional(),
  page: z.object({ enabled: z.boolean().default(false) }).strict().optional(),
  live: z.record(z.any()).optional(),

  // Human consent (participantType: human, required when visibility: public)
  consent: z.object({
    consentRecordId: z.string(),
    approvedFields: z.array(z.string()),
    approvedMedia: z.array(z.string()).optional(),
    consentDate: z.string(),
    withdrawalRoute: z.string(),
    profileReviewer: z.string(),
  }).strict().optional(),

  // AI-agent-specific (participantType: ai-agent)
  aiAgent: z.object({
    autonomyLevel: z.enum(["A0", "A1", "A2", "A3", "A4"]),
    purposeStatement: z.string(),
    operator: z.string(),
    accountableHumanId: z.string(),
    operationalOwnerId: z.string().optional(),
    technicalMaintainerId: z.string().optional(),
    escalationRoute: z.string().optional(),
    approvalPolicy: z.string().optional(),
    reviewFrequency: z.string().optional(),
    rightsMatrix: z.array(z.object({
      action: z.string(),
      status: z.enum(["allowed", "approval-required", "prohibited", "not-applicable"]),
    })).optional(),
    dataAccess: z.array(z.object({
      category: z.string(),
      access: z.enum(["allowed", "restricted", "prohibited"]),
    })).optional(),
    technicalStand: z.object({
      agentId: z.string().optional(),
      agentVersion: z.string().optional(),
      modelProvider: z.string().optional(),
      modelFamily: z.string().optional(),
      toolsetVersion: z.string().optional(),
      lastEvaluatedAt: z.string().optional(),
      nextEvaluationAt: z.string().optional(),
    }).partial().optional(),
    knownLimitations: z.array(z.string()).optional(),
  }).strict().optional(),

  // Organization-unit-specific
  organizationUnit: z.object({
    unitType: z.enum(["team", "function", "department", "working-group"]),
    parentUnitId: z.string().optional(),
    leadParticipantId: z.string().optional(),
  }).strict().optional(),

  // External-specialist-specific
  externalSpecialist: z.object({
    organization: z.string(),
    contractPeriod: z.object({ start: z.string(), end: z.string().optional() }).strict().optional(),
    scope: z.string().optional(),
  }).strict().optional(),

  // Partner-organization-specific
  partnerOrganization: z.object({
    organizationName: z.string(),
    partnershipType: z.string().optional(),
    contactRoute: z.string().optional(),
  }).strict().optional(),
}).strict();
```

### Schema design: flat with discriminator vs discriminated union

The `participantSchema` uses a single flat `z.object({}).strict()` with `participantType` as a discriminator and all type-specific fields as optional, rather than `z.discriminatedUnion("participantType", [...])`. A discriminated union would require duplicating all shared fields (identity, responsibility, evidence, contact, lifecycle, visibility) across six variants, increasing maintenance cost and schema size. The flat schema with `.strict()` prevents unknown fields, and `participant.validate` enforces type-specific required fields at validation time — the schema is permissive, the validator is strict. This is the same pattern used by `systemManifestSchema` in `@gogol/ontology`.

### Public/private separation

Fields that are **always private** (never in public output, never in JSON-LD, never in profile.json):

- `consent.consentRecordId` (the ID is private; the consent fact is public)
- `profileOwner` (internal)
- `retentionClass` (internal)
- `aiAgent.technicalStand.agentId` (internal identifier)
- `aiAgent.technicalStand.toolsetVersion` (internal)
- `aiAgent.rightsMatrix` full ACL (public summary only — see RFC-0511)

Fields that require **consent approval** for humans:

- `lifespan.born` (birth year)
- `lifespan.died` (death year)
- `location` (city-level is public; street-level is private)
- `bio` (personal background paragraphs)
- `photo` (requires media rights record)
- `sameAs` (personal social profiles)

### Consent model

A human participant with `visibility: public` MUST have a `consent` record. The consent record specifies:

- `consentRecordId` — internal reference to the signed consent
- `approvedFields` — explicit list of field paths the person approved for public display
- `approvedMedia` — list of photo asset tokens approved for public display
- `consentDate` — when consent was given
- `withdrawalRoute` — how the person can withdraw (e.g. "email to operator")
- `profileReviewer` — who reviewed the profile for public publication

A human participant with `visibility: private` or `status: draft` does not require consent but also does not appear on any public surface.

### Consent approvedFields vocabulary

The `consent.approvedFields` array references field paths from the consent-gated fields list. The valid path vocabulary is:

- `lifespan.born` — birth year
- `lifespan.died` — death year
- `location` — city-level residence
- `bio` — personal background paragraphs
- `photo` — portrait image
- `sameAs` — personal social profile URLs

`participant.validate` fails when an `approvedFields` entry does not match one of these paths. Future RFCs may extend this vocabulary by adding paths to this list and the consent-gated fields section simultaneously.

### Migration of existing Person records

Existing Person records (Andrii) are migrated to `participantType: human` with:

- `participantType: human` added
- `status: active` added (default)
- `visibility: public` added (Andrii's profile is already public)
- `relationshipType: founder` added (derived from `affiliations: [founder]`)
- `consent` record added (Andrii is the profile owner and reviewer; consent date is the original publication date)
- All existing fields (`name`, `role`, `photo`, `bio`, `affiliations`, `lifespan`, `statement`, `stats`, `cta`, `sameAs`, `page`, `order`, `location`) are preserved

The migration is a content-only change to the people frontmatter — no file moves, no route changes.

### Backward compatibility

The `people` collection name and file paths (`src/content/people/{lang}/`) are unchanged. The `personSchema` was already removed from `packages/share/src/schemas/person.ts` by RFC-0471 — that file now exports only `PERSON_AFFILIATIONS` and `PersonAffiliation`, which are retained. The new `participantSchema` in `packages/share/src/schemas/participant.ts` is the canonical shape. `getPeopleForSection` and `getPersonProfileRoutes` are renamed to `getParticipantsForSection` and `getParticipantProfileRoutes` and updated to read `participantType` and filter accordingly. `personPageId` is renamed to `participantPageId`.

## Architectural fit

- **RFC-0200 (amended):** The People module's canonical Person record is extended to the Participant abstraction. The `people` collection, the `people` section, and the profile-page virtual-route mechanism are retained. `PERSON_AFFILIATIONS` is retained for human governance JSON-LD.
- **RFC-0008:** Participant records use RFC-0008 default-language deep-merge localization, same as Person records.
- **RFC-0024:** Participant records are a repeatable schema with dispatch — same infrastructure as Person.
- **RFC-0152:** Human participant photos remain content-asset tokens resolved through the Image Provider Port.
- **RFC-0471:** People records live in a standalone `people` content collection — this RFC extends the schema, not the collection location.
- **RFC-0478:** `versionBump: minor` — this is a Breaks-B change (the Person schema is superseded). A migrator (RFC-0479) transforms existing Person records to Participant records.
- **Compass sync:** `docs/requirements.xml` and `docs/technology.xml` may need updates to reflect the Participant abstraction. `docs/source-markup.xml` should be updated if new source files are added to `packages/share/src/schemas/` or `packages/os/site-kernel-checks/src/`.
- **DNA-24:** Block-declarative pages — participant data feeds block props, not inline page content.
- **DNA-53:** Semantic fingerprint governance — the schema change is tracked by `platform.consistency.validate`.

## Design

### CLI surface

```sh
# Validate the Participant contract for one site (or all). Joins apps-check.run.
pnpm exec site-kernel run participant.validate --site webgogol-com --json
pnpm exec site-kernel run participant.validate --all
```

`people.validate` is renamed to `participant.validate`. The old command name is removed (no backward compatibility). `participant.validate` joins `SITES_CHECK_AUTHOR_PIPELINE` (the same pipeline step where `people.validate` currently runs, between `article.depth.validate` and `faq.validate`).

### TypeScript contracts

```ts
// packages/share/src/schemas/participant.ts — the single canonical Participant shape.
export const participantSchema = z.object({ /* see above */ });
export type ParticipantData = z.infer<typeof participantSchema>;

// packages/share/src/astro/people.ts — updated to filter by participantType.
export interface ParticipantView extends PersonView {
  participantType: ParticipantType;
  status: ParticipantStatus;
  visibility: "public" | "private";
  responsibilities?: string[];
  decisionAuthority?: string[];
  capabilities?: string[];
  prohibitedActions?: string[];
  evidenceRefs?: Array<{ label: string; url?: string; evidenceStatus: string }>;
  contributionRefs?: Array<{ label: string; url?: string; kind?: string }>;
  // AI-agent fields
  aiAgent?: { /* see schema */ };
  // Consent
  consent?: { /* see schema */ };
}

export async function getParticipantsForSection(lang: string): Promise<ParticipantView[]>;
export async function getParticipantBySlug(slug: string, lang: string): Promise<ParticipantView | null>;
```

### File system responsibilities

| Path | Edit |
| --- | --- |
| `packages/share/src/schemas/participant.ts` | New file: `participantSchema`, `PARTICIPANT_TYPES`, `PARTICIPANT_RELATIONSHIPS`, `PARTICIPANT_STATUSES` |
| `packages/share/src/schemas/person.ts` | Unchanged — `PERSON_AFFILIATIONS` and `PersonAffiliation` retained (already the only exports since RFC-0471) |
| `packages/share/src/astro/people.ts` | `getPeopleForSection` → `getParticipantsForSection`; `PersonView` → `ParticipantView`; `personPageId` → `participantPageId` (re-export); filter by `participantType` and `visibility: public` |
| `packages/share/src/astro/people-routes.ts` | `getPersonProfileRoutes` → `getParticipantProfileRoutes`; `personPageId` → `participantPageId`; filter by `page.enabled` and `visibility: public` and `status: active` |
| `packages/share/src/astro/people-profile-defaults.ts` | Unchanged (base segment logic is the same) |
| `packages/share/src/astro/page-handler/resolve-route.ts` | Update imports: `getPeopleForSection` → `getParticipantsForSection`, `personPageId` → `participantPageId`, `PersonView` → `ParticipantView` |
| `packages/share/src/astro/routes/registry.ts` | Update import: `getPersonProfileRoutes` → `getParticipantProfileRoutes` |
| `packages/ui/src/sections/people/people-section.astro` | Update imports: `getPeopleForSection` → `getParticipantsForSection`, `PersonView` → `ParticipantView` |
| `packages/os/site-kernel-checks/src/participant.ts` | New file: `participant.validate` (replaces `people.ts`) |
| `packages/os/site-kernel-checks/src/people.ts` | Removed (replaced by `participant.ts`) |
| `packages/os/site-kernel-checks/src/pipelines/sites-check-author.ts` | Replace `people.validate` step with `participant.validate` |
| `missions/webgogol-com-m000010/workpiece/src/content/people/{de,uk}/andrii-syrokomskyi.md` | Migrate: add `participantType: human`, `status: active`, `visibility: public`, `relationshipType: founder`, `consent` record |

### Migrator

A migrator (RFC-0479) is registered for this RFC. The migrator matches the actual `Migrator` interface (`packages/os/site-kernel-handoff/src/migrators/types.ts`):

```ts
// packages/os/site-kernel-handoff/src/migrators/rfc-0508.ts
import type { Migrator, SternsystemData, MigrationContext } from "./types.ts";

export const rfc0508Migrator: Migrator = {
  id: "rfc-0508",
  fromVersion: "4.15.0",
  toVersion: "4.16.0",
  description: "Extend Person records to Participant records with participantType, status, consent",
  transform: async (data: SternsystemData, ctx: MigrationContext) => {
    // For each people/{lang}/*.md:
    // 1. Add participantType: human
    // 2. Add status: active (if page.enabled: true) or draft
    // 3. Add visibility: public (if page.enabled: true) or private
    // 4. Derive relationshipType from affiliations (founder → founder, board → advisor, etc.)
    // 5. Add consent record placeholder (profileOwner = slug, consentDate = file mtime, profileReviewer = slug)
    // 6. Preserve all existing fields
    // Idempotent: running twice produces the same result.
    return data;
  },
};
```

The migrator is registered in `packages/os/site-kernel-handoff/src/migrators/registry.ts` and accompanied by PBT (`rfc-0508.pbt.test.ts`) and snapshot (`rfc-0508.snapshot.test.ts`) tests, following the pattern of existing migrators (e.g. `rfc-0504.ts`).

### Output format

```json
{
  "command": "participant.validate",
  "status": "fail",
  "violations": [
    {
      "participant": "de/people/andrii-syrokomskyi",
      "rule": "missing-consent",
      "message": "human participant with visibility: public requires a consent record"
    },
    {
      "participant": "de/people/mira-ai-agent",
      "rule": "missing-accountable-human",
      "message": "ai-agent participant requires aiAgent.accountableHumanId"
    },
    {
      "participant": "de/people/internal-bot",
      "rule": "service-account-public",
      "message": "service-account participants must have visibility: private"
    }
  ]
}
```

### Failure modes

`participant.validate` exits non-zero on:

- A `participantType` outside the enum
- A human participant with `visibility: public` but no `consent` record
- An AI-agent participant without `aiAgent.accountableHumanId`
- A `service-account` participant with `visibility: public`
- A `status: former` or `status: retired` participant with an active `cta` (contact CTA must be removed)
- A `relationshipType` outside the enum
- A `status` outside the enum
- A `consent.approvedFields` entry that references a non-existent field path
- A human participant `photo` token that resolves to no content asset (carried from `people.validate`)
- A `sameAs` that is not an absolute URL (carried from `people.validate`)

It **warns** (does not fail) when:

- A participant has `page.enabled: true` but the site lacks the `team.profiles` entitlement
- A human participant `consent.consentDate` is older than 12 months (review reminder)
- An AI-agent participant `aiAgent.technicalStand.lastEvaluatedAt` is older than 6 months

## Rollout

- **Phase 0 — Schema + migrator.** Add `participantSchema` to `packages/share/src/schemas/participant.ts`. Register the RFC-0508 migrator. Run `mission.migrate` to transform existing Person records. Ship `participant.validate` v1 and join `SITES_CHECK_AUTHOR_PIPELINE` (replacing the `people.validate` step). `participant.validate` must not run before the migrator — pre-migration records without `participantType` fail validation. The migrator and validator ship together in the same mission.
- **Phase 1 — Loader + route updates.** Update `getPeopleForSection` → `getParticipantsForSection` and `getPersonProfileRoutes` → `getParticipantProfileRoutes`. Filter by `participantType`, `visibility`, and `status`. The `people` section continues to work (it only shows `human` participants by default).
- **Phase 2 — Consent enforcement.** `participant.validate` enforces consent requirements for public human profiles. Existing records get consent placeholders during migration.

## Alternatives considered

- **A separate `participants` collection.** Rejected — it would require duplicating the collection infrastructure (loader, dispatcher, routes) and migrating all existing people files to a new path. Extending the `people` collection schema is simpler and preserves file paths.
- **Keep Person schema and add a parallel AI-agent schema.** Rejected — the expert requires a unified Participant abstraction with shared responsibility/authority/evidence fields. A parallel schema would duplicate these fields and require two validators.
- **Make `participantType` optional with default `human`.** Rejected — the discriminator should be explicit. A default would allow records to silently remain `human` when they should be another type, and would make the schema less self-documenting.
- **`z.discriminatedUnion("participantType", [...])` instead of a flat schema.** Rejected — a discriminated union would require duplicating all shared fields (identity, responsibility, evidence, contact, lifecycle, visibility) across six variants, increasing maintenance cost. The flat schema with `.strict()` + `participant.validate` enforcement provides the same type safety with less duplication.

## Risks

- **Schema complexity.** The Participant schema is large (union of six type-specific shapes). Mitigated by the discriminator (`participantType`) selecting which sub-schema is required; `participant.validate` checks type-specific required fields.
- **Consent placeholder during migration.** The migrator adds a consent placeholder with `profileReviewer = slug` (self-reviewed). This is a temporary state — the operator should review and update the consent record. `participant.validate` warns when `consent.consentDate` is older than 12 months.
- **AI-agent accountability enforcement.** An AI-agent record without `accountableHumanId` fails validation. The operator must provide this field when creating AI-agent records.

## Acceptance criteria

- [x] `participantSchema` defined in `packages/share/src/schemas/participant.ts` with `PARTICIPANT_TYPES`, `PARTICIPANT_RELATIONSHIPS`, `PARTICIPANT_STATUSES`. (evidence: packages/share/src/schemas/participant.ts)
- [x] `personSchema` removed from `packages/share/src/schemas/person.ts`; `PERSON_AFFILIATIONS` retained. (evidence: packages/share/src/schemas/person.ts)
- [x] `getParticipantsForSection` and `getParticipantProfileRoutes` replace the Person equivalents in `packages/share/src/astro/`. (evidence: packages/share/src/astro/people.ts, packages/share/src/astro/people-routes.ts)
- [x] `participant.validate` registered in `apps-check.run`; `--json` output stable; no-op pass when a site has no people records. (evidence: packages/os/site-kernel-checks/src/command-tables/09-build-artifacts.ts, packages/os/site-kernel-checks/src/participant.ts)
- [x] RFC-0508 migrator registered in `packages/os/site-kernel-handoff/src/migrators/`; idempotent (PBT f(f(x))==f(x)). (evidence: packages/os/site-kernel-handoff/src/migrators/rfc-0508.ts, rfc-0508.pbt.test.ts)
- [x] Existing Andrii Person records migrated to `participantType: human` with `status: active`, `visibility: public`, `relationshipType: founder`, `consent` record (placeholder with `profileReviewer = slug` — human review pending). (evidence: missions/webgogol-com-m000010/workpiece/src/content/people/de/andrii-syrokomskyi.md)
- [x] `participant.validate` enforces: consent for public humans, `accountableHumanId` for AI agents, `visibility: private` for service-accounts, no active CTA for former/retired participants. (evidence: packages/os/site-kernel-checks/src/participant.ts)
- [x] `platform.consistency.validate` passes (semantic hash changed, `versionBump: minor` declared). (evidence: frontmatter versionBump: minor)
- [x] `rfc.validate` passes on this file before merging. (evidence: rfc.validate --root output, only V-19 warning)

## Implementation notes for agents

- Agents MUST add `participantType` to every people record. Records without `participantType` fail `participant.validate`.
- Agents MUST add a `consent` record before setting `visibility: public` on a human participant.
- Agents MUST add `aiAgent.accountableHumanId` before setting `visibility: public` on an AI-agent participant.
- Agents MUST NOT set `visibility: public` on a `service-account` participant.
- Agents MUST remove `cta` from participants with `status: former` or `status: retired`.
- Agents MUST NOT hardcode responsibility/authority text that contradicts PBP references — if a responsibility references a price or offering, use `{business-profile...}` references.
- Agents MUST update `packages/os/site-kernel-checks/src/pipelines/sites-check-author.ts` to replace the `people.validate` step with `participant.validate`.
