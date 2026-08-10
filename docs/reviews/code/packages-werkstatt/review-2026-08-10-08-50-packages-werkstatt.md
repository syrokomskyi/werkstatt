---
reviewId: REVIEW-CODE-2026-08-10-01
date: 2026-08-10
reviewer:
  skill: fo-review
  model: claude-sonnet-4-20250514
verdict: needs-revision
diffRange: 53778a47^...HEAD
filesReviewed:
  - packages/werkstatt/src/sternsystem/sternsystem-validate.ts
  - packages/werkstatt/src/sternsystem/test-helpers.ts
  - packages/werkstatt/src/sternsystem/mirror-validate.test.ts
  - packages/werkstatt/src/sternsystem/yaml-syntax-validate.test.ts
---

# Code Review: 53778a47^...HEAD (RFC-0792)

### Verdict: Needs revision

One finding on Axis A (Duplicated Code). The implementation is clean, minimal, and well-aligned with the ecosystem. The `validateYamlFiles` helper is correctly placed, uses the existing `yaml` package, and integrates cleanly into the per-system loop. The shared test-helpers extraction is a good refactoring. However, the violation type literal `{ systemId: string; rule: string; message: string }` is duplicated between `checkBundleContract` and `validateYamlFiles` in the same file — extracting a type alias would prevent drift.

### Mechanical floor

Pass — `pnpm --filter @warpgogol/werkstatt run build:check` exits 0.

### Axis A — Structural correctness

**Finding A1 — Duplicated Code (violation type literal):** The inline type `Array<{ systemId: string; rule: string; message: string }>` appears in `checkBundleContract` (line 73), `validateYamlFiles` (line 123), and the `violations` array declaration in `runSternsystemValidate` (line 157). Since this RFC adds a second helper with the same type, extract a type alias (e.g. `type SternsystemViolation = { systemId: string; rule: string; message: string }`) and use it in all three locations. This prevents the three copies from drifting if the shape ever changes.

### Axis B — DNA alignment

No issues. The change touches `sternsystem.validate` which is governed by DNA-44 (Sternsystem bundle contract) and DNA-45 (Fleet registry). The RFC adds a syntax-only check that complements existing validation — it does not weaken or alter any invariant. `system-config.yaml` is read from `systems-cache/<id>/` per DNA-45, which the implementation correctly respects by using `cacheDir` from `resolveMirrors`.

### Axis C — Ecosystem fit

No issues. The `validateYamlFiles` helper is placed in `sternsystem-validate.ts` alongside the other validation helpers (`checkBundleContract`). The `yaml` package import is already a dependency used in `registry-io.ts`. No new command is introduced — the existing `sternsystem.validate` command surface is extended internally. No `AGENTS.md` or Compass XML updates needed.

### Axis D — Forward-only compliance

No issues. No backward compatibility shims, no dual paths, no legacy code maintained. The change is purely additive — a new validation rule.

### Axis E — Agent-facing clarity

No issues. `MODULE_CONTRACT` and `CHANGE_SUMMARY` scaffolding present on all new/modified files. `test-helpers.ts` carries proper Compass markup. The RFC-0792 reference in `CHANGE_SUMMARY` is correct. Variable names are clear (`validateYamlFiles`, `yamlViolations`, `cacheDir`).

### Axis F — Pragmatism

No issues. The implementation climbed the minimality ladder correctly: no new dependency (uses existing `yaml` package), no new command (extends `sternsystem.validate`), no over-engineered abstraction (simple loop + try/catch). The test-helpers extraction was operator-requested and prevents future duplication.

### Axis G — Blind spots

No issues. Performance is negligible (top-level files only, typically 2-3 per system). False positives are unlikely — the `yaml` parser is the same one used throughout the codebase. Subdirectory exclusion is explicit via `entry.isFile()` check. Edge case of missing cache dir is handled by `existsSync` guard.

### Spec compliance

| Requirement from RFC-0792 | Status | Evidence |
| --- | --- | --- |
| `validateYamlFiles` helper | Done | `sternsystem-validate.ts:119-145` |
| Scans top-level `.yaml`/`.yml` files | Done | `endsWith(".yaml")` + `endsWith(".yml")` check |
| Reports `yaml-syntax-error` violations | Done | Rule string in violation push |
| Non-recursive (top-level only) | Done | `entry.isFile()` filters directories |
| Uses existing `violations` array | Done | Wired into per-system loop at line 430-432 |
| 4 unit test cases | Done | `yaml-syntax-validate.test.ts` — all 4 pass |

### Questions for the author

1. Should the violation type alias be extracted to `SternsystemValidateData` interface or kept inline? (Recommended: extract to a type alias in the same file.)
