/*
<MODULE_CONTRACT>
<purpose>
  Shared deterministic diagnostic collectors for the check-webgogol ecosystem.
  Both the OS command layer and the runner service import these collectors
  to avoid pipeline duplication.
</purpose>
<non-goals>
  <item>Do not collect audience-specific diagnostics here; those require an AudienceProfile and live in the command layer.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Extracted from site-kernel-check-webgogol/commands/helpers.ts to eliminate pipeline duplication between OS commands and runner service.</item>
</CHANGE_SUMMARY>
*/

import type { Diagnostic } from "@gogol/site-kernel";
import type { SiteEvidenceGraph } from "./evidence.ts";

export function makeDiagnostic(
  ruleId: string,
  severity: Diagnostic["severity"],
  message: string,
  url: string,
  fixHint: string,
): Diagnostic {
  return { ruleId, severity, message, fixHint, data: { url } };
}

export function collectTechnicalDiagnostics(graph: SiteEvidenceGraph): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  for (const page of graph.pages) {
    if (!page.title) {
      diagnostics.push(
        makeDiagnostic(
          "CW-TECH-01",
          "error",
          "Page has no document title.",
          page.url,
          "Add a localized, audience-facing title.",
        ),
      );
    }
    if (!page.metaDescription) {
      diagnostics.push(
        makeDiagnostic(
          "CW-TECH-02",
          "warning",
          "Page has no meta description.",
          page.url,
          "Add a concise localized meta description.",
        ),
      );
    }
    if (!page.canonical) {
      diagnostics.push(
        makeDiagnostic(
          "CW-TECH-03",
          "warning",
          "Page has no canonical link.",
          page.url,
          "Add a canonical URL for the rendered page.",
        ),
      );
    }
  }
  return diagnostics;
}

export function collectLocalizationDiagnostics(graph: SiteEvidenceGraph): Diagnostic[] {
  return graph.pages
    .filter((page) => !page.lang)
    .map((page) =>
      makeDiagnostic(
        "CW-L10N-01",
        "error",
        "Page html element has no lang attribute.",
        page.url,
        "Render the current locale into <html lang>.",
      ),
    );
}

export function collectAccessibilityDiagnostics(graph: SiteEvidenceGraph): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  for (const page of graph.pages) {
    const h1Count = page.sections.filter(
      (section) => section.heading && section.index === 0,
    ).length;
    if (h1Count === 0) {
      diagnostics.push(
        makeDiagnostic(
          "CW-A11Y-01",
          "warning",
          "Page evidence has no first-section heading.",
          page.url,
          "Ensure the first meaningful section has a visible heading.",
        ),
      );
    }
  }
  return diagnostics;
}

export function collectContentSurfaceDiagnostics(graph: SiteEvidenceGraph): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  for (const page of graph.pages) {
    if (page.text.length < 120) {
      diagnostics.push(
        makeDiagnostic(
          "CW-CONTENT-01",
          "warning",
          "Page has very little rendered text.",
          page.url,
          "Add enough concrete copy for visitors to understand the offer.",
        ),
      );
    }
    for (const section of page.sections) {
      if (section.text.length < 20) {
        diagnostics.push({
          ...makeDiagnostic(
            "CW-CONTENT-02",
            "warning",
            "Section has very little rendered text.",
            page.url,
            "Expand or remove this thin section.",
          ),
          data: { url: page.url, sectionId: section.id },
        });
      }
    }
  }
  return diagnostics;
}

export function collectDeterministicDiagnostics(graph: SiteEvidenceGraph): Diagnostic[] {
  return [
    ...collectTechnicalDiagnostics(graph),
    ...collectLocalizationDiagnostics(graph),
    ...collectAccessibilityDiagnostics(graph),
    ...collectContentSurfaceDiagnostics(graph),
  ];
}

export function containsSecretLikeText(text: string): boolean {
  return /sk-[A-Za-z0-9_-]{20,}/.test(text) || /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+/.test(text);
}
