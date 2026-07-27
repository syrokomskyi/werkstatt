---
id: RFC-0534
title: "Setup ecosystem skill and onboarding hook configuration"
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
createdAt: 2026-07-25
updatedAt: 2026-07-25
enhancedAt: 2026-07-26
implementedAt: 2026-07-25
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0533
  - RFC-0532
  - RFC-0346
  - RFC-0388
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-53
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
successSignals:
  - "setup-ecosystem skill exists at .agents/skills/setup-ecosystem/SKILL.md and is invocable by AI agents"
  - "setup-ecosystem skill configures git core.hooksPath to hooks/ and verifies hooks/pre-commit is executable"
  - "setup-ecosystem skill verifies ecosystem.commit command is registered and callable"
  - "fo-onboard skill Prepare step verifies git config core.hooksPath is set to hooks/ and configures it if missing"
  - ".env.example documents ECOSYSTEM_COMMIT env var with a comment explaining its transient purpose"
  - "README.md Quick start section includes git config core.hooksPath hooks/ and references setup-ecosystem skill"
nonGoals:
  - "Do not implement the ecosystem.commit command itself — that is RFC-0533's scope"
  - "Do not implement the pre-commit hook script — that is RFC-0533's scope"
  - "Do not add ECOSYSTEM_COMMIT to .env files (persistent runtime config) — it is a transient env var set by ecosystem.commit, not a persistent configuration value. Documenting it in .env.example (documentation template) is in scope; adding it to .env (active config) is not."
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

# RFC-0534: Setup ecosystem skill and onboarding hook configuration

## Context

RFC-0533 introduces `ecosystem.commit` and a versioned pre-commit hook at `hooks/pre-commit`. However, the hook is only active when `git config core.hooksPath hooks/` is configured. Without this step, the hook is inert and direct `git commit` bypasses the version-bump workflow.

The WGogol platform is designed to be installed by operators outside the core team. The onboarding flow (`fo-onboard` skill → `onboarding.synthesize` → `sternsystem.register` → `mission.materialize`, per RFC-0532) and skill ecosystem (`.agents/skills/`) are the primary setup paths. Currently, neither includes git hook configuration. An operator who clones the repository and runs `pnpm install` gets a working build but no pre-commit enforcement.

This RFC closes the setup gap by introducing a `setup-ecosystem` skill and extending onboarding to configure hooks automatically.

## Problem

RFC-0533's pre-commit hook requires `git config core.hooksPath hooks/` to be activated. This is a manual one-time step that:

1. **Is undocumented** — no README section, no onboarding step, no skill references this configuration.
2. **Is easy to forget** — an operator who clones the repo and runs `pnpm install` has no indication that hooks need activation.
3. **Is not reproducible** — without a skill or onboarding step, each operator discovers and applies the configuration independently, leading to inconsistent setups.

The `.env.example` file (RFC-0388) documents persistent environment variables but does not mention the `ECOSYSTEM_COMMIT` transient env var used by `ecosystem.commit`. While this variable is not operator-configured (it is set programmatically by `ecosystem.commit`), its absence from documentation means operators and agents have no reference for understanding the hook's env-var gate mechanism.

## Decision

The ecosystem gains a `setup-ecosystem` skill at `.agents/skills/setup-ecosystem/` that automates the full local setup:

1. Configures `git config core.hooksPath hooks/` to activate the versioned pre-commit hook from RFC-0533.
2. Verifies `hooks/pre-commit` exists and is executable.
3. Verifies `ecosystem.commit` command is registered and callable via `site-kernel run ecosystem.commit --dry-run --message "test"`.
4. Documents the `ECOSYSTEM_COMMIT` transient env var in `.env.example` with a comment explaining it is set programmatically by `ecosystem.commit`, not by the operator.

The `fo-onboard` skill's Prepare step (step 2) gains a prerequisite check: it verifies `git config core.hooksPath` is set to `hooks/` and configures it if missing, so new operators get the hook without a manual action.

`README.md` Quick start section gains `git config core.hooksPath hooks/` alongside `git lfs install`, with a reference to the `setup-ecosystem` skill for operators who clone the repository without going through onboarding.

## Architectural fit

- **RFC-0533 (ecosystem.commit):** This RFC depends on RFC-0533 for the `hooks/pre-commit` script and `ecosystem.commit` command. The skill verifies their existence but does not implement them.
- **DNA-53 (semantic fingerprint governance):** This RFC protects DNA-53 indirectly. The setup skill activates the pre-commit hook → the hook enforces `ecosystem.commit` usage for platform-scope changes → `ecosystem.commit` computes the `platformSemanticHash` using `@gogol/fingerprint` (DNA-53). Without the hook activation, operators can bypass `ecosystem.commit` via direct `git commit`, producing commits without DNA-53-compliant hashes. By automating hook activation, this RFC closes the bypass gap.
- **RFC-0346 / RFC-0388 (.env.example mandate):** The `.env.example` convention (RFC-0346, updated by RFC-0388, DNA-40) requires every environment variable to be documented with a comment and a `# How to obtain:` line. `ECOSYSTEM_COMMIT` is a transient programmatic variable, not a persistent configuration value, but documenting it in `.env.example` follows the spirit of the convention: anyone reading `.env.example` should understand all env vars the ecosystem uses. The `# How to obtain:` line will read: "Set programmatically by ecosystem.commit; not configured by the operator."
- **RFC-0532 (onboarding modernization):** RFC-0532 removed `onboarding.scaffold` and restructured the onboarding flow into `fo-onboard` skill → `onboarding.synthesize` → `sternsystem.register` → `mission.materialize`. This RFC targets the `fo-onboard` skill's Prepare step for hook configuration, not the removed `onboarding.scaffold` command.
- **Skill ecosystem:** Skills live in `.agents/skills/` (e.g. `grilling`, `fo-*` skills). The `setup-ecosystem` skill is project-specific (WGogol-only), not a portable forge skill — it references `hooks/pre-commit` and `ecosystem.commit` which are WGogol-specific. It follows the same structure: `SKILL.md` with frontmatter and instructions.
- **Onboarding flow:** The `fo-onboard` skill (`.agents/skills/fo-onboard/SKILL.md`, source at `packages/forge/skills/fo/fo-onboard/SKILL.md`) is the primary setup path for new Sternsystemen. Adding a `git config core.hooksPath hooks/` prerequisite check to its Prepare step ensures hooks are active from day one without manual intervention.
- **Operator preference (RFC-0370):** The operator prefers automation through skills over manual documentation. This RFC follows that preference: the skill automates setup, fo-onboard automates for new operators, README is the fallback for manual clone.

## Design

### CLI surface

The `setup-ecosystem` skill is invoked by AI agents, not directly by a kernel command:

```sh
# Agent-invoked skill (reads SKILL.md and follows instructions)
# The skill performs:

# 0. Verify prerequisites
 test -d node_modules || echo "Run pnpm install first"

# 1. Configure git hooks
git config core.hooksPath hooks/
chmod +x hooks/pre-commit

# 2. Verify ecosystem.commit is registered
node packages/os/site-kernel/bin/site-kernel.mjs run ecosystem.commit --dry-run --message "setup verification"
```

No new kernel command is added. The skill is a set of instructions in `.agents/skills/setup-ecosystem/SKILL.md` that an AI agent reads and executes. The skill is project-specific (WGogol-only), not a portable forge skill.

### TypeScript contracts

No new TypeScript types are introduced. The skill is a markdown instruction file, not a code module.

### File system responsibilities

| Path | Role |
| --- | --- |
| `.agents/skills/setup-ecosystem/SKILL.md` | New project-specific skill file — instructions for AI agents to configure the ecosystem. |
| `hooks/pre-commit` | Verified by the skill — must exist and be executable. Implemented by RFC-0533. |
| `.env.example` | Updated — `ECOSYSTEM_COMMIT` documented with a transient-purpose comment and `# How to obtain:` line. |
| `README.md` | Updated — Quick start section gains `git config core.hooksPath hooks/` and references `setup-ecosystem` skill. |
| `.agents/skills/fo-onboard/SKILL.md` | Updated — Prepare step (step 2) gains prerequisite check for `git config core.hooksPath hooks/`. |
| `packages/forge/skills/fo/fo-onboard/SKILL.md` | Updated — forge skill source mirror of `.agents/skills/fo-onboard/SKILL.md`. |

### Output format

Not applicable — the skill produces human/agent-readable output via terminal commands, not a structured JSON response. The skill reports success or failure of each step (prerequisites check, git config, chmod, ecosystem.commit --dry-run) to the agent, which relays the result to the operator.

### Failure modes

| Condition | Exit code | Behavior |
| --- | --- | --- |
| `node_modules/` does not exist | 1 | Skill reports: "node_modules/ not found. Run `pnpm install` first." and aborts. |
| `hooks/pre-commit` does not exist | 1 | Skill reports: "hooks/pre-commit not found. Ensure RFC-0533 is implemented." and aborts. |
| `ecosystem.commit` not registered | 1 | Skill reports: "ecosystem.commit command not found. Ensure RFC-0533 is implemented." and aborts. |
| `git config core.hooksPath hooks/` fails | 1 | Skill reports the git error and suggests checking repository permissions. Aborts. |
| All steps pass | 0 | Skill reports: "Ecosystem setup complete. Hooks configured, ecosystem.commit verified." |

## Rollout

- **Default behavior:** The `setup-ecosystem` skill is available immediately upon implementation. Operators can invoke it at any time.
- **Existing operators:** run the `setup-ecosystem` skill once to configure hooks and verify the ecosystem.
- **New operators:** get hooks automatically through the `fo-onboard` skill's Prepare step, which checks and configures `git config core.hooksPath hooks/`.
- **Manual clone fallback:** `README.md` Quick start section documents `git config core.hooksPath hooks/` and references the `setup-ecosystem` skill for operators who clone without onboarding.
- **No CI integration:** This RFC is developer-experience only. No new CI gates are added. CI enforcement is RFC-0533's PC-04.

## Alternatives considered

- **Documentation-only (no skill)** — add a README section explaining `git config core.hooksPath hooks/` and `ECOSYSTEM_COMMIT`. Rejected because the operator prefers automation through skills over manual documentation. A skill is invocable by AI agents and ensures reproducible setup.

- **Separate `setup-hooks` skill** — narrow skill only for git hooks, with `setup-ecosystem` as a future umbrella. Rejected in favor of a single `setup-ecosystem` skill that covers hooks, env documentation, and command verification. One skill is simpler to discover and invoke.

- **Husky for hook management** — rejected for the same reasons as in RFC-0533: adds a dependency for a single hook file. `core.hooksPath` is dependency-free.

## Risks

- **Skill staleness** — if RFC-0533 adds new hooks or env vars, the `setup-ecosystem` skill must be updated. Mitigated by the skill's verification step: it checks `ecosystem.commit` is callable, which would fail if the command is removed or renamed.

- **Onboarding coupling** — adding a hook-configuration prerequisite check to the `fo-onboard` skill couples onboarding to RFC-0533. If RFC-0533 is superseded, `fo-onboard` must be updated. This is acceptable — `fo-onboard` already depends on many platform contracts.

- **`.env.example` confusion** — documenting a transient env var in `.env.example` may confuse operators who expect all variables there to be persistent configuration. Mitigated by a clear comment: "Set programmatically by ecosystem.commit, not by the operator."

## Acceptance criteria

- [x] `.agents/skills/setup-ecosystem/SKILL.md` exists with setup instructions (evidence: .agents/skills/setup-ecosystem/SKILL.md, commit 972ebf1f6)
- [x] Skill verifies `pnpm install` has been run (checks for `node_modules/`) (evidence: .agents/skills/setup-ecosystem/SKILL.md step 1 "Verify prerequisites")
- [x] Skill configures `git config core.hooksPath hooks/` and verifies `hooks/pre-commit` is executable (evidence: .agents/skills/setup-ecosystem/SKILL.md steps 2-3)
- [x] Skill verifies `ecosystem.commit` command is registered via `--dry-run` invocation (evidence: .agents/skills/setup-ecosystem/SKILL.md step 4)
- [x] `.env.example` includes `ECOSYSTEM_COMMIT` with a comment and `# How to obtain:` line explaining its transient programmatic purpose (evidence: .env.example:13-15)
- [x] `fo-onboard` skill Prepare step (step 2) verifies `git config core.hooksPath` is set to `hooks/` and configures it if missing (evidence: .agents/skills/fo-onboard/SKILL.md:46)
- [x] `packages/forge/skills/fo/fo-onboard/SKILL.md` is updated to mirror `.agents/skills/fo-onboard/SKILL.md` (evidence: packages/forge/skills/fo/fo-onboard/SKILL.md:46, identical text)
- [x] `README.md` Quick start section includes `git config core.hooksPath hooks/` and references the `setup-ecosystem` skill (evidence: README.md:50-51 and README.md:67)
- [x] `rfc.validate` passes on this file before merging (evidence: rfc.validate RFC-0534 --json returned status: pass, zero violations)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- For RFCs created on or after 2026-07-07 with acceptance probes: before stamping `implemented`, run `site-kernel run rfc.verification.emit --id <this-rfc-id>` and commit the evidence file in the same commit (RFC-0330 amended transition precondition).
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id <this-rfc-id> --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
- **Dependency on RFC-0533:** This RFC depends on RFC-0533 being implemented first. The `setup-ecosystem` skill verifies `hooks/pre-commit` and `ecosystem.commit` exist; if they do not, the skill reports the missing dependency.
- **Skill invocation:** Agents MUST invoke the `setup-ecosystem` skill when setting up a new development environment or after cloning the repository without onboarding.
- **fo-onboard prerequisite:** The `fo-onboard` skill's Prepare step (step 2) MUST check `git config core.hooksPath` and configure it to `hooks/` if missing. This is a non-blocking prerequisite — if the config is already set, the skill proceeds without action.
- **Project-specific skill:** The `setup-ecosystem` skill is project-specific (WGogol-only) and lives at `.agents/skills/setup-ecosystem/SKILL.md`. It is NOT a portable forge skill and must not be added to `packages/forge/skills/`.
