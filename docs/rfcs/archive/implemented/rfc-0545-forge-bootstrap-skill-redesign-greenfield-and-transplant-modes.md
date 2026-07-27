---
id: RFC-0545
title: "Forge bootstrap skill redesign — greenfield and transplant modes"
status: implemented
# kind options: architecture | contract | command | policy | deprecation
kind: contract
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
createdAt: 2026-07-26
updatedAt: 2026-07-26
enhancedAt: 2026-07-26
implementedAt: 2026-07-26
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy:
  - RFC-0547
  - RFC-0552
related:
  - RFC-0374
  - RFC-0391
  - RFC-0393
  - RFC-0539
  - RFC-0540
  - RFC-0542
  - RFC-0543
  - RFC-0544
  - DNA-54
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-54
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
packagesImpacted:
  - forge
successSignals:
  - "A new operator runs /forge-bootstrap in a fresh forge create project and ends with a configured forge.yaml, working stack bindings, and a first RFC or ADR"
  - "An operator transplanting an external codebase gets a forge project with bindings derived from the source stack without the source folder being modified"
  - "The skill refuses to run outside a forge project (no forge.yaml)"
nonGoals:
  - "Making forge.create interactive — create is non-interactive (RFC-0544); the skill runs after create"
  - "Automatic language detection from file contents — the skill asks; it does not guess"
  - "Migrating source code semantics — transplant copies structure and derives bindings; it does not rewrite business logic"
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

# RFC-0545: Forge bootstrap skill redesign — greenfield and transplant modes

## Context

`forge create` (RFC-0544) produces a project with `forge.yaml`, synced skills, and forge-CLI binding defaults (RFC-0540). What it does not do is fill the stack-dependent bindings (`typecheck`, `test`, `scopedBuild`) — those remain `null` because forge cannot know the project's stack. The operator's requirement is a bootstrap skill that runs after `forge create` and configures the project interactively, with two modes: **greenfield** (new project, full interview) and **transplant** (bring an external codebase into forge's architecture without modifying the source).

A `forge-bootstrap` skill already exists at `packages/forge/skills/meta/forge-bootstrap/SKILL.md` and is registered in `FORGE_SKILLS`. However, it is a minimal first-time deployment skill: it asks for language, runs `forge.init`, and verifies skills. It does **not** fill stack-dependent bindings (`typecheck`, `test`, `scopedBuild`), does **not** offer a transplant mode, and does **not** guide the operator through stack-specific configuration. `forge.create` (RFC-0544) emits `nextSteps` saying "run /forge-bootstrap", but the existing skill leaves the operator with null stack bindings — exactly the manual discipline the bindings contract (DNA-54) was designed to eliminate. This RFC redesigns the existing skill in place.

## Problem

- **Existing skill is insufficient** — the current `forge-bootstrap` skill runs `forge.init` but does not fill stack-dependent bindings or offer transplant. The first-run experience stops at a project skeleton with null stack bindings.
- **Stack bindings stay null** — `typecheck`, `test`, `scopedBuild` are never filled by any forge command or skill. Every fo-skill that requires them degrades or refuses.
- **No transplant path** — an operator with an existing codebase who wants forge governance has no guided way to bring it in. They must manually edit `forge.yaml` bindings and guess stack commands.
- **No language preference capture** — `PREFERENCES.md` (RFC-0370) is not created by `forge.create`; the bootstrap skill is the natural moment to ask.

## Decision

The existing `forge-bootstrap` skill at `packages/forge/skills/meta/forge-bootstrap/SKILL.md` is redesigned in place (portable, `meta` category). It runs only inside a forge project (refuses without `forge.yaml`). It begins with a mode choice: **greenfield** or **transplant**. Greenfield runs an interactive interview (language, stack, package manager, stack bindings) and writes the results into `forge.yaml` and `PREFERENCES.md`. Transplant asks for an external source directory, analyzes its stack, proposes bindings, and fills `forge.yaml` with bindings derived from the source — without modifying the source directory. Forge imposes its architecture; the source is read-only.

## Architectural fit

- **DNA-54 (Forge bindings contract)** — the skill is the dialogue layer that fills the bindings forge cannot default (RFC-0540). It is the human-in-the-loop complement to the machine defaults.
- **RFC-0374 (forge extraction)** — the skill is portable: it runs in any forge project using only forge commands and standard project files.
- **RFC-0393 (degradation contract)** — after bootstrap, required bindings are resolvable; degradation fires only for genuinely optional steps.
- **RFC-0540 (binding defaults)** — the skill fills the null slots that `forge.init` left; it does not touch forge-CLI defaults.
- **RFC-0542 (self-documenting output)** — `forge.create`'s `nextSteps` point to this skill; the skill's own output tells the operator to create a first RFC or ADR.
- **RFC-0544 (forge create)** — the skill is the post-create step; `forge.create` is the non-interactive scaffold, the skill is the interactive configuration.

## Design

### Skill frontmatter

```yaml
# packages/forge/skills/meta/forge-bootstrap/SKILL.md
---
name: forge-bootstrap
description: Configure a freshly created forge project — greenfield or transplant.
invocation: user
concerns: content-mutation
category: meta
dependsOn: ['my-preferences']
languagePolicy: ref(PREFERENCES.md)
bindings:
  requires: []
  optional: []
---
```

The `category` remains `meta` (the existing value) — `ForgeSkillEntry.category` only allows `"fo" | "shared" | "meta"`. The `concerns` changes from `code-mutation` to `content-mutation` because the redesigned skill writes `forge.yaml` (YAML) and `PREFERENCES.md` (Markdown), not executable code. The `bindings` section is emptied: the redesigned skill fills binding keys rather than resolving bindings via `ref()`.

### Mode choice (first step)

The skill opens with:

> Are you starting a new project (greenfield) or bringing an existing codebase into forge (transplant)?

- **greenfield** → full interview
- **transplant** → source-directory interview + analysis

### Greenfield interview

1. **Language** — `aiLanguage` and `documentationLanguage` for `PREFERENCES.md` (RFC-0370).
2. **Stack** — what build/test/typecheck commands does the project use? (free-text; the skill proposes common defaults based on `--profile` if available).
3. **Package manager** — confirm or override `project.packageManager` in `forge.yaml`.
4. **Stack bindings** — fill `commands.typecheck`, `commands.test`, `commands.scopedBuild` in `forge.yaml`.
5. **Write `PREFERENCES.md`** at project root.
6. **Emit next steps** — "Create your first RFC: /fo-idea" or "Create an ADR: /fo-idea-create-adr".

### Transplant interview

1. **Source directory** — absolute path to the external codebase (must be outside the current forge project).
2. **Analyze** — the skill reads the source directory's `package.json` / `tsconfig.json` / `Cargo.toml` / etc. to detect stack, package manager, and existing test/build commands.
3. **Propose** — the skill presents: detected stack, proposed `forge.yaml` bindings, proposed `PREFERENCES.md` language. The operator confirms or edits.
4. **Fill** — the skill fills `forge.yaml` bindings and writes `PREFERENCES.md` in the current forge project (already created by `forge create`). The directories `docs/rfcs/`, `docs/adrs/`, and `.agents/skills/` already exist from `forge create`. It does **not** copy source code into the forge project unless the operator explicitly asks; transplant is about governance structure, not code migration.
5. **Fill bindings** — `typecheck`, `test`, `scopedBuild` are filled from the detected source commands.
6. **Write `PREFERENCES.md`**.
7. **Emit next steps** — "Create an ADR documenting the transplant: /fo-idea-create-adr".

### Guardrails

- The skill refuses to run if `forge.yaml` is absent (not a forge project).
- The skill never modifies the transplant source directory.
- The skill never overwrites forge-CLI binding defaults (RFC-0540); it fills only `null` stack bindings.
- The skill never overwrites an existing `PREFERENCES.md` without operator confirmation; it merges language settings if the file already exists.
- All dialogue uses `PREFERENCES.md` `aiLanguage` if present; the skill creates `PREFERENCES.md` if absent.
- The skill is idempotent: re-running it skips non-null bindings and confirms existing settings rather than overwriting them.

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/forge/skills/meta/forge-bootstrap/SKILL.md` | Skill definition (replaced in place) |
| `forge.yaml` | Stack bindings filled by the skill |
| `PREFERENCES.md` | Created by the skill (greenfield) or created from source analysis (transplant) |
| `docs/rfcs/`, `docs/adrs/` | Already created by `forge create`; the skill points the operator here |
| Transplant source directory | Read-only; never modified |

### Output format

The skill is interactive (agent chat); no `--json` output. The skill's final message is a summary:

```text
Bootstrap complete.
  Mode: greenfield
  Language: en
  Stack bindings: typecheck=tsc --noEmit, test=vitest, scopedBuild=turbo run build
  Preferences: PREFERENCES.md written
Next steps:
  • Create your first RFC: /fo-idea
  • Create an ADR: /fo-idea-create-adr
```

### Failure modes

- Not in a forge project → skill refuses: "no forge.yaml found; run forge create first".
- Malformed `forge.yaml` (invalid YAML or missing `bindings` section) → skill reports the parse error and asks the operator to fix it before re-running.
- Stack binding already non-null → skill skips it (respects operator overrides).
- Transplant source unreadable → skill reports and asks for a different path.
- Transplant source has no recognizable stack manifest (`package.json`, `tsconfig.json`, `Cargo.toml`, etc.) → skill reports that no stack was detected and falls back to the greenfield interview for stack bindings.
- Operator cancels mid-interview → partial changes to `forge.yaml` are left; the skill does not roll back.

## Rollout

1. Replace the existing `packages/forge/skills/meta/forge-bootstrap/SKILL.md` with the redesigned interview flow above.
2. Update the existing `forge-bootstrap` entry in `FORGE_SKILLS` (`packages/forge/src/registry.ts`): change `concerns` from `code-mutation` to `content-mutation` and update the `description` to match the new frontmatter.
3. `forge.init` and `forge.upgrade` sync it into `.agents/skills/` automatically.
4. `forge.create`'s `nextSteps` (RFC-0542) already point to `/forge-bootstrap`; no change needed.
5. Validate with `forge.skill.validate` (SKILL-01..13).
6. Update `packages/forge/AGENTS.md` if the skill description in the Architecture section needs to reflect the redesign.

## Alternatives considered

- **Unified flow with auto-detection** — rejected: the operator chose explicit mode choice at the start. Auto-detection risks misclassifying a greenfield project that happens to have a `package.json` from a previous experiment.
- **Make `forge.create` run the interview** — rejected: `forge.create` is non-interactive (RFC-0544); the skill is the interactive layer.
- **Copy source code into the forge project during transplant** — rejected: transplant is about governance structure, not code migration. The operator can copy code themselves if they want; the skill does not make that decision.

## Risks

- **Skill drift from forge.yaml schema** — if bindings keys change, the skill's interview writes stale keys. Mitigation: the skill reads `forgeConfigSchema` at runtime; `forge.skill.validate` catches frontmatter drift.
- **Transplant false positives** — the skill might detect the wrong stack from a `package.json` that has dev-only dependencies. Mitigation: the propose step shows the operator what was detected before writing.
- **Agent misinterpretation** — an agent might run the skill outside a forge project or modify the transplant source. Mitigation: explicit MUST NOTs below; the skill's guardrails refuse both cases.

## Acceptance criteria

- [x] `packages/forge/skills/meta/forge-bootstrap/SKILL.md` is replaced with the redesigned interview flow and valid frontmatter (SKILL-01..13) (evidence: packages/forge/skills/meta/forge-bootstrap/SKILL.md:1-88, forge.skill.validate 0 violations)
- [x] `forge-bootstrap` entry in `FORGE_SKILLS` is updated (`concerns: content-mutation`, new description) and synced by `forge.init` / `forge.upgrade` (evidence: packages/forge/src/registry.ts:328, forge.skill.validate 0 violations)
- [x] The skill refuses to run without `forge.yaml` present (evidence: packages/forge/skills/meta/forge-bootstrap/SKILL.md:30-32, guardrail in body step 1)
- [x] Greenfield mode fills `typecheck`, `test`, `scopedBuild` and writes `PREFERENCES.md` (evidence: packages/forge/skills/meta/forge-bootstrap/SKILL.md:45-52, step 3.4 and 3.5)
- [x] Transplant mode analyzes a source directory, proposes bindings, and never modifies the source (evidence: packages/forge/skills/meta/forge-bootstrap/SKILL.md:54-62, guardrail at line 26)
- [x] The skill never overwrites non-null forge-CLI binding defaults (RFC-0540) (evidence: packages/forge/skills/meta/forge-bootstrap/SKILL.md:23, guardrail)
- [x] `forge.skill.validate` passes on the skill (evidence: forge.skill.validate --json, 0 violations)
- [x] `packages/forge/README.md` documents `/forge-bootstrap` as the post-create step (evidence: packages/forge/README.md:66, Lifecycle section)
- [x] `rfc.validate` passes on this file before merging (evidence: rfc.validate RFC-0545 --json, 0 violations)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MUST NOT run the skill outside a forge project (no `forge.yaml`).
- Agents MUST NOT modify the transplant source directory — it is read-only.
- Agents MUST NOT overwrite forge-CLI binding defaults (RFC-0540) — the skill fills only `null` stack bindings.
- Agents MUST NOT copy source code into the forge project during transplant without explicit operator instruction.
- Agents MUST respect `PREFERENCES.md` `aiLanguage` for all skill dialogue; create `PREFERENCES.md` if absent.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id RFC-0545 --reason "..." --invariant "DNA-54"` instead of working around it (RFC-0334).
