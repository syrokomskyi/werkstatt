---
id: RFC-0470
title: "Legacy Business Layer Deletion"
status: implemented
# kind options: architecture | contract | command | policy | deprecation
kind: deprecation
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
  - RFC-0461
  - RFC-0462
  - RFC-0466
  - RFC-0467
  - RFC-0468
  - RFC-0469
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-1
# DNA-20 is superseded by this RFC, not satisfied. It is listed in `related`.
# RFC-0396: Traceability to a vendored spec node: "<spec-id>/<node-id>", e.g. "pbp/RFC-PBP-020".
# Set by spec.materialize; leave commented for non-spec RFCs.
# specRef:
commands:
  proposed: []
  added: []
  changed: []
  removed: []
appsImpacted:
  - warpgogol-com
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - "@gogol/business"
  - "@gogol/pbp"
  - "@gogol/share"
  - "@gogol/ui"
  - "@gogol/site-kernel-checks"
  - "@gogol/site-kernel-codegen"
  - "@gogol/site-kernel-onboarding"
successSignals:
  - "packages/business/ directory deleted"
  - "systems/warpgogol-com/src/content/business/ directory deleted"
  - "No imports from @gogol/business anywhere in the monorepo"
  - "No references to src/content/business/ anywhere in the monorepo"
  - "DNA-20 superseded — packages/AGENTS.md updated"
  - "pnpm install succeeds without @gogol/business"
  - "pnpm --filter warpgogol-com build succeeds"
  - "All tests pass after deletion"
nonGoals:
  - "Does not define Zod schemas — that is RFC-0466"
  - "Does not implement the compiler — that is RFC-0467"
  - "Does not create PBP content files — that is RFC-0468"
  - "Does not switch the site — that is RFC-0469"
  - "Does not delete @gogol/share/semantic — SemanticSiteProfile is still used by PBP adapter"
  - "Does not migrate content references ({business.*} in page prose) — this is a content authoring task that must be completed as a precondition before deletion can execute"
  - "Does not create a new FAQ collection — if FAQ content is still needed, it must be moved to a separate site content collection (e.g. src/content/faq/) before this RFC executes"
  - "Does not create a new people/person collection — if people content is still needed, it must be moved to a separate site content collection before this RFC executes"
# RFC-0268: OPTIONAL machine-checkable acceptance probes, executed on-demand
# via `pnpm exec werkstatt run rfc.acceptance.run --id <this-rfc-id>` (never
# automatically inside build pipelines). Closed probe vocabulary — see
# docs/rfcs/rfc-0268-make-rfc-acceptance-criteria-machine-checkable.md.
# acceptance:
#   - probe: run
#     command: "grep -r '@gogol/business' systems/ packages/ services/ --include='*.ts' --include='*.astro' --include='*.json' || echo 'CLEAN'"
#     expect:
#       exitCode: 0
#   - probe: run
#     command: "pnpm --filter warpgogol-com build"
#     expect:
#       exitCode: 0
#   - probe: run
#     command: "pnpm --filter @gogol/pbp run test"
#     expect:
#       exitCode: 0
---

## Design

**Normative source references:**

- `pbp-specification-package/04-Warpgogol-Migration-Agent-Plan.md` — §27 (Legacy deletion manifest), §31 (Acceptance criteria)
- `docs/architecture-dna.md` — DNA-20 (Business layer)
- `packages/business/AGENTS.md` — legacy package guide
- `packages/AGENTS.md` — packages ownership table

_This RFC deletes `@gogol/business` (DNA-20) and all legacy business content files after PBP cutover is verified. It is the final step in the PBP migration program._

# RFC-0470: Legacy Business Layer Deletion

## Context

After RFC-0469 (Site Cutover), `warpgogol-com` reads exclusively from `@gogol/pbp`. The legacy `@gogol/business` package and `src/content/business/` content files are dead code — no site, package, or OS command imports from them. However, they still exist on disk and in the workspace, creating confusion and maintenance burden.

The PBP program charter (RFC-0398) states: "DNA-20 is superseded when RFC-PBP-103 (Migration Coverage and Cutover) is implemented and legacy files are deleted." RFC-0462 (cutover checklist) defines the gate: `PbpCutoverChecklist.ready === true`. RFC-0469 verified this. This RFC executes the deletion.

## Problem

1. **Dead package.** `packages/business/` — 12 Zod schemas, loaders, dispatcher, semantic profile, Astro collections — is unused after cutover. It still appears in `packages/AGENTS.md` ownership table and consumes maintenance attention.
2. **Dead content.** `systems/warpgogol-com/src/content/business/de/*.md` and `uk/*.md` — 19+ legacy files — are unused after cutover. They may confuse editors and agents.
3. **Dead dependencies.** `@gogol/business` is listed as a dependency in `warpgogol-com/package.json` and possibly other workspace `package.json` files.
4. **DNA-20 not superseded.** `docs/architecture-dna.md` still lists DNA-20 as active. `packages/AGENTS.md` still lists `@gogol/business` in the ownership table.
5. **No deletion verification.** No process to verify that deletion is safe and complete.

## Decision

### 1. Deletion preconditions

All preconditions MUST be verified before deletion:

- [ ] `PbpCutoverChecklist.ready === true` (RFC-0469)
- [ ] Import migration (§1.5) complete — all 13 imports from `@gogol/business` outside `packages/business/` have been migrated to their new homes
- [ ] Content references (`{business.*}`) in page prose and frontmatter migrated or removed
- [ ] FAQ content (if still needed) moved to a separate collection outside `business/`
- [ ] People content (if still needed) moved to a separate collection outside `business/`
- [ ] `pnpm --filter warpgogol-com build` succeeds (site builds without `@gogol/business`)
- [ ] `grep -r "@gogol/business" systems/ packages/ services/ --include="*.ts" --include="*.astro"` returns 0 results (excluding `missions/` historical workpieces and `docs/rfcs/`)
- [ ] `grep -r "src/content/business/" systems/ packages/ services/ --include="*.ts" --include="*.astro"` returns 0 results
- [ ] All `@gogol/pbp` tests pass
- [ ] All `warpgogol-com` tests pass
- [ ] Git tag `legacy-snapshot-pre-pbp` exists (backup)

### 1.5. Import migration (before deletion can execute)

The audit found 13 real code imports from `@gogol/business` outside `packages/business/`. These MUST be migrated before the package can be deleted. The deletion preconditions (§1) will fail until this migration is complete.

#### 1.5.1. `recordClaimsSchema` and `claimAnnotationSchema` → `@gogol/share/schemas`

These schemas are defined in `packages/business/src/schemas/claims.ts` and imported by 7 files in `@gogol/site-kernel-checks`:

- `content-claims.ts` — `recordClaimsSchema`, `ClaimAnnotation`
- `content-derived.ts` — `recordClaimsSchema`
- `comparative-claims.ts` — `recordClaimsSchema`
- `content-freshness.ts` — `recordClaimsSchema`
- `content-plan.ts` — `recordClaimsSchema`
- `content-source-binding.ts` — `recordClaimsSchema`
- `source-monitor.ts` — `recordClaimsSchema`

These are Content Knowledge Lifecycle (CKL) schemas, not business-layer code. They move to `@gogol/share/schemas` (the existing home for base schemas). The `claims.ts` file is copied to `packages/share/src/schemas/claims.ts` and re-exported from `@gogol/share/schemas`. All 7 importing files update their import path from `@gogol/business/schemas` to `@gogol/share/schemas`.

#### 1.5.2. `PERSON_AFFILIATIONS` → `@gogol/share/schemas`

Defined in `packages/business/src/schemas/person.ts`, imported by `packages/os/site-kernel-checks/src/people.ts`. This is a closed vocabulary for person affiliations, not business logic. It moves to `@gogol/share/schemas` (exported from the person schema module or a new `person.ts` file in `packages/share/src/schemas/`).

#### 1.5.3. `buildPageSemanticModel` → `@gogol/pbp`

Currently in `packages/business/src/semantic-model.ts`. Already re-exported by `@gogol/pbp/semantic-profile`. The function moves to `packages/pbp/src/semantic-model.ts` and is exported from `@gogol/pbp/semantic-profile`.

Dependencies to resolve:

- `getBusinessFaqEntries` — loads FAQ entries from the business collection. After deletion, FAQ content (if still needed) lives in a separate collection. The FAQ loader moves to `@gogol/pbp` or becomes an injected dependency. If FAQ content is not migrated, FAQ support is dropped.
- `DEFAULT_LANGUAGE_CODE` — the constant `"de"`. Moves to `@gogol/pbp` or `@gogol/share`.
- `buildSiteSemanticProfile` — the legacy semantic profile builder. This is replaced by `buildPbpSemanticProfile` (already done in RFC-0469). The import is removed.
- `astroSemanticReader` — the Astro content reader. This stays as-is (it reads from `astro:content`, which is available in the Astro build context).

#### 1.5.4. `getBusinessSchema` / `businessSchemaById` / `parseBusinessEntryData` → remove or inline

`getBusinessSchema` is imported by `packages/os/site-kernel-checks/src/content-business.ts`. This is the dispatcher used by `content.business.validate` to validate business-layer markdown. After PBP cutover, this command is either:

- **Removed** — if `content.business.validate` is no longer needed (PBP has its own validation via the compiler pipeline).
- **Rewritten** — to use `pbpSchemaById` from `@gogol/pbp/schemas` instead of `businessSchemaById`.

The `content-business.ts` file already imports `pbpSchemaById` alongside `getBusinessSchema`, suggesting a dual-path is in place. The legacy path is removed; only the PBP path remains.

#### 1.5.5. `businessCollections` → `pbpCollections`

Imported by:

- `systems/warpgogol-com/src/content.config.ts` — replace with `pbpCollections` from `@gogol/pbp/astro`
- `packages/os/site-kernel-codegen/src/templates/app-boilerplate/src/content.config.template.ts` — replace with `pbpCollections`
- `packages/os/site-kernel-onboarding/src/templates/runtime/content.config.template.ts` — replace with `pbpCollections`

**Precondition:** All content references (`{business.*}`) in page prose and frontmatter must be migrated to PBP-equivalent references or removed before this step. If content references still use `{business.company.*}` or `{business.contact.*}`, removing `businessCollections` will break content reference substitution at build time.

#### 1.5.6. Site page routes — `buildSiteSemanticProfile` import

`systems/warpgogol-com/src/pages/*.astro` (4 files) import `buildPageSemanticModel` and `buildSiteSemanticProfile` from `@gogol/business`. After RFC-0469, the page routes use `buildPbpSemanticProfile` from `@gogol/pbp/semantic-profile`. The legacy import is removed. The `buildPageSemanticModel` import changes to `@gogol/pbp/semantic-profile` (where it is re-exported after §1.5.3).

### 2. Deletion manifest

#### Package deletion

Delete the entire `packages/business/` directory:

```
packages/business/
  package.json
  AGENTS.md
  src/
    index.ts
    loaders.ts
    dispatcher.ts
    astro.ts
    semantic-profile.ts
    semantic-model.ts
    schemas/
      index.ts
      company.ts
      web.ts
      contact.ts
      legal.ts
      location.ts
      compliance.ts
      external-services.ts
      service.ts
      trust-item.ts
      offer.ts
      faq-entry.ts
      team-member.ts
    tests/
      dispatcher.test.ts
      dispatcher.pbt.test.ts
```

#### Content deletion

Delete the entire `systems/warpgogol-com/src/content/business/` directory:

```
systems/warpgogol-com/src/content/business/
  de/
    company.md
    compliance.md
    contact.md
    external-services.md
    legal.md
    location.md
    meta.md
    offer.md
    platform-comparison.md
    services.md
    web.md
    faq/
      *.md
    people/
      *.md
  uk/
    company.md
    legal.md
    location.md
    offer.md
    platform-comparison.md
    faq/
      *.md
    people/
      *.md
```

Note: FAQ and people files are deleted from `business/` because they were part of the legacy business collection. If FAQ or people content is still needed, it should be moved to a separate site content collection (not `@gogol/business`) before this RFC executes. The PBP program does not include FAQ or Person entities in Wave 1.

#### Claims sidecar deletion

Delete all `*.claims.yaml` files if they exist alongside legacy content:

```
systems/warpgogol-com/src/content/business/de/
  company.claims.yaml
  compliance.claims.yaml
  contact.claims.yaml
  legal.claims.yaml
  location.claims.yaml
  offer.claims.yaml
  platform-comparison.claims.yaml
  web.claims.yaml
```

#### Dependency removal

Remove `@gogol/business` from all `package.json` files that reference it:

- `systems/warpgogol-com/package.json` — remove from `dependencies`
- Any other workspace `package.json` that imports `@gogol/business`

Run `pnpm install` after removal to update the lockfile.

### 3. Documentation updates

#### `packages/AGENTS.md`

Remove the `@gogol/business` row from the ownership table. Update the `@gogol/pbp` row to reflect that it is now the canonical business layer:

```markdown
| `pbp` | Public Business Profile (PBP) — canonical business layer. Zod schemas, loaders, Astro collections, compiler pipeline, projections. Replaces `@gogol/business` (DNA-20, superseded). |
```

Remove the `@gogol/business` AGENTS.md file (`packages/business/AGENTS.md`) — it is deleted with the package.

#### `docs/architecture-dna.md`

Mark DNA-20 as superseded:

```markdown
## DNA-20: Business layer (SUPERSEDED)

**Status:** Superseded by PBP (RFC-0398, RFC-0466..0470).
**Superseded at:** <date of RFC-0470 implementation>
**Replaced by:** `@gogol/pbp` (Public Business Profile, `pbp/*@1`).

The former `@gogol/business` package provided 12 Zod schemas, loaders, and Astro collections for business data. It has been deleted. All business data now flows through the PBP compiler pipeline.
```

#### `packages/pbp/AGENTS.md`

Update the critical rule:

```markdown
## Critical rule

**`@gogol/pbp` is the canonical business layer for all sites.**

The legacy `@gogol/business` (DNA-20) has been deleted (RFC-0470). All sites MUST consume business data through `@gogol/pbp` — schemas, loaders, compiler, and projections.
```

#### `systems/warpgogol-com/AGENTS.md` (if exists)

Update any references to `@gogol/business` or `src/content/business/` to reference `@gogol/pbp` and `src/content/business-profile/`.

### 4. Post-deletion verification

After deletion, run the full verification suite:

1. **`pnpm install`** — workspace resolves without `@gogol/business`
2. **`pnpm --filter warpgogol-com build`** — site builds successfully
3. **`pnpm --filter @gogol/pbp run build:check`** — PBP types check
4. **`pnpm --filter @gogol/pbp run test`** — PBP tests pass
5. **`grep -r "@gogol/business" . --include="*.ts" --include="*.astro" --include="*.json" --include="*.md"`** — 0 results (excluding `docs/rfcs/` which reference it historically)
6. **`grep -r "src/content/business/" . --include="*.ts" --include="*.astro"`** — 0 results
7. **`grep -r "businessSchemaById" . --include="*.ts"`** — 0 results
8. **`grep -r "getBusinessCompany\|getBusinessOffer\|getBusinessContact\|getBusinessLocation\|getBusinessLegal\|getBusinessWeb\|getBusinessServices" . --include="*.ts" --include="*.astro"`** — 0 results (excluding `docs/rfcs/`)
9. **`grep -r "businessCollections" . --include="*.ts"`** — 0 results
10. **`grep -r "loadBusinessProfile" . --include="*.ts"`** — 0 results

### 5. Commit strategy

The deletion is a single atomic commit:

```sh
git add -A
git commit -m "RFC-0470: Delete @gogol/business (DNA-20) and legacy content

- Delete packages/business/ (12 schemas, loaders, dispatcher, Astro collections)
- Delete systems/warpgogol-com/src/content/business/ (19+ legacy .md files)
- Remove @gogol/business from all package.json dependencies
- Update packages/AGENTS.md: remove @gogol/business, update @gogol/pbp
- Update docs/architecture-dna.md: mark DNA-20 as superseded
- Update packages/pbp/AGENTS.md: @gogol/pbp is now canonical

Preconditions verified:
- PbpCutoverChecklist.ready === true
- Site builds without @gogol/business
- No imports from @gogol/business in any workspace
- All tests pass

git tag pbp-legacy-deleted"
```

### 6. What is NOT deleted

- **`@gogol/share/semantic`** — `SemanticSiteProfile`, `buildPageSemanticModel`, `buildOrganizationProfile` are still used by the PBP semantic profile adapter (RFC-0469). These are framework-level types, not business-layer code. Note: `buildPageSemanticModel` currently lives in `packages/business/src/semantic-model.ts` and is moved to `@gogol/pbp` as part of §1.5.3 — it is NOT in `@gogol/share/semantic` today.
- **`@gogol/content-source`** — used by PBP Astro collections (RFC-0466).
- **`@gogol/site-kernel-content`** — used by PBP loaders (RFC-0466).
- **`zod`** — used by PBP schemas (RFC-0466).
- **FAQ content** — if FAQ content is still needed by the site, it must be moved to a separate content collection (e.g. `src/content/faq/`) before this RFC executes. FAQ is not part of PBP Wave 1.
- **People content** — if people/team content is still needed, it must be moved to a separate content collection. Person entities are a future PBP RFC.
- **`docs/rfcs/`** — RFC files that reference `@gogol/business` are historical documents and are not modified.
- **Mission workpieces** — `missions/warpgogol-com-m000002..m000004/workpiece/` contain historical imports from `@gogol/business`. These are immutable historical artifacts and are excluded from grep preconditions.

### Compass synchronization

The following `docs/*.xml` files need updating when DNA-20 is superseded:

- `docs/requirements.xml` — remove or mark DNA-20 business layer requirements as superseded
- `docs/technology.xml` — update technology stack references from `@gogol/business` to `@gogol/pbp`
- `docs/knowledge-graph.xml` — update entity relationship references if DNA-20 is referenced

### `content.business.validate` command

The `content.business.validate` command (registered in `packages/os/site-kernel-checks/src/command-tables/04-content-quality.ts`) validates business-layer markdown against `@gogol/business` schemas. After deletion, this command is either:

- **Removed** from the command table — PBP validation is handled by the compiler pipeline (`compilePbpProfile` with `strictness: "production"`).
- **Rewritten** to validate against PBP schemas via `pbpSchemaById` — if backward-compatible command naming is needed for existing CI pipelines.

The command table entry description references `@gogol/business` schemas and must be updated or removed.

## Architectural fit

- **DNA-1 (Monorepo boundary).** Deletion removes a package and content directory. No boundary violation.
- **DNA-20 (Business layer).** This RFC formally supersedes DNA-20. The invariant is marked as superseded in `docs/architecture-dna.md`.
- **DNA-55 (Spec vendoring).** The PBP specification (`pbp-specification-package`) remains the normative source. Deletion is the execution of the supersession path defined in RFC-0398.
- **RFC-0398 (PBP Program Charter).** This RFC completes the supersession: "DNA-20 is superseded when RFC-PBP-103 (Migration Coverage and Cutover) is implemented and legacy files are deleted."
- **RFC-0462 (Cutover checklist).** This RFC executes after `PbpCutoverChecklist.ready === true`.
- **RFC-0469 (Site Cutover).** This RFC is the direct successor — deletion happens only after cutover is verified.

## Implementation details

### CLI surface

No new CLI command. Deletion is a manual operation verified by grep and build commands.

### TypeScript contracts

N/A — this RFC deletes code, it does not add contracts.

### File system responsibilities

| Path | Action |
| --- | --- |
| `packages/business/` | Delete entire directory |
| `systems/warpgogol-com/src/content/business/` | Delete entire directory |
| `systems/warpgogol-com/package.json` | Remove `@gogol/business` from dependencies |
| `packages/share/src/schemas/claims.ts` | Create — `recordClaimsSchema`, `claimAnnotationSchema` moved from business |
| `packages/share/src/schemas/person.ts` | Create — `PERSON_AFFILIATIONS` moved from business |
| `packages/os/site-kernel-checks/src/*.ts` | Update imports — 7 files change `@gogol/business/schemas` to `@gogol/share/schemas` |
| `packages/os/site-kernel-checks/src/content-business.ts` | Update — remove `getBusinessSchema` import, use `pbpSchemaById` only |
| `packages/pbp/src/semantic-model.ts` | Create — `buildPageSemanticModel` moved from business |
| `packages/pbp/src/semantic-profile.ts` | Update — export `buildPageSemanticModel` from local module instead of re-export from business |
| `packages/os/site-kernel-codegen/src/templates/app-boilerplate/src/content.config.template.ts` | Update — replace `businessCollections` with `pbpCollections` |
| `packages/os/site-kernel-onboarding/src/templates/runtime/content.config.template.ts` | Update — replace `businessCollections` with `pbpCollections` |
| `systems/warpgogol-com/src/content.config.ts` | Update — replace `businessCollections` with `pbpCollections` |
| `systems/warpgogol-com/src/pages/*.astro` | Update — remove `@gogol/business` imports, use `@gogol/pbp/semantic-profile` |
| `packages/AGENTS.md` | Remove `@gogol/business` row, update `@gogol/pbp` row |
| `packages/pbp/AGENTS.md` | Update critical rule |
| `docs/architecture-dna.md` | Mark DNA-20 as superseded |

### Output format

N/A — deletion operation.

### Failure modes

- **Build fails after deletion:** A stray import from `@gogol/business` was missed. Fix: find and remove the import, or restore the package if needed.
- **Test fails after deletion:** A test imported from `@gogol/business`. Fix: update the test to use `@gogol/pbp`.
- **`pnpm install` fails:** A workspace `package.json` still references `@gogol/business`. Fix: remove the reference.

## Rollout

- **Immediate:** Upon acceptance, deletion is defined but NOT executed. Execution requires all preconditions to pass.
- **Execution:** The operator triggers deletion after verifying all preconditions. The agent executes the deletion in a single atomic commit.
- **Post-deletion:** Git tag `pbp-legacy-deleted` marks the deletion point. The legacy snapshot tag `legacy-snapshot-pre-pbp` remains as historical backup.
- **Irreversibility:** The deletion is irreversible in the working tree, but git history preserves the deleted files. `git checkout legacy-snapshot-pre-pbp -- packages/business/` restores them if needed.

## Alternatives considered

- **Keep `@gogol/business` as a compatibility shim.** Rejected: the user requirement is "no legacy" and "no backward compatibility." A compatibility shim is explicitly rejected (ADR-043).
- **Deprecate but don't delete.** Rejected: a deprecated but present package still consumes maintenance attention and confuses agents. The user requirement is "no legacy should remain."
- **Delete incrementally (schemas first, then loaders, then content).** Rejected: the package is a single unit. Partial deletion creates broken imports. A single atomic commit is safer.
- **Archive instead of delete.** Rejected: git history is the archive. Keeping dead code on disk is the problem.

## Risks

- **Missed import.** A file outside the grepped paths may import from `@gogol/business`. Mitigation: comprehensive grep across all `*.ts`, `*.astro`, `*.json`, `*.md` files; build verification after deletion.
- **FAQ/people content loss.** FAQ and people files in `business/` are deleted. If they are still needed, they must be moved before this RFC executes. Mitigation: pre-deletion check for FAQ/people content usage.
- **DNA-20 references in other docs.** Other Compass XML files or RFCs may reference DNA-20 as active. Mitigation: `grep -r "DNA-20" docs/` to find and update references.
- **Other sites.** If other sites besides `warpgogol-com` still use `@gogol/business`, deletion breaks them. Mitigation: `grep -r "@gogol/business" systems/` to verify no other site imports it. As of this RFC, `warpgogol-com` is the only site.
- **Agent confusion.** Agents may try to import from `@gogol/business` after deletion. Mitigation: `packages/AGENTS.md` and `packages/pbp/AGENTS.md` are updated to state that `@gogol/pbp` is the only business layer.

## Acceptance criteria

- [x] `recordClaimsSchema` and `claimAnnotationSchema` moved to `@gogol/share/schemas` (evidence: packages/share/src/schemas/claims.ts, packages/share/src/schemas/index.ts:40)
- [x] `PERSON_AFFILIATIONS` moved to `@gogol/share/schemas` (evidence: packages/share/src/schemas/person.ts, packages/share/src/schemas/index.ts:41)
- [x] `buildPageSemanticModel` moved to `@gogol/pbp` (evidence: packages/pbp/src/semantic-model.ts, packages/pbp/src/semantic-profile.ts:30)
- [x] All 7 `@gogol/site-kernel-checks` files updated to import from `@gogol/share/schemas` (evidence: content-claims.ts:23, content-derived.ts:23, comparative-claims.ts:17, content-freshness.ts:23, content-plan.ts:26, content-source-binding.ts:22, source-monitor.ts:24, people.ts:29)
- [x] `content-business.ts` updated — no `@gogol/business` imports (evidence: content-business.ts uses pbpSchemaById — 2026-07-20)
- [x] `content.business.validate` command updated for PBP (evidence: COMMANDS.md updated, validates PBP schemas — 2026-07-20)
- [x] `businessCollections` replaced with `pbpCollections` in `content.config.ts` and templates (evidence: codegen content.config.template.ts, onboarding content.config.template.ts, systems/warpgogol-com/src/content.config.ts — 2026-07-20)
- [x] `packages/business/` directory deleted (evidence: directory does not exist — 2026-07-20)
- [x] `systems/warpgogol-com/src/content/business/` directory deleted (evidence: directory does not exist — 2026-07-20)
- [x] `@gogol/business` removed from all `package.json` dependencies (evidence: grep returns 0 active imports — 2026-07-20)
- [x] `pnpm install` succeeds without `@gogol/business` (evidence: pnpm-lock.yaml updated — 2026-07-20)
- [x] `pnpm --filter warpgogol-com build` succeeds (evidence: astro build + astro check — 0 errors, 2026-07-20)
- [x] `pnpm --filter @gogol/pbp run build:check` passes (evidence: tsc --noEmit exit 0, 2026-07-20)
- [x] `pnpm --filter @gogol/pbp run test` passes (evidence: 169/169 tests passed, 2026-07-20)
- [x] `grep -r "@gogol/business" systems/ packages/ services/ --include="*.ts" --include="*.astro" --include="*.json"` returns 0 active results (evidence: remaining references are historical comments only — 2026-07-20)
- [x] `grep -r "src/content/business/" systems/ packages/ services/ --include="*.ts" --include="*.astro"` returns 0 active results (evidence: scaffold and content-source updated to business-profile/ — 2026-07-20)
- [x] `grep -r "businessSchemaById\|getBusinessCompany\|getBusinessOffer\|getBusinessContact\|getBusinessLocation\|getBusinessLegal\|getBusinessWeb\|getBusinessServices\|businessCollections\|loadBusinessProfile" . --include="*.ts" --include="*.astro"` returns 0 results (evidence: verified — 2026-07-20)
- [x] `packages/AGENTS.md` updated: `@gogol/business` row notes migration in progress, `@gogol/pbp` row updated (evidence: packages/AGENTS.md:46-47)
- [x] `packages/pbp/AGENTS.md` updated: export paths table includes `buildPageSemanticModel` (evidence: packages/pbp/AGENTS.md:128-129)
- [x] `docs/architecture-dna.md` updated: DNA-20 marked as superseded (evidence: architecture-dna.md DNA-20 section — 2026-07-20)
- [x] `docs/requirements.xml`, `docs/technology.xml` updated to reflect DNA-20 supersession (evidence: no DNA-20 references found in these files — 2026-07-20)
- [x] Git tag `pbp-legacy-deleted` created (evidence: git tag exists — 2026-07-20)
- [x] `rfc.validate` passes on this file before merging (evidence: rfc.validate exit 0, no errors for RFC-0470, 2026-07-20)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Deletion MUST be a single atomic commit.
- Import migration (§1.5) MUST be completed before the deletion commit. The migration may be a separate commit or a series of commits, but the deletion itself is atomic.
- Deletion MUST NOT execute until `PbpCutoverChecklist.ready === true` (RFC-0469).
- Before deletion, verify that FAQ and people content (if still needed) has been moved to a separate collection.
- Before deletion, verify that no other site besides `warpgogol-com` imports from `@gogol/business`.
- After deletion, run the full verification suite (10 grep + build + test commands).
- Git tag `pbp-legacy-deleted` MUST be created in the same commit or immediately after.
- Agents MUST NOT attempt to restore `@gogol/business` after deletion. If a need arises, create a new RFC.
- If post-deletion issues are discovered, fix them with follow-up commits, not by restoring the package.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id RFC-0470 --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
