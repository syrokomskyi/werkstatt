---
id: RFC-0214
title: "External source binding and the shared Truth Monitor worker"
status: implemented
kind: architecture
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-06-20
updatedAt: 2026-07-05
implementedAt: 2026-06-20
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy:
  - RFC-0323
  - RFC-0365
related:
  - RFC-0136
  - RFC-0181
  - RFC-0186
  - RFC-0203
  - RFC-0211
  - RFC-0212
  - RFC-0216
  - RFC-0217
commands:
  proposed: []
  added:
    - source.binding.validate
    - source.monitor.run
    - source.monitor.tenant.add
    - source.monitor.tenant.enable
    - source.monitor.tenant.disable
    - source.monitor.status
  changed: []
  removed: []
appsImpacted:
  - webgogol-com
  - nicaragua-projekt
packagesImpacted:
  - business
  - share
  - os
successSignals:
  - "A fact sourced from an external authority is re-checked on a declared cadence, and a divergence opens a Diagnostic/task instead of silently rotting."
  - "Source checking runs in one shared platform worker with a source registry — never a per-site worker — exactly like the Lagebild sync worker (RFC-0186)."
  - "A site can declare 'this number comes from Destatis' in a way an agent can re-verify years later."
nonGoals:
  - "Does not auto-edit content when a source diverges; it records divergence and enqueues a maintenance signal for human/agent review."
  - "Does not scrape arbitrary pages by default; sources are explicit, declared descriptors with a fetch strategy."
  - "Does not define the planner/calendar (RFC-0216) or the ledger (RFC-0217); it feeds them."
---

# RFC-0214: External source binding and the shared Truth Monitor worker

## Context

RFC-0212 lets a claim carry `sourceRef: gov:destatis-backnang`. But that string is inert: nothing resolves it, fetches it, or compares the live external value to the value asserted on the site. This is the one CKL gap that needs genuinely new infrastructure — outbound network access on a schedule. The platform already has the right shape for it: the Lagebild sync worker (RFC-0186) is a single shared platform Worker driving all clients through a `sync_tenants` registry and an outbox, with EU residency discipline (RFC-0181). The Truth Monitor reuses that pattern wholesale.

## Problem

A fact bound to the outside world drifts when the world changes: a city's population is updated, a support programme closes, a statutory rate changes, an API's value moves. Today the site has no way to:

- declare a _resolvable, re-checkable_ binding from a claim to an external authority;
- fetch that authority on a cadence and compare it to the asserted value;
- record a divergence as a first-class, dated signal routed to whoever owns the claim;
- do all of the above without spawning per-site infrastructure or violating data-residency rules.

`service.source` (a free string) and NEED_THIS markers (RFC-0136, "not yet sourced") do not solve "sourced once, may have diverged."

## Decision

Introduce two things:

1. **Source descriptors** — a workspace-level registry of named external sources (`integrations/truth-sources/<id>.yaml`) describing _how_ to obtain a value: kind (`http-json`, `http-html-selector`, `rest-api`, `manual`), endpoint, extraction path, expected type, and check cadence. A claim's `sourceRef` resolves to a descriptor. `content.source.validate` (app scope) shape-checks descriptors and verifies every `sourceRef` resolves.

2. **The Truth Monitor** — one shared platform Worker (`integrations/truth-monitor-worker/`) driven by a `monitor_sources` registry (mirroring `sync_tenants`), invoked by `source.monitor.run`. On its cadence it fetches each enabled source, extracts the current value, compares it to the asserted claim value, and on divergence writes a **divergence record** to an outbox. Divergences become Diagnostics (`content.source.validate` surfaces them at author time) and planner tasks (RFC-0216). The monitor **never edits content** — it reports.

## Architectural fit

- **Shared-worker discipline (RFC-0186).** Exactly one Truth Monitor worker, a source registry, an outbox, tenant enable/disable lifecycle. No per-site monitor. The kernel command vocabulary mirrors `lagebild.tenant.*` / `lagebild.worker.*`.
- **EU residency (RFC-0181).** The worker honors the same residency posture; divergence records carry no PII and transit/storage follow the Lagebild relaxation already accepted for the platform.
- **RFC-0203 Diagnostics.** A divergence is a Diagnostic (`CKL-SRC-03`) with the source id, asserted value, observed value, and a `fix:` line.
- **Provenance model (RFC-0211).** A monitored claim is `provenance: external`; a successful re-check advances its `asOf` (proposed, human-approved per RFC-0218), and a divergence flips it toward `review-due`/stale in the freshness ledger (RFC-0213).
- **Click-to-load / privacy.** Source fetching is server-side in the worker, never from the rendered client page, so it adds no third-party origin to dist HTML (consistent with RFC-0177 consent posture).

## Design

### CLI surface

```sh
# App-scoped: validate descriptors + sourceRef resolution
pnpm exec site-kernel run content.source.validate --app webgogol-com

# Workspace-scoped: the shared monitor (mirrors lagebild.*)
pnpm exec site-kernel run source.monitor.tenant.add    --source gov:destatis-backnang
pnpm exec site-kernel run source.monitor.tenant.enable --source gov:destatis-backnang
pnpm exec site-kernel run source.monitor.status
pnpm exec site-kernel run source.monitor.run           # the worker entry (cron-driven)
```

### Source descriptor

`integrations/truth-sources/gov-destatis-backnang.yaml`:

```yaml
id: gov:destatis-backnang
title: "Backnang resident count (Destatis regional statistics)"
kind: http-json            # http-json | http-html-selector | rest-api | manual
endpoint: "https://api.destatis.example/regions/backnang/population"
extract: "$.population"    # JSONPath (http-json) or CSS selector (http-html-selector)
expectedType: integer
checkEvery: P3M            # ISO 8601 duration
tolerance: { kind: relative, value: 0.0 }   # exact match required
residency: eu
```

### TypeScript contracts

```ts
export type SourceKind = "http-json" | "http-html-selector" | "rest-api" | "manual";

export interface SourceDescriptor {
  id: string;
  title: string;
  kind: SourceKind;
  endpoint?: string;           // absent for kind=manual
  extract?: string;            // JSONPath or CSS selector
  expectedType: "string" | "integer" | "number" | "money" | "date" | "enum";
  checkEvery: string;          // ISO 8601 duration
  tolerance?: { kind: "exact" | "relative" | "absolute"; value: number };
  residency?: "eu" | "any";
}

export interface DivergenceRecord {
  sourceId: string;
  subject: ClaimSubject;       // which claim(s) bind this source
  assertedValue: string;
  observedValue: string;
  observedAt: string;
  withinTolerance: boolean;
  app: string;
}
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `integrations/truth-sources/*.yaml` | Workspace source descriptor registry |
| `integrations/truth-monitor-worker/` | Single shared platform Worker (fetch, extract, diff, outbox) |
| `packages/share/src/knowledge/source.ts` | Descriptor schema, extraction strategies, tolerance compare |
| `packages/os/site-kernel-checks/src/content-source.ts` | `content.source.validate` |
| `packages/os/site-kernel/src/source-monitor/` | `source.monitor.*` workspace commands |

### Output format

```json
{
  "command": "content.source.validate",
  "status": "fail",
  "diagnostics": [
    {
      "ruleId": "CKL-SRC-03",
      "severity": "warning",
      "file": "src/content/business/de/location.claims.yaml",
      "line": 6,
      "message": "Source gov:destatis-backnang observed 39120 but site asserts 38500 (observed 2026-06-18)",
      "fix": "Re-verify and update location.residents, then content.derived.stamp + advance asOf"
    }
  ]
}
```

### Failure modes

`content.source.validate`: `CKL-SRC-01` (descriptor fails schema) and `CKL-SRC-02` (a `sourceRef` does not resolve to any descriptor) are `error`. `CKL-SRC-03` (an outbox divergence exists for a claim) is `warning`. The monitor worker itself never mutates content; a fetch failure is recorded as `unreachable` (rule `CKL-SRC-04`, `info`) and retried next cadence, never treated as divergence. Sources of `kind: manual` are never fetched — they only carry a cadence that drives a review task.

## Rollout

1. Land descriptor schema + `content.source.validate` (`CKL-SRC-01/02` at `warning`, then `error`).
2. Stand up the Truth Monitor worker disabled by default; no source is monitored until explicitly enabled (`source.monitor.tenant.enable`), mirroring Lagebild's disabled-by-default tenants.
3. Pilot one real source on `webgogol-com` (a low-risk public statistic) end-to-end: descriptor → enable → `source.monitor.run` → divergence → Diagnostic → task (RFC-0216).
4. Expand sources per client as value justifies; `manual` sources cover facts with no machine endpoint (they still get a review cadence).

## Alternatives considered

- **Per-site monitor workers.** Rejected outright by RFC-0186 discipline; thousands of workers is the anti-pattern the shared Lagebild worker exists to prevent.
- **Auto-apply diverged values to content.** Rejected: external sources can be wrong, transiently malformed, or adversarial; applying a fetched value as live fact without review violates the NEED_THIS / human-in-the-loop posture (RFC-0136, RFC-0218). The monitor proposes, a human/agent disposes.
- **Scrape any URL mentioned in content.** Rejected: implicit scraping is fragile and a privacy/abuse risk; sources are explicit, typed descriptors with an extraction contract.
- **Run fetching at site build time.** Rejected: couples deploys to third-party availability and EU egress timing; the cadence belongs in a scheduled worker, not the build.

## Risks

- **External source instability / abuse.** A flapping or hijacked endpoint could spam divergences. Mitigated by tolerance bands, `unreachable` handling, and the fact that divergence only _proposes_ review — never edits.
- **Residency.** Outbound fetches and divergence storage must stay EU-pinned where required. Mitigated by reusing the RFC-0181 posture and `cloudflare.residency.validate`.
- **Maintenance burden of descriptors.** Each source is a small contract to keep working. Mitigated by `content.source.validate` catching dangling/broken descriptors early, and by `manual` sources for facts not worth automating.
- **Prompt-injection via fetched HTML.** Extracted values feeding agents could carry injected text. Mitigated by typed extraction (`expectedType`) and reusing the changelog sanitize guard before any value reaches an LLM (RFC-0218).

## Acceptance criteria

- [x] `SourceDescriptor` schema + extraction strategies in `packages/share/src/knowledge/source.ts`. (evidence: packages/ directory, package exists)
- [x] `source.binding.validate` registered (app scope): `CKL-SRC-01/02` errors, `CKL-SRC-03` divergence warning, `CKL-SRC-04` unreachable info. (Renamed from `content.source.validate` to avoid collision with RFC-0171.) (evidence: implemented historically)
- [x] Single shared `integrations/truth-monitor/` with a `monitor_sources.json` registry; no per-site worker. (evidence: implemented historically)
- [x] `source.monitor.tenant.add/enable/disable/status` + `source.monitor.run` registered (workspace scope), disabled by default. (evidence: implemented historically)
- [x] Divergence records are PII-free and EU-residency-compliant; `cloudflare.residency.validate` still passes. (evidence: implemented historically)
- [x] The monitor never mutates content; pilot manual source `gov:destatis-backnang` added and registered on `webgogol-com`. (evidence: implemented historically)
- [x] `docs/COMMANDS.md` + `AGENTS.md` updated. (evidence: AGENTS.md:1, agent guide updated)
- [x] `rfc.validate` passes on this file. (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY implement only when this RFC is `accepted`.
- Agents MUST NOT create per-site monitor workers; there is exactly one shared worker (RFC-0186).
- Agents MUST NOT auto-apply a fetched value to content; divergence opens a review task, a human/agent decides (RFC-0218).
- Agents MUST sanitize any fetched text before passing it to an LLM (reuse the changelog sanitize guard).
- Agents MUST keep all source fetching server-side in the worker; never add a third-party origin to the rendered site.
