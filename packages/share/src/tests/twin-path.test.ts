/*
<MODULE_CONTRACT>
<purpose>Unit tests for RFC-0306 Markdown twin path helpers.</purpose>
<keywords>markdown twin, path helper, RFC-0306</keywords>
<responsibilities>
  <item>Lock root, language-root, nested, trailing-slash, and non-language slug behavior.</item>
</responsibilities>
<non-goals>
  <item>Do not inspect generated app files.</item>
</non-goals>
</MODULE_CONTRACT>
<MODULE_MAP>
  <entry key="tests">node:test assertions for markdownTwinRelPath and markdownTwinUrlPath.</entry>
</MODULE_MAP>
<CHANGE_SUMMARY>
  <item>RFC-0306: Added Markdown twin path helper coverage.</item>
</CHANGE_SUMMARY>
*/

import { test, expect } from "vitest";
import { markdownTwinRelPath, markdownTwinUrlPath } from "../semantic/ids.ts";

const supportedLangs = ["de", "en"] as const;

test("markdownTwinRelPath keeps root and language roots at index.md", () => {
  expect(markdownTwinRelPath("/", { supportedLangs })).toBe("index.md");
  expect(markdownTwinRelPath("/en", { supportedLangs })).toBe("en/index.md");
  expect(markdownTwinRelPath("/en/", { supportedLangs })).toBe("en/index.md");
});

test("markdownTwinRelPath maps non-home pages to sibling md files", () => {
  expect(markdownTwinRelPath("/team/andrii-syrokomskyi", { supportedLangs })).toBe(
    "team/andrii-syrokomskyi.md",
  );
  expect(markdownTwinRelPath("/en/team/andrii", { supportedLangs })).toBe("en/team/andrii.md");
  expect(markdownTwinRelPath("/it", { supportedLangs })).toBe("it.md");
});

test("markdownTwinUrlPath returns the public URL form", () => {
  expect(markdownTwinUrlPath("/team/andrii-syrokomskyi", { supportedLangs })).toBe(
    "/team/andrii-syrokomskyi.md",
  );
});
