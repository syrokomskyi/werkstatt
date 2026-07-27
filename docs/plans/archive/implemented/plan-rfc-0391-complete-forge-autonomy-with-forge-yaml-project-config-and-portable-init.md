---
rfcId: RFC-0391
planId: PLAN-RFC-0391-01
status: draft
owner: architecture
createdAt: 2026-07-19
updatedAt:
scope:
  apps: []
  packages:
    - "@wgogol/forge"
    - "@gogol/site-kernel"
  services: []
  docs:
    - "AGENTS.md"
    - "forge.yaml"
---

# Implementation Plan: RFC-0391

## 1. Objectives

- [ ] O1 — `forge.yaml` config module with zod schema, `loadForgeConfig`, `resolveForgeRoot` — maps to acceptance criterion [forge-config.ts exports]
- [ ] O2 — `forge.agents.generate` command registered and producing marker-carrying `AGENTS.md` — maps to acceptance criterion [forge.agents.generate registered]
- [ ] O3 — `forge.init` reworked to create `forge.yaml`, use `resolveForgeRoot`, never overwrite existing files — maps to acceptance criterion [forge.init config-driven]
- [ ] O4 — `forge.doctor` fails on `@gogol/*` imports in `packages/forge` source — maps to acceptance criterion [forge.doctor autonomy guard]
- [ ] O5 — `forge.yaml` exists at WGogol root and `loadForgeConfig` parses it — maps to acceptance criterion [forge.yaml at WGogol root]
- [ ] O6 — `packages/os/site-kernel/src/rfc/` deleted, 6 import sites redirected, `rfc.list`/`rfc.validate` still work — maps to acceptance criterion [src/rfc/ deleted]
- [ ] O7 — Unit tests for config load (valid/invalid/missing) and doctor guard — maps to acceptance criterion [unit tests]
- [ ] O8 — Root `AGENTS.md` documents `forge.yaml` and regeneration rule — maps to acceptance criterion [AGENTS.md docs]

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/forge/src/config/forge-config.ts` — **NEW**: zod schema, `ForgeConfig` interface, `loadForgeConfig`, `resolveForgeRoot`
- `packages/forge/src/onboarding/init.ts` — reworked: config-driven, uses `resolveForgeRoot`, creates `forge.yaml`
- `packages/forge/src/onboarding/doctor.ts` — extended: `@gogol/*` import guard, `forbiddenImports` array
- `packages/forge/src/onboarding/agents-generate.ts` — **NEW**: `forge.agents.generate` handler
- `packages/forge/os/core/core.module.ts` — register `forge.agents.generate` command
- `packages/forge/src/index.ts` — export new config module + agents-generate handler
- `packages/forge/package.json` — add export for `./config` if needed
- `packages/os/site-kernel/src/rfc/` — **DELETED** (entire tree)
- `packages/os/site-kernel/src/adr/handlers/validate.ts` — redirect 2 imports from `../../rfc/` to `@wgogol/forge/os/rfc`
- `packages/os/site-kernel/src/cache/rfc-cache.ts` — redirect 1 import from `../rfc/` to `@wgogol/forge/os/rfc`
- `packages/os/site-kernel/src/tests/rfc-acceptance.test.ts` — redirect 2 imports from `../rfc/` to `@wgogol/forge/os/rfc`
- `packages/os/site-kernel/src/tests/rfc-create.test.ts` — redirect 2 imports from `../rfc/` to `@wgogol/forge/os/rfc`
- `packages/os/site-kernel/src/tests/rfc-validate.test.ts` — redirect 1 import from `../rfc/` to `@wgogol/forge/os/rfc`

### 2.2 Configuration and data

- `forge.yaml` — **NEW** at WGogol repository root: project config with schema `forge/config@1`

### 2.3 Documentation and specs

- `AGENTS.md` (root) — add `forge.yaml` documentation and regeneration rule
- `packages/forge/AGENTS.md` — update skill count, add `forge.agents.generate` to command table

### 2.4 Validation and pipelines

- No pipeline changes — all commands are on-demand (not in `build.check`)
- `pnpm --filter @wgogol/forge run build:check` — scoped typecheck for forge package
- `pnpm --filter @gogol/site-kernel run build:check` — scoped typecheck for site-kernel after deletion
- `pnpm --filter @wgogol/forge run test` — vitest unit tests
- `pnpm exec site-kernel run rfc.validate --json` — verify no new violations
- `pnpm exec site-kernel run rfc.list --json` — verify RFC commands still register from forge

## 3. Step sequence

### Step 1. Create forge config module

**Goal:** Add `packages/forge/src/config/forge-config.ts` with zod schema, `ForgeConfig` interface, `loadForgeConfig`, and `resolveForgeRoot`.

**Agent actions:**

- Create `packages/forge/src/config/` directory
- Write `forge-config.ts` with:
  - `ForgeConfig` interface (schema, project{name,stack,packageManager}, paths{rfcsDir,adrsDir,plansDir,auditsDir,specsDir,skillsDir}, bindings? passthrough)
  - Zod schema `forgeConfigSchema` matching the interface
  - `loadForgeConfig(workspaceRoot: string): ForgeConfig` — reads `forge.yaml`, parses with zod, throws with fix hint if missing/invalid
  - `resolveForgeRoot(workspaceRoot: string): string` — checks `packages/forge` (monorepo) then `node_modules/@wgogol/forge` (npm-installed)
- Add Compass MODULE_CONTRACT and CHANGE_SUMMARY scaffolding
- Export from `packages/forge/src/index.ts`

**Validation:**

- `pnpm --filter @wgogol/forge run build:check` passes

**Completion criterion:** `forge-config.ts` exists, exports `ForgeConfig`, zod schema, `loadForgeConfig`, `resolveForgeRoot`; typecheck passes.

**Human review:** no

---

### Step 2. Rework `forge.init` to be config-driven

**Goal:** `forge.init` creates `forge.yaml`, uses `resolveForgeRoot` for skill source resolution, and creates `docs/plans/` + `docs/audits/` directories.

**Agent actions:**

- Edit `packages/forge/src/onboarding/init.ts`:
  - Import `loadForgeConfig`, `resolveForgeRoot` from `../config/forge-config.ts`
  - Add `forge.yaml` creation (idempotent — skip if exists) with default config
  - Replace `path.join(workspaceRoot, "packages", "forge")` with `resolveForgeRoot(workspaceRoot)`
  - Add `docs/plans/` and `docs/audits/` directory creation (in addition to existing `docs/rfcs/` and `docs/adrs/`)
  - Add `configPath: "forge.yaml"` to `InitResult`
  - Add `--aiLanguage` and `--documentationLanguage` flags to command registration in `core.module.ts`
- Update `InitResult` interface with `configPath` field

**Validation:**

- `pnpm --filter @wgogol/forge run build:check` passes

**Completion criterion:** `forge.init` creates `forge.yaml` when absent, uses `resolveForgeRoot`, creates all 4 docs directories; typecheck passes.

**Human review:** no

---

### Step 3. Implement `forge.agents.generate`

**Goal:** New command that regenerates `AGENTS.md` deterministically from `forge.yaml` + skill registry.

**Agent actions:**

- Create `packages/forge/src/onboarding/agents-generate.ts`:
  - Load `forge.yaml` via `loadForgeConfig`
  - Read `FORGE_SKILLS` registry
  - Generate `AGENTS.md` content with:
    - Standard generated-file marker (from `GENERATED_MARKER`)
    - Project name from config
    - Skills table (name, category, invocation, concerns)
    - Commands table (from registry)
    - Paths section (from config)
  - Edit guard: if `AGENTS.md` exists without generated marker → exit 1, refuse to overwrite
  - If `AGENTS.md` exists WITH generated marker → overwrite
  - If `AGENTS.md` does not exist → create
- Register `forge.agents.generate` in `packages/forge/os/core/core.module.ts`
- Export from `packages/forge/src/index.ts`

**Validation:**

- `pnpm --filter @wgogol/forge run build:check` passes
- `forge.agents.generate` is registered (verify via `forge.skill.list` or kernel command list)

**Completion criterion:** `forge.agents.generate` registered in `forgeCoreModule`, produces marker-carrying `AGENTS.md`, edit guard refuses unmarked files.

**Human review:** no

---

### Step 4. Extend `forge.doctor` with autonomy guard

**Goal:** `forge.doctor` fails on real `@gogol/*` import specifiers inside `packages/forge` source.

**Agent actions:**

- Edit `packages/forge/src/onboarding/doctor.ts`:
  - Add `forbiddenImports` check: scan `packages/forge/src/**/*.ts` and `packages/forge/os/**/*.ts` for `import ... from "@gogol/..."` or `require("@gogol/...")` statements
  - Exclude comment-only mentions (parse import/require specifiers, not raw text)
  - Add `forbiddenImports: Array<{file, specifier}>` to output
  - If any violations found → exit 1
- The check must pass on the current tree (all `@gogol/` mentions are in MODULE_CONTRACT comments, not actual imports)

**Validation:**

- `pnpm --filter @wgogol/forge run build:check` passes
- `forge.doctor --json` passes on current tree (0 forbiddenImports)

**Completion criterion:** `forge.doctor` reports `forbiddenImports` array, exits 1 on violations, passes on current tree.

**Human review:** no

---

### Step 5. Create WGogol `forge.yaml`

**Goal:** Dogfood `forge.yaml` at the WGogol repository root.

**Agent actions:**

- Create `forge.yaml` at repository root with:
  ```yaml
  schema: forge/config@1
  project:
    name: webgogol
    stack: [typescript, astro, turborepo]
    packageManager: pnpm
  paths:
    rfcsDir: docs/rfcs
    adrsDir: docs/adrs
    plansDir: docs/plans
    auditsDir: docs/audits
    specsDir: docs/specs
    skillsDir: .agents/skills
  ```
- Verify `loadForgeConfig` parses it (can be done via a quick test or by running `forge.doctor`)

**Validation:**

- `forge.doctor --json` reports `forge.yaml: pass`
- `loadForgeConfig` parses without error

**Completion criterion:** `forge.yaml` exists at WGogol root, validates against schema, `forge.doctor` reports pass.

**Human review:** no

---

### Step 6. Delete `packages/os/site-kernel/src/rfc/` and redirect imports

**Goal:** Forward-only cleanup — remove duplicated RFC tree, redirect 6 import sites to `@wgogol/forge/os/rfc`.

**Agent actions:**

- Redirect imports in `packages/os/site-kernel/src/adr/handlers/validate.ts`:
  - `from "../../rfc/frontmatter-io.ts"` → `from "@wgogol/forge/os/rfc"`
  - `from "../../rfc/types.ts"` → `from "@wgogol/forge/os/rfc"`
- Redirect import in `packages/os/site-kernel/src/cache/rfc-cache.ts`:
  - `from "../rfc/frontmatter-io.ts"` → `from "@wgogol/forge/os/rfc"`
- Redirect imports in `packages/os/site-kernel/src/tests/rfc-acceptance.test.ts`:
  - `from "../rfc/acceptance.ts"` → `from "@wgogol/forge/os/rfc"`
  - `from "../rfc/types.ts"` → `from "@wgogol/forge/os/rfc"`
- Redirect imports in `packages/os/site-kernel/src/tests/rfc-create.test.ts`:
  - `from "../rfc/handlers.ts"` → `from "@wgogol/forge/os/rfc"`
  - `from "../rfc/types.ts"` → `from "@wgogol/forge/os/rfc"`
- Redirect import in `packages/os/site-kernel/src/tests/rfc-validate.test.ts`:
  - `from "../rfc/handlers.ts"` → `from "@wgogol/forge/os/rfc"`
- Delete entire `packages/os/site-kernel/src/rfc/` directory
- Verify `@wgogol/forge/os/rfc` index.ts exports all needed symbols (already confirmed: `listRfcFiles`, `parseRfcFile`, `readAndParseRfc`, `RFC_DIR`, `RFC_TEMPLATE_FILE`, `runRfcCreate`, `runRfcValidate`, `runProbe`, `validateAcceptanceShape`, `AcceptanceProbe`)

**Validation:**

- `pnpm --filter @gogol/site-kernel run build:check` passes
- `pnpm exec site-kernel run rfc.list --json` returns full command set
- `pnpm exec site-kernel run rfc.validate --json` still works

**Completion criterion:** `packages/os/site-kernel/src/rfc/` deleted, all 6 import sites redirected, `rfc.list` and `rfc.validate` still register from forge.

**Human review:** no

---

### Step 7. Write unit tests

**Goal:** Vitest unit tests for config load and doctor guard.

**Agent actions:**

- Create `packages/forge/src/tests/forge-config.test.ts`:
  - Test: valid `forge.yaml` parses correctly
  - Test: missing `forge.yaml` throws with fix hint
  - Test: invalid `forge.yaml` (schema violation) throws with zod issue list
  - Test: `resolveForgeRoot` finds `packages/forge` in monorepo layout
  - Test: `resolveForgeRoot` finds `node_modules/@wgogol/forge` in npm layout
- Create `packages/forge/src/tests/doctor-autonomy.test.ts`:
  - Test: doctor passes on current tree (0 forbiddenImports)
  - Test: doctor detects `@gogol/*` import specifiers (fixture with violation)
  - Test: doctor ignores `@gogol/*` in comments (fixture with comment-only mention)

**Validation:**

- `pnpm --filter @wgogol/forge run test` passes

**Completion criterion:** All test cases pass; config load and doctor guard covered.

**Human review:** no

---

### Step 8. Update documentation

**Goal:** Root `AGENTS.md` and `packages/forge/AGENTS.md` document `forge.yaml` and `forge.agents.generate`.

**Agent actions:**

- Edit root `AGENTS.md`: add a section documenting:
  - `forge.yaml` as the forge project config file
  - `forge.agents.generate` regeneration rule (generated marker, edit guard)
  - The MUST NOT rule: do not run `forge.agents.generate` against this monorepo's hand-written `AGENTS.md`
- Edit `packages/forge/AGENTS.md`:
  - Add `forge.agents.generate` to the command table
  - Update skill count if needed
  - Add `config/` to the architecture description

**Validation:**

- `pnpm exec site-kernel run rfc.validate --json` — no new violations

**Completion criterion:** Both AGENTS.md files updated with `forge.yaml` and `forge.agents.generate` documentation.

**Human review:** no

---

### Step 9. Final validation

**Goal:** Run the full validation suite to confirm all acceptance criteria.

**Agent actions:**

- Run `pnpm --filter @wgogol/forge run build:check`
- Run `pnpm --filter @wgogol/forge run test`
- Run `pnpm --filter @gogol/site-kernel run build:check`
- Run `pnpm exec site-kernel run rfc.validate --json` — verify no violations targeting RFC-0391
- Run `pnpm exec site-kernel run rfc.list --json` — verify RFC commands still register
- Run `forge.doctor --json` — verify `forbiddenImports: []` and `forge.yaml: pass`

**Validation:**

- All commands pass

**Completion criterion:** All validation commands pass; acceptance criteria checkboxes can be checked.

**Human review:** no

---

### Step 10. Stamp implemented and commit

**Goal:** Transition RFC-0391 to `implemented` status.

**Agent actions:**

- Set `status: implemented` and `implementedAt: 2026-07-19` in RFC frontmatter
- Commit with message referencing RFC-0391

**Validation:**

- `rfc.validate` passes on the updated RFC file

**Completion criterion:** RFC-0391 has `status: implemented`.

**Human review:** no

## 4. Validation suite

### 4.1 Required checks

- `pnpm --filter @wgogol/forge run build:check` — scoped typecheck for forge
- `pnpm --filter @gogol/site-kernel run build:check` — scoped typecheck for site-kernel after deletion
- `pnpm --filter @wgogol/forge run test` — vitest unit tests
- `pnpm exec site-kernel run rfc.validate --json` — no violations targeting RFC-0391
- `pnpm exec site-kernel run rfc.list --json` — RFC commands still register from forge

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0391` in the subject line (RFC-0265 commit hygiene)
- No acceptance probes declared — `rfc.verification.emit` not required

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Agent misinterpretation: regenerate AGENTS.md in this monorepo | Step 3: edit guard refuses unmarked files; Step 8: MUST NOT documented in AGENTS.md |
| Schema churn: forge.yaml@1 too narrow | Step 1: `bindings?` passthrough + `schema:` version field |
| Doctor false positives: @gogol/* in comments | Step 4: parse import/require specifiers only, not raw text; Step 7: test fixture with comment-only mention |
| Deletion blast radius: 6 import sites | Step 6: all 6 sites identified and redirected in one commit |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-1 or DNA-2, run `pnpm exec site-kernel run rfc.supersede.propose --id RFC-0391 --reason "..." --invariant "DNA-N"` instead of working around it.
- If `@wgogol/forge/os/rfc` does not export a symbol needed by a site-kernel importer, add the export to `packages/forge/os/rfc/index.ts` — do not re-create the file in site-kernel.
