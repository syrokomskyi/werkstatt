---
rfcId: RFC-0779
planId: PLAN-RFC-0779-01
status: draft
owner: architecture
createdAt: 2026-08-09
updatedAt:
scope:
  apps: []
  packages:
    - packages/werkstatt
  services: []
  docs:
    - AGENTS.md
    - docs/authoring/site-composition.md
---

# Implementation Plan: RFC-0779

## 1. Objectives

- [ ] O1: Register `workshop.scaffold` command (workspace scope) in the engine — maps to acceptance criterion "workshop.scaffold command registered"
- [ ] O2: Generate all workshop-specific artifacts (package.json, pnpm-workspace.yaml, turbo.json, tools/kernel.config.ts, .npmrc, tsconfig, eslint, prettier, .gitignore, .gitattributes, hooks, CI, systems/registry.yaml, missions/.gitkeep, .forge/pinned.yaml, README.md) — maps to "Generates all artifacts listed in the table above"
- [ ] O3: Delegate forge-specific artifacts to `forge.init` (forge.yaml, PREFERENCES.md, .agents/skills/, .agents/memory/, AGENTS.md, docs dirs, templates) — maps to "Generates all artifacts listed in the table above"
- [ ] O4: Stack-specific customization for all three profiles (site, game, video) — maps to "Stack-specific customization works for all three profiles"
- [ ] O5: Post-scaffold verification flow (default: skip; `--verify`: run forge.doctor + plugin.validate + autonomy.validate) — maps to "Post-scaffold verification passes"
- [ ] O6: SCAFFOLD-01..06 failure modes covered by unit tests — maps to "SCAFFOLD-01..06 failure modes covered by unit tests"
- [ ] O7: End-to-end scaffold → register project → build → deploy — maps to "End-to-end: scaffold a game workshop → register a game project → build → deploy"

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/werkstatt/src/commands/workshop-scaffold.ts` — new handler (`runWorkshopScaffold`)
- `packages/werkstatt/src/commands/workshop-scaffold.test.ts` — unit tests
- `packages/werkstatt/src/module.ts` — register `workshop.scaffold` command
- `packages/werkstatt/src/templates/` — workshop template files (package.json, pnpm-workspace.yaml, turbo.json, kernel.config.ts, .npmrc, tsconfig, eslint, prettier, .gitignore, .gitattributes, hooks/pre-commit, .github/workflows/ci.yml, systems/registry.yaml, missions/.gitkeep, .forge/pinned.yaml, README.md)
- `packages/forge/src/onboarding/init.ts` — `forge.init` already exists; `workshop.scaffold` calls it as a sub-step

### 2.2 Configuration and data

- Workshop template files are static text with `__WORKSHOP_NAME__` and `__STACK_ID__` placeholders
- `.forge/pinned.yaml` template pre-populated with foundation file entries
- `systems/registry.yaml` template with schema comment

### 2.3 Documentation and specs

- `AGENTS.md` (root) — document `workshop.scaffold` command in the command surface section
- `docs/authoring/site-composition.md` — note that consumer workshops are scaffolded via `workshop.scaffold`, not by copying this monorepo

### 2.4 Validation and pipelines

- `packages/werkstatt` — `build:check` (typecheck) and `test` (vitest)
- No new pipeline steps — `workshop.scaffold` is a one-shot scaffolding command, not a build pipeline step

## 3. Step sequence

### Step 1. TypeScript contracts and handler skeleton

**Goal:** Define the `ScaffoldWorkshopInput` and `ScaffoldWorkshopResult` types and create the handler function skeleton.

**Agent actions:**

- Create `packages/werkstatt/src/commands/workshop-scaffold.ts` with `ScaffoldWorkshopInput`, `ScaffoldWorkshopResult` interfaces (matching RFC TypeScript contracts section)
- Implement `runWorkshopScaffold(input, context)` function with flag parsing (`--name`, `--stack`, `--dest`, `--dry-run`, `--verify`)
- Validate kebab-case name, required flags, stack profile existence
- Return `ScaffoldWorkshopResult` shape

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run build:check` — typecheck passes

**Completion criterion:** Handler file exists, types match RFC contracts, typecheck passes.

**Human review:** no

---

### Step 2. Workshop template files

**Goal:** Create static template files for workshop-specific artifacts.

**Agent actions:**

- Create `packages/werkstatt/src/templates/workshop/` directory with template files:
  - `package.json.tmpl` — root package with `@warpgogol/werkstatt`, `@warpgogol/werkstatt-<stack>`, `@warpgogol/forge` deps
  - `pnpm-workspace.yaml.tmpl`
  - `turbo.json.tmpl`
  - `kernel.config.ts.tmpl` — imports engine + plugin, registers plugin
  - `npmrc.tmpl` — scoped registry with placeholder token
  - `tsconfig-base.json.tmpl`
  - `eslint.config.js.tmpl`
  - `prettierrc.mjs.tmpl`
  - `gitignore.tmpl`
  - `gitattributes-site.tmpl` — LFS patterns for site stack
  - `gitattributes-empty.tmpl` — no LFS for game/video stacks
  - `pre-commit.tmpl` — platform-scope guard
  - `ci.yml.tmpl` — CI with install, typecheck, test, autonomy.validate, plugin.validate
  - `registry.yaml.tmpl` — empty registry with schema comment
  - `pinned.yaml.tmpl` — foundation files pinned
  - `README.md.tmpl` — workshop README with quickstart and npm token setup instructions
- Templates use `__WORKSHOP_NAME__` and `__STACK_ID__` placeholders
- Stack-specific variants: `ci-site.yml.tmpl`, `ci-game.yml.tmpl`, `ci-video.yml.tmpl` for stack-oriented CI

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run build:check` — templates are valid TypeScript imports

**Completion criterion:** All template files exist with correct placeholders.

**Human review:** no

---

### Step 3. Scaffold generation logic

**Goal:** Implement the file generation logic in `runWorkshopScaffold`.

**Agent actions:**

- Read the forge stack profile (via `listStackProfiles`) to validate `--stack`
- Create destination directory (refuse if non-empty — SCAFFOLD-05)
- Write workshop-specific files from templates with placeholder substitution
- Select stack-specific variants (LFS patterns, CI config)
- Call `forge.init` (via `runInit` from `packages/forge/src/onboarding/init.ts`) inside the new directory for forge-specific artifacts (forge.yaml, PREFERENCES.md, .agents/skills/, .agents/memory/, docs dirs, templates)
- Call `forge.agents.generate` (via `runAgentsGenerate`) for AGENTS.md
- If `--dry-run`: collect file list without writing, return preview
- If `--verify`: run `pnpm install`, `forge.doctor`, `werkstatt.plugin.validate`, `werkstatt.autonomy.validate`; collect results
- Default (no `--verify`): skip install and verification, return `verification: { "forge.doctor": "skipped", ... }`

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run build:check`

**Completion criterion:** Handler generates all artifacts, delegates forge artifacts to `forge.init`, supports `--dry-run` and `--verify`.

**Human review:** no

---

### Step 4. Command registration

**Goal:** Register `workshop.scaffold` in the engine's command registry.

**Agent actions:**

- In `packages/werkstatt/src/module.ts`, register `workshop.scaffold` with metadata: `scope: workspace`, `requiresNetwork: true`, `longRunning: true`
- Ensure the command appears in `command.manifest.generate` output

**Validation:**

- `pnpm exec werkstatt run command.manifest.generate` — `workshop.scaffold` appears in manifest
- `pnpm --filter @warpgogol/werkstatt run build:check`

**Completion criterion:** `workshop.scaffold` is registered and appears in the command manifest.

**Human review:** no

---

### Step 5. Unit tests

**Goal:** Cover SCAFFOLD-01..06 failure modes and happy path.

**Agent actions:**

- Create `packages/werkstatt/src/commands/workshop-scaffold.test.ts`
- Test SCAFFOLD-01: unknown stack profile → exit 1
- Test SCAFFOLD-02: plugin not installed (mock npm install failure) → exit 1
- Test SCAFFOLD-03: forge.doctor fails (mock) → exit 1
- Test SCAFFOLD-04: werkstatt.plugin.validate fails (mock) → exit 1
- Test SCAFFOLD-05: destination directory not empty → exit 1
- Test SCAFFOLD-06: npm auth failure (mock) → exit 1
- Test happy path: scaffold a workshop with `--dry-run`, verify all expected files in result
- Test `forge.init` delegation: verify forge.yaml, PREFERENCES.md, .agents/ created
- Test stack-specific customization: site (LFS patterns), game (no LFS), video (no LFS)

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run test`

**Completion criterion:** All SCAFFOLD-01..06 tests pass, happy path test passes, delegation test passes.

**Human review:** no

---

### Step 6. Documentation

**Goal:** Update AGENTS.md and authoring docs.

**Agent actions:**

- Update root `AGENTS.md` — add `workshop.scaffold` to the command surface section, note it creates consumer workshops (not projects)
- Update `docs/authoring/site-composition.md` — note that consumer workshops are scaffolded via `workshop.scaffold`
- Run `pnpm exec werkstatt run ecosystem.manifest.generate` if command manifest changed

**Validation:**

- `git diff AGENTS.md` shows the new command documentation
- `git diff docs/authoring/site-composition.md` shows the consumer workshop note

**Completion criterion:** Both docs updated with `workshop.scaffold` references.

**Human review:** no

---

### Step 7. End-to-end validation

**Goal:** Verify the full scaffold → register → build → deploy flow for one stack.

**Agent actions:**

- Scaffold a game workshop in a temp directory: `pnpm exec werkstatt run workshop.scaffold --name test-game-workshop --stack phaser-turborepo --dest /tmp/test-game-workshop`
- Fill `.npmrc` with a valid test token (or mock)
- Run `pnpm install` in the scaffolded workshop
- Run `pnpm exec werkstatt run forge.doctor` — passes
- Run `pnpm exec werkstatt run werkstatt.plugin.validate` — passes
- Run `pnpm exec werkstatt run onboarding.scaffold --system my-first-game --title "Test Game"` — creates a game project
- Build the game project
- Deploy to a test channel (GitHub Pages or local)
- Clean up temp directory

**Validation:**

- All commands exit 0
- Scaffolded workshop has all expected files
- Game project builds and deploys

**Completion criterion:** End-to-end flow completes without errors for the game stack.

**Human review:** yes — operator verifies the scaffolded workshop looks correct and the game project builds. This is the first real consumer workshop; human judgment is needed.

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize all documentation artifacts, run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Verify `AGENTS.md` and `docs/authoring/site-composition.md` are updated
- Run `pnpm exec werkstatt run ecosystem.manifest.generate` if command surfaces changed
- Run code review: invoke `fo-review` via the `skill` tool on all session code changes
- Run fix if needed: if `fo-review` reported findings, invoke `fo-fix`. Re-run `fo-review` to confirm. Maximum 3 iterations.
- Check off acceptance criteria: verify each criterion against implemented code. Mark `[x]` with inline `(evidence: ...)` annotations.
- Stamp the RFC as implemented: run `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0779 --implementation-commit <sha>`

**Validation:**

- `git status` — no uncommitted changes from the current session
- `pnpm exec werkstatt run rfc.validate --id RFC-0779`
- Review report exists in `docs/reviews/code/` for this session

**Completion criterion:** All documentation artifacts updated; code review passed; all acceptance criteria checked off with evidence; RFC stamped as `implemented`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp`.

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate --id RFC-0779`
- `pnpm --filter @warpgogol/werkstatt run build:check`
- `pnpm --filter @warpgogol/werkstatt run test`
- `pnpm exec werkstatt run rfc.verification.emit --id RFC-0779` (RFC-0330)

### 4.2 Evidence artifacts

- `docs/rfcs/verification/rfc-0779.generated.json` — verification evidence
- Commit messages referencing `RFC-0779` in the subject line

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Private npm access for new operators | Step 2: README.md template includes npm token setup instructions; Step 3: default skips install, `--verify` flag for automated flow |
| Stack profile drift | Step 3: `forge.doctor` checks for profile updates during `--verify`; documented in README template |
| Plugin not yet published | Step 5: SCAFFOLD-02 test covers this; error message guides operator |
| Chicken-and-egg with .npmrc placeholder | Step 3: default flow skips `pnpm install`; operator fills token first, then runs install manually |
| CLI name dependency (werkstatt vs site-kernel) | Step 1: handler uses `werkstatt run` CLI name; RFC-0772 (wave 2) must be complete first |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-62 (pinned files), run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0779 --reason "..." --invariant "DNA-62"` instead of working around it.
- If `forge.init` API is insufficient for delegation (e.g. missing a way to pass stack profile), create an amending RFC rather than monkey-patching `forge.init`.
- If the plugin contract (RFC-0770) is missing a hook needed by `workshop.scaffold`, create an amending RFC for RFC-0770.
