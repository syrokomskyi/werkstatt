/*
<MODULE_CONTRACT>
<purpose>Unit tests for markdown twin path resolution (RFC-0785).

Tests the canonical markdownTwinUrlPath from the share package to verify
it produces the correct twin paths for the markdown negotiation middleware.
These tests complement the existing twin-path.test.ts in the share package
by focusing on the RFC-0785 use case: middleware content negotiation.
</purpose>
<non-goals>
  <item>Do not test middleware runtime behavior — that requires a full Astro dev server.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0785: initial unit tests for markdown twin path resolution in negotiation context.</item>
  <item>Review fix A-1: test canonical markdownTwinUrlPath instead of duplicated resolveMarkdownTwinPath.</item>
</CHANGE_SUMMARY>
*/

import { describe, it, expect } from "vitest";
import { markdownTwinUrlPath } from "@warpgogol/werkstatt-site/share/semantic";

const supportedLangs = ["de", "en", "uk"];

describe("markdownTwinUrlPath (RFC-0785 negotiation context)", () => {
  it("maps root path to /index.md", () => {
    expect(markdownTwinUrlPath("/", { supportedLangs })).toBe("/index.md");
  });

  it("maps simple page with trailing slash to /about.md", () => {
    expect(markdownTwinUrlPath("/about/", { supportedLangs })).toBe("/about.md");
  });

  it("maps simple page without trailing slash to /about.md", () => {
    expect(markdownTwinUrlPath("/about", { supportedLangs })).toBe("/about.md");
  });

  it("maps language root to /de/index.md", () => {
    expect(markdownTwinUrlPath("/de/", { supportedLangs })).toBe("/de/index.md");
  });

  it("maps nested path to /de/preise.md", () => {
    expect(markdownTwinUrlPath("/de/preise/", { supportedLangs })).toBe("/de/preise.md");
  });

  it("maps deeply nested path", () => {
    expect(markdownTwinUrlPath("/docs/guides/getting-started/", { supportedLangs })).toBe(
      "/docs/guides/getting-started.md",
    );
  });

  it("maps English language root to /en/index.md", () => {
    expect(markdownTwinUrlPath("/en/", { supportedLangs })).toBe("/en/index.md");
  });

  it("maps Ukrainian path to /uk/preise.md", () => {
    expect(markdownTwinUrlPath("/uk/preise/", { supportedLangs })).toBe("/uk/preise.md");
  });
});
