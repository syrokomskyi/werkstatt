/*
<MODULE_CONTRACT>
<purpose>Unit tests for resolveMarkdownTwinPath (RFC-0785).</purpose>
<non-goals>
  <item>Do not test middleware runtime behavior — that requires a full Astro dev server.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0785: initial unit tests for resolveMarkdownTwinPath.</item>
</CHANGE_SUMMARY>
*/

import { describe, it, expect } from "vitest";
import { resolveMarkdownTwinPath } from "./agent-markdown-negotiation.ts";

describe("resolveMarkdownTwinPath", () => {
  it("maps root path to /index.md", () => {
    expect(resolveMarkdownTwinPath("/")).toBe("/index.md");
  });

  it("maps simple page with trailing slash", () => {
    expect(resolveMarkdownTwinPath("/about/")).toBe("/about/index.md");
  });

  it("maps simple page without trailing slash", () => {
    expect(resolveMarkdownTwinPath("/about")).toBe("/about/index.md");
  });

  it("maps i18n path", () => {
    expect(resolveMarkdownTwinPath("/de/preise/")).toBe("/de/preise/index.md");
  });

  it("maps nested path", () => {
    expect(resolveMarkdownTwinPath("/blog/post-1/")).toBe("/blog/post-1/index.md");
  });

  it("maps deeply nested path", () => {
    expect(resolveMarkdownTwinPath("/docs/guides/getting-started/")).toBe(
      "/docs/guides/getting-started/index.md",
    );
  });

  it("returns null for /api/ routes", () => {
    expect(resolveMarkdownTwinPath("/api/agent/mcp")).toBeNull();
  });

  it("returns null for /.well-known/ routes", () => {
    expect(resolveMarkdownTwinPath("/.well-known/agent.json")).toBeNull();
  });

  it("returns null for .ico files", () => {
    expect(resolveMarkdownTwinPath("/favicon.ico")).toBeNull();
  });

  it("returns null for .css files", () => {
    expect(resolveMarkdownTwinPath("/style.css")).toBeNull();
  });

  it("returns null for .js files", () => {
    expect(resolveMarkdownTwinPath("/script.js")).toBeNull();
  });

  it("returns null for .png files", () => {
    expect(resolveMarkdownTwinPath("/logo.png")).toBeNull();
  });

  it("returns null for .svg files", () => {
    expect(resolveMarkdownTwinPath("/icon.svg")).toBeNull();
  });

  it("returns null for .json files", () => {
    expect(resolveMarkdownTwinPath("/data.json")).toBeNull();
  });

  it("returns null for .webmanifest files", () => {
    expect(resolveMarkdownTwinPath("/site.webmanifest")).toBeNull();
  });

  it("returns null for .woff2 files", () => {
    expect(resolveMarkdownTwinPath("/font.woff2")).toBeNull();
  });

  it("returns null for .xml files", () => {
    expect(resolveMarkdownTwinPath("/sitemap.xml")).toBeNull();
  });
});
