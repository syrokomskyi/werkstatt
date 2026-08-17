/*
<MODULE_CONTRACT>
<purpose>
  [RFC-0195] Dual SEO + GEO projection for the Programmatic Surface. Renders a baked page into a
  clean Markdown twin (the AI-readable artifact, RFC-0184) and decides per-entry GEO inclusion.
  The same dataset × axes that target Google long-tail also feed generative answer engines, with
  no separate authoring. Suppressed (noindex / non-live) pages are excluded by the caller. Pure.
</purpose>
<non-goals>
  <item>Do not write files or read the network (the kernel command does I/O).</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0195: initial GEO projection.</item>
  <item>Architecture review 2026-07-10: extract blockTwinRegistry so each block type has a registered twin renderer instead of pattern-matching on prop shapes in renderTwin.</item>
</CHANGE_SUMMARY>
*/

import type { PageEntry } from "./types.ts";
import type { VirtualRouteEntry } from "./types.ts";

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

/** A twin renderer for one block type: takes the block's props and returns Markdown lines. */
export type BlockTwinRenderer = (props: Record<string, unknown>) => string[];

const heroTwinRenderer: BlockTwinRenderer = (props) => {
  const header = props.header as Record<string, unknown> | undefined;
  const heading = str(props.heading) ?? str(header?.heading);
  const lead = str(props.lead) ?? str(props.description) ?? str(props.tagline);
  const lines: string[] = [];
  if (heading) lines.push(`## ${heading}`);
  if (lead) lines.push("", lead);
  return lines;
};

const markdownTwinRenderer: BlockTwinRenderer = (props) => {
  const heading = str(props.heading);
  const lead = str(props.lead) ?? str(props.description) ?? str(props.tagline);
  const lines: string[] = [];
  if (heading) lines.push(`## ${heading}`);
  if (lead) lines.push("", lead);
  return lines;
};

const cardGridTwinRenderer: BlockTwinRenderer = (props) => {
  const heading = str(props.heading);
  const cards = (props.body as { cards?: Array<Record<string, unknown>> } | undefined)?.cards;
  const lines: string[] = [];
  if (heading) lines.push(`## ${heading}`);
  for (const card of cards ?? []) {
    const title = str(card.title);
    const description = str(card.description);
    if (title || description) {
      lines.push(
        "",
        title ? `- **${title}**${description ? `: ${description}` : ""}` : `- ${description}`,
      );
    }
  }
  return lines;
};

const linkedCardGridTwinRenderer: BlockTwinRenderer = (props) => {
  const heading = str(props.heading);
  const cards =
    (props.cards as Array<Record<string, unknown>> | undefined) ??
    (props.body as { cards?: Array<Record<string, unknown>> } | undefined)?.cards;
  const lines: string[] = [];
  if (heading) lines.push(`## ${heading}`);
  for (const card of cards ?? []) {
    const title = str(card.title);
    const description = str(card.description);
    if (title || description) {
      lines.push(
        "",
        title ? `- **${title}**${description ? `: ${description}` : ""}` : `- ${description}`,
      );
    }
  }
  return lines;
};

const listCardsTwinRenderer: BlockTwinRenderer = (props) => {
  const heading = str(props.heading);
  const items =
    (props.items as Array<Record<string, unknown>> | undefined) ??
    (props.body as { items?: Array<Record<string, unknown>> } | undefined)?.items;
  const lines: string[] = [];
  if (heading) lines.push(`## ${heading}`);
  for (const item of items ?? []) {
    const title = str(item.title);
    const description = str(item.description) ?? str(item.body);
    if (title || description) {
      lines.push(
        "",
        title ? `- **${title}**${description ? `: ${description}` : ""}` : `- ${description}`,
      );
    }
  }
  return lines;
};

const ctaTwinRenderer: BlockTwinRenderer = (props) => {
  const heading = str(props.heading);
  const lines: string[] = [];
  if (heading) lines.push(`## ${heading}`);
  return lines;
};

const blockTwinRegistry: Readonly<Record<string, BlockTwinRenderer>> = {
  hero: heroTwinRenderer,
  markdown: markdownTwinRenderer,
  "card-grid": cardGridTwinRenderer,
  "linked-card-grid": linkedCardGridTwinRenderer,
  "list-cards": listCardsTwinRenderer,
  cta: ctaTwinRenderer,
};

/** Fallback: extract any visible string-valued props as bullet lines. */
function fallbackTwinRenderer(props: Record<string, unknown>): string[] {
  const lines: string[] = [];
  const heading = str(props.heading);
  if (heading) lines.push(`## ${heading}`);
  const lead = str(props.lead) ?? str(props.description);
  if (lead) lines.push("", lead);
  return lines;
}

/**
 * Render a baked page into a Markdown twin. Each block type has a registered twin renderer in
 * {@link blockTwinRegistry}; unknown block types fall back to a generic visible-text extractor so
 * they are never silently dropped. New block types register a renderer instead of patching this
 * function.
 */
export function renderTwin(page: PageEntry, pathname: string): string {
  const lines: string[] = [];
  lines.push(`# ${page.title}`);
  lines.push("");
  if (page.description) {
    lines.push(page.description);
    lines.push("");
  }
  lines.push(`Source: ${pathname}`);
  lines.push("");
  for (const block of page.blocks) {
    const props = (block.props ?? {}) as Record<string, unknown>;
    const renderer = blockTwinRegistry[block.type ?? ""] ?? fallbackTwinRenderer;
    const blockLines = renderer(props);
    if (blockLines.length > 0) {
      lines.push(...blockLines);
      lines.push("");
    }
  }
  return lines.join("\n");
}

/** A live, non-suppressed entry whose GEO depth is full or twin-only gets a Markdown twin. */
export function includeInTwins(entry: VirtualRouteEntry): boolean {
  if (!entry.indexable || entry.noindex || !entry.page) return false;
  return entry.geo !== "off";
}

/** A live, non-suppressed entry whose GEO depth is full contributes to llms.txt. */
export function includeInLlms(entry: VirtualRouteEntry): boolean {
  if (!entry.indexable || entry.noindex) return false;
  return entry.geo === "full";
}
