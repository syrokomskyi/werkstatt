---
reviewId: REVIEW-CODE-2026-07-10-02
date: 2026-07-10
reviewer:
  skill: wg-review
  model: unknown
verdict: needs-revision
diffRange: 4f11ea01c...HEAD
filesReviewed:
  - packages/share/src/index.ts
  - packages/share/src/content/entity-id.ts
  - packages/share/src/content/index.ts
  - packages/share/src/content/dispatch.ts (deleted)
  - packages/share/src/image-utils.ts (deleted)
  - packages/share/src/astro/page-handler.ts (deleted)
  - packages/share/package.json
  - packages/share/AGENTS.md
  - docs/reviews/code/packages-share/review-2026-07-10-share-refactoring-c1-c5.md
---

# Code Review: 4f11ea01c...HEAD — `@warpgogol/share` refactoring C6–C8

### Verdict: Needs revision

The diff removes two shim files, adds 7 semantic subpath exports, and merges a micro-module. Net −101 lines. Two Axis E failures (missing `CHANGE_SUMMARY` entries on `content/index.ts` and `index.ts`) and one Axis D observation require revision.

### Mechanical floor

- `@warpgogol/share` tsc --noEmit: **pass**

### Axis A — Structural correctness

- **Strict typing** — PASS. `createDispatcherResolver` carries `Record<string, any>` — pre-existing from `dispatch.ts`, not introduced by this diff.
- **Minimalism** — PASS. Shim removal reduces indirection. Subpath entries are declarative only.
- **Dead code** — PASS. Deleted files have no remaining importers.
- **Error handling** — N/A. No new error paths.

### Axis B — DNA alignment

- **DNA-1** (monorepo boundary) — PASS. Root barrel re-exports from `@warpgogol/content-source` (package boundary).
- **DNA-6** (kebab-case) — PASS. All filenames kebab-case.
- **DNA-42** (Compass markup) — PASS for new content. `entity-id.ts` CHANGE_SUMMARY updated with merge note.

### Axis C — Ecosystem fit

- **Package boundaries** — PASS. No cross-boundary violations.
- **AGENTS.md updates** — PASS. Table updated: `image-utils` marked deleted, `page-handler` shim noted, `content` row mentions `createDispatcherResolver` merge.
- **Compass sync** — N/A. No repository-wide requirement changes.
- **Command lifecycle** — N/A. No commands changed.
- **Export map integrity** — PASS. All 7 new semantic subpath entries point to existing files. `./content/dispatch` entry removed. `./image-utils` entry removed. `./astro/page-handler` redirected to `resolve-route.ts`.

### Axis D — Forward-only compliance

- **`image-utils` root barrel re-export** — OBSERVATION. The root barrel (`index.ts`) now re-exports from `@warpgogol/content-source` directly with `@deprecated` comments pointing to `@warpgogol/share/image-utils`. But `@warpgogol/share/image-utils` no longer exists in the export map — the subpath is gone. The deprecation comment directs consumers to a non-existent entry point.

  This is not a hard failure because no external consumers of `@warpgogol/share/image-utils` were found. But the comment is misleading. Fix: either remove the `@deprecated` comments (the root barrel is already deprecated as a whole) or point them to `@warpgogol/content-source` directly.

- **`page-handler` redirect** — PASS. Export map points directly to `resolve-route.ts`. No shim, no dual path.
- **`dispatch.ts` merge** — PASS. Function moved to `entity-id.ts`, old file deleted, barrel re-export removed. No parallel path.

### Axis E — Agent-facing clarity

- **Missing `CHANGE_SUMMARY` entry in `content/index.ts`** — FAIL. The barrel removed `export * from "./dispatch.ts"` but `CHANGE_SUMMARY` still reads only `RFC-0133: backfilled...`. Add:

  ```
  <item>Removed dispatch.ts re-export (merged into entity-id.ts).</item>
  ```

- **Missing `CHANGE_SUMMARY` entry in `index.ts`** — FAIL. The root barrel replaced `export * from "./image-utils.ts"` with direct re-exports from `@warpgogol/content-source` (27 new lines), but `CHANGE_SUMMARY` has no entry for this. Add:

  ```
  <item>C6: image-utils.ts shim deleted; root barrel re-exports from @warpgogol/content-source directly. page-handler.ts shim deleted; export map points to resolve-route.ts.</item>
  ```

- **Compass scaffolding** — PASS. `entity-id.ts` CHANGE_SUMMARY updated.
- **No ungrounded assertions** — PASS. AGENTS.md table accurately reflects the changes.
- **Readable by another agent** — PASS. Deletion of shims simplifies the import graph.

### Axis F — Pragmatism

- **Subpath selection** — PASS. The 7 chosen subpaths (`models`, `jsonld`, `llms`, `extract`, `page-utils`, `build-page`, `output-projection`) cover the most commonly imported modules. Not exhaustive — barrel remains for the rest.
- **`loaders.ts` kept** — PASS. Correctly retained because it performs a rename (`fsMarkdownCollectionLoader as markdownCollectionLoader`).
- **`routes.ts` kept** — PASS. Correctly retained — it's an aggregator, not a shim.

### Axis G — Blind spots

- **Dangling `@deprecated` comments** — See Axis D observation. The two `@deprecated import from "@warpgogol/share/image-utils" instead` comments in `index.ts` point to a deleted subpath.
- **`createDispatcherResolver` typing** — Pre-existing `Record<string, any>` / `any` return. Not introduced by this diff, but now lives in `entity-id.ts` which previously had clean typing. Consider tightening in a follow-up.
- **Subpath coverage** — 7 of ~25 semantic modules have subpath entries. The barrel is still required for the remaining ~18. This is acceptable for incremental migration.

### Spec compliance

No formal spec. C6–C8 were identified in an architecture review session.

| Requirement | Status | Evidence |
| --- | --- | --- |
| C6: Remove re-export shims | Done | `image-utils.ts` and `page-handler.ts` deleted; export map updated |
| C7: Add semantic subpath exports | Done | 7 entries added to `package.json` |
| C8: Merge `content/dispatch.ts` | Done | Merged into `entity-id.ts`; file, barrel re-export, and export map entry removed |
| Update AGENTS.md | Done | Table updated for all three changes |

### Questions for the author

1. **Dangling `@deprecated` comments** — the two comments in `index.ts` say `import from "@warpgogol/share/image-utils" instead`, but that subpath no longer exists. Should they say `@warpgogol/content-source` instead, or be removed entirely (since the whole root barrel is already deprecated)?
2. **`content/index.ts` CHANGE_SUMMARY** — should it note the `dispatch.ts` removal?
