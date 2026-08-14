/*
<MODULE_CONTRACT>
<purpose>
  Test coverage for RFC-0847 proxyBaseUrl hostname cross-reference check in
  analytics.config.validate. Tests the extractProxyHostname, isDevHostname,
  and isProxySubdomainRegistered pure functions.
</purpose>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0847: initial test suite — extractProxyHostname, isDevHostname, isProxySubdomainRegistered.</item>
</CHANGE_SUMMARY>
*/

import { describe, it, expect } from "vitest";
import {
  extractProxyHostname,
  isDevHostname,
  isProxySubdomainRegistered,
} from "../audit/validators/analytics-config.ts";

describe("RFC-0847: extractProxyHostname", () => {
  it("extracts hostname from absolute HTTPS URL", () => {
    expect(extractProxyHostname("https://matomo-proxy.warpgogol.com/_wg/analytics/app/")).toBe(
      "matomo-proxy.warpgogol.com",
    );
  });

  it("extracts hostname from HTTP URL with port", () => {
    expect(extractProxyHostname("http://localhost:8787/_wg/analytics/app/")).toBe("localhost");
  });

  it("returns null for relative URL (no scheme)", () => {
    expect(extractProxyHostname("/_wg/analytics/app/")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(extractProxyHostname("")).toBeNull();
  });
});

describe("RFC-0847: isDevHostname", () => {
  it("returns true for localhost", () => {
    expect(isDevHostname("localhost")).toBe(true);
  });

  it("returns true for 127.0.0.1", () => {
    expect(isDevHostname("127.0.0.1")).toBe(true);
  });

  it("returns true for workers.dev subdomains", () => {
    expect(isDevHostname("matomo-proxy.syrokomskyi.workers.dev")).toBe(true);
  });

  it("returns false for production hostnames", () => {
    expect(isDevHostname("matomo-proxy.warpgogol.com")).toBe(false);
  });
});

describe("RFC-0847: isProxySubdomainRegistered", () => {
  const registeredDomains = ["matomo-proxy.warpgogol.com", "api.warpgogol.com"];

  it("returns true when hostname is in registered domains", () => {
    expect(
      isProxySubdomainRegistered(
        "https://matomo-proxy.warpgogol.com/_wg/analytics/app/",
        registeredDomains,
      ),
    ).toBe(true);
  });

  it("returns false when hostname is not in registered domains", () => {
    expect(
      isProxySubdomainRegistered(
        "https://matomo-proxy.example.com/_wg/analytics/app/",
        registeredDomains,
      ),
    ).toBe(false);
  });

  it("returns true for workers.dev URLs (skipped)", () => {
    expect(
      isProxySubdomainRegistered(
        "https://matomo-proxy.syrokomskyi.workers.dev/_wg/analytics/app/",
        [],
      ),
    ).toBe(true);
  });

  it("returns true for localhost URLs (skipped)", () => {
    expect(isProxySubdomainRegistered("http://localhost:8787/_wg/analytics/app/", [])).toBe(true);
  });

  it("returns true for relative URLs (skipped)", () => {
    expect(isProxySubdomainRegistered("/_wg/analytics/app/", [])).toBe(true);
  });

  it("returns true for empty registered domains with dev hostname", () => {
    expect(
      isProxySubdomainRegistered(
        "https://matomo-proxy.syrokomskyi.workers.dev/_wg/analytics/app/",
        [],
      ),
    ).toBe(true);
  });

  it("returns false for production hostname with empty registered domains", () => {
    expect(
      isProxySubdomainRegistered("https://matomo-proxy.warpgogol.com/_wg/analytics/app/", []),
    ).toBe(false);
  });
});
