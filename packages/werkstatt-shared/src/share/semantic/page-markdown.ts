/*
<MODULE_CONTRACT>
<purpose>RFC-0377: pure per-page Markdown projector. Turns a SemanticPageModel into a clean,
agent-structured Markdown document with a predictable section hierarchy (Summary, Business context,
Data / APIs, User flows, Constraints) plus optional People, Initiatives, and FAQ. Framework-agnostic
— no DOM, no fetch, no HTML scraping.</purpose>
<non-goals>
  <item>Do not convert HTML — content is already structured. HTML→Markdown (CMS richText) lives
        in the content-source adapter, never here.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0166: initial implementation — build-time per-page Markdown twin.</item>
  <item>RFC-0372: buildPageMarkdown now renders from unified page.blocks instead of answerBlocks + contentBlocks.</item>
  <item>RFC-0377: restructured body into standardized sections (Summary, Business context, Data / APIs, User flows, Constraints) with heuristic block classification.</item>
</CHANGE_SUMMARY>
*/

import {
  canonicalizeGeneratedMarkdownText,
  formatGeneratedMarkdownListItem,
} from "./markdown-hygiene.ts";
import type { SemanticBlock, SemanticPageModel } from "./models.ts";

type SectionKind = "summary" | "business-context" | "data-apis" | "user-flows" | "constraints";

function clean(page: SemanticPageModel, text: string | undefined): string {
  const baseUrl = (() => {
    try {
      return new URL(page.url).origin;
    } catch {
      return undefined;
    }
  })();
  return canonicalizeGeneratedMarkdownText(text, {
    baseUrl,
    defaultLanguage: page.defaultLanguage,
  });
}

function blockHasContent(block: SemanticBlock): boolean {
  return Boolean(
    block.heading || block.summary || block.body || block.facts?.length || block.items?.length,
  );
}

function classifyBlock(block: SemanticBlock): Exclude<SectionKind, "summary"> {
  const heading = block.heading.toLowerCase();
  const blockType = (block.blockType ?? "").toLowerCase();

  const constraintTokens = [
    "legal",
    "recht",
    "datenschutz",
    "privacy",
    "impressum",
    "terms",
    "conditions",
    "constraints",
    "pflicht",
    "liability",
    "haftung",
  ];
  if (constraintTokens.some((token) => heading.includes(token) || blockType.includes(token))) {
    return "constraints";
  }

  const flowTokens = [
    "flow",
    "how it works",
    "so funktioniert",
    "steps",
    "schritte",
    "process",
    "ablauf",
    "cta",
    "call-to-action",
  ];
  if (
    flowTokens.some((token) => heading.includes(token) || blockType.includes(token)) ||
    blockType.includes("hero-decision-card")
  ) {
    return "user-flows";
  }

  if (block.facts?.length || block.items?.length) {
    return "data-apis";
  }

  return "business-context";
}

function extractSummaryText(page: SemanticPageModel): string | undefined {
  if (page.lead) return page.lead;
  if (page.description) return page.description;
  for (const block of page.blocks) {
    if (block.summary) return block.summary;
    if (block.body) return block.body;
  }
  return undefined;
}

function renderBlock(page: SemanticPageModel, block: SemanticBlock, depth = 3): string[] {
  const lines: string[] = [];
  const prefix = "#".repeat(depth);

  if (block.heading) {
    lines.push(`${prefix} ${block.heading}`);
  }
  if (block.summary) {
    lines.push("");
    lines.push(clean(page, block.summary));
  }
  if (block.body) {
    lines.push("");
    lines.push(clean(page, block.body));
  }
  if (block.facts?.length) {
    lines.push("");
    for (const fact of block.facts) {
      lines.push(...formatGeneratedMarkdownListItem(clean(page, fact)));
    }
  }
  if (block.items?.length) {
    lines.push("");
    for (const item of block.items) {
      lines.push(`${"#".repeat(depth + 1)} ${item.title}`);
      if (item.description) {
        lines.push("");
        lines.push(clean(page, item.description));
      }
      lines.push("");
    }
  }

  return lines;
}

function renderSection(
  page: SemanticPageModel,
  heading: string,
  blocks: SemanticBlock[],
): string[] {
  const lines: string[] = ["", `## ${heading}`, ""];
  for (const block of blocks) {
    lines.push(...renderBlock(page, block));
  }
  return lines;
}

export function buildPageMarkdown(page: SemanticPageModel): string {
  const lines: string[] = [];

  lines.push(`# ${page.title}`);
  lines.push("");

  // RFC-0377: Summary section is required. Fallback chain: lead → description → first block summary → first block body.
  const summaryText = extractSummaryText(page);
  if (summaryText) {
    lines.push("## Summary");
    lines.push("");
    lines.push(clean(page, summaryText));
  }

  // RFC-0320: the old relative `Source: /path` footer is retired.
  // Provenance now lives in YAML frontmatter added by the generator.

  // RFC-0377: classify blocks into standardized sections.
  const businessContext: SemanticBlock[] = [];
  const dataApis: SemanticBlock[] = [];
  const userFlows: SemanticBlock[] = [];
  const constraints: SemanticBlock[] = [];

  for (const block of page.blocks) {
    if (!blockHasContent(block)) continue;
    const section = classifyBlock(block);
    if (section === "business-context") businessContext.push(block);
    if (section === "data-apis") dataApis.push(block);
    if (section === "user-flows") userFlows.push(block);
    if (section === "constraints") constraints.push(block);
  }

  lines.push(...renderSection(page, "Business context", businessContext));
  lines.push(...renderSection(page, "Data / APIs", dataApis));
  lines.push(...renderSection(page, "User flows", userFlows));
  lines.push(...renderSection(page, "Constraints", constraints));

  if (page.people?.length) {
    lines.push("");
    lines.push("## People");
    for (const person of page.people) {
      lines.push("");
      lines.push(`### ${person.name}`);
      if (person.role) {
        lines.push(`**${person.role}**`);
      }
      if (person.affiliations?.length) {
        lines.push(`*${person.affiliations.join(", ")}*`);
      }
      if (person.description) {
        lines.push("");
        lines.push(clean(page, person.description));
      }
    }
    lines.push("");
  }

  if (page.initiatives?.length) {
    lines.push("");
    lines.push("## Initiatives");
    for (const initiative of page.initiatives) {
      const facts = initiative.facts?.length ? ` (${initiative.facts.join("; ")})` : "";
      lines.push(`- ${initiative.name}: ${initiative.summary}${facts}`);
    }
    lines.push("");
  }

  if (page.faqEntries?.length) {
    lines.push("");
    lines.push("## FAQ");
    for (const entry of page.faqEntries) {
      lines.push("");
      lines.push(`### ${entry.question}`);
      lines.push("");
      lines.push(clean(page, entry.answer));
    }
    lines.push("");
  }

  return `${lines
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()}\n`;
}
