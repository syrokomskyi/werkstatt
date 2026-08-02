---
rfcId: RFC-0645
auditId: AUDIT-RFC-0645-01
date: 2026-08-02
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0645

## Verdict: Needs revision

The RFC is architecturally sound — replacing source-scanning with output-based drift detection is the right direction. However, it contains a factual error about TS-TIME-02 registration in `core-infra.ts`, a tenuous DNA-51 claim, an incorrect `packagesImpacted` entry, and an unjustified `versionBump: patch` for a command removal.

## Mechanical validation (rfc.validate)

Pass — `rfc.validate --id RFC-0645 --json` returns 0 violations.

## Axis A — Structural completeness

- **TS-TIME-02 not in `core-infra.ts` (factual error).** The file system responsibilities table (line 164) says: "TS-TIME-01 and TS-TIME-02 rules deleted" from `diagnostics/rules/core-infra.ts`. The acceptance criterion (line 209) repeats: "TS-TIME-01 and TS-TIME-02 rules deleted from `diagnostics/rules/core-infra.ts`". However, only `TS-TIME-01` is registered in `core-infra.ts` (line 500). `TS-TIME-02` exists only as a constant `RULE_ID_PARITY` in `generated-timestamp-validate.ts` (line 107) — it was never registered as a rule descriptor in `core-infra.ts`. The implementing agent would search for `TS-TIME-02` in `core-infra.ts` and find nothing to delete, causing confusion. Fix: correct the table and acceptance criterion to say "TS-TIME-01 rule deleted from `core-infra.ts`; `RULE_ID_PARITY` constant deleted from `generated-timestamp-validate.ts`".

## Axis B — DNA alignment

- **DNA-51 claim is tenuous.** The RFC claims to satisfy DNA-51 (Werkstatt consistency primitives). DNA-51 is specifically about "shared lock, idempotency, and atomic staging primitives" for mutating Werkstatt commands (enforced by `werkstatt.lock.status`, `werkstatt.lock.recover`, `werkstatt.operation.validate`). The RFC's architectural fit section says: "removing manual allowlist maintenance eliminates a class of manual discipline that DNA-51 requires automated primitives for." This connection is weak — the `TIMESTAMP_ALLOWLIST` is a validation concern (source-scanning for timestamp patterns), not a mutation consistency concern (locks, idempotency, atomic writes). DNA-51 does not mention allowlists or timestamp validation. Fix: either drop DNA-51 from `satisfies[]` (DNA-58 alone is sufficient — it is the direct invariant enforced by `generated.drift.validate`), or provide a more precise justification for how removing a timestamp allowlist extends DNA-51's scope.

## Axis C — Ecosystem fit

- **`packagesImpacted` includes `@warpgogol/site-kernel-handoff` incorrectly.** The RFC lists `@warpgogol/site-kernel-handoff` in `packagesImpacted` (line 54). No files in that package are modified by this RFC. The `TIMESTAMP_ALLOWLIST` entry for `packages/os/site-kernel-handoff/src/release/release-commands.ts` is deleted along with the entire `generated-timestamp-validate.ts` file in `site-kernel-checks`. The `release-commands.ts` file itself is not touched. Fix: remove `@warpgogol/site-kernel-handoff` from `packagesImpacted` — only `@warpgogol/site-kernel-checks` is impacted.

## Axis D — Forward-only compliance

No issues. The RFC removes `generated.timestamp.validate` without a deprecation period, which is forward-only. No compatibility shims or dual-paths are proposed.

## Axis E — Agent-facing policy

No issues. The RFC correctly gates implementation on `status: accepted`. Implementation notes reference RFC-0334 for invariant conflict escalation. The pre-implementation audit requirement is explicit.

## Axis F — Pragmatism

- **`versionBump: patch` for command removal is unjustified.** Removing a registered command (`generated.timestamp.validate`) is a breaking change for any consumer that invokes it. While the only pipeline consumer is `build.check` (which the RFC modifies), the command is also invocable directly via CLI. RFC-0478 defines `minor` as "Breaks-B, requires migrator" and `patch` as "safe". A command removal is not safe — it breaks any script or agent that calls `generated.timestamp.validate`. Fix: either upgrade to `versionBump: minor` and declare a migrator (e.g., "replace `generated.timestamp.validate` calls with `generated.drift.validate`"), or explicitly justify why `patch` is appropriate (e.g., "the command is internal-only, no external consumers exist, the only pipeline consumer is modified in the same RFC").

## Axis G — Blind spots

- **No consideration of broken dryRun implementations.** The RFC promotes DRIFT-02 from info to error, requiring all generators to support dryRun. The pre-implementation audit (line 221) says to check for DRIFT-02 diagnostics and add dryRun support. But it doesn't describe what happens if a generator's dryRun mode is broken — produces incorrect output (false DRIFT-01), throws an error (unhandled rejection in `generated.drift.validate`), or returns empty `renderedFiles` (DRIFT-02 error that blocks validation). The RFC should describe the remediation path: fix the dryRun implementation, not bypass the check.

- **Performance cost of mandatory dryRun not stated.** With DRIFT-02 as error, all generators in `GENERATOR_OWNERSHIP_MAP` must support dryRun and are re-invoked on every `generated.drift.validate` run. The current code already re-invokes generators with dryRun and skips those without — so the cost doesn't change, it just becomes mandatory. The RFC should state this explicitly: "the performance cost is unchanged — `generated.drift.validate` already re-invokes all generators with dryRun; promoting DRIFT-02 to error only changes the severity of the skip diagnostic, not the number of generators invoked."

## Questions for the author

1. Why is `@warpgogol/site-kernel-handoff` listed in `packagesImpacted` when no files in that package are modified?
2. How does removing a timestamp validation allowlist extend DNA-51 (lock/idempotency/atomic-staging primitives for mutating commands)?
3. What happens if a generator's dryRun mode is broken during the pre-implementation audit — is the agent expected to fix the dryRun implementation, or is there a fallback?
