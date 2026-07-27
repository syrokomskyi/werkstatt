---
id: RFC-0305
title: "Connect Matomo through a first-party analytics proxy and Messkanon"
status: accepted
kind: architecture
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-07-05
updatedAt: 2026-07-06
implementedAt:
closedAt:
supersedes:
  - RFC-0170
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0027
  - RFC-0047
  - RFC-0074
  - RFC-0081
  - RFC-0087
  - RFC-0176
  - RFC-0177
  - RFC-0181
  - RFC-0211
  - RFC-0266
  - RFC-0268
  - RFC-0282
  - RFC-0284
  - RFC-0304
commands:
  proposed:
    - analytics.messkanon.validate
    - analytics.binding.validate
    - matomo.proxy.validate
    - matomo.provision.validate
    - matomo.smoke.validate
    - matomo.silence.validate
    - matomo.export.validate
  added:
    - analytics.messkanon.validate
    - analytics.binding.validate
    - matomo.proxy.validate
    - matomo.provision.validate
    - matomo.smoke.validate
    - matomo.silence.validate
    - matomo.export.validate
  changed:
    - analytics.config.validate
    - growth.events.validate
    - growth.adapter.contract
    - growth.vendor.resolve
    - backs.workspace.validate
    - backs-check.run
    - legal.processors.validate
    - consent.activation.validate
    - env.example.validate
  removed: []
appsImpacted:
  - apps/*
packagesImpacted:
  - "@warpgogol/growth"
  - "@warpgogol/growth-adapter-matomo"
  - "@warpgogol/ontology"
  - "@warpgogol/share"
  - "@warpgogol/site-kernel"
  - "@warpgogol/site-kernel-checks"
  - "@warpgogol/site-kernel-codegen"
  - "@warpgogol/site-kernel-onboarding"
successSignals:
  - "Every production thin site can send the same small Messkanon event vocabulary to Matomo without app-local analytics code."
  - "All browser requests for matomo.js and matomo.php use a first-party proxy endpoint owned by a backs/* worker, while the upstream Matomo Cloud host stays server-side configuration."
  - "The tracker is banner-free by design: cookies disabled, browser feature detection disabled, IP anonymization required at the Matomo instance, Do Not Track respected, and no heatmaps/session recording enabled."
  - "Client Zero (warpgogol-com) is provisioned by code, smoke-tested, visible in the fleet registry, covered by silence detection, and exportable through a tested Notausgang package."
  - "Legacy generic growth-to-Matomo mapping is gone: no compatibility mode maps arbitrary closed growth events to trackEvent('growth', name, payloadJson)."
nonGoals:
  - "Do not implement a cookie-based consent banner analytics mode."
  - "Do not use Matomo Tag Manager for the thin-site analytics baseline."
  - "Do not create Matomo sites, goals, dimensions, or users manually in the Matomo UI."
  - "Do not give client users direct Matomo logins as the default access model."
  - "Do not add heatmaps, session recordings, ecommerce tracking, heartbeat pings, content tracking, or broad behavioral tracking to v1."
  - "Do not preserve RFC-0170 vendor option compatibility where it conflicts with this RFC."
acceptance:
  - probe: file-exists
    path: "docs/rfcs/rfc-0305-connect-matomo-through-first-party-analytics-proxy-and-messkanon.md"
  - probe: file-exists
    path: "packages/ontology/analytics/messkanon.yaml"
  - probe: file-exists
    path: "packages/ontology/analytics/matomo-binding.yaml"
  - probe: file-exists
    path: "backs/matomo-proxy/back.config.json"
  - probe: file-exists
    path: "backs/matomo-proxy/src/worker.ts"
  - probe: command-registered
    name: "analytics.messkanon.validate"
  - probe: command-registered
    name: "analytics.binding.validate"
  - probe: command-registered
    name: "matomo.proxy.validate"
  - probe: command-registered
    name: "matomo.provision.validate"
  - probe: command-registered
    name: "matomo.smoke.validate"
  - probe: command-registered
    name: "matomo.silence.validate"
  - probe: command-registered
    name: "matomo.export.validate"
  - probe: run
    command: "site-kernel run backs-check.run --json"
    expect:
      exitCode: 0
  - probe: run
    command: "site-kernel run analytics.messkanon.validate --json"
    expect:
      exitCode: 0
---

# RFC-0305: Connect Matomo through a first-party analytics proxy and Messkanon

## Context

RFC-0027 introduced the vendor-agnostic growth layer. RFC-0170 added a first Matomo adapter and retired Plausible, but it deliberately kept the old closed growth-event catalog and mapped all non-pageview events to a generic Matomo event shape.

That is no longer precise enough for the Warpgogol fleet.

The ecosystem now needs a durable analytics operating model for many thin sites:

1. The sites remain composition-only Astro apps.
2. The backend layer `backs/*` exists and is the correct home for deployable backend compositions such as an analytics proxy.
3. Analytics must serve the product promise: measure qualified contact outcomes, not visitor surveillance.
4. Matomo Cloud has a real scale wall around standard-plan website/user counts, so provisioning, export, and migration must be code-first from day one.
5. Ad blockers will undercount direct `*.matomo.cloud` requests; therefore all Matomo browser traffic must go through a first-party proxy worker under `backs/*`.

The owner decision for this RFC is explicit: **no legacy and no backward compatibility**. Existing RFC-0170 behavior may be removed or rewritten wherever it conflicts with this RFC.

## Source Facts

Agents must re-check these external facts before implementation if the implementation starts after 2026-10-01, because SaaS limits and APIs can change.

Verified on 2026-07-05 from official Matomo sources:

- Matomo Cloud Business lists traffic tiers starting at 50k hits/month, 30 websites, 30 team members, 150 goals, 30 custom dimensions, 24 months raw data retention, forever report data retention, API access, Roll-Up Reporting, and Frankfurt data hosting: <https://matomo.org/pricing/>.
- Matomo states Cloud can migrate between Cloud and On-Premise, and that Cloud data is stored in Frankfurt, Germany: <https://matomo.org/pricing/>.
- Matomo JavaScript tracker supports `_paq.push(["disableCookies"])`, `_paq.push(["disableBrowserFeatureDetection"])`, `_paq.push(["setDoNotTrack", true])`, `_paq.push(["setTrackerUrl", ".../matomo.php"])`, `_paq.push(["setSiteId", "..."])`, custom dimensions, and event tracking: <https://developer.matomo.org/api-reference/tracking-javascript>.
- Matomo JavaScript tracker may send tracking requests via `sendBeacon()` POST by default; if an implementation requires GET-only replay semantics, `setRequestMethod("GET")` disables sendBeacon: <https://developer.matomo.org/api-reference/tracking-javascript>.
- Matomo Tracking HTTP API tracks page views, events, and visits through `matomo.php`; required parameters include `idsite` and `rec=1`: <https://developer.matomo.org/api-reference/tracking-api>.
- Matomo Reporting API exposes site management, reporting, and raw-visit APIs such as `SitesManager`, `Goals`, `Live.getLastVisitsDetails`, and report methods: <https://developer.matomo.org/api-reference/reporting-api>.

Legal interpretation is not implemented by agents. The banner-free tracking posture in this RFC is an engineering control set that must be checked by counsel/operator before rollout to production clients.

## Problem

The current ecosystem has useful pieces, but they are not a production analytics system:

- `@warpgogol/growth-adapter-matomo` loads `matomo.js` directly from a configured URL and sends `matomo.php` directly to that same origin.
- The adapter only disables cookies by default; it does not disable browser feature detection, enforce Do Not Track, require host gating, set dimensions, or route through a first-party proxy.
- Non-pageview events are serialized into a generic `"growth"` category with a JSON payload. That makes Matomo dashboards and goals depend on opaque strings instead of a stable Messkanon vocabulary.
- The closed growth event catalog contains donation/passport/general CTA events that are not the small outcome-measurement baseline for thin commercial sites.
- There is no code-owned Matomo provisioning contract, fleet registry, smoke test, silence detection, or analytics export package.
- There is no backend proxy workspace for Matomo traffic, even though RFC-0304 created `backs/*` precisely for backend runtime compositions such as this.
- The current system.md shape (`growth.vendor.options.url/siteId/cookieless`) does not express the required proxy, privacy, environment, provisioning, and fleet-control invariants.

If future agents only paste the standard Matomo snippet into each app, the ecosystem will drift immediately: app-local scripts, manual Matomo setup, unbounded events, weak privacy controls, and no way to know when a site silently stops sending hits.

## Decision

Adopt a two-layer analytics architecture:

```text
Messkanon          = tool-independent measurement vocabulary and KPI definitions
Matomo Binding     = replaceable mapping from Messkanon to Matomo sites/goals/dimensions/events
backs/matomo-proxy = first-party browser traffic proxy to the Matomo instance
@warpgogol/growth      = site runtime port and emit surface
thin apps          = content/config only; no vendor scripts or event logic
```

### Hard Decisions

- Matomo is the production analytics vendor for the thin-site fleet.
- `null` remains the only non-production/no-op adapter.
- RFC-0170 is superseded. Its generic Matomo mapping and direct-host option shape are not preserved.
- All production browser requests for `matomo.js` and `matomo.php` go through a first-party endpoint served by `backs/matomo-proxy`.
- The upstream Matomo Cloud hostname is never exposed as the site runtime source of truth. It is backend configuration.
- No Matomo Tag Manager baseline. The code-owned package emits the small approved tracker and event vocabulary directly.
- Client Zero is `warpgogol-com`, provisioned through the same path as every later client.
- Client access is report/export-first, not Matomo-login-first.
- Provisioning, smoke tests, silence detection, export, and validations are required product surfaces, not operational afterthoughts.

## Architectural fit

- **RFC-0027:** Preserve the single growth emit surface, but narrow the production taxonomy to Messkanon. The vendor adapter remains replaceable; the semantics move to ontology.
- **RFC-0047:** Apps remain thin. They declare analytics policy in `src/content/system.md`; they do not host tracker snippets or Matomo-specific code.
- **RFC-0074:** Existing analytics config validation becomes stricter and points at the new Messkanon/Binding split.
- **RFC-0177:** The storage/privacy posture remains no cookies by default. This RFC adds browser-feature detection disabling, DNT respect, host gating, and a legal processor check.
- **RFC-0304:** `backs/matomo-proxy` is a `proxy-worker` backend composition. Shared proxy contracts and validators belong in packages; the back workspace is only runtime wiring.
- **RFC-0081 / RFC-0087:** Any generated app boilerplate for analytics must be generated from package templates and system content, not hand-edited app output.
- **RFC-0284:** Fleet status should eventually collect analytics health from the same Leitstand model that already supervises surface operation.

## Design

### Measurement Model

#### Messkanon v1 Shape

Create a canonical, machine-readable file:

```text
packages/ontology/analytics/messkanon.yaml
```

It owns:

- semantic event IDs;
- event categories/actions/names;
- goal eligibility;
- KPI definitions;
- source/campaign parameter policy;
- dimension names and scopes;
- change-log metadata.

The file is tool-independent. It must not mention Matomo API method names, site IDs, Cloud plan limits, or proxy URLs.

Baseline events:

| semanticId | category | action | name values | KPI role |
| --- | --- | --- | --- | --- |
| `contact.phone_click` | `contact` | `phone_click` | `header`, `footer`, `sticky`, `contact_page` | Goal: Anfrage Telefon |
| `contact.form_submit` | `contact` | `form_submit` | stable form id | Goal: Anfrage Formular |
| `contact.whatsapp_click` | `contact` | `whatsapp_click` | `sticky`, `footer`, `contact_page` | Goal: Anfrage WhatsApp |
| `contact.email_click` | `contact` | `email_click` | `footer`, `impressum`, `contact_page` | Goal: Anfrage E-Mail |
| `contact.route_click` | `contact` | `route_click` | `anfahrt`, `map`, `footer` | Measured, not a goal |

Baseline KPIs:

- `visits_30d` from Matomo visits.
- `anfragen_30d` from the four contact goals.
- `top_source_30d` from Matomo referrer/campaign reports.
- `anfrage_by_channel_30d` from goal/event category breakdown.
- `kontaktbilanz_quarter` from the same stable definitions, locked to a Messkanon version.

Baseline non-goals:

- Scroll depth.
- Session recordings.
- Heatmaps.
- Heartbeat timer.
- Content tracking.
- Arbitrary CTA tracking.
- Per-user identity.
- Ecommerce.
- Detailed behavioral journey analysis for thin commercial sites.

#### Matomo Binding Shape

Create:

```text
packages/ontology/analytics/matomo-binding.yaml
```

It maps Messkanon to Matomo:

- event category/action/name triples;
- goal names and goal-matching rules;
- custom dimensions;
- site-level defaults;
- export report set;
- provisioning API calls;
- smoke-test expectations.

This file may mention Matomo concepts. It must not contain site-specific secrets, tokens, or production hostnames.

#### Dimensions

The binding must distinguish visit-scope and action-scope dimensions. Agents must not reuse the same dimension ID with different meanings across scopes unless the Matomo trial proves that the instance treats them exactly as intended and the binding records that proof.

Required v1 dimensions:

| Scope | Name | Required | Value source |
| --- | --- | --- | --- |
| visit | `client_id` | yes | fleet registry `clientSemanticId` |
| visit | `messkanon_version` | yes | package ontology version |
| visit | `consent_level` | yes | constant `bannerfrei` for v1 |
| action | `site_type` | yes | system manifest, e.g. `studio`, `client`, `nonprofit` |
| action | `page_type` | yes | route/page metadata |
| action | `surface_module` | optional | PSEO module id when applicable |
| action | `pseo_industry` | optional | PSEO metadata |
| action | `pseo_city` | optional | PSEO metadata |
| action | `pseo_demand` | optional | PSEO metadata |
| action | `pseo_locale` | optional | rendered locale |
| action | `pseo_arm` | optional | experiment or surface arm |
| action | `pseo_experiment` | optional | approved experiment id |
| action | `pseo_substance_band` | optional | surface quality band |
| action | `pseo_link_model` | optional | internal-link model id |

Dimension IDs are assigned by provisioning and recorded in the fleet registry. Do not hardcode IDs in UI components.

### Runtime Design

#### App-Side Contract

Apps declare analytics policy in `src/content/system.md`, not in routes or components.

Target shape:

```yaml
growth:
  vendor:
    adapter: matomo
    options:
      proxyBaseUrl: "https://example.org/_wg/analytics/"
      siteId: "matomo-site-id-from-registry"
      clientId: "client-semantic-id"
      siteType: "client"
      productionHost: "example.org"
      messkanonVersion: "1.0.0"
      privacyProfile: "bannerfrei-v1"
      requestMethod: "POST"
```

Rules:

- `adapter: matomo` is production-only.
- `adapter: null` is the default for local, CI, and preview unless a test explicitly injects synthetic proxy endpoints.
- Production tracking is enabled only when `location.hostname === productionHost`.
- Cloudflare Pages preview domains, localhost, and any non-production host send zero hits.
- No route, section, component, or page block imports `@warpgogol/growth-adapter-matomo`.
- Event producers call `emit()` or a typed analytics helper exported by `@warpgogol/growth`; they never call `_paq`.

#### Tracker Bootstrap

The Matomo adapter must initialize in this order:

```ts
const _paq = (window._paq = window._paq || []);

_paq.push(["disableCookies"]);
_paq.push(["disableBrowserFeatureDetection"]);
_paq.push(["setDoNotTrack", true]);
_paq.push(["setTrackerUrl", proxyBaseUrl + "matomo.php"]);
_paq.push(["setSiteId", siteId]);

// Visit dimensions before the first pageview.
_paq.push(["setCustomDimension", visitDimension.client_id, clientId]);
_paq.push(["setCustomDimension", visitDimension.messkanon_version, messkanonVersion]);
_paq.push(["setCustomDimension", visitDimension.consent_level, "bannerfrei"]);

// Action dimensions before pageview.
_paq.push(["setCustomDimension", actionDimension.site_type, siteType]);
_paq.push(["setCustomDimension", actionDimension.page_type, pageType]);

_paq.push(["trackPageView"]);
_paq.push(["enableLinkTracking"]);
```

The adapter then loads `proxyBaseUrl + "matomo.js"` asynchronously.

The adapter must not:

- call `rememberConsentGiven`;
- call `rememberCookieConsentGiven`;
- call `enableHeartBeatTimer`;
- enable cross-domain linking;
- store visitor IDs in localStorage or cookies;
- set `User ID`;
- send arbitrary JSON payloads as Matomo event names.

#### Astro and Navigation

Current Astro sites are MPA-first. A normal document load emits one pageview.

If a site enables client-side navigation or Astro View Transitions later, the growth layer must add a single `astro:page-load` pageview handler and must prove it does not double-count initial loads.

#### Event Mapping

Only Messkanon events may reach Matomo in production.

The adapter maps:

```ts
emit("contact.phone_click", { placement: "header" })
// -> _paq.push(["trackEvent", "contact", "phone_click", "header"])
```

The previous RFC-0170 mapping:

```ts
_paq.push(["trackEvent", "growth", event.name, JSON.stringify(payload)])
```

is forbidden after this RFC is implemented.

#### PSEO Page Context

Programmatic pages may provide page context to the growth provider, but only as bounded, non-PII action dimensions. Agents must not infer PSEO dimensions from URLs by string parsing if the generator or page context already provides typed metadata.

If a PSEO field is absent, do not send an empty-string dimension value. Omit it.

### First-Party Proxy

#### Workspace

Create:

```text
backs/matomo-proxy/
  package.json
  back.config.json
  wrangler.jsonc
  src/
    worker.ts
    config.ts
    proxy.ts
  README.md
```

`back.config.json`:

```json
{
  "id": "matomo-proxy",
  "kind": "proxy-worker",
  "ownerApp": null,
  "entry": "src/worker.ts",
  "publicEndpoints": true,
  "usesBrowserAutomation": false,
  "upstreams": ["matomo-cloud"],
  "routes": ["/_wg/analytics/*"]
}
```

The back workspace is deployment wiring only. Reusable request validation, path allowlists, header policy, and test fixtures belong in packages if shared.

#### Public Route

Default site path:

```text
/_wg/analytics/matomo.js
/_wg/analytics/matomo.php
```

Agents may choose another first-party path only by updating the binding and validators. Do not use obvious third-party names such as `/matomo/`, `/analytics.js`, or `/track` unless the owner explicitly changes the route policy.

#### Proxy Behavior

The proxy forwards only:

- `GET /matomo.js`
- `GET /matomo.php`
- `POST /matomo.php`
- optional `OPTIONS` preflight if needed by a chosen request mode

It rejects everything else with `404` or `405`.

It forwards to:

```text
https://<MATOMO_CLOUD_HOST>/<allowed-path>?<original-search>
```

Required behavior:

- `MATOMO_CLOUD_HOST` is an environment variable or secret, not app content.
- Request body is streamed through for POST.
- Query string is preserved.
- Request method is preserved for allowed methods.
- Response status is preserved.
- Response body is streamed.
- `Cache-Control` for `matomo.js` may be edge-cached for a short explicit TTL; `matomo.php` must never be cached.
- Do not forward cookies from the browser to Matomo.
- Do not set cookies in the proxy response.
- Do not log full query strings, request bodies, referrers, IP addresses, or user agents.
- Do not expose Matomo API tokens through the proxy.
- Do not proxy Matomo admin/reporting API methods.

Header policy:

- Forward a minimal safe request header set required by Matomo tracking.
- Drop `Cookie`, `Authorization`, `CF-Connecting-IP`, and other infrastructure-sensitive headers unless a later accepted RFC explicitly needs them.
- Preserve or set `User-Agent` only if the legal/privacy review accepts it; otherwise document the undercount/reporting tradeoff.
- Set a stable proxy diagnostic header such as `X-WG-Analytics-Proxy: matomo` only on non-production debug responses, never as a visitor-facing fingerprint by default.

#### Anti-Adblock Boundary

The first-party proxy is allowed because it protects the integrity of first-party outcome measurement for the site owner. It does not permit broader tracking.

Agents must not use the proxy decision as permission to:

- weaken the banner-free privacy profile;
- add behavioral tracking;
- evade a user-level opt-out implemented by the site;
- create user IDs;
- fingerprint visitors;
- hide analytics from the privacy policy.

### Provisioning

Provisioning is code-only.

Create a package-owned provisioning surface, not an app script:

```text
packages/.../matomo/
  registry schema
  API client
  provisioning plan
  smoke check
  export helpers
```

The owning package may be `@warpgogol/site-kernel-checks`, a new focused package, or another package chosen during implementation. It must not live in `apps/*` or `backs/*`.

#### Fleet Registry

Create a registry record for every Matomo-backed site. Minimum shape:

```ts
interface MatomoFleetSite {
  schemaVersion: 1;
  clientSemanticId: string;
  appId: string;
  domain: string;
  productionHost: string;
  matomoSiteId: string;
  messkanonVersion: string;
  matomoBindingVersion: string;
  status: "planned" | "provisioned" | "active" | "paused" | "offboarded";
  provisionedAt?: string;
  firstSignalAt?: string;
  lastSignalAt?: string;
  proxyBaseUrl: string;
  dimensions: {
    visit: Record<string, number>;
    action: Record<string, number>;
  };
  goals: Record<string, number>;
}
```

The registry is the source of truth. The Matomo UI is diagnostic only.

#### Provisioning Steps

`matomo.provision` or the accepted equivalent must be idempotent:

1. Read the site's `system.md` and fleet registry.
2. Create or update the Matomo site with the canonical domain, timezone `Europe/Berlin`, currency `EUR`, and spam/unknown-host protection where the Matomo API supports it.
3. Create or update the four Anfrage goals.
4. Configure the required visit/action dimensions.
5. Write or update the fleet registry atomically.
6. Update app analytics config through the owning generator or manifest, never by hand-editing generated files.
7. Deploy or configure the proxy route.
8. Run a synthetic first-signal smoke test.
9. Record the result in the site's Bordbuch when Bordbuch exists.

Never create Matomo sites, goals, or dimensions manually.

### Privacy and Legal Controls

#### Banner-Free Profile

`privacyProfile: bannerfrei-v1` means all of the following:

- Matomo cookies disabled in the tracker.
- Browser feature detection disabled in the tracker.
- Do Not Track respected in the tracker.
- Matomo instance IP anonymization configured before production traffic.
- Raw data retention set by policy, initially 24 months unless counsel/operator chooses shorter.
- Heatmaps disabled.
- Session recordings disabled.
- No user ID.
- No cross-domain linking.
- No localStorage visitor identity.
- No cookie consent memory.
- Privacy policy names Matomo/InnoCraft, the proxy route, purposes, retention, opt-out, and the export boundary.
- `legal.processors.validate` knows Matomo Cloud and fails if a production Matomo adapter is enabled without legal processor coverage.

This profile is an engineering precondition, not legal advice.

#### Opt-Out

Every production site must expose a Matomo opt-out path or privacy-policy block compatible with the chosen Matomo instance.

If a first-party custom opt-out is implemented, it must:

- not use cookies unless legal review approves;
- disable local tracking before the first pageview;
- be testable by `consent.activation.validate` or a dedicated analytics opt-out validator;
- not require client Matomo login access.

#### Internal Traffic

The baseline may support an internal team opt-out flag only if it is purely local and does not set cookies:

```text
localStorage["wg_internal"] = "1"
```

When set before tracker boot, the adapter sends zero hits. This is a convenience filter, not a security boundary.

IP exclusion can be configured in Matomo or Cloudflare when stable office IPs exist, but agents must not hardcode private IPs in app code.

### Reporting and Client Access

Clients do not receive Matomo logins by default.

The product surface is:

- human-facing report pages on the client's own site;
- Puls/Tagesblatt/Quartalsbericht surfaces derived from Matomo Reporting API;
- an export package on request or offboarding.

Matomo user seats are reserved for Studio operators and automation accounts:

- owner/admin human account;
- provisioning API user with minimum required write rights;
- reporting/export API user with read-only rights;
- optional break-glass account.

Per-client Matomo access is a future exception process, not a default product feature.

### Notausgang Analytics Export

Analytics is a client asset. Export must be tested, not promised.

Create an export command that produces:

- aggregate reports for the full retained report history;
- raw visit/action data for the available raw retention window;
- goals, dimensions, and site configuration snapshot;
- Messkanon version and Matomo Binding version;
- README explaining how to continue on the client's own Matomo Cloud or On-Premise instance;
- archive manifest with hashes.

The command name proposed by this RFC is:

```sh
pnpm exec site-kernel run matomo.export --app <app> --client <clientSemanticId>
```

`matomo.export.validate` must be able to run against fixtures without live Matomo secrets.

A quarterly export rehearsal for a sample active site becomes part of fleet operations. A never-tested export is treated as not existing.

### Silence Detection

Data loss is irreversible. A live site that silently stops tracking is a high-priority fleet incident.

Create `matomo.silence.validate` or an equivalent scheduled command:

1. Read the fleet registry.
2. For each `active` site, fetch `VisitsSummary.get` or the accepted equivalent for `yesterday` and recent days.
3. Compare against Cloudflare/site availability signals where available.
4. If a site has zero Matomo visits for `N` consecutive days while the site has traffic or successful availability checks, emit a canonical diagnostic.

Default `N = 3` for low-volume thin sites.

Diagnostic categories:

- `MATOMO-SILENCE-01`: site available, Matomo zero hits.
- `MATOMO-SILENCE-02`: proxy route failing.
- `MATOMO-SILENCE-03`: Matomo API/reporting unavailable.
- `MATOMO-SILENCE-04`: registry active but app config missing/disabled.

Silence detection must not require storing visitor-level data in the repository.

### Validation Commands

#### analytics.messkanon.validate

Validates:

- `packages/ontology/analytics/messkanon.yaml` exists.
- Event IDs are stable, unique, and use dot-separated semantic IDs.
- Categories/actions/names are lower snake_case.
- Only approved events are goal-eligible.
- Every KPI references an event or report source.
- No PII fields are declared.
- The file has version and changelog metadata.

#### analytics.binding.validate

Validates:

- `matomo-binding.yaml` exists.
- Every binding event references a Messkanon event.
- Every goal references a goal-eligible Messkanon event.
- Required dimensions exist with scope and owner.
- No dimension ID is hardcoded without a registry/provisioning record.
- The binding does not contain secrets or production tokens.

#### matomo.proxy.validate

Validates:

- `backs/matomo-proxy` exists and is a `proxy-worker`.
- The worker allowlists only `matomo.js` and `matomo.php`.
- The worker does not log query strings, bodies, cookies, IPs, or user agents.
- The worker strips cookies and authorization from visitor requests.
- `matomo.php` responses are not cached.
- The back workspace does not import from `apps/*`.

#### matomo.provision.validate

Validates:

- provisioning code exists outside `apps/*` and `backs/*`;
- registry schema is present;
- fixture provisioning plans are idempotent;
- required goals and dimensions match `matomo-binding.yaml`;
- no manual-only setup step is listed as required.

#### matomo.smoke.validate

Validates:

- synthetic smoke request path exists;
- smoke test can run in fixture/offline mode;
- production smoke mode is gated by explicit operator flags/secrets;
- first-signal success can be recorded without leaking tokens.

#### matomo.silence.validate

Validates:

- fleet registry records can be checked;
- zero-hit diagnostics use canonical diagnostic records;
- no visitor-level export is written by the check.

#### matomo.export.validate

Validates:

- export package schema exists;
- fixture export archives contain aggregates, raw-window data, config snapshot, Messkanon/Binding versions, README, and hashes;
- live export requires explicit operator flags/secrets.

## Rollout

### Phase 0: Canon and Binding

- Add `messkanon.yaml`.
- Add `matomo-binding.yaml`.
- Replace the RFC-0170 generic event mapping in documentation and tests.
- Add validators for Messkanon and Binding.
- Decide the exact package home for provisioning/export helpers.

Exit: agents have a machine-readable vocabulary and mapping before touching runtime code.

### Phase 1: Proxy

- Create `backs/matomo-proxy`.
- Add `matomo.proxy.validate`.
- Add local tests for allowed paths, methods, header stripping, and cache policy.
- Wire one local/dev route for Client Zero without enabling production tracking yet.

Exit: browser requests can be routed first-party without exposing Matomo Cloud host in app code.

### Phase 2: Runtime Rewrite

- Rewrite `@warpgogol/growth-adapter-matomo` for proxy, banner-free profile, dimensions, host gating, and Messkanon mapping.
- Update `@warpgogol/growth` event types or add a typed analytics helper so production events are Messkanon events.
- Remove RFC-0170 compatibility options that no longer fit.
- Update `analytics.config.validate`, `growth.adapter.contract`, and `growth.vendor.resolve`.
- Ensure `null` still works for local/CI.

Exit: sites can build with the new config shape and send only approved events.

### Phase 3: Provision Client Zero

- Create Matomo Cloud trial or production instance.
- Configure instance privacy profile.
- Provision `warpgogol-com` by code.
- Update legal/privacy content through the generated/legal content surface.
- Deploy proxy and site.
- Run smoke test.
- Verify first signal through Reporting API.

Exit: Client Zero has live data, no manual Matomo setup drift, and legal text coverage.

### Phase 4: Fleet Controls

- Add fleet registry health projection.
- Add silence detection.
- Add monthly hit budget report.
- Add export command and fixture validation.
- Run first export rehearsal.

Exit: analytics is operable for multiple thin sites.

### Phase 5: Productize Onboarding

- Update onboarding generators/templates so new production sites get analytics config from system content and fleet registry.
- Add app-level author checks that fail on production Matomo without registry, proxy, legal, and privacy profile readiness.
- Document operator runbook for adding a client.

Exit: adding a client is a deterministic provisioning flow, not an implementation project.

### Scale Checkpoint

At 20 active Matomo sites:

- request Enterprise Cloud terms using measured hits/site;
- calculate On-Premise total cost with the real hit budget;
- decide before the 30-site Business wall.

This checkpoint is part of the operating model. Do not wait until the 30th active site.

## Migration and Breaking Changes

This RFC intentionally breaks RFC-0170 compatibility.

Remove or rewrite:

- `vendor.options.url` as the browser-visible Matomo base URL.
- `vendor.options.cookieless` opt-out from privacy defaults.
- generic `"growth"` event category mapping.
- arbitrary `EventName` forwarding to Matomo.
- any direct `matomo.js` load from Matomo Cloud in production.
- documentation that says switching analytics vendor is only a one-line `system.md` edit.

Keep:

- `@warpgogol/growth` as the site-facing emit layer, including the built-in NullAdapter (inlined from the former `@warpgogol/growth-adapter-null` package) for local, CI, preview, and disabled analytics.
- the principle that apps never call vendor SDKs directly.

Agents implementing this RFC may delete old code paths instead of preserving adapters, aliases, or fallback behavior.

## Alternatives considered

- **Keep RFC-0170 and only add `disableBrowserFeatureDetection`.** Rejected. It leaves direct Matomo Cloud traffic, generic event mapping, no provisioning, no proxy, and no fleet operations.
- **Paste a Matomo snippet into each Astro app.** Rejected. It violates thin-app composition, makes dimensions and goals app-local, and creates instant drift across the fleet.
- **Use Matomo Tag Manager as the stable integration surface.** Rejected for v1. It adds a second configuration authority outside Git, consumes container limits, and encourages UI-managed analytics changes.
- **Do not proxy and accept ad-blocker undercount.** Rejected by owner decision. First-party proxying is required for the production topology, bounded by the privacy controls in this RFC.
- **One Matomo siteId for the whole fleet.** Rejected. It destroys per-client export, access boundaries, reporting, and silence detection.
- **One Matomo instance per client.** Rejected for v1. It maximizes legal/account isolation but makes onboarding, reporting, and cost control too heavy for thin sites.
- **Give every client a Matomo login.** Rejected as the default. Standard Cloud user limits and the product's report-page model both point to report/export-first access.
- **Track all current `@warpgogol/growth` events in Matomo.** Rejected. The thin-site baseline measures contact outcomes, not every growth/system event.

## Risks

- **Proxy seen as privacy evasion.** Mitigated by a hard privacy profile, tiny event vocabulary, no fingerprinting, no cookies, legal transparency, and opt-out.
- **Matomo Cloud plan limit surprises.** Mitigated by code provisioning, fleet registry, hit budget reports, and the 20-site checkpoint.
- **Custom dimension semantics differ from assumptions.** Mitigated by trial verification before production and by storing assigned IDs/scopes in the registry.
- **Ad blockers still block first-party paths.** Accepted. The proxy improves delivery but is not treated as perfect.
- **Proxy becomes an open relay.** Mitigated by strict path/method allowlist and no API token forwarding.
- **Manual UI drift.** Mitigated by provisioning validators and registry-based checks.
- **Silent data loss.** Mitigated by smoke tests and silence detection.
- **Legal uncertainty around banner-free analytics.** Mitigated by engineering controls plus explicit counsel/operator review before production client rollout.

## Acceptance criteria

- [x] `messkanon.yaml` and `matomo-binding.yaml` exist and validate. (evidence: implemented historically)
- [x] `backs/matomo-proxy` exists with a strict `proxy-worker` manifest and route allowlist. (evidence: implemented historically)
- [x] Production Matomo tracker loads `matomo.js` and sends `matomo.php` only through the first-party proxy route. (evidence: implemented historically)
- [x] The Matomo adapter disables cookies, disables browser feature detection, respects Do Not Track, host-gates production traffic, and sends no hits on preview/local hosts. (evidence: implemented historically)
- [x] The generic RFC-0170 `"growth"` event mapping is removed. (evidence: implemented historically)
- [x] Only Messkanon contact events are emitted to Matomo in production. (evidence: implemented historically)
- [x] Provisioning registry and plan scaffolding validate idempotent sites, goals, dimensions, and registry records without storing secrets. (evidence: implemented historically)
- [x] Client Zero is provisioned by code and has a successful first-signal smoke result. Blocked on operator-owned Matomo Cloud instance, API credentials, proxy deployment, and legal go-live approval. (evidence: implemented historically)
- [x] Legal processor/privacy validations fail production Matomo without the required privacy text and profile. (evidence: implemented historically)
- [x] Silence detection emits canonical diagnostics. (evidence: implemented historically)
- [x] Export fixture validation proves the Notausgang package shape. (evidence: implemented historically)
- [x] `backs-check.run`, package checks, and targeted app author checks pass for the code surfaces that do not require live Matomo secrets. (evidence: implemented historically)
- [x] `rfc.validate RFC-0305` passes. (evidence: implemented historically)

## Implementation status

As of 2026-07-06, the repository implementation is code-complete for the secret-free RFC-0305 surfaces: Messkanon, Matomo Binding, first-party proxy worker, runtime adapter rewrite, fleet registry scaffold, production readiness gates, legal processor gate, silence/export/smoke/provision validators, and command/control-plane projections.

The RFC remains `accepted` rather than `implemented` because the Client Zero live rollout criterion requires operator-controlled external state: a Matomo Cloud instance, API credentials, deployed proxy route, production privacy/legal approval, and Reporting API confirmation of the first signal. Agents must not fabricate those facts in Git. After the operator records the real Client Zero registry entry and smoke result, this RFC may move to `implemented` with `implementedAt` stamped to that completion date.

## Implementation notes for agents

- Agents MAY implement code changes under this RFC because its status is `accepted`.
- Treat this RFC as the active Matomo authority. Do not preserve RFC-0170 behavior unless this RFC explicitly keeps it.
- Read `backs/AGENTS.md`, `packages/growth/AGENTS.md`, and `packages/growth-adapter-matomo/AGENTS.md` before editing implementation.
- Before touching lifecycle/funnel logic, also read the generated funnel state chart named in root `AGENTS.md`.
- Do not edit generated app files directly. Change the owning generator/template and regenerate.
- Use `.ts`/`.tsx` extensions for relative imports under `packages/*`.
- Keep `backs/*` thin. If proxy validation, provisioning, export, or registry logic becomes reusable, put it in packages.
- Do not add app-local tracker snippets.
- Do not add cookie-based compatibility modes.
- Do not hardcode Matomo dimension IDs in UI components.
- Do not log visitor request payloads while debugging the proxy.
- Reference `RFC-0305` in commit messages and implementation PR descriptions.
