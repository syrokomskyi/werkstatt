---
rfcId: RFC-0810
auditId: AUDIT-RFC-0810-01
date: 2026-08-12
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0810

## Verdict: Needs revision

The RFC addresses a real gap (unregistered generator outputs discovered late in `mission.validate`), but has a critical factual error in pipeline placement (`ownership.sync.validate` is in `build.prepare`, not `build.check`), a forward-only violation (grace period), and a major blind spot (workspace-scoped `.generate` commands would produce false positives).

## Mechanical validation (rfc.validate)

Pass — `rfc.validate --id RFC-0810 --json` returned zero violations.

## Axis A — Structural completeness

- **A-1**: Failure modes section labels diagnostics as "Error:" but does not specify exit codes. The `--json` output shape includes `status: "pass" | "fail"` but the RFC doesn't define what exit code accompanies each status. Add explicit exit code mapping (e.g. `exitCode: 1` for fail, `0` for pass).
- **A-2**: The rollout says "Warn-only on first introduction" but failure modes say "Error:". This is contradictory — are `OWN-XCHECK-01/02/03` warnings or errors on first release? The rollout and failure modes sections must agree on severity.

## Axis B — DNA alignment

- **B-1**: `satisfies[]` is empty, but the RFC body (line 89) claims to "strengthen the ownership contract that underpins DNA-58." If the RFC strengthens DNA-58, it should be listed in `satisfies[]` with an explanation of how. Alternatively, remove the DNA-58 claim if the connection is indirect.

## Axis C — Ecosystem fit

- **C-1 (MAJOR)**: The RFC claims `ownership.sync.validate` is in the `build.check` pipeline (lines 84, 163, 197). It is not. `ownership.sync.validate` runs in `SITES_BUILD_PREPARE_PIPELINE` (`build-prepare.ts:159`), not `SITES_BUILD_CHECK_PIPELINE` (`build-check.ts`). Similarly, `config.regenerate` is in `build.prepare` (`build-prepare.ts:31`), not `build.check`. The proposed pipeline placement — "step 2 in `build.check` after `config.regenerate`, before `ownership.sync.validate`" — is impossible because neither command is in `build.check`. The cross-check should be placed in `build.prepare` before `ownership.sync.validate` (line 159), not in `build.check`. Placing it in `build.check` would run it AFTER `build.prepare` has already completed, defeating the stated goal of catching missing registrations before the expensive validate steps.
- **C-2**: The `commands.changed` list includes `generator.ownership.lint` (line 28), but the RFC body describes no changes to this command. If `generator.ownership.lint` is being modified, describe what changes. If not, remove it from `commands.changed`.
- **C-3**: The `related` field omits RFC-0087 (the original generator ownership RFC that established `GENERATOR_OWNERSHIP_MAP` and `generator.ownership.lint`) and RFC-0612 (ownership.sync.validate, the command this RFC explicitly complements). Both are directly related and should be in `related[]`.
- **C-4**: The CLI surface shows `--site warpgogol-com` and `--all` flags, but the implementation notes say "The command scope is `workspace` (it checks all registered generators, not per-site)." A workspace-scoped registry cross-check doesn't need a `--site` flag. Clarify whether this is workspace-scoped (no `--site` flag) or app-scoped (needs `--site`), and align the CLI surface, scope, and implementation notes.

## Axis D — Forward-only compliance

- **D-1 (MAJOR)**: The rollout proposes "Warn-only on first introduction" with "a grace period (one release cycle)" before escalating to error. This violates the forward-only discipline: "Deprecation means removal in the same change, not an indefinite grace period." The command should fail-hard from day one. If existing sites have uncovered generators, those generators should be registered before merging this RFC. There is no expand-then-contract migration path in a forward-only ecosystem.

## Axis E — Agent-facing policy

- **E-1**: Implementation notes say "Agents MAY implement code changes ONLY when this RFC has status: accepted" but don't reference the specific governance rules: RFC-0331 (verification evidence for probe-bearing RFCs), the accepted→implemented transition protocol, and supersede escalation on invariant conflict. Add references to the relevant governance RFCs.

## Axis F — Pragmatism

- **F-1**: The RFC proposes a new command `ownership.generator.cross-check` but doesn't consider whether this could be an extension of the existing `generator.ownership.lint` command (RFC-0087), which already operates on `GENERATOR_OWNERSHIP_MAP`. The alternatives section lists three options but omits "extend `generator.ownership.lint` with uncovered-generator detection." Since both checks operate on the same data structure and are both workspace-scoped lints, combining them would reduce command surface. Address why a separate command is preferred over extending the existing one.

## Axis G — Blind spots

- **G-1 (MAJOR)**: The cross-check verifies that "every command ending in `.generate` has at least one entry in `GENERATOR_OWNERSHIP_MAP`." But many `.generate` commands are workspace-scoped and don't write to app directories — e.g. `ecosystem.manifest.generate` (writes to `docs/`), `fleet.sites.generate` (writes to `fleet/`), `gate.catalog.generate` (writes to `docs/`), `maintenance.debt.queue.generate`, `check.report.generate`, `check.action-pack.generate`, `content.regression.review.generate`, `print.pdf.generate` (writes to `.cache/pdf/`). These commands would all produce false `OWN-XCHECK-01` findings because they intentionally have no ownership map entries. The RFC must define how to filter `.generate` commands to only those that produce files covered by the ownership map (e.g. only `scope: "app"` commands, or only commands that write to `apps/<id>/` paths).
- **G-2**: The RFC doesn't consider `.generate` commands that write to `dist/` (e.g. `dist.sitemap.images.generate`) or `.cache/` (e.g. `print.pdf.generate`). These are post-build or ephemeral outputs that may not belong in `GENERATOR_OWNERSHIP_MAP`. Clarify the scope boundary.

## Questions for the author

1. Should the cross-check be placed in `build.prepare` (where `ownership.sync.validate` actually runs) instead of `build.check`? If so, at which position — before all generators run, or just before `ownership.sync.validate`?
2. How will the cross-check distinguish app-scoped `.generate` commands (which should have ownership entries) from workspace-scoped `.generate` commands (which write to `docs/`, `fleet/`, `.cache/` and should not)? Will it filter by `scope: "app"`, by pipeline membership, or by another criterion?
3. Why a separate command instead of extending `generator.ownership.lint` (RFC-0087) with uncovered-generator detection? Both operate on `GENERATOR_OWNERSHIP_MAP` and are workspace-scoped.
