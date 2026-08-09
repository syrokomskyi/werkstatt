/*
<MODULE_CONTRACT>
<purpose>Fixture coverage for RFC-0316 generated public text hygiene samples.</purpose>
<keywords>public surface, markdown hygiene, RFC-0316, fixtures</keywords>
<responsibilities>
  <item>Lock down audit-sample normalization used by public.surface.lint and generators.</item>
</responsibilities>
<non-goals>
  <item>Do not exercise the full site-kernel command runner.</item>
</non-goals>
</MODULE_CONTRACT>
<MODULE_MAP>
  <entry key="tests">Vitest cases for generated Markdown hygiene helpers.</entry>
</MODULE_MAP>
<CHANGE_SUMMARY>
  <item>RFC-0316: Added fixture tests for recurring public text defects.</item>
</CHANGE_SUMMARY>
*/

import { describe, expect, it } from "vitest";
import {
  canonicalizeGeneratedMarkdownText,
  formatGeneratedMarkdownListItem,
} from "@warpgogol/share/semantic";

describe("RFC-0316 public surface hygiene fixtures", () => {
  it("normalizes default-language same-site URLs, slash dates, and br tags", () => {
    expect(
      canonicalizeGeneratedMarkdownText(
        "Kontakt: https://warpgogol.com/de/kontakt\nStand: 2026/06/01\nPreis<br>pro Monat",
        { baseUrl: "https://warpgogol.com", defaultLanguage: "de" },
      ),
    ).toBe("Kontakt: https://warpgogol.com/kontakt\nStand: 2026-06-01\nPreis\npro Monat");
  });

  it("repairs malformed nested Markdown list artifacts", () => {
    expect(formatGeneratedMarkdownListItem("- ---")).toEqual(["---"]);
    expect(formatGeneratedMarkdownListItem("- - nested")).toEqual(["- nested"]);
    expect(formatGeneratedMarkdownListItem("- ### Heading")).toEqual(["### Heading"]);
  });
});
