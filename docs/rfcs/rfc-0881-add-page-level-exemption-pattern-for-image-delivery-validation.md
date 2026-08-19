---
id: RFC-0881
title: "Add page-level exemption pattern for image delivery validation"
status: draft
kind: command
scope: workspace
owners:
  - architecture
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-08-19
updatedAt: 2026-08-19
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0830
  - RFC-0835
  - RFC-0841
  - RFC-0880
satisfies: []
versionBump: patch
commands:
  proposed: []
  added: []
  changed:
    - image.delivery.validate
appsImpacted: []
packagesImpacted:
  - packages/werkstatt-site
successSignals:
  - "Text-only pages (e.g. Nachweis detail/verify) can be exempted from IMG-DELIVERY-04 via pagePattern in image-delivery.config.yaml"
  - "No false-positive IMG-DELIVERY-04 errors for pages that intentionally have no LCP image"
nonGoals:
  - "Do not exempt pages from per-image checks (IMG-DELIVERY-01, IMG-DELIVERY-02) — only page-level checks like IMG-DELIVERY-04"
  - "Do not remove the 404.html exemption — it remains a hardcoded special case"
  - "Do not add pagePattern support for per-image rules — only page-level rules"
---

# RFC-0881: Add page-level exemption pattern for image delivery validation

## Context

RFC-0830 introduced `image.delivery.validate` with three rules: `IMG-DELIVERY-01` (responsive srcset), `IMG-DELIVERY-02` (compression budget), and `IMG-DELIVERY-04` (LCP image optimization — at least one `<img>` with `fetchpriority="high"` per page). The config escape hatch (`image-delivery.config.yaml`) supports `srcPattern` for per-image rule overrides, and `404.html` is hardcoded as exempt from `IMG-DELIVERY-04`.

During mission `warpgogol-com-m000077`, Nachweis detail and verify pages (e.g. `/nachweise/cloudflare-cf-ar-01/`, `/nachweise/verify/v1/`) triggered `IMG-DELIVERY-04` because they are text-only evidence pages with no hero or LCP image. The existing config had no way to exempt these pages — `srcPattern` matches image sources, not page paths.

A `pagePattern` field was added ad-hoc to `image-delivery.config.yaml` during the mission to resolve this. This RFC formalizes that addition.

## Problem

**Unprotected invariant**: The `image-delivery.config.yaml` override schema only supports per-image exemptions (`srcPattern`). There is no mechanism to exempt specific pages from page-level rules like `IMG-DELIVERY-04`.

**What relies on manual discipline**: Site operators must either add a `fetchpriority="high"` image to every page (including text-only pages where it makes no sense) or modify the validator source code to add hardcoded exemptions (as was done for `404.html`).

**Known failure mode**: Text-only pages (Nachweis detail, Nachweis verify, future evidence pages) fail `IMG-DELIVERY-04` with no config-based escape hatch. The only workaround before the ad-hoc fix was to add a hidden decorative image with `fetchpriority="high"` — an accessibility and performance anti-pattern.

## Decision

The `image-delivery.config.yaml` override schema gains an optional `pagePattern` field. When present, the override exempts matching page paths from the listed rules. `pagePattern` uses `picomatch` glob syntax and matches against the dist file path (e.g. `dist/client/nachweise/cloudflare-cf-ar-01/index.html`).

## Architectural fit

- **RFC-0830 (amended)**: Extends the config override schema with a new optional field. The `srcPattern` and `rules` fields remain unchanged. The `reason` field remains mandatory.
- **RFC-0835 (related)**: RFC-0835 added the `404.html` hardcoded exemption for `IMG-DELIVERY-04`. This RFC generalizes that concept — `404.html` could be expressed as `pagePattern: "**/404.html"` in config, but the hardcoded exemption remains as a default safety net.
- **RFC-0841 (related)**: RFC-0841 added config location diagnostics. The `pagePattern` field follows the same config loading path and emits the same `IMG-DELIVERY-CONFIG-01` warning for malformed entries.
- **DNA-72 (related)**: DNA-72 covers validator config location diagnostics. The `pagePattern` field does not change the config location — it is an additional field in the existing config file.

## Design

### Config schema

```yaml
overrides:
  - srcPattern: "/_astro/*.webp"
    rules:
      - IMG-DELIVERY-01
      - IMG-DELIVERY-02
    reason: "Background images use Astro asset imports, not ResponsiveImage."
  - srcPattern: "**"
    pagePattern: "**/nachweise/**"
    rules:
      - IMG-DELIVERY-04
    reason: "Nachweis detail and verify pages are text-only with no LCP image."
```

### TypeScript contracts

```ts
interface ConfigOverride {
  srcPattern: string;
  rules: string[];
  reason: string;
  pagePattern?: string;
}
```

```ts
function isPageSkipped(
  config: DeliveryConfig | null,
  pagePath: string,
  rule: string,
): boolean {
  if (!config) return false;
  return config.overrides.some((override) => {
    if (!override.rules.includes(rule)) return false;
    if (!override.pagePattern) return false;
    try {
      return picomatch(override.pagePattern, { dot: true })(pagePath);
    } catch {
      return false;
    }
  });
}
```

### Integration point

The `isPageSkipped` function is called in the `IMG-DELIVERY-04` check, alongside the existing `404.html` exemption:

```ts
const basename = file.split("/").pop() ?? "";
const pageExempt = basename === "404.html" || isPageSkipped(config, file, "IMG-DELIVERY-04");
if (!hasFetchpriorityHigh && imgs.length > 0 && !pageExempt) {
  // emit IMG-DELIVERY-04 finding
}
```

### Scope of pagePattern

`pagePattern` applies **only** to page-level rules (rules that check per-page, not per-image). Currently the only page-level rule is `IMG-DELIVERY-04`. Per-image rules (`IMG-DELIVERY-01`, `IMG-DELIVERY-02`) ignore `pagePattern` — they use `srcPattern` only.

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/werkstatt-site/src/checks/image-delivery.ts` | Validator — parses `pagePattern`, implements `isPageSkipped` |
| `{workpiece}/src/image-delivery.config.yaml` | Operator config — may include `pagePattern` in overrides |
| `packages/werkstatt-site/src/checks/tests/image-delivery.test.ts` | Unit tests for `isPageSkipped` and `pagePattern` parsing |

### Failure modes

- **IMG-DELIVERY-CONFIG-01**: Malformed `pagePattern` (not a string) → warning, override is skipped.
- **picomatch error**: Invalid glob pattern → `isPageSkipped` returns `false` for that override (defensive — no crash).
- **No match**: If `pagePattern` doesn't match any pages, the override is a no-op (no error, no warning).

## Rollout

- **Default behavior**: `pagePattern` is optional. Existing configs without it continue to work unchanged.
- **Existing apps**: No migration needed. The ad-hoc config in `warpgogol-com` already uses `pagePattern` (added during m000077).
- **New apps**: Can use `pagePattern` from the start if they have text-only pages that should be exempt from `IMG-DELIVERY-04`.
- **Pipeline integration**: No pipeline changes — `image.delivery.validate` already runs in `SITES_CHECK_POSTBUILD_PIPELINE`.

## Alternatives considered

- **Hardcode Nachweis exemption in validator**: Rejected — every new text-only page type would require a source code change. The config-based approach is more flexible.
- **Make `IMG-DELIVERY-04` a warning instead of error**: Rejected — the rule catches real LCP regressions on content pages. A page-level exemption is more precise.
- **Add `pagePattern` support for all rules**: Rejected — per-image rules (`IMG-DELIVERY-01`, `IMG-DELIVERY-02`) check individual `<img>` tags, not pages. A page-level exemption doesn't make sense for them.

## Risks

- **Over-exemption**: Operators could use a broad `pagePattern` (e.g. `**`) to exempt all pages from `IMG-DELIVERY-04`, masking real LCP regressions. Mitigated by the mandatory `reason` field (audit trail) and the fact that per-image checks still run.
- **Glob pattern errors**: Invalid picomatch patterns silently fail (return `false`). This is intentional — a config error should not crash the build. The `IMG-DELIVERY-CONFIG-01` warning catches non-string `pagePattern` values.
- **Performance**: `isPageSkipped` runs per-page, but the number of overrides is typically small (<10) and picomatch compilation is cached by the `picomatch` library.

## Acceptance criteria

- [ ] `ConfigOverride` interface includes optional `pagePattern?: string` field
- [ ] `loadDeliveryConfig` parses `pagePattern` from YAML and emits `IMG-DELIVERY-CONFIG-01` for non-string values
- [ ] `isPageSkipped` function uses `picomatch` to match page paths against `pagePattern` for a given rule
- [ ] `IMG-DELIVERY-04` check calls `isPageSkipped` alongside the existing `404.html` exemption
- [ ] `pagePattern` only affects page-level rules (IMG-DELIVERY-04), not per-image rules (IMG-DELIVERY-01, IMG-DELIVERY-02)
- [ ] Unit tests cover: pagePattern match → exempt, pagePattern no match → not exempt, invalid glob → not exempt (no crash), missing pagePattern → not exempt
- [ ] `rfc.validate` passes on this file

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- The ad-hoc implementation from mission `warpgogol-com-m000077` already satisfies the technical requirements. This RFC formalizes the contract and adds tests.
- Agents MUST NOT extend `pagePattern` to per-image rules without a superseding RFC.
