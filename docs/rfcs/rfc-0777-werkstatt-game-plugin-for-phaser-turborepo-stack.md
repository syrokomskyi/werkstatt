---
id: RFC-0777
title: "Werkstatt game plugin for phaser turborepo stack"
status: accepted
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
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-08-09
updatedAt: 2026-08-09
enhancedAt: 2026-08-09
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0769
  - RFC-0770
  - RFC-0771
  - RFC-0773
  - RFC-0774
  - RFC-0778
  - RFC-0779
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-1
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
    - game.assets.validate
    - game.scenes.validate
    - game.bundle.validate
  added: []
  changed: []
  removed: []
appsImpacted: []
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - packages/werkstatt-game
successSignals:
  - "werkstatt-game registers via plugin contract and werkstatt.plugin.validate passes"
  - "A Phaser game project builds, deploys to GitHub Pages, and passes game-specific checks"
nonGoals:
  - "No game engine changes — Phaser is the consumer's choice, not the plugin's"
  - "No game content — games are projects, not plugin content"
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

# RFC-0777: Werkstatt game plugin for phaser turborepo stack

## Context

Forge already ships the `phaser-turborepo` stack profile (`packages/forge/profiles/phaser-turborepo.yaml`). The engine (RFC-0772) provides missions, releases, Leitstand, Bordbuch — all stack-agnostic. A game workshop needs a plugin that provides Phaser-specific path conventions, build hooks, deploy adapters, and game-oriented validators. This RFC specifies `@warpgogol/werkstatt-game` in full.

## Problem

Without a game plugin, a game workshop can install the engine but has no path conventions for Phaser projects (scenes, assets, `phaser.config.ts`), no build hook (Phaser uses Vite, not Astro), no deploy adapter (GitHub Pages or Cloudflare Pages, not Workers), and no game-specific validators (asset manifest, scene registry, bundle size).

## Decision

`packages/werkstatt-game` (npm: `@warpgogol/werkstatt-game`) is created with `profileId: "phaser-turborepo"`:

| Plugin module | Content |
| --- | --- |
| `paths/` | Phaser path conventions: `src/scenes/`, `src/assets/`, `public/`, `dist/` (Vite output), `phaser.config.ts` entry |
| `build/` | `hooks.build`: runs `vite build` (or `phaser build`) in the workpiece |
| `checks/` | Game validators: `game.assets.validate` (asset manifest completeness), `game.scenes.validate` (scene registry consistency), `game.bundle.validate` (bundle size budget) |
| `deploy/github-pages/` | `deployAdapters["github-pages"]`: builds and deploys to GitHub Pages |
| `deploy/cloudflare-pages/` | `deployAdapters["cloudflare-pages"]`: builds and deploys to Cloudflare Pages |
| `onboarding/` | `hooks.scaffoldProject`: generates a new Phaser project with scene boilerplate, asset manifest, `phaser.config.ts` |
| `release-evidence/` | `hooks.releaseEvidence`: game-specific release evidence (bundle hash, asset manifest hash, scene registry hash) |
| `invariants/` | Game stack invariants surfaced to agents (AGENTS.md generation) |

### Stack invariants

| ID | Invariant |
| --- | --- |
| `GAME-01` | Every scene in `src/scenes/` must be registered in `phaser.config.ts` |
| `GAME-02` | Every asset referenced by a scene must exist in `src/assets/` and be listed in the asset manifest |
| `GAME-03` | Bundle size must not exceed the declared budget (default 5 MB gzipped) |
| `GAME-04` | No hardcoded API keys or secrets in game source — enforced by secret scan |

### Plugin entry point

```ts
import type { WerkstattPlugin } from "@warpgogol/werkstatt/plugin";

export const werkstattGamePlugin: WerkstattPlugin = {
  schema: "werkstatt/plugin@1",
  id: "werkstatt-game",
  profileId: "phaser-turborepo",
  paths: phaserPathConventions,
  moduleLoaders: { /* checks, onboarding */ },
  deployAdapters: {
    "github-pages": createGitHubPagesAdapter,
    "cloudflare-pages": createCloudflarePagesAdapter,
  },
  hooks: { build, checkGate, releaseEvidence, scaffoldProject },
  invariants: [/* GAME-01..04 */],
};
```

### Hook scope: why `materialize` is omitted

The `WerkstattPluginHooks` interface (RFC-0770) includes an optional `materialize` hook for scaffolding/regenerating the workpiece after authored data injection. The game plugin omits it intentionally: game projects have no authored-data injection step (no business profiles, no content collections). The workpiece is created by `scaffoldProject` and then developed directly by the game developer. The engine's default materialize behavior (creating the workpiece directory from the project template) is sufficient. If a future game variant needs generated content (e.g. localization injection), a `materialize` hook can be added via amendment.

## Architectural fit

- **DNA-1 (monorepo boundary)** — the game plugin is shared reusable logic in `packages/*`, published as a private npm package. Game projects remain Sternsystemen outside the workshop in mirrors per RFC-0574. No cross-project imports at runtime.
- **DNA-64 (engine/plugin/workshop boundary, established by RFC-0769 — currently draft)** — the game plugin implements the same `WerkstattPlugin` contract as the site plugin. DNA-64 will enter `docs/architecture-dna.md` upon RFC-0769 implementation; until then this RFC references it as a forward dependency.
- **DNA-46..49** — mission/release/Leitstand semantics unchanged; the plugin supplies the build and deploy hooks.
- **Forge `phaser-turborepo` profile** — the plugin's `profileId` binds to it; `forge.doctor` cross-checks.

## Design

### Game workshop layout

```
my-game-workshop/                    ← consumer monorepo
├── forge.yaml                       → stack: [typescript, phaser, turborepo]
├── tools/kernel.config.ts           → imports werkstatt + werkstatt-game
├── systems/registry.yaml            → game projects
├── missions/                        → workpieces
├── docs/                            → RFC, ADR
├── .agents/                         → instructions
├── hooks/                           → pre-commit, etc.
├── .github/workflows/               → CI
├── packages/                        → workshop-local packages (if any)
├── services/                        → workshop-local services (if any)
└── node_modules/
    ├── @warpgogol/werkstatt/        ← engine
    ├── @warpgogol/werkstatt-game/   ← plugin
    └── @warpgogol/forge/            ← governance
```

### Game project layout (in mirrors, outside workshop)

```
../systems-cache/my-first-game/
├── src/
│   ├── scenes/
│   │   ├── boot.ts
│   │   ├── menu.ts
│   │   └── level-01.ts
│   ├── assets/
│   │   ├── sprites/
│   │   ├── audio/
│   │   └── manifest.yaml
│   └── main.ts
├── public/
├── phaser.config.ts
├── package.json
└── tsconfig.json
```

### CLI surface

Game validators run through the same `werkstatt run` CLI:

```sh
pnpm exec werkstatt run game.assets.validate --system my-first-game
pnpm exec werkstatt run game.scenes.validate --system my-first-game
pnpm exec werkstatt run game.bundle.validate --system my-first-game
```

### Output format

All three validators return a uniform `--json` shape:

```json
{
  "command": "game.assets.validate",
  "status": "pass",
  "violations": []
}
```

On failure:

```json
{
  "command": "game.scenes.validate",
  "status": "fail",
  "violations": [
    { "ruleId": "GAME-01", "file": "src/scenes/level-01.ts", "message": "Scene not registered in phaser.config.ts" }
  ]
}
```

`game.bundle.validate` uses `ruleId: "GAME-03"` and includes the bundle size and budget in the violation:

```json
{
  "command": "game.bundle.validate",
  "status": "fail",
  "violations": [
    { "ruleId": "GAME-03", "bundleBytes": 6291456, "budgetBytes": 5242880, "message": "Bundle exceeds 5 MB gzipped budget" }
  ]
}
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/werkstatt-game/src/paths/` | Phaser path conventions (`src/scenes/`, `src/assets/`, `public/`, `dist/`, `phaser.config.ts` entry) |
| `packages/werkstatt-game/src/checks/` | `game.assets.validate`, `game.scenes.validate`, `game.bundle.validate` validators |
| `packages/werkstatt-game/src/build/` | `hooks.build` — runs `vite build` in the workpiece |
| `packages/werkstatt-game/src/deploy/github-pages/` | `deployAdapters["github-pages"]` |
| `packages/werkstatt-game/src/deploy/cloudflare-pages/` | `deployAdapters["cloudflare-pages"]` |
| `packages/werkstatt-game/src/onboarding/` | `hooks.scaffoldProject` — generates Phaser project boilerplate |
| `packages/werkstatt-game/src/release-evidence/` | `hooks.releaseEvidence` — bundle hash, asset manifest hash, scene registry hash |
| `packages/werkstatt-game/src/invariants/` | Game stack invariants surfaced to agents (AGENTS.md generation) |
| `packages/werkstatt-game/extract.config.yaml` | Publication config (RFC-0773) |

### Empty-state behavior

A freshly scaffolded game project (from `hooks.scaffoldProject`) contains one boot scene and an empty asset manifest. Validators must pass on this state:

- `game.scenes.validate` — passes if at least one scene is registered in `phaser.config.ts` (the boot scene). Zero scenes is a `GAME-01` violation.
- `game.assets.validate` — passes with an empty manifest (zero assets to check). An empty manifest is valid; missing entries for referenced assets are not.
- `game.bundle.validate` — passes if the bundle is under the budget. A minimal boot-scene bundle is well under 5 MB.

### Bundle budget source of truth

The bundle size budget is declared in the game project's `phaser.config.ts` under a `bundleBudget` field (bytes, gzipped). If absent, the default is 5 MB (5242880 bytes). `game.bundle.validate` reads the budget from the project config, not from the plugin or workshop config.

### Failure modes

- Missing scene in `phaser.config.ts` → `GAME-01` violation, exit 1.
- Asset referenced but not found → `GAME-02` violation, exit 1.
- Bundle exceeds budget → `GAME-03` warning (configurable to error).

## Rollout

- Implemented after the site plugin is live and the workshop migration (RFC-0776) is complete.
- The first real game project validates the plugin; contract gaps are fixed forward.

## Alternatives considered

- **Using the site plugin for games (Astro + Phaser integration).** Rejected: Phaser games are not Astro sites; the build, deploy, and validation models are fundamentally different.
- **No deploy adapters in the plugin (manual deploy).** Rejected: the Leitstand automate promote flow requires adapter plugins.

## Risks

- **Phaser version churn.** Phaser 3 vs 4 vs CE have different APIs. The plugin does not depend on Phaser directly — it validates project structure and builds via the project's own Vite config. Phaser version is the project's choice.
- **GitHub Pages deploy specifics.** Branch naming (`gh-pages` vs `main`), base path, etc. The adapter accepts configuration from `systems/registry.yaml` channel config.
- **No LFS-tracked binary assets in the plugin package.** `packages/werkstatt-game` contains TypeScript code, YAML schemas, and onboarding templates (scene boilerplate, asset manifest skeleton) — no binary game assets. Binary game assets (sprites, audio) live in game project mirrors, not in the plugin package. The extraction pipeline (RFC-0773) does not need LFS support for this package.

## Acceptance criteria

- [ ] `packages/werkstatt-game` exists with `profileId: "phaser-turborepo"`
- [ ] Plugin registers via `WerkstattPlugin` and passes `werkstatt.plugin.validate`
- [ ] `game.assets.validate`, `game.scenes.validate`, `game.bundle.validate` registered
- [ ] `github-pages` and `cloudflare-pages` deploy adapters work (verified with a test game project)
- [ ] `hooks.scaffoldProject` creates a valid Phaser project that builds
- [ ] `extract.config.yaml` exists (RFC-0773)
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
