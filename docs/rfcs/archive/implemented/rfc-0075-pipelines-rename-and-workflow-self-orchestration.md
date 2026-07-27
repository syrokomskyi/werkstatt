---
id: RFC-0075
title: "Rename STANDARD_CHECK_PIPELINE to APPS_CHECK_PIPELINE, add PACKAGES_CHECK_PIPELINE, rewrite .agents/workflows/ for self-orchestration"
status: implemented
kind: policy
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-05-18
updatedAt: 2026-05-18
implementedAt: 2026-05-18
closedAt:
supersedes: []
supersededBy:
related:
  - DNA-35
  - RFC-0023
  - RFC-0025
  - RFC-0070
  - RFC-0071
  - RFC-0072
  - RFC-0073
  - RFC-0074
commands:
  proposed:
    - apps-check.run
    - packages-check.run
    - workflow.lint
    - workflow.list
  added:
    - apps-check.run
    - packages-check.run
    - workflow.lint
    - workflow.list
  changed:
    - app.contract.full
  removed: []
appsImpacted:
  - nicaragua-projekt
packagesImpacted:
  - os/site-kernel
  - os/site-kernel-checks
  - ontology
  - share
  - business
  - growth
  - tokens
  - ui
successSignals:
  - STANDARD_CHECK_PIPELINE is renamed to APPS_CHECK_PIPELINE; PACKAGES_CHECK_PIPELINE is introduced and runs the workspace-level package contracts
  - apps-check.run --app <id> is the single canonical entry point for app validation; packages-check.run is the single canonical entry point for package validation
  - .agents/workflows/ contains seven files named 00-prepare → 06-handoff; legacy plant-seed / plant-content / update-content / review files are removed
  - Each workflow file is executable end-to-end by an AI agent running Bash/Edit tools in Windsurf — no human-typed commands required up to the moment the site opens in a browser
  - workflow.lint blocks merges of workflow files that reference missing kernel commands or invalid scopes
nonGoals:
  - Replacing AGENTS.md guidance with workflow files (AGENTS.md still owns invariants; workflows own sequences)
  - Building a full workflow engine with retries, fan-out, and state machines (sequences are simple; status.md holds state)
  - Preserving any portion of the legacy workflow files
  - Removing existing kernel commands; only the pipeline name and contents change
---

# RFC-0075: Rename STANDARD_CHECK_PIPELINE to APPS_CHECK_PIPELINE, add PACKAGES_CHECK_PIPELINE, rewrite .agents/workflows/ for self-orchestration

## Context

Two architectural changes belong together:

1. The single `STANDARD_CHECK_PIPELINE` in `@gogol/site-kernel-checks` is _implicitly_ the apps pipeline — it runs over a single app and validates its files. The codebase also needs a _packages_ pipeline (for `packages/ontology`, `packages/ui`, `packages/share`, the kernel itself) that validates workspace-level contracts like the archetype catalog (RFC-0072), the biome and site-family catalog (RFC-0071), section completeness, and naming. Today these checks are scattered across the apps pipeline and the build-prepare pipeline; the right home is a dedicated `PACKAGES_CHECK_PIPELINE`.

2. The `.agents/workflows/` folder still contains four legacy files (`plant-seed.md`, `plant-content.md`, `update-content.md`, `review.md`) that pre-date the cosmic overlay, system.md, block-declarative pages, and the onboarding pipeline. They cannot be safely followed against the current architecture. With RFC-0070–0074 in flight, workflows become the active orchestration surface for AI agents driving an onboarding from `.input/` to a passing app — they need to be rewritten from scratch with self-orchestration in mind.

The user works in Windsurf, where the AI agent can call Bash, Edit, Read, and Write tools directly. The workflow files are the agent's runbook: they describe a sequence of kernel-command invocations and prompt-time decisions concrete enough that the agent executes them itself, only pausing for the human when a real human-side decision is needed (mainly: review the changelist before deploy).

## Problem

1. **Pipeline name lies about scope.** `STANDARD_CHECK_PIPELINE` runs over an app, not the workspace. The name is misleading and the implicit dual purpose obscures the fact that packages also need a check pipeline.
2. **Package-level contracts are inconsistently enforced.** Some land in `STANDARD_CHECK_PIPELINE` (e.g. `manifest.contract.validate` runs from `STANDARD_BUILD_PREPARE_PIPELINE`), some are absent.
3. **Legacy workflows are dangerous.** They reference paths (`spec/001-010/`, `src/configure/features.ts`) that no longer exist.
4. **No workflow shape contract.** Agents have no schema for what a workflow file declares (inputs, outputs, scope, recovery), no `workflow.lint` to catch references to missing commands, no machine-readable map of "this workflow drives this phase."
5. **Self-orchestration is undefined.** It is unclear, today, whether an agent following a workflow should ask the user before running `pnpm exec site-kernel run …` or run it directly. In a Windsurf setup, the answer should be "run directly until a human-side decision is required."

## Decision

Two renames + one new pipeline + a full rewrite of `.agents/workflows/`:

1. **Rename `STANDARD_CHECK_PIPELINE` → `APPS_CHECK_PIPELINE`.** Same shape; runs over one app. Apps that previously imported the symbol update to the new name.
2. **Introduce `PACKAGES_CHECK_PIPELINE`.** New constant exported from `@gogol/site-kernel-checks`. Contains the workspace-level package validations. Runs over the whole workspace (or a subset of `packages/*`).
3. **Introduce two driver commands**: `apps-check.run --app <id>` and `packages-check.run`. One command, one purpose each. Both emit the shared envelope.
4. **Rewrite `.agents/workflows/`** to seven phase-aligned files. Each file's body is concrete, imperative, and structured around `pnpm exec site-kernel run …` invocations. The agent executes them directly.
5. **Add `workflow.lint`** to gate workflow file quality and `workflow.list` for agent discovery.

`STANDARD_BUILD_PREPARE_PIPELINE` is also renamed to `APPS_BUILD_PREPARE_PIPELINE` for parallel naming.

## Architectural fit

- **RFC-0070 phases.** Workflows are how the agent walks the five phases.
- **RFC-0071/72/73/74.** Workflow steps call into the commands introduced by those RFCs.
- **AGENTS.md.** Workflows do not replace AGENTS.md; they reference its invariants by section.

## Design

### Pipeline composition

```ts
// packages/os/site-kernel-checks/src/module.ts (after this RFC)

// One app's gates. Renamed; same semantic.
export const APPS_CHECK_PIPELINE: KernelPipelineStep[] = [
  // Onboarding contract — only if onboarding/.input/00-brief.md exists for this client
  { command: "brief.validate", conditional: "ifBriefPresent" },
  // RFC-0023 uni ontology
  { command: "uni.registry.validate" },
  // RFC-0025 cosmic overlay + feature-first layout contract
  { command: "app.layout.validate" },
  { command: "system.manifest.validate" },
  { command: "biome.contract.validate" },
  { command: "cosmic.catalog.validate" },
  { command: "cosmic.name.unique" },
  { command: "constellation.compose.validate" },
  { command: "client.edit.validate" },
  // RFC-0047 CMS surface
  { command: "content.surface.validate" },
  // RFC-0026 block-declarative pages
  { command: "page.block.validate" },
  // RFC-0036 shell-level blocks
  { command: "page.shell.validate" },
  { command: "visibility.expr.validate" },
  { command: "page.pipeline.contract" },
  { command: "runtime.context.shape" },
  // RFC-0073 content discipline
  { command: "content.business.validate" },
  { command: "content.references.validate" },
  { command: "content.voice.lint" },
  { command: "content.coverage.validate" },
  // RFC-0074 deterministic audits (fast — LLM audits run inside app.qa.validate only)
  { command: "seo.technical.validate" },
  { command: "seo.structured-data.validate" },
  { command: "seo.internal-linking.validate" },
  { command: "analytics.config.validate" },
  { command: "first-party-data.validate" },
  { command: "infra.brief.validate" },
  // RFC-0027 growth
  { command: "growth.events.validate" },
  { command: "growth.funnel.validate" },
  { command: "growth.experiment.validate" },
  { command: "growth.experiment.archive" },
  { command: "growth.adapter.contract" },
  { command: "growth.vendor.resolve" },
  // RFC-0028 cosmic passport
  { command: "nebula.score.compute" },
  { command: "star-map.render" },
  { command: "passport.emit" },
  { command: "passport.verify" },
  // structural integrity (existing)
  { command: "naming.convention.lint" },
  { command: "kernel.result.envelope.lint" },
  { command: "mirror.triad.validate" },
  { command: "mirror.quartet.validate" },
  { command: "dispatcher.sync.validate" },
  // semantic integrity (existing)
  { command: "route.thin.validate" },
  { command: "feature.visibility.validate" },
  { command: "structure.hierarchy.validate" },
  { command: "navigation.section.validate" },
  // layer-specific (existing)
  { command: "naming.pages.lint" },
  { command: "naming.suffixes.lint" },
  { command: "naming.layouts.lint" },
  { command: "content.layouts.validate" },
  { command: "naming.components.lint" },
  { command: "naming.styles.lint" },
  { command: "assets.structure.lint" },
  { command: "scripts.placement.validate" },
  { command: "schema.drift.validate" },
  // …existing remaining checks…
];

// Workspace-level gates. NEW. Runs over packages/*.
export const PACKAGES_CHECK_PIPELINE: KernelPipelineStep[] = [
  // RFC-0023 manifests
  { command: "manifest.contract.validate" },
  // RFC-0072 archetypes + section completeness
  { command: "archetype.registry.validate" },
  { command: "section.contract.validate" },
  { command: "section.similarity.report" },   // warn-level
  // RFC-0071 biomes + families
  { command: "biome.contract.validate" },
  { command: "family.contract.validate" },
  // RFC-0025 cosmic catalog
  { command: "cosmic.catalog.validate" },
  { command: "cosmic.name.unique" },
  // RFC-0025 constellations
  { command: "constellation.contract.validate" },
  // naming + structure across packages
  { command: "naming.convention.lint" },
  // uni registry freshness for packages
  { command: "uni.registry.validate" },
  // tokens
  { command: "tokens.ds.lint" },
  { command: "tokens.colors.lint" },
  // grace (existing)
  { command: "grace.validate" },
  // workflow files validity
  { command: "workflow.lint" },
];

export const APPS_BUILD_PREPARE_PIPELINE: KernelPipelineStep[] = [
  // …existing build-prepare contents, renamed only…
];
```

`app.contract.full` is updated to run `APPS_CHECK_PIPELINE` then `app.qa.validate` (RFC-0074) as its final step.

### `apps-check.run` and `packages-check.run` — single-purpose drivers

```sh
# Validate one app against APPS_CHECK_PIPELINE.
pnpm exec site-kernel run apps-check.run --app webgogol-handwerk

# Validate the workspace packages against PACKAGES_CHECK_PIPELINE.
pnpm exec site-kernel run packages-check.run

# Both also accept --json and --strict (warn → error promotion).
```

These wrap the pipeline runner that already exists; the value is the explicit, single, well-named entry point. Apps continue to invoke their internal `build.check` script — but `build.check` becomes a thin wrapper that calls `apps-check.run --app <self>`.

### `.agents/workflows/` — seven phase-aligned files

```
.agents/workflows/
  README.md                            # how to use the workflow layer
  00-prepare.md                        # preflight: validate brief, ensure clean .output, snapshot status
  01-synthesize.md                     # read .input/, write .output/01-synthesize/blueprint.md, propose family
  02-scaffold.md                       # create apps/<id>/ skeleton, write biome YAML, set system.md identity.biome
  03-compose.md                        # author site-plan, scaffold new sections, run system-md.compile, set constellations
  04-author.md                         # synthesize content into pages/prose/business/navigation/site/; write atoms.yaml + voice-profile.yaml + coverage.md
  05-audit.md                          # run app.qa.validate; remediate findings; loop
  06-handoff.md                        # start dev server; print URL; instruct human on next steps + archive
```

`plant-seed.md`, `plant-content.md`, `update-content.md`, `review.md` are deleted in the implementation PR.

### Workflow file shape (strict)

Every workflow file MUST conform to this schema (enforced by `workflow.lint`):

```markdown
---
id: 03-compose
title: "Compose: site-plan → system.md, biome, constellation, sections"
phase: compose                                      # prepare | synthesize | scaffold | compose | author | audit | handoff
reads:
  - onboarding/.input/00-brief.md
  - onboarding/.input/18-architecture.md
  - onboarding/.input/36-wireframe.md
  - onboarding/.output/01-synthesize/blueprint.md
  - onboarding/.output/02-scaffold/visual-plan.md
writes:
  - onboarding/.output/03-compose/site-plan.md
  - onboarding/.output/03-compose/section-gap.md
  - onboarding/.output/03-compose/analytics-config.yaml
  - onboarding/.output/03-compose/linking-plan.yaml
  - apps/<client.id>/src/content/system.md
  - apps/<client.id>/src/content/navigation/{lang}/navigation.md
  - packages/ontology/archetypes/sections/<id>.yaml      # only if a brand new archetype is needed
  - packages/ontology/constellations/<id>.yaml
  - packages/ui/src/sections/<slug>/**                   # for each new section
scope:
  allowedWriteRoots:
    - onboarding/.output/03-compose/
    - apps/<client.id>/src/content/system.md
    - apps/<client.id>/src/content/navigation/
    - packages/ontology/archetypes/sections/
    - packages/ontology/constellations/
    - packages/ui/src/sections/
  forbiddenWriteRoots:
    - onboarding/.input/
    - docs/
    - apps/<other-client>/
runs:
  - archetype.registry.validate
  - section.scaffold                                    # one invocation per new section
  - cosmic.name.pick                                    # one invocation per new section + per shell slot
  - system-md.compile
  - constellation.contract.validate
  - section.contract.validate
  - packages-check.run
recoveryRules:
  - on: "cosmic.name.pick exhausted candidates for an archetype"
    do: "Pick a different archetype or open a successor RFC widening acceptedCosmicNames."
  - on: "section.contract.validate fails on a freshly scaffolded section"
    do: "Re-edit the section files until green. Do not delete the section folder."
  - on: "system-md.compile parser error"
    do: "Fix the site-plan.md grammar. Do not hand-edit apps/<id>/src/content/system.md."
agentInvariants:
  - "Never hand-author apps/<id>/src/content/system.md. Always use system-md.compile."
  - "Never invent a new archetype id on the fly. Add a YAML to packages/ontology/archetypes/sections/ first."
  - "Never pick a cosmic name by reading the catalog directly. Always use cosmic.name.pick."
selfOrchestration:
  autoRun: true                                          # the agent executes the steps without asking
  pauseFor:
    - "Section similarity ≥ 0.85 detected by section.similarity.report — wait for human merge decision."
    - "Any biome modification under packages/ontology/biomes/ — wait for human review before continuing."
checkpoints:
  - "status.md updated with lastPhase: compose."
nextWorkflow: 04-author
---

# 03 — Compose

## What this workflow does

(One paragraph summary. Reference RFC-0072 and RFC-0070.)

## Pre-conditions

- onboarding/.output/status.md reports lastPhase ≥ scaffold and outcome ok.
- onboarding/.output/01-synthesize/blueprint.md exists.
- onboarding/.output/02-scaffold/visual-plan.md exists.
- packages/ontology/biomes/<biome-id>.yaml exists.

## Steps

1. Read the blueprint and visual plan from `.output/01-synthesize/` and `.output/02-scaffold/`.
2. Read `onboarding/.input/18-architecture.md` and `onboarding/.input/36-wireframe.md`.
3. For every page in the wireframe, decide its blocks. For every block, pick an archetype from the catalog:
```

pnpm exec site-kernel run archetype.registry.validate

```
…then iterate (this is prompt work).
4. For every block whose archetype has no existing section in `packages/ui/src/sections/`, scaffold it:
```

pnpm exec site-kernel run section.scaffold --archetype <id> --slug <slug> --cosmic-name $(pnpm exec site-kernel run cosmic.name.pick --catalog planet --archetype <id> --exclude-used apps/<client.id>/src/content/system.md --json | jq -r .cosmicName)

```
5. Author `onboarding/.output/03-compose/site-plan.md` using the strict grammar (RFC-0072).
6. Compile:
```

pnpm exec site-kernel run system-md.compile --client <client.id>

```
7. Validate:
```

pnpm exec site-kernel run constellation.contract.validate pnpm exec site-kernel run section.contract.validate pnpm exec site-kernel run packages-check.run

```
8. If green, update `onboarding/.output/status.md` with lastPhase: compose, outcome: ok.

## Post-conditions

- `apps/<client.id>/src/content/system.md` exists and passes `system.manifest.validate`.
- Every new section under `packages/ui/src/sections/` passes `section.contract.validate`.
- All new archetype/constellation YAMLs are committed.

## When to escalate

- `section.similarity.report` flags pairs ≥ 0.85 → stop and ask the human.
- A wireframe block cannot be mapped to any archetype with confidence ≥ 0.5 → stop and ask the human to either add an archetype YAML or rewrite the wireframe section.
- A biome modification is required (e.g. the wireframe requires a typography pair the biome lacks) → stop; biome edits go through RFC-0071 review.

## References

- RFC-0072 (archetype catalog, system.md compile, section scaffold)
- RFC-0025 (cosmic overlay)
- RFC-0048 (route registry)
- apps/AGENTS.md §"Block-declarative pages"
- packages/AGENTS.md §"Constellation slots"
```

The fields above are **required** by `workflow.lint`. Missing or malformed fields block merge.

### Self-orchestration policy

Each workflow declares `selfOrchestration.autoRun: true|false` and `selfOrchestration.pauseFor: [reasons]`.

- `autoRun: true` (default for 00-prepare, 01-synthesize, 02-scaffold, 03-compose, 04-author, 05-audit): the agent runs the listed commands and writes the listed artifacts without asking for confirmation between each step. It pauses only when a `pauseFor` condition fires.
- `autoRun: false` (default for 06-handoff): the agent prepares the work and stops to inform the human.

Listed `pauseFor` conditions are the formal escalation surface — they are the only points where the agent waits for a human reply during the build. Everything else is the agent's call.

### `workflow.lint` — single command, single purpose

For every `.agents/workflows/*.md`:

- Frontmatter parses against the workflow shape Zod schema.
- Every command in `runs` exists as a registered kernel command.
- `reads` / `writes` / `scope.allowedWriteRoots` resolve to real paths or path patterns.
- `forbiddenWriteRoots` defensively includes `onboarding/.input/` and (optional in body) `docs/`.
- `nextWorkflow` (when present) names an existing workflow file.
- No two workflow files share the same `phase` unless one is a `prepare` or `handoff` variant.

Added to `PACKAGES_CHECK_PIPELINE`.

### `workflow.list` — single command, single purpose

```sh
pnpm exec site-kernel run workflow.list --json
```

Lists every workflow file with its phase, reads/writes summary, and next workflow. Used by agents to discover the entry point and the chain.

### CLI surface

```sh
pnpm exec site-kernel run apps-check.run        --app <id>
pnpm exec site-kernel run packages-check.run
pnpm exec site-kernel run workflow.lint
pnpm exec site-kernel run workflow.list         --json
pnpm exec site-kernel run app.contract.full     --app <id>   # appended app.qa.validate per RFC-0074
```

### TypeScript contracts

```ts
// packages/os/site-kernel/src/workflow/types.ts
export const WorkflowFile = z.object({
  id: z.string(),
  title: z.string(),
  phase: z.enum(["prepare", "synthesize", "scaffold", "compose", "author", "audit", "handoff"]),
  reads: z.array(z.string()),
  writes: z.array(z.string()),
  scope: z.object({
    allowedWriteRoots: z.array(z.string()),
    forbiddenWriteRoots: z.array(z.string()),
  }),
  runs: z.array(z.string()),
  recoveryRules: z.array(z.object({ on: z.string(), do: z.string() })),
  agentInvariants: z.array(z.string()),
  selfOrchestration: z.object({
    autoRun: z.boolean(),
    pauseFor: z.array(z.string()),
  }),
  checkpoints: z.array(z.string()),
  nextWorkflow: z.string().optional(),
}).strict();
```

### File system responsibilities

| Path                                           | Role                                          |
| ---------------------------------------------- | --------------------------------------------- |
| `.agents/workflows/{00..06}-*.md`              | The seven phase-aligned workflows.            |
| `.agents/workflows/README.md`                  | Usage guide; points at this RFC.              |
| `packages/os/site-kernel-checks/src/module.ts` | Renames + new `PACKAGES_CHECK_PIPELINE`.      |
| `packages/os/site-kernel/src/workflow/**`      | Implements `workflow.lint` + `workflow.list`. |

### Failure modes

- `workflow.lint` finds a missing kernel command in a `runs` field → fail; merge blocked.
- An agent attempts a `Write` under a forbidden root (e.g. `onboarding/.input/`) → workflow's `agentInvariants` says don't; if it does, `apps-check.run` will not show the violation (the file is editable on disk) but the diff in Windsurf surfaces it.
- A workflow step exits non-zero → the agent halts, consults the workflow's `recoveryRules`, and either retries or escalates to the human.

## Rollout

1. Rename `STANDARD_CHECK_PIPELINE` → `APPS_CHECK_PIPELINE` and `STANDARD_BUILD_PREPARE_PIPELINE` → `APPS_BUILD_PREPARE_PIPELINE` in `packages/os/site-kernel-checks`. Update every import across the workspace (≤30 sites of use today).
2. Introduce `PACKAGES_CHECK_PIPELINE` with the contents listed above.
3. Implement `apps-check.run`, `packages-check.run`, `workflow.lint`, `workflow.list`.
4. Delete the four legacy workflow files.
5. Write the seven new workflow files (this is part of the implementation PR; the files do NOT live inside this RFC for editability reasons, but they conform to the schema above).
6. Update `apps/nicaragua-projekt/package.json`'s `build:check` / `check` scripts to call `apps-check.run`.
7. Update root and per-folder `AGENTS.md` to remove "Historical note: legacy `.agents/**` is reference-only" — workflows are now the active orchestration surface.

## Alternatives considered

- **Keep the pipeline name, just add a separate package pipeline under a new symbol.** Rejected — the name lied; fixing it is cheap.
- **Drive everything through `app.contract.full` and skip the new `apps-check.run`.** Rejected — `app.contract.full` is the _full readiness_ gate (includes the heavy `app.qa.validate`); developers and agents need a faster everyday loop.
- **Use a YAML-only workflow format.** Rejected — markdown frontmatter + body matches the rest of the doc surface; agents read prose.
- **Build a workflow engine with retries and state machines.** Rejected at this scope — sequences are linear; status.md is enough state.

## Risks

- **Rename breaks downstream imports.** Mitigated by a single PR that updates every site of use and a one-grace-release re-export with a deprecation warning.
- **Workflow files drift from kernel commands.** Mitigated by `workflow.lint` on every PR.
- **Self-orchestration runs the agent off the rails.** Mitigated by `pauseFor` (explicit escalation surface), `scope.forbiddenWriteRoots`, and the human reviewing the Windsurf changelist before deploy.

## Acceptance criteria

- [x] `APPS_CHECK_PIPELINE` exported with the contents above; `STANDARD_CHECK_PIPELINE` is a re-export with `@deprecated` tag for one release. (evidence: implemented historically)
- [x] `PACKAGES_CHECK_PIPELINE` exported with the contents above. (evidence: implemented historically)
- [x] `apps-check.run`, `packages-check.run`, `workflow.lint`, `workflow.list` registered workspace-scoped. (evidence: implemented historically)
- [x] `workflow.lint` added to `PACKAGES_CHECK_PIPELINE`. (evidence: implemented historically)
- [x] Seven workflow files committed: `00-prepare.md`, `01-synthesize.md`, `02-scaffold.md`, `03-compose.md`, `04-author.md`, `05-audit.md`, `06-handoff.md` (plus `README.md`). (evidence: implemented historically)
- [x] Legacy `plant-seed.md`, `plant-content.md`, `update-content.md`, `review.md` removed. (evidence: implemented historically)
- [x] Root `AGENTS.md` updated to mark workflows as active orchestration. (evidence: AGENTS.md:1, agent guide updated)
- [x] `apps/nicaragua-projekt` builds and checks pass with the renamed pipeline. (evidence: original apps retired by RFC-0381, implemented historically)
- [x] `rfc.validate` passes on this file. (evidence: implemented historically)

## Implementation notes for agents

- Agents MUST start every onboarding session from `.agents/workflows/00-prepare.md`. Do not skip phases.
- Agents MUST execute every command listed in the workflow's `runs` field directly via the Bash tool. Do not ask the user before each `pnpm exec site-kernel run …` invocation. The workflow's `selfOrchestration` policy authorizes the agent to proceed.
- Agents MUST stop at every `selfOrchestration.pauseFor` condition and surface the situation to the user.
- Agents MUST treat `scope.forbiddenWriteRoots` as binding. If a phase needs to write outside the allowed set, stop and ask.
- Agents MUST update `onboarding/.output/status.md` at the end of every phase and check it at the start of every phase.
- Agents MUST run `apps-check.run --app <id>` after author and after audit; `packages-check.run` after scaffold (biome) and after compose (sections/constellations/archetypes).
- Agents MUST NOT edit a workflow file to make `workflow.lint` pass; fix the underlying drift instead.
- Agents MUST NOT delete or rename legacy workflow files outside the implementation PR for this RFC. After implementation, those files no longer exist.
