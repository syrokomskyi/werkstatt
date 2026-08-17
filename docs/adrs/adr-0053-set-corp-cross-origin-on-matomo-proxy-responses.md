---
id: ADR-0053
title: "Set Cross-Origin-Resource-Policy: cross-origin on matomo-proxy responses"
status: implemented
scope: service
decider: architecture
createdAt: 2026-08-17
updatedAt: 2026-08-17
implementedAt: 2026-08-17
closedAt:
supersedes: []
supersededBy:
related:
  - RFC-0305
  - RFC-0751
reviewers: []
---

# ADR-0053: Set Cross-Origin-Resource-Policy: cross-origin on matomo-proxy responses

## Context

The main site (`warpgogol.com`) sets `Cross-Origin-Resource-Policy: same-site` in its `_headers` template. The Matomo proxy (`matomo-proxy.warpgogol.com`) serves `matomo.js` as a cross-origin script loaded by the main site. Chrome DevTools reports a Content Security Policy inspector issue because the proxy responses do not include a `Cross-Origin-Resource-Policy` header, causing a mismatch with the main site's CORP policy.

Lighthouse reports `inspector-issues` score=0 (binary), which also affects the Best Practices category score (0.96).

## Decision

Add `Cross-Origin-Resource-Policy: cross-origin` to all responses from the matomo-proxy Worker.

- The header is set in `withCachePolicy` (for `matomo.js` and `matomo.php` responses) and in the OPTIONS preflight response.
- This explicitly allows the main site to load the proxy's resources cross-origin, resolving the CORP mismatch.

## Justification

The matomo-proxy is intentionally a cross-origin resource — it exists to proxy Matomo analytics traffic through a first-party domain that is different from the main site. Setting `cross-origin` is the correct CORP value for resources that are loaded by other origins.

The alternative of serving Matomo from the same origin (same domain) was rejected — the proxy exists specifically to avoid third-party cookies and cross-site tracking.

## Consequences

- Positive: Resolves the Chrome DevTools inspector issue. Best Practices score improves from 0.96 to 1.0.
- Negative: The proxy responses are explicitly loadable by any origin. This is acceptable because the proxy only serves `matomo.js` (a public analytics script) and `matomo.php` (tracking endpoints that do not return sensitive data).
- Technical debt: None.

## Evolution

If the proxy is moved to the same origin as the main site (e.g. via Cloudflare Workers routes on the main domain), the `cross-origin` header can be removed.
