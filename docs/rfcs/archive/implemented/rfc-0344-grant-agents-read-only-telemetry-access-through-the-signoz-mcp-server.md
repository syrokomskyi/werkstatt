---
id: RFC-0344
title: "Grant agents read-only telemetry access through the SigNoz MCP server"
status: implemented
kind: policy
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
  - RFC-0218
amendedBy: []
related:
  - RFC-0283
  - RFC-0284
  - RFC-0337
  - RFC-0338
  - RFC-0341
  - RFC-0342
commands:
  proposed: []
  added:
    - observability.mcp.validate
  changed: []
  removed: []
appsImpacted: []
packagesImpacted:
  - "@gogol/site-kernel-observability"
successSignals:
  - "An agent investigating an incident can query fleet metrics, traces, and alert states directly (SigNoz MCP) instead of asking a human to read dashboards, and produces a written incident note as the durable artifact."
  - "Telemetry access is provably read-only: the configured key has viewer role, and the only mutation lane for alerts remains RFC-0342's commands."
  - "The Leitstand (RFC-0284) and circuit-breaker (RFC-0283) loops gain a standard, auditable way for agents to ground decisions in observed data."
nonGoals:
  - "Do not grant agents any telemetry write/admin capability; dashboards-as-code and further automation need their own RFC."
  - "Do not implement auto-remediation: agents diagnose and report; rollback/mitigation authority stays with the circuit-breaker governance (RFC-0283) and humans."
  - "Do not build a custom MCP server; use the SigNoz-provided MCP surface (or its official sidecar) only."
acceptance:
  - probe: file-exists
    path: ".mcp.json"
  - probe: file-contains
    path: ".mcp.json"
    pattern: "signoz"
  - probe: file-exists
    path: "docs/observability/incidents/README.md"
  - probe: command-registered
    name: "observability.mcp.validate"
  - probe: run
    command: "site-kernel run observability.mcp.validate --json"
    expect:
      exitCode: 0
---

# RFC-0344: Grant agents read-only telemetry access through the SigNoz MCP server

## Context

RFC-0218 defines the agent operating model for the content-knowledge lifecycle; the observability series (RFC-0337..0343) now creates a second data plane — fleet telemetry — that agents need during incident diagnosis: "is it one site or systemic?", "did the last factory run go red before the probe went red?", "which routes 5xx?". SigNoz ships an MCP server surface, which makes telemetry a first-class tool for Claude-family agents rather than screenshots of dashboards. One of the strategic reasons SigNoz was chosen over alternatives is exactly this fit with the studio's AI-first trajectory.

Access must arrive governed: an ungoverned admin key in an agent's hands would bypass the alerts-as-code lane (RFC-0342) and could mutate the backend invisibly.

## Problem

1. Agents have no sanctioned way to read the new telemetry plane; without one, incident work stays human-gated, contradicting the autonomy trajectory (RFC-0278/0285 lineage).
2. Without an explicit policy, the first agent given a SigNoz key would receive whatever role was handy — likely too much; and nothing would define what an agent must _produce_ from telemetry (a durable incident note vs. ephemeral chat).

## Decision

Amend RFC-0218's operating model with a **telemetry-read lane**:

1. **Connection.** The workspace `.mcp.json` gains a `signoz` MCP server entry pointing at the SigNoz MCP endpoint of the RFC-0338 deployment (`https://observe.warpgogol.com` scope), authenticated by env `WGOGOL_SIGNOZ_MCP_TOKEN`. If the pinned SigNoz version exposes MCP only via a sidecar, that sidecar joins `backs/observability-stack/compose.extra.yaml` — either way the repo entry is identical for agents.
2. **Key policy.** The token is a SigNoz API key with **viewer** role, created per the RFC-0338 runbook, stored only in the developer/CI env — never in the repo. Rotation follows the stack's rotate-token runbook section.
3. **Usage policy (binding for agents).**
   - Agents MAY: query metrics, traces, logs, alert states, service views; correlate across `wgogol_probe_*`, `wgogol_factory_*`, `wgogol_delivery_*`, and worker traces by `site_id`; create _ephemeral_ incident dashboards only if named `incident-<date>-<slug>`.
   - Agents MUST NOT: create/modify/delete alert rules, channels, retention, users, or persistent dashboards through MCP or the UI. The only alert mutation lane is `observability.alerts.*` (RFC-0342), and only when the founder asked.
   - Every telemetry-grounded incident investigation ends in a **written incident note** at `docs/observability/incidents/YYYY-MM-DD-<slug>.md` (authored, human-reviewable): symptom, telemetry evidence (queries + values, not screenshots), scope (one site / fleet), suspected cause, and the recommended action — the input the Leitstand (RFC-0284) and circuit-breaker (RFC-0283) loops consume.
4. **Validation.** New offline command `observability.mcp.validate` in `@gogol/site-kernel-observability`.

### Command `observability.mcp.validate` — workspace, read-only, offline; in `PACKAGES_CHECK_PIPELINE`

| Rule | Severity | Meaning |
| --- | --- | --- |
| `OBS-MCP-01` | error | `.mcp.json` lacks the `signoz` entry, or the entry embeds a literal token instead of the env reference. |
| `OBS-MCP-02` | error | A string that matches a SigNoz API key pattern is committed anywhere under version control (secret-leak backstop scan of tracked files touched by the entry). |
| `OBS-MCP-03` | warning | `docs/observability/incidents/README.md` (the note template) is missing. |

### File system responsibilities

| Path | Role |
| --- | --- |
| `.mcp.json` | Gains the `signoz` server entry (env-referenced token). |
| `docs/observability/incidents/README.md` | Incident-note template + naming rule. |
| `docs/observability/incidents/*.md` | Authored incident notes (outputs of the lane). |
| `AGENTS.md` | Gains the telemetry-lane paragraph (see Rollout). |

## Rollout

1. Land the `.mcp.json` entry, the incidents directory + template, and `observability.mcp.validate` (fixtures for all three rules); wire into `PACKAGES_CHECK_PIPELINE`; regenerate the command manifest.
2. Runbook (RFC-0338) gains the "create viewer MCP key" section; founder creates the key and distributes via env.
3. Update `AGENTS.md`: telemetry is readable via the `signoz` MCP server; alert mutations only via RFC-0342 commands; incident work ends in a committed incident note.
4. First real or drill incident exercises the lane end-to-end; the resulting note is the acceptance evidence.

## Alternatives considered

- **Give agents the SigNoz web UI via browser tooling.** Rejected: brittle, slow, unauditable, and screenshots are not evidence artifacts.
- **Admin-role key for convenience.** Rejected: collapses the RFC-0342 mutation lane and makes drift invisible.
- **A bespoke wgogol MCP server wrapping the SigNoz API.** Rejected for v1: maintenance surface without added capability; revisit only if the official MCP surface proves insufficient.
- **No policy (just hand out a key).** Rejected: the operating model (RFC-0218) exists precisely to make agent lanes explicit and auditable.

## Risks

- **SigNoz MCP surface immaturity/drift.** Mitigated: version pinned by RFC-0338; the lane degrades to "no MCP" without breaking anything else; `.mcp.json` is one entry to update.
- **Viewer key exfiltration.** Mitigated: read-only blast radius, env-only storage, OBS-MCP-02 backstop, rotation runbook.
- **Agents flooding the backend with heavy queries.** Mitigated: viewer-role queries are bounded by SigNoz's own limits; incident notes make usage visible; tighten via amendment if observed.
- **Ephemeral incident dashboards accumulating.** Mitigated: naming convention makes them greppable; the runbook's monthly hygiene step deletes stale `incident-*` dashboards.

## Acceptance criteria

- [x] `.mcp.json` contains the env-referenced `signoz` entry; no secret committed. (evidence: implemented historically)
- [x] `docs/observability/incidents/` exists with the note template. (evidence: docs/ directory, documentation exists)
- [x] `observability.mcp.validate` (OBS-MCP-01..03) fixture-tested, registered, in `PACKAGES_CHECK_PIPELINE`; command manifest regenerated. (evidence: implemented historically)
- [x] `AGENTS.md` documents the lane (read-only telemetry, RFC-0342-only mutations, mandatory incident note). (evidence: AGENTS.md:1, agent guide updated)
- [x] Viewer key created per runbook; one drill investigation produced a committed incident note. (evidence: implemented historically)
- [x] `rfc.validate` passes on this file. (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status `accepted` (or `implemented`); transition per RFC-0224 with RFC-0330 evidence.
- When using the `signoz` MCP server: read freely, mutate never. Alert changes go through `observability.alerts.generate/validate/apply` (RFC-0342) and only on founder request.
- Every incident investigation that used telemetry MUST end in a `docs/observability/incidents/` note; cite queries and values inline so the note is reproducible.
- If the pinned SigNoz version lacks a usable MCP surface at implementation time, deploy the official sidecar in the stack compose rather than building a custom wrapper; if neither exists, report the blocker via `rfc.supersede.propose` (RFC-0334) — do not improvise an unofficial bridge.

## Backfilled sections (RFC-0366)

The following headings were added when the RFC mini-template was retired. The original command/policy RFC used the mini form, which recorded only Context, Decision, Acceptance criteria, and Implementation notes. These sections satisfy the unified full-template contract without altering the original decision.

## Architectural fit

This RFC aligns with the DNA invariants and related RFCs listed in the frontmatter. (Backfilled during mini-template retirement; original mini-RFC did not include a separate Architectural fit section.)

## Design

See the Decision and Acceptance criteria sections above for the design. (Backfilled during mini-template retirement; original mini-RFC recorded design within Decision and Acceptance criteria.)
