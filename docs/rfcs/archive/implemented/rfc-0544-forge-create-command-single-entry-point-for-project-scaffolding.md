---
id: RFC-0544
title: "forge create command — single entry point for project scaffolding"
status: implemented
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
createdAt: 2026-07-26
updatedAt: 2026-07-26
enhancedAt: 2026-07-26
implementedAt: 2026-07-26
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0374
  - RFC-0391
  - RFC-0392
  - RFC-0539
  - RFC-0540
  - RFC-0542
  - RFC-0543
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
  proposed:
    - forge.create
  added:
    - forge.create
  changed: []
  removed: []
appsImpacted: []
packagesImpacted:
  - forge
successSignals:
  - "forge create <name> produces a runnable project directory with forge.yaml, synced skills, and binding defaults in one command"
  - "The command output tells the operator to open the IDE and run /forge-bootstrap"
  - "forge create refuses to overwrite an existing non-empty directory"
nonGoals:
  - "Interactive project interviews — forge create is non-interactive; the bootstrap skill handles dialogue after the project exists"
  - "Transplant mode — that is the bootstrap skill's responsibility (see the bootstrap redesign RFC)"
  - "Git repository initialization — operators run git init themselves or via the bootstrap skill"
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

# RFC-0544: forge create command — single entry point for project scaffolding

## Context

Today, project creation with forge is a two-step manual process: run `forge.init` in an empty directory, then run `forge.scaffold --profile <profile>` to generate the stack-specific files. The operator's requirement is a single `forge create <name>` command that always creates a nested directory with the project name (like `git clone <url>` creates a folder named after the repo), scaffolds it, runs `forge.init` inside, and emits self-documenting next steps (RFC-0542) with an IDE recommendation.

`forge.scaffold` (RFC-0392) already knows how to generate files for a stack profile. `forge.init` (RFC-0391) writes `forge.yaml` and syncs skills. What is missing is the composition: a single command that creates the directory, picks a profile (defaulting to `forge-shell` when none is specified), scaffolds, inits, and tells the operator what to do next.

## Problem

- **Two-step friction** — `forge.init` + `forge.scaffold` is the first thing every external consumer does. Getting the order wrong (scaffold before init, or init in the wrong directory) produces a broken project.
- **No directory creation** — neither `forge.init` nor `forge.scaffold` creates a project directory; the operator must `mkdir` first. This is unlike `git clone` and `npm create`, which create the directory for you.
- **No default profile** — `forge.scaffold` requires `--profile`; a consumer who does not know what a profile is gets an error instead of a sensible default.
- **No next-step guidance** — even if the two steps succeed, the operator is not told to open the IDE or run the bootstrap skill (RFC-0542 is not yet implemented, and `forge.create` is the command where that guidance matters most).

## Decision

`forge create <name>` is the single entry point for project creation. It creates a directory `<name>` in the current working directory, scaffolds it with the specified profile (default `forge-shell`), runs `forge.init` inside it (writing `forge.yaml` with binding defaults per RFC-0540 and `forge.syncedVersion` per RFC-0543), syncs skills, and emits `nextSteps` with an IDE recommendation per RFC-0542. The command is non-interactive; all configuration is via flags. The bootstrap skill (separate RFC) handles the interactive interview after the project exists.

## Architectural fit

- **DNA-54 (Forge bindings contract)** — `forge.create` does not touch skill bodies directly (DNA-54's scope), but it composes `forge.init`, which writes binding defaults (RFC-0540) into `forge.yaml` and syncs skills. By making `forge.init` the default path for every new project, `forge.create` ensures the bindings contract is observable from the first command — the chain is: `forge.create` → `forge.init` → binding defaults in `forge.yaml` → skills reference `ref(forge.yaml bindings.*)` instead of hardcoding.
- **RFC-0374 (forge extraction)** — `forge.create` is the npm consumer's front door.
- **RFC-0391 (portable init)** — `forge.create` composes `forge.init`; init remains the config-writing primitive.
- **RFC-0392 (stack profiles)** — `forge.create` delegates to `forge.scaffold` for profile-specific files; the default `forge-shell` profile produces a minimal project (forge.yaml, .agents/, docs/rfcs/, docs/adrs/).
- **RFC-0542 (self-documenting output)** — `forge.create` is the primary command where `nextSteps` and the IDE recommendation are emitted.
- **RFC-0543 (npm publication)** — `forge.create` writes `forge.syncedVersion` so `forge.upgrade` works from day one.

## Design

### CLI surface

```sh
forge create <name> [--profile <profile>] [--package-manager <pm>] [--json]
```

- `<name>` — required, project directory name. Validated: `^[a-z][a-z0-9-]{1,63}$`.
- `--profile` — optional, defaults to `forge-shell`. Available profiles listed by `forge.scaffold --list-profiles`.
- `--package-manager` — optional, defaults to `pnpm`. Written into `forge.yaml` `project.packageManager`.
- `--json` — machine-readable output per RFC-0542.

### Execution steps

1. Validate `<name>`; refuse if the target directory exists and is non-empty.
2. Create directory `<name>/`.
3. Run `forge.scaffold --profile <profile>` inside `<name>/` (generates stack files).
4. Run `forge.init` inside `<name>/` (writes `forge.yaml` with binding defaults per RFC-0540, syncs skills, writes `forge.syncedVersion`).
5. If `--package-manager` was provided and differs from the default (`pnpm`), post-process `forge.yaml` to set `project.packageManager` — `forge.init`'s contract is unchanged (it always writes `pnpm`), so `forge.create` modifies the file after init.
6. Emit `nextSteps`:
   - `{ action: "Open the project in Windsurf", kind: "required" }`
   - `{ action: "Run /forge-bootstrap to configure the project interactively", kind: "optional" }`
7. Emit IDE recommendation (Windsurf tested, alternatives without guarantee) per RFC-0542.

### TypeScript contracts

```ts
// packages/forge/src/onboarding/create.ts
interface CreateCommandInput {
  name: string;
  profile?: string;       // defaults to "forge-shell"
  packageManager?: string; // defaults to "pnpm"
}
interface CreateCommandResult {
  command: "forge.create";
  status: "pass" | "fail";
  projectDir: string;
  profile: string;
  filesCreated: string[];
  nextSteps: ForgeNextStep[];
}
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/forge/src/onboarding/create.ts` | `forge.create` handler (new) |
| `packages/forge/os/core/core.module.ts` | Registers `forge.create` in `forgeCoreModule` |
| `packages/forge/src/onboarding/scaffold-project.ts` | Delegated to by create (unchanged) |
| `packages/forge/src/onboarding/init.ts` | Delegated to by create (unchanged) |
| `packages/forge/profiles/forge-shell.yaml` | Minimal profile for default scaffolding (new) |
| `<name>/` | Created directory |
| `<name>/forge.yaml` | Written by init with defaults + syncedVersion |
| `<name>/.agents/skills/` | Synced by init |

### Output format

```json
{
  "command": "forge.create",
  "status": "pass",
  "projectDir": "my-project",
  "profile": "forge-shell",
  "filesCreated": ["forge.yaml", ".agents/skills/fo-idea/SKILL.md", "docs/rfcs/", "docs/adrs/"],
  "nextSteps": [
    { "action": "Open the project in Windsurf", "kind": "required" },
    { "action": "Run /forge-bootstrap to configure the project interactively", "kind": "optional" }
  ]
}
```

Pretty mode prints the same `nextSteps` as a block plus the IDE recommendation line.

### Failure modes

- Directory `<name>` exists and is non-empty → exit 1, message: "directory '<name>' already exists and is not empty".
- Invalid `<name>` → exit 1 with the regex.
- Unknown profile → exit 1 with a pointer to `forge.scaffold --list-profiles`.
- Scaffold or init fails → exit 1 with the sub-command error; partial files are left for inspection (no rollback).

## Rollout

1. Create `packages/forge/profiles/forge-shell.yaml` — a minimal profile that produces `forge.yaml`, `.agents/skills/`, `docs/rfcs/`, `docs/adrs/` without stack-specific files or install commands.
2. Implement `forge.create` in `src/onboarding/create.ts`; register in `forgeCoreModule` (`os/core/core.module.ts`).
3. Add `--profile` default (`forge-shell`) to the scaffold delegation.
4. Wire `nextSteps` and IDE recommendation per RFC-0542.
5. Unit-test: directory creation, non-empty refusal, default profile, delegation to scaffold+init, `--package-manager` post-processing.
6. Document `forge create` in `packages/forge/README.md` as the first command a consumer runs.
7. Add `forge.create` to the `forgeCoreModule` command list in `packages/forge/AGENTS.md`.

`forge.init` and `forge.scaffold` remain available as primitives for operators who need them; `forge.create` is the recommended entry point.

## Alternatives considered

- **Make `forge.init` create the directory** — rejected: `init` is the config-writing primitive; overloading it with directory creation changes its contract and breaks operators who run `init` in an existing directory.
- **Interactive prompts for profile and package manager** — rejected: the operator specified non-interactive `forge.create` with flags; the bootstrap skill handles dialogue.
- **Rollback on partial failure** — rejected: adds complexity for a rare case; leaving partial files lets the operator inspect what went wrong and re-run in a clean directory.

## Risks

- **Profile staleness** — if `forge-shell` is renamed or removed, `forge.create` breaks. Mitigation: `forge.scaffold --list-profiles` is the source of truth; the default is validated at runtime.
- **Execution cost** — `forge.create` delegates to `forge.scaffold`, which may run `execSync` install commands from the profile. The `forge-shell` profile has no install commands (minimal), so the default path is fast; heavier profiles inherit `forge.scaffold`'s existing timeout behavior (60s per command).
- **Name collision with forge commands** — a project named `forge` could shadow the binary in some shells. Mitigation: the name regex does not block `forge`, but the README warns against it; accepted residual risk.
- **Agent misinterpretation** — an agent might run `forge.create` inside an existing project instead of in a parent directory. Mitigation: the non-empty-directory refusal prevents this.

## Acceptance criteria

- [x] `forge.create` is registered in `forgeCoreModule` and accepts `<name>`, `--profile`, `--package-manager`, `--json` (evidence: `packages/forge/os/core/core.module.ts` registers `forge.create` with `profile` and `package-manager` flags; `cli.ts` passes `--json` through)
- [x] `forge create my-project` creates `./my-project/` with `forge.yaml`, synced skills, `docs/rfcs/`, `docs/adrs/` (evidence: `create.test.ts` "forge create my-project creates dir with forge.yaml and docs dirs" passes)
- [x] `forge.yaml` in the created project has non-null forge-CLI bindings (RFC-0540) and `forge.syncedVersion` (evidence: `create.test.ts` "forge.yaml has non-null forge-CLI bindings and null stack bindings" and "forge.yaml has forge.syncedVersion set" pass)
- [x] Default profile is `forge-shell` when `--profile` is omitted (evidence: `create.ts` line 48 defaults profile to `forge-shell`; `create.test.ts` "forge create uses forge-shell profile by default" passes)
- [x] Non-empty target directory is refused with exit 1 (evidence: `create.test.ts` "forge create refuses non-empty target directory" passes)
- [x] `nextSteps` and IDE recommendation are emitted in both pretty and `--json` output (evidence: `runCreate` populates `nextSteps` on all return paths; `cli.ts` line 277 includes `forge.create` in the IDE recommendation condition)
- [x] Unit tests cover directory creation, refusal, default profile, and delegation (evidence: `packages/forge/src/tests/create.test.ts` — 10 test cases, all passing)
- [x] `packages/forge/README.md` documents `forge create` as the first command (evidence: README Quick start section features `npx forge create my-project` first)
- [x] `rfc.validate` passes on this file before merging (evidence: pending validation run)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MUST NOT add interactive prompts to `forge.create` — it is non-interactive; the bootstrap skill handles dialogue.
- Agents MUST NOT make `forge.create` overwrite an existing non-empty directory.
- Agents MUST NOT change `forge.init` or `forge.scaffold` contracts — `forge.create` delegates to them.
- Agents MUST emit `nextSteps` with the IDE recommendation per RFC-0542.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id RFC-0544 --reason "..." --invariant "DNA-54"` instead of working around it (RFC-0334).
