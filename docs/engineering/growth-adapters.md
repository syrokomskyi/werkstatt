# Growth Adapters

> **Established by:** RFC-0027 · DNA-30

Growth adapters are the vendor integration layer of the growth system. Every analytics provider, A/B testing tool, or event pipeline is implemented as a `GrowthAdapter` — a small module that implements the closed interface contract.

---

## The GrowthAdapter interface (DNA-30)

```typescript
import type { GrowthAdapter, GrowthAdapterConfig, EmittedEvent, EventName } from "@warpgogol/growth/adapter";

const MyAdapter: GrowthAdapter = {
  id: "my-vendor",                           // kebab-case, unique
  accepts: ["page-view", "cta-click"],        // optional: event allow-list

  async init(config: GrowthAdapterConfig): Promise<void> {
    // Set up your vendor SDK here.
    // config.vendor contains the options from system.yaml growth.vendor.options.
    // config.appId and config.locale are always available.
  },

  track<N extends EventName>(event: EmittedEvent<N>): void {
    // Send event.name + event.payload to your vendor.
    // Must never throw — catch all errors internally.
    // event.timestamp is an ISO-8601 string.
  },

  identifySegment(segment: string | null): void {
    // Optional. Called when ClientRuntimeContext.segment changes.
    // No-op at MVP (segment is always null).
  },

  destroy(): void {
    // Optional. Clean up on SPA navigation or test teardown.
  },
};

export default MyAdapter;
```

### Rules

1. **Never throw** from `track()`. Catch all errors and log with `console.warn`.
2. **Never export vendor-specific methods** on the adapter object. All vendor coupling stays inside the module.
3. `id` must be globally unique. Use `kebab-case`.
4. `init()` must be idempotent — safe to call if the vendor SDK is already initialised.
5. The optional `accepts` field is an event allow-list. If present, events outside the list are dropped by `emit()` with a `console.warn`. If absent, all events in the closed catalog are forwarded.

---

## Testing with createEmitQueue()

The `createEmitQueue()` factory from `@warpgogol/growth/emit` creates an isolated emit queue with closure-based state — no module-level singletons, no cross-test pollution:

```typescript
import { createEmitQueue } from "@warpgogol/growth/emit";

const queue = createEmitQueue();
queue.emit("page-view", { path: "/" });
expect(queue.getQueueLength()).toBe(1);

queue.setActiveAdapter(myAdapter, "en");
expect(queue.getQueueLength()).toBe(0); // flushed
```

---

## `window.__warpgogol_emit__` bridge

At module initialization, `emit.ts` assigns `window.__warpgogol_emit__` so shared UI components (e.g. Astro inline scripts with `define:vars`) can fire events without importing `@warpgogol/growth/emit` directly. Events fired through the bridge before `bootGrowthLayer()` completes are queued and flushed on boot.

---

## Built-in adapters

| Adapter id | Package | Purpose |
| --- | --- | --- |
| `null` | `@warpgogol/growth` (built-in `src/null-adapter.ts`) | No-op. Logs to `console.debug`. Use in dev/staging. |
| `matomo` | `@warpgogol/growth-adapter-matomo` | Matomo Analytics over first-party proxy (RFC-0305). |

---

## Registering a new adapter

1. Create `packages/growth-adapter-<id>/` with `package.json`, `src/index.ts`.
2. Implement the `GrowthAdapter` interface and `export default`.
3. Add `@warpgogol/growth` as a dependency.
4. Add the adapter id to `KNOWN_ADAPTER_IDS` in `packages/growth/src/adapter.ts` and add a loader entry in `packages/growth/src/provider.astro`:
   ```typescript
   // adapter.ts
   export const KNOWN_ADAPTER_IDS = ["null", "matomo", "my-vendor"] as const;
   ```
   ```typescript
   // provider.astro (inside the <script> block)
   const _adapterSpecifiers = {
     // ...existing...
     "my-vendor": "@warpgogol/growth-adapter-my-vendor",
   };
   const growthLoaders = {
     // ...existing...
     "my-vendor": () => import(_adapterSpecifiers["my-vendor"]!),
   };
   ```
5. Run `pnpm --filter <app> growth.adapter.contract` — must pass.
6. Declare the adapter in `system.md`:
   ```yaml
   growth:
     vendor:
       adapter: my-vendor
       options:
         apiKey: "..."
   ```
7. Run `pnpm --filter <app> growth.vendor.resolve` — must pass.

---

## Vendor-specific config

Adapter options are declared in `system.md growth.vendor.options` as a flat string map:

```yaml
growth:
  vendor:
    adapter: plausible
    options:
      domain: example.org
      apiHost: https://plausible.io   # optional
      trackLocalhost: "false"         # optional, string "true"/"false"
```

The entire `options` map is forwarded verbatim to `GrowthAdapter.init(config)` as `config.vendor`. Type-safe parsing of options is the adapter's responsibility.

---

## Validation

| Command | What it checks |
| --- | --- |
| `growth.adapter.contract` | Every `packages/growth-adapter-*/` structurally satisfies the interface (workspace-scoped) |
| `growth.vendor.resolve` | `system.md growth.vendor.adapter` is a known registered id (app-scoped) |

---

## Security notes

- Never include API secrets directly in `system.md` — use environment variable substitution in your deployment pipeline.
- `options` values are serialised into the page HTML as part of `GrowthConfig`. Do not put private keys in `vendor.options`.
- The `null` adapter is the safe default for local dev and CI — it produces zero network traffic.
