---
id: RFC-0471
title: "Legacy Business Layer Content Migration and Package Deletion"
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
  - RFC-0470
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-1
# RFC-0396: Traceability to a vendored spec node: "<spec-id>/<node-id>", e.g. "pbp/RFC-PBP-020".
# Set by spec.materialize; leave commented for non-spec RFCs.
# specRef:
commands:
  proposed: []
  added: []
  changed:
    - content.business.validate
  removed:
    - pbp.cutover.check
appsImpacted:
  - webgogol-com
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - "@gogol/pbp"
  - "@gogol/share"
  - "@gogol/site-kernel-checks"
successSignals:
  - signal: grep
    description: "No imports from @gogol/business outside docs/rfcs/ and missions/"
  - signal: build
    description: "pnpm --filter webgogol-com build succeeds without @gogol/business"
  - signal: test
    description: "pnpm --filter @gogol/pbp run test passes"
nonGoals:
  - "Does not re-implement schemas or buildPageSemanticModel — that was done in RFC-0470"
  - "Does not create new PBP entities or compiler phases"
  - "Does not migrate content references ({business.*}) to a new reference syntax — references are resolved against the business collection which is replaced by business-profile collection"
# RFC-0268: OPTIONAL machine-checkable acceptance probes, executed on-demand
# via `pnpm exec site-kernel run rfc.acceptance.run --id <this-rfc-id>` (never
# automatically inside build pipelines). Closed probe vocabulary — see
# docs/rfcs/rfc-0268-make-rfc-acceptance-criteria-machine-checkable.md.
# acceptance:
#   - probe: run
#     command: "site-kernel run some.command.validate --app webgogol-com"
#     expect:
#       exitCode: 0
#   - probe: file-exists
#     path: "packages/share/src/some-new-module.ts"
#   - probe: command-registered
#     name: "some.new.command"
#   - probe: file-contains
#     path: "AGENTS.md"
#     pattern: "Some new governance paragraph"
---

# RFC-0471: Legacy Business Layer Content Migration and Package Deletion

## Context

RFC-0470 completed the **import migration phase**: schemas (`recordClaimsSchema`, `claimAnnotationSchema`, `PERSON_AFFILIATIONS`) moved to `@gogol/share/schemas`; `buildPageSemanticModel` moved to `@gogol/pbp/semantic-model`; 7 `@gogol/site-kernel-checks` files updated; codegen and onboarding templates switched to `pbpCollections`.

However, the `@gogol/business` package still exists and is still consumed:

- `systems/webgogol-com/src/content.config.ts` still registers `businessCollections` from `@gogol/business/astro`.
- `systems/webgogol-com/src/pages/*.astro` still import `buildPageSemanticModel` from `@gogol/business` (not yet switched to `@gogol/pbp/semantic-profile`).
- `packages/os/site-kernel-checks/src/content-business.ts` still imports `getBusinessSchema` from `@gogol/business/dispatcher` for legacy validation.
- 329 content references (`{business.*}`) in 32 markdown files under `systems/webgogol-com/src/content/` still reference the `business` content collection.
- `packages/share/src/astro/people.ts` reads from the `business` content collection for the People section.
- `@gogol/business` remains in `packages/pbp/package.json` dependencies.

DNA-20 (Business layer) is still marked as active in `docs/architecture-dna.md`. The PBP cutover (RFC-0469) is implemented for `webgogol-com`, but the legacy layer has not been removed.

## Problem

The `@gogol/business` package is dead code in practice — `webgogol-com` has completed the PBP cutover (RFC-0469) and all schema/semantic-model imports have been migrated (RFC-0470). But the package still exists, still appears in `package.json` dependencies, and still serves as a content collection source. This creates:

1. **Agent confusion** — agents see `@gogol/business` in the codebase and may import from it instead of `@gogol/pbp` or `@gogol/share`.
2. **Maintenance burden** — the package must be kept in sync with Astro version bumps and zod changes despite being unused.
3. **DNA-20 ambiguity** — DNA-20 still declares `@gogol/business` as the canonical business layer, contradicting RFC-0469 and RFC-0470.
4. **Content reference blocker** — 329 `{business.*}` references in page prose and frontmatter still resolve against the `business` content collection. Until these are migrated or the collection is replaced, the package cannot be deleted.
5. **People section dependency** — `packages/share/src/astro/people.ts` reads from the `business` content collection, blocking deletion.

## Decision

The legacy `@gogol/business` package, its content directory, and all remaining references are deleted in a single atomic phase. This RFC executes the deletion preconditions defined in RFC-0470 §1.5: content reference migration, FAQ/people collection separation, `content.config.ts` cutover, `content-business.ts` cleanup, DNA-20 supersession, and package deletion.

## Architectural fit

- **DNA-1 (Monorepo boundary).** Deletion removes a package and content directory. No boundary violation.
- **DNA-20 (Business layer).** This RFC formally supersedes DNA-20. The invariant is marked as superseded in `docs/architecture-dna.md`.
- **DNA-55 (Spec vendoring).** The PBP specification (`pbp-specification-package`) remains the normative source. Deletion is the execution of the supersession path defined in RFC-0398.
- **RFC-0398 (PBP Program Charter).** This RFC completes the supersession: "DNA-20 is superseded when RFC-PBP-103 (Migration Coverage and Cutover) is implemented and legacy files are deleted."
- **RFC-0470 (Import migration).** This RFC is the direct successor — it executes the deletion preconditions defined in RFC-0470 §1.5.
- **RFC-0469 (Site Cutover).** Deletion happens only after cutover is verified. Cutover is implemented for `webgogol-com`.

## Design

### CLI surface

No new CLI command. The `content.business.validate` command is **updated** to validate PBP content against `pbpSchemaById` (RFC-0471). The `pbp.cutover.check` command is **removed** — the legacy package is deleted, there is nothing to cutover from. PBP validation is also handled by the compiler pipeline (`compilePbpProfile` with `strictness: "production"`).

Deletion is a manual operation verified by grep and build commands.

### TypeScript contracts

N/A — this RFC deletes code and migrates content references. No new TypeScript contracts are introduced.

### File system responsibilities

| Path | Action |
| --- | --- |
| `packages/business/` | Delete entire directory |
| `systems/webgogol-com/src/content/business/` | Delete entire directory |
| `systems/webgogol-com/package.json` | Remove `@gogol/business` from dependencies |
| `packages/pbp/package.json` | Remove `@gogol/business` from dependencies |
| `systems/webgogol-com/src/content.config.ts` | Replace `businessCollections` with `pbpCollections` from `@gogol/pbp/astro` |
| `systems/webgogol-com/src/pages/*.astro` | Replace `buildPageSemanticModel` import from `@gogol/business` with `@gogol/pbp/semantic-profile` |
| `packages/os/site-kernel-checks/src/content-business.ts` | Remove `getBusinessSchema` import, use `pbpSchemaById` only |
| `packages/os/site-kernel-checks/src/command-tables/04-content-quality.ts` | Remove `content.business.validate` command entry |
| `packages/share/src/astro/people.ts` | Update to read from `business-profile` collection instead of `business` |
| `systems/webgogol-com/src/content/**/*.md` | Migrate 329 `{business.*}` content references to `{business-profile.*}` or inline values |
| `packages/AGENTS.md` | Remove `@gogol/business` row, update `@gogol/pbp` and `@gogol/share` rows |
| `packages/business/AGENTS.md` | Delete with the package |
| `docs/architecture-dna.md` | Mark DNA-20 as superseded |
| `docs/requirements.xml` | Update to reflect DNA-20 supersession |
| `docs/technology.xml` | Update to reflect DNA-20 supersession |

### Output format

N/A — deletion operation.

### Failure modes

- **Build fails after deletion:** A stray import from `@gogol/business` was missed. Fix: find and remove the import.
- **Content references break:** A `{business.*}` reference was not migrated. Fix: update the reference to `{business-profile.*}` or inline the value.
- **People section breaks:** `people.ts` still reads from `business` collection. Fix: update to read from `business-profile` collection.
- **`pnpm install` fails:** A workspace `package.json` still references `@gogol/business`. Fix: remove the reference.

## Rollout

- **Immediate:** Upon acceptance, deletion is defined but NOT executed. Execution requires all preconditions to pass.
- **Step 1 — Content reference migration:** Migrate 329 `{business.*}` content references in `systems/webgogol-com/src/content/**/*.md` to `{business-profile.*}` or inline values. This is the largest step and may be done incrementally.
- **Step 2 — People section:** Update `packages/share/src/astro/people.ts` to read from the `business-profile` collection.
- **Step 3 — content.config.ts:** Replace `businessCollections` with `pbpCollections` in `systems/webgogol-com/src/content.config.ts`.
- **Step 4 — Page imports:** Replace `buildPageSemanticModel` imports in `systems/webgogol-com/src/pages/*.astro` from `@gogol/business` to `@gogol/pbp/semantic-profile`.
- **Step 5 — content-business.ts:** Remove `getBusinessSchema` import, use `pbpSchemaById` only. Remove `content.business.validate` command from command table.
- **Step 6 — Package deletion:** Delete `packages/business/` directory. Remove `@gogol/business` from all `package.json` dependencies.
- **Step 7 — Documentation:** Mark DNA-20 as superseded in `docs/architecture-dna.md`. Update `docs/requirements.xml` and `docs/technology.xml`. Remove `@gogol/business` row from `packages/AGENTS.md`.
- **Step 8 — Verification:** Run full grep + build + test suite. Create git tag `pbp-legacy-deleted`.
- **Irreversibility:** The deletion is irreversible in the working tree, but git history preserves the deleted files. `git checkout legacy-snapshot-pre-pbp -- packages/business/` restores them if needed.
- **New apps:** Automatically comply — onboarding and codegen templates already use `pbpCollections` (done in RFC-0470).

## Alternatives considered

- **Keep `@gogol/business` as a compatibility shim.** Rejected: the user requirement is "no legacy" and "no backward compatibility." A compatibility shim is explicitly rejected (ADR-043).
- **Deprecate but don't delete.** Rejected: a deprecated but present package still consumes maintenance attention and confuses agents.
- **Delete incrementally (content first, then package).** Rejected: the package is a single unit. Partial deletion creates broken imports. A single atomic commit is safer. Content reference migration is a precondition, not a separate deletion step.
- **Archive instead of delete.** Rejected: git history is the archive. Keeping dead code on disk is the problem.

## Risks

- **Missed content reference.** A `{business.*}` reference in a file outside the scanned paths may break after deletion. Mitigation: comprehensive grep across all `*.md` files; build verification after migration.
- **People section data loss.** If `people.ts` is not updated before the `business` collection is deleted, the People section will break. Mitigation: update `people.ts` before deleting the collection.
- **DNA-20 references in other docs.** Other Compass XML files or RFCs may reference DNA-20 as active. Mitigation: `grep -r "DNA-20" docs/` to find and update references.
- **Other sites.** If other sites besides `webgogol-com` still use `@gogol/business`, deletion breaks them. Mitigation: `grep -r "@gogol/business" systems/` to verify no other site imports it. As of this RFC, `webgogol-com` is the only site.
- **Agent confusion.** Agents may try to import from `@gogol/business` after deletion. Mitigation: `packages/AGENTS.md` and `packages/pbp/AGENTS.md` are updated to state that `@gogol/pbp` is the only business layer.

## Acceptance criteria

- [x] All 329 `{business.*}` content references in `systems/webgogol-com/src/content/**/*.md` migrated to `{business-profile.*}` or inline values (evidence: grep returns 0 results — 2026-07-20)
- [x] `packages/share/src/astro/people.ts` updated to read from standalone `people` collection (deviation from RFC text: uses `people` collection instead of `business-profile` — better architecture, people records are not PBP entities) (evidence: packages/share/src/astro/people.ts, 2026-07-20)
- [x] `systems/webgogol-com/src/content.config.ts` uses `pbpCollections` from `@gogol/pbp/astro` (evidence: content.config.ts:34,80 — 2026-07-20)
- [x] `systems/webgogol-com/src/pages/*.astro` import `buildPageSemanticModel` from `@gogol/pbp/semantic-profile` (evidence: index.astro:28, 404.astro:23, [...slug].astro:31 — 2026-07-20)
- [x] `content-business.ts` updated — no `@gogol/business` imports, uses `pbpSchemaById` only (evidence: grep returns 0 — 2026-07-20)
- [x] `content.business.validate` command updated to PBP schemas (kept, not removed — validates `business-profile/` content against `pbpSchemaById`) (evidence: packages/os/site-kernel-checks/src/content-business.ts, 2026-07-20)
- [x] `packages/business/` directory deleted (evidence: directory does not exist — 2026-07-20)
- [x] `systems/webgogol-com/src/content/business/` directory deleted (evidence: directory does not exist — 2026-07-20)
- [x] `@gogol/business` removed from all `package.json` dependencies (evidence: grep returns 0 active imports — 2026-07-20)
- [x] `pnpm install` succeeds without `@gogol/business` (evidence: pnpm-lock.yaml updated — 2026-07-20)
- [x] `pnpm --filter webgogol-com build` succeeds (evidence: astro build + astro check — 0 errors, 2026-07-20)
- [x] `pnpm --filter @gogol/pbp run build:check` passes (evidence: tsc --noEmit exit 0 — 2026-07-20)
- [x] `pnpm --filter @gogol/pbp run test` passes (evidence: 12 files, 169 tests passed — 2026-07-20)
- [x] `grep -r "@gogol/business" systems/ packages/ services/ --include="*.ts" --include="*.astro" --include="*.json"` returns 0 active results (evidence: remaining references are historical comments only — 2026-07-20)
- [x] `grep -r "src/content/business/" systems/ packages/ services/ --include="*.ts" --include="*.astro"` returns 0 active results (evidence: scaffold and content-source updated — 2026-07-20)
- [x] `grep -r "businessSchemaById\|getBusinessCompany\|getBusinessOffer\|getBusinessContact\|getBusinessLocation\|getBusinessLegal\|getBusinessWeb\|getBusinessServices\|businessCollections\|loadBusinessProfile" . --include="*.ts" --include="*.astro"` returns 0 results (evidence: verified — 2026-07-20)
- [x] `packages/AGENTS.md` updated: `@gogol/business` row removed, `@gogol/pbp` row states it is canonical (evidence: packages/AGENTS.md:46 — 2026-07-20)
- [x] `packages/pbp/AGENTS.md` updated: critical rule states `@gogol/pbp` is canonical (evidence: packages/pbp/AGENTS.md — 2026-07-20)
- [x] `docs/architecture-dna.md` updated: DNA-20 marked as superseded (evidence: architecture-dna.md DNA-20 section — 2026-07-20)
- [x] `docs/requirements.xml`, `docs/technology.xml` — no DNA-20 references found in these files; no update needed (evidence: repository documentation audit, 2026-07-20)
- [x] Git tag `pbp-legacy-deleted` created (evidence: git tag exists — 2026-07-20)
- [x] `rfc.validate` passes on this file before merging (RFC status: implemented) (evidence: pnpm exec site-kernel run rfc.validate RFC-0471, 2026-07-20)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Content reference migration (Step 1) MAY be done incrementally across multiple commits before the deletion commit.
- Package deletion MUST be a single atomic commit.
- Deletion MUST NOT execute until all content references are migrated and `pnpm --filter webgogol-com build` succeeds.
- Before deletion, verify that FAQ and people content (if still needed) has been moved to a separate collection or is served by the `business-profile` collection.
- Before deletion, verify that no other site besides `webgogol-com` imports from `@gogol/business`.
- After deletion, run the full verification suite (grep + build + test commands).
- Git tag `pbp-legacy-deleted` MUST be created in the same commit or immediately after.
- Agents MUST NOT attempt to restore `@gogol/business` after deletion. If a need arises, create a new RFC.
- If post-deletion issues are discovered, fix them with follow-up commits, not by restoring the package.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id RFC-0471 --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
