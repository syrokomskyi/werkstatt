---
rfcId: RFC-0646
auditId: AUDIT-RFC-0646-01
date: 2026-08-02
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0646

## Verdict: Needs revision

The RFC is well-structured and addresses a real operational gap, but has findings on axes B, C, F, and G. The most significant are the blind spots around un-retried `git status` and `git rev-parse HEAD` calls (Axis G) and the redundant `RetryOptions.retries` field (Axis F). The DNA-51 alignment argument is also looser than it should be (Axis B).

## Mechanical validation (rfc.validate)

Pass — `rfc.validate --id RFC-0646 --json` exits 0 with zero violations.

## Axis A — Structural completeness

No issues. All required sections are present with real content. Decision is in present tense. CLI surface correctly states no new commands. TypeScript contracts are minimal signatures. File system responsibilities table names concrete paths. Failure modes table specifies exit codes and retry/fail behavior. Rollout covers default behavior, existing apps, new apps, and pipeline integration. Alternatives considered has 4 real alternatives with rejection reasons. Risks include agent misinterpretation risk. Acceptance criteria are checkable and sufficient. Implementation notes are explicit behavioral rules.

## Axis B — DNA alignment

**Finding B1.** `satisfies: [DNA-51]` — DNA-51 defines "Werkstatt consistency primitives" as "shared lock, idempotency, and atomic staging primitives." Retry resilience is not explicitly listed as a consistency primitive in DNA-51's definition. The RFC body (line 101) says it "Extends the auto-commit pattern established by RFC-0580 and RFC-0626 with retry resilience, closing the transient-failure gap in git hygiene for mission workflow." This is a valid connection, but the argument is indirect — retry is framed as closing a gap rather than extending a primitive. The RFC should explicitly argue how retry complements the existing lock/idempotency/atomic-staging primitives to form a more complete consistency guarantee (e.g., "retry is the resilience dimension that complements lock-based mutual exclusion and atomic staging — locks prevent concurrent mutation, retry recovers from transient mutation failure").

## Axis C — Ecosystem fit

**Finding C1.** The RFC does not mention whether `packages/os/site-kernel-handoff/AGENTS.md` needs updating. The AGENTS.md has a Bordbuch section that documents the bordbuch command family. The RFC should flag that the AGENTS.md may need a note about `bordbuch.commit`'s retry behavior (e.g., "bordbuch.commit retries transient git failures with 2 retries at 12s/60s backoff before failing the pipeline step").

## Axis D — Forward-only compliance

No issues. No compatibility shim, no dual-path, no legacy code maintained behind a flag. The RFC amends RFC-0626's behavior directly — `bordbuch.commit` uses `gitExecWithRetry` instead of bare `gitExec`.

## Axis E — Agent-facing policy

No issues. Status gate is correct — implementation notes say "Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented)." Implementation notes reference RFC-0224 (accepted→implemented transition) and RFC-0334 (supersede escalation). No content authoring, no storage policy changes.

## Axis F — Pragmatism

**Finding F1.** `RetryOptions.retries` is redundant with `backoffMs.length`. In the RFC's own example, `retries: 2` and `backoffMs: [12_000, 60_000]` — the retries count always equals the backoff array length. If they disagree, the behavior is undefined. The interface should either drop `retries` and derive it from `backoffMs.length`, or the RFC should specify validation (e.g., "if `retries !== backoffMs.length`, the function throws a configuration error").

## Axis G — Blind spots

**Finding G1.** `commitBordbuchProjections` (`bordbuch-commit.ts:52,71,73,75`) calls `gitExec` four times: `git status --porcelain` (line 52, with `allowNonZero`), `git add` (line 71), `git commit` (line 73), and `git rev-parse HEAD` (line 75). The RFC only replaces `git add` and `git commit` with `gitExecWithRetry`. The RFC should explain why `git status` and `git rev-parse HEAD` don't need retry:

- `git status --porcelain` uses `allowNonZero: true` — a transient failure returns empty string, causing the function to silently return `committed: false`. Dirty bordbuch files remain uncommitted and are later caught by `mission.validate`'s dirty-cache-clone check. The RFC should acknowledge this silent-skip behavior and explain why it's acceptable (or whether `git status` should also be retried).

- `git rev-parse HEAD` runs after a successful commit. If it fails transiently, the function throws, the pipeline step fails, but the commit already succeeded. On pipeline retry, `git status` shows no dirty files → function returns `committed: false` — the commit succeeded but the result reports no commit. The RFC should acknowledge this edge case and either apply `gitExecWithRetry` to `rev-parse HEAD` or explain why it's acceptable.

## Questions for the author

1. Should `git status --porcelain` also use `gitExecWithRetry`? If it fails transiently, `bordbuch.commit` silently returns `committed: false`, leaving dirty bordbuch files uncommitted. Is this acceptable, or should the status check also be retried?
2. What happens if `git rev-parse HEAD` fails transiently after a successful commit? The commit is already done, but the function throws. On pipeline retry, the status check shows no dirty files, so the function returns `committed: false` — the commit succeeded but the result reports no commit. Should `gitExecWithRetry` be applied to `rev-parse HEAD` as well, or should the function handle this edge case (e.g., catch the error and return `committed: true` with `commitSha: null`)?
3. `RetryOptions.retries` is redundant with `backoffMs.length`. Should the interface drop `retries` and derive it from `backoffMs.length`, or should the RFC specify validation when they disagree?
