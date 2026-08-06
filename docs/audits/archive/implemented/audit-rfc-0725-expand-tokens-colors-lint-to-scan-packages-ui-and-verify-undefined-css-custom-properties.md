---
rfcId: RFC-0725
auditId: AUDIT-RFC-0725-01
date: 2026-08-07
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0725

## Verdict: Needs revision

The RFC is architecturally sound and well-motivated, but has a blind spot around duplicate findings when the command runs per-site in the pipeline, an unstated return-type contract change, and an overstated `packagesImpacted` list. Three findings need resolution before implementation.

## Mechanical validation (rfc.validate)

Pass — zero violations.

## Axis A — Structural completeness

1. **Return-type contract change not explicit.** The current `runHardcodedColorLint` returns `KernelCommandResult<{ findings: number }>` — just a count. The RFC's `Output format` section shows a `violations` array with per-violation details (`file`, `line`, `column`, `token`, `reason`), and the `TypeScript contracts` section introduces `ColorLintFinding` with a `reason` field. The RFC does not explicitly state that the return data shape changes from `{ findings: number }` to include a `violations` array. This is a contract change that could break consumers expecting the current shape. The RFC should add a "Contract changes" subsection stating: "The `data` field extends from `{ findings: number }` to `{ findings: number, violations: ColorLintFinding[] }`. The `findings` count is preserved for backward compatibility."

2. **No test requirement in acceptance criteria.** There are zero existing unit tests for `runHardcodedColorLint` (confirmed: `grep -r "runHardcodedColorLint" packages/os/site-kernel-checks/src/tests/` returns no results). The RFC adds new scanning logic and a new finding type, but none of the 7 acceptance criteria mention unit tests. New functionality should include test coverage. Add: "Unit tests cover undefined token detection, packages-level scan, and missing `packages/ui/src` warning path."

3. **Command description update not mentioned.** The current command table entry (`04-content-quality.ts:204`) says `"Lint styles for raw rgba and hex color usage."` After the change, the description should reflect the new undefined token check. The RFC's `File system responsibilities` table lists the command table file for updating `reads`, but does not mention updating the `description` field.

## Axis B — DNA alignment

No issues. `satisfies: [DNA-10]` is correct — DNA-10 mandates `--ds-*` custom properties only, and verifying that `--ds-*` references resolve to defined tokens is a natural extension of "use --ds-* custom properties only." The RFC body explains how it enforces DNA-10 in §Architectural fit.

## Axis C — Ecosystem fit

1. **Pipeline characterization misleading.** The RFC says "Pipeline placement: tokens.colors.lint runs in build.check pipeline (packages-level), catching errors before mission.validate's full build." But `tokens.colors.lint` runs in `sites-check-author.ts` (line 318), which is app-scoped — it runs once per site. The `build.check` pipeline includes `SITES_CHECK_AUTHOR_PIPELINE` via spread, so the command executes per-app. The "packages-level" characterization is inaccurate — the pipeline is app-scoped, and the new packages-level scan would execute once per app invocation.

2. **Duplicate findings with multi-site.** Since the command is `scope: "app"` with `supportsAllSites: true`, it runs once per site in the pipeline. The packages-level scan of `packages/ui/src/**/*.css` would run N times for N sites. The same undefined token in `packages/ui` would be reported N times — once per site invocation. The RFC does not address this. Options: (a) accept duplicates as low-cost redundancy, (b) deduplicate by tracking already-scanned files across invocations (not feasible — each invocation is independent), (c) move the packages-level scan to a separate workspace-scoped command. The RFC should explicitly state which option is chosen and why.

## Axis D — Forward-only compliance

No issues. The command is extended in place — no shims, no dual-paths, no backward compatibility layers.

## Axis E — Agent-facing policy

No issues. Status gate is correct ("Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented)"). Implementation notes reference RFC-0224 (accepted→implemented transition) and supersede escalation. No NEEDS CLARIFICATION markers. No storage policy concerns.

## Axis F — Pragmatism

1. **`packagesImpacted` overstated.** `@warpgogol/tokens` has no code changes — the RFC itself says "Export `TOKEN_NAME_SET` (already exported — verify)" in the file system responsibilities table. `@warpgogol/ui` has no code changes — it is only scanned by the extended command. Only `@warpgogol/site-kernel-checks` has actual code changes. Remove `@warpgogol/tokens` and `@warpgogol/ui` from `packagesImpacted`, or justify their inclusion with a clear rationale (e.g., "subject to new validation" is a valid impact).

## Axis G — Blind spots

1. **Duplicate findings** — (see Axis C #2). This is both an ecosystem fit issue and a blind spot: the RFC's `Performance` section says "Scanning packages/ui/src/**/*.css adds ~50 files. Regex extraction is fast (<100ms). No measurable impact." but does not account for N×50 files when N sites are checked.

2. **Ignore patterns reference non-existent files.** The RFC lists `packages/ui/src/styles/tokens-override.css` and `packages/ui/src/styles/biome.generated.css` as ignore patterns ("if it exists"). But `packages/ui/src/styles/` currently contains only `print.css` — neither file exists. The patterns are defensive ("if it exists") but are dead code unless these files are planned. Either remove them or document why they might exist in the future.

## Questions for the author

1. How should duplicate findings be handled when `tokens.colors.lint` runs per-site and the packages-level scan produces the same findings for each site? Accept duplicates, deduplicate, or split into a separate workspace-scoped command?
2. Is the return-type change from `{ findings: number }` to `{ findings: number, violations: ColorLintFinding[] }` intentional? If so, add a "Contract changes" subsection and verify no consumers break.
3. Why are `@warpgogol/tokens` and `@warpgogol/ui` listed in `packagesImpacted` when neither has code changes? Should they be removed, or is "subject to new validation" a valid impact rationale?
