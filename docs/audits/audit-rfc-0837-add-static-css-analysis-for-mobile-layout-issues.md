---
rfcId: RFC-0837
auditId: AUDIT-RFC-0837-01
date: 2026-08-14
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0837

## Verdict: Needs revision

RFC-0837 structurally sound and aligns well with existing validator patterns (`css.important.lint`). However, it contains a factual error about pipeline placement (`SITES_BUILD_PREPARE_DEV_PIPELINE` has no `css.important.lint` step), an impractical static detection rule (MOBILE-CSS-06), and minor gaps in Compass/AGENTS.md sync identification.

## Mechanical validation (rfc.validate)

Pass — `rfc.validate --id RFC-0837 --json` reports zero violations.

## Axis A — Structural completeness

No issues. All required sections are present with real content:
- Decision is a single present-tense statement.
- CLI surface shows exact invocations with flags.
- TypeScript contracts are minimal type signatures.
- File system responsibilities table names concrete paths.
- Output format documents the `--json` shape.
- Failure modes specify exit codes and warn-vs-fail behavior.
- Rollout describes warning → error transition with a clear hardening trigger.
- Alternatives considered lists 3 real alternatives with rejection reasons.
- Risks includes false-positive rate and `@media` context handling.
- Acceptance criteria are checkable and cover the decision's scope.
- Implementation notes are explicit behavioral rules.

## Axis B — DNA alignment

No issues. `satisfies: [DNA-68]` — DNA-68 does not yet exist in `docs/architecture-dna.md` (last entry is DNA-67). The RFC body explicitly says "Establishes DNA-68 (Mobile Layout CSS Best Practices)" and acceptance criterion requires appending the entry. This is the correct pattern for a new invariant. `related: [DNA-10, DNA-67, RFC-0838, RFC-0839]` — all exist and are semantically relevant (DNA-10 = no hardcoded tokens, DNA-67 = Lighthouse parity gate, RFC-0838/0839 = companion layers).

## Axis C — Ecosystem fit

**Finding C-1 (error):** The RFC states the validator will be "Integrated into `SITES_BUILD_PREPARE_DEV_PIPELINE` after `css.important.lint`" (acceptance criterion 5, rollout §4). However, `SITES_BUILD_PREPARE_DEV_PIPELINE` in `packages/werkstatt-site/src/checks/pipelines/build-prepare.ts:181-241` does NOT contain `css.important.lint` or any CSS lint step — it is a codegen-only pipeline (`config.regenerate`, `kernel.wire`, `routes.generate`, etc.). The `css.important.lint` command only exists in `SITES_CHECK_AUTHOR_PIPELINE` (`sites-check-author.ts:328`). The RFC's claim is factually incorrect and the acceptance criterion cannot be satisfied as written. Either remove the `SITES_BUILD_PREPARE_DEV_PIPELINE` integration or specify the correct insertion point (e.g., after `styles.global.generate`).

**Finding C-2 (minor):** The RFC does not identify which `docs/*.xml` Compass documents need synchronization. Since the RFC adds a new validator to the author pipeline, `docs/verification-plan.xml` may need updating to list the new check. The RFC should identify affected Compass documents per root AGENTS.md Compass document duties.

**Finding C-3 (minor):** The RFC does not specify which `AGENTS.md` files need updates. `packages/werkstatt-site/AGENTS.md` has a "Check commands" section that lists notable validators — `css.mobile-layout.lint` should be documented there. Acceptance criterion 7 says "AGENTS.md updated where agent behavior rules changed" but doesn't identify the file.

## Axis D — Forward-only compliance

No issues. The warning → error rollout is a time-bounded migration strategy, not a backward compatibility layer. No shims, no dual-paths, no legacy code maintained behind a flag. The warning mode has a clear hardening trigger ("After all active sites have zero violations").

## Axis E — Agent-facing policy

No issues. The status gate is correct ("Agents MAY implement code changes ONLY when this RFC has status: accepted"). Implementation notes reference RFC-0224 (accepted→implemented transition) and supersede escalation. No self-authorizing language. No NEEDS CLARIFICATION markers found. No storage or persistence concerns.

## Axis F — Pragmatism

No issues. One new command (`css.mobile-layout.lint`) is justified — it checks different patterns than `css.important.lint` and cannot be a flag on that command. TypeScript contracts are minimal. The RFC explicitly follows the existing `css.important.lint` pattern. `packagesImpacted` lists only the package that will own the validator. `nonGoals` are meaningful (excludes dynamic checks, visual regression, CSS modifications, post-deploy monitoring).

## Axis G — Blind spots

**Finding G-1 (error):** MOBILE-CSS-06 ("Container with `white-space: nowrap` or long-text content without `overflow-wrap` or `word-break`") is impractical as a static CSS check. A CSS file linter cannot detect "long-text content" — that requires analyzing the actual rendered text content (DOM + text), which is a dynamic check, not a static CSS pattern. The `white-space: nowrap` part is detectable, but the "long-text content" part is not. This rule should either be removed (deferred to RFC-0838 Playwright geometric checks) or narrowed to only detect `white-space: nowrap` without `overflow-wrap`/`word-break` in the same rule.

**Finding G-2 (minor):** The RFC does not consider concurrent execution (two builds running simultaneously scanning the same CSS files). This is low-risk for a read-only linter but should be acknowledged.

**Finding G-3 (minor):** The RFC says the validator "must respect `@media` context — `100vh` inside `@media (min-width: 1024px)` is not a violation" (Risks §1). This is a non-trivial parsing requirement for a regex-based linter. The RFC should briefly describe how `@media` context tracking will be implemented (e.g., tracking `@media` block depth during line-by-line scanning) to confirm feasibility.

## Questions for the author

1. Why is `css.mobile-layout.lint` added to `SITES_BUILD_PREPARE_DEV_PIPELINE` when that pipeline has no CSS lint steps? Should it only be in `SITES_CHECK_AUTHOR_PIPELINE`, or should the dev pipeline gain CSS lint steps as a separate concern?
2. How will MOBILE-CSS-06 detect "long-text content" in a static CSS scan? Should this rule be narrowed to `white-space: nowrap` only, or deferred to RFC-0838?
3. How will `@media` context be tracked in a regex-based linter to suppress MOBILE-CSS-01 false positives for desktop-only `100vh` declarations?
