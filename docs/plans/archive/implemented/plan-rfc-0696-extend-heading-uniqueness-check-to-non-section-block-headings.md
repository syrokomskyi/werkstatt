---
rfcId: RFC-0696
planId: PLAN-RFC-0696-01
status: draft
owner: architecture
createdAt: 2026-08-05
updatedAt:
scope:
  apps: []
  packages:
    - "@warpgogol/site-kernel-checks"
  services: []
  docs: []
---

# Implementation Plan: RFC-0696

## 1. Objectives

- [ ] O1 — Extend scan scope to `<div>/<article>/<aside>` with `aria-labelledby` (maps to acceptance criterion 1)
- [ ] O2 — HEADING-UNIQ-01 fires for duplicate headings in non-section blocks (maps to acceptance criterion 2)
- [ ] O3 — Existing section-based detection unchanged (maps to acceptance criterion 3)
- [ ] O4 — Test cases for non-section blocks including nested block double-counting prevention (maps to acceptance criterion 4)
- [ ] O5 — No false positives on warpgogol-com surface pages (maps to acceptance criterion 5)
- [ ] O6 — `rfc.validate` passes (maps to acceptance criterion 6)

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/os/site-kernel-checks/src/surface-heading-uniqueness.ts` — core validator: replace `findAllSections`, add `findFirstHeadingSkippingChildBlocks`, rename export, update `MODULE_CONTRACT`, message text, fixHint
- `packages/os/site-kernel-checks/src/diagnostics/rules/content-surface.ts` — update `HEADING-UNIQ-01` rule description
- `packages/os/site-kernel-checks/src/command-tables/09b-build-artifacts-part2.ts` — update command description
- `packages/os/site-kernel-checks/src/tests/surface-heading-uniqueness.test.ts` — update import, add test cases

### 2.2 Configuration and data

None.

### 2.3 Documentation and specs

- No `AGENTS.md` updates needed — `surface-heading-uniqueness.ts` is not listed in `packages/os/site-kernel-checks/AGENTS.md`.
- No `docs/*.xml` Compass files need sync — no repository-wide semantics changed.
- No `docs/architecture-dna.md` changes — no new DNA invariant.

### 2.4 Validation and pipelines

- No pipeline change needed — `surface.heading-uniqueness.validate` already in `sites-check-postbuild.ts:75`.
- No new command registration — existing command is modified, not added.
- Run `command.manifest.generate` if command metadata changed (description update in command table).

## 3. Step sequence

### Step 1. Update core validator (`surface-heading-uniqueness.ts`)

**Goal:** Extend scan scope, add nested block double-counting prevention, rename export, update MODULE_CONTRACT and diagnostic text.

**Agent actions:**

- Update `MODULE_CONTRACT` `<purpose>`: replace "section heading" with "block heading", reflect extended scan scope.
- Update `MODULE_CONTRACT` `<non-goals>`: replace "Do not check non-section headings — only the first h2/h3 child of each section participates" with "Do not check headings outside block-level elements with `aria-labelledby`".
- Add `CHANGE_SUMMARY` entry: "RFC-0696: extend scan to non-section blocks with `aria-labelledby`; add `findFirstHeadingSkippingChildBlocks` for nested block double-counting prevention; rename `extractSectionHeadings` → `extractBlockHeadings`."
- Add `BLOCK_TAGS = new Set(["section", "div", "article", "aside"])` constant.
- Replace `findAllSections` with `findBlockElementsWithAriaLabelledby` — scans all `<section>` elements (always) + `<div>/<article>/<aside>` with `aria-labelledby` attribute.
- Add `findFirstHeadingSkippingChildBlocks` — DFS that skips child block elements (section, div/article/aside with `aria-labelledby`) to prevent counting the same heading from both parent and child blocks.
- Rename `extractSectionHeadings` to `extractBlockHeadings` — use `findBlockElementsWithAriaLabelledby` + `findFirstHeadingSkippingChildBlocks`.
- Update diagnostic message: `Duplicate section heading` → `Duplicate block heading`.
- Update `fixHint`: `"Use distinct labels for each block in the bake function — see SURFACE_LABELS in bake-helpers.ts"` → `"Use distinct heading text for each block-level element with aria-labelledby on this page"`.

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-checks run build:check` — typecheck passes.

**Completion criterion:** `surface-heading-uniqueness.ts` compiles with `BLOCK_TAGS`, `findBlockElementsWithAriaLabelledby`, `findFirstHeadingSkippingChildBlocks`, `extractBlockHeadings` export, updated `MODULE_CONTRACT`, message, and fixHint.

**Human review:** no

---

### Step 2. Update diagnostic rule description (`content-surface.ts`)

**Goal:** Update `HEADING-UNIQ-01` rule description to reflect broader scan scope.

**Agent actions:**

- Update rule description from `"Duplicate section heading text on the same surface page"` to `"Duplicate block heading text on the same surface page"`.
- Update comment from `// surface.heading-uniqueness.validate (RFC-0690) — duplicate section heading text on surface pages.` to `// surface.heading-uniqueness.validate (RFC-0690, RFC-0696) — duplicate block heading text on surface pages.`
- Add `CHANGE_SUMMARY` entry: "RFC-0696: update HEADING-UNIQ-01 description from section to block heading."

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-checks run build:check` — typecheck passes.
- `pnpm --filter @warpgogol/site-kernel-checks run test` — existing tests pass (description is not asserted in tests).

**Completion criterion:** `HEADING-UNIQ-01` rule description says "block heading", not "section heading".

**Human review:** no

---

### Step 3. Update command table description (`09b-build-artifacts-part2.ts`)

**Goal:** Update command description to reflect extended scan scope.

**Agent actions:**

- Update `description` for `surface.heading-uniqueness.validate` from `"RFC-0690: scan rendered surface page HTML for duplicate section heading text (first <h2>/<h3> child of each <section>). Fails on duplicates to catch bake function label reuse before the Axiom gate."` to `"RFC-0690, RFC-0696: scan rendered surface page HTML for duplicate block heading text (first <h2>/<h3> of each <section> or <div>/<article>/<aside> with aria-labelledby). Fails on duplicates to catch bake function label reuse before the Axiom gate."`.
- Run `pnpm exec site-kernel run command.manifest.generate` to regenerate `docs/command-manifest.generated.yaml`.

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-checks run build:check` — typecheck passes.

**Completion criterion:** Command table description reflects block-level scan scope; `command-manifest.generated.yaml` regenerated.

**Human review:** no

---

### Step 4. Update and extend tests (`surface-heading-uniqueness.test.ts`)

**Goal:** Update import, add test cases for non-section blocks and nested block double-counting prevention.

**Agent actions:**

- Update import: `extractSectionHeadings` → `extractBlockHeadings`.
- Update `MODULE_CONTRACT` `<purpose>`: replace `extractSectionHeadings` with `extractBlockHeadings`.
- Add `CHANGE_SUMMARY` entry: "RFC-0696: add non-section block heading tests, nested block double-counting prevention test."
- Add test cases in `describe("extractBlockHeadings (pure function)")`:
  - `div with aria-labelledby — heading counted` — `<div aria-labelledby="x"><h2>Title</h2></div>` → count 1.
  - `div without aria-labelledby — not scanned` — `<div><h2>Title</h2></div>` → count 0 (not a block).
  - `article with aria-labelledby — heading counted` — `<article aria-labelledby="x"><h2>Title</h2></article>` → count 1.
  - `aside with aria-labelledby — heading counted` — `<aside aria-labelledby="x"><h2>Title</h2></aside>` → count 1.
  - `duplicate heading in section + div with aria-labelledby — count 2` — section and div each have same heading text → count 2.
  - `nested block double-counting prevention — section contains div with aria-labelledby, same heading element not counted twice` — `<section><div aria-labelledby="x"><h2>Shared</h2></div></section>` → count 1 (not 2), because `findFirstHeadingSkippingChildBlocks` skips the div when extracting the section's heading.
  - `nested blocks with distinct headings — both counted` — `<section><h2>Outer</h2><div aria-labelledby="x"><h2>Inner</h2></div></section>` → "outer" count 1, "inner" count 1.
- Add handler-level test: `duplicate heading in non-section block on surface page — HEADING-UNIQ-01 diagnostic`.

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-checks run test -- --reporter=verbose` — all tests pass, including new ones.

**Completion criterion:** All new test cases pass; existing tests pass with updated import.

**Human review:** no

---

### Step 5. Validation suite

**Goal:** Run full validation suite to confirm all acceptance criteria are met.

**Agent actions:**

- `pnpm --filter @warpgogol/site-kernel-checks run build:check` — typecheck.
- `pnpm --filter @warpgogol/site-kernel-checks run test` — all tests.
- `pnpm exec site-kernel run rfc.validate --id RFC-0696 --json` — RFC validation.
- `pnpm exec site-kernel run command.manifest.generate` — regenerate command manifest if not done in step 3.

**Validation:**

- All commands exit 0.

**Completion criterion:** Typecheck, tests, and RFC validation all pass.

**Human review:** no

---

### Step 6. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize documentation, run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Verify no `AGENTS.md` files need updates (confirmed during planning — `surface-heading-uniqueness.ts` not listed in package AGENTS.md).
- Verify no `docs/*.xml` Compass files need sync (no repository-wide semantics changed).
- **Run code review:** invoke `fo-review` via the `skill` tool on all session code changes. Wait for the review report in `docs/reviews/code/`.
- **Run fix if needed:** if `fo-review` reported findings, invoke `fo-fix` via the `skill` tool. Re-run `fo-review` to confirm all findings are resolved. Maximum 3 iterations.
- **Check off acceptance criteria:** verify each criterion in the RFC against the implemented code. Mark `[x]` for verified criteria with inline `(evidence: <file:line>, <test-or-command>)` annotations.
- **Stamp the RFC as implemented:** run `pnpm exec site-kernel run rfc.implement.stamp --id RFC-0696 --implementation-commit <sha>` to atomically transition `accepted → implemented`.

**Validation:**

- `git status` — no uncommitted changes from the current session.
- `pnpm exec site-kernel run rfc.validate --id RFC-0696` — passes with 0 violations.
- Review report exists in `docs/reviews/code/` for this session.

**Completion criterion:** All acceptance criteria checked off with inline evidence; RFC stamped as `implemented` via `rfc.implement.stamp`; code review passed.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476).

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec site-kernel run rfc.validate --id RFC-0696`
- `pnpm --filter @warpgogol/site-kernel-checks run build:check`
- `pnpm --filter @warpgogol/site-kernel-checks run test`

### 4.2 Evidence artifacts

- No acceptance probes declared (commented out in RFC frontmatter) — `rfc.verification.emit` will skip silently, which is expected behavior.
- Commit messages referencing `RFC-0696` in the subject line (RFC-0265 commit hygiene).

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| False positives from `<div>` with `aria-labelledby` | Step 1: `aria-labelledby` requirement is restrictive — only `<div>/<article>/<aside>` with the attribute are scanned. |
| Nested block double-counting | Step 1: `findFirstHeadingSkippingChildBlocks` skips child block elements during heading extraction. Step 4: dedicated test case verifies prevention. |
| Performance | Step 5: typecheck and tests confirm no regression. Scan is O(n) — negligible. |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-N, run `pnpm exec site-kernel run rfc.supersede.propose --id RFC-0696 --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
