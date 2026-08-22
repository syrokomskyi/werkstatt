/*
<MODULE_CONTRACT>
<purpose>Unit tests for RFC-0909 search engine verification helpers and sitemap submission URL builder.</purpose>
<keywords>search-verification, RFC-0909, unit-tests</keywords>
<responsibilities>
  <item>Test normalizeTxtValue for DNS TXT record comparison.</item>
  <item>Test isGoogleTokenValid for token format validation.</item>
  <item>Test buildSitemapSubmitUrl for Search Console API URL construction.</item>
</responsibilities>
<non-goals>
  <item>Do not test live DNS lookups or HTTP fetches — those require network access.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0909: initial unit tests for search verification and sitemap submission helpers.</item>
</CHANGE_SUMMARY>
*/

import { describe, expect, it } from "vitest";
import {
  normalizeTxtValue,
  isGoogleTokenValid,
} from "../public-surface/search-verification.ts";
import { buildSitemapSubmitUrl } from "../public-surface/search-sitemap-submit.ts";

describe("RFC-0909 search.verification.validate helpers", () => {
  describe("normalizeTxtValue", () => {
    it("trims whitespace", () => {
      expect(normalizeTxtValue("  hello  ")).toBe("hello");
    });

    it("strips surrounding double quotes", () => {
      expect(normalizeTxtValue('"google-site-verification=abc123"')).toBe(
        "google-site-verification=abc123",
      );
    });

    it("strips surrounding single quotes", () => {
      expect(normalizeTxtValue("'google-site-verification=abc123'")).toBe(
        "google-site-verification=abc123",
      );
    });

    it("handles already-clean values", () => {
      expect(normalizeTxtValue("google-site-verification=abc123")).toBe(
        "google-site-verification=abc123",
      );
    });

    it("handles empty string", () => {
      expect(normalizeTxtValue("")).toBe("");
    });
  });

  describe("isGoogleTokenValid", () => {
    it("accepts valid token with correct prefix", () => {
      expect(isGoogleTokenValid("google-site-verification=abc123_XY-z")).toBe(true);
    });

    it("rejects token without prefix", () => {
      expect(isGoogleTokenValid("abc123")).toBe(false);
    });

    it("rejects token with invalid characters", () => {
      expect(isGoogleTokenValid("google-site-verification=abc!@#")).toBe(false);
    });

    it("rejects empty token", () => {
      expect(isGoogleTokenValid("google-site-verification=")).toBe(false);
    });

    it("rejects token with spaces", () => {
      expect(isGoogleTokenValid("google-site-verification=abc 123")).toBe(false);
    });
  });
});

describe("RFC-0909 search.sitemap.submit helpers", () => {
  describe("buildSitemapSubmitUrl", () => {
    it("builds correct API URL with encoded parameters", () => {
      const url = buildSitemapSubmitUrl(
        "https://example.com",
        "https://example.com/sitemap-index.xml",
      );
      expect(url).toBe(
        "https://www.googleapis.com/webmasters/v3/sites/https%3A%2F%2Fexample.com/sitemaps/https%3A%2F%2Fexample.com%2Fsitemap-index.xml",
      );
    });

    it("encodes special characters in site URL", () => {
      const url = buildSitemapSubmitUrl(
        "https://my-site.example.com",
        "https://my-site.example.com/sitemap-index.xml",
      );
      expect(url).toContain("https%3A%2F%2Fmy-site.example.com");
    });
  });
});
