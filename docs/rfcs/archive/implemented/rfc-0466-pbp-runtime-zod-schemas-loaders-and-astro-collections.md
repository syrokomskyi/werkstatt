---
id: RFC-0466
title: "PBP Runtime — Zod Schemas, Loaders, and Astro Collections"
status: implemented
# kind options: architecture | contract | command | policy | deprecation
kind: architecture
# scope options: app | workspace
scope: workspace
owners:
  - architecture
# Set by the deciding human together with the status change (RFC-0335).
# Draft scaffolds must keep this empty; do not prefill a default identity.
# Format: human:<handle> (agent:<id> reserved — see RFC-0335).
# Default reviewer when none is specified by the operator: human:andrii-syrokomskyi
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-07-20
updatedAt: 2026-07-20
enhancedAt: 2026-07-20
implementedAt: 2026-07-20
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - DNA-1
  - DNA-20
  - DNA-55
  - RFC-0398
  - RFC-0399
  - RFC-0400
  - RFC-0403
  - RFC-0404
  - RFC-0405
  - RFC-0409
  - RFC-0410
  - RFC-0411
  - RFC-0412
  - RFC-0413
  - RFC-0414
  - RFC-0415
  - RFC-0416
  - RFC-0417
  - RFC-0418
  - RFC-0419
  - RFC-0420
  - RFC-0427
  - RFC-0429
  - RFC-0437
  - RFC-0439
  - RFC-0447
  - RFC-0448
  - RFC-0449
  - RFC-0450
  - RFC-0452
  - RFC-0461
  - RFC-0462
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-1
  - DNA-20
# RFC-0396: Traceability to a vendored spec node: "<spec-id>/<node-id>", e.g. "pbp/RFC-PBP-020".
# Set by spec.materialize; leave commented for non-spec RFCs.
# specRef:
commands:
  proposed: []
  added: []
  changed: []
  removed: []
appsImpacted: []
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - "@gogol/pbp"
successSignals:
  - "Zod schemas for all PBP Wave 1 entities are exported from @gogol/pbp/schemas"
  - "Typed locale-aware loaders (getPbpBusiness, getPbpOffering, etc.) are exported from @gogol/pbp/loaders"
  - "pbpCollections Astro content collection definitions are exported from @gogol/pbp/astro"
  - "tsc --noEmit and vitest run pass for @gogol/pbp"
  - "Golden fixture tests pass for each entity schema (positive and negative cases)"
nonGoals:
  - "Does not update packages/pbp/AGENTS.md — that is an implementation-time task, not an RFC concern"
  - "Does not define new entity interfaces — all interfaces are already defined in RFC-0399..0462"
  - "Does not implement the compiler pipeline — that is RFC-0467"
  - "Does not create PBP content files — that is RFC-0468"
  - "Does not switch sites from @gogol/business to @gogol/pbp — that is RFC-0469"
  - "Does not delete @gogol/business — that is RFC-0470"
  - "Does not define projection generators (website, AI answer, Schema.org) — contract only, implementation in RFC-0467"
# RFC-0268: OPTIONAL machine-checkable acceptance probes, executed on-demand
# via `pnpm exec site-kernel run rfc.acceptance.run --id <this-rfc-id>` (never
# automatically inside build pipelines). Closed probe vocabulary — see
# docs/rfcs/rfc-0268-make-rfc-acceptance-criteria-machine-checkable.md.
# acceptance:
#   - probe: run
#     command: "pnpm --filter @gogol/pbp run build:check"
#     expect:
#       exitCode: 0
#   - probe: run
#     command: "pnpm --filter @gogol/pbp run test"
#     expect:
#       exitCode: 0
#   - probe: file-exists
#     path: "packages/pbp/src/schemas/index.ts"
#   - probe: file-exists
#     path: "packages/pbp/src/loaders.ts"
#   - probe: file-exists
#     path: "packages/pbp/src/astro.ts"
---

## Design

**Normative source references:**

- `pbp-specification-package/entity-model` — §2–31 (all entity field models)
- `pbp-specification-package/compiler` — §3 (source inventory, parsing)
- `pbp-specification-package/system-spec` — §5 (architectural layers)
- `packages/business/src/` — legacy loader and Astro collection patterns to mirror

_This RFC materializes the runtime layer: Zod schemas, locale-aware loaders, and Astro content collections for all PBP Wave 1 entities. It bridges the gap between the 65 contract-only RFCs (RFC-0398..0462) and a working site._

# RFC-0466: PBP Runtime — Zod Schemas, Loaders, and Astro Collections

## Context

RFC-0398..0462 established the PBP program with 65 RFCs, all marked `implemented`. However, every one of these RFCs explicitly states `"Does not define Zod schemas"` as a non-goal. The result is that `packages/pbp/` contains only TypeScript interfaces — 30+ entity types, primitive types, migration contracts, and projection contracts — but zero Zod schemas imports, zero loader functions, and zero Astro content collection definitions.

The legacy `@gogol/business` package (DNA-20) has all of these: 12 Zod schemas in `src/schemas/`, typed locale-aware loaders in `src/loaders.ts`, and `businessCollections` in `src/astro.ts`. The site `webgogol-com` wires these in `content.config.ts` and calls `getBusinessCompany("de")` etc. from its pages.

Without Zod schemas, loaders, and Astro collections in `@gogol/pbp`, no site can consume PBP data. The migration plan (`pbp-specification-package/migration-plan`) and cutover checklist (RFC-0462) cannot be executed. This RFC closes the runtime gap.

## Problem

1. **No Zod schemas.** The 65 PBP RFCs define TypeScript interfaces but explicitly defer Zod schemas. Without Zod schemas, PBP content files cannot be validated at build time. The legacy `@gogol/business` package has 12 Zod schemas; PBP needs equivalents for 30+ entities.

2. **No loaders.** The legacy `@gogol/business` provides `getBusinessCompany(lang)`, `getBusinessServices(lang)`, etc. — typed, locale-aware, with deep-merge language fallback (RFC-0008). PBP has no equivalent. Sites cannot read PBP data without loaders.

3. **No Astro collections.** The legacy `@gogol/business/astro` exports `businessCollections` — Astro content collection definitions that register the `business` collection in `content.config.ts`. PBP has no equivalent. Sites cannot wire PBP content into Astro without this.

4. **No content directory contract.** The legacy package expects `src/content/business/{lang}/` with flat `.md` files. PBP needs a new directory structure (`src/content/business-profile/{lang}/`) that supports the entity graph (Business → LegalIdentity → Place → ContactPoint → WebPresence → Catalog → CatalogEntry → Offering → Policy → Claim → EvidenceSource → Disclosure → PublicDocument).

## Decision

### 1. Zod schemas for all Wave 1 entities

`packages/pbp/src/schemas/` is established as the home for Zod schemas. One file per entity, mirroring the interface structure from RFC-0399..0462. Each schema is a strict Zod object that validates the corresponding TypeScript interface.

**Entity schemas (Wave 1 — 20 entities):**

| File | Entity | Schema ID | RFC |
| --- | --- | --- | --- |
| `business.ts` | `PbpBusiness` | `pbp/business@1` | RFC-0403 |
| `legal-identity.ts` | `PbpLegalIdentity` | `pbp/legal-identity@1` | RFC-0409 |
| `brand.ts` | `PbpBrand` | `pbp/brand@1` | RFC-0410 |
| `place.ts` | `PbpPlace` | `pbp/place@1` | RFC-0411 |
| `contact-point.ts` | `PbpContactPoint` | `pbp/contact-point@1` | RFC-0412 |
| `web-presence.ts` | `PbpWebPresence` | `pbp/web-presence@1` | RFC-0413 |
| `category.ts` | `PbpCategory` | `pbp/category@1` | RFC-0414 |
| `product.ts` | `PbpProduct` | `pbp/product@1` | RFC-0404 |
| `product-group.ts` | `PbpProductGroup` | `pbp/product-group@1` | RFC-0415 |
| `product-variant.ts` | `PbpProductVariant` | `pbp/product-variant@1` | RFC-0415 |
| `catalog.ts` | `PbpCatalog`, `PbpCatalogEntry` | `pbp/catalog@1`, `pbp/catalog-entry@1` | RFC-0427 |
| `offering.ts` | `PbpOffering` | `pbp/offering@1` | RFC-0429 |
| `pricing.ts` | `PbpCharge`, `PbpPlan`, `PbpAdjustment` | (embedded in offering) | RFC-0437 |
| `terms.ts` | `PbpTerms` | (embedded in offering) | RFC-0438 |
| `policy.ts` | `PbpPolicy` | `pbp/policy@1` | RFC-0439 |
| `sla-policy.ts` | `PbpServiceLevelPolicy` | (extends policy) | RFC-0447 |
| `guarantee-policy.ts` | `PbpGuaranteePolicy` | (extends policy) | RFC-0448 |
| `ownership-policy.ts` | `PbpOwnershipPolicy` | (extends policy) | RFC-0449 |
| `exit-policy.ts` | `PbpExitPolicy` | (extends policy) | RFC-0450 |
| `data-retention-policy.ts` | `PbpDataRetentionPolicy` | (extends policy) | RFC-0452 |
| `claim.ts` | `PbpClaim` | `pbp/claim@1` | RFC-0405 |
| `evidence-source.ts` | `PbpEvidenceSource` | `pbp/evidence-source@1` | RFC-0416 |
| `disclosure.ts` | `PbpDisclosure` | `pbp/disclosure@1` | RFC-0417 |
| `public-document.ts` | `PbpPublicDocument` | `pbp/public-document@1` | RFC-0420 |

**Primitive schemas:**

| File | Types |
| --- | --- |
| `primitives.ts` | `PbpMoney`, `PbpMoneyRange`, `PbpLocalizedString`, `PbpQuantitativeValue`, `PbpExternalIdentifier`, `PbpControlledValue`, `PbpTimestamp`, `PbpIsoDuration`, `PbpQuantitativeDuration` |
| `envelope.ts` | `PbpEntity` (base envelope), `PbpGovernance`, `PbpEntityStatus` |
| `entity-ref.ts` | `PbpEntityRef` |

**Schema registry:**

```ts
export const pbpSchemaById: Record<string, z.ZodTypeAny> = {
  "pbp/business@1": businessSchema,
  "pbp/legal-identity@1": legalIdentitySchema,
  "pbp/brand@1": brandSchema,
  "pbp/place@1": placeSchema,
  "pbp/contact-point@1": contactPointSchema,
  "pbp/web-presence@1": webPresenceSchema,
  "pbp/category@1": categorySchema,
  "pbp/product@1": productSchema,
  "pbp/product-group@1": productGroupSchema,
  "pbp/product-variant@1": productVariantSchema,
  "pbp/catalog@1": catalogSchema,
  "pbp/catalog-entry@1": catalogEntrySchema,
  "pbp/offering@1": offeringSchema,
  "pbp/policy@1": policySchema,
  "pbp/claim@1": claimSchema,
  "pbp/evidence-source@1": evidenceSourceSchema,
  "pbp/disclosure@1": disclosureSchema,
  "pbp/public-document@1": publicDocumentSchema,
};
```

### 2. Locale-aware loaders

`packages/pbp/src/loaders.ts` provides typed, locale-aware loader functions with deep-merge language fallback, mirroring the legacy `@gogol/business` loader pattern.

**Loader functions:**

```ts
export const PBP_DEFAULT_LANGUAGE_CODE = "de";

export async function getPbpBusiness(languageCode?: string): Promise<PbpBusiness>;
export async function getPbpLegalIdentity(languageCode?: string): Promise<PbpLegalIdentity>;
export async function getPbpBrand(languageCode?: string): Promise<PbpBrand>;
export async function getPbpPlaces(languageCode?: string): Promise<Record<string, PbpPlace>>;
export async function getPbpContactPoints(languageCode?: string): Promise<Record<string, PbpContactPoint>>;
export async function getPbpWebPresences(languageCode?: string): Promise<Record<string, PbpWebPresence>>;
export async function getPbpProducts(languageCode?: string): Promise<Record<string, PbpProduct>>;
export async function getPbpCatalog(languageCode?: string): Promise<PbpCatalog>;
export async function getPbpCatalogEntries(languageCode?: string): Promise<Record<string, PbpCatalogEntry>>;
export async function getPbpOfferings(languageCode?: string): Promise<Record<string, PbpOffering>>;
export async function getPbpPolicies(languageCode?: string): Promise<Record<string, PbpPolicy>>;
export async function getPbpClaims(languageCode?: string): Promise<Record<string, PbpClaim>>;
export async function getPbpEvidenceSources(languageCode?: string): Promise<Record<string, PbpEvidenceSource>>;
export async function getPbpDisclosures(languageCode?: string): Promise<Record<string, PbpDisclosure>>;
export async function getPbpPublicDocuments(languageCode?: string): Promise<Record<string, PbpPublicDocument>>;
```

**Loader behavior:**

- Each loader reads from the `business-profile` Astro content collection.
- Default locale (`de`) is the canonical fallback anchor (RFC-0008, ADR-026).
- Non-default locale overrides are deep-merged onto the default locale entry.
- Entity IDs are locale-independent (ADR-025) — no `.de`, `/de/`, or other locale markers in IDs.
- Complex collections are keyed maps (ADR-027), not arrays.
- Loaders cache parsed entries per `languageCode:entityId` key, mirroring the legacy `businessEntryCache` pattern.

### 3. Astro content collections

`packages/pbp/src/astro.ts` exports `pbpCollections` — Astro content collection definitions for the `business-profile` content tree.

```ts
import type { CollectionConfig } from "./types.js";

export const pbpCollections: Record<string, CollectionConfig> = {
  "business-profile": {
    type: "content",
    schema: pbpEntitySchema, // discriminated union of all entity schemas
    loader: glob({
      pattern: "**/*.md",
      base: "src/content/business-profile",
    }),
  },
};
```

**Content directory contract:**

```
src/content/business-profile/
  de/                          # default locale (canonical)
    organization/
      business.md              # PbpBusiness
      legal-identity.md        # PbpLegalIdentity
      brand.md                 # PbpBrand
    places/
      <place-id>.md            # PbpPlace (repeatable)
    contact/
      <contact-id>.md          # PbpContactPoint (repeatable)
    web/
      <web-id>.md              # PbpWebPresence (repeatable)
    catalog/
      catalog.md               # PbpCatalog
      entries/
        <entry-id>.md          # PbpCatalogEntry (repeatable)
    products/
      <product-id>.md          # PbpProduct (repeatable)
    offerings/
      <offering-id>.md         # PbpOffering (repeatable)
    policies/
      <policy-id>.md           # PbpPolicy (repeatable)
    trust/
      claims/
        <claim-id>.md          # PbpClaim (repeatable)
      evidence/
        <evidence-id>.md       # PbpEvidenceSource (repeatable)
      disclosures/
        <disclosure-id>.md     # PbpDisclosure (repeatable)
    documents/
      <document-id>.md         # PbpPublicDocument (repeatable)
  uk/                          # non-default locale (overrides only)
    ...                        # only localized fields
```

**Frontmatter contract:**

Each `.md` file has YAML frontmatter that maps directly to the entity interface:

```yaml
---
schema: pbp/business@1
id: webgogol
type: business
status: published
name: WGogol
summary: ...
governance:
  authorityRef: ...
  effectiveFrom: 2026-01-01
  reviewEvery: P1Y
---
```

The `schema` field is the discriminator for the Zod discriminated union. The loader parses each entry, validates it against the corresponding schema, and returns the typed entity.

### 3.1 Astro collection discriminated union

The `pbpCollections` schema uses `z.discriminatedUnion('schema', [...])` — a Zod discriminated union keyed on the `schema` field. Each entity schema extends `pbpEntitySchema` with `type: z.literal(...)` and entity-specific fields. The discriminator (`schema`) selects the correct branch at parse time, producing a typed entity. This avoids manual `if/else` dispatch and ensures unknown `schema` values are rejected at the Zod level.

### 3.2 Embedded schemas (pricing, terms)

`pricing.ts` and `terms.ts` are separate schema files in `packages/pbp/src/schemas/` that are imported by `offering.ts`. They are not exported individually from `./schemas` — their schemas are composed into `offeringSchema` via `.extend()`. This keeps the file structure modular (one concept per file) while the public API exposes only the top-level entity schemas.

### 3.3 Zod dependency type

`zod` is a **direct dependency** of `@gogol/pbp`, not a peer dependency. Although `@gogol/business` currently provides `zod` transitively, `@gogol/business` will be deleted in RFC-0470. A direct dependency ensures `@gogol/pbp` survives independently after legacy deletion.

### 4. Schema validation rules

All Zod schemas enforce the invariants from the PBP specification:

- **No HTML in canonical fields** (ADR-037): string fields reject `<br>`, `<strong>`, etc.
- **No empty strings** (ADR-038): empty string `""` is rejected; use `not-declared` (omit the key) or explicit semantic status.
- **Money as decimal string** (ADR-012): `PbpMoney.value` is a string like `"70.00"`, not a number.
- **No locale in ID** (ADR-025): entity IDs must not contain locale markers.
- **Complex collections are keyed maps** (ADR-027): arrays are rejected where maps are required.
- **Entity status is a closed enum** (RFC-0399): `draft`, `published`, `suspended`, `retired`, `superseded`.
- **Schema ID pattern** (RFC-0399): `pbp/{entity}@{major}` — validated by `validateSchemaId`.

### 5. Package exports

`packages/pbp/package.json` gains three new export paths:

```json
{
  "exports": {
    ".": { "types": "./src/index.ts", "default": "./src/index.ts" },
    "./schemas": { "types": "./src/schemas/index.ts", "default": "./src/schemas/index.ts" },
    "./loaders": { "types": "./src/loaders.ts", "default": "./src/loaders.ts" },
    "./astro": { "types": "./src/astro.ts", "default": "./src/astro.ts" }
  }
}
```

The root barrel (`./src/index.ts`) continues to export all types. The new export paths provide the runtime layer:

- `@gogol/pbp/schemas` — Zod schemas and `pbpSchemaById` registry
- `@gogol/pbp/loaders` — typed locale-aware loader functions
- `@gogol/pbp/astro` — `pbpCollections` Astro content collection definitions

### 6. Dependencies

`packages/pbp/package.json` gains:

- `zod` (direct dependency — `@gogol/business` will be deleted in RFC-0470, so `@gogol/pbp` must own its `zod` dependency)
- `@gogol/content-source` (for Astro content loading — same as `@gogol/business`)
- `@gogol/share` (for `getEntryLanguage`, `stripEntryLanguage`, `toDataEntryId` — same as `@gogol/business`)
- `@gogol/site-kernel-content` (for `emitPipelineLogEvent` — same as `@gogol/business`)
- `astro` (for `defineCollection`, `glob` loader — same as `@gogol/business`)

## Documentation updates required

Upon implementation, the following files need synchronization:

- `packages/pbp/AGENTS.md` — add sections for `./schemas`, `./loaders`, `./astro` export paths and the `pbpCollections` wiring pattern.
- `docs/technology.xml` — add `@gogol/pbp` export paths to the package technology inventory.
- `docs/requirements.xml` — add the `src/content/business-profile/` content directory contract.

## Architectural fit

- **DNA-1 (Monorepo boundary).** All schemas, loaders, and collections live in `packages/pbp/`. No site-local schemas.
- **DNA-20 (Business layer).** This RFC does not delete `@gogol/business`. It creates the runtime layer that will eventually replace it (RFC-0470). Both coexist until cutover (RFC-0469).
- **DNA-55 (Spec vendoring).** Schema field models reference `pbp-specification-package/entity-model` sections, not copied content.
- **RFC-0398 (PBP Program Charter).** This RFC implements the "Business Catalog" and "Federated Identity" architectural layers defined in §4 of the charter.
- **RFC-0461/0462 (Migration/Cutover).** This RFC provides the runtime that the migration plan and cutover checklist operate on. Without it, `PbpCutoverChecklist.ready` can never be `true`.
- **Legacy `@gogol/business` patterns.** Loaders mirror the proven `getMergedBusinessData` deep-merge pattern. Astro collections mirror the `businessCollections` export pattern. This ensures a familiar migration path for sites.

## Implementation details

### CLI surface

No CLI command. Library-only.

### TypeScript contracts

```ts
// packages/pbp/src/schemas/envelope.ts
import { z } from "zod";

export const pbpEntityStatusSchema = z.enum([
  "draft", "published", "suspended", "retired", "superseded",
]);

export const pbpGovernanceSchema = z.object({
  authorityRef: z.string().min(1),
  effectiveFrom: z.string().optional(),
  reviewedAt: z.string().optional(),
  reviewEvery: z.string().optional(),
  maintenanceOwnerRef: z.string().optional(),
});

export const pbpEntitySchema = z.object({
  schema: z.string().refine((s) => /^pbp\/[a-z][a-z0-9-]*@\d+$/.test(s)),
  id: z.string().min(1),
  type: z.string().min(1),
  status: pbpEntityStatusSchema,
  name: z.string().min(1).optional(),
  summary: z.string().optional(),
  governance: pbpGovernanceSchema.optional(),
});

// packages/pbp/src/schemas/business.ts
import { z } from "zod";
import { pbpEntitySchema } from "./envelope.js";

export const businessSchema = pbpEntitySchema.extend({
  type: z.literal("business"),
  name: z.string().min(1),
  summary: z.string().optional(),
  description: z.string().optional(),
  businessModel: z.object({ typeRef: z.string() }).optional(),
  markets: z.record(z.object({ valueRef: z.string() })).optional(),
  industries: z.record(z.object({ categoryRef: z.string() })).optional(),
  yearEstablished: z.number().int().positive().optional(),
  mission: z.string().optional(),
  brandRefs: z.record(z.object({ ref: z.string(), expectedType: z.string().optional() })).optional(),
  legalIdentityRef: z.object({ ref: z.string(), expectedType: z.string().optional() }).optional(),
  placeRefs: z.record(z.object({ ref: z.string(), expectedType: z.string().optional(), role: z.string().optional() })).optional(),
  contactPointRefs: z.record(z.object({ ref: z.string(), expectedType: z.string().optional() })).optional(),
  webPresenceRefs: z.record(z.object({ ref: z.string(), expectedType: z.string().optional() })).optional(),
  catalogRefs: z.record(z.object({ ref: z.string(), expectedType: z.string().optional() })).optional(),
});
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/pbp/src/schemas/` | Zod schemas for all entities and primitives |
| `packages/pbp/src/schemas/index.ts` | Barrel: re-exports all schemas + `pbpSchemaById` registry |
| `packages/pbp/src/loaders.ts` | Typed locale-aware loader functions |
| `packages/pbp/src/astro.ts` | `pbpCollections` Astro content collection definitions |
| `packages/pbp/src/schemas/__tests__/` | Golden fixture tests (positive + negative) |
| `packages/pbp/package.json` | New export paths: `./schemas`, `./loaders`, `./astro` |

### Output format

N/A — library-only.

### Failure modes

- `tsc --noEmit` fails on type errors.
- `vitest run` fails on schema validation test failures.
- Astro build fails if PBP content files do not validate against Zod schemas.
- Loaders throw if a required entity (e.g. `PbpBusiness` singleton) is missing from the default locale.

## Rollout

- **Immediate:** Upon acceptance, Zod schemas, loaders, and Astro collections are implemented in `@gogol/pbp`.
- **No site impact:** Sites still use `@gogol/business` until RFC-0469 (Site Cutover). The new exports are available but not yet consumed by any site.
- **Golden fixtures:** Each entity schema ships with positive (valid entity) and negative (invalid entity) fixture tests. Fixtures are derived from the Webgogol target manifest blueprint (`pbp-specification-package/target-blueprint`).
- **Dependency chain:** RFC-0467 (Compiler) depends on this RFC. RFC-0468 (Content) depends on this RFC. RFC-0469 (Cutover) depends on RFC-0467 and RFC-0468. RFC-0470 (Legacy Deletion) depends on RFC-0469.

## Alternatives considered

- **Extend `@gogol/business` incrementally.** Rejected (ADR-002, RFC-0398 §Alternatives): the existing schema cannot represent Charge/Plan/Adjustment, federated product identity, typed Policies, or Claims with Evidence without a breaking rewrite.
- **Define schemas in each entity RFC.** Rejected: the 65 entity RFCs are contract-only by design (roadmap §2 principle 1: "One RFC — one architectural responsibility"). Adding implementation to each would require reopening 30+ implemented RFCs.
- **Use JSON Schema instead of Zod.** Rejected: the monorepo standard is Zod (used by `@gogol/business`, `@gogol/share`, `@gogol/ontology`, `@gogol/check-core`). Introducing a second validation framework creates friction.
- **Put schemas in a separate package.** Rejected: `@gogol/pbp` is the single home for all PBP types, schemas, loaders, and projection contracts (RFC-0399, `packages/pbp/AGENTS.md`).

## Risks

- **Schema drift from interfaces.** Zod schemas may diverge from the TypeScript interfaces defined in RFC-0399..0462. Mitigation: each schema file references the corresponding RFC in its header; golden fixture tests validate both the schema and the interface.
- **Migration complexity.** The PBP content directory structure is more complex than the legacy flat `business/{lang}/` tree. Mitigation: RFC-0468 (Content Creation) provides the detailed target tree and migration plan.
- **Performance.** Loading 30+ entity types with locale fallback may be slower than the legacy 12-schema approach. Mitigation: loaders cache parsed entries; the compiler (RFC-0467) provides incremental build support.
- **Empty state.** A site with no `src/content/business-profile/` directory will cause loaders to throw. Mitigation: loaders check for collection existence and throw a descriptive error (`PBP content directory not found at src/content/business-profile/. Create PBP content files first (RFC-0468).`) rather than crashing with an undefined error.
- **Zod version compatibility.** `@gogol/business` uses `zod@^4.4.3`. PBP must use the same major version to avoid schema incompatibility. Mitigation: `packages/pbp/package.json` pins the same `zod` version.

## Acceptance criteria

- [x] `packages/pbp/src/schemas/` directory created with Zod schemas for all Wave 1 entities (evidence: packages/pbp/src/schemas/index.ts, 2026-07-20)
- [x] `packages/pbp/src/schemas/index.ts` barrel exports all schemas and `pbpSchemaById` registry (evidence: packages/pbp/src/schemas/index.ts:96, 2026-07-20)
- [x] `packages/pbp/src/loaders.ts` exports typed locale-aware loader functions for all Wave 1 entities (evidence: getPbpBusiness, getPbpLegalIdentity, getPbpBrand, etc. — 2026-07-20)
- [x] `packages/pbp/src/astro.ts` exports `pbpCollections` Astro content collection definitions (evidence: packages/pbp/src/astro.ts:26, 2026-07-20)
- [x] `packages/pbp/package.json` has `./schemas`, `./loaders`, `./astro` export paths (evidence: package.json exports, 2026-07-20)
- [x] `packages/pbp/package.json` has `zod`, `@gogol/content-source`, `@gogol/share`, `@gogol/site-kernel-content`, `astro` dependencies (evidence: package.json deps, 2026-07-20)
- [x] Golden fixture tests pass for each entity schema (positive + negative cases) (evidence: 12 test files, 169 tests passed — 2026-07-20)
- [x] `tsc --noEmit` passes for `packages/pbp/` (evidence: pnpm --filter @gogol/pbp build:check — 2026-07-20)
- [x] `vitest run` passes for `packages/pbp/` (evidence: 12 files, 169 tests passed — 2026-07-20)
- [x] `rfc.validate` passes on this file before merging (RFC status: implemented) (evidence: pnpm exec site-kernel run rfc.validate RFC-0466, 2026-07-20)
- [x] No site imports from `@gogol/pbp` until RFC-0469 (cutover) (evidence: cutover completed in RFC-0469, 2026-07-20)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Schema files MUST reference the corresponding entity RFC in their header comment.
- Zod schemas MUST be strict (`z.strict()`) to reject unknown keys — no silent field drift.
- Loaders MUST follow the same deep-merge locale fallback pattern as `@gogol/business/src/loaders.ts`.
- The `pbpCollections` export MUST be at `@gogol/pbp/astro` (not the root barrel) to avoid requiring Astro in non-Astro contexts (e.g. site-kernel OS commands) — same pattern as `@gogol/business/astro`.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id RFC-0466 --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
