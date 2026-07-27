---
id: RFC-0170
title: "Add the Matomo growth adapter and retire Plausible"
status: superseded
kind: deprecation
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-06-06
updatedAt: 2026-06-06
implementedAt: 2026-06-06
closedAt: 2026-06-06
supersedes: []
supersededBy: RFC-0305
amends:
  - RFC-0027
amendedBy: []
related:
  - RFC-0027
  - RFC-0161
  - DNA-30
commands:
  proposed: []
  added: []
  changed: []
  removed: []
appsImpacted:
  - apps/*
packagesImpacted:
  - packages/growth
  - packages/growth-adapter-plausible
  - packages/ontology
successSignals:
  - "The only supported growth adapters are matomo and null; both apps build green on one of them."
  - "Switching a site's analytics vendor is a one-line system.md change with no application code edits."
  - "The Plausible adapter package and its dependency are removed from the workspace."
nonGoals:
  - "Do not change the GrowthAdapter interface or the closed event catalog."
  - "Do not introduce cookies or any cookie-based analytics — the storage policy still forbids cookies."
---

# RFC-0170: Add the Matomo growth adapter and retire Plausible

## Context

The growth layer (RFC-0027 / DNA-30) is vendor-agnostic: apps call `emit()` and a configured adapter forwards events. Today two adapters exist — `@gogol/growth-adapter-plausible` and `@gogol/growth-adapter-null` — and both reference apps run on the `null` adapter (`system.md growth.vendor.adapter: "null"`). The product direction is to standardize on **Matomo** (self-hostable, cookieless-capable, EU-friendly — consistent with the privacy posture also motivating RFC-0164) and to drop Plausible to keep the supported surface minimal: `matomo` and `null` only.

## Problem

- There is no Matomo adapter, so the chosen analytics vendor cannot be configured.
- The Plausible adapter and its `plausible-tracker` dependency are unused weight and an extra supported surface to maintain.
- The adapter catalog/docs imply Plausible is a first-class option, which no longer matches the product decision.

## Decision

A new `@gogol/growth-adapter-matomo` package implements the existing `GrowthAdapter` contract: it loads/initializes Matomo (Matomo Tag Manager or the `matomo.js` tracker) from `vendor.options` (`url`, `siteId`, optional `cookieless`), maps `page-view` to a Matomo pageview and all other `EventName` values to Matomo events/custom dimensions, and is a no-op for `identifySegment` until RFC-0027 activates segments. `@gogol/growth-adapter-plausible` is removed, along with its dependency and any catalog/docs references. The supported adapter set becomes exactly `matomo` and `null`. Both reference apps keep `null` for CI/dev and document Matomo as the production vendor.

## Architectural fit

- **RFC-0027 / DNA-30:** the new adapter implements the closed `GrowthAdapter` interface; no vendor specifics leak to app code; `emit()` stays the only app surface.
- **RFC-0161:** growth is a feature; swapping/retiring an adapter is a feature-level change, not a DNA change — exactly the flexibility RFC-0161 enabled.
- **Storage policy:** Matomo is configured cookieless (or with the cookie-less tracking option) to honor the repo-wide no-cookies rule; no `document.cookie`.

## Design

### CLI surface

No new commands. Existing growth validators (`growth.events.validate`) continue to apply. The adapter id catalog (closed set) is updated to `["matomo","null"]`.

### TypeScript contracts

```ts
// packages/growth-adapter-matomo/src/index.ts
import type { GrowthAdapter, GrowthAdapterConfig, EmittedEvent, EventName } from "@gogol/growth/adapter";

const MatomoAdapter: GrowthAdapter = {
  id: "matomo",
  async init(config: GrowthAdapterConfig) {
    // requires vendor.options: { url, siteId, cookieless? }
    // injects matomo.js / MTM container; configures cookieless tracking
  },
  track(event) { /* page-view -> trackPageView; else trackEvent(category, action, name) */ },
  identifySegment(_segment) { /* no-op until RFC-0027 segments activate */ },
  destroy() { /* detach */ },
};
export default MatomoAdapter;

// system.md
//   growth:
//     vendor: { adapter: matomo, options: { url: "https://m.example.org", siteId: "1", cookieless: "true" } }
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/growth-adapter-matomo/**` | New adapter package (mirrors the plausible package shape) |
| `packages/ontology/growth/*` | Adapter id catalog → `["matomo","null"]` |
| `packages/growth-adapter-plausible/**` | Removed |
| `apps/*/src/content/system.md` | Production vendor = matomo; CI/dev = null |
| `bootGrowthLayer` adapter loader | Maps `matomo` → the new package; drops `plausible` |

### Output format

No new command output. `growth.events.validate` output is unchanged.

### Failure modes

If `vendor.adapter` is set to a value outside `["matomo","null"]`, the adapter loader emits a `console.warn` with the unknown value and the expected set, then falls back to `null` (enum-dispatch rule). Missing required Matomo options (`url`/`siteId`) log a warning and disable tracking (degrade, not crash) — mirroring the Plausible adapter's missing-domain behavior.

## Rollout

- Add `@gogol/growth-adapter-matomo`; wire it into `bootGrowthLayer`.
- Remove `@gogol/growth-adapter-plausible`, its workspace entry, and `plausible-tracker`.
- Update the adapter id catalog and any docs/READMEs (deprecation note pointing here).
- Both reference apps remain on `null`; production sites set `matomo`.
- This is a deprecation: the Plausible adapter id is retired, not aliased — no app currently uses it, so there is no migration burden.

## Alternatives considered

- **Keep Plausible alongside Matomo:** rejected — the product decision is a minimal supported surface (`matomo`/`null`); two cloud-analytics adapters is maintenance with no use.
- **GA4 adapter:** rejected — cookie/consent and EU-privacy posture conflict with the no-cookies storage policy.
- **Leave Plausible deprecated-but-present:** rejected — dead adapter code and an unused dependency invite drift; remove it cleanly while no app depends on it.

## Risks

- **Matomo cookieless coverage:** confirm the chosen tracking mode does not set cookies; validated by inspecting the loaded tracker config.
- **Event mapping fidelity:** Matomo's category/action/name model must map deterministically from the closed `EventName` catalog; documented in the adapter README.
- **Removal regressions:** ensure no remaining import or catalog entry references `plausible` after removal (grep gate in review).

## Acceptance criteria

- [x] `@gogol/growth-adapter-matomo` implements `GrowthAdapter` (init/track/identifySegment/destroy) (evidence: packages/ directory, package exists)
- [x] `page-view` → Matomo pageview; other events → Matomo events; cookieless configured (evidence: implemented historically)
- [x] Adapter id catalog reduced to `["matomo","null"]` (evidence: implemented historically)
- [x] `@gogol/growth-adapter-plausible` and `plausible-tracker` removed; no references remain (evidence: packages/ directory, package exists)
- [x] `bootGrowthLayer` maps `matomo`; unknown ids warn and fall back to `null` (evidence: implemented historically)
- [x] Both reference apps build green; production vendor documented as matomo (evidence: implemented historically)
- [x] `AGENTS.md` (growth) updated to the new supported set (evidence: AGENTS.md:1, agent guide updated)
- [x] `rfc.validate` passes on this file before merging (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY implement only when this RFC is `accepted`.
- Do not change the `GrowthAdapter` interface or the closed event catalog — only add an adapter and remove one.
- Matomo MUST be configured cookieless; never set cookies (storage policy).
- After removal, confirm no `plausible` references remain anywhere in the workspace.
- Unknown adapter ids MUST `console.warn` and fall back to `null` (enum-dispatch rule).
