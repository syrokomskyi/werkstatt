---
id: RFC-0779
title: "Consumer workshop scaffolding and onboarding"
status: accepted
# kind options: architecture | contract | command | policy | deprecation
kind: command
# scope options: app | workspace
scope: workspace
owners:
  - architecture
# Set by the deciding human together with the status change (RFC-0335).
# Draft scaffolds must keep this empty; do not prefill a default identity.
# Format: human:<handle> (agent:<id> reserved — see RFC-0335)
# Default reviewer when none is specified by the operator: human:andrii-syrokomskyi
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-08-09
updatedAt: 2026-08-09
enhancedAt: 2026-08-09
acceptedAt: 2026-08-09
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0769
  - RFC-0770
  - RFC-0773
  - RFC-0777
  - RFC-0778
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-62
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
    - workshop.scaffold
  added: []
  changed:
    - onboarding.scaffold
  removed: []
appsImpacted: []
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - packages/werkstatt
successSignals:
  - "workshop.scaffold creates a working workshop for each of the three stack profiles"
  - "Scaffolded workshop passes forge.doctor and werkstatt.plugin.validate"
nonGoals:
  - "No new engine or plugin code — this RFC wires existing pieces"
  - "No first-project creation — that is onboarding.scaffold per stack"
  - "No DNA-64 registration — that is RFC-0769 (charter); this RFC depends on it being accepted first"
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

# RFC-0779: Consumer workshop scaffolding and onboarding

## Context

The engine (`@warpgogol/werkstatt`), three plugins (`werkstatt-site`, `werkstatt-game`, `werkstatt-video`), and forge are all published to private npm (RFC-0773). An operator who wants a new workshop needs a scaffolding command that creates the workshop monorepo, installs the right engine + plugin pair, generates `tools/kernel.config.ts`, `forge.yaml`, `pnpm-workspace.yaml`, hooks, CI, and `.agents/` — ready to register the first project.

## Problem

Today, `forge.create` scaffolds a new project inside an existing workshop. There is no command for scaffolding the **workshop itself** — the monorepo that consumes the engine and a plugin. Without it, each new workshop is a manual copy-paste exercise prone to missing hooks, wrong kernel config, stale CI, or mismatched profile binding.

## Decision

A new `workshop.scaffold` command creates a consumer workshop monorepo from a stack profile selection:

```sh
pnpm exec werkstatt run workshop.scaffold --name my-game-workshop --stack phaser-turborepo --dest /path/to/my-game-workshop
```

### What `workshop.scaffold` generates directly

| Artifact | Content |
| --- | --- |
| `package.json` | Root package with `@warpgogol/werkstatt`, `@warpgogol/werkstatt-<stack>`, `@warpgogol/forge` as dependencies |
| `pnpm-workspace.yaml` | `packages: ["packages/*", "services/*", "missions/*/workpiece"]` |
| `turbo.json` | Minimal pipeline config |
| `tools/kernel.config.ts` | Imports engine + selected plugin; registers plugin via `plugins: [werkstattXxxPlugin]` |
| `.npmrc` | Scoped registry config for `@warpgogol` (private npm token placeholder — operator fills in before `pnpm install`) |
| `tsconfig/base.json` | Shared TypeScript config |
| `eslint.config.js` | Minimal ESLint config |
| `.prettierrc.mjs` | Prettier config |
| `.gitignore` | Standard ignores (missions, releases, cache, etc.) |
| `.gitattributes` | LFS patterns (if site stack) |
| `hooks/pre-commit` | Platform-scope guard (same as current workshop) |
| `.github/workflows/ci.yml` | CI: install, typecheck, test, `werkstatt.autonomy.validate`, `werkstatt.plugin.validate` |
| `systems/registry.yaml` | Empty registry with schema comment |
| `missions/.gitkeep` | Placeholder |
| `.forge/pinned.yaml` | Foundation files pinned (DNA-62) |
| `README.md` | Workshop README with quickstart (includes npm token setup instructions) |

### What `workshop.scaffold` delegates to `forge.init`

The following artifacts are created by `forge.init` (and `forge.agents.generate`) running inside the new workshop directory after `workshop.scaffold` creates the workshop-specific files:

| Artifact | Created by |
| --- | --- |
| `forge.yaml` | `forge.init` (with stack set to chosen profile, bindings referencing `werkstatt run` commands) |
| `PREFERENCES.md` | `forge.init` |
| `.agents/skills/` | `forge.init` (syncs forge skills) |
| `.agents/memory/` | `forge.init` (memory layer scaffold, RFC-0664) |
| `AGENTS.md` | `forge.agents.generate` (with stack-specific instructions) |
| `docs/rfcs/` | `forge.init` (creates dirs) |
| `docs/adrs/` | `forge.init` (creates dirs) |
| `docs/plans/` | `forge.init` (creates dirs) |
| `docs/audits/` | `forge.init` (creates dirs) |
| `docs/rfcs/rfc-0000-template.md` | `forge.init` (RFC template) |
| `docs/adrs/adr-0000-template.md` | `forge.init` (ADR template) |

### Stack-specific generation

The scaffold command reads the forge stack profile (e.g. `phaser-turborepo`) and the corresponding plugin to customize:

- **Site stack**: `.gitattributes` with LFS patterns, `integrations/` and `fleet/` directories (empty), `services/` with placeholder
- **Game stack**: No LFS patterns, no `integrations/`/`fleet/`, game-oriented CI (build + bundle validate)
- **Video stack**: No LFS patterns, video-oriented CI (composition validate + render validate)

### Post-scaffold verification

By default (`--skip-install` not set), `workshop.scaffold` skips `pnpm install` and verification steps because the `.npmrc` contains a placeholder token. The operator must:

1. Fill in the `.npmrc` token with a valid npm read token for the `@warpgogol` scope
2. Run `pnpm install` manually
3. Run `pnpm exec werkstatt run forge.doctor` — verifies forge config, skills, bindings
4. Run `pnpm exec werkstatt run werkstatt.plugin.validate` — verifies plugin registration and profile binding
5. Run `pnpm exec werkstatt run werkstatt.autonomy.validate` — verifies engine autonomy (no plugin imports in engine)

With `--verify` flag (requires valid `.npmrc` token), `workshop.scaffold` runs all four steps automatically after generation.

### First project onboarding

After the workshop is scaffolded, the operator creates the first project using the existing `onboarding.scaffold` command (now provided by the plugin's `hooks.scaffoldProject`):

```sh
pnpm exec werkstatt run onboarding.scaffold --system my-first-game --title "My First Game"
```

## Architectural fit

- **DNA-1, 2** — the scaffolded workshop follows the monorepo boundary and pnpm+Turborepo layout.
- **DNA-64** — the scaffolded workshop composes engine + exactly one plugin.
- **DNA-62 (pinned files)** — foundation files are pinned from creation.
- **Forge `forge.init`** — `workshop.scaffold` delegates to `forge.init` for forge-specific artifacts (forge.yaml, skills, AGENTS.md, docs dirs, templates). `forge.init` writes into an existing directory; `forge.create` creates a subdirectory project — the wrong abstraction level for workshop scaffolding.
- **CLI name dependency** — this RFC uses `pnpm exec werkstatt run` (the consolidated engine CLI). The rename from `site-kernel run` to `werkstatt run` happens in RFC-0772 (wave 2). This RFC (wave 5) assumes that rename is complete.

## Design

### TypeScript contracts

```ts
interface ScaffoldWorkshopInput {
  name: string;           // kebab-case workshop name
  stack: string;          // forge stack profile id
  dest: string;           // absolute path for new workshop directory
  dryRun?: boolean;       // preview without writing
  verify?: boolean;       // run post-scaffold verification (requires valid .npmrc)
}

interface ScaffoldWorkshopResult {
  command: "workshop.scaffold";
  status: "pass" | "fail";
  workshop: {
    name: string;
    stack: string;
    path: string;
    plugin: string;
    engine: string;
  };
  verification?: {
    "forge.doctor": "pass" | "fail" | "skipped";
    "werkstatt.plugin.validate": "pass" | "fail" | "skipped";
    "werkstatt.autonomy.validate": "pass" | "fail" | "skipped";
  };
  filesCreated: string[];
  errors: string[];
}
```

Command metadata: `scope: workspace`, `requiresNetwork: true` (npm install), `longRunning: true` (install + verification may take minutes).

### CLI surface

```sh
# Scaffold a new workshop (default: skip install, operator fills .npmrc manually)
pnpm exec werkstatt run workshop.scaffold --name my-site-workshop --stack astro-typescript-turborepo --dest /path/to/workshop

# Dry-run (preview generated files without writing)
pnpm exec werkstatt run workshop.scaffold --name my-game-workshop --stack phaser-turborepo --dest /path/to/workshop --dry-run

# With automatic verification (requires valid .npmrc token)
pnpm exec werkstatt run workshop.scaffold --name my-video-workshop --stack editframe --dest /path/to/workshop --verify
```

### Output format

```json
{
  "command": "workshop.scaffold",
  "status": "pass",
  "workshop": {
    "name": "my-game-workshop",
    "stack": "phaser-turborepo",
    "path": "/path/to/my-game-workshop",
    "plugin": "werkstatt-game",
    "engine": "@warpgogol/werkstatt"
  },
  "verification": {
    "forge.doctor": "pass",
    "werkstatt.plugin.validate": "pass",
    "werkstatt.autonomy.validate": "pass"
  }
}
```

### Failure modes

- Unknown stack profile → exit 1, `SCAFFOLD-01`.
- Plugin not installed (npm package not found) → exit 1, `SCAFFOLD-02`.
- `forge.doctor` fails → exit 1, `SCAFFOLD-03`.
- `werkstatt.plugin.validate` fails → exit 1, `SCAFFOLD-04`.
- Destination directory not empty → exit 1, `SCAFFOLD-05`.
- npm auth failure (invalid/expired token in `.npmrc` during `--verify`) → exit 1, `SCAFFOLD-06`.

### Edge cases

- **Concurrent execution:** two `workshop.scaffold` commands targeting the same directory — the second fails with `SCAFFOLD-05` (non-empty) after the first creates the directory. Race between `mkdir` and non-empty check is possible but non-fatal: worst case, a partial directory is left behind.
- **Interrupted operation:** if `workshop.scaffold` crashes mid-generation, the partial directory is left for the operator to inspect or delete. No rollback mechanism — the command is not transactional.
- **Empty states:** a scaffolded workshop with no projects, no missions, and no packages is valid — `systems/registry.yaml` is empty, `missions/` contains only `.gitkeep`.

## Rollout

- Implemented last in the program (wave 5), after all three plugins exist and are published.
- The first real consumer workshop (a game or video workshop) is created using this command, validating the end-to-end flow.

## Alternatives considered

- **Manual workshop creation (copy from this monorepo).** Rejected: this monorepo has too much site-specific content; copying produces a workshop with hidden site assumptions.
- **`forge.create` as the workshop scaffolder.** Rejected: `forge.create` scaffolds a project inside a workshop; `workshop.scaffold` creates the workshop itself. They are different abstraction levels. `workshop.scaffold` delegates to `forge.init` for forge-specific artifacts (forge.yaml, skills, AGENTS.md, docs dirs).

## Risks

- **Private npm access for new operators.** The scaffolded workshop needs an `.npmrc` with a valid npm token. The scaffold generates a placeholder; the operator must fill it in. Documented in the README.
- **Stack profile drift.** If forge updates a stack profile after a workshop is scaffolded, the workshop may be on an older profile version. Mitigation: `forge.doctor` checks for profile updates; `forge.upgrade` applies them.
- **Plugin not yet published.** If the operator runs `workshop.scaffold` for a stack whose plugin is not yet published (e.g. game before RFC-0777 is implemented), `SCAFFOLD-02` fires. The error message guides the operator to check plugin availability.

## Acceptance criteria

- [ ] `workshop.scaffold` command registered (workspace scope)
- [ ] Generates all artifacts listed in the table above
- [ ] Stack-specific customization works for all three profiles (site, game, video)
- [ ] Post-scaffold verification (`forge.doctor`, `werkstatt.plugin.validate`, `werkstatt.autonomy.validate`) passes
- [ ] SCAFFOLD-01..06 failure modes covered by unit tests
- [ ] End-to-end: scaffold a game workshop → register a game project → build → deploy
- [ ] `rfc.validate` passes on this file before merging

## Implementation notes for agents

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
