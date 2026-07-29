---
reviewId: REVIEW-CODE-2026-07-29-20
date: 2026-07-29
reviewer:
  skill: fo-review
  model: unknown
verdict: needs-revision
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

### Verdict: Needs revision

The implementation correctly adds tar.gz archive creation, adapter-declared size limits, and exported helpers to the Leitstand and artifact store modules. All mechanical checks pass. However, there are two findings: a DNA-53 violation (direct `crypto.createHash` usage instead of `@warpgogol/fingerprint`) and a memory concern (reading the entire archive into memory for hashing).

### Mechanical floor

Pass — `pnpm --filter @warpgogol/site-kernel-handoff build:check` and `pnpm --filter @warpgogol/site-kernel-handoff test` (345 tests) all pass.

### Axis A — Structural correctness

No issues. The `DeploymentLimits` interface is minimal (two fields). The `getLimits()` method is a simple getter. The `checkDistSize` refactor cleanly replaces hardcoded constants with the `limits` parameter. The tar.gz creation uses the `tar` npm package's `create`/`extract` API correctly. The idempotent manifest removal logic correctly checks `existing.manifestPath !== path.join(storeDir, ...)` before unlinking to avoid removing the same file being written.

### Axis B — DNA alignment

**Finding B1 — DNA-53 violation: direct `crypto.createHash` usage.** The new code at `artifact-store-commands.ts:135` uses `crypto.createHash("sha256").update(archiveBuffer).digest("hex")` to hash the tar.gz archive. DNA-53 states: "All project hashes for platform, content, release artifacts, snapshots, and generated manifests use the shared `@warpgogol/fingerprint` package. New ad hoc direct hashing helpers are forbidden outside the package and audited by `fingerprint.usage.lint`." The `@warpgogol/fingerprint` package exports `byteHashFile` which should be used instead. This also fixes the pre-existing `hashFile` and `hashDir` functions in the same file which use the same pattern — but the new code introduces a new violation. Fix: replace `crypto.createHash("sha256").update(archiveBuffer).digest("hex")` with `await byteHashFile(archiveTmpPath)` from `@warpgogol/fingerprint`, and remove the `archiveBuffer` variable.

### Axis C — Ecosystem fit

No issues. All changes are scoped to `packages/os/site-kernel-handoff`. The `tar` npm package is a well-maintained external dependency (per the ecosystem preference for external packages over custom code). AGENTS.md was updated with the new `getLimits()`, tar.gz archive, rehydrate extraction, and exported helpers documentation. No package boundary violations. No new commands introduced.

### Axis D — Forward-only compliance

No issues. The old `distArtifactHash = treeHash` path is completely replaced with the tar.gz archive hash — no dual path. The old empty-directory `artifactStoreRehydrate` is replaced with tar.gz extraction — no fallback. The hardcoded limit constants in `checkDistSize` are removed, replaced by adapter-declared limits — no backward compat.

### Axis E — Agent-facing clarity

No issues. All modified source files carry `CHANGE_SUMMARY` updates with RFC-0587 entries. The `DeploymentLimits` interface and `getLimits()` method are self-documenting. The `archivePath` field in `ArtifactStorePutData` is clearly named. The `filterEnv` and `sourceDotenv` exports are straightforward.

### Axis F — Pragmatism

No issues. `DeploymentLimits` is minimal — two fields, no speculative generality. The `getLimits()` method is a simple getter with no over-engineering. The tar.gz creation is straightforward. The `null` adapter returns `Infinity` limits — correct for a no-op adapter.

### Axis G — Blind spots

**Finding G1 — Archive buffer read into memory.** At `artifact-store-commands.ts:134`, the code reads the entire tar.gz archive into memory (`await fs.readFile(archiveTmpPath)`) to compute its hash. For a large dist directory (e.g., 330 MiB), the archive could be ~330 MiB, and reading it all into memory could cause memory pressure in constrained environments. Using `byteHashFile` from `@warpgogol/fingerprint` (which hashes the file in a streaming fashion) would eliminate this concern. This finding is coupled with B1 — fixing B1 by using `byteHashFile` also fixes G1.

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

1. Should the archive hash use `byteHashFile` from `@warpgogol/fingerprint` instead of `crypto.createHash` to comply with DNA-53?
2. Should the pre-existing `hashFile` and `hashDir` functions in the same file also be migrated to `@warpgogol/fingerprint` in this RFC, or should that be a separate cleanup?
