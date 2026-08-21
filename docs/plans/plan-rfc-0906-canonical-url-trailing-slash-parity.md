---
rfcId: RFC-0906
planId: PLAN-RFC-0906-01
status: draft
owner: architecture
createdAt: 2026-08-22
updatedAt:
scope:
  apps: []
  packages:
    - "@warpgogol/werkstatt-site"
  services: []
  docs:
    - docs/architecture-dna.md
    - packages/werkstatt-site/AGENTS.md
    - docs/verification-plan.xml
---

# Implementation Plan: RFC-0906

## 1. Objectives

- [ ] Runtime fix: `pageUrl` in `resolve-route.ts` uses `canonicalPageUrl` instead of `localizeUrl` — maps to acceptance criterion "pageUrl in resolve-route.ts uses canonicalPageUrl instead of localizeUrl"
- [ ] New `canonical.html-parity.validate` command with CANON-HTML-01..03 rules — maps to acceptance criteria for command registration, CANON-HTML-01, CANON-HTML-02, CANON-HTML-03
- [ ] Enhanced `canonical.url.validate` with CANON-04 rule — maps to acceptance criterion "canonical.url.validate enhanced with CANON-04"
- [ ] Pipeline integration in `SITES_CHECK_POSTBUILD_PIPELINE` — maps to acceptance criterion "canonical.html-parity.validate added to SITES_CHECK_POSTBUILD_PIPELINE"
- [ ] DNA-85 entry in `docs/architecture-dna.md` — maps to acceptance criterion "DNA-85 added to docs/architecture-dna.md"
- [ ] Unit tests pass — maps to acceptance criterion "Unit tests pass"
- [ ] Documentation sync (AGENTS.md, verification-plan.xml) — maps to acceptance criteria for AGENTS.md and verification-plan

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/werkstatt-site/src/domain/share/astro/page-handler/resolve-route.ts` — modified: `pageUrl` construction (line 1113) changed from `localizeUrl` to `canonicalPageUrl`; add import of `canonicalPageUrl` from `../canonical-url.ts`
- `packages/werkstatt-site/src/checks/canonical-html-parity.ts` — new file: `canonical.html-parity.validate` command implementation
- `packages/werkstatt-site/src/checks/canonical-url.ts` — modified: add CANON-04 rule (HTML canonical in expected set) after existing CANON-01..03 checks
- `packages/werkstatt-site/src/checks/command-tables/09b-build-artifacts-part2.ts` — modified: register `canonical.html-parity.validate` command entry
- `packages/werkstatt-site/src/checks/pipelines/sites-check-postbuild.ts` — modified: add `canonical.html-parity.validate` step after `canonical.url.validate`
- `packages/werkstatt-site/src/tests/canonical-html-parity.test.ts` — new file: unit tests for CANON-HTML-01..03 rules

### 2.2 Configuration and data

No configuration or data files affected.

### 2.3 Documentation and specs

- `docs/rfcs/rfc-0906-canonical-url-trailing-slash-parity.md` — read-only reference (accepted status)
- `docs/architecture-dna.md` — modified: DNA-85 entry already exists (added during RFC creation); verify content matches RFC
- `packages/werkstatt-site/AGENTS.md` — modified: document `canonical.html-parity.validate` command in Check commands section
- `docs/verification-plan.xml` — already contains CANON-HTML references (line 551); verify completeness

### 2.4 Validation and pipelines

- `SITES_CHECK_POSTBUILD_PIPELINE` — modified: new step after `canonical.url.validate`
- `pnpm --filter @warpgogol/werkstatt-site run build:check` — typecheck must pass
- `pnpm --filter @warpgogol/werkstatt-site test` — unit tests must pass

## 3. Step sequence

### Step 1. Runtime fix — pageUrl uses canonicalPageUrl

**Goal:** Fix the root cause: `pageUrl` in `resolve-route.ts` must use `canonicalPageUrl` instead of `localizeUrl` to produce trailing-slash-correct canonical URLs.

**Agent actions:**

- Add import of `canonicalPageUrl` and `CanonicalUrlOptions` from `../canonical-url.ts` to `resolve-route.ts`
- Replace the `pageUrl` construction at line 1113 from `new URL(localizeUrl(...), origin)` to `new URL(canonicalPageUrl({ lang, route: canonicalSlug, kind: "html" }, { baseUrl: origin, defaultLanguage: defaultLang, supportedLanguages: supportedLangs, trailingSlash: "always" }))`
- Verify `supportedLangs` is in scope (it is — defined at line 1037 as `registry.supportedLanguages`)

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check` — typecheck passes

**Completion criterion:** `pageUrl` in `resolve-route.ts` is constructed via `canonicalPageUrl` with `trailingSlash: "always"`, producing URLs with trailing slashes.

**Human review:** no

---

### Step 2. New canonical.html-parity.validate command

**Goal:** Create the new post-build validator that scans rendered HTML for `<link rel="canonical">` and `<meta property="og:url">` and compares each against `canonicalPageUrl` output.

**Agent actions:**

- Create `packages/werkstatt-site/src/checks/canonical-html-parity.ts`:
  - Import `diagnosticsResult` from `../result-helpers.ts`, `Diagnostic` from `@warpgogol/werkstatt/kernel`, `loadSystemManifest` from `@warpgogol/werkstatt-site/content`, `canonicalPageUrl` and `CanonicalUrlOptions` from `@warpgogol/werkstatt-site/share/astro/canonical-url`, `requireAstroSitePaths` from `@warpgogol/werkstatt-site/paths`, `readAstroSiteUrl` from `./lib/astro-site-url.ts`, `defaultLanguageFromManifest` from `./lib/i18n.ts`
  - Implement `runCanonicalHtmlParityValidate` function:
    - Load system.md manifest, build expected canonical URL map (pageId × lang → canonicalPageUrl output), reusing the same logic as `canonical-url.ts` lines 99-110
    - Walk `dist/client/**/*.html`
    - For each HTML file: extract `<link rel="canonical">` href, extract `<meta property="og:url">` content, resolve expected canonical URL from file path
    - Emit CANON-HTML-01 (canonical href ≠ expected), CANON-HTML-02 (og:url ≠ expected), CANON-HTML-03 (canonical href ≠ og:url) — all severity: error
    - Return `diagnosticsResult("canonical.html-parity.validate", diagnostics)`
  - Handle edge cases: missing `dist/client/` → skip with info, missing canonical tag → skip file, redirect pages → skip

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check` — typecheck passes

**Completion criterion:** `canonical-html-parity.ts` exists, exports `runCanonicalHtmlParityValidate`, and typechecks.

**Human review:** no

---

### Step 3. Enhance canonical.url.validate with CANON-04

**Goal:** Add CANON-04 rule to the existing `runCanonicalUrlValidate` function — check HTML `<link rel="canonical">` hrefs against the expected canonical set.

**Agent actions:**

- In `packages/werkstatt-site/src/checks/canonical-url.ts`, after the existing CANON-01..03 checks (after line 182, before the return):
  - Walk `dist/client/**/*.html` (using `paths.appDirectory + "/dist/client"`)
  - Extract `<link rel="canonical">` href from each HTML file
  - Check each href against `expectedUrls` set
  - If not found → emit CANON-04 diagnostic (severity: warning)
- Add a helper function `extractCanonicalHrefs(html: string): string[]` using the same regex pattern as `jsonld.ts` line 71: `/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i`

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check` — typecheck passes

**Completion criterion:** `runCanonicalUrlValidate` emits CANON-04 warnings for HTML canonical hrefs not in the expected set.

**Human review:** no

---

### Step 4. Register command and add to pipeline

**Goal:** Register `canonical.html-parity.validate` in the command table and add it to `SITES_CHECK_POSTBUILD_PIPELINE`.

**Agent actions:**

- In `packages/werkstatt-site/src/checks/command-tables/09b-build-artifacts-part2.ts`:
  - Add import of `runCanonicalHtmlParityValidate` from `../canonical-html-parity.ts`
  - Add command entry after the existing `canonical.url.validate` entry (after line 762):
    - `name: "canonical.html-parity.validate"`
    - `description: "Validate HTML <link rel=canonical> and og:url against canonicalPageUrl output (RFC-0906)."`
    - `scope: "app"`, `flags: {}`, `supportsAllSites: true`
    - `reads: ["<app>/dist/client/**/*.html", "<app>/src/content/system.md"]`
    - `modulePaths: ["canonical-html-parity.ts"]`
    - `execute: runCanonicalHtmlParityValidate`
- In `packages/werkstatt-site/src/checks/pipelines/sites-check-postbuild.ts`:
  - Add `{ command: "canonical.html-parity.validate" }` after `{ command: "canonical.url.validate" }` (after line 48)

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check` — typecheck passes

**Completion criterion:** `canonical.html-parity.validate` is registered in the command table and present in `SITES_CHECK_POSTBUILD_PIPELINE` after `canonical.url.validate`.

**Human review:** no

---

### Step 5. Unit tests

**Goal:** Write unit tests for `canonical.html-parity.validate` covering CANON-HTML-01..03 and edge cases.

**Agent actions:**

- Create `packages/werkstatt-site/src/tests/canonical-html-parity.test.ts`:
  - Test CANON-HTML-01: canonical href without trailing slash → error
  - Test CANON-HTML-02: og:url without trailing slash → error
  - Test CANON-HTML-03: canonical href ≠ og:url → error
  - Test all-pass: canonical href and og:url both match expected → no errors
  - Test edge case: no canonical tag → skip (no error)
  - Test edge case: missing dist/ → skip with info
  - Mock `loadSystemManifest`, `readAstroSiteUrl`, file reads via test fixtures

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site test -- src/tests/canonical-html-parity.test.ts` — all tests pass

**Completion criterion:** All unit tests pass, covering CANON-HTML-01..03 and edge cases.

**Human review:** no

---

### Step 6. Documentation sync

**Goal:** Update AGENTS.md and verify docs are in sync.

**Agent actions:**

- Update `packages/werkstatt-site/AGENTS.md` Check commands section: add entry for `canonical.html-parity.validate` (RFC-0906) — document CANON-HTML-01..03 rules, pipeline placement
- Verify `docs/architecture-dna.md` DNA-85 entry matches RFC text (already exists, added during RFC creation)
- Verify `docs/verification-plan.xml` contains CANON-HTML references (already present at line 551)
- Run `pnpm exec werkstatt run ecosystem.manifest.generate` if command surfaces changed

**Validation:**

- `git diff docs/architecture-dna.md` — no changes needed (DNA-85 already present)
- `git diff packages/werkstatt-site/AGENTS.md` — new command documented

**Completion criterion:** AGENTS.md documents `canonical.html-parity.validate`; DNA-85 and verification-plan.xml are in sync.

**Human review:** no

---

### Step 7. Validation, review, fix, and stamp

**Goal:** Run full validation suite, code review, fix findings, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Run `pnpm --filter @warpgogol/werkstatt-site run build:check` — typecheck
- Run `pnpm --filter @warpgogol/werkstatt-site test` — all unit tests
- Run `pnpm exec werkstatt run rfc.validate --id RFC-0906` — RFC validation
- Commit all code changes (implementation commit)
- Run `fo-review` via the `skill` tool on all session code changes
- If review findings, run `fo-fix` via the `skill` tool; re-run review (max 3 iterations)
- Check off every acceptance criterion in the RFC with inline `(evidence: <file:line>)` annotations
- Run `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0906 --dry-run` first, then without `--dry-run`
- Commit the stamped RFC separately (stamp commit, separate from implementation commit)
- Run `fo-doc-audit` via the `skill` tool to sync documentation surfaces

**Validation:**

- `git status` — clean working tree
- `pnpm exec werkstatt run rfc.validate --id RFC-0906` — passes
- `pnpm --filter @warpgogol/werkstatt-site run build:check` — passes
- `pnpm --filter @warpgogol/werkstatt-site test` — passes
- Review report exists in `docs/reviews/code/` for this session
- Implementation commit and stamp commit are separate commits

**Completion criterion:** All acceptance criteria checked with evidence; RFC stamped as `implemented`; clean working tree; review passed.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp`.

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate --id RFC-0906`
- `pnpm --filter @warpgogol/werkstatt-site run build:check`
- `pnpm --filter @warpgogol/werkstatt-site test`
- `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0906 --dry-run`

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0906` in the subject line
- Review report in `docs/reviews/code/` for this session
- All acceptance criteria marked `[x]` with inline `(evidence: ...)` annotations

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --------------- | ------------------------ |
| Performance: scanning dist/client/**/*.html | Step 2: same pattern as seo.domain.validate and csp.origins.validate — negligible cost |
| False positives: CANON-HTML-01..03 | Step 2: by design, exact equality check has no false positives; CANON-04 is warning severity for edge-case routes |
| Maintenance burden | Step 2: ~180 lines new file + one-line runtime fix; reuses existing canonicalPageUrl and diagnosticsResult |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-58 (generated-file content determinism), run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0906 --reason "..." --invariant "DNA-58"` instead of working around it.
- If the `canonicalPageUrl` import path is not accessible from `resolve-route.ts` due to package boundary restrictions, escalate to an ADR rather than creating a re-export shim.
