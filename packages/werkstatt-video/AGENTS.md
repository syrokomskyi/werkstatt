# `@warpgogol/werkstatt-video` — Agent Guide

RFC-0778: Werkstatt video plugin — Editframe stack. Implements the `werkstatt/plugin@1` contract for video composition projects using Editframe.

**Workspace type:** Package

This is a **package** workspace. Expose stable typed APIs. Do not import from apps or services.

## Plugin contract

| Field | Value |
| --- | --- |
| `schema` | `werkstatt/plugin@1` |
| `id` | `werkstatt-video` |
| `profileId` | `editframe` |
| `moduleLoaders` | `checks`, `onboarding` |
| `deployAdapters` | `local-render` |
| `hooks` | `build`, `checkGate`, `releaseEvidence`, `scaffoldProject` |
| `paths` | `src` (contentDir), `dist` (distDir), `src/composition.tsx` + `editframe.config.ts` (entryPoints) |
| `invariants` | WV-01..09 |

## Module layout

| Module | File | Description |
| --- | --- | --- |
| Plugin entry | `src/index.ts` | `werkstattVideoPlugin` export |
| Path conventions | `src/paths/editframe-paths.ts` | Editframe path constants |
| Invariants | `src/invariants/video-invariants.ts` | WV-01..09 declarations |
| Composition validator | `src/checks/composition-validate.ts` | `video.composition.validate` (WV-01, WV-08) |
| Assets validator | `src/checks/assets-validate.ts` | `video.assets.validate` (WV-02, WV-07) |
| Render validator | `src/checks/render-validate.ts` | `video.render.validate` (WV-03, WV-06, WV-09) |
| Secret scan | `src/checks/secret-scan.ts` | `video.secret.scan` (WV-04) |
| Check gate | `src/checks/index.ts` | Runs all 4 validators in checkGate |
| Check module | `src/checks/module.ts` | Kernel module registering validators |
| Build hook | `src/build/editframe-build.ts` | `hooks.build` — runs `editframe render` |
| Local render deploy | `src/deploy/local-render.ts` | `deployAdapters["local-render"]` |
| Scaffold | `src/onboarding/scaffold-project.ts` | `hooks.scaffoldProject` |
| Onboarding module | `src/onboarding/module.ts` | Kernel module registering scaffold command |
| Release evidence | `src/release-evidence/video-evidence.ts` | `hooks.releaseEvidence` |

## Stack invariants

| ID | Invariant | Enforced by |
| --- | --- | --- |
| WV-01 | Composition has a valid time model (duration > 0, frame rate > 0) | `video.composition.validate` |
| WV-02 | All media elements reference existing assets listed in the asset manifest | `video.assets.validate` |
| WV-03 | Composition is deterministic — same input produces byte-identical render output | `video.render.validate` |
| WV-04 | No hardcoded secrets in composition source | `video.secret.scan` |
| WV-05 | Composition respects Editframe API rate limits (advisory — enforced at runtime by build hook) | advisory |
| WV-06 | Render output format is declared and consistent (codec, container, resolution) | `video.render.validate` |
| WV-07 | Asset manifest is complete (no orphaned assets, no missing entries) | `video.assets.validate` |
| WV-08 | Composition entry point is `src/composition.tsx` | `video.composition.validate` |
| WV-09 | Rendered video is stored in the artifact store with content-addressed hash | `video.render.validate` |

## Check gate composition

`checkGate` runs all 4 validators in sequence:
1. `video.composition.validate` — composition schema and time model
2. `video.assets.validate` — asset manifest completeness
3. `video.render.validate` — render determinism and format
4. `video.secret.scan` — hardcoded secret detection

All must pass for checkGate to succeed.

## Render determinism (WV-03)

The build hook writes `dist/.render-hash.json` after each successful render. The render validator compares the current `dist/` hash against this stored baseline. If they differ, WV-03 fails. This avoids expensive re-renders during validation.

Deterministic encoding settings (declared in `editframe.config.ts`):
- Fixed codec: H.264, Main profile
- Constant bitrate (CBR)
- No metadata (`-map_metadata -1`)
- Fixed GOP size
- Pinned ffmpeg version
- Fixed frame rate

## Credential injection

Deploy adapters read credentials from `systems/registry.yaml` channel config, never from environment variables directly:

- **local-render**: `deploy.local.bucket`, `deploy.local.region`, `deploy.local.accessKeyId`, `deploy.local.secretAccessKey`

The adapter delegates to the engine's `artifact.store.put` primitive (DNA-52).

## Scripts

| Script        | Command                                   |
| ------------- | ----------------------------------------- |
| `build`       | `pnpm exec tsc -p tsconfig.json --noEmit` |
| `build:check` | `pnpm exec tsc -p tsconfig.json --noEmit` |
| `test`        | `vitest run`                              |
| `test:watch`  | `vitest`                                  |

## Publication

This package is published via repo-extract (RFC-0773). See `extract.config.yaml` for the extraction configuration. The package MUST NOT be published without operator approval.
