---
id: RFC-0834
title: "Commit generated variant manifests for drift detection"
status: draft
kind: policy
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-08-13
updatedAt: 2026-08-13
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends:
  - RFC-0204
  - RFC-0210
amendedBy: []
related:
  - RFC-0078
  - RFC-0081
  - RFC-0087
  - RFC-0830
satisfies: []
versionBump: patch
commands:
  proposed: []
  added: []
  changed: []
  removed: []
appsImpacted: []
packagesImpacted:
  - "@warpgogol/werkstatt-site"
successSignals:
  - "A stale image-variants.generated.yaml or video-manifest.generated.yaml shows up as a git diff when source assets change but the generator has not been re-run, making drift visible in code review and mission reconcile."
  - "A mission workpiece built from a cold materialize has the variant manifest available without requiring image.variants.generate to run first — the provider reads the committed manifest and emits srcset immediately."
  - "Binary variant files (public/_img/**, public/_video/**) remain gitignored — no LFS bloat."
nonGoals:
  - "Do not commit binary derived artifacts (public/_img/**, public/_video/**) — they are large, platform-specific, and regenerated deterministically from the manifest + source hashes."
  - "Do not change the generator or validator logic — only the gitignore policy for the manifest files."
  - "Do not remove the GENERATED marker from manifest files — they are still generated artifacts that agents must not hand-edit."
---

# RFC-0834: Commit generated variant manifests for drift detection

## Context

RFC-0204 (image variants) and RFC-0210 (video variants) both mandate:

> "Do not commit derived variants to git — they are build artifacts regenerated deterministically."
> "Agents MUST NOT commit generated variants or the manifest; they are gitignored build artifacts carrying the `GENERATED` marker."

This rule was written when the manifests were JSON files with non-deterministic key ordering. Since then, the image manifest was migrated to YAML (`src/image-variants.generated.yaml`) with stable key ordering and `sourceHash` fields per entry — making it deterministic and reviewable.

The platform already commits many generated text artifacts for exactly this reason: `docs/command-manifest.generated.yaml`, `docs/ecosystem.generated.yaml`, `src/agent-capabilities.generated.json`, `src/content-ref-index.generated.yaml`, `src/surface.generated.yaml`, and others. These are committed to catch drift, ensure reproducibility, and make changes visible in code review.

The variant manifests are the **only** generated text artifacts that are gitignored. This creates a gap: when source images change but `image.variants.generate` is not re-run (e.g., during a dev materialize that runs `build.prepare.dev` instead of `build.prepare`), the stale manifest is invisible — no diff, no warning, no drift signal until `image.variants.validate` runs in `build.check`.

## Problem

1. **Silent drift:** A stale `image-variants.generated.yaml` produces no git diff. If an agent or operator changes a source image and forgets to run `image.variants.generate`, the stale manifest ships to production with no review-time signal.

2. **Cold materialize gap:** A freshly materialized workpiece has no `image-variants.generated.yaml` until `image.variants.generate` runs. The build-portable provider falls back to raw `{ src }` (no srcset), and `image.delivery.validate` (RFC-0830) reports IMG-DELIVERY-01 failures. This happened in mission warpgogol-com-m000054 — the validator found 414 findings because the manifest was missing.

3. **Inconsistency:** `src/content-ref-index.generated.yaml` is tracked (committed before it was gitignored; git continues tracking it), while `src/image-variants.generated.yaml` is not. The platform has no consistent policy for which generated text manifests are committed.

## Decision

Amend RFC-0204 and RFC-0210: the generated **manifest files** (`src/image-variants.generated.yaml` and `src/video-manifest.generated.yaml`) are **committed to git**. The binary derived artifacts (`public/_img/**`, `public/_video/**`) remain **gitignored**.

Specifically:

- Remove `src/image-variants.generated.yaml` from the workpiece `.gitignore`.
- Remove `src/video-manifest.generated.yaml` from the workpiece `.gitignore`.
- Keep `public/_img/` and `public/_video/` in the workpiece `.gitignore`.
- Update RFC-0204 nonGoals and implementation notes: "Do not commit derived binary variants" (not "manifest").
- Update RFC-0210 nonGoals and file system table: manifest is now tracked.
- Update `docs/policies/content-contracts.md` to reflect the new policy.
- Update the onboarding `.gitignore` template to remove the manifest lines.

## Architectural fit

- **Generated-file governance (RFC-0078/0081/0087):** The manifest carries the `GENERATED` marker and is owned by a single command (`image.variants.generate` / `video.variants.generate`). Committing it does not change ownership or the regeneration contract — it makes the output visible in review.
- **Drift detection pattern:** The platform already commits generated text artifacts (`docs/command-manifest.generated.yaml`, `src/agent-capabilities.generated.json`, etc.) for drift detection. This RFC extends that pattern to variant manifests.
- **RFC-0830 (image.delivery.validate):** The validator checks rendered HTML for srcset presence. A committed manifest ensures the manifest exists in a cold workpiece, so the provider emits srcset and the validator passes without requiring a pre-build generation step.
- **Source-hash invalidation (RFC-0204/0210):** The manifest stores `sourceHash` per entry. A committed manifest with a stale hash is detected by `image.variants.validate` (stale-manifest rule) and is also visible as a git diff — two layers of drift detection instead of one.

## Design

### .gitignore changes

Remove these lines from the workpiece `.gitignore`:

```diff
-# RFC-0204: build-portable image provider — generated artifacts (do not commit)
-public/_img/
-src/image-variants.generated.yaml
+# RFC-0204: build-portable image provider — binary variants (do not commit)
+# The manifest (src/image-variants.generated.yaml) IS committed for drift detection.
+public/_img/
```

```diff
-# RFC-0210: unified media contract — derived video artifacts + manifest (do not commit)
-public/_video/
-src/video-manifest.generated.yaml
+# RFC-0210: unified media contract — binary derived artifacts (do not commit)
+# The manifest (src/video-manifest.generated.yaml) IS committed for drift detection.
+public/_video/
```

### No code changes

The generator (`image.variants.generate`, `video.variants.generate`) and validator (`image.variants.validate`, `video.variants.validate`) are unchanged. They already read and write the manifest at the same path. The only change is whether git tracks the file.

### Commit discipline

- `mission.git.commit` and `ecosystem.commit` will now include the manifest in diffs when it changes.
- Agents SHOULD commit the manifest alongside source image/video changes in the same commit, so the diff shows both the source change and the manifest update.
- `image.variants.validate` and `video.variants.validate` continue to enforce manifest freshness in `build.check` — a committed-but-stale manifest still fails validation.

## Rollout

- Remove the two manifest lines from `.gitignore` in the onboarding template and all active workpieces.
- Run `image.variants.generate` and `video.variants.generate` in each workpiece to produce the manifest, then commit it.
- Existing workpieces with tracked `content-ref-index.generated.yaml` are unaffected.
- No migration script needed — the manifest is generated on the next `build.prepare` run.

## Alternatives considered

- **Keep manifests gitignored, rely on `image.variants.validate` only.** Rejected: the validator runs in `build.check`, not `build.prepare.dev`. A dev materialize that skips the full build pipeline has no drift signal until the operator runs `build.check` — too late for review.

- **Commit binary variants too.** Rejected: `public/_img/**` and `public/_video/**` are large binary files that would bloat the git history and LFS. They are regenerated deterministically from the manifest + source hashes, so committing them adds no drift detection value.

- **Make `image.variants.generate` run in `build.prepare.dev`.** Rejected: the dev pipeline is optimized for speed; running sharp on every dev materialize is wasteful. Committing the manifest is the cheaper fix — it ensures the manifest exists without paying the generation cost on every dev cycle.

## Risks

- **Merge conflicts on manifest files:** Two missions changing different source images could produce conflicting manifest edits. Mitigated by YAML key ordering (content-relative paths are stable) and the fact that `image.variants.generate` is idempotent — re-running after merge resolves any conflict.

- **Stale committed manifest:** An operator changes a source image but forgets to run the generator. The committed manifest is now stale. Mitigated by `image.variants.validate` (stale-manifest rule) and the git diff itself — the stale manifest is visible in review, unlike the current invisible-stale state.

- **Larger git diffs:** The manifest is ~21KB for 31 source images. This is comparable to other generated artifacts we already commit. Acceptable trade-off for drift visibility.

## Acceptance criteria

- [ ] `src/image-variants.generated.yaml` removed from workpiece `.gitignore`
- [ ] `src/video-manifest.generated.yaml` removed from workpiece `.gitignore`
- [ ] `public/_img/` and `public/_video/` remain in workpiece `.gitignore`
- [ ] Onboarding `.gitignore` template updated
- [ ] RFC-0204 `amendedBy` includes RFC-0834
- [ ] RFC-0210 `amendedBy` includes RFC-0834
- [ ] `docs/policies/content-contracts.md` updated
- [ ] `rfc.validate` passes

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MUST NOT commit binary derived artifacts (`public/_img/**`, `public/_video/**`) — only the manifest files.
- Agents SHOULD run `image.variants.generate` / `video.variants.generate` and commit the resulting manifest alongside source asset changes.
- Agents MUST NOT hand-edit the manifest — it carries the `GENERATED` marker and is owned by the generator command.
- The `sourceHash` field in each manifest entry is the drift-detection key: a changed source produces a different hash, which `image.variants.validate` detects and which is visible in the git diff.
