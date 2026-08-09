---
id: RFC-0756
title: "Auto-detect implementation commit in rfc.implement.stamp"
status: implemented
kind: command
scope: workspace
owners:
  - architecture
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-08-08
updatedAt: 2026-08-08
enhancedAt: 2026-08-08
implementedAt: 2026-08-08
closedAt:
supersedes: []
supersededBy:
amends:
  - RFC-0476
amendedBy: []
related:
  - RFC-0224
  - RFC-0476
satisfies: []
versionBump: patch
commands:
  proposed: []
  added: []
  changed:
    - rfc.implement.stamp
  removed: []
appsImpacted: []
packagesImpacted:
  - "@warpgogol/forge"
successSignals:
  - "rfc.implement.stamp works without --implementation-commit when a single commit referencing the RFC ID exists in git history."
  - "When multiple candidate commits exist, the command lists them and asks the operator to specify --implementation-commit explicitly."
  - "The --implementation-commit flag remains accepted for explicit specification."
nonGoals:
  - Do not change the RFC-IMP-03 reachability check (commit must be ancestor of HEAD).
  - Do not change the RFC-IMP-02 acceptance criteria evaluation.
  - Do not auto-stamp without operator invocation — the command is still run explicitly.
---

# RFC-0756: Auto-detect implementation commit in rfc.implement.stamp

## Context

`rfc.implement.stamp` requires a mandatory `--implementation-commit <SHA>` flag. During RFC-0752 implementation, this required a manual `git log --oneline` to find the SHA, then passing it explicitly. This is friction: the operator already knows which RFC they are stamping, and the implementation commit almost always references the RFC ID in its message.

## Problem

- **Mandatory flag with guessable value**: the implementation commit SHA is almost always the most recent commit that references the RFC ID. Forcing the operator to find and pass it manually is unnecessary friction.
- **Error-prone**: the operator may pick the wrong commit (e.g. a doc-only commit instead of the code commit), leading to `RFC-IMP-03` violations.
- **Agent overhead**: AI agents must run `git log`, parse output, and pass the SHA — adding a step to every stamping operation.

## Decision

`rfc.implement.stamp` auto-detects the implementation commit when `--implementation-commit` is not provided. The detection logic:

1. Run `git log --fixed-strings --no-merges --grep="<RFC-ID>" --format=%H` to find all commits whose message contains the RFC ID as a literal string, excluding merge commits.
2. If exactly one commit is found, use it automatically.
3. If multiple commits are found, list them with short SHAs and messages, and ask the operator to pass `--implementation-commit <SHA>` explicitly.
4. If no commit is found, error with a clear message: "No commit referencing <RFC-ID> found. Pass --implementation-commit <SHA> explicitly."

The `--implementation-commit` flag remains accepted for explicit specification and overrides auto-detection.

## Architectural fit

- **RFC-0476 (rfc.implement.stamp)** — this RFC amends RFC-0476 by making `--implementation-commit` optional instead of required. All other RFC-0476 rules (RFC-IMP-01 through RFC-IMP-06) are unchanged.
- **RFC-0224 (platform versioning)** — no impact on version bump logic.
- **Forge OS module** — the handler lives in `packages/forge/os/rfc/handlers/implement-stamp.ts`.

## Design

### CLI surface

```sh
# Auto-detect — no --implementation-commit needed
pnpm exec werkstatt run rfc.implement.stamp --id RFC-0752

# Explicit — still supported, overrides auto-detect
pnpm exec werkstatt run rfc.implement.stamp --id RFC-0752 --implementation-commit abc1234

# Multiple candidates — command lists them and asks for explicit flag
# [ERROR] Multiple commits reference RFC-0752:
#   abc1234 — implement: RFC-0752 steps 3-6 — subdomain commands
#   def5678 — implement: RFC-0752 step 7 — unit tests
# Pass --implementation-commit <SHA> to specify which one.
```

### Output format

On success, the JSON output is unchanged from RFC-0476:

```json
{
  "command": "rfc.implement.stamp",
  "status": "pass",
  "data": {
    "rfcId": "RFC-0752",
    "implementationCommit": "abc1234",
    "stampedAt": "2026-08-08T00:00:00.000Z",
    "criteriaChecked": 8
  },
  "violations": []
}
```

On multiple-candidates or no-commit error, the command exits 1 with a `fail` result. The error is reported as an `RFC-IMP-03` violation with a descriptive message listing candidate SHAs and messages (for multiple) or the not-found message (for zero). No new violation rule is introduced — the auto-detect failure surfaces through the existing `RFC-IMP-03` rule with a message that distinguishes it from the reachability/references check.

### TypeScript contracts

```ts
// No change to the result type — same RfcImplementStampResult
// New internal helper:

async function autoDetectImplementationCommit(
  workspaceRoot: string,
  rfcId: string,
): Promise<{ sha: string } | { multiple: Array<{ sha: string; message: string }> } | { none: true }>;
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/forge/os/rfc/handlers/implement-stamp.ts` | Updated flag validation + auto-detect helper |
| `packages/forge/os/rfc/rfc.module.ts` | Change `implementation-commit` flag from `required: true` to `required: false` |

### Failure modes

- **No commit found** — exit 1, `RFC-IMP-03` violation: "No commit referencing `<RFC-ID>` found in git history. Pass `--implementation-commit <SHA>` explicitly."
- **Multiple commits found** — exit 1, `RFC-IMP-03` violation with list of candidate SHAs and messages. Non-fatal: operator picks one and re-runs with `--implementation-commit <SHA>`.
- **Auto-detected commit not reachable from HEAD** — exit 1, `RFC-IMP-03` violation (unchanged behavior).
- **Auto-detect vs RFC-IMP-03 asymmetry** — auto-detect uses `git log --grep` (commit message only, literal string match, no merges). The existing `commitReferencesRfc` function checks both commit message AND changed file names. A commit that references the RFC only through changed file names (e.g. touching `rfc-0756-*.md` without the ID in its message) would pass `RFC-IMP-03` when explicitly specified but would NOT be found by auto-detect. This is by design — auto-detect is a convenience, not a replacement for explicit specification.

## Rollout

- **Default behavior**: auto-detect is active immediately. No flag day.
- **Existing flag**: `--implementation-commit` remains fully supported and overrides auto-detect.
- **Command manifest**: run `command.manifest.generate` to update `docs/command-manifest.generated.yaml` with `required: false` for the `--implementation-commit` flag. A stale manifest causes `RFC-CMD-02` violations on the next `rfc.validate`.
- **Agent guidance**: update the following files to note that `--implementation-commit` is optional and auto-detected when omitted:
  - Root `AGENTS.md` (lines referencing `rfc.implement.stamp --implementation-commit <sha>`)
  - `PREFERENCES.md` (§RFC implementation completion rules, line 56)
  - `packages/forge/AGENTS.md` (§RFC status transitions, line 124)

## Alternatives considered

- **`--implementation-commit auto` keyword** — rejected. Auto-detect should be the default when the flag is omitted, not an explicit keyword. Adding a keyword adds cognitive load.
- **Use the most recent commit touching `packages/`** — rejected. Too broad; may pick an unrelated commit. The RFC ID in the commit message is the precise signal.
- **Use `HEAD`** — rejected. `HEAD` may be a doc-only commit after the implementation commit. The RFC ID grep is more precise.

## Risks

- **Wrong commit auto-detected**: if an earlier commit (e.g. a plan or doc commit) references the RFC ID, it may be picked instead of the code commit. Mitigated by: (a) using `-1` (most recent), (b) the `RFC-IMP-03` reachability check, (c) the `RFC-IMP-03` references-RFC check already validates the commit touches relevant files.
- **Multiple commits with same RFC ID**: common in multi-step implementations. The command lists candidates and asks for explicit specification — no silent guessing.

## Acceptance criteria

- [x] `rfc.implement.stamp --id <RFC-ID>` works without `--implementation-commit` when a single matching commit exists (evidence: implement-stamp.ts:305-324 auto-detect helper, implement-stamp.test.ts:290-308 auto-detect success test)
- [x] Multiple matching commits are listed with SHAs and messages, asking for explicit flag (evidence: implement-stamp.test.ts:310-327 multiple-candidates test, implement-stamp.ts:316-323 candidate listing)
- [x] No matching commits produce a clear error message (evidence: implement-stamp.test.ts:329-345 no-commit test, implement-stamp.ts:310-314 none path)
- [x] `--implementation-commit <SHA>` explicitly overrides auto-detection (evidence: implement-stamp.test.ts:347-362 explicit-override test, implement-stamp.ts:306 `if (!implementationCommit)` guard)
- [x] All existing RFC-IMP-01 through RFC-IMP-06 rules continue to work (evidence: implement-stamp.test.ts:126-276 all 8 existing tests pass unchanged)
- [x] Unit test verifies auto-detect picks the correct commit (evidence: implement-stamp.test.ts:290-308 "auto-detects the implementation commit" test)
- [x] Unit test verifies multiple-candidate error path (evidence: implement-stamp.test.ts:310-327 "lists multiple candidate commits" test)
- [x] `docs/command-manifest.generated.yaml` reflects `required: false` for `--implementation-commit` after running `command.manifest.generate` (evidence: docs/command-manifest.generated.yaml:18793 `required: false`)
- [x] `rfc.validate` passes on this file before merging (evidence: `pnpm exec werkstatt run rfc.validate --id RFC-0756` returns zero violations)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST NOT remove the `--implementation-commit` flag — it remains as an override.
- Agents MUST NOT weaken the `RFC-IMP-03` reachability or references-RFC checks.
