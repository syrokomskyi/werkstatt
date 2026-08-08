---
rfcId: RFC-0756
auditId: AUDIT-RFC-0756-01
date: 2026-08-08
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0756

## Verdict: Needs revision

The RFC has a sound core idea — auto-detecting the implementation commit when `--implementation-commit` is omitted — but contains a design contradiction between the `-1` flag and the multiple-candidates detection path, plus several missing implementation details (module registration change, command manifest regeneration, AGENTS.md update location). These must be resolved before implementation.

## Mechanical validation (rfc.validate)

Pass with 1 warning:

- **V-19**: `RFC-0756.amends` includes `RFC-0476`, but `RFC-0476.amendedBy` does not include `RFC-0756`. This is a reciprocal amendment metadata gap — `RFC-0476` is archived (`status: implemented`), so its `amendedBy` list must be updated during enhance or implementation.

## Axis A — Structural completeness

1. **Output format section missing.** The RFC does not document the `--json` output shape for the new auto-detect behavior. The existing `RfcImplementStampResult` type is unchanged, but the multiple-candidates error case introduces a new failure mode. The RFC should show the JSON shape for the multiple-candidates error (e.g. does it populate `violations` with a new rule, or does it throw?).

2. **Failure modes don't specify exit codes.** The RFC says "error" and "non-fatal" but does not explicitly state exit code 1 for the no-commit and multiple-commits cases. The existing `RFC-IMP-*` failures exit 1; the new error paths should be consistent and explicit.

3. **Acceptance criteria missing command manifest update.** The RFC changes `--implementation-commit` from `required: true` to `required: false` in the command registration (`rfc.module.ts`), which means `docs/command-manifest.generated.yaml` must be regenerated. An acceptance criterion should verify this.

## Axis B — DNA alignment

No issues. `kind: command`, `satisfies: []` — no DNA claims. No DNA conflict.

## Axis C — Ecosystem fit

1. **`docs/command-manifest.generated.yaml` regeneration not in rollout.** Changing `--implementation-commit` from `required: true` to `required: false` in the command registration changes the command manifest. The rollout section does not mention running `command.manifest.generate`. Without this, `rfc.validate` (RFC-CMD-02) will fail on the stale manifest.

2. **AGENTS.md update location not specified.** The rollout says "update `AGENTS.md` to note that `--implementation-commit` is optional" but does not specify which AGENTS.md — root, `packages/forge/AGENTS.md`, or both. The `--implementation-commit` flag is documented in root `AGENTS.md` and `PREFERENCES.md` (§RFC implementation completion rules); both may need updates.

3. **Module registration file not in file system responsibilities.** The table lists only `implement-stamp.ts`. The change to `required: false` for `--implementation-commit` in `rfc.module.ts` (line 398) is a direct consequence of this RFC and should be listed.

## Axis D — Forward-only compliance

No issues. The `--implementation-commit` flag remains as an explicit override — this is not a compatibility shim, it's a legitimate user-facing option. No dual-path, no legacy code maintained behind a flag.

## Axis E — Agent-facing policy

No issues. No self-authorizing language. Implementation notes reference RFC-0476 (amended) correctly. No NEEDS CLARIFICATION markers found.

## Axis F — Pragmatism

No issues. The RFC extends an existing command rather than creating a new one. The `autoDetectImplementationCommit` return type is a minimal discriminated union. `packagesImpacted` lists only `@warpgogol/forge`. `nonGoals` are explicit and meaningful.

## Axis G — Blind spots

1. **Design contradiction: `-1` vs multiple-candidates detection.** Step 1 of the Decision says `git log --grep="<RFC-ID>" -1 --format=%H` (returns the most recent 1 commit), but step 3 says "if multiple commits are found, list them". With `-1`, only one commit is returned — there is no way to detect that multiple candidates exist. The `autoDetectImplementationCommit` return type has a `multiple` branch, which implies the implementation must enumerate all matching commits (without `-1`). The design description and the TypeScript contract contradict each other. The implementation should run `git log --grep="<RFC-ID>" --format=%H` (without `-1`), count results, then decide.

2. **`git log --grep` uses regex by default.** The RFC ID string `RFC-0756` as a regex would also match `RFC-07560` or `RFC-0756a`. The implementation should use `--fixed-strings` (`-F`) or anchor the pattern (e.g. `--grep="RFC-0756\b"` or `--grep="^RFC-0756$"`) to avoid false matches.

3. **Auto-detect vs RFC-IMP-03 asymmetry.** Auto-detect uses `git log --grep` (commit message only). The existing `commitReferencesRfc` function (`implement-stamp.ts:80-100`) checks both commit message AND changed file names (a commit touching `rfc-0756-*.md` passes RFC-IMP-03 even without the ID in the message). A commit that references the RFC only through changed file names would pass RFC-IMP-03 but NOT be found by auto-detect. This asymmetry should be documented — the auto-detect is a narrower search than RFC-IMP-03.

4. **Merge commits.** The RFC does not consider merge commits. A merge commit message may contain the RFC ID if the branch name includes it (e.g. `Merge branch 'feature/RFC-0756'`). The implementation should consider `--no-merges` to exclude merge commits from auto-detect candidates.

## Questions for the author

1. How should the implementation enumerate candidates — `git log --grep` without `-1` and count, or a two-step approach (first `-1`, then count if needed)? The TypeScript contract implies the former; the design text says the latter.
2. Should `--fixed-strings` be used with `git log --grep` to avoid regex false matches, or should the pattern be anchored?
3. Should merge commits be excluded from auto-detect candidates via `--no-merges`?
4. Which AGENTS.md file(s) need the "optional flag" note — root, `packages/forge/AGENTS.md`, or both?
