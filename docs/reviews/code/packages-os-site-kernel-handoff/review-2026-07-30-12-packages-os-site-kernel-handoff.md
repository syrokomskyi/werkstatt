---
reviewId: REVIEW-CODE-2026-07-30-12
date: 2026-07-30
reviewer:
  skill: fo-review
  model: claude-sonnet-4-20250514
verdict: needs-revision
diffRange: 66f872d...HEAD
filesReviewed:
  - packages/os/site-kernel-handoff/src/artifact-store/artifact-store-commands.ts
  - packages/os/site-kernel-handoff/src/artifact-store/index.ts
  - packages/os/site-kernel-handoff/src/release/release-commands.ts
  - packages/os/site-kernel-handoff/src/tests/release-0596-artifact-storage.test.ts
  - packages/os/site-kernel-handoff/AGENTS.md
---

# Code Review: 66f872d...HEAD (RFC-0596 implementation)

### Verdict: Needs revision

Two findings: a duplicated `distDir` declaration in `runReleasePublish` (Axis A) and an inconsistent `artifactPresent` check in the `else` branch of `release.validate` (Axis A). Both are minor but should be fixed before merge.

### Mechanical floor

Pass — `pnpm --filter @warpgogol/site-kernel-handoff build:check` and `pnpm --filter @warpgogol/site-kernel-handoff test` both pass (386 tests, 0 failures).

### Axis A — Structural correctness

1. **Duplicated `distDir` declaration in `runReleasePublish`** — `distDir` is declared at `release-commands.ts:533` (RFC-0585 dist directory check) and again at `release-commands.ts:578` (RFC-0596 artifact storage). The second declaration is redundant — the variable is already in scope from the first declaration. Remove the duplicate `const distDir = path.join(releaseDir, "dist");` at line 578.

2. **Inconsistent `artifactPresent` check in `release.validate` else branch** — At `release-commands.ts:677`, the `else` branch (non-published states) checks `manifest.artifact !== null`, but the `readReleaseManifest` parser returns string `"null"` for YAML `null` values (as discovered during testing). The published-state branch at line 672 correctly checks `manifest.artifact !== "null"`, but the else branch does not. This means a `prepared` release with `artifact: null` in the YAML would report `artifactPresent: true` incorrectly. Apply the same `!== "null"` guard to the else branch for consistency.

### Axis B — DNA alignment

No issues. DNA-48 (Release discipline) is strengthened — artifact is now stored before state transition. DNA-52 (Release artifact store) is satisfied — `storeArtifactCore` produces content-addressed records.

### Axis C — Ecosystem fit

No issues. `storeArtifactCore` is exported from the artifact-store barrel (`index.ts`). Import flows correctly within the same package. AGENTS.md updated with the new behavior.

### Axis D — Forward-only compliance

No issues. The `systemId` derivation bug (`releaseId.split("-m")`) is fixed directly — no compatibility shim. The old code path is replaced, not maintained behind a flag.

### Axis E — Agent-facing clarity

No issues. New test file carries `MODULE_CONTRACT` and `CHANGE_SUMMARY`. Comments reference RFC-0596 and explain the lock-free rationale. CHANGE_SUMMARY entries added to both modified source files.

### Axis F — Pragmatism

No issues. `storeArtifactCore` is the minimal extraction — no speculative generality. `ReleasePublishData` extension with `distArtifactHash` is the minimum needed. No new commands or flags.

### Axis G — Blind spots

No issues. Performance impact is documented in the RFC (<1s for typical site). Orphaned artifacts are handled by existing `artifact.store.gc`. Idempotency is preserved via `findArtifactManifest` cleanup.

### Spec compliance

| Requirement from RFC-0596 | Status | Evidence |
| --- | --- | --- |
| Store artifact before state transition | Done | `release-commands.ts:579-584` |
| Extract lock-free `storeArtifactCore` | Done | `artifact-store-commands.ts:97-185` |
| Fix `systemId` derivation bug | Done | `artifact-store-commands.ts:187-199` |
| Extend `ReleasePublishData` with `distArtifactHash` | Done | `release-commands.ts:502` |
| `release.validate` checks artifact for published releases | Done | `release-commands.ts:668-677` |
| AGENTS.md updated | Done | `AGENTS.md:40` |
| Unit tests | Done | 9 tests, all passing |

### Questions for the author

1. Should the `else` branch in `release.validate` (non-published states) also guard against the string `"null"` from the YAML parser, or is the current behavior intentional for prepared releases?
