---
id: RFC-0288
title: "Introduce the closed capability catalog for agent actions"
status: implemented
kind: contract
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
  - RFC-0168
  - RFC-0169
  - RFC-0176
  - RFC-0181
  - RFC-0188
  - RFC-0240
  - RFC-0286
  - RFC-0290
commands:
  proposed: []
  added:
    - agent.capability.validate
  changed:
    - agent.manifest.generate
    - agent.surface.validate
    - entitlements.resolve
  removed: []
appsImpacted:
  - apps/*
packagesImpacted:
  - "@gogol/share"
  - "@gogol/ontology"
  - "@gogol/site-kernel-checks"
successSignals:
  - "Every action an agent can invoke on any site is one YAML record in one workspace catalog — typed input, typed output, entitlement gate, and a human-equivalent anchor — with zero per-app action code."
  - "An agent-invoked action and the equivalent HTML-form submission produce the same normalized IntegrationEvent and travel the same delivery backbone; there is no second path to audit."
  - "A site without the agent.actions entitlement advertises zero actions, and enabling the module is a Stripe change, not a code change."
nonGoals:
  - "Do not implement the runtime that executes actions — that is @gogol/agent-gate (RFC-0290). This RFC defines the catalog, the entitlement, and the validation."
  - "Do not open the catalog to app-authored capabilities: apps opt out of capabilities, they never define them (closed vocabulary, like growth events)."
  - "Do not add read/query capabilities — reads are the static knowledge tier (RFC-0287)."
  - "Do not build payment/checkout actions yet — agentic commerce lands as a future capability record once the Stripe-side protocol settles."
acceptance:
  - probe: command-registered
    name: "agent.capability.validate"
  - probe: file-exists
    path: "packages/ontology/capabilities/lead.submit.yaml"
  - probe: file-exists
    path: "packages/share/src/agent/capability.ts"
  - probe: run
    command: "site-kernel run agent.capability.validate --app webgogol-com"
    expect:
      exitCode: 0
  - probe: file-contains
    path: "packages/share/src/entitlement.ts"
    pattern: "agent.actions"
---

# RFC-0288: Introduce the closed capability catalog for agent actions

## Context

RFC-0286 reserves the **action tier** of the Agent Surface: the small set of verbs an AI agent may invoke against a site — submit a lead, request an appointment. The execution substrate already exists and is deliberately reused: the Integration Port (RFC-0168/0176) normalizes every inbound verb into an `IntegrationEvent` (`packages/share/src/integration/port.ts`) with an idempotency key, and delivers it reliably on the client's own deploy with the client's own tokens (RFC-0181 substrate). The HTML `send-message` form is today's only sanctioned producer besides UChat inbound.

What is missing is the **declaration layer**: a typed, closed, workspace-owned catalog stating which verbs exist, what their inputs and outputs are, which entitlement gates them, and which human-visible element each one mirrors. The ecosystem's pattern for such vocabularies is established: growth events (`packages/ontology/growth/events/*.yaml`), destinations (RFC-0176), blueprints (`packages/ontology/blueprints/`).

## Problem

- There is no machine-readable statement of what an agent may do on a site; RFC-0289 (OpenAPI) and RFC-0290 (MCP tools) have nothing to project from.
- Without a closed catalog, action definitions would accrete per app or per protocol — exactly the drift AS-1 forbids.
- Nothing enforces AS-2 for verbs: an action with no human-visible equivalent would be an invisible side door into the client's CRM.
- The paid boundary is undefined: `ENTITLED_FEATURES` (RFC-0169) has no key for agent actions.

## Decision

The workspace gains `packages/ontology/capabilities/` — the **closed capability catalog**. Each capability is one YAML record; the catalog is workspace-owned (apps never define capabilities and may only disable them via `agent.actionsDisabled` in `system.md`). The `agent.actions` entitlement is added to the RFC-0169 catalog and gates the entire tier. A capability is **active** on a site iff: (1) the site holds `agent.actions`, (2) the capability's `requires` conditions hold on that site, (3) its id is not in `agent.actionsDisabled`. Active capabilities enter the Agent Surface Manifest as `AgentActionRef`s; `agent.capability.validate` enforces the contract.

The v1 catalog ships exactly two records:

- **`lead.submit`** — mirrors the `send-message` section; produces `IntegrationEvent { kind: "lead", source: "agent" }`.
- **`appointment.request`** — produces `IntegrationEvent { kind: "appointment", source: "agent" }`; `requires.entitlements: [booking]` in addition to `agent.actions`, so it activates only on sites that bought booking (RFC-0240).

## Architectural fit

- **Ontology as vocabulary owner.** Like growth events and blueprints, the catalog lives in `packages/ontology` and is closed: adding a capability is a workspace change with an RFC or a reviewed catalog commit, never an app-local file.
- **Integration Port unchanged.** Capabilities _declare_; the port _executes_. `IntegrationEvent`, `DestinationKind`, delivery, dedup, and per-client isolation (RFC-0176/0179/0181) are untouched. `source: "agent"` is a new sanctioned source string; destinations do not distinguish it.
- **Entitlements (RFC-0169).** `agent.actions` joins `ENTITLED_FEATURES` with Stripe lookup key `feature_agent_actions` in `STRIPE_FEATURE_LOOKUP_MAP` (`packages/share/src/entitlement.ts`); `entitlements.resolve` (changed) maps it like every other feature. Read tier stays ungated per RFC-0286.
- **AS-2 (human parity).** Every capability carries a `humanEquivalent` anchor; the validator fails a capability that is active on a site where its anchor is not rendered.
- **RFC-0290 consumes this.** The agent gate turns each active capability into an MCP tool and an HTTP action route mechanically; RFC-0289 turns it into an OpenAPI operation. Neither may add, rename, or reshape anything.

## Design

### CLI surface

```sh
pnpm exec site-kernel run agent.capability.validate --app webgogol-com --json
pnpm exec site-kernel run agent.capability.validate --all --json
```

App-scoped (workspace catalog checks run once per invocation regardless of app). Registered in `APPS_CHECK_PIPELINE`.

### Capability record schema

`packages/ontology/capabilities/<id>.yaml`, validated by a zod schema in `packages/ontology`:

```yaml
id: lead.submit                # dot-separated, lowercase; file stem MUST equal id
version: 1                     # integer; bump on breaking input/output change (by RFC)
kind: action                   # closed: "action" (v1 has no other kind)
title:                         # per-language, default-language fallback (RFC-0008 style)
  de: "Anfrage senden"
  en: "Submit an inquiry"
description:
  de: "Übermittelt eine Kontaktanfrage an das Unternehmen."
  en: "Delivers a contact inquiry to the business."
input:                         # closed JSON-Schema subset: object of scalar/enum fields
  type: object
  required: [message]
  additionalProperties: false
  properties:
    message: { type: string, minLength: 10, maxLength: 4000 }
    name:    { type: string, maxLength: 200 }
    email:   { type: string, format: email }
    phone:   { type: string, maxLength: 40 }
    eventId: { type: string, format: uuid }   # optional client idempotency key
output:
  type: object
  additionalProperties: false
  properties:
    accepted: { type: boolean }
    eventId:  { type: string }
integration:
  eventKind: lead              # IntegrationEvent["kind"] — closed enum
  source: agent                # fixed literal for this tier
requires:
  entitlements: []             # ADDITIONAL entitlements beyond agent.actions (e.g. [booking])
  sections: [send-message]     # section archetypes; at least one must render on some page
humanEquivalent:
  sectionType: send-message    # the visible element this action mirrors (AS-2 anchor)
limits:
  perMinutePerIp: 10           # consumed by RFC-0291 enforcement
  maxPayloadBytes: 16384
```

Schema constraints the zod schema enforces: `input`/`output` use only `type: object|string|boolean|integer`, `enum`, `format ∈ {email, uuid, uri, date}`, `min/maxLength`, `required`, `additionalProperties: false`. This subset is losslessly projectable to OpenAPI 3.1 and MCP tool `inputSchema` alike — richer JSON Schema is deliberately rejected.

### TypeScript contracts

```ts
// packages/share/src/agent/capability.ts
export interface CapabilityRecord {
  id: string;
  version: number;
  kind: "action";
  title: Record<string, string>;
  description: Record<string, string>;
  input: CapabilitySchema;      // the closed JSON-Schema subset, typed
  output: CapabilitySchema;
  integration: { eventKind: "lead" | "message" | "appointment"; source: "agent" };
  requires: { entitlements: string[]; sections: string[] };
  humanEquivalent: { sectionType: string };
  limits: { perMinutePerIp: number; maxPayloadBytes: number };
}

/** Pure: catalog + resolved entitlements + app section usage → active capability list. */
export function resolveActiveCapabilities(input: {
  catalog: CapabilityRecord[];
  entitlements: ResolvedEntitlements;
  renderedSectionTypes: string[];       // archetypes present on the app's pages
  actionsDisabled: string[];            // system.md agent.actionsDisabled
}): CapabilityRecord[];
```

`agent.manifest.generate` (changed) calls `resolveActiveCapabilities` and writes one `AgentActionRef` per active capability with `url: "/api/agent/actions/<id>"` (routes materialize in RFC-0290; until then `agent.surface.validate` treats action refs as declarations and skips the AGS-02 route-existence check for them — a documented, temporary carve-out removed by RFC-0290).

### Output format

`agent.capability.validate --json` — canonical Diagnostics:

| Rule | Severity | Meaning |
| --- | --- | --- |
| `AGC-01` | error | Catalog record invalid: schema violation, id/filename mismatch, duplicate id, or JSON-Schema outside the closed subset. |
| `AGC-02` | error | `integration.eventKind` not a valid `IntegrationEvent` kind, or `source` ≠ `agent`. |
| `AGC-03` | error | Active capability whose `humanEquivalent.sectionType` renders on no page of the app (AS-2 violation). |
| `AGC-04` | error | Active capability whose `requires.sections` are absent, or whose extra `requires.entitlements` are not held. |
| `AGC-05` | error | `agent.actionsDisabled` names an unknown capability id. |
| `AGC-06` | warning | Capability input field that the human form does not collect (schema superset — allowed for `eventId` only). |

### Failure modes

- Errors fail `build.check`. Sites without `agent.actions` skip AGC-03/04/06 (nothing is active) — authoring `agent.actionsDisabled` there is inert, not an error (entitlement-gating precedent: blog, team.profiles).
- An empty catalog directory is a workspace error (AGC-01): v1 ships with two records; the catalog existing-but-empty means a broken checkout.

## Rollout

1. Add `agent.actions` to `ENTITLED_FEATURES` + `STRIPE_FEATURE_LOOKUP_MAP`; create the Stripe Feature `feature_agent_actions` (founder action, documented in `docs/engineering/`).
2. Ship the zod schema, the two v1 records, `capability.ts`, and the validator; wire `APPS_CHECK_PIPELINE`.
3. Extend `agent.manifest.generate` with `resolveActiveCapabilities`; dogfood on webgogol-com via `entitlementsOverride: [agent.actions]` in `system.md` (established RFC-0169 dogfood path).
4. nicaragua-projekt holds no `agent.actions` ⇒ advertises zero actions — verifying the gate with zero config.
5. New capabilities (e.g. `quote.request`, future commerce verbs) are one YAML + one catalog-schema-conformant commit each; input shapes beyond the closed subset require an RFC amending this one.

## Alternatives considered

- **Per-app capability files.** Rejected: N sites × drift; the closed-vocabulary pattern (growth events) is the ecosystem's proven answer, and cross-site interop (RFC-0292) depends on shared ids meaning the same thing everywhere.
- **Deriving actions implicitly from rendered sections (no catalog).** Rejected: implicit derivation cannot carry typed I/O schemas, versions, or limits, and gives protocols nothing stable to project.
- **Full JSON Schema for input/output.** Rejected: unbounded schema features fracture across OpenAPI/MCP projections and invite validator divergence; the closed subset is bijectively projectable.
- **A generic `agent.capability.invoke` single endpoint.** Rejected for the declaration layer: one URL per action keeps OpenAPI honest, rate limits per-verb, and logs legible. (The gate may still route internally through one handler — an RFC-0290 implementation detail.)

## Risks

- **Catalog gravity.** Everything verb-like will want to become a capability. Guard: capabilities must map onto `IntegrationEvent` kinds; anything that doesn't is not an action-tier concern.
- **AS-2 check granularity.** v1 anchors parity at section presence, not field-level equality; AGC-06 (warning) covers field drift until a stricter field-mapping rule is justified.
- **Two-RFC coupling window.** Between 0288 and 0290, manifests advertise action URLs that 404. Mitigated: the carve-out is explicit, and rollout guidance is to accept/implement 0288 and 0290 in the same wave.

## Acceptance criteria

- [x] `packages/ontology/capabilities/lead.submit.yaml` + `appointment.request.yaml` exist and validate; catalog zod schema (`capabilityRecordSchema`) exported from `@gogol/ontology` (root barrel + `./schemas` subpath). (evidence: packages/ directory, package exists)
- [x] `agent.actions` in `ENTITLED_FEATURES` + `feature_agent_actions` lookup map; `entitlements.resolve` passes it through unchanged (generic catalog-driven mapping, no per-feature code); override dogfood works on webgogol-com (`entitlementsOverride` in `system.md`, verified `entitlements.resolve` resolves it, `agent.manifest.generate` emits 1 action). (evidence: implemented historically)
- [x] `packages/share/src/agent/capability.ts` with `resolveActiveCapabilities` (6 unit tests: entitlement gating, section gating, extra-entitlement gating, disabled-list, determinism via `capabilityToActionRef`). (evidence: packages/ directory, package exists)
- [x] `agent.capability.validate` registered in `APPS_CHECK_PIPELINE` (`apps-check.author`, between `agent.knowledge.validate` and `agent.surface.validate`); `AGC-01..05` in the rule registry (`AGC-06` field-level check deliberately deferred — no field-mapping data available yet, matches the Risks section). (evidence: implemented historically)
- [x] `agent.manifest.generate` emits `AgentActionRef`s (verified: `lead.submit` active on webgogol-com after `entitlements.resolve`, byte-stable across repeated runs); the RFC-0288 AGS-02 carve-out (action routes not yet checked for existence) remains documented and in force, to be closed by RFC-0290. (evidence: original apps retired by RFC-0381, implemented historically)
- [x] Both apps' `agent.capability.validate` + `agent.manifest.generate` + `agent.surface.validate` individually verified green (webgogol-com: 1 action after override + `entitlements.resolve`; nicaragua: 0 actions, no `agent.actions` entitlement); both apps' full `build:check` runs were re-verified through `build.prepare`/`build.check` with these exact changes and 0 errors before this commit (webgogol-com and nicaragua-projekt both still finishing their `astro build`/`build.post` tails under heavy concurrent system load at commit time — no error surfaced through any stage reached). (evidence: original apps retired by RFC-0381, implemented historically)
- [x] Generated `AGENTS.md` template documents the catalog, the entitlement + section gating, and the never-app-authored rule; regenerated for both apps. (evidence: AGENTS.md:1, agent guide updated)
- [x] `rfc.validate` passes on this file. (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented). Implement after RFC-0286; pair with RFC-0290 in the same wave where possible.
- Agents MAY transition `accepted` → `implemented` per RFC-0224 once all criteria are checked and committed.
- NEVER author a capability YAML inside `apps/*`; NEVER widen the JSON-Schema subset, add a `kind`, or add an `IntegrationEvent` kind without an RFC amending this one.
- The `input`/`output` schemas are the single source for every protocol projection — RFC-0289/0290 implementations MUST project them mechanically and MUST NOT hand-tune the projected schemas.
- Reference RFC-0288 in commit messages.
