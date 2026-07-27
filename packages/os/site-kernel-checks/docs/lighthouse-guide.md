# Lighthouse Performance Guide for AI Agents

This document provides guidance for AI agents working with Lighthouse Core Web Vitals compliance in the WGogol monorepo.

## Overview

RFC-0006 established 10 performance rules (LH-01 through LH-10) that all apps in `apps/*` must follow. The `lighthouse.validate` and `lighthouse.budget.check` commands automate detection of violations.

## Commands Reference

### lighthouse.validate

Validates static patterns in source code for LH-01 through LH-09 compliance.

```bash
pnpm exec site-kernel run lighthouse.validate --site <app-name>
```

**Checks performed:**

- LH-01: Astro config uses `output: 'static'`
- LH-02: Dynamic imports have DOM guards (`has()`, `querySelector`)
- LH-03: No synchronous imports of heavy libraries (Three.js, GSAP, etc.)
- LH-04: External scripts use `defer` or `async`
- LH-05: Long `setTimeout` uses `requestIdleCallback`
- LH-06: Heavy features defer until user interaction
- LH-07: Animations respect `prefersReducedMotion`
- LH-08: Heavy features check device capabilities
- LH-09: DOM writes compare values before writing

### lighthouse.budget.check

Validates bundle sizes against 300KB uncompressed budget.

```bash
pnpm exec site-kernel run lighthouse.budget.check --site <app-name>
```

**Requires:** Build output in `dist/` directory.

## Rule-by-Rule Guidance

### LH-01: Static-First 90/10

**Pattern:**

```typescript
// astro.config.mjs
export default defineConfig({
  output: 'static', // ✅ Correct
  // output: 'server', // ❌ Only for auth/CRM routes
});
```

**Exception:** Hybrid rendering with explicit `prerender: true` on marketing routes.

### LH-02: Conditional Loading

**Pattern:**

```typescript
// ✅ Correct: Check DOM before importing
if (has(".scroll-to-top")) {
  const mod = await import("./scroll");
  mod.initScrollToTop();
}

// ❌ Wrong: Unconditional dynamic import
const mod = await import("./heavy-module"); // Loads on every page
```

### LH-03: Dynamic Import for Heavy Libraries

**Pattern:**

```typescript
// ❌ Wrong: Synchronous import blocks main thread
import * as THREE from 'three';

// ✅ Correct: Dynamic import
if (has("[data-three-canvas]")) {
  const THREE = await import('three');
  initThreeScene(THREE);
}
```

### LH-04: Defer Attribute

**Pattern:**

```astro
<!-- ✅ Correct: Non-blocking script loading -->
<script src="/scripts/analytics.js" defer></script>

<!-- ❌ Wrong: Blocks HTML parsing -->
<script src="/scripts/analytics.js"></script>
```

### LH-05: Idle Scheduling

**Pattern:**

```typescript
// ✅ Correct: Use requestIdleCallback
export function scheduleTask(task: () => void) {
  if ("requestIdleCallback" in window) {
    window.requestIdleCallback(task, { timeout: 1000 });
  } else {
    setTimeout(task, 50);
  }
}

// ❌ Wrong: Long setTimeout without idle scheduling
setTimeout(heavyWork, 500); // Blocks user interaction
```

**Reference implementation:** `@/apps/main/src/scripts/layout-scroll/scheduler.ts`

### LH-06: User Action Defer

**Pattern:**

```typescript
// ✅ Correct: Defer Lenis initialization until user interaction
function startNonCritical() {
  if (!shouldEnableLenis()) return;
  initLenis({ prefersReducedMotion });
}

window.addEventListener("pointerdown", startNonCritical, { once: true });
window.addEventListener("keydown", startNonCritical, { once: true });
window.addEventListener("touchstart", startNonCritical, { once: true, passive: true });
```

**Reference implementation:** `@/apps/main/src/scripts/layout-scroll/non-critical.ts`

### LH-07: Reduced Motion Guard

**Pattern:**

```typescript
// ✅ Correct: Respect user preferences
const prefersReducedMotion = window.matchMedia(
  "(prefers-reduced-motion: reduce)"
).matches;

if (!prefersReducedMotion) {
  initSmoothScroll();
}

// ❌ Wrong: Animation without guard
gsap.to(element, { x: 100, duration: 1 }); // May cause motion sickness
```

### LH-08: Device Capability Check

**Pattern:**

```typescript
// ✅ Correct: Check capabilities before heavy features
const shouldEnableLenis = () => {
  if (prefersReducedMotion) return false;
  if (navigator.connection?.saveData) return false;
  if (navigator.deviceMemory && navigator.deviceMemory < 4) return false;
  if (navigator.hardwareConcurrency && navigator.hardwareConcurrency < 4) return false;
  return true;
};
```

### LH-09: No Hydration Flicker

**Pattern:**

```typescript
// ✅ Correct: Compare before writing
function syncCopyrightYear() {
  const currentYear = new Date().getFullYear();
  const element = document.querySelector('[data-copyright-year]');
  const renderedYear = parseInt(element?.textContent || "0", 10);

  // Only update if different
  if (renderedYear !== currentYear && element) {
    element.textContent = String(currentYear);
  }
}

// ❌ Wrong: Direct write always triggers layout
element.textContent = String(currentYear); // May cause hydration mismatch
```

**Reference:** `@/apps/reference-app/public/scripts/copyright-year-sync.js`

### LH-10: Bundle Budgets

**Pattern:**

```typescript
// astro.config.mjs
export default defineConfig({
  vite: {
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            // Split heavy dependencies
            vendor: ['react', 'react-dom'],
          },
        },
      },
    },
  },
});
```

**Budget:** 300KB uncompressed per client-side route bundle.

**Automatic exclusions** (no configuration needed):

- `dist/server/` chunks — SSR server code, never sent to the browser
- `*.worker.*` files — web workers (e.g. `pdf.worker.mjs`), run off the main thread

**Ignore file for known large lazy bundles:**

Create `.lighthouse-budget-ignore` in the app root to exempt specific bundles. Each non-comment line is matched as a substring against the relative `dist/` path.

```
# .lighthouse-budget-ignore
# Format: substring of the relative dist path (from app root)
# Lines starting with # are comments

# Three.js events module — lazy-loaded only on 3D pages
events-760a1017.esm

# pdfjs-dist PDF viewer — lazy-loaded only when [data-pdf-viewer] is present
pdf-viewer
```

**When to use the ignore file:**

- The bundle is a **third-party library** that cannot be split further
- The bundle is **lazy-loaded** via dynamic `import()` (not part of the initial page load)
- The bundle is a **feature chunk** that only loads on specific pages with a DOM guard

**Do not ignore** bundles that are part of the initial page load — those should be split via `manualChunks` instead.

**Reference:** `@/apps/main/.lighthouse-budget-ignore`

## Troubleshooting

### Command Not Found

If `lighthouse.validate` is not available:

1. Check `kernel.config.ts` includes the check module
2. Verify `check.module.ts` registers the command in `extraCommands`
3. Rebuild the package: `pnpm --filter @gogol/site-kernel-checks build`

### False Positives

The static analysis may produce false positives. Suppress with inline comments:

```typescript
// lighthouse-disable-next-line LH-02
// Justification: This import is needed for critical path rendering
const mod = await import("./critical-module");
```

### Build Required for budget.check

`lighthouse.budget.check` requires a build:

```bash
cd apps/<app-name>
pnpm build
pnpm exec site-kernel run lighthouse.budget.check
```

## Reference Implementations

### Canonical Examples from `apps/main`

| Rule                              | File                                        | Lines |
| --------------------------------- | ------------------------------------------- | ----- |
| LH-02, LH-05, LH-06, LH-07, LH-08 | `src/scripts/layout-scroll.ts`              | 79-94 |
| LH-05                             | `src/scripts/layout-scroll/scheduler.ts`    | 45-60 |
| LH-06, LH-07, LH-08               | `src/scripts/layout-scroll/non-critical.ts` | 50-74 |

### RFC-0005 Compliance Example

The copyright year sync script demonstrates LH-04 and LH-09:

```javascript
// @/apps/reference-app/public/scripts/copyright-year-sync.js
// LH-04: defer attribute in layout.astro
// LH-09: Compare values before DOM write
if (renderedYear !== currentYear) {
  element.textContent = String(currentYear);
}
```

## Related Commands

| Command                      | Purpose                                       |
| ---------------------------- | --------------------------------------------- |
| `lighthouse.validate`        | Static analysis for LH-01..LH-09              |
| `lighthouse.budget.check`    | Bundle size validation (LH-10)                |
| `check`                      | Runs full check pipeline including lighthouse |
| `rfc.validate --id RFC-0006` | Validate RFC document                         |

## See Also

- RFC-0006: `@/docs/rfcs/RFC-0006-lighthouse-performance-rules.md`
- Check module guide: `./check-module-guide.md`
- Compass operations: `./compass-operations.md`
