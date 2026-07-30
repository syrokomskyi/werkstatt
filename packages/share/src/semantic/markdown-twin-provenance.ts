/*
<MODULE_CONTRACT>
<purpose>
RFC-0320: portable provenance frontmatter for generated Markdown twins.
Builds YAML frontmatter with canonical URL, language, lastModified, contentHash,
license, generator, and sourceKind. The contentHash is a deterministic sha256
over the normalized Markdown body (excluding frontmatter).
</purpose>
<non-goals>
  <item>Do not hash the frontmatter — only the body is hashed.</item>
  <item>Do not use build date or mtime for lastModified.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0320: initial implementation.</item>
  <item>RFC-0377: extended provenance with MarkdownTwinSemanticMeta, derivation maps, and bumped schema to gogol.markdown-twin@2.</item>
  <item>RFC-0602: allow null lastModified for person-slug twins without source-backed stamps.</item>
</CHANGE_SUMMARY>
*/

import { createHash } from "node:crypto";
import type { SemanticPageType } from "./models.ts";

export interface MarkdownTwinSemanticMeta {
  id: string;
  route: string;
  title: string;
  type: SemanticPageType;
  domain: string;
  audience: string;
  lang: string;
  metaDescription: string;
  priority: number;
  tags: string[];
  agentRoles?: string[];
  visibility?: "public" | "internal" | "experimental";
}

export interface MarkdownTwinProvenance {
  canonical: string;
  language: string;
  lastModified: string | null;
  license: string;
  generator: string;
  sourceKind: string;
  pageId?: string;
  sourceInputs?: string[];
  schema?: string;
  semantic?: MarkdownTwinSemanticMeta;
}

export const AUDIENCE_BY_PAGE_TYPE: Record<SemanticPageType, string> = {
  home: "general",
  about: "general",
  projects: "developer",
  donationContact: "general",
  openSource: "developer",
  content: "general",
  article: "general",
  person: "general",
  participant: "general",
  legal: "business_owner",
  collection: "general",
};

export const PRIORITY_BY_PAGE_TYPE: Record<SemanticPageType, number> = {
  home: 1.0,
  about: 0.6,
  projects: 0.5,
  donationContact: 0.3,
  openSource: 0.4,
  content: 0.7,
  article: 0.8,
  person: 0.3,
  participant: 0.3,
  legal: 0.5,
  collection: 0.8,
};

export const DOMAIN_BY_PAGE_TYPE: Record<SemanticPageType, string> = {
  home: "site",
  about: "site",
  projects: "projects",
  donationContact: "contact",
  openSource: "projects",
  content: "content",
  article: "content",
  person: "team",
  participant: "team",
  legal: "legal",
  collection: "content",
};

const DEFAULT_SCHEMA = "gogol.markdown-twin@2";

/**
 * RFC-0320: Normalize body for hashing.
 * - Line endings to LF
 * - Trim exactly one trailing newline
 */
function normalizeBody(body: string): string {
  const lf = body.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  return `${lf.trimEnd()}\n`;
}

/**
 * RFC-0320: Compute deterministic sha256 hash over normalized body bytes.
 * Returns `sha256:<hex>`.
 */
export function computeContentHash(body: string): string {
  const normalized = normalizeBody(body);
  const hash = createHash("sha256").update(normalized, "utf-8").digest("hex");
  return `sha256:${hash}`;
}

/**
 * RFC-0320: Build YAML frontmatter for a Markdown twin.
 */
function buildYamlListField(name: string, items: string[]): string {
  if (items.length === 0) {
    return `${name}: []`;
  }
  const lines = items.map((item) => `  - "${item}"`).join("\n");
  return `${name}:\n${lines}`;
}

export function buildMarkdownTwinFrontmatter(
  provenance: MarkdownTwinProvenance,
  contentHash: string,
): string {
  const fields: string[] = [
    `canonical: "${provenance.canonical}"`,
    `language: "${provenance.language}"`,
    `lastModified: ${provenance.lastModified === null ? "null" : `"${provenance.lastModified}"`}`,
    `contentHash: "${contentHash}"`,
    `license: "${provenance.license}"`,
    `generator: "${provenance.generator}"`,
    `sourceKind: "${provenance.sourceKind}"`,
  ];

  if (provenance.pageId) {
    fields.push(`pageId: "${provenance.pageId}"`);
  }

  if (provenance.sourceInputs && provenance.sourceInputs.length > 0) {
    fields.push(buildYamlListField("sourceInputs", provenance.sourceInputs));
  }

  if (provenance.semantic) {
    const s = provenance.semantic;
    fields.push(`id: "${s.id}"`);
    fields.push(`route: "${s.route}"`);
    fields.push(`title: "${s.title}"`);
    fields.push(`type: "${s.type}"`);
    fields.push(`domain: "${s.domain}"`);
    fields.push(`audience: "${s.audience}"`);
    fields.push(`lang: "${s.lang}"`);
    fields.push(`metaDescription: "${s.metaDescription}"`);
    fields.push(`priority: ${s.priority}`);
    fields.push(buildYamlListField("tags", s.tags));
    if (s.agentRoles && s.agentRoles.length > 0) {
      fields.push(buildYamlListField("agentRoles", s.agentRoles));
    }
    if (s.visibility) {
      fields.push(`visibility: "${s.visibility}"`);
    }
  }

  fields.push(`schema: "${provenance.schema ?? DEFAULT_SCHEMA}"`);

  return `---\n${fields.join("\n")}\n---\n\n`;
}

/**
 * RFC-0320: Build a complete Markdown twin with frontmatter + body.
 * The contentHash is computed over the normalized body.
 */
export function buildMarkdownTwin(body: string, provenance: MarkdownTwinProvenance): string {
  const normalizedBody = normalizeBody(body);
  const contentHash = computeContentHash(normalizedBody);
  const frontmatter = buildMarkdownTwinFrontmatter(provenance, contentHash);
  return `${frontmatter}${normalizedBody}`;
}

/**
 * RFC-0320: Parse frontmatter from a Markdown twin document.
 * Returns { frontmatter, body } or null if no frontmatter found.
 */
export function parseMarkdownTwinFrontmatter(
  content: string,
): { frontmatter: Record<string, unknown>; body: string } | null {
  if (!content.startsWith("---\n")) return null;
  const endIdx = content.indexOf("\n---\n", 4);
  if (endIdx === -1) return null;
  const yamlBlock = content.slice(4, endIdx);
  // buildMarkdownTwinFrontmatter() closes with "---\n\n" (a blank separator line before the
  // body). Skipping only "\n---\n" leaves that blank line's newline as a stray leading
  // character in `body`, which then hashes differently than the body that was actually
  // written — every twin's contentHash mismatched on validate. Consume the separator too.
  const body = content.slice(endIdx + 5).replace(/^\n/, "");

  const frontmatter: Record<string, unknown> = {};
  let currentKey = "";
  let currentList: string[] | null = null;

  for (const line of yamlBlock.split("\n")) {
    if (line.startsWith("  - ")) {
      if (currentList) {
        currentList.push(line.slice(4).replace(/^["']|["']$/g, ""));
      }
      continue;
    }
    const match = line.match(/^(\w+):\s*(.*)$/);
    if (match) {
      const [, key, value] = match;
      if (value === "") {
        currentKey = key;
        currentList = [];
        frontmatter[key] = currentList;
      } else {
        currentKey = "";
        currentList = null;
        const stripped = value.replace(/^["']|["']$/g, "");
        frontmatter[key] = stripped === "null" ? null : stripped;
      }
    }
  }

  return { frontmatter, body };
}

/**
 * RFC-0320: Verify that the contentHash in frontmatter matches the body.
 */
export function verifyMarkdownTwinHash(content: string): boolean {
  const parsed = parseMarkdownTwinFrontmatter(content);
  if (!parsed) return false;
  const declared = parsed.frontmatter.contentHash;
  if (typeof declared !== "string") return false;
  const actual = computeContentHash(parsed.body);
  return declared === actual;
}
