---
rfcId: RFC-0883
auditId: AUDIT-RFC-0883-01
date: 2026-08-19
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0883

## Verdict: Needs revision

The RFC proposes a new `validate.postbuild` command that duplicates the existing `sites-check.postbuild` command's core function — running `SITES_CHECK_POSTBUILD_PIPELINE` on an existing dist/. The RFC doesn't acknowledge the existing command or justify why extending it is insufficient. Additionally, the skip list is unnecessary because `SITES_CHECK_POSTBUILD_PIPELINE` already contains only validators; the generation/mutation steps the RFC lists as "skip" belong to `SITES_BUILD_POST_PIPELINE`, a different pipeline.

## Mechanical validation (rfc.validate)

Pass — `rfc.validate --id RFC-0883` returned zero violations.

## Axis A — Structural completeness

- **Failure modes lack exit codes**: The section says "Command fails with clear error" and "Same behavior as build.post" but never specifies exit codes (0 for pass, 1 for fail). The `--json` output shape is documented but the exit code contract is not.
- **File path error**: The file system responsibilities table lists `packages/werkstatt/src/mission/module.ts` for command registration. The actual file is `packages/werkstatt/src/mission/mission.module.ts` (confirmed in `@/packages/werkstatt/src/mission/mission.module.ts:232`).
- **Scope contradiction**: Frontmatter declares `scope: workspace`; the Design section says "Scope: site" (line 86). `mission.validate` is workspace-scoped with `--mission`; `sites-check.postbuild` is app-scoped with `--site`. The RFC must pick one and be consistent.

## Axis B — DNA alignment

No issues. `satisfies[]` is empty — appropriate for a debugging tool that doesn't establish or enforce a DNA invariant. `related[]` references are relevant (RFC-0830, RFC-0832, RFC-0836 are the validators whose rules are being debugged; RFC-0880, RFC-0881 are recent post-build validation RFCs).

## Axis C — Ecosystem fit

- **Duplicate of existing `sites-check.postbuild` command**: The kernel already registers a `sites-check.postbuild` command (`@/packages/werkstatt-site/src/checks/module.ts:472-476`) that runs `SITES_CHECK_POSTBUILD_PIPELINE` on existing dist/ with a dist/ existence guard (RFC-0085). The RFC does not mention this command anywhere — not in Context, not in Alternatives considered, not in Design. This is the single most serious finding: the RFC proposes creating a second command that does the same thing as an existing one.
- **Pipeline confusion**: The skip list (lines 121–139) lists `dist.generated-marker.strip`, `text.normalize.apply`, `behavior.snapshot.generate`, `print.pdf.generate`, `print.pdf.copy`, `print.pdf.validate` as "skip". These steps are **not in `SITES_CHECK_POSTBUILD_PIPELINE`** — they are in `SITES_BUILD_POST_PIPELINE` (`@/packages/werkstatt-site/src/checks/pipelines/build-post.ts:18-53`), which wraps `SITES_CHECK_POSTBUILD_PIPELINE` with generation steps before and after. The command runs `SITES_CHECK_POSTBUILD_PIPELINE` (per line 69), so the skip list is unnecessary — those steps are already absent.
- **Command lifecycle**: `commands.proposed: [validate.postbuild]` is internally consistent.

## Axis D — Forward-only compliance

No issues. No backward compatibility layers, no shims, no dual-paths. The command is purely additive.

## Axis E — Agent-facing policy

No issues. Status gate is correct: "Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented)." Implementation notes are explicit behavioral rules with MUST/SHOULD/MAY. No self-authorizing language. No NEEDS CLARIFICATION markers.

## Axis F — Pragmatism

- **New command vs extending existing**: The RFC should justify why `sites-check.postbuild` cannot be extended with `--mission` and `--skip-slow` flags. The existing command already runs the same pipeline on existing dist/. The only additions the RFC brings are: (1) `--mission` flag for workpiece resolution, (2) `--skip-slow` flag, (3) stale dist/ warning. All three could be flags on `sites-check.postbuild`. The Alternatives considered section lists three alternatives but omits the most obvious one: extending the existing command.
- **Skip list is dead code**: Since `SITES_CHECK_POSTBUILD_PIPELINE` already contains only validators, the skip list and the logic to filter steps add unnecessary complexity. The command just needs to run the pipeline as-is.
- **`packagesImpacted` accuracy**: Lists `packages/werkstatt-site` but the file system responsibilities table shows no files in that package. If the command only consumes the existing pipeline (no changes to `werkstatt-site`), then `packages/werkstatt-site` should not be listed. If it does need changes, they should be in the file table.

## Axis G — Blind spots

- **Stale dist/ detection**: The RFC prints a warning but doesn't describe how staleness is detected. Is it always printed? Is there a timestamp comparison? The acceptance criterion says "Warning printed when dist/ may be stale" but the mechanism is unspecified.
- **`--skip-slow` contents**: The flag skips `mobile.layout.check` (53s) and "other slow steps" but doesn't define the full list or the threshold. Is `lighthouse.budget.check` always skipped? What about `qa.independent.run`? The slow-step set should be explicitly enumerated.
- **Concurrent execution**: Not addressed. Two `validate.postbuild` runs on the same dist/ simultaneously — is that safe? Low risk for a debugging tool, but worth noting.

## Questions for the author

1. Why does the RFC not mention the existing `sites-check.postbuild` command? It already runs `SITES_CHECK_POSTBUILD_PIPELINE` on existing dist/ with a dist/ existence guard. Why is a new command needed instead of extending `sites-check.postbuild` with `--mission` and `--skip-slow` flags?
2. The skip list (lines 121–139) includes steps that are not in `SITES_CHECK_POSTBUILD_PIPELINE` — they are in `SITES_BUILD_POST_PIPELINE`. Was the intent to run `SITES_BUILD_POST_PIPELINE` with skips, or `SITES_CHECK_POSTBUILD_PIPELINE` as-is? If the latter, the skip list is unnecessary.
3. The frontmatter says `scope: workspace` but the Design section says "Scope: site". Which is correct? `mission.validate` (workspace, `--mission`) and `sites-check.postbuild` (app, `--site`) are the two existing patterns — which does this command follow?
