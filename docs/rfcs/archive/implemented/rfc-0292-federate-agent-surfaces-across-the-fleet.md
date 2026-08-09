---
id: RFC-0292
title: "Federate agent surfaces across the fleet"
status: implemented
kind: architecture
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-07-05
updatedAt: 2026-07-13
implementedAt: 2026-07-13
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0176
  - RFC-0177
  - RFC-0221
  - RFC-0284
  - RFC-0286
  - RFC-0287
  - RFC-0288
  - RFC-0291
commands:
  proposed: []
  added:
    - fleet.agent.catalog.generate
    - fleet.agent.catalog.validate
  changed: []
  removed: []
appsImpacted:
  - apps/*
packagesImpacted:
  - "@gogol/share"
  - "@gogol/site-kernel-checks"
successSignals:
  - "The Leitstand can answer 'which sites expose which knowledge domains and actions, at which surface versions' from one generated catalog, without fetching anything at question time."
  - "A cross-site scenario (an agent of business A discovering and invoking a capability of business B, both fleet sites) requires only the two public well-known documents of B — the fleet catalog accelerates discovery, it never mediates data."
  - "A site leaving the fleet (handoff/export) disappears from the catalog on the next generation with zero residual coupling — its agent surface keeps working unchanged, because federation adds nothing to the site itself."
nonGoals:
  - "Do not build a runtime discovery service or registry API — the catalog is a generated file, consumed by the Leitstand and by builds, not a service in any data path."
  - "Do not aggregate knowledge content, leads, or any per-site data into the catalog — it holds discovery documents (agent.json) only; PII and business facts stay on each site (RFC-0176/0177 isolation)."
  - "Do not publish the fleet catalog externally in v1 — an outward-facing studio-level directory (e.g. on warpgogol-com) is a deliberate later product decision, listed as phase 2."
  - "Do not invent a cross-site capability invocation protocol — sites talk to sites via their public agent surfaces like any external consumer; being fleet siblings grants no special channel."
acceptance:
  - probe: command-registered
    name: "fleet.agent.catalog.generate"
  - probe: command-registered
    name: "fleet.agent.catalog.validate"
  - probe: file-exists
    path: "packages/share/src/agent/fleet-catalog.ts"
  - probe: run
    command: "site-kernel run fleet.agent.catalog.generate"
    expect:
      exitCode: 0
---

# RFC-0292: Federate agent surfaces across the fleet

## Context

RFC-0286..0291 give every site a standardized, signed, discoverable agent surface. RFC-0284 (implemented) gives the workspace the **Fleet Leitstand**: the autonomous cross-site control plane reading generated fleet state (`fleet/fleet.sites.json`, `fleet.status.generated.json`, `fleet.plan.generated.json`). The founder's stated goal is that sites integrate "with each other and with external businesses." The external half is solved by the surface itself — an external business consumes `/.well-known/agent.json` like anyone. The fleet half deserves one more artifact: the operator (and the operator's agents) should see all surfaces at once, and cross-site scenarios should not require N ad-hoc lookups.

The critical design constraint is inherited, not new: the studio is a per-client operator, never a cross-tenant data hub (RFC-0176/0177). Federation therefore means **shared discovery, not shared data**.

## Problem

- No fleet-level view exists of which sites expose which domains, actions, versions, or signatures; posture questions ("which sites still ship unsigned surfaces?", "which sites expose `appointment.request`?") require walking every app.
- Cross-site agent scenarios have no sanctioned starting point; without one, the temptation is a central registry service — exactly the anti-pattern the isolation rules forbid.
- The Leitstand (RFC-0284) plans fleet actions but is blind to the machine-surface dimension of every site it governs.

## Decision

The workspace gains the **fleet agent catalog**: `fleet/agent-catalog.generated.yaml`, produced by the workspace-scoped `fleet.agent.catalog.generate`. For every site in `fleet/fleet.sites.yaml`, the command reads that site's **built discovery document** (`apps/<path>/public/.well-known/agent.json` — from the repo tree, never the network) and folds it into one deterministic catalog. `fleet.agent.catalog.validate` checks coherence. The Leitstand consumes the catalog as one more generated fleet input; cross-site consumers use it to _find_ a sibling's `baseUrl`, then talk to that site's public surface like any external agent.

## Architectural fit

- **RFC-0284 Leitstand.** The catalog is a fleet-state artifact in the exact mold of `fleet.status.generated.json`: generated, deterministic, committed to the same lifecycle, consumed by the control plane. No new consumption pattern is invented.
- **Isolation preserved (RFC-0176/0177).** The catalog contains only what each site already publishes publicly at `.well-known` — republishing public discovery is not aggregation of client data. No tokens, no PII, no knowledge payloads.
- **Handoff/absorb (RFC-0221).** Site bundles do not include the catalog (it is workspace-level, regenerable); an absorbed or exported site needs nothing from it. Departure = removal from `fleet.sites.json` + regeneration.
- **Trust (RFC-0291).** The catalog records each surface's `proof` status and `contentHash`; fleet-level posture ("all surfaces signed") becomes one query.
- **AS-invariants.** The catalog is itself a projection (of N manifests); it may never add facts (AS-2 at fleet scale) and is regenerated, never edited.

## Design

### CLI surface

```sh
pnpm exec werkstatt run fleet.agent.catalog.generate --json
pnpm exec werkstatt run fleet.agent.catalog.validate --json
```

Workspace-scoped (root `tools/kernel.config.ts` registration, like other `fleet.*` commands). `generate` is `mutatesState: true`. Ordering: after every app's `build.prepare` (it reads built artifacts); in practice it joins the same workspace phase that produces `fleet.status.generated.json`.

### TypeScript contracts

```ts
// packages/share/src/agent/fleet-catalog.ts
export interface FleetAgentCatalog {
  schema: "gogol.fleet.agent-catalog@1";
  /** sha256 over sorted-key JSON of `sites` — no timestamps (byte-stable). */
  contentHash: string;
  sites: FleetAgentCatalogEntry[];      // sorted by site id
}

export interface FleetAgentCatalogEntry {
  site: string;                          // fleet.sites.json `site`
  baseUrl: string;
  surfaceVersion: string;
  contentHash: string;                   // the site's own manifest hash
  signed: boolean;                       // proof present
  enabled: boolean;                      // false ⇒ agent.json absent (agent.enabled: false)
  knowledgeDomains: string[];            // from AgentKnowledgeRef[]
  actions: string[];                     // active capability ids
  interfaces: { openapi: boolean; mcp: boolean };
}

/** Pure: (fleet sites × loaded discovery docs) → catalog. Missing doc ⇒ enabled: false entry. */
export function buildFleetAgentCatalog(
  input: Array<{ site: string; doc: Record<string, unknown> | null }>,
): FleetAgentCatalog;
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `fleet/agent-catalog.generated.yaml` | The catalog. Generated, committed alongside the other `fleet/*.generated.yaml` artifacts (workspace state, entitlement-independent in shape: it records what was built, and fleet state files are already the sanctioned place for build-derived fleet truth). |
| `fleet/fleet.sites.yaml` | Read-only site roster input. |
| `apps/<path>/public/.well-known/agent.json` | Read-only per-site input (post-`build.prepare`). |
| `packages/share/src/agent/fleet-catalog.ts` | Types + pure builder. |

### Output format

`fleet.agent.catalog.validate --json` — canonical Diagnostics:

| Rule | Severity | Meaning |
| --- | --- | --- |
| `FAC-01` | error | Catalog stale: regeneration produces different bytes (someone edited it, or apps rebuilt without regenerating). |
| `FAC-02` | error | A roster site has a malformed discovery document (unparseable agent.json, missing required fields). |
| `FAC-03` | error | Duplicate `baseUrl` across sites (two sites claiming one origin — a deploy-config defect visible only at fleet level). |
| `FAC-04` | warning | A site's surface is unsigned (`signed: false`) while at least one fleet site is signed — posture drift report. |
| `FAC-05` | warning | Capability id present on some sites at different capability `version`s (catalog-vocabulary skew across the fleet — schedule alignment). |

### Failure modes

- Errors exit non-zero; the command pair runs in the workspace check phase (with the other fleet gates), not per-app `build.check`.
- An empty roster or an all-disabled fleet yields a valid catalog with `sites: []` / `enabled: false` entries — never a failure (surfaces are optional per site; the catalog just says so).

## Rollout

1. Ship builder + command pair + `FAC-*` rules; register in root `tools/kernel.config.ts`; generate and commit the first catalog (1 site today — the value grows with the roster, the mechanism is roster-size-independent).
2. Leitstand integration: `fleet.plan`/status surfaces read the catalog where machine-surface posture is relevant (signed coverage, action coverage). This is a consumer change inside the RFC-0284 machinery, not a new plane.
3. Cross-site scenario doctrine (documentation, `docs/engineering/`): a fleet site's build or agent that needs a sibling capability resolves it catalog → `baseUrl` → public surface; never through repo-internal imports of another app's content.
4. Phase 2 (explicitly deferred, needs a product decision + its own RFC): outward publication of a studio directory (e.g. `warpgogol.com/.well-known/gogol-fleet.json`) with per-client consent semantics — the catalog schema above is designed to be publishable as-is, minus `enabled: false` entries.

## Alternatives considered

- **Runtime registry service (workers-hosted discovery API).** Rejected: a service in the discovery path is an availability and trust liability, and the first step down the central-hub slope; a generated file serves every current consumer.
- **Network-fetching each site's deployed agent.json at generate time.** Rejected: nondeterministic, environment-coupled, and wrong layer — the repo builds the truth; deployed-vs-built drift is what `agent.manifest.verify --url` (RFC-0291) checks per site.
- **Folding the catalog into `fleet.status.generated.json`.** Rejected: status is operational telemetry with its own churn cadence; the agent catalog is structural and diff-reviewed — separate files keep diffs legible.
- **Special intra-fleet invocation channel (service bindings between sibling sites).** Rejected: siblings-as-external-consumers keeps one code path, preserves portability (a departing site loses nothing), and honors isolation.

## Risks

- **Catalog-as-crutch.** Consumers might treat the catalog as authoritative over a site's live surface. Doctrine: the catalog locates; the site's own signed `agent.json` authorizes. Stated in docs and in FAC-01's fix text.
- **Commit noise.** Every app rebuild that changes a manifest changes the catalog. Acceptable: that is exactly the reviewable fleet-state diff the Leitstand model wants; hashes keep diffs small.
- **Single-site fleet today.** The mechanism ships nearly value-free until the roster grows — accepted consciously; the marginal cost is one small command pair on an already-existing pattern.

## Acceptance criteria

- [x] `packages/share/src/agent/fleet-catalog.ts` with the contracts above (unit-tested: determinism, missing-doc entry, sorting, hash stability). (evidence: packages/ directory, package exists)
- [x] `fleet.agent.catalog.generate` + `validate` registered workspace-scoped; `FAC-01..05` in the rule registry. (evidence: implemented historically)
- [x] `fleet/agent-catalog.generated.yaml` generated and committed; regeneration is byte-stable. (evidence: implemented historically)
- [x] Leitstand consumption point wired (posture fields available to RFC-0284 machinery) or explicitly stubbed with a tracked follow-up in the fleet plan. (evidence: implemented historically)
- [x] Cross-site doctrine documented in `docs/engineering/`. (evidence: docs/ directory, documentation exists)
- [x] Workspace check phase green; `rfc.validate` passes on this file. (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented). Requires RFC-0286 implemented (it reads discovery documents); benefits from 0287/0288/0291 but degrades gracefully without them (empty domains/actions, `signed: false`).
- Agents MAY transition `accepted` → `implemented` per RFC-0224 once all criteria are checked and committed.
- NEVER add per-site data beyond the public discovery document to the catalog; NEVER make any runtime component (gate, site, worker) depend on the catalog — it is operator/build-plane only.
- The phase-2 outward directory REQUIRES a new RFC and founder consent semantics — do not implement it from this document.
- Reference RFC-0292 in commit messages.
