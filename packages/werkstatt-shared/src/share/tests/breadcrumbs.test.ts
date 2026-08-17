/*
<MODULE_CONTRACT>
<purpose>[RFC-0229] Unit tests for the canonical breadcrumb trail builder: ordering (Home → ancestors
  → self), dedupe against Home/self, site-name stripping, empty-ancestor flat trail, and the resolver
  seam contract.</purpose>
<keywords>breadcrumb, trail, test, RFC-0229</keywords>
</MODULE_CONTRACT>
*/

import { test, expect } from "vitest";
import {
  buildBreadcrumbTrail,
  stripSiteNameFromTitle,
  surfaceAncestorPageIds,
  type BreadcrumbAncestorResolver,
  type BreadcrumbCrumb,
} from "../semantic/breadcrumbs.ts";

const HOME = "https://example.com/";
const SELF = "https://example.com/website/schreiner/muenchen/";

function resolverWith(ancestors: BreadcrumbCrumb[]): BreadcrumbAncestorResolver {
  return { resolveAncestors: async () => ancestors };
}

test("flat trail when there are no ancestors: Home → self", async () => {
  const trail = await buildBreadcrumbTrail({
    pageId: "impressum",
    pageTitle: "Impressum | Warpgogol",
    selfUrl: "https://example.com/impressum/",
    homeLabel: "Startseite",
    homeUrl: HOME,
    lang: "de",
    defaultLang: "de",
    resolver: resolverWith([]),
  });
  expect(trail.map((c) => c.name)).toEqual(["Startseite", "Impressum"]);
  expect(trail[1]!.url).toBe("https://example.com/impressum/");
});

test("multi-level trail: Home → ancestors (root-first) → self, site name stripped", async () => {
  const trail = await buildBreadcrumbTrail({
    pageId: "website-local:schreiner:muenchen",
    pageTitle: "Schreiner-Website in München | Warpgogol",
    selfUrl: SELF,
    homeLabel: "Startseite",
    homeUrl: HOME,
    lang: "de",
    defaultLang: "de",
    resolver: resolverWith([
      { name: "Website erstellen lassen", url: "https://example.com/website/" },
      { name: "Schreiner-Websites", url: "https://example.com/website/schreiner/" },
    ]),
  });
  expect(trail.map((c) => c.name)).toEqual([
    "Startseite",
    "Website erstellen lassen",
    "Schreiner-Websites",
    "Schreiner-Website in München",
  ]);
  expect(trail[trail.length - 1]!.url).toBe(SELF);
});

test("ancestors collapsing onto Home or self are dropped", async () => {
  const trail = await buildBreadcrumbTrail({
    pageId: "p",
    pageTitle: "Self",
    selfUrl: SELF,
    homeLabel: "Home",
    homeUrl: HOME,
    lang: "de",
    defaultLang: "de",
    resolver: resolverWith([
      { name: "Home dup", url: "https://example.com" }, // == Home after trailing-slash normalize
      { name: "Mid", url: "https://example.com/website/" },
      { name: "Self dup", url: SELF.replace(/\/$/, "") }, // == self after normalize
    ]),
  });
  expect(trail.map((c) => c.name)).toEqual(["Home", "Mid", "Self"]);
});

test("repeated ancestor URLs are deduped, blank names skipped", async () => {
  const trail = await buildBreadcrumbTrail({
    pageId: "p",
    pageTitle: "Self",
    selfUrl: SELF,
    homeLabel: "Home",
    homeUrl: HOME,
    lang: "de",
    defaultLang: "de",
    resolver: resolverWith([
      { name: "A", url: "https://example.com/a/" },
      { name: "A again", url: "https://example.com/a" }, // same after normalize → dropped
      { name: "   ", url: "https://example.com/b/" }, // blank name → dropped
    ]),
  });
  expect(trail.map((c) => c.name)).toEqual(["Home", "A", "Self"]);
});

test("stripSiteNameFromTitle trims a ' | Site' suffix only", () => {
  expect(stripSiteNameFromTitle("Page | Site")).toBe("Page");
  expect(stripSiteNameFromTitle("Just A Page")).toBe("Just A Page");
  expect(stripSiteNameFromTitle("A | B | Site")).toBe("A | B");
});

test("surfaceAncestorPageIds derives the depth chain (root-first, excludes self)", () => {
  // depth-2 page → [root, depth-1]
  expect(surfaceAncestorPageIds("website-local:elektriker:heidelberg")).toEqual([
    "website-local:_root",
    "website-local:elektriker",
  ]);
  // depth-3 page → [root, depth-1, depth-2]
  expect(surfaceAncestorPageIds("website-service:elektriker:leistung:wallbox")).toEqual([
    "website-service:_root",
    "website-service:elektriker",
    "website-service:elektriker:leistung",
  ]);
  // depth-1 page → [root]
  expect(surfaceAncestorPageIds("website-local:elektriker")).toEqual(["website-local:_root"]);
});

test("surfaceAncestorPageIds returns [] for the root landing and non-surface ids", () => {
  expect(surfaceAncestorPageIds("website-local:_root")).toEqual([]);
  expect(surfaceAncestorPageIds("impressum")).toEqual([]); // authored pageId, no colon
  expect(surfaceAncestorPageIds("")).toEqual([]);
});
