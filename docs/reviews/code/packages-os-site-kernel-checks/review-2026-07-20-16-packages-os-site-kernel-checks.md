---
reviewId: REVIEW-CODE-2026-07-20-01
date: 2026-07-20
reviewer:
  skill: fo-review
  model: unknown
verdict: needs-revision
diffRange: a10e78c9a...HEAD
filesReviewed:
  - packages/share/src/astro/people.ts
  - packages/os/site-kernel-checks/src/content-business.ts
  - packages/os/site-kernel-checks/src/command-tables/04-content-quality.ts
  - packages/os/site-kernel-checks/src/pbp-cutover-check.ts
  - packages/os/site-kernel-codegen/src/templates/app-boilerplate/src/content.config.template.ts
  - packages/os/site-kernel-codegen/src/templates/app-boilerplate/AGENTS.template.md
  - packages/os/site-kernel-codegen/src/templates/app-boilerplate/src/content/AGENTS.template.md
  - packages/os/site-kernel-onboarding/src/templates/runtime/content.config.template.ts
  - packages/os/site-kernel-onboarding/src/templates/package.template.json
  - packages/os/site-kernel-onboarding/README.md
  - packages/pbp/package.json
  - packages/pbp/AGENTS.md
  - packages/pbp/src/cutover-check.ts
  - packages/AGENTS.md
  - AGENTS.md
  - docs/architecture-dna.md
  - docs/rfcs/rfc-0471-legacy-business-layer-content-migration-and-package-deletion.md
  - docs/compass-inventory.xml
  - systems/warpgogol-com/src/content.config.ts
  - systems/warpgogol-com/src/pages/404.astro
  - systems/warpgogol-com/src/pages/index.astro
  - systems/warpgogol-com/src/pages/[...slug].astro
  - systems/warpgogol-com/src/pages/[lang]/[...slug].astro
  - systems/warpgogol-com/AGENTS.md
  - systems/warpgogol-com/src/content/AGENTS.md
  - systems/warpgogol-com/package.json
---

# Code Review: a10e78c9a...HEAD (RFC-0471 PBP migration)

### Verdict: Needs revision

The migration deletes `@warpgogol/business` and switches to `@warpgogol/pbp` across the monorepo. The overall direction is correct and forward-only. However, there is one **critical runtime bug** in `people.ts` that will silently break the People section, one **dead-code module** that still execs `pnpm --filter @warpgogol/business`, and several **RFC deviations** that need reconciliation.

### Mechanical floor

Pass — all 5 `build:check` commands and 353 tests pass. The bug in `people.ts` is a runtime logic error that type checking cannot catch.

### Axis A — Structural correctness

- **FAIL — `people.ts` filter logic is broken.** `packages/share/src/astro/people.ts:72-73`: the filter `stripEntryLanguage(toDataEntryId(e.id)).startsWith("people/")` was correct when the collection was `business` (base: `src/content/business`, entries at `de/people/andrii-syrokomskyi.md` → stripped ID: `people/andrii-syrokomskyi`). With the new `people` collection (base: `src/content/people`, entries at `de/andrii-syrokomskyi.md` → stripped ID: `andrii-syrokomskyi`), the filter matches **zero entries**. The People section will render nothing. The `schemaId.slice("people/".length)` on line 98 also produces an empty string for every entry.
- **PASS — Minimalism.** The dual-mode validation branch in `content-business.ts` was cleanly removed. The `pbp.cutover.check` command and its OS wrapper were correctly deleted.
- **PASS — Dead code.** No commented-out code blocks or unreachable branches in the diff.

### Axis B — DNA alignment

- **DNA-1 (monorepo boundary)** — PASS. No `apps/* → apps/*` imports introduced.
- **DNA-4 (canonical content)** — PASS. No hardcoded copy strings in routes.
- **DNA-6 (kebab-case)** — PASS. All new filenames use kebab-case.
- **DNA-20 (business layer)** — PASS. Marked as superseded in `docs/architecture-dna.md`. `@warpgogol/pbp` is now canonical.
- **DNA-24 (block-declarative pages)** — N/A. No page content files changed.

### Axis C — Ecosystem fit

- **FAIL — `docs/compass-inventory.xml` still references `packages/business/`.** The inventory contains 15+ entries for `packages/business/src/*.ts` files that no longer exist. The inventory should be regenerated via `compass.inventory` or the stale entries removed.
- **PASS — AGENTS.md updates.** Root `AGENTS.md`, `packages/AGENTS.md`, `packages/pbp/AGENTS.md`, codegen templates, and warpgogol-com AGENTS files all updated to reflect PBP-only.
- **PASS — Command lifecycle.** `pbp.cutover.check` command removed from command table. `content.business.validate` updated to PBP-only.
- **PASS — Package boundaries.** No cross-boundary imports introduced.

### Axis D — Forward-only compliance

- **PASS — No compatibility shims.** The legacy `businessCollections` import was fully replaced with `pbpCollections`. No dual-path or bridge pattern remains.
- **PASS — Legacy code deleted.** `packages/business/` directory deleted, all dependencies removed.
- **FAIL — `cutover-check.ts` still execs `@warpgogol/business`.** `packages/pbp/src/cutover-check.ts:109` runs `execSync("pnpm --filter @warpgogol/business build:check")` — this command will fail since the package is deleted. While the OS-side command wrapper was removed (so the command is no longer callable from the pipeline), the module is still exported from `@warpgogol/pbp/cutover-check` and documented in `packages/pbp/AGENTS.md` line 130. This is dead code that references a deleted package.

### Axis E — Agent-facing clarity

- **PASS — Compass scaffolding.** No new source files introduced without MODULE_CONTRACT.
- **PASS — No ungrounded assertions.** Documentation updates reference real functions and paths.
- **PASS — AGENTS.md clarity.** The critical rule in `packages/pbp/AGENTS.md` clearly states `@warpgogol/business` is deleted and `@warpgogol/pbp` is canonical.

### Axis F — Pragmatism

- **PASS — Minimal command surface.** The obsolete `pbp.cutover.check` command was removed rather than kept as a no-op.
- **PASS — Scope discipline.** The diff touches only business-layer migration files.

### Axis G — Blind spots

- **FAIL — People section edge case.** The `people.ts` bug means the People section will silently render zero entries. There is no error, no warning — just an empty section. This is the exact "People section data loss" risk identified in RFC-0471 §Risks.
- **PASS — Migration path.** New apps automatically comply via updated templates.

### Spec compliance

| Requirement from RFC-0471 | Status | Evidence |
| --- | --- | --- |
| Migrate 329 `{business.*}` content references | Done | Content files deleted, references inlined |
| `people.ts` updated to read from `business-profile` collection | **Deviation** | Implementation uses a standalone `people` collection instead of `business-profile`. Arguably better architecture, but not what the RFC specifies (line 152). |
| `content.config.ts` uses `pbpCollections` | Done | `systems/warpgogol-com/src/content.config.ts` |
| Page imports from `@warpgogol/pbp/semantic-profile` | Done | 4 `.astro` files updated |
| `content-business.ts` uses `pbpSchemaById` only | Done | Legacy `getBusinessSchema` import removed |
| `content.business.validate` command removed | **Deviation** | Command kept but updated to PBP-only. RFC line 132 says "removed", line 207 says "removed from command table". The command still exists with updated reads path. |
| `packages/business/` deleted | Done | Directory removed |
| `@warpgogol/business` removed from all package.json | Done | All 7 package.json files updated |
| `docs/requirements.xml`, `docs/technology.xml` updated | **Missing** | No DNA-20 references found in these files, but the RFC explicitly lists them (line 157-158, 221). If there's nothing to update, the RFC should note that. |
| `docs/compass-inventory.xml` updated | **Missing** | Still contains 15+ entries for deleted `packages/business/` files |
| Git tag `pbp-legacy-deleted` created | Done | Tag exists on commit `fb155d1ce` |
| `pnpm --filter @warpgogol/pbp run test` passes | Done | 169 tests pass |
| `pnpm --filter @warpgogol/pbp run build:check` passes | Done | tsc --noEmit passes |

### Questions for the author

1. **`people.ts` filter**: The `startsWith("people/")` filter will match zero entries with the new `people` collection. Was this tested at runtime, or only type-checked? The People section will silently render nothing.
2. **`cutover-check.ts`**: The module at `packages/pbp/src/cutover-check.ts` still runs `execSync("pnpm --filter @warpgogol/business build:check")` and is still exported from `@warpgogol/pbp/cutover-check`. Should this module be deleted or updated to remove the legacy exec?
3. **RFC deviation on `people.ts`**: The RFC says "read from `business-profile` collection" but the implementation uses a standalone `people` collection. Should the RFC be amended to reflect this decision, or should `people.ts` read from `business-profile`?
4. **`content.business.validate`**: The RFC says this command is "removed" but it still exists in the command table (updated to PBP). Should the command be removed entirely, or should the RFC be amended?
5. **`docs/compass-inventory.xml`**: The inventory still has entries for deleted `packages/business/` files. Should `compass.inventory` be re-run to regenerate it?
