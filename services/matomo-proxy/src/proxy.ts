/*
<MODULE_CONTRACT>
<purpose>Apply strict allowlist, header, and cache policy to first-party Matomo browser proxy traffic with multi-tenant path-based routing.</purpose>
<non-goals>
  <item>Do not proxy Matomo Reporting/Admin APIs or tokenAuth-bearing operator requests.</item>
  <item>Do not log visitor URLs, query strings, request bodies, IPs, user agents, or referrers.</item>
  <item>Do not validate request origin — proxy trusts the appId in the path. Unknown appId returns 404.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0305: Add strict Matomo proxy allowlist and cache/header policy.</item>
  <item>Architecture review: narrow module interface — mapProxyPath, buildForwardHeaders, and UpstreamTarget are now private. proxyMatomoRequest is the sole export.</item>
  <item>Architecture review: collapse dead header denylist — allowlist already excludes everything except accept, accept-language, content-type. Removed the denylist set, cf-* and x-* prefix checks, and the drop: marker comment.</item>
  <item>RFC-0751: Multi-tenant path-based routing — extract appId from path, look up upstream in UPSTREAMS, forward to per-site Matomo Cloud host.</item>
</CHANGE_SUMMARY>
*/

import { UPSTREAMS } from "./upstreams.generated.ts";

type UpstreamTarget =
  | {
      ok: true;
      appId: string;
      upstreamHost: string;
      path: "matomo.js" | "matomo.php";
      method: "GET" | "POST" | "OPTIONS";
    }
  | { ok: false; status: 404 | 405 };

const PROXY_PREFIX = "/_wg/analytics/";

const FORWARDED_HEADERS = new Set(["accept", "accept-language", "content-type"]);

function mapProxyPath(request: Request): UpstreamTarget {
  const url = new URL(request.url);
  if (!url.pathname.startsWith(PROXY_PREFIX)) {
    return { ok: false, status: 404 };
  }

  const rest = url.pathname.slice(PROXY_PREFIX.length);
  const segments = rest.split("/");
  if (segments.length < 2) {
    return { ok: false, status: 404 };
  }

  const appId = segments[0];
  const file = segments[1];
  if (file !== "matomo.js" && file !== "matomo.php") {
    return { ok: false, status: 404 };
  }

  const upstreamHost = UPSTREAMS[appId];
  if (!upstreamHost) {
    return { ok: false, status: 404 };
  }

  if (file === "matomo.js" && request.method !== "GET") {
    return { ok: false, status: 405 };
  }
  if (file === "matomo.php" && !["GET", "POST", "OPTIONS"].includes(request.method)) {
    return { ok: false, status: 405 };
  }

  return {
    ok: true,
    appId,
    upstreamHost,
    path: file,
    method: request.method as "GET" | "POST" | "OPTIONS",
  };
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

export async function proxyMatomoRequest(request: Request): Promise<Response> {
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
  const upstreamUrl = new URL(`https://${target.upstreamHost}/${target.path}`);
  upstreamUrl.search = incomingUrl.search;

  const upstreamResponse = await fetch(upstreamUrl, {
    method: target.method,
    headers: buildForwardHeaders(request),
    body: target.method === "POST" ? request.body : null,
  });

  return withCachePolicy(upstreamResponse, target.path);
}
