---
id: RFC-0622
title: "Auto-commit after each operator request via forge skill"
status: draft
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
reviewers: []
createdAt: 2026-07-31
updatedAt: 2026-07-31
enhancedAt: 2026-07-31
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0265
  - RFC-0480
  - RFC-0580
  - RFC-0581
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
versionBump: patch
commands:
  proposed: []
  added: []
  changed: []
  removed: []
appsImpacted: []
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - forge
successSignals:
  - Agent commits after each operator request that produces file changes, without explicit instruction
  - Mission workpiece changes committed via mission.git.commit after each request
  - No uncommitted agent changes left in working tree at end of request processing
nonGoals:
  - Automatic git push after commit (commits are local only)
  - Committing changes from other agents or sessions (only stage files this agent changed)
  - Post-commit git status verification or reporting (operator checks manually)
  - Empty commits for audit trail (no changes = no commit)
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

# RFC-0622: Auto-commit after each operator request via forge skill

## Context

Agents working in the Warpgogol monorepo produce file changes across two git repositories: the monorepo itself and the active mission workpiece (`missions/<missionId>/workpiece/`). The root `AGENTS.md` commit hygiene rules (NON-NEGOTIABLE) require `git diff` on every touched file before committing and `git status` after every commit. RFC-0265 enforces conventional commit message format. RFC-0480 requires mission workpiece edits to be committed via `mission.git.commit`. RFC-0580 auto-commits werkstatt side-effects from mission lifecycle commands.

Despite these rules, committing after each operator request currently relies on the operator explicitly saying "Закоммитим" or similar. When the operator forgets, agent changes accumulate in the working tree, creating risk of lost work, mixed commits, and dirty-tree blockers for `mission.reconcile` / `mission.close`.

## Problem

There is no forge skill that instructs agents to commit after every operator request. The existing commit hygiene rules in `AGENTS.md` are reactive — they govern _how_ to commit when the agent commits, but do not _trigger_ commits. The operator must explicitly request a commit for every step, which is tedious and error-prone:

- If the operator moves to the next request without committing, changes from the previous request mix with the new one.
- `mission.close` and `mission.reconcile` block on dirty workpiece trees, requiring the operator to backtrack and commit.
- Multi-step workflows (fix → review → fix) produce large uncommitted diffs that are hard to split into meaningful commits retroactively.

## Decision

The forge skill registry gains a `fo-step-commit` skill that instructs agents to commit file changes after every operator request, in both the monorepo and the active mission workpiece, staging only the files the agent changed in that request.

## Architectural fit

- **RFC-0265** (commit message hygiene): this skill inherits the conventional commit format (`fix:`, `feat:`, `refactor:`, `docs:`, `chore:`) established by RFC-0265. The skill does not change the format — it triggers the commit.
- **RFC-0480** (mission git workpiece edits): this skill respects the `mission.git.commit` requirement for workpiece changes. Monorepo changes use `git commit` directly; workpiece changes use `mission.git.commit`.
- **RFC-0580** (auto-commit werkstatt side-effects): RFC-0580 auto-commits side-effects from mission lifecycle _commands_ (programmatic). This RFC auto-commits after _operator requests_ (interactive). They are complementary: RFC-0580 covers command-driven commits, this RFC covers request-driven commits.
- **RFC-0581** (session-end retro with git hygiene): the session-end retro checks for clean working trees. This skill prevents the most common cause of dirty trees — uncommitted agent changes from earlier requests.
- **Forge skill model**: the skill uses `invocation: model` (callable by the AI agent autonomously) and `concerns: code-mutation` (it creates git commits). This is the first forge skill with `invocation: model` — all 29 existing skills use `invocation: user`, which requires explicit operator invocation. `model` is necessary because this skill must run autonomously after every operator request without explicit instruction. The Zod schema (`skill-schema.ts:22`) allows `invocation: model`. Other skills (e.g. `fo-idea-implement`, `fo-fix`) MAY invoke it as a final step for intermediate commits.

## Design

### Skill frontmatter

```yaml
---
name: fo-step-commit
description: >-
  Commit agent file changes after each operator request. Stages only files the
  agent changed, in both monorepo and mission workpiece. Callable by other skills
  for intermediate commits.
invocation: model
category: fo
concerns: code-mutation
dependsOn: ['my-preferences']
languagePolicy: ref(PREFERENCES.md)
triggers:
  - "commit after request"
  - "auto-commit changes"
  - "step commit"
---
```

### Skill behavior

The skill instructs the agent to perform the following after every operator request that produces file changes:

1. **Detect changed files.** Run `git status --short` in the monorepo root. If the working tree is clean (no modifications), skip — no commit.
2. **Stage only agent-changed files.** Stage only the files the agent modified in this request. Never use `git add -A` or `git add .` — another agent or session may have unrelated changes in the working tree.
3. **Form commit message.** Write a conventional commit message (`fix:`, `feat:`, `refactor:`, `docs:`, `chore:`) based on the work performed in this request. The agent determines the type and description from the context of the request.
4. **Commit in monorepo.** `git commit -m "<message>"` with the staged files.
5. **Commit in mission workpiece (if applicable).** If the agent changed files in `missions/<missionId>/workpiece/`, commit there via `mission.git.commit --mission <missionId> --message "<message>"` (RFC-0480).

### When this skill runs

- **After every standalone operator request** (default behavior): the agent runs this skill before sending its response to the operator, if any files were changed during the request. "Standalone" means the operator's message is not part of a skill pipeline (e.g. not inside `fo-idea-implement`, `fo-fix`, or another multi-step skill).
- **Called by other skills**: `fo-idea-implement`, `fo-fix`, `fo-review`, and other skills MAY invoke this skill for intermediate commits during multi-step pipelines. During pipeline execution, only the parent skill's explicit invocations fire — the default "after every request" behavior is suppressed to avoid conflicting with the pipeline's own commit discipline.

### What this skill does NOT do

- Does not push to remotes (commits are local).
- Does not run `git status` after commit or report to the operator.
- Does not create empty commits (no changes = no commit).
- Does not stage files the agent did not change in this request.

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/forge/skills/fo/fo-step-commit/SKILL.md` | Skill instruction file |
| `AGENTS.md` | Updated with auto-commit policy reference |
| `PREFERENCES.md` | No changes (skill reads `aiLanguage` via `dependsOn: my-preferences`) |

### Failure modes

- **No changes**: skill detects clean working tree and skips — no error, no commit.
- **Workpiece not found**: if `missions/<missionId>/workpiece/` does not exist, skip workpiece commit. Monorepo commit still proceeds.
- **`mission.git.commit` fails**: if the workpiece commit fails (e.g. dirty tree from another agent), the skill does not block the monorepo commit. The agent reports the failure to the operator.

## Rollout

- **Day 1**: create the `fo-step-commit` skill in `packages/forge/skills/fo/fo-step-commit/SKILL.md`. Run `forge.create` to sync the skill to `.agents/skills/fo/fo-step-commit/SKILL.md`. Both copies (`packages/forge/skills/` and `.agents/skills/`) MUST be committed in the same session per the forge AGENTS.md rule. The skill is immediately active for all agents that load forge skills.
- **AGENTS.md update**: add a short paragraph in the commit hygiene section referencing `fo-step-commit` as the default auto-commit behavior.
- **No migration**: existing sessions continue normally. The skill only affects future requests.
- **No deprecation**: this does not replace any existing skill or command. It adds a new default behavior layer.
- **Opt-out**: the operator can always say "не коммить" or "don't commit" to skip the auto-commit for a specific request. The skill respects explicit operator instructions.

## Alternatives considered

1. **Windsurf hook (`.windsurf/hooks.json`)** — a post-edit hook that runs `git commit` after every file edit. Rejected: too granular (one commit per file edit), risks committing incomplete states, and is IDE-specific (not portable to other agent runtimes).

2. **AGENTS.md rule only** — a governance rule in `AGENTS.md` without a forge skill. Rejected: rules in `AGENTS.md` are advisory and depend on the agent reading and following them. A forge skill is a structured instruction that the agent loads and executes, with frontmatter metadata for validation and discovery.

3. **Forge command (`forge.step.commit`)** — an executable command module that performs the commit. Rejected: the commit logic (detect changes, stage, write message, commit) is agent reasoning, not deterministic code. The agent knows which files it changed and what message to write — a command would need to be told both, adding a layer without value.

4. **Part of existing skill (`fo-fix` or `fo-doc-audit`)** — add the commit step to an existing skill. Rejected: `fo-fix` is specific to the fix workflow; `fo-doc-audit` is specific to documentation sync. Auto-commit after every request is a cross-cutting concern that needs its own skill, callable from any context.

## Risks

- **Agent misinterpretation**: agents might interpret "commit after every request" as "commit after every tool call" (too granular) or "commit once per session" (too coarse). The skill instruction must be explicit: one commit per operator request, at the end of request processing.
- **Staging wrong files**: if the agent cannot distinguish its own changes from another agent's changes, it might stage unrelated files. Mitigation: the skill instructs the agent to track which files it modified and stage only those.
- **Commit message quality**: agents might write generic messages ("changes from request"). Mitigation: the skill instructs the agent to use conventional commit format with a descriptive summary of the work performed.
- **Workpiece commit conflicts**: if another agent is working in the same workpiece, `mission.git.commit` might fail. This is non-fatal — the agent reports the failure and continues.
- **Skill not loaded**: if an agent runtime does not load forge skills, the auto-commit behavior is absent. This is acceptable — the skill is a forge skill, and forge skill loading is the standard agent setup.

## Acceptance criteria

- [ ] `fo-step-commit` skill file exists at `packages/forge/skills/fo/fo-step-commit/SKILL.md` with correct frontmatter (evidence: `packages/forge/skills/fo/fo-step-commit/SKILL.md:1-15`)
- [ ] Skill frontmatter passes `forge.skill.validate` with zero violations (evidence: `pnpm exec forge skill validate --skill fo-step-commit`)
- [ ] `AGENTS.md` references the auto-commit policy and `fo-step-commit` skill (evidence: `AGENTS.md` commit hygiene section)
- [ ] Skill instruction covers both monorepo and mission workpiece commit paths (evidence: `packages/forge/skills/fo/fo-step-commit/SKILL.md` behavior section)
- [ ] Skill instruction explicitly states `git add -A` / `git add .` is forbidden (evidence: `packages/forge/skills/fo/fo-step-commit/SKILL.md` staging section)
- [ ] `rfc.validate` passes on this file (evidence: `pnpm exec site-kernel run rfc.validate --id RFC-0622`)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id <this-rfc-id> --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
- The skill file (`SKILL.md`) is the implementation artifact — there is no TypeScript code or CLI command to write.
- `forge.skill.validate` MUST pass on the new skill before stamping `implemented`.
- The operator MAY override the auto-commit behavior per-request by saying "не коммить" or "don't commit" — the skill MUST respect explicit operator instructions to skip committing.
