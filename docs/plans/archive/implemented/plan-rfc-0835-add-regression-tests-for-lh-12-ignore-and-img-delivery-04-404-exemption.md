---
rfcId: RFC-0835
planId: PLAN-RFC-0835-01
status: draft
owner: architecture
createdAt: 2026-08-14
updatedAt:
scope:
  apps: []
  packages:
    - packages/werkstatt-site
  services: []
  docs: []
---

# Implementation Plan: RFC-0835

## 1. Objectives

- [ ] Objective 1 — Add LH-12 ignore-pattern regression test to `lighthouse.test.ts` (maps to acceptance criterion: "Test 1 added to `lighthouse.test.ts`")
- [ ] Objective 2 — Add IMG-DELIVERY-04 404.html page-level exemption test to `image-delivery.test.ts` (maps to acceptance criterion: "Test 2 added to `image-delivery.test.ts`")
- [ ] Objective 3 — Add IMG-DELIVERY-04 per-image check on 404.html test to `image-delivery.test.ts` (maps to acceptance criterion: "Test 3 added to `image-delivery.test.ts`")
- [ ] Objective 4 — All new tests pass on current codebase (maps to acceptance criterion: "All new tests pass on the current codebase")

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/werkstatt-site/src/checks/tests/lighthouse.test.ts` — add Test 1 (LH-12 ignore patterns)
- `packages/werkstatt-site/src/checks/tests/image-delivery.test.ts` — add Test 2 and Test 3 (IMG-DELIVERY-04 404.html exemption)

No new commands, no registry entries, no pipeline wiring changes.

### 2.2 Configuration and data

None — no config files, schemas, or data artifacts are touched.

### 2.3 Documentation and specs

- `docs/rfcs/rfc-0835-*.md` — read-only reference (acceptance criteria source of truth).
- No AGENTS.md updates needed (no new commands or package contracts).
- No Compass XML sync needed (no repository-wide semantic changes).
- No `docs/architecture-dna.md` changes (no new DNA invariant).

### 2.4 Validation and pipelines

- `pnpm exec vitest run packages/werkstatt-site/src/checks/tests/lighthouse.test.ts`
- `pnpm exec vitest run packages/werkstatt-site/src/checks/tests/image-delivery.test.ts`
- `pnpm exec werkstatt run rfc.validate --id RFC-0835`

No CI workflow changes needed — existing CI runs `vitest run` for the package.

## 3. Step sequence

### Step 1. Add Test 1: LH-12 respects `.lighthouse-budget-ignore`

**Goal:** Add a regression test to `lighthouse.test.ts` that verifies `runLighthouseBudgetCheck` suppresses LH-12 findings for files matching `.lighthouse-budget-ignore` patterns.

**Agent actions:**

- Add imports: `runLighthouseBudgetCheck` from `../lighthouse.ts`, `makeTestSiteContext`, `testInput`, `unwrapData` from `./helpers.ts`.
- Add a new `describe("runLighthouseBudgetCheck LH-12 ignore patterns (ADR-0045)")` block.
- Test case 1a: "LH-12: .lighthouse-budget-ignore suppresses unreferenced JS false positive"
  - Setup: `mkdtemp` for `appDir`, create `dist/client/_astro/referenced.js` (minimal JS), `dist/client/_astro/orphan.js` (not referenced), `dist/client/index.html` with `<script src="/_astro/referenced.js">`, `.lighthouse-budget-ignore` in `appDir` containing `orphan`.
  - Call `runLighthouseBudgetCheck(testInput(), makeTestSiteContext(tmpRoot, appDir, "test-app"))`.
  - Assert: `exitCode === 0`, no findings with `rule === "LH-12"` for `orphan.js`.
- Test case 1b: "LH-12: unreferenced JS flagged when no ignore file exists"
  - Same setup but no `.lighthouse-budget-ignore` file.
  - Assert: `exitCode === 1`, at least one finding with `rule === "LH-12"` for `orphan.js`.
- Filter findings by `rule === "LH-12"` in assertions to avoid LH-10/LH-11 interference (minimal test files are well under budgets).

**Validation:**

- `pnpm exec vitest run packages/werkstatt-site/src/checks/tests/lighthouse.test.ts`

**Completion criterion:** Two new test cases in `lighthouse.test.ts` pass, verifying LH-12 respects ignore patterns when present and flags unreferenced JS when absent.

**Human review:** no

---

### Step 2. Add Test 2: IMG-DELIVERY-04 skips page-level check for `404.html`

**Goal:** Add a regression test to `image-delivery.test.ts` that verifies a 404 page with images but no `fetchpriority="high"` does NOT produce an IMG-DELIVERY-04 page-level error.

**Agent actions:**

- Add a new test case in the existing `describe("image.delivery.validate (RFC-0830)")` block.
- Test name: `"IMG-DELIVERY-04: 404.html is exempt from page-level LCP check (ADR-0046)"`
- Setup: `writeImage("logo.webp", 100, 100)`, `writeHtml("404.html", ...)` with `<img src="/logo.webp" width="100" height="100" loading="lazy" decoding="async" />` (no `fetchpriority="high"`).
- Call `runImageDeliveryValidate(input, ctx())`.
- Assert: no findings with `rule === "IMG-DELIVERY-04"` and message including `"No <img> with fetchpriority"`.

**Validation:**

- `pnpm exec vitest run packages/werkstatt-site/src/checks/tests/image-delivery.test.ts`

**Completion criterion:** Test passes — 404.html with images but no `fetchpriority="high"` produces zero IMG-DELIVERY-04 page-level findings.

**Human review:** no

---

### Step 3. Add Test 3: IMG-DELIVERY-04 per-image check still runs on `404.html`

**Goal:** Add a regression test that verifies the per-image IMG-DELIVERY-04 attribute check still runs on 404.html — if a 404 page has an image WITH `fetchpriority="high"` but missing `decoding="async"`, it must still produce an error.

**Agent actions:**

- Add a new test case in the existing `describe("image.delivery.validate (RFC-0830)")` block.
- Test name: `"IMG-DELIVERY-04: per-image attribute check still runs on 404.html (ADR-0046)"`
- Setup: `writeImage("hero.webp", 800, 600)`, `writeHtml("404.html", ...)` with `<img src="/hero.webp" srcset="/hero.webp 320w, /hero.webp 800w" sizes="100vw" width="800" height="600" loading="eager" fetchpriority="high" />` (has `fetchpriority="high"` but missing `decoding="async"`).
- Call `runImageDeliveryValidate(input, ctx())`.
- Assert: at least one finding with `rule === "IMG-DELIVERY-04"` and severity `"error"` and message including `"loading=\"eager\""` or `"decoding=\"async\""` (the per-image attribute check message, not the page-level message).

**Validation:**

- `pnpm exec vitest run packages/werkstatt-site/src/checks/tests/image-delivery.test.ts`

**Completion criterion:** Test passes — 404.html with `fetchpriority="high"` but missing `decoding="async"` produces an IMG-DELIVERY-04 per-image error.

**Human review:** no

---

### Step 4. Run full test suite and verify acceptance criteria

**Goal:** Run both test files together, verify all acceptance criteria, and confirm no regressions.

**Agent actions:**

- Run `pnpm exec vitest run packages/werkstatt-site/src/checks/tests/lighthouse.test.ts packages/werkstatt-site/src/checks/tests/image-delivery.test.ts`.
- Run `pnpm --filter packages/werkstatt-site run test` to verify no regressions in the full package test suite.
- Run `pnpm --filter packages/werkstatt-site run build:check` to verify TypeScript compilation.
- Run `pnpm exec werkstatt run rfc.validate --id RFC-0835`.
- Check off acceptance criteria in the RFC:
  - [x] Test 1 added to `lighthouse.test.ts`
  - [x] Test 2 added to `image-delivery.test.ts`
  - [x] Test 3 added to `image-delivery.test.ts`
  - [x] All new tests pass on the current codebase
  - [x] `pnpm exec vitest run packages/werkstatt-site/src/checks/tests/lighthouse.test.ts` passes
  - [x] `pnpm exec vitest run packages/werkstatt-site/src/checks/tests/image-delivery.test.ts` passes
  - [x] `rfc.validate` passes on this file before merging

**Validation:**

- All vitest tests pass.
- `build:check` passes (no TypeScript errors from new test code).
- `rfc.validate` passes.

**Completion criterion:** All 7 acceptance criteria checked off with evidence.

**Human review:** no

---

### Step 5. Review, fix, stamp implemented

**Goal:** Run code review on session changes, fix any findings, and stamp the RFC as implemented.

**Agent actions:**

- Run code review: invoke `fo-review` via the `skill` tool on all session code changes.
- If findings, invoke `fo-fix` and re-review (max 3 iterations).
- Stamp the RFC as implemented: `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0835 --implementation-commit <sha>`.
- Do NOT hand-edit `status`, `implementedAt`, or `closedAt` — use the stamp command.

**Validation:**

- `git status` — no uncommitted changes from the current session.
- `pnpm exec werkstatt run rfc.validate --id RFC-0835`.
- Review report exists in `docs/reviews/code/` for this session.

**Completion criterion:** Code review passed; RFC stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp`.

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate --id RFC-0835`
- `pnpm --filter packages/werkstatt-site run build:check`
- `pnpm --filter packages/werkstatt-site run test`
- `pnpm exec vitest run packages/werkstatt-site/src/checks/tests/lighthouse.test.ts`
- `pnpm exec vitest run packages/werkstatt-site/src/checks/tests/image-delivery.test.ts`

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0835` in the subject line (RFC-0265 commit hygiene).
- Review report in `docs/reviews/code/` from `fo-review`.

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Test isolation | Step 1-3 use `beforeEach`/`afterEach` with `mkdtemp`/`rm` from existing test patterns |
| Flakiness — `.lighthouse-budget-ignore` location | Step 1 creates the file in `appDir` (not `dist/`), matching `readBudgetIgnorePatterns` which reads from `appDirectory` |
| LH-10/LH-11 interference | Step 1 filters findings by `rule === "LH-12"`; minimal test JS files are under 300KB; test HTML has no `<link rel="stylesheet">` |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-67, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0835 --reason "..." --invariant "DNA-67"` instead of working around it.
