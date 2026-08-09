---
rfcId: RFC-0632
planId: PLAN-RFC-0632-01
status: draft
owner: architecture
createdAt: 2026-08-01
updatedAt:
scope:
  apps: []
  packages:
    - site-kernel-checks
  services: []
  docs:
    - docs/authoring/site-composition.md
    - packages/os/site-kernel-checks/AGENTS.md
---

# Implementation Plan: RFC-0632

## 1. Objectives

- [ ] Objective 1 — implement `wrapMaskableSvg` helper that transforms a regular SVG into a maskable SVG with 80% safe-zone (maps to acceptance criterion 1)
- [ ] Objective 2 — modify `resolveIconSvg` to apply `wrapMaskableSvg` instead of reading `favicon-maskable.svg` (maps to acceptance criterion 2)
- [ ] Objective 3 — add ICON-SRC-04 warning diagnostic and remove ICON-SRC-03 (maps to acceptance criteria 3, 4)
- [ ] Objective 4 — update tests to cover `wrapMaskableSvg`, ICON-SRC-04, and removal of ICON-SRC-03 (maps to acceptance criteria 1, 2, 3, 6)
- [ ] Objective 5 — update documentation (site-composition.md, AGENTS.md) (maps to acceptance criterion 7)
- [ ] Objective 6 — validate and stamp implemented (maps to acceptance criterion 8)

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/os/site-kernel-checks/src/public-surface/icons.ts` — add `wrapMaskableSvg`, modify `resolveIconSvg`, modify `runPublicIconsValidate`
- `packages/os/site-kernel-checks/src/tests/icons-source-svg.test.ts` — remove ICON-SRC-03 test, add `wrapMaskableSvg` tests, add ICON-SRC-04 test, update `resolveIconSvg` maskable test

### 2.2 Configuration and data

No configuration or data files affected. No ontology catalogs, no system.md changes, no biome files.

### 2.3 Documentation and specs

- `docs/authoring/site-composition.md` — update "Favicon SVG source override (RFC-0631)" section: remove `favicon-maskable.svg` mention, document auto-wrap behavior, update diagnostic list (remove ICON-SRC-03, add ICON-SRC-04)
- `packages/os/site-kernel-checks/AGENTS.md` — mention `wrapMaskableSvg` in icon generation rules (if icon rules section exists)

### 2.4 Validation and pipelines

- `public.icons.validate` is part of `build.check` — ICON-SRC-04 (warning) surfaces there without failing the build
- No pipeline topology changes — no new commands, no command removals
- `rfc.validate --id RFC-0632` must pass before stamping

## 3. Step sequence

### Step 1. Implement `wrapMaskableSvg` helper

**Goal:** Add the `wrapMaskableSvg` pure function that transforms a regular SVG into a maskable SVG with 80% safe-zone padding.

**Agent actions:**

- Add `wrapMaskableSvg(svg: string): string` to `packages/os/site-kernel-checks/src/public-surface/icons.ts`
- Implement regex-based SVG parsing (no DOMParser per AGENTS.md rule):
  - Parse the root `<svg>` tag and extract inner content
  - Identify the background `<rect>` as the first `<rect>` with `width="512" height="512"` or `width="100%" height="100%"`
  - Extract the background fill color (or `fill` URL reference) from that rect
  - Remove the background rect from the inner content
  - Wrap remaining elements (including `<defs>` blocks) in `<g transform="translate(51.2, 51.2) scale(0.8)">`
  - Prepend a full-canvas `<rect width="512" height="512" fill="<extracted-color>"/>` before the `<g>`
  - If no background rect found, use `#ffffff` as fallback fill
  - If inner content parse fails (no recognizable elements), return the original SVG as-is
- Export the function for testability

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-checks run build:check` (tsc --noEmit) passes

**Completion criterion:** `wrapMaskableSvg` is exported from `icons.ts`, compiles cleanly, and transforms a sample SVG with correct `translate(51.2, 51.2) scale(0.8)` transform and extracted background rect.

**Human review:** no

---

### Step 2. Modify `resolveIconSvg` for maskable auto-wrap

**Goal:** Change `resolveIconSvg` to apply `wrapMaskableSvg` to the regular `favicon.svg` source instead of reading `favicon-maskable.svg`.

**Agent actions:**

- In `resolveIconSvg` (currently at `icons.ts:162-182`), replace the `maskable=true` branch:
  - Remove the `favicon-maskable.svg` read attempt (lines 168-172)
  - Read `favicon.svg` source (same as regular path)
  - If source exists, return `wrapMaskableSvg(source)` for maskable variant
  - If no source, fall back to `buildIconSvg(app, true)` (unchanged)
- The `maskable=false` branch remains unchanged

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-checks run build:check` passes

**Completion criterion:** `resolveIconSvg(app, context, true)` no longer reads `favicon-maskable.svg`; it applies `wrapMaskableSvg` to the `favicon.svg` source or falls back to `buildIconSvg(app, true)`.

**Human review:** no

---

### Step 3. Update `runPublicIconsValidate` — remove ICON-SRC-03, add ICON-SRC-04

**Goal:** Remove the `favicon-maskable.svg` validation (ICON-SRC-03) and add ICON-SRC-04 warning when auto-wrap is applied.

**Agent actions:**

- In `runPublicIconsValidate`, remove the `validateSourceSvg` call for `favicon-maskable.svg` (currently uses `ICON-SRC-03` ruleId)
- Add ICON-SRC-04 warning diagnostic: when `favicon.svg` source exists and maskable auto-wrap will be applied, emit a warning diagnostic with `ruleId: "ICON-SRC-04"`, `severity: "warning"`, `message: "Maskable icons are auto-wrapped with 80% safe-zone from favicon.svg. Visually verify maskable PNGs on Android."`, `fixHint: "Check public/icon-maskable-512.png — adjust favicon.svg if edge elements are clipped."`
- Keep ICON-SRC-01 and ICON-SRC-02 validation for `favicon.svg` unchanged

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-checks run build:check` passes

**Completion criterion:** `runPublicIconsValidate` no longer emits ICON-SRC-03; it emits ICON-SRC-04 (warning) when `favicon.svg` exists.

**Human review:** no

---

### Step 4. Update tests

**Goal:** Update `icons-source-svg.test.ts` to reflect the new behavior.

**Agent actions:**

- Remove the test "reports ICON-SRC-03 when maskable source SVG has wrong viewBox" (lines 165-174)
- Remove the ICON-SRC-03 assertion from "does not report ICON-SRC diagnostics when no source SVGs exist" test
- Add tests for `wrapMaskableSvg`:
  - Transforms SVG with correct `translate(51.2, 51.2) scale(0.8)` transform
  - Extracts background rect fill color
  - Falls back to `#ffffff` when no background rect found
  - Preserves `<defs>` blocks in wrapped content
  - Returns original SVG when inner content parse fails
- Add test for `resolveIconSvg` with `maskable=true`: applies `wrapMaskableSvg` to `favicon.svg` source (not raw source)
- Add test for ICON-SRC-04: `runPublicIconsValidate` reports ICON-SRC-04 (warning) when `favicon.svg` exists
- Add test: `runPublicIconsValidate` does not report ICON-SRC-04 when no `favicon.svg` exists
- Update test module contract header to reference RFC-0632

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-checks exec vitest run src/tests/icons-source-svg.test.ts` passes

**Completion criterion:** All tests pass; ICON-SRC-03 test removed; `wrapMaskableSvg` and ICON-SRC-04 tests added and green.

**Human review:** no

---

### Step 5. Update documentation

**Goal:** Update `docs/authoring/site-composition.md` and `packages/os/site-kernel-checks/AGENTS.md`.

**Agent actions:**

- In `docs/authoring/site-composition.md` (lines 455-462), update the "Favicon SVG source override" section:
  - Remove the `favicon-maskable.svg` bullet
  - Add explanation: maskable icons are auto-wrapped from `favicon.svg` with 80% Android safe-zone via `wrapMaskableSvg`
  - Update diagnostic list: remove ICON-SRC-03, add ICON-SRC-04 (warning — auto-wrap applied, verify visually)
- In `packages/os/site-kernel-checks/AGENTS.md`, check if there is an icon generation rules section; if so, mention `wrapMaskableSvg` and the auto-wrap behavior. If no such section exists, skip this file.

**Validation:**

- `git diff docs/authoring/site-composition.md` shows the favicon section updated
- `grep -r "favicon-maskable" docs/authoring/site-composition.md` returns no results

**Completion criterion:** `site-composition.md` no longer mentions `favicon-maskable.svg`; auto-wrap behavior is documented; ICON-SRC-04 is listed.

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize all documentation artifacts, run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Verify every file listed in `scope.docs` is updated — check each path against `git diff`; if a scope doc was not modified, document why.
- Run `pnpm exec site-kernel run ecosystem.manifest.generate` if command surfaces or pipeline topology changed (not expected — no new commands).
- **Run code review:** invoke `fo-review` via the `skill` tool on all session code changes. Wait for the review report.
- **Run fix if needed:** if `fo-review` reported findings, invoke `fo-fix` via the `skill` tool. Re-run `fo-review` to confirm all findings are resolved. Maximum 3 iterations.
- **Check off acceptance criteria:** verify each criterion in the RFC against the implemented code. Mark `[x]` for verified criteria with inline `(evidence: <file:line>)` annotations. For unchecked `[ ]` criteria, document why.
- **Stamp the RFC as implemented:** run `pnpm exec site-kernel run rfc.implement.stamp --id RFC-0632 --implementation-commit <sha>` to atomically transition `accepted → implemented`.

**Validation:**

- `git status` — no uncommitted changes from the current session.
- `pnpm exec site-kernel run rfc.validate --id RFC-0632`
- Every file in `scope.docs` is either updated or documented as not-applicable.
- Review report exists for this session.

**Completion criterion:** All documentation artifacts in scope are updated; code review passed (findings fixed if any); all acceptance criteria are checked off with inline `(evidence: ...)` annotations; RFC is stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476). Code review is automated via `fo-review`.

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec site-kernel run rfc.validate --id RFC-0632`
- `pnpm --filter @warpgogol/site-kernel-checks run build:check` (tsc --noEmit)
- `pnpm --filter @warpgogol/site-kernel-checks exec vitest run src/tests/icons-source-svg.test.ts`

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0632` in the subject line (RFC-0265 commit hygiene)
- Inline `(evidence: <file:line>)` annotations on each acceptance criterion

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Auto-wrap heuristic failure (regex-based parsing) | Step 1: fallback to `#ffffff` background and original-SVG-as-is; Step 4: tests cover fallback paths |
| 80% safe zone insufficient for some designs | Step 3: ICON-SRC-04 warning prompts visual verification |
| Background color extraction failure | Step 1: `#ffffff` fallback; Step 3: ICON-SRC-04 warning |
| Agent confusion (creating favicon-maskable.svg) | Step 5: documentation update removes favicon-maskable.svg mention |
| False positive rate (ICON-SRC-04) | By design — warning, not error; does not fail build |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-N, run `pnpm exec site-kernel run rfc.supersede.propose --id RFC-0632 --reason "..." --invariant "DNA-N"` instead of working around it.
