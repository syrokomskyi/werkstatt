/*
<MODULE_CONTRACT>
<purpose>Apply strict allowlist, header, and cache policy to first-party Matomo browser proxy traffic.</purpose>
<non-goals>
  <item>Do not proxy Matomo Reporting/Admin APIs or tokenAuth-bearing operator requests.</item>
  <item>Do not log visitor URLs, query strings, request bodies, IPs, user agents, or referrers.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0305: Add strict Matomo proxy allowlist and cache/header policy.</item>
  <item>Architecture review: narrow module interface — mapProxyPath, buildForwardHeaders, and UpstreamTarget are now private. proxyMatomoRequest is the sole export.</item>
  <item>Architecture review: collapse dead header denylist — allowlist already excludes everything except accept, accept-language, content-type. Removed the denylist set, cf-* and x-* prefix checks, and the drop: marker comment.</item>
</CHANGE_SUMMARY>
*/

import { resolveMatomoOrigin, type MatomoProxyEnv } from "./config.ts";

type UpstreamTarget =
  | { ok: true; path: "matomo.js" | "matomo.php"; method: "GET" | "POST" | "OPTIONS" }
  | { ok: false; status: 404 | 405 };

const PROXY_PREFIX = "/_wg/analytics/";

const FORWARDED_HEADERS = new Set(["accept", "accept-language", "content-type"]);

function mapProxyPath(request: Request): UpstreamTarget {
  const url = new URL(request.url);
  if (!url.pathname.startsWith(PROXY_PREFIX)) {
    return { ok: false, status: 404 };
  }

  const path = url.pathname.slice(PROXY_PREFIX.length);
  if (path !== "matomo.js" && path !== "matomo.php") {
    return { ok: false, status: 404 };
  }

  if (path === "matomo.js" && request.method !== "GET") {
    return { ok: false, status: 405 };
  }
  if (path === "matomo.php" && !["GET", "POST", "OPTIONS"].includes(request.method)) {
    return { ok: false, status: 405 };
  }

  return { ok: true, path, method: request.method as "GET" | "POST" | "OPTIONS" };
}

function buildForwardHeaders(request: Request): Headers {
  const headers = new Headers();
  for (const [name, value] of request.headers.entries()) {
    if (FORWARDED_HEADERS.has(name.toLowerCase())) {
      headers.set(name, value);
    }
  }
  return headers;
}

function withCachePolicy(response: Response, path: "matomo.js" | "matomo.php"): Response {
  const headers = new Headers(response.headers);
  headers.delete("set-cookie");
  if (path === "matomo.js") {
    headers.set("Cache-Control", "public, max-age=300");
  } else {
    headers.set("Cache-Control", "no-store");
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export async function proxyMatomoRequest(request: Request, env: MatomoProxyEnv): Promise<Response> {
  const target = mapProxyPath(request);
  if (!target.ok) {
    return new Response(null, { status: target.status });
  }

  if (target.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "content-type",
        "Cache-Control": "no-store",
      },
    });
  }

  const incomingUrl = new URL(request.url);
  const upstreamUrl = new URL(`${resolveMatomoOrigin(env)}/${target.path}`);
  upstreamUrl.search = incomingUrl.search;

  const upstreamResponse = await fetch(upstreamUrl, {
    method: target.method,
    headers: buildForwardHeaders(request),
    body: target.method === "POST" ? request.body : null,
  });

  return withCachePolicy(upstreamResponse, target.path);
}
