---
reviewId: REVIEW-CODE-2026-08-01-01
date: 2026-08-01
reviewer:
  skill: fo-review
  model: claude-sonnet-4-20250514
verdict: needs-revision
diffRange: b76cedd...HEAD
filesReviewed:
  - packages/ontology/src/operations/release.ts
  - packages/os/site-kernel-handoff/src/leitstand/leitstand-commands.ts
  - packages/os/site-kernel-handoff/src/release/release-commands.ts
  - packages/os/site-kernel-handoff/src/tests/release-0608-build-identity.test.ts
  - packages/os/site-kernel-handoff/src/tests/rfc-0634-dev-deploy-build-identity.test.ts
  - packages/os/site-kernel-handoff/src/tests/rfc-0634-propagate-dev-verification.test.ts
  - packages/ui/src/sections/open-source-registry/open-source-registry-section.astro
  - packages/os/site-kernel-handoff/AGENTS.md
  - packages/ui/AGENTS.md
  - docs/architecture-dna.md
  - docs/rfcs/rfc-0634-unify-deployment-identity-across-dev-alt-and-main-channels-with-build-identity-verification-at-every-promotion-step.md
  - docs/rfcs/archive/implemented/rfc-0608-enforce-alt-to-main-deployment-promotion-chain-with-release-state-machine-and-public-build-identity-verification.md
---

# Code Review: b76cedd...HEAD (RFC-0634 implementation)

### Verdict: Needs revision

The implementation correctly unifies build-identity verification across dev, alt, and main channels. The code follows existing patterns (mirror of `leitstand.promote` verification). However, 3 pre-existing tests fail because the new `computeBuildInputHash` call in `dev-deploy` requires `package.json` in the test workspace root, and the new dev-URL `fetch` in `propagate` is not mocked in the existing test. These test fixtures must be updated.

### Mechanical floor

Fail — 3 test failures in `packages/os/site-kernel-handoff`:

1. `leitstand-0628-dev-deploy.test.ts > deploys workpiece to dev channel` — `ENOENT: package.json` in temp workspace root. Introduced by Step 2: `computeBuildInputHash` calls `resolveCurrentEcosystem(workspaceRoot)` which reads `workspaceRoot/package.json`. The test's temp workspace doesn't have one.
2. `leitstand-0628-dev-deploy.test.ts > does not write to registry or bordbuch` — same `ENOENT: package.json` root cause.
3. `leitstand-0608-propagate-channel-removed.test.ts > transitions release to alt-deployed on success` — `fetch failed` when trying to fetch dev build-identity.json. Introduced by Step 5: the test doesn't mock the dev URL fetch.

### Axis A — Structural correctness

- **Duplicated Code** — The dev-URL build-identity verification in `leitstand.propagate` (lines 836-912) and the alt-URL verification in `leitstand.promote` (lines 1067-1102) share the same pattern: fetch URL, `buildIdentitySchema.safeParse`, field-by-field comparison with actionable error messages. Consider extracting a shared `verifyRemoteBuildIdentity(url, manifestFields)` helper to reduce duplication. Not blocking but recommended.

### Axis B — DNA alignment

No issues. DNA-49 prose updated correctly. DNA-48 (release discipline) not violated — `build-identity.json` is still written to `dist/client/.well-known/` in `release.prepare`.

### Axis C — Ecosystem fit

No issues. Package boundaries respected (`packages/ui` imports from `node:fs` and `node:path` which are Node-only, but the component is an Astro section rendered at build time). AGENTS.md files updated for both impacted packages. RFC-0608 `amendedBy` updated.

### Axis D — Forward-only compliance

No issues. No backward compatibility shims. The `commitSha === "0000000"` fallback in propagate verification is not a compatibility shim — it handles the case where `git rev-parse HEAD` fails in the workpiece (same pattern as `release.prepare`).

### Axis E — Agent-facing clarity

No issues. `MODULE_CONTRACT` and `CHANGE_SUMMARY` headers updated in both modified source files. RFC-0634 annotations clearly mark new code sections. AGENTS.md updates provide clear guidance for future agents.

### Axis F — Pragmatism

No issues. The `devBuildIdentityVerified` and `axiomEvidenceVerified` fields are additive to `LeitstandPropagateData` — no breaking changes to existing consumers. The `buildIdentity` field on `DevDeployResult` is also additive.

### Axis G — Blind spots

- **Edge case: `canReuseDistribution` path in `release.prepare`** — When `canReuseDistribution` is true, the workpiece is not rebuilt, so the preliminary `build-identity.json` in `public/.well-known/` is not copied to `dist/`. The reused distribution retains whatever metadata it was built with. This is documented as a known limitation in the RFC non-goals. The cleanup of the preliminary file still happens correctly.

- **Edge case: dev URL unreachable during propagate** — If the dev deployment is down, `fetch` throws and propagate fails with an actionable error. This is the intended behavior per RFC-0634 design.

### Spec compliance

| Requirement from RFC-0634 | Status | Evidence |
| --- | --- | --- |
| Loosen `buildIdentitySchema.releaseId` regex | Done | `release.ts:75` |
| `dev-deploy` writes preliminary + final `build-identity.json` | Done | `leitstand-commands.ts:437-555` |
| `release.prepare` writes preliminary + sources `commitSha` from workpiece HEAD | Done | `release-commands.ts:232-266, 329-338` |
| Open-source page reads `build-identity.json` locally | Done | `open-source-registry-section.astro:57-81` |
| `propagate` verifies dev build-identity before deploying to alt | Done | `leitstand-commands.ts:836-912` |
| DNA-49 prose updated | Done | `docs/architecture-dna.md:211-213` |
| AGENTS.md files updated | Done | `packages/os/site-kernel-handoff/AGENTS.md:34-35`, `packages/ui/AGENTS.md:58` |
| Unit tests for all new behavior | Done | 20/20 new tests pass |
| Pre-existing tests still pass | Partial | 3 pre-existing tests fail due to missing test fixtures (no `package.json` in temp workspace, no dev URL mock) |

### Questions for the author

1. The 3 failing pre-existing tests (`leitstand-0628-dev-deploy.test.ts` × 2, `leitstand-0608-propagate-channel-removed.test.ts` × 1) need fixture updates. The dev-deploy tests need a `package.json` written to the temp workspace root; the propagate test needs a mock for the dev URL `fetch`. Will you fix these via `fo-fix`?
2. Should the build-identity verification logic in `propagate` and `promote` be extracted into a shared helper to reduce duplication?
