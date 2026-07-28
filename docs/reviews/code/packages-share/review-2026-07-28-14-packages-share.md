---
reviewId: REVIEW-CODE-2026-07-28-01
date: 2026-07-28
reviewer:
  skill: fo-review
  model: unknown
verdict: needs-revision
diffRange: 8fb5d78...HEAD
filesReviewed:
  - packages/share/src/text-normalize.ts
  - packages/share/src/tests/text-normalize.test.ts
  - packages/os/site-kernel-codegen/src/templates/app-boilerplate/src/middleware.template.ts
  - packages/os/site-kernel-onboarding/src/templates/runtime/astro.config.template.mjs
  - packages/share/AGENTS.md
---

# Code Review: RFC-0569 dev/prod egress parity

### Verdict: Needs revision

Two minor findings: a bare `catch {}` block that swallows errors without context, and a discrepancy between the RFC text (per-request config loading) and the implementation (module-level config loading). Neither is blocking — the implementation is functionally correct and all tests pass.

### Mechanical floor

Pass — `pnpm --filter @warpgogol/share build:check` and `pnpm --filter @warpgogol/share test` (206 tests, 27 files). `pnpm --filter @warpgogol/site-kernel-codegen build:check` and `pnpm --filter @warpgogol/site-kernel-onboarding build:check` also pass.

### Axis A — Structural correctness

- **Bare `catch {}` in `createDevNormalizeMiddleware`** (`packages/share/src/text-normalize.ts:537`): the catch block has no error binding and no logging. While the RFC design intentionally degrades to the original response on error, a bare catch swallows unexpected errors (e.g. `normalizeHtml` throwing due to a regex bug) with zero traceability. Consider `catch (_err) { return response; }` at minimum, or add a `console.debug` with context for dev-mode diagnostics. This is a Fowler "Mysterious Name" smell — the catch tells the reader nothing about what went wrong.

### Axis B — DNA alignment

No issues. DNA-42 (Compass markup) satisfied — `MODULE_CONTRACT` and `CHANGE_SUMMARY` updated with RFC-0569 entry. `@ai-invariant` header updated. DNA-57 referenced correctly.

### Axis C — Ecosystem fit

No issues. Package boundaries respected — `@warpgogol/share` imports `astro` types only. Template imports from `@warpgogol/share/text-normalize` and `@warpgogol/site-kernel-content` are valid workspace dependencies. `AGENTS.md` updated for the new export.

### Axis D — Forward-only compliance

No issues. No compatibility shims or dual-paths. The middleware is purely additive — production builds are unaffected via `import.meta.env.DEV` gate.

### Axis E — Agent-facing clarity

- **Bare `catch {}` (same as Axis A)** — from an agent clarity perspective, another agent debugging a dev server issue would have no trace if `normalizeHtml` silently fails. The `@ai-invariant` header and JSDoc are clear, but the catch block is a dead end for debugging.

### Axis F — Pragmatism

No issues. The factory is minimal — takes config, returns handler. Reuses existing `normalizeHtml()`. No new commands. No speculative generality.

### Axis G — Blind spots

- **Config loading strategy discrepancy** — the RFC enhanced text (line ~138) states: "The config is loaded **per-request** inside the middleware, not cached at module level." However, the implementation in `middleware.template.ts:20-22` loads config at module level via `loadSystemManifestSync("src/content")` — not per-request. The module-level approach is actually better for performance (no per-request file I/O) and Vite HMR handles config hot-reload by re-executing the module. The RFC text should be updated to match the implementation, or the discrepancy noted for future readers.

- **`loadSystemManifestSync("src/content")` path assumption** — the hardcoded `"src/content"` relative path works in dev (CWD is the site root) but is fragile. If the dev server is started from a different working directory, this will throw. The `try/catch` in the middleware would catch it, but the middleware would silently pass through all responses without normalization. Consider documenting this assumption or using an absolute path derived from `import.meta.url`.

### Spec compliance

| Requirement from RFC-0569 | Status | Evidence |
| --- | --- | --- |
| `createDevNormalizeMiddleware()` exported | Done | `text-normalize.ts:523` |
| Middleware applies `normalizeHtml()` to HTML responses | Done | `text-normalize.ts:530-531` |
| Gated by `import.meta.env.DEV` | Done | `middleware.template.ts:24` |
| Try/catch around `normalizeHtml()` | Done | `text-normalize.ts:537` (bare catch) |
| `smartypants: false` in dev | Done | `astro.config.template.mjs:101` |
| Config loaded from `system.md` | Done | `middleware.template.ts:21` (module-level, not per-request as RFC text says) |
| Unit tests for middleware | Done | `text-normalize.test.ts:221-266` (4 tests) |
| Production build unaffected | Done | `import.meta.env.DEV` gate ensures middleware array is not used in prod |
| DNA-57 added | Done | `architecture-dna.md` (during RFC creation) |
| `rfc.validate` passes | Done | No violations for RFC-0569 |

### Questions for the author

1. Should the bare `catch {}` at line 537 include at least a debug log for dev-mode diagnostics, or is silent degradation intentional even in dev?
2. The RFC text says per-request config loading, but the implementation uses module-level loading. Should the RFC text be amended to match the (better) implementation, or was per-request loading intended and module-level is a deviation?
3. Is the hardcoded `"src/content"` path in `loadSystemManifestSync` safe across all dev server launch scenarios, or should it use `import.meta.url`-based resolution?
