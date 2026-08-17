/*
<MODULE_CONTRACT>
<purpose>Parse and stringify Markdown frontmatter using YAML. Extracts frontmatter
data and content from --- delimited blocks. Stack-agnostic utility used by both
engine and site plugin (RFC-0868).</purpose>
<non-goals>
  <item>Do not handle raw Markdown parsing beyond frontmatter extraction.</item>
  <item>Do not manage file I/O or transport mechanisms for Markdown files.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0868: extracted from werkstatt-site/src/content/markdown-frontmatter.ts.</item>
</CHANGE_SUMMARY>
*/

import YAML from "yaml";

export type ParsedFrontmatter = {
  content: string;
  data: Record<string, unknown>;
};

export function parseMarkdownFrontmatter(source: string): ParsedFrontmatter {
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);

  if (!match) {
    return {
      content: source,
      data: {},
    };
  }

  return {
    content: match[2] ?? "",
    data: (YAML.parse(match[1]) ?? {}) as Record<string, unknown>,
  };
}

export function stringifyMarkdownFrontmatter(
  content: string,
  data: Record<string, unknown>,
): string {
  const normalizedContent = content.replace(/^\s+/, "").replace(/\s+$/, "");
  const frontmatter = YAML.stringify(data).trimEnd();
  return `---\n${frontmatter}\n---\n\n${normalizedContent}\n`;
}
