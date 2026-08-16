# `@warpgogol/werkstatt-godot` — Agent Guide

Werkstatt Godot plugin — Godot 4.x + C# stack. Implements the `werkstatt/plugin@1` contract for game projects using Godot 4.x with .NET 8+ and C#.

**Workspace type:** Package

This is a **package** workspace. Expose stable typed APIs. Do not import from apps or services.

## RFC-0855 program completion

All 25 packets (000–240) are completed. The Godot profile identity and stack behavior survive. The checked-in `werkstatt/plugin@1` entry is a **legacy code fact** — it still loads and functions, but is architecturally superseded. Converting hooks, validators, adapters, and invariants into versioned lifecycle-managed capabilities requires a superseding RFC. Do not add a plugin compatibility adapter, import this package into the engine, or enable untrusted production artifacts.

## Plugin contract

| Field | Value |
| --- | --- |
| `schema` | `werkstatt/plugin@1` |
| `id` | `werkstatt-godot` |
| `profileId` | `godot-csharp` |
| `moduleLoaders` | `checks` |
| `deployAdapters` | `itch-io`, `github-releases` |
| `hooks` | `build`, `checkGate`, `releaseEvidence`, `scaffoldProject` |
| `paths` | `Scenes` (contentDir), `bin` (distDir), `project.godot` + `Game.csproj` (entryPoints) |
| `invariants` | GODOT-01..04 |

## Module layout

| Module | File | Description |
| --- | --- | --- |
| Plugin entry | `src/index.ts` | `werkstattGodotPlugin` export |
| Path conventions | `src/paths/godot-paths.ts` | Godot path constants |
| Invariants | `src/invariants/godot-invariants.ts` | GODOT-01..04 declarations |
| Scene validator | `src/checks/scene-validate.ts` | `godot.scene.validate` (GODOT-01) |
| Gitignore validator | `src/checks/gitignore-validate.ts` | `godot.gitignore.validate` (GODOT-02) |
| Secret scan | `src/checks/secret-scan.ts` | `godot.secret.scan` (GODOT-03) |
| Project config validator | `src/checks/project-config-validate.ts` | `godot.project.config.validate` (GODOT-04) |
| Check gate | `src/checks/index.ts` | Runs all 4 validators in checkGate |
| Check module | `src/checks/module.ts` | Kernel module registering validators |
| Build hook | `src/build/dotnet-build.ts` | `hooks.build` — runs `dotnet build` |
| itch.io deploy | `src/deploy/itch-io.ts` | `deployAdapters["itch-io"]` |
| GitHub Releases | `src/deploy/github-releases.ts` | `deployAdapters["github-releases"]` |
| Scaffold | `src/onboarding/scaffold-project.ts` | `hooks.scaffoldProject` |
| Release evidence | `src/release-evidence/godot-evidence.ts` | `hooks.releaseEvidence` |

## Stack invariants

| ID | Invariant | Enforced by |
| --- | --- | --- |
| GODOT-01 | Scene files (.tscn) must reside in Scenes/ and scripts (.cs) in Scripts/ | `godot.scene.validate` |
| GODOT-02 | The .godot/ directory must not be committed to git | `godot.gitignore.validate` |
| GODOT-03 | No hardcoded API keys or secrets in C# source files | `godot.secret.scan` |
| GODOT-04 | project.godot autoloads and input map changes require explicit confirmation | `godot.project.config.validate` |

## Check gate composition

`checkGate` runs all 4 validators in sequence:

1. `godot.scene.validate` — scene/script directory structure (GODOT-01)
2. `godot.gitignore.validate` — .godot/ is gitignored (GODOT-02)
3. `godot.secret.scan` — hardcoded secret detection (GODOT-03)
4. `godot.project.config.validate` — project.godot sensitive field watch (GODOT-04)

All must pass for checkGate to succeed.

## Credential injection

Deploy adapters read credentials from `systems/registry.yaml` channel config, never from environment variables directly:

- **itch-io**: `deploy.itch.apiKey` (itch.io API key), `deploy.itch.project` (itch.io project URL)
- **github-releases**: `deploy.github.token` (GitHub access token), `deploy.github.repo` (e.g. `user/repo`)

## Build hook

`hooks.build` runs `dotnet build ./Game.csproj` in the workpiece directory via `execFileSync`. Reports success/failure via HookResult.

## Skills

Three Godot-specific skills are bundled with this plugin:

- **godot-feature**: Playbook for implementing new gameplay features, entities, or systems in Godot + C# projects.
- **godot-scene-review**: Playbook for reviewing diffs/PRs touching .tscn, .tres, project.godot, or .csproj files.
- **godot-debug**: Playbook for diagnosing bugs, crashes, exceptions, or unexpected behavior in Godot + C# projects.

## Scripts

| Script        | Command                                   |
| ------------- | ----------------------------------------- |
| `build`       | `pnpm exec tsc -p tsconfig.json --noEmit` |
| `build:check` | `pnpm exec tsc -p tsconfig.json --noEmit` |
| `test`        | `vitest run`                              |
| `test:watch`  | `vitest`                                  |

## Publication

This package is published via repo-extract (RFC-0773). See `extract.config.yaml` for the extraction configuration. The package MUST NOT be published without operator approval.
