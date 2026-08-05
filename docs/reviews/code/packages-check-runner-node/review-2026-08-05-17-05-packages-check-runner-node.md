---
reviewId: REVIEW-CODE-2026-08-05-01
date: 2026-08-05
reviewer:
  skill: fo-review
  model: unknown
verdict: needs-revision
diffRange: 3fe7f590...HEAD
filesReviewed:
  - package.json
  - packages/check-runner-node/package.json
  - packages/os/site-kernel-checks/package.json
  - pnpm-lock.yaml
  - docs/adrs/adr-0026-pin-playwright-version-and-add-postinstall-browser-install.md
---

# Code Review: 3fe7f590...HEAD (ADR-0026 implementation)

### Verdict: Needs revision

The implementation correctly pins Playwright to an exact version and adds a postinstall browser install hook. One finding: the ADR text contains a factual inaccuracy about which workspaces declare Playwright as a direct dependency.

### Mechanical floor

Pass — `@warpgogol/check-runner-node` and `@warpgogol/site-kernel-checks` both pass `build:check` (tsc --noEmit). `adr.validate --id ADR-0026` passes with zero violations.

### Axis A — Structural correctness

**Finding A1 (minor):** ADR-0026 `## Decision` section states "Pin applies to `playwright` in `packages/check-runner-node/package.json` (the only workspace that declares it as a direct dependency)." This is factually incorrect — `packages/os/site-kernel-checks/package.json` also declares `playwright` as a direct dependency (line 102). The implementation correctly pins all three declarations (check-runner-node, site-kernel-checks, root), which is more thorough than the ADR text describes. The ADR text should be amended to reflect the actual scope of the pin.

### Axis B — DNA alignment

No issues. No DNA invariants reference Playwright, postinstall hooks, or browser version management.

### Axis C — Ecosystem fit

No issues. The `postinstall` script lives in the root `package.json` as the ADR specifies, running once per monorepo install. No package boundary violations — the pin is applied at the declaration sites.

### Axis D — Forward-only compliance

No issues. Caret ranges (`^1.62.1`) are replaced with exact pins (`1.62.1`) directly — no dual-paths or compatibility shims.

### Axis E — Agent-facing clarity

No issues. No new source files introduced. The ADR's `## Evolution` section documents the CI fallback strategy (`PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1`) and upgrade procedure.

### Axis F — Pragmatism

No issues. Minimal change — four version pins and one script line. No new commands, no new abstractions.

### Axis G — Blind spots

No issues. The ADR's `## Consequences` section documents the ~10-30s postinstall cost and the intentional visibility of version bumps. The `## Evolution` section covers CI network restrictions and future Playwright built-in postinstall support.

### Spec compliance

| Requirement from ADR-0026 | Status | Evidence |
| --- | --- | --- |
| Pin Playwright to exact version | Done | `packages/check-runner-node/package.json:23`, `packages/os/site-kernel-checks/package.json:102`, `package.json:49` |
| Add postinstall script for `playwright install chromium` | Done | `package.json:30` |
| Pin applies to check-runner-node only | Scope creep (beneficial) | Also pinned in site-kernel-checks and root — correct behavior, ADR text is inaccurate |
| Pin `@playwright/test` | Done | `package.json:33` |

### Questions for the author

1. The ADR text says check-runner-node is "the only workspace that declares it as a direct dependency" — should the ADR text be amended to include site-kernel-checks and root, or was the broader pin scope an intentional implementation decision beyond the ADR's stated scope?
