---
id: RFC-0877
title: "In-place agent-driven installation flow"
status: draft
# kind options: architecture | contract | command | policy | deprecation
kind: architecture
# scope options: app | workspace
scope: workspace
owners:
  - architecture
# Set by the deciding human together with the status change (RFC-0335).
# Draft scaffolds must keep this empty; do not prefill a default identity.
# Format: human:<handle> (agent:<id> reserved — see RFC-0335)
# Default reviewer when none is specified by the operator: human:andrii-syrokomskyi
reviewers: []
createdAt: 2026-08-18
updatedAt: 2026-08-18
enhancedAt: 2026-08-18
implementedAt:
closedAt:
supersedes:
  - RFC-0544
  - RFC-0779
  - RFC-0547
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0374
  - RFC-0392
  - RFC-0542
  - RFC-0543
  - RFC-0545
  - RFC-0546
  - RFC-0548
  - RFC-0640
  - RFC-0643
  - RFC-0769
  - RFC-0770
  - RFC-0868
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-64
# RFC-0396: Traceability to a vendored spec node: "<spec-id>/<node-id>", e.g. "pbp/RFC-PBP-020".
# Set by spec.materialize; leave commented for non-spec RFCs.
# specRef:
# RFC-0478: Platform versioning enforcement. Declares the SemVer delta this RFC
# produces when implemented. Required for post-cutoff implemented RFCs (V-29).
# Values: minor (Breaks-B, requires migrator), patch (safe), none (prose-only),
# major (architectural, manually reserved). Default: patch.
versionBump: major
commands:
  proposed: []
  added: []
  changed:
    - forge.create
  removed:
    - workshop.scaffold
appsImpacted: []
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - packages/forge
  - packages/werkstatt
successSignals:
  - "forge create --in-place scaffolds a working project in the current directory without creating a subdirectory"
  - "Project name is auto-derived from the folder name and converted to kebab-case"
  - "--profile is required with --in-place; missing --profile produces an error listing all supported profiles"
  - "--in-place tolerates non-empty directories (package.json, node_modules/, pnpm-lock.yaml, .git/, .vscode/ from prior setup) but refuses if forge.yaml or conflicting scaffold files already exist"
  - "workshop.scaffold command, its module files, and package exports are removed from the engine"
  - "README describes only the in-place agent-driven flow; global install and pnpm dlx paths are removed"
  - "AGENTS.md includes explicit agent instructions for determining supported project types and reporting unsupported types to the operator"
nonGoals:
  - "Auto-installing engine and stack plugin packages — the agent does this manually after scaffold"
  - "Interactive prompts — forge create remains non-interactive; the agent handles operator dialogue"
  - "Removing forge-shell profile — governance-only projects remain supported"
  - "Changing forge-bootstrap skill internals (register selection, auto-doctor, auto-ADR) — only the entry flow changes"
  - "Changing the internal forge.scaffold or forge.init commands — only forge.create orchestration changes"
  - "Keeping forge create --name X as an undocumented backward-compat path — forward-only ecosystem, old path is removed from code entirely"
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

# RFC-0877: In-place agent-driven installation flow

## Context

Forge was published to npm (RFC-0543) with a three-path installation model: (1) global install (`pnpm add -g @warpgogol/forge`), (2) one-off execution (`pnpm dlx @warpgogol/forge create`), and (3) `forge create --name X --profile Y` which creates a subdirectory `X/` inside the current directory. The operator then opens the subdirectory in their IDE and runs `/forge-bootstrap`.

Simultaneously, the engine provides `workshop.scaffold` (RFC-0779) — an internal command that scaffolds a consumer workshop monorepo (Turborepo + pnpm-workspace + kernel.config). This command is not user-facing but duplicates scaffolding logic that `forge create` also performs via `forge.scaffold` + `forge.init`.

The operator's vision is a single, agent-driven installation flow: the operator creates an empty folder, opens it for the AI agent, gives the agent the npm link (`https://www.npmjs.com/package/@warpgogol/forge`), and describes the project type they want. The agent installs Forge locally, determines the correct profile, runs `forge create --in-place`, and installs the engine and stack plugin packages. No terminal commands, no subdirectory creation, no global installation.

## Problem

- **Three installation paths create ambiguity** — the README describes global install, `pnpm dlx`, and `forge create --name`, but none of them match the agent-driven flow the operator wants. Agents must interpret which path to use, and operators must run terminal commands before the agent can help.
- **`forge create --name` creates a subdirectory** — the operator already created an empty folder and opened it in the IDE. Creating a subdirectory inside it means the operator must re-open the subdirectory, which is confusing and breaks the "open one folder, work there" mental model.
- **Global install is fragile** — `pnpm add -g @warpgogol/forge` requires sudo on some systems, pollutes the global namespace, and the operator must remember to update it. The README troubleshooting section already documents these failures.
- **`workshop.scaffold` duplicates scaffolding logic** — RFC-0779 created a separate engine command for workshop scaffolding, but `forge create` already composes `forge.scaffold` + `forge.init` + `forge.agents.generate`. Two scaffolding paths create maintenance burden and divergence risk.
- **No agent guidance for unsupported project types** — if an operator asks for a project type Forge does not support (e.g. "Unity game", "React Native app"), the agent has no explicit instructions to check the supported profiles list and report back. The README has a profiles table, but AGENTS.md does not mandate agent behavior for unsupported types.
- **`forge create` requires `--name`** — in the agent-driven flow, the project name should come from the folder name. Requiring `--name` forces the agent to invent a name or ask the operator an unnecessary question.

## Decision

`forge create` gains an `--in-place` flag that scaffolds the project directly in the current working directory instead of creating a subdirectory. `--in-place` is the only mode — the old `--name X` subdirectory-creation path is removed from code entirely (forward-only ecosystem). `--profile` is required (no default), `--name` becomes optional (auto-derived from the folder name, converted to kebab-case), and the empty-directory check is replaced by an allowlist-based conflict check that refuses only forge-specific files (`forge.yaml`, `.agents/`, `docs/`, `skills/`, `AGENTS.md`, `.forge/`) and tolerates everything else (`package.json`, `node_modules/`, `.git/`, `.vscode/`, etc.). Global install (`pnpm add -g`), `pnpm dlx`, and `forge create --name X` (subdirectory creation) are removed from the README and from code. The `workshop.scaffold` command (RFC-0779) is removed from the engine. README and AGENTS.md are rewritten to describe the agent-driven flow and include explicit agent instructions for determining supported project types.

## Architectural fit

- **DNA-64 (Engine/profile/component-graph boundary)** — the RFC removes `workshop.scaffold` from the engine, consolidating scaffolding into `forge create`. This strengthens the boundary: forge owns project scaffolding, the engine owns lifecycle management. The engine no longer exposes a scaffolding command to consumers.
- **RFC-0374 (forge extraction)** — forge is a portable, dependency-free package. Adding `--in-place` does not introduce new dependencies. The flag is pure orchestration logic within `create.ts`.
- **RFC-0547 (barrier-free onboarding)** — superseded. The forge-as-devDependency pattern remains, but the onboarding flow changes from terminal-first to agent-first.
- **RFC-0779 (workshop scaffolding)** — superseded and removed. `workshop.scaffold` is deleted; its functionality is absorbed by `forge create --in-place`.
- **RFC-0868 (engine and stack plugins on npm)** — the RFC depends on engine and stack plugins being available on npm, which RFC-0868 completed. The agent installs them as devDependencies after scaffold.

## Design

### CLI surface

The agent-driven installation flow:

```sh
# Step 1: operator creates empty folder, opens it in IDE
# Step 2: agent installs forge locally
pnpm add -D @warpgogol/forge

# Step 3: agent runs forge create --in-place with required --profile
pnpm exec forge create --in-place --profile godot-csharp

# Step 4: agent installs engine + stack plugin based on profile
pnpm add -D @warpgogol/werkstatt @warpgogol/werkstatt-godot
```

Flags for `forge create --in-place`:

| Flag | Required | Description |
| --- | --- | --- |
| `--in-place` | yes | Scaffold in the current working directory. This is the only mode — the flag is mandatory. |
| `--profile` | yes | Stack profile id. No default — error if missing, listing all supported profiles |
| `--name` | no | Project name override. If omitted, derived from `path.basename(cwd)` and converted to kebab-case. Note: `--name` is an override for the project name in `forge.yaml`, not a directory name. |
| `--template` | no | Template id for multi-template profiles (unchanged) |
| `--package-manager` | no | Package manager (default: pnpm, unchanged) |

Without `--in-place`, `forge create` does not exist — `--in-place` is the only mode. The old `--name X` subdirectory-creation path is removed from code entirely (forward-only ecosystem).

### TypeScript contracts

Changes to `runCreate` in `packages/forge/src/onboarding/create.ts`:

```ts
interface CreateFlags {
  "in-place"?: boolean;
  name?: string;
  profile?: string;
  template?: string;
  "package-manager"?: string;
}

// When --in-place is set:
// 1. targetDir = context.workspaceRoot (not workspaceRoot/name)
// 2. projectName = flags.name ?? toKebabCase(path.basename(context.workspaceRoot))
// 3. --profile is required (error if missing)
// 4. Conflict check uses allowlist approach:
//    - Refused files: forge.yaml, .agents/, docs/, skills/, AGENTS.md, .forge/
//    - Everything else is tolerated (package.json, node_modules/, pnpm-lock.yaml,
//      .git/, .vscode/, .idea/, .windsurf/, .DS_Store, Thumbs.db, .npmrc, etc.)
```

```ts
function toKebabCase(input: string): string {
  return input
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/forge/src/onboarding/create.ts` | Add `--in-place` flag handling, conflict check, name-from-folder logic; remove `--name` as positional arg |
| `packages/forge/os/core/core.module.ts` | Register `--in-place` flag on `forge.create` command; remove `--name` flag |
| `packages/forge/README.md` | Rewrite installation guide for agent-driven flow |
| `packages/forge/skills/meta/forge-bootstrap/SKILL.md` | Update entry flow description (agent-driven, not terminal-driven) |
| `packages/werkstatt/src/workshop/workshop-scaffold.ts` | Delete |
| `packages/werkstatt/src/workshop/workshop.module.ts` | Delete (removes `workshop.scaffold` command registration) |
| `packages/werkstatt/src/workshop/templates.ts` | Delete |
| `packages/werkstatt/src/workshop/workshop-scaffold.test.ts` | Delete |
| `packages/werkstatt/src/workshop/index.ts` | Delete (barrel re-export for workshop module) |
| `packages/werkstatt/package.json` | Remove `./workshop` and `./workshop-module` from `exports` field |
| `packages/werkstatt/AGENTS.md` | Remove `@warpgogol/werkstatt/workshop` and `@warpgogol/werkstatt/workshop-module` from entry points table |
| `tools/kernel.config.ts` | Remove `workshop` module loader entry |
| `AGENTS.md` (root) | Replace `workshop.scaffold` reference (line 12) with `forge create --in-place` instructions; add agent installation flow section |
| `docs/authoring/site-composition.md` | Remove `workshop.scaffold` reference |
| `docs/COMMANDS.md` | Regenerate (remove `workshop.scaffold` entry) |
| `docs/command-manifest.generated.yaml` | Regenerate (remove `workshop.scaffold` entry) |
| `docs/ecosystem.generated.yaml` | Regenerate (remove `workshop.scaffold` entry) |
| `packages/forge/src/tests/create.test.ts` | Add tests for `--in-place` flag; remove tests for `--name` positional mode |

### Output format

```json
{
  "command": "forge.create",
  "status": "pass",
  "projectDir": "/path/to/current/dir",
  "profile": "godot-csharp",
  "filesCreated": ["forge.yaml", "AGENTS.md", ".agents/skills/...", "NEXT_STEPS.md"],
  "errors": []
}
```

Error when `--profile` is missing with `--in-place`:

```json
{
  "command": "forge.create",
  "status": "fail",
  "projectDir": "/path/to/current/dir",
  "profile": "",
  "filesCreated": [],
  "errors": ["--profile is required with --in-place. Supported profiles: astro-typescript-turborepo, phaser-turborepo, godot-csharp, forge-shell"]
}
```

Error when conflicting files exist:

```json
{
  "command": "forge.create",
  "status": "fail",
  "projectDir": "/path/to/current/dir",
  "profile": "godot-csharp",
  "filesCreated": [],
  "errors": ["Directory already contains forge.yaml — refusing to overwrite an existing Forge project"]
}
```

### Failure modes

| Condition | Behavior |
| --- | --- |
| `--in-place` without `--profile` | Fail with error listing all supported profiles |
| `forge.yaml` already exists in cwd | Fail — refuse to overwrite existing Forge project |
| Conflicting files exist (`.agents/`, `docs/`, `skills/`, `AGENTS.md`, `.forge/`) | Fail with list of conflicting files |
| `package.json` exists (from `pnpm add -D`) | Tolerated — forge create merges/overwrites with forge project package.json |
| `node_modules/` exists | Tolerated — ignored |
| `pnpm-lock.yaml` exists | Tolerated — ignored |
| `.git/` exists (operator ran `git init`) | Tolerated — ignored |
| `.vscode/`, `.idea/`, `.windsurf/` exists (IDE-created) | Tolerated — ignored |
| `.DS_Store`, `Thumbs.db`, `desktop.ini` exists (OS-created) | Tolerated — ignored |
| `--name` flag passed | Accepted as project name override (used in `forge.yaml` only, not as directory name) |
| Folder name is not kebab-case | Auto-converted to kebab-case for project name |
| Folder name is empty or only non-alphanumeric | Fail — cannot derive project name |

### README rewrite

The README is rewritten to describe only the agent-driven flow:

1. **What you can build** — project types table (unchanged)
2. **Installation** — operator creates empty folder, opens for agent, agent installs forge from npm link, agent runs `forge create --in-place --profile <type>`, agent installs engine+plugin
3. **Supported profiles** — machine-readable table mapping profile id to project type, plugin package, and prerequisites
4. **Agent instructions** — explicit section for AI agents: how to determine supported types, what to do when type is unsupported, which packages to install per profile
5. **Troubleshooting** — updated for new flow (no global install issues)

### AGENTS.md agent instructions

Root `AGENTS.md` gains a new section:

```markdown
## Installation flow (agent-driven)

When the operator asks to install Forge and create a project:

1. Verify the current directory is the operator's empty project folder.
2. Install forge: `pnpm add -D @warpgogol/forge`
3. Determine the project type from the operator's description.
4. If the type is not supported, tell the operator explicitly and list all supported types
   from the README profiles table.
5. Run `pnpm exec forge create --in-place --profile <profile-id>`
6. Install engine and stack plugin packages based on the profile:
   - astro-typescript-turborepo → @warpgogol/werkstatt + @warpgogol/werkstatt-site
   - phaser-turborepo → @warpgogol/werkstatt + @warpgogol/werkstatt-game
   - godot-csharp → @warpgogol/werkstatt + @warpgogol/werkstatt-godot
   - forge-shell → @warpgogol/werkstatt (engine only, no stack plugin)
7. Run /forge-bootstrap to configure the project interactively.
```

### workshop.scaffold removal

The following files are deleted from `packages/werkstatt/`:

- `src/workshop/workshop-scaffold.ts`
- `src/workshop/workshop.module.ts`
- `src/workshop/templates.ts`
- `src/workshop/workshop-scaffold.test.ts`

The `workshop` module is removed from `tools/kernel.config.ts` module loaders. Any references to `workshop.scaffold` in other files are removed.

### forge-bootstrap skill update

The `forge-bootstrap` skill (`packages/forge/skills/meta/forge-bootstrap/SKILL.md`) is updated:

- Step 0 (silent version check) remains unchanged
- The skill no longer assumes the operator ran `forge create` from a terminal — it works when the agent ran `forge create --in-place`
- The guardrail `forge.yaml must exist` remains unchanged
- The greenfield/transplant modes remain unchanged
- The welcoming report no longer references terminal commands

## Rollout

- **Major version bump** — `@warpgogol/forge` 2.0.0 and `@warpgogol/werkstatt` next major. The `--in-place` flag, `--profile` requirement, `workshop.scaffold` removal, and `--name` path removal are breaking changes.
- **New projects** — all new projects use `forge create --in-place` from day one. The README describes only this path.
- **Existing projects** — unaffected. They already have `forge.yaml`, skills, and AGENTS.md. `forge upgrade` continues to work. The removal of `workshop.scaffold` does not affect existing workshops.
- **No backward compatibility** — `forge create --name X` (without `--in-place`) is removed from code entirely. The ecosystem is forward-only; no undocumented paths or dual-mode behavior is maintained.
- **Migration** — no migration needed. Existing projects do not need to change anything. The `forge upgrade` command continues to sync skills and binding defaults.
- **README** — rewritten in the same commit as the code changes. The npm README is the primary discovery surface for agents.
- **AGENTS.md** — updated in the same commit. Agents read AGENTS.md at session start and follow the new installation instructions.
- **Generated files** — `docs/COMMANDS.md`, `docs/command-manifest.generated.yaml`, `docs/ecosystem.generated.yaml` are regenerated to remove `workshop.scaffold` entries.

## Alternatives considered

- **Keep global install as primary path** — rejected. Global install requires sudo on some systems, pollutes the global namespace, and breaks the "one folder, one project" mental model. The operator wants agent-driven installation from within the project folder.

- **Use `pnpm dlx` for one-off execution** — rejected. `pnpm dlx` downloads forge every time, is slow, and does not leave forge installed in the project. The agent needs forge available as a devDependency for `forge.yaml` bindings to work.

- **Keep `workshop.scaffold` as internal command** — rejected. Two scaffolding paths (forge create and workshop.scaffold) create maintenance burden and divergence risk. Consolidating into `forge create --in-place` simplifies the codebase and ensures a single source of truth for project scaffolding.

- **Auto-install engine and plugins from `forge create --in-place`** — rejected. The agent should control package installation to handle edge cases (network issues, specific versions, operator preferences). `forge create` is a scaffolding command, not a dependency manager.

- **Make `--profile` default to `forge-shell`** — rejected. In the agent-driven flow, the operator always describes the project type. If the agent cannot determine the type, it should ask the operator, not silently create a governance-only project. A required `--profile` forces explicit choice.

## Risks

- **Breaking change for existing users** — `forge create --name X` is removed from code and `workshop.scaffold` is deleted from the engine. Users with automated scripts that call these commands will break. Mitigation: major version bump signals the breaking change; migration is straightforward (use `forge create --in-place --profile <id>` instead of `forge create --name X --profile <id>`).

- **Agent misinterprets unsupported project types** — if the operator describes a project type that maps partially to a supported profile (e.g. "Unity game" → agent might try `godot-csharp`), the agent might scaffold the wrong profile. Mitigation: AGENTS.md instructions explicitly tell the agent to check the supported profiles table and report unsupported types to the operator.

- **Conflict check false positives** — the conflict check refuses if `docs/` or `AGENTS.md` exist, but these might be pre-existing files unrelated to forge. Mitigation: the error message lists the conflicting files and suggests removing them or choosing a different directory.

- **Folder name produces invalid kebab-case** — if the folder name is entirely non-alphanumeric (e.g. emoji, Cyrillic), `toKebabCase` produces an empty string. Mitigation: fail with a clear error message asking the operator to rename the folder or pass `--name`.

- **Major version bump coordination** — forge 2.0.0 and werkstatt next major must be released simultaneously. The `package.json` optional dependencies in forge reference werkstatt with `*`, so this is not a hard constraint, but the README and AGENTS.md must reference the correct versions.

## Acceptance criteria

- [ ] `forge create --in-place --profile <id>` scaffolds a project in the current directory without creating a subdirectory (evidence: `packages/forge/src/tests/create.test.ts`, `--in-place` test cases)
- [ ] `--profile` is required with `--in-place`; missing `--profile` produces an error listing all supported profiles (evidence: `packages/forge/src/tests/create.test.ts`, missing-profile test)
- [ ] Project name is auto-derived from `path.basename(cwd)` and converted to kebab-case when `--name` is not provided (evidence: `packages/forge/src/tests/create.test.ts`, name-derivation test)
- [ ] `--in-place` tolerates `package.json`, `node_modules/`, `pnpm-lock.yaml`, `.git/`, `.vscode/` but refuses if `forge.yaml` or conflicting scaffold files exist (evidence: `packages/forge/src/tests/create.test.ts`, conflict-check tests)
- [ ] `--name` flag is accepted as project name override (used in `forge.yaml` only, not as directory name) (evidence: `packages/forge/src/tests/create.test.ts`, `--name` override test)
- [ ] `workshop.scaffold` command, its module files, barrel `index.ts`, and package `exports` entries are deleted from `packages/werkstatt/` (evidence: `git log --diff-filter=D -- packages/werkstatt/src/workshop/`)
- [ ] `workshop` module removed from `tools/kernel.config.ts` (evidence: `tools/kernel.config.ts` no longer imports workshop module)
- [ ] `packages/werkstatt/AGENTS.md` entry points table no longer lists `@warpgogol/werkstatt/workshop` or `@warpgogol/werkstatt/workshop-module` (evidence: `packages/werkstatt/AGENTS.md`)
- [ ] README rewritten to describe only the agent-driven in-place flow (evidence: `packages/forge/README.md`, no global install or `pnpm dlx` instructions)
- [ ] AGENTS.md includes explicit agent instructions for installation flow and unsupported-type handling (evidence: `AGENTS.md`, new "Installation flow" section)
- [ ] Root `AGENTS.md` line 12 no longer references `workshop.scaffold` (evidence: `AGENTS.md`)
- [ ] `forge-bootstrap` skill updated for agent-driven entry (evidence: `packages/forge/skills/meta/forge-bootstrap/SKILL.md`)
- [ ] Generated files regenerated without `workshop.scaffold` entries (evidence: `docs/COMMANDS.md`, `docs/command-manifest.generated.yaml`, `docs/ecosystem.generated.yaml`)
- [ ] `rfc.validate` passes on this file before merging

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `rfc.supersede.propose --id RFC-0877 --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
- Agents MUST delete all `workshop.scaffold` files (including `index.ts`) in a single commit — leaving partial files causes import errors in the engine.
- Agents MUST update `tools/kernel.config.ts` and `packages/werkstatt/package.json` `exports` in the same commit as the file deletions — both reference the workshop module.
- Agents MUST run `pnpm run build:check` on both `packages/forge` and `packages/werkstatt` after changes to verify no broken imports.
- Agents MUST update the synced `.agents/skills/forge-bootstrap/SKILL.md` copy when editing `packages/forge/skills/meta/forge-bootstrap/SKILL.md` — `forge create` is not run automatically after manual edits.
- Agents MUST remove the `forge create --name X` subdirectory-creation mode from code entirely — `--in-place` is the only mode. `--name` remains as a project name override only. The ecosystem is forward-only, no undocumented dual-mode behavior is maintained.
- Agents MUST regenerate `docs/COMMANDS.md`, `docs/command-manifest.generated.yaml`, and `docs/ecosystem.generated.yaml` after removing `workshop.scaffold` — generated files must not retain stale command entries.
- Agents MUST install engine and stack plugin packages manually after `forge create --in-place` — the command does not auto-install dependencies.
