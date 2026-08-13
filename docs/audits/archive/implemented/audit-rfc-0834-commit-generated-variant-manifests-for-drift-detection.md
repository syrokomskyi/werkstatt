---
rfcId: RFC-0834
auditId: AUDIT-RFC-0834-01
date: 2026-08-13
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0834

## Verdict: Needs revision

The RFC is well-motivated and the core decision (commit manifests, keep binaries gitignored) is sound. However, it contains two factual errors about existing code behavior (stale-manifest rule and GENERATED marker), and the onboarding template + policy doc + amended RFCs were already modified while the RFC is still in `draft` status — a status gate violation.

## Mechanical validation (rfc.validate)

Pass — `rfc.validate --id RFC-0834` reports zero violations.

## Axis A — Structural completeness

- **Factual error: stale-manifest rule does not exist.** Line 87 claims "A committed manifest with a stale hash is detected by `image.variants.validate` (stale-manifest rule) and is also visible as a git diff — two layers of drift detection instead of one." The actual validator at `@/home/syrokomskyi/projects/warpgogol/werkstatt/packages/werkstatt-site/src/checks/image-variants.ts:240-314` only checks that variant files exist on disk — it does NOT compare `entry.sourceHash` to the current source file hash. There is no stale-manifest rule in the implementation. RFC-0204 specified one in its output format example, but it was never implemented. The same applies to `video.variants.validate` (`video-variants.ts:714-782`) — only missing-file checks, no sourceHash comparison. The RFC's "two layers of drift detection" claim is inaccurate; there is only one layer (the git diff), plus the generator's sourceHash-based reuse skip which is not a validator.

- **Factual error: GENERATED marker not written by generators.** Line 42 says "Do not remove the GENERATED marker from manifest files — they are still generated artifacts that agents must not hand-edit." Line 84 says "The manifest carries the `GENERATED` marker." But `image.variants.generate` writes the manifest via `yamlStringify(manifest) + "\n"` at `image-variants.ts:216-217` — no GENERATED header is added. `video.variants.generate` does the same at `video-variants.ts:700`. The loader (`generated-manifest-loader.ts:37`) strips a leading `#` comment if present, but the generators don't emit one. The manifest files currently have no GENERATED marker. The RFC's nonGoal about preserving the marker is moot unless the generators are also modified to emit one — which the RFC explicitly says it does not do ("No code changes").

- **Acceptance criteria are checkable but one is redundant.** "RFC-0204 `amendedBy` includes RFC-0834" and "RFC-0210 `amendedBy` includes RFC-0834" are already satisfied (see Axis E). The `rfc.validate` criterion is trivially met. The criterion "Onboarding `.gitignore` template updated" is also already satisfied.

## Axis B — DNA alignment

No issues. `satisfies: []` is correct for a `kind: policy` RFC. The RFC amends RFC-0204 and RFC-0210 directly (changing their gitignore policy), which is the correct mechanism — it does not supersede them.

## Axis C — Ecosystem fit

- **`packagesImpacted` is correct but incomplete scope description.** The RFC lists `@warpgogol/werkstatt-site` — correct because the onboarding template lives in `packages/werkstatt-site/src/onboarding/templates/runtime/gitignore.template`. But the RFC also modifies `docs/policies/content-contracts.md` and two archived RFC files — these are docs-scope changes not reflected in `packagesImpacted`. This is acceptable since `scope: workspace` covers docs, but the rollout section should mention all three surfaces (template, policy doc, archived RFCs).

- **Compass sync:** The RFC does not identify which `docs/*.xml` files need synchronization. Since it changes the generated-file governance policy (manifests are now committed), `docs/policies/generated-file-governance.md` may also need updating — the RFC does not mention it.

## Axis D — Forward-only compliance

No issues. The RFC amends RFC-0204/0210 directly — no compatibility shim, no dual-path. The old `.gitignore` lines are removed, not kept behind a flag.

## Axis E — Agent-facing policy

- **Status gate violation: premature implementation.** The RFC is in `status: draft`, but the following changes were already applied to the codebase:
  - `@/home/syrokomskyi/projects/warpgogol/werkstatt/packages/werkstatt-site/src/onboarding/templates/runtime/gitignore.template:32-38` — manifest lines removed, RFC-0834 comments added
  - `@/home/syrokomskyi/projects/warpgogol/werkstatt/docs/policies/content-contracts.md:110,119,123` — policy doc updated with RFC-0834 references and new commit policy
  - `@/home/syrokomskyi/projects/warpgogol/werkstatt/docs/rfcs/archive/implemented/rfc-0204-*.md:20` — `amendedBy` includes `RFC-0834`
  - `@/home/syrokomskyi/projects/warpgogol/werkstatt/docs/rfcs/archive/implemented/rfc-0210-*.md:25` — `amendedBy` includes `RFC-0834`

  The RFC's own implementation notes (line 159) say "Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented)." These premature changes violate the status gate. They should either be reverted until the RFC is accepted, or the RFC should be fast-tracked to `accepted` status before the pipeline proceeds.

- **No NEEDS CLARIFICATION markers.** No unresolved markers found.

## Axis F — Pragmatism

No issues. The RFC is minimal — no new commands, no code changes, only `.gitignore` policy. The alternatives section is honest and rejects three real alternatives with clear reasons. `nonGoals` are explicit and meaningful.

## Axis G — Blind spots

- **No regression test proposed.** The RFC does not propose a test verifying that the manifest is tracked after the `.gitignore` change (e.g. `git check-ignore src/image-variants.generated.yaml` returns false). Without a test, a future agent could re-add the manifest to `.gitignore` without detection.

- **`docs/policies/generated-file-governance.md` not mentioned.** The RFC updates `docs/policies/content-contracts.md` but does not mention `docs/policies/generated-file-governance.md`, which may also reference the gitignore policy for generated manifests. If that doc mentions the variant manifests as gitignored, it would become stale.

- **Merge conflict on `byBasename` map.** The Risks section mentions YAML key ordering for `byOrigin` (content-relative paths are stable), but does not consider the `byBasename` map — two missions adding images with the same bare basename in different content paths would produce a conflict on the same `byBasename` key. This is an edge case but should be noted.

## Questions for the author

1. The `image.variants.validate` and `video.variants.validate` validators do NOT implement a stale-manifest (sourceHash comparison) rule — they only check for missing variant files. Should the RFC (a) correct the claim about "two layers of drift detection" to reflect that only the git diff provides drift detection, or (b) propose implementing the stale-manifest rule as part of this RFC?

2. The generators do not emit a GENERATED marker in the manifest files. Should the RFC (a) remove the nonGoal about preserving the marker since there is none, or (b) propose adding a GENERATED header to the generators as part of this RFC?

3. The onboarding template, policy doc, and amended RFCs were already modified while this RFC is in `draft` status. Should these changes be reverted until the RFC is accepted, or should the RFC be transitioned to `accepted` to legitimize the already-applied changes?
