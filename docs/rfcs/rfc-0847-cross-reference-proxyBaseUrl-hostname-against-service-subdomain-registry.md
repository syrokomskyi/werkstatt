---
id: RFC-0847
title: "Cross-reference proxyBaseUrl hostname against service subdomain registry"
status: implemented
kind: command
scope: app
owners:
  - architecture
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-08-14
updatedAt: 2026-08-14
implementedAt: 2026-08-14
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0305
  - RFC-0752
  - RFC-0753
  - RFC-0831
satisfies: []
versionBump: patch
commands:
  proposed: []
  added: []
  changed:
    - analytics.config.validate
  removed: []
appsImpacted: []
packagesImpacted:
  - werkstatt-site
successSignals:
  - "proxyBaseUrl hostname in system.md is always declared as a subdomain in services/registry.yaml"
  - "Mission validate fails before deploy when a Matomo proxy subdomain is missing from the registry"
  - "No DNS resolution errors for proxy URLs in production"
nonGoals:
  - "Does not create DNS records or Workers routes — that is subdomain.register's responsibility (RFC-0752)"
  - "Does not validate that DNS records exist in Cloudflare — that is subdomain.validate's responsibility"
  - "Does not check workers.dev URLs — only custom domain hostnames are cross-referenced"
  - "Does not validate CSP coverage for proxy origins — that is csp.origins.validate's responsibility (RFC-0831)"
---

# RFC-0847: Cross-reference proxyBaseUrl hostname against service subdomain registry

## Context

After deploying `warpgogol.com` to production, the browser console showed:

```
GET https://matomo-proxy.warpgogol.com/_wg/analytics/warpgogol-com/matomo.js net::ERR_NAME_NOT_RESOLVED
```

The `proxyBaseUrl` in `system.md` points to `https://matomo-proxy.warpgogol.com/_wg/analytics/warpgogol-com/`, but the `matomo-proxy` service in `services/registry.yaml` has `subdomains: []`. The `subdomain.register` command (RFC-0752) only runs when `subdomains.length > 0`, so no DNS CNAME or Workers Route was ever created.

The existing `analytics.config.validate` validator checks that `proxyBaseUrl` contains `/_wg/analytics/` (RFC-0305), but does NOT check that the hostname in `proxyBaseUrl` is declared as a subdomain in `services/registry.yaml`. This gap allows a site to reference a proxy URL that will never resolve in production.

## Problem

One invariant is unprotected:

**P1: Proxy URL hostname provisioning** — No validator cross-references the hostname in `growth.vendor.options.proxyBaseUrl` (in `system.md`) against the `subdomains` entries in `services/registry.yaml`. A site can declare a `proxyBaseUrl` with a custom hostname that no service has registered, leading to DNS resolution failure in production.

Reference failure mode:

- `system.md`: `proxyBaseUrl: "https://matomo-proxy.warpgogol.com/_wg/analytics/warpgogol-com/"`
- `services/registry.yaml`: `matomo-proxy` service has `subdomains: []`
- `subdomain.register` skips services with empty `subdomains` (RFC-0752)
- Result: `matomo-proxy.warpgogol.com` never resolves, Matomo analytics non-functional

## Decision

The existing `analytics.config.validate` command gains a new check rule `analytics-config.proxy-subdomain-registered` that:

1. Parses the `proxyBaseUrl` from `growth.vendor.options.proxyBaseUrl` in `system.md`
2. If the URL contains a scheme (absolute URL), extracts the hostname
3. Skips `localhost`, `127.0.0.1`, and `*.workers.dev` hostnames (dev/test URLs)
4. Reads `services/registry.yaml` and collects all declared subdomain domains
5. Emits an error if the hostname is not found in any service's `subdomains` array

## Architectural fit

- **RFC-0305** (Matomo first-party proxy) — This RFC enforces that the proxy hostname is provisioned in DNS before deploy.
- **RFC-0752** (subdomain.register) — This RFC ensures the precondition for `subdomain.register` is met: the subdomain must be declared in the registry.
- **RFC-0831** (csp.origins.validate) — Complementary. RFC-0831 checks CSP coverage for proxy origins in rendered HTML. This RFC checks DNS provisioning before build.
- **Site OS operator model** — Extends an existing app-scoped audit validator. Runs in the `mission.validate` pipeline as part of `analytics.config.validate`.

## Design

### CLI surface

No new command. The check is added to the existing `analytics.config.validate`:

```sh
pnpm exec werkstatt run analytics.config.validate
```

### TypeScript contracts

```ts
// New helper in analytics-config.ts
function extractProxyHostname(proxyBaseUrl: string): string | null {
  try {
    const parsed = new URL(proxyBaseUrl);
    return parsed.hostname;
  } catch {
    return null; // relative URL — no hostname to check
  }
}

function isDevHostname(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname.endsWith(".workers.dev")
  );
}
```

### Check rule

| Rule ID | Severity | Condition |
| --- | --- | --- |
| `analytics-config.proxy-subdomain-registered` | error | `proxyBaseUrl` hostname is absolute, not a dev hostname, and not found in any service's `subdomains` in `services/registry.yaml` |

### File system responsibilities

| Path                     | Role                                          |
| ------------------------ | --------------------------------------------- |
| `src/content/system.md`  | Read for `growth.vendor.options.proxyBaseUrl` |
| `services/registry.yaml` | Read for `subdomains` declarations            |

### Failure modes

- If `services/registry.yaml` cannot be read, the check is skipped with a warning (non-fatal). This prevents false positives in environments without the registry.
- If `proxyBaseUrl` is a relative path (no scheme), the check is skipped — relative paths are same-origin and don't require DNS provisioning.
- If `proxyBaseUrl` hostname is `localhost`, `127.0.0.1`, or `*.workers.dev`, the check is skipped — these are dev/test URLs.

## Rollout

- **Immediate fix**: Add `subdomains` entry for `matomo-proxy` in `services/registry.yaml` so the existing site passes the new check.
- **Default behavior**: Error on first introduction. The only site using Matomo (`warpgogol-com`) will pass after the registry fix.
- **New sites**: Automatically compliant — `analytics.config.validate` runs in `mission.validate`, so a missing subdomain declaration is caught before deploy.

## Alternatives considered

- **New standalone command** (`analytics.proxy-subdomain.validate`): Rejected. The check is naturally part of `analytics.config.validate` which already validates `proxyBaseUrl` format. A separate command would fragment analytics config validation.
- **Runtime check in `subdomain.register`**: Rejected. `subdomain.register` is service-scoped and doesn't have access to site `system.md`. The cross-reference belongs in the site-scoped audit validator.
- **DNS resolution check (live DNS lookup)**: Rejected. Live DNS lookups are slow, network-dependent, and already handled by `subdomain.validate` (RFC-0752). This check is a static declaration cross-reference, not a live DNS probe.

## Risks

- **False positive for external proxy providers**: If a site uses a third-party Matomo host (not a `*.workers.dev` proxy), the hostname won't be in `services/registry.yaml`. Mitigation: the check only applies when `growth.vendor.adapter === "matomo"` and `proxyBaseUrl` contains `/_wg/analytics/` (already enforced by RFC-0305).
- **Registry read failure**: Non-fatal skip prevents false positives when `services/registry.yaml` is unavailable.

## Acceptance criteria

- [x] `analytics.config.validate` emits `analytics-config.proxy-subdomain-registered` error when `proxyBaseUrl` hostname is not in `services/registry.yaml`
- [x] Check skips dev hostnames (`localhost`, `127.0.0.1`, `*.workers.dev`)
- [x] Check skips relative URLs (no scheme)
- [x] `matomo-proxy` service in `services/registry.yaml` has `subdomains` entry for `matomo-proxy.warpgogol.com`
- [x] Unit tests cover positive and negative cases
- [x] `warpgogol-com` passes `analytics.config.validate` after the registry fix

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST NOT weaken or remove the `analytics-config.proxy-subdomain-registered` check rule without a new RFC that supersedes this one.
