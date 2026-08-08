---
rfcId: RFC-0763
auditId: AUDIT-RFC-0763-02
date: 2026-08-08
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0763 (reworked)

## Verdict: Needs revision

The reworked RFC-0763 identifies a real gap — RFC-0749's post-validation cleanup only runs on the success path, leaving bordbuch projections uncommitted on failure paths. The fix is minimal and architecturally sound. However, several findings need revision before implementation: the `amends` relationship with archived RFC-0749 is mechanically problematic, the `kind` should be `command` not `architecture`, and the `bordbuch.commit` self-failure scenario should be acknowledged.

## Mechanical validation (rfc.validate)

**Pass** with 1 warning:

- **V-19**: `RFC-0763.amends includes RFC-0749, but RFC-0749.amendedBy does not include RFC-0763`. RFC-0749 is archived/implemented — its `amendedBy` field cannot be retroactively updated without a new commit to the archived RFC. Consider removing `amends: [RFC-0749]` and using `related` instead, since this RFC extends the pattern rather than changing RFC-0749's contract.

## Axis A — Structural completeness

- **F-A1 (WARN)**: `kind: architecture` — this RFC changes a specific command (`mission.validate`) with a targeted code addition (two `commitBordbuchProjections` calls on failure paths). It does not establish a new architectural pattern or DNA invariant. `kind: command` is more accurate, consistent with RFC-0749 (which is `kind: command`).
- **F-A2 (PASS)**: Decision is clear and present tense. TypeScript contracts are minimal. File system responsibilities name concrete paths. Failure modes specify exit codes. Acceptance criteria are checkable.

## Axis B — DNA alignment

- **F-B1 (PASS)**: `satisfies: [DNA-46]` — the RFC explains how it ensures the cache clone is clean for `mission.reconcile` regardless of validation outcome, which supports DNA-46 (Mission lifecycle).
- **F-B2 (PASS)**: `related` includes RFC-0702, RFC-0724, RFC-0749 — all directly relevant.

## Axis C — Ecosystem fit

- **F-C1 (FAIL)**: `amends: [RFC-0749]` — RFC-0749 is `implemented` and archived. The V-19 warning indicates the `amendedBy` backreference cannot be set. This RFC does not change RFC-0749's contract — it extends the same pattern to failure paths. Consider removing `amends` and keeping only `related`, or changing `amends` to `related` if the backreference cannot be resolved.
- **F-C2 (PASS)**: `packagesImpacted` lists `@warpgogol/site-kernel-handoff` — correct package.
- **F-C3 (PASS)**: `commands.changed: [mission.validate]` — correct, the only changed command.

## Axis D — Forward-only compliance

No issues. The RFC is additive — it adds cleanup calls on failure paths without changing existing behavior on the success path.

## Axis E — Agent-facing policy

- **F-E1 (PASS)**: No self-authorizing language. Status is `draft`, implementation notes correctly reference RFC-0224 preconditions.
- **F-E2 (PASS)**: No NEEDS CLARIFICATION markers.
- **F-E3 (PASS)**: Implementation notes are explicit behavioral rules.

## Axis F — Pragmatism

- **F-F1 (PASS)**: The RFC proposes two targeted `commitBordbuchProjections` calls — minimal change, no new types, no new commands. Uses existing helper.
- **F-F2 (PASS)**: Alternatives section evaluates real alternatives with valid rejection reasons.

## Axis G — Blind spots

- **F-G1 (WARN)**: The RFC does not consider the case where `build.prepare` fails at `bordbuch.commit` itself (step 137). If `bordbuch.commit` is the failing step, `commitBordbuchProjections` has already run and returned an error result (non-throwing). The cleanup call on the failure path would call `commitBordbuchProjections` again — which would find the same dirty files and fail again. This is harmless (non-fatal, `logger.warn`) but the RFC should acknowledge this scenario in the Failure modes section.
- **F-G2 (PASS)**: Performance impact is negligible — `commitBordbuchProjections` runs `git status --porcelain` (fast) and only commits if bordbuch files are dirty.

## Questions for the author

1. **Should `amends` be changed to `related`?** RFC-0749 is archived/implemented — the V-19 warning indicates the `amendedBy` backreference cannot be set. This RFC extends the pattern rather than changing RFC-0749's contract.
2. **Should `kind` be `command` instead of `architecture`?** The RFC makes a targeted code change to `mission.validate` — no new architectural pattern or DNA invariant.
3. **What happens when `bordbuch.commit` is the failing step in `build.prepare`?** The cleanup call would re-run `commitBordbuchProjections` and fail again. This is harmless but should be acknowledged in the Failure modes section.
