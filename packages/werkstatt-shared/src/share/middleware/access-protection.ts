/*
<MODULE_CONTRACT>
<purpose>RFC-0899: Runtime access protection middleware for dev/alt subdomains. Checks Host header and requires Basic Auth with a 4-digit PIN for dev.* and alt.* hosts. Sets X-Robots-Tag headers to prevent indexing.</purpose>
<keywords>middleware, access-protection, basic-auth, pin, dev, alt, RFC-0899</keywords>
<responsibilities>
  <item>Check Host header against dev.* and alt.* patterns — pass through for main domain.</item>
  <item>Require Basic Auth (username: access, password: ACCESS_PIN env var) for dev/alt hosts.</item>
  <item>Set X-Robots-Tag: noindex, nofollow, noai, noimageai on ALL dev/alt responses (including 401).</item>
  <item>Use constant-time string comparison for auth check to prevent timing attacks.</item>
  <item>Pass through when ACCESS_PIN is unset (allows new sites before protection is configured).</item>
</responsibilities>
<non-goals>
  <item>Do not modify the HTML response body — only headers and access gating.</item>
  <item>Do not activate for the main/production domain, even if the PIN secret is set on the main Worker.</item>
  <item>Do not use Node.js-specific APIs (Buffer, crypto.timingSafeEqual) — runs in Cloudflare Workers runtime.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0899: Initial access protection middleware for dev/alt subdomains.</item>
</CHANGE_SUMMARY>
*/

import { defineMiddleware } from "astro:middleware";
import { env } from "cloudflare:workers";

const NOINDEX_HEADER = "noindex, nofollow, noai, noimageai";

/**
 * Constant-time string comparison to prevent timing attacks.
 * Returns true if both strings are equal, false otherwise.
 * Always processes the full length of both strings regardless of match status.
 */
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * RFC-0899: Access protection middleware for dev/alt subdomains.
 *
 * At runtime, checks the Host header:
 * - dev.* or alt.* → require Basic Auth with ACCESS_PIN env var
 * - main.* or production domain → no protection, pass through
 * - No PIN configured → pass through but still set X-Robots-Tag
 *
 * The auth check happens BEFORE next() to short-circuit unauthorized access.
 * X-Robots-Tag is set on ALL dev/alt responses including 401 challenges.
 *
 * Uses `cloudflare:workers` env import (Astro v6 removed `context.locals.runtime.env`).
 * Uses `btoa()` (Workers runtime), not Node.js Buffer.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const accessProtectionMiddleware = defineMiddleware(async (context: any, next: any) => {
  const host = context.request.headers.get("host") ?? "";
  const isDevOrAlt = host.startsWith("dev.") || host.startsWith("alt.");

  if (!isDevOrAlt) {
    return next();
  }

  const pin = (env.ACCESS_PIN as string | undefined) ?? undefined;

  // No PIN set — allow access but still set noindex headers
  if (!pin) {
    const response = await next();
    response.headers.set("X-Robots-Tag", NOINDEX_HEADER);
    return response;
  }

  // Check Basic Auth BEFORE calling next()
  const auth = context.request.headers.get("authorization") ?? "";
  const expected = `Basic ${btoa(`access:${pin}`)}`;

  if (auth && constantTimeEqual(auth, expected)) {
    const response = await next();
    response.headers.set("X-Robots-Tag", NOINDEX_HEADER);
    return response;
  }

  // Not authenticated — challenge with noindex headers
  return new Response("Authentication required", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Staging Access"',
      "X-Robots-Tag": NOINDEX_HEADER,
    },
  });
});
