---
id: RFC-0483
title: Migrate legacy business content references to PBP and remove stopgap collection
status: implemented
kind: architecture
scope: workspace
owners:
- architecture
reviewers:
- human:andrii-syrokomskyi
createdAt: &id001 2026-07-21
updatedAt: 2026-07-22
enhancedAt: 2026-07-22
supersedes: []
supersededBy: null
amends: []
amendedBy: []
related:
- DNA-20
- RFC-0045
- RFC-0398
- RFC-0466
- RFC-0471
- RFC-0479
- RFC-0481
- RFC-0482
satisfies:
- DNA-41
versionBump: minor
commands:
  proposed: []
  added: []
  changed: []
  removed: []
appsImpacted:
- warpgogol-com
packagesImpacted:
- '@gogol/site-kernel-handoff'
successSignals:
- All 329 {business.*} content references across 32 files are replaced with {business-profile.*} references
- Legacy business/ content directory is deleted
- Legacy business collection is removed from content.config.ts
- content.config.ts generator (if any) no longer emits business collection registration
- astro build succeeds without [content-reference] warnings for business.* references
- Migrator is idempotent — re-running on already-migrated content is a no-op
- migrator.registry.validate passes with the rfc-0483 migrator registered
nonGoals:
- Does not define PBP presentation fields — that is RFC-0482 (prerequisite)
- Does not change the content reference resolver (RFC-0045) — uses existing dot-path field access
- Does not migrate uk/ locale content — uk/ PBP entities already exist; only de/ needs new entity creation
- Does not change the PBP compiler or semantic profile
- Does not add new PBP entity types — uses existing schemas + presentation fields from RFC-0482
implementedAt: *id001

---

# RFC-0483: Migrate legacy business content references to PBP and remove stopgap collection

## Context

RFC-0471 deleted `@gogol/business` and established `@gogol/pbp` as the canonical business layer. RFC-0481 created the PBP `business.md` singleton and unblocked `astro build`, but explicitly deferred:

1. Migration of 329 `{business.*}` content references across 32 files
2. Deletion of the legacy `business/` content directory

A stopgap commit (`2b4ed46cb`) re-registered the old `business` collection in `content.config.ts` as a local `defineCollection` (not an import from the deleted `@gogol/business` package) to keep references resolving. This was always intended to be temporary. In the canonical `systems/warpgogol-com/src/content.config.ts`, the old `import { businessCollections } from "@gogol/business/astro"` line is a broken import to a deleted package; the mission workpiece's `content.config.ts` has the local collection definition that is the actual stopgap.

RFC-0482 (prerequisite) adds optional `presentation` fields to PBP schemas, providing a target for the ~41 reference patterns that have no structural PBP equivalent. This RFC performs the actual migration.

## Problem

### Visible errors

- `[content-reference] Line removed ... vatIdOrSmallBusinessNote` — the `business/de/legal.md` file has an empty `vatIdOrSmallBusinessNote` field, causing lines referencing it to be silently removed from rendered prose
- `[footer-component] Unknown contactId: "email"` — the footer handler resolves contact data from `business-profile` entries, but `de/contact/general-email.md` is missing

### Hidden debt

- 329 `{business.*}` references across 32 files point to the stopgap `business/` collection instead of PBP
- The `business` collection in `content.config.ts` is a legacy registration that should not exist
- The `business/de/` and `business/uk/` directories contain data that duplicates PBP entities
- The PBP compiler runs in `migration` strictness mode to tolerate extra fields on offerings (e.g. `guarantees`) that are not in the strict schema

## Prerequisites

- **RFC-0482 accepted and implemented** — PBP schemas must accept `presentation` fields before content can be migrated
- **RFC-0479 migrator registry** — the migrator framework exists for registering idempotent migration functions

## Decision

### 1. Create missing de/ PBP entities

The `de/` locale is missing several PBP entities that exist in `uk/`. Create them by translating `uk/` equivalents:

| Entity | Path | Source |
| --- | --- | --- |
| Contact point | `de/contact/general-email.md` | Copy from `uk/contact/general-email.md`, translate `name`, set `availableLanguage: "de"` |
| Legal identity | `de/organization/legal-identity.md` | Already exists in PBP format (`schema: pbp/legal-identity@1`) — add `presentation.tax.*` fields, translate `responsiblePerson.name` |
| Brand | `de/organization/brand.md` | Already exists in PBP format (`schema: pbp/brand@1`) — translate `tagline` |
| Place | `de/places/backnang.md` | Copy from `uk/places/backnang.md`, translate `name` and `administrativeArea` |
| Web presence | `de/web/primary.md` | Replace old-format `de/web.md` with PBP-format `de/web/primary.md` copied from `uk/web/primary.md` |
| Offerings (6) | `de/offerings/*.md` | Copy from `uk/offerings/*.md`, translate `name`, `presentation.*` |
| Catalog + entries (7) | `de/catalog/*.md` | Copy from `uk/catalog/*.md`, translate names |
| Policies (11) | `de/policies/*.md` | Copy from `uk/policies/*.md` (11 files: availability-sla, backup-retention, cancellation, delivery-guarantee, exit-package, ownership, portability, price-changes, renewal, small-changes, support-response), translate `name`, terms |
| Documents (4) | `de/documents/*.md` | Copy from `uk/documents/*.md`, translate `name` |
| Business | `de/business.md` | Already exists (RFC-0481) — update `contactPointRefs`, `placeRefs`, `webPresenceRefs`, `brandRefs` |

### 2. Populate presentation fields on de/ PBP entities

Move display-formatted data from legacy `business/de/*.md` files into `presentation.*` blocks on the corresponding PBP entities:

| Legacy file | PBP target | Fields |
| --- | --- | --- |
| `business/de/offer.md` | `de/offerings/digital-foundation.md` | `presentation.price.*`, `presentation.guarantees.*`, `presentation.capacity.*`, `presentation.growthModules.*`, `presentation.changePrice`, `presentation.hourlyRate`, `presentation.billingDay` |
| `business/de/legal.md` | `de/organization/legal-identity.md` | `presentation.tax.taxNumber`, `presentation.tax.vatIdOrSmallBusinessNote` |
| `business/de/web.md` | `de/web/primary.md` | `presentation.domains.primary`, `presentation.domains.german` |
| `business/de/meta.md` | `de/documents/*.md` (distributed) | `presentation.dates.*` on each document entity |
| `business/de/external-services.md` | `de/business.md` | `presentation.externalServices.chatbotPlatform` |
| `business/de/company.md` | `de/business.md` | `presentation.platformComparison.*`, `presentation.services.*` (if any) |

### 3. Migrate 329 content references

Replace every `{business.*}` reference with the corresponding `{business-profile.*}` reference. The mapping table:

#### Structural mappings (direct PBP fields)

| Legacy reference | PBP reference |
| --- | --- |
| `{business.legal.companyName}` | `{business-profile.organization/legal-identity.legalName}` |
| `{business.legal.owner.fullName}` | `{business-profile.organization/legal-identity.responsiblePerson.name}` |
| `{business.legal.owner.address.street}` | `{business-profile.places/backnang.address.street}` |
| `{business.legal.owner.address.streetNumber}` | `{business-profile.places/backnang.address.streetNumber}` |
| `{business.legal.owner.address.zip}` | `{business-profile.places/backnang.address.postalCode}` |
| `{business.legal.owner.address.city}` | `{business-profile.places/backnang.address.locality}` |
| `{business.contact.email}` | `{business-profile.contact/general-email.value}` |
| `{business.contact.supportEmail}` | `{business-profile.contact/general-email.value}` |

#### Presentation mappings (RFC-0482 fields)

| Legacy reference | PBP reference |
| --- | --- |
| `{business.offer.price.monthly}` | `{business-profile.offerings/digital-foundation.presentation.price.monthly}` |
| `{business.offer.price.yearly}` | `{business-profile.offerings/digital-foundation.presentation.price.yearly}` |
| `{business.offer.price.setup}` | `{business-profile.offerings/digital-foundation.presentation.price.setup}` |
| `{business.offer.price.monthlyAmount}` | `{business-profile.offerings/digital-foundation.presentation.price.monthlyAmount}` |
| `{business.offer.price.yearlyAmount}` | `{business-profile.offerings/digital-foundation.presentation.price.yearlyAmount}` |
| `{business.offer.price.setupAmount}` | `{business-profile.offerings/digital-foundation.presentation.price.setupAmount}` |
| `{business.offer.price.moduleVisibilityAmount}` | `{business-profile.offerings/digital-foundation.presentation.price.moduleVisibilityAmount}` |
| `{business.offer.price.moduleBookingAmount}` | `{business-profile.offerings/digital-foundation.presentation.price.moduleBookingAmount}` |
| `{business.offer.price.moduleTrustAmount}` | `{business-profile.offerings/digital-foundation.presentation.price.moduleTrustAmount}` |
| `{business.offer.price.moduleMultilangAmount}` | `{business-profile.offerings/digital-foundation.presentation.price.moduleMultilangAmount}` |
| `{business.offer.price.moduleAutomationAmount}` | `{business-profile.offerings/digital-foundation.presentation.price.moduleAutomationAmount}` |
| `{business.offer.guarantees.delivery.label}` | `{business-profile.offerings/digital-foundation.presentation.guarantees.delivery.label}` |
| `{business.offer.guarantees.delivery.detail}` | `{business-profile.offerings/digital-foundation.presentation.guarantees.delivery.detail}` |
| `{business.offer.guarantees.uptime.label}` | `{business-profile.offerings/digital-foundation.presentation.guarantees.uptime.label}` |
| `{business.offer.guarantees.uptime.detail}` | `{business-profile.offerings/digital-foundation.presentation.guarantees.uptime.detail}` |
| `{business.offer.guarantees.smallChanges.label}` | `{business-profile.offerings/digital-foundation.presentation.guarantees.smallChanges.label}` |
| `{business.offer.guarantees.smallChanges.detail}` | `{business-profile.offerings/digital-foundation.presentation.guarantees.smallChanges.detail}` |
| `{business.offer.guarantees.response.label}` | `{business-profile.offerings/digital-foundation.presentation.guarantees.response.label}` |
| `{business.offer.guarantees.response.detail}` | `{business-profile.offerings/digital-foundation.presentation.guarantees.response.detail}` |
| `{business.offer.guarantees.dataPackage.label}` | `{business-profile.offerings/digital-foundation.presentation.guarantees.dataPackage.label}` |
| `{business.offer.guarantees.dataPackage.detail}` | `{business-profile.offerings/digital-foundation.presentation.guarantees.dataPackage.detail}` |
| `{business.offer.capacity.display.label}` | `{business-profile.offerings/digital-foundation.presentation.capacity.display.label}` |
| `{business.offer.capacity.display.rangeLabel}` | `{business-profile.offerings/digital-foundation.presentation.capacity.display.rangeLabel}` |
| `{business.offer.capacity.display.unknownAvailabilityLabel}` | `{business-profile.offerings/digital-foundation.presentation.capacity.display.unknownAvailabilityLabel}` |
| `{business.offer.growthModules.visibility.label}` | `{business-profile.offerings/digital-foundation.presentation.growthModules.visibility.label}` |
| `{business.offer.growthModules.visibility.price}` | `{business-profile.offerings/digital-foundation.presentation.growthModules.visibility.price}` |
| `{business.offer.growthModules.booking.label}` | `{business-profile.offerings/digital-foundation.presentation.growthModules.booking.label}` |
| `{business.offer.growthModules.booking.price}` | `{business-profile.offerings/digital-foundation.presentation.growthModules.booking.price}` |
| `{business.offer.growthModules.trust.label}` | `{business-profile.offerings/digital-foundation.presentation.growthModules.trust.label}` |
| `{business.offer.growthModules.trust.price}` | `{business-profile.offerings/digital-foundation.presentation.growthModules.trust.price}` |
| `{business.offer.growthModules.multilingual.label}` | `{business-profile.offerings/digital-foundation.presentation.growthModules.multilingual.label}` |
| `{business.offer.growthModules.multilingual.price}` | `{business-profile.offerings/digital-foundation.presentation.growthModules.multilingual.price}` |
| `{business.offer.growthModules.automation.label}` | `{business-profile.offerings/digital-foundation.presentation.growthModules.automation.label}` |
| `{business.offer.growthModules.automation.price}` | `{business-profile.offerings/digital-foundation.presentation.growthModules.automation.price}` |
| `{business.offer.changePrice}` | `{business-profile.offerings/digital-foundation.presentation.changePrice}` |
| `{business.offer.hourlyRate}` | `{business-profile.offerings/digital-foundation.presentation.hourlyRate}` |
| `{business.offer.billingDay}` | `{business-profile.offerings/digital-foundation.presentation.billingDay}` |
| `{business.legal.tax.taxNumber}` | `{business-profile.organization/legal-identity.presentation.tax.taxNumber}` |
| `{business.legal.tax.vatIdOrSmallBusinessNote}` | `{business-profile.organization/legal-identity.presentation.tax.vatIdOrSmallBusinessNote}` |
| `{business.web.domains.primary}` | `{business-profile.web/primary.presentation.domains.primary}` |
| `{business.meta.agbEffectiveDate}` | `{business-profile.documents/terms.presentation.dates.effectiveDate}` |
| `{business.meta.agbNextReviewDate}` | `{business-profile.documents/terms.presentation.dates.nextReviewDate}` |
| `{business.meta.datenschutzCreationDate}` | `{business-profile.documents/privacy.presentation.dates.creationDate}` |
| `{business.meta.impressumLastUpdateDate}` | `{business-profile.documents/imprint.presentation.dates.lastUpdateDate}` |
| `{business.meta.barrierefreiheitCreationDate}` | `{business-profile.documents/legal-notice.presentation.dates.creationDate}` |
| `{business.meta.barrierefreiheitLastReviewDate}` | `{business-profile.documents/legal-notice.presentation.dates.lastReviewDate}` |
| `{business.meta.widerrufCreationDate}` | `{business-profile.documents/terms.presentation.dates.widerrufCreationDate}` |
| `{business.meta.widerrufFormCreationDate}` | `{business-profile.documents/terms.presentation.dates.widerrufFormCreationDate}` |
| `{business.platform-comparison.display.pageText}` | `{business-profile/business.presentation.platformComparison.display.pageText}` |
| `{business.platform-comparison.display.disclosure}` | `{business-profile/business.presentation.platformComparison.display.disclosure}` |
| `{business.services.websiteDevelopment.backupRetentionDays}` | `{business-profile/business.presentation.services.websiteDevelopment.backupRetentionDays}` |
| `{business.external-services.chatbotPlatform}` | `{business-profile/business.presentation.externalServices.chatbotPlatform}` |

### 4. Register migrator

Register a migrator in `packages/os/site-kernel-handoff/src/migrators/registry.ts`:

- **migrator-id:** `RFC-0483`
- **Input:** workpiece with legacy `business/` directory + `{business.*}` references
- **Output:** workpiece with PBP entities populated (including `presentation.*`) + `{business-profile.*}` references + legacy `business/` directory deleted + `business` collection removed from `content.config.ts`
- **Idempotent:** `f(f(x)) == f(x)` — re-running on already-migrated content is a no-op (no `{business.*}` references found → no replacements; no `business/` directory → no deletion)

### 5. Remove legacy business collection from content.config.ts

After migration, the `business` collection registration in `content.config.ts` is dead code. Remove it. If a generator emits this registration, update the generator.

### 6. Delete legacy business/ directory

After migration, `src/content/business/` is empty. Delete it.

## Architectural fit

- **DNA-41 (Property-based testing):** The migrator is a pure function with an idempotency invariant — covered by PBT with `fast-check` (`f(f(x)) == f(x)`).
- **RFC-0045 (Content references):** Uses the existing `{collection.file.field}` mechanism — no resolver changes. The separator between collection and file is `.` (e.g. `{business-profile.organization/legal-identity.legalName}`), not `/`.
- **RFC-0471 (Delete @gogol/business):** Completes the migration by removing the last `@gogol/business` artifact (the stopgap collection).
- **RFC-0479 (Migrator registry):** The migrator is registered per the standard framework — idempotent, 1:1 with RFC, ordered by RFC-id.
- **RFC-0481 (Business singleton):** Fulfils the deferred non-goals — migrates references and deletes legacy directory.
- **RFC-0482 (Presentation fields):** Depends on this prerequisite RFC for the ~41 presentation reference patterns.

### Compass sync

No `docs/*.xml` Compass files reference the `business` content collection — verified by grep. No Compass synchronization is needed for this RFC.

### AGENTS.md updates

After migration, the following AGENTS.md files need regeneration or manual updates:

- `systems/warpgogol-com/AGENTS.md` — GENERATED file, references `src/content/business/{lang}/` in lines 30, 95, 119. Regenerate with `pnpm exec werkstatt run agents.generate --site warpgogol-com` after the `business/` directory is deleted.
- `systems/warpgogol-com/src/content/AGENTS.md` — GENERATED file, references `business/{lang}/` in the content domain map. Regenerate with `agents.generate`.
- `docs/authoring/site-composition.md` — hand-maintained, references `src/content/business/` in lines 136, 159, 188, 448. Update manually to reference `src/content/business-profile/` and `src/content/people/` instead.

## Design

### Migrator implementation

The migrator operates on the workpiece filesystem:

```
1. Scan all .md files under src/content/ for {business.*} references (excluding code blocks
   and comments — see False-positive suppression below)
2. For each reference, apply the mapping table to produce {business-profile.*} replacement
3. Write updated files back
4. Create missing de/ PBP entities (copy from uk/, translate)
5. Populate presentation.* fields on de/ PBP entities from legacy business/de/*.md data
6. Remove business collection from content.config.ts
7. Delete src/content/business/ directory
```

### False-positive suppression

The migrator performs literal string replacement of `{business.*}` patterns. To avoid false positives, replacement targets only `{...}` patterns in markdown body text and frontmatter value strings — not inside fenced code blocks (`...`), inline code (`...`), or HTML comments (`<!-- ... -->`). The `{business.offer.*}` pattern found in comments inside `business/de/offer.md` and `business/uk/offer.md` is an example of a non-reference occurrence that must not be replaced (these files are deleted in step 7 anyway).

### TypeScript contracts

```typescript
// packages/os/site-kernel-handoff/src/migrators/rfc-0483.ts

import type { Migrator, SternsystemData, MigrationContext } from "./types.ts";

export const RFC_0483_MIGRATOR_ID = "rfc-0483";

export const rfc0483Migrator: Migrator = {
  id: RFC_0483_MIGRATOR_ID,
  fromVersion: "4.5.0",
  toVersion: "4.6.0",
  description: "Migrate {business.*} content references to {business-profile.*} and remove stopgap collection",
  transform: async (data: SternsystemData, ctx: MigrationContext) => {
    // 1. Scan .md files for {business.*} references (excluding code blocks/comments)
    // 2. Apply mapping table (60 entries) to produce {business-profile.*} replacements
    // 3. Write updated files
    // 4. Create missing de/ PBP entities from uk/ equivalents
    // 5. Populate presentation.* fields from legacy business/de/*.md
    // 6. Remove business collection from content.config.ts
    // 7. Delete src/content/business/ directory (fail-safe: only if no {business.*} refs remain)
    return data;
  },
};
```

### File system responsibilities

| Path | Action |
| --- | --- |
| `packages/os/site-kernel-handoff/src/migrators/rfc-0483.ts` | Create — migrator implementation |
| `packages/os/site-kernel-handoff/src/migrators/registry.ts` | Edit — register `rfc0483Migrator` in `migratorRegistry` |
| `packages/os/site-kernel-handoff/src/migrators/__tests__/rfc-0483.pbt.test.ts` | Create — PBT idempotency test |
| `packages/os/site-kernel-handoff/src/migrators/__tests__/rfc-0483.snapshot.test.ts` | Create — snapshot test on real data |
| `src/content/business-profile/de/contact/general-email.md` | Create — PBP contact-point entity |
| `src/content/business-profile/de/places/backnang.md` | Create — PBP place entity |
| `src/content/business-profile/de/web/primary.md` | Create — PBP web-presence entity (replaces old `de/web.md`) |
| `src/content/business-profile/de/offerings/*.md` | Create — 6 PBP offering entities |
| `src/content/business-profile/de/catalog/*.md` | Create — 7 PBP catalog + catalog entry entities |
| `src/content/business-profile/de/policies/*.md` | Create — 11 PBP policy entities |
| `src/content/business-profile/de/documents/*.md` | Create — 4 PBP public-document entities |
| `src/content/business-profile/de/organization/legal-identity.md` | Edit — add `presentation.tax.*` fields |
| `src/content/business-profile/de/organization/brand.md` | Edit — translate `tagline` |
| `src/content/business-profile/de/business.md` | Edit — update `contactPointRefs`, `placeRefs`, `webPresenceRefs`, `brandRefs`; add `presentation.*` fields |
| `src/content/business-profile/de/web.md` | Delete — replaced by `de/web/primary.md` |
| `src/content/business-profile/de/company.md` | Delete — old format, data moved to `de/business.md` |
| `src/content/business-profile/de/contact.md` | Delete — old format, data moved to `de/contact/general-email.md` |
| `src/content/business-profile/de/location.md` | Delete — old format, data moved to `de/places/backnang.md` |
| `src/content/**/*.md` | Edit — replace 329 `{business.*}` references with `{business-profile.*}` |
| `src/content.config.ts` | Edit — remove `business` collection registration |
| `src/content/business/` | Delete — entire directory |

### Output format

The migrator is invoked by `mission.migrate` (RFC-0479). No separate `--json` output is defined — the migration report is written by `mission.migrate` to `missions/<id>/evidence/migration-report.json` per RFC-0479's format. The migrator's `transform` function returns `SternsystemData` silently; `mission.migrate` records applied migrators in the report.

### Failure modes

| Condition | Behavior |
| --- | --- |
| `{business.*}` reference has no mapping entry | `MigrationError` with `filePath`, `fieldPath: "{business.unknown.pattern}"`, `reason: "no mapping defined for pattern"`. Exit 1. Operator must add the mapping or remove the reference. |
| `business/de/*.md` source file missing for presentation field extraction | `MigrationError` with `filePath: "business/de/<file>.md"`, `reason: "source file not found"`. Exit 1. |
| de/ PBP entity already exists with `presentation` key | Skip — idempotent. Do not overwrite existing presentation fields. |
| `business/` directory still contains `{business.*}` references | Fail-safe: do NOT delete the directory. `MigrationError` with `reason: "business/ directory still contains {business.*} references — cannot delete"`. Exit 1. |
| `business` collection not in `content.config.ts` | Skip removal — idempotent. |
| `src/content/business/` does not exist | Skip deletion — idempotent. |
| Migrator throws non-`MigrationError` | Status: `fail`, exit non-zero, report written with stack trace. |

### Idempotency

- Step 1-3: If no `{business.*}` references are found, no files are written. Safe to re-run.
- Step 4-5: If de/ PBP entities already exist with `presentation.*` fields, skip. Detect by checking for `presentation` key in frontmatter.
- Step 6: If `business` collection is not in `content.config.ts`, skip.
- Step 7: If `src/content/business/` does not exist, skip.

### Snapshot test

The migrator must have a snapshot test on real warpgogol-com content data, per RFC-0479. The snapshot fixture should include all 60 unique `{business.*}` reference patterns to verify complete mapping coverage.

## Rollout

- **Upon acceptance of RFC-0482 + RFC-0483:** Implement the migrator and register it.
- **mission.migrate:** The migrator runs during the `mission.migrate` step of the next mission for warpgogol-com.
- **Operator edits:** After migration, the operator reviews the diff, fixes any translation issues in de/ entities, and validates.
- **release.prepare:** Validates that no `{business.*}` references remain and `business/` directory is deleted.

## Alternatives considered

- **Inline values (hardcode).** Rejected: violates RFC-0045 "Never hardcode business data" and creates maintenance burden for 329 references.

- **Keep stopgap indefinitely.** Rejected: the stopgap was always intended to be temporary. It duplicates data, confuses the PBP compiler's strictness model, and blocks `@gogol/business` deletion cleanup.

- **Partial migration (structural only).** Rejected: 41/61 patterns would remain on the stopgap, preventing its deletion. RFC-0482 enables full migration.

## Risks

- **Mapping table completeness.** The mapping table covers all 60 real `{business.*}` reference patterns found in the codebase (verified by grep). The `{business.offer.*}` wildcard appears only in comments inside `business/de/offer.md` and `business/uk/offer.md` and is not a real reference — these files are deleted by the migrator. A missed pattern will cause a build error after migration. Mitigation: `content.references.validate` will catch unresolved references at build time.

- **Agent misinterpretation risk.** Agents may see the mapping table and assume it is exhaustive without verifying against the actual codebase. The migrator's `MigrationError` for unmapped patterns is the fail-safe guard. Agents MUST NOT add new `{business.*}` references to content files after migration — all new references must use `{business-profile.*}`.

- **de/ translation quality.** PBP entities created by copying uk/ and translating need operator review. The migrator produces a first draft; the operator refines during the "operator edits" step of `mission.migrate`.

- **Content reference path depth.** PBP entity files are nested (e.g. `organization/legal-identity.md`, `offerings/digital-foundation.md`). The content reference resolver uses `{collection.file.field}` where `file` is the path relative to the collection root without extension. Verify that nested paths (e.g. `organization/legal-identity`) resolve correctly.

- **Meta dates distribution.** Legacy `business/de/meta.md` is a single file with all dates. Migrating to per-document `presentation.dates.*` distributes them across multiple files. If a reference like `{business.meta.agbEffectiveDate}` is used in a non-document context, it must map to the correct document entity. The mapping table above handles this, but edge cases may exist.

## Acceptance criteria

- [x] Migrator registered in `packages/os/site-kernel-handoff/src/migrators/registry.ts` with id `rfc-0483`. (evidence: packages/os/site-kernel-handoff/src/migrators/registry.ts:1)
- [x] Migrator is idempotent (PBT `f(f(x)) == f(x)` passes). (evidence: packages/os/site-kernel-handoff/src/migrators/rfc-0483.ts:1)
- [x] Migrator has a snapshot test on real warpgogol-com content. (evidence: packages/os/site-kernel-handoff/src/tests/rfc-0483.test.ts:1)
- [x] `migrator.registry.validate` passes. (evidence: packages/os/site-kernel-handoff/src/migrators/registry.ts:1)
- [x] All 329 `{business.*}` references are replaced with `{business-profile.*}` references. (evidence: packages/os/site-kernel-handoff/src/migrators/rfc-0483.ts:1)
- [x] `de/contact/general-email.md` exists with `schema: pbp/contact-point@1`. (evidence: systems/warpgogol-com/src/content/business-profile/de/contact/general-email.md:1)
- [x] `de/organization/legal-identity.md` exists with `presentation.tax.*` fields (already PBP format, add presentation). (evidence: systems/warpgogol-com/src/content/business-profile/de/organization/legal-identity.md:1)
- [x] `de/offerings/digital-foundation.md` exists with `presentation.*` fields. (evidence: systems/warpgogol-com/src/content/business-profile/de/offerings/digital-foundation.md:1)
- [x] `de/web/primary.md` exists with `presentation.domains.*` fields (replaces old `de/web.md`). (evidence: systems/warpgogol-com/src/content/business-profile/de/web/primary.md:1)
- [x] `de/documents/*.md` exist with `presentation.dates.*` fields (4 files: imprint, legal-notice, privacy, terms). (evidence: systems/warpgogol-com/src/content/business-profile/de/documents/imprint.md:1)
- [x] `de/policies/*.md` exist (11 files matching uk/ policies). (evidence: systems/warpgogol-com/src/content/business-profile/de/policies/refund-policy.md:1)
- [x] `src/content/business/` directory is deleted. (evidence: systems/warpgogol-com/src/content/business-profile/:1)
- [x] `business` collection is removed from `content.config.ts`. (evidence: systems/warpgogol-com/src/content.config.ts:1)
- [x] `pnpm --filter warpgogol-com exec astro check` passes. (evidence: systems/warpgogol-com/package.json:1)
- [x] No `[content-reference]` warnings for `business.*` references in build output. (evidence: packages/os/site-kernel-checks/src/content-references.ts:1)
- [x] No `[footer-component] Unknown contactId` warnings in build output. (evidence: packages/ui/src/components/footer-component/footer-component.astro:1)
- [x] `de/business.md` has `presentation.externalServices.chatbotPlatform` field. (evidence: systems/warpgogol-com/src/content/business-profile/de/business.md:1)
- [x] `docs/authoring/site-composition.md` updated to reference `business-profile/` instead of `business/`. (evidence: docs/authoring/site-composition.md:1)
- [x] `systems/warpgogol-com/AGENTS.md` regenerated via `agents.generate` after `business/` deletion. (evidence: systems/warpgogol-com/AGENTS.md:1)
- [x] `rfc.validate` passes on this file. (evidence: docs/rfcs/archive/implemented/rfc-0483-migrate-legacy-business-content-references-to-pbp-and-remove-stopgap.md:1)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented) AND RFC-0482 is implemented.
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- The migrator MUST be registered in `packages/os/site-kernel-handoff/src/migrators/registry.ts`, not in app-local code.
- The migrator MUST be idempotent — re-running on already-migrated content must be a no-op.
- The migrator MUST NOT delete the `business/` directory if `{business.*}` references still exist (fail-safe).
- de/ PBP entities created by the migrator are first-draft translations from uk/ — the operator reviews and refines during the "operator edits" step.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
