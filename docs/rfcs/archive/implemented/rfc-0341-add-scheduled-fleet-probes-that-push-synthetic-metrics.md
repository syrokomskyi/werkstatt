---
id: RFC-0341
title: "Add scheduled fleet probes that push synthetic metrics"
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
amends: []
amendedBy:
  - RFC-0365
related:
  - DNA-1
  - RFC-0301
  - RFC-0302
  - RFC-0304
  - RFC-0315
  - RFC-0336
  - RFC-0337
  - RFC-0338
  - RFC-0342
satisfies:
  - DNA-1
commands:
  proposed: []
  added:
    - fleet.probe.targets.generate
    - fleet.probe.validate
  changed: []
  removed: []
appsImpacted:
  - warpgogol-com
  - nicaragua-projekt
  - check-warpgogol-com
packagesImpacted:
  - "@gogol/observability"
  - "@gogol/site-kernel-observability"
successSignals:
  - "Every fleet site is probed from outside (EU VPS) every 5 minutes: availability, TTFB, HTTP status, TLS certificate expiry, and a content sentinel — the primary health signal for a static fleet."
  - "Probe results are time series in SigNoz (wgogol_probe_*), enabling the fleet-down and cert-expiry alerts of RFC-0342 and per-site uptime history."
  - "The probe target list is generated from the workspace (never hand-maintained), so a newly onboarded app enters monitoring by construction."
  - "For static sites this synthetic lane — not APM — answers 'is the site alive and serving correct content', reusing the studio's own probing know-how instead of deploying a second uptime product."
nonGoals:
  - "Do not probe third-party sites; this runner monitors the studio's own fleet only (the check-warpgogol product lane, RFC-0304, owns external URLs)."
  - "Do not run Playwright/browser capture in the 5-minute pulse lane; the pulse is plain HTTP + TLS. A daily browser-based deep probe is Phase 2 of this RFC."
  - "Do not store probe artifacts or reports; the output is metrics only (deep-probe evidence in Phase 2 stays local to the runner with short retention)."
  - "Do not define alert thresholds here (RFC-0342)."
  - "Do not replace RFC-0315's headers.runtime.probe (deploy-time header contract check) or RFC-0301's deploy gating; this lane is continuous scheduled monitoring."
acceptance:
  - probe: file-exists
    path: "backs/fleet-probe-runner/back.config.json"
  - probe: file-exists
    path: "backs/fleet-probe-runner/src/loop.ts"
  - probe: file-exists
    path: "backs/fleet-probe-runner/targets.generated.json"
  - probe: command-registered
    name: "fleet.probe.targets.generate"
  - probe: command-registered
    name: "fleet.probe.validate"
  - probe: run
    command: "site-kernel run fleet.probe.validate --json"
    expect:
      exitCode: 0
---

# RFC-0341: Add scheduled fleet probes that push synthetic metrics

## Context

For a fleet of static sites, the dominant failure modes are external: a stale or broken deploy, DNS/TLS trouble, Cloudflare serving 5xx, an empty page shipped by a bad build. None of these are visible from inside (there is no server code on most pages, RFC-0149/DNA-1), so the primary health signal must be **synthetic**: an outside agent requesting the site on a schedule.

The ecosystem already owns probing machinery: `@gogol/check-core` (targets, safety, evidence contracts) and `@gogol/check-runner-node` (Playwright capture) power the check-warpgogol product via `backs/check-warpgogol-runner` (RFC-0304). What is missing is not a probe engine but (a) a **scheduled, own-fleet** consumer of it and (b) **time series** — today a check run produces one-off artifacts, not history, trends, or alertable signals.

RFC-0337 provides the metrics port; RFC-0338 provides the backend and a compose home (`compose.extra.yaml`) on the same EU VPS, which doubles as a genuine outside-in vantage point (not Cloudflare, not the developer's machine).

## Problem

1. Nothing notices a down or broken fleet site until a human looks. There is no uptime, TTFB, or cert-expiry history for any site.
2. Deploying a third-party uptime product (OneUptime, Uptime Kuma) would duplicate a strict subset of the studio's own check engine and add an operations surface.
3. A hand-maintained target list would silently omit newly onboarded sites — the exact drift class this ecosystem eliminates with generated artifacts (RFC-0081/0336).

## Decision

Create **`backs/fleet-probe-runner`** (kind `scheduled-worker`, Node, no browser in the pulse lane), deployed as a service in the observability stack's `compose.extra.yaml`, probing every fleet site every 5 minutes and pushing `wgogol_probe_*` metrics through the RFC-0337 port. The target list is a **generated artifact** produced by a new kernel command from the workspace itself.

### Probe lanes

**Lane 1 — pulse (this RFC's core; every 300s ± 15s jitter, concurrency ≤ 3, timeout 10s/request):**

For each target route:

- `GET` with `User-Agent: WGogol-FleetProbe/1 (+https://warpgogol.com)`, no cookies, `Accept-Encoding: identity`.
- **TTFB** = time from request start until response headers received.
- **Status class** = `2xx | 3xx | 4xx | 5xx | error` (network/timeout → `error`).
- **Content sentinel** (HTML routes only): body matches all sentinel regexes (default: `<title>[^<]+</title>` and `</html>`).
- Per target host once per cycle: **TLS certificate days-to-expiry** via `node:tls` peer certificate `valid_to`.

**Lane 2 — deep (Phase 2; daily):** reuse `@gogol/check-runner-node` `captureSiteEvidenceGraph` on the home route per language; emit `wgogol_probe_deep_ok` and duration. Runs in a separate container image (Playwright base); its absence never blocks Lane 1.

### Metric registry additions (`@gogol/observability`)

| Name | Kind | Labels | Meaning |
| --- | --- | --- | --- |
| `wgogol_probe_up` | gauge | `site_id`, `route` | 1 = status 2xx/3xx AND sentinel ok; else 0 |
| `wgogol_probe_ttfb_seconds` | gauge | `site_id`, `route` | last observed TTFB |
| `wgogol_probe_http_status_class_total` | counter | `site_id`, `route`, `status_class` | one increment per probe request |
| `wgogol_probe_content_ok` | gauge | `site_id`, `route` | sentinel result for HTML routes |
| `wgogol_probe_cert_expiry_days` | gauge | `site_id` | days until certificate expiry |
| `wgogol_probe_deep_ok` | gauge | `site_id` | Phase 2 |

`route` label values come only from the generated targets file (closed set → cardinality-safe). Resource: `service.name: "fleet-probe-runner"`, `wgogol.layer: "probe"`, `wgogol.site_id` per target, `deployment.environment: "production"`.

### Command `fleet.probe.targets.generate` — workspace, mutating, offline

Writes `backs/fleet-probe-runner/targets.generated.json` (GENERATED marker via `buildGeneratedHeader`, registered in `writes` + ownership map per RFC-0336):

```json
{
  "schemaVersion": 1,
  "targets": [
    {
      "siteId": "warpgogol-com",
      "origin": "https://warpgogol.com",
      "routes": ["/", "/de/", "/en/", "/sitemap.xml", "/robots.txt"],
      "sentinels": ["<title>[^<]+</title>", "</html>"]
    }
  ]
}
```

Resolution order per app workspace (deterministic; error if unresolved):

1. Production origin from the app's canonical site configuration (the same source that feeds sitemap/canonical URL generation — RFC-0317's canonical-URL owner).
2. Explicit entry in the authored overrides file `backs/fleet-probe-runner/targets.overrides.jsonc` (also the place to add routes, extra sentinels, or `"exclude": true` with a reason).

Routes default to `/` plus each configured language home plus `/sitemap.xml` and `/robots.txt`. Overrides merge by `siteId`.

### Command `fleet.probe.validate` — workspace, read-only, offline; in `PACKAGES_CHECK_PIPELINE`

| Rule | Severity | Meaning |
| --- | --- | --- |
| `FLEET-PRB-01` | error | `targets.generated.json` is stale (differs from a fresh in-memory generation). |
| `FLEET-PRB-02` | error | Schema violation (bad origin URL, empty routes, invalid sentinel regex). |
| `FLEET-PRB-03` | error | A target origin's host does not belong to the fleet (not derivable from any app workspace or overrides) — this runner must never probe third parties (RFC-0302 posture). |
| `FLEET-PRB-04` | error | Runner boundary violation: `backs/fleet-probe-runner` imports from `apps/*`. |
| `FLEET-PRB-05` | warning | An app workspace has no target entry and no explicit exclude. |

### Workspace layout

```text
backs/fleet-probe-runner/
  package.json               # private; dev/run:once/build:check scripts per RFC-0304
  back.config.json           # kind: "scheduled-worker", entry: "src/loop.ts"
  turbo.json
  Dockerfile                 # node:22-slim; no Playwright (Lane 1)
  targets.generated.json     # GENERATED (fleet.probe.targets.generate)
  targets.overrides.jsonc    # authored
  src/
    config.ts                # env parsing (WGOGOL_OTLP_*, PROBE_INTERVAL_MS override)
    probe.ts                 # single-target pulse probe (fetch + tls), pure, unit-testable
    loop.ts                  # scheduler: interval + jitter, concurrency cap, pusher flush per cycle
    run-once.ts              # one full cycle then exit (manual/systemd-timer mode)
  README.md
```

Deployment: a service entry in `backs/observability-stack/compose.extra.yaml` with `WGOGOL_OTLP_ENDPOINT=http://otel-collector:4318` (compose-internal; the public token guards only the Caddy edge), `restart: unless-stopped`.

## Architectural fit

- **DNA-1 / RFC-0304.** Deployable composition in `backs/*`; reusable contracts stay in packages; probe logic that later proves reusable graduates to `@gogol/check-core`.
- **RFC-0337/0338.** Metrics-only output through the port; runs beside the collector it feeds.
- **RFC-0342.** The fleet-down and cert-expiry alert rules consume exactly these series.
- **RFC-0315 / RFC-0301.** Complementary, not overlapping: 0315 probes the _header contract_ at deploy time, 0301 gates deploys on alt-URL checks; this RFC is continuous post-deploy monitoring. A future amendment may fold 0315's header assertions into the daily deep lane.
- **RFC-0336.** The targets file is a governed generated artifact with an owner command.

## Design

(Fully specified above: lanes, metrics, commands, layout. `probe.ts` must be a pure function `probeTarget(target, fetchImpl, tlsImpl) → ProbeObservation` so unit tests inject fakes; `loop.ts` maps observations to pusher calls.)

## Rollout

1. Implement `fleet.probe.targets.generate` + `fleet.probe.validate` with fixtures; generate and commit the initial targets file (3 sites).
2. Implement the runner (Lane 1) with fake-fetch/fake-TLS unit tests; wire `fleet.probe.validate` into `PACKAGES_CHECK_PIPELINE`; regenerate command manifest; run `gitattributes.generate`.
3. Add the compose service (RFC-0338 stack); deploy; verify `wgogol_probe_up` for all sites in SigNoz; record the query in the implementing PR.
4. Phase 2 (separate follow-up commit series, same RFC): deep lane container + daily schedule.
5. New apps: onboarding regenerates targets (FLEET-PRB-05 nags until the app is targeted or excluded).

## Alternatives considered

- **Deploy OneUptime/Uptime Kuma alongside SigNoz.** Rejected: second product to operate, strictly weaker checks than the in-house engine, and no content sentinels; the studio's check stack already exists.
- **Cloudflare Workers cron probing.** Rejected: probing Cloudflare-served sites from inside Cloudflare hides an entire class of failures (CF outage/misconfig); the EU VPS is a true external vantage.
- **Playwright for every pulse.** Rejected: ~100× cost per probe for negligible added signal at 5-minute cadence; browser depth belongs in the daily deep lane.
- **Reusing backs/check-warpgogol-runner directly.** Rejected: that runner is queue-driven, product-scoped (third-party URLs, Playwright-first). Shared logic belongs in packages, not by coupling two deployables.

## Risks

- **Probe traffic pollutes analytics.** Mitigated: distinctive User-Agent; Matomo/analytics exclusion documented; volume is negligible (≈ 5 routes × 3 sites / 5 min).
- **VPS-local network blips create false negatives.** Mitigated: RFC-0342 alert thresholds require sustained failure (e.g. 10 min = 2 cycles); `status_class="error"` is distinguishable from 5xx.
- **Sentinel regexes rot as templates evolve.** Mitigated: defaults are structural (`<title>`, `</html>`), overridable per site; a failing sentinel with a 200 status shows as `content_ok=0` distinctly, prompting an override fix rather than a false "down".
- **Targets resolution source ambiguity.** Mitigated: resolution order is fixed; unresolved = hard error at generation time, forcing an explicit override rather than a guess.

## Acceptance criteria

- [x] `backs/fleet-probe-runner` exists per layout; boundaries clean (no `apps/*` imports). (evidence: original apps retired by RFC-0381, implemented historically)
- [x] Registry entries added; `observability.conventions.validate` green. (evidence: implemented historically)
- [x] `fleet.probe.targets.generate` produces a deterministic, marker-carrying file covering all three apps; `fleet.probe.validate` (FLEET-PRB-01..05) fixture-tested and in `PACKAGES_CHECK_PIPELINE`. (evidence: implemented historically)
- [x] `probe.ts` unit tests cover: healthy target, 5xx, timeout→`error`, sentinel failure with 200, cert expiry extraction — all via injected fakes, no network. (evidence: implemented historically)
- [x] Runner deployed on the stack VPS; `wgogol_probe_up` visible in SigNoz for all sites (evidence in implementing PR). (evidence: implemented historically)
- [x] Command manifest + gitattributes regenerated; `rfc.validate` passes on this file. (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status `accepted` (or `implemented`); transition per RFC-0224 with RFC-0330 evidence (Phase 1 completion is sufficient for `implemented` if Phase 2 is recorded as deferred in the RFC body — mirror the RFC-0221 precedent of checked-criteria transparency).
- Never probe an origin that fails FLEET-PRB-03. This runner has no safety machinery for third-party sites by design.
- `targets.generated.json` is GENERATED: change the generator or the overrides file, never the output (RFC-0336 guard applies).
- Keep Lane 1 free of Playwright and of `@gogol/check-runner-node` imports; that dependency arrives only with the Phase 2 image.
- Do not buffer metrics across cycles; one pusher flush per cycle keeps loss bounded to a single interval.
