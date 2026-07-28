/*
<MODULE_CONTRACT>
<purpose>
  SVG renderer for star map — generates deterministic SVG markup from a
  laid-out graph. Extracted from render.ts so the SVG generation logic
  is independently testable and reusable.
</purpose>
<non-goals>
  <item>Do not construct graphs or compute layouts — that stays in render.ts.</item>
  <item>Do not perform file I/O — returns SVG string only.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Architecture review 2026-07-14: extract SVG rendering from render.ts.</item>
</CHANGE_SUMMARY>
*/

import { createHash } from "node:crypto";
import type { StarMapGraph, StarMapNode, NodePosition } from "./types.ts";

const NODE_RADII: Record<StarMapNode["kind"], number> = {
  constellation: 32,
  star: 20,
  planet: 12,
  moon: 7,
};

const NODE_COLORS: Record<StarMapNode["kind"], string> = {
  constellation: "#6366f1",
  star: "#f59e0b",
  planet: "#10b981",
  moon: "#94a3b8",
};

const NODE_LABEL_SIZES: Record<StarMapNode["kind"], number> = {
  constellation: 13,
  star: 11,
  planet: 9,
  moon: 7,
};

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function svgNode(node: StarMapNode, x: number, y: number): string {
  const r = NODE_RADII[node.kind];
  const fill = NODE_COLORS[node.kind];
  const fontSize = NODE_LABEL_SIZES[node.kind];
  const label = node.label.length > 12 ? node.label.slice(0, 11) + "…" : node.label;

  const dataRoute = node.route ? ` data-route="${escapeXml(node.route)}"` : "";
  const dataKind = ` data-kind="${node.kind}"`;
  const dataName = node.cosmicName ? ` data-cosmic-name="${escapeXml(node.cosmicName)}"` : "";

  return [
    `  <g class="star-map-node" role="img" aria-label="${escapeXml(node.label)}"${dataRoute}${dataKind}${dataName}>`,
    `    <circle cx="${x}" cy="${y}" r="${r}" fill="${fill}" opacity="0.9"/>`,
    `    <text x="${x}" y="${y + r + fontSize + 2}" text-anchor="middle" font-family="system-ui,sans-serif" font-size="${fontSize}" fill="#e2e8f0">${escapeXml(label)}</text>`,
    `  </g>`,
  ].join("\n");
}

function svgEdge(fromX: number, fromY: number, toX: number, toY: number): string {
  return `  <line x1="${fromX}" y1="${fromY}" x2="${toX}" y2="${toY}" stroke="#334155" stroke-width="1.5" opacity="0.6"/>`;
}

export interface SvgRenderOptions {
  appId: string;
  depth: number;
  width: number;
  height: number;
}

export function renderSvg(
  graph: StarMapGraph,
  positions: NodePosition[],
  options: SvgRenderOptions,
): { svg: string; hash: string } {
  const { width, height, appId, depth } = options;

  const posMap = new Map(positions.map((p) => [p.nodeId, p] as const));

  const edgeSvgLines: string[] = [];
  for (const edge of graph.edges) {
    const fromPos = posMap.get(edge.from);
    const toPos = posMap.get(edge.to);
    if (fromPos && toPos) {
      edgeSvgLines.push(svgEdge(fromPos.x, fromPos.y, toPos.x, toPos.y));
    }
  }

  const nodeSvgLines: string[] = [];
  for (const node of graph.nodes) {
    const pos = posMap.get(node.id);
    if (pos) {
      nodeSvgLines.push(svgNode(node, pos.x, pos.y));
    }
  }

  const metaComment = `<!-- cosmic-star-map: app=${appId} depth=${depth} nodes=${graph.nodes.length} edges=${graph.edges.length} -->`;

  const svg = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Star Map — ${appId}">`,
    metaComment,
    `  <rect width="${width}" height="${height}" fill="#0f172a"/>`,
    `  <g class="star-map-edges">`,
    ...edgeSvgLines,
    `  </g>`,
    `  <g class="star-map-nodes">`,
    ...nodeSvgLines,
    `  </g>`,
    `</svg>`,
  ].join("\n");

  const hash = createHash("sha256").update(svg).digest("hex");

  return { svg, hash };
}
