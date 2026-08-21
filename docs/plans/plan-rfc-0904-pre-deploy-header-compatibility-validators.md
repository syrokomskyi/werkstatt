---
rfcId: RFC-0904
planId: PLAN-RFC-0904-01
status: draft
owner: architecture
createdAt: 2026-08-21
updatedAt:
scope:
  apps: []
  packages:
    - werkstatt-site
  services: []
  docs:
    - docs/architecture-dna.md
    - docs/verification-plan.xml
    - packages/werkstatt-site/AGENTS.md
---

# Implementation Plan: RFC-0904

## 1. Objectives

- [ ] O1 — `csp.elements.validate` command implemented and registered — maps to acceptance criteria 1, 3, 4, 5, 6, 12
- [ ] O2 — `headers.coverage.validate` command implemented and registered — maps to acceptance criteria 2, 7, 8, 13
- [ ] O3 — Both commands wired into `SITES_CHECK_POSTBUILD_PIPELINE` — maps to acceptance criterion 9
- [ ] O4 — `--json` output matches `diagnosticsResult` shape — maps to acceptance criterion 10
- [ ] O5 — DNA-83 added to `docs/architecture-dna.md` — maps to acceptance criterion 11
- [ ] O6 — AGENTS.md and `docs/verification-plan.xml` updated — maps to acceptance criterion 12
- [ ] O7 — Unit tests pass for both validators — maps to acceptance criteria 14, 15, 16
- [ ] O8 — `rfc.validate` passes — maps to acceptance criterion 15

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/werkstatt-site/src/checks/csp-elements.ts` — new file, `runCspElementsValidate` handler
- `packages/werkstatt-site/src/checks/headers-coverage.ts` — new file, `runHeadersCoverageValidate` handler
- `packages/werkstatt-site/src/checks/command-tables/31-public-surface.ts` — register both commands
- `packages/werkstatt-site/src/checks/pipelines/sites-check-postbuild.ts` — add both commands after `csp.origins.validate`, before `dist.generated-marker.validate`

### 2.2 Configuration and data

No configuration files. No escape-hatch config in v1 (per RFC nonGoals).

### 2.3 Documentation and specs

- `docs/rfcs/rfc-0904-pre-deploy-header-compatibility-validators.md` — read-only reference
- `docs/architecture-dna.md` — add DNA-83 entry
- `docs/verification-plan.xml` — add CSP-EL-01..03, HDR-COV-01..02 rule IDs
- `packages/werkstatt-site/AGENTS.md` — document both new commands in Check commands section

### 2.4 Validation and pipelines

- `SITES_CHECK_POSTBUILD_PIPELINE` — both commands added
- `pnpm --filter @warpgogol/werkstatt-site run build:check` — typecheck
- `pnpm --filter @warpgogol/werkstatt-site test` — unit tests
- `pnpm exec werkstatt run rfc.validate --id RFC-0904` — RFC validation

## 3. Step sequence

### Step 1. Implement `csp.elements.validate` handler

**Goal:** Create the CSP element compatibility validator that scans rendered HTML for `<object>`, `<embed>`, `<iframe>`, `<audio>`, `<video>`, `<source>` and cross-references against CSP directives.

**Agent actions:**

- Create `packages/werkstatt-site/src/checks/csp-elements.ts`
- Import `parse` from `parse5`, `requireAstroSitePaths` from `@warpgogol/werkstatt-site/paths`, `diagnosticsResult` from `@warpgogol/werkstatt-shared/checks/result-helpers`, `Diagnostic` from `@warpgogol/werkstatt/schemas`
- Import `ElementNode`, `isElementNode`, `hasChildNodes`, `getAttr` from `./dom-helpers.ts`
- Reuse `parseCsp` from `./csp-origins.ts` (already exported) for CSP parsing
- Reuse `collectRenderedHtml` from `./audit/validators/helpers.ts` for HTML file collection
- Implement `ELEMENT_DIRECTIVE_MAP` for `object`, `embed`, `applet` → `object-src`; `iframe` → `frame-src`; `audio`, `video` → `media-src`
- Implement `<source>` parent-context resolution: `<video>`/`<audio>` parent → `media-src`, `<picture>` parent → `img-src`
- Implement same-origin check: `'self'` keyword OR explicit site origin in source list
- Implement `default-src` fallback when specific directive absent
- Rules: CSP-EL-01 (object-src), CSP-EL-02 (frame-src), CSP-EL-03 (media-src) — all error severity
- Skip gracefully if `public/_headers` missing, CSP header missing, or `dist/client/` missing (return `passResult`)
- Export `runCspElementsValidate(input, context): Promise<KernelCommandResult<CheckResult>>`

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check` — typecheck passes
- Manual: `pnpm exec werkstatt run csp.elements.validate --app <test-app> --json` produces correct shape

**Completion criterion:** File exists, typechecks, exports `runCspElementsValidate`, uses `diagnosticsResult` for output, reuses `parseCsp` and `collectRenderedHtml`.

**Human review:** no

---

### Step 2. Implement `headers.coverage.validate` handler

**Goal:** Create the headers path coverage validator that cross-references `_headers` path patterns against `dist/client/` files.

**Agent actions:**

- Create `packages/werkstatt-site/src/checks/headers-coverage.ts`
- Import `picomatch` for glob matching (same as `image-delivery.ts`)
- Import `diagnosticsResult` from `@warpgogol/werkstatt-shared/checks/result-helpers`, `Diagnostic` from `@warpgogol/werkstatt/schemas`
- Import `requireAstroSitePaths` from `@warpgogol/werkstatt-site/paths`
- Parse `_headers` path patterns (lines starting with `/`) and their line numbers
- Convert Cloudflare `_headers` patterns to picomatch-compatible patterns:
  - `/*` → matches all files in dist/client/ root
  - `/dir/*` → matches files directly under dir/
  - `/*.ext` → matches root-level files with that extension
- Track orphan patterns (HDR-COV-01, warning): pattern matches zero files
- Track uncovered typed files (HDR-COV-02, error): files with extensions `[.pdf, .mp4, .webm, .svg]` with no matching pattern
- Skip gracefully if `public/_headers` missing or `dist/client/` missing
- Export `runHeadersCoverageValidate(input, context): Promise<KernelCommandResult<CheckResult>>`

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check` — typecheck passes

**Completion criterion:** File exists, typechecks, exports `runHeadersCoverageValidate`, uses `diagnosticsResult` and `picomatch`.

**Human review:** no

---

### Step 3. Register both commands in command table

**Goal:** Register `csp.elements.validate` and `headers.coverage.validate` in the command table.

**Agent actions:**

- Edit `packages/werkstatt-site/src/checks/command-tables/31-public-surface.ts`
- Add entries for both commands following the pattern of `csp.origins.validate`:
  - `name`: command name
  - `description`: with RFC-0904 reference
  - `scope`: `"app"`
  - `flags`: `{}` (csp.elements) / `{}` (headers.coverage)
  - `supportsAllSites`: `true`
  - `reads`: relevant paths
  - `modulePaths`: `["csp-elements.ts"]` / `["headers-coverage.ts"]`
  - `execute`: `runCspElementsValidate` / `runHeadersCoverageValidate`
- Import the execute functions at the top of the file

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check` — typecheck passes
- `pnpm exec werkstatt run csp.elements.validate --help` — command appears in registry

**Completion criterion:** Both commands registered with correct name, scope `app`, `supportsAllSites: true`. Typecheck passes.

**Human review:** no

---

### Step 4. Wire both commands into post-build pipeline

**Goal:** Add both validators to `SITES_CHECK_POSTBUILD_PIPELINE` at the correct position.

**Agent actions:**

- Edit `packages/werkstatt-site/src/checks/pipelines/sites-check-postbuild.ts`
- Insert `{ command: "csp.elements.validate" }` after `{ command: "csp.origins.validate" }`
- Insert `{ command: "headers.coverage.validate" }` after `csp.elements.validate`
- Add RFC-0904 comment annotations

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check` — typecheck passes

**Completion criterion:** Pipeline array contains both commands in correct order (after `csp.origins.validate`, before `dist.generated-marker.validate`).

**Human review:** no

---

### Step 5. Write unit tests

**Goal:** Create comprehensive unit tests for both validators covering all acceptance criteria.

**Agent actions:**

- Create `packages/werkstatt-site/src/tests/csp-elements.test.ts`:
  - Test CSP-EL-01: `object-src 'none'` blocks `<object>` → error
  - Test CSP-EL-02: `frame-src 'none'` blocks `<iframe>` → error
  - Test CSP-EL-03: `media-src 'none'` blocks `<video>` → error
  - Test pass: `object-src 'self'` with same-origin `<object data="/path.pdf">` → no error
  - Test `<source>` inside `<picture>` maps to `img-src` (not `media-src`)
  - Test `<source>` inside `<video>` maps to `media-src`
  - Test `default-src` fallback when specific directive absent
  - Test skip: no `_headers` → pass
  - Test skip: no `dist/client/` → pass
  - Test explicit site origin in source list (not just `'self'`)
- Create `packages/werkstatt-site/src/tests/headers-coverage.test.ts`:
  - Test HDR-COV-01: orphan pattern → warning
  - Test HDR-COV-02: uncovered `.pdf` file → error
  - Test pass: all tracked types have matching patterns
  - Test `/*` pattern matches root files
  - Test `/dir/*` pattern matches files in subdirectory
  - Test skip: no `_headers` → pass
  - Test skip: no `dist/client/` → pass
- Use the mocking pattern from existing tests (mock `requireAstroSitePaths` or use temp dirs)

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site test` — all tests pass

**Completion criterion:** All test cases pass. Tests cover all acceptance criteria checkboxes.

**Human review:** no

---

### Step 6. Add DNA-83 to architecture-dna.md

**Goal:** Establish the new DNA invariant.

**Agent actions:**

- Edit `docs/architecture-dna.md`
- Add DNA-83 entry after DNA-82:
  ```
  ### DNA-83: Pre-deploy header compatibility gate

  Every CSP directive that controls HTML element loading (object-src, frame-src, media-src) MUST be cross-referenced against built HTML before deployment. Every `_headers` path pattern MUST correspond to actual files in the build output. Established by RFC-0904.
  ```

**Validation:**

- `pnpm exec werkstatt run rfc.validate --id RFC-0904` — validation passes (DNA-83 exists)

**Completion criterion:** DNA-83 entry exists in `docs/architecture-dna.md`.

**Human review:** no — DNA invariant is declared by the accepted RFC

---

### Step 7. Update AGENTS.md and verification-plan.xml

**Goal:** Synchronize documentation artifacts.

**Agent actions:**

- Edit `packages/werkstatt-site/AGENTS.md` — add entries for `csp.elements.validate` and `headers.coverage.validate` in the Check commands section, following the pattern of `csp.origins.validate`
- Edit `docs/verification-plan.xml` — add CSP-EL-01..03 and HDR-COV-01..02 rule IDs to the verification plan

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check` — typecheck passes

**Completion criterion:** Both files updated with new command/rule documentation.

**Human review:** no

---

### Step 8. Validation, review, fix, and stamp

**Goal:** Run full validation suite, code review, fix findings, verify acceptance criteria, and stamp RFC as implemented.

**Agent actions:**

- Run `pnpm exec werkstatt run rfc.validate --id RFC-0904` — must pass
- Run `pnpm --filter @warpgogol/werkstatt-site run build:check` — must pass
- Run `pnpm --filter @warpgogol/werkstatt-site test` — all tests pass
- Run `pnpm exec werkstatt run ecosystem.manifest.generate` if command surfaces changed
- **Run code review:** invoke `fo-review` via the `skill` tool on all session code changes
- **Run fix if needed:** if `fo-review` reported findings, invoke `fo-fix`. Re-run `fo-review` to confirm. Max 3 iterations.
- **Check off acceptance criteria:** verify each criterion against implemented code. Mark `[x]` with inline `(evidence: ...)` annotations.
- **Stamp implemented:** run `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0904 --implementation-commit <sha>`

**Validation:**

- `git status` — no uncommitted changes
- `rfc.validate` passes
- `build:check` passes
- All tests pass
- Review report exists in `docs/reviews/code/`

**Completion criterion:** All validation passes, review findings fixed, all acceptance criteria checked off, RFC stamped as `implemented`.

**Human review:** no — automated via `rfc.implement.stamp`

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate --id RFC-0904`
- `pnpm --filter @warpgogol/werkstatt-site run build:check`
- `pnpm --filter @warpgogol/werkstatt-site test`
- `pnpm exec werkstatt run rfc.verification.emit --id RFC-0904` (RFC-0330, if acceptance probes declared — currently commented out, so this may skip)

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0904` in subject line (RFC-0265)
- Unit test files proving acceptance criteria

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --------------- | ---------------------- |
| Performance — both validators scan dist/client/ | Step 1-2: reuse `collectRenderedHtml` and `picomatch` patterns from existing validators with proven performance |
| False positive rate — HDR-COV-02 | Step 2: tracked types list is deliberately narrow (.pdf, .mp4, .webm, .svg); Step 5: tests verify no false positives for covered types |
| Agent misinterpretation — confusing with csp.origins.validate | Step 1: `fixHint` in diagnostics explicitly states corrective action |
| `<source>` element misclassified | Step 1: parent-context resolution for `<source>`; Step 5: dedicated test for `<picture>` vs `<video>` parent |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-N, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0904 --reason "..." --invariant "DNA-N"` instead of working around it.
- If false positives emerge that cannot be resolved by narrowing the tracked types list, escalate via a follow-up RFC for an escape-hatch config file (per RFC nonGoals).
