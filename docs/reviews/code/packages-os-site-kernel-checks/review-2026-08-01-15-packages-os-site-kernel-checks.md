---
reviewId: REVIEW-CODE-2026-08-01-01
date: 2026-08-01
reviewer:
  skill: fo-review
  model: unknown
verdict: needs-revision
diffRange: 79c9e8d...HEAD
filesReviewed:
  - packages/os/site-kernel-checks/src/public-surface/icons.ts
  - packages/os/site-kernel-checks/src/command-tables/31-public-surface.ts
  - packages/os/site-kernel-checks/src/tests/icons-source-svg.test.ts
  - docs/authoring/site-composition.md
  - docs/rfcs/rfc-0631-add-site-authored-favicon-svg-source-with-buildiconsvg-fallback.md
---

# Code Review: 79c9e8d...HEAD (RFC-0631)

### Verdict: Needs revision

The implementation is structurally sound and DNA-aligned, but the bare `catch` block in `runPublicIconsGenerate` swallows sharp conversion errors without any logging or diagnostic output, leaving operators without debugging visibility when the fallback triggers.

### Mechanical floor

Pass — `pnpm --filter @warpgogol/site-kernel-checks run build:check` and `vitest run` (722 tests) both pass. `rfc.validate --id RFC-0631` passes with zero violations.

### Axis A — Structural correctness

- **Bare catch block (line 201-207)**: `runPublicIconsGenerate` wraps `buildIconWrites` in a `try/catch` that swallows the error silently:

  ```ts
  try {
    writes = await buildIconWrites(app, svg, maskableSvg);
  } catch {
    const fallbackSvg = buildIconSvg(app);
    const fallbackMaskableSvg = buildIconSvg(app, true);
    writes = await buildIconWrites(app, fallbackSvg, fallbackMaskableSvg);
  }
  ```

  The `catch` block has no error parameter and no logging. This is a swallowed error — the operator has no way to know why the fallback triggered. The RFC's failure mode section says "The operator should fix the source SVG and re-run `public.icons.generate`", but without any log or diagnostic, the operator cannot distinguish between "source SVG was invalid" and "sharp had a transient failure".

- **Duplicated inline message type**: The `messages` array type `{ ruleId: string; severity: "error" | "warning" | "info"; message: string; file?: string; fixHint?: string; }` is declared inline in both `runPublicIconsValidate` (line 230) and `validateSourceSvg` (line 391). A shared type alias would eliminate this duplication.

### Axis B — DNA alignment

No issues. DNA-4 (all user-visible copy/config/metadata in `src/content/`) is satisfied — the favicon SVG source override lives at `src/content/favicon.svg`, consistent with the content-layer invariant.

### Axis C — Ecosystem fit

No issues. Package boundaries are correct (no `apps/*` imports). `public.icons.validate` is already in `build.check`; the new `ICON-SRC-*` diagnostics surface there. Command table `reads` metadata is updated. No new commands introduced.

### Axis D — Forward-only compliance

No issues. `buildIconSvg` is the existing default fallback, not a legacy path. No compatibility shims or dual paths. The `diagnostics()` helper from `shared.ts` was replaced with `diagnosticsResult()` from `result-helpers.ts` — the old import was removed, not maintained alongside.

### Axis E — Agent-facing clarity

No issues. `icons.ts` carries `MODULE_CONTRACT` and `CHANGE_SUMMARY` with an RFC-0631 entry. The new test file `icons-source-svg.test.ts` has `MODULE_CONTRACT`. `buildIconSvg` was exported for testability — reasonable. `resolveIconSvg` is exported for testability and potential reuse.

### Axis F — Pragmatism

No issues. The `buildIconWrites` helper extraction avoids duplicating the writes list between try and catch blocks. The regex-based SVG validation (`SVG_ROOT_RE`, `SVG_VIEWBOX_RE`) is pragmatic for favicon validation — a full XML parser dependency would be over-engineered for checking a single `viewBox` attribute.

### Axis G — Blind spots

- **Swallowed error visibility (same as Axis A)**: The bare `catch` block is also a blind spot. When sharp fails on a source SVG, the operator sees a successful `public.icons.generate: wrote 8 icon artifact(s)` summary with no indication that the fallback was used. The generator should at minimum log the error or include a warning in the result summary.

- **Edge case — both source SVGs present but both invalid**: If `favicon.svg` and `favicon-maskable.svg` both exist but both cause sharp to throw, the catch block falls back to `buildIconSvg` for both. The validator will report `ICON-SRC-01`/`ICON-SRC-03` for the viewBox issues, but the operator may not connect the validator errors to the generator's silent fallback. A log line would close this gap.

### Spec compliance

| Requirement from RFC-0631 | Status | Evidence |
| --- | --- | --- |
| `resolveIconSvg` reads `src/content/favicon.svg` | Done | `icons.ts:154-174` |
| `resolveIconSvg` reads `favicon-maskable.svg` for maskable | Done | `icons.ts:159-170` |
| `ICON-SRC-01` diagnostic for wrong viewBox | Done | `icons.ts:356-361`, test line 97 |
| `ICON-SRC-02` diagnostic for invalid XML | Done | `icons.ts:386-413`, test line 108 |
| `ICON-SRC-03` diagnostic for maskable wrong viewBox | Done | `icons.ts:363-368`, test line 119 |
| Sharp conversion failure fallback | Done | `icons.ts:201-207`, test line 135 |
| Sites without source SVG unaffected | Done | `icons.ts:169-173`, test line 71 |
| `docs/authoring/site-composition.md` updated | Done | `site-composition.md:455-462` |
| `rfc.validate` passes | Done | status: pass, violations: [] |

### Questions for the author

1. Should the `catch` block in `runPublicIconsGenerate` log the sharp error (e.g. via `context.logger.warn`) so operators can distinguish between "source SVG was invalid" and "sharp had a transient failure"?
2. Should the duplicated inline message type be extracted to a shared `IconDiagnostic` type alias?
