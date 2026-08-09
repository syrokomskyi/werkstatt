---
id: RFC-0339
title: "Export Cloudflare Workers traces to the observability backend"
status: implemented
kind: command
scope: workspace
owners:
  - architecture
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-07-07
updatedAt: 2026-07-07
implementedAt: 2026-07-07
closedAt:
supersedes: []
supersededBy:
amends:
  - RFC-0149
amendedBy:
  - RFC-0365
related:
  - RFC-0081
  - RFC-0182
  - RFC-0304
  - RFC-0336
  - RFC-0337
  - RFC-0338
commands:
  proposed: []
  added:
    - observability.workers.validate
  changed: []
  removed: []
appsImpacted:
  - warpgogol-com
  - nicaragua-projekt
  - check-warpgogol-com
packagesImpacted:
  - "@gogol/site-kernel-observability"
  - "@gogol/site-kernel-onboarding"
successSignals:
  - "Every deployed Worker (site workers, backs workers, integration workers) exports traces to the SigNoz backend through one Cloudflare destination named signoz."
  - "The traces block lives in the generated wrangler template, so every current and future site gets it from one template edit — no per-site drift."
  - "observability.workers.validate fails the packages pipeline when any wrangler config lacks the traces block or points at an unknown destination."
  - "Traces arriving from Workers are enriched at the collector gateway with wgogol.site_id and wgogol.layer per RFC-0337, so per-site drill-down works without touching worker code."
nonGoals:
  - "Do not add custom spans (tracing.enterSpan) to API routes in this RFC; auto-tracing coverage is sufficient for v1."
  - "Do not export Workers logs to SigNoz; wrangler observability.logs stays as-is in the Cloudflare dashboard."
  - "Do not implement tail-based or error-biased sampling; head_sampling_rate 1.0 until fleet scale demands otherwise."
  - "Do not automate Cloudflare dashboard destination creation via API; it is a documented one-time human step."
acceptance:
  - probe: command-registered
    name: "observability.workers.validate"
  - probe: file-contains
    path: "packages/os/site-kernel-onboarding/src/templates/wrangler.template.jsonc"
    pattern: "\"destinations\": \\[\"signoz\"\\]"
  - probe: file-contains
    path: "apps/warpgogol-com/wrangler.jsonc"
    pattern: "\"destinations\": \\[\"signoz\"\\]"
  - probe: run
    command: "site-kernel run observability.workers.validate --json"
    expect:
      exitCode: 0
---

# RFC-0339: Export Cloudflare Workers traces to the observability backend

## Context

All runtime code in this ecosystem executes on Cloudflare Workers: each site is one Worker serving static assets plus a few on-demand API routes (RFC-0149), and additional workers live under `backs/*` (`matomo-proxy`) and `integrations/*` (`lagebild-sync-worker`). The wrangler configs already enable Workers observability **logs** (`observability.logs`, head sampling 1.0), but nothing exports **traces**, and nothing leaves the Cloudflare dashboard.

Cloudflare Workers supports automatic tracing with export to any OTLP endpoint: a `traces` block inside the existing wrangler `observability` object references a named **destination**, and destinations (OTLP endpoint URL + custom headers) are configured once per Cloudflare account (see Cloudflare docs: Workers observability → Traces, and Exporting OpenTelemetry Data). RFC-0338 provides that endpoint: `https://ingest.observe.warpgogol.com/v1/traces` guarded by the `WGOGOL_OTLP_TOKEN` bearer header.

Site `wrangler.jsonc` files are GENERATED artifacts (RFC-0081/RFC-0336) owned by the onboarding template `packages/os/site-kernel-onboarding/src/templates/wrangler.template.jsonc` — the fleet-wide change is one template edit plus regeneration.

## Problem

- Worker traces are the only runtime signal for the on-demand routes (agent MCP endpoints, stripe-webhook, send-message, integration routes), and they are currently invisible to the observability backend chosen by RFC-0337/0338.
- Without a validator, a future site or back could ship without the traces block, silently creating an observability blind spot in the fleet.
- Static-asset requests served from the ASSETS binding do not invoke the Worker and therefore produce **no traces** — anyone reading dashboards must not mistake trace volume for site traffic. (Delivery metrics for static assets are RFC-0343's concern.)

## Decision

1. **Amend the wrangler template** (and thereby all generated site wrangler files) and all hand-authored worker wrangler files under `backs/*` and `integrations/*`: extend the existing `observability` block with

```jsonc
"observability": {
  "enabled": true,
  "head_sampling_rate": 1.0,
  "traces": {
    "enabled": true,
    "destinations": ["signoz"],
    "head_sampling_rate": 1.0
  },
  "logs": { /* unchanged */ }
}
```

2. **Create the Cloudflare account-level destination** named `signoz` (one-time dashboard step, documented in `backs/observability-stack/README.md`): type Traces, OTLP endpoint `https://ingest.observe.warpgogol.com/v1/traces`, custom header `Authorization: Bearer <WGOGOL_OTLP_TOKEN>`.

3. **Add `observability.workers.validate`** to `@gogol/site-kernel-observability`: an offline workspace validator that keeps every wrangler config inside this contract.

4. **Rely on gateway enrichment** (RFC-0338 `transform/wgogol-enrich`) for the RFC-0337 attribute vocabulary: Workers auto-tracing emits `service.name` = worker name = site/back id; the collector copies it into `wgogol.site_id` and stamps `wgogol.layer: site`. Worker code is not modified.

## Architectural fit

- **RFC-0149.** Amended: the unified Workers deployment contract now includes trace export. The template remains the single owner of site wrangler shape.
- **RFC-0081/RFC-0336 (generated files).** Site wrangler files are regenerated through their owning generator after the template edit; agents never hand-edit them. `gitattributes` coverage is already in place.
- **RFC-0337.** The destination header carries the port token; naming lands in the closed vocabulary via gateway enrichment rather than per-worker code.
- **RFC-0338.** Ingest endpoint, token, TLS, and the enrichment/redaction processors are provided there.
- **RFC-0182 (EU/regional governance).** Trace payloads originate at whatever edge location served the request — the same accepted transit posture as the integration hub; the redaction processor strips query strings and auth/cookie headers before storage.

## Design

### CLI surface

```sh
pnpm exec werkstatt run observability.workers.validate
pnpm exec werkstatt run observability.workers.validate --json
```

Scope: workspace, read-only, offline. Wired into `PACKAGES_CHECK_PIPELINE`.

### Validation rules

The command scans every `wrangler.jsonc`/`wrangler.template.jsonc` under `apps/*/`, `backs/*/`, `integrations/*/`, and `packages/os/site-kernel-onboarding/src/templates/` (JSONC-parsed, comments tolerated):

| Rule | Severity | Meaning |
| --- | --- | --- |
| `OBS-WRK-01` | error | A wrangler config with a `main` entry (i.e. a deployable Worker) lacks `observability.traces.enabled: true`. |
| `OBS-WRK-02` | error | `observability.traces.destinations` is not exactly `["signoz"]`. |
| `OBS-WRK-03` | warning | `observability.traces.head_sampling_rate` is not `1.0` (the current fleet-size policy) or `observability.logs.enabled` is not `true`. |
| `OBS-WRK-04` | error | The onboarding wrangler template itself fails OBS-WRK-01/02. |

Template files under `packages/integration-adapter-*/src/templates/**` are validated with the same rules (they stamp future tenant workers).

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/os/site-kernel-onboarding/src/templates/wrangler.template.jsonc` | Edited: traces block added. |
| `apps/*/wrangler.jsonc` | Regenerated via the template's owning generator (per the file's RFC-0336 advisory header) — never hand-edited. |
| `backs/matomo-proxy/wrangler.jsonc`, `integrations/lagebild-sync-worker/wrangler.jsonc` | Hand-authored: traces block added directly. |
| `backs/observability-stack/README.md` | Gains the "Cloudflare destination `signoz`" one-time setup section. |

### Failure modes

Non-zero exit on any `error` diagnostic; canonical Diagnostic output (RFC-0203) with `fix:` hints naming the template or file to change. A wrangler file without `main` (config-only fragments) is skipped, not flagged.

## Rollout

1. Implement `observability.workers.validate` with fixtures (missing block, wrong destination, sampling drift, template violation).
2. Edit the onboarding template; regenerate all site wrangler files via the owning generator; add the block to the two hand-authored worker configs.
3. Human step: create the `signoz` destination in the Cloudflare dashboard (after RFC-0338's ingest is live); deploy workers; confirm traces appear in SigNoz Services filtered by `service.name`.
4. Wire the command into `PACKAGES_CHECK_PIPELINE`; regenerate the command manifest.
5. Future sites inherit the block from the template automatically; future backs/integration workers are caught by OBS-WRK-01 if they forget it.

## Alternatives considered

- **In-worker OTLP SDK (e.g. otel-cf-workers) instead of platform auto-tracing.** Rejected: adds a runtime dependency and per-request overhead to every worker for what the platform provides declaratively.
- **Per-site destinations.** Rejected: one account-level destination with `service.name` disambiguation is simpler and matches the fleet model.
- **Sampling below 1.0 now.** Rejected: current API-route traffic is tiny; full sampling maximizes diagnostic value. Revisit via amendment when fleet scale raises ingest cost (tail sampling belongs in the RFC-0338 collector then).
- **Automating destination creation via Cloudflare API.** Rejected for v1: a one-time dashboard step documented in the runbook is cheaper than maintaining an API integration for a write-once object.

## Risks

- **Destination config lives outside the repo (Cloudflare dashboard).** Accepted; mitigated by the runbook section and by `observability.stack.health`-style verification during rollout (traces visibly arriving).
- **Trace volume misread as traffic.** Mitigated by this RFC's explicit statement (static assets bypass the Worker) and by RFC-0343 providing the real delivery numbers.
- **Token rotation breaks trace export silently.** Mitigated: the rotate-token runbook section (RFC-0338) lists the Cloudflare destination header as a rotation site; the RFC-0342 `telemetry silence` consideration covers detection.
- **Cloudflare changes the traces config schema (feature is young).** Mitigated: OBS-WRK rules parse leniently (unknown sibling keys ignored); schema drift surfaces at deploy time via wrangler validation, not silently.

## Acceptance criteria

- [x] Wrangler template contains the traces block; all three site wrangler files regenerated from it (not hand-edited). (evidence: implemented historically)
- [x] `backs/matomo-proxy` and `integrations/lagebild-sync-worker` wrangler configs carry the traces block. (evidence: implemented historically)
- [x] `observability.workers.validate` implemented (OBS-WRK-01..04, fixture-tested), registered, and wired into `PACKAGES_CHECK_PIPELINE`. (evidence: implemented historically)
- [x] Cloudflare destination `signoz` documented in the stack runbook; after deployment, traces from at least one site worker and one back worker are visible in SigNoz (screenshot or query recorded in the implementing PR). (evidence: implemented historically)
- [x] Command manifest regenerated; `rfc.validate` passes on this file. (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status `accepted` (or `implemented`); transition per RFC-0224 with RFC-0330 evidence.
- `apps/*/wrangler.jsonc` are GENERATED (RFC-0336): edit the template, then run the owning generator named in each file's advisory header. Hand-editing them fails `generated.edit.guard`.
- Do not enable trace destinations other than `signoz`; do not lower sampling without amending this RFC.
- The Cloudflare dashboard step is a human/ops action; implement everything else, then list it as the remaining step in your report.
- Do not add OpenTelemetry SDKs to worker code.
