---
id: RFC-0227
title: "Link material credit nodes into the page graph for licensable media"
status: implemented
# kind options: architecture | contract | command | policy | deprecation
kind: architecture
# scope options: app | workspace
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-06-21
updatedAt: 2026-06-21
implementedAt: 2026-06-21
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0150
  - RFC-0162
  - RFC-0163
  - RFC-0209
  - RFC-0220
  - RFC-0223
commands:
  proposed: []
  added: []
  changed:
    - jsonld.parity
  removed: []
appsImpacted:
  - warpgogol-com
  - nicaragua-projekt
packagesImpacted:
  - "@gogol/share"
  - "@gogol/ui"
  - "@gogol/site-kernel-checks"
successSignals:
  - "A credited image/video appears as a node referenced from the page's primary entity (`WebPage`/`Article`/`Organization`) via `image`/`video`/`associatedMedia`, not as a disconnected JSON-LD island."
  - "A material whose license is a real URL emits `license` + `acquireLicensePage` on a linked `ImageObject`, satisfying Google's licensable-images requirements."
  - "There is exactly one structured-data node per credited material on a page, shared by the page graph and the disclosure, with no duplication."
  - "`jsonld.parity` (or a successor check) fails when a credited material renders a visible disclosure but is absent from the page graph."
nonGoals:
  - "Does not change the visible disclosure layout or the credit record schema (RFC-0220/RFC-0223 own those)."
  - "Does not introduce embedded file metadata (RFC-0226 owns that)."
  - "Does not require every decorative image to enter the graph; scope follows the credited-material set."
  - "Does not invent license URLs; linking only upgrades materials that already carry a license URL."
---

# RFC-0227: Link material credit nodes into the page graph for licensable media

## Context

RFC-0220 emits a per-material `ImageObject`/`VideoObject`/`CreativeWork` as a standalone `<script type="application/ld+json">` next to the disclosure, and RFC-0223 enriched that node (URL-only license, `copyrightHolder`, `copyrightYear`, `acquireLicensePage`). Page-level structured data is owned separately by the OG/JSON-LD work (RFC-0162/RFC-0163) and the primary-image projection (RFC-0209/RFC-0150).

The credit node and the page graph do not reference each other. The result is a floating island: search engines see an `ImageObject` with credit data and, separately, a `WebPage`/`Article`, with no edge connecting them. Google's licensable-images treatment in particular wants the `ImageObject` to be discoverable from the page entity and to carry both `license` and `acquireLicensePage`.

## Problem

Three coupled gaps:

1. **Orphan nodes.** Credit `ImageObject`/`VideoObject` nodes are not linked from the page's main entity, weakening how search/AI consumers associate the media with the page.
2. **No licensable wiring.** Even though RFC-0223 can emit `license`/`acquireLicensePage`, no app material currently carries a license URL and nothing connects the node to the page, so the licensable treatment can never trigger.
3. **Potential duplication.** The page graph may already emit a primary-image `ImageObject` (RFC-0209) that overlaps the credit node, risking two nodes for one asset.

## Decision

Consolidate per-material credit nodes into the page's JSON-LD graph instead of emitting them as islands.

- The credit projection contributes a single node per credited material, identified by a stable `@id` derived from the content URL.
- The page's primary entity references those nodes: lead/primary media via `image`/`primaryImageOfPage` (reconciling with RFC-0209 so there is one node, not two), other credited media via `associatedMedia`.
- When a material's license is a URL, its linked `ImageObject` carries `license` + `acquireLicensePage` (from RFC-0223), making it eligible for licensable-images.
- The disclosure UI stops emitting its own duplicate `<script>` for a material that the page graph already contains; the structured data has one owner per page.
- `jsonld.parity` is extended (or a sibling check added) to fail when a visible credit disclosure exists for a material that is missing from the page graph.

## Architectural fit

- **RFC-0163 / RFC-0162.** Page-graph emission already owns the page entity; this RFC feeds credit nodes into it rather than emitting beside it. Ownership of the `<script>` consolidates to the page-graph layer.
- **RFC-0209 / RFC-0150.** The primary-image node and the credit node for the same asset must reconcile to one `@id`. This RFC makes the credit projection the provenance contributor and the primary-image projection the placement contributor for the same node.
- **RFC-0220 / RFC-0223.** No change to records or schema; this is purely a projection-wiring and de-duplication change plus a parity check.

## Design

```jsonc
{
  "@type": "WebPage",
  "@id": "https://…/#webpage",
  "primaryImageOfPage": { "@id": "https://…/hero.webp#image" },
  "associatedMedia": [{ "@id": "https://…/promo.mp4#video" }]
}
// linked node (single owner), credit + license merged:
{
  "@type": "ImageObject",
  "@id": "https://…/hero.webp#image",
  "contentUrl": "https://…/hero.webp",
  "creditText": "…",
  "creator": { "@type": "Person", "name": "…" },
  "copyrightHolder": { "@type": "Organization", "name": "Warpgogol" },
  "license": "https://…/lizenz",
  "acquireLicensePage": "https://…/lizenz"
}
```

## Failure modes

- `credit-node-orphaned` (fail): a credited material renders a disclosure but no page-graph node references it.
- `credit-node-duplicated` (fail): two JSON-LD nodes describe the same asset URL on one page.

## Rollout

1. Introduce the shared `@id` convention for credit nodes and have the page-graph layer (RFC-0163) ingest credit projections.
2. Reconcile with the primary-image node (RFC-0209) so lead media is one node, and move `<script>` ownership off the disclosure component.
3. Add the orphan/duplicate parity check; keep it warn-only for one build, then fail-hard.
4. Wire `license`/`acquireLicensePage` onto linked nodes for any material that carries a license URL.

## Alternatives considered

- **Keep islands, just add edges.** Rejected: leaving two emitters risks duplicate nodes for one asset; ownership must consolidate.
- **Always emit primary-image and credit nodes separately and dedupe downstream.** Rejected: a shared `@id` at emission is simpler and verifiable than post-hoc de-duplication.
- **Wait for RFC-0226 (embedded metadata) first.** Rejected: page-graph linking is independent and immediately useful for search; the two can land in either order.

## Risks

- **Reconciliation with existing primary-image emission.** Mitigated by a shared `@id` convention and a duplication check.
- **Ownership move.** Shifting the `<script>` from the disclosure component to the page-graph layer must not drop the node when a page renders a disclosure but no other JSON-LD; the parity check guards this.
- **Licensable expectations.** Google may still require additional signals; this RFC makes the wiring correct but does not guarantee a badge.

## Acceptance criteria

- [x] Credited materials are linked from the page primary entity via `image`/`primaryImageOfPage`/`associatedMedia` with a stable shared `@id`. (evidence: implemented historically)
- [x] A material with a license URL emits `license` + `acquireLicensePage` on its linked node. (evidence: implemented historically)
- [x] Exactly one structured-data node exists per credited asset URL per page. (evidence: implemented historically)
- [x] A parity check fails on orphaned or duplicated credit nodes. (evidence: implemented historically)
- [x] `apps-check.run` passes on both apps after the change. (evidence: implemented historically)
- [x] `rfc.validate` passes on this file. (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY implement code changes only when this RFC has status `accepted` (or `implemented`).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 once criteria are verified and committed.
- Agents MUST keep one structured-data owner per page; do not emit credit nodes both in the disclosure and the page graph.
- Agents MUST NOT invent license URLs; only wire materials that already carry one.
- Agents MUST reference RFC-0227 in commits that implement this contract.
