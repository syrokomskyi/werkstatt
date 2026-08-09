import { test, expect } from "vitest";
import type { SystemManifest } from "@warpgogol/werkstatt-site/content";
import { buildCosmicPageMetadata } from "../app-boilerplate-helpers.ts";

/*
<MODULE_CONTRACT>
<purpose>
  Verify RFC-0515 locale-aware cosmic page metadata generation: non-default locales
  use manifest.app as brand (not the German tagline); default locale retains tagline.
</purpose>
<responsibilities>
  <item>Assert non-DE cosmic page metadata does not contain the German tagline string.</item>
  <item>Assert DE cosmic page metadata retains the tagline-derived brand.</item>
  <item>Assert fallback to manifest.app when tagline is absent.</item>
</responsibilities>
<non-goals>
  <item>Do not test file writing or template application — buildCosmicPageMetadata is a pure function.</item>
</non-goals>
</MODULE_CONTRACT>
<MODULE_MAP>
  <entry key="buildCosmicPageMetadata">Locale-aware cosmic page title/description builder (RFC-0515).</entry>
</MODULE_MAP>
<CHANGE_SUMMARY>
  <item>RFC-0515: initial test suite for locale-aware cosmic page metadata generation.</item>
</CHANGE_SUMMARY>
*/

const TAGLINE = "Website, die gefunden wird und Ihrem Betrieb gehört";

function makeManifest(overrides?: Partial<SystemManifest>): SystemManifest {
  return {
    app: "warpgogol-com",
    i18n: {
      default: "de",
      supported: { de: {}, uk: {} },
    },
    identity: {
      tagline: TAGLINE,
      domain: "warpgogol.com",
      biome: "handwerk-material-warm",
    },
    release: {
      passport: { enabled: true },
    },
    ...overrides,
  } as unknown as SystemManifest;
}

test("non-DE cosmic pages do not contain the German tagline", () => {
  const manifest = makeManifest();
  const uk = buildCosmicPageMetadata(manifest, "uk");

  expect(uk.passportTitle).not.toContain(TAGLINE);
  expect(uk.passportDescription).not.toContain(TAGLINE);
  expect(uk.starMapTitle).not.toContain(TAGLINE);
  expect(uk.starMapDescription).not.toContain(TAGLINE);
});

test("non-DE cosmic pages use manifest.app as brand", () => {
  const manifest = makeManifest();
  const uk = buildCosmicPageMetadata(manifest, "uk");

  expect(uk.passportTitle).toContain("warpgogol-com");
  expect(uk.starMapTitle).toContain("warpgogol-com");
});

test("DE cosmic pages retain the tagline-derived brand", () => {
  const manifest = makeManifest();
  const de = buildCosmicPageMetadata(manifest, "de");

  expect(de.passportTitle).toContain(TAGLINE);
  expect(de.passportDescription).toContain(TAGLINE);
  expect(de.starMapTitle).toContain(TAGLINE);
  expect(de.starMapDescription).toContain(TAGLINE);
});

test("falls back to manifest.app when tagline is absent", () => {
  const manifest = makeManifest({
    identity: { domain: "warpgogol.com", biome: "handwerk-material-warm" },
  } as unknown as Partial<SystemManifest>);

  const de = buildCosmicPageMetadata(manifest, "de");
  expect(de.passportTitle).toContain("warpgogol-com");
  expect(de.starMapTitle).toContain("warpgogol-com");
});

test("non-DE and DE metadata differ when tagline is present", () => {
  const manifest = makeManifest();
  const de = buildCosmicPageMetadata(manifest, "de");
  const uk = buildCosmicPageMetadata(manifest, "uk");

  expect(de.passportTitle).not.toBe(uk.passportTitle);
  expect(de.passportDescription).not.toBe(uk.passportDescription);
  expect(de.starMapTitle).not.toBe(uk.starMapTitle);
  expect(de.starMapDescription).not.toBe(uk.starMapDescription);
});
