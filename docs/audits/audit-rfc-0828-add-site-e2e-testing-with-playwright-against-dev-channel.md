---
rfcId: RFC-0828
auditId: AUDIT-RFC-0828-01
date: 2026-08-13
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0828

## Verdict: Needs revision

RFC-0828 is structurally sound and well-aligned with DNA-66's L4 layer. However, it has gaps in ecosystem fit (missing Compass/AGENTS.md sync, unstated dependency on RFC-0823 helpers), pragmatism (inconsistency between file structure and acceptance criteria), and blind spots (test side-effects, URL resolution mechanism). These are fixable in enhance without fundamental redesign.

## Mechanical validation (rfc.validate)

Pass — zero violations.

## Axis A — Structural completeness

No issues. All required sections contain real content. Decision is present tense. CLI surface, TypeScript contracts, file system responsibilities, output format, failure modes, rollout, alternatives, risks, and acceptance criteria are all concrete and checkable.

## Axis B — DNA alignment

No issues. `satisfies: [DNA-66]` correctly references the testing pyramid invariant established by RFC-0823. The RFC body explicitly states "This RFC implements the L4 layer." `related` entries (DNA-66, RFC-0813, RFC-0823, RFC-0825) are all relevant and non-decorative.

## Axis C — Ecosystem fit

**C-1: Pipeline integration depends on unimplemented RFC-0825.** The RFC states `leitstand.dev-deploy` calls `site.e2e.run` "after Axiom checks and smoke tests pass" (line 209), but `site.smoke.run` (RFC-0825) is still draft and not yet integrated into `leitstand-commands.ts`. The RFC should specify the exact insertion point in the current pipeline (after Axiom / `mission.check`) and note that smoke test integration is a prerequisite that will be added by RFC-0825.

**C-2: Missing Compass sync mention.** Adding a new command (`site.e2e.run`) and testing infrastructure may require updating `docs/verification-plan.xml` or `docs/development-plan.xml`. The RFC does not address which Compass documents need synchronization.

**C-3: Missing AGENTS.md update mention.** A new testing layer and command should be documented in `packages/werkstatt-site/AGENTS.md` or root `AGENTS.md`. The RFC's file system responsibilities table does not list any AGENTS.md files.

**C-4: Implicit dependency on RFC-0823 helpers.** The E2E test pattern imports `resolveDevUrl` from `../helpers/dev-url-resolver.ts` (line 112), and the file system responsibilities table lists `packages/werkstatt-site/src/testing/helpers/dev-url-resolver.ts` (line 204). But this helper is created by RFC-0823, which is still draft. The RFC should explicitly state in `dependsOn` or design that `dev-url-resolver.ts` must exist (from RFC-0823 implementation) before E2E tests can use it.

## Axis D — Forward-only compliance

No issues. No compatibility shims, no dual-paths, no legacy code paths maintained behind flags.

## Axis E — Agent-facing policy

**E-1: Incomplete governance references.** The implementation notes reference RFC-0224 for the accepted→implemented transition but do not mention RFC-0476 (which mandates `rfc.implement.stamp` command, not manual frontmatter edits) or V-25/V-26/V-27 validation rules (reviewers required, all acceptance criteria checked with `(evidence: ...)` annotations). Other RFCs in the batch have the same gap.

No NEEDS CLARIFICATION markers found. No self-authorizing language. Storage policy is clean (no cookies, no server-side persistence).

## Axis F — Pragmatism

**F-1: File structure lists 6 test files, acceptance criteria require only 4.** The E2E test file structure (lines 96–105) lists `language-switch.test.ts` and `currency-selector.test.ts`, but these are not in the acceptance criteria (lines 285–294). The rollout section (line 266) says "Additional tests: Add E2E tests for language switching, currency selector, and other interactive features incrementally." This is contradictory — the file structure implies they'll be created as part of this RFC, but the acceptance criteria don't require them. Either add them to acceptance criteria or remove them from the file structure listing (keeping them only in the rollout section as future work).

## Axis G — Blind spots

**G-1: URL resolution mechanism unspecified.** The TypeScript contract says `url?: string — override URL (default: resolve from dev-deploy state)` (line 176) but doesn't specify which file or field holds the dev-deploy URL. The `leitstand.dev-deploy` result has a `devUrl` field — is that what's used? Or does it read from `releases/<site-id>/<release-id>/` state? The RFC should specify the resolution path.

**G-2: Contact form test side-effects.** The `contact-form.test.ts` pattern (lines 119–132) submits a real form with `E2E Test` / `e2e-test@example.com`. This triggers a real QStash message, which triggers a real delivery to the operator's Telegram/Supabase. The RFC does not address test data isolation. RFC-0825's smoke test uses `formId: smoke-test` for recognition and discard (line 148 of RFC-0825). The E2E test should follow the same pattern — use a recognizable test `formId` or test email that the integration handler can discard.

**G-3: Concurrent execution not addressed.** If two operators run `leitstand.dev-deploy` simultaneously, E2E tests run against the same dev site. The contact form test mutates state (submits a form). This is unlikely in practice but should be acknowledged.

## Questions for the author

1. What is the exact URL resolution mechanism when `--url` is not provided? Which file/field does `site.e2e.run` read to find the dev-deployed site URL?
2. How will the contact form E2E test avoid creating real QStash messages and Telegram notifications? Will it use a test-specific `formId` (like RFC-0825's `smoke-test`) that the integration handler recognizes and discards?
3. Should `language-switch.test.ts` and `currency-selector.test.ts` be in the acceptance criteria (implying they're part of this RFC's implementation) or only in the rollout section as future work?
