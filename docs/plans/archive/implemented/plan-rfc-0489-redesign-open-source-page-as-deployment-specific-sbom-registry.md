---
rfcId: RFC-0489
planId: PLAN-RFC-0489-01
status: draft
owner: architecture
createdAt: 2026-07-22
updatedAt:
scope:
  apps:
    - warpgogol-com
  packages:
    - "@gogol/site-kernel-astro"
    - "@gogol/site-kernel-codegen"
    - "@gogol/site-kernel-checks"
    - "@gogol/ui"
  services: []
  docs:
    - packages/os/site-kernel-astro/README.md
    - packages/os/site-kernel-codegen/AGENTS.md
    - packages/os/site-kernel-checks/AGENTS.md
---

# Implementation Plan: RFC-0489

## 1. Objectives

- [ ] O1 — Remove `openSourcePagePath`/`openSourceProsePath` from `AstroSitePaths` and update README — maps to acceptance criterion 1.
- [ ] O2 — Rewrite `runGenerateOpenSourcePage` with `hasSystemPage` guard, i18n support, compact prose, downloadable artifacts, SBOM generation, deduplication, SPDX normalization, and deployment metadata — maps to acceptance criteria 2-12.
- [ ] O3 — Update page and prose templates with i18n tokens, compact structure, and correct `ownerCommand` — maps to acceptance criteria 4-5, 13.
- [ ] O4 — Create `open-source-registry` UI section in `@gogol/ui` with semantic HTML, accessibility attributes, and type-safe props — maps to acceptance criterion 8.
- [ ] O5 — Implement `open-source.validate` and add to `SITES_BUILD_CHECK_PIPELINE` — maps to acceptance criteria 13-14.
- [ ] O6 — Update `GENERATOR_OWNERSHIP_MAP` with missing prose path, new artifact paths, and fix RFC-0049 comment — maps to acceptance criterion 15.
- [ ] O7 — Add `openSource` label keys to `src/content/site/{lang}/labels.md` for DE and UK — maps to acceptance criterion 16.
- [ ] O8 — Update AGENTS.md documentation — maps to documentation sync duty.
- [ ] O9 — Full validation passes: `open-source.validate`, dev build, `content.idempotency.validate`, `rfc.validate` — maps to acceptance criteria 17-20.

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/os/site-kernel-astro/src/index.ts` — remove `openSourcePagePath` and `openSourceProsePath` fields from `AstroSitePaths` interface and `getAstroSitePaths` function.
- `packages/os/site-kernel-astro/README.md` — remove documented `openSourcePagePath` field from the README table.
- `packages/os/site-kernel-codegen/src/service.ts` — rewrite `runGenerateOpenSourcePage`: add `hasSystemPage` guard, i18n loop, compact prose builder (text only), JSON data file generation, artifact generation (THIRD_PARTY_NOTICES.txt, THIRD_PARTY_LICENSES.txt, sbom.cdx.json), SBOM generation, deduplication, SPDX normalization via `spdx-license-list`, deployment metadata, updated fingerprint inputs. Remove `buildOpenSourceProseMarkdown` (replaced by new compact builder). Add `loadOpenSourceLabels` (same pattern as `loadMaterialCreditLabels`). Define `OpenSourceRegistryData` Zod schema.
- `packages/os/site-kernel-codegen/src/templates/service/src/content/pages/open-source.md.template` — update with i18n tokens (`{{LANG}}`, `{{TITLE}}`, `{{DESCRIPTION}}`, `{{HEADING}}`), fix `ownerCommand` to `open-source.generate`.
- `packages/os/site-kernel-codegen/src/templates/service/src/content/prose/open-source.md.template` — restructure to text-only template (heading, lead, scope explanation, process note). Structured data rendered by UI section.
- `packages/os/site-kernel-checks/src/generator-ownership.ts` — add `src/content/prose/{lang}/open-source.md`, `src/content/data/{lang}/open-source-registry.json`, `public/open-source/**` entries, fix comment from `RFC-0049` to `RFC-0081`.
- `packages/os/site-kernel-checks/src/pipelines/build-check.ts` — add `{ command: "open-source.validate", expectedDurationMs: 5_000, timeoutMs: 30_000 }` to `SITES_BUILD_CHECK_PIPELINE`.
- `packages/os/site-kernel-checks/src/open-source-validate.ts` — new file: `runOpenSourceValidate` command handler.
- `packages/os/site-kernel-checks/src/module.ts` — register `open-source.validate` command.
- `packages/ui/src/sections/open-source-registry/open-source-registry-section.astro` — new UI section with semantic HTML, accessibility attributes, type-safe props.
- `packages/ui/src/sections/open-source-registry/open-source-registry-section.css` — colocated styles.
- `packages/ui/src/sections/open-source-registry/open-source-registry.manifest.yaml` — section manifest.
- Site OS commands: `open-source.generate` (changed), `open-source.validate` (new).

### 2.2 Configuration and data

- `missions/*/workpiece/src/content/site/de/labels.md` — new `openSource` label keys (German).
- `missions/*/workpiece/src/content/site/uk/labels.md` — new `openSource` label keys (Ukrainian).
- `missions/*/workpiece/public/open-source/` — generated artifacts directory (THIRD_PARTY_NOTICES.txt, THIRD_PARTY_LICENSES.txt, sbom.cdx.json).
- `missions/*/workpiece/src/content/pages/{de,uk}/open-source.md` — generated page manifests with two blocks: markdown for prose + section for UI (regenerated).
- `missions/*/workpiece/src/content/prose/{de,uk}/open-source.md` — generated prose files, text only (regenerated).
- `missions/*/workpiece/src/content/data/{de,uk}/open-source-registry.json` — generated JSON data files for UI section (new).

### 2.3 Documentation and specs

- `packages/os/site-kernel-codegen/AGENTS.md` — update `open-source.generate` command description to reflect new behavior (i18n, SBOM, compact prose).
- `packages/os/site-kernel-checks/AGENTS.md` — add `open-source.validate` to the check commands table.
- `docs/technology.xml` — no structural change needed (workspace descriptions remain accurate).

### 2.4 Validation and pipelines

- `SITES_BUILD_PREPARE_PIPELINE` — `open-source.generate` already wired (line 61 of `build-prepare.ts`); no change needed.
- `SITES_BUILD_CHECK_PIPELINE` — add `open-source.validate` step.
- `pnpm --filter @gogol/site-kernel-astro run build:check`
- `pnpm --filter @gogol/site-kernel-codegen run build:check`
- `pnpm --filter @gogol/site-kernel-codegen run test`
- `pnpm --filter @gogol/site-kernel-checks run build:check`
- `pnpm --filter @gogol/ui run build:check`
- `pnpm exec werkstatt run rfc.validate RFC-0489`

## 3. Step sequence

### Step 1. Remove `openSourcePagePath`/`openSourceProsePath` from `@gogol/site-kernel-astro`

**Goal:** Clean up the path helper interface to remove hardcoded `de/` paths.

**Agent actions:**

- Remove `openSourcePagePath` and `openSourceProsePath` fields from the `AstroSitePaths` interface in `packages/os/site-kernel-astro/src/index.ts`.
- Remove the corresponding initializations in `getAstroSitePaths`.
- Update `packages/os/site-kernel-astro/README.md` to remove the `openSourcePagePath` row from the documented fields table.

**Validation:**

- `pnpm --filter @gogol/site-kernel-astro run build:check`

**Completion criterion:** `AstroSitePaths` no longer has `openSourcePagePath` or `openSourceProsePath` fields. README updated. Build passes.

**Human review:** no

---

### Step 2. Add `loadOpenSourceLabels` helper and label schema

**Goal:** Create the label loading infrastructure for the open-source page, following the `loadMaterialCreditLabels` pattern.

**Agent actions:**

- Add `openSourceLabelsSchema` (Zod) to `packages/os/site-kernel-codegen/src/service.ts` with all label keys from the RFC (heading, leadText, summaryHeading, componentsTotalLabel, directDependenciesLabel, transitiveDependenciesLabel, licensesTotalLabel, componentsWithNoticeLabel, licenseDistributionHeading, deploymentMetadataHeading, deploymentIdLabel, buildTimestampLabel, commitShaLabel, targetPlatformLabel, scopeHeading, scopeIncludedLabel, scopeIncludedText, scopeExcludedLabel, scopeExcludedText, downloadsHeading, noticeFileLabel, licenseFileLabel, sbomFileLabel, componentTableHeading, processNoteText). Use `.strict()` to catch missing keys.
- Add `loadOpenSourceLabels(contentDirectory, lang, defaultLang)` function following the same pattern as `loadMaterialCreditLabels` — reads `src/content/site/{lang}/labels.md` frontmatter `openSource` key, falls back to default language.
- Export `OpenSourceLabels` type.

**Validation:**

- `pnpm --filter @gogol/site-kernel-codegen run build:check`

**Completion criterion:** `loadOpenSourceLabels` is exported and build passes.

**Human review:** no

---

### Step 3. Implement SPDX license normalization

**Goal:** Create the license normalization utility using `spdx-license-list`.

**Agent actions:**

- Add `spdx-license-list` as an explicit dependency in `packages/os/site-kernel-codegen/package.json` (it is currently only a transitive dependency of `@quantco/pnpm-licenses`).
- Implement `normalizeLicense(licenseString: string): { status: "verified" | "normalized" | "unknown"; spdxId: string | null }` in `packages/os/site-kernel-codegen/src/service.ts`:
  1. Check if the string is a valid SPDX identifier using `spdx-license-list`.
  2. Check against a small alias map for common non-SPDX strings (e.g. `Apache 2.0` → `Apache-2.0`, `BSD` → `BSD-3-Clause`).
  3. If valid, return `{ status: "verified", spdxId }`.
  4. If aliased, return `{ status: "normalized", spdxId: normalizedId }`.
  5. Otherwise, return `{ status: "unknown", spdxId: null }`.
- Implement `detectLicenseConflict(licenses: string[]): boolean` — returns true if a package has multiple conflicting license strings.

**Validation:**

- `pnpm --filter @gogol/site-kernel-codegen run build:check`

**Completion criterion:** `normalizeLicense` and `detectLicenseConflict` are exported and build passes.

**Human review:** no

---

### Step 4. Implement dependency classification and deduplication

**Goal:** Create the scoping heuristic that classifies packages as runtime/browser-bundle/build-only/development-only/test-only.

**Agent actions:**

- Implement `classifyPackage(packageName: string, isDependency: boolean): "runtime" | "browser-bundle" | "build-only" | "development-only" | "test-only"` in `packages/os/site-kernel-codegen/src/service.ts`:
  1. If package is in `devDependencies` → classify as `build-only`, `development-only`, or `test-only` based on known patterns.
  2. If package is in `dependencies` → classify as `runtime` or `browser-bundle` (packages known to be browser-only like CSS/font packages → `browser-bundle`).
  3. Use a maintainable allowlist/denylist of known build-only patterns: `@astrojs/check`, `@astrojs/compiler`, `typescript`, `@types/*`, `vitest`, `playwright`, etc.
- Implement `deduplicatePackages(deps: ClassifiedDependency[]): ClassifiedDependency[]` — deduplicates by `package@version`, combining scope fields when the same package appears in multiple scopes.

**Validation:**

- `pnpm --filter @gogol/site-kernel-codegen run build:check`

**Completion criterion:** `classifyPackage` and `deduplicatePackages` are exported and build passes.

**Human review:** no

---

### Step 5. Implement CycloneDX SBOM generation

**Goal:** Create the SBOM builder that produces valid CycloneDX 1.5 JSON using `@cyclonedx/cyclonedx-library`.

**Agent actions:**

- Add `@cyclonedx/cyclonedx-library` as a dependency in `packages/os/site-kernel-codegen/package.json`.
- Implement `buildCycloneDxSbom(components: SbomComponent[], metadata: DeploymentMetadata): string` in `packages/os/site-kernel-codegen/src/service.ts`:
  1. Use `@cyclonedx/cyclonedx-library` to build the SBOM programmatically (ensures schema compliance).
  2. Each component: type, name, version, purl (`pkg:npm/{name}@{version}`), licenses (expression), scope, properties (wgogol:relationship, wgogol:distributionScope).
  3. Serialize to JSON string.
- The library guarantees CycloneDX 1.5 schema compliance, reducing the risk of `invalid-sbom-schema` validation failures.

**Validation:**

- `pnpm --filter @gogol/site-kernel-codegen run build:check`

**Completion criterion:** `buildCycloneDxSbom` produces valid CycloneDX 1.5 JSON via the library and build passes.

**Human review:** no

---

### Step 6. Rewrite `runGenerateOpenSourcePage`

**Goal:** Replace the current generator with the new i18n-aware, compact, SBOM-producing generator.

**Agent actions:**

- Rewrite `runGenerateOpenSourcePage` in `packages/os/site-kernel-codegen/src/service.ts`:
  1. Load `system.md` via `loadSystemManifestSync` and guard with `hasSystemPage(system, "openSource")`.
  2. Load i18n config via `loadI18nConfigSync`.
  3. Run `pnpm licenses list --prod --json` at the app root (same as current).
  4. Run `@quantco/pnpm-licenses` for the dependency list and disclaimer (same as current).
  5. Classify each dependency using `classifyPackage`.
  6. Normalize licenses using `normalizeLicense` and `detectLicenseConflict`.
  7. Deduplicate using `deduplicatePackages`.
  8. Filter to public scopes only (runtime, browser-bundle, worker-runtime).
  9. Read deployment metadata from `process.env.DEPLOYMENT_ID`, `process.env.COMMIT_SHA`, `process.env.BUILD_TIMESTAMP`, `process.env.TARGET_PLATFORM` (or placeholders `—` if unavailable).
  10. Generate downloadable artifacts: `THIRD_PARTY_NOTICES.txt`, `THIRD_PARTY_LICENSES.txt` (deduplicated by SPDX ID), `sbom.cdx.json`.
  11. For each supported language: a. Load labels via `loadOpenSourceLabels`. b. Build compact prose markdown (text only: heading, lead, scope explanation, process note). c. Build JSON data file with `OpenSourceRegistryData` schema (summary, deployment metadata, downloads, components). d. Build page manifest with two blocks: markdown for prose + section for UI with JSON data reference. e. Write all three files using `writeGeneratedFile`.
  12. Write artifacts to `public/open-source/`.
  13. Update fingerprint inputs: add `src/content/system.md` and `src/content/site/{lang}/labels.md` to the fingerprint hash.
- Remove old `buildOpenSourceProseMarkdown` function.
- Remove references to `paths.openSourcePagePath` and `paths.openSourceProsePath` — use `path.join(paths.contentPagesDirectory, lang, "open-source.md")` and `path.join(paths.contentDirectory, "prose", lang, "open-source.md")`.

**Validation:**

- `pnpm --filter @gogol/site-kernel-codegen run build:check`
- `pnpm --filter @gogol/site-kernel-codegen run test`

**Completion criterion:** Generator compiles, tests pass, and the generator produces compact prose + page manifests + downloadable artifacts for each supported language.

**Human review:** no

---

### Step 7. Update templates

**Goal:** Update page and prose templates with i18n tokens and compact structure.

**Agent actions:**

- Update `packages/os/site-kernel-codegen/src/templates/service/src/content/pages/open-source.md.template`:
  - Replace `lang: de` with `lang: {{LANG}}`.
  - Replace hardcoded German title/description/heading with `{{TITLE}}`, `{{DESCRIPTION}}`, `{{HEADING}}` tokens.
  - Fix `ownerCommand` in the `GENERATED_HEADER` from `material.credits.generate` to `open-source.generate`.
- Update `packages/os/site-kernel-codegen/src/templates/service/src/content/prose/open-source.md.template`:
  - Replace the entire template with the compact structure from the RFC (summary table, license distribution, deployment metadata, scope, downloads, component table, process note).
  - Use token placeholders for all localized text.

**Validation:**

- `pnpm --filter @gogol/site-kernel-codegen run build:check`

**Completion criterion:** Templates have i18n tokens and compact structure. Build passes.

**Human review:** no

---

### Step 8. Create `open-source-registry` UI section

**Goal:** Create the UI section that renders the compact registry page.

**Agent actions:**

- Create `packages/ui/src/sections/open-source-registry/open-source-registry-section.astro`:
  - Render a summary card with component counts and license distribution.
  - Render a deployment metadata block.
  - Render a scope explanation block.
  - Render download buttons/links.
  - Render the component table with semantic HTML (`<table>`, `<caption>`, `<th>`).
- Create `packages/ui/src/sections/open-source-registry/open-source-registry-section.css` — colocated styles.
- Create `packages/ui/src/sections/open-source-registry/open-source-registry.manifest.yaml` — section manifest.
- Note: the page uses the existing `markdown` block type with `contentRef: "prose/open-source"`. The UI section is used for rendering the prose content within the markdown block. No new block type is needed in `@gogol/ontology`.

**Validation:**

- `pnpm --filter @gogol/ui run build:check`

**Completion criterion:** UI section builds and is registered in `@gogol/ui`.

**Human review:** no

---

### Step 8. Create `open-source-registry` UI section and JSON data contract

**Goal:** Create the UI section that renders structured data (summary card, deployment metadata, download buttons, component table) with semantic HTML, accessibility attributes, and type-safe props. Prose markdown retains only text parts (headings, lead, scope explanation).

**Agent actions:**

- Define a Zod schema for the open-source registry data in `packages/os/site-kernel-codegen/src/service.ts` (or a shared schema file):
  - `OpenSourceRegistryData`: `summary` (component counts, license distribution), `deploymentMetadata`, `downloads` (artifact links), `components` (array of `{ name, version, license, scope, relationship, source }`).
- The generator (Step 6) writes a JSON data file to `src/content/data/{lang}/open-source-registry.json` alongside the prose markdown. The JSON file is generator-owned (added to `GENERATOR_OWNERSHIP_MAP`).
- The prose markdown is simplified to contain only text parts: heading, lead text, scope explanation, process note. The component table, summary card, deployment metadata, and download buttons are removed from prose — they are rendered by the UI section.
- Create `packages/ui/src/sections/open-source-registry/open-source-registry-section.astro`:
  - Define a Zod-validated `Props` interface matching `OpenSourceRegistryData`.
  - Render a `<section>` with semantic sub-components:
    1. **Summary card**: `<dl>` with component counts and license distribution.
    2. **Deployment metadata**: `<dl>` with deployment ID, build timestamp, commit SHA, target platform.
    3. **Download buttons**: `<a>` links with `download` attribute and `aria-label`.
    4. **Component table**: `<table>` with `<caption>`, `<thead>`, `<th scope="col">`, `<tbody>`, `<td>`.
  - Add accessibility attributes: `aria-label` on download links, `scope="col"` on `<th>`.
- Create `packages/ui/src/sections/open-source-registry/open-source-registry-section.css` — colocated styles.
- Create `packages/ui/src/sections/open-source-registry/open-source-registry.manifest.yaml` — section manifest.
- The page manifest has two blocks: `markdown` block with `contentRef: "prose/open-source"` for text + a block referencing the UI section with the JSON data file.

**Block type decision:** The page manifest needs a block type that can pass structured JSON data to the UI section. The implementation should first check if an existing block type (e.g. `section` or similar) supports rendering a UI section with data props. If no existing block type suffices, a new block type RFC is needed — this is a separate concern and will be handled as a follow-up RFC if required.

**Validation:**

- `pnpm --filter @gogol/ui run build:check`

**Completion criterion:** UI section builds with Zod-validated props, semantic HTML, and accessibility attributes. JSON data schema is defined. Section is registered in `@gogol/ui`.

**Human review:** yes — the block type decision (existing vs new) may require a separate RFC if a new block type is needed.

---

### Step 9. Implement `open-source.validate`

**Goal:** Create the validator that checks SBOM consistency, scope separation, license status, deduplication, and artifact existence.

**Agent actions:**

- Create `packages/os/site-kernel-checks/src/open-source-validate.ts` with `runOpenSourceValidate(input, context)`:
  1. Check `hasSystemPage(system, "openSource")` — skip if no open-source page.
  2. Load `public/open-source/sbom.cdx.json` — fail `missing-artifact` if absent.
  3. Validate against CycloneDX 1.5 JSON schema — fail `invalid-sbom-schema` if invalid.
  4. Check `THIRD_PARTY_NOTICES.txt` and `THIRD_PARTY_LICENSES.txt` exist — fail `missing-artifact` if absent.
  5. For each component in SBOM:
     - Check purl exists — fail `missing-purl`.
     - Check version exists — fail `missing-version`.
     - Check license status is `verified` or `normalized` — fail `unknown-license` or `conflicting-license`.
     - Check no `build-only` or `development-only` in runtime scope — fail `build-only-in-runtime`.
  6. Check no duplicate `package@version` — fail `duplicate-package`.
  7. Parse the generated prose markdown, extract the component count, compare to SBOM component count — fail `count-mismatch`.
- Register `open-source.validate` in `packages/os/site-kernel-checks/src/module.ts`.
- Add to `SITES_BUILD_CHECK_PIPELINE` in `packages/os/site-kernel-checks/src/pipelines/build-check.ts`:
  ```ts
  { command: "open-source.validate", expectedDurationMs: 5_000, timeoutMs: 30_000 },
  ```

**Validation:**

- `pnpm --filter @gogol/site-kernel-checks run build:check`

**Completion criterion:** `open-source.validate` is registered, builds, and is wired into `SITES_BUILD_CHECK_PIPELINE`.

**Human review:** no

---

### Step 10. Update `GENERATOR_OWNERSHIP_MAP`

**Goal:** Fix the ownership map: add missing prose path, add artifact paths, fix RFC comment.

**Agent actions:**

- In `packages/os/site-kernel-checks/src/generator-ownership.ts`:
  1. Fix the comment on line 151 from `// open-source.generate — RFC-0049` to `// open-source.generate — RFC-0081`.
  2. Add `{ path: "src/content/prose/{lang}/open-source.md", command: "open-source.generate" }` after the existing pages entry.
  3. Add `{ path: "src/content/data/{lang}/open-source-registry.json", command: "open-source.generate" }` for the JSON data files.
  4. Add `{ path: "public/open-source/**", command: "open-source.generate" }` for the downloadable artifacts.

**Validation:**

- `pnpm --filter @gogol/site-kernel-checks run build:check`

**Completion criterion:** Ownership map includes all three paths and the comment references RFC-0081.

**Human review:** no

---

### Step 11. Add `openSource` labels to DE and UK

**Goal:** Add localized label keys for both supported languages.

**Agent actions:**

- Add `openSource` label keys to `missions/warpgogol-com-m000010/workpiece/src/content/site/de/labels.md` with German translations of all 24 label keys.
- Add `openSource` label keys to `missions/warpgogol-com-m000010/workpiece/src/content/site/uk/labels.md` with the Ukrainian translations from the RFC.

**Validation:**

- `pnpm exec werkstatt run open-source.generate --site warpgogol-com` (verify labels are loaded)

**Completion criterion:** Both label files have `openSource` keys with all 24 labels.

**Human review:** no

---

### Step 12. Update documentation

**Goal:** Update AGENTS.md files and check Compass sync.

**Agent actions:**

- Update `packages/os/site-kernel-codegen/AGENTS.md` — update the `open-source.generate` command description to reflect new behavior (i18n, SBOM, compact prose, downloadable artifacts, SPDX normalization).
- Update `packages/os/site-kernel-checks/AGENTS.md` — add `open-source.validate` to the check commands table.
- Check `docs/technology.xml` — the workspace descriptions for `pkg-kernel-astro` and `pkg-kernel-codegen` remain accurate; no structural change needed.

**Validation:**

- `pnpm exec werkstatt run rfc.validate RFC-0489`

**Completion criterion:** AGENTS.md files updated, `rfc.validate` passes.

**Human review:** no

---

### Step 13. Pilot regeneration and full validation

**Goal:** Regenerate the open-source page for `warpgogol-com` and verify all acceptance criteria.

**Agent actions:**

- Run `pnpm exec werkstatt run open-source.generate --site warpgogol-com`.
- Verify the generated prose file is under 500 lines.
- Verify `THIRD_PARTY_NOTICES.txt`, `THIRD_PARTY_LICENSES.txt`, and `sbom.cdx.json` exist in `public/open-source/`.
- Verify the UK page renders without errors.
- Run `pnpm exec werkstatt run open-source.validate --site warpgogol-com`.
- Run `pnpm exec werkstatt run content.idempotency.validate --site warpgogol-com`.
- Run dev build of `warpgogol-com` and verify `/open-source/` (DE) and `/vidkrytyy-kod/` (UK) render without runtime errors.

**Validation:**

- `pnpm exec werkstatt run open-source.validate --site warpgogol-com` exits 0
- `pnpm exec werkstatt run content.idempotency.validate --site warpgogol-com` exits 0
- Dev build succeeds
- `pnpm exec werkstatt run rfc.validate RFC-0489` exits 0

**Completion criterion:** All acceptance criteria pass. The open-source page is compact, multi-language, with downloadable artifacts and valid SBOM.

**Human review:** no

---

## 4. Validation suite

### 4.1 Required checks

- `pnpm --filter @gogol/site-kernel-astro run build:check`
- `pnpm --filter @gogol/site-kernel-codegen run build:check`
- `pnpm --filter @gogol/site-kernel-codegen run test`
- `pnpm --filter @gogol/site-kernel-checks run build:check`
- `pnpm --filter @gogol/ui run build:check`
- `pnpm exec werkstatt run open-source.validate --site warpgogol-com`
- `pnpm exec werkstatt run content.idempotency.validate --site warpgogol-com`
- `pnpm exec werkstatt run rfc.validate RFC-0489`

### 4.2 Evidence artifacts

- Generated `missions/warpgogol-com-m000010/workpiece/public/open-source/sbom.cdx.json` — CycloneDX SBOM.
- Generated `missions/warpgogol-com-m000010/workpiece/src/content/prose/{de,uk}/open-source.md` — compact prose files.
- Commit messages referencing `RFC-0489` in the subject line (RFC-0265 commit hygiene).

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Deployment-specific inventory accuracy (misclassification) | Step 4 — maintainable allowlist/denylist; Step 9 — `build-only-in-runtime` validator catches false positives |
| SPDX normalization gaps (unknown licenses block build) | Step 3 — alias map for common non-SPDX strings; manual resolution for genuinely non-SPDX licenses |
| Deployment metadata availability (local dev builds) | Step 6 — placeholder `—` when metadata unavailable; fingerprint excludes deployment metadata |
| SBOM format compliance | Step 5 — `@cyclonedx/cyclonedx-library` guarantees schema compliance; Step 9 — `invalid-sbom-schema` validator |
| Fingerprint cache inputs | Step 6 — fingerprint includes `system.md` and `labels.md` for i18n and label changes |
| Multi-language label completeness | Step 2 — `.strict()` schema catches missing keys; Step 11 — both DE and UK labels added |

## 6. Escalation triggers

- If the `spdx-license-list` package API is incompatible with the expected interface, switch to `spdx-expression-parse` + `spdx-correct` and update Step 3.
- If `@cyclonedx/cyclonedx-library` API is incompatible or too heavy, fall back to hand-rolled JSON builder and validate against the CycloneDX 1.5 schema in the validator step.
- If no existing block type can render the UI section with structured data props, a new block type RFC is needed — stop and create a follow-up RFC before proceeding with Step 8.
- If `pnpm licenses list --prod` at the workpiece root does not scope correctly (includes workspace-wide dependencies), switch to `pnpm list --filter <workspace> --prod --json` + manual license resolution from `package.json` files.
- If implementation reveals an invariant conflict with DNA-11 (language mirroring), run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0489 --reason "..." --invariant "DNA-11"` instead of working around it.
