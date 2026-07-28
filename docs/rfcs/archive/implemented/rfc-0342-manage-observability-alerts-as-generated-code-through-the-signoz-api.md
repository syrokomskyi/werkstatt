---
id: RFC-0342
title: "Manage observability alerts as generated code through the SigNoz API"
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
amends: []
amendedBy: []
related:
  - RFC-0081
  - RFC-0304
  - RFC-0336
  - RFC-0337
  - RFC-0338
  - RFC-0340
  - RFC-0341
  - RFC-0344
commands:
  proposed: []
  added:
    - observability.alerts.generate
    - observability.alerts.validate
    - observability.alerts.apply
  changed: []
  removed: []
appsImpacted: []
packagesImpacted:
  - "@gogol/site-kernel-observability"
  - "@gogol/observability"
successSignals:
  - "Every alert rule and notification channel in SigNoz that concerns the fleet is owned by a typed source file in the repo; the SigNoz UI holds no hand-crafted managed rules."
  - "observability.alerts.apply converges the backend to the declared state idempotently; --dry-run shows the exact diff first."
  - "Critical fleet incidents (site down, cert expiring) reach the founder via email and Telegram within minutes without anyone watching a dashboard."
  - "Alert-rule changes are reviewable diffs in git, not clicks — matching the ecosystem's generated-artifact governance instead of introducing Terraform."
nonGoals:
  - "Do not introduce Terraform or any new provisioning toolchain (founder decision 2026-07-07)."
  - "Do not manage SigNoz dashboards as code in this RFC; only alert rules and notification channels."
  - "Do not implement anomaly-detection rules in v1; threshold rules only."
  - "Do not build maintenance-window automation; muting during fleet deploys is a documented manual step in v1."
acceptance:
  - probe: file-exists
    path: "packages/os/site-kernel-observability/src/alert-rules.ts"
  - probe: file-exists
    path: "docs/observability/alerts.generated.json"
  - probe: file-exists
    path: "backs/telegram-alert-bridge/src/worker.ts"
  - probe: command-registered
    name: "observability.alerts.generate"
  - probe: command-registered
    name: "observability.alerts.validate"
  - probe: command-registered
    name: "observability.alerts.apply"
  - probe: run
    command: "site-kernel run observability.alerts.validate --json"
    expect:
      exitCode: 0
---

# RFC-0342: Manage observability alerts as generated code through the SigNoz API

## Context

RFC-0340 and RFC-0341 produce the factory and probe time series; without alerting, someone must stare at dashboards to notice a down site — which defeats the series' purpose for a small studio on an AI-first, human-as-shrinking-budget trajectory. SigNoz supports metric/trace/log threshold alerts and notification channels (email via SMTP, arbitrary webhooks) and exposes them over its HTTP API.

The founder decided (2026-07-07): alert channels are **email + Telegram**, and alerts-as-code is done with **kernel commands against the SigNoz API** — explicitly _not_ Terraform — following the ecosystem's own generated-artifact model (RFC-0081/0336): typed authored source → deterministic generated projection → idempotent apply.

SigNoz has no native Telegram channel, so Telegram delivery needs a tiny webhook bridge; `backs/*` (RFC-0304) has the `proxy-worker` kind for exactly this shape.

## Problem

1. No alerting exists; incidents are discovered by humans by accident.
2. Hand-clicked alert rules in a UI drift, are unreviewable, cannot be re-created after a backend rebuild, and violate the ecosystem's everything-from-source discipline.
3. Telegram (a decided channel) is not natively supported by SigNoz.

## Decision

1. **Typed authored source**: `ALERT_RULES` and `NOTIFICATION_CHANNELS` in `packages/os/site-kernel-observability/src/alert-rules.ts` (closed schemas below).
2. **Generated projection**: `observability.alerts.generate` writes `docs/observability/alerts.generated.json` (GENERATED marker, deterministic, sorted; registered in `writes` + gitattributes per RFC-0336).
3. **Idempotent apply**: `observability.alerts.apply` converges the SigNoz backend (rules + channels) to the generated projection through its HTTP API, touching **only** objects it manages (marked with a `wgogol_managed` label/name prefix). `--dry-run` prints the create/update/delete plan without acting.
4. **Telegram bridge**: new `backs/telegram-alert-bridge` — a ~60-line Cloudflare Worker (`proxy-worker`) that receives SigNoz webhook payloads and forwards a formatted message to the Telegram Bot API.
5. **Baseline rule set v1** ships in this RFC (see Design): site-down, cert-expiry (warning + critical), factory build-check failures, workers error rate.

## Architectural fit

- **RFC-0081/0336 (generated-artifact governance).** The generate→validate→apply triad mirrors `gitattributes.generate/validate`; the projection is marker-carrying and registry-owned. This is the decisive argument against Terraform: the ecosystem already has an alerts-shaped governance pattern.
- **RFC-0338.** The apply targets the SigNoz version pinned there; SMTP env for the email channel is provisioned there; the runbook's upgrade section runs `observability.alerts.apply --dry-run` after upgrades.
- **RFC-0340/0341.** Rule expressions reference only metrics from the RFC-0337 registry — validated statically.
- **RFC-0304.** The bridge is a `proxy-worker` back with the standard boundary rules; its wrangler carries the RFC-0339 traces block.
- **RFC-0344.** Agents read alerts via MCP but MUST mutate them only through this lane.

## Design

### TypeScript contracts (`alert-rules.ts`)

```ts
export type WgogolAlertSeverity = "critical" | "warning";
export type WgogolChannelId = "email-studio" | "telegram-studio";

export interface WgogolAlertRule {
  /** Stable id; becomes label wgogol_rule_id on the SigNoz rule. */
  id: string;
  name: string;                       // human title, prefixed "WGogol: " by the generator
  severity: WgogolAlertSeverity;
  /** PromQL over wgogol_* metrics (metric alerts) — the common case. */
  promql?: string;
  /** Raw SigNoz builder-query JSON for non-PromQL rule types (trace alerts). Exactly one of promql|builder. */
  builder?: unknown;
  evalWindow: string;                 // e.g. "5m"
  forDuration: string;                // e.g. "10m"
  condition: { op: ">" | "<" | ">=" | "<=" | "==" ; target: number };
  channels: WgogolChannelId[];
  labels?: Record<string, string>;    // merged with { managed_by: "wgogol" }
  description: string;                // must include a runbook hint
}

export interface WgogolNotificationChannel {
  id: WgogolChannelId;
  kind: "email" | "webhook";
  /** email: recipient list; webhook: env var name holding the URL (never the URL itself). */
  target: string[];
}
```

### Baseline rules v1

| id | severity | expression (sketch) | for | channels |
| --- | --- | --- | --- | --- |
| `fleet-site-down` | critical | `min by (site_id) (wgogol_probe_up{route="/"}) == 0` | 10m | email + telegram |
| `fleet-cert-expiry-warn` | warning | `min by (site_id) (wgogol_probe_cert_expiry_days) < 14` | 1h | email |
| `fleet-cert-expiry-crit` | critical | `min by (site_id) (wgogol_probe_cert_expiry_days) < 7` | 1h | email + telegram |
| `factory-build-check-failed` | warning | `increase(wgogol_factory_command_runs_total{command="build.check",status=~"fail\|error"}[6h]) > 0` | 0m | email |
| `workers-error-rate` | warning | trace-based builder rule: error-span ratio per `service.name` > 5% | 15m | email |

Channels: `email-studio` → founder address(es); `telegram-studio` → webhook channel whose URL comes from env `WGOGOL_TG_BRIDGE_URL` (the bridge's route + shared secret query param).

### Commands (all in `@gogol/site-kernel-observability`)

**`observability.alerts.generate`** — workspace, mutating, offline. Renders source → `docs/observability/alerts.generated.json`: rules sorted by id, channels sorted by id, `buildGeneratedHeader` comment in a `_generated` field or leading marker line per JSON conventions used by `command-manifest.generated.json`; byte-idempotent.

**`observability.alerts.validate`** — workspace, read-only, offline; in `PACKAGES_CHECK_PIPELINE`:

| Rule | Severity | Meaning |
| --- | --- | --- |
| `OBS-ALR-01` | error | Generated projection is stale vs. source. |
| `OBS-ALR-02` | error | Duplicate rule id, or rule with both/neither of `promql`/`builder`. |
| `OBS-ALR-03` | error | A `promql` expression references a metric name absent from `WGOGOL_METRIC_REGISTRY` (RFC-0337). |
| `OBS-ALR-04` | error | A rule references an undeclared channel id; or a webhook channel embeds a literal URL instead of an env var name. |
| `OBS-ALR-05` | warning | A rule description lacks a runbook hint (no "runbook:" substring). |

**`observability.alerts.apply`** — workspace, **network + remote-mutating**, manual/ops only (never in pipelines):

```sh
pnpm exec site-kernel run observability.alerts.apply --dry-run
pnpm exec site-kernel run observability.alerts.apply --json
```

- Env: `WGOGOL_SIGNOZ_API_URL` (e.g. `https://observe.warpgogol.com`), `WGOGOL_SIGNOZ_API_TOKEN` (SigNoz API key with rule/channel write permission). Missing env → clear error, exit non-zero.
- Reads current rules and channels from the SigNoz API; the **managed set** is rules labeled `managed_by: wgogol` and channels named with prefix `wgogol-`.
- Diffs managed set vs. projection by `wgogol_rule_id` / channel id → create / update / delete; never touches unmanaged objects.
- `--dry-run` prints the plan and exits 0 without mutating. Without it, prints the plan, applies, then re-reads to verify convergence; non-convergence → non-zero exit.
- The SigNoz API version drift risk is bounded by RFC-0338's version pin; the client lives in one module (`signoz-api-client.ts`) with fixture-recorded request/response tests.

### `backs/telegram-alert-bridge`

```text
backs/telegram-alert-bridge/
  package.json
  back.config.json        # kind: "proxy-worker", entry: "src/worker.ts", publicEndpoints: true
  wrangler.jsonc          # with RFC-0339 observability block
  src/worker.ts
  README.md
```

`worker.ts` contract: `POST /alert?secret=<BRIDGE_SECRET>` — reject non-POST and bad secret with 401; parse the SigNoz webhook JSON (alert name, state firing/resolved, severity, labels incl. `site_id`, description); format one plain-text message (`🔴/🟢 [severity] name — site_id — description`); `POST https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage` with `chat_id={TELEGRAM_CHAT_ID}`; return Telegram's status. Secrets (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `BRIDGE_SECRET`) are wrangler secrets, never in the repo. Payload contains alert metadata only — no visitor data, no PII (RFC-0337 policy holds).

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/os/site-kernel-observability/src/alert-rules.ts` | Authored source of truth. |
| `packages/os/site-kernel-observability/src/signoz-api-client.ts` | Single API client module. |
| `docs/observability/alerts.generated.json` | Generated projection (marker, gitattributes). |
| `backs/telegram-alert-bridge/**` | New proxy-worker back. |
| `backs/observability-stack/.env.example` | Already lists SMTP vars (RFC-0338); gains `WGOGOL_TG_BRIDGE_URL` documentation pointer. |

## Rollout

1. Implement schemas + baseline rules; `observability.alerts.generate` + `observability.alerts.validate` with fixtures; commit projection; wire validate into `PACKAGES_CHECK_PIPELINE`; regenerate manifest + gitattributes.
2. Implement and deploy `backs/telegram-alert-bridge` (bot + chat created by founder; secrets set via wrangler).
3. Implement `observability.alerts.apply` with a fixture-tested API client; run `--dry-run` against the live backend, review, then apply.
4. Verify end-to-end: temporarily stop one probe target (or lower a threshold), observe email + Telegram delivery, restore; record evidence in the implementing PR.
5. Rule changes henceforth: edit source → generate → PR review → apply (ops).

## Alternatives considered

- **Terraform + SigNoz provider.** Rejected by founder decision: introduces a toolchain alien to the ecosystem for one concern the generated-artifact model already covers; state files add operational surface.
- **Alertmanager-style config file mounted into SigNoz.** Rejected: SigNoz manages rules in its own store/API; fighting that with file mounts is fragile across upgrades.
- **Native Slack instead of Telegram bridge.** Rejected: founder chose email + Telegram; the studio does not live in Slack.
- **Grafana OnCall / PagerDuty.** Rejected: paging-grade escalation is overkill for the current team size; channels are revisitable by amending the channel list.

## Risks

- **SigNoz API drift across upgrades.** Mitigated: version pin (RFC-0338), single client module with recorded fixtures, upgrade runbook step runs `--dry-run` first.
- **Deleted-by-diff surprises.** Mitigated: apply touches only `managed_by: wgogol` objects; the plan is always printed; `--dry-run` is the documented default habit.
- **Bridge worker becomes a spam vector.** Mitigated: shared-secret query param, POST-only, no request echo; worst case an attacker triggers noise to one private chat.
- **Alert fatigue.** Mitigated: v1 set is 5 rules with sustained-failure windows; every rule requires a runbook hint (OBS-ALR-05) so each alert is actionable.
- **Email deliverability (SMTP).** Mitigated: SMTP creds from the studio's established mail provider (RFC-0181 lane); Telegram is the redundant path for criticals.

## Acceptance criteria

- [x] `alert-rules.ts` with typed schemas + baseline v1 rules; projection generated, committed, byte-idempotent. (evidence: implemented historically)
- [x] `observability.alerts.validate` (OBS-ALR-01..05) fixture-tested, in `PACKAGES_CHECK_PIPELINE`. (evidence: implemented historically)
- [x] `observability.alerts.apply` with `--dry-run`, managed-set discipline, convergence verification, fixture-tested API client; documented as network/ops-only. (evidence: implemented historically)
- [x] `backs/telegram-alert-bridge` deployed; wrangler carries the RFC-0339 traces block; secrets not in repo. (evidence: implemented historically)
- [x] End-to-end alert delivery to email and Telegram demonstrated and evidenced in the implementing PR. (evidence: implemented historically)
- [x] Command manifest + gitattributes regenerated; `rfc.validate` passes on this file. (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status `accepted` (or `implemented`); transition per RFC-0224 with RFC-0330 evidence.
- NEVER run `observability.alerts.apply` without `--dry-run` first in the same session; never run it at all unless the founder asked for an apply.
- Never create/edit/delete SigNoz rules or channels through the UI or MCP; this command lane is the only mutation path (RFC-0344 restates this for agents).
- `docs/observability/alerts.generated.json` is GENERATED — edit `alert-rules.ts` and regenerate.
- Secrets discipline: env var names in code, values only in `.env` on the VPS or wrangler secrets.
- New rules must reference registry metrics only (OBS-ALR-03); if a rule needs a new metric, the RFC introducing that emitter adds the registry entry first.
