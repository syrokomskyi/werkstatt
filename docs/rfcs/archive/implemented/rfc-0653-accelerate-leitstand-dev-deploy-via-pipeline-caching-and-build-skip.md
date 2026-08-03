---
id: RFC-0653
title: "Accelerate leitstand.dev-deploy via pipeline caching and build skip"
status: implemented
# kind options: architecture | contract | command | policy | deprecation
kind: architecture
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
createdAt: 2026-08-02
updatedAt: 2026-08-02
enhancedAt: 2026-08-02
implementedAt: 2026-08-02
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - DNA-49
  - RFC-0390
  - RFC-0628
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-49
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
    - print.pdf.copy
  added: []
  changed:
    - preview.images.generate
    - print.pdf.generate
    - leitstand.dev-deploy
  removed: []
appsImpacted: []
packagesImpacted:
  - site-kernel-checks
  - site-kernel-handoff
successSignals:
  - "leitstand.dev-deploy repeat run with unchanged workpiece completes build phase in <5s instead of ~300s"
  - "preview.images.generate reports cached: true on second build.prepare with unchanged content"
  - "print.pdf.generate reports cached: true on second build.post with unchanged content and dist HTML"
  - "print.pdf.copy copies PDFs from .cache/pdf/ to dist/client/_print/ in <2s"
nonGoals:
  - "Does not change the release state machine or Axiom verification gate"
  - "Does not modify astro build internals or Astro's dist/ output structure"
  - "Does not add caching to build.check or release.prepare pipelines"
  - "Does not change mission.materialize pipeline selection logic (RFC-0597)"
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

# RFC-0653: Accelerate leitstand.dev-deploy via pipeline caching and build skip

## Context

`leitstand.dev-deploy` (RFC-0628) deploys the active mission's workpiece to the dev channel. The command executes `pnpm build` in the workpiece, which runs the full `build.prepare` pipeline (62 steps), `astro:check`, `astro build`, and the `build.post` pipeline (10+ steps). On a cold run with media transcoding, this takes 10–15 minutes. On a **repeat** run with unchanged content, it still takes 5–7 minutes because:

1. `preview.images.generate` is marked `cacheable: false` and has no `reads` declaration — RFC-0390 pipeline cache never skips it (~10–30s per run).
2. `print.pdf.generate` is marked `cacheable: false` and has no `reads` declaration — RFC-0390 pipeline cache never skips it (~120s per run). Additionally, `astro build` wipes `dist/` on every run, destroying any PDFs from the previous build, so the command's internal "skip existing" logic never triggers.
3. `pnpm build` itself is always executed even when nothing in the workpiece or platform has changed — there is no build-skip mechanism in `leitstand.dev-deploy`.

RFC-0390 established a command-result cache in `executeKernelPipeline` that skips commands when their `reads` hash and module source hash are unchanged. Commands like `video.variants.generate` and `image.variants.generate` already benefit from this cache. However, `preview.images.generate` and `print.pdf.generate` were excluded from caching (`cacheable: false`) and never received `reads` declarations.

## Problem

Three commands in the dev-deploy pipeline are always executed even when their inputs have not changed:

1. **`preview.images.generate`** (`packages/os/site-kernel-checks/src/command-tables/01-codegen.ts:197-215`): marked `cacheable: false`, no `reads`. The command generates OG preview PNGs from content + biome palette. On repeat runs with unchanged content, it re-runs template rendering and PNG generation (~10–30s) even though the output is byte-identical.

2. **`print.pdf.generate`** (`packages/os/site-kernel-checks/src/command-tables/22-print.ts:40-52`): marked `cacheable: false`, no `reads`. The command renders PDFs from built HTML via Playwright Chromium (~120s). Because `astro build` wipes `dist/` on every run, the command's internal "skip existing PDFs" logic never triggers — PDFs are always gone.

3. **`pnpm build` in `leitstand.dev-deploy`** (`packages/os/site-kernel-handoff/src/leitstand/leitstand-commands.ts:530`): `execSync("pnpm build", { cwd: workpiecePath, ... })` is always executed. The command already computes `commitSha` (workpiece HEAD) and `buildInputHash` (content + platform hash) before build, but does not use them to skip the build when nothing has changed.

DNA-49 describes `leitstand.dev-deploy` as building from source and running the Axiom verification gate. The RFC does not change this contract — it optimizes the build phase while preserving all verification guarantees.

## Decision

The dev-deploy pipeline gains three caching optimizations:

1. **`preview.images.generate`** becomes cacheable: `cacheable: false` is removed, `reads` is declared with content and biome palette globs. RFC-0390 pipeline cache skips the command when inputs are unchanged.

2. **`print.pdf.generate`** is split into two commands: `print.pdf.generate` (cacheable, writes to `.cache/pdf/<hash>/`) and a new `print.pdf.copy` (not cacheable, copies from `.cache/pdf/` to `dist/client/_print/`). The `build.post` pipeline runs generate → copy → validate. When inputs are unchanged, RFC-0390 cache skips generate; copy always runs (~1s) to restore PDFs into the freshly-built `dist/`.

3. **`leitstand.dev-deploy`** skips `pnpm build` when a cache file at `missions/<missionId>/.dev-deploy-build-cache.json` records a matching `commitSha` + `platformVersion` + `platformSemanticHash` and `dist/` exists. A `--force-build` flag bypasses the skip.

## Architectural fit

- **DNA-49 (Fleet propagation / Leitstand):** This RFC optimizes the build phase of `leitstand.dev-deploy` without changing its contract (build workpiece → deploy → purge CDN → verify freshness → Axiom gate). The Axiom verification gate, CDN freshness check, and build-identity verification remain unchanged.
- **RFC-0390 (command-result cache):** This RFC extends RFC-0390 caching to `preview.images.generate` and `print.pdf.generate` by adding `reads` declarations and removing `cacheable: false`. The existing cache mechanism in `executeKernelPipeline` is reused without modification.
- **RFC-0628 (dev-deploy channel):** This RFC amends the dev-deploy command behavior with a build-skip optimization. The release state machine, bordbuch, and registry writes are not affected — dev deploys remain ephemeral.
- **Site OS operator model:** `print.pdf.copy` is a new command in the `site-kernel-checks` print module. `leitstand.dev-deploy` gains a `--force-build` flag. Both are workspace-scope changes.
- **Scaling Playbook:** The optimization applies uniformly across all Sternsystems using `leitstand.dev-deploy` — no per-site configuration needed.

## Design

### CLI surface

```sh
# Existing command — now cacheable (no CLI change)
pnpm exec site-kernel run preview.images.generate --site warpgogol-com

# Existing command – now writes to .cache/pdf/ instead of dist/ (no CLI change)
pnpm exec site-kernel run print.pdf.generate --site warpgogol-com

# New command – copies .cache/pdf/ → dist/client/_print/
pnpm exec site-kernel run print.pdf.copy --site warpgogol-com

# Existing command – now with --force-build flag
pnpm exec site-kernel run leitstand.dev-deploy --system warpgogol-com
pnpm exec site-kernel run leitstand.dev-deploy --system warpgogol-com --force-build
```

### TypeScript contracts

#### `preview.images.generate` command metadata change

```ts
// packages/os/site-kernel-checks/src/command-tables/01-codegen.ts
{
  name: "preview.images.generate",
  // ... existing fields ...
  supportsAllSites: true,
  // cacheable: false — REMOVED (defaults to true)
  reads: [
    "<app>/src/content/system.md",
    "<app>/src/content/**/*.md",
    "packages/ontology/biomes/**/*.yaml",
  ],
  writes: [
    "<app>/public/preview/**",
    "<app>/public/og-image.png",
  ],
  execute: runPreviewImagesGenerate,
}
```

#### `print.pdf.generate` command metadata change

```ts
// packages/os/site-kernel-checks/src/command-tables/22-print.ts
{
  name: "print.pdf.generate",
  // ... existing fields ...
  supportsAllSites: true,
  mutatesState: true,
  // cacheable: false — REMOVED (defaults to true)
  reads: [
    "<app>/src/content/system.md",
    "<app>/src/content/**/*.md",
    "<app>/dist/client/**/*.html",
  ],
  writes: [
    "<app>/.cache/pdf/**",
  ],
  execute: runPrintPdfGenerate, // modified — writes to .cache/pdf/ instead of dist/
}
```

#### New `print.pdf.copy` command

```ts
{
  name: "print.pdf.copy",
  description:
    "Copy generated PDFs from .cache/pdf/ to dist/client/_print/. Runs in build.post after print.pdf.generate. Not cacheable — always executes to restore PDFs into freshly-built dist/.",
  scope: "app",
  flags: {},
  supportsAllSites: true,
  cacheable: false,
  reads: ["<app>/.cache/pdf/**/*.pdf"],
  writes: ["<app>/dist/client/_print/**"],
  execute: runPrintPdfCopy,
}
```

#### `leitstand.dev-deploy` build-skip cache

```ts
// packages/os/site-kernel-handoff/src/leitstand/leitstand-commands.ts

interface DevDeployBuildCache {
  commitSha: string;
  platformVersion: string;
  platformSemanticHash: string;
  writtenAt: string; // ISO 8601
}

// Cache file path: missions/<missionId>/.dev-deploy-build-cache.json
// Skip condition: cache file exists AND dist/ exists AND all three keys match
// --force-build flag bypasses the skip
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `<app>/public/preview/**` | OG preview PNGs — written by `preview.images.generate`, persists between builds |
| `<app>/public/og-image.png` | Ultimate fallback OG image — written by `preview.images.generate` |
| `<app>/.cache/pdf/` | PDF content-addressed cache — written by `print.pdf.generate`, persists between builds |
| `<app>/dist/client/_print/` | PDF deployment target — written by `print.pdf.copy`, wiped by `astro build` |
| `missions/<missionId>/.dev-deploy-build-cache.json` | Build-skip cache for `leitstand.dev-deploy` (gitignored, ephemeral) |
| `.gitignore` (monorepo root) | Add `missions/*/.dev-deploy-build-cache.json` entry |
| `<app>/.gitignore` | Add `.cache/pdf/` entry (workpiece-level) |
| `packages/os/site-kernel-checks/src/command-tables/01-codegen.ts` | `preview.images.generate` metadata |
| `packages/os/site-kernel-checks/src/command-tables/22-print.ts` | `print.pdf.generate` + `print.pdf.copy` metadata |
| `packages/os/site-kernel-checks/src/print-pdf.ts` | `print.pdf.generate` implementation (output dir change) |
| `packages/os/site-kernel-checks/src/pipelines/build-post.ts` | `build.post` pipeline (add `print.pdf.copy` step) |
| `packages/os/site-kernel-handoff/src/leitstand/leitstand-commands.ts` | `leitstand.dev-deploy` build-skip logic |

### `print.pdf.generate` internal caching

The command computes a hash from the source HTML files and print configuration, mirroring the `video.variants.generate` pattern:

1. Discover routable pages from `system.md` (existing logic).
2. For each page, hash the corresponding `dist/client/<lang>/<route>/index.html`.
3. Compute a composite hash: `stableJsonHash({ pages: [{ route, lang, htmlHash, printCfg }] })`.
4. Cache directory: `.cache/pdf/<composite-hash>/`.
5. If `.cache/pdf/<composite-hash>/.done` exists → skip Playwright entirely, return cached report.
6. Otherwise → render PDFs via Playwright, write to `.cache/pdf/<composite-hash>/`, write `.done` marker.
7. Write a manifest at `.cache/pdf/manifest.json` mapping `(lang, route)` → cache directory.

`print.pdf.copy` reads the manifest and copies all PDFs from their cache directories to `dist/client/_print/<lang>/<route>.pdf`.

### `build.post` pipeline change

```ts
// packages/os/site-kernel-checks/src/pipelines/build-post.ts
export const SITES_BUILD_POST_PIPELINE: KernelPipelineStep[] = [
  { command: "playwright.chromium.ensure" },
  { command: "passport.emit" },
  { command: "dist.sitemap.images.generate" },
  { command: "video.dist.prune", expectedDurationMs: 30_000, timeoutMs: 300_000 },
  { command: "dist.generated-marker.strip" },
  { command: "text.normalize.apply", expectedDurationMs: 30_000, timeoutMs: 300_000 },
  ...SITES_CHECK_POSTBUILD_PIPELINE,
  { command: "behavior.snapshot.generate" },
  // RFC-0653: split print.pdf.generate into generate + copy
  { command: "print.pdf.generate", expectedDurationMs: 120_000, timeoutMs: 900_000 },
  { command: "print.pdf.copy" },
  { command: "print.pdf.validate" },
];
```

### `leitstand.dev-deploy` build-skip logic

Before the `pnpm build` call (after `computeBuildInputHash` and `commitSha` capture):

1. Read `missions/<missionId>/.dev-deploy-build-cache.json` (if exists).
2. Check `--force-build` flag — if set, skip the cache check.
3. If cache file exists AND `dist/` exists AND `commitSha` + `platformVersion` + `platformSemanticHash` all match → skip `pnpm build`, log `[leitstand.dev-deploy] build skipped — inputs unchanged`.
4. If build is skipped, also skip the preliminary `build-identity.json` write to `public/.well-known/` (the `dist/` already contains the final one from the previous build).
5. After a successful build (not skipped), write the cache file with current `commitSha` + `platformVersion` + `platformSemanticHash`.

### Output format

`print.pdf.copy` `--json` output:

```json
{
  "command": "print.pdf.copy",
  "status": "pass",
  "copied": 12,
  "outputDir": "dist/client/_print"
}
```

`leitstand.dev-deploy` output gains a `buildSkipped` boolean field:

```json
{
  "command": "leitstand.dev-deploy",
  "systemId": "warpgogol-com",
  "missionId": "warpgogol-com-m000025",
  "buildState": "succeeded",
  "buildSkipped": true,
  "deployState": "succeeded",
  "...
}
```

### Failure modes

- **`preview.images.generate` cache hit with missing PNGs**: If PNGs are manually deleted but `reads` (content) unchanged, RFC-0390 cache skips the command and PNGs are not regenerated. Escape hatch: `site-kernel pipeline build.prepare --force` bypasses the cache. This is the same risk profile as `video.variants.generate` and `image.variants.generate` (already cacheable).
- **`print.pdf.generate` cache hit with missing `.cache/pdf/`**: If `.cache/pdf/` is deleted but `reads` unchanged, RFC-0390 cache skips the command. `print.pdf.copy` finds no files to copy and exits with a warning. Escape hatch: `--force` on the pipeline.
- **`leitstand.dev-deploy` skip-build with stale `dist/`**: If the workpiece HEAD and platform are unchanged but `dist/` was modified externally, the skip uses the stale `dist/`. Escape hatch: `--force-build` flag. The Axiom gate and CDN freshness check still run after deploy, providing a safety net.
- **`build-identity.json` stale timestamp**: When build is skipped, `dist/client/.well-known/build-identity.json` retains the previous `buildTimestamp`. For the dev channel, this is acceptable — the `distTreeHash` and `commitSha` remain correct.

## Rollout

- **Default behavior**: All three optimizations are active by default. No opt-in flag needed.
- **Existing apps**: No migration required. The first `leitstand.dev-deploy` after implementation runs a full build (no cache file exists yet) and writes the cache file. Subsequent runs benefit from the skip.
- **`build.prepare` and `build.post` pipelines**: `preview.images.generate` and `print.pdf.generate` automatically benefit from RFC-0390 caching on all sites — no pipeline configuration change needed.
- **`build.post` pipeline**: The new `print.pdf.copy` step is inserted between `print.pdf.generate` and `print.pdf.validate`. Existing `build.post` consumers (`mission.build`, `release.prepare`, `build:check`) automatically include the new step.
- **`--force-build` flag**: Added to `leitstand.dev-deploy` command flags. Does not affect other commands.
- **Deprecation**: No commands are deprecated. `print.pdf.generate` changes its output directory from `dist/client/_print/` to `.cache/pdf/` — `print.pdf.copy` bridges the gap.

## Alternatives considered

1. **Use `build.prepare.dev` pipeline for dev-deploy (RFC-0597)**: The dev pipeline skips media transcoding steps. Rejected because it omits critical files (adaptive image variants, OG images) needed for a functional deployed site and Axiom checks. The operator explicitly rejected this: "Нет, этого делать нельзя. Всё, что мы проверяем в Dev, нам нужно в Alt, нам нужно на основном сайте."

2. **Create a `build.prepare.deploy-dev` pipeline**: A custom pipeline that includes all necessary deployment files but excludes truly unnecessary dev-channel steps. Rejected as over-engineering — the caching approach achieves the same speedup without maintaining a separate pipeline definition.

3. **Internal cache only for `print.pdf.generate` (no split)**: Keep `cacheable: false` but add internal `.cache/pdf/<hash>/.done` skip logic. Rejected because the command would always execute (even if just for the internal cache check + copy), missing the full RFC-0390 pipeline-level skip benefit. The split approach allows the expensive Playwright step to be fully skipped at the pipeline level.

4. **`buildInputHash` only for skip-build key**: Use the existing `computeBuildInputHash` (content tree hash + platform). Rejected because it only hashes `src/content/` — changes to `astro.config.mjs`, `package.json`, or `tsconfig.json` would not invalidate the cache. `commitSha` (workpiece HEAD) catches all workpiece changes.

5. **Add `public/preview/**` to `reads` for `preview.images.generate`**: Self-healing when PNGs are deleted. Rejected because it delays cache hit to the third run (first run generates PNGs, second run sees new files in `reads` and invalidates, third run finally hits cache). The `reads = content only` approach gives cache hit from the second run, matching the pattern of `video.variants.generate` and `image.variants.generate`.

## Risks

- **Stale `dist/` on skip-build**: If `dist/` is modified externally between dev-deploy runs, the skip uses the stale `dist/`. Mitigation: `--force-build` flag; Axiom gate and CDN freshness check run after deploy.
- **`preview.images.generate` cache hit with deleted PNGs**: RFC-0390 cache skips the command when content is unchanged, even if PNGs were manually deleted. Mitigation: `--force` on pipeline; same risk profile as existing cacheable media commands.
- **`print.pdf.generate` cache hit with deleted `.cache/pdf/`**: Same pattern — cache skips, `print.pdf.copy` finds nothing to copy. Mitigation: `--force` on pipeline.
- **`dist/client/**/*.html` non-determinism**: If `astro build` produces non-deterministic HTML (e.g., randomized IDs, timestamps in HTML), `print.pdf.generate` cache would always miss. In practice, Astro produces deterministic HTML from deterministic content — asset hashes are content-derived. This pattern is already used by `behavior.snapshot.generate`, `sitemap.generate`, `fonts.origin.validate`, and many other cacheable commands that read `dist/client/**/*.html`.
- **Agent misinterpretation**: Agents might assume `print.pdf.generate` writes directly to `dist/client/_print/` (as it did before this RFC). The `writes` metadata and command description must clearly state the `.cache/pdf/` output directory. `print.pdf.copy` is the bridge to `dist/`.
- **Performance**: `print.pdf.copy` adds ~1s to `build.post` on every run. This is negligible compared to the ~120s saved by skipping `print.pdf.generate` on cache hits.
- **Maintenance burden**: One new command (`print.pdf.copy`) and one new pipeline step. The `.cache/pdf/` directory follows the same pattern as `.cache/video/` — no new maintenance patterns.
- **`GENERATOR_OWNERSHIP_MAP`**: `print.pdf.generate` and `print.pdf.copy` do NOT need entries in `GENERATOR_OWNERSHIP_MAP`. The ownership registry tracks `public/` files; `.cache/pdf/` and `dist/client/_print/` are outside `public/` and are not scanned by `ownership.sync.validate` or `generated.stale.validate`.
- **`--force-build` vs `--force` interaction**: `--force-build` bypasses ONLY the build-skip cache in `leitstand.dev-deploy`. It does NOT bypass the RFC-0390 pipeline cache for `preview.images.generate` and `print.pdf.generate` (those run inside `pnpm build` → `astro build` → kernel pipeline). To force a fully fresh build with no RFC-0390 caching, the operator must run `site-kernel pipeline build.prepare --force` and `site-kernel pipeline build.post --force` separately, or clear the cache via `kernel.cache.clear --namespace command_results`.

## Acceptance criteria

- [x] `preview.images.generate` has `reads` declared and `cacheable: false` removed in `packages/os/site-kernel-checks/src/command-tables/01-codegen.ts` (evidence: packages/os/site-kernel-checks/src/command-tables/01-codegen.ts:213-218)
- [x] `print.pdf.generate` has `reads` declared, `cacheable: false` removed, and `writes` changed to `.cache/pdf/**` in `packages/os/site-kernel-checks/src/command-tables/22-print.ts` (evidence: packages/os/site-kernel-checks/src/command-tables/22-print.ts:40-55)
- [x] `print.pdf.generate` implementation in `packages/os/site-kernel-checks/src/print-pdf.ts` writes to `.cache/pdf/<hash>/` with internal `.done` marker caching (evidence: packages/os/site-kernel-checks/src/print-pdf.ts:132-171)
- [x] `print.pdf.copy` command registered in `packages/os/site-kernel-checks/src/command-tables/22-print.ts` with `cacheable: false` and `reads: ["<app>/.cache/pdf/**/*.pdf"]` (evidence: packages/os/site-kernel-checks/src/command-tables/22-print.ts:57-69)
- [x] `print.pdf.copy` implementation copies PDFs from `.cache/pdf/` to `dist/client/_print/` based on `.cache/pdf/manifest.json` (evidence: packages/os/site-kernel-checks/src/print-pdf.ts:357-432)
- [x] `build.post` pipeline in `packages/os/site-kernel-checks/src/pipelines/build-post.ts` includes `print.pdf.copy` between `print.pdf.generate` and `print.pdf.validate` (evidence: packages/os/site-kernel-checks/src/pipelines/build-post.ts:45-48)
- [x] `leitstand.dev-deploy` in `packages/os/site-kernel-handoff/src/leitstand/leitstand-commands.ts` implements build-skip cache with `commitSha` + `platformVersion` + `platformSemanticHash` key (evidence: packages/os/site-kernel-handoff/src/leitstand/leitstand-commands.ts:504-536)
- [x] `leitstand.dev-deploy` supports `--force-build` flag that bypasses the build-skip cache (evidence: packages/os/site-kernel-handoff/src/leitstand/leitstand-commands.ts:455-456)
- [x] `DevDeployResult` type includes `buildSkipped: boolean` field (evidence: packages/os/site-kernel-handoff/src/leitstand/leitstand-commands.ts:427)
- [x] Repeat `leitstand.dev-deploy` with unchanged workpiece skips `pnpm build` and logs the skip (evidence: packages/os/site-kernel-handoff/src/tests/leitstand-0628-dev-deploy.test.ts:285-300)
- [x] `command.reads.validate` passes for all modified commands (CRC-01: `reads` or `cacheable: false`) (evidence: all modified commands have `reads` declared or `cacheable: false`)
- [x] Unit tests cover build-skip cache hit, cache miss, and `--force-build` override (evidence: packages/os/site-kernel-handoff/src/tests/leitstand-0628-dev-deploy.test.ts:266-320)
- [x] Unit tests cover `print.pdf.copy` with existing and missing `.cache/pdf/manifest.json` (evidence: packages/os/site-kernel-checks/src/tests/print-pdf-copy.test.ts:1-118)
- [x] `rfc.validate` passes on this file before merging (evidence: rfc.validate --id RFC-0653 returns pass)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id <this-rfc-id> --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
- **`print.pdf.generate` output directory change**: The command now writes to `.cache/pdf/<hash>/` instead of `dist/client/_print/`. Agents MUST NOT assume `print.pdf.generate` produces files in `dist/` — `print.pdf.copy` is the bridge. When debugging missing PDFs in `dist/`, check both `print.pdf.generate` (cache miss?) and `print.pdf.copy` (manifest exists?).
- **`preview.images.generate` `reads` scope**: `reads` includes content files and biome palette YAML, but NOT existing PNGs in `public/preview/`. This matches the pattern of `video.variants.generate` and `image.variants.generate`. If PNGs are missing after a cache hit, use `--force` on the pipeline to regenerate.
- **`leitstand.dev-deploy` skip-build**: The cache key is `commitSha` + `platformVersion` + `platformSemanticHash`. The cache file is at `missions/<missionId>/.dev-deploy-build-cache.json` (gitignored, ephemeral). The `--force-build` flag bypasses the skip. Agents MUST NOT delete the cache file manually — use `--force-build` instead.
- **`build.post` pipeline order**: `print.pdf.copy` MUST run after `print.pdf.generate` and before `print.pdf.validate`. If `print.pdf.generate` is cached (skip), `print.pdf.copy` still runs and copies from the existing `.cache/pdf/`.
