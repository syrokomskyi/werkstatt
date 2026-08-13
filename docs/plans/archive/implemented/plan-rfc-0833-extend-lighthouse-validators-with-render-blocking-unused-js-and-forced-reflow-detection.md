---
rfcId: RFC-0833
planId: PLAN-RFC-0833-01
status: draft
owner: architecture
createdAt: 2026-08-13
updatedAt:
scope:
  apps: []
  packages:
    - packages/werkstatt-site
  services: []
  docs:
    - docs/architecture-dna.md
    - docs/lighthouse-parity-matrix.yaml
    - packages/werkstatt-site/AGENTS.md
---

# Implementation Plan: RFC-0833

## 1. Objectives

- [ ] LH-13 (forced reflow) implemented in `lighthouse.validate` — maps to acceptance criterion "LH-13 rule implemented in lighthouse.validate"
- [ ] LH-11 (render-blocking CSS) implemented in `lighthouse.budget.check` — maps to "LH-11 rule implemented in lighthouse.budget.check"
- [ ] LH-12 (unreferenced JS bundles) implemented in `lighthouse.budget.check` — maps to "LH-12 rule implemented in lighthouse.budget.check"
- [ ] `findAstroConfig` extended to read `build.inlineStylesheets` — maps to "astro.config.mjs inlineStylesheets setting respected by LH-11"
- [ ] DNA-67 appended to `docs/architecture-dna.md` and `dna.registry.validate` passes — maps to "DNA-67 entry appended" and "dna.registry.validate passes"
- [ ] `docs/lighthouse-parity-matrix.yaml` created with coverage matrix — maps to "docs/lighthouse-parity-matrix.yaml created"
- [ ] Unit tests for LH-11, LH-12, LH-13 — maps to three test acceptance criteria
- [ ] `AGENTS.md` updated with LH-11..13 rules and DNA-67 — maps to "AGENTS.md updated"
- [ ] `rfc.validate` passes on RFC-0833 — maps to "rfc.validate passes on this file"

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/werkstatt-site/src/checks/lighthouse.ts` — extend `runLighthouseValidation` with LH-13, extend `runLighthouseBudgetCheck` with LH-11 and LH-12, extend `findAstroConfig` to extract `build.inlineStylesheets`
- `packages/werkstatt-site/src/checks/tests/lighthouse.test.ts` — new test file for LH-11..13

### 2.2 Configuration and data

- `docs/lighthouse-parity-matrix.yaml` — new generated/tracked file with Lighthouse audit → build-time validator coverage matrix

### 2.3 Documentation and specs

- `docs/architecture-dna.md` — append `## DNA-67 · Pre-deploy Lighthouse parity gate` entry after DNA-66
- `packages/werkstatt-site/AGENTS.md` — document LH-11..13 rules and DNA-67 in the check commands section
- `docs/rfcs/rfc-0833-extend-lighthouse-validators-with-render-blocking-unused-js-and-forced-reflow-detection.md` — read-only reference (acceptance criteria source)

### 2.4 Validation and pipelines

- `lighthouse.validate` (in `SITES_CHECK_AUTHOR_PIPELINE`) — gains LH-13
- `lighthouse.budget.check` (in `SITES_CHECK_POSTBUILD_PIPELINE`) — gains LH-11 and LH-12
- `dna.registry.validate` (in `PACKAGES_CHECK_PIPELINE`) — must pass after DNA-67 addition
- `pnpm --filter @warpgogol/werkstatt-site run build:check` — typecheck
- `pnpm --filter @warpgogol/werkstatt-site run test` — unit tests

## 3. Step sequence

### Step 1. Implement LH-13: Forced reflow pattern detection in `lighthouse.validate`

**Goal:** Add LH-13 rule to `runLighthouseValidation` that detects read-after-write layout patterns in `src/scripts/**/*.ts` and `.astro` inline scripts.

**Agent actions:**

- In `packages/werkstatt-site/src/checks/lighthouse.ts`, add a `LAYOUT_READ_PROPERTIES` set (`offsetWidth`, `offsetHeight`, `offsetTop`, `offsetLeft`, `clientWidth`, `clientHeight`, `clientTop`, `clientLeft`, `scrollTop`, `scrollLeft`, `scrollWidth`, `scrollHeight`, `getBoundingClientRect`, `getClientRects`) and a `DOM_WRITE_PATTERNS` regex (`appendChild`, `insertBefore`, `removeChild`, `innerHTML\s*=`, `textContent\s*=`, `style\.\w+\s*=`, `classList\.add`, `classList\.remove`, `classList\.toggle`).
- Add a `detectForcedReflow(content: string): { line: number; readProp: string; writeStmt: string }[]` function that scans for DOM write followed by layout read without `requestAnimationFrame` separator. The detection logic: find each DOM write statement, then check if a layout read occurs within the next ~10 lines without an intervening `requestAnimationFrame` call.
- In the `runLighthouseValidation` function, after the existing LH-09 check block (inside the `scriptFiles` loop), add LH-13 detection: call `detectForcedReflow(content)` for each script file and push findings with `rule: "LH-13"`, `severity: "warning"`.
- Also scan `.astro` inline scripts (extract `<script>` block contents from `astroFiles` already collected) for LH-13 patterns.
- Update the `CHANGE_SUMMARY` comment in `lighthouse.ts` with: `RFC-0833: add LH-13 forced reflow detection to lighthouse.validate`.

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check` — typecheck passes
- Manual review: LH-13 detection logic matches the RFC specification (read-after-write without rAF separator)

**Completion criterion:** LH-13 rule detects forced reflow patterns in `src/scripts/**/*.ts` and `.astro` inline scripts, reports with `warning` severity, and typecheck passes.

**Human review:** no

---

### Step 2. Implement LH-11: Render-blocking CSS detection in `lighthouse.budget.check`

**Goal:** Add LH-11 rule to `runLighthouseBudgetCheck` that scans `dist/client/**/*.html` for render-blocking `<link rel="stylesheet">` elements, respecting Astro's `inlineStylesheets` config.

**Agent actions:**

- Extend `findAstroConfig` in `lighthouse.ts` to also extract `build.inlineStylesheets` setting. Add `inlineStylesheets?: string` to the return type. Parse the config content for `inlineStylesheets\s*:\s*['"]([^'"]+)['"]`.
- Add a `RENDER_BLOCKING_THRESHOLD_KB = 4` constant (default Astro inline threshold).
- Add a `detectRenderBlockingCss(htmlContent: string, filePath: string, inlineThresholdKb: number): { line: number; href: string; sizeKb?: number }[]` function that:
  1. Finds all `<link rel="stylesheet" href="...">` elements (excluding `media="print"`, `rel="preload"` with `as="style"`, and already-inlined `<style>` blocks).
  2. For external stylesheets, checks the file size against the threshold. Files > threshold are `error`, ≤ threshold are `warning`.
  3. If `inlineStylesheets` is `"auto"` or `"always"`, sheets under the threshold are exempt (already inlined by Astro).
- In `runLighthouseBudgetCheck`, after the existing LH-10 block, add LH-11: collect all `.html` files in `dist/client/`, call `detectRenderBlockingCss` for each, push findings with `rule: "LH-11"`.
- Update `CHANGE_SUMMARY` with: `RFC-0833: add LH-11 render-blocking CSS detection to lighthouse.budget.check`.

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check` — typecheck passes
- Manual review: LH-11 respects `inlineStylesheets` config and size threshold

**Completion criterion:** LH-11 rule detects render-blocking CSS in `dist/client/**/*.html`, respects `inlineStylesheets` setting, reports `error` for > 4 KB and `warning` for ≤ 4 KB, and typecheck passes.

**Human review:** no

---

### Step 3. Implement LH-12: Unreferenced JS bundle detection in `lighthouse.budget.check`

**Goal:** Add LH-12 rule to `runLighthouseBudgetCheck` that detects JS bundles in `dist/client/_astro/` not referenced by any HTML page or referenced JS bundle.

**Agent actions:**

- Add a `buildJsReferenceGraph(htmlFiles: string[], distDir: string): { referenced: Set<string>; unreferenced: string[] }` function that:
  1. Collects all `.html` files in `dist/client/`.
  2. For each HTML file, extracts `<script type="module" src="...">` references to `.js` files.
  3. For each referenced JS file, scans its content for `import("...")` and `from "..."` patterns to find JS→JS imports.
  4. Marks all JS files reachable from any HTML file as "referenced".
  5. Returns unreferenced JS files (those in `dist/client/_astro/` not in the referenced set).
- In `runLighthouseBudgetCheck`, after the LH-11 block, add LH-12: call `buildJsReferenceGraph`, push findings for each unreferenced file with `rule: "LH-12"`, `severity: "error"`, `message: "Unreferenced JS bundle — not imported by any HTML page or referenced JS file"`.
- Update `CHANGE_SUMMARY` with: `RFC-0833: add LH-12 unreferenced JS bundle detection to lighthouse.budget.check`.

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check` — typecheck passes
- Manual review: LH-12 reference graph logic is correct (HTML → JS, JS → JS transitive closure)

**Completion criterion:** LH-12 rule detects completely unreferenced JS bundles in `dist/client/_astro/`, reports with `error` severity, and typecheck passes.

**Human review:** no

---

### Step 4. Add DNA-67 to `docs/architecture-dna.md` and create `docs/lighthouse-parity-matrix.yaml`

**Goal:** Append DNA-67 entry to the architecture DNA registry and create the Lighthouse parity coverage matrix file.

**Agent actions:**

- Append to `docs/architecture-dna.md` after DNA-66:

  ```markdown
  ## DNA-67 · Pre-deploy Lighthouse parity gate

  Every Lighthouse audit that can be deterministically checked at build time MUST have a build-time validator in the Werkstatt pipeline. This prevents relying on post-deploy Lighthouse runs to catch issues that could be caught earlier. The coverage matrix is maintained in `docs/lighthouse-parity-matrix.yaml`. Enforcement: `lighthouse.validate`, `lighthouse.budget.check`. Established by RFC-0833.
  ```

- Create `docs/lighthouse-parity-matrix.yaml` with the coverage matrix from RFC-0833 section "DNA-67":

  ```yaml
  # Lighthouse audit → build-time validator coverage matrix (DNA-67)
  # Maintained as Lighthouse adds new audits. Generated/tracked.
  audits:
    - audit: first-contentful-paint
      validators:
        - image.delivery.validate (RFC-0830)
        - lighthouse.budget.check (LH-11)
      status: covered
    - audit: largest-contentful-paint
      validators:
        - image.delivery.validate (RFC-0830)
        - lighthouse.budget.check (LH-12)
      status: covered
    - audit: total-blocking-time
      validators:
        - lighthouse.validate (LH-02, LH-03)
      status: covered
    - audit: cumulative-layout-shift
      validators:
        - lighthouse.validate (LH-09)
      status: covered
    - audit: speed-index
      validators:
        - image.delivery.validate (RFC-0830)
        - lighthouse.budget.check (LH-11)
      status: covered
    - audit: render-blocking-insight
      validators:
        - lighthouse.budget.check (LH-11)
      status: covered
    - audit: unused-javascript
      validators:
        - lighthouse.budget.check (LH-12)
      status: covered
    - audit: forced-reflow-insight
      validators:
        - lighthouse.validate (LH-13)
      status: covered
    - audit: errors-in-console
      validators:
        - csp.origins.validate (RFC-0831)
      status: covered
    - audit: inspector-issues
      validators:
        - csp.origins.validate (RFC-0831)
      status: covered
    - audit: label-content-name-mismatch
      validators:
        - a11y.label.in.name.validate (RFC-0832)
      status: covered
    - audit: network-dependency-tree-insight
      validators: []
      status: gap
    - audit: image-delivery-insight
      validators:
        - image.delivery.validate (RFC-0830)
      status: covered
  ```

**Validation:**

- `pnpm exec werkstatt run dna.registry.validate` — passes with DNA-67 entry
- `pnpm exec werkstatt run rfc.validate --id RFC-0833` — passes

**Completion criterion:** DNA-67 entry exists in `docs/architecture-dna.md`, `dna.registry.validate` passes, `docs/lighthouse-parity-matrix.yaml` exists with the full coverage matrix.

**Human review:** no

---

### Step 5. Write unit tests for LH-11, LH-12, LH-13

**Goal:** Create `packages/werkstatt-site/src/checks/tests/lighthouse.test.ts` with fixture-based tests for all three new rules.

**Agent actions:**

- Create `packages/werkstatt-site/src/checks/tests/lighthouse.test.ts` with:
  - **LH-13 tests:**
    - Red: fixture TS file with `el.appendChild(child); const w = el.offsetWidth;` (write then read, no rAF) → expects LH-13 warning finding.
    - Green: fixture TS file with `el.appendChild(child); requestAnimationFrame(() => { const w = el.offsetWidth; });` → expects no LH-13 finding.
    - Green: fixture TS file with `const w = el.offsetWidth;` (read only, no write) → expects no LH-13 finding.
  - **LH-11 tests:**
    - Red: fixture HTML with `<link rel="stylesheet" href="/large.css">` and a large CSS file (> 4 KB) → expects LH-11 error finding.
    - Green: fixture HTML with `<link rel="stylesheet" href="/small.css">` and a small CSS file (≤ 4 KB) with `inlineStylesheets: 'auto'` → expects no LH-11 finding.
    - Green: fixture HTML with `<link rel="preload" as="style" onload="this.rel='stylesheet'">` → expects no LH-11 finding.
  - **LH-12 tests:**
    - Red: fixture dist with an unreferenced `.js` file in `_astro/` → expects LH-12 error finding.
    - Green: fixture dist where all `.js` files are referenced by HTML or by other referenced JS → expects no LH-12 finding.
- Use `vi.mock` or temp directory fixtures following the pattern of existing tests in `packages/werkstatt-site/src/checks/tests/`.
- Mock `requireAstroSitePaths` to return temp directory paths.

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run test` — all tests pass
- `pnpm --filter @warpgogol/werkstatt-site run build:check` — typecheck passes

**Completion criterion:** All LH-11, LH-12, LH-13 unit tests pass (red + green fixtures for each rule).

**Human review:** no

---

### Step 6. Update `packages/werkstatt-site/AGENTS.md` with LH-11..13 and DNA-67

**Goal:** Document the new lighthouse rules and DNA-67 in the package AGENTS.md.

**Agent actions:**

- In `packages/werkstatt-site/AGENTS.md`, add to the "Check commands" section:
  - `lighthouse.validate` (RFC-0006, RFC-0833) — LH-01..09, LH-13 (forced reflow detection)
  - `lighthouse.budget.check` (RFC-0006, RFC-0833) — LH-10 (bundle budget), LH-11 (render-blocking CSS), LH-12 (unreferenced JS bundles)
- Add a note about DNA-67 (Pre-deploy Lighthouse parity gate) and reference `docs/lighthouse-parity-matrix.yaml`.

**Validation:**

- Visual review: AGENTS.md accurately reflects the new rules

**Completion criterion:** `packages/werkstatt-site/AGENTS.md` documents LH-11..13 and DNA-67.

**Human review:** no

---

### Step 7. Final validation and acceptance criteria verification

**Goal:** Run all validation commands, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Run `pnpm exec werkstatt run rfc.validate --id RFC-0833` — must pass
- Run `pnpm --filter @warpgogol/werkstatt-site run build:check` — must pass
- Run `pnpm --filter @warpgogol/werkstatt-site run test` — all tests pass
- Run `pnpm exec werkstatt run dna.registry.validate` — must pass with DNA-67
- Verify every acceptance criterion in the RFC against the implemented code. Mark `[x]` for verified criteria with inline `(evidence: <file:line>, <test-or-command>)` annotations.
- **Run code review:** invoke `fo-review` via the `skill` tool on all session code changes. Wait for the review report in `docs/reviews/code/`.
- **Run fix if needed:** if `fo-review` reported findings, invoke `fo-fix` via the `skill` tool. Re-run `fo-review` to confirm all findings are resolved. Maximum 3 iterations.
- **Stamp the RFC as implemented:** run `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0833 --implementation-commit <sha>` to atomically transition `accepted → implemented`.
- Update `packages/werkstatt-site/src/checks/lighthouse.ts` `CHANGE_SUMMARY` if not already done in earlier steps.

**Validation:**

- `git status` — no uncommitted changes from the current session
- `pnpm exec werkstatt run rfc.validate --id RFC-0833` — passes
- Review report exists in `docs/reviews/code/` for this session

**Completion criterion:** All acceptance criteria checked off with inline evidence; code review passed (findings fixed if any); RFC stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476).

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate --id RFC-0833`
- `pnpm --filter @warpgogol/werkstatt-site run build:check`
- `pnpm --filter @warpgogol/werkstatt-site run test`
- `pnpm exec werkstatt run dna.registry.validate`

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0833` in the subject line (RFC-0265 commit hygiene)
- Review report in `docs/reviews/code/` from `fo-review`

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --------------- | ---------------------- |
| LH-12 false positives (SPA-only routes) | Step 3: LH-12 applies only to static-generated HTML pages; SPA-only routes exempt |
| LH-13 false positives (intentional measurement code) | Step 1: `warning` severity, `requestAnimationFrame` exception |
| LH-11 Astro inlineStylesheets interaction | Step 2: `findAstroConfig` extended to read `build.inlineStylesheets`, threshold respected |
| DNA-67 maintenance burden | Step 4: coverage matrix in `docs/lighthouse-parity-matrix.yaml` is a tracked file that can be cross-referenced |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-15 or DNA-67, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0833 --reason "..." --invariant "DNA-N"` instead of working around it.
- If LH-12 reference graph approach proves insufficient (too many false negatives), do not extend LH-12 in-place — create a follow-up RFC for AST-based analysis.
