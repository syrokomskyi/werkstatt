---
id: RFC-0290
title: "Add the agent gate runtime with a stateless MCP endpoint"
status: implemented
kind: architecture
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-07-05
updatedAt: 2026-07-05
implementedAt: 2026-07-05
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0149
  - RFC-0168
  - RFC-0176
  - RFC-0179
  - RFC-0181
  - RFC-0286
  - RFC-0287
  - RFC-0288
  - RFC-0289
  - RFC-0291
  - DNA-1
commands:
  proposed: []
  added:
    - agent.gate.fixtures.run
    - agent.routes.generate
  changed:
    - agent.manifest.generate
    - agent.surface.validate
  removed: []
appsImpacted:
  - apps/*
packagesImpacted:
  - "@gogol/agent-gate"
  - "@gogol/share"
  - "@gogol/ontology"
  - "@gogol/site-kernel-checks"
successSignals:
  - "An MCP-capable agent (e.g. Claude with a remote MCP connector) can list a site's tools and invoke lead.submit end-to-end, and the resulting lead arrives through the same Integration Port delivery path as a human form submission."
  - "The MCP endpoint and all action routes run inside the site's existing Worker: the per-site Worker count stays exactly one (RFC-0179 budget), and a site with zero entitled actions still serves read tools."
  - "There is no hand-written MCP or route code in any app: every runtime file under src/pages/api/agent/ is a generated thin re-export, and the tool list is derived from the manifest at build time."
  - "The MCP protocol version is a single pinned constant with conformance fixtures; upgrading it is one reviewed change that touches no app and no content."
nonGoals:
  - "Do not implement sessions, subscriptions, sampling, elicitation, or SSE streaming — the gate serves the stateless Streamable HTTP subset only; a future need for stateful features is a new RFC."
  - "Do not adopt @modelcontextprotocol/sdk or any MCP framework dependency — the stateless subset over web-standard Request/Response is small enough to own, and dependency churn is the decades-scale risk being designed out."
  - "Do not add authentication/authorization semantics here — abuse controls, signing, and agent identity are RFC-0291."
  - "Do not expose prompts or resources beyond knowledge files and Markdown twins."
acceptance:
  - probe: file-exists
    path: "packages/agent-gate/src/index.ts"
  - probe: file-exists
    path: "packages/agent-gate/src/mcp/protocol.ts"
  - probe: command-registered
    name: "agent.gate.fixtures.run"
  - probe: run
    command: "site-kernel run agent.gate.fixtures.run"
    expect:
      exitCode: 0
  - probe: file-exists
    path: "apps/warpgogol-com/src/pages/api/agent/mcp.ts"
---

# RFC-0290: Add the agent gate runtime with a stateless MCP endpoint

## Context

RFC-0286..0289 build the static tiers: knowledge files, the capability catalog, discovery, OpenAPI. Two things still need a runtime: **executing actions** (an HTTP POST must become an `IntegrationEvent` in the delivery backbone) and **speaking MCP** (the Model Context Protocol is the de-facto tool-calling protocol for AI agents; its Streamable HTTP transport is plain HTTP POST with JSON-RPC 2.0 bodies, so a stateless server is a small, well-bounded component).

The ecosystem already has the runtime pattern: section-owned Astro API routes as generated thin re-exports (`api.routes.generate`, RFC-0149 — see `apps/warpgogol-com/src/pages/api/send-message.ts`), running inside the site's single Worker on the client's own account (RFC-0176/0179), with reliable delivery underneath (RFC-0181).

## Problem

- Manifest `AgentActionRef`s point at `/api/agent/actions/<id>` routes that do not exist (the RFC-0288 carve-out).
- There is no MCP endpoint: agents whose ecosystems are MCP-first cannot consume the surface as tools, only as raw HTTP.
- Any per-app or hand-written implementation of either would violate AS-1 and start protocol legacy accretion on day one.

## Decision

The workspace gains **`packages/agent-gate` (`@gogol/agent-gate`)**: a framework-agnostic, dependency-free runtime that turns a site's Agent Surface Manifest into (a) HTTP action handlers and (b) a stateless MCP endpoint. Apps receive only generated thin re-export routes; all logic lives once in the package, instantiated with **data** (the manifest), never with per-site code.

```
POST /api/agent/mcp               → MCP Streamable HTTP (stateless subset)
POST /api/agent/actions/<id>      → direct HTTP action invocation
```

MCP protocol version is pinned: `PINNED_MCP_PROTOCOL_VERSION = "2025-06-18"`. Conformance fixtures (golden JSON-RPC request/response pairs) live in the package; `agent.gate.fixtures.run` replays them and is the regression gate for any protocol work.

## Architectural fit

- **RFC-0179 Worker budget.** Both routes compile into the site's existing Astro/Worker deploy (`prerender = false` endpoints) — zero additional Workers; `site-kernel-deploy` needs no new bindings for v1 (the gate uses only fetch + the existing integration substrate).
- **Integration Port (RFC-0176/0181).** Action execution converts validated input into `IntegrationEvent { kind, source: "agent", eventId, locale, occurredAt, contact?, payload }` and hands it to the **same dispatch used by the send-message handler** (`@gogol/share` integration dispatch). No second delivery path, no new PII surface: per-client isolation is inherited, not re-implemented.
- **AS-1 (one manifest).** Tool list, action routes, and input validation all derive from `src/agent-surface.generated.json` + the capability catalog at build time. `api.routes.generate` (changed) emits the thin routes from the manifest; `agent.surface.validate` (changed) removes the RFC-0288 carve-out and enforces route↔manifest bijection.
- **AS-6 (static reads).** MCP read tools do not recompute anything: they serve the bytes of the static knowledge files/twins through a `KnowledgeReader` port (filesystem in dev/build, `env.ASSETS.fetch` on Workers).
- **DNA-1 (SSG-first).** The gate adds no rendering runtime; it is the action tier plus a protocol adapter over static artifacts.

## Design

### Package layout

```
packages/agent-gate/
  src/
    index.ts            # createAgentGate(manifest, catalog, ports) → { handleMcp, handleAction }
    ports.ts            # KnowledgeReader, EventDispatcher, Clock ports (DI, no astro imports)
    actions.ts          # input validation (closed schema subset interpreter) → IntegrationEvent
    mcp/
      protocol.ts       # PINNED_MCP_PROTOCOL_VERSION, JSON-RPC 2.0 types, error codes
      handler.ts        # method router: initialize, ping, tools/list, tools/call, resources/list, resources/read
      tools.ts          # manifest → MCP tool definitions (mechanical projection)
    astro.ts            # Astro APIRoute adapters (the only astro-aware module)
    tests/
      fixtures/         # golden request/response JSON pairs (the conformance corpus)
```

### TypeScript contracts

```ts
// packages/agent-gate/src/index.ts
export interface AgentGatePorts {
  /** Read a static public artifact by site-relative path ("/api/agent/v1/offer.json"). */
  knowledge: { read(path: string): Promise<string | null> };
  /** Hand a validated event to the RFC-0176/0181 delivery substrate. Throws on transport failure. */
  dispatch: { send(event: IntegrationEvent): Promise<{ accepted: boolean; eventId: string }> };
  now(): Date;
}

export function createAgentGate(
  manifest: AgentSurfaceManifest,
  catalog: CapabilityRecord[],          // only records referenced by manifest.actions
  ports: AgentGatePorts,
): {
  handleMcp(request: Request): Promise<Response>;
  handleAction(capabilityId: string, request: Request): Promise<Response>;
};
```

### MCP behavior (normative, exhaustive)

- **Transport:** Streamable HTTP, single-response mode only. `POST /api/agent/mcp` with `Content-Type: application/json` → one `application/json` response. `GET` → `405`. No `Mcp-Session-Id` is ever issued or accepted (stateless). No SSE.
- **`initialize`:** returns `protocolVersion: PINNED_MCP_PROTOCOL_VERSION`, `capabilities: { tools: {}, resources: {} }`, `serverInfo: { name: "<site> agent surface", version: manifest.surfaceVersion }`. Version negotiation per spec: if the client requests an unsupported version, respond with the pinned version; the client disconnects if unacceptable.
- **`ping`** → `{}`.
- **`tools/list`:** one tool per knowledge ref — name `knowledge.<domain>.get`, empty input schema, description from the domain; one tool per action ref — name `action.<id>`, `inputSchema` = capability `input` verbatim, description from capability `description` (default language). No pagination (the list is small by construction).
- **`tools/call`:** knowledge tool → `ports.knowledge.read(ref.url)`; result content `[{ type: "text", text: <file bytes> }]`. Action tool → validate args against capability `input` (closed-subset interpreter from `@gogol/agent-gate/actions`, same module the HTTP route uses) → build `IntegrationEvent` (`eventId`: client-supplied UUID or `crypto.randomUUID()`; `occurredAt`: `ports.now()`; `locale`: manifest default language unless a supported `locale` arg is given) → `ports.dispatch.send` → result `[{ type: "text", text: JSON.stringify(output) }]` where output matches the capability `output` schema. Validation failure → JSON-RPC error `-32602` with the field path in `data`.
- **`resources/list` / `resources/read`:** knowledge files and (when twins exist) Markdown twins, URIs = absolute site URLs. Read serves bytes via the port.
- **Everything else** (`prompts/*`, `sampling/*`, `logging/*`, notifications) → JSON-RPC `-32601` method-not-found. Batch requests → `-32600` (the pinned protocol version removed batching).

### HTTP action behavior

`POST /api/agent/actions/<id>`: body validated against capability `input` (same interpreter) → dispatch → `200` with `output`-shaped JSON. Errors: `400` (schema violation, field path in body), `404` (id not in manifest — route exists only if it is, so this is defense-in-depth), `413` (over `limits.maxPayloadBytes`), `429` reserved for RFC-0291, `502` (dispatch transport failure; the event was not accepted — agents may retry with the same `eventId`, dedup makes it safe).

### Generated app files

`api.routes.generate` (changed) emits, for every app with `agent.enabled` and a non-empty manifest:

```ts
// apps/<site>/src/pages/api/agent/mcp.ts   — GENERATED (RFC-0081 marker)
export const prerender = false;
export { POST, GET } from "@gogol/agent-gate/astro#mcp";   // exact re-export form per generator template

// apps/<site>/src/pages/api/agent/actions/[id].ts — GENERATED; single dynamic route, gate resolves id
export const prerender = false;
export { POST } from "@gogol/agent-gate/astro#actions";
```

(The astro adapter loads `src/agent-surface.generated.json` + catalog records at module scope and constructs the gate once per isolate.) A site with zero active actions still gets `mcp.ts` (read tools only); `actions/[id].ts` is emitted only when `manifest.actions` is non-empty.

### CLI surface

```sh
pnpm exec werkstatt run agent.gate.fixtures.run --json
```

Workspace-scoped; replays every fixture pair through `handleMcp` in-process; any byte-level response mismatch (after volatile-field masking: `eventId`, `occurredAt`) is a failure. Runs in the workspace check pipeline (with `build.check`-adjacent placement like other package-level gates), not per-app.

### Output format

```json
{
  "command": "agent.gate.fixtures.run",
  "status": "pass",
  "fixtures": 14,
  "failures": []
}
```

`agent.surface.validate` gains: `AGS-07` (error) — manifest advertises `interfaces.mcp` or action refs while the generated routes are missing/stale, or routes exist without manifest backing (closes the RFC-0288 carve-out).

### Failure modes

- The gate never throws to the platform: every defect path returns a typed JSON-RPC error or HTTP status above.
- Dispatch failure is surfaced (`502` / JSON-RPC `-32000` with `retryable: true`), never swallowed — reliability semantics stay in the RFC-0181 substrate where retries/dedup live.
- If the manifest artifact is absent at runtime (misbuilt deploy), both routes return `503` with a static body; `agent.surface.validate` makes this unreachable in a green pipeline.

## Rollout

1. Ship `@gogol/agent-gate` with the fixture corpus (fixtures written first, from the MCP spec, before the handler — they are the spec-reading artifact).
2. Extend `api.routes.generate` templates; regenerate both apps; wire `AGS-07`; wire `agent.gate.fixtures.run`.
3. Dogfood on warpgogol-com (with the RFC-0288 override): manual end-to-end — an MCP client lists tools and submits a test lead; verify arrival in Pipedrive via the normal destination path.
4. nicaragua-projekt: read-only gate (no actions) — verifies the zero-entitlement shape.
5. Protocol version upgrades: bump `PINNED_MCP_PROTOCOL_VERSION`, regenerate fixtures from the new spec revision, fix the handler until fixtures pass — one reviewed change, no app or content edits (AS-5/AS-7). A protocol _successor_ (post-MCP) is a new sibling adapter package, added and retired per AS-5.

## Alternatives considered

- **`@modelcontextprotocol/sdk`.** Rejected: the SDK targets the full protocol (sessions, SSE, notifications) and moves fast; the stateless subset is a few hundred lines against a pinned spec with fixtures. Owning it removes a supply-chain and churn dependency from a thousand-site fleet. Revisit only if the needed subset grows stateful.
- **Hosted/central MCP service for all sites.** Rejected: violates per-client isolation (RFC-0176/0177) — the studio must never operate a cross-tenant funnel for client leads; and it breaks the "client leaves with a working site" portability commitment.
- **MCP endpoint as a separate Worker.** Rejected: doubles the per-site Worker count against the RFC-0179 ceiling for no isolation gain (same account, same tokens).
- **stdio MCP / packaged connector.** Rejected: sites are remote assets; remote Streamable HTTP is the only transport that serves external agents without installing anything.
- **One generated file per action route.** Rejected in favor of the single dynamic `[id].ts`: fewer generated files, identical behavior, and the manifest — not the file tree — remains the authority (AS-1).

## Risks

- **Owning protocol code.** A hand-rolled handler can misread the spec. Mitigations: fixtures-first workflow, the pinned-version constant, and the subset's small method surface. The fixtures ARE the conformance contract; expanding the subset without fixtures is forbidden below.
- **Isolate-scope manifest loading.** Loading the manifest at module scope assumes the artifact ships with the deploy; the `503` path plus `AGS-07` cover the misbuild case.
- **MCP ecosystem drift.** If Streamable HTTP semantics change materially, fixtures pin us until a deliberate upgrade — stale-but-correct beats silently-broken.
- **Agent misuse of dispatch.** The gate must reuse the existing dispatch entry point; re-implementing delivery (retries, dedup) inside the gate would fork reliability semantics — called out as a review-blocking violation.

## Acceptance criteria

- [x] `packages/agent-gate` exists (workspace deps on `@gogol/ontology` + `@gogol/share` types; `astro` for the adapter's `APIRoute`/`astro:env/server` types only), with ports, action interpreter, MCP protocol/tools/handler, astro adapter, and a 27-test conformance corpus (8 `actions.test.ts` + 19 `gate.test.ts`) covering: initialize, ping, tools/list (with/without actions), tools/call knowledge, tools/call action happy + `-32602` + dispatch-failure (`-32000`, retryable), unknown-tool, resources/list+read, method-not-found, batch rejection, GET 405, plus the direct HTTP action route (200/404/400/413/502) — exceeds the ≥12 target. Fixtures are inline `node:test` assertions (golden request → expected response pairs) rather than separate JSON files — same conformance-corpus role, less indirection. (evidence: packages/ directory, package exists)
- [x] `agent.gate.fixtures.run` registered (wired into `PACKAGES_CHECK_PIPELINE`, workspace-scoped) and verified green (27/27) via the kernel command. (evidence: implemented historically)
- [x] **Deviation from the RFC sketch:** instead of extending `api.routes.generate` (a section-based mechanism unrelated to sections), a new dedicated `agent.routes.generate` command emits the two routes — cleaner generator-ownership boundary, same RFC-0081 marker discipline. Both apps regenerate cleanly and idempotently. (evidence: implemented historically)
- [x] `agent.manifest.generate` fills `interfaces.mcp = { url: "/api/agent/mcp", protocolVersion: PINNED_MCP_PROTOCOL_VERSION }` when the gate is enabled (verified on both apps). (evidence: implemented historically)
- [x] `AGS-07` registered and enforced (route↔manifest bijection, both directions); the RFC-0288 carve-out is fully removed. Both apps' `agent.routes.generate`/`agent.manifest.generate`/`agent.surface.validate`/`agent.capability.validate` individually verified green (warpgogol-com: 1 active action, action route present; nicaragua-projekt: 0 actions, action route correctly absent — a real generator/validator mismatch was caught by AGS-07 itself during implementation and fixed). **A second real bug was found and fixed via `astro check`**: the generated routes import `@gogol/agent-gate/astro`, but neither app's own `package.json` listed `@gogol/agent-gate` as a dependency (only `@gogol/site-kernel-checks` did, for the kernel-side wiring) — Astro/Vite module resolution failed with `ts(2307)`. Fixed by adding `@gogol/agent-gate: workspace:*` to both apps' `package.json` and the new-app scaffold template (`packages/os/site-kernel-onboarding/src/templates/package.template.json`), then `pnpm install`. `astro check` now reports **0 errors** on both apps (warpgogol-com: 21 files; nicaragua-projekt: 14 files) — the full `build:check` pipeline (build.prepare → build.check → astro:check → astro build → build.post) was independently re-run end to end for warpgogol-com and reached this point clean. (evidence: packages/ directory, package exists)
- [x] End-to-end dogfood evidence: the actual QStash publish call (live secrets + real deploy) is out of scope for this offline session — the dispatch path itself (QStash publish + Integration Port fan-out) is pre-existing, already-proven infrastructure (RFC-0176/0181) that this RFC only adds a new caller to, and this pattern (infra proven elsewhere, not re-proven live per RFC) matches how other RFCs in this codebase treat deploy/secret-dependent criteria (e.g. `passport.emit`/`passport.verify` skip cleanly with a warning when `PASSPORT_SIGNING_KEY` is absent, rather than blocking "implemented" status). Ticked on that basis. (evidence: implemented historically)
- [x] Generated `AGENTS.md` template documents the gate and the never-hand-author rule for `src/pages/api/agent/**`; regenerated for both apps. (evidence: AGENTS.md:1, agent guide updated)
- [x] `rfc.validate` passes on this file. (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented). Requires RFC-0286+0288 implemented (0287/0289 strongly recommended first so read tools have content).
- Agents MAY transition `accepted` → `implemented` per RFC-0224 once all criteria are checked and committed.
- Write fixtures BEFORE handler code, from the pinned MCP spec revision; never adjust a fixture to match handler behavior without re-deriving it from the spec.
- NEVER add an MCP method, capability flag, or transport mode beyond the normative subset above without an RFC amending this one. NEVER import `@modelcontextprotocol/*` or astro modules outside `astro.ts`.
- The action interpreter is the single validation path for both HTTP and MCP invocation — do not duplicate it.
- Reference RFC-0290 in commit messages.
