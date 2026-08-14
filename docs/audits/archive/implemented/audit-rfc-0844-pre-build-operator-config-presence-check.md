---
rfcId: RFC-0844
auditId: AUDIT-RFC-0844-01
date: 2026-08-14
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0844

## Verdict: Needs revision

The RFC is well-structured and addresses a real pain point (10+ minute wasted build cycles). However, it contains an incorrect `packagesImpacted` entry, a restore command that doesn't handle `src/` subdirectory files correctly, and a missing distribution-reuse path consideration. These are minor but must be fixed before implementation.

## Mechanical validation (rfc.validate)

**Pass** with 1 warning:
- **V-19** (warning): `RFC-0844.amends includes RFC-0840, but RFC-0840.amendedBy does not include RFC-0844`. Expected for a draft amending an implemented RFC — the backlink will be added when RFC-0844 transitions to `accepted`.

## Axis A — Structural completeness

- **FAIL A-1:** `packagesImpacted` lists `@warpgogol/werkstatt-site` (line 37), but all file paths in the "File system responsibilities" table (lines 167-170) are in `@warpgogol/werkstatt`. No `@warpgogol/werkstatt-site` file is touched. The entry must be removed.
- **PASS:** Decision is present tense and specific. CLI surface, TypeScript contracts, file system responsibilities, output format, failure modes, rollout, alternatives, risks, and acceptance criteria are all present and substantive.
- **PASS:** Acceptance criteria are checkable and cover the decision's scope.

## Axis B — DNA alignment

- **PASS:** `related` references DNA-71, which is the correct invariant for operator config file persistence. The RFC body (line 73) explains how it extends DNA-71 with a pre-build presence check.
- **PASS:** `satisfies: []` is correct for a `command` kind RFC — `--satisfies` is not required for command/policy RFCs.
- **PASS:** No conflict with existing DNA invariants. The RFC amends RFC-0840 (which established DNA-71) rather than superseding it — correct, since it extends the lifecycle without changing the persistence contract.

## Axis C — Ecosystem fit

- **PASS:** Package boundaries are correct — the new command lives in `@warpgogol/werkstatt` (mission module), which owns `mission.validate` and `OPERATOR_CONFIG_FILES`.
- **PASS:** Pipeline placement is correct — the check runs as a pre-build gate inside `runMissionValidate`, not as a pipeline step. This follows the RFC-0813 pattern.
- **PASS:** Command lifecycle buckets are internally consistent: `proposed: [workpiece.config.presence.check]`, `changed: [mission.validate]`.
- **PASS:** No Compass sync needed — no `docs/*.xml` files are impacted.
- **PASS:** No AGENTS.md updates needed — the `packages/werkstatt/AGENTS.md` already documents `OPERATOR_CONFIG_FILES` and `materialize.config.validate`; the new `workpiece.config.presence.check` command can be added during implementation.

## Axis D — Forward-only compliance

- **PASS:** No backward compatibility layers, shims, or dual-paths. The check is purely additive — it runs before the build and either passes or fails. No legacy code path is maintained.
- **PASS:** No deprecation — the RFC introduces a new command, doesn't remove or deprecate anything.

## Axis E — Agent-facing policy

- **PASS:** No self-authorizing language. Implementation notes (lines 242-246) correctly state "Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented)."
- **PASS:** Implementation notes reference RFC-0224 (accepted→implemented transition) and the supersede escalation path.
- **PASS:** No `NEEDS CLARIFICATION` markers.
- **PASS:** No storage policy concerns — the check is read-only (`existsSync`), no persistence changes.
- **PASS:** Anti-fabrication — acceptance criteria are about code behavior, not content authoring.

## Axis F — Pragmatism

- **PASS:** The command earns its existence — it's a pre-build gate that fails in <100ms vs. 10+ minute build cycles. No existing command covers this scope: `materialize.config.validate` is workspace-scope and checks list sync, not per-workpiece presence.
- **PASS:** TypeScript contract is minimal — `WorkpieceConfigPresenceResult` has only the fields needed for the diagnostic output.
- **PASS:** Alternatives section honestly evaluates extending `materialize.config.validate`, adding to `build.prepare`, and improving downstream error messages — each with a rejection reason.
- **FAIL F-1:** `nonGoals` item "This RFC does not add new files to `OPERATOR_CONFIG_FILES` — that remains RFC-0840's scope" (line 44) is slightly misleading. RFC-0840 is already `implemented`. Adding new files to `OPERATOR_CONFIG_FILES` would require a **superseding** RFC, not an amendment to RFC-0840. The nonGoal should say "Adding new files to `OPERATOR_CONFIG_FILES` requires a superseding RFC" to match RFC-0840's own implementation notes (line 207 of `rfc-0840`).

## Axis G — Blind spots

- **FAIL G-1:** The RFC does not address the **distribution-reuse path**. `mission.validate` has an early-return path when `build-input-hash` matches (lines 331-426 of `mission-materialization-commands.ts`). The Playwright pre-flight (RFC-0813) is correctly skipped on this path. The operator config presence check should also be skipped on the distribution-reuse path — if the distribution is reused, the build doesn't run, so missing operator config files won't cause build failures. The RFC's integration code (lines 133-161) shows the check after the Playwright pre-flight, but doesn't mention the reuse path. The implementation must place the check after the distribution-reuse early-return, same as RFC-0813.
- **FAIL G-2:** The restore command for `src/image-delivery.config.yaml` (line 186) uses `cp ../systems-cache/warpgogol-com/src/image-delivery.config.yaml missions/warpgogol-com-m000056/workpiece/src/`. This works only if `missions/warpgogol-com-m000056/workpiece/src/` exists. For a freshly materialized workpiece, `src/` should exist, but the restore command generation logic should ensure the target directory exists (or the command should include `mkdir -p` before `cp`). The RFC's "Restore command generation" section (lines 118-127) doesn't specify this.
- **PASS:** Performance is addressed — `<1ms per file`, `<10ms total` (line 224). Accurate for `existsSync`.
- **PASS:** False positives are addressed — "files present in the workpiece are not flagged" (line 41).
- **PASS:** Edge case: "No active mission" returns pass with empty arrays (line 198). Reasonable.
- **PASS:** Edge case: "Workpiece directory not found" exits with code 1 (line 196). Correct.

## Questions for the author

1. Should the presence check be skipped on the distribution-reuse path (like RFC-0813's Playwright pre-flight)? If yes, add this to the "Integration into `mission.validate`" section explicitly.
2. Why is `@warpgogol/werkstatt-site` listed in `packagesImpacted`? No files in that package are touched by this RFC.
3. Should the restore command for `src/image-delivery.config.yaml` include `mkdir -p` for the target directory, or is `src/` guaranteed to exist in all workpiece states?
