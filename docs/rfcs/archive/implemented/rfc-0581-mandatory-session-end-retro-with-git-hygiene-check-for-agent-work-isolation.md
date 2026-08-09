---
id: RFC-0581
title: "Mandatory session-end retro with git hygiene check for agent work isolation"
status: implemented
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
createdAt: 2026-07-29
updatedAt: 2026-07-29
enhancedAt: 2026-07-29
implementedAt: 2026-07-29
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0575
  - RFC-0480
  - RFC-0265
  - RFC-0476
  - RFC-0537
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
packagesImpacted: []
successSignals: []
nonGoals:
  - "No new Site OS command — the session-end check is a procedural rule enforced through AGENTS.md and skill instructions, not a tooling-level command"
  - "No new DNA invariant — session-end hygiene is operational discipline, not architecture"
  - "No automated validator or tooling-level enforcement — the guard is agent-discipline-based, enforced through AGENTS.md rules and code review"
  - "No auto-commit of uncommitted changes — the agent reports and asks, the operator decides"
  - "No amendment to RFC-0575 — session-start and session-end are separate concerns with separate rules and skill modifications"
# RFC-0268: OPTIONAL machine-checkable acceptance probes, executed on-demand
# via `pnpm exec werkstatt run rfc.acceptance.run --id <this-rfc-id>` (never
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

# RFC-0581: Mandatory session-end retro with git hygiene check for agent work isolation

## Context

During a bug-fix session on 2026-07-29, an agent fixed a broken anchor link in `packages/ui/src/sections/price-card/price-card-section.astro` by adding `resolveSectionAnchor` and passing `sectionId` to `<SectionShell>`. The fix was correct and minimal, but the agent did not commit it. When the operator asked why, the agent explained that `packages/*` edits have no mandatory commit rule (unlike mission workpieces, which require `mission.git.commit`), and the agent chose to wait for browser verification before committing.

This incident exposed a gap in the session-end hygiene bracket. RFC-0575 (implemented, archived) established a **session-start** pre-flight git status guard: agents MUST check `git status --short` at the start of `fo-idea-implement` and `fo-fix` pipelines. RFC-0480 (Commit discipline) requires agents to commit after each completed change and verify `git status` before responding. However, neither rule mandates a **session-end** verification — a final check that all session changes are committed, triggered by an explicit operator signal to close the session.

The existing `fo-session-retro` skill (document-only, `invocation: user`) captures session insights and routes them to durable homes (AGENTS.md, ADRs, DNA, forge, memory). It already runs `git diff HEAD` and `git log --oneline -10` as part of insight gathering (step 2), but it does not explicitly verify that the working tree is clean or report uncommitted changes to the operator. The skill's focus is knowledge capture, not git hygiene.

## Problem

There is no documented or enforced requirement for agents to verify a clean working tree at session end. This creates three failure modes:

1. **Silent uncommitted work.** An agent completes a bug fix or feature change in `packages/*` but does not commit it — either because it is waiting for operator verification, because it forgot, or because no rule mandates it. The operator closes the session believing the work is saved. The next session's pre-flight check (RFC-0575) discovers the dirty tree, but the original agent's context is lost.

2. **Ambiguous commit ownership.** When the next session's pre-flight check finds foreign changes, the agent cannot determine which session created them or whether they are safe to commit. The operator may not remember either. The changes linger in the working tree indefinitely.

3. **Incomplete session bracket.** RFC-0575 established a session-start guard (check at start, treat foreign changes as untouchable). RFC-0480 established per-change commit discipline (edit → verify → commit → respond). But the bracket is missing its closing element: a session-end verification that all session work is committed, triggered by an explicit operator signal. Without it, the bracket is start → work → ???, and the "???" is where uncommitted changes escape.

## Decision

When the operator signals session end (explicitly: "we're done", "на этом всё", "that's it", or similar), the agent MUST invoke `fo-session-retro`. Before the retro's insight triage begins, the agent performs a **git hygiene check**: run `git status --short` in the werkstatt root and in each active mission workpiece (if any). If uncommitted changes are found, the agent reports them to the operator and asks whether to commit. The agent does not auto-commit. This rule is documented as a NON-NEGOTIABLE section in `AGENTS.md` §Session-end discipline and as a pre-triage step in `fo-session-retro/SKILL.md`.

## Architectural fit

This RFC extends existing operational discipline rules without introducing new commands, DNA invariants, or architectural contracts:

- **RFC-0575 (Session-start pre-flight).** This RFC adds the session-end complement. Together they form a bracket: check at start (RFC-0575) → commit during (RFC-0480) → verify at end (this RFC). The operator explicitly triggers the session-end check, while the session-start check is automatic at skill pipeline entry.
- **RFC-0480 (Commit discipline).** This RFC does not replace the per-change commit rule (edit → verify → commit → respond) or the per-response `git status` verification ("Before sending any response to the operator, verify via `git status` that no uncommitted changes from the current session remain"). It adds a complementary session-end safety net: if the agent forgot or deferred a commit despite RFC-0480, the session-end retro catches it before the session closes. If RFC-0480 was followed perfectly throughout the session, the session-end check finds a clean tree and proceeds silently. The two rules are complementary, not redundant — RFC-0480 is per-response, RFC-0581 is per-session-end.
- **RFC-0265 (Commit message hygiene).** By catching uncommitted changes at session end, the retro reduces the likelihood of stranded changes that later sessions sweep into unrelated commits.
- **RFC-0476 (RFC implementation transitions).** By ensuring a clean working tree at session end, this RFC reduces the likelihood of `rfc.implement.stamp` encountering RFC-IMP-04 in a subsequent session.
- **RFC-0537 (Session documentation).** The `fo-session-retro` skill already exists for insight capture. This RFC extends it with a git hygiene pre-step, not a new skill.
- **fo-session-retro SKILL.md.** Already runs `git diff HEAD` in step 2 (Gather session insights). This RFC adds an explicit pre-step that checks `git status --short` and reports uncommitted changes before insight triage begins.

## Design

### Session-end trigger

The session-end retro is triggered by an **explicit operator signal**. The agent does not auto-detect session end (the operator may close the chat without warning). Recognized signals include:

- Explicit closings (illustrative, not exhaustive): "we're done", "на этом всё", "that's it", "мы закончили", "на этом закончим", "wrap up", "close the session", "das war's", "wir sind fertig", "damit fertig"
- Skill invocation: the operator explicitly invokes `/fo-session-retro` or says "run session retro"

The list is illustrative — agents should recognize any clear session-closing signal regardless of language. When uncertain whether the operator is signaling session end, the agent asks: "Should I run the session-end retro?"

When the agent detects a session-end signal, it MUST invoke `fo-session-retro` via the `skill` tool. The agent does not skip the retro even if no insights are apparent — the git hygiene check runs regardless.

### Git hygiene check procedure

The check runs as a **pre-step** before `fo-session-retro` step 2 (Gather session insights). The procedure:

1. Run `git status --short` in the werkstatt repository root.
2. If `systems/registry.yaml` has a `currentMission` for any Sternsystem, run `git status --short` in **each** active mission workpiece directory (`missions/<missionId>/workpiece/`). Iterate over all `currentMission` entries — there may be multiple Sternsystems with active missions.
3. If either repository has uncommitted changes, report them to the operator:

```
## Git hygiene check

Uncommitted changes found:

**Werkstatt root:**
- M packages/ui/src/sections/price-card/price-card-section.astro

**Mission workpiece (warpgogol-com-m000019):**
- M src/content/pages/uk/pricing.md

Would you like me to commit these changes before proceeding with the retro?
```

4. If the operator confirms, commit using the appropriate path:
   - **Mission workpiece:** `mission.git.commit --mission <missionId> --message "<message>"`
   - **Platform/package:** `ecosystem.commit --message "<message>"` (for `packages/**`, `services/**`, `integrations/**`) or `git add <paths> && git commit` (for `docs/**`, root config)
5. If the operator declines, proceed with the retro. The uncommitted changes remain in the working tree — the retro report notes them.
6. If no uncommitted changes are found, proceed silently to insight triage.

### AGENTS.md rule placement

A new `## Session-end discipline` section is added to `AGENTS.md`, after `## Commit discipline (RFC-0480)` and before the next existing section. The rule:

```markdown
## Session-end discipline (RFC-0581)

When the operator signals session end ("we're done", "на этом всё", "that's it", or similar), the agent MUST invoke `fo-session-retro`. Before the retro's insight triage begins, the agent performs a git hygiene check:

1. Run `git status --short` in the werkstatt root and in each active mission workpiece (if any).
2. If uncommitted changes are found, report them to the operator and ask whether to commit.
3. If the operator confirms, commit using the appropriate path (`mission.git.commit` for workpieces, `ecosystem.commit` or `git commit` for werkstatt).
4. If the operator declines, proceed with the retro — the uncommitted changes remain.
5. If no uncommitted changes are found, proceed silently to insight triage.

The agent does not auto-commit. The operator decides whether to commit.
```

### fo-session-retro SKILL.md modification

A new step 1.5 is added to `fo-session-retro/SKILL.md`, between step 1 (Read preferences) and step 2 (Gather session insights):

```markdown
### 1.5. Git hygiene check

Before gathering session insights, verify that the working tree is clean:

1. Run `git status --short` in the werkstatt root.
2. If `systems/registry.yaml` has a `currentMission`, also run `git status --short`
   in each active mission workpiece directory.
3. If uncommitted changes are found, report them to the operator and ask whether to
   commit. Use `mission.git.commit` for workpiece changes, `ecosystem.commit` or
   `git commit` for werkstatt changes.
4. If the operator declines, proceed — the uncommitted changes remain in the tree.
5. If no uncommitted changes are found, proceed silently.
```

The existing step 2 (Gather session insights) already runs `git diff HEAD` and `git log --oneline -10` — these remain unchanged and complement the new pre-step.

### Failure modes

- **No uncommitted changes.** Git hygiene check passes silently. The retro proceeds to insight triage.
- **Uncommitted changes, operator confirms commit.** Agent commits using the appropriate path, then proceeds to insight triage.
- **Uncommitted changes, operator declines commit.** Agent proceeds to insight triage. The retro report notes the uncommitted changes.
- **Uncommitted changes, operator requests changes first.** Agent applies the requested changes, commits, then proceeds to insight triage.
- **Mission workpiece not found.** If `currentMission` points to a workpiece that does not exist on disk, the check skips the workpiece and proceeds with only the werkstatt check.
- **Operator closes chat without signaling.** The retro does not run. The next session's pre-flight check (RFC-0575) will discover the dirty tree. This is the same behavior as today — the retro is a soft guard triggered by operator signal, not a hard enforcement mechanism.
- **Concurrent sessions.** If two agent sessions are running simultaneously and one signals session-end, the git hygiene check reports all uncommitted changes — including those from the other session. The agent does not attempt to distinguish its own changes from the other session's. The operator decides which changes to commit. This mirrors RFC-0575's foreign-changes handling: the agent reports, the operator decides, the agent never discards or stages foreign changes without explicit operator instruction.

## Rollout

- **Immediate effect on acceptance.** Once accepted, the AGENTS.md rule is binding for all agent sessions. No migration period needed — the rule is procedural, not structural.
- **fo-skill update.** The modified `fo-session-retro/SKILL.md` takes effect immediately. No build or codegen step is required — skills are read by agents at invocation time.
- **No new commands.** No CLI command is added, no pipeline is modified, no validator is introduced. Enforcement is through agent discipline and code review (fo-review).
- **No generated files.** No generated artifacts need regeneration.
- **Relationship to RFC-0575.** RFC-0575 (session-start) and this RFC (session-end) are independent. Both can be accepted and implemented separately. Together they form a bracket: start → work → end.

## Alternatives considered

- **Auto-commit at session end.** The agent automatically commits all uncommitted changes with an auto-generated message. Rejected — auto-generated commit messages are often inaccurate, and the agent may sweep foreign changes from other sessions into the commit. The operator should decide what to commit and with what message.

- **Amendment to RFC-0575.** Extend RFC-0575 to cover both session-start and session-end. Rejected — RFC-0575 is already implemented and archived. Amending an archived RFC complicates the lifecycle. Session-start and session-end are separate concerns with different triggers (automatic vs. operator signal), different rules, and different skill modifications. A separate RFC is cleaner.

- **New DNA invariant (DNA-58).** Rejected — DNA invariants describe architecture, not agent process. Session hygiene rules live in AGENTS.md, not in DNA. This follows the precedent set by RFC-0575, which also has `satisfies: []`.

- **Report-only without asking.** The agent reports uncommitted changes but does not offer to commit. Rejected — the operator may not know the correct commit path (`mission.git.commit` vs. `ecosystem.commit` vs. `git commit`). Offering to commit with the appropriate path is more helpful and reduces the chance of the operator using the wrong command.

- **Mandatory retro at every skill pipeline completion.** Trigger the retro after `fo-idea-implement`, `fo-fix`, `fo-review`, etc. Rejected — skill pipelines are mid-session events, not session ends. The operator may continue working after a pipeline completes. Triggering a full retro (with insight triage and delegation) after every pipeline is excessive and disrupts workflow. The retro belongs at session end, triggered by the operator.

## Risks

- **Agent non-compliance.** The soft guard depends on agent discipline. An agent that does not recognize the operator's session-end signal or skips the retro will not be caught by a tooling-level guard. Mitigation: the rule is NON-NEGOTIABLE in AGENTS.md, and the session-end signal vocabulary is documented with common phrases in both English and Russian.

- **Operator closes chat without signaling.** If the operator closes the chat without saying "we're done" or similar, the retro does not run. This is the same behavior as today — the retro is a soft guard, not a hard enforcement mechanism. The next session's pre-flight check (RFC-0575) will discover any dirty tree.

- **Skill drift.** If `fo-session-retro/SKILL.md` is regenerated or updated by another RFC, the git hygiene pre-step may be lost. Mitigation: the AGENTS.md rule is the primary enforcement surface; the skill step is a convenience that reinforces it.

- **False sense of safety.** Operators may assume the session-end retro prevents all uncommitted changes from escaping. It does not — it only catches changes when the operator explicitly signals session end. Mitigation: the rule text is explicit about the trigger condition.

- **Workpiece path resolution.** If `systems/registry.yaml` has a stale `currentMission` pointing to a non-existent workpiece, the check silently skips it. This is acceptable — a missing workpiece has no changes to check. This mirrors RFC-0575's behavior.

- **Retro overhead.** The git hygiene check adds a few seconds to session end (two `git status --short` calls). This is negligible compared to the insight triage that follows.

## Acceptance criteria

- [x] `AGENTS.md` includes a new `## Session-end discipline (RFC-0581)` section with the NON-NEGOTIABLE git hygiene check rule (evidence: AGENTS.md:209-221, commit cc4de73)
- [x] `fo-session-retro/SKILL.md` includes a step 1.5 "Git hygiene check" before step 2 (Gather session insights) (evidence: .agents/skills/fo-session-retro/SKILL.md:97-105, commit de84eee)
- [x] The git hygiene check procedure covers both werkstatt root and active mission workpieces (evidence: AGENTS.md:213, .agents/skills/fo-session-retro/SKILL.md:101-102)
- [x] The rule explicitly states the agent does not auto-commit — the operator decides (evidence: AGENTS.md:219)
- [x] The session-end trigger vocabulary includes both English and Russian phrases (evidence: AGENTS.md:211 — English "we're done", "that's it", Russian "на этом всё", "мы закончили", German "das war's", "wir sind fertig")
- [x] `rfc.validate` passes on this file before merging (evidence: `pnpm exec werkstatt run rfc.validate RFC-0581 --json` → status: pass, zero violations)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- This RFC modifies `.agents/skills/fo-session-retro/SKILL.md`. This is a skill instruction file, not generated code — edit it directly.
- This RFC adds a new `## Session-end discipline (RFC-0581)` section to `AGENTS.md`. Place it after `## Commit discipline (RFC-0480)` and before the next existing section.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id <this-rfc-id> --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
