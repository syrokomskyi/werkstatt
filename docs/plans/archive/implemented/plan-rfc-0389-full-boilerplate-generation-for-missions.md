---
rfcId: RFC-0389
planId: PLAN-RFC-0389-01
status: draft
owner: architecture
createdAt: 2026-07-15
updatedAt:
scope:
  apps:
    - warpgogol-com
  packages:
    - "@gogol/site-kernel-handoff"
    - "@gogol/site-kernel-codegen"
    - "@gogol/site-kernel-onboarding"
    - "@gogol/site-kernel-astro"
  services: []
  docs:
    - docs/rfcs/rfc-0389-full-boilerplate-generation-for-missions.md
---

# Implementation Plan: RFC-0389

## 1. Objectives

- [ ] O1 — Export template helpers from `@gogol/site-kernel-onboarding` (maps to AC: template access)
- [ ] O2 — Add workspace dependencies to `@gogol/site-kernel-handoff` (maps to AC: dependency changes)
- [ ] O3 — Replace inline stub generation in `mission-materialize.ts` with full template writes + codegen generator sequence (maps to AC: package.json, astro.config.mjs, wrangler/tsconfig/gitignore/postcss/deploy, kernel.wire, codegen generators)
- [ ] O4 — Update materialization report to list all generated files (maps to AC: materialization report)
- [ ] O5 — Validate with `build:check` and `rfc.validate` (maps to AC: rfc.validate passes)

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/os/site-kernel-onboarding/src/index.ts` — export `readTemplate`, `readRuntimeTemplate`, `applyTokens`
- `packages/os/site-kernel-onboarding/src/scaffold.ts` — extract `readTemplate`, `readRuntimeTemplate`, `applyTokens` into a shared module or export them directly
- `packages/os/site-kernel-handoff/package.json` — add `@gogol/site-kernel-codegen`, `@gogol/site-kernel-astro`, `@gogol/site-kernel-onboarding` to dependencies
- `packages/os/site-kernel-handoff/src/mission/mission-materialize.ts` — replace lines 180-198 (inline stubs) with template writes + `runKernelWire` + codegen generator sequence
- No new Site OS commands. No registry or pipeline changes.

### 2.2 Configuration and data

- No YAML/JSON config changes.
- No ontology catalog changes.
- No system.md or manifest changes.

### 2.3 Documentation and specs

- `docs/rfcs/rfc-0389-full-boilerplate-generation-for-missions.md` — read-only reference (already accepted).
- No `AGENTS.md` updates needed — the change is internal to package wiring, no new agent-facing rules.
- No `docs/*.xml` Compass sync needed — no repository-wide requirement or contract changes.
- No `docs/architecture-dna.md` changes — DNA-47 is satisfied, not extended.

### 2.4 Validation and pipelines

- `pnpm --filter @gogol/site-kernel-handoff run build:check` — must pass after adding imports.
- `pnpm --filter @gogol/site-kernel-onboarding run build:check` — must pass after exporting helpers.
- `pnpm exec site-kernel run rfc.validate RFC-0389 --json` — must pass.
- No pipeline changes (`build.prepare`, `build.check` unchanged).

## 3. Step sequence

### Step 1. Export template helpers from onboarding

**Goal:** Make `readTemplate`, `readRuntimeTemplate`, and `applyTokens` importable from `@gogol/site-kernel-onboarding`.

**Agent actions:**

- Extract `readTemplate`, `readRuntimeTemplate`, `applyTokens` from `scaffold.ts` into a new `templates.ts` module (or export them directly from `scaffold.ts`).
- Re-export from `packages/os/site-kernel-onboarding/src/index.ts`.
- Update `scaffold.ts` to import from `templates.ts` instead of defining locally.
- Update `config-regenerate.ts` and `config-template-sync.ts` to import from `templates.ts` instead of maintaining their own copies (unify all duplicates).

**Validation:**

- `pnpm --filter @gogol/site-kernel-onboarding run build:check` passes.

**Completion criterion:** `import { readTemplate, readRuntimeTemplate, applyTokens } from "@gogol/site-kernel-onboarding"` compiles successfully. No duplicate `readTemplate`/`applyTokens` definitions remain in `scaffold.ts`, `config-regenerate.ts`, or `config-template-sync.ts`.

**Human review:** no

---

### Step 2. Add workspace dependencies to handoff package

**Goal:** `@gogol/site-kernel-handoff` can import from `@gogol/site-kernel-codegen`, `@gogol/site-kernel-astro`, and `@gogol/site-kernel-onboarding`.

**Agent actions:**

- Add `"@gogol/site-kernel-codegen": "workspace:*"` to `packages/os/site-kernel-handoff/package.json` dependencies.
- Add `"@gogol/site-kernel-astro": "workspace:*"` to dependencies.
- Add `"@gogol/site-kernel-onboarding": "workspace:*"` to dependencies.
- Run `pnpm install` to update the lockfile.

**Validation:**

- `pnpm --filter @gogol/site-kernel-handoff run build:check` passes (no new import errors).

**Completion criterion:** All three packages are listed in `@gogol/site-kernel-handoff` dependencies and `pnpm install` succeeds.

**Human review:** no

---

### Step 3. Replace inline stubs with full boilerplate generation

**Goal:** `mission.materialize` writes full template files and runs codegen generators instead of inline stubs.

**Agent actions:**

- Add imports to `mission-materialize.ts`:
  - `import { runKernelWire, discoverSiteWorkspaces } from "@gogol/site-kernel";` (already present via existing imports)
  - `import { runGenerateRoutes, runGenerateOverlayPages, runGenerateGlobalStyles, runGenerateScriptsOrchestrator, runGeneratePublicInfrastructure, runGenerateApiRoutes, runGenerateI18nMiddleware, runGenerateAgentsDocs, runFontsImportsGenerate } from "@gogol/site-kernel-codegen";`
  - `import { readTemplate, readRuntimeTemplate, applyTokens } from "@gogol/site-kernel-onboarding";`
- Replace lines 180-198 (the inline `pkgJson` object and `astroConfig` string) with:
  1. Resolve domain from `system.md` manifest or pin file.
  2. Build token map (`CLIENT_ID`, `DOMAIN`, `SITE_LINE`).
  3. Write template files into staging directory: `package.json`, `astro.config.mjs`, `wrangler.jsonc`, `tsconfig.json`, `.gitignore`, `postcss.config.cjs`, `.github/workflows/deploy-<id>.yml`.
  4. Construct `DiscoveredSiteWorkspace` pointing at staging directory (using only `name`, `directory`, `toolsDirectory`, `packageName` — no `source` or `missionId` fields).
  5. Construct app-scoped `KernelRuntimeContext`.
  6. Call `runKernelWire(generatorInput, appContext)`.
  7. Call the 9 codegen generators in sequence (same order as `onboarding.scaffold`).
- Update the `regeneration.regeneratedFiles` array in the materialization report to list all generated files.
- Preserve the existing staging directory cleanup, atomic rename, and lock release logic.

**Validation:**

- `pnpm --filter @gogol/site-kernel-handoff run build:check` passes.
- Manual review: the code follows the `onboarding.scaffold` pattern exactly.

**Completion criterion:** `mission-materialize.ts` no longer contains inline `pkgJson` or `astroConfig` stub objects. Template writes and codegen calls are in place.

**Human review:** no

---

### Step 4. Update materialization report

**Goal:** The `regeneration.regeneratedFiles` array in the report includes all generated boilerplate files.

**Agent actions:**

- Replace `regeneratedFiles: ["package.json", "astro.config.mjs"]` with a dynamically collected list.
- Collect template-written files (7 files: package.json, astro.config.mjs, wrangler.jsonc, tsconfig.json, .gitignore, postcss.config.cjs, deploy.yml).
- Collect generated files from each codegen generator's `GeneratedResult.generated` array.
- Collect `kernel.wire` output files from its result.
- Concatenate all three lists into the final `regeneratedFiles` array.

**Validation:**

- Code review: the report lists all files written by templates and generators.

**Completion criterion:** The materialization report `regeneratedFiles` array contains 30+ entries (7 template files + tools/ wiring + generated routes/styles/scripts/public infrastructure).

**Human review:** no

---

### Step 5. Validate and stamp implemented

**Goal:** All checks pass and the RFC is stamped `implemented`.

**Agent actions:**

- Run `pnpm exec site-kernel run rfc.validate RFC-0389 --json` — must pass.
- Run `pnpm --filter @gogol/site-kernel-handoff run build:check` — must pass.
- Run `pnpm --filter @gogol/site-kernel-onboarding run build:check` — must pass.
- Check all acceptance criteria in the RFC.
- Stamp `status: implemented`, `implementedAt: 2026-07-15` in the RFC frontmatter.
- Commit with RFC-0389 reference.

**Validation:**

- `rfc.validate` passes.
- `build:check` passes for all touched packages.

**Completion criterion:** RFC-0389 frontmatter has `status: implemented` and all acceptance criteria are checked.

**Human review:** no

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec site-kernel run rfc.validate RFC-0389 --json`
- `pnpm --filter @gogol/site-kernel-handoff run build:check`
- `pnpm --filter @gogol/site-kernel-onboarding run build:check`

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0389` in the subject line.
- No `rfc.verification.emit` needed (no acceptance probes declared).

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Template token mismatch (missing domain) | Step 3: domain resolution falls back to commented-out `site:` line, same as `onboarding.scaffold` |
| Codegen generator assumptions (missing `system.md`) | Step 3: Sternsystem data copy (step 5 of materialization pipeline) runs before boilerplate generation; generators read `src/content/system.md` from the staging directory |
| Workspace resolution for staging directory | Step 3: synthetic `DiscoveredSiteWorkspace` with only existing interface fields; `resolveWirePaths` uses `context.site.directory` directly when `context.site` is set |
| Performance (9 generators + kernel.wire) | Step 3: generators are fast (1-7 files each, <1s); total ~3-8s added to materialization |
| Agent misinterpretation (pnpm install in workpiece) | Already documented in RFC-0356 §1.2; no additional mitigation needed |

## 6. Escalation triggers

- If implementation reveals that `resolveWirePaths` or any codegen generator calls `discoverSiteWorkspaces` internally (ignoring `context.site`), run `pnpm exec site-kernel run rfc.supersede.propose --id RFC-0389 --reason "..." --invariant "DNA-47"` instead of working around it.
- If the `DiscoveredSiteWorkspace` interface needs new fields to support mission-scoped contexts, create a separate RFC for the interface extension rather than modifying it inline.
