---
rfcId: RFC-0778
planId: PLAN-RFC-0778-01
status: draft
owner: architecture
createdAt: 2026-08-09
updatedAt:
scope:
  apps: []
  packages:
    - packages/werkstatt-video
  services: []
  docs:
    - packages/werkstatt-video/AGENTS.md
    - docs/COMMANDS.md
---

# Implementation Plan: RFC-0778

## 1. Objectives

- [ ] Objective 1 — Create `packages/werkstatt-video` with `profileId: "editframe"` and plugin entry point (maps to acceptance criterion: "packages/werkstatt-video exists with profileId: editframe")
- [ ] Objective 2 — Register plugin via `WerkstattPlugin` contract and pass `werkstatt.plugin.validate` (maps to acceptance criterion: "Plugin registers via WerkstattPlugin and passes werkstatt.plugin.validate")
- [ ] Objective 3 — Implement three validators: `video.composition.validate`, `video.render.validate`, `video.assets.validate` (maps to acceptance criterion: "video.composition.validate, video.render.validate, video.assets.validate registered")
- [ ] Objective 4 — Implement `local-render` deploy adapter (maps to acceptance criterion: "local-render deploy adapter works")
- [ ] Objective 5 — Implement `hooks.scaffoldProject` for Editframe composition boilerplate (maps to acceptance criterion: "hooks.scaffoldProject creates a valid Editframe composition that renders")
- [ ] Objective 6 — Formalize and enforce WV-01..09 invariants (maps to acceptance criterion: "WV-01..09 invariants formalized and enforced")
- [ ] Objective 7 — Create `extract.config.yaml` for publication pipeline (maps to acceptance criterion: "extract.config.yaml exists (RFC-0773)")

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/werkstatt-video/` — new package (npm: `@warpgogol/werkstatt-video`)
  - `package.json` — package metadata, exports map, dependencies
  - `tsconfig.json` — extends `../../tsconfig/node-lib.json`
  - `extract.config.yaml` — repo-extract standalone config (RFC-0773)
  - `src/index.ts` — plugin entry point (`werkstattVideoPlugin` export)
  - `src/paths/editframe-paths.ts` — Editframe path conventions
  - `src/invariants/video-invariants.ts` — WV-01..09 declarations
  - `src/checks/composition-validate.ts` — `video.composition.validate` (WV-01, WV-08)
  - `src/checks/render-validate.ts` — `video.render.validate` (WV-03, WV-06)
  - `src/checks/assets-validate.ts` — `video.assets.validate` (WV-02, WV-07)
  - `src/checks/secret-scan.ts` — `video.secret.scan` (WV-04)
  - `src/checks/index.ts` — check gate composition
  - `src/checks/module.ts` — kernel module registering validators
  - `src/build/editframe-build.ts` — `hooks.build` — renders via Editframe API
  - `src/deploy/local-render.ts` — `deployAdapters["local-render"]`
  - `src/onboarding/scaffold-project.ts` — `hooks.scaffoldProject`
  - `src/onboarding/module.ts` — kernel module registering scaffold command
  - `src/release-evidence/video-evidence.ts` — `hooks.releaseEvidence`
  - `src/tests/composition-validate.test.ts` — unit tests
  - `src/tests/render-validate.test.ts` — unit tests
  - `src/tests/assets-validate.test.ts` — unit tests
  - `src/tests/secret-scan.test.ts` — unit tests

### 2.2 Configuration and data

- `packages/werkstatt-video/extract.config.yaml` — extraction config pinned in `.forge/pinned.yaml`
- `.forge/pinned.yaml` — add `packages/werkstatt-video/extract.config.yaml` entry

### 2.3 Documentation and specs

- `packages/werkstatt-video/AGENTS.md` — plugin-local agent guide (path conventions, validator descriptions, invariant list)
- `docs/COMMANDS.md` — run `command.manifest.validate` after registration
- Root `AGENTS.md` — no changes needed (plugin consumed via npm, not workspace)

### 2.4 Validation and pipelines

- `pnpm --filter @warpgogol/werkstatt-video run build:check` — TypeScript compilation
- `pnpm --filter @warpgogol/werkstatt-video run test` — vitest unit tests
- `pnpm exec werkstatt run rfc.validate --id RFC-0778` — RFC validation
- `pnpm exec werkstatt run werkstatt.plugin.validate` — plugin contract validation

## 3. Step sequence

### Step 1. Create package scaffolding (package.json, tsconfig.json, AGENTS.md)

**Goal:** Create the `packages/werkstatt-video` package with metadata matching the game plugin pattern.

**Agent actions:**

- Create `packages/werkstatt-video/package.json` with:
  - `name: "@warpgogol/werkstatt-video"`, `version: "0.1.0"`, `private: true`
  - Exports map: `.`, `./paths`, `./checks`, `./checks/module`, `./invariants`, `./onboarding`, `./onboarding/module`, `./deploy`, `./build`, `./release-evidence`
  - Dependencies: `@warpgogol/werkstatt: workspace:*`, `yaml: ^2.9.0`
  - DevDependencies: `@types/node`, `typescript`, `vitest`
  - Scripts: `build`, `build:check`, `test`, `test:watch` (same as game plugin)
- Create `packages/werkstatt-video/tsconfig.json` extending `../../tsconfig/node-lib.json` (same as game plugin)
- Create `packages/werkstatt-video/AGENTS.md` with plugin contract table, module layout, stack invariants table, check gate composition, scripts, and publication note — mirroring `packages/werkstatt-game/AGENTS.md`

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-video run build:check` — compiles with zero errors (no source files yet, but package structure is valid)

**Completion criterion:** `packages/werkstatt-video/package.json` and `tsconfig.json` exist; `pnpm install` resolves the workspace package without errors.

**Human review:** no

---

### Step 2. Implement path conventions and invariants

**Goal:** Define Editframe path constants and WV-01..09 invariant declarations.

**Agent actions:**

- Create `src/paths/editframe-paths.ts`:
  - `editframePathConventions: StackPathConventions` with `contentDir: "src"`, `distDir: "dist"`, `entryPoints: ["src/composition.tsx", "editframe.config.ts"]`
  - `EDITFRAME_PATHS` constant object: `compositionEntry: "src/composition.tsx"`, `assetsDir: "src/assets"`, `assetManifest: "src/assets/manifest.yaml"`, `editframeConfig: "editframe.config.ts"`, `distDir: "dist"`, `publicDir: "public"`
- Create `src/invariants/video-invariants.ts`:
  - `VIDEO_INVARIANTS: StackInvariant[]` with WV-01..09, each mapping to its validator command
  - WV-01 → `video.composition.validate`, WV-02 → `video.assets.validate`, WV-03 → `video.render.validate`, WV-04 → `video.secret.scan`, WV-05 → advisory (no command), WV-06 → `video.render.validate`, WV-07 → `video.assets.validate`, WV-08 → `video.composition.validate`, WV-09 → `video.render.validate`
  - Note: `video.secret.scan` is the 4th proposed command (added per grilling decision — follows the game plugin pattern where `game.secret.scan` is a separate command)

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-video run build:check`

**Completion criterion:** Path constants and invariant declarations compile; `VIDEO_INVARIANTS` has 9 entries with correct `check` mappings.

**Human review:** no

---

### Step 3. Implement validators (composition, assets, render, secret-scan)

**Goal:** Implement the four validator commands with WV-01..09 enforcement.

**Agent actions:**

- Create `src/checks/composition-validate.ts`:
  - `validateComposition(projectRoot)` — reads `src/composition.tsx`, checks:
    - WV-01: Root Timegroup has `duration` > 0 and `fps` > 0 (parse attributes)
    - WV-08: Entry point `src/composition.tsx` exists
  - Returns `KernelCommandResult<CompositionValidateData>` with `command`, `status`, `violations[]`
  - `createCompositionValidateCommand()` — registers as `video.composition.validate`
- Create `src/checks/assets-validate.ts`:
  - `validateAssets(projectRoot)` — reads `src/assets/manifest.yaml`, checks:
    - WV-02: Every media element referenced in composition exists in manifest and on disk
    - WV-07: No orphaned assets (files in `src/assets/` not in manifest), no missing entries
  - `createAssetsValidateCommand()` — registers as `video.assets.validate`
  - Follow the game plugin `assets-validate.ts` pattern: manifest parse, disk check, orphan check
- Create `src/checks/render-validate.ts`:
  - `validateRender(projectRoot)` — checks rendered output in `dist/`:
    - WV-03: Determinism check — compares current `dist/` hash against a stored baseline hash from `dist/.render-hash.json` (written by the build hook). If no render output exists, report `WV-03: no render output found` (exit 1). If hash file is absent, report `WV-03: no baseline hash found — run build first` (exit 1)
    - WV-06: Render format declared in `editframe.config.ts` (codec, container, resolution)
    - WV-09: Rendered video stored with content-addressed hash (check `dist/` for hash-named file or manifest)
  - `createRenderValidateCommand()` — registers as `video.render.validate`
- Create `src/checks/secret-scan.ts`:
  - `scanSecrets(projectRoot)` — regex-based scan of `src/**/*.ts` and `src/**/*.tsx` for hardcoded secrets
  - WV-04 enforcement — same pattern as game plugin `secret-scan.ts`
  - `createSecretScanCommand()` — registers as `video.secret.scan`
- Create `src/checks/index.ts`:
  - `runVideoCheckGate(ctx)` — runs all 4 validators in sequence, aggregates results
  - Re-export all validators
- Create `src/checks/module.ts`:
  - `createVideoCheckModule()` — kernel module registering all 4 validator commands
  - Follow the game plugin `module.ts` pattern

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-video run build:check`
- `pnpm --filter @warpgogol/werkstatt-video run test` (after Step 7 tests are written)

**Completion criterion:** All 4 validators compile; each returns `{ command, status, violations }` shape; check gate composition runs all 4 in sequence.

**Human review:** no

---

### Step 4. Implement build hook and deploy adapter

**Goal:** Implement `hooks.build` (Editframe render) and `deployAdapters["local-render"]`.

**Agent actions:**

- Create `src/build/editframe-build.ts`:
  - `runEditframeBuild(ctx: PluginHookContext): Promise<HookResult>` — renders the composition via the Editframe CLI
  - Reads `editframe.config.ts` for render settings (codec, resolution, fps, bitrate)
  - Shells out to `npx editframe render` (or equivalent CLI command) via `execFileSync` — same pattern as game plugin's `vite-build.ts`
  - Outputs rendered video to `dist/`
  - After successful render, writes `dist/.render-hash.json` with the sha256 hash of the rendered output — this is the baseline for WV-03 determinism validation
  - Timeout: 300_000ms (5 min — video rendering is slower than vite build)
  - Error handling: catch execFileSync errors, return `HookResult` with `success: false`
- Create `src/deploy/local-render.ts`:
  - `createLocalRenderAdapter()` — thin adapter that delegates to the engine's `artifact.store.put` primitive (DNA-52)
  - `LocalRenderDeployConfig` interface: reads credentials from channel config (never env vars directly)
  - `deploy(workpiecePath, config)` — computes content-addressed hash of `dist/*.mp4`, calls `artifact.store.put` with the hash as the key
  - Follow the game plugin `github-pages.ts` pattern: config from channel, credential injection, error handling — but delegate the actual upload to the engine primitive instead of implementing S3 upload logic

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-video run build:check`

**Completion criterion:** Build hook and deploy adapter compile; both follow the `HookResult` / `DeployResult` patterns from the game plugin.

**Human review:** no

---

### Step 5. Implement scaffold project hook and onboarding module

**Goal:** Implement `hooks.scaffoldProject` to generate a new Editframe composition project.

**Agent actions:**

- Create `src/onboarding/scaffold-project.ts`:
  - `scaffoldEditframeProject(ctx: PluginHookContext): Promise<HookResult>` — creates:
    - `src/composition.tsx` — minimal Editframe composition with a root Timegroup
    - `src/assets/manifest.yaml` — empty asset manifest skeleton
    - `editframe.config.ts` — render config (codec: H.264, container: MP4, resolution: 1920x1080, fps: 30, bitrate: CBR)
    - `package.json` — project metadata with Editframe dependencies
    - `tsconfig.json` — TypeScript config for JSX/TSX
    - `vite.config.ts` — Vite config for Editframe dev server
  - Follow the game plugin `scaffold-project.ts` pattern: template strings, mkdir recursive, writeFile, error handling
- Create `src/onboarding/module.ts`:
  - `createVideoOnboardingModule()` — kernel module (same pattern as game plugin)

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-video run build:check`

**Completion criterion:** Scaffold hook compiles; generated boilerplate includes `src/composition.tsx`, `editframe.config.ts`, and `src/assets/manifest.yaml`.

**Human review:** no

---

### Step 6. Implement release evidence hook and plugin entry point

**Goal:** Implement `hooks.releaseEvidence` and the plugin entry point that wires everything together.

**Agent actions:**

- Create `src/release-evidence/video-evidence.ts`:
  - `generateVideoEvidence(ctx: PluginHookContext): Promise<HookResult>` — computes:
    - `renderHash` — SHA-256 of rendered video file(s) in `dist/`
    - `compositionHash` — SHA-256 of `src/composition.tsx`
    - `assetManifestHash` — SHA-256 of `src/assets/manifest.yaml`
    - `renderBytes` — total size of rendered output
  - Follow the game plugin `game-evidence.ts` pattern: `hashFile`, `hashDirectory`, `listFiles`
- Create `src/index.ts`:
  - `werkstattVideoPlugin: WerkstattPlugin` — full plugin object:
    - `schema: "werkstatt/plugin@1"`, `id: "werkstatt-video"`, `profileId: "editframe"`
    - `paths: editframePathConventions`
    - `moduleLoaders: { checks, onboarding }` — async imports (same pattern as game plugin)
    - `deployAdapters: { "local-render" }` — async import
    - `hooks: { build, checkGate, releaseEvidence, scaffoldProject }` — async imports
    - `invariants: VIDEO_INVARIANTS`
  - `export default werkstattVideoPlugin`

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-video run build:check`
- `pnpm exec werkstatt run werkstatt.plugin.validate` — plugin contract validation passes

**Completion criterion:** Plugin entry point compiles; `werkstatt.plugin.validate` passes with `profileId: "editframe"` and all hooks/adapters/modules resolved.

**Human review:** no

---

### Step 7. Write unit tests

**Goal:** Unit tests for all validators, scaffold, and release evidence.

**Agent actions:**

- Create `src/tests/composition-validate.test.ts`:
  - Test valid composition (root Timegroup with duration > 0, fps > 0) → pass
  - Test missing entry point (`src/composition.tsx` absent) → WV-08 violation
  - Test zero duration → WV-01 violation
  - Test zero fps → WV-01 violation
- Create `src/tests/assets-validate.test.ts`:
  - Test valid manifest (all assets exist, no orphans) → pass
  - Test missing asset on disk → WV-02 violation
  - Test orphaned asset (file not in manifest) → WV-07 violation
  - Test empty manifest (no assets) → pass
- Create `src/tests/render-validate.test.ts`:
  - Test no render output → WV-03 violation (exit 1)
  - Test undeclared format → WV-06 violation
  - Test determinism (dist/ hash matches stored baseline in `.render-hash.json`) → pass
  - Test non-determinism (dist/ hash differs from baseline) → WV-03 violation
  - Test missing baseline hash file → WV-03 violation (exit 1)
- Create `src/tests/secret-scan.test.ts`:
  - Test clean source → pass
  - Test hardcoded API key → WV-04 violation
  - Test hardcoded password → WV-04 violation
  - Test private key block → WV-04 violation
  - Test comment lines skipped → pass

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-video run test`

**Completion criterion:** All tests pass; coverage includes pass and fail paths for each validator.

**Human review:** no

---

### Step 8. Create extraction config and pin

**Goal:** Create `extract.config.yaml` for the publication pipeline (RFC-0773).

**Agent actions:**

- Create `packages/werkstatt-video/extract.config.yaml` — mirror the game plugin config:
  - `projectDir: packages/werkstatt-video`
  - `destName: werkstatt-video`
  - `standalone: true`
  - `workspacePrefixes: ["@warpgogol/"]`, `stripScopes: ["@warpgogol/"]`
  - `preservePackages: ["@warpgogol/werkstatt-video", "@warpgogol/werkstatt"]`
  - `excludePathSegments: [".npmrc"]`
  - `postProcess: [{ action: delete, path: AGENTS.md }]`
  - `git: { remote: git@github.com:syrokomskyi/werkstatt-video.git, autoPush: true }`
- Add entry to `.forge/pinned.yaml` for the extraction config

**Validation:**

- `pnpm exec werkstatt run rfc.validate --id RFC-0778`

**Completion criterion:** `extract.config.yaml` exists and is pinned in `.forge/pinned.yaml`.

**Human review:** no

---

### Step 9. Final validation, review, fix, and stamp

**Goal:** Run all validation, code review, fix findings, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Run `pnpm --filter @warpgogol/werkstatt-video run build:check`
- Run `pnpm --filter @warpgogol/werkstatt-video run test`
- Run `pnpm exec werkstatt run rfc.validate --id RFC-0778`
- Run `pnpm exec werkstatt run werkstatt.plugin.validate`
- Run `pnpm exec werkstatt run command.manifest.generate` to verify the command manifest is in sync (if applicable)
- Check off acceptance criteria in the RFC with `(evidence: <file:line>)` annotations
- Run code review: invoke `fo-review` via the `skill` tool on all session code changes
- Run fix if needed: invoke `fo-fix` if review has findings
- Stamp: `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0778 --implementation-commit <sha>`

**Validation:**

- `git status` — no uncommitted changes from this session
- `pnpm exec werkstatt run rfc.validate --id RFC-0778` — passes
- Review report exists in `docs/reviews/code/` for this session

**Completion criterion:** All acceptance criteria checked off with evidence; RFC stamped as `implemented` via `rfc.implement.stamp`; code review passed.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp`.

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate --id RFC-0778`
- `pnpm --filter @warpgogol/werkstatt-video run build:check`
- `pnpm --filter @warpgogol/werkstatt-video run test`
- `pnpm exec werkstatt run werkstatt.plugin.validate`

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0778` in the subject line (RFC-0265 commit hygiene)
- Review report in `docs/reviews/code/` for this session

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Editframe API availability | Step 4: build hook uses Editframe API with local render SDK fallback; timeout and error handling in `editframe-build.ts` |
| Render determinism (WV-03) | Step 3: `render-validate.ts` renders twice and compares sha256; Step 4: build hook uses deterministic encoding settings (CBR, no metadata, pinned ffmpeg) |
| Large video files in artifact store | Step 4: deploy adapter uses R2/S3 with content-addressed hash keys; artifact store retention rules (DNA-52) apply |
| ffmpeg version drift | Step 5: scaffold generates `editframe.config.ts` with declared ffmpeg version; Step 3: `render-validate.ts` reports environment fingerprint alongside hash |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-N, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0778 --reason "..." --invariant "DNA-N"` instead of working around it.
- If the Editframe API does not support deterministic encoding settings (CBR, no metadata), escalate to the operator — WV-03 may need to be relaxed to "same-environment determinism" rather than "absolute determinism".
- If `werkstatt.plugin.validate` fails with PLUGIN-02 (profileId mismatch), verify that `packages/forge/profiles/editframe.yaml` has `id: editframe` matching the plugin's `profileId`.
