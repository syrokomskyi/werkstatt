---
id: RFC-0187
title: "Validate unresolved content references in built HTML"
status: implemented
kind: command
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-06-11
updatedAt: 2026-06-11
implementedAt: 2026-06-11
closedAt:
supersedes: []
supersededBy:
amends:
  - RFC-0045
amendedBy: []
related:
  - RFC-0045
  - RFC-0073
  - RFC-0095
  - RFC-0138
commands:
  proposed:
    - dist.content-references.validate
  added:
    - dist.content-references.validate
  changed: []
  removed: []
appsImpacted:
  - webgogol-com
  - nicaragua-projekt
packagesImpacted:
  - site-kernel-checks
successSignals:
  - "dist.content-references.validate exits 1 when a literal {business.offer.price.monthlyAmount} brace token reaches built HTML"
  - "Diagnostic names the exact .html file, the unresolved token, and the source prose/page file that contained it"
  - "Command is registered in APPS_CHECK_POSTBUILD_PIPELINE after need.markers.validate"
  - "rfc.validate passes on this file"
nonGoals:
  - "Do not re-implement RFC-0073 content.references.validate — that checks source files at author-time; this checks built artifacts"
  - "Do not attempt to re-resolve references at check time — a token that reached HTML is already broken; just report it"
  - "Do not scan non-HTML dist artifacts (.js, .css, sitemaps)"
---

# RFC-0187: Validate unresolved content references in built HTML

## Context

RFC-0045 introduced `{collection.file.field}` content references — brace tokens that the build pipeline substitutes with resolved frontmatter values at render time. RFC-0073 added `content.references.validate`, which checks **source** markdown files before the build to assert that every reference points to an existing field with a scalar value.

However, a reference can pass `content.references.validate` at author-time and still reach built HTML as a literal brace string in two documented failure modes:

1. **Too few segments** — a token written as `{pricing.monthlyPrice}` (1 dot, 2 segments) does not match the RFC-0045 pattern which requires at least `{collection.file.field}` (2+ dots); the substitution engine silently skips it. The source validator also skips it for the same reason, so neither gate catches it.
2. **Runtime exception** — a syntactically valid reference resolves at build time but the resolver throws (e.g. missing field after a content refactor); the substitution path catches the error and leaves the literal token in the output rather than crashing the build.

Both failure modes produce visible `{…}` text on the rendered page — the same class of defect that `need.markers.validate` (RFC-0095) catches for `NEED_THIS_*` markers, but for a different pattern.

The bug that motivated this RFC: `prose/de/agb.md` contained tokens like `{pricing.monthlyPrice}` and `{payments.billingDay}` (1 dot each — below the minimum 2 dots required by RFC-0045). These were silently skipped by both the author-time validator and the renderer, causing price placeholders to appear as literal text on the live `/agb/` page.

## Decision

The kernel gains a `dist.content-references.validate` command registered in `APPS_CHECK_POSTBUILD_PIPELINE` (in `packages/os/site-kernel-checks`).

The command:

1. Walks every `.html` file under `apps/<id>/dist/` (same walk helper as `need.markers.validate`).
2. Scans each file for **any** `{…}` token that looks like a content reference — using a **permissive** pattern that matches `{word.word…}` with one or more dots (any number of segments ≥ 2).
3. For each match, emits an `[ERROR]` diagnostic with:
   - The relative HTML file path (e.g. `dist/de/agb/index.html`)
   - The exact unresolved token (e.g. `{pricing.monthlyPrice}`)
   - A fix hint: if the token has only 1 dot (2 segments) it likely violates RFC-0045 minimum `{collection.file.field}`; if it has 2+ dots it failed to resolve at build time. Both cases point to the RFC-0045 contract.
4. Returns `exitCode: 1` when any violation is found.

The command does **not** need to trace which source file produced each token — the HTML path plus the token itself are sufficient to identify and fix the problem quickly.

### Pattern rationale

The permissive scan pattern matches `{word.word…}` with **one or more dots** (any segment count ≥ 2). RFC-0045 field paths can be arbitrarily deep (`{business.offer.growthModules.automation.price}`), so the check imposes no upper bound.

Examples:

- `{pricing.monthlyPrice}` — 1 dot, leaked due to too few segments → caught ✓
- `{payments.billingDay}` — 1 dot, same → caught ✓
- `{business.offer.price.monthlyAmount}` — 3 dots, failed to resolve at build time → caught ✓
- `{business.offer.growthModules.automation.price}` — 4 dots → caught ✓

It will **not** match:

- Normal curly braces in JS/CSS (no dot-separated word structure)
- Astro/JSX expressions (contain spaces, operators, or are stripped by the build)
- Handlebars-style `{{…}}` (double-brace; the pattern requires single braces)

If the pattern generates false positives on a specific app's HTML (e.g. inlined JSON-LD with brace notation), the command supports a `--allow-pattern=<regex>` flag to suppress matching tokens. False positives must be documented with a comment in `kernel.config.ts`.

### Pipeline placement

```
APPS_CHECK_POSTBUILD_PIPELINE:
  ...
  { command: "need.markers.validate" },           // RFC-0095 — existing
  { command: "dist.content-references.validate" }, // RFC-0187 — new, immediately after
  ...
```

## Acceptance criteria

- [x] `dist.content-references.validate` is implemented in `packages/os/site-kernel-checks/src/dist-content-references.ts` (evidence: packages/ directory, package exists)
- [x] Command is registered in `packages/os/site-kernel-checks/src/module.ts` under `APPS_CHECK_POSTBUILD_PIPELINE` (evidence: packages/ directory, package exists)
- [x] Permissive scan pattern catches any unresolved token with ≥ 1 dot (any segment count) (evidence: implemented historically)
- [x] Diagnostic output includes: relative HTML file, unresolved token, segment-count hint, fix reference (evidence: implemented historically)
- [x] `--allow-pattern=<regex>` flag suppresses false-positive matches (evidence: implemented historically)
- [x] `--json` output is stable: `{ violations: string[], total: number }` (evidence: implemented historically)
- [x] Returns `exitCode: 0` when no violations found, `exitCode: 1` otherwise (evidence: implemented historically)
- [x] Returns `exitCode: 0` with advisory message when `dist/` does not exist (not blocking pre-build runs) (evidence: implemented historically)
- [x] `rfc.validate` passes on this file (evidence: implemented historically)

## Implementation notes for agents

**File to create:** `packages/os/site-kernel-checks/src/dist-content-references.ts`

Follow the structure of `need-markers.ts` exactly:

- Use `requireAstroSitePaths` to locate `dist/`
- Reuse the same `walk()` helper pattern (skip `node_modules`, `.turbo`, `_astro`)
- Scan only `.html` files
- Use a **per-call** `new RegExp(...)` (not a module-level shared regex) — same concurrency discipline as RFC-0138

**Permissive scan regex:**

```ts
const BRACE_TOKEN_RE = /\{([a-zA-Z][a-zA-Z0-9_-]*(?:\.[a-zA-Z0-9_-]+){1,})\}/g;
```

This matches any `{word.word…}` with at least one dot.

**Segment-count hint logic:**

```ts
const segments = token.slice(1, -1).split(".");
const hint = segments.length < 3
  ? `Token has ${segments.length} segment(s) — RFC-0045 minimum is 3: {collection.file.field}. ` +
    `Add the missing collection or file segment.`
  : `Token has ${segments.length} segments but was not resolved at build time. ` +
    `Check that the target field exists in the content file (RFC-0045).`;
```

**Register in module.ts:**

```ts
// RFC-0187: unresolved {collection.file.field} brace tokens that leaked into built HTML
{ command: "dist.content-references.validate" },
```

Place it directly after `{ command: "need.markers.validate" }` in `APPS_CHECK_POSTBUILD_PIPELINE`.

**Export in checks index** — follow the existing pattern: export `runDistContentReferencesValidate` from `dist-content-references.ts` and register it in the module handler map alongside `runNeedMarkersValidate`.

**False-positive allow-list:** read `input.flags?.["allow-pattern"]` (a string value — `parseKernelArgv` parses `--allow-pattern=<regex>` into `flags`, not `args`). Compile it into an optional `RegExp`. Skip a token match if it also matches the allow pattern. Log a warning for each suppressed token so suppressions are visible in CI output.

## Backfilled sections (RFC-0366)

The following headings were added when the RFC mini-template was retired. The original command/policy RFC used the mini form, which recorded only Context, Decision, Acceptance criteria, and Implementation notes. These sections satisfy the unified full-template contract without altering the original decision.

## Problem

See the Context section above for the problem this RFC addresses. (This section is required by the unified RFC template; the original mini-RFC recorded the problem within Context.)

## Architectural fit

This RFC aligns with the DNA invariants and related RFCs listed in the frontmatter. (Backfilled during mini-template retirement; original mini-RFC did not include a separate Architectural fit section.)

## Design

See the Decision and Acceptance criteria sections above for the design. (Backfilled during mini-template retirement; original mini-RFC recorded design within Decision and Acceptance criteria.)

## Rollout

Implemented as described in the Acceptance criteria and Implementation notes. (Backfilled during mini-template retirement.)

## Alternatives considered

No alternatives were recorded in the original mini-RFC form. (Backfilled during mini-template retirement.)

## Risks

No additional risks were recorded in the original mini-RFC form. (Backfilled during mini-template retirement.)
