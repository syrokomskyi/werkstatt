---
rfcId: RFC-0914
planId: PLAN-RFC-0914-01
status: draft
owner: architecture
createdAt: 2026-08-22
updatedAt:
scope:
  apps: []
  packages:
    - "@warpgogol/werkstatt-shared"
    - "@warpgogol/werkstatt-site"
  services: []
  docs:
    - docs/architecture-dna.md
    - docs/source-markup.xml
    - packages/werkstatt-site/AGENTS.md
    - packages/werkstatt-shared/AGENTS.md
---

# Implementation Plan: RFC-0914

## 1. Objectives

- [ ] O1 — Make `BlockEntrySchema.id` required and remove `block-N` fallback — maps to acceptance criterion: `BlockEntrySchema.id` transitions from `.optional()` to required; `extractContentBlocks` removes `block-${result.length}` fallback
- [ ] O2 — Extend `page.blocks.extract.validate` with format check and add it to `SITES_CHECK_AUTHOR_PIPELINE` — maps to acceptance criterion: `page.blocks.extract.validate` added to pipeline after `page.block.validate` with `BLOCK-ID-INVALID` format check
- [ ] O3 — Implement `block.id.generate` command for one-time migration backfill — maps to acceptance criterion: `block.id.generate` registered in `command-tables/04-content-quality.ts` with `scope: app`
- [ ] O4 — Remove RFC-0048 anchor registry: simplify `resolveSectionAnchor`, `resolveAnchorFragment`, `content-links.ts`, `LocalizedRouteEntry.anchors` — maps to acceptance criteria: anchor registry removal, `resolveAnchor` simplified, `LocalizedRouteEntry.anchors` removed
- [ ] O5 — Update `blocks-renderer.astro` to pass `block.id` as `blockId` prop; remove `anchorId` from `UNIVERSAL_BLOCK_PROPS` — maps to acceptance criteria: prop flow, `UNIVERSAL_BLOCK_PROPS` cleanup
- [ ] O6 — Update codegen templates to generate `blocks[].id` — maps to acceptance criterion: `mission.materialize` codegen templates generate `blocks[].id`
- [ ] O7 — Unit tests cover all new and changed validation paths — maps to acceptance criterion: unit tests cover missing id, duplicate id, invalid format, generate backfill, deduplication, no-content pass, DNA-82 compliance

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/werkstatt-shared/src/ontology/schemas/page-entry.ts` — `BlockEntrySchema.id`: `.optional()` → required
- `packages/werkstatt-shared/src/share/semantic/build-page.ts` — `extractContentBlocks`: remove `block-${result.length}` fallback, require `id`
- `packages/werkstatt-site/src/checks/page-blocks-validate.ts` — add `BLOCK-ID-INVALID` format check (`/^[a-z0-9]+(-[a-z0-9]+)*$/`)
- `packages/werkstatt-site/src/checks/command-tables/09-build-artifacts.ts` — update `page.blocks.extract.validate` description to mention format check
- `packages/werkstatt-site/src/checks/command-tables/04-content-quality.ts` — register `block.id.generate` command
- `packages/werkstatt-site/src/checks/pipelines/sites-check-author.ts` — add `page.blocks.extract.validate` after `page.block.validate` (line 41)
- `packages/werkstatt-site/src/checks/page-block.ts` — remove `anchorId` from `UNIVERSAL_BLOCK_PROPS`
- `packages/werkstatt-site/src/domain/ui/blocks-renderer.astro` — pass `block.id` as `blockId` prop to section components
- `packages/werkstatt-site/src/domain/share/astro/routes/anchors.ts` — simplify `resolveSectionAnchor` to read `blockId` directly; simplify `resolveAnchorFragment` to return block id as-is
- `packages/werkstatt-site/src/domain/share/astro/routes/registry.ts` — remove `anchors` field from `LocalizedRouteEntry` interface and parsing logic
- `packages/werkstatt-site/src/checks/content-links.ts` — simplify `resolveAnchor` to use block id directly; remove `AnchorRegistry` interface and `anchorRegistryByPage` map
- New file: `packages/werkstatt-site/src/checks/block-id-generate.ts` — `block.id.generate` command handler
- `packages/werkstatt-site/src/codegen/templates/*.template.md` — page templates include `blocks[].id` for all declared blocks

### 2.2 Configuration and data

- `system.md` frontmatter — `pages[].anchors` map is no longer read (migration step removes it from existing sites)
- `navigation.md` — `targets[].semanticTarget.anchor` now references block id directly (no `anchorId` indirection)

### 2.3 Documentation and specs

- `docs/rfcs/rfc-0914-mandatory-semantic-block-ids-for-all-content-sections.md` — read-only reference
- `docs/architecture-dna.md` — update DNA-24 entry to note `blocks[].id` is now mandatory
- `docs/source-markup.xml` — update if block id requirements are referenced in source markup contract
- `packages/werkstatt-site/AGENTS.md` — add `block.id.generate` and `page.blocks.extract.validate` format check to check commands list
- `packages/werkstatt-shared/AGENTS.md` — note `BlockEntrySchema.id` is now required

### 2.4 Validation and pipelines

- `SITES_CHECK_AUTHOR_PIPELINE` — new step: `page.blocks.extract.validate` after `page.block.validate`
- `SITES_BUILD_CHECK_PIPELINE` — inherits the new step via `...SITES_CHECK_AUTHOR_PIPELINE`
- Unit tests in `packages/werkstatt-site/src/checks/tests/` and `packages/werkstatt-shared/src/share/semantic/tests/`

## 3. Step sequence

### Step 1. Schema: make `BlockEntrySchema.id` required

**Goal:** Transition the `id` field from optional to required in the Zod schema and TypeScript interface.

**Agent actions:**

- In `packages/werkstatt-shared/src/ontology/schemas/page-entry.ts`, change `BlockEntrySchema.id` from `.optional()` with kebab-case validation to required with kebab-case validation. Update the JSDoc comment to reflect mandatory status.
- In `packages/werkstatt-shared/src/share/page.ts`, update the `BlockEntry` TypeScript interface to make `id` required (remove `?`).
- Run `pnpm --filter @warpgogol/werkstatt-shared run build:check` to verify no type errors.

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-shared run build:check` passes
- `pnpm --filter @warpgogol/werkstatt-shared run test` passes

**Completion criterion:** `BlockEntrySchema.id` is required in Zod schema; `BlockEntry.id` is required in TypeScript interface; typecheck passes.

**Human review:** no

---

### Step 2. Remove `block-N` fallback in `extractContentBlocks`

**Goal:** Remove the positional fallback id generation and require `blocks[].id` to be present.

**Agent actions:**

- In `packages/werkstatt-shared/src/share/semantic/build-page.ts` line 143, remove the `block-${result.length}` fallback. Change to: `const blockId = block["id"]; if (typeof blockId !== "string" || !blockId) throw new Error(`[extractContentBlocks] Block #${result.length} in page ${ctx.pageId} (${ctx.lang}) is missing required \`id\` field. Run \`block.id.generate\` to backfill.`);` — this is a runtime safety net; `page.blocks.extract.validate` catches this at build time.
- Update any tests that rely on `block-N` fallback ids to use explicit ids.

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-shared run build:check` passes
- `pnpm --filter @warpgogol/werkstatt-shared run test` passes

**Completion criterion:** `extractContentBlocks` throws on missing `id`; no `block-N` fallback is generated; typecheck passes.

**Human review:** no

---

### Step 3. Extend `page.blocks.extract.validate` with format check

**Goal:** Add `BLOCK-ID-INVALID` format validation to the existing validator.

**Agent actions:**

- In `packages/werkstatt-site/src/checks/page-blocks-validate.ts`, add a kebab-case format check after the existing `BLOCK-ID-MISSING` check. The regex is `/^[a-z0-9]+(-[a-z0-9]+)*$/`. Emit `BLOCK-ID-INVALID` violation with severity `error` when `block.id` is present but does not match the format.
- Update the command description in `command-tables/09-build-artifacts.ts` to mention format validation.
- Add unit test: block with invalid format (e.g. `id: "My Block"`) triggers `BLOCK-ID-INVALID`.

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check` passes
- `pnpm --filter @warpgogol/werkstatt-site run test` passes (including new test)

**Completion criterion:** `page.blocks.extract.validate` emits `BLOCK-ID-INVALID` for non-kebab-case ids; existing tests still pass; new test confirms the check.

**Human review:** no

---

### Step 4. Add `page.blocks.extract.validate` to `SITES_CHECK_AUTHOR_PIPELINE`

**Goal:** Wire the validator into the authoring pipeline after `page.block.validate`.

**Agent actions:**

- In `packages/werkstatt-site/src/checks/pipelines/sites-check-author.ts`, add `{ command: "page.blocks.extract.validate" }` after `{ command: "page.block.validate" }` (line 41).
- Verify `SITES_BUILD_CHECK_PIPELINE` inherits the step via `...SITES_CHECK_AUTHOR_PIPELINE`.

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check` passes
- Pipeline scan in `gate-catalog.ts` picks up the new step

**Completion criterion:** `page.blocks.extract.validate` appears in `SITES_CHECK_AUTHOR_PIPELINE` after `page.block.validate`; typecheck passes.

**Human review:** no

---

### Step 5. Implement `block.id.generate` command

**Goal:** Create a one-time migration command that backfills missing block ids using `slugify(heading)`.

**Agent actions:**

- Create `packages/werkstatt-site/src/checks/block-id-generate.ts` with a command handler that:
  1. Scans all page content files (`src/content/pages/**/*.md`).
  2. For each block without an `id` (or with a `block-N` fallback id), generates one using `slugify(block.heading)` from `@warpgogol/werkstatt-shared/share/semantic/extract.ts`.
  3. Appends `-2`, `-3` suffixes for duplicates within a page.
  4. Writes updated frontmatter back to the file using `writeFileIfChanged`.
  5. Returns `KernelCommandResult` with `exitCode`, `summary` prefixed with `[block.id.generate]`, and `nextSteps` on failure (DNA-82).
  6. Handles the no-heading failure mode: if a block has no heading and no id, emit a violation with `fixHint: "Add an id manually or add a heading to the block."`.
- Register the command in `command-tables/04-content-quality.ts` with `scope: app`, `supportsAllSites: true`, `reads: ["<app>/src/content/pages/**/*.md"]`, `writes: ["<app>/src/content/pages/**/*.md"]`, `mutatesState: true`.
- Add unit tests: backfill missing id, deduplication with `-2` suffix, no-heading failure, no-content pass, DNA-82 compliance.

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check` passes
- `pnpm --filter @warpgogol/werkstatt-site run test` passes (including new tests)
- `pnpm exec werkstatt run block.id.generate --site <test-site> --json` produces valid output

**Completion criterion:** `block.id.generate` is registered, backfills missing ids, handles deduplication, handles no-heading failure, returns DNA-82-compliant results; all tests pass.

**Human review:** no

---

### Step 6. Remove RFC-0048 anchor registry

**Goal:** Simplify anchor resolution to use block id directly; remove the `anchors` registry from `system.md` parsing and `LocalizedRouteEntry`.

**Agent actions:**

- In `packages/werkstatt-site/src/domain/share/astro/routes/anchors.ts`:
  - **Remove `resolveAnchorFragment` entirely** (grilling decision: forward-only, no dead code). It becomes a no-op after registry removal.
  - Simplify `resolveSectionAnchor` to read `blockId` from `props.blockId` (new prop from Step 8) and return it directly. Fall back to `defaultAnchorId` if `blockId` is absent. No registry lookup, no `getRouteRegistry` import.
  - Remove the `getRouteRegistry` import if no longer needed by `hasLocalizedPage` (check: `hasLocalizedPage` uses `getRouteRegistry` independently, so keep the import for it).
- In `packages/werkstatt-site/src/domain/share/astro/semantic-target.ts`:
  - Remove the `resolveAnchorFragment` import (line 19).
  - Replace `const fragment = await resolveAnchorFragment(anchorStr, target.pageId, lang);` (line 55) with `const fragment = anchorStr;` — the anchor is now a block id, used directly.
- In `packages/werkstatt-site/src/domain/share/astro/routes/registry.ts`:
  - Remove the `anchors` field from the `LocalizedRouteEntry` interface (line 33).
  - Remove the `anchors` parsing logic (lines 133, 185).
- In `packages/werkstatt-site/src/checks/content-links.ts`:
  - Remove the `AnchorRegistry` interface (line 47).
  - Remove the `SystemPage.anchors` field (line 54).
  - Remove `anchorRegistryByPage` map construction (lines 230-235).
  - Simplify `resolveAnchor` to return the `anchorId` (block id) directly — no registry lookup needed.
  - Update all call sites that pass `anchorRegistryByPage` to use `blockAnchorIdsByPage` instead.
- Update any tests that rely on the anchor registry to use direct block id references.

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check` passes
- `pnpm --filter @warpgogol/werkstatt-site run test` passes

**Completion criterion:** `resolveAnchorFragment` is removed; `resolveSectionAnchor` uses `blockId` directly; `semantic-target.ts` uses anchor string directly; `LocalizedRouteEntry.anchors` is removed; `content-links.ts` `resolveAnchor` uses block id directly; `AnchorRegistry` interface is removed; all tests pass.

**Note:** Steps 6, 7, and 8 are interdependent and MUST be committed together in a single commit to avoid intermediate broken states (grilling decision).

**Human review:** no

---

### Step 7. Remove `anchorId` from `UNIVERSAL_BLOCK_PROPS`

**Goal:** Clean up the universal block props set to remove the deprecated `anchorId` entry.

**Agent actions:**

- In `packages/werkstatt-site/src/checks/page-block.ts` line 52-55, remove `"anchorId"` from the `UNIVERSAL_BLOCK_PROPS` set.
- Update the comment to reflect that `anchorId` is no longer a universal block prop — block id is used directly.
- Verify that no section component still reads `pageOverride.anchorId` — if any do, update them to read `blockId` instead (should be handled by Step 8 prop flow change).

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check` passes
- `pnpm --filter @warpgogol/werkstatt-site run test` passes

**Completion criterion:** `UNIVERSAL_BLOCK_PROPS` no longer contains `anchorId`; no section component reads `pageOverride.anchorId`; typecheck passes.

**Human review:** no

---

### Step 8. Update `blocks-renderer.astro` prop flow

**Goal:** Pass `block.id` as a `blockId` prop to section components so they can use it directly as the HTML `id`.

**Agent actions:**

- In `packages/werkstatt-site/src/domain/ui/blocks-renderer.astro`, add `blockId={block.id}` to the `<Component>` JSX props (around line where `pageOverride={block.props}` is set).
- Update section components that call `resolveSectionAnchor(Astro.props, "default")` to use the new `blockId` prop. The `resolveSectionAnchor` function (simplified in Step 6) reads `props.blockId` directly.
- Verify the `section-shell.astro` `ai-invariant` still holds: `sectionId` is the bare block id, no `sectionNumber` prefix.

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check` passes
- `pnpm --filter @warpgogol/werkstatt-site run test` passes

**Completion criterion:** `blocks-renderer.astro` passes `blockId={block.id}` to all section components; `resolveSectionAnchor` reads `blockId` from props; `section-shell.astro` renders the bare block id as HTML `id`.

**Human review:** no

---

### Step 9. Update codegen templates

**Goal:** Verify that `mission.materialize` codegen templates generate `blocks[].id` for all scaffolded pages.

**Note:** Exploration confirms all existing codegen page templates already include `blocks[].id` (e.g. `datenschutz.page.template.md` has `id: privacy`, `impressum.page.template.md` has `id: imprint`, `star-map.template.md` has `id: passport-header`). This step is primarily verification.

**Agent actions:**

- Verify all codegen page templates in `packages/werkstatt-site/src/codegen/templates/` that declare `blocks[]` include `id:` fields. Exploration confirms they already do.
- Check the `app-boilerplate/AGENTS.template.md` example blocks (lines 157-158, 198-199) — these already show `id: page-content` and `id: <slug>-markdown`.
- If any template is missing `id`, add it with a semantically meaningful value.
- Verify that scaffolded page content passes `page.blocks.extract.validate`.

**Validation:**

- `pnpm --filter @warpgol/werkstatt-site run build:check` passes
- Scaffolded page content passes `page.blocks.extract.validate`

**Completion criterion:** All codegen page templates include `blocks[].id` for every declared block; scaffolded content passes validation.

**Human review:** no

---

### Step 10. Unit tests

**Goal:** Comprehensive test coverage for all new and changed validation paths.

**Agent actions:**

- `packages/werkstatt-site/src/checks/tests/page-blocks-validate.test.ts` — add test: block with invalid format triggers `BLOCK-ID-INVALID`.
- `packages/werkstatt-site/src/checks/tests/block-id-generate.test.ts` — new file: test backfill, deduplication, no-heading failure, no-content pass, DNA-82 compliance.
- `packages/werkstatt-site/src/checks/tests/page-block.test.ts` — verify B-05 duplicate check still works after `UNIVERSAL_BLOCK_PROPS` change.
- `packages/werkstatt-site/src/checks/tests/content-links.test.ts` — update tests to use direct block id references instead of anchor registry.
- `packages/werkstatt-shared/src/share/semantic/tests/build-page.test.ts` — update tests to provide explicit `id` for all blocks (no `block-N` fallback).

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-shared run test` passes
- `pnpm --filter @warpgogol/werkstatt-site run test` passes

**Completion criterion:** All new and updated tests pass; test coverage includes missing id, duplicate id, invalid format, generate backfill, deduplication, no-heading failure, no-content pass, DNA-82 compliance.

**Human review:** no

---

### Step 11. Documentation sync

**Goal:** Update all documentation artifacts to reflect the mandatory block id requirement.

**Agent actions:**

- Update `docs/architecture-dna.md` — DNA-24 entry: note that `blocks[].id` is now mandatory (was optional).
- Update `docs/source-markup.xml` — if block id requirements are referenced in the source markup contract, update to reflect mandatory status.
- Update `packages/werkstatt-site/AGENTS.md` — add `block.id.generate` and `page.blocks.extract.validate` format check to the check commands list.
- Update `packages/werkstatt-shared/AGENTS.md` — note `BlockEntrySchema.id` is now required.
- Run `pnpm exec werkstatt run ecosystem.manifest.generate` if command surfaces or pipeline topology changed.

**Validation:**

- `git diff` shows all `scope.docs` files are updated or documented as not-applicable.
- `pnpm exec werkstatt run rfc.validate --id RFC-0914` passes.

**Completion criterion:** All documentation artifacts in scope are updated; `rfc.validate` passes.

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize all documentation artifacts, run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Update affected `AGENTS.md` files (root, apps/, packages/, services/) with new modules, commands, or ownership changes.
- Update affected `docs/*.xml` Compass files (requirements, technology, development-plan, knowledge-graph, verification-plan, source-markup, styling) when repository-wide semantics changed.
- Update `docs/architecture-dna.md` if a new DNA invariant was introduced.
- **Verify every file listed in `scope.docs` is updated** — check each path against `git diff`; if a scope doc was not modified, document why.
- Run `pnpm exec werkstatt run ecosystem.manifest.generate` if command surfaces or pipeline topology changed (do not hand-edit `docs/ecosystem.generated.yaml`).
- **Run code review:** invoke `fo-review` via the `skill` tool on all session code changes (`git diff <merge-base-of-session>...HEAD`). Wait for the review report in `docs/reviews/code/`.
- **Run fix if needed:** if `fo-review` reported findings, invoke `fo-fix` via the `skill` tool. Re-run `fo-review` to confirm all findings are resolved. Maximum 3 iterations.
- **Check off acceptance criteria:** verify each criterion in the RFC against the implemented code. Mark `[x]` for verified criteria. For unchecked `[ ]` criteria, document why (e.g. "requires runtime command blocked by environment").
- **Stamp the RFC as implemented:** run `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0914 --implementation-commit <sha>` to atomically transition `accepted → implemented` (RFC-0476). The command validates all preconditions (status, criteria, clean tree, commit reachability). Do NOT hand-edit `status`, `implementedAt`, or `closedAt` fields — use the command.

**Validation:**

- `git status` — no uncommitted changes from the current session.
- `pnpm exec werkstatt run rfc.validate --id RFC-0914`
- Every file in `scope.docs` is either updated or documented as not-applicable.
- Review report exists in `docs/reviews/code/` for this session.

**Completion criterion:** All documentation artifacts in scope are updated; code review passed (findings fixed if any); all acceptance criteria are checked off with inline `(evidence: ...)` annotations; RFC is stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476), which validates all preconditions atomically. Code review is automated via `fo-review`.

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate --id RFC-0914`
- `pnpm --filter @warpgogol/werkstatt-shared run build:check`
- `pnpm --filter @warpgogol/werkstatt-site run build:check`
- `pnpm --filter @warpgogol/werkstatt-shared run test`
- `pnpm --filter @warpgogol/werkstatt-site run test`
- `pnpm exec werkstatt run rfc.acceptance.run --id RFC-0914` (if acceptance probes declared)
- `pnpm exec werkstatt run rfc.verification.emit --id RFC-0914` (RFC-0330)

### 4.2 Evidence artifacts

- `docs/rfcs/verification/rfc-0914.generated.json` — verification evidence (RFC-0330)
- Commit messages referencing `RFC-0914` in the subject line (RFC-0265 commit hygiene)

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Migration burden — existing pages without block ids | Step 5: `block.id.generate` automates backfill with `slugify(heading)` |
| Duplicate heading slugs — same heading produces same id | Step 5: `block.id.generate` appends `-2`, `-3` suffixes; Step 3/4: `page.block.validate` B-05 catches duplicates |
| RFC-0048 anchor registry removal — navigation and section components need updates | Step 6: full migration in one pass — `resolveSectionAnchor`, `resolveAnchorFragment`, `content-links.ts`, `LocalizedRouteEntry.anchors` all updated |
| Agent misinterpretation — agents create blocks without ids | Step 2: `block-N` fallback removed; Step 4: `page.blocks.extract.validate` runs in pipeline and fails the build |
| Performance — format validation adds overhead | Step 3: format check is O(1) per block, no additional I/O |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-24 (block-declarative pages), run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0914 --reason "..." --invariant "DNA-24"` instead of working around it.
- If removing `LocalizedRouteEntry.anchors` breaks a downstream consumer that cannot be updated without a new RFC, run `rfc.supersede.propose` with `--invariant "DNA-22"` (localized routing).
- If `block.id.generate` cannot produce stable ids for blocks without headings (e.g. purely visual blocks), escalate to the operator — this may require extending the block schema with an optional `title` field for id generation, which is out of scope for this RFC.
