---
id: RFC-0789
title: "Enhance llms.txt generation with agent surface discovery links"
status: draft
# kind options: architecture | contract | command | policy | deprecation
kind: command
# scope options: app | workspace
scope: workspace
owners:
  - architecture
# Set by the deciding human together with the status change (RFC-0335).
# Draft scaffolds must keep this empty; do not prefill a default identity.
# Format: human:<handle> (agent:<id> reserved — see RFC-0335)
# Default reviewer when none is specified by the operator: human:andrii-syrokomskyi
reviewers: []
createdAt: 2026-08-09
updatedAt: 2026-08-09
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - DNA-34
  - RFC-0050
  - RFC-0286
  - RFC-0783
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-34
# RFC-0396: Traceability to a vendored spec node: "<spec-id>/<node-id>", e.g. "pbp/RFC-PBP-020".
# Set by spec.materialize; leave commented for non-spec RFCs.
# specRef:
# RFC-0478: Platform versioning enforcement. Declares the SemVer delta this RFC
# produces when implemented. Required for post-cutoff implemented RFCs (V-29).
# Values: minor (Breaks-B, requires migrator), patch (safe), none (prose-only),
# major (architectural, manually reserved). Default: patch.
versionBump: patch
commands:
  proposed: []
  added: []
  changed:
    - llms.generate
  removed: []
appsImpacted: []
packagesImpacted:
  - packages/werkstatt-site
successSignals:
  - llms.txt includes links to API Catalog, MCP Server Card, and OpenAPI document
  - isitagentready.com reports llms.txt references all agent discovery endpoints
nonGoals:
  - New commands — this RFC amends the existing llms.generate command
  - API Catalog or MCP Server Card generation — covered by RFC-0783
  - llms.txt content format — already established by RFC-0050 and RFC-0184
# RFC-0268: OPTIONAL machine-checkable acceptance probes, executed on-demand
# via `pnpm exec werkstatt run rfc.acceptance.run --id <this-rfc-id>` (never
# automatically inside build pipelines). Closed probe vocabulary — see
# docs/rfcs/rfc-0268-make-rfc-acceptance-criteria-machine-checkable.md.
# acceptance:
#   - probe: run
#     command: "site-kernel run some.command.validate --app warpgogol-com"
#     expect:
#       exitCode: 0
#   - probe: file-exists
#     path: "packages/share/src/some-new-module.ts"
#   - probe: command-registered
#     name: "some.new.command"
#   - probe: file-contains
#     path: "AGENTS.md"
#     pattern: "Some new governance paragraph"
---

# RFC-0789: Enhance llms.txt generation with agent surface discovery links

## Context

RFC-0050 implemented `llms.generate` — producing `llms.txt` (index) and `llms-full.txt` (full content) from the semantic site model. The `buildLlmsIndex` function in `packages/werkstatt-site/src/domain/share/semantic/llms.ts` already includes a blockquoted reference to `agent.json`:

```ts
const agentJsonUrl = canonicalStaticUrl("/.well-known/agent.json", { baseUrl: site.baseUrl });
// ...
`> Machine-readable Agent Surface (structured knowledge + capabilities): [agent.json](${agentJsonUrl}).`,
```

RFC-0783 introduces two new discovery endpoints: `/.well-known/api-catalog` (API Catalog per RFC 9727) and `/.well-known/mcp/server-card.json` (MCP Server Card per SEP-1649). The existing `llms.txt` does not reference these endpoints.

## Problem

`llms.txt` references `agent.json` and `llms-full.txt` but does not reference the API Catalog, MCP Server Card, or OpenAPI document. Agents that read `llms.txt` as their primary discovery entry point are unaware of these additional structured discovery endpoints. The [isitagentready.com](https://isitagentready.com/warpgogol.com) audit checks whether `llms.txt` cross-references all available agent discovery surfaces.

## Decision

The `buildLlmsIndex` function in `packages/werkstatt-site/src/domain/share/semantic/llms.ts` is amended to include additional blockquoted discovery links in the header section of `llms.txt`, referencing the API Catalog, MCP Server Card, and OpenAPI document.

## Architectural fit

- **DNA-34** (`.well-known/` discovery) — `llms.txt` is the prose entry point for agents; cross-referencing structured discovery endpoints strengthens the discovery surface.
- **RFC-0050** (llms.txt) — this RFC amends the existing `buildLlmsIndex` function, not creating a new command.
- **RFC-0286** (agent surface) — the links point to the agent surface manifest and its projections.
- **RFC-0783** (API Catalog + MCP Server Card) — the links reference the new endpoints introduced by that RFC.
- **Site OS operator model** — `scope: app`, `supportsAllSites: true`. The amendment is in the existing `llms.ts` domain module.

## Design

### CLI surface

No new commands. `llms.generate` is amended.

### llms.txt header amendment

Existing header:

```markdown
# Warpgogol
> Site description...
> For complete documentation in a single file, see [llms-full.txt](https://warpgogol.com/llms-full.txt).
> Machine-readable Agent Surface (structured knowledge + capabilities): [agent.json](https://warpgogol.com/.well-known/agent.json).
```

Amended header:

```markdown
# Warpgogol
> Site description...
> For complete documentation in a single file, see [llms-full.txt](https://warpgogol.com/llms-full.txt).
> Machine-readable Agent Surface (structured knowledge + capabilities): [agent.json](https://warpgogol.com/.well-known/agent.json).
> API discovery catalog (RFC 9727): [api-catalog](https://warpgogol.com/.well-known/api-catalog).
> MCP Server Card (SEP-1649): [server-card.json](https://warpgogol.com/.well-known/mcp/server-card.json).
> OpenAPI 3.1 specification: [agent.openapi.json](https://warpgogol.com/.well-known/agent.openapi.json).
```

The new links are only included when `agent.enabled !== false`. When `agent.enabled: false`, all agent discovery links are omitted.

### TypeScript contracts

```ts
// packages/werkstatt-site/src/domain/share/semantic/llms.ts — amended

export function buildLlmsIndex(site: SemanticSiteModel): string {
  // Existing code...
  const agentJsonUrl = canonicalStaticUrl("/.well-known/agent.json", { baseUrl: site.baseUrl });
  // New: API Catalog, MCP Server Card, OpenAPI
  const apiCatalogUrl = canonicalStaticUrl("/.well-known/api-catalog", { baseUrl: site.baseUrl });
  const mcpCardUrl = canonicalStaticUrl("/.well-known/mcp/server-card.json", { baseUrl: site.baseUrl });
  const openapiUrl = canonicalStaticUrl("/.well-known/agent.openapi.json", { baseUrl: site.baseUrl });

  return [
    `# ${site.organization.name}`,
    ...(siteDescription ? [`> ${siteDescription}`] : []),
    `> For complete documentation in a single file, see [llms-full.txt](${llmsFullUrl}).`,
    `> Machine-readable Agent Surface (structured knowledge + capabilities): [agent.json](${agentJsonUrl}).`,
    `> API discovery catalog (RFC 9727): [api-catalog](${apiCatalogUrl}).`,
    `> MCP Server Card (SEP-1649): [server-card.json](${mcpCardUrl}).`,
    `> OpenAPI 3.1 specification: [agent.openapi.json](${openapiUrl}).`,
    // ... rest unchanged
  ].join("\n");
}
```

The function signature does not change — the URLs are derived from `site.baseUrl` which is already available.

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/werkstatt-site/src/domain/share/semantic/llms.ts` | Amended — `buildLlmsIndex` adds 3 new discovery links |
| `public/llms.txt` | Output — amended content with new links |

### Output format

No new output format. The `llms.txt` content is amended with additional blockquoted lines.

### Failure modes

- **`agent.enabled: false`**: The generator omits all agent discovery links (agent.json, api-catalog, mcp-card, openapi) from `llms.txt`. The existing `llms.generate` does not currently check `agent.enabled` — it always includes the `agent.json` link. This RFC amends the generator to check `agent.enabled` and omit all agent links when disabled.
- **Discovery endpoints not generated**: If `agent.api-catalog.generate` or `agent.mcp-card.generate` have not run, the links in `llms.txt` will point to non-existent files. Mitigation: `llms.generate` runs after these generators in `build.prepare` (per RFC-0787 pipeline wiring).

## Rollout

- **Pipeline integration**: `llms.generate` already runs in `build.prepare`. Per RFC-0787, the new generators (`agent.api-catalog.generate`, `agent.mcp-card.generate`) run before `llms.generate`, so the endpoints exist when `llms.txt` is generated.
- **Existing apps**: All apps get the new discovery links in `llms.txt` on the next `build.prepare` run.
- **`agent.enabled: false` apps**: All agent discovery links are omitted from `llms.txt`. The `llms.txt` still includes the `llms-full.txt` link and page sources.
- **No new files**: Only `llms.txt` content changes.

## Alternatives considered

1. **Single `agent.json` link only** — keep the existing single link to `agent.json` and let agents discover the other endpoints from there. Rejected: `llms.txt` is the primary entry point for many agents. Including direct links to all discovery endpoints reduces the number of fetches an agent needs to make.

2. **Discovery links in a separate section** — add a `## Agent discovery` section at the bottom of `llms.txt`. Rejected: the blockquoted header is the standard place for cross-references per the llms.txt convention. A separate section would be less visible.

## Risks

- **llms.txt size**: Adding 3 lines to the header increases file size by ~300 bytes. Negligible.
- **Broken links**: If the discovery endpoints are not generated (e.g. generator failed), the links in `llms.txt` will return 404. Mitigation: pipeline ordering ensures generators run before `llms.generate`.
- **llms.txt validation**: The existing `llms.validate` checks for `llms-full.txt` link but does not check for agent discovery links. This RFC does not add validation for the new links — they are advisory, not mandatory.

## Acceptance criteria

- [ ] `buildLlmsIndex` in `llms.ts` includes links to `api-catalog`, `mcp/server-card.json`, and `agent.openapi.json`
- [ ] Links use absolute URLs via `canonicalStaticUrl`
- [ ] `agent.enabled: false` omits all agent discovery links from `llms.txt`
- [ ] `llms.txt` still passes `llms.validate` (existing validation rules)
- [ ] `isitagentready.com` reports llms.txt references all agent discovery endpoints for warpgogol.com after deploy
- [ ] `rfc.validate` passes on this file before merging

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- For RFCs created on or after 2026-07-07 with acceptance probes: before stamping `implemented`, run `pnpm exec werkstatt run rfc.verification.emit --id RFC-0789` and commit the evidence file in the same commit (RFC-0330 amended transition precondition).
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0789 --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
- The discovery links MUST use `canonicalStaticUrl` to generate absolute URLs — relative URLs are rejected by `llms.validate` (RFC-0184).
- The `agent.enabled: false` check MUST read the agent block from `system.md` (same pattern as `agent.manifest.generate`).
- This RFC MUST be implemented after RFC-0783 — the links reference endpoints created by that RFC.
