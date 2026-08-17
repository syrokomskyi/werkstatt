---
rfcId: RFC-0868
planId: PLAN-RFC-0868-01
status: implemented
owner: architecture
createdAt: 2026-08-17
updatedAt:
scope:
  apps: []
  packages:
    - packages/werkstatt
    - packages/werkstatt-shared
    - packages/werkstatt-site
    - packages/werkstatt-game
    - packages/werkstatt-godot
    - packages/werkstatt-video
  services: []
  docs:
    - docs/technology.xml
    - docs/development-plan.xml
    - packages/AGENTS.md
    - packages/werkstatt/AGENTS.md
    - packages/werkstatt-shared/AGENTS.md
    - packages/werkstatt-site/AGENTS.md
    - forge.yaml
    - .github/workflows/publish.yml
---

# Implementation Plan: RFC-0868

## 1. Objectives

- [x] O1 — Create `@warpgogol/werkstatt-shared` package with shared domains extracted from `werkstatt-site` (maps to acceptance: package exists, domains moved, exports mirrored)
- [x] O2 — Remove engine→site coupling: update all `@warpgogol/werkstatt-site/*` imports in engine to `@warpgogol/werkstatt-shared/*`, remove autonomy exemptions (maps to acceptance: no site imports in engine, EXEMPT_PREFIXES clean, autonomy.validate passes)
- [x] O3 — Make axiom dependencies optional with dynamic import guard (maps to acceptance: axiom in optionalDependencies, leitstand guards value import)
- [x] O4 — Add build steps and publish config to all six packages (maps to acceptance: tsconfig.build.json, dual exports, private: false, publishConfig)
- [x] O5 — Register `werkstatt.shared.validate` command in engine (maps to acceptance: command registered and passing, output format matches)
- [x] O6 — Update `workshop.scaffold` templates for external NPM consumption (maps to acceptance: scaffold --verify passes)
- [x] O7 — Sync documentation: AGENTS.md, Compass XML, forge.yaml (maps to acceptance: AGENTS.md updated, technology.xml updated)

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/werkstatt-shared/` — new package: `package.json`, `tsconfig.json`, `tsconfig.build.json`, `AGENTS.md`, `src/` (moved domains)
- `packages/werkstatt/src/**` — 97+ files: update `@warpgogol/werkstatt-site/*` → `@warpgogol/werkstatt-shared/*` imports
- `packages/werkstatt/src/plugin/autonomy-validate.ts` — remove 7 `@warpgogol/werkstatt-site/*` exemptions from `EXEMPT_PREFIXES`
- `packages/werkstatt/os/werkstatt-shared-validate.module.ts` — new engine module registering `werkstatt.shared.validate`
- `packages/werkstatt/src/leitstand/leitstand-commands.ts` — guard axiom value import with dynamic import + try/catch
- `packages/werkstatt/src/workshop/templates.ts` — update `STACK_PLUGIN_MAP` and scaffold templates
- `packages/werkstatt-site/src/**` — 554+ files: update internal relative imports to `@warpgogol/werkstatt-shared/*` for moved domains
- `packages/werkstatt-site/package.json` — add `werkstatt-shared` dep, add build step, set `private: false`
- `packages/werkstatt/package.json` — remove `werkstatt-site` dep, add `werkstatt-shared` dep, move axiom to optional, add build step
- `packages/werkstatt-game/package.json` — add build step, set `private: false`, add `publishConfig`
- `packages/werkstatt-godot/package.json` — add build step, set `private: false`, add `publishConfig`
- `packages/werkstatt-video/package.json` — add build step, set `private: false`, add `publishConfig`
- `tools/kernel.config.ts` — add `werkstatt-shared-validate` module loader

### 2.2 Configuration and data

- `forge.yaml` — add 6 packages to `independentVersionPackages`
- `.github/workflows/publish.yml` — new CI workflow for NPM publish on tag

### 2.3 Documentation and specs

- `packages/AGENTS.md` — add `werkstatt-shared` package entry to ownership table
- `packages/werkstatt/AGENTS.md` — update autonomy guard exemptions list (remove werkstatt-site entries)
- `packages/werkstatt-shared/AGENTS.md` — new package agent guide
- `packages/werkstatt-site/AGENTS.md` — update to reflect moved domains
- `docs/technology.xml` — add werkstatt-shared package entry, update package boundary descriptions
- `docs/development-plan.xml` — add rollout phases for extraction and publication

### 2.4 Validation and pipelines

- `werkstatt.autonomy.validate` — must pass with zero violations after exemption removal
- `werkstatt.shared.validate` — new command, must pass
- `pnpm build:check` — must pass for all packages
- `pnpm test` — must pass for all packages
- `workshop.scaffold --name test-godot --stack godot-csharp --dest /tmp/test --verify` — must pass

## 3. Step sequence

### Step 1. Create `werkstatt-shared` package skeleton

**Goal:** Create the new package directory with manifest, tsconfig, and AGENTS.md.

**Agent actions:**

- Create `packages/werkstatt-shared/package.json` with:
  - `name: "@warpgogol/werkstatt-shared"`, `version: "0.1.0"`, `private: true` (will be set to `false` in Step 5)
  - `type: "module"`, `main: "./src/index.ts"`, `types: "./src/index.ts"`
  - `exports` field mirroring all existing `werkstatt-site` subpath exports for moved domains (share/\*, ontology/\*, passport/\*, integration/\*, integration-adapter-supabase-crm/\*, observability/\*, surface/\*, checks/\*)
  - `dependencies`: `@warpgogol/forge: "workspace:*"` (if needed), zod, and other shared deps
  - `scripts`: `build`, `build:check`, `test`, `test:watch` matching existing package conventions
- Create `packages/werkstatt-shared/tsconfig.json` extending `tsconfig/base.json`
- Create `packages/werkstatt-shared/AGENTS.md` with package description and entry points
- Create `packages/werkstatt-shared/src/index.ts` barrel exporting from moved domains

**Validation:**

- `pnpm install --no-frozen-lockfile` succeeds with new package
- `packages/werkstatt-shared/` directory exists with all required files

**Completion criterion:** `packages/werkstatt-shared/package.json` exists and `pnpm install` succeeds.

**Human review:** no

---

### Step 2. Move shared domains from `werkstatt-site` to `werkstatt-shared`

**Goal:** Physically move 8 shared domain directories from `werkstatt-site/src/domain/` to `werkstatt-shared/src/`.

**Agent actions:**

- Move `packages/werkstatt-site/src/domain/{ontology,share,passport,integration,integration-adapter-supabase-crm,observability,surface,checks}` → `packages/werkstatt-shared/src/`
- Note: `checks/` in werkstatt-site is at `src/checks/` (not `src/domain/checks/`). Move `src/checks/` shared infrastructure files (diagnostics-result, conventions, pipelines, suppressions-config, lib/i18n, lib/astro-site-url) to `werkstatt-shared/src/checks/`. Keep site-specific validators in `werkstatt-site/src/checks/`.
- Verify moved files retain their internal relative imports (now within `werkstatt-shared`)
- Do NOT update cross-package imports yet — that is Step 3

**Validation:**

- `ls packages/werkstatt-shared/src/` shows all 8 moved domains
- `ls packages/werkstatt-site/src/domain/` no longer shows moved domains

**Completion criterion:** All 8 shared domain directories exist in `werkstatt-shared/src/` and are absent from `werkstatt-site/src/domain/`.

**Human review:** no

---

### Step 3. Update all imports across the monorepo

**Goal:** Replace all `@warpgogol/werkstatt-site/*` imports for moved domains with `@warpgogol/werkstatt-shared/*` across the entire monorepo.

**Agent actions:**

- Use a codemod (sed/awk script) to replace `@warpgogol/werkstatt-site/(ontology|share|passport|integration|integration-adapter-supabase-crm|observability|surface|checks)` → `@warpgogol/werkstatt-shared/$1` in all `*.ts` files across:
  - `packages/werkstatt/src/**` (97+ files, 173+ matches)
  - `packages/werkstatt-site/src/**` (554+ files, 1305+ matches)
  - `services/*/src/**` (if any imports exist)
- Update `werkstatt-site` internal relative imports that pointed to moved domains: replace relative paths (`../domain/share/`, `../../ontology/`) with `@warpgogol/werkstatt-shared/*` package-level imports
- Update `packages/werkstatt/package.json`: remove `@warpgogol/werkstatt-site` from dependencies, add `@warpgogol/werkstatt-shared: "workspace:*"`
- Update `packages/werkstatt-site/package.json`: add `@warpgogol/werkstatt-shared: "workspace:*"` to dependencies
- Add subpath exports to `werkstatt-shared/package.json` for any missing subpaths discovered during import update (if the codemod finds imports to subpaths not yet in exports)

**Validation:**

- `pnpm install --no-frozen-lockfile` succeeds
- `pnpm --filter @warpgogol/werkstatt run build:check` passes
- `pnpm --filter @warpgogol/werkstatt-site run build:check` passes

**Completion criterion:** All `@warpgogol/werkstatt-site/*` imports for moved domains are replaced; both engine and site packages typecheck.

**Human review:** no

---

### Step 4. Remove autonomy exemptions and register `werkstatt.shared.validate`

**Goal:** Clean the autonomy guard exemption list and add the new shared-boundary validation command.

**Agent actions:**

- Edit `packages/werkstatt/src/plugin/autonomy-validate.ts`:
  - Remove 7 `@warpgogol/werkstatt-site/*` entries from `EXEMPT_PREFIXES` (ontology, share, passport, observability, integration, integration-adapter-supabase-crm, surface)
  - Keep `@warpgogol/werkstatt` (self-import) and `@warpgogol/forge` (governance) exemptions
  - Update the comment block to reflect the new exemption list
- Create `packages/werkstatt/os/werkstatt-shared-validate.module.ts`:
  - Register `werkstatt.shared.validate` command (scope: workspace)
  - Implement 3 checks: SHARED-01 (werkstatt-shared in package.json deps), SHARED-02 (no werkstatt-site exemptions in EXEMPT_PREFIXES), SHARED-03 (no werkstatt-site imports in engine src)
  - Output JSON shape per RFC output format section
  - `exitCode: 0` for pass, `exitCode: 1` for fail
- Edit `tools/kernel.config.ts`: add `"werkstatt-shared-validate": async () => (await import("@warpgogol/werkstatt/os/werkstatt-shared-validate-module")).werkstattSharedValidateModule`
- Add `./os/werkstatt-shared-validate-module` to `packages/werkstatt/package.json` exports

**Validation:**

- `pnpm exec werkstatt run werkstatt.autonomy.validate --json` — exit 0, zero violations
- `pnpm exec werkstatt run werkstatt.shared.validate --json` — exit 0, all 3 checks pass
- `pnpm --filter @warpgogol/werkstatt run build:check` passes

**Completion criterion:** `werkstatt.autonomy.validate` passes with zero violations; `werkstatt.shared.validate` registered and passing with correct JSON output.

**Human review:** no

---

### Step 5. Make axiom dependencies optional

**Goal:** Move axiom packages to optionalDependencies and guard the value import with dynamic import.

**Agent actions:**

- Edit `packages/werkstatt/package.json`:
  - Move `@syrokomskyi/axiom-factory-app` and `@syrokomskyi/axiom-study` from `dependencies` to `optionalDependencies`
- Edit `packages/werkstatt/src/leitstand/leitstand-commands.ts`:
  - Keep `import type { Finding } from "@syrokomskyi/axiom-study"` as type-only (erased at compile time)
  - Replace `import { isBlockingFinding } from "@syrokomskyi/axiom-factory-app/run/report"` with dynamic import:
    ```ts
    let isBlockingFinding: (f: Finding) => boolean = () => true;
    try {
      const mod = await import("@syrokomskyi/axiom-factory-app/run/report");
      isBlockingFinding = mod.isBlockingFinding;
    } catch {
      // axiom not installed — fail-closed
    }
    ```
  - Ensure the dynamic import is called at module initialization or before first use of `isBlockingFinding`
- Verify all other axiom usages in the engine are type-only or similarly guarded

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run build:check` passes
- `pnpm install --omit=optional && pnpm --filter @warpgogol/werkstatt run build:check` passes (axiom not installed)
- `pnpm --filter @warpgogol/werkstatt run test` passes

**Completion criterion:** Axiom packages in `optionalDependencies`; `build:check` passes with and without axiom installed; tests pass.

**Human review:** no

---

### Step 6. Add build steps and publish config to all packages

**Goal:** Add `tsconfig.build.json`, dual `exports`, `publishConfig`, and `private: false` to all six packages.

**Agent actions:**

- For each of `werkstatt`, `werkstatt-shared`, `werkstatt-site`, `werkstatt-game`, `werkstatt-godot`, `werkstatt-video`:
  - Create `tsconfig.build.json` with `"outDir": "dist"`, `"declaration": true`, `"declarationMap": true`, extending `tsconfig.json`
  - Add `build:dist` script: `tsc -p tsconfig.build.json`
  - Update `exports` to dual: `{ "types": "./dist/X.d.ts", "default": "./dist/X.js" }` for production, keep source for dev (via `publishConfig` override or conditional exports)
  - Add `files: ["src", "dist", "bin", "os"]` (adjust per package)
  - Add `publishConfig: { "registry": "https://registry.npmjs.org/", "access": "public" }`
  - Set `"private": false`
- Edit `forge.yaml`: add all 6 packages to `independentVersionPackages`

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run build:dist` produces `dist/` with `.js` and `.d.ts` files
- `pnpm --filter @warpgogol/werkstatt-shared run build:dist` produces `dist/`
- `pnpm publish --dry-run --filter @warpgogol/werkstatt-shared` shows correct tarball contents (src + dist + bin + os)
- `pnpm build:check` still passes (source-only typecheck)

**Completion criterion:** All 6 packages have `tsconfig.build.json`, dual exports, `private: false`, `publishConfig`; `build:dist` produces dist; dry-run publish shows correct contents.

**Human review:** no

---

### Step 7. Create NPM publish CI workflow

**Goal:** Create `.github/workflows/publish.yml` for automated NPM publishing on tag.

**Agent actions:**

- Create `.github/workflows/publish.yml`:
  - Trigger: on tag `v*`
  - Steps: checkout, setup-node, setup-pnpm, `pnpm install --frozen-lockfile`, `pnpm build:dist` for all 6 packages, `pnpm publish --filter @warpgogol/werkstatt --filter @warpgogol/werkstatt-shared --filter @warpgogol/werkstatt-site --filter @warpgogol/werkstatt-game --filter @warpgogol/werkstatt-godot --filter @warpgogol/werkstatt-video --no-git-checks`
  - Use `NPM_TOKEN` secret for authentication
  - Publication order: `werkstatt-shared` → `werkstatt` → `werkstatt-site` → `werkstatt-game`/`werkstatt-godot`/`werkstatt-video`

**Validation:**

- YAML lint passes
- Workflow file exists at `.github/workflows/publish.yml`

**Completion criterion:** `.github/workflows/publish.yml` exists with correct trigger and publish steps.

**Human review:** no

---

### Step 8. Update `workshop.scaffold` templates

**Goal:** Update scaffold templates to work with published NPM packages.

**Agent actions:**

- Edit `packages/werkstatt/src/workshop/templates.ts`:
  - Add `@warpgogol/werkstatt-shared` to the dependency list for all stack profiles in the `package.json` template
  - Update `.npmrc` template: remove `YOUR_NPM_TOKEN` placeholder (packages are public)
  - No new module loader needed for `werkstatt-shared` in `kernel.config.ts` template
- Run `workshop.scaffold --name test-godot --stack godot-csharp --dest /tmp/test-workshop --verify`:
  - Verify scaffold creates correct files
  - Verify `pnpm install` succeeds (using workspace deps in monorepo, or NPM if testing externally)

**Validation:**

- `workshop.scaffold --name test-godot --stack godot-csharp --dest /tmp/test-workshop --verify` exits 0
- Scaffolded workshop has `@warpgogol/werkstatt-shared` in dependencies

**Completion criterion:** `workshop.scaffold --verify` passes for godot-csharp stack.

**Human review:** no

---

### Step 9. Update documentation and AGENTS.md files

**Goal:** Sync all documentation artifacts with the new package structure.

**Agent actions:**

- Edit `packages/AGENTS.md`: add `werkstatt-shared` entry to the ownership table:
  ```
  | `werkstatt-shared` | Shared infrastructure extracted from werkstatt-site (RFC-0868). Stack-agnostic schemas, utilities, and contracts: ontology, share, passport, integration, observability, surface, checks infrastructure. No kernel module — pure library package. |
  ```
- Edit `packages/werkstatt/AGENTS.md`: update autonomy guard exemptions list to remove werkstatt-site entries, add `werkstatt-shared` to exempt prefixes (self-import via `@warpgogol/werkstatt` prefix already covers it)
- Edit `packages/werkstatt-site/AGENTS.md`: update module layout to reflect moved domains, note that shared domains are now in `werkstatt-shared`
- Edit `docs/technology.xml`: add `werkstatt-shared` package entry, update package boundary descriptions for `werkstatt` and `werkstatt-site`
- Edit `docs/development-plan.xml`: add rollout phases for extraction and publication
- Run `pnpm exec werkstatt run ecosystem.manifest.generate` if command surfaces changed

**Validation:**

- `git diff` shows updates to all scope.docs files
- Every file in `scope.docs` is either updated or documented as not-applicable

**Completion criterion:** All documentation artifacts in scope are updated with `werkstatt-shared` package information.

**Human review:** no

---

### Step 10. Full validation suite

**Goal:** Run all validation checks to verify the implementation is complete and correct.

**Agent actions:**

- Run `pnpm exec werkstatt run rfc.validate --id RFC-0868 --json` — must pass
- Run `pnpm exec werkstatt run werkstatt.autonomy.validate --json` — must pass, zero violations
- Run `pnpm exec werkstatt run werkstatt.shared.validate --json` — must pass, all 3 checks pass
- Run `pnpm build:check` (all packages) — must pass
- Run `pnpm test` (all packages) — must pass
- Run `workshop.scaffold --name test-godot --stack godot-csharp --dest /tmp/test --verify` — must pass
- Verify no `@warpgogol/werkstatt-site/*` imports remain in `packages/werkstatt/src/**` non-test files (grep check)
- Verify `EXEMPT_PREFIXES` in `autonomy-validate.ts` contains zero `@warpgogol/werkstatt-site` entries

**Validation:**

- All commands exit 0
- All acceptance criteria in RFC-0868 are verifiable

**Completion criterion:** All validation checks pass; acceptance criteria are ready to be checked off.

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize all documentation artifacts, run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Verify every file listed in `scope.docs` is updated — check each path against `git diff`; if a scope doc was not modified, document why.
- Run `pnpm exec werkstatt run ecosystem.manifest.generate` if command surfaces or pipeline topology changed.
- **Run code review:** invoke `fo-review` via the `skill` tool on all session code changes (`git diff <merge-base-of-session>...HEAD`). Wait for the review report in `docs/reviews/code/`.
- **Run fix if needed:** if `fo-review` reported findings, invoke `fo-fix` via the `skill` tool. Re-run `fo-review` to confirm all findings are resolved. Maximum 3 iterations.
- **Check off acceptance criteria:** verify each criterion in the RFC against the implemented code. Mark `[x]` for verified criteria with inline `(evidence: <file:line>)` annotations. For unchecked `[ ]` criteria, document why.
- **Stamp the RFC as implemented:** run `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0868 --implementation-commit <sha>` to atomically transition `accepted → implemented`.

**Validation:**

- `git status` — no uncommitted changes from the current session.
- `pnpm exec werkstatt run rfc.validate --id RFC-0868`
- Every file in `scope.docs` is either updated or documented as not-applicable.
- Review report exists in `docs/reviews/code/` for this session.

**Completion criterion:** All documentation artifacts in scope are updated; code review passed (findings fixed if any); all acceptance criteria are checked off with inline `(evidence: ...)` annotations; RFC is stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476), which validates all preconditions atomically. Code review is automated via `fo-review`.

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate --id RFC-0868`
- `pnpm exec werkstatt run werkstatt.autonomy.validate --json`
- `pnpm exec werkstatt run werkstatt.shared.validate --json`
- `pnpm build:check` (all packages)
- `pnpm test` (all packages)
- `workshop.scaffold --name test-godot --stack godot-csharp --dest /tmp/test --verify`

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0868` in the subject line (RFC-0265 commit hygiene)
- `werkstatt.autonomy.validate` JSON output (zero violations)
- `werkstatt.shared.validate` JSON output (all checks pass)
- `workshop.scaffold --verify` exit 0 output

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Import breakage in 102+ engine files | Step 3 uses codemod, not manual edits; `build:check` after each batch |
| `werkstatt-site` internal imports to moved domains | Step 3 updates relative imports to package-level imports |
| Missing subpath exports in `werkstatt-shared` | Step 1 mirrors all existing exports; Step 3 adds missing ones discovered during codemod |
| Axiom dynamic import timing | Step 5 guards value import at module init; `build:check` with `--omit=optional` verifies |
| Scaffold template breakage | Step 8 runs `--verify` which tests `pnpm install` |
| `werkstatt-site` publication needed for external workshops | Step 6 sets `private: false` on werkstatt-site; Step 7 publishes it |
| CI publish order matters (deps) | Step 7 publishes in dependency order: shared → engine → site → game/godot/video |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-64, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0868 --reason "..." --invariant "DNA-64"` instead of working around it.
- If moved domains have hidden coupling to Astro-specific code that cannot be separated, stop and document the finding — the domain may need to stay in `werkstatt-site` and be removed from the extraction scope via an RFC amendment.
- If `pnpm publish --dry-run` reveals unexpected files in the tarball (e.g. test files, .env), fix `files` field in package.json before proceeding to actual publish.
