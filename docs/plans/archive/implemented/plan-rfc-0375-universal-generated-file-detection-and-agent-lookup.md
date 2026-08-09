---
rfcId: RFC-0375
planId: PLAN-RFC-0375-01
status: draft
owner: architecture
createdAt: 2026-07-12
updatedAt:
scope:
  apps:
    - apps/*
  packages:
    - "@gogol/site-kernel"
    - "@gogol/site-kernel-checks"
  services: []
  docs:
    - AGENTS.md
    - docs/source-markup.xml
    - docs/technology.xml
    - docs/verification-plan.xml
---

# Implementation Plan: RFC-0375

## 1. Objectives

- [ ] O1 — Extend `OwnershipEntry` with `markerPolicy` and `module` fields; mark all `public/**` entries as `registry-only` — maps to acceptance criterion "OwnershipEntry interface extended"
- [ ] O2 — Register all missing public/ generators in `GENERATOR_OWNERSHIP_MAP` — maps to acceptance criterion "All missing generators registered"
- [ ] O3 — Implement `generated.file.lookup` command with `--path` and `--diff` modes, `--app` required for app-scoped paths — maps to acceptance criterion "generated.file.lookup registered"
- [ ] O4 — Implement `generated.files.validate` command with glob expansion via `collectFiles` — maps to acceptance criterion "generated.files.validate registered"
- [ ] O5 — Scope `generated.marker.validate` to Category A files only — maps to acceptance criterion "generated.marker.validate scoped"
- [ ] O6 — Extend `generated.edit.guard` to all file types with binary regeneration exemption — maps to acceptance criterion "generated.edit.guard extended + binary exemption"
- [ ] O7 — Remove marker emission from all listed `public/**` generators — maps to acceptance criterion "All listed generators stop emitting markers"
- [ ] O8 — Delete `stripMarker` from `semantic-parity.ts`; update parity check to compare raw content — maps to acceptance criterion "stripMarker deleted"
- [ ] O9 — Update `AGENTS.md` with two-category system and agent guidance — maps to acceptance criterion "AGENTS.md documents"
- [ ] O10 — Register commands in pipeline and command tables; run `command.manifest.generate` and `gitattributes.generate` — maps to acceptance criterion "command.manifest.generate reflects + gitattributes.generate run"

## 2. Affected artifacts

### 2.1 Code and commands

**`@gogol/site-kernel` (`packages/os/site-kernel/src/`):**

- `generated-marker.ts` — no change to `GENERATED_MARKER`, `hasGeneratedMarker`, `buildGeneratedHeader`, or `isGeneratedMarkerTextCandidate`. These remain canonical.

**`@gogol/site-kernel-checks` (`packages/os/site-kernel-checks/src/`):**

- `generator-ownership.ts` — extend `OwnershipEntry` interface with `markerPolicy` and `module`; update all `public/**` entries; add missing generator entries.
- `generated-file-lookup.ts` — **new file**: `generated.file.lookup` command handler.
- `generated-files-validate.ts` — **new file**: `generated.files.validate` command handler.
- `generated-edit-guard.ts` — remove `isGeneratedMarkerTextCandidate` filter; add Category B path-match + `module`-based owner resolution; add binary regeneration exemption; scope `GEN-EDIT-02` to Category A only.
- `generated-marker-validate.ts` — filter expected files list to Category A only (skip entries with `markerPolicy: "registry-only"`).
- `semantic-parity.ts` — delete `stripMarker` function; compare raw content directly.
- `llms.ts` — remove `LLMS_MARKER` prefix from output.
- `page-markdown.ts` — remove `MARKDOWN_TWIN_MARKER` prefix from output.
- `robots.ts` — remove `ROBOTS_MARKER` prefix from output.
- `sitemap-helpers.ts` — remove marker from sitemap XML output.
- `ai.ts` — remove `AI_MARKER` prefix from output.
- `public-surface/shared.ts` — remove `GENERATED_LINE` from output.
- `public-surface/icons.ts` — remove marker from SVG icon output.
- `cms.ts` — remove marker from admin HTML and `config.yml`.
- `site-bordbuch.ts` — remove marker from bordbuch HTML.
- `feed.ts` — remove marker from feed XML output (if present).
- `module.ts` — register `generated.file.lookup` and `generated.files.validate` commands.
- `command-tables/01-codegen.ts` — add command definitions for the two new commands.
- `pipelines/build-prepare.ts` — add `generated.files.validate` after all generators (end of pipeline).
- `pipelines/apps-check-author.ts` — add `generated.files.validate` after `generated.marker.validate`.

**Site OS commands:**

- `generated.file.lookup` — new, workspace scope, read-only.
- `generated.files.validate` — new, workspace scope, read-only.
- `generated.marker.validate` — changed (scoped to Category A).
- `generated.edit.guard` — changed (extended to all file types).

### 2.2 Configuration and data

- `GENERATOR_OWNERSHIP_MAP` entries — add `markerPolicy: "registry-only"` and `module` to all `public/**` entries.
- New entries to add for missing generators:
  - `agent.manifest.generate` → `public/.well-known/agent.json`
  - `agent.openapi.generate` → `public/.well-known/agent.openapi.json`
  - `agent.knowledge.generate` → `public/api/agent/v1/*.json` (glob)
  - `surface.generate` → `public/.well-known/pseo-manifest.json`, `public/**/*.md` (PSEO pages)
  - `surface.starmap.generate` → `public/.well-known/pseo-star-map.svg`
  - `warpgogol.check.hints.generate` → `public/.well-known/warpgogol-check.json`
  - `passport.key.rotate` → `public/.well-known/cosmic-passport-key.json`
  - `preview.images.generate` → `public/og-image.png`
  - `bordbuch.generate` → `public/bordbuch.html`
  - `cms.schema.generate` → `public/admin/index.html`, `public/admin/config.yml`
  - `image.variants.generate` → `public/_img/**/*.webp` (public outputs only)
  - `video.variants.generate` → `public/_video/**` (public outputs only)
  - `live.variants.generate` → `public/_live/**` (public outputs only)

### 2.3 Documentation and specs

- `AGENTS.md` (root) — add two-category system documentation, `generated.file.lookup` agent guidance, `generated.files.validate` usage, `generated.edit.guard` extension note.
- `docs/source-markup.xml` — update if it references generated-file marker protocol or `.generated.json` extensions.
- `docs/technology.xml` — update if it references generated-file detection or marker policies.
- `docs/verification-plan.xml` — update if it references `generated.marker.validate` scope or generated-file verification steps.

### 2.4 Validation and pipelines

- `APPS_BUILD_PREPARE_PIPELINE` — add `generated.files.validate` at end (after all generators).
- `APPS_CHECK_AUTHOR_PIPELINE` — add `generated.files.validate` after `generated.marker.validate`.
- `PACKAGES_CHECK_PIPELINE` — no change (workspace-level package checks unaffected).
- `APPS_CHECK_POSTBUILD_PIPELINE` — no change (`generated.marker.validate --phase=postbuild` already runs; it will just skip Category B files).
- CI workflows — no change needed (pipelines are consumed by existing CI).

## 3. Step sequence

### Step 1. Extend `OwnershipEntry` interface and update existing entries

**Goal:** Add `markerPolicy` and `module` fields to the interface; mark all existing `public/**` entries as `registry-only` with their `module` paths.

**Agent actions:**

- Add `markerPolicy?: "embedded" | "registry-only"` and `module?: string` to `OwnershipEntry` in `generator-ownership.ts`.
- For each existing entry with `path` starting with `public/`, add `markerPolicy: "registry-only"` and `module: "<repo-relative path to command source>"`.
- Entries with `path` starting with `src/`, `AGENTS.md`, `.env.example`, `.gitattributes`, `packages/` keep default (no `markerPolicy` field needed, defaults to `"embedded"`).

**Validation:**

- `pnpm --filter @gogol/site-kernel-checks run build:check` passes.
- `grep -c "markerPolicy" packages/os/site-kernel-checks/src/generator-ownership.ts` returns > 0.

**Completion criterion:** `OwnershipEntry` interface has `markerPolicy` and `module` fields; all `public/**` entries have `markerPolicy: "registry-only"`.

**Human review:** no

---

### Step 2. Register missing generators in `GENERATOR_OWNERSHIP_MAP`

**Goal:** Add ownership entries for all generators that write to `public/` but are not yet registered.

**Agent actions:**

- Add entries for: `agent.manifest.generate`, `agent.openapi.generate`, `agent.knowledge.generate`, `surface.generate`, `surface.starmap.generate`, `warpgogol.check.hints.generate`, `passport.key.rotate`, `preview.images.generate`, `bordbuch.generate`, `cms.schema.generate`, `image.variants.generate` (public outputs), `video.variants.generate` (public outputs), `live.variants.generate` (public outputs).
- Each entry gets `markerPolicy: "registry-only"` and `module: "<path>"`.
- Verify no duplicate paths (single-owner invariant, RFC-0087).

**Validation:**

- `pnpm exec werkstatt run generator.ownership.lint` passes (no multi-owner violations).
- `pnpm --filter @gogol/site-kernel-checks run build:check` passes.

**Completion criterion:** All listed generators have entries in `GENERATOR_OWNERSHIP_MAP` with `markerPolicy` and `module`; `generator.ownership.lint` passes.

**Human review:** no

---

### Step 3. Implement `generated.file.lookup` command

**Goal:** Create the agent-facing lookup command that resolves any file path to its generation metadata.

**Agent actions:**

- Create `packages/os/site-kernel-checks/src/generated-file-lookup.ts`.
- Implement path-matching against `GENERATOR_OWNERSHIP_MAP` (with `{lang}`, `{route}`, `{app}`, `{id}` placeholder expansion) and `command.manifest.generated.yaml` `writes` globs.
- Support `--path <path>` for single-file lookup, `--diff` for batch lookup of git diff files.
- `--app` is required for app-scoped paths (paths not starting with `packages/`, `docs/`, or other workspace-absolute prefixes). Optional for workspace-absolute paths.
- Output JSON with: `generated`, `category`, `ownerCommand`, `regenerateCommand`, `editInstead`, `detectionMethod`.
- Add `MODULE_CONTRACT` and `CHANGE_SUMMARY` scaffolding (DNA-42).
- Register command in `module.ts` and `command-tables/01-codegen.ts`.

**Validation:**

- `pnpm --filter @gogol/site-kernel-checks run build:check` passes.
- `pnpm exec werkstatt run generated.file.lookup --path apps/warpgogol-com/public/robots.txt --json` returns `generated: true`.

**Completion criterion:** Command registered, returns correct metadata for known generated files, returns `generated: false` for non-generated files.

**Human review:** no

---

### Step 4. Implement `generated.files.validate` command

**Goal:** Create the file-existence validator that checks all registry-declared generated files exist on disk.

**Agent actions:**

- Create `packages/os/site-kernel-checks/src/generated-files-validate.ts`.
- Iterate `GENERATOR_OWNERSHIP_MAP` entries; for each, resolve the path (with `--app` for app-scoped paths, workspace-relative for workspace-absolute).
- Expand glob patterns (e.g. `public/_img/**/*.webp`) using `collectFiles` from `@gogol/share/fs`.
- Check existence of each resolved file.
- Rules: `GEN-FILES-01` (error, file missing), `GEN-FILES-02` (warning, Category A file without marker — delegated from `generated.marker.validate`).
- Add `MODULE_CONTRACT` and `CHANGE_SUMMARY` scaffolding (DNA-42).
- Register command in `module.ts` and `command-tables/01-codegen.ts`.
- Add to `APPS_BUILD_PREPARE_PIPELINE` (end, after all generators) and `APPS_CHECK_AUTHOR_PIPELINE` (after `generated.marker.validate`).

**Validation:**

- `pnpm --filter @gogol/site-kernel-checks run build:check` passes.
- `pnpm exec werkstatt run generated.files.validate --app warpgogol-com --json` passes.

**Completion criterion:** Command registered, validates existence of all registry-declared files, correctly expands globs.

**Human review:** no

---

### Step 5. Scope `generated.marker.validate` to Category A only

**Goal:** Filter the expected files list in `generated.marker.validate` to exclude Category B (registry-only) files.

**Agent actions:**

- In `generated-marker-validate.ts`, import `GENERATOR_OWNERSHIP_MAP` and filter the `authorAbsPaths` and `buildOnlyAbsPaths` lists to exclude entries whose `GENERATOR_OWNERSHIP_MAP` entry has `markerPolicy: "registry-only"`.
- Files like `public/robots.txt`, `public/sitemap.xml`, `public/llms.txt`, `public/llms-full.txt`, `public/ai.txt`, `public/humans.txt`, `public/.well-known/security.txt`, `public/_headers`, `public/_redirects`, `public/.assetsignore` are Category B — remove them from the expected paths lists.
- Keep Category A files: `AGENTS.md`, `src/pages/*.astro`, `src/middleware.ts`, `src/content.config.ts`, `src/env.d.ts`, `src/styles/global.css`, `src/scripts/layout-orchestrator.ts`, `src/styles/biome.generated.css`, `src/content/pages/root-redirect.md`, cosmic overlay pages.

**Validation:**

- `pnpm --filter @gogol/site-kernel-checks run build:check` passes.
- `pnpm exec werkstatt run generated.marker.validate --app warpgogol-com --phase=author` no longer reports Category B files.

**Completion criterion:** `generated.marker.validate` only checks Category A files; Category B files are not in its expected list.

**Human review:** no

---

### Step 6. Extend `generated.edit.guard` to all file types

**Goal:** Remove the `isGeneratedMarkerTextCandidate` filter; add Category B path-match + `module`-based owner resolution; add binary regeneration exemption.

**Agent actions:**

- In `generated-edit-guard.ts`:
  - Remove the `if (!isGeneratedMarkerTextCandidate(relPath)) continue;` filter (line 118).
  - Import `GENERATOR_OWNERSHIP_MAP` and resolve each changed file's `OwnershipEntry` by path-match with placeholder expansion.
  - For Category A files (`markerPolicy === "embedded"` or absent): existing behavior (marker check, `GEN-EDIT-01`, `GEN-EDIT-02`).
  - For Category B files (`markerPolicy === "registry-only"`): no marker check; `GEN-EDIT-01` uses `module` field for owner resolution; `GEN-EDIT-02` does not apply.
  - Binary regeneration exemption: if VCS diff shows file as deleted + recreated (not modified), and owner module is unchanged, skip `GEN-EDIT-01`. Detect by running `git diff --name-status` and checking for status `D` (deleted) or `A` (added) on the same path within the diff range. If a path appears as `A` (newly added) and its `module` field's source did not change, it is a regeneration, not a hand-edit. Modified (`M`) files are still checked normally.
  - Emit warning when Category B entry has no `module` field (falls back to coarse `packages/os|ui` check).

**Validation:**

- `pnpm --filter @gogol/site-kernel-checks run build:check` passes.
- `pnpm exec werkstatt run generated.edit.guard --json` passes with no diff.

**Completion criterion:** Guard processes all file types; Category B files are protected; binary regeneration exemption works.

**Human review:** no

---

### Step 7. Remove marker emission from public/ generators

**Goal:** Update all listed generators to stop emitting `buildGeneratedHeader()` / `GENERATED_MARKER` in their `public/**` output.

**Agent actions:**

- `llms.ts`: remove `LLMS_MARKER` prefix; output starts directly with content.
- `page-markdown.ts`: remove `MARKDOWN_TWIN_MARKER` prefix.
- `robots.ts`: remove `ROBOTS_MARKER` prefix.
- `sitemap-helpers.ts`: remove `buildGeneratedHeader()` calls from sitemap XML output.
- `ai.ts`: remove `AI_MARKER` prefix.
- `public-surface/shared.ts`: remove `GENERATED_LINE` from output.
- `public-surface/icons.ts`: remove `buildGeneratedHeader()` from SVG icon output.
- `cms.ts`: remove `buildGeneratedHeader()` from admin HTML and `config.yml`.
- `site-bordbuch.ts`: remove `buildGeneratedHeader()` from bordbuch HTML.
- `feed.ts`: remove marker from feed XML output (if present).
- For JSON-output generators (`agent.manifest.generate`, `agent.openapi.generate`, `agent.knowledge.generate`, `warpgogol.check.hints.generate`, `passport.key.rotate`): these already don't emit comment markers in JSON — no change needed.
- For binary generators (`preview.images.generate`): already no marker — no change needed.
- Remove unused imports of `GENERATED_MARKER`, `hasGeneratedMarker`, `buildGeneratedHeader` only from files where they are no longer used at all (e.g. `llms.ts` after `LLMS_MARKER` is removed). Files that still use `hasGeneratedMarker` for skip-if-hand-edited logic (like `robots.ts`) must keep the import — only the marker emission line is removed, not the detection logic.
- **Do NOT remove** marker emission from `src/` or `docs/` generators (Category A).

**Validation:**

- `pnpm --filter @gogol/site-kernel-checks run build:check` passes.
- `pnpm exec werkstatt run build.prepare --app warpgogol-com` regenerates public files without markers.
- `grep -r "GENERATED" apps/warpgogol-com/public/` returns no results (after regeneration).

**Completion criterion:** All listed `public/**` generators produce clean output without `GENERATED_MARKER`.

**Human review:** no

---

### Step 8. Delete `stripMarker` from `semantic-parity.ts`

**Goal:** Remove the now-unnecessary `stripMarker` function and update the parity check to compare raw content.

**Agent actions:**

- Delete the `stripMarker` function from `semantic-parity.ts`.
- Update `runSemanticParity` to read `llms.txt` / `llms-full.txt` raw content directly (no stripping).
- Remove the `stripMarker` call on line 55.
- Update the `MODULE_CONTRACT` purpose text to note that marker stripping is no longer needed (markers removed from public files by RFC-0375).

**Validation:**

- `pnpm --filter @gogol/site-kernel-checks run build:check` passes.
- `pnpm exec werkstatt run semantic.parity --app warpgogol-com` passes (after `build.prepare` regenerated `llms.txt` without marker).

**Completion criterion:** `stripMarker` function deleted; parity check compares raw content; `semantic.parity` passes.

**Human review:** no

---

### Step 9. Update `AGENTS.md` and Compass docs

**Goal:** Document the two-category marker system, the lookup command, and agent guidance.

**Agent actions:**

- In root `AGENTS.md`, amend the "Generated-file governance protocol" section:
  - Add Category A vs Category B explanation.
  - Add `generated.file.lookup` command documentation and agent MUST-use guidance.
  - Add `generated.files.validate` command documentation.
  - Note that `generated.edit.guard` now protects binary and public-facing files.
  - Note that public-facing files no longer carry `GENERATED_MARKER` by design.
  - Add mandatory registration rule for future commands (`markerPolicy` + `module`).
- Check `docs/source-markup.xml`, `docs/technology.xml`, `docs/verification-plan.xml` for references to generated-file marker protocol or `.generated.json` — update if found.

**Validation:**

- `pnpm exec werkstatt run rfc.validate RFC-0375 --json` passes.
- `pnpm exec werkstatt run compass.validate --json` passes.

**Completion criterion:** `AGENTS.md` documents two-category system; Compass XML files synchronized if needed.

**Human review:** no

---

### Step 10. Register commands, regenerate manifests, run validation suite

**Goal:** Finalize command registration, regenerate manifests, and run the full validation suite.

**Agent actions:**

- Verify `generated.file.lookup` and `generated.files.validate` are registered in `command-tables/01-codegen.ts` and `module.ts`.
- Run `pnpm exec werkstatt run command.manifest.generate` to update `docs/command-manifest.generated.yaml`.
- Run `pnpm exec werkstatt run gitattributes.generate` to update `.gitattributes`.
- Run `pnpm exec site-kernel rfc.validate RFC-0375 --json`.
- Run `pnpm --filter @gogol/site-kernel-checks run build:check`.
- Run `pnpm exec werkstatt run rfc.acceptance.run --id RFC-0375 --json`.
- Run `pnpm exec werkstatt run rfc.verification.emit --id RFC-0375` (RFC-0330).
- Stamp `implementedAt: 2026-07-12` in RFC-0375 frontmatter.
- Commit with `RFC-0375` in subject.

**Validation:**

- `rfc.validate RFC-0375` passes.
- `build:check` for `@gogol/site-kernel-checks` passes.
- `rfc.acceptance.run --id RFC-0375` passes (all probes green).
- `rfc.verification.emit --id RFC-0375` emits evidence file.

**Completion criterion:** All validation passes; RFC stamped `implementedAt`; evidence file committed.

**Human review:** no

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate RFC-0375 --json`
- `pnpm --filter @gogol/site-kernel-checks run build:check`
- `pnpm --filter @gogol/site-kernel run build:check`
- `pnpm exec werkstatt run rfc.acceptance.run --id RFC-0375 --json`
- `pnpm exec werkstatt run rfc.verification.emit --id RFC-0375` (RFC-0330)
- `pnpm exec werkstatt run generated.file.lookup --path apps/warpgogol-com/public/robots.txt --json`
- `pnpm exec werkstatt run generated.files.validate --app warpgogol-com --json`
- `pnpm exec werkstatt run generated.marker.validate --app warpgogol-com --phase=author`
- `pnpm exec werkstatt run generated.edit.guard --json`
- `pnpm exec werkstatt run semantic.parity --app warpgogol-com`
- `pnpm exec werkstatt run generator.ownership.lint`

### 4.2 Evidence artifacts

- `docs/rfcs/verification/rfc-0375.generated.json` — verification evidence (RFC-0330)
- Commit messages referencing `RFC-0375` in the subject line (RFC-0265 commit hygiene)

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Category B file not in registry | Step 2 registers all missing generators; `generator.ownership.lint` verifies no duplicates |
| `module` field drift | Step 1 sets `module` to repo-relative paths; coarse fallback in Step 6 handles missing `module` |
| Public file content change visible to external consumers | Step 7 removes markers; diff is visible in PR — desired outcome |
| `stripMarker` removal breaks parity | Step 8 deletes function and compares raw content; `semantic.parity` validates after regeneration |
| Agents confused by absence of marker in public files | Step 9 updates `AGENTS.md` with explicit guidance to use `generated.file.lookup` |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-N, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0375 --reason "..." --invariant "DNA-N"` instead of working around it.
- If `generated.edit.guard` binary regeneration exemption cannot distinguish hand-edit from regeneration reliably, escalate via RFC-0334 — do not weaken the guard silently.
- If `collectFiles` glob expansion is too slow (>500ms per app), escalate — may need a cached index approach (new RFC).
