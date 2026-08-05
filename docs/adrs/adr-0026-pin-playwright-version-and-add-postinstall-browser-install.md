---
id: ADR-0026
title: "Pin Playwright version and add postinstall browser install"
# Lifecycle (RFC-0367 parity with RFCs):
#   proposed → reviewing → accepted → implemented
#   any → superseded (requires supersededBy)
#   any → rejected
status: accepted
scope: workspace
decider: architecture
createdAt: 2026-08-05
updatedAt: 2026-08-05
implementedAt:
closedAt:
supersedes: []
supersededBy:
related:
  - RFC-0647
reviewers:
  - human:andrii-syrokomskyi
---

# ADR-0026: Pin Playwright version and add postinstall browser install

## Context

`packages/check-runner-node/package.json` declares `playwright: ^1.61.1` with a caret semver range. When `pnpm install` resolves a newer minor version (e.g. 1.62.1), the expected Chromium revision changes (e.g. chromium-1228 → chromium-1234). The `ensureChromium` function in `packages/os/site-kernel-checks/src/playwright-chromium-ensure.ts` (RFC-0647) attempts `chromium.launch()` and falls back to `preflightChromium(false)` when the launch fails — but this only happens at runtime during `mission.materialize` or `build.post`, causing a multi-second download delay (or failure if offline) during a mission cycle. Operators must manually run `pnpm exec playwright install chromium` after every `pnpm install` that bumps the Playwright version.

## Decision

Pin the Playwright dependency to an exact version (no caret) and add a `postinstall` script that runs `playwright install chromium` in the root `package.json`.

- Pin applies to `playwright` in all workspaces that declare it as a direct dependency: `packages/check-runner-node/package.json`, `packages/os/site-kernel-checks/package.json`, and the root `package.json` (devDependency). The root `package.json` also pins `@playwright/test` to the same exact version.
- The `postinstall` script lives in the root `package.json` so it runs once after every `pnpm install` at the monorepo root.

## Justification

Caret semver (`^1.61.1`) allows minor updates that change the expected Chromium revision. Each revision mismatch forces a runtime download via `ensureChromium`'s fallback path, which is slow and fragile (network failures during mission cycles). Pinning the exact version eliminates revision drift — the installed Chromium binary in `~/.cache/ms-playwright/` stays valid until the pinned version changes.

The `postinstall` hook ensures that after any `pnpm install` (including CI fresh clones), the correct Chromium revision is present before any command tries to launch it. This makes `ensureChromium`'s fallback path a safety net rather than the common path.

Alternatives considered:

- **`PLAYWRIGHT_BROWSERS_PATH` env var**: would centralize browser storage but does not solve revision mismatch — the path is already consistent (`~/.cache/ms-playwright/`), the problem is which revision is expected.
- **Manual documentation only**: relies on operator discipline; fails in CI and new-machine setups.
- **Pin without postinstall**: eliminates drift but still requires manual install on fresh clones and CI.

## Consequences

- Positive: `ensureChromium` skip path (already installed) becomes the common case; no runtime download delays during mission cycles; CI fresh clones get Chromium automatically.
- Positive: Eliminates the recurring "reinstall Chromium" problem reported across multiple sessions.
- Negative: `postinstall` adds ~10-30 seconds to `pnpm install` when Chromium is not cached. This is a one-time cost per fresh install, not per command.
- Negative: Exact version pin requires explicit updates when upgrading Playwright (change `package.json` + run `pnpm install`). This is intentional — it makes version bumps visible.
- Technical debt: None. The pin + postinstall pattern is self-maintaining.

## Evolution

Revisit when Playwright introduces a built-in `postinstall` browser download (tracked in playwright issue #1396). If the `postinstall` hook causes CI failures due to network restrictions, add `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` to CI env and run `playwright install chromium` as a separate CI step. When upgrading Playwright, update the pinned version and verify `ensureChromium` still passes with the new revision.
