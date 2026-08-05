---
rfcId: RFC-0698
auditId: AUDIT-RFC-0698-01
date: 2026-08-05
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0698

## Verdict: Needs revision

The RFC is structurally complete and well-aligned with DNA-46 and DNA-51, but contains a significant inconsistency between its claimed pattern (RFC-0644's `commitWorkpieceIfDirty`) and its actual proposed mechanism (`mission.git.commit` via `executeKernelCommand`). The two approaches differ in PASSPORT signing, pre-commit validation, and `--no-verify` behavior. The "same pattern" claim in Architectural fit is misleading and must be corrected.

## Mechanical validation (rfc.validate)

Pass with 1 warning:

- **V-19 (warning)**: `RFC-0698.amends` includes `RFC-0628`, but `RFC-0628.amendedBy` does not include `RFC-0698`. Must add `RFC-0698` to RFC-0628's `amendedBy` array during implementation.

## Axis A — Structural completeness

No issues. All required sections contain real content. Decision is in present tense. CLI surface shows exact command. TypeScript contracts are minimal. Failure modes table covers 6 scenarios with exit codes. Rollout describes default behavior. Alternatives section has 5 real alternatives with rejection reasons. Risks include agent confusion (risk #3). Acceptance criteria are checkable. Implementation notes are explicit behavioral rules.

## Axis B — DNA alignment

No issues. `satisfies: [DNA-46, DNA-51]` — both are real DNA invariants in `docs/architecture-dna.md`. The RFC body explains how auto-commit ensures clean workpiece state (DNA-46) and extends the auto-commit pattern from RFC-0580/RFC-0626 to cover the workpiece after dev-deploy builds (DNA-51). No conflicts with existing DNA invariants.

## Axis C — Ecosystem fit

**Finding C1 — "Same pattern" claim is incorrect.** The "Architectural fit" section states: "RFC-0644 — established the `commitWorkpieceIfDirty` pattern for `mission.reconcile`. This RFC applies the same pattern to `leitstand.dev-deploy`." However, the RFC proposes using `mission.git.commit` via `executeKernelCommand`, which is a **different mechanism** than `commitWorkpieceIfDirty`. The existing `commitWorkpieceIfDirty` (`packages/os/site-kernel-handoff/src/mission/mission-git-commit.ts:286-315`) uses direct `execSync("git add -A")` + `execSync("git commit --no-verify")` — no PASSPORT signing, no pre-commit validation, bypasses hooks with `--no-verify`. The RFC's proposed `mission.git.commit` via `executeKernelCommand` includes PASSPORT signing (RFC-0560), pre-commit content validation (RFC-0594), and does **not** use `--no-verify`. The RFC is internally consistent (alternative 3 explicitly rejects the direct approach citing PASSPORT signing), but the "same pattern" claim is misleading. The Architectural fit section must either:
- (a) Use `commitWorkpieceIfDirty` directly (matching RFC-0644's actual pattern), or
- (b) Explicitly state that this RFC intentionally diverges from RFC-0644's pattern by using `mission.git.commit` for PASSPORT signing and pre-commit validation, and explain why the divergence is justified.

**Finding C2 — V-19 bidirectional reference.** `amends: [RFC-0628]` is declared but RFC-0628's `amendedBy` array doesn't include RFC-0698. This must be fixed during implementation by adding `RFC-0698` to RFC-0628's `amendedBy` frontmatter field.

## Axis D — Forward-only compliance

No issues. The RFC amends RFC-0628 directly — no dual paths, no compatibility shims, no grace period. Auto-commit is always on with no opt-out flag.

## Axis E — Agent-facing policy

No issues. No self-authorizing language. Implementation notes reference correct governance rules (RFC-0224 transition, RFC-0334 supersede escalation). Status gate is respected — "Agents MAY implement code changes ONLY when this RFC has status: accepted."

## Axis F — Pragmatism

**Finding F1 — Heavier mechanism than necessary.** The RFC proposes `mission.git.commit` via `executeKernelCommand` which runs `runPreCommitValidation` (RFC-0594) — scanning changed file paths and potentially running validators. For generated files (`.generated.yaml`, `THIRD_PARTY_NOTICES.txt`, `sbom.cdx.json`, etc.), no validator prefixes match (`src/content/business-profile/`, `src/content/pages/`, `src/content/faq/`), so no validators actually run. This is fast but adds unnecessary overhead (file path scanning, kernel command dispatch) compared to `commitWorkpieceIfDirty` which is a direct function call. If the RFC's goal is consistency with RFC-0644, using `commitWorkpieceIfDirty` directly would be simpler and truly consistent. If the goal is PASSPORT signing, the RFC should explicitly state that it's intentionally diverging from RFC-0644 and explain why PASSPORT signing matters for auto-committed generated artifacts (which are deterministic and not operator-authored).

## Axis G — Blind spots

**Finding G1 — Cache invalidation cost not quantified.** Risk #4 mentions that auto-commit invalidates the build-skip cache (RFC-0653), causing a cache miss on the next dev-deploy. But the RFC doesn't quantify the cost: after an auto-commit, the next dev-deploy will always rebuild (cache miss due to changed `commitSha`), even if no source changes occurred. The rebuild produces identical generated files (deterministic), so no new auto-commit is created, and the cache is then written with the new `commitSha`. The penalty is **one extra rebuild per auto-commit event**. This should be stated explicitly in Risk #4.

**Finding G2 — Pre-commit validation behavior not documented.** The RFC doesn't mention that `mission.git.commit` runs `runPreCommitValidation` (RFC-0594) based on changed file paths. While generated files don't match any validator prefix (so no validators run), this is an implementation detail that agents implementing the RFC need to know — they should not be surprised by the pre-commit validation step or attempt to bypass it.

## Questions for the author

1. Should the RFC use `commitWorkpieceIfDirty` directly (truly matching RFC-0644's pattern, with `--no-verify` and no PASSPORT signing), or `mission.git.commit` via `executeKernelCommand` (PASSPORT signing, pre-commit validation, no `--no-verify`)? The current draft sends mixed signals — "same pattern as RFC-0644" in Architectural fit, but `mission.git.commit` in TypeScript contracts and implementation notes. Pick one and align all sections.

2. If `mission.git.commit` is chosen: why is PASSPORT signing important for auto-committed generated artifacts? These files are deterministic outputs of the build pipeline, not operator-authored content. The signing overhead (Ed25519 key operations) adds latency to every dev-deploy.

3. Should the build-skip cache (RFC-0653) be written **after** the auto-commit with the post-commit `commitSha`, rather than before the auto-commit with the pre-build `commitSha`? This would prevent the cache invalidation described in Risk #4 and avoid the extra rebuild on the next dev-deploy.
