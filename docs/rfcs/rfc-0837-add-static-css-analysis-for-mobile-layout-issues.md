---
id: RFC-0837
title: "Add static CSS analysis for mobile layout anti-patterns"
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
  - DNA-10
  - DNA-67
  - RFC-0838
  - RFC-0839
satisfies:
  - DNA-68
versionBump: patch
commands:
  proposed:
    - css.mobile-layout.lint
  added: []
  changed: []
  removed: []
appsImpacted: []
packagesImpacted:
  - "@warpgogol/werkstatt-site"
successSignals:
  - "New validator `css.mobile-layout.lint` is registered in the check command table and wired into `SITES_CHECK_AUTHOR_PIPELINE`."
  - "The validator identifies known CSS anti-patterns that cause mobile layout shift: `height: 100vh` without `100dvh` fallback, `width: 100vw` with padding/border, fixed pixel widths without `max-width: 100%`, negative margins on root containers, `position: fixed` elements wider than viewport, missing `overflow-wrap` or `word-break` on long-text containers."
  - "The validator scans `.astro` inline `<style>` blocks and `.css` files under `src/styles/` and `packages/werkstatt-site/src/domain/ui/`."
  - "The validator exits with code 1 when violations are found and produces structured `--json` output with file, line, column, rule ID, and message."
  - "Existing code passes without false positives (warning mode during initial rollout)."
  - "DNA-68 is established in `docs/architecture-dna.md` and `dna.registry.validate` passes."
nonGoals:
  - "This RFC does not implement dynamic checks (e.g., JS resize handlers, content-induced overflow). That is RFC-0838."
  - "This RFC does not cover visual regression testing (screenshot diff)."
  - "This RFC does not modify existing CSS files; it only introduces a linter."
  - "This RFC does not cover post-deploy monitoring. That is RFC-0839."
---

# RFC-0837: Add static CSS analysis for mobile layout anti-patterns

## Context

Mobile layout shift ("shaking") during orientation changes is a recurring problem on Warpgogol sites. A recent fix on warpgogol-com addressed a specific instance, but the platform lacks automated detection of the CSS anti-patterns that cause these issues. The Werkstatt already has static CSS validators (`css.important.lint`, `tokens.ds.lint`, `tokens.colors.lint`) that run in the author pipeline, but none target mobile-specific layout stability.

This RFC is the first layer of a three-layer validation strategy (RFC-0837 static CSS, RFC-0838 Playwright geometric, RFC-0839 Axiom post-deploy) to detect and prevent mobile layout shift issues architecturally.

## Problem

The following CSS anti-patterns cause mobile layout shift or horizontal overflow but are currently undetected by any validator:

1. **`height: 100vh` without `100dvh` fallback** — On mobile browsers, `100vh` includes the address bar height. When the address bar shows/hides during scroll or orientation change, the viewport height changes, causing layout shift. The `100dvh` (dynamic viewport height) unit tracks the actual visible viewport.

2. **`width: 100vw` with padding or border** — `100vw` includes the scrollbar width on desktop and can cause horizontal overflow when combined with padding or border (box model). On mobile, `100vw` can exceed the visible viewport.

3. **Fixed pixel widths without `max-width: 100%`** — Elements with fixed `width: Npx` that exceed mobile viewport widths (e.g., `width: 500px` on a 390px viewport) cause horizontal overflow. Without `max-width: 100%`, there is no safety net.

4. **Negative margins on root containers** — Negative margins on top-level layout containers (body, main, section wrappers) can pull content outside the viewport, causing horizontal scroll on mobile.

5. **`position: fixed` elements wider than viewport** — Fixed-position elements with explicit widths exceeding common mobile viewport widths (390–430px) cause horizontal overflow that cannot be scrolled away.

6. **Missing `overflow-wrap` or `word-break` on long-text containers** — Long unbroken strings (URLs, code, long German compound words) without `overflow-wrap: break-word` or `word-break: break-word` can force horizontal overflow on mobile.

No DNA invariant currently covers mobile layout CSS best practices. DNA-10 (no hardcoded design tokens) is about color values, not layout dimensions.

## Decision

The Werkstatt gains a `css.mobile-layout.lint` command that scans `.css` files and `.astro` inline `<style>` blocks for the six anti-patterns listed above. The command is registered as an app-scoped check in the content-quality command table and integrated into `SITES_CHECK_AUTHOR_PIPELINE` after `css.important.lint`.

## Architectural fit

- **Architecture DNA:** Establishes DNA-68 (Mobile Layout CSS Best Practices). Complements DNA-10 (no hardcoded design tokens) and DNA-67 (pre-deploy Lighthouse parity gate).
- **Anti-Patterns:** Prevents mobile layout shift anti-patterns before they reach the build.
- **Site OS operator model:** App-scoped check command, registered in `04-content-quality.ts` command table, reads CSS and Astro files. Follows the exact pattern of `css.important.lint`.
- **Scaling Playbook:** Applies uniformly across all sites — every site runs the author pipeline.

## Design

### CLI surface

```sh
pnpm exec werkstatt run css.mobile-layout.lint --app warpgogol-com
pnpm exec werkstatt run css.mobile-layout.lint --all --json
```

| Flag | Kind | Description |
| --- | --- | --- |
| `--mode` | string | `error` (default) or `warning`. Warning mode emits diagnostics but exits 0. Used during initial rollout. |
| `--json` | boolean | Emit JSON output instead of human-readable diagnostics. |

### TypeScript contracts

```ts
interface MobileLayoutViolation {
  filePath: string;
  line: number;
  column: number;
  ruleId: string;
  message: string;
  suggestion: string;
}

interface MobileLayoutLintResult {
  command: "css.mobile-layout.lint";
  violations: number;
  files: number;
  violationsByRule: Record<string, number>;
}
```

### Rule catalog

| Rule ID | Pattern | Severity | Message |
| --- | --- | --- | --- |
| `MOBILE-CSS-01` | `height: 100vh` without `100dvh` in same rule | error | `100vh` causes layout shift on mobile. Use `100dvh` (with `100vh` fallback for older browsers). |
| `MOBILE-CSS-02` | `width: 100vw` with `padding` or `border` in same rule | error | `100vw` with padding/border causes horizontal overflow. Use `100%` or `calc(100vw - scrollbar-width)`. |
| `MOBILE-CSS-03` | Fixed `width: Npx` where N > 380 without `max-width: 100%` in same rule | error | Fixed width exceeds mobile viewport without `max-width: 100%` safety net. |
| `MOBILE-CSS-04` | Negative `margin` on `body`, `main`, `html`, or section wrapper selectors | error | Negative margin on root container causes horizontal overflow on mobile. |
| `MOBILE-CSS-05` | `position: fixed` with `width: Npx` where N > 430 | error | Fixed-position element wider than mobile viewport causes permanent horizontal overflow. |
| `MOBILE-CSS-06` | `white-space: nowrap` without `overflow-wrap` or `word-break` in same rule | warning | `white-space: nowrap` without `overflow-wrap` or `word-break` may cause horizontal overflow on mobile. |

### File system responsibilities

| Path | Role |
| --- | --- |
| `<app>/src/styles/**/*.css` | Scanned for violations |
| `<app>/src/pages/**/*.astro` | Inline `<style>` blocks scanned |
| `packages/werkstatt-site/src/domain/ui/{sections,components}/**/*.astro` | Inline `<style>` blocks scanned (workspace scope) |
| `packages/werkstatt-site/src/domain/ui/**/*.css` | Scanned (workspace scope) |
| `packages/werkstatt-site/src/checks/css-mobile-layout-lint.ts` | New validator implementation |

### Output format

```json
{
  "command": "css.mobile-layout.lint",
  "status": "fail",
  "violations": 3,
  "files": 42,
  "violationsByRule": {
    "MOBILE-CSS-01": 1,
    "MOBILE-CSS-03": 2
  },
  "diagnostics": [
    {
      "filePath": "src/styles/global.css",
      "line": 45,
      "column": 3,
      "ruleId": "MOBILE-CSS-01",
      "message": "100vh causes layout shift on mobile. Use 100dvh (with 100vh fallback for older browsers).",
      "suggestion": "height: 100vh; height: 100dvh;"
    }
  ]
}
```

### Failure modes

- **Default mode (`error`):** Exits with code 1 when any violation is found. Diagnostics are logged to `context.logger.error`.
- **Warning mode (`--mode warning`):** Exits with code 0. Diagnostics are logged to `context.logger.warn`. Used during initial rollout to avoid blocking existing sites.
- **No CSS files found:** Exits with code 0, reports `files: 0`.
- **Parse errors:** If a CSS file cannot be parsed, the validator logs a warning and skips that file (does not crash the pipeline).

## Rollout

1. **Initial rollout (warning mode):** The validator is added to `SITES_CHECK_AUTHOR_PIPELINE` with `--mode warning` to collect violations without blocking builds. This allows sites to fix existing violations at their own pace.

2. **Hardening (error mode):** After all active sites have zero violations, the `--mode warning` arg is removed and the validator runs in default error mode. This transition is tracked in a follow-up RFC or ADR.

3. **New sites:** New sites materialized via `mission.materialize` automatically run the validator in error mode from day one, since they have no legacy violations.

4. **Pipeline integration:** Added to `SITES_CHECK_AUTHOR_PIPELINE` after `css.important.lint`. The `SITES_BUILD_PREPARE_DEV_PIPELINE` is codegen-only and does not run CSS lint steps — the author pipeline is the correct integration point.

## Alternatives considered

- **Post-deploy Lighthouse mobile audit:** Lighthouse already checks some mobile layout issues, but it runs post-deploy (too late) and does not catch all six anti-patterns (e.g., missing `100dvh` fallback). This RFC catches issues at author time, before build.

- **Stylelint plugin:** Stylelint has plugins for some of these rules, but adding Stylelint as a dependency to every site workpiece increases complexity. The Werkstatt pattern is self-contained validators that share the existing `collectFiles` / `getLineColumn` infrastructure.

- **CSS-in-JS analysis:** Not applicable — the Werkstatt uses plain CSS and Astro `<style>` blocks, not CSS-in-JS.

## Risks

- **False positives:** Some `100vh` usages may be intentional (e.g., desktop-only layouts behind a media query). The validator tracks `@media` block context during line-by-line scanning: it maintains a depth counter incremented by `@media` openings and decremented by closing braces. `100vh` inside `@media (min-width: 1024px)` is not a violation because the media query restricts it to desktop viewports.
- **Concurrent execution:** The validator is read-only (scans files, never writes) and safe to run concurrently with other builds. No file locking or mutual exclusion is needed.
- **Maintenance burden:** Six rules is manageable. New rules can be added incrementally.
- **Performance:** Scanning CSS files is fast (string regex, no AST). The existing `css.important.lint` scans the same file set in <100ms.

## Acceptance criteria

- [x] TypeScript types and interfaces defined in `packages/werkstatt-site/src/checks/css-mobile-layout-lint.ts` (evidence: commit 3f271aaa, file exports `MobileLayoutViolation`, `MobileLayoutLintResult`, `runCssMobileLayoutLint`)
- [x] CLI command registered with name `css.mobile-layout.lint` and scope `app` in `04-content-quality.ts` (evidence: commit 55751826, `CONTENT_QUALITY_COMMAND_TABLE` entry at line 245)
- [x] `--json` output format documented and stable (evidence: `MobileLayoutLintResult` interface with `command`, `violations`, `files`, `violationsByRule`; per-violation `filePath`, `line`, `column`, `ruleId`, `message`, `suggestion`)
- [x] Integrated into `SITES_CHECK_AUTHOR_PIPELINE` after `css.important.lint` (evidence: commit 55751826, `sites-check-author.ts` line 330 with `--mode=warning`)
- [x] Existing sites pass without changes in warning mode (evidence: pipeline runs with `--mode=warning`, exit code 0 even with violations)
- [x] `packages/werkstatt-site/AGENTS.md` Check commands section updated with `css.mobile-layout.lint` entry (evidence: commit 7c99b761, AGENTS.md line 84)
- [x] `docs/verification-plan.xml` updated to list `css.mobile-layout.lint` in the author pipeline check catalog (evidence: commit 7c99b761, vm-16 entry at line 441)
- [x] DNA-68 entry appended to `docs/architecture-dna.md` (evidence: commit 7c99b761, DNA-68 section at line 287)
- [x] `rfc.validate` passes on this file before merging (evidence: `pnpm exec werkstatt run rfc.validate --id RFC-0837` exits 0)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- For RFCs created on or after 2026-07-07 with acceptance probes: before stamping `implemented`, run `pnpm exec werkstatt run rfc.verification.emit --id RFC-0837` and commit the evidence file in the same commit.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0837 --reason "..." --invariant "DNA-N"` instead of working around it.
