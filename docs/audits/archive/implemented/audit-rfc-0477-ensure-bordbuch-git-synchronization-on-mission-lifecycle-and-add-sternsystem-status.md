---
rfcId: RFC-0477
auditId: AUDIT-RFC-0477-01
date: 2026-07-21
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0477

## Verdict: Needs revision

The RFC correctly identifies a real production bug (bordbuch entries lost on `git reset --hard`) and proposes a sound fix. However, the `amends` frontmatter is empty despite the RFC explicitly amending RFC-0355 and RFC-0472, the `sternsystem.status --id` flag should be optional (not required) when `--all` is provided, and the `@gogol/ontology` package impact is listed but no schema changes are described in the Design section.

## Mechanical validation (rfc.validate)

Pass — `rfc.validate RFC-0477 --json` returned 0 violations.

## Axis A — Structural completeness

- **Decision** is a single decision in present tense. Pass.
- **CLI surface** shows exact command invocations. Pass.
- **TypeScript contracts** are minimal type signatures. Pass.
- **File system responsibilities** table names concrete paths. Pass.
- **Output format** documents both `--json` shapes. Pass.
- **Failure modes** specifies exit codes and warn-vs-fail behavior. Pass.
- **Rollout** describes default behavior and adoption path. Pass.
- **Alternatives considered** has 4 real alternatives with rejection reasons. Pass.
- **Risks** includes agent misinterpretation risk. Pass.
- **Acceptance criteria** items are checkable and sufficient. Pass.
- **Implementation notes** are explicit behavioral rules. Pass.

No issues.

## Axis B — DNA alignment

- **DNA-46 (Mission lifecycle):** The RFC body explains how uncommitted bordbuch entries that get discarded by `git reset --hard` violate the "append-only hash-chained log" contract. The fix (commit+push after each append) directly protects this invariant. Pass.
- **DNA-44 (Sternsystem bundle contract):** The RFC explains that bordbuch entries are part of the Sternsystem's own git repo and committing them is consistent with the durable, independently versioned artifact contract. Pass.
- **`amends` field is empty.** The RFC body states "This RFC amends the behavior of `mission.open`, `mission.close`, and `mission.abort`" (from RFC-0355) and "This RFC amends `sternsystem.sync`" (from RFC-0472). However, the `amends: []` frontmatter field is empty. This is a referential integrity issue — `amends` should list `["RFC-0355", "RFC-0472"]`. **Fail.**

## Axis C — Ecosystem fit

- **Package boundaries:** All changes are in `@gogol/site-kernel-handoff` (command implementations) and `@gogol/ontology` (schemas). No cross-boundary violations. Pass.
- **Pipeline placement:** The RFC explicitly states "No pipeline integration. These commands are operator-invoked, not part of `build.check`." Correct. Pass.
- **Compass sync:** The RFC does not change repository-wide requirements or app-package relationships. No `docs/*.xml` updates needed. Pass.
- **AGENTS.md updates:** The RFC does not mention updating `packages/os/site-kernel-handoff/AGENTS.md` with the new `sternsystem.status` command or the behavioral changes to lifecycle commands. The handoff AGENTS.md should be updated to document the new command and the commit+push behavior. **Minor finding.**
- **Command lifecycle:** `commands.proposed` lists `sternsystem.status` (will land in `added` upon implementation). `commands.changed` lists 4 existing commands. Internally consistent. Pass.
- **`@gogol/ontology` impact:** The RFC lists `@gogol/ontology` in `packagesImpacted` but the Design section does not describe any schema changes in `@gogol/ontology`. The `sternsystem.status` result type (`SternsystemStatusData`) is defined in the RFC but it's unclear whether a new schema needs to be added to `@gogol/ontology/operations` or if it lives solely in `@gogol/site-kernel-handoff`. **Fail** — clarify whether ontology schemas need updating.

## Axis D — Forward-only compliance

- No compatibility shims, bridges, or dual paths. Pass.
- No backward compatibility layers. Pass.
- The RFC changes behavior of existing commands directly (commit+push after bordbuch append, `reconciledAt` guard). No flags, no opt-in. Pass.
- No legacy code paths maintained behind a flag. Pass.

No issues.

## Axis E — Agent-facing policy

- **Status gate:** The RFC does not contain self-authorizing language. Implementation notes say "Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented)." Pass.
- **Implementation notes** reference RFC-0224 and RFC-0334. Pass.
- **Anti-fabrication:** No content authoring in acceptance criteria. Pass.
- **Storage policy:** No cookies, no client-side persistence. Pass.
- **Non-fatal push clarification:** Implementation notes explicitly state "Git push failures in lifecycle commands are NON-FATAL. Agents MUST NOT interpret a push failure as a command failure or retry the entire command." Pass.

No issues.

## Axis F — Pragmatism

- **Minimal command surface:** `sternsystem.status` earns its existence — it aggregates git SHAs, dirty files, bordbuch events, and mission state into one read-only call. No existing command covers this. Pass.
- **Lean contracts:** TypeScript types are minimal. `CommitAndPushResult` has 3 fields, `MissionCloseData` extends with a structured report, `SternsystemStatusData` has 3 top-level blocks. No speculative generality. Pass.
- **Existing patterns:** The `commitAndPushBordbuch` helper reuses the git commit+push pattern already in `mission.reconcile` and extracts it into a shared function. Pass.
- **Scope discipline:** `appsImpacted` is empty (correct — no apps impacted). `packagesImpacted` lists 2 packages. `nonGoals` are explicit and meaningful (5 items). Pass.
- **`sternsystem.status --id` flag design:** The CLI shows `--id <id>` as required, but `--all` should make `--id` optional. The current `sternsystem.sync` command has `--id` as required, but `sternsystem.status --all` needs to iterate all systems — requiring `--id` when using `--all` is contradictory. **Fail** — clarify that `--id` is required unless `--all` is set.

## Axis G — Blind spots

- **Performance:** Git push adds latency to lifecycle commands. The RFC acknowledges this in Risks and mitigates with non-fatal handling. Pass.
- **False positives:** `git status --porcelain` dirty file noise is acknowledged as a pre-existing issue. Pass.
- **Edge cases:** The RFC considers missing bare repo, no mirror configured, and `--all` with some systems failing. Pass.
- **Concurrent execution:** Two agents running `mission.open` on the same system is already prevented by the registry lock (RFC-0362). But two agents running `mission.open` on different systems could trigger concurrent `git push` to different system repos — this is safe since they push to different origins. Pass.
- **Interrupted operations:** If `commitAndPushBordbuch` commits but crashes before push, the bordbuch entry is committed locally but not pushed. The next `sternsystem.sync` or manual `git push` will catch up. The RFC documents this in failure modes. Pass.
- **Security:** No user data, PII, or external service concerns. No hardcoded keys. Pass.
- **`sternsystem.status` branch detection:** The RFC assumes `master` as the branch name for `mirror/master` ref lookup. The existing `sternsystem.sync` uses `symbolic-ref HEAD` to detect the branch dynamically. `sternsystem.status` should use the same approach rather than hardcoding `master`. **Minor finding.**

## Questions for the author

1. Should `amends: ["RFC-0355", "RFC-0472"]` be set in the frontmatter, given that the RFC body explicitly states it amends both?
2. Does `@gogol/ontology` need a new schema entry for `SternsystemStatusData` in `src/operations/sternsystem.ts`, or does the type live solely in `@gogol/site-kernel-handoff`? If the latter, remove `@gogol/ontology` from `packagesImpacted`.
3. Should `--id` be optional when `--all` is passed to `sternsystem.status`, and how should the command behave if neither `--id` nor `--all` is provided?
