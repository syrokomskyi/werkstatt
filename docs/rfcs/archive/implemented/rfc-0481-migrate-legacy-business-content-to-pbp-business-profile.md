---
id: RFC-0481
title: "Create PBP business singleton via migrator and complete RFC-0471 content migration"
status: implemented
kind: architecture
scope: workspace
owners:
  - architecture
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-07-21
updatedAt: 2026-07-21
enhancedAt: 2026-07-21
implementedAt: 2026-07-21
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - DNA-20
  - DNA-41
  - RFC-0045
  - RFC-0398
  - RFC-0466
  - RFC-0469
  - RFC-0471
  - RFC-0479
satisfies:
  - DNA-41
versionBump: minor
commands:
  proposed: []
  added: []
  changed: []
  removed: []
appsImpacted:
  - webgogol-com
packagesImpacted:
  - "@gogol/site-kernel-handoff"
successSignals:
  - "business-profile/{lang}/business.md exists with schema: pbp/business@1 and type: business"
  - "astro build succeeds without PBP-REF: No Business entity found errors"
  - "Migrator is idempotent — re-running on already-migrated content is a no-op"
  - "migrator.registry.validate passes with the rfc-0481 migrator registered"
nonGoals:
  - "Does not migrate content references ({business.*.*}) to {business-profile.*.*} — that is a separate future RFC"
  - "Does not delete the legacy business/ directory — that is a separate future RFC after content references are migrated"
  - "Does not migrate all legacy fields 1:1 — only fields required by the PBP compiler and semantic profile are mapped"
  - "Does not create de/ locale PBP entities beyond business.md — offerings, products, policies are operator-authored content"
  - "Does not change the PBP compiler or schema — uses existing pbp/*@1 entity schemas"
---

# RFC-0481: Create PBP business singleton via migrator and complete RFC-0471 content migration

## Context

RFC-0471 deleted `@gogol/business` and replaced it with `@gogol/pbp` (DNA-20 superseded). The PBP compiler (`compilePbpProfile` in `@gogol/pbp/compiler`) reads entities from `src/content/business-profile/{lang}/` and requires a `business` singleton entity (`type: "business"`, `schema: pbp/business@1`) to assemble the semantic profile graph.

### RFC-0471 incomplete implementation

RFC-0471's acceptance criteria items 1 and 8 claim:

- "All 329 `{business.*}` content references migrated to `{business-profile.*}` or inline values" (checked 2026-07-20)
- "`systems/webgogol-com/src/content/business/` directory deleted" (checked 2026-07-20)

**Both were falsely checked.** Verification on 2026-07-21:

- `systems/webgogol-com/src/content/business/` still exists with 30 .md files
- 32 content files still contain `{business.*}` references

The `@gogol/business` package was deleted, but the site content was not migrated. This left the site in a broken state: the PBP compiler has no `business` entity to resolve, and content references still point to the old `business/` collection.

### Current state

- `business-profile/uk/` has most PBP entities (offerings, products, policies, catalog, places, contact-points, organization) but is **missing the `business.md` singleton**
- `business-profile/de/` has only 5 old-format files (`company.md`, `contact.md`, `location.md`, `organization/brand.md`, `organization/legal-identity.md`) — none in PBP format, and **no `business.md` singleton**
- `business/de/` and `business/uk/` still exist with legacy content (30 .md files total)
- 32 content files still contain `{business.*}` references
- `astro build` fails: `PBP-REF: No Business entity found in the entity index.`
- The `business` collection was re-registered in `content.config.ts` (commit `2b4ed46cb`) as a stopgap to keep content references resolving

## Problem

The PBP cutover (RFC-0471) deleted the old `@gogol/business` package but **no migrator was created** to transform existing site content. The migrator registry (RFC-0479) exists, but no migrator for RFC-0471 was registered.

As a result:

- `business-profile/` is missing the critical `business.md` singleton in both locales
- `astro build` fails on every page because `resolveProfile()` cannot find the Business entity
- `mission.validate` (now including build) fails

## Decision

### 1. Migrator: `rfc-0481` in the migrator registry

Register a migrator with `id: "rfc-0481"` in `packages/os/site-kernel-handoff/src/migrators/registry.ts` that:

1. **Creates `business-profile/{lang}/business.md`** — the PBP Business singleton — from legacy `business/{lang}/company.md` frontmatter. Maps:
   - `id` → `https://webgogol.com/id/business`
   - `schema` → `pbp/business@1`
   - `type` → `business`
   - `status` → `published`
   - `name` → from `brand.name` or top-level `name`
   - `description` → from `description`
   - `mission` → from `mission`
   - `yearEstablished` → from `foundingYear` (parseInt)
   - `brandRefs.default` → `{ ref: "https://webgogol.com/id/brand", expectedType: "brand" }`
   - `legalIdentityRef` → `{ ref: "https://webgogol.com/id/legal-identity", expectedType: "legal-identity" }`
   - `placeRefs.office` → `{ ref: "https://webgogol.com/id/places/backnang", expectedType: "place" }`
   - `contactPointRefs.default` → `{ ref: "https://webgogol.com/id/contact-points/general-email", expectedType: "contact-point" }`
   - `webPresenceRefs.default` → `{ ref: "https://webgogol.com/id/web-presences/primary", expectedType: "web-presence" }`
   - `governance` → `{ authorityRef: "https://webgogol.com/id/business", effectiveFrom: "2026-01-01", reviewEvery: "P1Y" }`

2. **Skips if already migrated** — if `business-profile/{lang}/business.md` already exists with `schema: pbp/business@1`, the migrator is a no-op for that locale (idempotency).

3. **Throws `MigrationError` if `company.md` is missing** — if `business/{lang}/company.md` does not exist for a locale, the migrator throws `MigrationError` (not silently skips), because without the business singleton the build will fail anyway. Failing early with a clear error is better than a mysterious build failure.

### 2. `de/` locale PBP content

The migrator creates only the `business.md` singleton. The remaining `de/` PBP entities (offerings, products, policies, etc.) are **operator-authored content** — the migrator does not generate them from legacy data because the mapping is not mechanical (field names, structure, and semantics differ significantly).

After the migrator runs, the operator manually creates the remaining `de/` PBP entities in the mission workpiece, using `uk/` as a template. The `mission.validate` build step will catch any missing entities.

### 3. Legacy `business/` collection — known debt

The `business` collection was re-registered in `content.config.ts` (commit `2b4ed46cb`) as a **stopgap** to keep 329 content references (`{business.*.*}`) resolving. This is **known technical debt**, not a design decision. A future RFC will:

1. Migrate all `{business.*}` content references to `{business-profile.*}` or inline values
2. Delete the `business/` directory and unregister the collection

This RFC explicitly does NOT propose coexistence as a design — it acknowledges the incomplete RFC-0471 implementation and scopes this RFC to the minimum needed to unblock builds.

## Architectural fit

- **DNA-20 (superseded):** This RFC completes the supersession that RFC-0471 started but did not finish. DNA-20 is already marked superseded; this RFC does not `satisfy` it — it executes the remaining migration work.
- **DNA-41 (Property-based testing):** The migrator is a pure function with an idempotency invariant — covered by PBT with `fast-check`.
- **RFC-0479 (Migrator registry):** This migrator is registered in the existing registry with `id: "rfc-0481"` (1:1 with this RFC, per RFC-0479). It is the first content migrator in the registry (the existing `rfc-0479` migrator only transforms the pin file cursor format).
- **RFC-0471 (Delete @gogol/business):** This RFC is a follow-up that addresses the incomplete content migration. It does not amend RFC-0471 (which is implemented) — it references it as `related`.
- **RFC-0045 (Content references):** The legacy `business` collection remains registered as a stopgap. No change to the content-reference resolver.

## Design

### CLI surface

No new command. The migrator is invoked by the existing `mission.migrate` command (RFC-0479):

```sh
pnpm exec site-kernel run mission.migrate --mission <mission-id>
```

The migrator is registered in the registry and automatically selected by `migratorsToApply()` when `rfc-0481` is not in the system's `migratorCursor`.

### TypeScript contracts

```typescript
// packages/os/site-kernel-handoff/src/migrators/rfc-0481.ts

import type { Migrator, SternsystemData, MigrationContext } from "./types.ts";

export const RFC_0481_MIGRATOR_ID = "rfc-0481";

export const rfc0481Migrator: Migrator = {
  id: RFC_0481_MIGRATOR_ID,
  fromVersion: "4.4.0",
  toVersion: "4.5.0",
  description: "Create PBP business singleton from legacy business/company.md",
  transform: async (data: SternsystemData, ctx: MigrationContext) => {
    // For each locale, read business/{lang}/company.md,
    // map to PBP business entity, write business-profile/{lang}/business.md.
    // Skip if target already exists with pbp/business@1 schema (idempotent).
    // Throw MigrationError if source company.md is missing.
    return data;
  },
};
```

### File system responsibilities

| Path | Action |
| --- | --- |
| `packages/os/site-kernel-handoff/src/migrators/rfc-0481.ts` | Create — migrator implementation |
| `packages/os/site-kernel-handoff/src/migrators/registry.ts` | Edit — register `rfc0481Migrator` in `migratorRegistry` |
| `packages/os/site-kernel-handoff/src/migrators/__tests__/rfc-0481.pbt.test.ts` | Create — PBT idempotency test |
| `packages/os/site-kernel-handoff/src/migrators/__tests__/rfc-0481.snapshot.test.ts` | Create — snapshot test on real data |
| `src/content/business-profile/{lang}/business.md` | Created by migrator at runtime (not in source) |

### Output format

The migrator writes a markdown file with YAML frontmatter in PBP entity format:

```yaml
---
schema: pbp/business@1
id: https://webgogol.com/id/business
type: business
status: published
name: "Webgogol"
description: "..."
yearEstablished: 2026
brandRefs:
  default:
    ref: https://webgogol.com/id/brand
    expectedType: brand
legalIdentityRef:
  ref: https://webgogol.com/id/legal-identity
  expectedType: legal-identity
# ... remaining fields
governance:
  authorityRef: https://webgogol.com/id/business
  effectiveFrom: "2026-01-01"
  reviewEvery: P1Y
---
```

### Failure modes

- **`company.md` missing for a locale:** Migrator throws `MigrationError` with `filePath: "business/{lang}/company.md"`, `reason: "source file not found"`. Exit code 1. Operator must create the file or remove the locale from the system manifest.
- **`business.md` already exists but not PBP format:** Migrator overwrites it (the file is in the old `@gogol/business` format, not PBP). This is safe because the old format is not used by any runtime code after RFC-0471.
- **Migrator registry validation fails:** `migrator.registry.validate` reports missing test coverage or duplicate id. Exit code 1.

### Idempotency

The migrator checks for the existence of `business-profile/{lang}/business.md` with `schema: pbp/business@1` before writing. Re-running on already-migrated content is a no-op. This satisfies the PBT invariant `f(f(x)) == f(x)` (DNA-41).

### Tests

- **PBT test:** `rfc-0481.pbt.test.ts` — generates random legacy `company.md` frontmatter, runs the migrator twice, asserts the output is identical.
- **Snapshot test:** `rfc-0481.snapshot.test.ts` — runs the migrator on the real `webgogol-com` `business/de/company.md` and snapshots the output `business.md`.

## Rollout

- **Immediate:** Upon acceptance, the migrator is registered but not applied. It runs on the next `mission.migrate` for any Sternsystem whose `migratorCursor` does not include `rfc-0481`.
- **webgogol-com:** The next mission's `mission.migrate` creates `business-profile/de/business.md` and `business-profile/uk/business.md`. Operator then manually creates remaining `de/` PBP entities. `mission.validate` (with build) verifies the full entity graph.
- **New Sternsystems:** Automatically comply — onboarding creates `business-profile/` with PBP entities from templates. The migrator is a no-op (idempotent skip).
- **Compass sync:** No `docs/*.xml` changes needed — this RFC does not change repository-wide requirements or app-package relationships. It adds a migrator to an existing package.

## Alternatives considered

- **Migrate all 329 content references in this RFC.** Rejected: the scope is too large (329 references in 32 files, each requiring manual mapping from `{business.offer.price.monthly}` to PBP entity paths). This RFC stays focused on the minimum needed to unblock builds — the business singleton. Content reference migration is a separate future RFC.
- **Manually create `business.md` without a migrator.** Rejected: without a migrator, every new materialization would be missing the file. The migrator ensures idempotent, repeatable creation.
- **Delete `business/` directory now and let content references fail.** Rejected: 329 content references would break, causing 32 pages to fail. The stopgap `business` collection registration keeps them resolving until a future RFC migrates them.
- **Create `business.md` from `business-profile/de/company.md` instead of `business/de/company.md`.** Rejected: `business-profile/de/company.md` is in the old format (not PBP), and the migrator's job is to transform old to new. Using the old `business/` source is the correct direction.

## Risks

- **Incomplete `de/` PBP content:** The migrator only creates the `business.md` singleton. The operator must manually create offerings, products, policies, etc. for `de/`. If they miss some, `astro build` will fail (desired behavior — better to catch in validate than publish broken pages).
- **Legacy `business/` collection remains:** The stopgap `business` collection registration (commit `2b4ed46cb`) keeps 329 content references resolving. This is known debt. A future RFC must migrate the references and delete the collection. Agent misinterpretation risk: agents may see both collections and assume coexistence is the design — it is not. The `nonGoals` and Context sections explicitly frame this as debt.
- **RFC-0471 false acceptance:** This RFC reveals that RFC-0471's acceptance criteria were falsely checked. This is a process issue — the operator marked items as done without verification. Future RFCs with content migration acceptance criteria should include machine-checkable probes (RFC-0268) rather than manual grep checks.

## Acceptance criteria

- [x] `packages/os/site-kernel-handoff/src/migrators/rfc-0481.ts` exists and exports `rfc0481Migrator` (evidence: packages/os/site-kernel-handoff/src/migrators/rfc-0481.ts:296, `export const rfc0481Migrator`)
- [x] `packages/os/site-kernel-handoff/src/migrators/registry.ts` includes `rfc0481Migrator` in `migratorRegistry` (evidence: packages/os/site-kernel-handoff/src/migrators/registry.ts:21, `migratorRegistry: readonly Migrator[] = [rfc0479Migrator, rfc0481Migrator]`)
- [x] `pnpm --filter @gogol/site-kernel-handoff build:check` passes (tsc --noEmit) (evidence: `pnpm --filter @gogol/site-kernel-handoff build:check` exit 0, 2026-07-21)
- [x] `pnpm --filter @gogol/site-kernel-handoff test` passes (including new PBT + snapshot tests) (evidence: 77/77 tests pass, including rfc-0481.pbt.test.ts and rfc-0481.snapshot.test.ts)
- [x] `pnpm exec site-kernel run migrator.registry.validate` passes with `rfc-0481` registered (evidence: `migrator.registry.validate` exit 0, "2 migrator(s) in registry — no violations")
- [x] PBT test proves idempotency: `f(f(x)) == f(x)` for random `company.md` frontmatter (evidence: packages/os/site-kernel-handoff/src/migrators/rfc-0481.pbt.test.ts:73, `rfc-0481 migrator is idempotent: f(f(x)) == f(x) for random company.md`)
- [x] Snapshot test matches expected `business.md` output from real `business/de/company.md` (evidence: packages/os/site-kernel-handoff/src/migrators/rfc-0481.snapshot.test.ts:89, `snapshot: rfc-0481 creates business-profile/de/business.md from real company.md`)
- [x] `mission.migrate` on `webgogol-com` creates `business-profile/de/business.md` and `business-profile/uk/business.md` (migrator `rfc-0481`) (evidence: `mission.migrate --mission webgogol-com-m000009` exit 0, "created business-profile/de/business.md" + "created business-profile/uk/business.md")
- [x] `astro build` no longer throws `PBP-REF: No Business entity found in the entity index.` after `mission.migrate` + operator creates remaining `de/` entities (evidence: `pnpm --filter webgogol-com run build` — no `PBP-REF` or `No Business entity` errors in output; remaining build failures are pre-existing URL type issues unrelated to PBP)
- [x] `rfc.validate` passes on this file (RFC status: implemented) (evidence: `rfc.validate --json` shows 0 violations for RFC-0481)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- The migrator MUST be registered in `migratorRegistry` (not `MIGRATORS` — that was the old RFC-0221 array, removed by RFC-0479). The migrator id MUST be `rfc-0481` (1:1 with this RFC, per RFC-0479).
- The migrator MUST use `SternsystemData` (file-system rooted), not the old `AuthoredSet` (Map<string, string>).
- The migrator MUST use `fs.readFile` / `fs.writeFile` from `node:fs/promises`, consistent with the existing `rfc-0479` migrator pattern.
- Relative imports in the migrator file MUST use `.ts` extension (RFC-0092).
- The migrator file MUST carry `MODULE_CONTRACT` and `CHANGE_SUMMARY` Compass scaffolding (DNA-42).
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id RFC-0481 --reason "..." --invariant "DNA-N"` (RFC-0334). instead of working around it (RFC-0334).
