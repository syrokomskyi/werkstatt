---
reviewId: REVIEW-CODE-2026-07-10-01
date: 2026-07-10
reviewer:
  skill: wg-review
  model: claude-sonnet-4-20250514
verdict: approved
diffRange: cc56f5343~1..cc56f5343
filesReviewed:
  - packages/content-source/src/astro.ts
  - packages/content-source/src/adapters/fs/loaders.ts
  - packages/content-source/src/index.ts
  - packages/content-source/AGENTS.md
  - packages/content-source/README.md
  - packages/share/src/astro/loaders.ts
  - AGENTS.md
---

# Code Review: cc56f5343~1..cc56f5343 — @warpgogol/content-source dead code removal

### Verdict: Approved

The diff removes three dead exports (`fsContentProvider`, `createAstroLoaders`, `AstroLoaderFactory`) that were introduced by RFC-0141 but never consumed by any importer. The removal is clean, forward-only, and documentation is synchronized. Two minor findings are advisory only.

### Mechanical floor

Pass — `tsc --noEmit` exits 0 for `@warpgogol/content-source`, `@warpgogol/share`, and `@warpgogol/business`.

### Axis A — Structural correctness

No issues. The removed code was dead — `fsContentProvider` had zero importers, `createAstroLoaders` was re-exported through `@warpgogol/share/astro/loaders` but never called, and `AstroLoaderFactory` was used only by the dead `createAstroLoaders`. The remaining exports in `index.ts` are all consumed. The `asAstroContentEntry` helper in `astro.ts` was correctly removed alongside `fsContentProvider` (it had no other caller).

### Axis B — DNA alignment

No issues. The diff does not touch any DNA invariant. Package boundaries (DNA-1), content ownership (DNA-4), block-declarative pages (DNA-24/25), and Compass markup (DNA-42) are all preserved. The `MODULE_CONTRACT` and `CHANGE_SUMMARY` markers remain on all surviving source files.

### Axis C — Ecosystem fit

No issues. The `@warpgogol/share/astro/loaders` re-export of `markdownCollectionLoader` (aliased from `fsMarkdownCollectionLoader`) is preserved — generated `content.config.ts` files are unaffected. The root `AGENTS.md` "Content Source Provider seam" section is updated to remove the `createAstroLoaders` reference. The package-level `AGENTS.md` and `README.md` tables are updated.

### Axis D — Forward-only compliance

No issues. The removal is direct — no compatibility shim, no deprecation flag, no dual-path. The dead code is deleted in the same change.

### Axis E — Agent-facing clarity

**Minor finding (E-1):** `astro.ts` line 14 — `CHANGE_SUMMARY` still reads `RFC-0141: introduced the Astro content seam and fs content provider.` The "fs content provider" part is now stale since `fsContentProvider` was removed from this module. The entry should be updated to reflect the current state, e.g. `RFC-0141: introduced the Astro content seam (getEntry/getCollection re-exports).`

**Advisory (E-2):** `packages/content-source/AGENTS.md` line 5 references `docs/rfcs/RFC-0141-content-source-provider-abstraction-and-asset-reference-decoupling.md`, but the RFC file has been moved to `docs/rfcs/archive/implemented/`. This is a pre-existing issue (not introduced by this diff), but an agent following the link will hit a broken path.

### Axis F — Pragmatism

No issues. The diff is minimal — only the dead code and its documentation references are removed. No scope creep. The `ContentSourceProvider` interface in `types.ts` is correctly retained: it is used by `createNodeFsContentProvider` in `@warpgogol/site-kernel-content` (RFC-0146), which is the live node-side provider.

### Axis G — Blind spots

No issues. The removal has no runtime behavior change — the deleted code was never executed. No edge cases, no migration path needed, no performance impact.

### Spec compliance

No spec available — this was a dead-code removal identified during architecture review, not a spec-driven change. Skipped.

### Questions for the author

1. Should the `CHANGE_SUMMARY` in `astro.ts` be updated to remove the "fs content provider" mention, given that `fsContentProvider` is no longer in this module?
2. Should the AGENTS.md RFC-0141 path be corrected to `docs/rfcs/archive/implemented/rfc-0141-...` to avoid a broken link for agents?
