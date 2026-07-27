---
reviewId: REVIEW-CODE-2026-07-10-01
date: 2026-07-10
reviewer:
  skill: wg-review
  model: claude-sonnet-4-20250514
verdict: needs-revision
diffRange: 8895cbbe8...HEAD
filesReviewed:
  - packages/check-core/src/report.ts
  - packages/check-core/src/artifacts.ts
  - packages/check-core/src/run-paths.ts
  - packages/check-core/src/evidence.ts
  - packages/check-runner-node/src/index.ts
  - packages/os/site-kernel-check-webgogol/src/commands/artifact-builders.ts
  - packages/os/site-kernel-check-webgogol/src/commands/evidence-readers.ts
  - packages/os/site-kernel-check-webgogol/src/commands/hints.ts
  - services/check-webgogol-runner/src/config.ts
  - services/check-webgogol-runner/src/run-once.ts
  - apps/check-webgogol-com/src/pages/api/check-runs/index.ts
  - apps/check-webgogol-com/src/pages/api/check-runs/[runid].ts
  - packages/fingerprint/AGENTS.md
  - packages/growth/AGENTS.md
  - packages/growth/README.md
---

# Code Review: 8895cbbe8...HEAD — check-core deepening

### Verdict: Needs revision

The change successfully deepens `@gogol/check-core` by absorbing deterministic logic and unifying utilities, but carries three findings that require revision: a stale `MODULE_CONTRACT` referencing a removed `escapeHtml`, dead imports in `run-once.ts`, and scope creep from unrelated `fingerprint`/`growth` doc edits bundled into the same commit.

### Mechanical floor

Pass — `tsc --noEmit` green for `@gogol/check-core`, `@gogol/check-runner-node`, `@gogol/site-kernel-check-webgogol`, and `check-webgogol-runner`. Pre-existing `astro check` errors in `check-webgogol-com` are unrelated to this diff.

### Axis A — Structural correctness

- **Dead imports** — `screenshotsRelDir` and `logsRelDir` are imported in `services/check-webgogol-runner/src/run-once.ts:27-28` but never referenced in the function body. `makeRunArtifact` already constructs these paths internally. Remove both imports.
- **Stale CHANGE_SUMMARY** — `packages/check-runner-node/src/index.ts:7` says "Migrated sha256Hex import from deleted @gogol/check-core/hash.ts to local wrapper around @gogol/fingerprint byteHash." The local wrapper was removed in this diff; the entry should say "Migrated to byteHash directly" or be appended with a new item.

### Axis B — DNA alignment

- **DNA-42 (Compass markup)** — `packages/os/site-kernel-check-webgogol/src/commands/artifact-builders.ts:5` `MODULE_CONTRACT` says "Also provides shared utility helpers (numberFlag, renderReportHtml, escapeHtml)." `escapeHtml` was moved to `check-core/src/report.ts` and is no longer exported from this module. The contract is now false. Update the `<purpose>` to remove `escapeHtml`.
- No other DNA violations found. The diff does not touch cosmic naming, content layering, route structure, or design tokens.

### Axis C — Ecosystem fit

- **Scope creep** — `packages/fingerprint/AGENTS.md`, `packages/growth/AGENTS.md`, and `packages/growth/README.md` are included in the commit but are unrelated to the check-core deepening. These appear to be pre-staged files from a prior session that were accidentally swept into the commit. They should be split into a separate commit or reverted if not intended.
- **Package boundaries** — imports flow correctly: `apps/* → packages/*`, `services/* → packages/*`. No cross-app or app→service imports.
- **Barrel exports** — `check-core/src/index.ts` re-exports all touched modules via `export *`, so new functions (`makeCheckReport`, `makeAgentAction`, `makeAgentActionPack`, `renderReportHtml`, `makeRunArtifact`, `findWorkspaceRoot`, `containsSecretLikeText`) are publicly available.

### Axis D — Forward-only compliance

- **No backward compatibility shims** — `artifact-builders.ts` and `evidence-readers.ts` now re-export directly from `check-core` instead of wrapping. The old hand-rolled implementations are deleted, not maintained behind a flag.
- **hash.ts retirement** — `hash.ts` is deleted. `evidence.ts` uses `byteHash` directly (prefixed format). `check-runner-node` uses `byteHash` directly. No legacy `sha256Hex` wrapper remains.
- **Hash format change** — `finalizeEvidenceGraph` now produces `sha256:<hex>` instead of bare `<hex>`. This is a forward-only format change: existing evidence graphs with bare-hex `graphHash` values will fail `validateEvidenceGraphHash`. This is correct per forward-only discipline, but consumers must be aware that previously generated evidence graphs are invalid under the new format.

### Axis E — Agent-facing clarity

- **Stale MODULE_CONTRACT** — `artifact-builders.ts:5` references `escapeHtml` which no longer exists in the module. An agent reading this contract will look for a non-existent export.
- **Stale CHANGE_SUMMARY** — `check-runner-node/src/index.ts:7` references a `sha256Hex` wrapper that was removed in this diff.
- **Readable code** — function names are clear (`makeCheckReport`, `makeAgentAction`, `findWorkspaceRoot`). Variable names reveal intent. No mysterious names.
- **No ungrounded assertions** — code references real types and functions.

### Axis F — Pragmatism

- **Minimal command surface** — no new commands introduced. Existing functions are moved, not duplicated.
- **Lean contracts** — `makeRunArtifact` accepts a minimal parameter set. `findWorkspaceRoot` takes a single optional argument.
- **Existing patterns** — the diff extends `check-core` with functions that were already duplicated across three consumers. This is the correct deepening.
- **Scope discipline** — the check-core deepening is well-scoped. The `fingerprint`/`growth` doc edits are scope creep.

### Axis G — Blind spots

- **Hash format migration** — the change from bare-hex to `sha256:`-prefixed `graphHash` invalidates previously generated evidence graphs. No migration path is documented. If existing `.check-webgogol/runs/*/evidence.graph.json` artifacts exist on disk, `validateEvidenceGraphHash` will return `false` for them. This is acceptable per forward-only discipline but should be noted.
- **`findWorkspaceRoot` in browser context** — `check-core` is a schema-and-logic package. `findWorkspaceRoot` uses `node:fs` and `process.cwd()`, making it Node-only. The `apps/check-webgogol-com` API routes run in a Cloudflare Workers context (Astro `prerender = false`). `existsSync` from `node:fs` may not be available in that runtime. This is a potential runtime error if the Cloudflare adapter does not polyfill `node:fs`.

### Spec compliance

No spec available — spec compliance skipped. The diff implements the four candidates identified in the architectural review report.

### Questions for the author

1. **`findWorkspaceRoot` in Cloudflare Workers** — `apps/check-webgogol-com` API routes use `prerender = false` and deploy to Cloudflare Pages. Does `node:fs.existsSync` work in that runtime? If not, `findWorkspaceRoot` will throw at runtime despite passing typecheck.
2. **Hash format break** — existing evidence graphs on disk have bare-hex `graphHash` values. Should `validateEvidenceGraphHash` be updated to handle both formats during a transition, or are all existing artifacts disposable?
3. **Scope creep** — why are `packages/fingerprint/AGENTS.md`, `packages/growth/AGENTS.md`, and `packages/growth/README.md` changes in this commit? Should they be split out?
