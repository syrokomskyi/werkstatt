---
id: RFC-0798
title: "Add lead.submit as first agent-callable capability"
status: accepted
kind: policy
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
  - RFC-0286
  - RFC-0288
  - RFC-0289
  - RFC-0290
  - RFC-0291
  - RFC-0789
satisfies: []
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
  - "agent.json actions array is non-empty after build"
  - "agent.openapi.json contains /api/agent/actions/lead.submit path"
  - "MCP tools/list returns action.lead.submit"
  - "agent.capability.validate passes with lead.submit active"
nonGoals:
  - "Payable layer (x402) — deferred to a future RFC"
  - "Server-side MCP transport beyond the existing streamable-http endpoint"
---

# RFC-0798: Add lead.submit as first agent-callable capability

## Context

The Agent Surface infrastructure (RFC-0286 through RFC-0291) is fully built: manifests, OpenAPI projections, MCP handler, rate limiting, QStash dispatch — all operational. The `agent.actions` entitlement is enabled on warpgogol-com. However, the capability catalog at `packages/werkstatt-site/src/domain/ontology/capabilities/` contains zero YAML files, so `agent.json` emits `"actions": []`, the OpenAPI spec has no action paths, and MCP `tools/list` returns only knowledge-read tools.

The "Callable" layer of the Agentic Internet is architecturally complete but functionally empty. This RFC activates it by introducing `lead.submit` — the natural first capability that maps to the existing `send-message` section archetype already rendered on `/kontakt/` and `/verantwortungsvolle-empfehlungen/`.

The capability YAML file at `packages/werkstatt-site/src/domain/ontology/capabilities/lead.submit.yaml` pre-exists this RFC as a proof-of-concept artifact. This RFC formalizes it: the file's content is normative, and breaking changes require a version bump and an amending RFC.

## Problem

The closed capability catalog (RFC-0288) defines the schema and validation infrastructure but declares no actual capabilities. Sites with `agent.actions` enabled produce empty action arrays in all agent surface projections. Agents discovering the site via `agent.json`, `agent.openapi.json`, or MCP `tools/list` find no callable actions — the Callable layer is inert.

## Decision

The capability catalog gains its first record: `lead.submit` — an action that accepts a contact name, email, and message, and dispatches a `lead` integration event via the existing QStash pipeline (RFC-0290). The capability requires the `agent.actions` entitlement (already held by warpgogol-com) and the `send-message` section archetype (already rendered on two pages).

## Architectural fit

- **RFC-0288 (capability catalog):** `lead.submit` is the first concrete instance of the closed catalog pattern. The schema, validation, and resolution infrastructure already exist — this RFC only adds a YAML file.
- **RFC-0286 (agent manifest):** `agent.manifest.generate` already calls `resolveActiveCapabilities` and projects active capabilities into `agent.json` actions. No code change needed — adding the YAML file makes the pipeline produce non-empty actions.
- **RFC-0289 (OpenAPI):** `agent.openapi.generate` already projects active capabilities into OpenAPI paths. No code change needed.
- **RFC-0290 (MCP routes):** `agent.routes.generate` already emits the action route file when `activeCapabilities.length > 0`. No code change needed.
- **RFC-0291 (rate limiting):** The per-IP fixed-window limiter is already wired. The capability's `limits` field controls the threshold.
- **AS-2 (human parity):** `humanEquivalent.sectionType: "send-message"` satisfies the human-parity contract — a human visitor can submit the same lead via the rendered contact form.

## Design

### CLI surface

No new commands. The existing pipeline commands activate the capability automatically:

```sh
pnpm exec werkstatt run agent.capability.validate --site warpgogol-com
pnpm exec werkstatt run agent.manifest.generate --site warpgogol-com
pnpm exec werkstatt run agent.openapi.generate --site warpgogol-com
pnpm exec werkstatt run agent.routes.generate --site warpgogol-com
```

### TypeScript contracts

No new types. The `CapabilityRecord` schema (RFC-0288) already defines the shape. The `lead.submit` capability conforms to it:

```yaml
id: lead.submit
version: 1
kind: action
title:
  de: "Anfrage senden"
  en: "Submit a lead"
description:
  de: "Reicht eine Kontaktanfrage (Name, E-Mail, Nachricht) beim Gewerbe ein. Die Anfrage wird asynchron zugestellt — die Bestätigung signalisiert Annahme, nicht Zustellung."
  en: "Submit a contact request (name, email, message) to the business. The request is delivered asynchronously — the confirmation signals acceptance, not delivery."
input:
  type: object
  required: [name, email, message]
  additionalProperties: false
  properties:
    name:
      type: string
      minLength: 1
      maxLength: 200
    email:
      type: string
      format: email
      maxLength: 254
    message:
      type: string
      minLength: 1
      maxLength: 5000
output:
  type: object
  required: [accepted]
  additionalProperties: false
  properties:
    accepted:
      type: boolean
integration:
  eventKind: lead
  source: agent
requires:
  entitlements: [agent.actions]
  sections: [send-message]
humanEquivalent:
  sectionType: send-message
limits:
  perMinutePerIp: 3
  maxPayloadBytes: 10240
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/werkstatt-site/src/domain/ontology/capabilities/lead.submit.yaml` | New capability catalog record |
| `missions/<id>/workpiece/public/.well-known/agent.json` | Generated — actions array now non-empty |
| `missions/<id>/workpiece/public/.well-known/agent.openapi.json` | Generated — new `/api/agent/actions/lead.submit` path |
| `missions/<id>/workpiece/src/pages/api/agent/actions/[id].ts` | Generated by `agent.routes.generate` when first capability activates |

### Output format

No changes to existing output formats. The `agent.json` actions array transitions from `[]` to `[{ id: "lead.submit", url: "/api/agent/actions/lead.submit", ... }]`.

### Failure modes

- **AGC-03 (human parity):** If `send-message` sections are removed from all pages, `agent.capability.validate` reports the violation. The capability becomes inactive and actions revert to empty.
- **AGC-02 (integration source):** The `integration.source: "agent"` field is enforced at catalog load time.
- **Rate limiting:** Exceeding `perMinutePerIp: 3` returns a retryable `SERVER_ERROR` with `retryAfterSeconds`.
- **Site-wide activation:** `resolveActiveCapabilities` checks if `send-message` renders on _any_ page — the capability is then active site-wide, not per-page. Removing `send-message` from all pages deactivates the capability (AGC-03).

## Rollout

- **Default behavior:** Adding the YAML file to the catalog immediately makes `lead.submit` active on all sites with `agent.actions` entitlement and a rendered `send-message` section. No flag day.
- **Existing apps:** Sites without `agent.actions` or without `send-message` sections are unaffected — `resolveActiveCapabilities` gates them out.
- **New apps:** Automatically comply if they enable `agent.actions` and render a `send-message` section.
- **Disabling:** `agent.actionsDisabled: [lead.submit]` in `system.md` withholds the capability per-site without removing the catalog record.
- **Pipeline integration:** `build.check` already runs `agent.capability.validate`; `build.prepare` already runs `agent.manifest.generate`, `agent.openapi.generate`, and `agent.routes.generate`.

## Alternatives considered

- **Multiple capabilities at once:** Rejected — starting with one capability validates the end-to-end pipeline before adding complexity.
- **A generic `contact.submit` instead of `lead.submit`:** Rejected — `lead` is the integration event kind already defined in the schema (`eventKind: "lead" | "message" | "appointment"`). Naming alignment between capability id and event kind reduces cognitive load.
- **Adding entitlement gating beyond `agent.actions`:** Rejected — `agent.actions` is the universal gate for the action tier. Per-capability entitlements can be added later via `requires.entitlements` if needed.

## Risks

- **Spam/abuse:** Rate limiting (3/min/IP) and payload size cap (10 KB) mitigate. QStash idempotency ledger prevents double-writes. The existing `send-message` section already handles human-submitted leads via the same QStash pipeline — this adds an agent-facing entry point, not a new dispatch path. Agent-submitted and human-submitted leads produce indistinguishable integration events (`eventKind: lead`), so downstream CRM/integration logic does not need to distinguish the source.
- **Schema evolution:** `version: 1` in the YAML file. Breaking input/output changes require a version bump and an amending RFC.
- **False agent expectations:** Agents may expect immediate synchronous confirmation. The output `{ accepted: true }` signals acceptance, not delivery — QStash handles async delivery.

## Acceptance criteria

- [ ] `lead.submit.yaml` exists in the capability catalog directory
- [ ] `agent.capability.validate --site warpgogol-com` passes
- [ ] `agent.manifest.generate --site warpgogol-com` produces non-empty actions
- [ ] `agent.openapi.json` contains the `/api/agent/actions/lead.submit` path
- [ ] `agent.routes.generate` emits `src/pages/api/agent/actions/[id].ts`
- [ ] MCP `tools/list` includes `action.lead.submit`
- [ ] `agent.capability.validate` passes on sites without `send-message` (capability inactive, no AGC-03)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- The capability YAML file is the sole artifact — no package source code changes are needed. The pipeline commands (manifest, openapi, routes) pick it up automatically.
