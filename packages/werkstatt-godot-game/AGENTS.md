# `@warpgogol/werkstatt-godot-game` — Agent Guide

Werkstatt Godot plugin — Godot 4.x + C# stack. Implements the `werkstatt/plugin@1` contract for game projects using Godot 4.x with .NET 8+ and C#.

**Workspace type:** Package

This is a **package** workspace. Expose stable typed APIs. Do not import from apps or services.

## RFC-0855 program completion

All 25 packets (000–240) are completed. The Godot profile identity and stack behavior survive. The checked-in `werkstatt/plugin@1` entry is a **legacy code fact** — it still loads and functions, but is architecturally superseded. Converting hooks, validators, adapters, and invariants into versioned lifecycle-managed capabilities requires a superseding RFC. Do not add a plugin compatibility adapter, import this package into the engine, or enable untrusted production artifacts.

## Plugin contract

| Field | Value |
| --- | --- |
| `schema` | `werkstatt/plugin@1` |
| `id` | `werkstatt-godot-game` |
| `profileId` | `godot-csharp` |
| `moduleLoaders` | `checks`, `dev` |
| `deployAdapters` | `itch-io`, `github-releases` |
| `hooks` | `build`, `checkGate`, `releaseEvidence`, `scaffoldProject` |
| `paths` | `Scenes` (contentDir), `bin` (distDir), `project.godot` + `Game.csproj` (entryPoints) |
| `invariants` | GODOT-01..12 |

## Module layout

| Module | File | Description |
| --- | --- | --- |
| Plugin entry | `src/index.ts` | `werkstattGodotPlugin` export |
| Path conventions | `src/paths/godot-paths.ts` | Godot path constants |
| Invariants | `src/invariants/godot-invariants.ts` | GODOT-01..12 declarations |
| Scene validator | `src/checks/scene-validate.ts` | `godot.scene.validate` (GODOT-01) |
| Gitignore validator | `src/checks/gitignore-validate.ts` | `godot.gitignore.validate` (GODOT-02) |
| Secret scan | `src/checks/secret-scan.ts` | `godot.secret.scan` (GODOT-03) |
| Project config validator | `src/checks/project-config-validate.ts` | `godot.project.config.validate` (GODOT-04) |
| Scene reference validator | `src/checks/scene-reference-validate.ts` | `godot.scene.reference.validate` (GODOT-05) |
| Csproj validator | `src/checks/csproj-validate.ts` | `godot.csproj.validate` (GODOT-06) |
| Resource validator | `src/checks/resource-validate.ts` | `godot.resource.validate` (GODOT-07) |
| Script validator | `src/checks/script-validate.ts` | `godot.script.validate` (GODOT-08) |
| Export presets validator | `src/checks/export-presets-validate.ts` | `godot.export.presets.validate` (GODOT-09) |
| UID validator | `src/checks/uid-validate.ts` | `godot.uid.validate` (GODOT-10) |
| NuGet validator | `src/checks/nuget-validate.ts` | `godot.nuget.validate` (GODOT-11) |
| Addon validator | `src/checks/addon-validate.ts` | `godot.addon.validate` (GODOT-12) |
| Check gate | `src/checks/index.ts` | Runs all 12 validators in checkGate |
| Check module | `src/checks/module.ts` | Kernel module registering validators |
| Build hook | `src/build/dotnet-build.ts` | `hooks.build` — runs `dotnet build` then Godot export |
| Dev server | `src/build/godot-dev-server.ts` | `godot.dev.server` — launches `godot --editor` |
| Test runner | `src/build/dotnet-test.ts` | `godot.test` — runs `dotnet test` |
| Smoke test | `src/build/godot-smoke-test.ts` | `godot.smoke.test` — headless runtime error detection |
| Context generator | `src/build/godot-context-generate.ts` | `godot.context.generate` — structured project summary for AI agents |
| Playtest | `src/build/godot-playtest.ts` | `godot.playtest` — gameplay runtime error detection with deterministic input |
| Screenshot | `src/build/godot-screenshot.ts` | `godot.screenshot` — viewport capture via Xvfb |
| Dev module | `src/dev/module.ts` | Kernel module registering dev commands |
| itch.io deploy | `src/deploy/itch-io.ts` | `deployAdapters["itch-io"]` — multi-platform channels |
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
| GODOT-05 | Scene files (.tscn) res:// references must point to existing files | `godot.scene.reference.validate` |
| GODOT-06 | Game.csproj must use Godot.NET.Sdk, target net8.0, and enable dynamic loading | `godot.csproj.validate` |
| GODOT-07 | Resource files (.tres) must reside in Resources/ and their res:// references must exist | `godot.resource.validate` |
| GODOT-08 | C# scripts must have class name matching file name, partial keyword on Node subclasses, and using Godot; directive | `godot.script.validate` |
| GODOT-09 | export_presets.cfg must have valid presets with non-empty relative export paths and known platforms | `godot.export.presets.validate` |
| GODOT-10 | Scene (.tscn) and resource (.tres) files must have unique uid:// declarations | `godot.uid.validate` |
| GODOT-11 | Game.csproj NuGet package references must be Godot-compatible and non-problematic | `godot.nuget.validate` |
| GODOT-12 | Addons in addons/ must have valid plugin.cfg, be enabled in project.godot, and declare NuGet deps in Game.csproj for C# addons | `godot.addon.validate` |

## Check gate composition

`checkGate` runs all 12 validators in sequence:

1. `godot.scene.validate` — scene/script directory structure (GODOT-01)
2. `godot.gitignore.validate` — .godot/ is gitignored (GODOT-02)
3. `godot.secret.scan` — hardcoded secret detection (GODOT-03)
4. `godot.project.config.validate` — project.godot sensitive field changes vs git HEAD (GODOT-04, non-blocking)
5. `godot.scene.reference.validate` — scene res:// reference integrity (GODOT-05)
6. `godot.csproj.validate` — Game.csproj Godot C# settings (GODOT-06)
7. `godot.resource.validate` — .tres resource location and references (GODOT-07)
8. `godot.script.validate` — C# script conventions (GODOT-08)
9. `godot.export.presets.validate` — export presets config (GODOT-09)
10. `godot.uid.validate` — UID uniqueness in .tscn/.tres (GODOT-10)
11. `godot.nuget.validate` — NuGet packages in Game.csproj (GODOT-11)
12. `godot.addon.validate` — addon structure and NuGet deps (GODOT-12)

All must pass for checkGate to succeed (GODOT-04 is non-blocking warnings).

## Credential injection

Deploy adapters read credentials from `systems/registry.yaml` channel config, never from environment variables directly:

- **itch-io**: `deploy.itch.apiKey` (itch.io API key), `deploy.itch.project` (itch.io project URL)
- **github-releases**: `deploy.github.token` (GitHub access token), `deploy.github.repo` (e.g. `user/repo`)

## Build hook

`hooks.build` runs `dotnet build ./Game.csproj` in the workpiece directory via `execFileSync`. If `export_presets.cfg` exists, it then runs `godot --headless --export-release` for each preset. Reports success/failure via HookResult.

## Skills

Three Godot-specific skills are bundled with this plugin:

- **godot-feature**: Playbook for implementing new gameplay features, entities, or systems in Godot + C# projects.
- **godot-scene-review**: Playbook for reviewing diffs/PRs touching .tscn, .tres, project.godot, or .csproj files.
- **godot-debug**: Playbook for diagnosing bugs, crashes, exceptions, or unexpected behavior in Godot + C# projects.
- **godot-mcp-bridge**: Playbook for working with Godot MCP plugins that give AI agents direct editor and runtime control.

## Scripts

| Script        | Command                                   |
| ------------- | ----------------------------------------- |
| `lint`        | `pnpm exec eslint "src/**/*.ts"`          |
| `typecheck`   | `pnpm exec tsc -p tsconfig.json --noEmit` |
| `build`       | `pnpm exec tsc -p tsconfig.json --noEmit` |
| `build:check` | `pnpm exec tsc -p tsconfig.json --noEmit` |
| `test`        | `vitest run`                              |
| `test:watch`  | `vitest`                                  |

## Publication

This package is published via repo-extract (RFC-0773). See `extract.config.yaml` for the extraction configuration. The package MUST NOT be published without operator approval.
