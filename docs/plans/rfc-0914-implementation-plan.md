# Implementation Plan: RFC-0914 — Mandatory semantic block IDs for all content sections

- **RFC:** RFC-0914
- **Status:** draft (plan generated pre-acceptance)
- **Date:** 2026-08-21
- **Prerequisite:** RFC-0914 must reach `accepted` status before implementation begins

## Affected artifacts

### Packages
- `packages/werkstatt-shared/src/ontology/schemas/page-entry.ts` — `BlockEntrySchema.id` becomes required
- `packages/werkstatt-shared/src/share/semantic/build-page.ts` — `extractContentBlocks` removes `block-N` fallback
- `packages/werkstatt-site/src/checks/block-id.ts` — **new file** — `block.id.validate` and `block.id.generate` handlers
- `packages/werkstatt-site/src/checks/command-tables/04-content-quality.ts` — register both commands
- `packages/werkstatt-site/src/checks/pipelines/sites-check-author.ts` — add `block.id.validate` after `page.block.validate`
- `packages/werkstatt-site/src/checks/page-block.ts` — remove B-05 (superseded by `block.id.validate`)
- `packages/werkstatt-site/src/domain/share/astro/routes/registry.ts` — remove `anchors` field from `LocalizedRouteEntry`
- `packages/werkstatt-site/src/domain/share/astro/routes/anchors.ts` — simplify `resolveAnchorFragment` and `resolveSectionAnchor`
- `packages/werkstatt-site/src/checks/content-links.ts` — update anchor resolution to use block id directly
- `packages/werkstatt-site/src/onboarding/templates/*.template.md` — verify `blocks[].id` present (already compliant)

### Documentation
- `AGENTS.md` — add block id requirement and migration instructions
- `docs/architecture-dna.md` — update DNA-24 entry to reference RFC-0914
- `docs/source-markup.xml` — add block id requirement if referenced in source markup contract
- `docs/requirements.xml` — update if content requirements reference block id mandatory status

### Content (per app)
- `src/content/pages/**/*.md` — backfill `blocks[].id` via `block.id.generate`
- `src/content/system.md` — remove `pages[].anchors` map
- `src/content/navigation/{lang}/navigation.md` — update `targets[].semanticTarget.anchor` to reference block ids directly

## Step-by-step plan

### Phase 1: Create validators and generator

**Step 1: Create `block.id.validate` handler**
- File: `packages/werkstatt-site/src/checks/block-id.ts`
- Scans `src/content/pages/**/*.md` for `blocks[].id`
- Rules: `BLOCK-ID-MISSING`, `BLOCK-ID-DUPLICATE`, `BLOCK-ID-INVALID` (regex `/^[a-z0-9]+(-[a-z0-9]+)*$/`)
- Returns `KernelCommandResult` with `exitCode`, `summary` prefixed `[block.id.validate]`, `nextSteps` on failure (DNA-82)
- Scope: `app`
- **Validation:** Unit tests for missing, duplicate, invalid format, no-content pass, DNA-82 compliance

**Step 2: Create `block.id.generate` handler**
- Same file: `packages/werkstatt-site/src/checks/block-id.ts`
- Backfills missing `blocks[].id` using `slugify(block.props.header.heading)` or `slugify(block.type)` fallback
- Deduplication: append `-2`, `-3` suffixes for duplicate slugs within a page
- Supports `--dry-run` flag (reports files that would be modified without writing)
- Does NOT overwrite existing ids (only fills missing ones)
- Returns `filesModified[]`, `blocksGenerated` count
- **Validation:** Unit tests for backfill, deduplication, dry-run, no-overwrite

**Step 3: Register commands in command table**
- File: `packages/werkstatt-site/src/checks/command-tables/04-content-quality.ts`
- Add `block.id.validate` and `block.id.generate` entries with `scope: app`
- **Validation:** `pnpm exec werkstatt run block.id.validate --app <test-app>` exits 0

**Step 4: Integrate `block.id.validate` into author pipeline**
- File: `packages/werkstatt-site/src/checks/pipelines/sites-check-author.ts`
- Add `{ command: "block.id.validate" }` after `{ command: "page.block.validate" }`
- **Validation:** Pipeline definition includes the new step

### Phase 2: Remove fallback and enforce mandatory ids

**Step 5: Remove B-05 from `page.block.validate`**
- File: `packages/werkstatt-site/src/checks/page-block.ts`
- Remove B-05 check (lines 274-285) — superseded by `block.id.validate`
- Update MODULE_CONTRACT comment to remove B-05 from the list
- **Validation:** `page-block.test.ts` updated to remove B-05 test; remaining tests pass

**Step 6: Remove `block-N` fallback in `extractContentBlocks`**
- File: `packages/werkstatt-shared/src/share/semantic/build-page.ts:143`
- Change `const blockId = String(block["id"] ?? \`block-${result.length}\`)` to require `block["id"]`
- Throw or skip blocks without `id` (hard error, not silent fallback)
- **Validation:** Unit test confirming blocks without `id` cause error

**Step 7: Make `BlockEntrySchema.id` required**
- File: `packages/werkstatt-shared/src/ontology/schemas/page-entry.ts:73-76`
- Change `id: z.string().regex(...).optional()` to `id: z.string().regex(...)` (required)
- **Validation:** `page.block.validate` rejects pages with missing `blocks[].id`

### Phase 3: Remove RFC-0048 anchor registry

**Step 8: Remove `anchors` from `LocalizedRouteEntry`**
- File: `packages/werkstatt-site/src/domain/share/astro/routes/registry.ts:33`
- Remove `anchors?` field from `LocalizedRouteEntry` type
- Remove anchor registry loading from `getRouteRegistry`
- **Validation:** TypeScript compiles without `anchors` references

**Step 9: Simplify `resolveAnchorFragment` and `resolveSectionAnchor`**
- File: `packages/werkstatt-site/src/domain/share/astro/routes/anchors.ts`
- `resolveAnchorFragment`: return `anchorId` directly (no registry lookup)
- `resolveSectionAnchor`: return `pageOverride.anchorId ?? defaultAnchorId` directly (no `resolveAnchorFragment` call)
- **Validation:** Section components render block id as HTML `id` attribute

**Step 10: Update `content-links.ts` anchor validation**
- File: `packages/werkstatt-site/src/checks/content-links.ts`
- Remove `anchorRegistryByPage` usage
- `extractBlockAnchorIds` → use `block.id` directly instead of `props.anchorId`
- `validateUrl` → resolve anchors using block ids directly (no registry lookup)
- Remove `LINK-04` (anchor declared in `system.md` but not rendered) — no more `system.md` anchor registry
- **Validation:** `content-links.test.ts` updated; link validation uses block ids

### Phase 4: Migrate existing content

**Step 11: Run `block.id.generate` on all apps**
- For each app: `pnpm exec werkstatt run block.id.generate --app <app>`
- Review generated ids for sanity
- Commit backfilled ids per app

**Step 12: Remove `pages[].anchors` from `system.md`**
- For each app: remove `pages[].anchors` map from `src/content/system.md`
- **Validation:** `system.manifest.validate` passes without `anchors`

**Step 13: Update `navigation.md` targets**
- For each app: update `targets[].semanticTarget.anchor` to reference block ids directly
- Remove `anchorId` indirection
- **Validation:** `content.links.validate` passes

### Phase 5: Documentation and DNA sync

**Step 14: Update `AGENTS.md`**
- Add block id requirement to the content authoring section
- Add migration instructions (run `block.id.generate`, resolve duplicates)

**Step 15: Update `docs/architecture-dna.md`**
- Update DNA-24 entry: add "Established mandatory `blocks[].id` per RFC-0914" or similar

**Step 16: Update Compass XML files**
- `docs/source-markup.xml` — add block id requirement if in scope
- `docs/requirements.xml` — update if content requirements reference block ids

### Phase 6: Verification and closure

**Step 17: Run full validation**
- `pnpm exec werkstatt run block.id.validate --all` — zero violations
- `pnpm exec werkstatt run rfc.validate --id RFC-0914` — passes
- `pnpm exec werkstatt run page.block.validate --all` — passes (B-05 removed)
- `pnpm exec werkstatt run content.links.validate --all` — passes (anchor registry removed)
- `pnpm typecheck` — passes
- `pnpm test` — all tests pass

**Step 18: Transition RFC to implemented**
- Update `status: implemented`
- Add `reviewers: [human:andrii-syrokomskyi]`
- Check all acceptance criteria with `(evidence: <file:line>)` annotations
- Update `implementedAt` date

## Risk mitigation

- **Migration order:** Steps 1-4 (validators) before Step 6 (remove fallback) — ensures validation is in place before the fallback is removed
- **Content migration:** Step 11 (generate) before Step 6 (remove fallback) — ensures all existing content has ids before the fallback is removed
- **Anchor registry:** Steps 8-10 after Step 11 — ensures content is migrated before anchor resolution changes
- **Test coverage:** Each step has explicit validation criteria

## Estimated effort

- Phase 1 (Steps 1-4): ~2-3 hours — new command handlers, tests, pipeline integration
- Phase 2 (Steps 5-7): ~1 hour — remove fallback, update schema
- Phase 3 (Steps 8-10): ~2 hours — anchor registry removal, content-links update
- Phase 4 (Steps 11-13): ~1-2 hours per app — content migration
- Phase 5 (Steps 14-16): ~1 hour — documentation updates
- Phase 6 (Steps 17-18): ~1 hour — verification and closure
