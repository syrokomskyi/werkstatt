---
rfcId: RFC-0576
planId: PLAN-RFC-0576-01
status: draft
owner: architecture
createdAt: 2026-07-29
updatedAt:
scope:
  apps: []
  packages:
    - "@warpgogol/site-kernel-checks"
  services: []
  docs:
    - packages/os/site-kernel-checks/AGENTS.md
---

# Implementation Plan: RFC-0576

## 1. Objectives

- [ ] Objective 1 — Register LINK-01..03, MIRROR-MISSING, MIRROR-01..03 in `DIAGNOSTIC_RULES` (acceptance criteria 1–3)
- [ ] Objective 2 — Migrate `content.links.validate` to `diagnosticsResult` with registered ruleIds and fixHints (acceptance criterion 4)
- [ ] Objective 3 — Migrate `mirroring.validate` to `diagnosticsResult` with MIRROR-MISSING ruleId, fixHint, and error/warning severity distinction (acceptance criterion 5)
- [ ] Objective 4 — Migrate `page.blocks.mirror.validate` to `diagnosticsResult` with MIRROR-01..03 ruleIds, preserving existing fixHints (acceptance criterion 6)
- [ ] Objective 5 — Normalize `parseUrl` trailing slashes for non-root paths (acceptance criterion 7)
- [ ] Objective 6 — Pass `diagnostic.shape.lint` for all three migrated validators (acceptance criterion 8)
- [ ] Objective 7 — Remove `content-links.ts` from DSL-04 baseline (acceptance criterion 9)

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/os/site-kernel-checks/src/diagnostics/rules/content-surface.ts` — add 8 rule descriptors
- `packages/os/site-kernel-checks/src/content-links.ts` — migrate to `diagnosticsResult`, normalize `parseUrl`, add fixHints
- `packages/os/site-kernel-checks/src/checks/mirroring.ts` — migrate from custom result to `diagnosticsResult`, add fixHint, preserve error/warning severity
- `packages/os/site-kernel-checks/src/page-blocks-mirror.ts` — migrate from `PageBlocksMirrorResult` to `diagnosticsResult`, preserve fixHints
- `packages/os/site-kernel-checks/src/diagnostics/dsl04-baseline.generated.yaml` — remove `content-links.ts` entry
- `packages/os/site-kernel-checks/src/tests/page-blocks-mirror.test.ts` — update assertions from `data.violations` to `data.diagnostics`
- `packages/os/site-kernel-checks/src/tests/content-links.test.ts` — new test file for `parseUrl` normalization and canonical diagnostic output
- `packages/os/site-kernel-checks/src/tests/mirroring.test.ts` — new test file for canonical diagnostic output and severity distinction

### 2.2 Configuration and data

- No configuration changes. No `system.md` changes. No ontology catalogs.

### 2.3 Documentation and specs

- `packages/os/site-kernel-checks/AGENTS.md` — update module table entries for `content-links.ts`, `checks/mirroring.ts`, `page-blocks-mirror.ts` to reflect canonical Diagnostics migration
- No `docs/*.xml` Compass files need updates — this is a package-internal migration with no repository-wide semantic change.
- No `docs/architecture-dna.md` changes — DNA-11 is already documented; this RFC strengthens enforcement, not the invariant itself.

### 2.4 Validation and pipelines

- `diagnostic.shape.lint` — must pass for all three migrated validators (DSL-02: registered ruleIds; DSL-04: `content-links.ts` no longer in baseline)
- `pnpm --filter @warpgogol/site-kernel-checks run build:check` — typecheck
- `pnpm --filter @warpgogol/site-kernel-checks run test` — unit tests

## 3. Step sequence

### Step 1. Register rule descriptors in content-surface.ts

**Goal:** Add LINK-01..03, MIRROR-MISSING, MIRROR-01..03 to the `CONTENT_SURFACE_RULES` registry.

**Agent actions:**

- Add 8 `rule()` entries to `packages/os/site-kernel-checks/src/diagnostics/rules/content-surface.ts` before the closing `}` of `CONTENT_SURFACE_RULES`.
- Use the exact titles from the RFC's enhanced TypeScript contracts section.
- Add a `CHANGE_SUMMARY` entry: `RFC-0576: Register LINK-01..03, MIRROR-MISSING, MIRROR-01..03 for content.links.validate, mirroring.validate, page.blocks.mirror.validate.`

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-checks run build:check` — typecheck passes.
- `grep -c "LINK-01\|LINK-02\|LINK-03\|MIRROR-MISSING\|MIRROR-01\|MIRROR-02\|MIRROR-03" packages/os/site-kernel-checks/src/diagnostics/rules/content-surface.ts` — returns ≥ 8.

**Completion criterion:** All 8 rule IDs present in `CONTENT_SURFACE_RULES` and typecheck passes.

**Human review:** no

---

### Step 2. Migrate content-links.ts to diagnosticsResult

**Goal:** Replace `resultFromViolations` with `diagnosticsResult`, add fixHints, normalize `parseUrl`.

**Agent actions:**

- Change import: replace `resultFromViolations` with `diagnosticsResult` from `./result-helpers.ts`.
- Change `Violation` interface: add `fixHint?: string` field.
- Update `parseUrl` to normalize trailing slashes for non-root paths (per RFC code snippet).
- Update `validateUrl` to populate `fixHint` on each violation:
  - LINK-01: `Anchor "${anchor}" not found on page "${filePageId}". Add to system.md anchor registry or prose heading.`
  - LINK-02: `Same-page anchor must not carry path prefix. Use "${anchor}" instead of "${value}".`
  - LINK-03: `Internal path "${path}" does not resolve to a known route. Check the route map in system.md or remove the link.`
- Replace the final `resultFromViolations(COMMAND, violationMessages)` call with `diagnosticsResult(COMMAND, diagnostics)` where `diagnostics` is built from `violations` array mapped to `Diagnostic[]` with `{ ruleId: v.rule, severity: "error", message: v.message, file: v.file, line: v.line, fixHint: v.fixHint }`.
- Remove the `violationMessages` string mapping — no longer needed.

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-checks run build:check` — typecheck passes.
- `grep "resultFromViolations" packages/os/site-kernel-checks/src/content-links.ts` — returns 0 matches.

**Completion criterion:** `content-links.ts` uses `diagnosticsResult`, no `resultFromViolations` import, `parseUrl` normalizes trailing slashes, all violations have `fixHint`.

**Human review:** no

---

### Step 3. Migrate mirroring.ts to diagnosticsResult

**Goal:** Replace custom result shape with `diagnosticsResult`, emit MIRROR-MISSING diagnostics with error/warning severity distinction.

**Agent actions:**

- Add import: `diagnosticsResult` from `../result-helpers.ts`.
- Change return type from `KernelCommandResult<{ checkedPages: number }>` to `KernelCommandResult`.
- Replace the `context.logger.error` / `context.logger.warn` calls with `Diagnostic` objects pushed to a `diagnostics: Diagnostic[]` array:
  - Default-language missing: `{ ruleId: "MIRROR-MISSING", severity: "error", file: ..., message: ..., fixHint: ... }`
  - Non-default-language missing: `{ ruleId: "MIRROR-MISSING", severity: "warning", file: ..., message: ..., fixHint: ... }`
- Build `fixHint` per diagnostic: `Create src/content/pages/${missingLang}/${pageId}.md (copy structure from src/content/pages/${sourceLang}/${pageId}.md). Add ${missingLang}: route in system.md pages[].routes.`
- Replace the final return with `diagnosticsResult("mirroring.validate", diagnostics)`.
- Handle early-return cases (no pages directory, <2 languages) with `passResult("mirroring.validate", ...)` from `result-helpers.ts`.

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-checks run build:check` — typecheck passes.
- `grep "checkedPages" packages/os/site-kernel-checks/src/checks/mirroring.ts` — returns 0 matches (field removed from data shape).

**Completion criterion:** `mirroring.ts` uses `diagnosticsResult`, emits MIRROR-MISSING with correct severity, no `checkedPages` in data shape.

**Human review:** no

---

### Step 4. Migrate page-blocks-mirror.ts to diagnosticsResult

**Goal:** Replace `PageBlocksMirrorResult` with `diagnosticsResult`, preserve existing fixHints.

**Agent actions:**

- Add import: `diagnosticsResult` from `./result-helpers.ts`.
- Remove `PageBlocksMirrorResult` interface.
- Change `BlockMirrorViolation` to be compatible with `Diagnostic`: add `ruleId: string` field (mapped from `rule`), keep `fixHint`, `file`, `severity`, `message`. Remove `rule` field — use `ruleId` directly.
- Change return type from `KernelCommandResult<PageBlocksMirrorResult>` to `KernelCommandResult`.
- In `compareBlocks`, change `rule: "MIRROR-XX"` to `ruleId: "MIRROR-XX"` on each violation object.
- Replace the final return blocks with `diagnosticsResult("page.blocks.mirror.validate", diagnostics)` where `diagnostics` is the `violations` array cast to `Diagnostic[]`.
- Handle the `requireAstroSitePaths` error case with `diagnosticsResult("page.blocks.mirror.validate", [{ ruleId: "MIRROR-01", severity: "error", message: ... }])` or `failResult`.
- Preserve `pagesCompared` in the summary string only (not in `data`).

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-checks run build:check` — typecheck passes.
- `grep "PageBlocksMirrorResult" packages/os/site-kernel-checks/src/page-blocks-mirror.ts` — returns 0 matches.

**Completion criterion:** `page-blocks-mirror.ts` uses `diagnosticsResult`, no `PageBlocksMirrorResult` interface, fixHints preserved.

**Human review:** no

---

### Step 5. Remove content-links.ts from DSL-04 baseline

**Goal:** Remove `content-links.ts` from `dsl04-baseline.generated.yaml` since it no longer uses `resultFromViolations`.

**Agent actions:**

- Remove the line `  - packages/os/site-kernel-checks/src/content-links.ts` from `packages/os/site-kernel-checks/src/diagnostics/dsl04-baseline.generated.yaml`.

**Validation:**

- `grep "content-links.ts" packages/os/site-kernel-checks/src/diagnostics/dsl04-baseline.generated.yaml` — returns 0 matches.

**Completion criterion:** `content-links.ts` is not in the DSL-04 baseline.

**Human review:** no

---

### Step 6. Update tests

**Goal:** Update existing `page-blocks-mirror.test.ts` assertions and add new tests for `content-links.ts` and `mirroring.ts`.

**Agent actions:**

- Update `packages/os/site-kernel-checks/src/tests/page-blocks-mirror.test.ts`:
  - Replace `result.data!.violations` with `result.data!.diagnostics` in all assertions.
  - Replace `v.rule` with `v.ruleId` in all `.some()` checks.
  - Replace `result.data!.pagesCompared` assertions with checks on `result.data!.summary` or remove them (pagesCompared is no longer in data).
  - Add `expect(result.data!.diagnostics.some((d) => d.ruleId === "MIRROR-01")).toBe(true)` style assertions.
  - Add assertions that `fixHint` is present on each diagnostic.
- Create `packages/os/site-kernel-checks/src/tests/content-links.test.ts`:
  - Test `parseUrl` normalization: `/uk/tsina/` → path `/uk/tsina`, root `/` preserved, `/uk/tsina` unchanged.
  - Test that `content.links.validate` emits canonical `Diagnostic[]` with `ruleId: "LINK-03"` (not coarse `"content.links.validate"`).
  - Test that `fixHint` is present on LINK-03 diagnostics.
- Create `packages/os/site-kernel-checks/src/tests/mirroring.test.ts`:
  - Test that `mirroring.validate` emits `Diagnostic[]` with `ruleId: "MIRROR-MISSING"`.
  - Test that default-language missing emits `severity: "error"`.
  - Test that non-default-language missing emits `severity: "warning"`.
  - Test that `fixHint` is present on MIRROR-MISSING diagnostics.
  - Test that warnings-only result has `exitCode: 0`.

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-checks run test` — all tests pass.

**Completion criterion:** All tests pass, new tests cover `parseUrl` normalization, canonical diagnostic output, and severity distinction.

**Human review:** no

---

### Step 7. Run diagnostic.shape.lint and build:check

**Goal:** Verify all three migrated validators pass DSL-02 (registered ruleIds) and DSL-04 (no shim usage outside baseline).

**Agent actions:**

- Run `pnpm exec site-kernel run diagnostic.shape.lint` — must exit 0.
- Run `pnpm --filter @warpgogol/site-kernel-checks run build:check` — must exit 0.
- Run `pnpm --filter @warpgogol/site-kernel-checks run test` — must exit 0.

**Validation:**

- `diagnostic.shape.lint` exits 0 with no DSL-02 or DSL-04 violations.
- `build:check` exits 0.
- All tests pass.

**Completion criterion:** All three commands exit 0.

**Human review:** no

---

### Step 8. Update AGENTS.md and commit implementation

**Goal:** Update the package-level `AGENTS.md` module table and commit all implementation changes.

**Agent actions:**

- Update `packages/os/site-kernel-checks/AGENTS.md` module table entries for the three migrated validators to note canonical Diagnostics migration and new rule IDs.
- Commit all implementation changes with message: `feat: RFC-0576 migrate content.links.validate, mirroring.validate, page.blocks.mirror.validate to canonical Diagnostics`.

**Validation:**

- `git status` — clean working tree after commit.
- `git diff --cached` — only the expected files are staged.

**Completion criterion:** AGENTS.md updated, implementation committed, working tree clean.

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize documentation, run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Verify `packages/os/site-kernel-checks/AGENTS.md` is updated with new rule IDs and canonical Diagnostics notes.
- No `docs/*.xml` Compass files need updates — this is a package-internal migration.
- No `docs/architecture-dna.md` changes — DNA-11 is already documented.
- Run code review: invoke `fo-review` via the `skill` tool on all session code changes. Wait for the review report.
- Run fix if needed: if `fo-review` reported findings, invoke `fo-fix`. Re-run `fo-review` to confirm. Maximum 3 iterations.
- Check off acceptance criteria: verify each criterion in the RFC against the implemented code. Mark `[x]` for verified criteria with inline `(evidence: ...)` annotations.
- Stamp the RFC as implemented: run `pnpm exec site-kernel run rfc.implement.stamp --id RFC-0576 --implementation-commit <sha>`.

**Validation:**

- `git status` — no uncommitted changes from the current session.
- `pnpm exec site-kernel run rfc.validate --id RFC-0576` — passes.
- Review report exists in `docs/reviews/code/` for this session.

**Completion criterion:** All documentation artifacts in scope are updated; code review passed; all acceptance criteria checked off with inline `(evidence: ...)` annotations; RFC is stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp`.

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec site-kernel run rfc.validate --id RFC-0576`
- `pnpm exec site-kernel run diagnostic.shape.lint`
- `pnpm --filter @warpgogol/site-kernel-checks run build:check`
- `pnpm --filter @warpgogol/site-kernel-checks run test`

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0576` in the subject line (RFC-0265 commit hygiene)
- All acceptance criteria checkboxes marked `[x]` with `(evidence: ...)` annotations in the RFC file

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| False positive reduction from trailing slash normalization | Step 2 implements `parseUrl` normalization; Step 6 adds tests verifying `/uk/tsina/` resolves correctly |
| Agent misinterpretation of new data shape | Step 8 updates AGENTS.md documenting the canonical Diagnostic output; Step 6 tests verify the new shape |
| diagnostic.shape.lint enforcement | Step 7 runs `diagnostic.shape.lint` to verify DSL-02 compliance; Step 5 removes `content-links.ts` from DSL-04 baseline |
| Data shape change (checkedPages, pagesCompared removal) | Step 3 and Step 4 remove the custom fields; Step 6 updates tests to use the new `CheckResult` shape |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-11, run `pnpm exec site-kernel run rfc.supersede.propose --id RFC-0576 --reason "..." --invariant "DNA-11"` instead of working around it.
- If `diagnostic.shape.lint` reveals additional unmigrated files using `resultFromViolations` that block the DSL-04 baseline removal, report to the operator and stop — do not work around DSL-04 by stashing or forcing.
