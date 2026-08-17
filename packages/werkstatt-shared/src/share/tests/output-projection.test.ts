/*
<MODULE_CONTRACT>
<purpose>Unit tests for RFC-0143 / RFC-0328 per-page output projection resolution.</purpose>
<keywords>output projection, sitemap, llms, robots, legal, test, RFC-0328</keywords>
</MODULE_CONTRACT>
*/

import { test, expect } from "vitest";
import { resolvePageOutput } from "../semantic/output-projection.ts";

test("content defaults apply when no semanticType is given", () => {
  const result = resolvePageOutput(undefined, {});
  expect(result.sitemap.category).toBe("content");
  expect(result.sitemap.include).toBe(true);
  expect(result.sitemap.includeLastmod).toBe(true);
  expect(result.llms.depth).toBe("full");
  expect(result.robots.index).toBe(true);
  expect(result.robots.follow).toBe(true);
});

test("legal semanticType sets legal defaults", () => {
  const result = resolvePageOutput(undefined, { semanticType: "legal" });
  expect(result.sitemap.category).toBe("legal");
  expect(result.sitemap.include).toBe(true);
  expect(result.sitemap.includeLastmod).toBe(true);
  expect(result.llms.depth).toBe("exclude");
  expect(result.robots.index).toBe(true);
  expect(result.robots.follow).toBe(true);
});

test("legal defaults are overridable by explicit output", () => {
  const result = resolvePageOutput(
    {
      sitemap: { category: "content", include: false },
      llms: "full",
      robots: { index: false, follow: false },
    },
    { semanticType: "legal" },
  );
  expect(result.sitemap.category).toBe("content");
  expect(result.sitemap.include).toBe(false);
  expect(result.llms.depth).toBe("full");
  expect(result.robots.index).toBe(false);
  expect(result.robots.follow).toBe(false);
});

test("legal sitemap lastmod preserves explicit value", () => {
  const result = resolvePageOutput(
    { sitemap: { lastmod: "2026-05-14" } },
    { semanticType: "legal" },
  );
  expect(result.sitemap.category).toBe("legal");
  expect(result.sitemap.lastmod).toBe("2026-05-14");
  expect(result.sitemap.includeLastmod).toBe(true);
});

test("openSource keeps its own default and does not get legal defaults", () => {
  const result = resolvePageOutput(undefined, { semanticType: "openSource" });
  expect(result.sitemap.category).toBe("content");
  expect(result.llms.depth).toBe("index-only");
});
