---
id: RFC-0881
title: "Add page-level exemption pattern for image delivery validation"
status: implemented
kind: command
scope: workspace
owners:
  - architecture
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-08-19
updatedAt: 2026-08-19
enhancedAt: 2026-08-19
implementedAt: 2026-08-19
closedAt:
supersedes: []
supersededBy:
amends:
  - RFC-0830
amendedBy: []
related:
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

- **RFC-0830 (amended)**: Extends the config override schema with a new optional `pagePattern` field. The `srcPattern` and `rules` fields remain unchanged. The `reason` field remains mandatory.
- **RFC-0835 (related)**: RFC-0835 added the `404.html` hardcoded exemption for `IMG-DELIVERY-04`. This RFC generalizes that concept — `404.html` could be expressed as `pagePattern: "**/404.html"` in config, but the hardcoded exemption remains as a default safety net.
- **RFC-0841 (related)**: RFC-0841 added config location diagnostics. The `pagePattern` field follows the same config loading path and emits the same `IMG-DELIVERY-CONFIG-01` warning for malformed entries.
- **DNA-72 (related)**: DNA-72 covers validator config location diagnostics. The `pagePattern` field does not change the config location — it is an additional field in the existing config file.

## Design

### CLI surface

```sh
pnpm exec werkstatt run image.delivery.validate --site <siteId> --json
```

No new flags. The `--json` output shape is unchanged from RFC-0830: `{ command, status, findings[], checkedImages }`. The only change is that `findings[]` may now include fewer `IMG-DELIVERY-04` entries when `pagePattern` overrides are configured.

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

The `srcPattern` field remains mandatory for all overrides. When an override targets only a page-level rule via `pagePattern`, use `srcPattern: "**"` as a dummy wildcard — it satisfies the schema requirement without affecting per-image rule checks (which are not listed in `rules[]` for this override).

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

- **Non-string `pagePattern`**: Silently ignored (treated as `undefined`). The override is still loaded, but `isPageSkipped` returns `false` for it. This matches the existing code behavior — `IMG-DELIVERY-CONFIG-01` is only emitted for missing `srcPattern`, `rules`, or `reason`.
- **picomatch error**: Invalid glob pattern → `isPageSkipped` returns `false` for that override (defensive — no crash).
- **No match**: If `pagePattern` doesn't match any pages, the override is a no-op (no error, no warning).
- **Override with both `srcPattern` and `pagePattern`**: The two fields operate independently — `srcPattern` is checked by `isRuleSkipped` for per-image rules, `pagePattern` is checked by `isPageSkipped` for page-level rules. An override can have both without conflict.

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
- **Glob pattern errors**: Invalid picomatch patterns silently fail (return `false`). This is intentional — a config error should not crash the build. Non-string `pagePattern` values are silently ignored (treated as `undefined`).
- **Performance**: `isPageSkipped` runs per-page, but the number of overrides is typically small (<10) and picomatch compilation is cached by the `picomatch` library.

## Acceptance criteria

- [x] `ConfigOverride` interface includes optional `pagePattern?: string` field (evidence: `packages/werkstatt-site/src/checks/image-delivery.ts` ConfigOverride interface, line 97)
- [x] `loadDeliveryConfig` parses `pagePattern` from YAML and silently ignores non-string values (treats as `undefined`) (evidence: `image-delivery.ts` line 153, `typeof override.pagePattern === "string"`)
- [x] `isPageSkipped` function uses `picomatch` to match page paths against `pagePattern` for a given rule (evidence: `image-delivery.ts` lines 197-208)
- [x] `IMG-DELIVERY-04` check calls `isPageSkipped` alongside the existing `404.html` exemption (evidence: `image-delivery.ts` line 413)
- [x] `pagePattern` only affects page-level rules (IMG-DELIVERY-04), not per-image rules (IMG-DELIVERY-01, IMG-DELIVERY-02) (evidence: `isPageSkipped` only called at line 413 for page-level check; `isRuleSkipped` at line 394 uses `srcPattern` only)
- [x] Unit tests cover: pagePattern match → exempt, pagePattern no match → not exempt, invalid glob → not exempt (no crash), missing pagePattern → not exempt (evidence: `image-delivery.test.ts` lines 276-409, 6 test cases, all passing)
- [x] `rfc.validate` passes on this file (evidence: `rfc.validate --id RFC-0881` → "All 1 RFC(s) passed validation")

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented), per RFC-0224 (accepted→implemented transition).
- The ad-hoc implementation from mission `warpgogol-com-m000077` already satisfies the technical requirements. This RFC formalizes the contract and adds tests.
- Agents MUST NOT extend `pagePattern` to per-image rules without a superseding RFC.
- Agents MUST update `packages/werkstatt-site/AGENTS.md` to document the `pagePattern` field in the `image.delivery.validate` command description.
- No Compass XML sync needed — this RFC adds an optional field to an existing config schema, not a repository-wide requirement or shared package contract change.
