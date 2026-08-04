---
id: RFC-0683
title: "RTK prefix in all agent instruction command blocks"
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
createdAt: 2026-08-04
updatedAt: 2026-08-04
enhancedAt: 2026-08-04
implementedAt: 2026-08-04
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0681
  - RFC-0374
  - RFC-0393
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
  - packages/forge
successSignals:
  - "All command blocks in AGENTS.md, .windsurfrules, PREFERENCES.md, and SKILL.md files use `rtk` prefix"
  - "Graceful degradation rule documented: if RTK is not installed, commands run without `rtk` prefix"
  - "Forge skills include RTK prefix in command examples with optional degradation note"
  - "`ref()` bindings in skill files are not prefixed with `rtk`; rule clarifies that `rtk` is added after binding resolution"
nonGoals:
  - "Making RTK installation mandatory for Forge consumers"
  - "Adding RTK as a forge dependency or bundling RTK binaries"
  - "Changing RTK configuration or initialization flow (covered by RFC-0681)"
  - "Adding `rtk` prefix to archived mission workpieces or docs/rfcs/archive/"
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

# RFC-0683: RTK prefix in all agent instruction command blocks

## Context

RTK (Rust Token Killer) is a CLI proxy that filters and compresses terminal command output before it reaches the LLM context, cutting up to 90% of bash output on common operations. It is installed once per machine and shared across all Forge projects.

The `.windsurfrules` file (lines 34–65) declares the RTK usage rule: "Always prefix shell commands with `rtk` to minimize token consumption." The `forge-bootstrap` skill (§6.10, RFC-0681) installs RTK as a mandatory setup step with cross-platform support.

However, **no other agent instruction file uses the `rtk` prefix in its command examples**. A comprehensive audit found 40+ files with command blocks that omit `rtk`:

- **Root `AGENTS.md`** — 8 command blocks (`pnpm exec site-kernel run mission.git.commit`, `pnpm exec site-kernel run ecosystem.commit`, `git add`, `git commit`, `pnpm exec site-kernel run props.types.generate`, `pnpm exec site-kernel run uni.registry.build`, etc.)
- **`PREFERENCES.md`** — `git status` in pre-response checklists
- **All 33 Forge skill files** (`packages/forge/skills/**/*.SKILL.md`) — `pnpm --filter`, `git status`, `git diff`, `git add`, `git commit`, `pnpm exec site-kernel run`, `pnpm exec forge`, `find`, `cat`, `git rev-parse`, `git fetch`, `git checkout`, `git am`, `git push`
- **15+ nested `packages/*/AGENTS.md`** — `pnpm --filter <pkg> build:check` / `test` blocks
- **`docs/authoring/*.md`**, **`docs/specs/*.md`**, **`docs/implementation/*.md`** — dozens of `pnpm exec site-kernel run` and `wrangler` commands

This creates a cognitive dissonance: agents read the rule "always prefix shell commands with `rtk`" in `.windsurfrules`, but every example they see in AGENTS.md, SKILL.md, and docs/ shows commands **without** `rtk`. Agents copy the examples, not the rule.

## Problem

The RTK usage rule is declared but not reflected in any command example that agents see. This means:

1. **Agents copy examples, not rules.** When an agent reads `AGENTS.md` § Commit discipline and sees `pnpm exec site-kernel run mission.git.commit`, it runs that command verbatim — without `rtk`. The `.windsurfrules` rule is in a different file that the agent may not re-read for every command.
2. **No graceful degradation.** The current rule says "always prefix" but does not address what happens when RTK is not installed. Forge consumers (external npm users) may not have RTK. The rule should explicitly state that commands work without `rtk` — RTK is an optimization, not a dependency.
3. **`ref()` bindings are ambiguous.** Skill files use `ref(forge.yaml bindings.commands.validateRfc)` which resolves to `pnpm exec site-kernel run rfc.validate`. It is unclear whether `rtk` should wrap the `ref()` reference or the resolved command.

## Decision

All command blocks in agent instruction files (AGENTS.md, .windsurfrules, PREFERENCES.md, SKILL.md, and docs/*.md) use the `rtk` prefix. The RTK usage rule is updated to include graceful degradation: if RTK is not installed, commands run without the `rtk` prefix. Forge skills include `rtk` in command examples with a note that RTK is optional. `ref()` binding references are not prefixed with `rtk` in examples; the rule clarifies that `rtk` is added after binding resolution.

## Architectural fit

- **Root AGENTS.md cross-platform rule:** Forge must remain cross-platform. The graceful degradation clause ensures Forge works without RTK on any platform.
- **DNA-54 (Forge bindings contract):** `ref()` references in skill files are not prefixed with `rtk` — the `rtk` prefix is added after the binding is resolved to a concrete command. This preserves the binding abstraction.
- **RFC-0681 (Cross-platform RTK install):** Complementary — RFC-0681 handles installation, this RFC handles the usage rule and command examples.
- **RFC-0374 (Forge governance ecosystem):** Forge skills are portable governance artifacts. Adding `rtk` to command examples in skills is safe because the graceful degradation rule is also part of the skill instructions.
- **RFC-0393 (Forge bindings contract):** No binding changes needed — the `rtk` prefix is a presentation convention in command examples, not a forge.yaml binding.

## Design

### Updated RTK usage rule

The `.windsurfrules` RTK section (lines 34–65) is updated to include graceful degradation:

```markdown
# RTK - Rust Token Killer (Windsurf)

**Usage**: Token-optimized CLI proxy for shell commands.

## Rule

Always prefix shell commands with `rtk` to minimize token consumption. If RTK
is not installed (check once at session start via `rtk --version`), run commands
without the `rtk` prefix — RTK is an optimization, not a dependency.

## Session-start check

At the start of each session, run `rtk --version` once. If it succeeds, use
`rtk` as a prefix for all subsequent shell commands. If it fails, proceed
without `rtk` for the entire session.

## ref() bindings

When a skill instruction uses `ref(forge.yaml bindings.commands.<key>)`, do not
prefix the `ref()` with `rtk`. Instead, add `rtk` after the binding is resolved
to a concrete command. Example: `ref(forge.yaml bindings.commands.validateRfc)`
resolves to `pnpm exec site-kernel run rfc.validate` — run as
`rtk pnpm exec site-kernel run rfc.validate`.
```

### AGENTS.md rule addition

A new section is added to root `AGENTS.md` after the existing commit discipline section:

```markdown
## RTK usage (token optimization)

All shell commands in agent instructions should be prefixed with `rtk` to
minimize token consumption. If RTK is not installed, commands run without the
`rtk` prefix — RTK is an optimization, not a dependency.

At the start of each session, check once: `rtk --version`. If it succeeds, use
`rtk` as a prefix for all subsequent shell commands. If it fails, proceed
without `rtk` for the entire session.

When a skill instruction uses `ref(forge.yaml bindings.commands.<key>)`, add
`rtk` after the binding is resolved to a concrete command — do not prefix the
`ref()` reference itself.
```

### Command block updates

All command blocks in the following files are updated to use `rtk` prefix:

| File category | Example files | Change |
| --- | --- | --- |
| Root instructions | `AGENTS.md`, `.windsurfrules`, `PREFERENCES.md` | Add `rtk` prefix to all command blocks |
| Forge skills | `packages/forge/skills/**/*.SKILL.md` | Add `rtk` prefix to direct commands; leave `ref()` references unchanged; exempt RTK's own install/init/diagnostic commands (see below) |
| Nested AGENTS.md | `packages/*/AGENTS.md`, `services/*/AGENTS.md` | Add `rtk` prefix to all command blocks |
| Authoring docs | `docs/authoring/*.md` | Add `rtk` prefix to all command blocks |
| Spec docs | `docs/specs/**/*.md` | Add `rtk` prefix to all command blocks |
| Implementation docs | `docs/implementation/*.md` | Add `rtk` prefix to all command blocks |
| Other docs | `docs/policies/*.md`, `docs/COMMANDS.md` | Add `rtk` prefix to all command blocks |

**Excluded:** `missions/archive/**`, `docs/rfcs/archive/**`, `docs/audits/**`, `docs/reviews/**` — archived and historical files are not updated.

### RTK's own commands exemption

Commands that install, initialize, or diagnose RTK itself are **exempt** from the `rtk` prefix rule. These commands are either RTK commands already (`rtk --version`, `rtk init`, `rtk gain`) or are commands that run before RTK is available (`curl | sh`, `cargo install`, `Invoke-WebRequest`). Prefixing them with `rtk` is paradoxical or redundant.

Exempt command patterns:

- `rtk --version` — RTK detection command (already an `rtk` command)
- `rtk init` — RTK initialization (already an `rtk` command)
- `rtk gain` — RTK diagnostics (already an `rtk` command)
- `curl -fsSL ... | sh` — RTK install script (runs before RTK is available)
- `cargo install --git ...` — RTK install via Cargo (runs before RTK is available)
- `Invoke-WebRequest ... -OutFile rtk.exe` — RTK install on Windows (runs before RTK is available)

These commands appear in `forge-bootstrap` SKILL.md §6.10 and must not be prefixed with `rtk`.

### Forge skill note

Forge skills that contain command blocks add a brief note at the top of the first command block:

```markdown
> Commands below assume RTK is installed. To check, run `rtk --version` (this is
> the detection command — it is not prefixed with `rtk` because it IS an `rtk` command).
> If `rtk --version` fails, RTK is not installed — run all commands without the
> `rtk` prefix.
```

This note appears once per skill file, not per command block.

### ref() binding handling

`ref(forge.yaml bindings.commands.<key>)` references in skill files are **not** prefixed with `rtk`. The rule clarifies:

- `ref()` is an abstraction that resolves to a concrete command at runtime.
- The agent adds `rtk` after resolving the binding.
- Example: `ref(forge.yaml bindings.commands.validateRfc) --json` → run as `rtk pnpm exec site-kernel run rfc.validate RFC-XXXX --json`.

### Failure modes

- **RTK not installed:** Agent detects this at session start via `rtk --version`. All commands run without `rtk` prefix. No error, no warning — RTK is optional.
- **RTK installed but hook not active:** Commands run through `rtk` but token savings are zero. This is harmless — `rtk` passes through command output unchanged when the hook is not active.
- **RTK command fails for non-"not found" reasons:** Agent does not retry without `rtk` — the failure is a real command error, not an RTK issue.

## Rollout

- **Documentation-only change.** No source code (`src/`, `os/`) is modified. Only `.md` files and `.windsurfrules` are changed.
- **No new commands.** No CLI commands are added or changed.
- **No migration.** Existing Forge consumers are unaffected — the graceful degradation rule ensures commands work without RTK.
- **Synced copies.** `.agents/skills/<name>/SKILL.md` copies must be updated in the same commit as `packages/forge/skills/<name>/SKILL.md`.
- **Implementation order:**
  1. Update `.windsurfrules` with graceful degradation rule and `ref()` clarification.
  2. Add RTK usage section to root `AGENTS.md`.
  3. Update `PREFERENCES.md` command references.
  4. Update all `packages/forge/skills/**/*.SKILL.md` and sync to `.agents/skills/`.
  5. Update all nested `packages/*/AGENTS.md` and `services/*/AGENTS.md`.
  6. Update `docs/**/*.md` command blocks (authoring, specs, implementation, policies).
- **No build pipeline integration.** This RFC does not add validators or pipeline steps — it is a documentation convention enforced by agent discipline and code review.

## Alternatives considered

- **Strengthen the rule only, without updating examples.** Rejected — agents copy examples, not rules. A rule that says "use rtk" while every example omits it produces cognitive dissonance and inconsistent behavior.
- **Add `rtk` only to warpgogol-specific files, not Forge skills.** Rejected — Forge skills are the primary instruction source for agents. If Forge skills omit `rtk`, agents following skill pipelines will not use `rtk`. The graceful degradation rule covers external consumers without RTK.
- **Prefix `ref()` references with `rtk`.** Rejected — `ref()` is an abstraction layer (DNA-54). Prefixing it with `rtk` breaks the abstraction and confuses agents that do not know about RTK. The rule clarifies that `rtk` is added after binding resolution.
- **Make RTK mandatory.** Rejected — Forge must remain cross-platform and work without RTK. RTK is an optimization, not a dependency. Making it mandatory would break Forge consumers that do not have RTK installed.
- **Add a validator that checks for `rtk` prefix in .md files.** Rejected — this would produce false positives for `ref()` references, inline code mentions, and archived files. The convention is enforced by code review and agent discipline, not by an automated validator.

## Risks

- **Agent confusion about `ref()` handling.** Agents may try to prefix `ref()` with `rtk` despite the rule. Mitigation: the rule explicitly states "do not prefix `ref()`; add `rtk` after binding resolution" with a concrete example.
- **Stale examples in archived files.** Archived mission workpieces and docs/rfcs/archive/ still show commands without `rtk`. Agents reading archived files for reference may copy the old style. Mitigation: archived files are explicitly excluded; agents are instructed to follow current AGENTS.md and skills, not archives.
- **External Forge consumers without RTK.** A consumer sees `rtk` in skill examples but does not have RTK installed. Mitigation: the graceful degradation rule is included in Forge skills and the generated `AGENTS.md`. The skill note says "if `rtk --version` fails, run commands without the `rtk` prefix."
- **Maintenance burden.** Future .md files with command blocks must remember to add `rtk` prefix. Mitigation: the rule in AGENTS.md and .windsurfrules serves as a standing reminder. Code review catches omissions.
- **RTK not installed in CI.** CI environments may not have RTK. Commands in CI scripts (`.github/workflows/*.yml`) are not affected — this RFC only covers agent instruction files (.md), not CI workflow files.

## Acceptance criteria

- [x] `.windsurfrules` RTK section updated with graceful degradation rule and `ref()` clarification (evidence: .windsurfrules:40-56)
- [x] Root `AGENTS.md` has a new "RTK usage" section with graceful degradation and `ref()` rules (evidence: AGENTS.md:264-280)
- [x] `PREFERENCES.md` command references updated with `rtk` prefix (evidence: PREFERENCES.md:56)
- [x] All `packages/forge/skills/**/*.SKILL.md` command blocks updated with `rtk` prefix (direct commands only; `ref()` references unchanged) (evidence: 14 skill files updated, forge.skill.validate passes)
- [x] All `.agents/skills/**/*.SKILL.md` synced with the same changes (evidence: 14 synced copies in .agents/skills/)
- [x] Forge skill files include the RTK-optional note at the first command block (evidence: 14 skill files with note)
- [x] All nested `packages/*/AGENTS.md` and `services/*/AGENTS.md` command blocks updated with `rtk` prefix (evidence: 16 package AGENTS.md files updated, 0 service AGENTS.md files had command blocks)
- [x] `docs/authoring/*.md`, `docs/specs/**/*.md`, `docs/implementation/*.md`, `docs/policies/*.md` command blocks updated with `rtk` prefix (evidence: 18 docs files updated across authoring, specs, policies, implementation, engineering)
- [x] Archived files (`missions/archive/**`, `docs/rfcs/archive/**`, `docs/audits/**`, `docs/reviews/**`) are NOT updated (evidence: git diff shows no archived files modified)
- [x] `forge.skill.validate` passes on all updated skills (evidence: forge.skill.validate --json returns status: pass, zero violations)
- [x] `rfc.validate` passes on this RFC (evidence: rfc.validate --id RFC-0683 --json returns status: pass, zero violations)

## Implementation notes for agents

- Agents MAY implement changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST NOT weaken or remove the graceful degradation rule without a new RFC that supersedes it.
- When updating command blocks, agents MUST add `rtk` prefix to direct shell commands (`pnpm`, `git`, `npm`, `npx`, `node`, `find`, `cat`, `wrangler`, etc.) but MUST NOT prefix `ref()` binding references.
- Agents MUST NOT update archived files (`missions/archive/**`, `docs/rfcs/archive/**`, `docs/audits/**`, `docs/reviews/**`).
- Agents MUST sync `.agents/skills/<name>/SKILL.md` copies in the same commit as `packages/forge/skills/<name>/SKILL.md`.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id <this-rfc-id> --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
