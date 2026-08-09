---
rfcId: RFC-0777
planId: PLAN-RFC-0777-01
status: draft
owner: architecture
createdAt: 2026-08-09
updatedAt:
scope:
  apps: []
  packages:
    - packages/werkstatt-game
  services: []
  docs:
    - docs/rfcs/rfc-0777-werkstatt-game-plugin-for-phaser-turborepo-stack.md
    - AGENTS.md
    - packages/werkstatt-game/AGENTS.md
---

# Implementation Plan: RFC-0777

## 1. Objectives

- [ ] O1 — Create `packages/werkstatt-game` with `profileId: "phaser-turborepo"` (maps to AC: `packages/werkstatt-game` exists with `profileId`)
- [ ] O2 — Implement plugin registration via `WerkstattPlugin` contract (maps to AC: `werkstatt.plugin.validate` passes)
- [ ] O3 — Implement 3 game validators: `game.assets.validate`, `game.scenes.validate`, `game.bundle.validate` (maps to AC: validators registered)
- [ ] O4 — Implement `github-pages` and `cloudflare-pages` deploy adapters (maps to AC: adapters work)
- [ ] O5 — Implement `hooks.scaffoldProject` for Phaser project boilerplate (maps to AC: scaffold creates valid project)
- [ ] O6 — Create `extract.config.yaml` for publication (maps to AC: extract config exists)
- [ ] O7 — Resolve summit findings: checkGate wiring, moduleLoaders, phaser.config.ts shape, GAME-04 enforcement, bundle measurement, credential injection, test strategy

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/werkstatt-game/` — new package (all modules below)
  - `src/index.ts` — plugin entry point (`werkstattGamePlugin` export)
  - `src/paths/phaser-paths.ts` — Phaser path conventions
  - `src/checks/assets-validate.ts` — `game.assets.validate` handler
  - `src/checks/scenes-validate.ts` — `game.scenes.validate` handler
  - `src/checks/bundle-validate.ts` — `game.bundle.validate` handler
  - `src/checks/secret-scan.ts` — `GAME-04` secret scan enforcement
  - `src/checks/index.ts` — check gate composition (which validators run in `checkGate`)
  - `src/build/vite-build.ts` — `hooks.build` (runs `vite build`)
  - `src/deploy/github-pages.ts` — `deployAdapters["github-pages"]`
  - `src/deploy/cloudflare-pages.ts` — `deployAdapters["cloudflare-pages"]`
  - `src/onboarding/scaffold-project.ts` — `hooks.scaffoldProject`
  - `src/release-evidence/game-evidence.ts` — `hooks.releaseEvidence`
  - `src/invariants/game-invariants.ts` — GAME-01..04 invariant declarations
  - `package.json` — package metadata, `profileId`, dependencies
  - `tsconfig.json` — TypeScript config
  - `extract.config.yaml` — publication config (RFC-0773)
- `tools/kernel.config.ts` — no change (this is a consumer workshop concern, not the workshop repo itself)

### 2.2 Configuration and data

- `packages/werkstatt-game/extract.config.yaml` — extraction/publish config with `excludePathSegments: [".npmrc"]`
- `packages/werkstatt-game/package.json` — `name: @warpgogol/werkstatt-game`, `schema: werkstatt/plugin@1`

### 2.3 Documentation and specs

- `packages/werkstatt-game/AGENTS.md` — package-level agent guide
- `AGENTS.md` (root) — add `packages/werkstatt-game` to the Werkstatt plugin contract section if needed
- `docs/rfcs/rfc-0777-werkstatt-game-plugin-for-phaser-turborepo-stack.md` — read-only reference (acceptance criteria checked off during stamping)

### 2.4 Validation and pipelines

- `pnpm exec site-kernel run rfc.validate --id RFC-0777`
- `pnpm --filter @warpgogol/werkstatt-game run build:check`
- `pnpm exec site-kernel run werkstatt.plugin.validate` (if the plugin is registered in this workshop's `kernel.config.ts`)
- Unit tests for each validator

## 3. Step sequence

### Step 1. Package scaffold and plugin entry point

**Goal:** Create `packages/werkstatt-game` with the plugin entry point implementing `WerkstattPlugin`.

**Agent actions:**

- Create `packages/werkstatt-game/package.json` with `name: @warpgogol/werkstatt-game`, dependencies on `@warpgogol/werkstatt` (peer), `phaser` types (dev), `vite` (dev)
- Create `packages/werkstatt-game/tsconfig.json` extending `tsconfig/base.json`
- Create `src/index.ts` exporting `werkstattGamePlugin: WerkstattPlugin` with real `moduleLoaders` (not placeholder comments):
  ```ts
  moduleLoaders: {
    checks: () => import("./checks"),
    onboarding: () => import("./onboarding"),
  },
  ```
- Create `src/paths/phaser-paths.ts` with Phaser path conventions (`src/scenes/`, `src/assets/`, `public/`, `dist/`, `phaser.config.ts`)
- Create `src/invariants/game-invariants.ts` declaring GAME-01..04

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-game run build:check` — TypeScript compiles
- Plugin entry point exports `werkstattGamePlugin` with `schema: "werkstatt/plugin@1"`, `id: "werkstatt-game"`, `profileId: "phaser-turborepo"`

**Completion criterion:** Package directory exists, `build:check` passes, plugin entry point is a valid `WerkstattPlugin` object.

**Human review:** no

---

### Step 2. Game validators (checks module)

**Goal:** Implement the 3 game validators with check gate composition.

**Agent actions:**

- Create `src/checks/assets-validate.ts` — `game.assets.validate`: reads asset manifest, checks every asset referenced by scenes exists in `src/assets/` and is listed in manifest. Passes on empty manifest.
- Create `src/checks/scenes-validate.ts` — `game.scenes.validate`: scans `src/scenes/*.ts`, checks each scene is registered in `phaser.config.ts`. Passes if at least one scene registered (boot scene). Zero scenes = GAME-01 violation.
- Create `src/checks/bundle-validate.ts` — `game.bundle.validate`: measures gzipped size of `dist/` bundle. Reads `bundleBudget` from `phaser.config.ts` (default 5 MB = 5242880 bytes). Measurement method: `gzip` each file in `dist/` and sum the sizes (document this as the canonical measurement).
- Create `src/checks/secret-scan.ts` — `GAME-04` enforcement: regex-based scan of `src/**/*.ts` for common secret patterns (API keys, tokens, passwords). Runs as part of `checkGate`.
- Create `src/checks/index.ts` — exports all validators and defines `checkGate` composition: `checkGate` runs all 4 checks (assets, scenes, bundle, secret-scan).
- Each validator returns the uniform `--json` shape: `{ command, status, violations: [] }`.

**Validation:**

- Unit tests: `src/checks/__tests__/assets-validate.test.ts` — fixture project with valid/invalid/empty manifest
- Unit tests: `src/checks/__tests__/scenes-validate.test.ts` — fixture project with registered/unregistered/zero scenes
- Unit tests: `src/checks/__tests__/bundle-validate.test.ts` — fixture with under/over budget, default budget, custom budget
- Unit tests: `src/checks/__tests__/secret-scan.test.ts` — fixture with clean source, source with hardcoded key
- `pnpm --filter @warpgogol/werkstatt-game run build:check`

**Completion criterion:** All 4 validators implemented with unit tests. Check gate composition defined. All tests pass.

**Human review:** no

---

### Step 3. Build hook and deploy adapters

**Goal:** Implement `hooks.build` and the two deploy adapters.

**Agent actions:**

- Create `src/build/vite-build.ts` — `hooks.build`: runs `vite build` in the workpiece directory. Uses the project's own `vite.config.ts`.
- Create `src/deploy/github-pages.ts` — `deployAdapters["github-pages"]`: builds and deploys to GitHub Pages. Credentials (GitHub token) injected from `systems/registry.yaml` channel config (`deploy.github.token`).
- Create `src/deploy/cloudflare-pages.ts` — `deployAdapters["cloudflare-pages"]`: builds and deploys to Cloudflare Pages. Credentials (Cloudflare API token, account ID) injected from `systems/registry.yaml` channel config (`deploy.cloudflare.apiToken`, `deploy.cloudflare.accountId`).
- Document credential injection path: adapters read from channel config, never from environment variables directly.

**Validation:**

- Unit tests: `src/deploy/__tests__/github-pages.test.ts` — mock `execFileSync`, verify adapter calls correct commands
- Unit tests: `src/deploy/__tests__/cloudflare-pages.test.ts` — mock `execFileSync`, verify adapter calls correct commands
- `pnpm --filter @warpgogol/werkstatt-game run build:check`

**Completion criterion:** Build hook and both deploy adapters implemented with unit tests. Credential injection from channel config documented.

**Human review:** no

---

### Step 4. Onboarding (scaffoldProject) and release evidence

**Goal:** Implement `hooks.scaffoldProject` and `hooks.releaseEvidence`.

**Agent actions:**

- Create `src/onboarding/scaffold-project.ts` — `hooks.scaffoldProject`: generates a new Phaser project with:
  - `src/scenes/boot.ts` (boot scene boilerplate)
  - `src/assets/manifest.yaml` (empty manifest skeleton)
  - `phaser.config.ts` with boot scene registered and `bundleBudget: 5242880`
  - `package.json`, `tsconfig.json`, `vite.config.ts`
- Create `src/release-evidence/game-evidence.ts` — `hooks.releaseEvidence`: generates evidence with bundle hash, asset manifest hash, scene registry hash.
- Create a minimal `phaser.config.ts` example in the RFC body (summit finding D1) showing scene registration and `bundleBudget` field.

**Validation:**

- Unit tests: `src/onboarding/__tests__/scaffold-project.test.ts` — verify generated project structure
- Unit tests: `src/release-evidence/__tests__/game-evidence.test.ts` — verify evidence shape
- Scaffolded project builds: `vite build` succeeds on the generated boilerplate

**Completion criterion:** Scaffold generates a valid Phaser project that builds. Release evidence produces correct hashes.

**Human review:** no

---

### Step 5. Publication config and AGENTS.md

**Goal:** Create `extract.config.yaml` and package-level `AGENTS.md`.

**Agent actions:**

- Create `packages/werkstatt-game/extract.config.yaml` with `excludePathSegments: [".npmrc"]` (RFC-0773)
- Create `packages/werkstatt-game/AGENTS.md` — package-level agent guide: plugin contract, module layout, validator descriptions, invariant list
- Update root `AGENTS.md` if the Werkstatt plugin contract section needs to mention the game plugin

**Validation:**

- `extract.config.yaml` exists and includes `.npmrc` exclusion
- `AGENTS.md` exists and documents all modules

**Completion criterion:** Publication config and AGENTS.md created.

**Human review:** no

---

### Step 6. Summit findings resolution

**Goal:** Address all summit findings that weren't resolved in steps 1-5.

**Agent actions:**

- **A1 checkGate wiring:** Resolved in Step 2 (`src/checks/index.ts` defines check gate composition).
- **A2 moduleLoaders:** Resolved in Step 1 (real `moduleLoaders` values, not placeholder comments).
- **D1 phaser.config.ts shape:** Resolved in Step 4 (minimal example in scaffold + RFC body).
- **S1 GAME-04 enforcement:** Resolved in Step 2 (`src/checks/secret-scan.ts` with regex patterns, runs in `checkGate`).
- **S2 credential injection:** Resolved in Step 3 (documented in deploy adapters).
- **Q1 test strategy:** Resolved in Steps 2-4 (unit tests for each validator and adapter).
- **Q2 bundle measurement:** Resolved in Step 2 (gzip each file in `dist/`, sum sizes).
- **P1 dependency chain:** Add a note to the RFC body clarifying: RFC-0777 requires RFC-0770..0773 (hard dependencies) but RFC-0776 and RFC-0779 are soft sequencing (the plugin can be tested with a manually created workshop).
- **D2 implementation notes:** Update `site-kernel run` → `werkstatt run` in the RFC implementation notes section.

**Validation:**

- Review all summit findings against implemented code
- Each finding has a corresponding code artifact or RFC text update

**Completion criterion:** All 7 summit findings (2 consensus + 5 unique) have corresponding resolutions in code or RFC text.

**Human review:** no

---

### Step 7. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize all documentation artifacts, run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Update affected `AGENTS.md` files (root, `packages/werkstatt-game/`) with new modules, commands, or ownership changes.
- Update affected `docs/*.xml` Compass files when repository-wide semantics changed.
- Run `pnpm exec site-kernel run ecosystem.manifest.generate` if command surfaces or pipeline topology changed.
- **Run code review:** invoke `fo-review` via the `skill` tool on all session code changes. Wait for the review report in `docs/reviews/code/`.
- **Run fix if needed:** if `fo-review` reported findings, invoke `fo-fix` via the `skill` tool. Re-run `fo-review` to confirm all findings are resolved. Maximum 3 iterations.
- **Check off acceptance criteria:** verify each criterion in the RFC against the implemented code. Mark `[x]` for verified criteria with inline `(evidence: <file:line>)` annotations. For unchecked `[ ]` criteria, document why.
- **Stamp the RFC as implemented:** run `pnpm exec site-kernel run rfc.implement.stamp --id RFC-0777 --implementation-commit <sha>` to atomically transition `accepted → implemented`.

**Validation:**

- `git status` — no uncommitted changes from the current session.
- `pnpm exec site-kernel run rfc.validate --id RFC-0777`
- Every file in `scope.docs` is either updated or documented as not-applicable.
- Review report exists in `docs/reviews/code/` for this session.

**Completion criterion:** All documentation artifacts in scope are updated; code review passed (findings fixed if any); all acceptance criteria are checked off with inline `(evidence: ...)` annotations; RFC is stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476), which validates all preconditions atomically. Code review is automated via `fo-review`.

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec site-kernel run rfc.validate --id RFC-0777`
- `pnpm --filter @warpgogol/werkstatt-game run build:check`
- `pnpm exec site-kernel run rfc.acceptance.run --id RFC-0777` (if acceptance probes declared — currently commented out)
- `pnpm exec site-kernel run rfc.verification.emit --id RFC-0777` (RFC-0330 — may skip if no acceptance probes)

### 4.2 Evidence artifacts

- `docs/rfcs/verification/rfc-0777.generated.json` — verification evidence (RFC-0330, if probes are declared)
- Commit messages referencing `RFC-0777` in the subject line (RFC-0265 commit hygiene)

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Phaser version churn (3 vs 4 vs CE) | Step 2: plugin does not depend on Phaser directly; validates project structure only |
| GitHub Pages deploy specifics (branch naming, base path) | Step 3: adapter reads config from `systems/registry.yaml` channel config |
| No LFS-tracked binary assets in plugin package | Step 1: package contains TypeScript/YAML only; `extract.config.yaml` excludes `.npmrc` |

| Summit finding | Mitigation (plan step) |
| --- | --- |
| checkGate wiring undefined | Step 2: `src/checks/index.ts` defines composition |
| moduleLoaders placeholder | Step 1: real loader functions |
| phaser.config.ts shape unknown | Step 4: minimal example in scaffold |
| GAME-04 enforcement undefined | Step 2: `secret-scan.ts` with regex patterns |
| Credential injection path | Step 3: documented in deploy adapters |
| No test strategy | Steps 2-4: unit tests for each module |
| Bundle measurement method | Step 2: gzip each file, sum sizes |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-64 (engine/plugin boundary), run `pnpm exec site-kernel run rfc.supersede.propose --id RFC-0777 --reason "..." --invariant "DNA-64"` instead of working around it.
- If the `WerkstattPlugin` contract (RFC-0770) is found to be insufficient for game plugins (e.g. missing hook, missing field), do not extend the contract in this RFC — create a new RFC amending RFC-0770.
