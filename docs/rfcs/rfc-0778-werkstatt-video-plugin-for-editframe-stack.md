---
id: RFC-0778
title: "Werkstatt video plugin for editframe stack"
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
createdAt: 2026-08-09
updatedAt: 2026-08-09
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
  proposed: []
  added: []
  changed: []
  removed: []
appsImpacted: []
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted: []
successSignals:
  - "werkstatt-video registers via plugin contract and werkstatt.plugin.validate passes"
  - "An Editframe composition builds, renders, and passes video-specific checks"
nonGoals:
  - "No Editframe platform changes — the plugin uses Editframe APIs, does not modify them"
  - "No video content — compositions are projects, not plugin content"
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

# RFC-0778: Werkstatt video plugin for editframe stack

## Context

Forge already ships the `editframe` stack profile (`packages/forge/profiles/editframe.yaml`) and Editframe-specific skills (`ef-composition`, `ef-render-verify`, etc. in `packages/forge/skills/`). The engine (RFC-0772) provides the lifecycle. A video workshop needs a plugin for Editframe-specific path conventions, render hooks, deploy (local render output → storage), and video-oriented validators. This RFC specifies `@warpgogol/werkstatt-video` in full.

## Problem

Without a video plugin, a video workshop can install the engine but has no path conventions for Editframe compositions (`src/composition.tsx`, `editframe.config.ts`), no build hook (Editframe compositions render via the Editframe API, not Astro/Vite), no deploy adapter (rendered video → R2/S3 storage), and no video-specific validators (composition schema, render determinism, VIDEO-01..09 invariants from Editframe skills).

## Decision

`packages/werkstatt-video` (npm: `@warpgogol/werkstatt-video`) is created with `profileId: "editframe"`:

| Plugin module | Content |
| --- | --- |
| `paths/` | Editframe path conventions: `src/composition.tsx`, `src/assets/`, `editframe.config.ts`, `dist/` (rendered output) |
| `build/` | `hooks.build`: renders the composition via the Editframe API (or local render SDK) |
| `checks/` | Video validators: `video.composition.validate` (composition schema, time model), `video.render.validate` (render determinism — VIDEO-01..09 invariants), `video.assets.validate` (asset manifest) |
| `deploy/local-render/` | `deployAdapters["local-render"]`: renders video to local dist, uploads to R2/S3 |
| `onboarding/` | `hooks.scaffoldProject`: generates a new Editframe composition project with boilerplate |
| `release-evidence/` | `hooks.releaseEvidence`: video-specific release evidence (render hash, composition hash, asset manifest hash) |
| `invariants/` | Video stack invariants (VIDEO-01..09 from Editframe skills, formalized) |

### Stack invariants (VIDEO-01..09, from Editframe skills)

| ID | Invariant |
| --- | --- |
| `VIDEO-01` | Composition has a valid time model (duration > 0, frame rate > 0) |
| `VIDEO-02` | All media elements reference existing assets |
| `VIDEO-03` | Composition is deterministic — same input → same output (render hash stability) |
| `VIDEO-04` | No hardcoded secrets in composition source |
| `VIDEO-05` | Composition respects Editframe API rate limits |
| `VIDEO-06` | Render output format is declared and consistent |
| `VIDEO-07` | Asset manifest is complete (no orphaned assets) |
| `VIDEO-08` | Composition entry point is `src/composition.tsx` |
| `VIDEO-09` | Rendered video is stored in the artifact store (DNA-52) with content-addressed hash |

### Plugin entry point

```ts
import type { WerkstattPlugin } from "@warpgogol/werkstatt/plugin";

export const werkstattVideoPlugin: WerkstattPlugin = {
  schema: "werkstatt/plugin@1",
  id: "werkstatt-video",
  profileId: "editframe",
  paths: editframePathConventions,
  moduleLoaders: { /* checks, onboarding */ },
  deployAdapters: {
    "local-render": createLocalRenderAdapter,
  },
  hooks: { build, checkGate, releaseEvidence, scaffoldProject },
  invariants: [/* VIDEO-01..09 */],
};
```

## Architectural fit

- **DNA-64** — video plugin implements the same contract.
- **DNA-46..49** — mission/release/Leitstand semantics unchanged; the plugin supplies render and deploy hooks.
- **DNA-52 (artifact store)** — rendered videos are stored as content-addressed artifacts, same as site dist.
- **DNA-58 (generated-file determinism)** — VIDEO-03 extends this to rendered video output.
- **Forge `editframe` profile** — the plugin's `profileId` binds to it.
- **Editframe skills** — `ef-composition`, `ef-render-verify`, etc. are forge skills already available; the plugin formalizes their invariants as validators.

## Design

### Video workshop layout

```
my-video-workshop/                   ← consumer monorepo
├── forge.yaml                       → stack: [typescript, editframe]
├── tools/kernel.config.ts           → imports werkstatt + werkstatt-video
├── systems/registry.yaml            → composition projects
├── missions/                        → workpieces
├── docs/                            → RFC, ADR
├── .agents/                         → instructions (includes ef-* skills from forge)
├── hooks/                           → pre-commit, etc.
├── .github/workflows/               → CI
└── node_modules/
    ├── @warpgogol/werkstatt/        ← engine
    ├── @warpgogol/werkstatt-video/  ← plugin
    └── @warpgogol/forge/            ← governance (includes ef-* skills)
```

### Composition project layout (in mirrors)

```
../systems-cache/brand-intro/
├── src/
│   ├── composition.tsx              ← Editframe React composition
│   └── assets/
│       ├── logo.svg
│       ├── font.woff2
│       └── manifest.yaml
├── editframe.config.ts
├── package.json
└── tsconfig.json
```

### CLI surface

```sh
pnpm exec werkstatt run video.composition.validate --system brand-intro
pnpm exec werkstatt run video.render.validate --system brand-intro
pnpm exec werkstatt run video.assets.validate --system brand-intro
```

### Failure modes

- Invalid time model → `VIDEO-01`, exit 1.
- Missing asset → `VIDEO-02`, exit 1.
- Non-deterministic render → `VIDEO-03`, exit 1 (render hash differs across runs).
- Secret in composition → `VIDEO-04`, exit 1.

## Rollout

- Implemented after the game plugin (RFC-0777) to validate that the plugin contract generalizes.
- The first real video composition project validates the plugin.

## Alternatives considered

- **Using the site plugin for video (Astro + Editframe integration).** Rejected: video compositions are not Astro sites; the render and deploy models are fundamentally different.
- **No deploy adapter (manual render + upload).** Rejected: the Leitstand automate promote flow requires adapter plugins; video needs the same release discipline as sites and games.

## Risks

- **Editframe API availability.** Render hooks depend on the Editframe API being reachable. Mitigation: the `local-render` adapter can use the Editframe local render SDK as a fallback.
- **Render determinism.** VIDEO-03 is the hardest invariant: rendered video must be byte-identical across runs. Mitigation: the plugin uses deterministic render settings (fixed codec, fixed frame rate, no metadata) analogous to RFC-0603 for PNGs.
- **Large video files in artifact store.** Video files are much larger than site dist. The artifact store (DNA-52) must handle large artifacts. Mitigation: R2/S3 with lifecycle tiering (DNA-59).

## Acceptance criteria

- [ ] `packages/werkstatt-video` exists with `profileId: "editframe"`
- [ ] Plugin registers via `WerkstattPlugin` and passes `werkstatt.plugin.validate`
- [ ] `video.composition.validate`, `video.render.validate`, `video.assets.validate` registered
- [ ] `local-render` deploy adapter works (verified with a test composition)
- [ ] `hooks.scaffoldProject` creates a valid Editframe composition that renders
- [ ] VIDEO-01..09 invariants formalized and enforced
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
