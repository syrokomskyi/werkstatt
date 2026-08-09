---
id: RFC-0552
title: "Forge bootstrap hardening: git init for greenfield, commit synced skills, and report skill name conflicts"
status: implemented
enhancedAt: 2026-07-27
# kind options: architecture | contract | command | policy | deprecation
kind: command
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
implementedAt: 2026-07-27
closedAt:
supersedes: []
supersededBy:
amends:
  - RFC-0545
  - RFC-0546
amendedBy: []
related:
  - RFC-0539
  - RFC-0542
  - RFC-0543
  - RFC-0545
  - RFC-0546
  - RFC-0547
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
# This RFC is a hardening/bugfix — it does not establish or extend a DNA invariant.
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
  - "Greenfield forge-bootstrap runs git init and commits the initial project state including .agents/skills/"
  - "After skill sync, forge-bootstrap commits .agents/skills/ to git with a descriptive message"
  - "When a pack skill has the same name as a Forge skill, the Forge skill takes priority and the pack skill is skipped (not overwritten)"
  - "The operator is informed which skills were skipped and why (name conflict with Forge skill)"
  - "forge.upgrade detects and reports skill name conflicts instead of silently overwriting custom skills"
  - "No skill silently overwrites another skill with the same name during init or upgrade"
nonGoals:
  - "Merging skills with the same name — conflicts are resolved by Forge priority, not by merging content"
  - "Preserving overwritten skill content in a backup directory — the operator is told which skills were skipped, not where to find them"
  - "Changing the skill sync mechanism itself — this RFC adds git init for greenfield, skill commit, and conflict reporting"
  - "Adding git init to forge.create — git init belongs in forge-bootstrap (interactive layer), not forge.create (non-interactive scaffold)"
  - "Handling transplant source .agents/skills/ conflicts — the migration adapter copies source .agents/skills/ to apps/<appName>/.agents/skills/, not to the forge project root"
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

# RFC-0552: Forge bootstrap hardening: git init for greenfield, commit synced skills, and report skill name conflicts

## Context

RFC-0545 introduced forge-bootstrap with greenfield and transplant modes. RFC-0546 added the migration-adapter registry and removed `forge.init` as a standalone CLI command — `runInit()` remains as an internal function called by `forge.create`. RFC-0547 added barrier-free onboarding with git history transfer via `git format-patch` + `git am`. RFC-0539 introduced pack skills discovered via `discoverPackSkills`. RFC-0543 introduced `forge.upgrade` for additive skill sync.

The transplant flow already handles git init via `runPostSetup()` in `packages/forge/src/migration-adapters/git-utils.ts` — it runs `git init` when `.git` is absent and transfers git history when present. However, three gaps remain in the broader bootstrap flow:

1. **Greenfield mode has no git init** — `forge-bootstrap` greenfield mode (SKILL.md step 6) does not run `git init`. Only transplant mode initializes git (via `runPostSetup`). A greenfield project ends up without version control unless the operator manually runs `git init`.

2. **Synced skills are not committed** — `forge.create` calls `runInit()` which copies Forge skills and pack skills into `.agents/skills/` (`packages/forge/src/onboarding/init.ts:161-164`, `:206-208`). These files are left in the working tree uncommitted. Even when `forge-bootstrap` transplant mode runs `git init`, the skills are not committed — the operator's first `git status` shows untracked files in `.agents/`.

3. **Silent skill overwrites in `runInit()` and `forge.upgrade`** — `runInit()` copies Forge skills and pack skills to `.agents/skills/` without checking if a skill with the same name already exists (`init.ts:161-164`, `:206-208`). `forge.upgrade` has the same issue (`upgrade.ts:64-67`, `:115-118`). If a pack skill has the same name as a Forge skill, the second copy overwrites the first silently. The operator does not know that a skill was overwritten.

## Problem

Three gaps in the forge-bootstrap flow are unhandled:

1. **Greenfield mode: no git init** — `packages/forge/skills/meta/forge-bootstrap/SKILL.md` step 6 greenfield interview does not run `git init`. `forge.create` does not run `git init` either (it only scaffolds and calls `runInit()`). A greenfield project has no version control after onboarding.

2. **Uncommitted synced skills** — `packages/forge/src/onboarding/init.ts` copies skills to `.agents/skills/` but does not commit them. `forge.create` does not commit them either. The operator's first `git status` shows untracked files in `.agents/`.

3. **Silent skill overwrites** — `packages/forge/src/onboarding/init.ts` copies Forge skills and pack skills over existing skills with the same name without warning (`init.ts:161-164` for Forge skills, `:206-208` for pack skills). `packages/forge/src/onboarding/upgrade.ts` has the same issue (`upgrade.ts:64-67` for Forge skills, `:115-118` for pack skills). The operator's original skills are lost without notification.

## Decision

Three hardening changes are made to the forge-bootstrap flow:

1. **Git init for greenfield** — `forge-bootstrap` greenfield mode runs `git init` after the stack interview, before the welcoming report. This mirrors transplant mode's git init behavior.

2. **Commit synced skills** — after `runInit()` copies skills to `.agents/skills/`, `forge-bootstrap` commits them to git with a descriptive message. This happens after `git init` (greenfield) or after `runPostSetup` (transplant), so the operator's first `git status` is clean.

3. **Report skill name conflicts** — `runInit()` and `forge.upgrade` detect skill name conflicts between Forge skills and pack skills. When a conflict is detected, the Forge skill takes priority and the pack skill is skipped (not overwritten). The init/upgrade result includes a list of skipped skills with conflict reasons. `forge-bootstrap` reports the skipped skills to the operator in human language.

## Architectural fit

- **RFC-0539** (portable skill registry) — skill sync mechanism is defined here; conflict detection extends it to handle Forge-vs-pack name collisions.
- **RFC-0543** (forge.upgrade) — `forge.upgrade` has the same skill sync logic as `runInit()`; conflict detection applies to both.
- **RFC-0545** (forge-bootstrap redesign) — amends greenfield mode with git init; amends both modes with skill commit step.
- **RFC-0546** (migration-adapter registry) — amends post-setup phase; transplant git init is already handled by `runPostSetup`.
- **RFC-0547** (barrier-free onboarding) — aligns with the promise of a clean, working project after onboarding.

## Design

### 1. Git init for greenfield

In `packages/forge/skills/meta/forge-bootstrap/SKILL.md`, the greenfield interview (step 6) gains a git init step after the stack bindings are filled:

1. After step 6.3 (stack bindings), check if `.git` exists in the project root.
2. If not, run `git init` and make an initial commit with all project files scaffolded by `forge.create`.
3. If yes, proceed as before (the operator already has git).

This mirrors transplant mode's git init behavior (step 6.5-6.6 via `runPostSetup`).

### 2. Commit synced skills

After `runInit()` copies skills to `.agents/skills/` (called by `forge.create` before `forge-bootstrap` runs), and after `git init` is performed in `forge-bootstrap`, the forge-bootstrap skill commits the skills:

1. `git add .agents/skills/`
2. `git commit -m "chore: sync Forge skills"`

This happens after git init (greenfield step 6.4) or after `runPostSetup` (transplant step 6.6), and before the welcoming report (step 11), so the operator's first `git status` is clean.

For transplant mode, if the operator declined git history transfer and `runPostSetup` ran a clean `git init`, the skill commit is the second commit (after the initial project commit made by `git init`). For greenfield mode, the skill commit is also the second commit (after the initial project commit).

### 3. Report skill name conflicts

In `packages/forge/src/onboarding/init.ts`, the skill copy logic is modified:

1. After copying all Forge skills, before copying pack skills, collect the set of Forge skill names.
2. Before copying each pack skill, check if its name matches a Forge skill name.
3. If a conflict is detected, skip the pack skill (do not overwrite the Forge skill).
4. Collect a list of skipped pack skills with their names and the reason ("conflict with Forge skill").
5. Return this list in the `InitResult` as a new `skippedSkills: { name: string; reason: string }[]` field.
6. `forge-bootstrap` reads the `InitResult` (available from `forge.create` output) and reports skipped skills to the operator in human language.

The same conflict detection is applied in `packages/forge/src/onboarding/upgrade.ts`:

1. `syncPackSkills` checks each pack skill name against the set of Forge skill names.
2. Conflicting pack skills are skipped and reported in the `UpgradeResult` as a new `skippedSkills: { name: string; reason: string }[]` field.

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/forge/skills/meta/forge-bootstrap/SKILL.md` | Add git init step to greenfield mode; add skill commit step to both modes; report skipped skills |
| `packages/forge/src/onboarding/init.ts` | Add conflict detection between Forge skills and pack skills; add `skippedSkills` to `InitResult` |
| `packages/forge/src/onboarding/upgrade.ts` | Add conflict detection between Forge skills and pack skills; add `skippedSkills` to `UpgradeResult` |
| `packages/forge/AGENTS.md` | Document git init for greenfield, skill commit, and conflict reporting behavior |

### Failure modes

- **`git init` fails** — report the error and continue without git. The operator is informed that version control could not be initialized. Skills are still present in the working tree but uncommitted.
- **`git commit` fails** (nothing to commit, git error) — report the error and continue. Skills are still present in the working tree.
- **Pack skill and Forge skill have same name but different content** — the Forge skill wins. The operator is told which pack skills were skipped. If the operator wants to keep the pack skill, they can rename it after onboarding.
- **`forge.create` does not expose `InitResult.skippedSkills` to `forge-bootstrap`** — `forge-bootstrap` cannot report skipped skills if `forge.create` does not pass the result through. Mitigation: `forge.create` stores the `InitResult` in its command result data, and `forge-bootstrap` reads it.

## Rollout

- **Default behavior**: all three changes are active from day one for new forge-bootstrap runs (greenfield and transplant).
- **Existing projects**: not affected — these changes only apply during the bootstrap flow. `forge.upgrade` conflict detection applies on the next upgrade run.
- **Greenfield projects**: git init is now handled by `forge-bootstrap` greenfield mode (previously missing).
- **Transplant projects**: git init was already handled by `runPostSetup`; this RFC adds the skill commit step.

## Alternatives considered

1. **Merge pack skills and Forge skills on conflict** — rejected because merging skill content is complex and error-prone. Forge skills are maintained and versioned; pack skills may be outdated or incompatible. Priority approach is simpler and safer.

2. **Backup overwritten skills before overwriting** — rejected because it creates clutter and the operator may not know where to find the backup. Reporting which skills were skipped is clearer.

3. **Ask the operator on each conflict** — rejected because it interrupts the onboarding flow with technical questions. The operator can rename and restore skills after onboarding if needed.

4. **Run git init in `forge.create` instead of `forge-bootstrap`** — rejected because `forge.create` is non-interactive (RFC-0544). Git init is an interactive-layer decision (the operator may decline git). `forge-bootstrap` is the interactive layer.

## Risks

- **Operator loses custom pack skills silently** — mitigated by the conflict report. The operator is told which pack skills were skipped.
- **git init on a project that should not be versioned** — unlikely, but if the operator does not want git, they can remove `.git` after onboarding.
- **Skill commit includes unrelated files** — mitigated by staging only `.agents/skills/` specifically, not `git add -A`.
- **Agent misinterpretation** — agents may overwrite pack skills despite the conflict rule. Mitigation: the `init.ts` and `upgrade.ts` logic must enforce the skip programmatically, not rely on agent behavior.
- **`forge.create` does not pass `InitResult` to `forge-bootstrap`** — `forge-bootstrap` is an interactive skill, not a CLI command. It reads the project state from disk, not from `forge.create`'s return value. The `skippedSkills` list must be persisted to disk (e.g. in a `.forge-skill-sync-report.json` file) or re-computed by `forge-bootstrap`.

## Acceptance criteria

- [x] forge-bootstrap SKILL.md greenfield mode includes a git init step after stack bindings are filled (evidence: SKILL.md step 6.4)
- [x] After skill sync, forge-bootstrap commits .agents/skills/ to git (both greenfield and transplant modes) (evidence: SKILL.md step 6.9)
- [x] `runInit()` detects skill name conflicts between Forge skills and pack skills, and skips pack skills when Forge skills exist (evidence: init.ts:205-221)
- [x] `InitResult` includes a `skippedSkills` field with conflict reasons (evidence: init.ts:30-43)
- [x] `forge.upgrade` detects skill name conflicts and skips pack skills when Forge skills exist (evidence: upgrade.ts:116-119)
- [x] `UpgradeResult` includes a `skippedSkills` field with conflict reasons (evidence: upgrade.ts:39)
- [x] forge-bootstrap reports skipped skills to the operator in human language (evidence: SKILL.md section 5.1)
- [x] No pack skill silently overwrites a Forge skill during init or upgrade (evidence: init.ts:218-221, upgrade.ts:116-119)
- [x] Unit tests cover conflict detection in `runInit()` and `runUpgrade()` (evidence: init-bindings.test.ts:117, upgrade.test.ts:241)
- [x] `packages/forge/AGENTS.md` documents the git init, skill commit, and conflict reporting behavior (evidence: AGENTS.md:55)
- [x] `rfc.validate` passes on this file before merging (evidence: 0 errors, 0 warnings)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST NOT overwrite pack skills with Forge skills when names conflict — Forge skills take priority, pack skills are skipped.
- Agents MUST NOT skip the conflict report — the operator must be informed of all skipped skills.
- Agents MUST NOT use `git add -A` for the skill commit — stage only `.agents/skills/`.
- Agents MUST NOT add git init to `forge.create` — git init belongs in `forge-bootstrap` (interactive layer).
- Agents MUST apply conflict detection in both `runInit()` and `forge.upgrade` — not just one of them.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id <this-rfc-id> --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
