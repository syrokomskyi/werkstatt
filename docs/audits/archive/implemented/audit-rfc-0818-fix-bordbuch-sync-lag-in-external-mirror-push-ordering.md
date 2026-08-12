---
rfcId: RFC-0818
auditId: AUDIT-RFC-0818-01
date: 2026-08-12
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0818

## Verdict: Needs revision

The RFC correctly identifies a real ordering bug in `sternsystem.sync` and proposes a minimal, well-scoped fix. Three minor findings: two missing template sections (CLI surface, Output format) and one misleading failure-mode description about bordbuch commit failure behavior.

## Mechanical validation (rfc.validate)

Pass — `rfc.validate --id RFC-0818` exits with 0 errors, 0 warnings.

## Axis A — Structural completeness

- **A-1: CLI surface section missing.** The RFC changes `sternsystem.sync` but does not show the command invocation. Even though no new flags are added, the template asks for exact command invocations. Add a brief `pnpm exec werkstatt run sternsystem.sync --id <system-id>` reference for discoverability.
- **A-2: Output format section missing.** The `SternsystemSyncData` interface is unchanged, but the RFC should explicitly state that the output shape is unchanged (no new fields, no removed fields) so downstream consumers know they are not affected.

## Axis B — DNA alignment

No issues. `satisfies: []` is correct for `kind: policy`. The RFC does not claim a new DNA invariant. `related[]` references (RFC-0574, RFC-0705, RFC-0762, RFC-0797) are all relevant and accurately described. `amends` targets (RFC-0472, RFC-0477) are correct — the RFC changes the protocol established by those RFCs.

## Axis C — Ecosystem fit

No issues. `packages/werkstatt` is the correct package — `sternsystem-sync.ts` lives at `packages/werkstatt/src/sternsystem/sternsystem-sync.ts`. No new pipeline integration is needed — `sternsystem.sync` is already called by `mission.reconcile` (RFC-0705) and `mission.close` (RFC-0762, RFC-0797). No AGENTS.md update is required — the root AGENTS.md describes the sync protocol at a high level and does not specify operation ordering.

## Axis D — Forward-only compliance

No issues. The fix directly changes the existing operation ordering — no compatibility shim, no dual-path, no legacy code path maintained.

## Axis E — Agent-facing policy

No issues. No self-authorizing language. Implementation notes reference correct governance rules (RFC-0224, `rfc.implement.stamp`, `rfc.supersede.propose`). No NEEDS CLARIFICATION markers.

## Axis F — Pragmatism

No issues. No new commands, no new types, no new flags. The fix is a pure reordering of existing operations in a single file. `packagesImpacted` lists only `packages/werkstatt`, which is accurate. `nonGoals` are explicit and meaningful.

## Axis G — Blind spots

- **G-1: Failure modes — bordbuch commit failure description is misleading.** The RFC says: "Bordbuch commit fails: ... `refs/mirror` tracks bare HEAD (which may or may not include the bordbuch commit depending on whether `commitAndPushBordbuch` partially succeeded)." This is confusing. `appendAndCommitBordbuch` calls `commitAndPushBordbuch` which commits in the cache clone and then pushes to the bare repo. If the commit in the cache clone fails, bare HEAD does not advance — it stays at N. If the push from cache to bare fails, bare HEAD also stays at N. In both cases, external push sends N, `refs/mirror` = N, external = N. This is **correct** behavior — no false positive. The wording should be simplified to: "If the bordbuch commit or its push to bare fails, bare HEAD stays at the content SHA (N). External push sends N, `refs/mirror` = N. No false positive — the system is consistent, just missing the bordbuch audit entry."

## Questions for the author

1. Should the existing integration test `sync pushes to multiple external mirrors` (line 147-171) be extended to also verify the bordbuch commit appears in the external mirror's log, or is the new dedicated test sufficient?
2. The `commitSha` captured in bordbuch metadata is the content SHA (N), not the post-bordbuch SHA (N+1). Should the bordbuch entry also record the final bare HEAD (N+1) that was actually pushed to external mirrors, or is the content SHA sufficient for audit purposes?
3. What happens if `appendAndCommitBordbuch` succeeds (commits + pushes to bare) but the subsequent external push fails? Bare HEAD = N+1, external = N, `refs/mirror` = N+1. This is a false positive — same as the current bug, but only on push failure, not on every sync. Should the RFC acknowledge this residual gap?
