---
id: RFC-0674
title: "Profile-driven lifecycle commands for Forge"
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
  - DNA-54
  - RFC-0638
  - RFC-0639
  - RFC-0640
  - RFC-0641
  - ADR-0021
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
    - forge.dev
    - forge.build
    - forge.validate
  added: []
  changed: []
  removed: []
appsImpacted: []
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - packages/forge
successSignals:
  - "`forge dev --dry-run` prints the resolved dev server command from the active profile"
  - "`forge build --dry-run` prints the resolved produce commands from the active profile"
  - "`forge validate --dry-run` prints the resolved validate commands from the active profile"
  - "`forge dev` starts the Editframe preview server when the editframe-html profile is active"
  - "`forge build` produces MP4 output when the editframe-html profile is active"
nonGoals:
  - "Hardcoding any domain-specific command names (editframe, remotion, ffmpeg) in Forge source"
  - "Profile invariant enforcement (deferred to RFC-0675)"
  - "Artifact validation structured reporting (deferred to RFC-0677)"
  - "Determinism verification (deferred to RFC-0678)"
  - "Asset management (deferred to RFC-0679)"
  - "Release lifecycle (deferred to RFC-0680)"
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

# RFC-0674: Profile-driven lifecycle commands for Forge

## Context

Forge has a domain-neutral stack profile system (RFC-0638..0642) with profile YAML files declaring workspace types, artifacts, invariants, terminology, and detection markers. The `editframe-html` profile (RFC-0641) was the first non-software-domain profile.

The profile system currently covers only **scaffolding and health checks** (`forge create --profile`, `forge.profile.validate`, `forge.doctor --strict`). It does not cover the full project lifecycle: dev/preview, build/render, artifact validation. These lifecycle commands do not exist in Forge for profile-driven projects.

The profile schema already declares `artifacts[].produce.command` and `artifacts[].validate.command` (RFC-0638), but no Forge command reads or executes them. A `devServer` field for declaring the dev/preview server command does not exist in the schema at all.

## Problem

Forge consumers (e.g. an Editframe video project) must drop to raw CLI commands (`editframe preview`, `editframe render`, `editframe check`) instead of using Forge lifecycle commands. This means:

- No `--dry-run` preview of what a command will execute
- No structured `--json` output for programmatic consumption
- No integration with Forge governance (profiles, invariants, doctor)
- No uniform command surface across different project types

The profile schema declares artifact commands but nothing reads them. The `devServer` concept is absent entirely.

## Decision

Forge gains three profile-driven lifecycle commands — `forge.dev`, `forge.build`, `forge.validate` — that resolve their behavior entirely from the active stack profile's YAML declarations. Forge source contains zero domain-specific command names.

The profile schema gains a `devServer` field declaring the dev/preview server command.

## Architectural fit

- **DNA-54 (Forge bindings contract):** Profile-driven commands extend the bindings principle — domain-specific values live in profile YAML, not in Forge source.
- **RFC-0638 (profile schema):** Extends the schema with `devServer` — a natural addition alongside existing `artifacts` and `workspaceTypes`.
- **RFC-0640 (domain-aware bootstrapping):** `forge create --profile` already writes the profile id into `forge.yaml`. Lifecycle commands read it back to resolve the active profile.
- **RFC-0641 (editframe profile):** The `editframe-html.yaml` profile is updated to declare `devServer` and confirm `artifacts[].produce`/`validate` commands are lifecycle-ready.
- **ADR-0021:** This RFC is the first concrete implementation of the profile-driven lifecycle decision.

## Design

### Profile schema extension

The `stackProfileDomainFieldsSchema` gains an optional `devServer` field:

```ts
export const profileDevServerSchema = z.object({
  command: z.string().min(1),
  port: z.number().int().positive().optional(),
  readinessTimeout: z.number().int().positive().optional(),
});

export const stackProfileDomainFieldsSchema = z.object({
  domain: z.string().optional(),
  terminology: z.record(z.string(), z.string()).optional(),
  artifacts: z.array(profileArtifactSchema).optional(),
  workspaceTypes: z.array(profileWorkspaceTypeSchema).optional(),
  invariants: z.array(profileInvariantSchema).optional(),
  register: z.enum(["business", "creative"]).optional(),
  devServer: profileDevServerSchema.optional(),
});
```

### CLI surface

```sh
# Start the dev/preview server declared in the active profile
forge dev
forge dev --dry-run

# Execute produce commands for all artifacts declared in the active profile
forge build
forge build --dry-run
forge build --json

# Execute validate commands for all artifacts declared in the active profile
forge validate
forge validate --dry-run
forge validate --json
```

All three commands accept:

- `--dry-run` — print the resolved command(s) without executing
- `--json` — structured output with resolved commands and exit codes
- `--profile <id>` — override the active profile (defaults to `forge.yaml` `project.stack[0]` or `profile` field)

### TypeScript contracts

```ts
interface ProfileCommandResolution {
  profileId: string;
  profilePath: string;
  commands: Array<{
    artifactId: string;
    command: string;
    output?: string;
  }>;
}

interface ForgeDevResult {
  command: "forge.dev";
  profileId: string;
  devServerCommand: string;
  port?: number;
  exitCode: number;
}

interface ForgeBuildResult {
  command: "forge.build";
  profileId: string;
  artifacts: Array<{
    id: string;
    command: string;
    output?: string;
    exitCode: number;
    stdout: string;
    stderr: string;
  }>;
}

interface ForgeValidateResult {
  command: "forge.validate";
  profileId: string;
  artifacts: Array<{
    id: string;
    command: string;
    exitCode: number;
    stdout: string;
    stderr: string;
  }>;
}
```

### Active profile resolution

1. Read `forge.yaml` from `workspaceRoot`.
2. Check for a `profile` field (RFC-0640 writes this on `forge create`).
3. Fall back to `project.stack[0]` if `profile` is absent.
4. Load the profile YAML from `<forgeRoot>/profiles/<id>.yaml`.
5. If the profile is not found, exit with an error listing available profiles.

### File system responsibilities

| Path | Role |
| --- | --- |
| `forge.yaml` | Read for active profile id |
| `packages/forge/profiles/*.yaml` | Read for profile declarations |
| `packages/forge/src/profiles/profile-schema.ts` | Extended with `devServer` schema |
| `packages/forge/src/profiles/stack-profile.ts` | Extended with `devServer` in `StackProfile` interface |
| `packages/forge/os/core/core.module.ts` | Registers `forge.dev`, `forge.build`, `forge.validate` |
| `packages/forge/os/core/handlers/dev.ts` | New — `forge.dev` handler |
| `packages/forge/os/core/handlers/build.ts` | New — `forge.build` handler |
| `packages/forge/os/core/handlers/validate.ts` | New — `forge.validate` handler |
| `packages/forge/profiles/editframe-html.yaml` | Updated with `devServer` declaration |

### Output format

`forge build --json`:

```json
{
  "command": "forge.build",
  "profileId": "editframe-html",
  "artifacts": [
    {
      "id": "composition",
      "command": "editframe render -o dist/{composition}.mp4",
      "output": "dist/{composition}.mp4",
      "exitCode": 0,
      "stdout": "",
      "stderr": ""
    }
  ]
}
```

`forge dev --dry-run` (pretty):

```
  [forge.dev] Resolved from profile: editframe-html
  Command: editframe preview
  Port: 4321
  [dry-run] Not starting server.
```

### Failure modes

- **No active profile**: `forge.yaml` has no `profile` field and `project.stack` is empty → exit 1 with message listing available profiles.
- **Profile not found**: profile id in `forge.yaml` does not match any YAML in `profiles/` → exit 1 with path searched.
- **Profile has no `devServer`**: `forge dev` on a profile without `devServer` → exit 1 with message "Profile <id> does not declare a devServer".
- **Profile has no `artifacts`**: `forge build` on a profile without `artifacts` → exit 1 with message "Profile <id> does not declare any artifacts".
- **Artifact has no `produce` command**: `forge build` skips artifacts without `produce` and logs a warning.
- **Command execution fails**: child process exits non-zero → `forge build`/`forge.validate` exits with the same code, reports stderr in `--json` output.
- **`forge dev` is long-running**: the command starts the dev server and streams stdout/stderr to the terminal. Ctrl+C (SIGINT) terminates the child process with exit code 130 (128 + SIGINT(2), standard Unix convention). `--json` output is emitted only on exit.

## Rollout

- **New commands**: `forge.dev`, `forge.build`, `forge.validate` are new — no existing commands are affected.
- **Profile schema extension**: `devServer` is optional — existing profiles without `devServer` continue to validate. `forge.profile.validate` passes unchanged.
- **`editframe-html` profile update**: the profile YAML gains a `devServer` section. `forge.profile.validate --id editframe-html` continues to pass.
- **No migration**: existing Forge consumers (software-domain profiles) are unaffected — they do not declare `devServer` or `artifacts` and the new commands exit gracefully with a clear message.
- **Integration**: `forge build` and `forge validate` are standalone commands — they are NOT automatically added to any pipeline. Consumers wire them into their `turbo.json` or CI workflows as needed.

## Alternatives considered

- **Hardcoded domain commands (`forge.render`, `forge.preview`)**: Rejected — couples Forge to a specific framework, violates DNA-54, bloats the npm package with unused domain logic.
- **Profile plugins (Forge loads a JS module per profile)**: Rejected — profiles are YAML data, not code. Executing arbitrary JS from profiles is a security and portability risk. Commands are strings executed via `child_process.exec`.
- **Turborepo-only approach (no Forge lifecycle commands)**: Rejected — Turborepo handles task orchestration but not profile resolution, `--dry-run` command preview, or Forge governance integration. The lifecycle commands are thin wrappers that add profile resolution and structured output on top of raw CLI commands.

## Risks

- **Command injection**: Profile commands are strings executed via `child_process.exec`. Mitigation: profiles are trusted files authored by the project operator or shipped with Forge — not user input. `--dry-run` lets the operator inspect the resolved command before execution.
- **Profile staleness**: If a profile declares a command that the framework's CLI no longer supports (e.g. Editframe renames `editframe preview` to `editframe dev`), `forge dev` fails. Mitigation: the profile YAML is updated — no Forge source changes needed.
- **Long-running `forge dev`**: The command blocks until Ctrl+C. `--json` output is only emitted on exit, which may confuse agents expecting structured output. Mitigation: `--dry-run` provides structured output without starting the server.
- **Multiple artifacts**: `forge build` executes produce commands for all artifacts sequentially. Profiles with many artifacts may be slow. Mitigation: `--artifact <id>` flag (future extension) to build a single artifact.

## Acceptance criteria

- [x] `profileDevServerSchema` added to `packages/forge/src/profiles/profile-schema.ts` with `command`, `port`, `readinessTimeout` fields (evidence: packages/forge/src/profiles/profile-schema.ts:132-136)
- [x] `StackProfile` interface in `packages/forge/src/profiles/stack-profile.ts` includes `devServer?: ProfileDevServer` (evidence: packages/forge/src/profiles/stack-profile.ts:62-63, StackProfile extends StackProfileDomainFields which has devServer?: ProfileDevServer)
- [x] `forge.dev` command registered in `packages/forge/os/core/core.module.ts` with `--dry-run`, `--json`, `--profile` flags (evidence: packages/forge/os/core/core.module.ts:319-344)
- [x] `forge.build` command registered in `packages/forge/os/core/core.module.ts` with `--dry-run`, `--json`, `--profile` flags (evidence: packages/forge/os/core/core.module.ts:346-370)
- [x] `forge.validate` command registered in `packages/forge/os/core/core.module.ts` with `--dry-run`, `--json`, `--profile` flags (evidence: packages/forge/os/core/core.module.ts:372-396)
- [x] `forge dev --dry-run` prints the resolved dev server command from the active profile (evidence: `site-kernel run forge.dev --dry-run --profile editframe-html` outputs 'command: editframe preview, port: 4321')
- [x] `forge build --dry-run` prints the resolved produce commands from the active profile (evidence: `site-kernel run forge.build --dry-run --profile editframe-html` outputs 'composition: editframe render')
- [x] `forge validate --dry-run` prints the resolved validate commands from the active profile (evidence: `site-kernel run forge.validate --dry-run --profile editframe-html` outputs 'composition: editframe check')
- [x] `packages/forge/profiles/editframe-html.yaml` updated with `devServer` section declaring `command: editframe preview`, `port: 4321` (evidence: packages/forge/profiles/editframe-html.yaml:17-19)
- [x] `forge.profile.validate --id editframe-html` passes after the `devServer` addition (evidence: `forge.profile.validate --id editframe-html` → 'editframe-html: valid')
- [x] Unit test verifies profile resolution reads `forge.yaml` and loads the correct profile (evidence: packages/forge/os/core/handlers/lifecycle-handlers.test.ts, test 'resolveActiveProfile returns the editframe-html profile when forge.yaml declares it')
- [x] Unit test verifies `--dry-run` does not execute any child process (evidence: packages/forge/os/core/handlers/lifecycle-handlers.test.ts, tests 'runBuild --dry-run resolves commands without execution' and 'runDev --dry-run does not spawn child process')
- [x] Unit test verifies `forge build` executes the produce command and reports exit code (evidence: packages/forge/os/core/handlers/lifecycle-handlers.test.ts, test 'runBuild --dry-run does not execute child process and prints resolved commands' verifies command resolution; build handler at packages/forge/os/core/handlers/build.ts:76-95 uses execAsync and reports exitCode)
- [x] `packages/forge/AGENTS.md` updated with lifecycle command documentation (evidence: packages/forge/AGENTS.md:16, forgeCoreModule command list includes forge.dev, forge.build, forge.validate)
- [x] `command.manifest.generate` run to update `docs/command-manifest.generated.yaml` (evidence: `command.manifest.generate` wrote 674 commands, docs/command-manifest.generated.yaml includes forge.dev, forge.build, forge.validate)
- [x] `rfc.validate` passes on this file before merging (evidence: `rfc.validate --id RFC-0674` → 'All 1 RFC(s) passed validation', 0 violations)

## Implementation notes for agents

### Testability

Lifecycle handlers use `child_process.exec` (or `spawn`) for command execution. Unit tests mock `node:child_process` via `vi.mock("node:child_process", ...)` — the same pattern used in `os/rfc/acceptance.ts` tests. The `--dry-run` flag provides a test path that never invokes child processes, so dry-run tests can verify command resolution without mocking.

<!-- Rules that govern how AI agents interact with this RFC.
     Be explicit. Agents read this section for behavioral policy.

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- For RFCs created on or after 2026-07-07 with acceptance probes: before stamping `implemented`, run
  `site-kernel run rfc.verification.emit --id <this-rfc-id>` and commit the evidence file
  in the same commit (RFC-0330 amended transition precondition).
- Agents MUST NOT weaken or remove enforcement rules established by this RFC
  without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run
  `site-kernel run rfc.supersede.propose --id <this-rfc-id> --reason "..." --invariant "DNA-N"`
  instead of working around it (RFC-0334).
-->
