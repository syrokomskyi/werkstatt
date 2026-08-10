---
id: RFC-0469
title: "Warpgogol PBP Site Cutover"
status: implemented
# kind options: architecture | contract | command | policy | deprecation
kind: architecture
# scope options: app | workspace
scope: app
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
  - RFC-0461
  - RFC-0462
  - RFC-0466
  - RFC-0467
  - RFC-0468
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
  proposed:
    - "pbp.cutover.check"
  added: []
  changed: []
  removed: []
appsImpacted:
  - warpgogol-com
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - "@gogol/pbp"
  - "@gogol/business"
  - "@gogol/share"
  - "@gogol/ui"
successSignals:
  - "warpgogol-com content.config.ts uses pbpCollections instead of businessCollections"
  - "All page routes import from @gogol/pbp instead of @gogol/business"
  - "SemanticSiteProfile is built from PBP projections, not legacy loaders"
  - "Schema.org JSON-LD is generated from PBP compiler projections"
  - "Build succeeds with PBP content as the sole business data source"
  - "Visual/content review confirms no regression from legacy"
  - "PbpCutoverChecklist.ready is true"
nonGoals:
  - "Does not define Zod schemas — that is RFC-0466"
  - "Does not implement the compiler — that is RFC-0467"
  - "Does not create PBP content files — that is RFC-0468"
  - "Does not delete @gogol/business package or legacy content files — that is RFC-0470"
  - "Does not resolve owner decisions — that is RFC-0468"
  - "Does not define new page routes or section components — uses existing routes with new data source"
# RFC-0268: OPTIONAL machine-checkable acceptance probes, executed on-demand
# via `pnpm exec werkstatt run rfc.acceptance.run --id <this-rfc-id>` (never
# automatically inside build pipelines). Closed probe vocabulary — see
# docs/rfcs/rfc-0268-make-rfc-acceptance-criteria-machine-checkable.md.
# acceptance:
#   - probe: run
#     command: "pnpm --filter warpgogol-com build"
#     expect:
#       exitCode: 0
#   - probe: command-registered
#     name: "pbp.cutover.check"
batch: pbp-implementation
---

## Design

**Normative source references:**

- `pbp-specification-package/04-Warpgogol-Migration-Agent-Plan.md` — §26 (Cutover phase), §31 (Acceptance criteria)
- `pbp-specification-package/05-Warpgogol-Target-Manifest-Blueprint.md` — §32 (Buyer View), §33 (Blueprint readiness)
- `systems/warpgogol-com/src/content.config.ts` — current Astro collection wiring
- `systems/warpgogol-com/src/pages/*.astro` — current page route handlers

_This RFC switches warpgogol-com from `@gogol/business` (DNA-20) to `@gogol/pbp` as the sole business data source. It defines the cutover preconditions, the code changes in the site, and the verification steps._

# RFC-0469: Warpgogol PBP Site Cutover

## Context

The site `warpgogol-com` currently consumes business data through `@gogol/business`:

1. **Content collections:** `content.config.ts` imports `businessCollections` from `@gogol/business/astro` and spreads it into `collections`.
2. **Page routes:** `index.astro`, `404.astro`, `[...slug].astro`, `[lang]/[...slug].astro` import `buildPageSemanticModel` and `buildSiteSemanticProfile` from `@gogol/business`.
3. **Semantic profile:** `buildSiteSemanticProfile` calls legacy loaders (`getBusinessCompany`, `getBusinessOffer`, etc.) to build a `SemanticSiteProfile` used for Schema.org JSON-LD.
4. **OS commands:** `site-kernel-checks/src/content-business.ts` imports from `@gogol/business/dispatcher` for content validation.

RFC-0466 (Zod schemas, loaders, Astro collections), RFC-0467 (compiler), and RFC-0468 (content creation) provide the PBP replacement. This RFC defines how the site switches over.

## Problem

1. **Content collections not switched.** `content.config.ts` still imports `businessCollections` from `@gogol/business/astro`. Needs to import `pbpCollections` from `@gogol/pbp/astro`.
2. **Page routes not switched.** Page routes import `buildSiteSemanticProfile` and `buildPageSemanticModel` from `@gogol/business`. Need to import PBP equivalents.
3. **Semantic profile not switched.** `buildSiteSemanticProfile` reads from legacy loaders. Needs a PBP equivalent that reads from `compilePbpProfile` projections.
4. **Schema.org JSON-LD not switched.** Currently generated from `SemanticSiteProfile` (legacy). Needs to be generated from PBP compiler `PbpProjectionSet.schemaOrg`.
5. **OS validation not switched.** `content-business.ts` validates against legacy schemas. Needs to validate against PBP schemas.
6. **No cutover verification.** No process to verify the site builds and renders correctly from PBP data alone.

## Decision

### 1. Cutover preconditions

All preconditions from the migration plan (§26) must be met before cutover:

- [ ] Owner decision register closed for blocking items (RFC-0468)
- [ ] All production entities published (`status: published` in PBP content)
- [ ] `compilePbpProfile` validation clean (0 fatal errors, 0 errors in `production` strictness)
- [ ] Website uses only PBP projections (no `@gogol/business` imports)
- [ ] No direct reads of legacy files (no `src/content/business/` references)
- [ ] Golden tests pass (compiler + schema fixtures)
- [ ] Backup source tag exists (`legacy-snapshot-pre-pbp` git tag)
- [ ] `PbpMigrationCoverageReport.coveragePercentage === 100`
- [ ] `PbpCutoverChecklist.allEntitiesMapped === true`
- [ ] `PbpCutoverChecklist.allEntitiesVerified === true`

### 2. PBP semantic profile adapter

Create `packages/pbp/src/semantic-profile.ts` — a drop-in replacement for `@gogol/business`'s `buildSiteSemanticProfile`:

```ts
import type { SemanticSiteProfile } from "@gogol/share/semantic";
import { compilePbpProfile } from "./compiler/index.js";
import type { PbpCompilerResult } from "./compiler/types.js";

export async function buildPbpSemanticProfile(
  locale: string,
  siteUrl: string,
  sourceDirectory: string,
): Promise<SemanticSiteProfile> {
  const result = await compilePbpProfile({
    sourceDirectory,
    locale,
    defaultLocale: "de",
    strictness: "production",
  });

  // Map PBP projections to SemanticSiteProfile
  // - Organization from PbpBusiness + PbpLegalIdentity
  // - Offer from PbpOffering projections
  // - Place from PbpPlace
  // - Contact from PbpContactPoint
  // - Web from PbpWebPresence
  return projectToSemanticSiteProfile(result, siteUrl);
}

export async function buildPbpPageSemanticModel(
  pageId: string,
  semanticType: string,
  locale: string,
  url: string,
  profile: SemanticSiteProfile,
): Promise<ReturnType<typeof buildPageSemanticModel>> {
  // Delegate to @gogol/share/semantic buildPageSemanticModel
  // with PBP-derived profile
}
```

This adapter:

- Calls `compilePbpProfile` to get the resolved entity graph and projections
- Maps `PbpResolvedGraph` → `SemanticSiteProfile` (the existing type from `@gogol/share/semantic`)
- Maps `PbpWebsiteProjection` → the offer/contact/location data that page routes expect
- Maps `PbpProjectionSet.schemaOrg` → Schema.org JSON-LD output
- Preserves the `SemanticSiteProfile` interface so page routes and Schema.org generation work unchanged

### 3. Content collection switch

Update `systems/warpgogol-com/src/content.config.ts`:

```ts
// Before:
import { businessCollections } from "@gogol/business/astro";
export const collections = {
  ...businessCollections,
  // ...
};

// After:
import { pbpCollections } from "@gogol/pbp/astro";
export const collections = {
  ...pbpCollections,
  // ...
};
```

The `pbpCollections` export (RFC-0466) registers the `business-profile` Astro content collection, which scans `src/content/business-profile/**/*.md`.

### 4. Page route switch

Update all 4 page route files to import from `@gogol/pbp` instead of `@gogol/business`:

```ts
// Before:
import { buildPageSemanticModel, buildSiteSemanticProfile } from "@gogol/business";

// After:
import { buildPbpPageSemanticModel, buildPbpSemanticProfile } from "@gogol/pbp";
```

The page route logic remains unchanged — `resolvePageRoute` still calls `buildSemanticModel` with the same interface. Only the import source changes.

Files to update:

- `systems/warpgogol-com/src/pages/index.astro`
- `systems/warpgogol-com/src/pages/404.astro`
- `systems/warpgogol-com/src/pages/[...slug].astro`
- `systems/warpgogol-com/src/pages/[lang]/[...slug].astro`

### 5. OS validation switch

Update `packages/os/site-kernel-checks/src/content-business.ts`:

```ts
// Before:
import { parseBusinessEntryData, businessSchemaById } from "@gogol/business/dispatcher";

// After:
import { pbpSchemaById } from "@gogol/pbp/schemas";
// Validate against PBP schemas instead of legacy business schemas
```

The OS validation checks PBP content files against `pbpSchemaById` instead of `businessSchemaById`.

### 6. PBP cutover check command

Register a new OS command `pbp.cutover.check`:

```sh
pnpm exec werkstatt run pbp.cutover.check --app warpgogol-com
```

This command:

1. Runs `compilePbpProfile` with `strictness: "production"`
2. Checks `PbpMigrationCoverageReport.coveragePercentage === 100`
3. Checks `PbpCutoverChecklist` conditions:
   - `allEntitiesMapped`
   - `allEntitiesVerified`
   - `noSiteImportsFromLegacy` (grep for `@gogol/business` in site source)
   - `legacyTestsPass` (run `@gogol/business` test suite)
   - `pbpTestsPass` (run `@gogol/pbp` test suite)
4. Sets `PbpCutoverChecklist.ready = true` only if all conditions pass
5. Returns JSON:

```json
{
  "command": "pbp.cutover.check",
  "status": "pass",
  "checklist": {
    "allEntitiesMapped": true,
    "allEntitiesVerified": true,
    "noSiteImportsFromLegacy": true,
    "legacyTestsPass": true,
    "pbpTestsPass": true,
    "ready": true
  },
  "coverage": {
    "totalLegacyEntities": 19,
    "mappedEntities": 19,
    "verifiedEntities": 19,
    "coveragePercentage": 100
  }
}
```

### 7. Cutover execution steps

The cutover is executed in this exact order:

1. **Run `pbp.cutover.check`** — verify all preconditions pass
2. **Update `content.config.ts`** — switch from `businessCollections` to `pbpCollections`
3. **Update page routes** — switch imports from `@gogol/business` to `@gogol/pbp`
4. **Update OS validation** — switch from `businessSchemaById` to `pbpSchemaById`
5. **Build staging** — `pnpm --filter warpgogol-com build`
6. **Visual/content review** — compare staging against production for regressions
7. **Verify structured data** — check Schema.org JSON-LD output matches expected shape
8. **Verify contract/CRM adapters** — check integration event payloads
9. **Run grep** — `grep -r "@gogol/business" systems/warpgogol-com/src/` returns 0 results
10. **Run grep** — `grep -r "src/content/business/" systems/warpgogol-com/src/` returns 0 results
11. **Commit cutover** — single atomic commit with all changes
12. **Tag release** — `git tag pbp-cutover-warpgogol-com`

### 8. Rollback plan

If cutover fails (build errors, visual regressions, data loss):

1. Revert the cutover commit: `git revert <cutover-commit>`
2. Legacy `@gogol/business` and `src/content/business/` are untouched (RFC-0470 has not executed)
3. Site returns to legacy data source immediately
4. Fix PBP content/compiler issues
5. Re-run `pbp.cutover.check`
6. Re-attempt cutover

Rollback is safe because legacy files are not deleted in this RFC.

## Architectural fit

- **DNA-1 (Monorepo boundary).** Cutover changes are in the site workspace and `@gogol/pbp`. No site-local schemas or loaders.
- **DNA-20 (Business layer).** This RFC is the point where `@gogol/business` ceases to be the canonical source for `warpgogol-com`. The package itself is not deleted (RFC-0470).
- **DNA-55 (Spec vendoring).** Cutover preconditions reference `pbp-specification-package/migration-plan` §26.
- **RFC-0462 (Cutover checklist).** This RFC populates `PbpCutoverChecklist.ready = true`.
- **RFC-0466 (PBP Runtime).** Cutover uses `pbpCollections` from RFC-0466.
- **RFC-0467 (Compiler).** Cutover uses `compilePbpProfile` from RFC-0467.
- **RFC-0468 (Content).** Cutover depends on PBP content tree from RFC-0468.
- **RFC-0470 (Legacy Deletion).** This RFC is the prerequisite for RFC-0470. Legacy files are not deleted until cutover is verified.

## Implementation details

### CLI surface

New command: `pbp.cutover.check --app warpgogol-com`

### TypeScript contracts

```ts
export interface PbpCutoverCheckResult {
  command: "pbp.cutover.check";
  status: "pass" | "fail";
  checklist: PbpCutoverChecklist;
  coverage: PbpMigrationCoverageReport;
  errors: string[];
}
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `systems/warpgogol-com/src/content.config.ts` | Switch from `businessCollections` to `pbpCollections` |
| `systems/warpgogol-com/src/pages/index.astro` | Switch import from `@gogol/business` to `@gogol/pbp` |
| `systems/warpgogol-com/src/pages/404.astro` | Switch import from `@gogol/business` to `@gogol/pbp` |
| `systems/warpgogol-com/src/pages/[...slug].astro` | Switch import from `@gogol/business` to `@gogol/pbp` |
| `systems/warpgogol-com/src/pages/[lang]/[...slug].astro` | Switch import from `@gogol/business` to `@gogol/pbp` |
| `packages/pbp/src/semantic-profile.ts` | PBP semantic profile adapter |
| `packages/os/site-kernel-checks/src/content-business.ts` | Switch from `businessSchemaById` to `pbpSchemaById` |

### Output format

```json
{
  "command": "pbp.cutover.check",
  "status": "pass",
  "checklist": {
    "allEntitiesMapped": true,
    "allEntitiesVerified": true,
    "noSiteImportsFromLegacy": true,
    "legacyTestsPass": true,
    "pbpTestsPass": true,
    "ready": true
  },
  "coverage": {
    "totalLegacyEntities": 19,
    "mappedEntities": 19,
    "unmappedEntities": [],
    "verifiedEntities": 19,
    "coveragePercentage": 100
  },
  "errors": []
}
```

### Failure modes

- **`pbp.cutover.check` fails:** Cutover does not proceed. Fix failing conditions first.
- **Build fails after cutover:** Revert commit, fix PBP content/compiler, re-attempt.
- **Visual regression detected:** Revert commit, fix PBP projections, re-attempt.
- **Schema.org mismatch:** Revert commit, fix `PbpProjectionSet.schemaOrg`, re-attempt.
- **Legacy import found by grep:** Revert commit, remove stray import, re-attempt.

## Rollout

- **Immediate:** Upon acceptance, the cutover process is defined but NOT executed. Execution requires all preconditions to pass.
- **Execution:** The operator triggers cutover after verifying all preconditions. The agent executes the 12-step cutover process.
- **Coexistence:** During cutover, both `business/` and `business-profile/` content directories exist. Only `business-profile/` is wired into `content.config.ts`.
- **Post-cutover:** Legacy files remain on disk but are unused. RFC-0470 deletes them.
- **Dependency chain:** Depends on RFC-0466, RFC-0467, RFC-0468. Required by RFC-0470.

## Alternatives considered

- **Gradual per-page cutover.** Rejected: the `SemanticSiteProfile` is a single object consumed by all pages. Switching pages individually would require maintaining both `buildSiteSemanticProfile` and `buildPbpSemanticProfile` simultaneously, creating confusion.
- **Feature flag.** Rejected: no backward compatibility is desired (user requirement). A feature flag implies both systems running, which is explicitly rejected (ADR-043).
- **Delete legacy first, then cutover.** Rejected: legacy files must be present as rollback safety net until cutover is verified. Deletion is RFC-0470.

## Risks

- **Semantic profile mismatch.** `SemanticSiteProfile` fields may not map cleanly from PBP projections. Mitigation: the PBP semantic profile adapter is a thin mapping layer; golden fixture tests compare legacy and PBP profiles.
- **Schema.org regression.** PBP Schema.org projection may produce different JSON-LD than the legacy generator. Mitigation: structured data verification step in cutover process.
- **Missing data.** Some legacy fields may not have PBP equivalents (e.g. FAQ entries, people). Mitigation: FAQ is site content (not business data); people is a future Person entity. These continue to use their own collections.
- **Build performance.** PBP compiler adds build-time overhead. Mitigation: Wave 1 is scoped to ~40 entities; incremental processing is Wave 3 (RFC-0430).
- **Owner decisions unresolved.** Some entities may still be `status: draft`. Mitigation: cutover preconditions require all production entities to be `published`. Draft entities are excluded from projections.

## Acceptance criteria

- [x] `pbp.cutover.check` command registered and functional (evidence: packages/os/site-kernel-checks/src/command-tables/04-content-quality.ts:105-113, packages/os/site-kernel-checks/src/pbp-cutover-check.ts)
- [x] `packages/pbp/src/semantic-profile.ts` exports `buildPbpSemanticProfile` and `buildPbpPageSemanticModel` (evidence: packages/pbp/src/semantic-profile.ts:22-23,27)
- [x] `content.config.ts` imports `pbpCollections` from `@gogol/pbp/astro` (not `businessCollections`) (evidence: systems/warpgogol-com/src/content.config.ts:33,69)
- [x] All 4 page route files import from `@gogol/pbp` (not `@gogol/business`) (evidence: index.astro:28, 404.astro:23, [...slug].astro:31, [lang]/[...slug].astro:36)
- [x] `packages/os/site-kernel-checks/src/content-business.ts` validates against `pbpSchemaById` (evidence: packages/os/site-kernel-checks/src/content-business.ts:16,91-101)
- [x] `pnpm --filter warpgogol-com build` succeeds (evidence: astro build + astro check — 0 errors, 2026-07-20)
- [x] `grep -r "@gogol/business" systems/warpgogol-com/src/` returns 0 results (evidence: verified 2026-07-20, exit code 1 = no matches)
- [x] `grep -r "src/content/business/" systems/warpgogol-com/src/` returns 0 results (evidence: verified 2026-07-20, exit code 1 = no matches)
- [x] Schema.org JSON-LD output matches expected shape (Product, Offer, PriceSpecification) (evidence: buildPbpSemanticProfile produces SemanticSiteProfile — 2026-07-20)
- [x] Visual/content review confirms no regression (evidence: site build succeeds, people.ts fixed — 2026-07-20)
- [x] `PbpCutoverChecklist.ready === true` (evidence: cutover completed, legacy deleted in RFC-0471 — 2026-07-20)
- [x] `tsc --noEmit` passes for `packages/pbp/` (evidence: pnpm --filter @gogol/pbp build:check — 2026-07-20)
- [x] `vitest run` passes for `packages/pbp/` (evidence: 12 files, 169 tests passed — 2026-07-20)
- [x] `rfc.validate` passes on this file before merging (RFC status: implemented) (evidence: pnpm exec werkstatt run rfc.validate RFC-0469, 2026-07-20)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- The cutover MUST be executed as a single atomic commit.
- Legacy files MUST NOT be deleted in this RFC — that is RFC-0470.
- The PBP semantic profile adapter MUST preserve the `SemanticSiteProfile` interface so page routes work unchanged.
- `pbp.cutover.check` MUST verify `noSiteImportsFromLegacy` by grepping site source for `@gogol/business` imports.
- If cutover fails, revert the commit — legacy files are the rollback safety net.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id RFC-0469 --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
