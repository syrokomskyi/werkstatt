/*
<MODULE_CONTRACT>
<purpose>ADR-0042: Maturity Score Worker. Request-triggered Cloudflare Worker
that accepts POST /score with { url: string } and returns { score: number }.
The initial implementation returns a deterministic stub score derived from the
URL hash. The real HDRI scoring logic is deferred.</purpose>
<non-goals>
  <item>Does not implement the HDRI scoring methodology — that is an external artifact.</item>
  <item>Does not persist scores — no database or KV storage.</item>
  <item>Does not implement rate limiting — deferred until traffic warrants it.</item>
  <item>Does not restrict CORS origins — the stub allows all origins. Restrict when real scoring is added.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>ADR-0042: Initial creation of maturity-score Worker with stub scoring logic.</item>
</CHANGE_SUMMARY>
*/

import { createMetricsPusher } from "@warpgogol/werkstatt-site/observability";

export interface MaturityScoreWorkerEnv {
  WARPGOGOL_OTLP_ENDPOINT: string;
  WARPGOGOL_OTLP_TOKEN: string;
  [key: string]: string | undefined;
}

interface ScoreResponse {
  score: number;
}

const CORS_HEADERS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "content-type",
  "access-control-max-age": "86400",
};

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      ...CORS_HEADERS,
    },
  });
}

function hashString(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function calculateStubScore(url: string): number {
  const hash = hashString(url);
  return hash % 101;
}

function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function createMaturityScoreWorker() {
  return {
    async fetch(
      request: Request,
      env: MaturityScoreWorkerEnv,
      _ctx: ExecutionContext,
    ): Promise<Response> {
      const url = new URL(request.url);

      if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: CORS_HEADERS });
      }

      if (url.pathname === "/health") {
        const pusher = createMetricsPusher(
          { serviceName: "maturity-score", layer: "back", environment: "production" },
          { endpoint: env.WARPGOGOL_OTLP_ENDPOINT, token: env.WARPGOGOL_OTLP_TOKEN },
        );
        if (pusher) {
          pusher.gaugeSet("warpgogol_back_up", 1, { service: "maturity-score" });
          await pusher.flush();
        }
        return json({ status: "ok", service: "maturity-score" }, 200);
      }

      if (url.pathname !== "/score") {
        return json({ error: "not_found", message: "Endpoint not found" }, 404);
      }

      if (request.method !== "POST") {
        return json({ error: "method_not_allowed", message: "Only POST is supported" }, 405);
      }

      const contentType = request.headers.get("content-type") ?? "";
      if (!contentType.includes("application/json")) {
        return json(
          { error: "invalid_content_type", message: "Content-Type must be application/json" },
          415,
        );
      }

      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return json({ error: "invalid_json", message: "Request body must be valid JSON" }, 400);
      }

      if (
        typeof body !== "object" ||
        body === null ||
        typeof (body as Record<string, unknown>).url !== "string" ||
        ((body as Record<string, unknown>).url as string).length === 0
      ) {
        return json(
          {
            error: "missing_url",
            message: "Field 'url' is required and must be a non-empty string",
          },
          400,
        );
      }

      const requestUrl = (body as Record<string, unknown>).url as string;

      if (!isValidUrl(requestUrl)) {
        return json(
          { error: "invalid_url", message: "Field 'url' must be a valid http or https URL" },
          400,
        );
      }

      const score = calculateStubScore(requestUrl);
      const response: ScoreResponse = { score };

      const pusher = createMetricsPusher(
        { serviceName: "maturity-score", layer: "back", environment: "production" },
        { endpoint: env.WARPGOGOL_OTLP_ENDPOINT, token: env.WARPGOGOL_OTLP_TOKEN },
      );
      if (pusher) {
        pusher.counterAdd("warpgogol_back_requests_total", 1, {
          service: "maturity-score",
          status_class: "2xx",
        });
        pusher.gaugeSet("warpgogol_back_up", 1, { service: "maturity-score" });
        await pusher.flush();
      }

      return json(response, 200);
    },
  };
}

export default createMaturityScoreWorker();
