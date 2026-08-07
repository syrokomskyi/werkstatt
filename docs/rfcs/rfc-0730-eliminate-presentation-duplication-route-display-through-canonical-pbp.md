---
id: RFC-0730
title: "Eliminate presentation duplication and route display through canonical PBP"
status: draft
kind: architecture
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-08-07
updatedAt: 2026-08-07
implementedAt:
closedAt:
supersedes:
  - RFC-0482
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0400
  - RFC-0437
  - RFC-0466
  - RFC-0482
  - RFC-0527
  - RFC-0529
  - RFC-0570
  - RFC-0728
  - RFC-0729
  - pbp-specification-package/ADR-012
satisfies:
  - DNA-4
  - DNA-55
versionBump: minor
commands:
  proposed: []
  added: []
  changed: []
  removed: []
appsImpacted:
  - warpgogol-com
packagesImpacted:
  - "@warpgogol/pbp"
  - "@warpgogol/share"
  - "@warpgogol/ui"
nonGoals:
  - "Does not enforce pbpPlanSchema on pricing.plans — left as z.unknown() (deferred by RFC-0728)"
  - "Does not enforce pbpAdjustmentSchema on pricing.adjustments — left as z.unknown() (deferred by RFC-0728)"
  - "Does not remove presentation from non-offering entities (legal-identity, web-presence, public-document, business) — those store display-only metadata (dates, domains, tax) without canonical duplication"
  - "Does not implement currency conversion exchange rate feeds — only the formatter API accepts optional targetCurrency + rate (RFC-0729)"
  - "Does not add new kernel commands or validators"
---

# RFC-0730: Eliminate presentation duplication and route display through canonical PBP

## Context

The PBP offering schema (RFC-0482) carries an optional `presentation: z.record(z.string(), z.unknown())` field for site-specific display-formatted strings. In the warpgogol-com `digital-foundation.md` offering, `presentation` contains:

1. **`price`** — display-formatted price strings (`monthly: 70 € / місяць`) that duplicate `pricing.charges` canonical decimal strings (`monthlySubscription.amount.value: "70.00"`).
2. **`guarantees`** — display-formatted guarantee labels/details that duplicate the canonical `guarantees` field.
3. **`capacity`** — operational slot config (timezone, slotRange, cadence, display labels) with no canonical PBP field.
4. **`growthModules`** — display labels/descriptions for related offerings with inline prices, partially duplicating related offering files.
5. **`changePrice`, `hourlyRate`, `billingDay`** — legacy keys already flagged by `PBP-LEGACY-KEY` in `semantic.ts`.

This creates two problems:

- **Data duplication.** `presentation.price` and `presentation.guarantees` are manual copies of canonical data. When canonical values change, presentation must be manually updated. Divergence is silent — there is no validation linking the two.
- **Validation conflicts.** `walkStrings` in `semantic.ts` traverses all entity strings including `presentation`. Values like `"70 € / місяць"` match `PRESENTATION_MONEY_RE` → `PBP-MONEY` error. Key `price` is in `LEGACY_KEYS` → `PBP-LEGACY-KEY` error. The presentation field is structurally incompatible with the semantic validator.

RFC-0728 enforces `pbpChargeSchema` on `pricing.charges`, making canonical decimal strings the strict source of truth. RFC-0729 provides the `money` pipe formatter for render-time display formatting. This RFC eliminates the duplication by removing `presentation` from offering entities and routing all display through canonical references + pipe formatting.

## Problem

1. **`presentation.price` duplicates `pricing.charges`.** The same monetary values exist in two places: canonical (structured, validated) and presentation (loose, manual). Changes to canonical do not propagate to presentation.

2. **`presentation.guarantees` duplicates `guarantees`.** The same guarantee text exists in two places. Canonical `guarantees` has structured fields; presentation has display-formatted label/detail pairs.

3. **`presentation` triggers validation errors.** `PBP-MONEY` flags presentation money strings. `PBP-LEGACY-KEY` flags the `price` key. The presentation field is incompatible with the semantic validator.

4. **`capacity` and `growthModules` have no canonical home.** They are legitimate offering data (slot capacity, related module display info) trapped in the presentation layer because the PBP schema does not model them.

5. **`changePrice`, `hourlyRate`, `billingDay` are legacy keys.** They are flagged as errors but contain real business data (overage charge, hourly rate, billing day) that belongs in canonical fields.

## Decision

### 1. Remove `presentation` from offering entities

The `presentation` field is removed from all offering content files. The `offeringSchema` field remains in the Zod schema as `z.record(z.string(), z.unknown()).optional()` for backward compatibility with non-offering entities that still use it (legal-identity, web-presence, public-document, business). Offering files MUST NOT include `presentation`.

### 2. Migrate presentation data to canonical fields

| Presentation block | Canonical destination |
| --- | --- |
| `price` (monthly, yearly, setup) | Already in `pricing.charges` — no migration needed, references updated to canonical |
| `guarantees` (label, detail) | Already in `guarantees` — no migration needed, references updated to canonical |
| `capacity` (slots, cadence, display) | `fulfillment.capacity` — new structured sub-object in `fulfillment` |
| `growthModules` (label, description, price) | `relatedOfferings` extended with optional display fields |
| `changePrice` | `pricing.charges.additionalChange` — charge with `type: usage`, `model: unit-rate`, `purpose: additional-change` |
| `hourlyRate` | `pricing.charges.hourlyWork` — charge with `type: usage`, `model: unit-rate`, `purpose: hourly-work` |
| `billingDay` | `fulfillment.billingDay` — number in `fulfillment` |

### 3. Extend `pbpRelatedOfferingSchema` with display fields

```ts
const pbpRelatedOfferingSchema = z.object({
  relation: pbpOfferingRelationSchema,
  offeringRef: pbpEntityRefSchema,
  acquisition: pbpOfferingAcquisitionSchema.optional(),
  // New: optional display fields for UI rendering
  label: nonEmptyString.optional(),
  description: nonEmptyString.optional(),
});
```

These are optional and additive — existing related offerings without display fields validate unchanged.

### 4. Price-card component accepts structured props

The `price-card` section component (`packages/ui/src/sections/price-card/`) is updated to accept structured pricing props instead of pre-formatted strings:

```ts
interface PriceCardPricingProp {
  amount: string;   // content ref to canonical decimal string
  currency: string; // content ref to pricing.currency
  recurrence?: string; // content ref to charge.recurrence
}
```

The component calls `formatPrice()` (from `@warpgogol/share/formula-eval` or a new `@warpgogol/share/format` utility) to render `70 € / Monat` from `{ amount: "70.00", currency: "EUR", recurrence: "P1M" }`.

### 5. Content references use canonical + pipe

Page content references pricing through canonical paths with pipe formatting:

```yaml
# Price card block props (structured)
monthly:
  amount: business-profile.offerings/digital-foundation.pricing.charges.monthlySubscription.amount.value
  currency: business-profile.offerings/digital-foundation.pricing.currency
  recurrence: business-profile.offerings/digital-foundation.pricing.charges.monthlySubscription.recurrence

# Inline text (pipe-formatted)
text: "Близько =(business-profile.offerings/digital-foundation.pricing.charges.yearlySubscription.amount.value | money currency=EUR locale=uk) на рік"
```

## Architectural fit

- **DNA-4 (Canonical content in `src/content/`).** Display strings are produced at render time from canonical content, not stored as duplicates. This RFC strengthens DNA-4 by eliminating the presentation duplication loophole.

- **DNA-55 (Spec vendoring contract).** This RFC applies `pbp-specification-package/ADR-012` (decimal string money) to the display layer. Canonical decimal strings are the single source of truth; display formatting is a render-time concern.

- **RFC-0482 (Presentation fields).** This RFC supersedes RFC-0482 for offering entities. The `presentation` field is removed from offerings. Non-offering entities (legal-identity, web-presence, public-document, business) retain `presentation` — they store display-only metadata (dates, domains, tax) without canonical duplication.

- **RFC-0728 (Charge schema enforcement).** This RFC depends on RFC-0728 — canonical charges must be strict (`pbpChargeSchema`) before display can route through them.

- **RFC-0729 (Formula pipe + money formatter).** This RFC depends on RFC-0729 — inline text uses `=(ref | money)` pipe syntax for display formatting.

- **RFC-0527 / RFC-0529 (Content references).** Content references to canonical PBP fields use the existing braceless reference syntax. No changes to the reference resolver.

- **RFC-0570 (Formula evaluation).** Inline arithmetic on canonical values uses the existing `=(…)` syntax. The `money` pipe (RFC-0729) is used for display formatting.

## Design

### CLI surface

No new CLI commands. The change is schema + content + component updates.

### TypeScript contracts

```ts
// packages/pbp/src/schemas/offering.ts — extended pbpRelatedOfferingSchema
const pbpRelatedOfferingSchema = z.object({
  relation: pbpOfferingRelationSchema,
  offeringRef: pbpEntityRefSchema,
  acquisition: pbpOfferingAcquisitionSchema.optional(),
  label: nonEmptyString.optional(),
  description: nonEmptyString.optional(),
});

// fulfillment remains z.record(z.string(), z.unknown()) — capacity and billingDay
// are stored as structured sub-objects within the existing loose-typed field.
// A follow-up RFC may type fulfillment strictly.
```

```ts
// packages/ui/src/sections/price-card/price-card-section.types.ts
interface PriceCardPricingProp {
  amount: string;
  currency: string;
  recurrence?: string;
}

interface PriceCardSectionContent {
  // ...existing fields...
  monthly?: PriceCardPricingProp;
  yearly?: PriceCardPricingProp;
  setup?: PriceCardPricingProp;
}
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/pbp/src/schemas/offering.ts` | `pbpRelatedOfferingSchema` extended with `label`, `description` |
| `missions/warpgogol-com-m000035/workpiece/src/content/business-profile/uk/offerings/*.md` | 6 UK offering files: remove `presentation`, migrate data to canonical fields |
| `missions/warpgogol-com-m000035/workpiece/src/content/business-profile/de/offerings/*.md` | 6 DE offering files: remove `presentation`, migrate data to canonical fields |
| `packages/ui/src/sections/price-card/price-card-section.astro` | Accept structured pricing props, call `formatPrice()` |
| `packages/ui/src/sections/price-card/price-card-section.types.ts` | Updated prop types |
| `missions/warpgogol-com-m000035/workpiece/src/content/pages/{lang}/home.md` | Price card block props updated to structured canonical references |
| `missions/warpgogol-com-m000035/workpiece/src/content/pages/{lang}/*.md` | Inline price references updated to canonical + pipe syntax |

### Output format

N/A — no new commands. Schema violations surface as Astro content collection errors. Content reference resolution uses the existing resolver with pipe formatting from RFC-0729.

### Failure modes

- **Offering file with `presentation` after migration.** The `presentation` field remains valid in the Zod schema (`optional`). But `semantic.ts` `PBP-LEGACY-KEY` and `PBP-MONEY` checks will flag any presentation data that duplicates canonical fields. Agents MUST NOT add `presentation` to offering files.

- **Content reference to removed presentation field.** After `presentation.price` is removed, content references like `business-profile.offerings/digital-foundation.presentation.price.monthly` will fail to resolve. The reference validator (`content.references.validate`) will flag these as unresolved. All references must be updated to canonical paths during migration.

- **Price-card component without structured props.** If a page block passes string props (legacy `monthly: "70 €"`) instead of structured props, the component will render incorrectly. The section schema validation (`page.block.validate`) will catch type mismatches.

## Rollout

- **Immediate, single-site.** Warpgogol-com is the only active site. All 12 offering files (6 UK + 6 DE) are updated in the same implementation commit. No multi-site migration.

- **Schema change is additive.** `pbpRelatedOfferingSchema` gains optional `label`/`description` — existing related offerings without these fields validate unchanged. `fulfillment` remains `z.record(z.unknown())` — capacity and billingDay are stored as structured sub-objects.

- **No grace period.** The `presentation` removal and content reference updates ship in the same commit. There is no transitional period where references point to removed fields.

- **Depends on RFC-0728 + RFC-0729.** This RFC's implementation must follow RFC-0728 (charge schema enforcement) and RFC-0729 (pipe + money formatter). All three RFCs can be implemented in sequence within the same mission.

- **New sites comply from day one.** New sites use canonical references + pipe formatting. No `presentation` field in offering files.

## Alternatives considered

- **Keep `presentation`, add validation to sync with canonical.** Rejected: validation that checks presentation matches canonical is complex, fragile, and solves the wrong problem. The right answer is to not duplicate data.

- **Compiler phase derivation (generate presentation from canonical).** Rejected: `presentation` is a display concern. Generating it at compile time and storing it in the entity creates a derived field that must be regenerated. Render-time formatting is simpler and has no stale data risk.

- **Build-time codegen (write presentation to entity files).** Rejected: writes derived data to source files, creating git churn and stale data risk if regeneration is skipped.

- **Remove `presentation` from all entities.** Rejected: non-offering entities (legal-identity, web-presence, public-document, business) use `presentation` for display-only metadata (dates, domains, tax) that has no canonical PBP field. Removing it would lose legitimate data. Scope is limited to offerings.

- **Type `fulfillment` strictly.** Rejected: `fulfillment` is `z.record(z.string(), z.unknown())` by design — it holds operational data that varies per offering. Typing it strictly for `capacity` and `billingDay` is scope creep. A follow-up RFC can type fulfillment if the pattern stabilizes.

## Risks

- **Content reference breakage.** Removing `presentation.price` breaks any reference to it. Mitigation: all references are updated in the same commit. The reference validator catches unresolved references at build time.

- **Price-card component prop change.** Changing from string props to structured props is a breaking change for any page block that passes string props. Mitigation: all page blocks using price-card are updated in the same commit. The section schema validation catches type mismatches.

- **`growthModules` prices in `relatedOfferings`.** Moving growth module prices to `relatedOfferings` display fields requires that each growth module is a related offering with a charge in its own offering file. The `label` and `description` display fields are optional additions. Prices are referenced via content refs to the related offering's canonical charges, not duplicated.

- **`fulfillment` remains loose-typed.** `capacity` and `billingDay` in `fulfillment` are not validated by Zod. Mitigation: the values are simple (numbers, strings, small objects) and site-specific. A follow-up RFC can type fulfillment if needed.

- **Non-offering `presentation` remains.** This RFC does not remove `presentation` from legal-identity, web-presence, public-document, or business entities. Those entities use `presentation` for display-only metadata without canonical duplication. A follow-up RFC can address them if needed.

## Acceptance criteria

- [ ] `pbpRelatedOfferingSchema` in `packages/pbp/src/schemas/offering.ts` includes optional `label` and `description` fields
- [ ] All 12 offering files (6 UK + 6 DE) have `presentation` removed
- [ ] `capacity` data migrated to `fulfillment.capacity` in offering files
- [ ] `growthModules` data migrated to `relatedOfferings` with `label`/`description` display fields
- [ ] `changePrice` migrated to `pricing.charges.additionalChange` (charge with `type: usage`, `model: unit-rate`, `purpose: additional-change`)
- [ ] `hourlyRate` migrated to `pricing.charges.hourlyWork` (charge with `type: usage`, `model: unit-rate`, `purpose: hourly-work`)
- [ ] `billingDay` migrated to `fulfillment.billingDay`
- [ ] Price-card component accepts structured `PriceCardPricingProp` props and formats via `formatPrice()`
- [ ] Page content references pricing through canonical paths with pipe syntax `=(ref | money currency=EUR locale=<lang>)`
- [ ] No content references to `presentation.*` remain in any page or prose file
- [ ] `pnpm --filter @warpgogol/pbp build:check` passes
- [ ] `pnpm --filter @warpgogol/pbp test` passes
- [ ] `pnpm --filter warpgogol-com exec astro check` passes
- [ ] `rfc.validate` passes on this file

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- For RFCs created on or after 2026-07-07 with acceptance probes: before stamping `implemented`, run `site-kernel run rfc.verification.emit --id <this-rfc-id>` and commit the evidence file in the same commit (RFC-0330 amended transition precondition).
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id <this-rfc-id> --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
- Agents MUST NOT add `presentation` to offering files. The field remains in the Zod schema for non-offering entities only.
- Agents MUST update all content references to `presentation.*` fields when removing presentation from an offering file.
- Agents MUST quote all decimal string values in charges (e.g. `"70.00"`, not `70.00`) per RFC-0728 and ADR-012.
- Agents MUST include `model` (one of `fixed`, `range`, `unit-rate`, `tiered`) and `purpose` on every charge per RFC-0728.
- Agents MUST use `mission.git.commit` to commit changes in the workpiece (RFC-0480).
- UK content is the source of truth. Fix UK first, then translate to DE maintaining semantic parity. Consult `docs/translate/2026-07-28-uk-de-after-rebuild.md` for UK→DE translation guide.
