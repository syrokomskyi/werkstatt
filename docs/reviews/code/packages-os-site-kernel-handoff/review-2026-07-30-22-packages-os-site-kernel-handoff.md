---
reviewId: REVIEW-CODE-2026-07-30-01
date: 2026-07-30
reviewer:
  skill: fo-review
  model: unknown
verdict: needs-revision
diffRange: f45e236...HEAD
filesReviewed:
  - packages/ontology/src/operations/release.ts
  - packages/os/site-kernel-handoff/src/release/release-commands.ts
  - packages/os/site-kernel-codegen/src/open-source-page.ts
  - packages/os/site-kernel-handoff/src/leitstand/leitstand-commands.ts
  - packages/os/site-kernel-handoff/src/leitstand/leitstand.module.ts
  - packages/os/site-kernel-handoff/src/leitstand/index.ts
  - packages/ui/src/sections/open-source-registry/open-source-registry-section.astro
  - packages/ui/src/sections/open-source-registry/open-source-registry-section.types.ts
  - packages/os/site-kernel-handoff/src/tests/leitstand-0608-propagate-channel-removed.test.ts
  - packages/os/site-kernel-handoff/src/tests/leitstand-0608-promote.test.ts
  - packages/os/site-kernel-handoff/src/tests/leitstand-0608-rollback-state.test.ts
  - packages/os/site-kernel-handoff/src/tests/release-0608-build-identity.test.ts
---

# Code Review: f45e236...HEAD (RFC-0608 implementation)

### Verdict: Needs revision

The implementation is architecturally sound and covers all RFC-0608 acceptance criteria. Two findings require attention: a potential SSR fetch portability issue and a silent catch block that could mask errors.

### Mechanical floor

Pass — `build:check` and all 407 tests pass.

### Axis A — Structural correctness

No issues. The `readReleaseManifest` function was correctly deduplicated by importing from `release-commands.ts` instead of maintaining a local copy. The `yaml` import was removed since it's no longer needed. Types are precise (`channel: "alt"` literal, `releaseState` fields).

### Axis B — DNA alignment

No issues. DNA-48 (Release discipline) and DNA-49 (Fleet propagation) were both updated to reflect the extended state machine and `leitstand.promote`. The implementation aligns with DNA-53 (all hashing via `@warpgogol/fingerprint`).

### Axis C — Ecosystem fit

No issues. Package boundaries are correct (`packages/ui` imports from `@warpgogol/share`, `packages/os/site-kernel-handoff` imports from `@warpgogol/ontology/operations`). Command registration is complete in `leitstand.module.ts`. `AGENTS.md` and `docs/COMMANDS.md` are updated.

### Axis D — Forward-only compliance

No issues. The `--channel` flag on `leitstand.propagate` is removed with a clear error — no fallback or compatibility shim. The old main-channel gate code was deleted, not kept behind a flag. `deploymentMetadata` was removed from the open-source registry JSON schema and generator — no dual-path.

### Axis E — Agent-facing clarity

1. **Finding: Silent catch in rollback state transition** (`leitstand-commands.ts:916-918`). The `catch` block swallows all errors with a comment "Release manifest may not exist for very old releases — non-fatal". While the comment explains intent, the catch is too broad — it also swallows `writeReleaseYaml` errors (e.g., disk full, permission denied) that are genuinely fatal. Recommend catching only the "manifest not found" case explicitly, or at minimum logging a warning.

### Axis F — Pragmatism

No issues. `leitstand.promote` earns its existence as a separate command — it has distinct preconditions (alt-deployed state, build-identity verification, live health checks) that justify separation from `leitstand.propagate`. The `buildIdentitySchema` is minimal and reuses existing regex patterns from `naming-policy.ts`.

### Axis G — Blind spots

1. **Finding: SSR fetch portability** (`open-source-registry-section.astro:63`). The `fetch(\`${Astro.url.origin}/.well-known/build-identity.json\`)` call assumes same-origin static file serving works on all target platforms. The RFC itself notes this risk (line 331) and states "if the adapter does not serve it, this is a bug to fix before implementing this RFC." The code has a graceful fallback to placeholder values (`"—"`) on fetch failure, which is correct. However, on Cloudflare Workers, `Astro.url.origin` may not resolve correctly in all deployment configurations — this should be verified with an actual deployment test before relying on it in production.

2. **Finding: SBOM timestamp regression** (`open-source-page.ts:436`). The SBOM `metadata.timestamp` now uses `new Date().toISOString()` at generation time instead of the build timestamp from `build-identity.json`. This means the SBOM timestamp reflects generation time, not build time — making SBOMs non-reproducible across regenerations of the same release. Consider whether this is acceptable or whether the SBOM should source its timestamp from `build-identity.json` as well.

### Spec compliance

| Requirement from the spec | Status | Evidence |
| --- | --- | --- |
| releaseStateSchema includes alt-deployed and promoted | Done | release.ts:21-22 |
| release.prepare writes build-identity.json | Done | release-commands.ts:370-390 |
| open-source-page sources from build-identity.json | Done | open-source-registry-section.astro:63 |
| leitstand.propagate no longer accepts --channel | Done | leitstand-commands.ts:322-326 |
| leitstand.propagate transitions to alt-deployed | Done | leitstand-commands.ts:387-390 |
| leitstand.promote registered, requires alt-deployed | Done | leitstand-commands.ts:523-526, leitstand.module.ts:58-74 |
| leitstand.promote fetches/verifies build-identity.json | Done | leitstand-commands.ts:556-591 |
| leitstand.promote runs live health checks | Done | leitstand-commands.ts:594-608 |
| leitstand.promote transitions to promoted | Done | leitstand-commands.ts:717 |
| leitstand.rollback main→rolled-back | Done | leitstand-commands.ts:910-911 |
| leitstand.rollback alt→published | Done | leitstand-commands.ts:912-913 |
| leitstand.propagate --channel throws clear error | Done | leitstand-commands.ts:322-326 |
| docs/COMMANDS.md and AGENTS.md updated | Done | docs/COMMANDS.md:372-374, AGENTS.md:26-33 |
| DNA-49 includes leitstand.promote | Done | architecture-dna.md:213 |
| rfc.validate passes | Done | rfc.validate output: 0 errors |

### Questions for the author

1. The rollback state transition catch block (leitstand-commands.ts:916) swallows all errors — should writeReleaseYaml failures (disk full, permissions) be fatal rather than silently ignored?
2. Has the SSR fetch of `/.well-known/build-identity.json` been verified on an actual Cloudflare Workers deployment, or only in unit tests with mocked fetch?
3. Is the SBOM timestamp regression (generation time vs build time) acceptable, or should it source from build-identity.json?
