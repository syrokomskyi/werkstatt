---
reviewId: REVIEW-CODE-2026-07-29-01
date: 2026-07-29
reviewer:
  skill: fo-review
  model: claude-sonnet-4-20250514
verdict: needs-revision
diffRange: a7f06aa...HEAD
filesReviewed:
  - packages/share/src/redirects.ts
  - packages/share/package.json
  - packages/os/site-kernel-checks/src/public-surface/managed-public.ts
  - packages/os/site-kernel-handoff/src/behavior-snapshot/behavior-snapshot-commands.ts
  - packages/os/site-kernel-handoff/src/behavior-snapshot/behavior-snapshot.test.ts
  - packages/os/site-kernel-handoff/AGENTS.md
  - packages/share/AGENTS.md
  - docs/rfcs/rfc-0588-fix-behavior-snapshot-route-collection-for-cloudflare-workers-adapter-dist-layout.md
---

# Code Review: a7f06aa...HEAD (RFC-0588 implementation)

### Verdict: Needs revision

The implementation correctly extracts `parseRedirectRules` to `@warpgogol/share/redirects`, implements `isRouteRedirected` with glob-to-regex conversion, and modifies `collectRoutes` to exclude redirected routes. However, there is one finding on Axis G regarding a potential double-read of `_redirects` that should be addressed.

### Mechanical floor

Pass — `pnpm --filter @warpgogol/share build:check`, `pnpm --filter @warpgogol/site-kernel-checks build:check`, `pnpm --filter @warpgogol/site-kernel-handoff build:check`, and `pnpm --filter @warpgogol/site-kernel-handoff test` (354 tests, 0 failures) all pass. `rfc.validate RFC-0588` passes.

### Axis A — Structural correctness

No issues. The `isRouteRedirected` function is minimal, correctly typed, and handles the 301/308 filtering explicitly. The regex escaping covers all standard regex special characters. The `collectRoutes` function cleanly integrates the redirect exclusion without changing the existing route collection logic.

### Axis B — DNA alignment

No issues. DNA-48 (Release discipline) requires behavior snapshots for releases — the redirect exclusion improves snapshot accuracy. DNA-49 (Fleet propagation) uses behavior snapshots for health checks — excluding redirected routes prevents false mismatches. No invariant is weakened.

### Axis C — Ecosystem fit

No issues. The extraction to `@warpgogol/share/redirects` follows the subpath export convention (BARREL-01). The import flow is correct: `site-kernel-checks` and `site-kernel-handoff` both import from `@warpgogol/share/redirects`, no cross-OS-package dependency. AGENTS.md files are updated for both packages.

### Axis D — Forward-only compliance

No issues. The local `parseRedirectRules` and `RedirectRule` in `managed-public.ts` are fully removed and replaced with an import — no duplicate logic remains. No backward compatibility shim.

### Axis E — Agent-facing clarity

No issues. New files (`redirects.ts`, `behavior-snapshot.test.ts`) carry `MODULE_CONTRACT` and `CHANGE_SUMMARY` scaffolding. The `CHANGE_SUMMARY` in `behavior-snapshot-commands.ts` is updated with the RFC-0588 entry. Variable names are clear (`redirectRules`, `isRouteRedirected`, `routePath`).

### Axis F — Pragmatism

No issues. No new command added — redirect exclusion is an internal implementation change to `collectRoutes`. The `isRouteRedirected` function is exported only for testability, which is the minimal exposure. The subpath export follows the existing pattern in `@warpgogol/share`.

### Axis G — Blind spots

**Finding G-1 (minor): Double read of `_redirects` file.** `collectRoutes` reads `_redirects` at `behavior-snapshot-commands.ts:80-82` via `fs.readFile`, and `runBehaviorSnapshotCapture` reads the same file again at `behavior-snapshot-commands.ts:137` via `hashFileIfExists` for `redirectsHash`. This is a redundant I/O operation on every snapshot capture. The file content could be read once and reused for both parsing and hashing. This is not a correctness issue — both reads are consistent — but it is an unnecessary double I/O on a file that always exists when redirects are configured.

### Spec compliance

| Requirement from RFC-0588 | Status | Evidence |
| --- | --- | --- |
| Extract `parseRedirectRules` to shared package | Done | `packages/share/src/redirects.ts:21-36` |
| `managed-public.ts` imports from shared | Done | `managed-public.ts:35` |
| `isRouteRedirected` with glob-to-regex | Done | `behavior-snapshot-commands.ts:65-73` |
| `collectRoutes` excludes 301/308 redirected routes | Done | `behavior-snapshot-commands.ts:79-88` |
| 410 Gone not excluded (deferred to RFC-0589) | Done | `isRouteRedirected` skips non-301/308 |
| Unit tests for redirect exclusion | Done | `behavior-snapshot.test.ts` (9 tests) |
| AGENTS.md documentation | Done | Both packages updated |
| `build:check` passes | Done | All 3 packages pass |
| `test` passes | Done | 354 tests, 0 failures |
| `rfc.validate` passes | Done | Exit code 0 |

### Questions for the author

1. Should `collectRoutes` and `runBehaviorSnapshotCapture` share a single read of `_redirects` to avoid the double I/O, or is the redundancy acceptable given the file is typically small?
