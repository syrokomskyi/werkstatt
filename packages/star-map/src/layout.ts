/*
<MODULE_CONTRACT>
<purpose>Facilitates the computation of deterministic node layouts for a star map visualization.</purpose>
<non-goals>
  <item>Do not handle raw graph parsing or validation logic.</item>
  <item>Do not manage rendering or display of the computed layout.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Tidied by compass.changesummary.tidy; see git history for prior entries.</item>
</CHANGE_SUMMARY>
*/

/**
 * @gogol/star-map — deterministic node layout
 *
 * DNA-32 / RFC-0028
 *
 * DETERMINISM CONTRACT: Given identical (graph, width, height),
 * the layout produces identical node positions. No Math.random().
 * Positions are a pure function of the graph structure.
 *
 * Strategy: layered radial layout
 *   - Constellation node: canvas centre
 *   - Star nodes: evenly distributed on a primary ring
 *   - Planet nodes: evenly distributed on secondary rings around each star
 *   - Moon nodes (depth=4): evenly distributed on tertiary rings around each planet
 */

import type { StarMapGraph, NodePosition } from "./types.ts";

/**
 * Compute deterministic node positions for the star map graph.
 *
 * @param graph  — parsed star map graph
 * @param width  — SVG viewport width
 * @param height — SVG viewport height
 * @returns      — array of (nodeId, x, y) entries
 */
export function computeLayout(graph: StarMapGraph, width: number, height: number): NodePosition[] {
  const cx = width / 2;
  const cy = height / 2;
  const positions: NodePosition[] = [];

  // Constellation at centre
  const constellationNode = graph.nodes.find((n) => n.kind === "constellation");
  if (constellationNode) {
    positions.push({ nodeId: constellationNode.id, x: cx, y: cy });
  }

  // Stars on primary ring
  const starNodes = graph.nodes.filter((n) => n.kind === "star");
  const starRingRadius = Math.min(width, height) * 0.28;
  starNodes.forEach((star, i) => {
    const angle = (2 * Math.PI * i) / starNodes.length - Math.PI / 2;
    positions.push({
      nodeId: star.id,
      x: Math.round(cx + starRingRadius * Math.cos(angle)),
      y: Math.round(cy + starRingRadius * Math.sin(angle)),
    });
  });

  // Planets on secondary rings around each star
  const planetRingRadius = Math.min(width, height) * 0.12;
  const planetsByParent = new Map<string, typeof graph.nodes>();
  for (const edge of graph.edges) {
    const target = graph.nodes.find((n) => n.id === edge.to && n.kind === "planet");
    if (!target) continue;
    if (!planetsByParent.has(edge.from)) planetsByParent.set(edge.from, []);
    planetsByParent.get(edge.from)!.push(target);
  }

  for (const [parentId, planets] of planetsByParent) {
    const parentPos = positions.find((p) => p.nodeId === parentId);
    if (!parentPos) continue;

    // Compute base angle pointing away from constellation centre
    const dx = parentPos.x - cx;
    const dy = parentPos.y - cy;
    const baseAngle = Math.atan2(dy, dx);

    const spread = Math.PI * 0.9;
    planets.forEach((planet, i) => {
      const offset = planets.length > 1 ? spread * (i / (planets.length - 1) - 0.5) : 0;
      const angle = baseAngle + offset;
      positions.push({
        nodeId: planet.id,
        x: Math.round(parentPos.x + planetRingRadius * Math.cos(angle)),
        y: Math.round(parentPos.y + planetRingRadius * Math.sin(angle)),
      });
    });
  }

  // Moons on tertiary rings around each planet (depth=4 only)
  const moonRingRadius = Math.min(width, height) * 0.05;
  const moonsByParent = new Map<string, typeof graph.nodes>();
  for (const edge of graph.edges) {
    const target = graph.nodes.find((n) => n.id === edge.to && n.kind === "moon");
    if (!target) continue;
    if (!moonsByParent.has(edge.from)) moonsByParent.set(edge.from, []);
    moonsByParent.get(edge.from)!.push(target);
  }

  for (const [parentId, moons] of moonsByParent) {
    const parentPos = positions.find((p) => p.nodeId === parentId);
    if (!parentPos) continue;

    const grandparentEdge = graph.edges.find((e) => e.to === parentId);
    const grandparentPos = grandparentEdge
      ? positions.find((p) => p.nodeId === grandparentEdge.from)
      : null;

    const dx = grandparentPos ? parentPos.x - grandparentPos.x : 1;
    const dy = grandparentPos ? parentPos.y - grandparentPos.y : 0;
    const baseAngle = Math.atan2(dy, dx);

    const spread = Math.PI * 0.8;
    moons.forEach((moon, i) => {
      const offset = moons.length > 1 ? spread * (i / (moons.length - 1) - 0.5) : 0;
      const angle = baseAngle + offset;
      positions.push({
        nodeId: moon.id,
        x: Math.round(parentPos.x + moonRingRadius * Math.cos(angle)),
        y: Math.round(parentPos.y + moonRingRadius * Math.sin(angle)),
      });
    });
  }

  return positions;
}
