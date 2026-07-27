# Incident notes

Every telemetry-grounded incident investigation MUST end in a committed note here.

## Naming convention

`YYYY-MM-DD-<slug>.md` — e.g. `2026-07-07-warpgogol-com-5xx-spike.md`

## Template

```markdown
---
date: 2026-07-07
slug: warpgogol-com-5xx-spike
severity: critical|warning
sites: [warpgogol-com]
status: resolved|ongoing
---

# <title>

## Symptom

<what was observed, by whom/what>

## Telemetry evidence

### Queries

<SigNoz MCP queries used — paste the actual query expressions>

### Values

<key metric values at the time of investigation>

- `warpgogol_probe_up{site_id="warpgogol-com",route="/"}`: 0 (10m sustained)
- `warpgogol_delivery_requests_total{site_id="warpgogol-com",status_class="5xx"}`: 142 (5m window)

## Scope

<one site or fleet-wide; which sites affected>

## Suspected cause

<analysis based on telemetry correlation>

## Recommended action

<what should be done — rollback, fix, monitor>

## Resolution

<if resolved — what was done and when>
```

## Rules

- Cite queries and values inline so the note is reproducible.
- No screenshots — text only.
- The note is the durable artifact; chat is ephemeral.
- Alert mutations are NOT made here — use `observability.alerts.*` (RFC-0342) and only on founder request.
