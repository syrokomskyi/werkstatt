# @gogol/growth

Vendor-agnostic growth layer for the WGogol platform. Provides the `GrowthAdapter` interface, typed `emit()`, and the `<GrowthProvider>` Astro island (DNA-27–30, RFC-0027).

## Purpose

All analytics, funnel tracking, and experiment flag reads go through this package. **Never call vendor SDKs (`window.gtag`, `window._paq`, etc.) directly** in `packages/ui/` or `apps/*/src/`. Every emission must go through `emit()`.

## Entry points

| Import | What it provides |
| --- | --- |
| `@gogol/growth` | Server/build-time barrel: adapter types, config schema, `NullAdapter`, `createEmitQueue`, `GROWTH_EMIT_KEY`, `EmitQueue` type |
| `@gogol/growth/adapter` | `GrowthAdapter`, `EmittedEvent`, `EventName`, `EventPayloadMap`, `FunnelDefinition`, `EVENT_NAMES` |
| `@gogol/growth/emit` | `emit(eventId, payload)` — the only allowed way to fire events. Also exports `createEmitQueue()` for tests and `GROWTH_EMIT_KEY` for the `window.__webgogol_emit__` bridge. |
| `@gogol/growth/client` | `bootGrowthLayer(loaders)`, `GrowthAdapterLoaders` — client-side bootstrap |
| `@gogol/growth/config` | `GrowthConfigSchema`, `GrowthVendorConfigSchema` |
| `@gogol/growth/null-adapter` | `NullAdapter` — built-in no-op adapter for dev/test |
| `@gogol/growth/provider` | `<GrowthProvider>` Astro island — owns the static adapter loader map and boots the client |

## Usage

### Emit an event

```typescript
import { emit } from "@gogol/growth/emit";

emit("page-view", { path: "/de/services" });
emit("cta-click", { section: "hero", label: "Contact us" });
```

Event IDs must exist in `packages/ontology/growth/events/`. Adding an unknown event ID fails `growth.events.validate`.

### Wire the provider in layout

```astro
---
import GrowthProvider from "@gogol/growth/provider";
---
<GrowthProvider
  appId="my-app"
  locale={lang}
  vendor={{ adapter: "matomo", options: { proxyBaseUrl: "/_wg/analytics/" } }}
/>
```

The provider owns the static adapter loader map (`GrowthAdapterLoaders`) with static `import()` specifiers so the bundler code-splits each adapter into a resolvable async chunk. The null adapter is built-in (no separate package). To add a custom adapter, add it to the loader map in `provider.astro`.

### Implement a custom adapter

```typescript
import type { GrowthAdapter } from "@gogol/growth/adapter";

const MyAdapter: GrowthAdapter = {
  id: "my-vendor",
  async init(config) { /* ... */ },
  track(event) { /* ... */ },
  identifySegment(segment) { /* ... */ },
  destroy() { /* ... */ },
};
```

## Architecture invariant (DNA-27)

`src/content/system.md growth.<concern>` is scalar — one vendor per concern, permanently. Multi-vendor per concern is forbidden.

## Related packages

| Package                        | Role                                                         |
| ------------------------------ | ------------------------------------------------------------ |
| `@gogol/growth-adapter-matomo` | Matomo adapter for RFC-0305 Messkanon over first-party proxy |
| `@gogol/ontology`              | Closed event catalog (`packages/ontology/growth/events/`)    |

## Validation

```sh
pnpm --filter @gogol/growth build:check
```
