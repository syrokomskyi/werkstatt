---
rfcId: RFC-0793
planId: PLAN-RFC-0793-01
status: draft
owner: architecture
createdAt: 2026-08-10
updatedAt:
scope:
  apps: []
  packages:
    - "@warpgogol/werkstatt-site"
  services: []
  docs: []
---

# Implementation Plan: RFC-0793

## 1. Objectives

- [ ] O1 — Strip parentheses in `normalizeLicense` before OR/AND parsing (maps to acceptance criteria 1, 5)
- [ ] O2 — Add `Apache2` alias to `LICENSE_ALIASES` (maps to acceptance criteria 2, 6)
- [ ] O3 — Remove dead `Python-2.0` alias from `LICENSE_ALIASES` (maps to acceptance criteria 3, 8)
- [ ] O4 — Filter unknown licenses from `licenseDistribution` only (maps to acceptance criteria 4, 9, 10, 11)
- [ ] O5 — Unit tests for all four changes (maps to acceptance criteria 5-10)
- [ ] O6 — Verify component table, SBOM, and THIRD_PARTY_NOTICES still include unknown-license packages (maps to acceptance criterion 11)

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/werkstatt-site/src/codegen/open-source-page.ts` — `normalizeLicense` function (line 212), `LICENSE_ALIASES` map (line 185), `buildRegistryData` function (line 577-581)

### 2.2 Configuration and data

- None — no YAML/JSON config changes

### 2.3 Documentation and specs

- No AGENTS.md updates needed — no new commands, no new agent rules
- No Compass XML sync needed — no repository-wide semantic changes
- No architecture-dna.md changes — no new DNA invariants

### 2.4 Validation and pipelines

- `pnpm --filter @warpgogol/werkstatt-site run build:check` — TypeScript compilation
- `pnpm --filter @warpgogol/werkstatt-site run test` — Vitest unit tests

## 3. Step sequence

### Step 1. Fix `normalizeLicense` — strip parentheses, add Apache2 alias, remove dead Python-2.0 alias

**Goal:** Apply three of four code changes to the `normalizeLicense` function and `LICENSE_ALIASES` map.

**Agent actions:**

- In `LICENSE_ALIASES` (line 185): remove `"Python-2.0": "PSF-2.0"` entry
- In `LICENSE_ALIASES` (line 185): add `Apache2: "Apache-2.0"` entry
- In `normalizeLicense` (line 235): replace `trimmed` with `trimmed.replace(/[()]/g, "")` in the OR and AND parsing blocks
- Specifically: introduce `const withoutParens = trimmed.replace(/[()]/g, "");` before the OR block, and use `withoutParens` in both the `includes()` check and `split()` calls for OR and AND

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check` — TypeScript compiles cleanly

**Completion criterion:** `normalizeLicense("(MIT OR CC0-1.0)")` returns `{ status: "verified", spdxId: "MIT" }`; `normalizeLicense("(MIT OR Apache2)")` returns `{ status: "normalized", spdxId: "MIT" }`; `normalizeLicense("Python-2.0")` returns `{ status: "verified", spdxId: "Python-2.0" }`

**Human review:** no

---

### Step 2. Filter unknown licenses from `licenseDistribution` in `buildRegistryData`

**Goal:** Exclude dependencies with `normalizedLicense.status === "unknown"` from the `licenseMap` loop, but NOT from `components`, `sbomComponents`, or `buildThirdPartyNotices`/`buildThirdPartyLicenses`.

**Agent actions:**

- In `buildRegistryData` (line 577-581): add `if (dep.normalizedLicense.status === "unknown") continue;` as the first statement inside the `for (const dep of publicDeps)` loop that builds `licenseMap`
- Do NOT add the filter to the `components` array mapping (line 597+)
- Do NOT add the filter to `sbomComponents` in `runGenerateOpenSourcePage` (line ~640)
- Do NOT add the filter to `buildThirdPartyNotices` or `buildThirdPartyLicenses` calls

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check`

**Completion criterion:** A dependency with `status: "unknown"` does not appear in `licenseDistribution` but does appear in `components` and `sbomComponents`

**Human review:** no

---

### Step 3. Write unit tests

**Goal:** Create a test file covering all acceptance criteria for `normalizeLicense` and the `licenseDistribution` filter.

**Agent actions:**

- Create `packages/werkstatt-site/src/codegen/tests/open-source-normalize-license.test.ts`
- Test `normalizeLicense("(MIT OR CC0-1.0)")` → `{ status: "verified", spdxId: "MIT" }`
- Test `normalizeLicense("(MIT OR Apache2)")` → `{ status: "normalized", spdxId: "MIT" }` (Apache2 alias resolves to Apache-2.0, but MIT is first valid SPDX ID)
- Test `normalizeLicense("(MIT AND Zlib)")` → `{ status: "verified", spdxId: "MIT AND Zlib" }`
- Test `normalizeLicense("(AFL-2.1 OR BSD-3-Clause)")` → `{ status: "verified", spdxId: "AFL-2.1" }` (first valid)
- Test `normalizeLicense("Python-2.0")` → `{ status: "verified", spdxId: "Python-2.0" }` (not PSF-2.0)
- Test `normalizeLicense("")` → `{ status: "unknown", spdxId: null }`
- Test `normalizeLicense("MIT")` → `{ status: "verified", spdxId: "MIT" }` (regression — direct SPDX ID still works)
- Test `normalizeLicense("Apache2")` → `{ status: "normalized", spdxId: "Apache-2.0" }` (new alias)
- Test `buildRegistryData` output: construct a `ClassifiedDependency[]` with one unknown-license dep and one MIT dep, verify `licenseDistribution` does not contain `license: "Unknown"` but `components` includes both

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run test`

**Completion criterion:** All tests pass; test count covers acceptance criteria 5-11

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Run code review, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- No AGENTS.md or Compass XML updates needed — no governance or semantic changes
- Run `pnpm --filter @warpgogol/werkstatt-site run build:check` and `pnpm --filter @warpgogol/werkstatt-site run test`
- Run code review: invoke `fo-review` via the `skill` tool on all session code changes
- Run fix if needed: if `fo-review` reported findings, invoke `fo-fix`
- Check off acceptance criteria: verify each criterion against the implemented code, mark `[x]` with inline `(evidence: <file:line>)` annotations
- Stamp the RFC as implemented: run `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0793 --implementation-commit <sha>`

**Validation:**

- `git status` — no uncommitted changes from the current session
- `pnpm exec werkstatt run rfc.validate --id RFC-0793`
- Review report exists in `docs/reviews/code/` for this session

**Completion criterion:** All acceptance criteria checked off with evidence; RFC stamped as `implemented` via `rfc.implement.stamp`

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp`

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate --id RFC-0793`
- `pnpm --filter @warpgogol/werkstatt-site run build:check`
- `pnpm --filter @warpgogol/werkstatt-site run test`

### 4.2 Evidence artifacts

- No acceptance probes declared — `rfc.verification.emit` is not required (RFC-0330 applies only to probe-bearing RFCs)
- Commit messages referencing `RFC-0793` in the subject line

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --------------- | ---------------------- |
| Over-stripping parentheses in nested expressions | Step 1 uses `replace(/[()]/g, "")` — accepted risk per RFC; nested expressions are extremely rare in npm license fields |
| False normalization of Apache2 | Step 1 adds alias only after SPDX ID check fails — no collision possible |
| Agent misinterpretation of Unknown filter scope | Step 2 explicitly does NOT filter `components`, `sbomComponents`, or `buildThirdPartyNotices`; Step 3 tests verify this |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-N, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0793 --reason "..." --invariant "DNA-N"` instead of working around it.
