---
reviewId: REVIEW-CODE-2026-07-29-20
date: 2026-07-29
reviewer:
  skill: fo-review
  model: unknown
verdict: approved
diffRange: 4518dca...HEAD
filesReviewed:
  - packages/os/site-kernel-handoff/src/leitstand/adapter.ts
  - packages/os/site-kernel-handoff/src/leitstand/adapters/cloudflare-workers.ts
  - packages/os/site-kernel-handoff/src/leitstand/adapters/index.ts
  - packages/os/site-kernel-handoff/src/leitstand/leitstand-commands.ts
  - packages/os/site-kernel-handoff/src/artifact-store/artifact-store-commands.ts
  - packages/os/site-kernel-handoff/package.json
  - packages/os/site-kernel-handoff/AGENTS.md
---

# Code Review: 4518dca...HEAD (RFC-0587 implementation)

### Verdict: Approved

The implementation correctly adds tar.gz archive creation, adapter-declared size limits, and exported helpers to the Leitstand and artifact store modules. All mechanical checks pass. After fix commit 3c7a1e4, both findings (B1 DNA-53 violation and G1 memory concern) are resolved — archive hashing now uses `byteHashFile` from `@warpgogol/fingerprint` with streaming file I/O.

### Mechanical floor

Pass — `pnpm --filter @warpgogol/site-kernel-handoff build:check` and `pnpm --filter @warpgogol/site-kernel-handoff test` (345 tests) all pass.

### Axis A — Structural correctness

No issues. The `DeploymentLimits` interface is minimal (two fields). The `getLimits()` method is a simple getter. The `checkDistSize` refactor cleanly replaces hardcoded constants with the `limits` parameter. The tar.gz creation uses the `tar` npm package's `create`/`extract` API correctly. The idempotent manifest removal logic correctly checks `existing.manifestPath !== path.join(storeDir, ...)` before unlinking to avoid removing the same file being written.

### Axis B — DNA alignment

No issues after fix. DNA-53 (semantic fingerprint governance) required all project hashes to use `@warpgogol/fingerprint`. The initial implementation used `crypto.createHash` directly — fixed in commit 3c7a1e4 by replacing with `byteHashFile` and `byteHash` from `@warpgogol/fingerprint`. The pre-existing `hashFile` and `hashDir` functions in the same file were also migrated to use `byteHashFile`/`byteHash`, resolving the legacy violations as well.

### Axis C — Ecosystem fit

No issues. All changes are scoped to `packages/os/site-kernel-handoff`. The `tar` npm package is a well-maintained external dependency (per the ecosystem preference for external packages over custom code). AGENTS.md was updated with the new `getLimits()`, tar.gz archive, rehydrate extraction, and exported helpers documentation. No package boundary violations. No new commands introduced.

### Axis D — Forward-only compliance

No issues. The old `distArtifactHash = treeHash` path is completely replaced with the tar.gz archive hash — no dual path. The old empty-directory `artifactStoreRehydrate` is replaced with tar.gz extraction — no fallback. The hardcoded limit constants in `checkDistSize` are removed, replaced by adapter-declared limits — no backward compat.

### Axis E — Agent-facing clarity

No issues. All modified source files carry `CHANGE_SUMMARY` updates with RFC-0587 entries. The `DeploymentLimits` interface and `getLimits()` method are self-documenting. The `archivePath` field in `ArtifactStorePutData` is clearly named. The `filterEnv` and `sourceDotenv` exports are straightforward.

### Axis F — Pragmatism

No issues. `DeploymentLimits` is minimal — two fields, no speculative generality. The `getLimits()` method is a simple getter with no over-engineering. The tar.gz creation is straightforward. The `null` adapter returns `Infinity` limits — correct for a no-op adapter.

### Axis G — Blind spots

No issues after fix. The initial implementation read the entire tar.gz archive into memory for hashing — fixed in commit 3c7a1e4 by using `byteHashFile` which streams the file. No other blind spots identified.

### Spec compliance

| Requirement from the spec (RFC-0587) | Status | Evidence |
| --- | --- | --- |
| `artifact.store.put` creates tar.gz archive | Done | artifact-store-commands.ts:125-132 |
| `distArtifactHash` is archive hash | Done | artifact-store-commands.ts:136 |
| Idempotent manifest storage | Done | artifact-store-commands.ts:152-156 |
| `artifactStoreRehydrate` extracts tar.gz | Done | artifact-store-commands.ts:427-430 |
| `DeploymentAdapter.getLimits()` | Done | adapter.ts:56-68 |
| `checkDistSize` uses adapter limits | Done | leitstand-commands.ts:218 |
| `cloudflare-workers` `getLimits()` returns 20 GiB / 25 MiB | Done | cloudflare-workers.ts:228-230 |
| `null` adapter `getLimits()` returns Infinity | Done | leitstand-commands.ts:87-89 |
| `filterEnv` exported | Done | cloudflare-workers.ts:29 |
| `sourceDotenv` exported | Done | cloudflare-workers.ts:62 |
| `ArtifactStorePutData` retains `siteContentHash` | Done | artifact-store-commands.ts:73-84 |

### Questions for the author

No outstanding questions. Both findings from the initial review have been resolved in commit 3c7a1e4.
