---
id: RFC-0838
title: "Add Playwright mobile layout stability checks"
status: accepted
kind: architecture
scope: workspace
owners:
  - architecture
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-08-14
updatedAt: 2026-08-14
enhancedAt: 2026-08-14
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - DNA-66
  - DNA-67
  - DNA-68
  - RFC-0837
  - RFC-0839
satisfies:
  - DNA-69
versionBump: patch
commands:
  proposed:
    - mobile.layout.check
  added: []
  changed: []
  removed: []
appsImpacted: []
packagesImpacted:
  - "@warpgogol/werkstatt-site"
successSignals:
  - "New validator `mobile.layout.check` is registered as an app-scoped check command and wired into `SITES_CHECK_POSTBUILD_PIPELINE`."
  - "The validator uses Playwright to open each route in mobile emulation (iPhone 14 Pro: 390x844 portrait, 844x390 landscape)."
  - "The validator asserts `document.documentElement.scrollWidth <= document.documentElement.clientWidth` (no horizontal overflow) for every route in both portrait and landscape orientations."
  - "The validator performs layout stability checks: takes geometry measurements of key elements (header, main, footer, first section) before and after `portrait → landscape` rotation, and asserts no unexpected layout shift (delta > 5px is a violation)."
  - "The validator measures CLS (Cumulative Layout Shift) via `PerformanceObserver` init script during page load and asserts CLS < 0.1 (Google's 'good' threshold)."
  - "The validator operates without baselines — it asserts geometric invariants directly, not by comparing against stored screenshots or golden geometry snapshots."
  - "All routes are checked with a per-route timeout (default 30s). Routes that timeout are reported as failures with the timeout duration."
  - "The validator produces structured `--json` output with per-route results (pass/fail, overflow detected, CLS score, stability delta)."
  - "DNA-69 is established in `docs/architecture-dna.md` and `dna.registry.validate` passes."
nonGoals:
  - "This RFC does not implement visual regression testing (screenshot diff). The user explicitly excluded this for now."
  - "This RFC does not use baselines or golden snapshots. All checks are direct invariant assertions."
  - "This RFC does not replace the static CSS analysis from RFC-0837. Both validators run in complementary pipelines."
  - "This RFC does not cover post-deploy monitoring. That is RFC-0839."
  - "This RFC does not test real device behavior — it uses Playwright's Chromium device emulation."
---

# RFC-0838: Add Playwright mobile layout stability checks

## Context

RFC-0837 introduces static CSS analysis to catch known anti-patterns at author time. However, static analysis cannot detect dynamic layout issues — content-induced overflow, JavaScript-driven layout shifts, or viewport-unit miscalculations that only manifest at runtime. A runtime geometric check is needed to catch these issues before deployment.

The Werkstatt already has Playwright infrastructure for E2E tests (RFC-0828) and a `PlaywrightCaptureAdapter` with mobile/desktop viewports. The `SITES_CHECK_POSTBUILD_PIPELINE` runs after the Astro build and validates the built `dist/` output. This is the natural insertion point for a post-build, pre-deploy geometric check.

This RFC is the second layer of the three-layer validation strategy (RFC-0837 static CSS, RFC-0838 Playwright geometric, RFC-0839 Axiom post-deploy).

## Problem

The following mobile layout issues cannot be detected by static CSS analysis alone:

1. **Horizontal overflow from content** — Long words, unbroken strings, or dynamically injected content can cause `scrollWidth > clientWidth` even when CSS rules look correct statically.

2. **Layout shift during orientation change** — Elements that reflow differently in portrait vs. landscape can "shake" — shifting position by tens of pixels, creating a jarring user experience. This is not detectable without actually rotating the viewport.

3. **Cumulative Layout Shift (CLS)** — Elements that load asynchronously (images, fonts, late-hydrated components) can cause visible content jumps. CLS is a Core Web Vital and must be < 0.1 for a "good" rating.

4. **Fixed elements exceeding viewport** — A `position: fixed` element that looks fine on desktop but exceeds the mobile viewport width creates permanent horizontal scroll.

No existing validator checks these runtime properties. The `lighthouse.validate` (RFC-0833) checks some Lighthouse audits statically, but does not perform runtime geometric assertions or orientation change tests.

## Decision

The Werkstatt gains a `mobile.layout.check` command that uses Playwright to perform runtime geometric assertions on every route in mobile emulation. The command is registered as an app-scoped check and integrated into `SITES_CHECK_POSTBUILD_PIPELINE` after `lighthouse.budget.check`.

The validator operates **without baselines** — it asserts geometric invariants directly (no horizontal overflow, stable layout after rotation, CLS < threshold). No screenshots are stored or compared.

## Architectural fit

- **Architecture DNA:** Establishes DNA-69 (Playwright Mobile Layout Stability Checks). Extends DNA-66 (workshop testing pyramid) with a new L4-adjacent geometric check. Complements DNA-67 (pre-deploy Lighthouse parity gate) by covering runtime properties Lighthouse cannot statically check.
- **Site OS operator model:** App-scoped check command, registered in `05-seo-audit.ts` command table alongside `lighthouse.budget.check`. Uses existing Playwright infrastructure (`ensureChromium` from RFC-0647). Reads from `dist/` (post-build output).
- **Testing pyramid:** This is a pre-deploy runtime check — it runs against the built `dist/client/` output using a local static file server, not against a dev-deployed URL. It bridges L3 (contract) and L4 (E2E) in the testing pyramid.
- **Scaling Playbook:** Applies uniformly across all sites. Per-route timeout ensures large sites don't block indefinitely.

## Design

### CLI surface

```sh
pnpm exec werkstatt run mobile.layout.check --app warpgogol-com
pnpm exec werkstatt run mobile.layout.check --all --json
```

| Flag | Kind | Default | Description |
| --- | --- | --- | --- |
| `--route-timeout` | number | 30000 | Per-route timeout in milliseconds. Routes exceeding this are reported as failures. |
| `--cls-threshold` | number | 0.1 | Maximum CLS score before a route fails. 0.1 is Google's "good" threshold. |
| `--stability-delta` | number | 5 | Maximum allowed position delta (px) for key elements after orientation change. |
| `--orientation` | string | both | Which orientations to test: `portrait`, `landscape`, or `both`. |
| `--json` | boolean | false | Emit JSON output. |
| `--mode` | string | error | `error` or `warning`. Warning mode emits diagnostics but exits 0. |

### TypeScript contracts

```ts
interface MobileLayoutRouteResult {
  route: string;
  status: "pass" | "fail" | "timeout";
  durationMs: number;
  portrait: {
    overflow: boolean;
    scrollWidth: number;
    clientWidth: number;
    cls: number;
  };
  landscape: {
    overflow: boolean;
    scrollWidth: number;
    clientWidth: number;
    cls: number;
  };
  stabilityDelta: {
    header: number;
    main: number;
    footer: number;
    firstSection: number;
  };
  violations: MobileLayoutViolation[];
}

interface MobileLayoutViolation {
  ruleId: string;
  route: string;
  orientation: "portrait" | "landscape" | "both";
  message: string;
  measured: Record<string, number>;
}

interface MobileLayoutCheckResult {
  command: "mobile.layout.check";
  status: "pass" | "fail";
  routesChecked: number;
  routesPassed: number;
  routesFailed: number;
  routesTimedOut: number;
  totalDurationMs: number;
  results: MobileLayoutRouteResult[];
}
```

### Rule catalog

| Rule ID | Check | Severity | Message |
| --- | --- | --- | --- |
| `MOBILE-GEO-01` | `scrollWidth > clientWidth` (horizontal overflow) | error | Route has horizontal overflow in {orientation}: scrollWidth={scrollWidth}px > clientWidth={clientWidth}px. |
| `MOBILE-GEO-02` | Layout stability delta > threshold after rotation | error | Key element "{element}" shifted {delta}px after portrait→landscape rotation (threshold: {threshold}px). |
| `MOBILE-GEO-03` | CLS ≥ threshold | error | CLS score {cls} exceeds threshold {threshold} in {orientation}. |
| `MOBILE-GEO-04` | Route timeout | error | Route timed out after {timeoutMs}ms. |

### Execution flow

1. **Chromium pre-flight:** Call `ensureChromium` (RFC-0647) to verify Playwright Chromium is installed.

2. **Route discovery:** Scan `dist/client/**/*.html` directly to discover all built HTML routes. This follows the same pattern as `qa.independent.run` (RFC-0333). Filter to `.html` files only (skip `*.xml`, `*.json`, `*.txt` in `dist/client/`).

3. **Start preview server:** Start a static file server on a random port serving `dist/client/`. Reuse the `createStaticServer` pattern from `independent-qa.ts` (RFC-0333) — a lightweight `node:http` server with MIME type mapping and `404.html` fallback. Wait for the server to be reachable.

4. **Per-route checks (both orientations):**

   a. **Portrait pass (390×844):**
   - Navigate to the route with `waitUntil: "networkidle"`.
   - Inject `PerformanceObserver` init script to capture CLS.
   - Wait for 2 seconds (allow late layout shifts to settle).
   - Measure `document.documentElement.scrollWidth` and `clientWidth`.
   - Record geometry of key elements: `header`, `main`, `footer`, first `[data-section]` (bounding rect: x, y, width, height).
   - Read CLS from `PerformanceObserver` buffer.

   b. **Landscape pass (844×390):**
   - Same page, change viewport via `page.setViewportSize`.
   - Wait for 500ms (allow reflow to settle).
   - Re-measure `scrollWidth` and `clientWidth`.
   - Re-record geometry of key elements.
   - Read CLS.

   c. **Stability comparison:**
   - For each key element, compute the absolute delta of `x` and `y` between portrait and landscape.
   - If delta > `--stability-delta` (default 5px), emit `MOBILE-GEO-02`.

5. **Per-route timeout:** Each route has a total timeout of `--route-timeout` (default 30s). If the timeout is exceeded, the route is marked as `timeout` and `MOBILE-GEO-04` is emitted. The browser page is closed and the next route is processed.

6. **Cleanup:** Close the browser and stop the preview server.

### File system responsibilities

| Path | Role |
| --- | --- |
| `<app>/dist/client/**/*.html` | Read (served by preview server, route discovery) |
| `packages/werkstatt-site/src/checks/mobile-layout-check.ts` | New validator implementation |

### Output format

```json
{
  "command": "mobile.layout.check",
  "status": "fail",
  "routesChecked": 24,
  "routesPassed": 21,
  "routesFailed": 2,
  "routesTimedOut": 1,
  "totalDurationMs": 45000,
  "results": [
    {
      "route": "/de/preis",
      "status": "fail",
      "durationMs": 3200,
      "portrait": {
        "overflow": false,
        "scrollWidth": 390,
        "clientWidth": 390,
        "cls": 0.05
      },
      "landscape": {
        "overflow": true,
        "scrollWidth": 850,
        "clientWidth": 844,
        "cls": 0.02
      },
      "stabilityDelta": {
        "header": 2,
        "main": 15,
        "footer": 1,
        "firstSection": 12
      },
      "violations": [
        {
          "ruleId": "MOBILE-GEO-01",
          "route": "/de/preis",
          "orientation": "landscape",
          "message": "Route has horizontal overflow in landscape: scrollWidth=850px > clientWidth=844px.",
          "measured": { "scrollWidth": 850, "clientWidth": 844 }
        },
        {
          "ruleId": "MOBILE-GEO-02",
          "route": "/de/preis",
          "orientation": "both",
          "message": "Key element \"main\" shifted 15px after portrait→landscape rotation (threshold: 5px).",
          "measured": { "delta": 15, "threshold": 5 }
        }
      ]
    }
  ]
}
```

### Failure modes

- **Default mode (`error`):** Exits with code 1 when any route has violations. Diagnostics are logged to `context.logger.error`.
- **Warning mode (`--mode warning`):** Exits with code 0. Diagnostics are logged to `context.logger.warn`.
- **Chromium not installed:** Calls `ensureChromium` which auto-installs. If auto-install fails, exits with code 2 (infrastructure error).
- **Preview server fails to start:** Exits with code 2 (infrastructure error) with a diagnostic message.
- **Route timeout:** The route is marked as `timeout`, `MOBILE-GEO-04` is emitted, and the check continues to the next route. The timeout does not abort the entire check.
- **No routes found:** Exits with code 0, reports `routesChecked: 0`.
- **No `dist/` directory:** If `dist/client/` does not exist (build has not been run), exits with code 0 and a skip message: "skipped — no dist/client for <site> (run build first)". This follows the `qa.independent.run` (RFC-0333) pattern.
- **Concurrent execution:** Two simultaneous `mobile.layout.check` runs on the same site each launch separate Playwright Chromium instances and static servers on random ports. Port conflicts are mitigated by random port selection. On CI, parallel pipeline steps may multiply Chromium memory usage — this is acceptable but operators should avoid running multiple `--all` checks concurrently.

## Rollout

1. **Initial rollout (warning mode):** The validator is added to `SITES_CHECK_POSTBUILD_PIPELINE` with `--mode warning` to collect violations without blocking builds. This allows sites to fix existing issues at their own pace.

2. **Hardening (error mode):** After all active sites have zero violations, the `--mode warning` arg is removed. This transition is tracked in a follow-up ADR.

3. **New sites:** New sites run the validator in error mode from day one.

4. **Pipeline integration:** Added to `SITES_CHECK_POSTBUILD_PIPELINE` after `lighthouse.budget.check`. Also available as a standalone command for ad-hoc checks during development.

5. **Dev pipeline:** Not added to `SITES_BUILD_PREPARE_DEV_PIPELINE` (too slow for dev mode — requires Playwright launch and per-route navigation). Developers can run it manually via `pnpm exec werkstatt run mobile.layout.check --app <site>`.

## Alternatives considered

- **Visual regression (screenshot diff):** Explicitly excluded by the user for now. Screenshot diffs require baseline management, are fragile across browser updates, and produce false positives from rendering differences. Geometric assertions are more stable and directly test the invariants we care about.

- **Baseline-based geometry comparison:** The user explicitly requested "without baseline." Direct invariant assertions (no overflow, CLS < threshold, stability delta < N) are sufficient and avoid the maintenance burden of golden snapshots.

- **Post-deploy only (Axiom):** Post-deploy checks (RFC-0839) catch issues in production but are too late — they affect real users. A pre-deploy check catches issues before they reach production.

- **Cypress instead of Playwright:** The Werkstatt already standardizes on Playwright (RFC-0828, DNA-66). Adding Cypress would introduce a second browser automation framework.

## Risks

- **Execution time:** Checking every route in two orientations adds ~2–5s per route. A site with 50 routes takes ~2–4 minutes. The per-route timeout (30s) caps worst-case time. The check runs in `SITES_CHECK_POSTBUILD_PIPELINE` which is already a long-running pipeline.
- **False positives from dynamic content:** Some layout shift is intentional (e.g., lazy-loaded images). The 2-second wait after `networkidle` and the 5px stability delta threshold are calibrated to avoid false positives. The `--stability-delta` flag allows tuning.
- **Playwright Chromium version:** Device emulation metrics may vary slightly across Chromium versions. The check uses fixed viewport sizes (390×844, 844×390) rather than Playwright's device descriptors to ensure deterministic measurements.
- **CLS measurement accuracy:** `PerformanceObserver` measures CLS during page load. The 2-second wait captures most shifts but may miss very late shifts from third-party scripts. This is acceptable — the goal is to catch the common cases, not be a perfect CLS monitor.

## Acceptance criteria

- [x] TypeScript types and interfaces defined in `packages/werkstatt-site/src/checks/mobile-layout-check.ts` (evidence: packages/werkstatt-site/src/checks/mobile-layout-check.ts:39-57, `RouteResult` and `MobileLayoutCheckResult` interfaces)
- [x] CLI command registered with name `mobile.layout.check` and scope `app` in `05-seo-audit.ts` (evidence: packages/werkstatt-site/src/checks/command-tables/05-seo-audit.ts:234-249, command entry with `execute: runMobileLayoutCheck`)
- [x] `--json` output format documented and stable (evidence: packages/werkstatt-site/src/checks/mobile-layout-check.ts:241-244, `MobileLayoutCheckResult` interface is the JSON shape; kernel `--json` flag serializes `result.data`)
- [x] Integrated into `SITES_CHECK_POSTBUILD_PIPELINE` after `lighthouse.budget.check` (evidence: packages/werkstatt-site/src/checks/pipelines/sites-check-postbuild.ts:50-52, `{ command: "mobile.layout.check", args: ["--mode=warning"] }`)
- [x] Per-route timeout (default 30s) implemented and tested (evidence: packages/werkstatt-site/src/checks/mobile-layout-check.ts:247-250, `routeTimeoutMs` flag parsing; tests/mobile-layout-check.test.ts MOBILE-GEO-04 timeout test)
- [x] Horizontal overflow check (`MOBILE-GEO-01`) implemented for both orientations (evidence: packages/werkstatt-site/src/checks/mobile-layout-check.ts:300-310, `scrollWidth > clientWidth` check runs per orientation; test confirms detection)
- [x] Layout stability delta check (`MOBILE-GEO-02`) implemented for portrait→landscape rotation (evidence: packages/werkstatt-site/src/checks/mobile-layout-check.ts:317-330, `computeMaxDelta` compares portrait vs landscape geometry; test confirms detection)
- [x] CLS check (`MOBILE-GEO-03`) implemented via `PerformanceObserver` init script (evidence: packages/werkstatt-site/src/checks/mobile-layout-check.ts:155-170, `CLS_INIT_SCRIPT` + `computeCls`; test confirms detection)
- [x] No baselines or golden snapshots used — all checks are direct invariant assertions (evidence: packages/werkstatt-site/src/checks/mobile-layout-check.ts, no baseline/snapshot references — all checks are direct geometric comparisons)
- [x] No visual regression (screenshot diff) — explicitly excluded (evidence: packages/werkstatt-site/src/checks/mobile-layout-check.ts MODULE_CONTRACT non-goals: "No visual regression or screenshot diffing")
- [x] Existing sites pass without changes in warning mode (or migration path is documented) (evidence: pipeline wired with `--mode=warning` at sites-check-postbuild.ts:52, exit code 0 in warning mode)
- [x] `AGENTS.md` updated where agent behavior rules changed (evidence: packages/werkstatt-site/AGENTS.md:85-86, `mobile.layout.check` and DNA-69 documented)
- [x] DNA-69 entry appended to `docs/architecture-dna.md` (evidence: docs/architecture-dna.md:303-305, `## DNA-69 · Playwright mobile layout stability checks`)
- [x] `rfc.validate` passes on this file before merging (evidence: `rfc.validate --id RFC-0838` returns `status: pass`, 0 violations)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- For RFCs created on or after 2026-07-07 with acceptance probes: before stamping `implemented`, run `pnpm exec werkstatt run rfc.verification.emit --id RFC-0838` and commit the evidence file in the same commit.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0838 --reason "..." --invariant "DNA-N"` instead of working around it.
- Agents MUST NOT add visual regression (screenshot diff) to this validator. The user explicitly excluded it. A future RFC may introduce it if needed.
- Agents MUST NOT add baseline-based comparison to this validator. The user explicitly requested "without baseline."
