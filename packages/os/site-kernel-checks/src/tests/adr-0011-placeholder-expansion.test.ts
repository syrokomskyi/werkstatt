/*
<MODULE_CONTRACT>
  <purpose>
    ADR-0011: Regression test for placeholder expansion bug in
    generated-stale-validate.ts and generated-files-validate.ts.
    {route}, {lang}, {slug}, {id}, {category} placeholders were not
    expanded to * before glob matching, causing false negatives.
  </purpose>
  <keywords>ADR-0011, placeholder expansion, expandOwnershipPlaceholders, glob matching</keywords>
  <responsibilities>
    <item>Verify {system} expands to the app name when provided.</item>
    <item>Verify {system} expands to * when no app is provided.</item>
    <item>Verify {app} expands to the app name when provided.</item>
    <item>Verify {app} expands to * when no app is provided.</item>
    <item>Verify {lang} expands to *.</item>
    <item>Verify {route} expands to *.</item>
    <item>Verify {slug} expands to *.</item>
    <item>Verify {id} expands to *.</item>
    <item>Verify {category} expands to *.</item>
    <item>Verify multiple placeholders in a single path are all expanded.</item>
    <item>Verify paths without placeholders are returned unchanged.</item>
  </responsibilities>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>ADR-0011: add regression test for expandOwnershipPlaceholders covering all 7 placeholders.</item>
</CHANGE_SUMMARY>
*/

import { describe, it, expect } from "vitest";
import { expandOwnershipPlaceholders } from "../generated-files-validate.ts";

describe("ADR-0011: expandOwnershipPlaceholders — all placeholders expanded", () => {
  it("{system} expands to app name when provided", () => {
    expect(expandOwnershipPlaceholders("systems/{system}/public/.well-known/bordbuch.json", "warpgogol-com")).toBe(
      "systems/warpgogol-com/public/.well-known/bordbuch.json",
    );
  });

  it("{system} expands to * when no app provided", () => {
    expect(expandOwnershipPlaceholders("systems/{system}/public/.well-known/bordbuch.json")).toBe(
      "systems/*/public/.well-known/bordbuch.json",
    );
  });

  it("{app} expands to app name when provided", () => {
    expect(expandOwnershipPlaceholders("public/{app}-indexnow.txt", "warpgogol-com")).toBe(
      "public/warpgogol-com-indexnow.txt",
    );
  });

  it("{app} expands to * when no app provided", () => {
    expect(expandOwnershipPlaceholders("public/{app}-indexnow.txt")).toBe(
      "public/*-indexnow.txt",
    );
  });

  it("{lang} expands to *", () => {
    expect(expandOwnershipPlaceholders("src/content/pages/{lang}/impressum.md", "test-app")).toBe(
      "src/content/pages/*/impressum.md",
    );
  });

  it("{route} expands to *", () => {
    expect(expandOwnershipPlaceholders("public/{route}.md", "test-app")).toBe(
      "public/*.md",
    );
  });

  it("{slug} expands to *", () => {
    expect(expandOwnershipPlaceholders("public/preview/{lang}/{slug}.png", "test-app")).toBe(
      "public/preview/*/*.png",
    );
  });

  it("{id} expands to *", () => {
    expect(expandOwnershipPlaceholders("packages/ui/src/sections/{id}/{id}.types.generated.ts")).toBe(
      "packages/ui/src/sections/*/*.types.generated.ts",
    );
  });

  it("{category} expands to *", () => {
    expect(expandOwnershipPlaceholders("public/sitemap-{category}.xml", "test-app")).toBe(
      "public/sitemap-*.xml",
    );
  });

  it("multiple placeholders in a single path are all expanded", () => {
    expect(expandOwnershipPlaceholders("public/preview/{lang}/{slug}.png", "test-app")).toBe(
      "public/preview/*/*.png",
    );
    expect(expandOwnershipPlaceholders("packages/ui/src/sections/{id}/{id}.types.generated.ts", "test-app")).toBe(
      "packages/ui/src/sections/*/*.types.generated.ts",
    );
  });

  it("paths without placeholders are returned unchanged (posix-normalized)", () => {
    expect(expandOwnershipPlaceholders("public/og-image.png", "test-app")).toBe(
      "public/og-image.png",
    );
  });

  it("backslash paths are normalized to posix", () => {
    expect(expandOwnershipPlaceholders("src\\content\\pages\\{lang}\\impressum.md", "test-app")).toBe(
      "src/content/pages/*/impressum.md",
    );
  });
});
