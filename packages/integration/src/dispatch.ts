/*
<MODULE_CONTRACT>
<purpose>RFC-0179: the dynamic-dispatch execution seam. The shared, token-free consumer never runs a
destination adapter itself — it dispatches each event into the originating tenant Worker, which runs
its gogol-adapter destinations with the CLIENT's own secrets and returns what routed/failed. This
keeps destination tokens and any datastore inside the isolated tenant while the delivery backbone is
shared. Pure contracts + two thin helpers (tenant-side executor, consumer-side dispatcher).</purpose>
<non-goals>
  <item>Do not read or pass destination tokens through the shared consumer — only the tenant holds them.</item>
  <item>Do not persist event payloads — the dispatch is in-flight only (RFC-0177).</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0179: initial implementation.</item>
</CHANGE_SUMMARY>
*/

import type { IntegrationEvent, IntegrationSecrets } from "./port.ts";
import { routeEventToReady, type RouteResult } from "./index.ts";

/** Internal route the shared consumer dispatches into on the tenant (RFC-0179). */
export const DISPATCH_ROUTE = "/internal/integration-route" as const;

/** Envelope the shared consumer sends into a tenant's internal route. */
export interface DispatchExecuteRequest {
  siteId: string;
  event: IntegrationEvent;
}

/** What the tenant reports back. `routed`/`failed` are `${kind}:${vendor}` ids. */
export interface DispatchExecuteResult {
  routed: string[];
  failed: string[];
  skipped: string[];
}

/**
 * Tenant-side handler body for `POST /internal/integration-route` (RFC-0179).
 * Runs the tenant's ready gogol-adapter destinations with the CLIENT's own
 * secrets and an optional dedup set. The shared consumer never calls adapters
 * directly — it calls this, so tokens stay inside the tenant.
 */
export async function executeDispatch(
  request: DispatchExecuteRequest,
  secrets: IntegrationSecrets,
  seen?: { has(key: string): boolean | Promise<boolean>; add(key: string): unknown },
): Promise<DispatchExecuteResult> {
  const result: RouteResult = await routeEventToReady(request.event, secrets, seen);
  return { routed: result.routed, failed: result.failed, skipped: result.skipped };
}

/**
 * Minimal structural type for a Workers-for-Platforms dynamic-dispatch binding.
 * `get(siteId)` returns the tenant Worker's fetcher; we never import the platform
 * types (keeps @gogol/share runtime-agnostic, mirroring QueueBinding/KvDedupStore).
 */
export interface DispatchNamespaceBinding {
  get(siteId: string): { fetch(request: Request): Promise<Response> };
}

/** Outcome the consumer uses to decide ack vs retry for a queued message. */
export interface DispatchOutcome {
  ok: boolean;
  result?: DispatchExecuteResult;
  /** Set when the dispatch itself failed (unreachable tenant / bad status). */
  transportError?: string;
}

/**
 * Consumer-side: dispatch one event into its originating tenant Worker over HTTP
 * and interpret the reply (RFC-0179). The consumer authenticates with the shared
 * inbound secret (the tenant already trusts that secret for its inbound route) and
 * holds NO destination token. A non-2xx response or a reply where nothing routed
 * but something failed is a transport failure → the caller should `retry()`.
 */
export async function dispatchToTenant(
  dispatcher: DispatchNamespaceBinding,
  request: DispatchExecuteRequest,
  inboundSecret: string,
  origin = "https://tenant.internal",
): Promise<DispatchOutcome> {
  try {
    const tenant = dispatcher.get(request.siteId);
    const response = await tenant.fetch(
      new Request(`${origin}${DISPATCH_ROUTE}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-integration-secret": inboundSecret,
        },
        body: JSON.stringify(request),
      }),
    );
    if (!response.ok) {
      return { ok: false, transportError: `tenant responded ${response.status}` };
    }
    const result = (await response.json()) as DispatchExecuteResult;
    // Nothing routed but something failed ⇒ retry the whole message (bounded → DLQ).
    if (result.routed.length === 0 && result.failed.length > 0) {
      return { ok: false, result, transportError: "all destinations failed" };
    }
    return { ok: true, result };
  } catch (err) {
    return { ok: false, transportError: (err as Error).message };
  }
}
