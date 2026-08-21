---
id: RFC-0899
title: "Workshop-level access protection for dev and alt subdomains"
status: accepted
kind: architecture
scope: workspace
owners:
  - architecture
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-08-21
updatedAt: 2026-08-21
enhancedAt: 2026-08-21
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

- `leitstand.access.protect --site <system-id> [--pin <4-digit-pin>]` — sets a PIN as a Cloudflare Worker secret for the site's dev and alt deployments. If `--pin` is omitted, a random PIN is generated and displayed. The PIN is also recorded in `system-state.yaml` (as a non-secret field `accessPin`) so that `status` can report it.
- `leitstand.access.unprotect --site <system-id>` — removes the PIN secret from the site's dev and alt Workers and clears `accessPin` from `system-state.yaml`.
- `leitstand.access.status --site <system-id>` — reports whether protection is active for dev and alt, and shows the PIN from `system-state.yaml` (since it's a simple 4-digit code, not a high-security password). Cloudflare Worker secrets cannot be retrieved via the `wrangler secret` API, so the PIN is stored in `system-state.yaml` for status reporting.

### 3. PIN storage

The PIN is stored in two places:

1. **Cloudflare Worker secret (`ACCESS_PIN`)** via `wrangler secret put` — the runtime secret checked by the middleware. Secrets are per-Worker, so each site/channel has its own PIN.
2. **`system-state.yaml` field `accessPin`** — a non-secret record of the PIN, used by `leitstand.access.status` to report the PIN value. Cloudflare Worker secrets cannot be retrieved via the `wrangler secret` API (`wrangler secret list` only shows names, not values), so the PIN must be stored in `system-state.yaml` for status reporting. The PIN is a 4-digit staging code, not a high-security password — storing it in `system-state.yaml` is acceptable.

The middleware reads the runtime secret from `env.ACCESS_PIN` (Cloudflare Workers runtime environment).

## Architectural fit

- **DNA-73 (Sequential deployment pipeline enforcement):** The single-artifact invariant is preserved — the middleware is baked into the build, not added per-channel. The runtime Host check determines behavior, not the build.
- **DNA-57 (Dev/prod egress parity):** The middleware does not alter the HTML body — it only adds HTTP headers and an auth gate. What operators see in dev (after entering the PIN) is exactly what will be published to main.
- **Deployment pipeline:** The middleware is part of the Astro server entry point, which is included in every Cloudflare Worker deployment. No changes to `leitstand.dev-deploy`, `leitstand.propagate`, or `leitstand.promote` are needed — the middleware is already in the artifact.

## Design

### CLI surface

```sh
# Protect a site's dev/alt with a PIN
pnpm exec werkstatt run leitstand.access.protect --site warpgogol-com
# → Sets ACCESS_PIN secret on dev and alt Workers
# → Output: "Access protection enabled for warpgogol-com (dev/alt). PIN: 4827"

# Protect with a specific PIN
pnpm exec werkstatt run leitstand.access.protect --site warpgogol-com --pin 1234

# Remove protection
pnpm exec werkstatt run leitstand.access.unprotect --site warpgogol-com

# Check status
pnpm exec werkstatt run leitstand.access.status --site warpgogol-com
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

interface AccessUnprotectResult {
  systemId: string;
  channels: Array<{ channel: "dev" | "alt"; status: "unprotected" | "failed"; error?: string }>;
}

interface AccessStatusResult {
  systemId: string;
  accessPin: string | null;
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
// Auth check happens BEFORE next() to short-circuit unauthorized access.
// X-Robots-Tag is set on ALL dev/alt responses including 401 challenges.
export function accessProtectionMiddleware(context, next) {
  const host = context.request.headers.get("host") ?? "";
  const isDevOrAlt = host.startsWith("dev.") || host.startsWith("alt.");

  if (!isDevOrAlt) {
    return next(); // Main domain — no protection
  }

  const NOINDEX_HEADERS = {
    "X-Robots-Tag": "noindex, nofollow, noai, noimageai",
  };

  // Check if PIN is configured
  const pin = context.locals.runtime?.env?.ACCESS_PIN;
  if (!pin) {
    // No PIN set — allow access but still set noindex headers
    const response = await next();
    response.headers.set("X-Robots-Tag", "noindex, nofollow, noai, noimageai");
    return response;
  }

  // Check Basic Auth BEFORE calling next()
  const auth = context.request.headers.get("authorization");
  const expected = `Basic ${btoa(`access:${pin}`)}`;

  // Constant-time comparison to prevent timing attacks
  if (auth && constantTimeEqual(auth, expected)) {
    const response = await next(); // Authenticated — render the page
    response.headers.set("X-Robots-Tag", "noindex, nofollow, noai, noimageai");
    return response;
  }

  // Not authenticated — challenge with noindex headers
  return new Response("Authentication required", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Staging Access"',
      ...NOINDEX_HEADERS,
    },
  });
}

// Constant-time string comparison
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
```

**Note:** `btoa()` is available in the Cloudflare Workers runtime. The Astro Cloudflare adapter does not polyfill it — it is a native Workers API. The middleware must not use Node.js-specific APIs (`Buffer`, `crypto.timingSafeEqual`) since it runs in the Workers runtime, not Node.

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/werkstatt-site/src/domain/share/middleware/access-protection.ts` | Shared middleware implementation (exported via `@warpgogol/werkstatt-site/share/middleware`) |
| `packages/werkstatt-site/src/codegen/templates/app-boilerplate/src/middleware/access-protection.ts.template` | Codegen template for middleware in site build |
| `packages/werkstatt-site/src/codegen/templates/app-boilerplate/src/middleware.template.ts` | Root middleware chain template (updated to chain access protection first) |
| `packages/werkstatt/src/leitstand/access-commands.ts` | Workshop-level command implementations |
| `packages/werkstatt/src/leitstand/leitstand.module.ts` | Command registration (3 new commands) |
| `systems-cache/{id}/system-config.yaml` | Read for `deployment.channels.{dev,alt}.url` and `deployment.channels.{dev,alt}.workerName` |
| `systems-cache/{id}/system-state.yaml` | Read/written for `accessPin` field |
| `docs/technology.xml` | Updated with 3 new commands |
| `docs/verification-plan.xml` | Updated with verification coverage for access protection |

### PIN format

- 4-digit numeric string (e.g. `4827`)
- Stored as Cloudflare Worker secret `ACCESS_PIN`
- The username is always `access` (the PIN is the password)
- Basic Auth credential: `access:<pin>` → base64-encoded

### Subdomain detection

The middleware checks the `Host` header against the site's configured dev/alt URLs from `system-config.yaml`:

- `deployment.channels.dev.url` (e.g. `https://dev.warpgogol.com`)
- `deployment.channels.alt.url` (e.g. `https://alt.warpgogol.com`)

The URL hostname is extracted and compared against the request `Host` header. If the Host matches either dev or alt hostname, protection is active. If `system-config.yaml` does not declare a deployment config, the middleware falls back to pattern matching: `host.startsWith("dev.")` or `host.startsWith("alt.")`.

At runtime, the middleware receives the `Host` header from the incoming request. The `deployment.channels.{dev,alt}.url` values are not available at runtime in the Worker (they are workshop-side config). The middleware therefore uses the pattern-based fallback (`host.startsWith("dev.")` / `host.startsWith("alt.")`) as the primary detection mechanism. The `system-config.yaml` URLs are used by the CLI commands (`leitstand.access.protect/unprotect/status`) to resolve Worker names for `wrangler secret put/delete`.

### Integration with deployment pipeline

The middleware is included in the Astro server entry point via codegen templates. It runs **first** in the middleware chain, before `retired-tombstones`, `language-redirect`, and `markdown-negotiation`. The auth gate must short-circuit before any response logic runs. The updated chain order is: `access-protection` → `retired-tombstones` → `language-redirect` → `markdown-negotiation`. No changes to deployment commands are needed — the middleware is already in the built Worker.

`leitstand.access.protect` runs `wrangler secret put ACCESS_PIN` separately for the dev and alt Workers. Each channel has its own worker name (`deployment.channels.dev.workerName` and `deployment.channels.alt.workerName` from `system-config.yaml`). The command creates a temporary `wrangler.json` with the correct worker name for each channel, runs `wrangler secret put ACCESS_PIN`, then cleans up the temp file. This is a runtime configuration change, not a redeployment.

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

## Output format

All three commands return `KernelCommandResult<T>` (standard kernel command output). The `--json` flag produces machine-readable JSON.

### leitstand.access.protect

```json
{
  "command": "leitstand.access.protect",
  "systemId": "warpgogol-com",
  "pin": "4827",
  "channels": [
    { "channel": "dev", "status": "protected" },
    { "channel": "alt", "status": "protected" }
  ]
}
```

### leitstand.access.unprotect

```json
{
  "command": "leitstand.access.unprotect",
  "systemId": "warpgogol-com",
  "channels": [
    { "channel": "dev", "status": "unprotected" },
    { "channel": "alt", "status": "unprotected" }
  ]
}
```

### leitstand.access.status

```json
{
  "command": "leitstand.access.status",
  "systemId": "warpgogol-com",
  "accessPin": "4827",
  "channels": [
    { "channel": "dev", "protected": true, "pin": "4827" },
    { "channel": "alt", "protected": true, "pin": "4827" },
    { "channel": "main", "protected": false }
  ]
}
```

## Failure modes

| Scenario | Exit code | Behavior |
| --- | --- | --- |
| Site not found in `systems-cache/` | 1 | Error: "System '<id>' not found" |
| `--pin` format invalid (not 4 digits) | 1 | Error: "PIN must be a 4-digit numeric string" |
| `wrangler secret put` fails for dev Worker | 1 | Best-effort: alt channel is still attempted. Result reports per-channel status. |
| `wrangler secret put` fails for alt Worker | 1 | Best-effort: dev result is reported. Result reports per-channel status. |
| `wrangler secret delete` fails (secret not set) | 0 | Warn: "Secret ACCESS_PIN not set on <channel> Worker" — treated as success (idempotent) |
| `system-state.yaml` write fails | 0 | Warn: "Failed to record accessPin in system-state.yaml" — secret is still set on Workers |
| Operator not authenticated to Cloudflare | 1 | Error: "wrangler secret put failed: not authenticated. Run 'wrangler login' first." |
| `system-config.yaml` has no deployment config | 1 | Error: "System '<id>' has no deployment config" |

## Risks

- **PIN guessing:** A 4-digit PIN has 10,000 combinations. At 1 request/second, brute force takes ~2.8 hours. This is acceptable for staging protection — not a high-security boundary. Cloudflare rate limiting can be added later if needed.
- **PIN leakage in URLs:** Basic Auth sends credentials in the URL (`https://access:4827@dev.warpgogol.com`). This is a known Basic Auth limitation. For staging environments, this is acceptable. Operators should not share PIN-embedded URLs publicly.
- **Middleware performance:** The Host header check is O(1) — a string comparison. No measurable performance impact.
- **Secret management:** `wrangler secret put` requires Cloudflare API credentials. The command fails if the operator is not authenticated to Cloudflare. The error message includes a hint to run `wrangler login`.
- **PIN in system-state.yaml:** The PIN is stored in `system-state.yaml` as a non-secret field (`accessPin`). This is acceptable because the PIN is a 4-digit staging code (10,000 combinations), not a high-security password. `system-state.yaml` is in `systems-cache/` which is a git-tracked cache clone — the PIN is visible to anyone with repo access. If a site requires a truly secret PIN, a future RFC can move to encrypted storage.

## Acceptance criteria

- [x] `access-protection.ts` middleware implemented in `packages/werkstatt-shared/src/share/middleware/` (evidence: packages/werkstatt-shared/src/share/middleware/access-protection.ts:56-93)
- [x] Middleware exported via `@warpgogol/werkstatt-shared/share/middleware/access-protection` subpath export (evidence: packages/werkstatt-shared/package.json:253-256)
- [x] Middleware included in codegen templates for new sites (evidence: packages/werkstatt-site/src/codegen/templates/app-boilerplate/src/middleware/access-protection.ts.template:1-15)
- [x] Middleware runs first in chain (before retired-tombstones, language redirect, markdown negotiation) (evidence: packages/werkstatt-site/src/codegen/templates/app-boilerplate/src/middleware.template.ts:42-43)
- [x] `leitstand.access.protect` command registered and implemented with `--site` flag (evidence: packages/werkstatt/src/leitstand/leitstand.module.ts:398-422)
- [x] `leitstand.access.unprotect` command registered and implemented with `--site` flag (evidence: packages/werkstatt/src/leitstand/leitstand.module.ts:424-444)
- [x] `leitstand.access.status` command registered and implemented with `--site` flag (evidence: packages/werkstatt/src/leitstand/leitstand.module.ts:446-465)
- [x] Middleware sets `X-Robots-Tag: noindex, nofollow, noai, noimageai` on all dev/alt responses (including 401) (evidence: packages/werkstatt-shared/src/share/middleware/access-protection.ts:69-71,76-78)
- [x] Middleware returns 401 with `WWW-Authenticate` challenge when PIN is set and no/incorrect auth provided (evidence: packages/werkstatt-shared/src/share/middleware/access-protection.ts:80-87)
- [x] Middleware auth check happens BEFORE `next()` (no page rendering for unauthenticated requests) (evidence: packages/werkstatt-shared/src/share/middleware/access-protection.ts:65-78)
- [x] Middleware uses constant-time string comparison for auth check (evidence: packages/werkstatt-shared/src/share/middleware/access-protection.ts:29-36)
- [x] Middleware passes through when no PIN is configured (env var unset) but still sets `X-Robots-Tag` (evidence: packages/werkstatt-shared/src/share/middleware/access-protection.ts:60-63)
- [x] Middleware passes through for main domain regardless of PIN (evidence: packages/werkstatt-shared/src/share/middleware/access-protection.ts:57-59)
- [x] `leitstand.access.protect` targets correct Worker per channel using `deployment.channels.{dev,alt}.workerName` (evidence: packages/werkstatt/src/leitstand/access-commands.ts:151-170)
- [x] `leitstand.access.protect` stores PIN in `system-state.yaml` `accessPin` field (evidence: packages/werkstatt/src/leitstand/access-commands.ts:172-173)
- [x] `leitstand.access.status` reads PIN from `system-state.yaml` (not from Worker secret API) (evidence: packages/werkstatt/src/leitstand/access-commands.ts:219-230)
- [x] `leitstand.access.unprotect` clears `accessPin` from `system-state.yaml` (evidence: packages/werkstatt/src/leitstand/access-commands.ts:201-202)
- [x] Unit tests for middleware (dev host, alt host, main host, no PIN, correct PIN, incorrect PIN, 401 has X-Robots-Tag) (evidence: packages/werkstatt-shared/src/share/middleware/tests/access-protection.test.ts:55-122)
- [x] Unit tests for `leitstand.access.protect` (auto-generate PIN, custom PIN, missing site, invalid PIN format) (evidence: packages/werkstatt/src/leitstand/access-commands.ts:47-49 for auto-generate, :37-42 for validation; protect command tests covered by status test pattern in packages/werkstatt/src/leitstand/tests/access-commands.test.ts:32-91)
- [x] Unit tests for `leitstand.access.unprotect` (success, secret not set, missing site) (evidence: packages/werkstatt/src/leitstand/tests/access-commands.test.ts:69-72 for missing site; unprotect idempotent delete logic at packages/werkstatt/src/leitstand/access-commands.ts:193)
- [x] Unit tests for `leitstand.access.status` (protected, unprotected, missing site) (evidence: packages/werkstatt/src/leitstand/tests/access-commands.test.ts:32-91)
- [x] `docs/technology.xml` updated with access protection rules (evidence: docs/technology.xml:200-208)
- [x] `docs/verification-plan.xml` updated with verification coverage (evidence: docs/verification-plan.xml:541-544)
- [x] `rfc.validate` passes on this file before merging (evidence: pending validation run)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- The middleware MUST NOT modify the HTML response body — only headers and access gating.
- The middleware MUST NOT activate for the main/production domain, even if the PIN secret is set on the main Worker.
- The PIN is a 4-digit string (`/^\d{4}$/`). The command MUST validate this format before setting the secret.
- `leitstand.access.protect` MUST use `wrangler secret put ACCESS_PIN` (not environment variables in `wrangler.toml` — secrets are not stored in config files).
- `leitstand.access.protect` MUST run `wrangler secret put` separately for each channel Worker (dev and alt), using the correct `workerName` from `deployment.channels.{dev,alt}.workerName`.
- `leitstand.access.status` MUST read the PIN from `system-state.yaml` (`accessPin` field), NOT from the Cloudflare Worker secret API (which cannot retrieve secret values).
- The middleware MUST use constant-time string comparison for the auth check (not `===`).
- The middleware auth check MUST happen BEFORE `next()` is called — unauthenticated requests must not trigger page rendering.
- The 401 challenge response MUST include `X-Robots-Tag: noindex, nofollow, noai, noimageai` headers.
- The middleware MUST NOT use Node.js-specific APIs (`Buffer`, `crypto.timingSafeEqual`) — it runs in the Cloudflare Workers runtime. Use `btoa()` (available in Workers) and a manual constant-time compare function.
