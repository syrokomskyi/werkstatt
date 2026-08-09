/*
<MODULE_CONTRACT>
<purpose>Matomo implementation of GrowthAdapter for RFC-0305 Messkanon over a
first-party proxy. Translates semantic growth events into Matomo queue commands
through an injectable transport seam.</purpose>
<non-goals>
  <item>Do not expose vendor-specific methods on the GrowthAdapter interface.</item>
  <item>Do not connect directly to a Matomo host from browser code.</item>
  <item>Do not serialize arbitrary event payloads into Matomo.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Moved the adapter implementation out of index.ts so the root package entrypoint can stay a thin compatibility barrel.</item>
</CHANGE_SUMMARY>
*/

import type {
  GrowthAdapter,
  GrowthAdapterConfig,
  EmittedEvent,
  EventName,
} from "@warpgogol/werkstatt-site/growth/adapter";
import { DEFAULT_MATOMO_BINDING, type MatomoBinding, type MatomoBindingEvent } from "./binding.ts";
import { BrowserMatomoTransport, type MatomoTransport } from "./transport.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalizeBaseUrl(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}

function snakeToCamel(s: string): string {
  return s.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}

function resolveNameFrom(payload: Record<string, unknown>, nameFrom: string): string {
  const parts = nameFrom.split(".");
  if (parts[0] === "payload") parts.shift();
  let current: unknown = payload;
  for (const part of parts) {
    if (current && typeof current === "object" && part in (current as Record<string, unknown>)) {
      current = (current as Record<string, unknown>)[part];
    } else {
      return "";
    }
  }
  return String(current ?? "");
}

interface InitContext {
  base: string;
  endpointPath: string;
  siteId: string;
  requestMethod?: string;
}

function resolveQueueCallArgs(call: string, ctx: InitContext): unknown[] {
  switch (call) {
    case "setDoNotTrack":
      return [true];
    case "setTrackerUrl":
      return [`${ctx.base}${ctx.endpointPath}`];
    case "setSiteId":
      return [ctx.siteId];
    case "setRequestMethod":
      return ctx.requestMethod ? [ctx.requestMethod] : [];
    default:
      return [];
  }
}

function pushDimensions(
  transport: MatomoTransport,
  binding: MatomoBinding,
  vendor: Record<string, string>,
): void {
  for (const scope of ["visit", "action"] as const) {
    for (const dim of binding.dimensions[scope]) {
      const optionKey = snakeToCamel(dim.name);
      const value = vendor[optionKey];
      if (!value) continue;
      const id = vendor[`dimension.${dim.name}`];
      if (!id) continue;
      transport.push(["setCustomDimension", Number(id), value]);
    }
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createMatomoAdapter(options?: {
  transport?: MatomoTransport;
  binding?: MatomoBinding;
}): GrowthAdapter {
  const transport = options?.transport ?? new BrowserMatomoTransport();
  const binding = options?.binding ?? DEFAULT_MATOMO_BINDING;

  let initialized = false;
  let pageTracked = false;

  const eventMap = new Map<string, MatomoBindingEvent>();
  for (const evt of binding.events) {
    eventMap.set(evt.semanticId, evt);
  }

  const acceptedEvents: readonly EventName[] = [
    "page-view" as EventName,
    ...binding.events.map((e) => e.semanticId as EventName),
  ];

  return {
    id: "matomo",
    accepts: acceptedEvents,

    async init(config: GrowthAdapterConfig): Promise<void> {
      const siteId = config.vendor["siteId"];
      if (!siteId) {
        console.warn("[growth:matomo] Missing required vendor option: siteId");
        return;
      }

      const productionHost = config.vendor["productionHost"];
      if (productionHost && !transport.isProductionHost(productionHost)) {
        return;
      }

      if (transport.isOptedOut()) {
        return;
      }

      const base = normalizeBaseUrl(config.vendor["proxyBaseUrl"] ?? binding.tracker.proxyPath);

      const ctx: InitContext = {
        base,
        endpointPath: binding.tracker.endpointPath,
        siteId,
        requestMethod: config.vendor["requestMethod"] ?? binding.tracker.requestMethod,
      };

      for (const call of binding.tracker.requiredQueueCalls) {
        if (call === "trackPageView") continue;
        const args = resolveQueueCallArgs(call, ctx);
        transport.push([call, ...args]);
      }

      if (ctx.requestMethod) {
        transport.push(["setRequestMethod", ctx.requestMethod]);
      }

      pushDimensions(transport, binding, config.vendor);

      transport.injectScript(`${base}${binding.tracker.scriptPath}`);

      initialized = true;
      pageTracked = false;
    },

    track<N extends EventName>(event: EmittedEvent<N>): void {
      if (!initialized) return;

      if (event.name === "page-view" && !pageTracked) {
        transport.push(["trackPageView"]);
        pageTracked = true;
        return;
      }

      const bindingEvent = eventMap.get(event.name as string);
      if (bindingEvent) {
        const name = resolveNameFrom(
          event.payload as Record<string, unknown>,
          bindingEvent.matomo.nameFrom,
        );
        transport.push([
          "trackEvent",
          bindingEvent.matomo.category,
          bindingEvent.matomo.action,
          name,
        ]);
      }
    },

    identifySegment(_segment: string | null): void {
      // No-op until RFC-0027 persona detection activates segments.
    },

    destroy(): void {
      initialized = false;
      pageTracked = false;
    },
  };
}

const MatomoAdapter: GrowthAdapter = createMatomoAdapter();

export default MatomoAdapter;
