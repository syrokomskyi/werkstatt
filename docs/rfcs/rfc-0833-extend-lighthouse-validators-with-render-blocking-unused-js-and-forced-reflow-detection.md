---
id: RFC-0833
title: "Extend lighthouse validators with render-blocking, unused-JS, and forced-reflow detection"
status: draft
kind: architecture
scope: app
owners:
  - architecture
reviewers: []
createdAt: 2026-08-13
updatedAt: 2026-08-13
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends:
  - RFC-0006
amendedBy: []
related:
  - RFC-0006
  - RFC-0204
  - DNA-15
  - DNA-58
satisfies:
  - DNA-15
versionBump: minor
commands:
  proposed: []
  added: []
  changed:
    - lighthouse.validate
    - lighthouse.budget.check
  removed: []
appsImpacted: []
packagesImpacted:
  - werkstatt-site
successSignals:
  - "No render-blocking CSS in dist without preload or inline critical CSS"
  - "No route bundle exceeds 40% unused JavaScript threshold"
  - "No client script contains forced reflow patterns (read-after-write layout without rAF)"
  - "Lighthouse Performance score ≥ 0.9 for sites passing all lighthouse validators"
  - "Lighthouse render-blocking-insight, unused-javascript, and forced-reflow-insight audits pass"
nonGoals:
  - "Does not replace post-deploy Lighthouse CI — complements it with build-time detection"
  - "Does not implement critical CSS inlining — validates that it has been done"
  - "Does not perform runtime coverage analysis — unused JS is estimated from source structure"
  - "Does not replace image.delivery.validate (RFC-0830) — focuses on CSS and JS delivery"
---

# RFC-0833: Extend lighthouse validators with render-blocking, unused-JS, and forced-reflow detection

## Context

The Lighthouse report for `warpgogol.com` (2026-08-13) shows **Performance score 0.67** with three contributing issues beyond image delivery (covered by RFC-0830):

1. **Render-blocking CSS** — `global.DiQx5N9f.css` (9 KB) blocks rendering for 151 ms. Lighthouse estimates 600 ms FCP savings. The `render-blocking-insight` audit (score 0) flags this.

2. **Unused JavaScript** — `dist.yS3yinqp.js` (58 KB transfer, 49% unused = 28 KB wasted). Lighthouse estimates 300 ms LCP savings. The `unused-javascript` audit (score 0) flags this.

3. **Forced reflow** — `header-component.astro_astro_type_script_index_0_lang.js` causes a 166 ms forced reflow (reads layout while writing). The `forced-reflow-insight` audit (score 0) flags this.

The existing `lighthouse.validate` (RFC-0006) implements LH-01..09:

- LH-01: Static output configuration
- LH-02: Dynamic imports without DOM guards
- LH-03: Synchronous heavy library imports
- LH-04: Script src without defer/async
- LH-05: Long setTimeout without requestIdleCallback
- LH-06: Heavy animation init without user-action defer
- LH-07: Animation code without reduced-motion guard
- LH-08: Heavy feature without device capability check
- LH-09: Direct DOM write without diffing

The existing `lighthouse.budget.check` (RFC-0006) implements LH-10:

- LH-10: 300 KB uncompressed budget per route/client entry bundle

**Gaps:** No rule detects render-blocking CSS, unused JS ratio, or forced reflow patterns. These three Lighthouse audits have no build-time equivalent.

## Problem

Three invariants are unprotected:

1. **P1: Render-blocking CSS** — No validator checks that CSS is delivered non-blocking (via `preload` + `onload` swap, or inlined as critical CSS, or using `@astrojs/compiler` `inlineStylesheets` setting). A single render-blocking `<link rel="stylesheet">` can delay FCP by hundreds of milliseconds.

2. **P2: Unused JavaScript threshold** — No validator checks the unused-to-total ratio of route bundles. `lighthouse.budget.check` (LH-10) checks absolute size (300 KB) but not unused ratio. A 58 KB bundle with 49% unused passes LH-10 but wastes 28 KB of bandwidth and 300 ms of LCP time.

3. **P3: Forced reflow patterns** — No validator detects layout-thrash patterns in client scripts (reading layout properties like `offsetWidth` after writing to the DOM, without `requestAnimationFrame` separation). The `header-component.astro` inline script causes 166 ms of reflow.

Reference failure modes from the Lighthouse report:

- `global.css` — 151 ms render-blocking, est. 600 ms FCP savings
- `dist.js` — 49% unused, 28 KB wasted, est. 300 ms LCP savings
- `header-component.js` — 166 ms forced reflow from layout read-after-write

## Decision

The existing `lighthouse.validate` and `lighthouse.budget.check` commands are extended with three new rules:

- **LH-11**: Render-blocking CSS detection (post-build, in `lighthouse.budget.check`)
- **LH-12**: Unused JavaScript threshold (post-build, in `lighthouse.budget.check`)
- **LH-13**: Forced reflow pattern detection (pre-build, in `lighthouse.validate`)

Additionally, this RFC establishes **DNA-67: Pre-deploy Lighthouse parity gate** — every Lighthouse audit that can be deterministically checked at build time MUST have a build-time validator.

## Architectural fit

- **DNA-15** (Scripts follow placement contract) — LH-13 extends the script placement contract to include layout-thrash prevention.
- **DNA-58** (Generated-file content determinism) — LH-11 and LH-12 validate post-build artifacts deterministically.
- **RFC-0006** (Lighthouse rules) — This RFC amends RFC-0006 by adding LH-11..13 to the existing rule set.
- **RFC-0830** (image.delivery.validate) — Complementary. RFC-0830 handles image delivery; this RFC handles CSS and JS delivery.
- **Site OS operator model** — LH-11 and LH-12 are post-build (extend `lighthouse.budget.check` in `SITES_CHECK_POSTBUILD_PIPELINE`). LH-13 is pre-build (extends `lighthouse.validate` in `SITES_CHECK_AUTHOR_PIPELINE`).

## Design

### LH-11: Render-blocking CSS detection

**Where:** `lighthouse.budget.check` (post-build, scans `dist/client/`)

**What:** Scans all `.html` files in `dist/client/` for `<link rel="stylesheet">` elements. A stylesheet is render-blocking if:

- It has `rel="stylesheet"` (not `rel="preload"` with `as="style"`)
- It does NOT have `media="print"` or `media` with a non-matching query
- It is NOT inlined (external URL)

**Astro `inlineStylesheets` check:** The validator also reads `astro.config.mjs` for the `build.inlineStylesheets` setting. If set to `"auto"` or `"always"`, small stylesheets are inlined automatically and the check is relaxed for sheets under the `inlineStylesheets` threshold.

**Rule:**

```
For each <link rel="stylesheet"> in dist/client/**/*.html:
  if not media="print" and not preload+onload pattern:
    report LH-11 (error)
```

**Severity:** `error` for external render-blocking stylesheets > 4 KB. `warning` for ≤ 4 KB (small enough to inline).

**Fix hint:** "Set `build.inlineStylesheets: 'auto'` in astro.config.mjs, or use `<link rel='preload' as='style' onload='this.rel=stylesheet'>` pattern, or inline critical CSS."

### LH-12: Unused JavaScript threshold

**Where:** `lighthouse.budget.check` (post-build, scans `dist/client/_astro/*.js`)

**What:** Estimates the unused-to-total ratio of each route bundle by analyzing export usage. The validator:

1. For each `.js` file in `dist/client/_astro/`, parse the AST to identify exported symbols.
2. Scan all `.html` files in `dist/client/` for references to those exports (via `<script>` import chains).
3. Exports not referenced by any HTML page are "unused".
4. Calculate `unusedRatio = unusedBytes / totalBytes` (estimated from export sizes).

**Simplified approach (no AST parsing):** For each JS bundle, check if it's imported by any HTML page. If a bundle is imported but its exports are not called (heuristic: no matching function call patterns in inline scripts), flag it. This is a conservative estimate — false positives are possible but false negatives are unlikely.

**Rule:**

```
For each .js in dist/client/_astro/:
  unusedRatio = estimateUnusedRatio(file, htmlFiles)
  if unusedRatio > 0.40:
    report LH-12 (error)
  elif unusedRatio > 0.25:
    report LH-12 (warning)
```

**Severity:** `error` for > 40% unused. `warning` for 25–40% unused.

**Fix hint:** "Tree-shake unused exports, use dynamic import() for route-specific code, or split the bundle into smaller chunks."

### LH-13: Forced reflow pattern detection

**Where:** `lighthouse.validate` (pre-build, scans `src/scripts/**/*.ts` and `.astro` inline scripts)

**What:** Detects layout-thrash patterns in client-side scripts. A forced reflow occurs when code reads a layout property (e.g., `offsetWidth`, `offsetHeight`, `getBoundingClientRect`, `clientWidth`, `scrollTop`) after writing to the DOM (e.g., `appendChild`, `innerHTML`, `style.*`, `classList.add`) without a `requestAnimationFrame` separator.

**Pattern detection:**

```
LAYOUT_READ_PROPERTIES = [
  "offsetWidth", "offsetHeight", "offsetTop", "offsetLeft",
  "clientWidth", "clientHeight", "clientTop", "clientLeft",
  "scrollWidth", "scrollHeight", "scrollTop", "scrollLeft",
  "getBoundingClientRect", "getComputedStyle",
]

DOM_WRITE_METHODS = [
  "appendChild", "removeChild", "insertBefore", "replaceChild",
  "innerHTML", "outerHTML", "textContent",
  "style", "classList.add", "classList.remove", "classList.toggle",
  "setAttribute", "removeAttribute",
]

For each function/block in client script:
  Detect sequences where a DOM_WRITE is followed by a LAYOUT_READ
  without an intervening requestAnimationFrame or requestIdleCallback.
  Report LH-13.
```

**Severity:** `warning` (forced reflow is a performance issue, not a correctness bug).

**Fix hint:** "Batch DOM writes before reads, or wrap the read in requestAnimationFrame to defer it to the next frame."

### CLI surface

No new commands. Existing commands gain new rules:

```sh
pnpm exec werkstatt run lighthouse.validate --app warpgogol-com    # now includes LH-13
pnpm exec werkstatt run lighthouse.budget.check --app warpgogol-com # now includes LH-11, LH-12
```

### TypeScript contracts

```ts
// Extends existing Finding type with new rule IDs
interface LighthouseFinding {
  rule: "LH-01" | "LH-02" | /* ... */ | "LH-10" | "LH-11" | "LH-12" | "LH-13";
  filePath: string;
  line: number;
  message: string;
  severity: "error" | "warning";
  data?: {
    unusedRatio?: number;      // LH-12
    unusedBytes?: number;      // LH-12
    totalBytes?: number;       // LH-12
    renderBlockingMs?: number; // LH-11
    reflowMs?: number;         // LH-13
  };
}
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `dist/client/**/*.html` | Scanned for render-blocking CSS (LH-11) |
| `dist/client/_astro/*.js` | Analyzed for unused JS ratio (LH-12) |
| `src/scripts/**/*.ts` | Scanned for forced reflow patterns (LH-13) |
| `src/**/*.astro` (inline scripts) | Scanned for forced reflow patterns (LH-13) |
| `astro.config.mjs` | Read for `inlineStylesheets` setting (LH-11) |
| `packages/werkstatt-site/src/checks/lighthouse.ts` | Extended with LH-11..13 |

### Output format

Extends existing `lighthouse.validate` and `lighthouse.budget.check` output:

```json
{
  "command": "lighthouse.budget.check",
  "findings": [
    {
      "rule": "LH-11",
      "filePath": "dist/client/de/index.html",
      "line": 8,
      "message": "Render-blocking stylesheet: /_astro/global.DiQx5N9f.css (9 KB) — use inlineStylesheets or preload pattern",
      "severity": "error",
      "data": { "renderBlockingMs": 151 }
    },
    {
      "rule": "LH-12",
      "filePath": "dist/client/_astro/dist.yS3yinqp.js",
      "line": 1,
      "message": "49% unused JavaScript (28 KB of 58 KB) — tree-shake or dynamic import",
      "severity": "error",
      "data": { "unusedRatio": 0.49, "unusedBytes": 28669, "totalBytes": 58131 }
    }
  ]
}
```

### Failure modes

- LH-11 `error` → `exitCode: 1` (render-blocking CSS > 4 KB)
- LH-11 `warning` → logged (render-blocking CSS ≤ 4 KB)
- LH-12 `error` → `exitCode: 1` (> 40% unused)
- LH-12 `warning` → logged (25–40% unused)
- LH-13 `warning` → logged (forced reflow pattern detected)
- Missing `dist/client/` → skip LH-11 and LH-12 (no build output)
- Missing `src/scripts/` → skip LH-13 (no scripts to scan)
- `--json` flag → machine-readable output, same exit code.

## DNA-67: Pre-deploy Lighthouse parity gate

This RFC establishes **DNA-67: Pre-deploy Lighthouse parity gate**.

Every Lighthouse audit that can be deterministically checked at build time MUST have a build-time validator in the Werkstatt pipeline. This prevents relying on post-deploy Lighthouse runs to catch issues that could be caught earlier.

Coverage matrix (maintained as Lighthouse adds new audits):

| Lighthouse audit | Build-time validator | Status |
| --- | --- | --- |
| `first-contentful-paint` | `image.delivery.validate` (RFC-0830), `lighthouse.budget.check` (LH-11) | Covered |
| `largest-contentful-paint` | `image.delivery.validate` (RFC-0830), `lighthouse.budget.check` (LH-12) | Covered |
| `total-blocking-time` | `lighthouse.validate` (LH-02, LH-03) | Covered |
| `cumulative-layout-shift` | `lighthouse.validate` (LH-09) | Covered |
| `speed-index` | `image.delivery.validate` (RFC-0830), `lighthouse.budget.check` (LH-11) | Covered |
| `render-blocking-insight` | `lighthouse.budget.check` (LH-11) | This RFC |
| `unused-javascript` | `lighthouse.budget.check` (LH-12) | This RFC |
| `forced-reflow-insight` | `lighthouse.validate` (LH-13) | This RFC |
| `errors-in-console` | `csp.origins.validate` (RFC-0831) | RFC-0831 |
| `inspector-issues` | `csp.origins.validate` (RFC-0831) | RFC-0831 |
| `label-content-name-mismatch` | `a11y.label-in-name.validate` (RFC-0832) | RFC-0832 |
| `network-dependency-tree-insight` | Future — `network.tree.validate` | Gap |
| `image-delivery-insight` | `image.delivery.validate` (RFC-0830) | RFC-0830 |

The coverage matrix is maintained in `docs/lighthouse-parity-matrix.yaml` (generated, tracked). A new validator `lighthouse.parity.validate` (future RFC) will enforce that every Lighthouse audit in the matrix has a corresponding build-time validator.

## Rollout

- **LH-11 (render-blocking CSS):**
  - Default: `error` for > 4 KB, `warning` for ≤ 4 KB.
  - Existing apps: Set `build.inlineStylesheets: 'auto'` in `astro.config.mjs` to auto-inline small sheets. For large sheets, use preload pattern.
  - Grace period: 1 week `warning`-only, then `error`.

- **LH-12 (unused JS):**
  - Default: `error` for > 40%, `warning` for 25–40%.
  - Existing apps: Tree-shake unused exports or use dynamic imports.
  - Grace period: 2 weeks `warning`-only, then `error`.

- **LH-13 (forced reflow):**
  - Default: `warning` (not `error`). Forced reflow is a performance issue, not a correctness bug.
  - Existing apps: Fix reflow patterns by batching DOM writes before reads or using `requestAnimationFrame`.
  - No grace period needed (warning-only).

- **DNA-67:** Established immediately. The coverage matrix is maintained as new Lighthouse audits are discovered.

## Alternatives considered

- **Separate commands for each rule** — Rejected. LH-11 and LH-12 are post-build concerns that naturally extend `lighthouse.budget.check` (which already scans `dist/`). LH-13 is a pre-build concern that naturally extends `lighthouse.validate` (which already scans `src/scripts/`). Creating separate commands would fragment the lighthouse rule set.

- **Post-deploy Lighthouse CI only** — Rejected. The user's requirement is pre-deploy detection. Post-deploy Lighthouse catches issues after the site is live.

- **Critical CSS auto-generation** — Rejected for this RFC. This RFC validates that CSS is non-blocking; it does not generate critical CSS. Critical CSS generation is a separate concern (future RFC if needed).

- **AST-based unused JS analysis** — Rejected for now. Full AST parsing of production bundles is complex and slow. The heuristic approach (export reference scanning) is faster and catches the common case. Can be upgraded to AST-based in a future RFC if false negatives become a problem.

## Risks

- **LH-12 false positives** — The unused JS heuristic may flag bundles that are used by dynamically loaded routes not in the initial HTML. Mitigated by scanning all HTML files in `dist/client/`, not just the index.
- **LH-13 false positives** — The reflow pattern detector may flag code that intentionally reads layout after write (e.g., measurement code). Mitigated by `warning` severity and the `requestAnimationFrame` exception.
- **LH-11 Astro inlineStylesheets interaction** — Astro's `inlineStylesheets: 'auto'` inlines sheets under a size threshold (default 4 KB). The validator must respect this threshold to avoid false positives. Mitigated by reading the Astro config.
- **DNA-67 maintenance burden** — The coverage matrix must be updated as Lighthouse adds new audits. Mitigated by making the matrix a generated file that can be cross-referenced with Lighthouse's audit list.

## Acceptance criteria

- [ ] LH-11 rule implemented in `lighthouse.budget.check`
- [ ] LH-12 rule implemented in `lighthouse.budget.check`
- [ ] LH-13 rule implemented in `lighthouse.validate`
- [ ] `astro.config.mjs` `inlineStylesheets` setting respected by LH-11
- [ ] `docs/lighthouse-parity-matrix.yaml` created with coverage matrix
- [ ] DNA-67 entry appended to `docs/architecture-dna.md`
- [ ] `dna.registry.validate` passes with DNA-67
- [ ] Unit tests for LH-11 (fixture HTML with render-blocking CSS)
- [ ] Unit tests for LH-12 (fixture JS with unused exports)
- [ ] Unit tests for LH-13 (fixture TS with reflow pattern)
- [ ] `warpgogol.com` passes all lighthouse validators after fixing CSS, JS, and reflow
- [ ] `rfc.validate` passes on this file before merging
- [ ] `AGENTS.md` updated with LH-11..13 rules and DNA-67

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- For RFCs created on or after 2026-07-07 with acceptance probes: before stamping `implemented`, run `pnpm exec werkstatt run rfc.verification.emit --id RFC-0833` and commit the evidence file in the same commit.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0833 --reason "..." --invariant "DNA-N"` instead of working around it.
- Implementation order: LH-13 first (pre-build, source scanning), then LH-11 (post-build, CSS), then LH-12 (post-build, JS), then DNA-67 + parity matrix, then fix `warpgogol.com` issues.
- DNA-67 must be appended to `docs/architecture-dna.md` before running `dna.registry.validate`.
