---
id: RFC-0551
title: "Creative register behavioral improvements: capability showcase, always-next-step, and auto-commit"
status: implemented
# kind options: architecture | contract | command | policy | deprecation
kind: architecture
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
createdAt: 2026-07-27
updatedAt: 2026-07-27
enhancedAt: 2026-07-27
implementedAt: 2026-07-27
closedAt:
supersedes: []
supersededBy:
amends:
  - RFC-0547
  - RFC-0548
  - RFC-0549
amendedBy: []
related:
  - RFC-0542
  - RFC-0547
  - RFC-0548
  - RFC-0549
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-54
# DNA-54: the RFC operates within the Forge bindings contract — capability showcase
# text and behavioral layer policy text contain no hardcoded project-specific literals.
# Skill names and capability descriptions are portable Forge constants.
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
  - "forge-bootstrap welcoming report Section 4 shows 3-5 real Forge capabilities tailored to the operator's register (creative vs business)"
  - "In creative register, the agent always proposes a next step — the operator is never left without a concrete, useful suggestion"
  - "In creative register, the agent auto-commits all changes without asking — no dirty files at any pause point"
  - "In business register, the agent asks before committing — the operator retains control over git history"
  - "Capability showcase content differs between creative and business registers"
nonGoals:
  - "Removing the business register's commit-ask behavior — business operators retain control over git"
  - "Generating a full personality profile for the AI agent — that is a separate future RFC"
  - "Changing the welcoming report structure beyond Section 4 content — sections 1-3, 5-6 remain as defined in RFC-0547"
  - "Making the creative register non-interactive — the agent still asks questions, but never about git commits"
# RFC-0268: OPTIONAL machine-checkable acceptance probes, executed on-demand
# via `pnpm exec site-kernel run rfc.acceptance.run --id <this-rfc-id>` (never
# automatically inside build pipelines). Closed probe vocabulary — see
# docs/rfcs/rfc-0268-make-rfc-acceptance-criteria-machine-checkable.md.
# acceptance:
#   - probe: run
#     command: "site-kernel run some.command.validate --app webgogol-com"
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

# RFC-0551: Creative register behavioral improvements: capability showcase, always-next-step, and auto-commit

## Context

RFC-0547 introduced the forge-bootstrap welcoming report with Section 4 ("What you can do now") containing three generic bullet points: "describe an idea", "review changes", "check health". These are too abstract and do not communicate Forge's real value to the operator.

RFC-0548 established the core behavioral layer with register-aware policies. RFC-0549 added the extended behavioral layer for the creative register, including personal connection, creative partnership, and companion mode. However, three gaps remain:

1. **Capability showcase is generic** — the welcoming report does not present concrete, register-tailored capabilities. A creative operator (game designer, writer) sees the same abstract text as a business operator.

2. **Creative register can leave the operator without a next step** — after completing a task or reaching a pause point, the agent may stop without proposing what to do next. RFC-0549's companion mode mentions "gentle accountability" but does not enforce an always-next-step rule.

3. **Creative register asks about commits** — the agent asks "should I commit?" in creative mode, which breaks the creative flow. The operator does not care about git mechanics and should not be interrupted by them.

## Problem

Three behavioral gaps in the creative register are unhandled:

1. **Generic capability showcase** — `packages/forge/skills/meta/forge-bootstrap/SKILL.md` Section 4 (lines 193-199) contains three fixed bullet points ("describe an idea", "review changes", "check health") that do not vary by register. The operator does not learn what Forge can actually do for them.

2. **No always-next-step guarantee in creative mode** — `packages/forge/src/onboarding/extended-behavioral-layer.ts` generates the extended behavioral layer (nine sections), but does not include a rule that the agent must always propose a next step. RFC-0549's "Creative partnership" section includes "Offer one anticipatory suggestion after completing a task" with a limit of "at most one per session" — this is too weak. The operator can be left in a dead end after the single suggestion is used or after a pause point that is not a task completion.

3. **Commit prompts in creative mode** — the core behavioral layer is generated inline by `generateBehavioralLayer()` in `packages/forge/src/onboarding/agents-generate.ts` (lines 71-276). It does not include any commit policy — the agent has no register-conditional guidance on whether to ask before committing. In creative mode, the agent asks "should I commit?" which interrupts the creative process. The operator should never see git-related questions.

## Decision

Three behavioral changes are made:

1. **Capability showcase** — forge-bootstrap welcoming report Section 4 presents 3-5 concrete Forge capabilities tailored to the operator's register. Creative register capabilities emphasize creative flow, idea capture, and project growth. Business register capabilities emphasize efficiency, quality, and project management.

2. **Always-next-step in creative mode** — in the creative register, the agent always proposes a concrete next step after any pause point. The operator is never left without a suggestion for what to do next. In business mode, this is optional.

3. **Auto-commit in creative mode** — in the creative register, the agent commits all changes automatically without asking. No dirty files remain at any pause point. In business mode, the agent asks before committing as before.

## Architectural fit

- **DNA-54 (Forge bindings contract)** — extends forge-bootstrap skill content and behavioral layer generation.
- **RFC-0547** (barrier-free onboarding) — amends Section 4 of the welcoming report to be register-specific.
- **RFC-0548** (core behavioral layer) — amends the core behavioral policy to differentiate commit behavior by register.
- **RFC-0549** (extended behavioral layer) — amends the creative companion mode to enforce always-next-step.
- **RFC-0542** (output contract) — capability showcase text uses `aiLanguage`, zero CLI commands.

## Design

### 1. Capability showcase (Section 4 redesign)

The forge-bootstrap SKILL.md Section 4 is replaced with register-specific capability lists. The skill reads the operator's register from `PREFERENCES.md` and selects the appropriate capability set.

**Creative register capabilities (3-5):**

- "Describe an idea and watch it come to life — the system handles all the technical details."
- "Ask the system to remember your creative vision, influences, and audience — it learns with every conversation."
- "Request improvements or new features in your own words — no technical knowledge needed."
- "Get creative recommendations based on your project's content and direction."
- "Ask the system to review your project's coherence and suggest creative directions."

**Business register capabilities (3-5):**

- "Describe a change or feature and the system implements it end-to-end."
- "Request a project health check — the system verifies consistency and reports issues."
- "Ask for a review of recent changes — the system checks quality and alignment."
- "Get recommendations for project improvements based on analysis."
- "Track project decisions and history automatically — nothing is lost."

### 2. Always-next-step in creative mode

The extended behavioral layer (`packages/forge/src/onboarding/extended-behavioral-layer.ts`) gains a new section: **Always-next-step**.

This policy amends and supersedes RFC-0549's "anticipatory suggestions" policy (Creative partnership section, "Offer one anticipatory suggestion after completing a task" with "at most one per session"). In creative register, the "at most one per session" limit is removed — the agent MUST always propose a next step after any pause point, not just once per session.

Policy text added to the generated `AGENTS.md` extended behavioral layer:

> In the creative register, the agent MUST always propose a concrete next step after any pause point — completing a task, answering a question, or reaching a natural stopping point. The operator is never left without a suggestion. The next step must be specific to the operator's project and creative direction, not a generic "what would you like to do?". If the agent cannot think of a useful next step, it asks the operator what they feel inspired to do next — but it never ends a turn with silence.
>
> This policy supersedes the "at most one anticipatory suggestion per session" limit from the Creative partnership section. In creative register, the agent proposes a next step at every pause point, not just once per session.

### 3. Auto-commit in creative mode

The core behavioral layer is generated inline by `generateBehavioralLayer()` in `packages/forge/src/onboarding/agents-generate.ts`. A new **Commit policy** section is added to the generated `AGENTS.md` core behavioral layer:

> In the creative register, the agent commits all changes automatically after each completed logical step (e.g. after implementing a feature, after fixing a bug, after creating a file). The operator is never asked about git, commits, or version control. No dirty files remain at any pause point. In the business register, the agent asks before committing.
>
> Auto-commit does not skip verification — the agent still runs typecheck/build before committing. Auto-commit means the agent does not ask for permission, not that it skips quality checks.
>
> Auto-commit applies to forge projects (bootstrapped projects using `forge create`). It does not affect WGogol mission workpiece commits, which use `mission.git.commit` per the mission lifecycle.
>
> Auto-commit does not fire in companion mode (RFC-0549) — companion mode is pure creative exploration without code changes, so there is nothing to commit.
>
> For RFC implementation, the separate implementation commit and RFC stamp commit pattern is preserved — auto-commit fires after the implementation step, and the stamp is a separate commit.

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/forge/skills/meta/forge-bootstrap/SKILL.md` | Update Section 4 with register-specific capabilities |
| `packages/forge/src/onboarding/agents-generate.ts` | Add register-conditional commit policy to `generateBehavioralLayer()` |
| `packages/forge/src/onboarding/extended-behavioral-layer.ts` | Add always-next-step section (amends RFC-0549 anticipatory suggestions) |
| `packages/forge/AGENTS.md` | Document the new commit policy and always-next-step in the Core/Extended behavioral layer sections |

### Failure modes

- **Operator switches register mid-session** — the agent detects the register change from `PREFERENCES.md` and applies the new commit behavior immediately.
- **Auto-commit fails** (git error, merge conflict) — the agent reports the error in human language and continues. The operator is not asked to resolve git issues in creative mode; the agent handles them.
- **No useful next step available** — the agent asks the operator what they feel inspired to do, rather than leaving them without a suggestion.
- **Auto-commit and undo/rollback** — auto-commit makes undo slightly harder (committed changes require `git reset` rather than discarding uncommitted changes). The agent offers `git reset` as the undo path in creative register and handles it automatically — the operator says "undo that" and the agent reverts the last commit without explaining git mechanics.
- **Companion mode** — auto-commit does not fire in companion mode (RFC-0549). Companion mode is pure creative exploration without code changes; there is nothing to commit.
- **Capability showcase staleness** — if Forge gains new capabilities, the showcase text in SKILL.md may not reflect them. The capability list is maintained in the SKILL.md and updated with each Forge release. `forge.doctor` could warn on version mismatch (already implemented per RFC-0543).

## Rollout

- **Default behavior**: all three changes are active from day one for new onboardings.
- **Existing projects**: re-running `forge-bootstrap` updates the welcoming report and behavioral layer. Re-generating `AGENTS.md` (via `forge.agents.generate`) applies the new behavioral policies.
- **No migration path needed**: these are skill content and behavioral layer changes, not data contract or command changes.

## Alternatives considered

1. **Same capabilities for both registers** — rejected because creative and business operators have different priorities. A creative operator wants to hear about idea capture and creative flow; a business operator wants efficiency and quality checks.

2. **Always-next-step in both registers** — rejected because business operators may prefer to work at their own pace without unsolicited suggestions. The creative register benefits from continuous momentum; the business register benefits from operator control.

3. **Auto-commit in both registers** — rejected because business operators may want to review changes before committing. Creative operators prioritize flow over git mechanics.

## Risks

- **Auto-commit commits unwanted changes** — the agent may commit work-in-progress that the operator is not happy with. Mitigation: the agent commits with descriptive messages, and the operator can always `git reset` or ask the agent to undo.
- **Always-next-step feels pushy** — the operator may feel pressured by constant suggestions. Mitigation: the next step is a suggestion, not a demand. The operator can decline or redirect.
- **Capability showcase becomes stale** — if Forge gains new capabilities, the showcase text may not reflect them. Mitigation: the capability list is maintained in the SKILL.md and updated with each Forge release.
- **Agent misinterpretation** — agents may apply auto-commit in business mode. Mitigation: the behavioral layer text must clearly state the register condition.

## Acceptance criteria

- [x] forge-bootstrap SKILL.md Section 4 shows 3-5 register-specific capabilities (evidence: packages/forge/skills/meta/forge-bootstrap/SKILL.md:214-228, creative register 5 capabilities, business register 5 capabilities)
- [x] Creative register capabilities differ from business register capabilities (evidence: packages/forge/skills/meta/forge-bootstrap/SKILL.md:214-228, creative emphasizes creative flow/idea capture/companion mode/visual previews, business emphasizes efficiency/quality/health checks/decision tracking)
- [x] Extended behavioral layer includes always-next-step policy for creative register that supersedes RFC-0549's "at most one anticipatory suggestion per session" limit (evidence: packages/forge/src/onboarding/extended-behavioral-layer.ts:85-91, section 10 "Always-next-step" with supersession note)
- [x] Core behavioral layer (`agents-generate.ts` `generateBehavioralLayer()`) includes register-conditional commit policy stating that in creative register the agent auto-commits without asking, and in business register the agent asks before committing (evidence: packages/forge/src/onboarding/agents-generate.ts:269-278, "### Commit policy" section with register-conditional text)
- [x] Generated AGENTS.md commit policy specifies that auto-commit does not skip verification, does not fire in companion mode, and preserves separate implementation/stamp commits for RFC implementation (evidence: packages/forge/src/onboarding/agents-generate.ts:274-277, four bullet points covering verification, companion mode, forge projects scope, and RFC implementation separate commits)
- [x] No CLI commands appear in capability showcase text (per RFC-0542) (evidence: forge.skill.validate passed with 0 SKILL-11 violations; grep for pnpm/fo-idea/fo-fix/fo-review in SKILL.md Section 4 returns no matches)
- [x] `rfc.validate` passes on this file before merging (evidence: rfc.validate RFC-0551 --json, exitCode: 0, status: pass, 3 V-19 warnings only)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST NOT ask about git commits in creative register — auto-commit is mandatory.
- Agents MUST NOT leave the operator without a next step in creative register — always propose something.
- Agents MUST NOT apply auto-commit in business register — asking is mandatory there.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id <this-rfc-id> --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
