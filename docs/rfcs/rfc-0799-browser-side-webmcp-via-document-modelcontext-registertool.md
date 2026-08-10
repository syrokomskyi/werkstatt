---
id: RFC-0799
title: "Browser-side WebMCP via document.modelContext.registerTool"
status: accepted
kind: architecture
scope: workspace
owners:
  - architecture
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-07-10
updatedAt: 2026-08-10
enhancedAt: 2026-08-10
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0290
  - RFC-0789
  - RFC-0798
satisfies:
  - DNA-15
versionBump: minor
commands:
  proposed: []
  added: []
  changed: []
  removed: []
appsImpacted:
  - warpgogol-com
packagesImpacted:
  - werkstatt-site
successSignals:
  - "Browser script registers document.modelContext.registerTool on page load"
  - "Agent browser extensions can discover and call lead.submit via the page-level MCP"
  - "No network roundtrip needed for in-page tool discovery"
nonGoals:
  - "Server-side MCP transport changes — the existing streamable-http endpoint remains"
  - "Full MCP server implementation in the browser — only tool registration and discovery"
---

# RFC-0799: Browser-side WebMCP via document.modelContext.registerTool

## Context

The server-side MCP endpoint (`/api/agent/mcp`) is fully operational (RFC-0290). Agents can discover tools via `tools/list` and call them via `tools/call`. However, browser-resident agents (extensions, sidebar assistants, in-page copilots) must make HTTP roundtrips to the server for every tool discovery and invocation, even though the page itself already knows its capabilities.

The emerging `document.modelContext` browser API proposal (WebMCP) allows pages to register MCP tools directly on the `document` object, enabling browser-resident agents to discover and invoke tools without network roundtrips. This is the browser-side complement to the server-side MCP transport.

## Problem

Browser-resident AI agents have no standard way to discover what a page can do. They must either:

1. Fetch `/.well-known/agent.json` and parse the manifest (network roundtrip)
2. Fetch `/.well-known/agent.openapi.json` and parse the OpenAPI spec (network roundtrip)
3. Call the MCP endpoint with `tools/list` (network roundtrip)

All three require network access and serialisation, even for a page that is already loaded and has its capabilities available in the DOM.

## Decision

Add a progressive-enhancement `<script>` that registers the site's active capabilities on `document.modelContext.registerTool`. The script:

1. Receives the agent surface manifest as an Astro prop (`agentSurfaceManifest`) from the page handler / proxy layout. The manifest is serialized to JSON in the component frontmatter and passed to the inline script via `define:vars`.
2. For each action in `manifest.actions`, calls `document.modelContext.registerTool({ name, description, inputSchema })`.
3. For each knowledge domain, registers a read-only tool that returns the envelope URL.
4. Falls back silently when `document.modelContext` is undefined (progressive enhancement — no error, no console noise).
5. Renders nothing when `agentSurfaceManifest` is `null` or omitted (the `{manifest && ...}` guard in the component template).

## Architectural fit

- **RFC-0290 (MCP routes):** The server-side endpoint remains the canonical transport. Browser-side registration is a discovery shortcut, not a replacement. Browser agents that prefer HTTP can still use the MCP endpoint.
- **RFC-0789 (agent discovery):** `llms.txt` and `agent.json` remain the primary discovery surfaces for non-browser agents. WebMCP is an additional channel for browser-resident agents only.
- **RFC-0798 (lead.submit):** The first concrete capability registered by this script. Future capabilities are registered automatically from the manifest.
- **DNA-15 (Scripts follow placement contract):** The WebMCP script is an `is:inline` Astro component in `packages/werkstatt-site/`, not a route-level inline `<script>` block. This follows DNA-15's requirement that non-trivial scripts be extracted to components rather than inlined in routes.
- **DNA alignment:** No existing DNA invariant covers the agent surface. The agent surface infrastructure (RFC-0286 through RFC-0291) did not establish a DNA invariant. This RFC is a progressive-enhancement addition to that surface, not a new architectural invariant. Establishing an agent-surface DNA invariant is deferred to a future RFC if the surface grows in scope.

## Design

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/werkstatt-site/src/domain/ui/components/agent-webmcp/agent-webmcp-script.astro` | Inline script component |
| `packages/werkstatt-site/src/domain/ui/components/layout/layout-component.astro` | Imports and renders the script component in `<head>` |
| `missions/<id>/workpiece/src/layouts/default.astro` | Proxy layout passes `agentSurfaceManifest` prop to the shared layout |

### Script contract

```typescript
interface ModelContextTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

interface DocumentModelContext {
  registerTool(tool: ModelContextTool): void;
}

interface DocumentWithModelContext extends Document {
  modelContext?: DocumentModelContext;
}
```

### Output format

The script is an `is:inline` Astro script that runs on every page load. It receives the manifest via `define:vars` from the component frontmatter and registers tools synchronously. No async, no fetch, no network.

### Failure modes

- **`document.modelContext` undefined:** Script exits silently. No error, no console output. This is the default in browsers without WebMCP support.
- **Missing manifest prop:** When `agentSurfaceManifest` is `null` or omitted, the component renders nothing. The page still works normally — only WebMCP discovery is absent.
- **Malformed manifest JSON:** Script exits with a `console.warn` in dev mode only. Note: `import.meta.env.DEV` is not available in `is:inline` scripts (Astro does not process inline scripts through Vite's transform pipeline). The guard `import.meta && import.meta.env && import.meta.env.DEV` safely evaluates to `false` in production, so the `console.warn` is effectively suppressed. If dev-mode warnings are needed, pass a boolean flag via `define:vars` from the component frontmatter instead.

## Rollout

- **Default behavior:** The script is included in the default layout only when the caller passes a non-null `agentSurfaceManifest` prop. The `agent.enabled` gate is enforced at the page handler / proxy layout level — when `agent.enabled` is false, the caller passes `null` or omits the prop, and the component renders nothing. This is the same gate pattern used for `llms.txt` agent links.
- **Existing apps:** Sites without the script component in their layout are unaffected. Adding the component is a one-line layout edit.
- **New apps:** The onboarding scaffold includes the component by default.
- **Disabling:** Remove the component from the layout, or set `agent.enabled: false` in `system.md`.

## Alternatives considered

- **Custom event dispatch:** Rejected — `document.modelContext` is the emerging standard. Custom events would require agent-side polling.
- **Window-level global:** Rejected — `document.modelContext` is the proposed attachment point. `window.modelContext` is non-standard.
- **Full MCP server in browser:** Rejected — overkill for discovery. The server-side endpoint handles transport; the browser script handles discovery only.

## Risks

- **Spec instability:** `document.modelContext` is not yet a standard. The script uses feature detection (`if (document.modelContext?.registerTool)`) so it is forward-compatible — if the API shape changes, the script exits silently.
- **Security:** Tool registration is read-only discovery. Actual tool invocation still goes through the server-side MCP endpoint with rate limiting, validation, and QStash dispatch. No browser-side execution of capabilities.
- **Performance:** The script is <1 KB inline, runs synchronously, and adds zero network requests. Negligible impact.

## Acceptance criteria

- [ ] `agent-webmcp-script.astro` component exists in `packages/werkstatt-site`
- [ ] Default layout includes the component when `agent.enabled` is not false
- [ ] Script registers `action.lead.submit` tool when `document.modelContext` exists
- [ ] Script registers `knowledge.{domain}.get` tools for each knowledge domain
- [ ] Script exits silently when `document.modelContext` is undefined
- [ ] No console errors in browsers without WebMCP support

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- The script component is an `is:inline` Astro component — no client-side hydration needed.
- The manifest is passed from the page handler / proxy layout to the shared layout component as the `agentSurfaceManifest` prop, then serialized and passed to the inline script via `define:vars`. No network fetch, no DOM script tag reading.
- Use `define:vars` to pass the manifest from Astro frontmatter to the inline script (per the Astro module script rule in AGENTS.md).
- The component uses a local `AgentSurfaceManifest` interface that is a subset of the canonical `AgentSurfaceManifest` type defined in `packages/werkstatt-site/src/domain/share/agent/manifest.ts`. The component only needs the fields it registers (`id`, `description`, `inputSchema` for actions; `domain`, `url` for knowledge). This is intentional — the component does not import the full canonical type to avoid pulling server-side types into a browser component.
- No subpath export in `packages/werkstatt-site/package.json` is needed — the component is only imported within the package by the layout component via relative path.
- No `AGENTS.md` updates are required — the component is a progressive-enhancement addition that follows existing agent surface conventions.
- The implementation already exists in the codebase (component file and layout integration). This RFC documents and governs the pre-existing implementation.
- Acceptance criteria can be verified by: (1) checking the component file exists at the listed path, (2) checking the layout imports and renders it, (3) loading a page in a browser with WebMCP support and confirming `document.modelContext` tools are registered, (4) loading a page without WebMCP support and confirming no console errors.
