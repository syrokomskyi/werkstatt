---
rfcId: RFC-0830
planId: PLAN-RFC-0830-01
status: draft
owner: architecture
createdAt: 2026-08-13
updatedAt:
scope:
  apps: []
  packages:
    - werkstatt-site
  services: []
  docs:
    - packages/werkstatt-site/AGENTS.md
---

# Implementation Plan: RFC-0830

## 1. Objectives

- [ ] O1 — Create `image.delivery.validate` command that scans rendered HTML in `dist/client/` for `<img>` elements and validates IMG-DELIVERY-01 (srcset), IMG-DELIVERY-02 (compression budget), IMG-DELIVERY-04 (LCP attributes) — maps to acceptance criteria 1, 2, 3
- [ ] O2 — Implement `image-delivery.config.yaml` escape hatch loading and override matching — maps to acceptance criterion 5
- [ ] O3 — Wire `image.delivery.validate` into `SITES_CHECK_POSTBUILD_PIPELINE` after `cloudflare.assets.validate` — maps to acceptance criterion 3
- [ ] O4 — Unit tests for each rule with fixture HTML + fixture images — maps to acceptance criterion 6
- [ ] O5 — Update `packages/werkstatt-site/AGENTS.md` with image delivery contract — maps to acceptance criterion 9
- [ ] O6 — `rfc.validate` passes, `build:check` passes, evidence emitted, RFC stamped implemented — maps to acceptance criteria 7, 8, 10

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/werkstatt-site/src/checks/image-delivery.ts` — **new** validator module implementing `runImageDeliveryValidate`
- `packages/werkstatt-site/src/checks/command-tables/09-build-artifacts.ts` — add command table entry for `image.delivery.validate`
- `packages/werkstatt-site/src/checks/pipelines/sites-check-postbuild.ts` — insert `{ command: "image.delivery.validate" }` after `cloudflare.assets.validate` (line 56), before `dist.generated-marker.validate` (line 58)

### 2.2 Configuration and data

- `<app>/src/image-delivery.config.yaml` — **new** optional override config (not created by default; sites opt in)

### 2.3 Documentation and specs

- `packages/werkstatt-site/AGENTS.md` — add `image.delivery.validate` to notable check commands list
- RFC file `docs/rfcs/rfc-0830-*.md` — read-only reference; status transition only

### 2.4 Validation and pipelines

- `SITES_CHECK_POSTBUILD_PIPELINE` — new step after `cloudflare.assets.validate`
- No CI workflow changes needed (pipeline runs within existing build flow)

## 3. Step sequence

### Step 1. Create `image-delivery.ts` validator module

**Goal:** Implement the core validator with all three rules and config loading.

**Agent actions:**

- Create `packages/werkstatt-site/src/checks/image-delivery.ts`
- Implement `runImageDeliveryValidate` with signature `(input: KernelCommandInput, ctx: KernelRuntimeContext) => Promise<KernelCommandResult>`
- Use `requireAstroSitePaths(ctx)` to resolve `appDirectory` and `dist/client` path
- Use `collectRenderedHtml(distDir)` from `audit/validators/helpers.ts` to gather rendered HTML files
- Use `parse5` `parse()` to parse each HTML file and extract all `<img>` elements (src, srcset, loading, decoding, fetchpriority, width, height, sizes attributes). Reference the parse5 tree traversal pattern in `packages/werkstatt-site/src/checks/strip-html-generated-marker.ts` for walking the DefaultTreeAdapterMap node tree
- **IMG-DELIVERY-01:** For each `<img>`, check `srcset` attribute exists and contains ≥2 `w` descriptors. Exceptions: SVG `src`, `width` ≤ 64, `loading="lazy"` + `decoding="async"`
- **IMG-DELIVERY-02:** For each `<img>`, resolve `src` to file path in `dist/client/`, read file with `sharp(srcFile).metadata()` for served dimensions, `fs.stat` for file size. Compute budget: `max(20_000, min(400_000, servedWidth * servedHeight * 0.4))`. Error if >2× budget, warning if 1.5–2×
- **IMG-DELIVERY-04:** Use `fetchpriority="high"` as the LCP marker. Rule has two parts: (1) every `<img>` with `fetchpriority="high"` MUST also have `loading="eager"` and `decoding="async"`; (2) at least one `<img>` with `fetchpriority="high"` MUST exist per page (error if none). This is a proxy — the developer marks the LCP image via `fetchpriority`, the validator checks its attributes
- Implement `image-delivery.config.yaml` loading: read `<app>/src/image-delivery.config.yaml` if present, parse with `yaml.parse`, validate schema (`overrides[]` with `srcPattern`, `rules[]`, `reason`). Match overrides using minimatch-style glob against `img.src`. Skip matched rules for matched images
- Emit `IMG-DELIVERY-CONFIG-01` warning for malformed config
- Return `ImageDeliveryResult` with `findings[]`, `checkedImages`, `status: "pass" | "fail"`
- Skip with `status: "pass"` if `dist/client/` does not exist

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check` — TypeScript compiles
- Manual: `pnpm exec werkstatt run image.delivery.validate --site <test-site> --json` produces valid JSON

**Completion criterion:** `image-delivery.ts` compiles, exports `runImageDeliveryValidate`, implements all three rules + config loading + skip-on-missing-dist.

**Human review:** no

---

### Step 2. Register command in command table

**Goal:** Add `image.delivery.validate` to the build-artifacts command table.

**Agent actions:**

- Edit `packages/werkstatt-site/src/checks/command-tables/09-build-artifacts.ts`
- Import `runImageDeliveryValidate` from `../image-delivery.ts`
- Add command entry:
  ```ts
  {
    name: "image.delivery.validate",
    description: "RFC-0830: scan rendered HTML for responsive srcset, compression budget, and LCP image optimization attributes.",
    scope: "app",
    flags: {},
    supportsAllSites: true,
    reads: ["<app>/dist/client/**/*.html", "<app>/dist/client/_astro/*.{webp,png,jpg,jpeg,avif,gif}", "<app>/dist/client/_img/**/*.webp", "<app>/src/image-delivery.config.yaml"],
    modulePaths: ["image-delivery.ts"],
    execute: runImageDeliveryValidate,
  },
  ```

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check` — TypeScript compiles
- `pnpm exec werkstatt run image.delivery.validate --help` shows command in registry

**Completion criterion:** Command appears in registry, `build:check` passes.

**Human review:** no

---

### Step 3. Wire into post-build pipeline

**Goal:** Insert `image.delivery.validate` into `SITES_CHECK_POSTBUILD_PIPELINE` at the correct position.

**Agent actions:**

- Edit `packages/werkstatt-site/src/checks/pipelines/sites-check-postbuild.ts`
- Insert `{ command: "image.delivery.validate" }` after `{ command: "cloudflare.assets.validate" }` (line 56) and before `{ command: "dist.generated-marker.validate" }` (line 58)
- Add comment: `// RFC-0830: responsive srcset, compression budget, LCP image optimization`

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check` — TypeScript compiles
- Pipeline step ordering verified by reading the file

**Completion criterion:** Pipeline step is inserted at the correct position, `build:check` passes.

**Human review:** no

---

### Step 4. Unit tests

**Goal:** Test each rule independently with fixture HTML and fixture images.

**Agent actions:**

- Create `packages/werkstatt-site/src/checks/tests/image-delivery.test.ts`
- Test IMG-DELIVERY-01: fixture HTML with `<img>` lacking srcset → error; with srcset ≥2 variants → pass; SVG → pass; width ≤ 64 → pass; loading=lazy+decoding=async → pass
- Test IMG-DELIVERY-02: fixture image within budget → pass; 1.5–2× budget → warning; >2× budget → error
- Test IMG-DELIVERY-04: fixture HTML with `fetchpriority="high"` + `loading="eager"` + `decoding="async"` → pass; `fetchpriority="high"` missing `decoding="async"` → error; no `fetchpriority="high"` image on page → error
- Test config loading: valid override skips rule; malformed config → IMG-DELIVERY-CONFIG-01 warning; missing config file → no overrides
- Test skip-on-missing-dist: no `dist/client/` → `status: "pass"`
- Test `--json` output: result has `command`, `status`, `findings[]`, `checkedImages` fields; finding has `rule`, `file`, `line`, `src`, `severity`, `message`, `fixHint`, `data?`
- Use `vi.mock` for `requireAstroSitePaths` to inject temp directory paths
- Create fixture images using `sharp` to generate small valid WebP files in test setup

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run test -- image-delivery` — all tests pass

**Completion criterion:** All test cases pass, covering each rule + config + edge cases.

**Human review:** no

---

### Step 5. Documentation sync

**Goal:** Update AGENTS.md with the new command.

**Agent actions:**

- Edit `packages/werkstatt-site/AGENTS.md` — add `image.delivery.validate` (RFC-0830) to the "Check commands" notable list with a one-line description
- Run `pnpm exec werkstatt run ecosystem.manifest.generate` if command surfaces changed (the new command should appear in the generated manifest)

**Validation:**

- `git diff packages/werkstatt-site/AGENTS.md` shows the addition
- `pnpm exec werkstatt run rfc.validate --id RFC-0830` passes

**Completion criterion:** AGENTS.md updated, ecosystem manifest regenerated if needed.

**Human review:** no

---

### Final Step. Validation, review, fix, and acceptance criteria verification

**Goal:** Run all validation, emit evidence, review code, fix findings, stamp implemented.

**Agent actions:**

- Run `pnpm exec werkstatt run rfc.validate --id RFC-0830` — must pass
- Run `pnpm --filter @warpgogol/werkstatt-site run build:check` — must pass
- Run `pnpm --filter @warpgogol/werkstatt-site run test` — all tests pass
- Run `pnpm exec werkstatt run rfc.verification.emit --id RFC-0830` — emit evidence file
- Commit evidence file
- Check off acceptance criteria in RFC: mark `[x]` for verified criteria with `(evidence: ...)` annotations
- **Note on `warpgogol.com` criterion:** The acceptance criterion "warpgogol.com passes image.delivery.validate after fixing home-bg, hero-bg, promo/poster" requires a separate mission to fix the site's images. The platform deliverable is the validator itself. The site fix is a follow-up mission — mark this criterion as `(evidence: deferred to site mission)` if the site fix has not been done yet
- Run `fo-review` via skill tool on all session code changes
- Run `fo-fix` if review has findings
- Run `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0830 --implementation-commit <sha>` to stamp implemented

**Validation:**

- `git status` — no uncommitted changes
- `rfc.validate` passes
- `build:check` passes
- `test` passes
- Review report in `docs/reviews/code/`

**Completion criterion:** All validation passes, evidence committed, review done (findings fixed if any), RFC stamped `implemented`.

**Human review:** no — `accepted → implemented` is automated via `rfc.implement.stamp`.

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate --id RFC-0830`
- `pnpm --filter @warpgogol/werkstatt-site run build:check`
- `pnpm --filter @warpgogol/werkstatt-site run test`
- `pnpm exec werkstatt run rfc.verification.emit --id RFC-0830` (RFC-0330)

### 4.2 Evidence artifacts

- `docs/rfcs/verification/rfc-0830.generated.json` — verification evidence
- Commit messages referencing `RFC-0830` in the subject line

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| False positives on intentionally large images | Step 1 implements `image-delivery.config.yaml` override matching; Step 4 tests override behavior |
| Build time increase (~2–5s) | Step 1 uses `sharp` metadata (fast header read) and `fs.stat` (no full file read for size); acceptable for post-build |
| Agent confusion (manual srcset instead of ResponsiveImage) | Step 1 `fixHint` in findings points to ResponsiveImage + build-portable provider |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-N, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0830 --reason "..." --invariant "DNA-N"` instead of working around it.
- If `sharp` cannot read WebP dimensions from `dist/client/_astro/` files (Astro-hashed), investigate whether the build-portable provider emits different file paths — do not skip the dimension check silently.
