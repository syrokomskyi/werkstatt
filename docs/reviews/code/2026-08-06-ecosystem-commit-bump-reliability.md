# Code Review: ecosystem.commit version bump reliability

- **Date:** 2026-08-06
- **Commit:** `021c069e` (parent: `22f7f629`)
- **Files:** 4 source files + 2 generated
- **Reviewer:** fo-review skill

## Mechanical floor

- TypeScript: `tsc --noEmit` passes for both `@warpgogol/site-kernel-checks` and `@warpgogol/forge`
- Tests: 20/20 pass (`ecosystem-commit.test.ts`)
- `rfc.validate`: no new violations introduced

## Axis A — Structural correctness

- **PASS** — No `any`, no implicit casts, no magic numbers.
- **PASS** — Error handling: archive dir read failure is caught silently (correct — archive may not exist in all workspaces).
- **PASS** — No dead code, no duplicated logic.
- **FINDING A-1 (minor):** `EcosystemCommitInput` interface at `ecosystem-commit.ts:40-46` does not include the new `bump` field. The interface is exported but the handler reads `bump` via `flagString(input, "bump")` from `KernelCommandInput`, not from `EcosystemCommitInput`. This is consistent with how `message`, `rfc`, `amend` are also read via `flagString`/`flagBoolean` rather than from the interface. The interface appears unused as a runtime contract — it's a type export only. No action needed, but the interface is stale.
- **FINDING A-2 (minor):** Duplicated validation — `["patch", "minor", "major"].includes(bumpOverride)` is evaluated twice (lines 378 and 391). Could be stored in a boolean. Minor readability issue, not a bug.

## Axis B — DNA alignment

- **PASS** — No DNA invariants directly violated by this change.
- **N/A** — DNA-46 (mission lifecycle), DNA-48 (release discipline), DNA-53 (semantic fingerprint) are tangentially related but not impacted by the bump logic change.

## Axis C — Ecosystem fit

- **PASS** — Package boundaries respected: `site-kernel-checks` owns the command handler, `forge` owns the RFC validation rules. No cross-imports.
- **PASS** — Command table `reads` field already includes `docs/rfcs/**/*.md` which covers the archive subdirectories.
- **PASS** — `--bump` flag is registered in the command table (`20-ecosystem.ts:334-339`) with correct `kind: "string"` and description. Flag is wired to behavior in the handler.

## Axis D — Forward-only discipline

- **PASS** — No backwards-incompatible changes to existing behavior. Archive search is additive. `--bump` is optional. V-29 extension is additive (accepted RFCs that previously passed still pass if they have versionBump).
- **FINDING D-1 (medium):** V-29 rule extended to require `versionBump` for `status: accepted` RFCs, but RFC-0478 (the governing RFC) explicitly scopes V-29 to `status: implemented` only. The RFC text at line 122 says: _"Required for RFCs with `status: implemented` and `createdAt >= 2026-07-21`"_. Extending to `accepted` is a semantic change to the rule contract that should be documented via an amending RFC (or at minimum an ADR), not a silent code change. This is not a code bug — it's a governance gap.

## Axis E — RFC contract alignment

- **FINDING E-1 (medium, same as D-1):** RFC-0478 acceptance criteria line 271 states V-29 is for "post-cutoff implemented RFCs". The diff changes this to "post-cutoff accepted/implemented RFCs" without updating the RFC or filing an amendment. The RFC is archived (implemented status), so it cannot be edited directly — an amending RFC or ADR is required.
- **PASS** — `--bump` flag and archive search are not governed by RFC-0478 specifically; they are operational improvements to `ecosystem.commit` (RFC-0533). No RFC contract violation for those two changes.

## Axis F — Agent clarity

- **PASS** — EC-10 violation code is clear, message is actionable, fixHint is helpful.
- **PASS** — EC-04 message updated to mention `docs/rfcs/archive/` — agents will know to look there.
- **PASS** — Tests cover all three new behaviors with clear test names.
- **FINDING F-1 (minor):** No test for the interaction of `--bump` with `versionBump: none` (EC-06). If `--bump minor` is passed with an RFC that has `versionBump: none`, EC-06 still fires and blocks the commit. This may be intentional (RFC says "no bump needed" → block regardless of override), but it's untested and the behavior could surprise operators.

## Axis G — Test coverage

- **PASS** — `--bump` override with RFC: tested
- **PASS** — `--bump` without RFC: tested
- **PASS** — EC-10 invalid bump value: tested
- **PASS** — Archived RFC search: tested
- **FINDING G-1 (minor, same as F-1):** Missing test: `--bump` override + `versionBump: none` interaction.
- **FINDING G-2 (minor):** Missing test: archived RFC without `versionBump` field (EC-05 on archived RFC).

## Summary

| Severity | Count | Items |
| --- | --- | --- |
| Medium | 1 | D-1/E-1: V-29 extended to `accepted` without amending RFC |
| Minor | 4 | A-1 (stale interface), A-2 (duplicated check), F-1/G-1 (untested --bump + none interaction), G-2 (untested archived EC-05) |

### Recommended actions

1. **D-1/E-1:** File an ADR or amending RFC documenting the V-29 extension to `accepted` status. The code change is correct; the governance trail is missing.
2. **F-1/G-1:** Add a test for `--bump minor` + RFC with `versionBump: none` — clarify whether EC-06 should fire or be bypassed by the override.
3. **A-1:** Add `bump?: string` to `EcosystemCommitInput` for interface completeness, or remove the interface if it's unused.
