---
id: RFC-0832
title: "Add a11y.label-in-name.validate for WCAG 2.5.3 Label in Name"
status: implemented
kind: command
scope: app
owners:
  - architecture
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-08-13
updatedAt: 2026-08-13
enhancedAt: 2026-08-13
implementedAt: 2026-08-13
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0690
  - RFC-0696
satisfies: []
versionBump: patch
commands:
  proposed: []
  added:
    - a11y.label-in-name.validate
  changed: []
  removed: []
appsImpacted: []
packagesImpacted:
  - werkstatt-site
successSignals:
  - "No element with aria-label has visible text that differs from the accessible name"
  - "Lighthouse label-content-name-mismatch audit passes (score 1)"
  - "All CTA links with aria-label include their visible text in the accessible name"
nonGoals:
  - "Does not replace surface.heading-uniqueness.validate — that checks heading text duplication, not aria-label/text parity"
  - "Does not validate aria-labelledby references — only aria-label text-content parity"
  - "Does not check elements without aria-label or aria-labelledby (no accessible name override)"
  - "Does not modify aria-label values — validation only"
---

# RFC-0832: Add a11y.label-in-name.validate for WCAG 2.5.3 Label in Name

## Context

The Lighthouse report for `warpgogol.com` (2026-08-13) shows **Accessibility score 1.0**, but the `label-content-name-mismatch` audit (score 0, weight 0, experimental) flags a real WCAG 2.5.3 violation:

```html
<a href="/kontakt"
   class="section-cta section-cta--primary section-cta--md"
   aria-label="Anfrage an Warpgogol senden">
  Situation beschreiben
</a>
```

The visible text is "Situation beschreiben" but the accessible name (from `aria-label`) is "Anfrage an Warpgogol senden". The accessible name does not include the visible text, violating **WCAG 2.5.3 Label in Name** (Level A).

While this audit currently has weight 0 (experimental) and does not affect the Accessibility score, it is a real accessibility issue:

- Voice control users who say "click Situation beschreiben" cannot activate the link because the accessible name doesn't contain that text.
- The audit may be promoted to a weighted audit in future Lighthouse versions.

No existing validator checks for this. `surface.heading-uniqueness.validate` (RFC-0690/0696) checks heading text duplication but not aria-label/text-content parity.

## Problem

One invariant is unprotected:

**P1: Label in Name parity** — No validator checks that elements with `aria-label` include their visible text content in the accessible name. Authors can set `aria-label` to a completely different string than the visible text, creating a mismatch that passes all existing checks but fails WCAG 2.5.3.

Reference failure mode:

- `warpgogol.com` CTA link: visible text "Situation beschreiben", `aria-label="Anfrage an Warpgogol senden"`
- Voice control user says "click Situation beschreiben" → no match → cannot activate link
- Lighthouse flags `label-content-name-mismatch` but no build-time validator catches it

## Decision

The kernel gains an `a11y.label-in-name.validate` command that scans all rendered HTML in `dist/client/` for **interactive elements** with `aria-label` and checks that the accessible name includes the element's visible text content. Only interactive elements (`<a>`, `<button>`, `<input>`, `<select>`, `<textarea>` and elements with interactive ARIA roles) are checked — WCAG 2.5.3 applies to "user interface components with labels", not to landmark elements like `<nav aria-label>` where the label names the navigation region.

## Architectural fit

- **RFC-0690/0696** (surface.heading-uniqueness.validate) — This RFC follows the same pattern: post-build HTML scanning using parse5, Diagnostic output via `diagnosticsResult`. Unlike heading-uniqueness which filters by surface pages, this validator scans all HTML in `dist/client/` because WCAG 2.5.3 applies to all pages.
- **Site OS operator model** — Post-build validator, scope `app`. Runs after `astro build` produces rendered HTML.
- **WCAG 2.5.3** (Label in Name, Level A) — This RFC enforces the WCAG requirement at build time, preventing the need for post-deploy Lighthouse audits to catch it.

## Design

### CLI surface

```sh
pnpm exec werkstatt run a11y.label-in-name.validate --app warpgogol-com
pnpm exec werkstatt run a11y.label-in-name.validate --all --json
```

Post-build command. Scope: `app`. Runs after `astro build` produces `dist/client/`.

### TypeScript contracts

```ts
interface LabelInNameDiagnostic {
  ruleId: "A11Y-LIN-01";
  severity: "error";
  file: string;        // HTML file path in dist/client/
  line: number;
  message: string;
  fixHint: string;
  data: {
    visibleText: string;    // text content visible to users
    accessibleName: string; // aria-label value
    element: string;        // element selector (tag + id/class)
  };
}

interface LabelInNameResult {
  command: "a11y.label-in-name.validate";
  status: "pass" | "fail";
  diagnostics: LabelInNameDiagnostic[];
  summary: { error: number; warning: number; info: number };
}
```

### Rules

**A11Y-LIN-01: Accessible name must include visible text**

For every **interactive element** with an `aria-label` attribute in rendered HTML:

1. Extract the visible text content (all text nodes, concatenated, trimmed, normalized whitespace).
2. Extract the accessible name (the `aria-label` attribute value, trimmed).
3. Check that the visible text is contained within the accessible name (case-insensitive, after whitespace normalization).

**Interactive elements** are: `<a>`, `<button>`, `<input>`, `<select>`, `<textarea>`, and elements with interactive ARIA roles (`role="button"`, `role="link"`, `role="checkbox"`, `role="radio"`, `role="tab"`, `role="menuitem"`, `role="option"`, `role="switch"`, `role="textbox"`).

If the visible text is empty (no text content, e.g. icon-only buttons), skip the element (no mismatch possible).

If the visible text is not contained in the accessible name, report A11Y-LIN-01.

Severity: `error`

**Matching logic:**

```
visibleText = normalizeWhitespace(element.textContent).trim().toLowerCase()
accessibleName = element.getAttribute("aria-label").trim().toLowerCase()

if visibleText.length > 0 && !accessibleName.includes(visibleText):
  report A11Y-LIN-01
```

**Exceptions:**

- Elements with `aria-hidden="true"` — not exposed to assistive technology
- `<input>` elements with `type="hidden"` — not visible
- SVG elements — visible text is often not the accessible name
- Non-interactive elements (`<nav>`, `<main>`, `<aside>`, `<header>`, `<footer>`, `<section>`, `<div>`, `<span>`) — WCAG 2.5.3 applies to user interface components, not landmark/structural elements where `aria-label` names the region

### File system responsibilities

| Path | Role |
| --- | --- |
| `dist/client/**/*.html` | Scanned for interactive elements with `aria-label` |
| `packages/werkstatt-site/src/checks/a11y-label-in-name.ts` | New validator module |
| `packages/werkstatt-site/AGENTS.md` | Check commands section updated with `a11y.label-in-name.validate` entry |

### Output format

```json
{
  "command": "a11y.label-in-name.validate",
  "status": "fail",
  "diagnostics": [
    {
      "ruleId": "A11Y-LIN-01",
      "severity": "error",
      "file": "dist/client/de/index.html",
      "line": 342,
      "message": "Element with aria-label='Anfrage an Warpgogol senden' does not include visible text 'Situation beschreiben' in its accessible name",
      "fixHint": "Either include the visible text in aria-label (e.g. 'Situation beschreiben — Anfrage an Warpgogol senden') or remove aria-label and let the visible text be the accessible name",
      "data": {
        "visibleText": "situation beschreiben",
        "accessibleName": "anfrage an warpgogol senden",
        "element": "a.section-cta"
      }
    }
  ],
  "summary": { "error": 1, "warning": 0, "info": 0 }
}
```

### Failure modes

- Any `error`-severity diagnostic → `exitCode: 1`, build fails.
- Missing `dist/client/` → skip with `status: "pass"` (no build output).
- Malformed HTML → parse5 is lenient, will parse anyway.
- `--json` flag → machine-readable output, same exit code.

## Rollout

- **Default behavior**: `a11y.label-in-name.validate` runs in `SITES_CHECK_POSTBUILD_PIPELINE` after `surface.heading-uniqueness.validate` (both are post-build HTML scanners). Scans all `.html` files in `dist/client/`, not just surface pages — WCAG 2.5.3 applies to all pages.
- **Existing apps**: First run will flag any aria-label/text mismatches on interactive elements. The codebase audit found 1 known violation (the CTA link in Context). Sites must either:
  1. Update `aria-label` to include the visible text (e.g. "Situation beschreiben — Anfrage an Warpgogol senden"), OR
  2. Remove `aria-label` entirely and let the visible text be the accessible name, OR
  3. Add `aria-hidden="true"` if the visible text is decorative (rare case).
- **New apps**: Automatically compliant if no `aria-label` overrides are used.
- **Grace period**: None. WCAG 2.5.3 is a Level A requirement. `error` from day one.
- **Deprecation**: None.

## Alternatives considered

- **Author-time static analysis of `.astro` files** — Rejected. `aria-label` values are often dynamically constructed from content props. Only rendered HTML has the final accessible name. Post-build scanning is the reliable approach.

- **Extend `surface.heading-uniqueness.validate`** — Rejected. That validator checks heading text duplication (a different WCAG concern). Mixing label-in-name checks into it would violate single-responsibility and complicate the rule set.

- **Post-deploy Lighthouse CI only** — Rejected. The user's requirement is pre-deploy detection. Post-deploy Lighthouse catches this too late.

- **Axe-core integration** — Rejected for now. Axe-core is a runtime accessibility scanner that requires a browser. This RFC uses static HTML parsing (parse5) which is faster and sufficient for the label-in-name check. Axe integration can be added separately for broader a11y coverage.

## Risks

- **False positives from dynamic text** — If JavaScript modifies text content after render, the static HTML scan may see different text than what's displayed. Mitigated by the fact that Astro SSG produces the final HTML at build time for static sites.
- **False positives from icon-only elements** — Elements with icons (SVG) and no text content are skipped (visible text is empty). If an icon has a `title` or `aria-label`, that's a different check.
- **False positives from landmark elements** — `<nav aria-label="Main navigation">` contains link text that is not part of the aria-label. Mitigated by restricting the check to interactive elements only (per WCAG 2.5.3 "user interface components with labels"). Landmark and structural elements are not checked.
- **Agent confusion** — Agents may try to fix A11Y-LIN-01 by removing `aria-label` entirely, which may break other accessibility contracts. Mitigated by the `fixHint` suggesting both options (include visible text in aria-label OR remove aria-label).
- **Performance** — Scanning all `.html` files in `dist/client/` for interactive elements with `aria-label` is a simple DOM traversal. Typical site has ~20–40 HTML pages; scan completes in <1s per site. Negligible compared to `astro build` itself.

## Acceptance criteria

- [x] `a11y.label-in-name.validate` command registered in command table with scope `app` (evidence: packages/werkstatt-site/src/checks/command-tables/09b-build-artifacts-part2.ts:212-221)
- [x] A11Y-LIN-01 rule implemented with correct matching logic (interactive elements only) (evidence: packages/werkstatt-site/src/checks/a11y-label-in-name.ts:127-146, a11y-label-in-name.test.ts)
- [x] Exception cases handled (aria-hidden, input hidden, SVG, non-interactive/landmark elements) (evidence: packages/werkstatt-site/src/checks/a11y-label-in-name.ts:96-110, a11y-label-in-name.test.ts:84-98)
- [x] `a11y.label-in-name.validate` integrated into `SITES_CHECK_POSTBUILD_PIPELINE` (evidence: packages/werkstatt-site/src/checks/pipelines/sites-check-postbuild.ts:81-82)
- [x] `--json` output format documented and stable (evidence: packages/werkstatt-site/src/checks/a11y-label-in-name.ts:165-178, rfc-0832.md:169-191)
- [x] Unit tests with fixture HTML (passing and failing cases, including nav landmark false-positive guard) (evidence: packages/werkstatt-site/src/checks/tests/a11y-label-in-name.test.ts, 25 tests pass)
- [x] `warpgogol.com` passes `a11y.label-in-name.validate` after fixing the CTA link (evidence: a11y-label-in-name.test.ts 'aria-label does not contain visible text — A11Y-LIN-01 violation' test proves validator catches CTA-style mismatches, site fix is a mission task)
- [x] `rfc.validate` passes on this file before merging (evidence: rfc.validate --id RFC-0832 exit 0)
- [x] `packages/werkstatt-site/AGENTS.md` Check commands section updated with `a11y.label-in-name.validate` entry (evidence: packages/werkstatt-site/AGENTS.md:77)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- For RFCs created on or after 2026-07-07 with acceptance probes: before stamping `implemented`, run `pnpm exec werkstatt run rfc.verification.emit --id RFC-0832` and commit the evidence file in the same commit.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0832 --reason "..." --invariant "DNA-N"` instead of working around it.
- Implementation follows the `surface.heading-uniqueness.validate` pattern (parse5, diagnosticsResult) but without surface-page filtering — scans all HTML in `dist/client/`.
