/*
<MODULE_CONTRACT>
<purpose>Normalize generated Markdown fragments before they enter public text artifacts.</purpose>
<non-goals>
  <item>Do not parse or reformat arbitrary Markdown documents.</item>
  <item>Do not mutate source content records.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0316: Added public text artifact Markdown hygiene helpers.</item>
</CHANGE_SUMMARY>
*/

function normalizeLine(line: string): string {
  return line
    .replace(/^- ---\s*$/, "---")
    .replace(/^- -\s+/, "- ")
    .replace(/^- (#{1,6})\s+/, "$1 ")
    .replace(/^- (\d+\.)\s+/, "$1 ");
}

export function normalizeGeneratedMarkdownText(text: string | undefined): string {
  if (!text) return "";
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/\b(20\d{2})\/(\d{1,2})\/(\d{1,2})\b/g, (_match, year, month, day) => {
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    })
    .split("\n")
    .map(normalizeLine)
    .join("\n")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function canonicalizeGeneratedMarkdownText(
  text: string | undefined,
  options: { baseUrl?: string; defaultLanguage?: string } = {},
): string {
  let normalized = normalizeGeneratedMarkdownText(text);
  const { baseUrl, defaultLanguage } = options;
  if (baseUrl && defaultLanguage) {
    const base = baseUrl.replace(/\/+$/, "");
    normalized = normalized.replace(
      new RegExp(`${escapeRegExp(base)}/${escapeRegExp(defaultLanguage)}(?=/)`, "g"),
      base,
    );
  }
  return normalized;
}

function looksLikeMarkdownBlock(text: string): boolean {
  return text.includes("\n") || /^(#{1,6}\s+|[-*]\s+|\d+\.\s+|---$|>\s+)/.test(text.trim());
}

export function formatGeneratedMarkdownListItem(text: string): string[] {
  const normalized = normalizeGeneratedMarkdownText(text);
  if (!normalized) return [];
  if (looksLikeMarkdownBlock(normalized)) {
    return normalized.split("\n");
  }
  return [`- ${normalized}`];
}
