---
rfcId: RFC-0898
planId: PLAN-RFC-0898-01
status: draft
owner: architecture
createdAt: 2026-08-21
updatedAt:
scope:
  apps: []
  packages:
    - "@warpgogol/werkstatt-site"
  services: []
  docs:
    - docs/verification-plan.xml
    - packages/werkstatt-site/AGENTS.md
---

# Implementation Plan: RFC-0898

## 1. Objectives

- [ ] O1 — `seo.domain.validate` command registered and implemented — maps to acceptance criterion "seo.domain.validate command registered in 05-seo-audit.ts command table"
- [ ] O2 — `seo.cross-lang-links.validate` command registered and implemented — maps to acceptance criterion "seo.cross-lang-links.validate command registered in 05-seo-audit.ts command table"
- [ ] O3 — Both commands wired into `SITES_CHECK_POSTBUILD_PIPELINE` — maps to acceptance criterion "Both commands added to SITES_CHECK_POSTBUILD_PIPELINE"
- [ ] O4 — `SEO-DOMAIN-01` through `SEO-DOMAIN-05` and `SEO-XLANG-01` rules implemented — maps to acceptance criteria "SEO-DOMAIN-01 through SEO-DOMAIN-05 rules implemented" and "SEO-XLANG-01 rule implemented"
- [ ] O5 — Page templates pass `canonicalUrl` explicitly to `BaseLayout` — maps to acceptance criterion "Page templates pass canonicalUrl explicitly to BaseLayout"
- [ ] O6 — `docs/verification-plan.xml` and `packages/werkstatt-site/AGENTS.md` updated — maps to acceptance criteria for Compass and AGENTS.md sync
- [ ] O7 — Unit tests for each rule (passing and failing cases) — maps to acceptance criterion "Unit tests for each rule"

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/werkstatt-site/src/checks/audit/validators/seo-domain.ts` — **new file**: `runSeoDomainValidate` implementation
- `packages/werkstatt-site/src/checks/audit/validators/seo-cross-lang-links.ts` — **new file**: `runSeoCrossLangLinksValidate` implementation
- `packages/werkstatt-site/src/checks/audit-validators.ts` — add re-exports for new validators
- `packages/werkstatt-site/src/checks/command-tables/05-seo-audit.ts` — register `seo.domain.validate` and `seo.cross-lang-links.validate` commands
- `packages/werkstatt-site/src/checks/pipelines/sites-check-postbuild.ts` — add both commands immediately after `canonical.url.validate` (line 45)
- `packages/werkstatt-site/src/codegen/templates/app-boilerplate/src/pages/[...slug].template.astro` — remove `?? Astro.url.origin` fallback, pass `canonicalUrl={data.semanticPage?.url}`
- `packages/werkstatt-site/src/codegen/templates/app-boilerplate/src/pages/[lang]/[...slug].template.astro` — same template hardening

### 2.2 Configuration and data

- No YAML/JSON config files changed. The dev/staging patterns list is hardcoded in the validator (closed list per RFC).

### 2.3 Documentation and specs

- `docs/verification-plan.xml` — add verification mappings for `SEO-DOMAIN-01` through `SEO-DOMAIN-05` and `SEO-XLANG-01`
- `packages/werkstatt-site/AGENTS.md` — add `seo.domain.validate` and `seo.cross-lang-links.validate` entries in "Check commands" section

### 2.4 Validation and pipelines

- `SITES_CHECK_POSTBUILD_PIPELINE` — both new validators added after `canonical.url.validate`
- Unit test files in `packages/werkstatt-site/src/checks/audit/validators/tests/` (or alongside existing test patterns)

## 3. Step sequence

### Step 1. Implement `seo.domain.validate` validator

**Goal:** Create the domain origin validator that scans rendered HTML for canonical, og:url, hreflang, and JSON-LD url fields, checking origins against `Astro.site`.

**Agent actions:**

- Create `packages/werkstatt-site/src/checks/audit/validators/seo-domain.ts`
- Import `collectRenderedHtml`, `extractMetaContent`, `finding`, `getRoutePathForHtml`, `isHtmlRedirectPage` from `./helpers.ts`
- Import `buildAuditResult`, `loadAuditAppContext` from `../helpers.ts`
- Import `readAstroSiteUrl` from `../../lib/astro-site-url.ts`
- Import `defaultLanguageFromManifest` from `../../lib/i18n.ts`
- Implement `runSeoDomainValidate`:
  - Load audit app context, collect rendered HTML files
  - Read `Astro.site` URL via `readAstroSiteUrl`
  - If no site URL: emit warning diagnostic, skip `SEO-DOMAIN-01` through `SEO-DOMAIN-04`, still run `SEO-DOMAIN-05`
  - For each HTML file (skip redirect pages):
    - Extract `<link rel="canonical">` href → check origin matches site origin (`SEO-DOMAIN-01`)
    - Extract `<meta property="og:url">` content → check origin (`SEO-DOMAIN-02`)
    - Extract all `<link rel="alternate" hreflang>` hrefs → check origins (`SEO-DOMAIN-03`)
    - Extract all `<script type="application/ld+json">` blocks, parse JSON, find all `url` properties recursively → check origins (`SEO-DOMAIN-04`)
    - For all extracted URLs: check against dev/staging patterns `dev.`, `staging.`, `localhost`, `127.0.0.1`, `0.0.0.0`, `.local` (`SEO-DOMAIN-05`)
- Return result via `buildAuditResult` with `diagnosticsResult` pattern

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check` — TypeScript compiles
- Manual review: rule IDs match RFC rule catalog

**Completion criterion:** File exists, exports `runSeoDomainValidate`, TypeScript compiles without errors.

**Human review:** no

---

### Step 2. Implement `seo.cross-lang-links.validate` validator

**Goal:** Create the cross-language link validator that scans rendered HTML for internal links crossing language boundaries.

**Agent actions:**

- Create `packages/werkstatt-site/src/checks/audit/validators/seo-cross-lang-links.ts`
- Import same helpers as Step 1
- Import `loadSystemManifest` from `@warpgogol/werkstatt-site/content`
- Import `defaultLanguageFromManifest` from `../../lib/i18n.ts`
- Implement `runSeoCrossLangLinksValidate`:
  - Load audit app context, collect rendered HTML files
  - Load system manifest for supported languages
  - For each HTML file (skip redirect pages):
    - Determine page language from path prefix (e.g. `/de/...` → `de`, `/` → default language)
    - Extract all `<a href="...">` links
    - Skip external links (different origin)
    - Skip links with `hreflang` attribute on the `<a>` tag
    - Skip links within `<nav>` elements
    - For remaining internal links: extract language prefix from href
    - If link language prefix differs from page language → emit `SEO-XLANG-01` error
- Return result via `buildAuditResult`

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check` — TypeScript compiles

**Completion criterion:** File exists, exports `runSeoCrossLangLinksValidate`, TypeScript compiles without errors.

**Human review:** no

---

### Step 3. Register commands in command table

**Goal:** Register both new commands in `05-seo-audit.ts` and re-export from `audit-validators.ts`.

**Agent actions:**

- Add imports for `runSeoDomainValidate` and `runSeoCrossLangLinksValidate` to `05-seo-audit.ts`
- Add command entries to `SEO_AUDIT_COMMANDS` array:
  - `seo.domain.validate` — scope: `app`, supportsAllSites: true, reads: `dist/client/**/*.html` and `astro.config.mjs`
  - `seo.cross-lang-links.validate` — scope: `app`, supportsAllSites: true, reads: `dist/client/**/*.html` and `src/content/system.md`
- Add re-exports to `audit-validators.ts`

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check`

**Completion criterion:** Both commands appear in `SEO_AUDIT_COMMANDS` with correct execute handlers.

**Human review:** no

---

### Step 4. Wire into post-build pipeline

**Goal:** Add both validators to `SITES_CHECK_POSTBUILD_PIPELINE` immediately after `canonical.url.validate`.

**Agent actions:**

- Edit `packages/werkstatt-site/src/checks/pipelines/sites-check-postbuild.ts`
- After line 45 (`{ command: "canonical.url.validate" }`), add:
  ```ts
  // RFC-0898: canonical domain origin + dev/staging pattern leakage check.
  { command: "seo.domain.validate" },
  // RFC-0898: cross-language internal link consistency.
  { command: "seo.cross-lang-links.validate" },
  ```

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check`

**Completion criterion:** Both commands appear in pipeline after `canonical.url.validate`.

**Human review:** no

---

### Step 5. Harden page templates

**Goal:** Update both `[...slug].template.astro` and `[lang]/[...slug].template.astro` to remove `Astro.url.origin` fallback and pass `canonicalUrl` to `BaseLayout`.

**Agent actions:**

- Edit `[...slug].template.astro`:
  - Change `siteUrl: Astro.site?.toString() ?? Astro.url.origin` → `siteUrl: Astro.site?.toString()`
  - Add `canonicalUrl={data.semanticPage?.url}` to `<BaseLayout>` props
- Edit `[lang]/[...slug].template.astro`:
  - Same two changes

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check`

**Completion criterion:** Both templates pass `canonicalUrl` to `BaseLayout` without `Astro.url.toString()` or `Astro.url.origin` fallbacks.

**Human review:** no

---

### Step 6. Write unit tests

**Goal:** Create unit tests for each rule with passing and failing cases.

**Agent actions:**

- Create `packages/werkstatt-site/src/checks/tests/seo-domain.test.ts`:
  - Test `SEO-DOMAIN-01`: canonical origin mismatch (fail case), match (pass case)
  - Test `SEO-DOMAIN-02`: og:url origin mismatch (fail), match (pass)
  - Test `SEO-DOMAIN-03`: hreflang origin mismatch (fail), match (pass)
  - Test `SEO-DOMAIN-04`: JSON-LD url origin mismatch (fail), match (pass)
  - Test `SEO-DOMAIN-05`: dev/staging pattern in URL (fail), clean URL (pass)
  - Test missing `Astro.site`: warning emitted, domain rules skipped
- Create `packages/werkstatt-site/src/checks/tests/seo-cross-lang-links.test.ts`:
  - Test `SEO-XLANG-01`: DE page links to `/uk/...` without hreflang (fail), with hreflang (skip/pass), same-language link (pass)
  - Test external links are ignored
  - Test nav elements are skipped
- Follow existing test patterns (e.g., `seo-meta.ts` tests, `seo-internal-linking.ts` tests)
- Use `diagnosticsResult` pattern for assertions

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run test -- --reporter=verbose` — all new tests pass

**Completion criterion:** All unit tests pass for both validators, covering each rule with pass and fail cases.

**Human review:** no

---

### Step 7. Update documentation

**Goal:** Sync `docs/verification-plan.xml` and `packages/werkstatt-site/AGENTS.md`.

**Agent actions:**

- Add verification mappings to `docs/verification-plan.xml` for `SEO-DOMAIN-01` through `SEO-DOMAIN-05` and `SEO-XLANG-01`
- Add entries to `packages/werkstatt-site/AGENTS.md` "Check commands" section:
  - `seo.domain.validate` (RFC-0898) — scans rendered HTML for canonical, og:url, hreflang, and JSON-LD url origin mismatches against `Astro.site`. Emits SEO-DOMAIN-01..05. Integrated into `SITES_CHECK_POSTBUILD_PIPELINE` after `canonical.url.validate`.
  - `seo.cross-lang-links.validate` (RFC-0898) — scans rendered HTML for internal links crossing language boundaries without hreflang. Emits SEO-XLANG-01. Integrated into `SITES_CHECK_POSTBUILD_PIPELINE` after `seo.domain.validate`.

**Validation:**

- `git diff docs/verification-plan.xml` shows new vm entries
- `git diff packages/werkstatt-site/AGENTS.md` shows new command entries

**Completion criterion:** Both documentation files updated with new validator entries.

**Human review:** no

---

### Step 8. Validation, review, fix, and stamp

**Goal:** Run full validation suite, code review, fix findings, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Run `pnpm exec werkstatt run rfc.validate --id RFC-0898`
- Run `pnpm --filter @warpgogol/werkstatt-site run build:check`
- Run `pnpm --filter @warpgogol/werkstatt-site run test`
- Run `pnpm exec werkstatt run command.manifest.generate` then `pnpm exec werkstatt run docs.commands.generate` to regenerate `docs/command-manifest.generated.yaml` and `docs/COMMANDS.md` with the new command surfaces
- Run code review: invoke `fo-review` via the `skill` tool on all session code changes
- Run fix if needed: if `fo-review` reported findings, invoke `fo-fix`. Re-run `fo-review` to confirm. Max 3 iterations.
- Check off acceptance criteria: verify each criterion against implemented code. Mark `[x]` with inline `(evidence: <file:line>)` annotations.
- Stamp: `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0898 --implementation-commit <sha>`

**Validation:**

- `git status` — no uncommitted changes from current session
- `pnpm exec werkstatt run rfc.validate --id RFC-0898` — passes
- Review report exists in `docs/reviews/code/`
- All acceptance criteria checked off with evidence

**Completion criterion:** All validation passes, code review clean, acceptance criteria verified, RFC stamped as `implemented`.

**Human review:** no — `accepted → implemented` transition is automated via `rfc.implement.stamp`.

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate --id RFC-0898`
- `pnpm --filter @warpgogol/werkstatt-site run build:check`
- `pnpm --filter @warpgogol/werkstatt-site run test`

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0898` in the subject line
- Unit test outputs demonstrating pass/fail coverage for each rule

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| False positives on cross-language links | Step 2: validator skips links with `hreflang` attribute and links within `<nav>` elements |
| Regex-based HTML parsing | Step 1-2: follows existing regex patterns from `seo-meta.ts` and `canonical-url.ts`; HTML is Astro-generated (well-structured) |
| Performance: scanning all HTML files | Step 1-2: post-build validators scan `dist/client/` only; acceptable for hundreds of pages |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-57, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0898 --reason "..." --invariant "DNA-57"` instead of working around it.
- If the template hardening breaks existing workpiece builds (e.g. `Astro.site` is undefined in dev mode), do not add a fallback — instead investigate why `Astro.site` is missing and fix the root cause.
