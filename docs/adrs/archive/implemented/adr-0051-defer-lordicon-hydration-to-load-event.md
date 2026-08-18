---
id: ADR-0051
title: "Defer LordIcon hydration to window load event"
status: implemented
scope: package
decider: architecture
createdAt: 2026-08-17
updatedAt: 2026-08-17
implementedAt: 2026-08-17
closedAt:
supersedes: []
supersededBy:
related:
  - RFC-0006
  - RFC-0833
reviewers: []
---

# ADR-0051: Defer LordIcon hydration to window load event

## Context

The layout orchestrator (`packages/werkstatt-shared/src/share/scripts/orchestrator.ts`) calls `initLordIconOnDemand()` synchronously during page initialization. This triggers a 5-hop network dependency chain:

```
HTML → index.js → layout-orchestrator.js → scripts.js → scheduler.js → dist.yS3yinqp.js (60KB @lordicon/element)
```

The 60KB LordIcon library loads before the LCP image is discovered, blocking the main thread and delaying LCP by ~2.5s. Lighthouse reports `unused-javascript` score=0.5 (57KB savings) and `network-dependency-tree-insight` score=0.

## Decision

Defer `initLordIconOnDemand()` to the `window.load` event instead of calling it synchronously.

- If `document.readyState === "complete"`, call immediately (SPA navigation case).
- Otherwise, register a `window.addEventListener("load", ...)` listener with `{ once: true }`.
- The IntersectionObserver inside `initLordIconOnDemand` still handles per-icon hydration — only the library load is deferred.

## Justification

LordIcon icons are decorative hover-triggered animations. They are never the LCP element and have no above-the-fold content dependency. Deferring the library load:

- Eliminates the 60KB blocking chain from the critical path.
- Frees the main thread for LCP image download and render.
- Preserves the existing IntersectionObserver-based per-icon hydration (icons near the viewport still hydrate, just after `load`).

The alternative of removing LordIcon entirely was rejected — the icons are part of the design system. Lazy-loading the library via dynamic import was already in place (`import("@lordicon/element")` inside `initLordIcon`), but the orchestrator triggered the import too early.

## Consequences

- Positive: LCP improves by ~2.5s (script chain no longer blocks image discovery). Unused JS audit improves. Network dependency tree audit passes.
- Negative: LordIcon animations appear slightly later (after `load` event instead of during initial parse). For hover-triggered icons this is imperceptible.
- Technical debt: None — the deferral is a one-line change in the orchestrator.

## Evolution

If LordIcon is replaced with a lighter icon system, this deferral can be removed. If above-the-fold icons become content-critical (e.g. loading indicators), a targeted eager-load for specific icons can be added without reverting the general deferral.
