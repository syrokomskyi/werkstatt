---
reviewId: REVIEW-CODE-2026-07-30-01
date: 2026-07-30
reviewer:
  skill: fo-review
  model: unknown
verdict: needs-revision
diffRange: 1ead329...HEAD
filesReviewed:
  - packages/os/site-kernel-checks/src/section-framework/css-import.ts
  - packages/os/site-kernel-checks/src/command-tables/08-section-framework.ts
  - packages/os/site-kernel-checks/src/pipelines/packages-check.ts
  - packages/os/site-kernel-checks/src/section-framework.ts
  - packages/os/site-kernel-checks/src/tests/css-import-validate.test.ts
  - packages/os/site-kernel-checks/AGENTS.md
  - packages/ui/src/components/effects/effect-host.astro
  - packages/ui/src/sections/approach/approach-section.astro
  - packages/ui/src/sections/audience-cards/audience-cards-section.astro
  - packages/ui/src/sections/comparison-cards/comparison-cards-section.astro
  - packages/ui/src/sections/controlled-responsibility-block/controlled-responsibility-block-section.astro
  - packages/ui/src/sections/impact/impact-section.astro
  - packages/ui/src/sections/navigation/navigation-section.astro
  - packages/ui/src/sections/problem/problem-section.astro
  - docs/ecosystem.generated.yaml
  - docs/rfcs/rfc-0598-add-section-css-import-validate-for-colocated-css-import-integrity.md
  - docs/plans/plan-rfc-0598-add-section-css-import-validate-for-colocated-css-import-integrity.md
---

# Code Review: 1ead329...HEAD (RFC-0598 implementation)

### Verdict: Needs revision

The validator is functionally correct and well-tested (7 tests, all pass), but has three minor structural issues: duplicated collection logic, a duplicated regex pattern, and dead code in the astroContents mapping. None are blocking, but they should be cleaned up before merge.

### Mechanical floor

Pass — `pnpm --filter @warpgogol/site-kernel-checks run build:check` and `vitest run src/tests/css-import-validate.test.ts` both pass.

### Axis A — Structural correctness

1. **Duplicated Code** — `collectCssFiles` and `collectAstroFiles` (css-import.ts:29-47) have identical structure: both call `Promise.all` over the same two roots with `collectFiles`, differing only in the extension. Extract a single `collectByExtension(workspaceRoot, dirs, extensions)` helper and call it twice.

2. **Duplicated Code** — The import-detection regex (css-import.ts:78-81 and 104-107) is constructed twice with the same pattern string. Extract a `function isImportedBy(cssBasename, astroText)` helper and reuse it in both CSS-IMPORT-01 and the `importedBySameDirAstro` check.

3. **Dead code** — `astroContents` (css-import.ts:64-70) computes a `rel` property that is never read anywhere in the function. Remove it.

4. **Redundant check** — Line 93: `astroFiles.filter((f) => dirname(f) === cssDir && f.endsWith(".astro"))` — the `.endsWith(".astro")` guard is redundant because `astroFiles` already only contains `.astro` files (collected with `.astro` extension filter). Remove the redundant condition.

### Axis B — DNA alignment

No issues. DNA-17 (Mirror Quintet) includes `.css` as part of the package-side quintet. The validator enforces that `.css` files are imported by `.astro` files, which supports DNA-17's `.css` requirement. DNA-5 (Component ↔ content ↔ schema mirror) is also supported — the validator ensures the CSS dimension of the mirror is not silently broken.

### Axis C — Ecosystem fit

No issues. Command registered in the correct command table (`08-section-framework.ts`). Pipeline placement is correct (`PACKAGES_CHECK_PIPELINE` after `section.image.contract.validate`). AGENTS.md module table updated. Re-export added in `section-framework.ts` shim. `docs/ecosystem.generated.yaml` regenerated. No package boundary violations — imports flow from `site-kernel-checks` to `@warpgogol/share/fs` and `@warpgogol/site-kernel`, consistent with all other section-framework validators.

### Axis D — Forward-only compliance

No issues. No compatibility shims, no legacy paths, no dual-paths. The 8 CSS import fixes in `.astro` files are direct additions — no old behavior preserved.

### Axis E — Agent-facing clarity

No issues. `MODULE_CONTRACT` and `CHANGE_SUMMARY` present in both new source files (`css-import.ts` and `css-import-validate.test.ts`). Variable names are clear (`cssBasename`, `cssDir`, `astroInSameDir`, `importedBySameDirAstro`). No ungrounded assertions in comments.

### Axis F — Pragmatism

No issues. The command earns its existence — CSS import integrity is a distinct concern from token linting (`tokens.colors.section-shell.lint`) and shell contract validation (`section.shell.contract.validate`). The implementation follows existing patterns (`shared.ts` `ok`/`fail`, `collectFiles`). Scope is disciplined — only touches what's needed.

### Axis G — Blind spots

1. **Regex scope** — The import-detection regex `import\s+["']\.\.?/[^"']*<filename>["']` only matches relative imports starting with `./` or `../`. It won't match alias imports (e.g., `import "effect-text.css"` without a relative prefix). This is acceptable per the RFC spec (relative imports are the convention), but if an alias import pattern is ever introduced, the validator would produce a false positive. Document this assumption or broaden the regex.

2. **Performance** — The validator reads all `.astro` files into memory via `Promise.all`. With ~60 files this is negligible (<50ms per the RFC), but the `astroContents` array holds all file contents for the duration of the function. No concern at current scale.

### Spec compliance

| Requirement from RFC-0598 | Status | Evidence |
| --- | --- | --- |
| `section.css.import.validate` registered in `08-section-framework.ts` | Done | css-import.ts command entry at 08-section-framework.ts:100-115 |
| `runSectionCssImportValidate` in `src/section-framework/css-import.ts` | Done | css-import.ts:54-125 |
| CSS-IMPORT-01 rule | Done | css-import.ts:77-91, test at :48-60 |
| CSS-NAME-01 rule | Done | css-import.ts:95-120, test at :91-107 |
| Cross-import exemption | Done | css-import.ts:102-108 (importedBySameDirAstro check), test at :62-77 |
| No-.astro exemption | Done | css-import.ts:95 (if astroInSameDir.length > 0), test at :109-124 |
| Added to `PACKAGES_CHECK_PIPELINE` | Done | packages-check.ts:107-108 |
| `--json` output follows `KernelCommandResult` shape | Done | Uses standard `CheckResult` with `violations[]` (not `diagnostics[]` as RFC aspirational format states — consistent with all other validators) |
| Unit test at `src/tests/css-import-validate.test.ts` | Done | 7 tests, all pass |
| `rfc.validate` passes | Done | pnpm exec werkstatt run rfc.validate RFC-0598 — pass |
| Validator passes on current codebase | Done | 9 violations found and fixed (7 section CSS + 1 effect-text + 1 print.css out-of-scope) |

### Questions for the author

1. The RFC's TypeScript contract shows `CssImportFinding` with `ruleId` and `diagnostics[]`, but the implementation uses the existing `Violation` type with `rule` and `violations[]`. Is this intentional alignment with the existing `CheckResult` pattern, or should the RFC be updated to match the implementation?
2. The `print.css` file in `packages/ui/src/styles/` was excluded from the validator scope (only `sections/` and `components/` are scanned). Should the RFC explicitly document this scope boundary, or should `styles/` be included in a future iteration?
