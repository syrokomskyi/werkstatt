---
id: ADR-0038
title: "Agent readiness discovery surface architecture"
# Lifecycle (RFC-0367 parity with RFCs):
#   proposed → reviewing → accepted → implemented
#   any → superseded (requires supersededBy)
#   any → rejected
status: implemented
scope: package
decider: architecture
createdAt: 2026-08-09
updatedAt: 2026-08-10
implementedAt: 2026-08-10
closedAt: 2026-08-10
supersedes: []
supersededBy:
related:
  - DNA-34
  - RFC-0286
  - RFC-0783
  - RFC-0784
  - RFC-0785
  - RFC-0786
  - RFC-0787
  - RFC-0788
  - RFC-0789
reviewers: []
---

# ADR-0038: Agent readiness discovery surface architecture

## Context

warpgogol.com serves an agent discovery surface consisting of multiple endpoints at different layers: DNS (`_agent.warpgogol.com` TXT record), `.well-known/` (agent.json, api-catalog, mcp/server-card.json, agent.openapi.json), HTTP headers (Link, Content-Signal), content negotiation (Accept: text/markdown), sitemap (markdown alternate links), and prose (`llms.txt`, `llms-full.txt`). The existing RFCs (RFC-0286, RFC-0783 through RFC-0789) each address one layer. This ADR documents the architecture as a whole: how the layers fit together, what the single source of truth is, and how generators are wired into the build pipeline.

Key packages: `packages/werkstatt-site` (all generators and validators), `packages/werkstatt` (pipeline engine). Key invariant: DNA-34 (`.well-known/` discovery).

## Decision

The agent readiness discovery surface is a multi-layer architecture with the Agent Surface Manifest (`src/agent-surface.generated.yaml`) as the single source of truth, projected into multiple discovery endpoints by deterministic generators, and wired into the `build.prepare` and `build.check` pipelines.

- **Layer 1 — DNS**: `_agent.<domain>` TXT record pointing to `https://<domain>/.well-known/agent.json` (RFC-0786).
- **Layer 2 — `.well-known/`**: `agent.json` (RFC-0286), `api-catalog` (RFC-0783), `mcp/server-card.json` (RFC-0783), `agent.openapi.json` (RFC-0286).
- **Layer 3 — HTTP**: `Link` headers and `Content-Signal` directive in `robots.txt` (RFC-0784).
- **Layer 4 — Content negotiation**: `Accept: text/markdown` returns `.md` twins (RFC-0785).
- **Layer 5 — Sitemap**: `<xhtml:link type="text/markdown">` alternate links (RFC-0788).
- **Layer 6 — Prose**: `llms.txt` and `llms-full.txt` with cross-references to all discovery endpoints (RFC-0050, RFC-0789).
- **Pipeline**: All generators run in `build.prepare` after `agent.manifest.generate`; validators run in `build.check` (RFC-0787).

## Justification

- **Single source of truth**: The Agent Surface Manifest (`src/agent-surface.generated.yaml`) is assembled by `agent.manifest.generate` from `system.md` and API route definitions. All other generators read this manifest and project it into their respective formats. This avoids drift between endpoints — a change in the manifest automatically propagates to all discovery surfaces on the next `build.prepare`.
- **Multi-layer approach**: Different agents discover content through different mechanisms. Some use DNS, some crawl `.well-known/`, some read `llms.txt`, some parse sitemaps. Providing all layers ensures maximum discoverability.
- **Pipeline integration**: Wiring generators into `build.prepare` and validators into `build.check` ensures the discovery surface is always up-to-date and verified — no manual steps needed.
- **`agent.enabled: false` escape hatch**: Sites that do not want an agent surface can disable it. All generators check this flag and skip gracefully.
- **Alignment with DNA-34**: The `.well-known/` discovery invariant is the architectural foundation. All endpoints live under `.well-known/` per RFC 8615.

## Consequences

- **Positive**: Agents can discover warpgogol.com's content and capabilities through any standard mechanism (DNS, `.well-known/`, sitemap, llms.txt, HTTP headers). The single-source-of-truth pattern means no drift between endpoints. Pipeline integration means no manual steps — the discovery surface is always up-to-date after `build.prepare`.
- **Negative**: 7 new commands and 3 amended commands increase the command surface area. The `build.prepare` pipeline is longer by 4 generator steps. The `build.check` pipeline is longer by 3 validator steps.
- **Technical debt**: DNS-AID record validation queries Cloudflare API (RFC-0786) — this is a runtime dependency. If Cloudflare API is unavailable, `agent.dns-aid.validate` fails. This is acceptable: DNS records change infrequently and the operator can retry.

## Evolution

- **isitagentready.com score**: The primary metric. If the score drops after adding a new endpoint, investigate which layer is broken.
- **New discovery standards**: When a new agent discovery standard emerges (e.g. `ai.txt`, `agents.txt`), add a new generator + validator pair and wire it into the pipeline via a new RFC amending `build.prepare` and `build.check`.
- **MCP protocol evolution**: If the MCP Server Card spec (SEP-1649) changes, update `agent.mcp-card.generate` and re-run `build.prepare`.
- **DNS-AID adoption**: If DNS-AID becomes a widely adopted standard, consider promoting the TXT record to a more structured DNS record type (e.g. SVCB).
- **Implementation**: All 7 RFCs (0783–0789) are now `implemented`. ADR stamped `implemented` on 2026-08-10.
- **Code-trace (2026-08-09)**: Verified architecture matches codebase for RFC-0783, 0787, 0788.
- **Code-trace (2026-08-10)**: Verified architecture matches codebase for RFC-0784, 0785, 0786, 0789:
  - RFC-0784: `Content-Signal` directive in `robots.ts` and `buildRobotsTxt` (`semantic/robots.ts`), `AGENT_LINK_HEADERS` token in `app-boilerplate.ts`, HDR-07 rule in `security.ts`, test file `rfc-0784-robots-headers.test.ts`.
  - RFC-0785: `agent-markdown-negotiation.ts` handler, `middleware.template.ts` with `Accept: text/markdown` negotiation, test file `agent-markdown-negotiation.test.ts`.
  - RFC-0786: `agent-dns-aid.ts` handler, `dns-aid.ts` pure projection (`domain/share/agent/`), `dns-records.ts` schema, test files, command table entries in `29-agent-surface.ts`.
  - RFC-0789: `llms.ts` generation with agent surface discovery links, `llms-0789.test.ts` tests, `aggregate.ts` integration.
