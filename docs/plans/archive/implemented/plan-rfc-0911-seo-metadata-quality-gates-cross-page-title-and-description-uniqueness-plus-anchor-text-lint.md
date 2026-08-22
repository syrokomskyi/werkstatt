---
rfcId: RFC-0911
planId: PLAN-RFC-0911-01
status: draft
owner: architecture
createdAt: 2026-08-22
updatedAt:
scope:
  apps: []
  packages:
    - packages/werkstatt-shared/src/content/system-manifest.ts
    - packages/werkstatt-site/src/checks/audit/validators/seo-meta-uniqueness.ts
    - packages/werkstatt-site/src/checks/audit/validators/seo-anchor-text.ts
    - packages/werkstatt-site/src/checks/audit-validators.ts
    - packages/werkstatt-site/src/checks/command-tables/05-seo-audit.ts
    - packages/werkstatt-site/src/checks/pipelines/sites-check-postbuild.ts
    - packages/werkstatt-site/src/checks/tests/seo-meta-uniqueness.test.ts
    - packages/werkstatt-site/src/checks/tests/seo-anchor-text.test.ts
  services: []
  docs:
    - packages/werkstatt-site/AGENTS.md
    - packages/werkstatt-shared/AGENTS.md
    - docs/verification-plan.xml
---

# Implementation Plan: RFC-0911

## 1. Objectives

- [ ] O1 — Extend `SystemManifest` with typed `seo?.anchorText?.extraStopPhrases` field — maps to acceptance criterion "system.md supports `seo.anchorText.extraStopPhrases` extension"
- [ ] O2 — Implement `seo.meta-uniqueness.validate` validator with SEO-UNIQ-01/02 rules — maps to acceptance criterion "seo.meta-uniqueness.validate registered"
- [ ] O3 — Implement `seo.anchor-text.validate` validator with SEO-ANCHOR-01/02 rules and built-in de/uk stop-lists — maps to acceptance criterion "seo.anchor-text.validate registered"
- [ ] O4 — Wire both validators into `SITES_CHECK_POSTBUILD_PIPELINE` as error — maps to acceptance criterion "Both validators wired into pipeline"
- [ ] O5 — Unit tests covering collision detection, translation non-collision, noindex exclusion, whole-text anchor matching, stop-list extension — maps to acceptance criterion "Unit tests"
- [ ] O6 — Documentation sync (AGENTS.md, verification-plan.xml) — maps to acceptance criterion "AGENTS.md updated"

Note: acceptance criterion "warpgogol content greened and passes both validators" is out of scope for this code implementation plan. Content greening is a site-specific mission-scoped task that the operator runs after the code is implemented. The Final Step's acceptance criteria checkoff notes this criterion as "requires separate content greening mission for warpgogol".

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/werkstatt-shared/src/content/system-manifest.ts` — add `seo?` field to `SystemManifest` interface
- `packages/werkstatt-site/src/checks/audit/validators/seo-meta-uniqueness.ts` — new validator
- `packages/werkstatt-site/src/checks/audit/validators/seo-anchor-text.ts` — new validator
- `packages/werkstatt-site/src/checks/audit-validators.ts` — re-export both validator functions
- `packages/werkstatt-site/src/checks/command-tables/05-seo-audit.ts` — register both commands
- `packages/werkstatt-site/src/checks/pipelines/sites-check-postbuild.ts` — wire both into pipeline
- `packages/werkstatt-site/src/checks/tests/seo-meta-uniqueness.test.ts` — new test file
- `packages/werkstatt-site/src/checks/tests/seo-anchor-text.test.ts` — new test file

### 2.2 Configuration and data

- `src/content/system.md` (per-site workpiece) — optional `seo.anchorText.extraStopPhrases` extension; no template change required (optional field)

### 2.3 Documentation and specs

- `packages/werkstatt-site/AGENTS.md` — document both new commands in Check commands section
- `packages/werkstatt-shared/AGENTS.md` — document `seo` field on `SystemManifest`
- `docs/verification-plan.xml` — add SEO-UNIQ-01/02 and SEO-ANCHOR-01/02 rule IDs

### 2.4 Validation and pipelines

- `SITES_CHECK_POSTBUILD_PIPELINE` — both validators added after `seo.meta.validate`
- `pnpm --filter @warpgogol/werkstatt-site run build:check` — typecheck
- `pnpm --filter @warpgogol/werkstatt-shared run build:check` — typecheck
- `pnpm --filter @warpgogol/werkstatt-site run test` — unit tests

## 3. Step sequence

### Step 1. Extend SystemManifest interface with `seo` field

**Goal:** Add typed `seo?.anchorText?.extraStopPhrases` optional field to `SystemManifest`.

**Agent actions:**

- Open `packages/werkstatt-shared/src/content/system-manifest.ts`
- Add `seo?` field to the `SystemManifest` interface (after `ui?`):
  ```ts
  seo?: {
    anchorText?: {
      extraStopPhrases?: Record<string, string[]>;
    };
  };
  ```
- Run typecheck: `pnpm --filter @warpgogol/werkstatt-shared run build:check`

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-shared run build:check` passes

**Completion criterion:** `SystemManifest` interface has `seo?.anchorText?.extraStopPhrases` typed field; typecheck passes.

**Human review:** no

---

### Step 2. Implement `seo.meta-uniqueness.validate` validator

**Goal:** Create the uniqueness validator that detects duplicate titles and descriptions across indexable pages within the same language.

**Agent actions:**

- Create `packages/werkstatt-site/src/checks/audit/validators/seo-meta-uniqueness.ts`
- Implement `runSeoMetaUniquenessValidate` following the pattern of `seo-meta.ts`:
  - Call `loadAuditAppContext(context)` to get `audit.distDirectory`, `audit.systemManifest`
  - Call `collectRenderedHtml(audit.distDirectory)` to get all HTML files
  - If no HTML files, return pass (exit 0, "skipped — no dist/")
  - For each page: skip redirect pages (`isHtmlRedirectPage`), skip `noindex` pages, skip `.well-known` artifacts (same filters as `seo.meta.validate`)
  - Extract `<html lang>` attribute; fall back to route prefix (first path segment matching a supported locale); fall back to `defaultLanguageFromManifest(audit.systemManifest)`
  - Extract `<title>` content (normalized: trim + collapse whitespace)
  - Extract meta description via `extractMetaContent(html, "description", "name")` (normalized)
  - Build per-language maps: `Map<lang, Map<normalizedTitle, file[]>>` and `Map<lang, Map<normalizedDescription, file[]>>`
  - After all pages collected, emit SEO-UNIQ-01 for each title collision (2+ files with same title in same language), SEO-UNIQ-02 for each description collision
  - Use `buildAuditResult` and `finding` from existing helpers
  - Return `exitCode: result.status === "fail" ? 1 : 0`

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check` passes

**Completion criterion:** `seo-meta-uniqueness.ts` exists, exports `runSeoMetaUniquenessValidate`, typecheck passes.

**Human review:** no

---

### Step 3. Implement `seo.anchor-text.validate` validator

**Goal:** Create the anchor-text validator that detects generic anchor text in rendered internal links.

**Agent actions:**

- Create `packages/werkstatt-site/src/checks/audit/validators/seo-anchor-text.ts`
- Implement `runSeoAnchorTextValidate` following the pattern of `seo-internal-linking.ts`:
  - Call `loadAuditAppContext(context)` to get `audit.distDirectory`, `audit.systemManifest`
  - Load built-in stop-lists: `de` and `uk` (hardcoded constants)
  - Load extra stop phrases from `audit.systemManifest.seo?.anchorText?.extraStopPhrases` (typed access via the `seo` field added in Step 1)
  - Merge built-in + extra per language
  - Call `collectRenderedHtml(audit.distDirectory)`
  - If no HTML files, return pass (exit 0, "skipped — no dist/")
  - For each page: skip redirect pages, skip `noindex` pages, skip `.well-known` artifacts
  - Extract all `<a>` elements with `href` (internal links only — same-origin or relative)
  - For each anchor: extract full text content (trim + collapse whitespace + strip punctuation)
  - SEO-ANCHOR-01 (error): if anchor text matches a stop-list phrase (case-insensitive, whole-text match only)
  - SEO-ANCHOR-02 (warning): if anchor text is a bare URL (href text equals link text)
  - Use `buildAuditResult` and `finding` from existing helpers
  - Return `exitCode: result.status === "fail" ? 1 : 0`

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check` passes

**Completion criterion:** `seo-anchor-text.ts` exists, exports `runSeoAnchorTextValidate`, typecheck passes.

**Human review:** no

---

### Step 4. Register commands and re-export validators

**Goal:** Register both new commands in the SEO audit command table and export from the barrel.

**Agent actions:**

- In `packages/werkstatt-site/src/checks/audit-validators.ts`, add:
  ```ts
  export { runSeoMetaUniquenessValidate } from "./audit/validators/seo-meta-uniqueness.ts";
  export { runSeoAnchorTextValidate } from "./audit/validators/seo-anchor-text.ts";
  ```
- In `packages/werkstatt-site/src/checks/command-tables/05-seo-audit.ts`, add two entries to `SEO_AUDIT_COMMANDS`:
  - `seo.meta-uniqueness.validate` — app scope, `supportsAllSites: true`, `reads: ["<app>/dist/client/**/*.html"]`, `execute: runSeoMetaUniquenessValidate`
  - `seo.anchor-text.validate` — app scope, `supportsAllSites: true`, `reads: ["<app>/dist/client/**/*.html"]`, `execute: runSeoAnchorTextValidate`
- Import both functions from `../audit-validators.ts`

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check` passes

**Completion criterion:** Both commands appear in `SEO_AUDIT_COMMANDS`; both functions exported from `audit-validators.ts`; typecheck passes.

**Human review:** no

---

### Step 5. Wire validators into postbuild pipeline

**Goal:** Add both validators to `SITES_CHECK_POSTBUILD_PIPELINE` as error.

**Agent actions:**

- In `packages/werkstatt-site/src/checks/pipelines/sites-check-postbuild.ts`, add after the existing `seo.meta.validate` step:
  ```ts
  { command: "seo.meta-uniqueness.validate" },
  { command: "seo.anchor-text.validate" },
  ```

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check` passes

**Completion criterion:** Both commands listed in `SITES_CHECK_POSTBUILD_PIPELINE` after `seo.meta.validate`; typecheck passes.

**Human review:** no

---

### Step 6. Write unit tests

**Goal:** Comprehensive unit tests for both validators covering all acceptance criteria scenarios.

**Agent actions:**

- Create `packages/werkstatt-site/src/checks/tests/seo-meta-uniqueness.test.ts`:
  - Test: two pages with same `<title>` in same language → SEO-UNIQ-01 error, exit 1
  - Test: two pages with same meta description in same language → SEO-UNIQ-02 error, exit 1
  - Test: de page and uk page with same title → no collision (different languages)
  - Test: `noindex` page excluded from uniqueness check
  - Test: redirect page excluded
  - Test: `.well-known` page excluded
  - Test: single page → pass (trivially satisfied)
  - Test: no `dist/` → pass (skip gracefully)
  - Test: `<html lang>` absent → falls back to route prefix → falls back to manifest default
- Create `packages/werkstatt-site/src/checks/tests/seo-anchor-text.test.ts`:
  - Test: anchor with "hier klicken" text → SEO-ANCHOR-01 error, exit 1
  - Test: anchor with "тут" text → SEO-ANCHOR-01 error, exit 1
  - Test: anchor with descriptive text containing "hier" → no error (whole-text match only)
  - Test: anchor with bare URL text → SEO-ANCHOR-02 warning, exit 0
  - Test: `noindex` page excluded
  - Test: redirect page excluded
  - Test: `extraStopPhrases` from system.md extends built-in stop-list
  - Test: external link (different origin) not checked
  - Test: no `dist/` → pass (skip gracefully)
- Use temp directories with `mkdtemp`, write HTML files, construct `KernelRuntimeContext` mock (same pattern as `trailing-slash.test.ts`)

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run test -- seo-meta-uniqueness seo-anchor-text` passes

**Completion criterion:** All tests pass; test files exist at the specified paths.

**Human review:** no

---

### Step 7. Documentation sync

**Goal:** Update AGENTS.md files and verification-plan.xml with new commands and rules.

**Agent actions:**

- In `packages/werkstatt-site/AGENTS.md`, add both commands to the Check commands section:
  - `seo.meta-uniqueness.validate` — description referencing RFC-0911
  - `seo.anchor-text.validate` — description referencing RFC-0911
- In `packages/werkstatt-shared/AGENTS.md`, document the `seo` field on `SystemManifest` in the relevant section
- In `docs/verification-plan.xml`, add rule IDs:
  - `SEO-UNIQ-01` — cross-page title uniqueness
  - `SEO-UNIQ-02` — cross-page description uniqueness
  - `SEO-ANCHOR-01` — generic anchor text
  - `SEO-ANCHOR-02` — bare URL anchor text (warning)

**Validation:**

- `git diff` shows all three docs modified

**Completion criterion:** All three documentation files updated with new commands/rules.

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize all documentation artifacts, run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Verify every file listed in `scope.docs` is updated — check each path against `git diff`; if a scope doc was not modified, document why.
- Run `pnpm exec werkstatt run ecosystem.manifest.generate` if command surfaces or pipeline topology changed (do not hand-edit `docs/ecosystem.generated.yaml`).
- **Run code review:** invoke `fo-review` via the `skill` tool on all session code changes (`git diff <merge-base-of-session>...HEAD`). Wait for the review report in `docs/reviews/code/`.
- **Run fix if needed:** if `fo-review` reported findings, invoke `fo-fix` via the `skill` tool. Re-run `fo-review` to confirm all findings are resolved. Maximum 3 iterations.
- **Check off acceptance criteria:** verify each criterion in the RFC against the implemented code. Mark `[x]` for verified criteria with inline `(evidence: <file:line>)` annotations. For unchecked `[ ]` criteria, document why.
- **Stamp the RFC as implemented:** run `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0911 --implementation-commit <sha>` to atomically transition `accepted → implemented` (RFC-0476).

**Validation:**

- `git status` — no uncommitted changes from the current session.
- `pnpm exec werkstatt run rfc.validate --id RFC-0911`
- Every file in `scope.docs` is either updated or documented as not-applicable.
- Review report exists in `docs/reviews/code/` for this session.

**Completion criterion:** All documentation artifacts in scope are updated; code review passed (findings fixed if any); all acceptance criteria are checked off with inline `(evidence: ...)` annotations; RFC is stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476), which validates all preconditions atomically. Code review is automated via `fo-review`.

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate --id RFC-0911`
- `pnpm --filter @warpgogol/werkstatt-shared run build:check`
- `pnpm --filter @warpgogol/werkstatt-site run build:check`
- `pnpm --filter @warpgogol/werkstatt-site run test`
- `pnpm exec werkstatt run rfc.acceptance.run --id RFC-0911` (acceptance probes: command-registered for both commands, run for meta-uniqueness)
- `pnpm exec werkstatt run rfc.verification.emit --id RFC-0911` (RFC-0330)

### 4.2 Evidence artifacts

- `docs/rfcs/verification/rfc-0911.generated.json` — verification evidence (RFC-0330)
- Commit messages referencing `RFC-0911` in the subject line (RFC-0265 commit hygiene)

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| False positives on boilerplate-heavy pages | Step 2/3: noindex/redirect/.well-known exclusions implemented same as `seo.meta.validate` |
| Stop-list drift across languages | Step 1: `system.md` extension point (`extraStopPhrases`) allows site-local additions without package releases |
| Agent misinterpretation (mechanical suffixing) | Step 7: AGENTS.md documents that findings require authorial content decisions, not mechanical edits |
| Double-scan performance cost | Step 2/3: consistent with existing SEO validator family pattern (each scans independently); acceptable for ~124 pages |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-N, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0911 --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
