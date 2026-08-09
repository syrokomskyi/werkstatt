/*
<MODULE_CONTRACT>
<purpose>Maintains packages/share/src/semantic/extract.ts as an authored share authored module so agents can evolve it without rediscovering local boundaries.</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0133: backfilled MODULE_MAP and CHANGE_SUMMARY markers for compass.validate compliance.</item>
</CHANGE_SUMMARY>
*/

import type { SemanticPerson, SemanticPostalAddress } from "./models.ts";

export function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "entity"
  );
}

export type MarkdownSection = {
  heading: string;
  body: string;
};

export function splitMarkdownSections(markdown: string, level: 2 | 3 = 2): MarkdownSection[] {
  const normalizedMarkdown = markdown.trim();
  if (!normalizedMarkdown) {
    return [];
  }

  const marker = "#".repeat(level);
  const splitPattern = new RegExp(`\\n(?=${marker}\\s+)`);
  const headingPattern = new RegExp(`^${marker}\\s+`);

  return normalizedMarkdown
    .split(splitPattern)
    .map((section) => section.trim())
    .filter((section) => headingPattern.test(section))
    .map((section) => {
      const [headingLine = "", ...restLines] = section.split("\n");
      return {
        heading: headingLine.replace(headingPattern, "").trim(),
        body: restLines.join("\n").trim(),
      };
    });
}

export function extractParagraphs(markdown: string): string[] {
  return markdown
    .split(/\n\s*\n/)
    .map((part) => normalizeWhitespace(part))
    .filter(Boolean);
}

export function extractListFacts(markdown: string): string[] {
  return markdown
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- ") || /^\d+\.\s+/.test(line))
    .map((line) =>
      line
        .replace(/^-\s+/, "")
        .replace(/^\d+\.\s+/, "")
        .trim(),
    )
    .filter(Boolean);
}

export function extractEmail(markdown: string): string | undefined {
  const match = markdown.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return match?.[0];
}

export function extractPostalAddress(
  markdown: string,
  country: string = "DE",
): SemanticPostalAddress | undefined {
  const match = markdown.match(/([^\n,]+),\s*(\d{5})\s+([^\n]+)/);

  if (!match) {
    return undefined;
  }

  return {
    streetAddress: match[1].trim(),
    postalCode: match[2].trim(),
    addressLocality: match[3].trim(),
    addressCountry: country,
  };
}

export function mergePeople(...groups: Array<SemanticPerson[] | undefined>): SemanticPerson[] {
  const merged = new Map<string, SemanticPerson>();

  for (const group of groups) {
    for (const person of group ?? []) {
      const existing = merged.get(person.name);
      merged.set(person.name, {
        name: person.name,
        role: existing?.role ?? person.role,
        description: existing?.description ?? person.description,
        isDeceased: existing?.isDeceased || person.isDeceased,
      });
    }
  }

  return Array.from(merged.values());
}
