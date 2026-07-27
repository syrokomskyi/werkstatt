---
id: RFC-0338
title: "Deploy the self-hosted SigNoz observability stack on an EU VPS"
status: implemented
kind: architecture
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
  - RFC-0304
amendedBy:
  - RFC-0365
related:
  - DNA-1
  - RFC-0182
  - RFC-0304
  - RFC-0337
  - RFC-0339
  - RFC-0340
  - RFC-0341
  - RFC-0342
  - RFC-0343
  - RFC-0344
satisfies:
  - DNA-1
commands:
  proposed: []
  added:
    - observability.stack.validate
    - observability.stack.health
  changed: []
  removed: []
appsImpacted: []
packagesImpacted:
  - "@gogol/site-kernel-observability"
  - "@gogol/site-kernel-checks"
successSignals:
  - "SigNoz UI is reachable at https://observe.webgogol.com behind TLS; OTLP ingest is reachable at https://ingest.observe.webgogol.com only with the bearer token."
  - "All stack configuration (casting.yaml, collector patch, Caddyfile, compose extras, runbook) lives versioned in backs/observability-stack; the server holds no unversioned configuration except .env secrets."
  - "observability.stack.validate proves the config offline in CI; observability.stack.health round-trips a real test metric into SigNoz on demand."
  - "All telemetry data rests in the EU; retention is bounded (traces 15d, metrics 30d, logs 7d); nightly backups exist and the restore path is documented."
nonGoals:
  - "Do not deploy Kubernetes, distributed ClickHouse, or multi-node SigNoz; one VPS is the accepted scale until fleet growth demands more."
  - "Do not configure alert rules or channels here (RFC-0342); this RFC only provisions SMTP env vars for the email channel."
  - "Do not wire any emitter; RFC-0339..0343 own emitters."
  - "Do not automate VPS provisioning (no Terraform/Ansible); the runbook is a documented manual procedure executed once."
acceptance:
  - probe: file-exists
    path: "backs/observability-stack/back.config.json"
  - probe: file-exists
    path: "backs/observability-stack/casting.yaml"
  - probe: file-exists
    path: "backs/observability-stack/caddy/Caddyfile"
  - probe: file-exists
    path: "backs/observability-stack/collector/collector-patch.yaml"
  - probe: file-exists
    path: "backs/observability-stack/compose.extra.yaml"
  - probe: file-exists
    path: "backs/observability-stack/.env.example"
  - probe: file-exists
    path: "backs/observability-stack/README.md"
  - probe: command-registered
    name: "observability.stack.validate"
  - probe: command-registered
    name: "observability.stack.health"
  - probe: run
    command: "site-kernel run observability.stack.validate --json"
    expect:
      exitCode: 0
---

# RFC-0338: Deploy the self-hosted SigNoz observability stack on an EU VPS

## Context

RFC-0337 fixes the observability port: push-only OTLP to `WGOGOL_OTLP_ENDPOINT` with a bearer token. This RFC provides the other side of the port: a self-hosted SigNoz installation that receives, stores, and visualizes the telemetry of the whole ecosystem.

The founder decided (2026-07-07): **new dedicated EU VPS**, SigNoz self-hosted via **Foundry** (`foundryctl`, the official CLI that replaced `install.sh`; declares the deployment in a single `casting.yaml` — see the SigNoz Foundry announcement and `SigNoz/foundry` on GitHub). Self-hosting in the EU aligns with the ecosystem's hard data-residency stance (RFC-0182; the wrangler configs already forbid non-EU-pinnable Cloudflare primitives).

The monorepo has an established home for deployable backend compositions: `backs/*` (RFC-0304). The SigNoz stack is a deployment composition made of configuration rather than TypeScript code, which RFC-0304's `kind` vocabulary does not cover yet.

## Problem

1. There is no observability backend at all; RFC-0339..0343 have nowhere to send telemetry.
2. RFC-0304's `back.config.json` allows only `node-runner | cloudflare-worker | scheduled-worker | integration-worker | proxy-worker`; a docker-compose configuration stack fits none of them, so the stack would have to live outside governance or force a wrong kind.
3. An unauthenticated OTLP endpoint on the public internet invites junk ingestion and abuse; the research document's `tls: false`, no-key suggestion is not acceptable.

## Decision

1. **Amend RFC-0304**: add `"compose-stack"` to the allowed `back.config.json` kinds — a deployment composition consisting of declarative service configuration (compose/casting files) rather than runtime source. For `compose-stack` backs, `backs.workspace.validate` requires `package.json` (private, with `build:check`) but does not require a `src/` entrypoint; `entry` points at the primary config file.
2. **Create `backs/observability-stack`**: all versioned configuration for the SigNoz VPS — Foundry `casting.yaml`, a collector configuration patch, a Caddy reverse proxy with TLS + bearer-token auth, a compose extension file for co-located series services (RFC-0341/0343), `.env.example`, backup script, and the provisioning/upgrade/restore runbook.
3. **Add two commands** to `@gogol/site-kernel-observability`: `observability.stack.validate` (offline config lint, in `PACKAGES_CHECK_PIPELINE`) and `observability.stack.health` (on-demand network round-trip check; never in offline pipelines).

## Architectural fit

- **DNA-1 (monorepo boundary).** The stack is a deployable composition → `backs/*`. Reusable logic (none here) would go to packages; commands go to the kernel module (RFC-0337).
- **RFC-0304.** Amended minimally (one enum value); the composition-only discipline, boundary rules, and `backs.workspace.validate` apply unchanged.
- **RFC-0182 (EU residency).** The VPS is EU-located; DNS for both hostnames stays DNS-only (grey-cloud) so telemetry ingest does not depend on Cloudflare's proxy layer — the observability stack must remain reachable during a Cloudflare incident, which is exactly when it is needed.
- **RFC-0337.** This stack is the concrete backend behind `WGOGOL_OTLP_ENDPOINT`; the collector patch implements the gateway-side enrichment and redaction rules that RFC-0337 assigns to the collector.
- **RFC-0258-style atomicity is not relevant** (no workspace-shared file writes at build time).

## Design

### Server contract

| Item | Value |
| --- | --- |
| Provider / class | Hetzner Cloud **CPX31** (4 vCPU, 8 GB RAM, 160 GB SSD) or equal; EU location `fsn1` or `nbg1` |
| OS | Ubuntu 24.04 LTS |
| Runtime | Docker Engine ≥ 24 with compose plugin; `foundryctl` (latest release) |
| Firewall | inbound 22 (SSH, key-only, no password auth), 80 (ACME redirect), 443 only |
| Hostnames | `observe.webgogol.com` (UI), `ingest.observe.webgogol.com` (OTLP) — both DNS-only A records to the VPS IP |
| Working dir | `/opt/observability` (owned clone of `backs/observability-stack` content + `.env`) |

### Workspace layout

```text
backs/observability-stack/
  package.json              # private; "build:check": "pnpm exec site-kernel run observability.stack.validate"
  back.config.json          # kind: "compose-stack", entry: "casting.yaml", publicEndpoints: true
  turbo.json
  casting.yaml              # Foundry installation declaration (compose flavor, docker mode)
  collector/
    collector-patch.yaml    # additions to the SigNoz otel-collector config (see below)
  caddy/
    Caddyfile               # TLS + auth front (see below)
  compose.extra.yaml        # caddy service + series services (fleet-probe-runner, cf-analytics-poller join here)
  scripts/
    backup.sh               # nightly backup (clickhouse-backup + pg_dump → restic)
    healthcheck.sh          # local curl checks used by the runbook
  .env.example              # every required secret/var, no values
  README.md                 # provisioning / upgrade / restore / rotate-token runbook
```

`back.config.json`:

```json
{
  "id": "observability-stack",
  "kind": "compose-stack",
  "entry": "casting.yaml",
  "publicEndpoints": true,
  "usesBrowserAutomation": false,
  "queues": [],
  "artifacts": []
}
```

### casting.yaml

```yaml
apiVersion: v1alpha1
kind: Installation
metadata:
  name: signoz
spec:
  deployment:
    flavor: compose
    mode: docker
```

The SigNoz version is pinned via the Foundry mechanism available at implementation time (casting field or generated compose image tags); the pinned version MUST be recorded in `README.md` because `observability.alerts.apply` (RFC-0342) targets that version's HTTP API. Foundry generates the deployment under `pours/` **on the server**; `pours/` is not committed (listed in the back's `.gitignore`).

### Caddyfile (TLS + ingest auth)

```caddyfile
observe.webgogol.com {
  reverse_proxy signoz:8080
}

ingest.observe.webgogol.com {
  @unauthorized not header Authorization "Bearer {$WGOGOL_OTLP_TOKEN}"
  respond @unauthorized 401
  reverse_proxy otel-collector:4318
}
```

Rules:

- The UI host has no Caddy-level auth (SigNoz has its own user accounts); the ingest host accepts requests **only** with the exact bearer token.
- Caddy terminates TLS via ACME/Let's Encrypt automatically; no port other than 80/443 is published. The collector's 4317/4318 ports are **not** exposed on the host — Caddy reaches them over the compose network.

### collector-patch.yaml (gateway enrichment + redaction, per RFC-0337)

Additions merged into the SigNoz-shipped otel-collector config (documented merge step in the runbook; the patch file is the versioned truth):

```yaml
processors:
  # RFC-0337: enrich Cloudflare-originated traces that lack wgogol.* attributes.
  transform/wgogol-enrich:
    trace_statements:
      - context: resource
        statements:
          - set(attributes["wgogol.site_id"], attributes["service.name"]) where attributes["wgogol.site_id"] == nil
          - set(attributes["wgogol.layer"], "site") where attributes["wgogol.layer"] == nil
  # RFC-0337: strip query strings / PII-bearing span attributes before storage.
  transform/wgogol-redact:
    trace_statements:
      - context: span
        statements:
          - replace_pattern(attributes["url.full"], "\\?.*$", "")
          - replace_pattern(attributes["http.url"], "\\?.*$", "")
          - delete_key(attributes, "http.request.header.cookie")
          - delete_key(attributes, "http.request.header.authorization")
```

Both processors are inserted into the traces pipeline before the exporter. The patch must be re-applied after every SigNoz upgrade (runbook step; `healthcheck.sh` verifies the processors are active by grepping the effective config).

### compose.extra.yaml

Declares the `caddy` service (image `caddy:2`, ports 80/443, mounts `caddy/Caddyfile`, env `WGOGOL_OTLP_TOKEN`) joined to the Foundry-generated network, plus placeholders where RFC-0341 (`fleet-probe-runner`) and RFC-0343 (`cf-analytics-poller`) add their services. Inside the compose network those services use `http://otel-collector:4318` directly as `WGOGOL_OTLP_ENDPOINT` (no TLS/token needed on the loopback network — the token guards only the public edge).

### .env.example (complete list)

```sh
WGOGOL_OTLP_TOKEN=            # bearer token for public ingest; openssl rand -hex 32
SIGNOZ_SMTP_HOST=             # email alert channel (RFC-0342)
SIGNOZ_SMTP_PORT=587
SIGNOZ_SMTP_USER=
SIGNOZ_SMTP_PASSWORD=
SIGNOZ_SMTP_FROM=
RESTIC_REPOSITORY=            # backup target (Hetzner Storage Box / S3-compatible)
RESTIC_PASSWORD=
```

### Retention and backups

- Retention set in SigNoz settings (runbook step): traces **15 days**, metrics **30 days**, logs **7 days**.
- `scripts/backup.sh`: nightly via cron/systemd-timer — `clickhouse-backup create` + `pg_dump` of the SigNoz metastore, uploaded with restic; keep 14 snapshots. Restore procedure is a numbered runbook section and MUST be tested once during rollout.

### Commands

#### observability.stack.validate — workspace, read-only, offline; in `PACKAGES_CHECK_PIPELINE`

| Rule | Severity | Meaning |
| --- | --- | --- |
| `OBS-STACK-01` | error | A required file from the workspace layout is missing. |
| `OBS-STACK-02` | error | `casting.yaml` does not parse or lacks `flavor: compose` / `mode: docker`. |
| `OBS-STACK-03` | error | `Caddyfile` misses the ingest bearer-token guard or exposes `otel-collector` without auth. |
| `OBS-STACK-04` | error | `collector-patch.yaml` misses the `transform/wgogol-enrich` or `transform/wgogol-redact` processor. |
| `OBS-STACK-05` | error | `.env.example` misses a variable referenced by Caddyfile/compose/scripts, or contains a non-empty value (secret committed). |
| `OBS-STACK-06` | warning | `README.md` misses a required runbook section (Provision, Upgrade, Restore, Rotate token). |

#### observability.stack.health — workspace, read-only, network; manual/on-demand only

- `GET https://observe.webgogol.com` expects HTTP 200/302.
- `POST https://ingest.observe.webgogol.com/v1/metrics` **without** token expects 401.
- With `WGOGOL_OTLP_ENDPOINT`/`WGOGOL_OTLP_TOKEN` set: pushes `wgogol_factory_smoke_total` via `@gogol/observability` and expects HTTP 2xx.
- Never wired into `build.check`/`packages-check` (network); exits non-zero on any failed probe.

## Rollout

1. Land the RFC-0304 amendment (`compose-stack` kind) in `backs.workspace.validate` + its types; fixture-test the new kind.
2. Create `backs/observability-stack` with all files above; implement and wire both commands; `observability.stack.validate` green in CI.
3. Human/ops steps (runbook, in order): provision VPS → DNS records → install Docker + foundryctl → clone stack config to `/opt/observability`, fill `.env` → `foundryctl cast -f casting.yaml` → apply collector patch → `docker compose -f compose.extra.yaml up -d` → create SigNoz admin account → set retention → configure SMTP → enable nightly backup timer → run `observability.stack.health` from a workstation and record output.
4. Perform and document one restore drill from backup.
5. RFC-0339..0343 emitters connect afterwards; RFC-0342 pins its API calls to the version recorded here.

## Alternatives considered

- **SigNoz Cloud.** Rejected: EU-residency control and cost predictability favor self-hosting; the studio explicitly chose self-hosted.
- **Grafana LGTM stack.** Rejected: three backends to operate instead of one OTLP-native product; SigNoz's MCP server (RFC-0344) is a strategic fit for the AI-first operating model.
- **Cloudflare-proxied (orange-cloud) hostnames.** Rejected: the observability plane must not share fate with Cloudflare, whose outages are among the incidents it must observe.
- **Kubernetes/Helm deployment.** Rejected at current scale (3 sites); the compose flavor on one VPS is sufficient and dramatically cheaper to operate.
- **Terraform/Ansible provisioning.** Rejected per founder decision on tooling; a once-executed documented runbook is adequate for a single pet server.

## Risks

- **The stack is itself unmonitored ("who watches the watchmen").** Mitigated: `observability.stack.health` is runnable from anywhere; RFC-0342 adds a dead-man consideration; the VPS provider's own monitoring covers host-down.
- **SigNoz upgrade breaks the collector patch or the alerts API.** Mitigated: version pinned and recorded; runbook's Upgrade section re-applies the patch and re-runs `observability.alerts.apply --dry-run` (RFC-0342) before finalizing.
- **Token leak on the public ingest.** Mitigated: token grants ingest only (no read); rotation runbook section; Caddy logs auth failures.
- **Single VPS is a SPOF.** Accepted: telemetry loss during an outage is tolerable; emitters are fire-and-forget no-ops (RFC-0337) so the fleet itself is unaffected.
- **Foundry internals drift (pours/ layout, patch mechanism).** Mitigated: `pours/` never committed; the patch is declarative and the runbook owns the merge step; `OBS-STACK-02..04` catch config regressions offline.

## Acceptance criteria

- [x] RFC-0304 `back.config.json` kind vocabulary includes `compose-stack`; `backs.workspace.validate` handles it (no `src/` required) with fixture tests. (evidence: implemented historically)
- [x] `backs/observability-stack` exists with the full layout; no secret values committed. (evidence: implemented historically)
- [x] `observability.stack.validate` implemented (OBS-STACK-01..06, fixture-tested) and wired into `PACKAGES_CHECK_PIPELINE`. (evidence: implemented historically)
- [x] `observability.stack.health` implemented; documented as network/manual-only. (evidence: implemented historically)
- [x] Server provisioned per runbook; UI reachable over TLS; ingest rejects tokenless requests with 401 and accepts the smoke metric with token (health command output recorded in the implementation commit/PR). (evidence: implemented historically)
- [x] Retention configured; nightly backups running; restore drill performed and documented. (evidence: implemented historically)
- [x] Command manifest regenerated; `rfc.validate` passes on this file. (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status `accepted` (or `implemented`); transition per RFC-0224 with RFC-0330 evidence.
- Steps in Rollout item 3 require server/DNS access — they are founder/ops actions. An agent implements everything versioned, then hands over the runbook; do not fake the health check.
- Never commit real secrets; `.env.example` carries names only (`OBS-STACK-05` enforces).
- Do not expose 4317/4318 on the host; all public ingress goes through Caddy on 443.
- Do not add observability-stack services to any app or package; co-located series services join `compose.extra.yaml` only.
- Record the pinned SigNoz version in `README.md`; RFC-0342 depends on it.
- If Foundry's current release diverges from the casting.yaml shape shown here, follow the official SigNoz docs and update this RFC's Design via amendment rather than improvising undocumented config.
