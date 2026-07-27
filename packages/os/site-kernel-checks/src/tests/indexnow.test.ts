/*
<MODULE_CONTRACT>
<purpose>Fixture coverage for RFC-0311 IndexNow URL filtering, payload batching, and batch identity.</purpose>
<keywords>indexnow, RFC-0311, fixtures</keywords>
<responsibilities>
  <item>Lock down offline IndexNow payload behavior without live network calls.</item>
</responsibilities>
<non-goals>
  <item>Do not exercise live IndexNow API submission.</item>
</non-goals>
</MODULE_CONTRACT>
<MODULE_MAP>
  <entry key="tests">Vitest cases for IndexNow pure helpers.</entry>
</MODULE_MAP>
<CHANGE_SUMMARY>
  <item>RFC-0311: Added red/green fixture coverage for submit filtering and batching.</item>
</CHANGE_SUMMARY>
*/

import { describe, expect, it } from "vitest";
import {
  batchHash,
  buildIndexNowBatches,
  isIndexNowCanonicalHtmlUrl,
  keyLocation,
} from "../public-surface/indexnow.ts";

describe("RFC-0311 IndexNow fixtures", () => {
  it("filters to canonical public HTML URLs only", () => {
    const baseUrl = "https://example.com";
    const urls = [
      "https://example.com/",
      "https://example.com/de/angebot/",
      "https://example.com/de/angebot.md",
      "https://example.com/api/agent/mcp",
      "https://example.com/.well-known/agent.json",
      "https://example.com/robots.txt",
      "https://example.com/assets/logo.webp",
      "https://other.example.com/de/angebot/",
    ];

    expect(urls.filter((url) => isIndexNowCanonicalHtmlUrl(url, baseUrl))).toEqual([
      "https://example.com/",
      "https://example.com/de/angebot/",
    ]);
  });

  it("builds deterministic keyLocation and batches", () => {
    const batches = buildIndexNowBatches(
      "example.com",
      "demo-indexnow",
      "https://example.com/",
      ["https://example.com/a/", "https://example.com/b/", "https://example.com/c/"],
      2,
    );

    expect(keyLocation("https://example.com/", "demo-indexnow")).toBe(
      "https://example.com/demo-indexnow.txt",
    );
    expect(batches).toHaveLength(2);
    expect(batches[0].urlList).toEqual(["https://example.com/a/", "https://example.com/b/"]);
    expect(batches[1].urlList).toEqual(["https://example.com/c/"]);
  });

  it("hashes URL batches independent of input order", () => {
    expect(batchHash(["https://example.com/b/", "https://example.com/a/"])).toBe(
      batchHash(["https://example.com/a/", "https://example.com/b/"]),
    );
  });
});
