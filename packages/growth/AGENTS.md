# `@warpgogol/growth` — Agent Guide

This package owns the **vendor-agnostic growth layer** — analytics, funnel tracking, and experiment flag reads (DNA-27–30, RFC-0027).

## What lives here

| Entry point | Module | What it provides |
| --- | --- | --- |
| `@warpgogol/growth` | `src/index.ts` | Server/build-time barrel: adapter types, config schema, `NullAdapter`, `createEmitQueue`, `GROWTH_EMIT_KEY`, `EmitQueue` type |
| `@warpgogol/growth/adapter` | `src/adapter.ts` | `GrowthAdapter` interface, `EmittedEvent`, `EventName`, `EventPayloadMap`, `FunnelDefinition`, `EVENT_NAMES`, `KNOWN_ADAPTER_IDS` |
| `@warpgogol/growth/emit` | `src/emit.ts` | `emit(eventId, payload)` — the ONLY allowed way to fire events. Also exports `createEmitQueue()` factory for tests and `GROWTH_EMIT_KEY` for the `window.__warpgogol_emit__` bridge. |
| `@warpgogol/growth/client` | `src/client.ts` | `bootGrowthLayer(loaders)`, `GrowthAdapterLoaders` — client-side bootstrap |
| `@warpgogol/growth/config` | `src/config.ts` | `GrowthConfigSchema`, `GrowthVendorConfigSchema` |
| `@warpgogol/growth/null-adapter` | `src/null-adapter.ts` | `NullAdapter` — built-in no-op adapter for dev/test |
| `@warpgogol/growth/provider` | `src/provider.astro` | `<GrowthProvider>` Astro island — owns the static adapter loader map and boots the client |

## Rules for AI agents

- Do NOT call vendor analytics SDKs directly. Use `emit()` from `@warpgogol/growth/emit`.
- Do NOT include `locale` in the payload — it is injected automatically by `emit()`.
- Emit only event names from the closed `EventName` catalog. Adding an unknown event ID fails `growth.events.validate`.
- Event catalog lives in `packages/ontology/growth/events/*.yaml`. `EVENT_NAMES` in `adapter.ts` is the single source of truth.
- `system.md growth.<concern>` is scalar — one vendor per concern, permanently.

## Emit an event

```typescript
import { emit } from "@warpgogol/growth/emit";
emit("page-view", { path: "/de/services" });
emit("cta-click", { section: "hero", label: "Contact us" });
```

## Wire the provider in layout

```astro
---
import GrowthProvider from "@warpgogol/growth/provider";
---
<GrowthProvider
  appId="my-app"
  locale={lang}
  vendor={{ adapter: "matomo", options: { proxyBaseUrl: "/_wg/analytics/" } }}
/>
```

The provider owns the adapter loader map inside the `<script>` block (not via `define:vars`, which cannot serialize functions). Vendor adapter imports use a variable specifier pattern (`_adapterSpecifiers`) so the bundler does not statically resolve packages that may not be a dependency of every consuming app. The null adapter is built-in (no separate package). To add a custom adapter: add its id to `KNOWN_ADAPTER_IDS` in `adapter.ts`, add a loader entry in `provider.astro`, and add the package as a dependency in the app's `package.json`.

## Adapter contract

```typescript
interface GrowthAdapter {
  readonly id: string;
  readonly accepts?: readonly EventName[];
  init(config: GrowthAdapterConfig): Promise<void>;
  track<N extends EventName>(event: EmittedEvent<N>): void;
  identifySegment?(segment: string | null): void;
  destroy?(): void;
}
```

The optional `accepts` field is an allow-list of event names the adapter handles. If present, events outside the list are dropped by `emit()` with a `console.warn`. If absent, all events are forwarded.

## Related packages

| Package                        | Role                                                         |
| ------------------------------ | ------------------------------------------------------------ |
| `@warpgogol/growth-adapter-matomo` | Matomo adapter for RFC-0305 Messkanon over first-party proxy |
| `@warpgogol/ontology`              | Closed event catalog                                         |

## Validation

```sh
rtk pnpm --filter @warpgogol/growth build:check
```
