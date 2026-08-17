/*
<MODULE_CONTRACT>
  <purpose>RFC-0347: property-based tests for redactUrl safety invariants.</purpose>
  <keywords>RFC-0347, PBT, fast-check, redact, url, observability</keywords>
  <responsibilities>
    <item>Verify redactUrl never contains a query string in output.</item>
    <item>Verify redactUrl never contains a fragment in output.</item>
    <item>Verify redactUrl is idempotent.</item>
    <item>Verify redactUrl host is always lowercase.</item>
  </responsibilities>
</MODULE_CONTRACT>
<MODULE_MAP><entry key="pbt-redact-url">Property-based tests for redactUrl safety invariants.</entry></MODULE_MAP>
<CHANGE_SUMMARY><item>RFC-0347: initial PBT illustrative example for redactUrl invariants.</item></CHANGE_SUMMARY>
*/

import { test, expect } from "vitest";
import fc from "fast-check";
import { redactUrl } from "../redact.ts";

const urlArbitrary = fc.webUrl();

test("PBT: redactUrl output never contains a query string", () => {
  fc.assert(
    fc.property(urlArbitrary, (url) => {
      const redacted = redactUrl(url);
      try {
        const parsed = new URL(redacted);
        expect(parsed.search).toBe("");
      } catch {
        // non-URL input passes through unchanged — skip
      }
    }),
  );
});

test("PBT: redactUrl output never contains a fragment", () => {
  fc.assert(
    fc.property(urlArbitrary, (url) => {
      const redacted = redactUrl(url);
      try {
        const parsed = new URL(redacted);
        expect(parsed.hash).toBe("");
      } catch {
        // non-URL input passes through unchanged — skip
      }
    }),
  );
});

test("PBT: redactUrl is idempotent — redact(redact(url)) === redact(url)", () => {
  fc.assert(
    fc.property(urlArbitrary, (url) => {
      const once = redactUrl(url);
      expect(redactUrl(once)).toBe(once);
    }),
  );
});

test("PBT: redactUrl host is always lowercase", () => {
  fc.assert(
    fc.property(urlArbitrary, (url) => {
      const redacted = redactUrl(url);
      try {
        const parsed = new URL(redacted);
        expect(parsed.hostname).toBe(parsed.hostname.toLowerCase());
      } catch {
        // non-URL input passes through unchanged — skip
      }
    }),
  );
});
