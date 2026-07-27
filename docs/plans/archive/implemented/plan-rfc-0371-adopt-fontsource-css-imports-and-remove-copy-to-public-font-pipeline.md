---
rfcId: RFC-0371
planId: PLAN-RFC-0371-01
status: draft
owner: architecture
createdAt: 2026-07-09
updatedAt:
scope:
  apps:
    - apps/webgogol-com
    - apps/nicaragua-projekt
    - apps/check-webgogol-com
  packages:
    - packages/ontology
    - packages/os/site-kernel-checks
    - packages/os/site-kernel-codegen
    - packages/os/site-kernel-content
  services: []
  docs:
    - docs/adrs/adr-0001-self-host-playfair-dm-mono-for-webgogol-com.md
    - docs/rfcs/archive/implemented/rfc-0164-self-host-web-fonts-and-remove-the-google-fonts-hotlink.md
    - AGENTS.md
    - docs/requirements.xml
    - docs/technology.xml
    - docs/development-plan.xml
---

# Implementation Plan: RFC-0371

## 0. Grilling decisions

| # | Question | Decision |
| --- | --- | --- |
| G1 | Atomicity: one commit or multiple? | **One commit** — all 12 steps in a single commit, matching RFC "single atomic wave" |
| G2 | Generator placement: checks or codegen? | **Split** — `fonts.imports.generate` in `site-kernel-codegen/src/fonts-imports.ts` (alongside `biome-css.ts`); validators `fonts.contract.validate` + `fonts.origin.validate` in `site-kernel-checks/src/fonts.ts` |
| G3 | Remove `@fontsource/*` from `site-kernel-checks/devDependencies`? | **Yes** — neither codegen nor checks need them; generator writes `@import` lines from biome YAML; validator reads `node_modules` from app context |
| G4 | `Inter Display` in `check-concrete-blueprint` — no `@fontsource/inter-display` exists | **Replace** `headingFamily` with `'Inter', system-ui, sans-serif` — headings use self-hosted Inter |
| G5 | How to integrate `fonts.imports.css` template into scaffolding? | **Via `styles.global.generate`** — add `fonts.imports.css` to the `files[]` array in `app-boilerplate.ts`, read from `fonts.imports.template.css` |

## 1. Objectives

- [ ] O1 — Biome Zod schema gains optional `fonts` field; all 3 biome YAMLs declare their Fontsource packages — maps to acceptance criterion [biome schema]
- [ ] O2 — `fonts.imports.generate` command reads biome `fonts` section and emits `src/styles/fonts.imports.css` — maps to acceptance criterion [fonts.imports.generate]
- [ ] O3 — `fonts.contract.validate` (author-time, 4 rules) + `fonts.origin.validate` (postbuild, 1 rule) replace `fonts.selfhost.validate` — maps to acceptance criterion [fonts.contract.validate]
- [ ] O4 — All 3 apps migrate: `fonts.generated.css` and `public/fonts/` removed; `fonts.imports.css` in place; `@fontsource/*` in app `package.json` — maps to acceptance criterion [all apps migrate]
- [ ] O5 — Old commands and `SELF_HOSTED_FONTS` registry removed; pipelines and generator-ownership map updated — maps to acceptance criteria [fonts.generate removed, SELF_HOSTED_FONTS removed, pipelines, generator-ownership]
- [ ] O6 — Codegen templates updated for new app scaffolding — maps to acceptance criterion [templates]
- [ ] O7 — ADR-0001 superseded, root AGENTS.md updated, Compass XML synced — maps to acceptance criteria [ADR-0001, AGENTS.md]
- [ ] O8 — All apps pass `fonts.contract.validate` and `fonts.origin.validate` after migration — maps to acceptance criterion [all apps pass]

## 2. Affected artifacts

### 2.1 Code and commands

| File | Change |
| --- | --- |
| `packages/ontology/src/schemas/biome.ts` | Add `biomeFontEntrySchema`, `biomeFontsSchema`; add `fonts: biomeFontsSchema` to `biomeSchema`; export `BiomeFontEntry`, `BiomeFontsConfig` types |
| `packages/os/site-kernel-codegen/src/fonts-imports.ts` | **New file.** `runFontsImportsGenerate` — reads biome YAML via `loadSystemManifest` + `biomeSchema` (same pattern as `biome-css.ts`), emits `@import "@fontsource/..."` lines to `src/styles/fonts.imports.css` |
| `packages/os/site-kernel-checks/src/fonts.ts` | Remove `SELF_HOSTED_FONTS`, `SelfHostedFont`, `resolveFontsourceWoff2`, `copyIfChanged`, `runFontsGenerate`, `runFontsSelfhostValidate`. Add `runFontsContractValidate`, `runFontsOriginValidate` (keep `EXTERNAL_FONT_ORIGIN` regex for origin validate) |
| `packages/os/site-kernel-codegen/src/index.ts` | Export `runFontsImportsGenerate` from `fonts-imports.ts` |
| `packages/os/site-kernel-checks/src/validators/codegen.ts` | Update re-exports: remove `runFontsGenerate`, `runFontsSelfhostValidate`; add `runFontsImportsGenerate` from `@gogol/site-kernel-codegen`; add `runFontsContractValidate`, `runFontsOriginValidate` from `../fonts.ts` |
| `packages/os/site-kernel-checks/src/command-tables/01-codegen.ts` | Remove `fonts.generate` and `fonts.selfhost.validate` entries; add `fonts.imports.generate`, `fonts.contract.validate`, `fonts.origin.validate` entries |
| `packages/os/site-kernel-checks/src/pipelines/build-prepare.ts` | Replace `{ command: "fonts.generate" }` with `{ command: "fonts.imports.generate" }` (line 64) |
| `packages/os/site-kernel-checks/src/pipelines/apps-check-author.ts` | Add `{ command: "fonts.contract.validate" }` after `biome.coverage.hint` (line 284) |
| `packages/os/site-kernel-checks/src/pipelines/apps-check-postbuild.ts` | Replace `{ command: "fonts.selfhost.validate" }` with `{ command: "fonts.origin.validate" }` (line 28) |
| `packages/os/site-kernel-checks/src/generator-ownership.ts` | Remove entries for `src/styles/fonts.generated.css` and `public/fonts/{file}.woff2` (lines 87-88); add `src/styles/fonts.imports.css` → `fonts.imports.generate` |
| `packages/os/site-kernel-codegen/src/templates/app-boilerplate/src/styles/global.template.css` | Replace `@import "./fonts.generated.css"` with `@import "./fonts.imports.css"` (line 39); update comment |
| `packages/os/site-kernel-codegen/src/templates/app-boilerplate/src/styles/fonts.imports.template.css` | New template file seeding default Inter 400/500/600 imports |
| `packages/os/site-kernel-codegen/src/app-boilerplate.ts` | Add `fonts.imports.css` to `files[]` in `runGenerateGlobalStyles` (line 188), reading from `fonts.imports.template.css` (G5) |

### 2.2 Configuration and data

| File | Change |
| --- | --- |
| `packages/ontology/biomes/handwerk-material-warm.yaml` | Add `fonts:` section: Inter (400,500,600), Playfair Display (400,700; italic 400), DM Mono (300,400,500) |
| `packages/ontology/biomes/nonprofit-trust.yaml` | Add `fonts:` section: Inter (400,500,600), Lora (400,500,600,700) |
| `packages/ontology/biomes/check-concrete-blueprint.yaml` | Change `headingFamily` from `'Inter Display', system-ui, sans-serif` to `'Inter', system-ui, sans-serif` (G4). Add `fonts:` section: Inter (400,500,600) |
| `apps/webgogol-com/package.json` | Add dependencies: `@fontsource/inter`, `@fontsource/playfair-display`, `@fontsource/dm-mono` |
| `apps/nicaragua-projekt/package.json` | Add dependencies: `@fontsource/inter`, `@fontsource/lora` |
| `apps/check-webgogol-com/package.json` | Add dependencies: `@fontsource/inter` |
| `apps/webgogol-com/src/styles/global.css` | Replace `@import "./fonts.generated.css"` with `@import "./fonts.imports.css"` (line 45) |
| `apps/nicaragua-projekt/src/styles/global.css` | Same replacement (line 45) |
| `apps/check-webgogol-com/src/styles/global.css` | Same replacement (line 45) |

### 2.3 Documentation and specs

| File | Change |
| --- | --- |
| `docs/adrs/adr-0001-self-host-playfair-dm-mono-for-webgogol-com.md` | Set `status: superseded`, add `supersededBy: [RFC-0371]` in frontmatter |
| `AGENTS.md` (root) | Add "Font licensing" section: all web fonts from `@fontsource/*`, approved license list, redistribution obligation |
| `docs/requirements.xml` | Sync biome contract extension (new `fonts` field) |
| `docs/technology.xml` | Sync Fontsource CSS import pattern |
| `docs/development-plan.xml` | Sync font pipeline rollout phases |

### 2.4 Validation and pipelines

| Pipeline                        | Change                                              |
| ------------------------------- | --------------------------------------------------- |
| `APPS_BUILD_PREPARE_PIPELINE`   | `fonts.generate` → `fonts.imports.generate`         |
| `APPS_CHECK_AUTHOR_PIPELINE`    | Add `fonts.contract.validate`                       |
| `APPS_CHECK_POSTBUILD_PIPELINE` | `fonts.selfhost.validate` → `fonts.origin.validate` |

## 3. Step sequence

### Step 1. Add `fonts` field to biome Zod schema

**Goal:** Extend `biomeSchema` to accept the new optional `fonts` array so biome YAMLs can declare Fontsource packages.

**Agent actions:**

- Add `biomeFontEntrySchema` (z.object with `family`, `package`, `weights`, `italicWeights` — `.strict()`)
- Add `biomeFontsSchema = z.array(biomeFontEntrySchema).optional()`
- Add `fonts: biomeFontsSchema` to `biomeSchema` (before `.strict()` close)
- Export `BiomeFontEntry` and `BiomeFontsConfig` types
- Add `<CHANGE_SUMMARY>` entry referencing RFC-0371

**Validation:**

- `pnpm --filter @gogol/ontology run build:check` passes
- `pnpm exec site-kernel run biome.contract.validate --all` still passes (fonts is optional)

**Completion criterion:** `biomeSchema` accepts a `fonts` key; existing biome YAMLs without `fonts` still validate.

**Human review:** no

---

### Step 2. Add `fonts` sections to all 3 biome YAMLs

**Goal:** Declare the Fontsource packages each biome needs, replacing the global `SELF_HOSTED_FONTS` registry.

**Agent actions:**

- `handwerk-material-warm.yaml`: add `fonts:` with Inter (400,500,600), Playfair Display (400,700; italicWeights: [400]), DM Mono (300,400,500)
- `nonprofit-trust.yaml`: add `fonts:` with Inter (400,500,600), Lora (400,500,600,700)
- `check-concrete-blueprint.yaml`: change `headingFamily` from `'Inter Display', system-ui, sans-serif` to `'Inter', system-ui, sans-serif` (G4); add `fonts:` with Inter (400,500,600) — `JetBrains Mono` remains system fallback (not in `fonts`)

**Validation:**

- `pnpm exec site-kernel run biome.contract.validate --all` passes with new `fonts` sections

**Completion criterion:** All 3 biome YAMLs have valid `fonts` sections that `biome.contract.validate` accepts.

**Human review:** no

---

### Step 3. Implement `fonts.imports.generate` command

**Goal:** Create the generator that reads the biome `fonts` section and emits `src/styles/fonts.imports.css` with `@import "@fontsource/..."` lines.

**Agent actions:**

- Create `packages/os/site-kernel-codegen/src/fonts-imports.ts` (new file, alongside `biome-css.ts`):
  - Add `runFontsImportsGenerate` function
  - Use same pattern as `biome-css.ts`: `loadSystemManifest` from `@gogol/site-kernel-content` to get biome id from `system.md`, then read biome YAML from `packages/ontology/biomes/<id>.yaml`, validate with `biomeSchema` from `@gogol/ontology/schemas`
  - For each `fonts[]` entry, emit `@import "@fontsource/<pkg>/<weight>.css"` for each weight; emit `@import "@fontsource/<pkg>/<weight>-italic.css"` for each `italicWeights` entry
  - Write to `apps/<app>/src/styles/fonts.imports.css` with GENERATED marker header
  - Return `{ exitCode: 0, data: { imports: N, cssChanged: boolean } }`
- Export from `packages/os/site-kernel-codegen/src/index.ts`
- Re-export from `packages/os/site-kernel-checks/src/validators/codegen.ts` (from `@gogol/site-kernel-codegen`)
- Register in `command-tables/01-codegen.ts` as `fonts.imports.generate` (scope: app, supportsAllApps: true, mutatesState: true, writes: `["<app>/src/styles/fonts.imports.css"]`)
- Add to `generator-ownership.ts`: `{ path: "src/styles/fonts.imports.css", command: "fonts.imports.generate" }`

**Validation:**

- `pnpm --filter @gogol/site-kernel-codegen run build:check` passes
- `pnpm exec site-kernel run fonts.imports.generate --app webgogol-com` produces correct `fonts.imports.css` with Inter, Playfair Display, DM Mono imports

**Completion criterion:** `fonts.imports.generate --app webgogol-com` writes `src/styles/fonts.imports.css` with 9 `@import` lines matching the RFC example.

**Human review:** no

---

### Step 4. Implement `fonts.contract.validate` command (author-time)

**Goal:** Create the author-time validator with 4 rules: font-binary-in-public, no-fontsource-import, fontsource-package-missing, fontsource-license-unapproved.

**Agent actions:**

- In `packages/os/site-kernel-checks/src/fonts.ts`:
  - Add `runFontsContractValidate` function
  - Rule 1 `font-binary-in-public`: scan `apps/<app>/public/**` for `*.woff2`, `*.woff`, `*.ttf`, `*.otf` using `collectFiles`
  - Rule 2 `no-fontsource-import`: scan `apps/<app>/src/styles/**/*.css` for at least one `@import "@fontsource/` or `@import "@fontsource-variable/` line
  - Rule 3 `fontsource-package-missing`: parse `@fontsource/*` imports from CSS, check each against `apps/<app>/package.json` dependencies
  - Rule 4 `fontsource-license-unapproved`: for each `@fontsource/*` package resolved from `node_modules`, read `package.json` `license` field; fail if not in `["OFL-1.1", "Apache-2.0", "MIT", "BSD-3-Clause", "CC-BY-4.0"]`
  - Return `{ exitCode: violations.length > 0 ? 1 : 0, data: { violations } }`
- Register in `command-tables/01-codegen.ts` as `fonts.contract.validate` (scope: app, supportsAllApps: true)
- Re-export from `validators/codegen.ts`

**Validation:**

- `pnpm --filter @gogol/site-kernel-checks run build:check` passes
- `pnpm exec site-kernel run fonts.contract.validate --app webgogol-com --json` returns `status: "pass"` after migration (or reports violations before migration)

**Completion criterion:** `fonts.contract.validate` enforces all 4 rules and returns structured JSON violations.

**Human review:** no

---

### Step 5. Implement `fonts.origin.validate` command (postbuild)

**Goal:** Create the postbuild validator that scans `dist/**/*.html` for external font origins (carried from `fonts.selfhost.validate`).

**Agent actions:**

- In `packages/os/site-kernel-checks/src/fonts.ts`:
  - Add `runFontsOriginValidate` function
  - Reuse the `EXTERNAL_FONT_ORIGIN` regex (already defined)
  - Scan `apps/<app>/dist/**/*.html` using `collectFiles`
  - Return `{ exitCode: violations.length > 0 ? 1 : 0, data: { violations } }`
- Register in `command-tables/01-codegen.ts` as `fonts.origin.validate` (scope: app, supportsAllApps: true)
- Re-export from `validators/codegen.ts`

**Validation:**

- `pnpm --filter @gogol/site-kernel-checks run build:check` passes
- `pnpm exec site-kernel run fonts.origin.validate --app webgogol-com` passes after build (no external font origins)

**Completion criterion:** `fonts.origin.validate` detects external font origins in dist HTML and returns structured violations.

**Human review:** no

---

### Step 6. Wire pipelines

**Goal:** Update pipeline definitions to use new commands and remove old ones.

**Agent actions:**

- `build-prepare.ts`: replace `{ command: "fonts.generate" }` (line 64) with `{ command: "fonts.imports.generate" }`; update comment to reference RFC-0371
- `apps-check-author.ts`: add `{ command: "fonts.contract.validate" }` after `biome.coverage.hint` (line 284)
- `apps-check-postbuild.ts`: replace `{ command: "fonts.selfhost.validate" }` (line 28) with `{ command: "fonts.origin.validate" }`; update comment

**Validation:**

- `pnpm --filter @gogol/site-kernel-checks run build:check` passes
- `pnpm exec site-kernel run kernel.wire --app webgogol-com` regenerates `tools/kernel.config.ts` with new commands

**Completion criterion:** All 3 pipeline files reference the new commands; no references to `fonts.generate` or `fonts.selfhost.validate` remain in pipeline files.

**Human review:** no

---

### Step 7. Migrate all 3 apps

**Goal:** Switch each app from the copy-to-public pipeline to Fontsource CSS imports.

**Agent actions:**

- For each app (`webgogol-com`, `nicaragua-projekt`, `check-webgogol-com`):
  1. Add `@fontsource/*` packages to `package.json` dependencies (matching the biome `fonts` section)
  2. Run `pnpm install` to resolve new dependencies
  3. Run `pnpm exec site-kernel run fonts.imports.generate --app <app>` to produce `fonts.imports.css`
  4. Edit `src/styles/global.css`: replace `@import "./fonts.generated.css"` with `@import "./fonts.imports.css"` and update the comment
  5. Delete `src/styles/fonts.generated.css`
  6. Delete `public/fonts/` directory (all woff2 files)
  7. Run `pnpm exec site-kernel run fonts.contract.validate --app <app>` to confirm compliance

**Validation:**

- `pnpm exec site-kernel run fonts.contract.validate --app <app>` passes for each app
- `pnpm --filter <app> run build:check` passes for each app (includes `fonts.origin.validate` in postbuild)

**Completion criterion:** All 3 apps have `fonts.imports.css`, no `fonts.generated.css`, no `public/fonts/` directory, and pass both `fonts.contract.validate` and `fonts.origin.validate`.

**Human review:** no

---

### Step 8. Remove old commands and `SELF_HOSTED_FONTS` registry

**Goal:** Delete the old `fonts.generate`, `fonts.selfhost.validate`, and `SELF_HOSTED_FONTS` — forward-only, no compatibility layer.

**Agent actions:**

- In `packages/os/site-kernel-checks/src/fonts.ts`: remove `SELF_HOSTED_FONTS` array, `SelfHostedFont` interface, `resolveFontsourceWoff2` function, `copyIfChanged` function, `runFontsGenerate` function, `runFontsSelfhostValidate` function; keep `EXTERNAL_FONT_ORIGIN` regex (used by `runFontsOriginValidate`)
- In `command-tables/01-codegen.ts`: remove `fonts.generate` and `fonts.selfhost.validate` entries; remove `runFontsGenerate`, `runFontsSelfhostValidate` imports
- In `validators/codegen.ts`: remove re-exports of `runFontsGenerate`, `runFontsSelfhostValidate`
- In `generator-ownership.ts`: remove entries for `src/styles/fonts.generated.css` and `public/fonts/{file}.woff2` (lines 87-88)
- In `packages/os/site-kernel-checks/package.json`: remove `@fontsource/dm-mono`, `@fontsource/inter`, `@fontsource/lora`, `@fontsource/playfair-display` from `devDependencies` (G3)
- Update `MODULE_MAP` and `MODULE_CONTRACT` in `fonts.ts` to reflect new commands

**Validation:**

- `pnpm --filter @gogol/site-kernel-checks run build:check` passes
- `grep -r "fonts.generate\|fonts.selfhost.validate\|SELF_HOSTED_FONTS" packages/os/site-kernel-checks/src/` returns no results
- `grep -r "@fontsource" packages/os/site-kernel-checks/package.json` returns no results

**Completion criterion:** No references to old commands or `SELF_HOSTED_FONTS` remain in `site-kernel-checks` source.

**Human review:** no

---

### Step 9. Update codegen templates

**Goal:** Ensure new apps scaffolded via `onboarding.scaffold` get `fonts.imports.css` from day one.

**Agent actions:**

- `packages/os/site-kernel-codegen/src/templates/app-boilerplate/src/styles/global.template.css`:
  - Replace `@import "./fonts.generated.css"` (line 39) with `@import "./fonts.imports.css"`
  - Update comment from `RFC-0164: self-hosted @font-face (generated by fonts.generate)` to `RFC-0371: Fontsource CSS imports (generated by fonts.imports.generate)`
- Create `packages/os/site-kernel-codegen/src/templates/app-boilerplate/src/styles/fonts.imports.template.css`:

  ```css
  /* GENERATED. Do not change this line unless the file contains project specific changes. */
  /* fonts.imports.generate (RFC-0371) — Fontsource CSS imports; Vite bundles woff2 as hashed _astro/ assets. */

  @import "@fontsource/inter/400.css";
  @import "@fontsource/inter/500.css";
  @import "@fontsource/inter/600.css";
  ```

- In `packages/os/site-kernel-codegen/src/app-boilerplate.ts` (`runGenerateGlobalStyles`, line 188):
  - Add a second entry to the `files[]` array for `fonts.imports.css`, reading from `readTemplate("src/styles/fonts.imports.template.css")` (G5)
  - This ensures `fonts.imports.css` exists immediately after scaffolding, before the first `build.prepare`

**Validation:**

- `pnpm --filter @gogol/site-kernel-codegen run build:check` passes
- `pnpm exec site-kernel run app.boilerplate.validate --app webgogol-com` passes (template matches generated file)

**Completion criterion:** Codegen template references `fonts.imports.css`; new template file exists with default Inter imports.

**Human review:** no

---

### Step 10. Update ADR-0001 status

**Goal:** Mark ADR-0001 as superseded by RFC-0371.

**Agent actions:**

- In `docs/adrs/adr-0001-self-host-playfair-dm-mono-for-webgogol-com.md`:
  - Set `status: superseded`
  - Add `supersededBy: [RFC-0371]` to frontmatter
  - Add a note at the end of the document: "Superseded by RFC-0371 — the delivery mechanism changes from copy-to-public to Fontsource CSS imports. The font family selections (Playfair Display, DM Mono, Inter) remain valid."

**Validation:**

- `pnpm exec site-kernel run adr.validate ADR-0001 --json` passes

**Completion criterion:** ADR-0001 has `status: superseded` and `supersededBy: [RFC-0371]`.

**Human review:** no

---

### Step 11. Update root AGENTS.md and Compass XML

**Goal:** Document the Fontsource CSS import policy and sync Compass files.

**Agent actions:**

- Add "Font licensing" section to root `AGENTS.md` (after the existing CMS-friendly content surface section or in the most appropriate location):
  - All web fonts must come from `@fontsource/*` packages
  - Approved license list: OFL-1.1, Apache-2.0, MIT, BSD-3-Clause, CC-BY-4.0
  - `fonts.contract.validate` enforces the license check
  - Font binaries in `public/` are forbidden
  - Font selection is biome-driven via the `fonts` section in biome YAML
- Sync `docs/requirements.xml` — biome contract extension (new `fonts` field)
- Sync `docs/technology.xml` — Fontsource CSS import pattern
- Sync `docs/development-plan.xml` — font pipeline rollout phases

**Validation:**

- `pnpm exec site-kernel run rfc.validate RFC-0371 --json` passes
- Compass files are consistent with the implemented changes

**Completion criterion:** Root `AGENTS.md` has a "Font licensing" section; 3 Compass XML files updated.

**Human review:** no

---

### Step 12. Full validation and evidence

**Goal:** Run the complete validation suite and emit verification evidence.

**Agent actions:**

- Run `pnpm exec site-kernel run rfc.validate RFC-0371 --json` — must pass
- Run `pnpm --filter @gogol/ontology run build:check`
- Run `pnpm --filter @gogol/site-kernel-checks run build:check`
- Run `pnpm --filter @gogol/site-kernel-codegen run build:check`
- For each app: `pnpm --filter <app> run build:check` — must pass (includes `fonts.contract.validate` in author pipeline and `fonts.origin.validate` in postbuild)
- Run `pnpm exec site-kernel run rfc.verification.emit --id RFC-0371` (RFC-0330)
- Transition RFC-0371 to `implemented` per RFC-0224 preconditions

**Validation:**

- All build:check commands pass
- `rfc.validate` passes
- Verification evidence file emitted

**Completion criterion:** All acceptance criteria checkboxes in RFC-0371 are checkable; RFC status transitions to `implemented`.

**Human review:** no

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec site-kernel run rfc.validate --id RFC-0371`
- `pnpm --filter @gogol/ontology run build:check`
- `pnpm --filter @gogol/site-kernel-checks run build:check`
- `pnpm --filter @gogol/site-kernel-codegen run build:check`
- `pnpm --filter webgogol-com run build:check`
- `pnpm --filter nicaragua-projekt run build:check`
- `pnpm --filter check-webgogol-com run build:check`
- `pnpm exec site-kernel run fonts.contract.validate --all --json`
- `pnpm exec site-kernel run rfc.verification.emit --id RFC-0371` (RFC-0330)

### 4.2 Evidence artifacts

- `docs/rfcs/verification/rfc-0371.generated.json` — verification evidence (RFC-0330)
- Commit messages referencing `RFC-0371` in the subject line (RFC-0265 commit hygiene)

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Vite asset path changes (`/_astro/*.woff2` instead of `/fonts/*.woff2`) | Step 7 deletes `public/fonts/`; `fonts.origin.validate` (Step 5) catches external origin regressions; same-origin paths are CDN-compatible |
| Missing `@fontsource/*` dependency | Step 4 `fontsource-package-missing` rule catches before build; Step 7 adds dependencies to each app's `package.json` |
| Biome font section drift (family in `fonts` not in `typography.*Family`) | Step 3 `fonts.imports.generate` can warn on unused families; current 3 biomes are manually verified to match typography tokens |
| License file distribution | Accepted as nonGoal in RFC; NPM package availability satisfies distribution requirement |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-50 (Notausgang export), run `pnpm exec site-kernel run rfc.supersede.propose --id RFC-0371 --reason "..." --invariant "DNA-50"` instead of working around it (RFC-0334).
- If Vite cannot resolve `@fontsource/*` CSS imports from app `package.json` dependencies (e.g., pnpm workspace hoisting issue), investigate the root cause before adding workarounds — the RFC's per-app dependency model is the correct approach.
- If `fonts.contract.validate` produces false positives during migration (e.g., font binaries in `public/` that are not from the old pipeline), investigate before suppressing the rule.
