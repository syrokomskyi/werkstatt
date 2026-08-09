---
reviewId: REVIEW-CODE-2026-08-09-01
date: 2026-08-09
reviewer:
  skill: fo-review
  model: unknown
verdict: needs-revision
diffRange: 16a601ad...HEAD
filesReviewed:
  - packages/werkstatt-site/package.json
  - packages/werkstatt-site/tsconfig.json
  - packages/werkstatt-site/src/index.ts
  - packages/werkstatt-site/AGENTS.md
  - packages/AGENTS.md
  - tools/kernel.config.ts
  - packages/os/site-kernel-astro/src/index.ts
  - packages/os/site-kernel-content/src/index.ts
  - packages/os/site-kernel-codegen/src/index.ts
  - packages/os/site-kernel-onboarding/src/index.ts
  - packages/os/site-kernel-audit/src/index.ts
  - packages/os/site-kernel-check-warpgogol/src/index.ts
  - packages/os/site-kernel-changelog/src/index.ts
  - packages/os/site-kernel-deploy/src/index.ts
  - packages/os/site-kernel-checks/src/index.ts
  - packages/werkstatt-site/src/checks/surface-heading-uniqueness.ts
  - packages/werkstatt-site/src/checks/system-manifest.ts
---

# Code Review: 16a601ad...HEAD (RFC-0774 implementation)

### Verdict: Needs revision

The consolidation is mechanically sound — 743 files moved, imports rewired, plugin registered, `werkstatt.plugin.validate` passes. Two findings require attention: the `deployAdapters` entry returns an empty object instead of a typed adapter, and the `tsconfig.json` test exclusion masks pre-existing errors that should be tracked.

### Mechanical floor

Pass with caveats — `pnpm --filter @warpgogol/werkstatt-site run build:check` reports 60 errors, all pre-existing in `share` (3 errors) and `checks` source files (57 errors). Zero new errors introduced by the consolidation. Test files excluded from tsconfig to avoid pre-existing test-path resolution issues.

### Axis A — Structural correctness

- **A1 (finding):** `packages/werkstatt-site/src/index.ts:40-46` — the `deployAdapters["cloudflare-workers"]` entry returns `{}` (empty object). The `DeployAdapterFactory` type is `unknown` in the plugin contract, so this typechecks, but it provides no actual adapter implementation. The comment explains the deferral to RFC-0776, which is acceptable, but the entry should either be omitted (no deploy adapter registered yet) or return a meaningful placeholder. Returning `{}` is a stub that could mislead consumers into thinking the adapter is functional.

### Axis B — DNA alignment

No issues. DNA-3 (Astro as site framework) — plugin carries Astro path conventions. DNA-5 (Mirror Quintet) — validators moved into `checks/`, semantics unchanged. DNA-64 (engine/plugin boundary) — plugin imports from engine (correct direction); engine's temporary `@warpgogol/site-kernel-*` imports are exempted by RFC-0772's autonomy guard during the transition period.

### Axis C — Ecosystem fit

No issues. `packages/AGENTS.md` updated with `werkstatt-site` ownership entry. `packages/werkstatt-site/AGENTS.md` created with module layout and entry points. Package boundaries maintained — plugin imports from engine, not vice versa.

### Axis D — Forward-only compliance

- **D1 (finding):** Re-export shims in old `packages/os/site-kernel-*` are temporary construction scaffolds, not permanent compatibility layers. They are explicitly marked as "RFC-0774 re-export shim" and will be removed in RFC-0776. This is acceptable forward-only discipline — the shims exist only within the RFC-0774→RFC-0776 transition window. However, the shims should carry a more explicit removal marker, e.g. a `// TODO: RFC-0776 — delete this shim` comment, to ensure they are not forgotten.

### Axis E — Agent-facing clarity

No issues. `packages/werkstatt-site/src/index.ts` carries `MODULE_CONTRACT` and `CHANGE_SUMMARY` scaffolding. `packages/werkstatt-site/AGENTS.md` documents the module layout and entry points. Re-export shims are clearly commented.

### Axis F — Pragmatism

- **F1 (finding):** `packages/werkstatt-site/tsconfig.json` excludes `src/**/*.test.ts` and `src/**/tests/**` from the typecheck. This masks 140 test files that may have import path issues after the consolidation. While the exclusion is pragmatic (pre-existing test errors were never caught in CI), the plan should track the test fixture path repair as a follow-up task. The exclusion should be removed once test paths are fixed.

### Axis G — Blind spots

No issues. Pre-existing errors are documented and not introduced by this RFC. The consolidation is mechanical — no new validators, no new commands, no new failure modes.

### Spec compliance

| Requirement from RFC-0774 | Status | Evidence |
| --- | --- | --- |
| Create `packages/werkstatt-site` with `profileId: "astro-typescript-turborepo"` | Done | `packages/werkstatt-site/src/index.ts:24-27` |
| Move site-stack engine modules | Done | 743 files moved to `packages/werkstatt-site/src/` |
| Plugin registers via `WerkstattPlugin` | Done | `werkstatt.plugin.validate` status: pass |
| Cloudflare Workers deploy adapter | Partial | `deployAdapters` entry exists but returns `{}` — full adapter deferred to RFC-0776 |
| Old packages deleted | Done | Old packages contain only re-export shims |
| `site-kernel-check-warpgogol` moved | Done | `packages/werkstatt-site/src/checks/check-warpgogol/` exists |
| `rfc.validate` passes | Done | 0 violations |

### Questions for the author

1. Should the `deployAdapters["cloudflare-workers"]` entry be removed until RFC-0776 provides the real adapter, or is the placeholder `{}` return acceptable as a declaration of intent?
2. When will the tsconfig test exclusion be removed and test fixture paths repaired?
3. Should the re-export shims carry a `// TODO: RFC-0776` removal marker to prevent them from being forgotten?
