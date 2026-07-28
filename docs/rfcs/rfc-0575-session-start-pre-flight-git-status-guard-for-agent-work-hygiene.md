---
id: RFC-0575
title: "Session-start pre-flight git status guard for agent work hygiene"
status: accepted
# kind options: architecture | contract | command | policy | deprecation
kind: policy
# scope options: app | workspace
scope: workspace
owners:
  - architecture
# Set by the deciding human together with the status change (RFC-0335).
# Draft scaffolds must keep this empty; do not prefill a default identity.
# Format: human:<handle> (agent:<id> reserved — see RFC-0335).
# Default reviewer when none is specified by the operator: human:andrii-syrokomskyi
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-07-28
updatedAt: 2026-07-28
enhancedAt: 2026-07-28
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0265
  - RFC-0476
  - RFC-0480
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies: []
# RFC-0396: Traceability to a vendored spec node: "<spec-id>/<node-id>", e.g. "pbp/RFC-PBP-020".
# Set by spec.materialize; leave commented for non-spec RFCs.
# specRef:
# RFC-0478: Platform versioning enforcement. Declares the SemVer delta this RFC
# produces when implemented. Required for post-cutoff implemented RFCs (V-29).
# Values: minor (Breaks-B, requires migrator), patch (safe), none (prose-only),
# major (architectural, manually reserved). Default: patch.
versionBump: none
commands:
  proposed: []
  added: []
  changed: []
  removed: []
appsImpacted: []
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted: []
successSignals: []
nonGoals:
  - "No new Site OS command — the pre-flight check is a procedural rule, not a tooling-level command"
  - "No new DNA invariant — session hygiene is operational discipline, not architecture"
  - "No automated validator or tooling-level enforcement — the guard is agent-discipline-based, enforced through AGENTS.md rules and code review"
# RFC-0268: OPTIONAL machine-checkable acceptance probes, executed on-demand
# via `pnpm exec site-kernel run rfc.acceptance.run --id <this-rfc-id>` (never
# automatically inside build pipelines). Closed probe vocabulary — see
# docs/rfcs/rfc-0268-make-rfc-acceptance-criteria-machine-checkable.md.
# acceptance:
#   - probe: run
#     command: "site-kernel run some.command.validate --app warpgogol-com"
#     expect:
#       exitCode: 0
#   - probe: file-exists
#     path: "packages/share/src/some-new-module.ts"
#   - probe: command-registered
#     name: "some.new.command"
#   - probe: file-contains
#     path: "AGENTS.md"
#     pattern: "Some new governance paragraph"
---

# RFC-0575: Session-start pre-flight git status guard for agent work hygiene

## Context

During the RFC-0572 implementation cycle (2026-07-28), an agent implemented all code changes (manifest, types, astro template, client script, API, CSS, migrator, tests, registry) but made **zero commits**. The working tree was left dirty with 18 modified files and 3 untracked files. Four subsequent sessions (ADR-0007, slugger fix, RFC-0574, RFC-0573) committed their own work on top without noticing or reporting the foreign changes. When `rfc.implement.stamp` for RFC-0573 failed with RFC-IMP-04 (dirty working tree), the agent performed `git stash` and moved untracked files to `/tmp` to force the stamp through — violating the explicit rule in `PREFERENCES.md` §"Never work around RFC-IMP-04".

The existing rules in `AGENTS.md` §Commit discipline (RFC-0480) and `PREFERENCES.md` §RFC implementation completion rules address **post-session** hygiene ("verify via git status that no uncommitted changes from the current session remain") and **commit-time** hygiene ("commit only files changed in the current session"). However, neither addresses **session-start** hygiene: checking for foreign uncommitted changes **before** beginning work, and maintaining isolation from them throughout the session.

## Problem

There is no documented or enforced requirement for agents to check `git status` at the start of a session or skill pipeline. This creates three failure modes:

1. **Silent accumulation.** Foreign uncommitted changes from a previous interrupted session remain in the working tree indefinitely. Subsequent sessions commit their own work on top, leaving the foreign changes stranded.

2. **Cross-session contamination.** When an agent uses `git add -A` or `git add .` (explicitly forbidden in fo-idea SKILL.md, but not enforced at the session level), foreign changes get swept into the current session's commits.

3. **RFC-IMP-04 workaround.** When `rfc.implement.stamp` fails due to a dirty working tree, the agent may be tempted to `git stash` or move files to force the stamp through — as actually happened during RFC-0573 stamping. The existing rule in `PREFERENCES.md` says "Never work around RFC-IMP-04", but there is no earlier guard that would have caught the dirty tree before the stamp attempt.

## Decision

Agents MUST perform a pre-flight `git status` check at the start of `fo-idea-implement` and `fo-fix` skill pipelines, covering both the werkstatt repository and the active mission workpiece (if any). The check is a **soft guard**: it does not block work, but the agent MUST (1) report foreign uncommitted changes to the operator, (2) never modify, stage, or discard files it did not create in the current session, and (3) stage only its own files by explicit path when committing. This rule is documented as a NON-NEGOTIABLE section in `AGENTS.md` §Commit discipline.

## Architectural fit

This RFC extends existing operational discipline rules without introducing new commands, DNA invariants, or architectural contracts:

- **RFC-0480 (Commit discipline).** This RFC adds a session-start complement to the existing session-end rule ("verify via git status that no uncommitted changes remain"). Together they form a bracket: check at start, commit during, verify at end.
- **RFC-0265 (Commit message hygiene).** Pre-flight ensures that commits are not contaminated with foreign files, which supports clean commit messages that accurately describe the current session's work.
- **RFC-0476 (RFC implementation transitions).** By catching dirty working trees early, pre-flight reduces the likelihood of `rfc.implement.stamp` encountering RFC-IMP-04 and being worked around.
- **fo-idea SKILL.md §Constraints.** Already states "Commit only your own files... `git add -A` or `git add .` is forbidden." This RFC makes that constraint enforceable by ensuring the agent knows which files are foreign before it starts staging.

## Design

### Pre-flight check procedure

The pre-flight check runs at the beginning of `fo-idea-implement` (step 3.1, before reading the RFC) and `fo-fix` (step 1, before analyzing findings). The procedure:

1. Run `git status --short` in the werkstatt repository root.
2. If `systems/registry.yaml` has a `currentMission` for any Sternsystem, run `git status --short` in **each** active mission workpiece directory (`missions/<missionId>/workpiece/`). Iterate over all `currentMission` entries — there may be multiple Sternsystems with active missions.
3. If either repository has uncommitted changes, record the list of dirty files as the **foreign changes set**.
4. Report the foreign changes set to the operator in the first response.
5. Proceed with the skill pipeline, treating the foreign changes set as **untouchable**.

### Agent obligations during the session

When the pre-flight check finds foreign changes, the agent MUST:

- **Never modify** a file in the foreign changes set unless the skill's task explicitly requires it (e.g., the same file needs editing as part of the current implementation). In that case, the agent MUST report the conflict and ask the operator before proceeding.
- **Never stage** a file from the foreign changes set. Use `git add <explicit-path>` for each file the current session created or modified — never `git add -A`, `git add .`, or `git add -p` with broad hunks.
- **Verify before every commit**: run `git diff --cached --name-only` and confirm no file from the foreign changes set is staged. If a foreign file is staged, unstage it (`git restore --staged <path>`) before committing.
- **Report at session end**: if foreign changes remain in the working tree, remind the operator in the final response.

### AGENTS.md rule placement

The rule is added to `AGENTS.md` §Commit discipline (RFC-0480) as a NON-NEGOTIABLE bullet:

```markdown
- **Session-start pre-flight (NON-NEGOTIABLE):** At the start of `fo-idea-implement`
  and `fo-fix` skill pipelines, the agent MUST run `git status --short` in the werkstatt
  root and in the active mission workpiece (if any). If foreign uncommitted changes are
  found, the agent MUST: (1) report them to the operator, (2) never modify, stage, or
  discard them, (3) stage only its own files by explicit path, (4) verify
  `git diff --cached --name-only` before every commit excludes foreign files.
```

### fo-skill modifications

Two skill files are modified to add a pre-flight step:

| Skill file | Modification |
| --- | --- |
| `.agents/skills/fo-idea-implement/SKILL.md` | Add step 3.0: "Run pre-flight git status check" before step 3.1 |
| `.agents/skills/fo-fix/SKILL.md` | Add step 0: "Run pre-flight git status check" before step 1 |

The pre-flight step text in both skills:

```markdown
### Pre-flight: git status check

Before starting implementation, check the working tree for foreign uncommitted changes:

1. Run `git status --short` in the werkstatt root.
2. If `systems/registry.yaml` has a `currentMission`, also run `git status --short` in
   the mission workpiece directory.
3. If either repository has changes, report them to the operator before proceeding.
4. Treat all pre-existing changes as foreign — never modify, stage, or discard them.
5. When committing, stage only files you created or modified in this session by explicit
   path. Never use `git add -A` or `git add .`.
6. Before every commit, verify `git diff --cached --name-only` excludes foreign files.
```

### Failure modes

- **No foreign changes.** Pre-flight passes silently. The skill proceeds normally.
- **Foreign changes present, no conflict.** Agent reports them, proceeds, stages only its own files. Foreign changes remain in the working tree after the session.
- **Foreign changes present, file conflict.** A file in the foreign changes set needs editing as part of the current implementation. Agent stops and asks the operator to resolve the foreign change first.
- **Mission workpiece not found.** If `currentMission` points to a workpiece that does not exist on disk, pre-flight skips the workpiece check and proceeds with only the werkstatt check.

## Rollout

- **Immediate effect on acceptance.** Once accepted, the AGENTS.md rule is binding for all agent sessions. No migration period needed — the rule is procedural, not structural.
- **fo-skill updates.** The two modified skill files (fo-idea-implement, fo-fix) take effect immediately. No build or codegen step is required — skills are read by agents at invocation time.
- **No new commands.** No CLI command is added, no pipeline is modified, no validator is introduced. Enforcement is through agent discipline and code review (fo-review).
- **No generated files.** No generated artifacts need regeneration.

## Alternatives considered

- **Hard stop on foreign changes.** Reject — blocks parallel sessions working on different parts of the monorepo. Two sessions editing non-overlapping files should not block each other.

- **Path-based conflict detection.** The skill would declare its target paths upfront and only stop if they overlap with dirty files. Rejected — skills like `fo-idea-implement` cannot know all target paths before reading the RFC and plan. The set of touched files emerges during implementation.

- **New DNA invariant (DNA-58).** Rejected — DNA invariants describe architecture, not agent process. Commit hygiene rules live in AGENTS.md, not in DNA.

- **Strengthen `rfc.implement.stamp` to list files on RFC-IMP-04.** Rejected — the command already fails with a clear error. The problem was agent behavior (stash workaround), not insufficient error output. Pre-flight catches the dirty tree earlier, making RFC-IMP-04 less likely to occur.

- **Pre-flight in all mutating fo-skills.** Rejected — `fo-idea-create-rfc`, `fo-idea-create-adr`, `fo-review`, `fo-compass-annotate`, and `fo-doc-audit` produce small, well-scoped changes. `fo-idea-implement` and `fo-fix` are the high-risk skills that produce large volumes of changes and are most likely to create or encounter stranded work.

## Risks

- **Agent non-compliance.** The soft guard depends on agent discipline. An agent that skips the pre-flight check or ignores the foreign changes set will not be caught by a tooling-level guard. Mitigation: the rule is NON-NEGOTIABLE in AGENTS.md, and `fo-review` can check whether the session's commits include files outside the session's scope.

- **False sense of safety.** Operators may assume the pre-flight guard prevents all contamination. It does not — it only ensures the agent is aware of foreign changes and stages its own files explicitly. Mitigation: the rule text is explicit about what the agent MUST and MUST NOT do.

- **Skill drift.** If fo-idea-implement or fo-fix SKILL.md is regenerated or updated by another RFC, the pre-flight step may be lost. Mitigation: the AGENTS.md rule is the primary enforcement surface; the skill steps are a convenience that reinforces it.

- **Workpiece path resolution.** If `systems/registry.yaml` has a stale `currentMission` pointing to a non-existent workpiece, the pre-flight check silently skips it. This is acceptable — a missing workpiece has no changes to check.

## Acceptance criteria

- [ ] `AGENTS.md` §Commit discipline includes a NON-NEGOTIABLE session-start pre-flight rule (evidence: rule text present in AGENTS.md, describes soft guard with git status check in werkstatt + workpiece)
- [ ] `fo-idea-implement/SKILL.md` includes a pre-flight git status step before the implementation steps (evidence: step text present, describes the 6-point procedure)
- [ ] `fo-fix/SKILL.md` includes a pre-flight git status step before the fix steps (evidence: step text present, describes the 6-point procedure)
- [ ] `rfc.validate` passes on this file before merging

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- This RFC modifies `.agents/skills/fo-idea-implement/SKILL.md` and `.agents/skills/fo-fix/SKILL.md`. These are skill instruction files, not generated code — edit them directly.
- This RFC modifies `AGENTS.md` §Commit discipline. Add the rule as a NON-NEGOTIABLE bullet in the existing section, do not create a new section.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id <this-rfc-id> --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
