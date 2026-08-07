---
id: RFC-0482
title: "PBP presentation fields for legacy business data migration"
status: implemented
kind: architecture
scope: workspace
owners:
  - architecture
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-07-21
updatedAt: 2026-07-21
implementedAt: 2026-07-21
enhancedAt: 2026-07-22
supersedes: []
supersededBy:
  - RFC-0730
amends: []
amendedBy: []
related:
  - DNA-1
  - DNA-20
  - RFC-0045
  - RFC-0398
  - RFC-0466
  - RFC-0467
  - RFC-0471
  - RFC-0478
  - RFC-0481
satisfies:
  - DNA-1
versionBump: patch
commands:
  proposed: []
  added: []
  changed: []
  removed: []
appsImpacted:
  - warpgogol-com
packagesImpacted:
  - "@gogol/pbp"
successSignals:
  - "PBP offering, legal-identity, web-presence, public-document, and business schemas accept an optional `presentation` record"
  - "Existing PBP entities with extra fields (e.g. offerings/guarantees) validate without migration-mode strictness relaxation"
  - "Content references like {business-profile.offerings/digital-foundation.presentation.price.monthly} resolve to presentation strings"
  - "pnpm --filter @gogol/pbp build:check passes"
  - "pnpm --filter @gogol/pbp test passes"
nonGoals:
  - "Does not define presentation field sub-schemas — presentation is a flexible record keyed by site-specific display labels"
  - "Does not migrate content references — that is RFC-0483"
  - "Does not delete the legacy business/ collection — that is RFC-0483"
  - "Does not change the PBP compiler pipeline or semantic profile projection"
  - "Does not promote presentation fields to the PBP specification — they are a WGogol-side schema extension within the additive-only @1 namespace"
---

# RFC-0482: PBP presentation fields for legacy business data migration

## Context

RFC-0481 created the PBP `business.md` singleton and unblocked `astro build`, but explicitly deferred two items as `nonGoals`:

1. "Does not migrate content references (`{business.*.*}`) to `{business-profile.*.*}` — that is a separate future RFC"
2. "Does not delete the legacy `business/` directory — that is a separate future RFC after content references are migrated"

The legacy `business/` collection (stopgap, commit `2b4ed46cb`) keeps 329 content references across 32 files resolving. 61 unique reference patterns exist. Of these:

- ~20 map directly to existing PBP structural fields (e.g. `{business.legal.companyName}` → `{business-profile.organization/legal-identity.legalName}`)
- ~41 have **no PBP equivalent** — they are display-formatted strings (e.g. `{business.offer.price.monthly}` = `"70 € / Monat"`) or site-specific metadata (e.g. `{business.meta.agbEffectiveDate}` = `"2026/06/01"`)

### The presentation gap

PBP entities store **structured** data. For example, an offering stores:

```yaml
pricing:
  currency: EUR
  charges:
    monthlySubscription:
      amount:
        value: "70.00"
      recurrence: P1M
```

But content references (`{collection.file.field}` per RFC-0045) can only do dot-path field access — they cannot format strings. The legacy reference `{business.offer.price.monthly}` resolves to the presentation string `"70 € / Monat"`, not the raw numeric value `"70.00"`.

Similarly, the `uk/offerings/digital-foundation.md` entity already carries a `guarantees` block with `label`/`detail` pairs that have no PBP schema equivalent. The compiler currently accepts this only because it runs in `migration` strictness mode (RFC-0467), which relaxes validation. Moving to `production` mode would reject these fields.

### PBP namespace compatibility

The `pbp/*@1` namespace is frozen (RFC-0398):

> No key renames, no semantic changes, no optional→required promotions within `@1`. Incompatible changes require `@2` and a migration contract.

Adding a new **optional** field to an existing schema is **additive-only** — it does not rename keys, change semantics, or promote optional to required. This is permitted within `@1`.

## Problem

Without presentation fields in PBP schemas, the 41 non-structural reference patterns cannot be migrated to `{business-profile.*}`. This blocks:

1. RFC-0483 (content reference migration) — 41/61 patterns have no PBP target
2. Deletion of the legacy `business/` collection — references would break
3. Compiler strictness upgrade — extra fields in offerings (guarantees, capacity, growthModules) are rejected by `.strict()` Zod schemas in `production` mode

## Decision

### 1. Add `presentation` record to five PBP entity schemas

Add an optional `presentation` field to the Zod schemas of:

| Entity | Schema file | Purpose |
| --- | --- | --- |
| `offering` | `src/schemas/offering.ts` | Price labels, guarantee labels/details, capacity display, growth module labels/prices, changePrice, hourlyRate, billingDay |
| `legal-identity` | `src/schemas/legal-identity.ts` | Tax number, VAT ID / small business note |
| `web-presence` | `src/schemas/web-presence.ts` | Domain names (primary, locale-specific) |
| `public-document` | `src/schemas/public-document.ts` | Document metadata dates (effective, review, creation) |
| `business` | `src/schemas/business.ts` | Miscellaneous presentation fields not scoped to a specific entity |

The field type is:

```typescript
presentation: z.record(z.string(), z.unknown()).optional()
```

This is a flexible bag — presentation data is inherently site-specific and does not belong in the PBP specification's structural model. Sites store display-formatted strings under `presentation.*` and content references resolve them via standard dot-path field access.

### 2. Schema change is additive-only within `@1`

- New optional field on existing schemas — no existing field changed
- No key renames, no semantic changes, no optional→required promotions
- Entities without `presentation` validate unchanged
- Entities with `presentation` validate without migration-mode relaxation

### 3. No PBP spec change

The `presentation` field is a **WGogol-side schema extension**, not a PBP specification change. The PBP spec (vendored at `docs/specs/pbp-specification-package/`) defines the structural entity model. Presentation data is a WGogol content-reference compatibility layer that lives in the WGogol schema implementation (`packages/pbp/src/schemas/`).

The `pbp/*@1` namespace contract is preserved: the schema ID remains `pbp/{entity}@1`, no `@2` migration contract is needed.

### 4. No compiler or projection changes

The PBP compiler (`compilePbpProfile`) and semantic profile (`buildPbpSemanticProfile`) do not need changes. Presentation fields are not projected into JSON-LD, CRM, or AI projections — they exist solely for content reference resolution in markdown/prose rendering.

### 5. Schema scope: 5 entities for current migration

The `presentation` field is added to 5 entity schemas (offering, legal-identity, web-presence, public-document, business) because these are the entities that carry legacy display-formatted strings requiring migration in the warpgogol-com site. Other entity schemas (product, place, contact-point, brand, catalog, etc.) may receive `presentation` fields in the future via a new RFC when a site migration requires it. This RFC does not claim the list is exhaustive — it is the minimum set needed to unblock RFC-0483.

## Architectural fit

- **DNA-20 (superseded):** This RFC extends the replacement layer (`@gogol/pbp`) to cover the presentation data that the old `@gogol/business` layer handled via flat frontmatter fields.
- **RFC-0045 (Content references):** Presentation fields are resolved by the standard content-reference mechanism — no new resolution logic needed.
- **RFC-0398 (PBP namespace):** Additive-only within `@1` — no namespace version bump.
- **RFC-0466 (PBP runtime schemas):** Extends the Zod schema registry with new optional fields on existing schemas.
- **RFC-0467 (PBP compiler):** The compiler's `migration` strictness mode currently relaxes validation for extra fields. This RFC enables moving to `production` mode.
- **RFC-0471 (Delete @gogol/business):** Enables completing the migration by providing a PBP target for all legacy reference patterns.
- **RFC-0478 (Platform versioning):** `versionBump: patch` — additive optional fields, no data contract break, no migrator required.
- **RFC-0481 (Business singleton):** This RFC is the prerequisite for RFC-0483, which fulfills RFC-0481's deferred non-goal.

## Design

### Schema changes

#### `packages/pbp/src/schemas/offering.ts`

```typescript
export const offeringSchema = pbpEntitySchema.extend({
  // ... existing fields ...
  presentation: z.record(z.string(), z.unknown()).optional(),
}).strict();
```

#### `packages/pbp/src/schemas/legal-identity.ts`

```typescript
export const legalIdentitySchema = pbpEntitySchema.extend({
  // ... existing fields ...
  presentation: z.record(z.string(), z.unknown()).optional(),
}).strict();
```

#### `packages/pbp/src/schemas/web-presence.ts`

```typescript
export const webPresenceSchema = pbpEntitySchema.extend({
  // ... existing fields ...
  presentation: z.record(z.string(), z.unknown()).optional(),
}).strict();
```

#### `packages/pbp/src/schemas/public-document.ts`

```typescript
export const publicDocumentSchema = pbpEntitySchema.extend({
  // ... existing fields ...
  presentation: z.record(z.string(), z.unknown()).optional(),
}).strict();
```

#### `packages/pbp/src/schemas/business.ts`

```typescript
export const businessSchema = pbpEntitySchema.extend({
  // ... existing fields ...
  presentation: z.record(z.string(), z.unknown()).optional(),
}).strict();
```

### Content authoring pattern

Legacy `business/de/offer.md`:

```yaml
price:
  monthly: "70 € / Monat"
  yearly: "700 € / Jahr"
  setup: "200 €"
guarantees:
  delivery:
    label: "Fertig in 12 Werktagen"
    detail: "Nach Erhalt Ihrer Materialien ist Ihre Seite online."
```

Migrated `business-profile/de/offerings/digital-foundation.md`:

```yaml
schema: pbp/offering@1
id: https://warpgogol.com/id/offerings/digital-foundation
type: offering
# ... structural fields (pricing, package, relatedOfferings) ...
presentation:
  price:
    monthly: "70 € / Monat"
    yearly: "700 € / Jahr"
    setup: "200 €"
    monthlyAmount: "70"
    yearlyAmount: "700"
    setupAmount: "200"
  guarantees:
    delivery:
      label: "Fertig in 12 Werktagen"
      detail: "Nach Erhalt Ihrer Materialien ist Ihre Seite online."
    # ... other guarantees ...
  capacity:
    display:
      label: "Aktuelle Welle"
      rangeLabel: "3-4 Websites pro Monat"
  growthModules:
    visibility:
      label: "Gefunden werden"
      price: "+29 € / Monat / bis zu 12 Zielseiten"
    # ... other modules ...
  changePrice: "15"
  hourlyRate: "90"
  billingDay: "1"
```

Content reference migration:

```
{business.offer.price.monthly}              → {business-profile.offerings/digital-foundation.presentation.price.monthly}
{business.offer.guarantees.delivery.label}  → {business-profile.offerings/digital-foundation.presentation.guarantees.delivery.label}
{business.offer.changePrice}                → {business-profile.offerings/digital-foundation.presentation.changePrice}
```

### Legal identity presentation

Legacy `business/de/legal.md`:

```yaml
tax:
  taxNumber: "46110173928"
  vatIdOrSmallBusinessNote: ""
```

Migrated `business-profile/de/organization/legal-identity.md`:

```yaml
schema: pbp/legal-identity@1
# ... structural fields ...
presentation:
  tax:
    taxNumber: "46110173928"
    vatIdOrSmallBusinessNote: ""
```

### Web presence presentation

Legacy `business/de/web.md`:

```yaml
domains:
  primary: warpgogol.com
  german: warpgogol.com
```

Migrated `business-profile/de/web/primary.md`:

```yaml
schema: pbp/web-presence@1
# ... structural fields ...
presentation:
  domains:
    primary: warpgogol.com
    german: warpgogol.com
```

### Public document presentation

Legacy `business/de/meta.md`:

```yaml
agbEffectiveDate: "2026/06/01"
agbNextReviewDate: "2027/06/01"
```

Migrated: distributed to the relevant `business-profile/de/documents/*.md` entities:

```yaml
# business-profile/de/documents/terms.md
schema: pbp/public-document@1
kind: terms-and-conditions
# ... structural fields ...
presentation:
  dates:
    effectiveDate: "2026/06/01"
    nextReviewDate: "2027/06/01"
```

### Business presentation

For fields that don't scope to a specific entity (e.g. `platform-comparison.display.*`, `services.websiteDevelopment.backupRetentionDays`):

```yaml
# business-profile/de/business.md
schema: pbp/business@1
# ... structural fields ...
presentation:
  platformComparison:
    display:
      pageText: "..."
      disclosure: "..."
  services:
    websiteDevelopment:
      backupRetentionDays: "30"
```

### Locale overlay interaction

The compiler's `resolveLocales` phase (RFC-0467, `src/compiler/locale.ts`) performs deep-merge of non-default locale overlays onto default locale entities. This means `presentation` fields are automatically deep-merged: if `de/business.md` has `presentation: { price: { monthly: "70 € / Monat" } }` and `uk/business.md` has no `presentation` block, the resolved `uk/` entity will inherit the German presentation strings.

**Decision:** Accept the deep-merge behavior as fallback. Each locale should author its own `presentation` block with locale-appropriate display strings. The compiler's fallback report (`PbpFallbackReport`) will flag presentation fields that fall back to the default locale, allowing operators to identify missing translations. No modification to the locale resolution phase is needed.

If a locale does not author a `presentation` block, it inherits the default locale's presentation data. This is acceptable for locale-invariant data (e.g. numeric amounts) but not for display strings (e.g. "70 € / Monat"). Operators should author presentation blocks in every locale that has display-formatted strings.

### Empty and null presentation values

With `z.record(z.string(), z.unknown()).optional()`, an empty record `presentation: {}` validates successfully. A `null` value is rejected — the field is optional (may be absent), not nullable. An entity with no presentation data should omit the field entirely, not set it to `null`.

## Rollout

- **Upon acceptance:** Schema changes are backward-compatible (additive optional fields). No migrator needed — existing entities without `presentation` validate unchanged. `versionBump: patch` per RFC-0478.
- **warpgogol-com:** RFC-0483 migrator will move legacy data into `presentation.*` fields as part of the content reference migration.
- **Compiler strictness:** After this RFC, the compiler can move from `migration` to `production` mode for entities that currently carry extra fields (offerings with `guarantees`). The `presentation` field will accept them.
- **New Sternsystems:** Onboarding templates may include `presentation` blocks in PBP entity templates. Not required — `presentation` is optional.
- **AGENTS.md update:** `packages/pbp/AGENTS.md` should be updated to document the `presentation` field in the Runtime layer section.

## Alternatives considered

- **Create a separate `site-presentation` content collection.** Rejected: fragments business data across two collections, violating the single-source-of-truth principle. Presentation data is entity-scoped and belongs on the entity.

- **Extend RFC-0045 content references to support formatters.** Rejected: adds complexity to the reference resolution mechanism (`{collection.file.field|formatCurrency}`) and changes a foundational RFC. A flexible `presentation` record achieves the same goal with zero resolver changes.

- **Define typed sub-schemas for each presentation field.** Rejected: presentation data is site-specific (different sites have different price formats, guarantee labels, meta dates). A `z.record(z.string(), z.unknown())` bag is the right granularity — structural validation belongs in the PBP spec, not in presentation.

- **Bump to `pbp/*@2`.** Rejected: adding optional fields is additive within `@1`. A namespace bump requires a migration contract and breaks all existing entities. No breaking change is being made.

## Risks

- **Loose typing of presentation data.** The `z.record(z.string(), z.unknown())` type does not validate the structure of presentation values. A typo in a presentation key (e.g. `prcie` instead of `price`) will not be caught at build time. Mitigation: `content.references.validate` will catch references to non-existent paths, and the site's check pipeline can add a presentation-key validator if needed.

- **Presentation data divergence across locales.** The `de/` and `uk/` presentation blocks may diverge if operators edit one locale but not the other. The compiler's `resolveLocales` deep-merge will cause a missing `presentation` block in one locale to inherit the default locale's presentation data. Mitigation: operators should author `presentation` blocks in every locale. The fallback report (`PbpFallbackReport`) flags inherited presentation paths, making missing translations visible.

- **Future PBP spec conflict.** If the PBP specification later defines a `presentation` field with a different semantic, WGogol's extension may conflict. Mitigation: the field name `presentation` is generic enough that a spec-level field would likely align. If not, a rename is additive (add new field, deprecate old).

## Acceptance criteria

- [x] `packages/pbp/src/schemas/offering.ts` includes `presentation: z.record(z.string(), z.unknown()).optional()` (evidence: packages/pbp/src/schemas/offering.ts:72)
- [x] `packages/pbp/src/schemas/legal-identity.ts` includes `presentation: z.record(z.string(), z.unknown()).optional()` (evidence: packages/pbp/src/schemas/legal-identity.ts:44)
- [x] `packages/pbp/src/schemas/web-presence.ts` includes `presentation: z.record(z.string(), z.unknown()).optional()` (evidence: packages/pbp/src/schemas/web-presence.ts:28)
- [x] `packages/pbp/src/schemas/public-document.ts` includes `presentation: z.record(z.string(), z.unknown()).optional()` (evidence: packages/pbp/src/schemas/public-document.ts:25)
- [x] `packages/pbp/src/schemas/business.ts` includes `presentation: z.record(z.string(), z.unknown()).optional()` (evidence: packages/pbp/src/schemas/business.ts:42)
- [x] `pnpm --filter @gogol/pbp build:check` passes (tsc --noEmit) (evidence: exit code 0, 2026-07-22)
- [x] `pnpm --filter @gogol/pbp test` passes (existing tests + new test verifying presentation field acceptance) (evidence: 174 tests passed, golden-fixtures.test.ts 39 tests)
- [x] An offering entity with `presentation: { price: { monthly: "70 € / Monat" } }` validates in `production` compiler mode (evidence: golden-fixtures.test.ts:297, "accepts presentation field with price labels")
- [x] An offering entity without `presentation` validates unchanged (evidence: golden-fixtures.test.ts:282, "accepts a valid offering entity")
- [x] `rfc.validate` passes on this file (evidence: rfc.validate RFC-0482 --json, status: pass, 2026-07-22)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- The `presentation` field MUST be added to the Zod schema definitions in `packages/pbp/src/schemas/`, not to the PBP spec snapshot in `docs/specs/pbp-specification-package/`.
- The `presentation` field MUST be `z.record(z.string(), z.unknown()).optional()` — not a typed sub-schema. Site-specific presentation data is intentionally loose-typed.
- Schema files MUST carry `MODULE_CONTRACT` and `CHANGE_SUMMARY` Compass scaffolding (DNA-42). Update `CHANGE_SUMMARY` with the RFC-0482 entry.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
