# @warpgogol/growth-adapter-matomo

Matomo implementation of the vendor-agnostic `GrowthAdapter` for RFC-0305 Messkanon over a first-party analytics proxy.

Configure in `src/content/system.md`:

```yaml
growth:
  vendor:
    adapter: matomo
    options:
      proxyBaseUrl: "https://example.org/_wg/analytics/"
      siteId: "1" # Matomo site id
      productionHost: "example.org"
      clientId: "client-semantic-id"
      siteType: "client"
      messkanonVersion: "1.0.0"
      privacyProfile: "bannerfrei-v1"
      consentLevel: "bannerfrei"
```

## Behavior

- Loads `matomo.js` only from the first-party proxy and configures the `_paq` queue.
- Banner-free baseline: disables cookies, disables browser feature detection, respects Do Not Track, and host-gates production traffic.
- Event mapping: `page-view` → `trackPageView`; approved `contact.*` Messkanon events → `trackEvent("contact", <action>, <safe-name>)`.
- All non-Messkanon growth events are ignored by this adapter (enforced via `accepts` field).
- `identifySegment` is a no-op until RFC-0027 persona detection ships.

## Architecture

The adapter is **binding-driven**: a `MatomoBinding` object (typed TS projection of `matomo-binding.yaml`) defines event mappings, dimensions, and tracker configuration. No hardcoded inline tables.

The `MatomoTransport` seam abstracts browser delivery (`_paq` queue, script injection, opt-out, host check). `BrowserMatomoTransport` is the production implementation; `StubMatomoTransport` records calls for testing without a DOM.

Use `createMatomoAdapter({ transport?, binding? })` to create an instance with custom transport or binding for tests. The default export is a singleton created via this factory.

Supported growth adapters are `matomo` and `null` only.
