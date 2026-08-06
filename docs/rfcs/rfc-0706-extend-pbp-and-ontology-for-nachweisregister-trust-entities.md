---
id: RFC-0706
title: "Extend PBP and Ontology for Nachweisregister trust entities"
status: draft
kind: architecture
scope: workspace
owners:
  - architecture
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-08-06
updatedAt: 2026-08-06
enhancedAt: 2026-08-06
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - ADR-0028
  - RFC-0398
  - RFC-0405
  - RFC-0416
  - RFC-0417
  - RFC-0466
  - RFC-0355
  - RFC-0169
satisfies:
  - DNA-20
  - DNA-46
versionBump: minor
commands:
  proposed: []
  added: []
  changed:
    - pbp.content.validate
  removed: []
appsImpacted:
  - warpgogol-com
packagesImpacted:
  - "@warpgogol/pbp"
  - "@warpgogol/ontology"
  - "@warpgogol/share"
  - "@warpgogol/site-kernel-handoff"
successSignals:
  - "PBP EvidenceSource accepts new kind values without validation errors"
  - "PBP Consent entity validates and loads from business-profile content"
  - "Bordbuch accepts nachweis-record and nachweis-consent entry kinds"
  - "Entitlement catalog includes nachweis feature"
nonGoals:
  - "Does not implement Nachweis kernel commands (RFC-0707)"
  - "Does not implement UI components or site pages (RFC-0708)"
  - "Does not create Nachweis content records (RFC-0708)"
  - "Does not implement R2 storage integration (RFC-0707)"
  - "Does not implement the external specification's JSON Schema directly"
---

# RFC-0706: Extend PBP and Ontology for Nachweisregister trust entities

## Context

The Warpgogol Nachweisregister specification (v0.2) defines an evidence registry with client statements, project confirmations, certificates, and consent management. ADR-0028 establishes that this system extends the existing PBP trust layer and Bordbuch infrastructure rather than creating a parallel schema.

The current PBP trust layer has three entities:

- `pbp/claim@1` (RFC-0405) — `claimClass`, `claimKind`, `evidenceRefs`, `governance`
- `pbp/evidence-source@1` (RFC-0416) — `kind: enum(["external-web-sources", "verified-record", "third-party-registry"])`, `authority`, `items`
- `pbp/disclosure@1` (RFC-0417) — `kind`, `materiality`, `publication`

The Bordbuch system (RFC-0355) has a closed `BordbuchEntryKind` enum and a `WRITER_ROLE_KINDS` mapping. The entitlement system (RFC-0169) has a closed `ENTITLED_FEATURES` catalog with Stripe lookup-key mapping.

None of these currently support Nachweisregister concepts: file-based evidence with SHA-256 hashes, granular consent for publication of personal data, cryptographic verification levels (N0–N3), or a commercial module gate.

## Problem

1. **EvidenceSource `kind` enum is too narrow.** It covers web sources, verified records, and registries but not client statements, project confirmations, certificates, or operational evidence — the primary document types in Nachweisregister.

2. **EvidenceSource `items` lacks file-based evidence fields.** Current `items` value object has only `url` and `retrievedAt`. PDF documents need `sha256`, `storage` (private/public), `mediaType`, and `qualityStatus`.

3. **No Consent entity in PBP.** Consent (granular permission to publish personal data from an evidence document) is a distinct trust concern that does not fit into `Claim`, `EvidenceSource`, or `Disclosure`.

4. **Claim lacks source-language metadata.** Nachweis claims and quotes must declare the original document's language and mark translations separately. `Claim.statement` is a single-language `nonEmptyString` with no `statementLang` field.

5. **Bordbuch lacks Nachweis entry kinds.** The `BordbuchEntryKind` enum has no values for evidence record lifecycle events or consent changes. The `WRITER_ROLE_KINDS` mapping has no `nachweis` writer role.

6. **Entitlement catalog lacks `nachweis` feature.** The `ENTITLED_FEATURES` array and `STRIPE_FEATURE_LOOKUP_MAP` have no entry for the Nachweisregister commercial module.

## Decision

The PBP trust layer, Bordbuch ontology, and entitlement catalog are extended with Nachweisregister-specific types, fields, and enum values. All changes are additive and backward compatible within `pbp/*@1`.

### EvidenceSource enum extension

Four new `kind` values are added to `PbpEvidenceKind`:

- `client-statement` — client testimonial or thank-you letter
- `project-confirmation` — project completion confirmation (Bescheinigung)
- `certificate` — formal certificate
- `operational-evidence` — operational proof (uptime, delivery, etc.)

### EvidenceSource items extension

The `items` value object gains optional fields for file-based evidence:

- `sha256?: string` — SHA-256 hash of the source file (pattern `^[a-f0-9]{64}$`)
- `storage?: "private" | "public"` — storage location
- `mediaType?: string` — MIME type (e.g. `application/pdf`)
- `qualityStatus?: "unverified" | "verified" | "verified_with_quality_issue" | "changed" | "rejected"`

Existing `url` and `retrievedAt` become optional (for private documents without a public URL).

### New Consent entity (`pbp/consent@1`)

A new PBP entity type for granular consent management:

```ts
interface PbpConsent extends PbpEntity {
  type: "consent";
  name: string;
  textVersion: string;           // e.g. "NR-CONSENT-DE-0.1"
  purposes: string[];            // e.g. ["studio_reference_publication"]
  channels: string[];            // e.g. ["warpgogol.com"]
  dataElements: string[];        // what data is authorised for publication
  method: "verified_business_email" | "signed_pdf" | "qes" | "none";
  grantedAt: string | null;      // ISO 8601 datetime
  evidenceRef: string | null;    // Bordbuch entry ID or R2 path
  status: "not_requested" | "requested" | "partially_granted" | "granted" | "revoked" | "expired";
  withdrawalContact?: string;    // contact for revocation requests
}
```

### Claim extension

`PbpClaim` gains one optional field:

- `statementLang?: string` — BCP 47 language tag of the original statement (e.g. `"de"`, `"uk"`, `"en"`). When absent, the statement language is assumed to match the content file's language directory.

### Bordbuch extension

Two new `BordbuchEntryKind` values:

- `nachweis-record` — evidence record lifecycle event (ingest, hash fixation, verification level change, publication, withdrawal)
- `nachweis-consent` — consent lifecycle event (request, grant, revoke, expire)

New writer-role `nachweis` mapped to both kinds in `WRITER_ROLE_KINDS`.

### Entitlement extension

New `EntitledFeature` value `"nachweis"` added to `ENTITLED_FEATURES` and `STRIPE_FEATURE_LOOKUP_MAP` with key `"feature_nachweis"`.

## Architectural fit

- **PBP namespace (`pbp/*@1`):** Adding enum values and optional fields is backward compatible. Existing PBP content validates without changes. The new `Consent` entity follows the same envelope, schema, and collection patterns as other PBP entities.
- **Bordbuch (RFC-0355):** New entry kinds are additive to the Zod enum. The hash-chain and validation logic are kind-agnostic. The writer-role mapping is a simple record extension.
- **Entitlements (RFC-0169):** New feature follows the exact pattern of existing features (`trust`, `pseo`, `blog`). Stripe lookup-key mapping is a single record entry.
- **DNA alignment:** Extends DNA-20 (PBP as canonical business layer, superseded by RFC-0471 — PBP remains canonical via `pbp/*@1`) and DNA-46 (Mission lifecycle / Bordbuch — new entry kinds are additive to the hash-chained log). `PbpEvidenceKind` and `BordbuchEntryKind` are not DNA-19 closed enums; they are entity-type vocabularies extended additively within the frozen `pbp/*@1` namespace and the Bordbuch kind enum respectively.

## Design

### TypeScript contracts

```ts
// packages/pbp/src/entities/evidence-source.ts

export type PbpEvidenceKind =
  | "external-web-sources"
  | "verified-record"
  | "third-party-registry"
  // RFC-0706: Nachweisregister evidence types
  | "client-statement"
  | "project-confirmation"
  | "certificate"
  | "operational-evidence";

// items value object extension (in Zod schema)
items: z.record(
  z.string(),
  z.object({
    url: nonEmptyString.optional(),
    retrievedAt: nonEmptyString.optional(),
    // RFC-0706: file-based evidence fields
    sha256: z.string().pattern(/^[a-f0-9]{64}$/).optional(),
    storage: z.enum(["private", "public"]).optional(),
    mediaType: nonEmptyString.optional(),
    qualityStatus: z.enum([
      "unverified", "verified", "verified_with_quality_issue",
      "changed", "rejected",
    ]).optional(),
  }),
).optional();
```

```ts
// packages/pbp/src/entities/consent.ts (new file)

export const CONSENT_SCHEMA_ID = pbpSchemaId("consent");

export type PbpConsentMethod =
  | "verified_business_email" | "signed_pdf" | "qes" | "none";

export type PbpConsentStatus =
  | "not_requested" | "requested" | "partially_granted"
  | "granted" | "revoked" | "expired";

export interface PbpConsent extends PbpEntity {
  type: "consent";
  name: string;
  textVersion: string;
  purposes: string[];
  channels: string[];
  dataElements: string[];
  method: PbpConsentMethod;
  grantedAt: string | null;
  evidenceRef: string | null;
  status: PbpConsentStatus;
  withdrawalContact?: string;
}
```

```ts
// packages/pbp/src/entities/claim.ts (extension)

export interface PbpClaim extends PbpEntity {
  // ... existing fields ...
  statementLang?: string;  // BCP 47 tag, RFC-0706
}
```

```ts
// packages/ontology/src/operations/mission.ts (extension)

export const bordbuchEntryKindSchema = z.enum([
  // ... existing values ...
  "nachweis-record",    // RFC-0706
  "nachweis-consent",   // RFC-0706
]);

// packages/os/site-kernel-handoff/src/bordbuch/bordbuch-io.ts (extension)
const WRITER_ROLE_KINDS: Record<string, BordbuchEntryKind[]> = {
  // ... existing roles ...
  nachweis: ["nachweis-record", "nachweis-consent"],  // RFC-0706
};
```

```ts
// packages/share/src/entitlement.ts (extension)

export const ENTITLED_FEATURES = [
  // ... existing features ...
  "nachweis",  // RFC-0706
] as const;

export const STRIPE_FEATURE_LOOKUP_MAP: Record<string, EntitledFeature> = {
  // ... existing mappings ...
  feature_nachweis: "nachweis",  // RFC-0706
};
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/pbp/src/entities/evidence-source.ts` | Extend `PbpEvidenceKind` enum |
| `packages/pbp/src/schemas/evidence-source.ts` | Extend Zod schema with optional `items` fields |
| `packages/pbp/src/entities/consent.ts` | New `PbpConsent` entity type |
| `packages/pbp/src/schemas/consent.ts` | New Zod schema for `pbp/consent@1` |
| `packages/pbp/src/schemas/index.ts` | Register `consentSchema` in barrel, `pbpSchemaById`, and `pbpEntityDiscriminatedUnion` |
| `packages/pbp/src/index.ts` | Export `PbpConsent`, `PbpConsentMethod`, `PbpConsentStatus`, `CONSENT_SCHEMA_ID` from main barrel |
| `packages/pbp/src/entities/claim.ts` | Add optional `statementLang` field |
| `packages/pbp/src/schemas/claim.ts` | Add optional `statementLang` to Zod schema |
| `packages/ontology/src/operations/mission.ts` | Add `nachweis-record`, `nachweis-consent` to enum |
| `packages/os/site-kernel-handoff/src/bordbuch/bordbuch-io.ts` | Add `nachweis` writer-role mapping |
| `packages/share/src/entitlement.ts` | Add `nachweis` to `ENTITLED_FEATURES` and Stripe map |
| `src/content/business-profile/{lang}/consent/` | New content directory for Consent entities (flat pattern, matching `places/`, `offerings/`, etc.) |

**Not impacted:**

- `packages/pbp/src/astro.ts` — `pbpCollections` uses a permissive schema (`z.object({}).catchall(z.any())`) and defers validation to loaders via `pbpSchemaById`. No change needed.
- `packages/pbp/src/loaders.ts` — no typed `getPbpConsents` loader needed for MVP; the generic collection loader suffices. A typed loader may be added by RFC-0708 if the UI requires one.
- `packages/ontology/src/external-surfaces/` — NOT modified. The V-30 warning is a false positive: this RFC extends `operations/mission.ts`, not the C-contract surface. `breaksC` is not required.

### Failure modes

- `pbp.content.validate` fails if a Consent entity has `status: "granted"` but `grantedAt` is null — granted consent must record when it was granted.
- `pbp.content.validate` fails if `evidenceRef` is set but does not match the Bordbuch event ID pattern (`event-\d{6}`) or a valid R2 object key (format defined by RFC-0707).
- `pbp.content.validate` automatically picks up new schemas via the `pbpSchemaById` registry — no code change to the command itself is needed. The `commands.changed` entry reflects that the command's validation surface changes (new entity type, extended fields), not that the command source code must be modified.
- `bordbuch.validate` fails if a `nachweis-record` or `nachweis-consent` entry is appended with a writer-role other than `nachweis`.
- `entitlement.module.validate` fails if a site declares Nachweis blueprints without the `nachweis` entitlement resolved.

## Rollout

- **Default behavior:** All changes are additive. Existing sites without Nachweis content are unaffected — new enum values, optional fields, and the new `Consent` entity are invisible to sites that don't use them.
- **warpgogol-com adoption:** Add `entitlementsOverride: ["nachweis"]` to `system.md` for pilot operation (offline, no Stripe). Create Consent content files under `business-profile/{lang}/consent/`.
- **Client site adoption:** Stripe feature `feature_nachweis` activated via subscription. Site declares Nachweis surface module in `system.md` with `entitlement: "nachweis"`. `entitlements.resolve` fetches the feature from Stripe; `entitlement.module.validate` gates blueprint compilation.
- **Pipeline integration:** `pbp.content.validate` (in `build.check`) automatically validates new Consent entities and extended EvidenceSource fields. No new pipeline step needed for schema validation.

## Alternatives considered

- **Parallel JSON Schema (`nachweisregister-v0.1.schema.json`):** Rejected by ADR-0028. Would require duplicate validation, duplicate content collection wiring, and duplicate semantic projection.
- **Consent as Bordbuch metadata (not PBP entity):** Rejected. Consent is a business-trust concept that belongs in the PBP trust layer. Bordbuch stores the consent lifecycle event (when, who, hash), but the consent declaration itself (purposes, channels, data elements) is PBP content.
- **Nachweis as sub-feature of `trust` entitlement:** Rejected. `trust` gates the existing trust pages (claims, disclosures, evidence sources). Nachweisregister is a distinct commercial product with its own lifecycle, R2 storage, and Bordbuch integration. Combining them would prevent independent pricing.
- **Dedicated `pbp/nachweis-record@1` entity:** Deferred. If Claim field proliferation becomes problematic (more than 5 Nachweis-specific optional fields), a future `pbp/*@2` namespace may introduce it. See ADR-0028 Evolution section.

## Risks

- **PBP `Claim` field proliferation:** Adding `statementLang` is the first Nachweis-specific field on `Claim`. If more fields are needed (quotes, quality findings, publication gate), `Claim` may become overloaded. Mitigation: monitor field count; extract dedicated entity if threshold exceeded.
- **EvidenceSource `items` complexity:** Making `url` and `retrievedAt` optional changes the implicit contract that items always have a URL. Existing code that reads `items[].url` without null-checking may break. Mitigation: audit all `items` consumers before merging — this is an explicit acceptance criterion.
- **Open vocabularies on Consent:** `purposes`, `dataElements`, and `channels` are `string[]` without closed vocabulary validation. This is intentional for MVP — a future RFC may close these vocabularies if inconsistent authoring emerges. `textVersion` introduces a versioning scheme whose lifecycle (what happens when a consent text version changes, whether old consents remain valid) is deferred to RFC-0707.
- **`evidenceRef` format:** `evidenceRef` is `string | null`. When set, it is either a Bordbuch event ID (`event-\d{6}`, per `packages/ontology/src/operations/mission.ts`) or an R2 object key (format defined by RFC-0707). The resolver for R2 paths belongs to RFC-0707, not this RFC.
- **Bordbuch kind proliferation:** Adding 2 new kinds increases the enum from 15 to 17 values. The kind enum is not yet at a problematic size, but uncontrolled growth would make the bordbuch schema harder to maintain. Mitigation: document a kind-creation policy in a future RFC if needed.

## Acceptance criteria

- [ ] `PbpEvidenceKind` includes 4 new values: `client-statement`, `project-confirmation`, `certificate`, `operational-evidence`
- [ ] `evidenceSourceSchema` accepts optional `sha256`, `storage`, `mediaType`, `qualityStatus` in `items` values
- [ ] `evidenceSourceSchema` accepts `items` entries without `url` or `retrievedAt`
- [ ] New `PbpConsent` entity type and `consentSchema` defined in `packages/pbp/src/entities/consent.ts` and `packages/pbp/src/schemas/consent.ts`
- [ ] `consentSchema` registered in `pbpSchemaById` and `pbpEntityDiscriminatedUnion`
- [ ] `PbpClaim` has optional `statementLang: string` field
- [ ] `claimSchema` accepts optional `statementLang` without breaking existing claims
- [ ] `bordbuchEntryKindSchema` includes `nachweis-record` and `nachweis-consent`
- [ ] `WRITER_ROLE_KINDS` includes `nachweis` role mapped to both new kinds
- [ ] `ENTITLED_FEATURES` includes `"nachweis"`
- [ ] `STRIPE_FEATURE_LOOKUP_MAP` includes `"feature_nachweis": "nachweis"`
- [ ] `pbp.content.validate` validates Consent entities from `business-profile/{lang}/consent/`
- [ ] `bordbuch.validate` accepts entries with `nachweis-record` and `nachweis-consent` kinds
- [ ] `entitlements.validate` accepts `"nachweis"` in resolved features
- [ ] All `items` consumers audited for `url`/`retrievedAt` optionality — no unguarded access remains (evidence: `grep -rn 'items\[' packages/` shows all accesses use optional chaining or null guards)
- [ ] `PbpConsent`, `PbpConsentMethod`, `PbpConsentStatus`, `CONSENT_SCHEMA_ID` exported from `packages/pbp/src/index.ts` barrel
- [ ] All affected packages pass `build:check` (typecheck)
- [ ] `rfc.validate` passes on this file before merging

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `rfc.supersede.propose --id RFC-0706 --reason "..." --invariant "DNA-N"` instead of working around it.
- This RFC is a prerequisite for RFC-0707 (Nachweis kernel module) and RFC-0708 (UI + pages + content). Both depend on the schema extensions defined here.
