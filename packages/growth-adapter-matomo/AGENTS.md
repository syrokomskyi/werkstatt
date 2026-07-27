# `@warpgogol/growth-adapter-matomo` — Agent Guide

Matomo implementation of `GrowthAdapter` for the RFC-0305 Messkanon baseline (RFC-0027 / DNA-30).

## Configuration

In `src/content/system.md`:

```yaml
growth:
  vendor:
    adapter: matomo
    options:
      proxyBaseUrl: "/_wg/analytics/"
      siteId: "1"
      productionHost: "example.org"
      clientId: "client-semantic-id"
      siteType: "thin_site"
      messkanonVersion: "1.0.0"
      consentLevel: "cookieless"
      dimension.client_id: "1"
      dimension.messkanon_version: "2"
      dimension.consent_level: "3"
      dimension.site_type: "4"
      dimension.page_type: "5"
```

## Behavior

- Loads `matomo.js` only through the configured first-party proxy and configures the `_paq` queue.
- **Bannerfrei by design**: disables cookies, disables browser feature detection, respects Do Not Track, and host-gates production traffic.
- Event mapping: `page-view` → `trackPageView`; approved `contact.*` Messkanon events → `trackEvent("contact", <action>, <safe-name>)`.
- The adapter declares `accepts` with the closed list of events it handles (`page-view` + `contact.*`). Events outside this list are dropped by `emit()` with a `console.warn`.
- `identifySegment` is a no-op until RFC-0027 persona detection ships.

## Architecture

The adapter is **binding-driven**: a `MatomoBinding` object (`DEFAULT_MATOMO_BINDING`) defines event mappings, dimensions, and tracker configuration. No hardcoded inline tables — all is read from the binding.

The `MatomoTransport` seam abstracts browser delivery (`_paq` queue, script injection, opt-out, host check). `BrowserMatomoTransport` is the production implementation; `StubMatomoTransport` records calls for testing without a DOM.

`createMatomoAdapter({ transport?, binding? })` is the factory. The default export is a singleton created via this factory. No module-level mutable state.

## Rules for AI agents

- Supported growth adapters are `matomo` and `null` only.
- Do NOT restore RFC-0170 direct-host options (`url`, `jsEndpoint`) or generic `"growth"` event forwarding.
- Do NOT add cookie-based tracking or localStorage visitor identity.

## Validation

```sh
pnpm --filter @warpgogol/growth-adapter-matomo build:check
```
