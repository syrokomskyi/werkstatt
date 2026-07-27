<!--
<MODULE_CONTRACT>
<purpose>RFC-0292 cross-site agent surface doctrine: how fleet sites discover and invoke sibling capabilities without coupling.</purpose>
<keywords>RFC-0292, fleet, agent surface, cross-site, doctrine</keywords>
</MODULE_CONTRACT>
-->

# Cross-site agent surface doctrine (RFC-0292)

## Scope

This document defines the sanctioned pattern for cross-site agent scenarios within the Warpgogol fleet. It is the doctrine companion to RFC-0292 ("Federate agent surfaces across the fleet").

## The one rule

A fleet site (or its build tooling, or an operator agent) that needs a sibling site's capability resolves it through three hops and zero private channels:

1. **Catalog** — `fleet/agent-catalog.generated.yaml` tells you which site exposes which `actions` and `knowledgeDomains`, and its `baseUrl`.
2. **Discovery** — fetch the sibling's `/.well-known/agent.json` at that `baseUrl` to get the authoritative, signed manifest.
3. **Public surface** — invoke the capability via the sibling's public `api/agent/actions/<id>` endpoint or MCP endpoint, like any external agent.

Never skip a hop. Never import another app's content, entitlements, or source code. Never use a service binding, shared database, or internal RPC.

## Why three hops

| Hop | What it gives | What it does not give |
| --- | --- | --- |
| Catalog | Fast, offline, repo-level overview of the fleet's machine surfaces | Authoritative truth — it is a projection, regenerated from builds |
| Discovery (`agent.json`) | The signed, content-hashed manifest the sibling actually deployed | The capability itself — it only describes what exists |
| Public surface | The live capability invocation | Nothing else — no fleet privileges, no sibling data access |

The catalog accelerates discovery; the sibling's own signed `agent.json` authorizes; the public surface executes. This preserves RFC-0176/0177 isolation: the studio is a per-client operator, never a cross-tenant data hub.

## What the catalog is not

- **Not a runtime service.** It is a generated YAML file, consumed by the Leitstand and by builds. No worker, site, or gate depends on it at runtime.
- **Not a data aggregator.** It holds discovery metadata only (baseUrls, surface versions, knowledge domain names, action ids, signature status). No knowledge payloads, no leads, no PII, no tokens.
- **Not authoritative over a live surface.** The catalog locates; the site's own signed `agent.json` authorizes. Deployed-vs-built drift is checked by `agent.manifest.verify --url` (RFC-0291) per site, not by the catalog.

## Departure and arrival

A site leaving the fleet (handoff/export per RFC-0221) disappears from the catalog on the next `fleet.agent.catalog.generate` run. Its agent surface keeps working unchanged — federation adds nothing to the site itself. A site joining the fleet appears on the next generation after its `agent.json` is built and `fleet.sites.yaml` is updated.

## Phase 2 (deferred)

Outward publication of a studio-level directory (e.g. `warpgogol.com/.well-known/gogol-fleet.json`) with per-client consent semantics is a deliberate later product decision. It requires its own RFC and founder consent. The catalog schema is designed to be publishable as-is (minus `enabled: false` entries) when that decision is made.
