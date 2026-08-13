---
id: RFC-0831
title: "Add csp.origins.validate for CSP-to-script-origin cross-validation"
status: accepted
kind: command
scope: app
owners:
  - architecture
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-08-13
updatedAt: 2026-08-13
enhancedAt: 2026-08-13
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0315
  - RFC-0305
satisfies: []
versionBump: patch
commands:
  proposed:
    - csp.origins.validate
  added: []
  changed: []
  removed: []
appsImpacted: []
packagesImpacted:
  - werkstatt-site
successSignals:
  - "No script origin in rendered HTML is missing from CSP script-src"
  - "Matomo proxy origin present in CSP script-src for sites using Matomo"
  - "Lighthouse errors-in-console and inspector-issues audits pass (score 1)"
  - "Lighthouse Best Practices score 1.0 for sites passing csp.origins.validate"
nonGoals:
  - "Does not replace headers.security.validate (HDR-01..04) — complements it with origin cross-referencing"
  - "Does not generate or modify CSP headers — validation only"
  - "Does not validate CSP nonce or hash-source correctness — only origin coverage"
  - "Does not check inline script CSP (unsafe-inline is a separate concern)"
  - "Does not scan bundled JS files in dist/client/_astro/*.js for connect-src origins — minified JS scanning is fragile and out of scope"
  - "Does not check <iframe src> against frame-src — Astro sites don't use iframes for first-party content"
  - "Does not check <link rel=preconnect> or <link rel=dns-prefetch> — these are hints, not resource loads, and don't require CSP coverage"
---

# RFC-0831: Add csp.origins.validate for CSP-to-script-origin cross-validation

## Context

The Lighthouse report for `warpgogol.com` (2026-08-13) shows **Best Practices score 0.92** with two failing audits:

1. **`errors-in-console`** (weight 1) — `Loading the script 'https://matomo-proxy.warpgogol.com/_wg/analytics/warpgogol-com/matomo.js' violates the following Content Security Policy directive: "script-src 'self' 'unsafe-inline'"`. The script is blocked entirely.

2. **`inspector-issues`** (weight 1) — Same URL flagged as "Content security policy" issue in Chrome DevTools.

Both failures share a single root cause: the CSP `script-src` directive is `'self' 'unsafe-inline'` but the site loads scripts from `matomo-proxy.warpgogol.com`, which is not included in `script-src`.

The existing `headers.security.validate` (RFC-0315, HDR-02) checks that:

- CSP has required directives (`default-src`, `script-src`, `img-src`, etc.)
- CSP contains no wildcard (`*`) sources
- CSP has `upgrade-insecure-requests`

However, it does **NOT** cross-reference the CSP source lists with the actual script, style, image, and connect origins found in rendered HTML. A site can have a syntactically valid CSP that silently blocks its own scripts.

## Problem

One invariant is unprotected:

**P1: CSP origin completeness** — No validator checks that every external origin referenced in rendered HTML (via `<script src>`, `<link href>`, `<img src>`, `fetch()` calls) is listed in the corresponding CSP directive. The CSP can be syntactically valid (passes HDR-02) yet functionally incomplete (blocks scripts the site needs).

Reference failure mode:

- `warpgogol.com` CSP: `script-src 'self' 'unsafe-inline'`
- Rendered HTML loads: `https://matomo-proxy.warpgogol.com/_wg/analytics/warpgogol-com/matomo.js`
- Result: Script blocked by CSP, Matomo analytics non-functional, Lighthouse Best Practices score 0.92

## Decision

The kernel gains a `csp.origins.validate` command that cross-references CSP source lists (parsed from `public/_headers`) against actual external origins found in rendered HTML in `dist/client/`.

## Architectural fit

- **RFC-0315** (headers.security.validate HDR-01..04) — This RFC is complementary. HDR-02 checks CSP syntax and directive presence. `csp.origins.validate` checks CSP semantic completeness (origin coverage).
- **RFC-0305** (Matomo first-party proxy) — The Matomo proxy origin (`matomo-proxy.warpgogol.com`) must be in CSP. This RFC catches missing proxy origins automatically.
- **Site OS operator model** — Post-build validator, scope `app`. Runs after `headers.security.validate` and after `astro build` produces rendered HTML.

## Design

### CLI surface

```sh
pnpm exec werkstatt run csp.origins.validate
pnpm exec werkstatt run csp.origins.validate --all --json
```

Post-build command. Scope: `app`, `supportsAllSites: true`, `flags: {}`. The kernel resolves the target site from context (same convention as `headers.security.validate`). Use `--all` to run across all sites. Runs after `astro build` produces `dist/client/` and after `headers.security.validate` has confirmed CSP is present.

### TypeScript contracts

```ts
interface CspOriginFinding {
  rule: "CSP-ORIGIN-01" | "CSP-ORIGIN-02" | "CSP-ORIGIN-03" | "CSP-ORIGIN-04";
  file: string;        // HTML file where the origin was found
  line: number;
  origin: string;      // the origin URL not covered by CSP
  directive: string;   // which CSP directive should include it
  severity: "error" | "warning";
  message: string;
  fixHint: string;
}

interface CspOriginResult {
  command: "csp.origins.validate";
  status: "pass" | "fail";
  findings: CspOriginFinding[];
  cspDirectives: Record<string, string[]>;  // parsed CSP for debugging
  checkedOrigins: number;
}
```

### Rules

**CSP-ORIGIN-01: Script origin not in script-src**

Every external origin in a `<script src="...">` element in rendered HTML MUST be listed in the CSP `script-src` directive (or `default-src` as fallback).

Origin matching rules:

- `'self'` matches the site's own origin
- Exact origin match (scheme + host + port)
- Wildcard subdomain (`*.warpgogol.com`) matches `matomo-proxy.warpgogol.com`
- `'unsafe-inline'` covers inline scripts (not checked here)

Severity: `error`

**CSP-ORIGIN-02: Style origin not in style-src**

Every external origin in a `<link rel="stylesheet" href="...">` element MUST be in `style-src` (or `default-src`).

Severity: `error`

**CSP-ORIGIN-03: Image origin not in img-src**

Every external origin in an `<img src="...">` element MUST be in `img-src` (or `default-src`).

Severity: `warning` (images are less security-critical than scripts)

**CSP-ORIGIN-04: Connect origin not in connect-src**

Every external origin found in inline `fetch("...")` or `XMLHttpRequest` patterns in rendered HTML MUST be in `connect-src` (or `default-src`).

Severity: `error`

### CSP parsing

The CSP is read from `public/_headers`. The validator:

1. Extracts the `Content-Security-Policy` header value (same logic as HDR-02 in `headers.security.validate`).
2. Parses the CSP into a `Map<directive, source[]>` structure.
3. For each directive, normalizes sources:
   - `'self'` → site origin
   - `'none'` → empty set
   - `*.example.com` → wildcard subdomain matcher
   - `https://example.com` → exact origin
   - `'unsafe-inline'`, `'unsafe-eval'` → keyword tokens (not origins)

### Origin extraction from rendered HTML

The validator scans all `.html` files in `dist/client/`:

1. **Script origins**: `<script src="https://...">` (external scripts only, not inline)
2. **Style origins**: `<link rel="stylesheet" href="https://...">`
3. **Image origins**: `<img src="https://...">` (external images only, not `/_astro/` or `/_img/` which are same-origin)
4. **Connect origins**: `fetch("https://...")` and `new URL("https://...")` patterns in inline `<script>` blocks in HTML only (not bundled `.js` files — see nonGoals)
5. **Module script origins**: `<script type="module" src="https://...">` (covered by CSP-ORIGIN-01, same as classic scripts)
6. **Preload origins**: `<link rel="preload" as="script" href="https://...">` (covered by CSP-ORIGIN-01)
7. **Srcset origins**: `<img srcset="https://...">` and `<source srcset="https://...">` in `<picture>` elements (covered by CSP-ORIGIN-03)

Same-origin resources (starting with `/` or matching the site origin) are skipped — `'self'` covers them.

**Performance note**: The validator scans all `.html` files in `dist/client/`. For a site with N pages, this is N file reads + N parse5 parses + NquerySelector traversals. Typical sites (10-100 pages) complete in <500ms. The scan is I/O-bound, not CPU-bound.

### File system responsibilities

| Path | Role |
| --- | --- |
| `public/_headers` | CSP source — parsed for directive source lists |
| `dist/client/**/*.html` | Scanned for external origins |
| `packages/werkstatt-site/src/checks/csp-origins.ts` | New validator module |

### Output format

```json
{
  "command": "csp.origins.validate",
  "status": "fail",
  "findings": [
    {
      "rule": "CSP-ORIGIN-01",
      "file": "dist/client/de/index.html",
      "line": 15,
      "origin": "https://matomo-proxy.warpgogol.com",
      "directive": "script-src",
      "severity": "error",
      "message": "Script origin 'https://matomo-proxy.warpgogol.com' is not in CSP script-src",
      "fixHint": "Add 'matomo-proxy.warpgogol.com' to script-src in public/_headers"
    }
  ],
  "cspDirectives": {
    "script-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "matomo-proxy.warpgogol.com"]
  },
  "checkedOrigins": 12
}
```

### Failure modes

- Any `error`-severity finding → `exitCode: 1`, build fails.
- `warning`-severity findings → logged, `exitCode: 0`.
- Missing `public/_headers` → skip with `status: "pass"` (headers.security.validate already fails).
- Missing `dist/client/` → skip with `status: "pass"` (no build output).
- Empty `dist/client/` (new site with no content) → skip with `status: "pass"` (no pages to scan).
- CSP header not found in `_headers` → skip with `status: "pass"` (headers.security.validate already fails on HDR-01).
- Malformed CSP → `warning`, skip origin cross-referencing for that directive.

**Suppression**: Findings can be suppressed via `suppressions-config.yaml` (same mechanism as other check commands). Suppressed findings are logged as `info` but do not affect `exitCode`.

## Rollout

- **Default behavior**: `csp.origins.validate` runs in `SITES_CHECK_POSTBUILD_PIPELINE` after `headers.security.validate` (which already runs in `SITES_CHECK_AUTHOR_PIPELINE`) and after `cloudflare.assets.validate`.
- **Existing apps**: First run will flag any missing origins. Sites must add missing origins to CSP in `public/_headers` and, if the CSP is generated from a template, in `_headers.template`. For `warpgogol.com`, add `matomo-proxy.warpgogol.com` to `script-src`.
- **New apps**: Automatically compliant if CSP is generated from the infrastructure template (which should include all known origins).
- **Grace period**: None. Missing script origins in CSP is a functional bug (scripts are blocked in production). `error` from day one.
- **Deprecation**: None. `headers.security.validate` (syntax) and `csp.origins.validate` (semantic completeness) are complementary.

## Alternatives considered

- **Extend `headers.security.validate` with origin cross-referencing** — Rejected. `headers.security.validate` is an author-time validator that reads `public/_headers` only. Origin cross-referencing requires rendered HTML from `dist/client/`, making it a post-build concern. Different scope, different pipeline phase.

- **Runtime CSP violation reporting** — Rejected as primary mechanism. Browser-reported CSP violations are post-deploy feedback. The user's requirement is pre-deploy detection. This RFC provides build-time detection; runtime reporting can be added separately.

- **CSP generator that auto-includes all origins** — Rejected for now. Auto-generating CSP from scanned origins is dangerous (it would whitelist any origin a script happens to load, including third-party trackers). Validation with explicit operator action to add origins is safer.

## Risks

- **False positives from dynamically injected scripts** — Scripts injected at runtime (not in rendered HTML) won't be caught. This is a known limitation. The validator catches statically referenced origins, which covers the common case.
- **False positives from data-URI scripts** — Mitigated by skipping `data:` URIs (they're covered by `data:` source in CSP, not origin-based).
- **CSP parsing complexity** — CSP has edge cases (ports, paths, schemes). The parser handles the common cases and falls back to `warning` for unparseable directives.
- **Agent confusion** — Agents may try to fix CSP-ORIGIN-01 by adding wildcards. Mitigated by the `fixHint` suggesting the specific origin to add.

## Acceptance criteria

- [ ] `csp.origins.validate` command registered in command table with scope `app`
- [ ] CSP-ORIGIN-01..04 rules implemented with correct severity
- [ ] CSP parser handles `'self'`, exact origins, wildcard subdomains, `'none'`
- [ ] Origin extraction from rendered HTML covers script, style, image, connect
- [ ] `csp.origins.validate` integrated into `SITES_CHECK_POSTBUILD_PIPELINE`
- [ ] `--json` output format documented and stable
- [ ] Unit tests for CSP parsing and origin matching
- [ ] Unit tests with fixture HTML containing external script origins
- [ ] `warpgogol.com` passes `csp.origins.validate` after adding `matomo-proxy.warpgogol.com` to CSP
- [ ] `rfc.validate` passes on this file before merging
- [ ] `packages/werkstatt-site/AGENTS.md` updated with `csp.origins.validate` entry in the "Check commands" section

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- For RFCs created on or after 2026-07-07 with acceptance probes: before stamping `implemented`, run `pnpm exec werkstatt run rfc.verification.emit --id RFC-0831` and commit the evidence file in the same commit.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0831 --reason "..." --invariant "DNA-N"` instead of working around it.
- Implementation order: implement CSP parser first, then origin extraction from HTML, then cross-referencing, then fix `warpgogol.com` CSP, then integrate into pipeline.
