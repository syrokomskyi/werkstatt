import { test, expect } from "vitest";
import type { SystemManifest } from "@warpgogol/site-kernel-content";
import {
  buildRetiredPageRoutesBlock,
  buildRetiredTombstoneSlugs,
} from "../app-boilerplate-helpers.ts";

/*
<MODULE_CONTRACT>
<purpose>
  Verify RFC-0589: buildRetiredPageRoutesBlock filters out 410 entries (only 301 in _redirects)
  and buildRetiredTombstoneSlugs extracts 410 slugs for middleware generation.
</purpose>
<responsibilities>
  <item>Assert buildRetiredPageRoutesBlock returns empty string for only-410 routes.</item>
  <item>Assert buildRetiredPageRoutesBlock returns only 301 entries for mixed routes.</item>
  <item>Assert buildRetiredTombstoneSlugs returns sorted slugs for 410 entries.</item>
  <item>Assert buildRetiredTombstoneSlugs returns empty array when no 410 routes.</item>
</responsibilities>
<non-goals>
  <item>Do not test template application or file writing — these are pure functions.</item>
</non-goals>
</MODULE_CONTRACT>
<MODULE_MAP>
  <entry key="buildRetiredPageRoutesBlock">_redirects retired routes block builder (RFC-0589: 301 only).</entry>
  <entry key="buildRetiredTombstoneSlugs">410 tombstone slug extractor for middleware (RFC-0589).</entry>
</MODULE_MAP>
<CHANGE_SUMMARY>
  <item>RFC-0589: initial test suite for 410 filtering and tombstone slug extraction.</item>
</CHANGE_SUMMARY>
*/

function makeManifest(
  retiredRoutes: Array<{ slug: string; status: 301 | 410; to?: string }>,
): SystemManifest {
  return {
    app: "warpgogol-com",
    i18n: { default: "de", supported: { de: {} } },
    identity: { domain: "warpgogol.com", biome: "handwerk-material-warm" },
    retiredRoutes,
  } as unknown as SystemManifest;
}

test("buildRetiredPageRoutesBlock returns empty string for only-410 routes", () => {
  const manifest = makeManifest([
    { slug: "/widerruf", status: 410 },
    { slug: "/alt-page", status: 410 },
  ]);
  expect(buildRetiredPageRoutesBlock(manifest)).toBe("");
});

test("buildRetiredPageRoutesBlock returns only 301 entries for mixed routes", () => {
  const manifest = makeManifest([
    { slug: "/widerruf", status: 410 },
    { slug: "/old-service", status: 301, to: "/leistungen" },
    { slug: "/alt-page", status: 410 },
  ]);
  const result = buildRetiredPageRoutesBlock(manifest);
  expect(result).toContain("/old-service/* /leistungen 301");
  expect(result).not.toContain("410");
  expect(result).not.toContain("/widerruf");
  expect(result).not.toContain("/alt-page");
});

test("buildRetiredPageRoutesBlock returns empty string for empty retiredRoutes", () => {
  const manifest = makeManifest([]);
  expect(buildRetiredPageRoutesBlock(manifest)).toBe("");
});

test("buildRetiredTombstoneSlugs returns sorted slugs for 410 entries", () => {
  const manifest = makeManifest([
    { slug: "/widerruf", status: 410 },
    { slug: "/old-service", status: 301, to: "/leistungen" },
    { slug: "/alt-page", status: 410 },
  ]);
  const slugs = buildRetiredTombstoneSlugs(manifest);
  expect(slugs).toEqual(["alt-page", "widerruf"]);
});

test("buildRetiredTombstoneSlugs returns empty array when no 410 routes", () => {
  const manifest = makeManifest([{ slug: "/old-service", status: 301, to: "/leistungen" }]);
  expect(buildRetiredTombstoneSlugs(manifest)).toEqual([]);
});

test("buildRetiredTombstoneSlugs returns empty array for empty retiredRoutes", () => {
  const manifest = makeManifest([]);
  expect(buildRetiredTombstoneSlugs(manifest)).toEqual([]);
});

test("buildRetiredTombstoneSlugs strips leading/trailing slashes", () => {
  const manifest = makeManifest([{ slug: "//widerruf/", status: 410 }]);
  expect(buildRetiredTombstoneSlugs(manifest)).toEqual(["widerruf"]);
});
