---
reviewId: REVIEW-CODE-2026-07-31-01
date: 2026-07-31
reviewer:
  skill: fo-review
  model: claude-sonnet-4-20250514
verdict: approved
diffRange: 4e7db9d...HEAD
filesReviewed:
  - packages/os/site-kernel-handoff/src/leitstand/leitstand-commands.ts
  - packages/os/site-kernel-handoff/src/tests/cloudflare-workers.test.ts
  - packages/os/site-kernel-handoff/src/tests/leitstand-0608-promote.test.ts
---

# Code Review: 4e7db9d...HEAD (RFC-0618 cache-buster)

### Verdict: Approved

The diff is a minimal, well-targeted one-line fix adding a cache-buster to the `build-identity.json` fetch URL in `leitstand.promote`, with two focused tests covering the positive and negative cases. Zero findings across all axes.

### Mechanical floor

Pass — `pnpm --filter @warpgogol/site-kernel-handoff run build:check` and `pnpm --filter @warpgogol/site-kernel-handoff run test` (419/419) both pass.

### Axis A — Structural correctness

No issues. The change is a single string template literal extension — no new types, no new abstractions, no dead code. Tests use existing helpers (`createRegistryWithCloudflareAdapter`, `writeReleaseManifest`, `createDistDir`, `storeArtifactCore`, `VALID_BUILD_IDENTITY`, `stubRunner`) consistently with the rest of the test file.

### Axis B — DNA alignment

No issues. DNA-49 (Fleet propagation / Leitstand) governs `leitstand.promote`'s `build-identity.json` verification. The cache-buster improves the reliability of that verification step without changing the state machine, verification logic, or adapter contract. The invariant's statement that `leitstand.promote` "verifies `build-identity.json` from the alt URL" remains true — the cache-buster only changes the URL format, not the semantic behavior.

### Axis C — Ecosystem fit

No issues. The change is entirely within `@warpgogol/site-kernel-handoff`. No package boundary violations, no new commands, no pipeline topology changes, no Compass XML or AGENTS.md updates needed.

### Axis D — Forward-only compliance

No issues. The old URL format is replaced, not maintained alongside the new one. No dual-path, no flag, no compatibility shim.

### Axis E — Agent-facing clarity

No issues. No new source files added — only test additions and a one-line edit. Test names clearly state what they verify: "RFC-0618: build-identity fetch URL includes cache-buster query param" and "RFC-0618: health check route probe URLs do NOT include cache-buster query param". The RFC-0618 reference in test names provides traceability.

### Axis F — Pragmatism

No issues. The fix is a single-line change — no new command, no new abstraction, no speculative generality. Tests are minimal and focused. The positive test reuses the full success-path setup; the negative test uses the real adapter with a minimal behavior snapshot.

### Axis G — Blind spots

No issues. The cache-buster uses `Date.now()` which is monotonically increasing and sufficient for cache-busting purposes. The negative test explicitly verifies that health check route probes do NOT receive the cache-buster, closing the blind spot identified in the audit (G-1). Edge case: `Date.now()` returns milliseconds — two calls within the same millisecond would produce the same value, but this is irrelevant for cache-busting since the URL only needs to differ from the previously cached one.

### Spec compliance

| Requirement from RFC-0618 | Status | Evidence |
| --- | --- | --- |
| Append `?cb=<timestamp>` to build-identity fetch URL | Done | leitstand-commands.ts:557 |
| Cache-buster MUST NOT apply to health check route probes | Done | cloudflare-workers.test.ts:129 — negative test verifies probe URLs do NOT contain `?cb=` |
| Unit test: build-identity fetch URL includes cache-buster | Done | leitstand-0608-promote.test.ts:343 |
| Unit test: health check probes do NOT include cache-buster | Done | cloudflare-workers.test.ts:129 |
| No retry logic as substitute | Done | No retry logic added — cache-buster is the primary fix |

### Questions for the author

None — the diff fully satisfies the RFC's requirements with no ambiguities.
