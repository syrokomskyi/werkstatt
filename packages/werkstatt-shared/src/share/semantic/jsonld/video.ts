/*
<MODULE_CONTRACT>
<purpose>RFC-0912: builds VideoObject JSON-LD nodes from SemanticBlock.video data for opted-in content videos. Reads variant-manifest-derived data populated by buildSemanticPageModelWith.</purpose>
<non-goals>
  <item>Do not read the variant manifest directly — buildSemanticPageModelWith populates SemanticBlock.video before buildJsonLd runs.</item>
  <item>Do not emit VideoObject for blocks without the seo.videoObject opt-in.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0912: initial implementation.</item>
</CHANGE_SUMMARY>
*/

import type { JsonLdContext } from "./context.ts";
import type { JsonLdNode } from "./types.ts";

function formatDuration(seconds: number): string {
  const totalSec = Math.round(seconds);
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  const parts = ["PT"];
  if (hours > 0) parts.push(`${hours}H`);
  if (minutes > 0) parts.push(`${minutes}M`);
  parts.push(`${secs}S`);
  return parts.join("");
}

export function buildVideoObjectNodes(context: JsonLdContext): JsonLdNode[] {
  const { page, webpageId } = context;
  const nodes: JsonLdNode[] = [];

  for (const block of page.blocks) {
    if (!block.video) continue;

    const { seo, manifest } = block.video;
    const nodeId = `${webpageId.replace("#/schema/webpage", "#/schema/video")}/${block.id}`;

    const node: JsonLdNode = {
      "@type": "VideoObject",
      "@id": nodeId,
      name: seo.name,
      description: seo.description,
      uploadDate: seo.uploadDate,
      thumbnailUrl: manifest.posterUrl,
      contentUrl: manifest.contentUrl,
      ...(manifest.durationSec != null
        ? { duration: formatDuration(manifest.durationSec) }
        : {}),
    };

    nodes.push(node);
  }

  return nodes;
}
