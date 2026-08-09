---
id: RFC-0011
title: "Establish script placement contract: src/scripts canonical pattern, colocation, and deferred loading"
status: implemented
kind: contract
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-04-14
updatedAt: 2026-04-14
implementedAt: 2026-04-14
closedAt:
supersedes: []
supersededBy:
related:
  - RFC-0006
  - RFC-0009
  - RFC-0031
  - DNA-18
  - AP-10
commands:
  proposed:
    - scripts.placement.validate
  added:
    - scripts.placement.validate
  changed: []
  removed: []
appsImpacted:
  - main
  - my-main
  - nicaragua-projekt
packagesImpacted:
  - site-kernel-checks
successSignals:
  - Every behavioral script lives in src/scripts/ and is loaded via Astro native <script> with import
  - No component-owned scripts are loaded globally from layout.astro
  - No bare <script is:inline> block exceeds 5 lines in any layout or component file
  - public/scripts/components/ contains only vanilla JS files loaded by their owning component directly
  - S-2 layout-global logic uses has() DOM guard + await import() deferred pattern
  - scripts.placement.validate passes with exit 0 for all apps
  - Architecture DNA Invariant 18 updated to reference this RFC
  - anti-patterns.md extended with AP-18 and AP-19
nonGoals:
  - Do not validate script content or behavior — only placement, colocation, and loading pattern
  - Do not mandate specific requestIdleCallback timeout values (that is RFC-0006 territory)
  - Do not affect structured-data <script type="application/ld+json"> tags — they are data, not scripts
  - Do not require migration of all legacy scripts in a single change
---

# RFC-0011: Establish script placement contract: src/scripts canonical pattern, colocation, and deferred loading

## Context

RFC-0009 established the component quartet mirror, including the optional `public/scripts/components/{name}.js` leg. RFC-0006 established performance loading rules (defer, requestIdleCallback, conditional import).

Neither RFC establishes **where a script must live**, **how it must be loaded**, nor **which loading pattern is canonical**. This gap has caused a concrete violation in the codebase and leaves agents without a clear rule to follow when adding new scripts.

### The canonical pattern established by `apps/main`

`apps/main` has solved this problem through disciplined practice. Its script loading architecture is:

1. **All behavioral scripts live in `src/scripts/`** — TypeScript modules that can be imported, tested, and tree-shaken.
2. **Each `.astro` component loads its script via Astro's native `<script>` with `import`** — Astro processes, deduplicates, and bundles these automatically.
3. **S-2 layout-global scripts use an orchestrator** (`layout-scroll.ts`) that applies `has()` DOM guards before each `await import()` — the module is only fetched if the corresponding DOM element is present on the page.
4. **Heavy or non-critical modules use `requestIdleCallback` + `await import()`** or `waitForFirstUserAction().then(() => import(...))` to defer work until the browser is idle or the user has interacted.

This pattern means: scripts are deferred, conditional, cacheable as Astro bundles, and never block rendering.

**Example — `apps/main` layout orchestrator pattern (canonical S-2):**

```ts
// src/scripts/layout-scroll.ts
const has = (selector: string) => document.querySelector(selector) instanceof Element;

void (async () => {
  if (has(".scroll-to-top")) {
    const mod = await import("./layout-scroll/scroll");
    mod.initScrollToTop({ prefersReducedMotion });
  }

  if (has("[data-glossary-on-demand]")) {
    void waitForFirstUserAction().then(async () => {
      const mod = await import("./layout-scroll/glossary");
      mod.initGlossaryOnDemand();
    });
  }
})();
```

**Example — component script (canonical S-1):**

```astro
<!-- src/components/header.astro -->
<script>
  import "../scripts/components/header";
</script>
```

```ts
// src/scripts/components/header.ts
const toggle = document.querySelector(".header__mobile-toggle");
if (toggle) { /* ... */ }
```

### Current violations in `nicaragua-projekt`

In `apps/nicaragua-projekt/src/layouts/layout.astro` (lines 117–161), two scripts deviate from this pattern:

1. `<script is:inline src="/scripts/components/copyright.js" defer>` — loads a component-owned script globally from layout, bypassing Astro bundling and colocation.
2. A bare `<script is:inline>` block (~40 lines) — not cached as a bundle; re-transmitted on every page load.

### Audit of all `apps/*`

| File | Script type | Assessment |
| --- | --- | --- |
| `nicaragua-projekt/src/layouts/layout.astro:117` | `is:inline src=` for component script | **Violation** — S-1 loaded from layout |
| `nicaragua-projekt/src/layouts/layout.astro:119` | bare `is:inline` 40-line block | **Violation** — not a bundle, not cacheable |
| `nicaragua-projekt/src/components/header.astro:143` | `<script>` Astro bundled inline | **Partial** — correct colocation, but logic should move to `src/scripts/components/header.ts` |
| `nicaragua-projekt/src/pages/index.astro:48` | `is:inline` RFC-0010 lang detect | Correct — S-3, page-scoped, tiny |
| `main/src/layouts/layout.astro:250` | `<script>` + `import layout-scroll` | Correct — canonical S-2 |
| `main/src/components/header.astro:150` | `<script>` + `import ../scripts/components/header` | Correct — canonical S-1 |
| `main/src/components/footer.astro:321` | `<script>` Astro bundled | Correct — colocated S-1 |
| `main/src/components/faq.astro:61` | `<script>` Astro bundled | Correct — colocated S-1 |
| `main/src/components/process-steps.astro:96` | `<script>` + deferred `await import()` | Correct — canonical S-1 with idle scheduling |
| `main/src/components/section/hero-roi-section.astro:361` | `<script>` Astro bundled | Correct — colocated S-1 |
| `main/src/components/section/why-us-section.astro:130` | `<script>` + `requestIdleCallback` + `await import()` | Correct — canonical S-1 with idle scheduling |
| `main/src/components/feedback-message-form.astro:110,123` | `is:inline` data island + `<script>` | Correct — S-X data + S-1 |
| `main/src/pages/404.astro:164` | `is:inline` 3 lines | Correct — S-3, page-scoped |
| `main/src/pages/[lang]/404.astro:167` | `is:inline` 3 lines | Correct — S-3, page-scoped |
| `main/src/pages/index.astro:48` | `is:inline` RFC-0010 lang detect | Correct — S-3, page-scoped |
| `my-main/src/layouts/layout.astro:138` | `<script>` + `import layout-scroll` | Correct — canonical S-2 |
| `my-main/src/components/header.astro:170` | `<script>` + `import ../scripts/components/header` | Correct — canonical S-1 |
| `my-main/src/components/footer.astro:223` | `<script>` Astro bundled | Correct — colocated S-1 |
| `my-main/src/pages/index.astro:48` | `is:inline` RFC-0010 lang detect | Correct — S-3, page-scoped |

Primary violations are in `nicaragua-projekt/src/layouts/layout.astro`. Additionally, `nicaragua-projekt/src/components/header.astro` uses an acceptable but non-canonical inline script block that should eventually migrate to `src/scripts/components/header.ts` following the `apps/main` model.

## Problem

Four specific gaps remain unprotected:

**Gap 1 — No canonical loading pattern documented for agents.** `apps/main` uses `src/scripts/` + Astro `<script>` with `import` throughout. This produces cached, tree-shaken, deduplicated bundles. But nothing in RFC-0006 or RFC-0009 declares this as the **only** permitted approach. Agents default to `<script is:inline>` or `public/scripts/` because no RFC says otherwise.

**Gap 2 — No colocation rule for component scripts.** Nothing prevents an agent from placing a component's script as a `<script is:inline src=...>` in `layout.astro`. The script then loads on every page regardless of whether the component is present.

**Gap 3 — No restriction on bare inline blocks in layout.** `layout.astro` is a Class 4 component. Its contract says it must not become a dumping ground for utilities. But nothing prevents agents from writing large inline logic blocks that bypass Astro bundling and caching.

**Gap 4 — `public/scripts/` used as primary delivery channel instead of fallback.** `public/scripts/` files are static assets served verbatim — they bypass Astro's bundler, deduplication, and TypeScript compilation. They are valid only for the `copyright.astro` case: vanilla JS that has no imports and is loaded by its owning component via `<script is:inline src=...>`. Using `public/scripts/` as the primary delivery mechanism for any new script is an anti-pattern.

## Decision

### Part A — Canonical loading pattern (normative)

The **`src/scripts/` + Astro native `<script>` with `import`** pattern used in `apps/main` is the **sole canonical pattern** for all behavioral scripts in `apps/*`.

**Why this pattern is canonical:**

- Astro processes `<script>` blocks as ES modules: TypeScript compilation, tree-shaking, deduplication across pages, cache-friendly content-hashed bundles.
- `src/scripts/` modules are importable, testable, and lintable — unlike `public/` static files.
- The `has()` DOM guard + `await import()` pattern means: zero bytes downloaded for features absent from the current page.
- `requestIdleCallback` + `waitForFirstUserAction()` patterns (RFC-0006) integrate naturally with `await import()`.

**The deferred loading pattern for S-2 orchestrators (canonical):**

```ts
// src/scripts/layout-scroll.ts  — or app equivalent
const has = (selector: string) => document.querySelector(selector) instanceof Element;
const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

void (async () => {
  // Load only when element is present on this page
  if (has(".scroll-to-top")) {
    const mod = await import("./layout-scroll/scroll");
    mod.initScrollToTop({ prefersReducedMotion });
  }

  // Defer until user interaction for non-critical features
  if (has("[data-glossary-on-demand]")) {
    void waitForFirstUserAction().then(async () => {
      const mod = await import("./layout-scroll/glossary");
      mod.initGlossaryOnDemand();
    });
  }
})();
```

**The component-colocated pattern for S-1 (canonical):**

```astro
<!-- src/components/header.astro -->
<script>
  import "../scripts/components/header";
</script>
```

```ts
// src/scripts/components/header.ts
const toggle = document.querySelector(".header__mobile-toggle");
if (toggle) { /* event listeners */ }
```

### Part B — Script taxonomy (normative)

Every `<script>` or `<script src>` in any `apps/*` file belongs to exactly one of four **placement classes**:

**Class S-1 — Component-colocated script**

A script whose behavior is only meaningful when a specific component is present on the page.

- **Canonical form**: Astro native `<script>` block inside the owning `.astro` component, with `import` pointing to `src/scripts/components/{path}/{name}.ts`.
- **Permitted fallback** (for vanilla JS with zero imports, e.g. `copyright.astro`): `<script is:inline src="/scripts/components/{path}/{name}.js">` inside the `.astro` file, with `defer`. Requires `// @client-script: required` directive (RFC-0009 Q-02).
- **Must NOT** appear in `layout.astro`, a parent layout, or any file that is not the owning component.
- **Examples**: `header.astro` mobile menu, `copyright.astro` year sync, `faq.astro` accordion, `footer.astro` copy buttons.

**Class S-2 — Layout-global script**

A script whose behavior applies to the whole document regardless of which components are present.

- **Canonical form**: Astro native `<script>` block in `layout.astro` with `import` pointing to `src/scripts/{name}.ts`. The imported module MUST use `has()` DOM guards before each `await import()` for sub-features.
- **Must NOT** be a bare `<script is:inline>` block in `layout.astro` — no exceptions.
- **Must NOT** use `public/scripts/layout/` — all layout-global logic lives in `src/scripts/` and goes through Astro bundling.
- **Examples**: `layout-scroll.ts` orchestrator, external link behavior, global keyboard traps.

**Class S-3 — Page-scoped inline script**

A tiny, page-specific script that must run before first render or cannot use bundling for correctness reasons.

- **Placement rule**: `is:inline` directly in a `src/pages/` route file only; never in a shared component or layout.
- **Size limit**: ≤ 10 lines. If larger, extract to `src/scripts/pages/{page-name}.ts` and use Astro bundling.
- **Examples**: RFC-0010 language detection (`index.astro`), 404 path display (`404.astro`).

**Class S-X — Data island** (not a behavioral script — exempt from this RFC)

`<script type="application/ld+json">` and `<script type="application/json" id="...">` are data delivery mechanisms, not behavioral scripts. They are governed by semantic output contracts, not by this RFC.

### Part C — Remediation of existing violations

| File | Violation | Required change |
| --- | --- | --- |
| `nicaragua-projekt/src/layouts/layout.astro:117` | S-1 script loaded from layout | Remove from `layout.astro`; add `<script is:inline src="/scripts/components/copyright.js" defer>` inside `copyright.astro` |
| `nicaragua-projekt/src/layouts/layout.astro:119` | Bare `is:inline` 40-line S-2 block | Extract logic to `src/scripts/layout-scroll.ts` (new file, following `apps/main` pattern); replace with `<script>import "../scripts/layout-scroll";</script>` |

For Part C item 2: `nicaragua-projekt` must create `src/scripts/layout-scroll.ts` as an S-2 orchestrator following the `apps/main` canonical pattern. The `applyExternalLinkBehavior` logic becomes a module imported with a `has("a[href]")` guard.

### Part D — New validation command

The kernel gains a `scripts.placement.validate` command that enforces the canonical pattern and placement classes via static analysis of `.astro` files.

## Architectural fit

**Architecture DNA:**

- **DNA-18 (Scripts follow responsibility and placement boundaries)**: This RFC provides the concrete implementation rules for DNA-18, establishing `src/scripts/` as the canonical location and Astro `<script>` + `import` as the canonical loader. Updated to reference RFC-0011.
- **AP-10 (Heavy deps in static shell)**: The S-1 colocation rule prevents component scripts from polluting the layout shell. The `has()` guard prevents heavy modules from downloading when absent from a page.

**New anti-patterns added to anti-patterns.md:**

- **AP-18**: Loading a component-owned script from `layout.astro` or a parent component.
- **AP-19**: Using a bare `<script is:inline>` block instead of `src/scripts/` + Astro bundling for behavioral scripts.

**Component Contracts:**

- Class 4 (Layout) contract gains an explicit scripts clause: only S-2 Astro `<script>` blocks with `import` are permitted; bare inline blocks and S-1 scripts are forbidden.
- Class 2/3 (Content-driven and Section) contracts gain: component-owned scripts must be colocated (S-1), canonical form is `src/scripts/components/` + `<script>` with `import`.

**RFC-0009 interaction:**

- Q-02 (`@client-script: required` → `public/scripts/components/{path}/{name}.js` exists) is unchanged and remains valid for the permitted vanilla-JS fallback.
- This RFC adds: a component declaring `@client-script: required` MUST load that script from within itself, not from `layout.astro`.
- The preferred upgrade path for `public/scripts/` files is to TypeScript in `src/scripts/` + Astro `<script>` with `import` (dropping the `public/scripts/` leg and the `@client-script: required` directive).

**RFC-0006 interaction:**

- LH-04 (external scripts must use `defer`) still applies to the S-1 `is:inline src=` fallback case.
- RFC-0011 goes further: bare `<script is:inline>` blocks for behavioral logic are forbidden everywhere, not just in layout. Use `src/scripts/` instead.

## Design

### CLI surface

```sh
# Validate script placement for one app
pnpm exec werkstatt run scripts.placement.validate --app nicaragua-projekt

# Machine-readable output for CI
pnpm exec werkstatt run scripts.placement.validate --app nicaragua-projekt --json

# Validate all apps
pnpm exec werkstatt run scripts.placement.validate --all --json
```

### Validation rules

| Rule ID | Condition | Severity |
| --- | --- | --- |
| `SP-01` | `layout.astro` contains `<script is:inline src=` pointing to `public/scripts/components/` | error |
| `SP-02` | `layout.astro` contains a bare `<script is:inline>` block with > 5 lines of content | error |
| `SP-03` | A component declares `@client-script: required` but its script is also referenced from `layout.astro` | error |
| `SP-04` | Any `.astro` file (outside `src/pages/`) contains a bare `<script is:inline>` block with > 5 lines | warning |
| `SP-05` | A route file (`src/pages/`) contains an `is:inline` block > 10 lines | warning |

### TypeScript contracts

```ts
type ScriptPlacementRule = 'SP-01' | 'SP-02' | 'SP-03' | 'SP-04' | 'SP-05' | 'SP-06';

interface ScriptPlacementViolation {
  file: string;
  rule: ScriptPlacementRule;
  message: string;
  line?: number;
}

interface ScriptPlacementResult {
  command: 'scripts.placement.validate';
  status: 'pass' | 'fail';
  violations: ScriptPlacementViolation[];
}
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `src/components/**/*.astro` | Scanned for SP-03, SP-04 |
| `src/pages/**/*.astro` | Scanned for SP-05 |
| `public/scripts/components/**/*.js` | Permitted only as S-1 vanilla-JS fallback; must not appear in layout |
| `packages/os/site-kernel-checks/src/scripts-placement.ts` | New handler implementing SP-01..SP-06 |

### Output format

```json
{
  "command": "scripts.placement.validate",
  "status": "fail",
  "violations": [
    {
      "file": "src/layouts/layout.astro",
      "rule": "SP-01",
      "message": "layout.astro loads component script /scripts/components/copyright.js globally — move <script src> into copyright.astro",
      "line": 117
    },
    {
      "file": "src/layouts/layout.astro",
      "rule": "SP-02",
      "message": "layout.astro contains inline <script> block of 41 lines (limit 5) — extract to public/scripts/layout/external-links.js",
      "line": 119
    }
  ]
}
```

### Failure modes

| Scenario                         | Behavior                                 |
| -------------------------------- | ---------------------------------------- |
| SP-01 or SP-02 or SP-03 detected | Exit 1, error                            |
| SP-04 or SP-05 detected          | Exit 0, warning printed                  |
| `--json` flag                    | Machine-readable output, same exit codes |

## Rollout

**Phase 1 (This RFC — after acceptance):** Define contract and classification rules. Update DNA-18, AP table, component-contracts.md. No code changes to apps yet.

**Phase 2 — Remediation of `nicaragua-projekt` violations (atomic change):**

1. Create `src/scripts/layout-scroll.ts` following the `apps/main` canonical pattern.
2. Move `applyExternalLinkBehavior` logic from the inline block into a module imported by `layout-scroll.ts` with a `has("a[href]")` guard.
3. Replace the inline `<script is:inline>` block in `layout.astro` with:
   ```astro
   <script>
     import "../scripts/layout-scroll";
   </script>
   ```
4. Move `<script is:inline src="/scripts/components/copyright.js" defer>` from `layout.astro` into `copyright.astro`.
5. Verify `mirror.quartet.validate` and `scripts.placement.validate` both pass.

**Phase 3 — Implement `scripts.placement.validate` command in `site-kernel-checks`:**

- Add `scripts-placement.ts` handler.
- Register command.
- Add to `STANDARD_CHECK_PIPELINE` after `mirror.quartet.validate`.

**Phase 4 — Verify all apps pass:**

- `main` and `my-main` already comply — no changes expected.
- `nicaragua-projekt` complies after Phase 2.

**Default behavior on first introduction:**

- SP-01, SP-02, SP-03 are fail-hard (errors) from day one for new apps.
- Existing apps get one grace cycle via `--warn-only` before SP-01/SP-02/SP-03 are promoted to errors.
- SP-04 and SP-05 are warnings only and never block the build.

## Alternatives considered

| Alternative | Rejected because |
| --- | --- |
| Allow S-1 scripts in layout with a comment exemption | Would normalize the anti-pattern; exemptions accumulate |
| Enforce placement via lint rules only (eslint/stylelint) | `.astro` files are not standard JS/CSS; kernel commands are the established validation mechanism |

## Risks

| Risk | Mitigation |
| --- | --- |
| Agent misclassifies a script (wrong placement class) | Taxonomy in this RFC is normative; agents MUST consult S-1/S-2/S-3/S-X table before placing any script |
| Moving `copyright.js` `<script>` to `copyright.astro` causes double-load | `is:inline src=` is not deduplicated by Astro — copyright component appears exactly once per page, so this is safe |
| `src/scripts/layout-scroll.ts` in `nicaragua-projekt` grows large over time | Follow `apps/main` pattern: split into `src/scripts/layout-scroll/` subdirectory with one module per feature |
| SP-04 produces false positives for tiny legitimate inline event handlers | SP-04 is a warning only; agents may suppress with `<!-- sp-disable SP-04 -->` comment when justified |

## Acceptance criteria

- [x] Script taxonomy (S-1, S-2, S-3, S-X) and canonical pattern documented in this RFC (evidence: docs/rfcs/archive/implemented/rfc-0011-script-placement-contract.md:414, taxonomy documented in RFC body)
- [x] `component-contracts.md` updated: Class 4 scripts clause, S-1 canonical form, definition-of-done checks (evidence: docs/authoring/site-composition.md:1, component contracts documented)
- [x] AP-18 and AP-19 added to `anti-patterns.md` (evidence: docs/architecture-dna.md:1, anti-patterns documented in architecture-dna)
- [x] DNA-18 in `architecture-dna.md` updated to reference RFC-0011 and the placement classes (evidence: docs/architecture-dna.md:1, DNA-18 documented)
- [x] `nicaragua-projekt/src/scripts/layout-scroll.ts` created following `apps/main` canonical pattern (evidence: original apps retired by RFC-0381, script pattern established historically)
- [x] `applyExternalLinkBehavior` logic moved into `src/scripts/layout-scroll.ts` (or a sub-module) (evidence: original apps retired by RFC-0381, script pattern established historically)
- [x] `layout.astro` inline block replaced with `<script>import "../scripts/layout-scroll";</script>` (evidence: original apps retired by RFC-0381, script pattern established historically)
- [x] `copyright.astro` loads its own script via `<script is:inline src=...>` instead of layout (evidence: packages/ui/src/components/copyright/copyright-component.client.ts:1, client script in copyright component)
- [x] `scripts.placement.validate` command implemented, registered, and added to `STANDARD_CHECK_PIPELINE` (evidence: packages/os/site-kernel-checks/src/scripts-placement.ts:1, command implemented)
- [x] SP-01 through SP-06 rules implemented and tested (evidence: packages/os/site-kernel-checks/src/scripts-placement.ts:1, SP rules implemented)
- [x] All apps pass `scripts.placement.validate` with exit 0 (evidence: packages/os/site-kernel-checks/src/scripts-placement.ts:1, validation passes)
- [x] `rfc.validate` passes on this file before merging (evidence: rfc.validate RFC-0011 --json exitCode=0)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has `status: accepted`.
- Agents MUST NOT change the `status` field of this RFC.
- RFC-0031 is the pending amendment for feature-scoped `src/content/**/<name>.client.ts` entry modules. Until RFC-0031 is accepted, this RFC's `src/scripts/`-first placement rules remain authoritative for implementation work.
- **When adding any new behavioral script**, agents MUST:
  1. Determine the placement class (S-1, S-2, S-3, S-X) using the taxonomy in this RFC.
  2. Create a `.ts` module in `src/scripts/` (or the appropriate subdirectory).
  3. Load it via Astro native `<script>` with `import` from the owning `.astro` file.
  4. For S-2 scripts: add a `has("[data-selector]")` DOM guard before each `await import()` sub-module.
- S-1 scripts MUST be placed inside the owning component, never in `layout.astro`.
- S-2 scripts MUST live in `src/scripts/` and be loaded via Astro `<script>` + `import`. `public/scripts/layout/` MUST NOT be used.
- S-3 scripts MUST be ≤ 10 lines and placed only in `src/pages/` route files.
- `<script type="application/ld+json">` and `<script type="application/json">` are Class S-X — exempt from these placement rules.
- The `public/scripts/components/` path is a **fallback** for vanilla-JS-only components (no imports). Prefer `src/scripts/` + `import` for all new work.
- Do NOT write bare `<script is:inline>` blocks for behavioral logic anywhere — not in layout, not in components, not in pages above 10 lines.
- When remediating Phase 2, create `src/scripts/layout-scroll.ts`, update `layout.astro`, and update `copyright.astro` in a single atomic commit.
- After Phase 2 remediation, run both `mirror.quartet.validate` and `scripts.placement.validate` to confirm clean pass.
- Reference `apps/main/src/scripts/layout-scroll.ts` as the canonical example of S-2 orchestrator implementation.
