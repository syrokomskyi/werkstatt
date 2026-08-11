/*
<MODULE_CONTRACT>
<purpose>
  Shared deterministic diagnostic collectors for the check-warpgogol ecosystem.
  Both the OS command layer and the runner service import these collectors
  to avoid pipeline duplication.
</purpose>
<non-goals>
  <item>Do not collect audience-specific diagnostics here; those require an AudienceProfile and live in the command layer.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Extracted from site-kernel-check-warpgogol/commands/helpers.ts to eliminate pipeline duplication between OS commands and runner service.</item>
</CHANGE_SUMMARY>
*/

import type { Diagnostic } from "@warpgogol/werkstatt/kernel";
import type { SiteEvidenceGraph, PageEvidence } from "./evidence.ts";

export function makeDiagnostic(
  ruleId: string,
  severity: Diagnostic["severity"],
  message: string,
  url: string,
  fixHint: string,
): Diagnostic {
  return { ruleId, severity, message, fixHint, data: { url } };
}

export interface DiagnosticRule {
  readonly ruleId: string;
  collect(page: PageEvidence): Diagnostic[];
}

const technicalRules: DiagnosticRule[] = [
  {
    ruleId: "CW-TECH-01",
    collect(page) {
      return page.title
        ? []
        : [
            makeDiagnostic(
              "CW-TECH-01",
              "error",
              "Page has no document title.",
              page.url,
              "Add a localized, audience-facing title.",
            ),
          ];
    },
  },
  {
    ruleId: "CW-TECH-02",
    collect(page) {
      return page.metaDescription
        ? []
        : [
            makeDiagnostic(
              "CW-TECH-02",
              "warning",
              "Page has no meta description.",
              page.url,
              "Add a concise localized meta description.",
            ),
          ];
    },
  },
  {
    ruleId: "CW-TECH-03",
    collect(page) {
      return page.canonical
        ? []
        : [
            makeDiagnostic(
              "CW-TECH-03",
              "warning",
              "Page has no canonical link.",
              page.url,
              "Add a canonical URL for the rendered page.",
            ),
          ];
    },
  },
];

const localizationRules: DiagnosticRule[] = [
  {
    ruleId: "CW-L10N-01",
    collect(page) {
      return page.lang
        ? []
        : [
            makeDiagnostic(
              "CW-L10N-01",
              "error",
              "Page html element has no lang attribute.",
              page.url,
              "Render the current locale into <html lang>.",
            ),
          ];
    },
  },
];

const accessibilityRules: DiagnosticRule[] = [
  {
    ruleId: "CW-A11Y-01",
    collect(page) {
      const h1Count = page.sections.filter(
        (section) => section.heading && section.index === 0,
      ).length;
      return h1Count === 0
        ? [
            makeDiagnostic(
              "CW-A11Y-01",
              "warning",
              "Page evidence has no first-section heading.",
              page.url,
              "Ensure the first meaningful section has a visible heading.",
            ),
          ]
        : [];
    },
  },
];

const contentSurfaceRules: DiagnosticRule[] = [
  {
    ruleId: "CW-CONTENT-01",
    collect(page) {
      return page.text.length < 120
        ? [
            makeDiagnostic(
              "CW-CONTENT-01",
              "warning",
              "Page has very little rendered text.",
              page.url,
              "Add enough concrete copy for visitors to understand the offer.",
            ),
          ]
        : [];
    },
  },
  {
    ruleId: "CW-CONTENT-02",
    collect(page) {
      return page.sections
        .filter((section) => section.text.length < 20)
        .map((section) => ({
          ...makeDiagnostic(
            "CW-CONTENT-02",
            "warning",
            "Section has very little rendered text.",
            page.url,
            "Expand or remove this thin section.",
          ),
          data: { url: page.url, sectionId: section.id },
        }));
    },
  },
];

const agentRules: DiagnosticRule[] = [
  {
    ruleId: "CW-AGENT-01",
    collect(page) {
      return page.agentFeatures.webmcpRegisterTool
        ? []
        : [
            makeDiagnostic(
              "CW-AGENT-01",
              "warning",
              "Page does not register WebMCP tools via document.modelContext.registerTool.",
              page.url,
              "Ensure the agent-webmcp-script.astro component is included in the layout and agentSurfaceManifest is passed.",
            ),
          ];
    },
  },
  {
    ruleId: "CW-AGENT-02",
    collect(page) {
      return page.agentFeatures.agentManifestLink
        ? []
        : [
            makeDiagnostic(
              "CW-AGENT-02",
              "warning",
              "Page does not advertise an agent.json manifest link in <head>.",
              page.url,
              "Add a <link rel='alternate' type='application/json' href='/.well-known/agent.json'> to the page <head>.",
            ),
          ];
    },
  },
  {
    ruleId: "CW-AGENT-03",
    collect(page) {
      return page.agentFeatures.llmsTxtLink
        ? []
        : [
            makeDiagnostic(
              "CW-AGENT-03",
              "warning",
              "Page does not link to /llms.txt in <head>.",
              page.url,
              "Add a <link href='/llms.txt'> to the page <head>.",
            ),
          ];
    },
  },
];

const ALL_RULES = [
  ...technicalRules,
  ...localizationRules,
  ...accessibilityRules,
  ...contentSurfaceRules,
  ...agentRules,
];

export function collectTechnicalDiagnostics(graph: SiteEvidenceGraph): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  for (const page of graph.pages) {
    for (const rule of technicalRules) {
      diagnostics.push(...rule.collect(page));
    }
  }
  return diagnostics;
}

export function collectLocalizationDiagnostics(graph: SiteEvidenceGraph): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  for (const page of graph.pages) {
    for (const rule of localizationRules) {
      diagnostics.push(...rule.collect(page));
    }
  }
  return diagnostics;
}

export function collectAccessibilityDiagnostics(graph: SiteEvidenceGraph): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  for (const page of graph.pages) {
    for (const rule of accessibilityRules) {
      diagnostics.push(...rule.collect(page));
    }
  }
  return diagnostics;
}

export function collectContentSurfaceDiagnostics(graph: SiteEvidenceGraph): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  for (const page of graph.pages) {
    for (const rule of contentSurfaceRules) {
      diagnostics.push(...rule.collect(page));
    }
  }
  return diagnostics;
}

export function collectAgentDiagnostics(graph: SiteEvidenceGraph): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  for (const page of graph.pages) {
    for (const rule of agentRules) {
      diagnostics.push(...rule.collect(page));
    }
  }
  return diagnostics;
}

export function collectDeterministicDiagnostics(graph: SiteEvidenceGraph): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  for (const page of graph.pages) {
    for (const rule of ALL_RULES) {
      diagnostics.push(...rule.collect(page));
    }
  }
  return diagnostics;
}

export function containsSecretLikeText(text: string): boolean {
  return /sk-[A-Za-z0-9_-]{20,}/.test(text) || /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+/.test(text);
}
