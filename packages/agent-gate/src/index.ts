/*
<MODULE_CONTRACT>
<purpose>
RFC-0290: the Agent Gate — a framework-agnostic runtime that turns a site's
Agent Surface Manifest + active capability records into (a) a stateless MCP
endpoint and (b) direct HTTP action handlers. Instantiated with data (the
manifest), never with per-site code (AS-1). astro.ts is the only
astro-aware caller.
</purpose>
<non-goals>
  <item>Do not read files, secrets, or the network directly — ports do that.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0290: initial gate factory.</item>
  <item>RFC-0291: add per-IP rate limiting, identity header passthrough, MCP size cap.</item>
</CHANGE_SUMMARY>
*/

import type { AgentSurfaceManifest } from "@warpgogol/share/agent";
import type { CapabilityRecord } from "@warpgogol/ontology";
import type { AgentGatePorts } from "./ports.ts";
import { createFixedWindowLimiter, type RateLimiter } from "./limits.ts";
import { validateAgainstCapabilitySchema, buildIntegrationEventFromAction } from "./actions.ts";
import { handleJsonRpcRequest } from "./mcp/handler.ts";
import {
  isJsonRpcRequest,
  jsonRpcError,
  JSON_RPC_ERROR,
  type JsonRpcResponse,
} from "./mcp/protocol.ts";

export type { AgentGatePorts } from "./ports.ts";
export * from "./actions.ts";
export * from "./mcp/protocol.ts";
export * from "./mcp/tools.ts";
export * from "./limits.ts";
export type { McpHandlerContext } from "./mcp/handler.ts";

// RFC-0291: module-level limiter cache persists across requests in the same isolate.
// Keyed by `${capabilityId}:${maxPerWindow}` so different capabilities get separate limiters.
const limiterCache = new Map<string, RateLimiter>();

/** Reset the limiter cache — test-only. */
export function __resetLimiterCache(): void {
  limiterCache.clear();
}

function getLimiter(
  capabilityId: string,
  maxPerWindow: number,
  ports: AgentGatePorts,
): RateLimiter | null {
  if (!ports.createRateLimiter) return null;
  const cacheKey = `${capabilityId}:${maxPerWindow}`;
  let limiter = limiterCache.get(cacheKey);
  if (!limiter) {
    limiter = ports.createRateLimiter(maxPerWindow);
    limiterCache.set(cacheKey, limiter);
  }
  return limiter;
}

function extractClientIp(request: Request): string {
  return request.headers.get("CF-Connecting-IP") ?? "unknown";
}

const IDENTITY_HEADERS = ["Signature-Agent", "Signature", "User-Agent"] as const;
const IDENTITY_MAX_BYTES = 1024;

function extractAgentIdentity(request: Request): Record<string, string> {
  const identity: Record<string, string> = {};
  let totalBytes = 0;
  for (const header of IDENTITY_HEADERS) {
    const value = request.headers.get(header);
    if (!value) continue;
    const remaining = IDENTITY_MAX_BYTES - totalBytes;
    if (remaining <= 0) break;
    const truncated = value.slice(0, remaining);
    identity[header] = truncated;
    totalBytes += new TextEncoder().encode(truncated).length;
  }
  return identity;
}

function attachIdentity(
  event: { payload: Record<string, unknown> },
  identity: Record<string, string>,
): void {
  if (Object.keys(identity).length > 0) {
    event.payload._agentIdentity = identity;
  }
}

function jsonResponse(
  body: unknown,
  status = 200,
  extraHeaders?: Record<string, string>,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...extraHeaders },
  });
}

export interface AgentGate {
  handleMcp(request: Request): Promise<Response>;
  handleAction(capabilityId: string, request: Request): Promise<Response>;
}

/** Construct the gate for one site from its manifest + active capability records + ports. */
export function createAgentGate(
  manifest: AgentSurfaceManifest,
  catalog: CapabilityRecord[],
  ports: AgentGatePorts,
): AgentGate {
  return {
    async handleMcp(request: Request): Promise<Response> {
      if (request.method !== "POST") {
        return new Response(null, { status: 405, headers: { Allow: "POST" } });
      }
      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return jsonResponse(jsonRpcError(null, JSON_RPC_ERROR.PARSE_ERROR, "Invalid JSON."));
      }
      if (Array.isArray(body)) {
        return jsonResponse(
          jsonRpcError(null, JSON_RPC_ERROR.INVALID_REQUEST, "Batch requests are not supported."),
        );
      }
      if (!isJsonRpcRequest(body)) {
        return jsonResponse(
          jsonRpcError(null, JSON_RPC_ERROR.INVALID_REQUEST, "Invalid JSON-RPC 2.0 request."),
        );
      }
      const result: JsonRpcResponse = await handleJsonRpcRequest(body, {
        manifest,
        catalog,
        ports,
        agentIdentity: extractAgentIdentity(request),
        clientIp: extractClientIp(request),
      });
      return jsonResponse(result);
    },

    async handleAction(capabilityId: string, request: Request): Promise<Response> {
      const capability = catalog.find((c) => c.id === capabilityId);
      const ref = manifest.actions.find((a) => a.id === capabilityId);
      if (!capability || !ref) {
        return jsonResponse({ accepted: false, error: "unknown-capability" }, 404);
      }

      const raw = await request.text();
      const byteLength = new TextEncoder().encode(raw).length;
      if (byteLength > capability.limits.maxPayloadBytes) {
        return jsonResponse({ accepted: false, error: "payload-too-large" }, 413);
      }

      // RFC-0291: per-IP rate limit (fail-open if no limiter).
      const clientIp = extractClientIp(request);
      const limiter = getLimiter(capabilityId, capability.limits.perMinutePerIp, ports);
      if (limiter) {
        const result = limiter.check(`${capabilityId}:${clientIp}`);
        if (!result.allowed) {
          return jsonResponse(
            { accepted: false, error: "rate-limited", retryAfterSeconds: result.retryAfterSeconds },
            429,
            { "Retry-After": String(result.retryAfterSeconds) },
          );
        }
      }

      let parsed: unknown;
      try {
        parsed = raw.length > 0 ? JSON.parse(raw) : {};
      } catch {
        return jsonResponse({ accepted: false, error: "invalid-json" }, 400);
      }
      const validated = validateAgainstCapabilitySchema(capability.input, parsed);
      if (!validated.ok) {
        return jsonResponse(
          { accepted: false, error: "schema-violation", errors: validated.errors },
          400,
        );
      }

      const locale =
        typeof validated.value.locale === "string" &&
        manifest.languages.supported.includes(validated.value.locale)
          ? validated.value.locale
          : manifest.languages.default;
      const event = buildIntegrationEventFromAction(
        capability,
        validated.value,
        locale,
        ports.now(),
      );
      attachIdentity(event, extractAgentIdentity(request));
      try {
        const outcome = await ports.dispatch.send(event);
        return jsonResponse(outcome, 200);
      } catch (err) {
        return jsonResponse(
          { accepted: false, error: "dispatch-failed", eventId: event.eventId, retryable: true },
          502,
        );
      }
    },
  };
}
