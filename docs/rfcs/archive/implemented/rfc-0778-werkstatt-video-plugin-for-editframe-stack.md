---
id: RFC-0778
title: "Werkstatt video plugin for editframe stack"
status: implemented
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
implementedAt: 2026-08-09
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
  - RFC-0777
  - RFC-0779
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-1
  - DNA-52
  - DNA-58
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
    - video.composition.validate
    - video.render.validate
    - video.assets.validate
    - video.secret.scan
  added: []
  changed: []
  removed: []
appsImpacted: []
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - packages/werkstatt-video
successSignals:
  - "werkstatt-video registers via plugin contract and werkstatt.plugin.validate passes"
  - "An Editframe composition builds, renders, and passes video-specific checks"
nonGoals:
  - "No Editframe platform changes — the plugin uses Editframe APIs, does not modify them"
  - "No video content — compositions are projects, not plugin content"
  - "No additional deploy adapters beyond local-render — cloud storage adapters (R2 direct, S3 direct) are deferred to a future RFC if needed"
  - "No forge profile invariant changes — the forge editframe.yaml VIDEO-01..09 invariants remain unchanged; the plugin's WV-01..09 are distinct"
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

# RFC-0778: Werkstatt video plugin for editframe stack

## Context

Forge already ships the `editframe` stack profile (`packages/forge/profiles/editframe.yaml`) and Editframe-specific skills (`ef-composition`, `ef-render-verify`, etc. in `packages/forge/skills/`). The engine (RFC-0772) provides the lifecycle. A video workshop needs a plugin for Editframe-specific path conventions, render hooks, deploy (local render output → storage), and video-oriented validators. This RFC specifies `@warpgogol/werkstatt-video` in full.

## Problem

Without a video plugin, a video workshop can install the engine but has no path conventions for Editframe compositions (`src/composition.tsx`, `editframe.config.ts`), no build hook (Editframe compositions render via the Editframe API, not Astro/Vite), no deploy adapter (rendered video → R2/S3 storage), and no video-specific validators (composition schema, render determinism, WV-01..09 plugin invariants).

## Decision

`packages/werkstatt-video` (npm: `@warpgogol/werkstatt-video`) is created with `profileId: "editframe"`:

| Plugin module | Content |
| --- | --- |
| `paths/` | Editframe path conventions: `src/composition.tsx`, `src/assets/`, `editframe.config.ts`, `dist/` (rendered output) |
| `build/` | `hooks.build`: renders the composition via the Editframe API (or local render SDK) |
| `checks/` | Video validators: `video.composition.validate` (composition schema, time model), `video.render.validate` (render determinism — WV-01..09 invariants), `video.assets.validate` (asset manifest) |
| `deploy/local-render/` | `deployAdapters["local-render"]`: renders video to local dist, uploads to R2/S3 |
| `onboarding/` | `hooks.scaffoldProject`: generates a new Editframe composition project with boilerplate |
| `release-evidence/` | `hooks.releaseEvidence`: video-specific release evidence (render hash, composition hash, asset manifest hash) |
| `invariants/` | Video stack invariants (WV-01..09, distinct from forge profile VIDEO-01..09) |

### Stack invariants (WV-01..09)

The forge `editframe.yaml` profile already defines `VIDEO-01..09` for composition-file-level checks (kebab-case filenames, contain mode, captions, duration format, mode values, fps, loop, offset). The plugin's `WV-01..09` are distinct plugin-level invariants for time model validity, determinism, asset integrity, and artifact storage. Both sets coexist; the forge profile invariants are checked by `editframe check`, the plugin invariants by `video.*.validate`.

| ID | Invariant | Severity |
| --- | --- | --- |
| `WV-01` | Composition has a valid time model (duration > 0, frame rate > 0) | error |
| `WV-02` | All media elements reference existing assets listed in the asset manifest | error |
| `WV-03` | Composition is deterministic — same input → byte-identical render output across runs | error |
| `WV-04` | No hardcoded secrets in composition source — enforced by secret scan | error |
| `WV-05` | Composition respects Editframe API rate limits (advisory — not machine-checked in a validator; enforced at runtime by the build hook) | advisory |
| `WV-06` | Render output format is declared and consistent (codec, container, resolution) | error |
| `WV-07` | Asset manifest is complete (no orphaned assets, no missing entries) | error |
| `WV-08` | Composition entry point is `src/composition.tsx` | error |
| `WV-09` | Rendered video is stored in the artifact store (DNA-52) with content-addressed hash | error |

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
  invariants: [/* WV-01..09 */],
};
```

## Architectural fit

- **DNA-1 (monorepo boundary)** — the plugin is a shared reusable library in `packages/werkstatt-video`, consumed by video workshops via npm.
- **DNA-64 (engine/plugin/workshop boundary, RFC-0769)** — video plugin implements the same `WerkstattPlugin` contract as the site and game plugins. DNA-64 is not yet registered (RFC-0769 is draft); once registered, this RFC's `satisfies[]` should include it.
- **DNA-46..49 (missions, materialization, releases, Leitstand)** — mission/release/Leitstand semantics unchanged; the plugin supplies render and deploy hooks through the RFC-0770 hook interface.
- **DNA-52 (artifact store)** — rendered videos are stored as content-addressed artifacts via `artifact.store.put`, same as site dist. The plugin's `hooks.releaseEvidence` produces the render hash for artifact store ingestion.
- **DNA-58 (generated-file determinism)** — WV-03 extends this principle to rendered video output: deterministic encoding settings ensure byte-identical renders across runs, analogous to RFC-0603 for PNGs.
- **Forge `editframe` profile** — the plugin's `profileId` binds to it; `forge.doctor` cross-checks.
- **Editframe skills** — `ef-composition`, `ef-render-verify`, etc. are forge skills already available; the plugin formalizes their invariants as validators. The forge profile's `VIDEO-01..09` invariants remain in the profile; the plugin's `WV-01..09` are distinct.

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

Three separate commands follow the game plugin precedent (RFC-0777: `game.assets.validate`, `game.scenes.validate`, `game.bundle.validate`). Each validator has a distinct scope (composition schema vs render output vs asset manifest) and can run independently. A single `video.validate` with `--scope` flag was considered but rejected because the three checks have different dependencies (composition source vs rendered output vs asset files) and may run at different pipeline stages.

### Pipeline placement

| Command | Pipeline stage | Scope |
| --- | --- | --- |
| `video.composition.validate` | `build.prepare` (after workpiece materialization) | Blocking — invalid composition cannot render |
| `video.assets.validate` | `build.prepare` (after composition validate) | Blocking — missing assets cause render failure |
| `video.render.validate` | `build.check` (after render hook) | Blocking — non-deterministic render cannot be released |

All three also run on-demand via `werkstatt run` outside pipelines.

### Output format

```json
{
  "command": "video.composition.validate",
  "status": "pass",
  "system": "brand-intro",
  "violations": []
}
```

Failure output:

```json
{
  "command": "video.composition.validate",
  "status": "fail",
  "system": "brand-intro",
  "violations": [
    { "ruleId": "WV-01", "message": "Root Timegroup duration must be > 0", "file": "src/composition.tsx" }
  ]
}
```

### Extraction config

The plugin carries `packages/werkstatt-video/extract.config.yaml` (standalone mode, RFC-0773) with `stripScopes: ["@warpgogol/"]`, `preservePackages` for the engine, and `git.remote` pointing to a private repo. The extraction config is pinned in `.forge/pinned.yaml` (DNA-62).

### AGENTS.md updates

- `packages/werkstatt-video/AGENTS.md` — plugin-local agent guide (path conventions, validator descriptions, invariant list)
- Consumer workshop `AGENTS.md` — generated by `forge.agents.generate` with editframe-templates (already in forge profile)
- Root `AGENTS.md` — no changes needed (plugin is consumed via npm, not workspace)

### Failure modes

- Invalid time model → `WV-01`, exit 1.
- Missing asset → `WV-02`, exit 1.
- Non-deterministic render → `WV-03`, exit 1 (render hash differs across runs with identical input).
- Secret in composition → `WV-04`, exit 1.
- Undeclared render format → `WV-06`, exit 1.
- Orphaned asset → `WV-07`, warning (configurable to error).
- Missing entry point → `WV-08`, exit 1.
- `WV-05` (rate limits) is advisory — not a validator failure; enforced at runtime by the build hook.

## Rollout

- Implemented after the game plugin (RFC-0777) to validate that the plugin contract generalizes.
- The first real video composition project validates the plugin.

## Alternatives considered

- **Using the site plugin for video (Astro + Editframe integration).** Rejected: video compositions are not Astro sites; the render and deploy models are fundamentally different.
- **No deploy adapter (manual render + upload).** Rejected: the Leitstand automate promote flow requires adapter plugins; video needs the same release discipline as sites and games.

### Render determinism (WV-03)

WV-03 requires byte-identical render output across runs with identical input. Video encoding is non-deterministic by default (variable bitrate, metadata timestamps, encoder version differences). The plugin enforces determinism via:

1. **Fixed codec settings** — H.264 with fixed profile (Main), level, and preset.
2. **Constant bitrate (CBR)** — no VBR, no CRF-based encoding.
3. **No metadata** — all metadata stripped (`-map_metadata -1` in ffmpeg).
4. **Fixed GOP size** — no adaptive keyframe placement.
5. **Pinned ffmpeg version** — the render hook declares the ffmpeg version; CI uses the same version. Local renders must match.
6. **Fixed frame rate** — no variable frame rate input.

The `video.render.validate` command renders the composition twice and compares sha256 hashes. If hashes differ, WV-03 fails with a diff report showing which encoding setting caused the divergence.

### Edge cases

- **Empty composition project** (no assets): `video.assets.validate` passes with an empty manifest; `video.composition.validate` checks the time model only.
- **No render output** (before first render): `video.render.validate` reports `WV-03: no render output found` and exits 1 — the validator expects a prior render to exist.
- **Concurrent renders**: the render hook uses the engine's lock primitives (DNA-51) to prevent concurrent renders of the same composition.
- **Interrupted render**: partial render output is not committed to the artifact store; the lock is released via the engine's idempotency primitives.

### False-positive estimation

- `WV-01` (time model): false positives near zero — duration and frame rate are parsed from the composition's Timegroup attributes.
- `WV-02` (asset references): low false-positive rate — asset paths are resolved relative to `src/assets/`; false positives only from dynamic path construction.
- `WV-03` (determinism): moderate false-positive rate during environment transitions (different ffmpeg version, different OS). Suppression: the validator reports the environment fingerprint (ffmpeg version, OS) alongside the hash; mismatches are flagged as environment drift, not composition errors.
- `WV-07` (orphaned assets): moderate false-positive rate — assets referenced dynamically (constructed paths) may appear orphaned. Suppression: an allowlist in the asset manifest (`dynamicRefs: [pattern]`).

## Risks

- **Editframe API availability.** Render hooks depend on the Editframe API being reachable. Mitigation: the `local-render` adapter can use the Editframe local render SDK as a fallback.
- **Render determinism.** WV-03 is the hardest invariant: rendered video must be byte-identical across runs. Mitigation: deterministic encoding settings (fixed codec, CBR, no metadata, pinned ffmpeg version) analogous to RFC-0603 for PNGs. Cross-platform determinism may require a containerized render environment (deferred to implementation).
- **Large video files in artifact store.** Video files are much larger than site dist. The artifact store (DNA-52) must handle large artifacts. Mitigation: R2/S3 with lifecycle tiering policies; the artifact store's retention rules (DNA-52) apply — old render artifacts are garbage-collected by `artifact.store.gc`.
- **ffmpeg version drift.** Different ffmpeg versions produce different output for the same input. Mitigation: the render hook declares the ffmpeg version in the composition's `editframe.config.ts`; CI pins the version. Local developers must use the same version (documented in the workshop README).

## Acceptance criteria

- [x] `packages/werkstatt-video` exists with `profileId: "editframe"` (evidence: packages/werkstatt-video/src/index.ts:29, pnpm --filter @warpgogol/werkstatt-video run build:check)
- [x] Plugin registers via `WerkstattPlugin` and passes `werkstatt.plugin.validate` (evidence: packages/werkstatt-video/src/index.ts:27, pnpm exec werkstatt run rfc.validate --id RFC-0778)
- [x] `video.composition.validate`, `video.render.validate`, `video.assets.validate`, `video.secret.scan` registered (evidence: packages/werkstatt-video/src/checks/module.ts:16-19, pnpm --filter @warpgogol/werkstatt-video run test)
- [x] `local-render` deploy adapter works (verified with a test composition) (evidence: packages/werkstatt-video/src/deploy/local-render.ts:41, packages/werkstatt-video/src/deploy/**tests** — adapter creates and returns artifactKey)
- [x] `hooks.scaffoldProject` creates a valid Editframe composition that renders (evidence: packages/werkstatt-video/src/onboarding/scaffold-project.ts:125, packages/werkstatt-video/src/onboarding/**tests**/scaffold-project.test.ts)
- [x] WV-01..09 invariants formalized and enforced (evidence: packages/werkstatt-video/src/invariants/video-invariants.ts:16, packages/werkstatt-video/src/checks/**tests**/ — 28 tests pass)
- [x] `extract.config.yaml` exists (RFC-0773) (evidence: packages/werkstatt-video/extract.config.yaml:1, .forge/pinned.yaml:86)
- [x] `rfc.validate` passes on this file before merging (evidence: pnpm exec werkstatt run rfc.validate --id RFC-0778 — All 1 RFC(s) passed validation)

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
