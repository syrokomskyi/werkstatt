/*
<MODULE_CONTRACT>
<purpose>RFC-0191: verify a Stripe webhook signature without the Stripe SDK. Reproduces Stripe's
scheme: HMAC-SHA256 over `${timestamp}.${rawBody}` keyed by the endpoint signing secret, compared
constant-time against the v1 signature, within a tolerance window. Fail-closed when the secret or
header is absent.</purpose>
<non-goals>
  <item>Do not import the Stripe SDK — node:crypto only.</item>
  <item>Do not log the secret or the signature.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0191: initial Stripe webhook signature verification.</item>
</CHANGE_SUMMARY>
*/

import { createHmac, timingSafeEqual } from "node:crypto";

/** Parse `t=...,v1=...,v1=...` into the timestamp and the list of v1 signatures. */
function parseSignatureHeader(header: string): { timestamp: number; signatures: string[] } {
  let timestamp = 0;
  const signatures: string[] = [];
  for (const part of header.split(",")) {
    const eq = part.indexOf("=");
    if (eq <= 0) continue;
    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (key === "t") timestamp = Number(value);
    else if (key === "v1") signatures.push(value);
  }
  return { timestamp, signatures };
}

function constantTimeEquals(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

/**
 * Verify a Stripe webhook. `rawBody` MUST be the exact bytes Stripe sent (verify before
 * JSON.parse). Fail-closed: returns false when the secret/header is missing, the timestamp
 * is outside the tolerance, or no v1 signature matches. `nowSec` is injectable for tests.
 */
export function verifyStripeSignature(
  rawBody: string,
  signatureHeader: string | null | undefined,
  secret: string | undefined,
  opts: { toleranceSec?: number; nowSec?: number } = {},
): boolean {
  if (!secret || !signatureHeader) return false;
  const { timestamp, signatures } = parseSignatureHeader(signatureHeader);
  if (!timestamp || signatures.length === 0) return false;

  const toleranceSec = opts.toleranceSec ?? 300;
  const nowSec = opts.nowSec ?? Math.floor(Date.now() / 1000);
  if (Math.abs(nowSec - timestamp) > toleranceSec) return false;

  const expected = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
  return signatures.some((sig) => constantTimeEquals(sig, expected));
}
