---
rfcId: RFC-0907
planId: PLAN-RFC-0907-01
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
    - docs/verification-plan.xml
    - packages/werkstatt-site/AGENTS.md
    - docs/COMMANDS.md
---

# Implementation Plan: RFC-0907

## 1. Objectives

- [ ] Objective 1 — Export `extractSitemapUrls` from `canonical-url.ts` for reuse. Maps to acceptance criterion: "reuse extractSitemapUrls".
- [ ] Objective 2 — Implement `sitemap.placeholder.validate` command (SITEMAP-PH-01). Maps to acceptance criteria: command registered, emits SITEMAP-PH-01, --json output.
- [ ] Objective 3 — Implement `sitemap.coverage.validate` command (SITEMAP-COV-01, SITEMAP-COV-02). Maps to acceptance criteria: command registered, emits SITEMAP-COV-01/02, --json output.
- [ ] Objective 4 — Wire both commands into `SITES_CHECK_POSTBUILD_PIPELINE` after `dist.sitemap.images.validate`. Maps to acceptance criterion: pipeline integration.
- [ ] Objective 5 — Write unit tests for both validators. Maps to acceptance criterion: unit tests pass.
- [ ] Objective 6 — Update documentation (AGENTS.md, verification-plan.xml, COMMANDS.md). Maps to acceptance criteria: AGENTS.md documents commands, rfc.validate passes.

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/werkstatt-site/src/checks/canonical-url.ts` — modified: export `extractSitemapUrls` (currently private).
- `packages/werkstatt-site/src/checks/sitemap-placeholder.ts` — new file: `sitemap.placeholder.validate` command handler.
- `packages/werkstatt-site/src/checks/sitemap-coverage.ts` — new file: `sitemap.coverage.validate` command handler.
- `packages/werkstatt-site/src/checks/command-tables/09b-build-artifacts-part2.ts` — modified: register both new commands.
- `packages/werkstatt-site/src/checks/pipelines/sites-check-postbuild.ts` — modified: add both commands after `dist.sitemap.images.validate`.
- `packages/werkstatt-site/src/checks/tests/sitemap-placeholder.test.ts` — new file: unit tests.
- `packages/werkstatt-site/src/checks/tests/sitemap-coverage.test.ts` — new file: unit tests.

### 2.2 Configuration and data

No configuration or data files affected.

### 2.3 Documentation and specs

- `docs/rfcs/rfc-0907-sitemap-integrity-validators.md` — read-only reference.
- `packages/werkstatt-site/AGENTS.md` — add entries for `sitemap.placeholder.validate` and `sitemap.coverage.validate` in the Check commands section.
- `docs/verification-plan.xml` — vm-43 entry already exists; verify it matches the corrected pipeline ordering (after `dist.sitemap.images.validate`).
- `docs/COMMANDS.md` — regenerated via `ecosystem.manifest.generate` after command registration.

### 2.4 Validation and pipelines

- `SITES_CHECK_POSTBUILD_PIPELINE` — both commands added after `dist.sitemap.images.validate` (line 56 in `sites-check-postbuild.ts`).
- No CI workflow changes needed.
- No new validate commands beyond the two being created.

## 3. Step sequence

### Step 1. Export `extractSitemapUrls` from `canonical-url.ts`

**Goal:** Make the private `extractSitemapUrls` function reusable by the new validators.

**Agent actions:**

- Change `function extractSitemapUrls(xml: string): string[]` to `export function extractSitemapUrls(xml: string): string[]` in `packages/werkstatt-site/src/checks/canonical-url.ts:41`.
- Verify no naming conflicts with existing exports.

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check` passes.

**Completion criterion:** `extractSitemapUrls` is exported from `canonical-url.ts` and the package typechecks.

**Human review:** no

---

### Step 2. Implement `sitemap.placeholder.validate`

**Goal:** Create the placeholder detection validator.

**Agent actions:**

- Create `packages/werkstatt-site/src/checks/sitemap-placeholder.ts`.
- Implement `runSitemapPlaceholderValidate(input, context)`:
  - Resolve `dist/client/` directory via `requireAstroSitePaths`.
  - Glob `sitemap*.xml` files in `dist/client/` using `collectFiles` from `@warpgogol/werkstatt-shared/share/fs`.
  - If no sitemap files found → return `passResult` with skip message.
  - For each sitemap file: read XML, call `extractSitemapUrls`, check each URL against `/\[[a-zA-Z0-9_-]+\]/`.
  - If placeholder found → push `Diagnostic` with `ruleId: "SITEMAP-PH-01"`, `severity: "error"`, `file: <sitemap path>`, `message`, `fixHint`.
  - Return `diagnosticsResult("sitemap.placeholder.validate", diagnostics)`.
- Define `SitemapPlaceholderResult` interface: `{ checkedUrls: number; placeholderUrls: number }`.

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check` passes.

**Completion criterion:** `sitemap-placeholder.ts` exists, typechecks, and implements the SITEMAP-PH-01 rule per the RFC contract.

**Human review:** no

---

### Step 3. Implement `sitemap.coverage.validate`

**Goal:** Create the coverage cross-reference validator.

**Agent actions:**

- Create `packages/werkstatt-site/src/checks/sitemap-coverage.ts`.
- Implement `runSitemapCoverageValidate(input, context)`:
  - Resolve paths via `requireAstroSitePaths`.
  - Load `system.md` manifest via `loadSystemManifest`.
  - Build expected indexable URL set:
    - For each page with `routes` and not excluded via `output.sitemap`:
      - Exclusion check: `output.sitemap === false` OR `output.sitemap.include === false` (both boolean and object forms).
      - For each `[lang, slug]` in `page.routes`: add `canonicalPageUrl({ lang, route: slug, kind: "html" }, canonicalOpts)`.
  - Collect all sitemap URLs from `dist/client/sitemap*.xml` via `extractSitemapUrls`.
  - For each expected URL not in sitemap URLs → `SITEMAP-COV-01` error.
  - For each sitemap URL not in expected URLs → `SITEMAP-COV-02` warning.
  - Return `diagnosticsResult("sitemap.coverage.validate", diagnostics)`.
- Define `SitemapCoverageResult` interface: `{ expectedPages: number; sitemapUrls: number; missing: number; extra: number }`.
- Handle missing sitemap files or `system.md` → skip with info message.

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check` passes.

**Completion criterion:** `sitemap-coverage.ts` exists, typechecks, and implements SITEMAP-COV-01 and SITEMAP-COV-02 per the RFC contract.

**Human review:** no

---

### Step 4. Register both commands in `09b-build-artifacts-part2.ts`

**Goal:** Add command table entries for both validators.

**Agent actions:**

- Add import for `runSitemapPlaceholderValidate` from `../sitemap-placeholder.ts` at the top of `packages/werkstatt-site/src/checks/command-tables/09b-build-artifacts-part2.ts`.
- Add import for `runSitemapCoverageValidate` from `../sitemap-coverage.ts`.
- Add two `CheckCommandEntry` objects at the end of `BUILD_ARTIFACT_COMMANDS_PART2` array (before the closing `]`), after the `env.example.validate` entry:
  - `sitemap.placeholder.validate`: `scope: "app"`, `flags: {}`, `supportsAllSites: true`, `reads: ["<app>/dist/client/sitemap*.xml"]`, `modulePaths: ["sitemap-placeholder.ts"]`, `execute: runSitemapPlaceholderValidate`.
  - `sitemap.coverage.validate`: `scope: "app"`, `flags: {}`, `supportsAllSites: true`, `reads: ["<app>/dist/client/sitemap*.xml", "<app>/src/content/system.md"]`, `modulePaths: ["sitemap-coverage.ts"]`, `execute: runSitemapCoverageValidate`.
- Add `/* RFC-0907 */` comment above the entries.

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check` passes.
- `pnpm exec werkstatt run sitemap.placeholder.validate --site <id> --json` returns valid JSON (against a built site).
- `pnpm exec werkstatt run sitemap.coverage.validate --site <id> --json` returns valid JSON.

**Completion criterion:** Both commands are registered and callable via the kernel CLI.

**Human review:** no

---

### Step 5. Wire both commands into `SITES_CHECK_POSTBUILD_PIPELINE`

**Goal:** Add both validators to the postbuild pipeline.

**Agent actions:**

- Open `packages/werkstatt-site/src/checks/pipelines/sites-check-postbuild.ts`.
- After the line `{ command: "dist.sitemap.images.validate" },` (line 56), add:
  ```ts
  // RFC-0907: sitemap placeholder and coverage validators.
  { command: "sitemap.placeholder.validate" },
  { command: "sitemap.coverage.validate" },
  ```

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check` passes.

**Completion criterion:** Both commands appear in `SITES_CHECK_POSTBUILD_PIPELINE` after `dist.sitemap.images.validate` and before `passport.verify`.

**Human review:** no

---

### Step 6. Write unit tests

**Goal:** Create unit tests for both validators.

**Agent actions:**

- Create `packages/werkstatt-site/src/checks/tests/sitemap-placeholder.test.ts`:
  - Test 1: sitemap with `[slug]` placeholder → SITEMAP-PH-01 error.
  - Test 2: sitemap with `[version]` placeholder → SITEMAP-PH-01 error.
  - Test 3: sitemap with fully expanded URLs → pass, no diagnostics.
  - Test 4: no sitemap files → skip with info.
  - Test 5: empty sitemap (no URLs) → skip with info.
- Create `packages/werkstatt-site/src/checks/tests/sitemap-coverage.test.ts`:
  - Test 1: indexable page missing from sitemap → SITEMAP-COV-01 error.
  - Test 2: sitemap URL not in expected set → SITEMAP-COV-02 warning.
  - Test 3: all expected pages in sitemap, no extra URLs → pass.
  - Test 4: page excluded via `output.sitemap: false` → not in expected set, no COV-01.
  - Test 5: page excluded via `output.sitemap: { include: false }` → not in expected set, no COV-01.
  - Test 6: no sitemap files → skip with info.
  - Test 7: missing `system.md` → skip with info.
- Mock `requireAstroSitePaths`, `loadSystemManifest`, `collectFiles`, `readFile` as needed. Use temp directories with fixture sitemap XML files.

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site exec vitest run src/checks/tests/sitemap-placeholder.test.ts` passes.
- `pnpm --filter @warpgogol/werkstatt-site exec vitest run src/checks/tests/sitemap-coverage.test.ts` passes.

**Completion criterion:** All unit tests pass with the expected diagnostics for each scenario.

**Human review:** no

---

### Step 7. Update documentation

**Goal:** Synchronize AGENTS.md, verification-plan.xml, and COMMANDS.md.

**Agent actions:**

- Add entries for `sitemap.placeholder.validate` and `sitemap.coverage.validate` to `packages/werkstatt-site/AGENTS.md` in the Check commands section, following the existing format (command name, RFC reference, description, rule IDs, pipeline integration).
- Verify `docs/verification-plan.xml` vm-43 entry matches the corrected pipeline ordering (after `dist.sitemap.images.validate`). Update if needed.
- Run `pnpm exec werkstatt run ecosystem.manifest.generate` to regenerate `docs/COMMANDS.md` with the new commands.
- Run `pnpm exec werkstatt run rfc.validate --id RFC-0907` to verify the RFC still passes validation.

**Validation:**

- `git diff` shows updated AGENTS.md, verification-plan.xml (if needed), and regenerated COMMANDS.md.
- `pnpm exec werkstatt run rfc.validate --id RFC-0907` passes.

**Completion criterion:** All documentation artifacts are updated and consistent with the implementation.

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize all documentation artifacts, run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Update affected `AGENTS.md` files with new commands (done in Step 7).
- Update `docs/verification-plan.xml` (done in Step 7).
- Run `pnpm exec werkstatt run ecosystem.manifest.generate` if command surfaces changed (done in Step 7).
- **Run code review:** invoke `fo-review` via the `skill` tool on all session code changes. Wait for the review report in `docs/reviews/code/`.
- **Run fix if needed:** if `fo-review` reported findings, invoke `fo-fix` via the `skill` tool. Re-run `fo-review` to confirm all findings are resolved. Maximum 3 iterations.
- **Check off acceptance criteria:** verify each criterion in the RFC against the implemented code. Mark `[x]` for verified criteria with inline `(evidence: <file:line>)` annotations.
- **Stamp the RFC as implemented:** run `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0907 --implementation-commit <sha>`.

**Validation:**

- `git status` — no uncommitted changes from the current session.
- `pnpm exec werkstatt run rfc.validate --id RFC-0907` passes.
- Review report exists in `docs/reviews/code/` for this session.

**Completion criterion:** All acceptance criteria are checked off with inline evidence; RFC is stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476).

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate --id RFC-0907`
- `pnpm --filter @warpgogol/werkstatt-site run build:check`
- `pnpm --filter @warpgogol/werkstatt-site exec vitest run src/checks/tests/sitemap-placeholder.test.ts src/checks/tests/sitemap-coverage.test.ts`
- `pnpm exec werkstatt run sitemap.placeholder.validate --site <id> --json` (against a built site)
- `pnpm exec werkstatt run sitemap.coverage.validate --site <id> --json` (against a built site)

### 4.2 Evidence artifacts

- `docs/rfcs/verification/rfc-0907.generated.json` — verification evidence (RFC-0330), if acceptance probes are declared.
- Commit messages referencing `RFC-0907` in the subject line (RFC-0265 commit hygiene).

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Performance — sitemap parsing on every postbuild | Step 2/3: sitemaps are small (thousands of URLs); single-pass regex parse. No mitigation needed per RFC. |
| False positives — SITEMAP-COV-02 warnings on intentionally included non-indexable pages | Step 3: SITEMAP-COV-02 is a warning, not an error. Does not affect exit code. |
| `extractSitemapUrls` is private | Step 1: export it before reuse in Step 2/3. |
| `output.sitemap` object form not handled | Step 3: explicitly handle both `false` and `{ include: false }` forms, matching `isSitemapExcluded` in `routes/registry.ts`. |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-58, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0907 --reason "..." --invariant "DNA-58"` instead of working around it.
- If the sitemap file path convention (`dist/client/` vs `public/`) causes a conflict with `canonical.url.validate`, escalate to the operator — do not silently change the convention.
