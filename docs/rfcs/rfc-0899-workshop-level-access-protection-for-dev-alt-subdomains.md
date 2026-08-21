---
id: RFC-0899
title: "Workshop-level access protection for dev and alt subdomains"
status: draft
kind: architecture
scope: workspace
owners:
  - architecture
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-08-21
updatedAt: 2026-08-21
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0842
  - RFC-0851
  - RFC-0865
satisfies:
  - DNA-73
versionBump: minor
commands:
  proposed:
    - leitstand.access.protect
    - leitstand.access.unprotect
    - leitstand.access.status
  added: []
  changed: []
  removed: []
appsImpacted: []
packagesImpacted:
  - "@warpgogol/werkstatt"
  - "@warpgogol/werkstatt-site"
successSignals:
  - "dev.* and alt.* subdomains require Basic Auth (4-digit PIN) to access"
  - "Search engines cannot index dev/alt subdomains (noindex + nofollow)"
  - "A single workshop command protects all sites with individual PINs"
  - "Main domain is never affected by access protection"
nonGoals:
  - "Do not protect the main domain — it must always be publicly accessible"
  - "Do not implement IP-based allowlisting — PIN-based auth is simpler and sufficient"
  - "Do not build separate artifacts for dev/alt vs main — the same artifact is used across all channels"
  - "Do not implement OAuth or session-based auth — Basic Auth with a PIN is the right complexity level"
---

# RFC-0899: Workshop-level access protection for dev and alt subdomains

## Context

The Werkstatt deployment pipeline (DNA-73) produces a single build artifact that is promoted sequentially through three channels: Dev → Alt → Main. The artifact is identical across all three — there is no rebuild per channel. This means build-time `noindex` meta tags or `robots.txt` differences between channels are impossible without breaking the single-artifact invariant.

Currently, `dev.warpgogol.com` and `alt.warpgogol.com` are publicly accessible without authentication. An SEO expert found that `dev.warpgogol.com` was indexed by Google, causing canonical URL pollution and duplicate content issues. The dev and alt channels are for internal review and staging — they should not be crawlable or publicly accessible.

The workshop manages multiple Sternsystemen (sites), each with their own dev/alt/main subdomains. Access protection must be manageable at scale — a command that can protect any site in the workshop with a simple PIN.

## Problem

Three unprotected gaps:

1. **Public access to dev/alt:** Anyone can visit `dev.*` and `alt.*` subdomains. These are internal review environments that may contain unfinished content, test data, or sensitive information.

2. **Search engine indexing of dev/alt:** Google indexed `dev.warpgogol.com`, causing canonical URL pollution. Without `noindex` headers, search engines crawl and index staging environments.

3. **No workshop-level tooling:** There is no command to manage access protection across sites. With many sites, manually configuring Cloudflare rules or Worker secrets for each is error-prone and does not scale.

## Decision

### 1. Runtime access protection middleware

A shared Astro middleware (`access-protection-middleware.ts`) is included in every site's build output. At runtime, it checks the `Host` header:

- If the host matches `dev.*` or `alt.*` patterns → require Basic Auth with a 4-digit PIN
- If the host matches `main.*` or the production domain → no protection, pass through
- If no PIN is configured (secret is unset) → no protection (allows new sites to work before protection is set up)

The middleware also sets HTTP response headers for dev/alt:
- `X-Robots-Tag: noindex, nofollow` — prevents search engine indexing
- `X-Robots-Tag: noai, noimageai` — prevents AI training data collection

### 2. Workshop-level commands

Three new `leitstand` commands manage PIN protection per Sternsystem:

- `leitstand.access.protect --id <system-id> [--pin <4-digit-pin>]` — sets a PIN as a Cloudflare Worker secret for the site's dev and alt deployments. If `--pin` is omitted, a random PIN is generated and displayed.
- `leitstand.access.unprotect --id <system-id>` — removes the PIN secret from the site's dev and alt deployments.
- `leitstand.access.status --id <system-id>` — reports whether protection is active for dev and alt, and shows the PIN (since it's a simple 4-digit code, not a high-security password).

### 3. PIN storage

The PIN is stored as a Cloudflare Worker secret (`ACCESS_PIN`) via `wrangler secret put`. The middleware reads it from the Worker runtime environment (`env.ACCESS_PIN`). Secrets are per-Worker, so each site has its own PIN.

## Architectural fit

- **DNA-73 (Sequential deployment pipeline enforcement):** The single-artifact invariant is preserved — the middleware is baked into the build, not added per-channel. The runtime Host check determines behavior, not the build.
- **DNA-57 (Dev/prod egress parity):** The middleware does not alter the HTML body — it only adds HTTP headers and an auth gate. What operators see in dev (after entering the PIN) is exactly what will be published to main.
- **Deployment pipeline:** The middleware is part of the Astro server entry point, which is included in every Cloudflare Worker deployment. No changes to `leitstand.dev-deploy`, `leitstand.propagate`, or `leitstand.promote` are needed — the middleware is already in the artifact.

## Design

### CLI surface

```sh
# Protect a site's dev/alt with a PIN
pnpm exec werkstatt run leitstand.access.protect --id warpgogol-com
# → Sets ACCESS_PIN secret on dev and alt Workers
# → Output: "Access protection enabled for warpgogol-com (dev/alt). PIN: 4827"

# Protect with a specific PIN
pnpm exec werkstatt run leitstand.access.protect --id warpgogol-com --pin 1234

# Remove protection
pnpm exec werkstatt run leitstand.access.unprotect --id warpgogol-com

# Check status
pnpm exec werkstatt run leitstand.access.status --id warpgogol-com
# → "warpgogol-com: dev=protected(PIN: 4827), alt=protected(PIN: 4827), main=public"
```

### TypeScript contracts

```ts
interface AccessProtectInput {
  systemId: string;
  pin?: string; // 4-digit string, auto-generated if omitted
}

interface AccessProtectResult {
  systemId: string;
  pin: string;
  channels: Array<{ channel: "dev" | "alt"; status: "protected" | "failed"; error?: string }>;
}

interface AccessStatusResult {
  systemId: string;
  channels: Array<{
    channel: "dev" | "alt" | "main";
    protected: boolean;
    pin?: string;
  }>;
}
```

### Middleware behavior

```ts
// Pseudocode for access-protection middleware
export function accessProtectionMiddleware(context, next) {
  const host = context.request.headers.get("host") ?? "";
  const isDevOrAlt = host.startsWith("dev.") || host.startsWith("alt.");

  if (!isDevOrAlt) {
    return next(); // Main domain — no protection
  }

  // Set noindex headers on all dev/alt responses
  const response = await next();
  response.headers.set("X-Robots-Tag", "noindex, nofollow, noai, noimageai");

  // Check if PIN is configured
  const pin = context.locals.runtime?.env?.ACCESS_PIN;
  if (!pin) {
    return response; // No PIN set — allow access (new sites, pre-protection)
  }

  // Check Basic Auth
  const auth = context.request.headers.get("authorization");
  if (auth === `Basic ${btoa(`access:${pin}`)}`) {
    return response; // Authenticated — show the page
  }

  // Not authenticated — challenge
  return new Response("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Staging Access"' },
  });
}
```

### File system responsibilities

| Path | Role |
|---|---|
| `packages/werkstatt-site/src/domain/share/middleware/access-protection.ts` | Shared middleware implementation |
| `packages/werkstatt-site/src/codegen/templates/app-boilerplate/src/middleware/` | Codegen template includes middleware in site build |
| `packages/werkstatt/src/leitstand/access-commands.ts` | Workshop-level command implementations |
| `systems-cache/{id}/system-config.yaml` | Read for dev/alt subdomain configuration |

### PIN format

- 4-digit numeric string (e.g. `4827`)
- Stored as Cloudflare Worker secret `ACCESS_PIN`
- The username is always `access` (the PIN is the password)
- Basic Auth credential: `access:<pin>` → base64-encoded

### Subdomain detection

The middleware checks the `Host` header against the site's configured subdomains from `system-config.yaml`:
- `mirrors[0].devSubdomain` (e.g. `dev.warpgogol.com`)
- `mirrors[0].altSubdomain` (e.g. `alt.warpgogol.com`)

If the Host matches either, protection is active. If `system-config.yaml` does not declare subdomains, the middleware falls back to pattern matching: `host.startsWith("dev.")` or `host.startsWith("alt.")`.

### Integration with deployment pipeline

The middleware is included in the Astro server entry point via codegen templates. It runs before all other middleware (language redirect, markdown negotiation). No changes to deployment commands are needed — the middleware is already in the built Worker.

`leitstand.access.protect` runs `wrangler secret put ACCESS_PIN` against the dev and alt Workers for the specified site. This is a runtime configuration change, not a redeployment.

## Rollout

- **Default behavior:** The middleware is included in all new site builds automatically via codegen templates. Existing sites get it on their next materialize/build cycle.
- **PIN management:** Operators run `leitstand.access.protect` after the first dev deployment of a new site. The command can be run at any time — it only affects the Worker secret, not the build.
- **No flag day:** Sites without a configured PIN remain publicly accessible (middleware passes through). This allows gradual adoption — protect sites one by one without breaking unprotected ones.
- **Main domain:** Never affected. The middleware only activates on dev/alt host patterns. Even if a PIN is accidentally set on the main Worker, the middleware does not check it for the main domain.

## Alternatives considered

- **Cloudflare Access (Zero Trust):** Rejected — adds per-user identity management complexity. A 4-digit PIN is the right level for staging environments that just need to keep crawlers and casual visitors out. Cloudflare Access also requires per-user seats in the plan.
- **Cloudflare Worker Rules (dashboard):** Rejected — manual dashboard configuration does not scale across many sites and is not version-controlled. The workshop must provide command-level tooling.
- **Build-time `noindex` meta tag:** Rejected — violates the single-artifact invariant (DNA-73). The same artifact is used across dev/alt/main. A meta tag in the HTML would appear on main too.
- **Separate `robots.txt` per channel:** Rejected — same single-artifact invariant issue. `robots.txt` is a build-time file baked into the artifact.
- **IP-based allowlisting:** Rejected — operators work from varying locations (home, office, mobile). PIN-based auth is location-independent and simpler to manage.
- **Session-based auth with login page:** Rejected — overkill for staging. Basic Auth with a PIN is stateless, requires no session storage, and works with all browsers and curl.

## Risks

- **PIN guessing:** A 4-digit PIN has 10,000 combinations. At 1 request/second, brute force takes ~2.8 hours. This is acceptable for staging protection — not a high-security boundary. Cloudflare rate limiting can be added later if needed.
- **PIN leakage in URLs:** Basic Auth sends credentials in the URL (`https://access:4827@dev.warpgogol.com`). This is a known Basic Auth limitation. For staging environments, this is acceptable. Operators should not share PIN-embedded URLs publicly.
- **Middleware performance:** The Host header check is O(1) — a string comparison. No measurable performance impact.
- **Secret management:** `wrangler secret put` requires Cloudflare API credentials. The command fails if the operator is not authenticated to Cloudflare. The error message includes a hint to run `wrangler login`.

## Acceptance criteria

- [ ] `access-protection.ts` middleware implemented in `packages/werkstatt-site/src/domain/share/middleware/`
- [ ] Middleware included in codegen templates for new sites
- [ ] Middleware runs before language redirect and markdown negotiation
- [ ] `leitstand.access.protect` command registered and implemented
- [ ] `leitstand.access.unprotect` command registered and implemented
- [ ] `leitstand.access.status` command registered and implemented
- [ ] Middleware sets `X-Robots-Tag: noindex, nofollow, noai, noimageai` on dev/alt
- [ ] Middleware returns 401 with `WWW-Authenticate` challenge when PIN is set and no/incorrect auth provided
- [ ] Middleware passes through when no PIN is configured (env var unset)
- [ ] Middleware passes through for main domain regardless of PIN
- [ ] Unit tests for middleware (dev host, alt host, main host, no PIN, correct PIN, incorrect PIN)
- [ ] Unit tests for `leitstand.access.protect` (auto-generate PIN, custom PIN, missing site)
- [ ] `rfc.validate` passes on this file before merging

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- The middleware MUST NOT modify the HTML response body — only headers and access gating.
- The middleware MUST NOT activate for the main/production domain, even if the PIN secret is set on the main Worker.
- The PIN is a 4-digit string (`/^\d{4}$/`). The command MUST validate this format before setting the secret.
- `leitstand.access.protect` MUST use `wrangler secret put ACCESS_PIN` (not environment variables in `wrangler.toml` — secrets are not stored in config files).
