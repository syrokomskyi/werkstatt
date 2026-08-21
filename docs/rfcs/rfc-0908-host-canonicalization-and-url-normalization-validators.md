---
id: RFC-0908
title: "Host canonicalization and URL normalization validators"
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
  - DNA-73
  - RFC-0317
  - RFC-0898
  - RFC-0905
  - RFC-0906
  - RFC-0904
satisfies:
  - DNA-86
versionBump: minor
commands:
  proposed:
    - host.canonical.config.validate
    - trailing.slash.config.validate
  added: []
  changed: []
  removed: []
appsImpacted: []
packagesImpacted:
  - "@warpgogol/werkstatt-site"
liveSpec: true
successSignals:
  - "host.canonical.config.validate detects missing www→apex redirect configuration before deployment"
  - "host.canonical.config.validate detects missing apex→www redirect configuration when www is the canonical host"
  - "trailing.slash.config.validate detects missing trailing-slash normalization redirects in _redirects or Worker config"
  - "trailing.slash.config.validate detects inconsistent trailing-slash policy between Astro build.format and canonicalPageUrl trailingSlash option"
  - "Both validators run in SITES_CHECK_POSTBUILD_PIPELINE without false positives on warpgogol-com"
nonGoals:
  - "Do not generate redirects — that is owned by public.infrastructure.generate (RFC-0318)"
  - "Do not generate or modify wrangler.toml / wrangler.jsonc — validation only"
  - "Do not validate canonical URL trailing-slash parity between HTML and sitemap — that is owned by canonical.html-parity.validate (RFC-0906)"
  - "Do not validate redirect shadowing — that is owned by redirect.shadow.validate (RFC-0905)"
  - "Do not validate CSP or header path coverage — that is owned by csp.elements.validate / headers.coverage.validate (RFC-0904)"
---

# RFC-0908: Host canonicalization and URL normalization validators

## Context

The workshop deploys Astro sites via Cloudflare Pages with a Worker-first architecture. Two URL normalization issues were identified in Google Search Console data for `warpgogol.com` (August 2026):

1. **Missing www→apex redirect.** The site is served at `warpgogol.com` (apex) but `www.warpgogol.com` had no redirect to the apex domain. Google indexed both variants, splitting link equity and causing duplicate-content signals. The `_redirects` file did not contain a www→apex redirect rule, and the Cloudflare Worker did not handle host canonicalization.

2. **No trailing-slash normalization.** The site uses `trailingSlash: "always"` in `canonicalPageUrl` (RFC-0317) — all canonical URLs end with `/`. However, requests for non-trailing-slash URLs (e.g., `/leistungen`) were served with HTTP 200 instead of redirecting to the trailing-slash variant (`/leistungen/`). This created duplicate URLs in Google's index. The `_redirects` file did not contain trailing-slash normalization rules, and the Astro `build.format` was not verified to be consistent with the `trailingSlash` policy.

Neither issue is detected by existing validators:

- `redirect.map.validate` (RFC-0318) checks redirect source/target correctness but does not check for the presence of host canonicalization or trailing-slash normalization rules.
- `canonical.url.validate` (RFC-0317) checks URL parity across sitemap/feed/llms but does not check redirect configuration.
- `seo.domain.validate` (RFC-0898) checks canonical origin correctness in rendered HTML but does not check redirect configuration.

## Problem

Two URL normalization configurations are undetectable before deployment today:

**1. Missing host canonicalization redirect.** The site must redirect non-canonical host variants (www→apex or apex→www) to the canonical host. Without this, Google indexes both variants. The redirect must be configured in the Worker fetch handler or via wrangler route configuration — Cloudflare Pages `_redirects` format supports only path-based patterns, not host-based patterns. No validator checks for its presence.

**2. Missing trailing-slash normalization.** The site must redirect non-canonical trailing-slash variants to the canonical form. With `trailingSlash: "always"`, requests for `/leistungen` must redirect to `/leistungen/`. Without this, Google indexes both variants. The redirect can be configured in `_redirects` or in the Worker. No validator checks for its presence or for consistency between `build.format` and `trailingSlash` policy.

Both problems are deterministic: the `_redirects` file, `wrangler.toml`/`wrangler.jsonc`, `astro.config.mjs`, and `canonicalPageUrl` configuration are all available at build time.

## Decision

The kernel gains two new post-build validators:

1. **`host.canonical.config.validate`** — checks that host canonicalization is configured for the deployment. Reads the canonical host from `astro.config.mjs` (`site` field) and checks that a redirect exists for the non-canonical host variant (www→apex or apex→www) in `wrangler.toml`/`wrangler.jsonc` route configuration or in the Worker fetch handler source code. Cloudflare Pages `_redirects` format supports only path-based patterns, not host-based patterns, so `_redirects` is not checked for host canonicalization.

2. **`trailing.slash.config.validate`** — checks that trailing-slash normalization is configured consistently. Reads the `trailingSlash` policy from `canonicalPageUrl` usage (always `always` in the current codebase) and verifies that:
   - Astro `build.format` is set to `directory` (which produces `/path/index.html` served at `/path/` with trailing slash).
   - Trailing-slash normalization redirects exist in `_redirects` or the Worker handles them (inferred from Worker route patterns or `_redirects` rules that match non-trailing-slash paths).

Both validators are integrated into `SITES_CHECK_POSTBUILD_PIPELINE` after `redirect.map.validate` and `redirect.shadow.validate`.

## Architectural fit

**Architecture DNA:**

- **DNA-86** (new, established by this RFC) — Host canonicalization and URL normalization gate: every site MUST redirect non-canonical host variants (www↔apex) and non-canonical trailing-slash variants to the canonical form. The canonical host is declared in `astro.config.mjs` `site` field. The canonical trailing-slash policy is declared in `canonicalPageUrl` `trailingSlash` option. Both MUST be enforced via redirects or Worker configuration before deployment.

**Existing RFCs:**

- **RFC-0317** (`canonicalPageUrl`, `trailingSlash: "always"`) — this RFC validates that the trailing-slash policy declared in `canonicalPageUrl` is enforced via redirects.
- **RFC-0898** (`seo.domain.validate`) — checks canonical origin in rendered HTML. This RFC checks redirect configuration for host canonicalization. Both are needed: HTML correctness and redirect correctness.
- **RFC-0905** (`redirect.shadow.validate`) — checks that redirects are not shadowed by static files or Worker routes. This RFC checks that the redirects exist in the first place.
- **RFC-0906** (`canonical.html-parity.validate`) — checks that HTML canonical URLs match `canonicalPageUrl` output. This RFC checks that non-canonical URL variants are redirected to the canonical form.

**Site OS operator model:**

- Both commands are post-build validators registered in `packages/werkstatt-site/src/checks/`.
- Both follow the existing pattern: read `public/_redirects`, `astro.config.mjs`, `wrangler.toml`/`wrangler.jsonc`, emit `Diagnostic[]` via `diagnosticsResult`.
- Both are integrated into `SITES_CHECK_POSTBUILD_PIPELINE`.

## Design

### CLI surface

```sh
# Host canonicalization — post-build, checks _redirects and wrangler config
pnpm exec werkstatt run host.canonical.config.validate --app warpgogol-com
pnpm exec werkstatt run host.canonical.config.validate --app warpgogol-com --json

# Trailing-slash normalization — post-build, checks _redirects and astro.config.mjs
pnpm exec werkstatt run trailing.slash.config.validate --app warpgogol-com
pnpm exec werkstatt run trailing.slash.config.validate --app warpgogol-com --json
```

Both commands accept `--app <id>` (optional, single-site scope) and `--json` (machine-readable output). Both set `supportsAllSites: true`. No additional flags.

### TypeScript contracts

**`host.canonical.config.validate`** — new file: `packages/werkstatt-site/src/checks/host-canonical.ts`

```ts
interface HostCanonicalResult {
  canonicalHost: string;
  redirectConfigured: boolean;
}

// Rules:
// HOST-CANON-01 (missing www→apex redirect) — severity: error
//   The canonical host is the apex domain (no www), but no redirect from
//   www.<host> to <host> is found in wrangler config or Worker source code.
// HOST-CANON-02 (missing apex→www redirect) — severity: error
//   The canonical host is www.<host>, but no redirect from <host> to
//   www.<host> is found in wrangler config or Worker source code.
// HOST-CANON-03 (ambiguous canonical host) — severity: warning
//   The astro.config.mjs site URL does not clearly indicate apex or www,
//   or the site URL is missing.

// Logic:
// 1. Read astro.config.mjs, extract `site` URL → canonicalHost
// 2. Determine canonical variant: apex (no www) or www
// 3. Check wrangler.toml/wrangler.jsonc for route patterns that match
//    the non-canonical host (e.g. www.warpgogol.com/* → warpgogol.com/*)
// 4. If no wrangler route found, check Worker source code (middleware.template.ts
//    or equivalent) for host redirect logic:
//    - Look for request.headers.get("host") or URL host comparison
//    - Look for Response.redirect() with host canonicalization
// 5. If no redirect found → HOST-CANON-01 or HOST-CANON-02 error
// 6. Return diagnostics
//
// Note: Cloudflare Pages _redirects format supports only path-based patterns,
// not host-based patterns. Host canonicalization cannot be configured via
// _redirects. It must be done in the Worker fetch handler or via wrangler
// route configuration.
```

**`trailing.slash.config.validate`** — new file: `packages/werkstatt-site/src/checks/trailing-slash.ts`

```ts
interface TrailingSlashResult {
  policy: "always" | "never" | "ignore";
  normalizationConfigured: boolean;
}

// Rules:
// SLASH-01 (missing trailing-slash normalization redirects) — severity: error
//   The canonical trailing-slash policy is "always" (URLs must end with /),
//   but no redirect rules exist for non-trailing-slash → trailing-slash
//   variants in _redirects or Worker config.
// SLASH-02 (inconsistent Astro build.format) — severity: error
//   The canonical trailing-slash policy is "always" but Astro build.format
//   is not set to "directory" (which produces /path/index.html served at
//   /path/). If build.format is "file", pages are served at /path.html
//   and trailing-slash redirects would be incorrect.
// SLASH-03 (missing trailing-slash policy declaration) — severity: warning
//   The canonicalPageUrl trailingSlash option is not explicitly set,
//   defaulting to "always" without explicit declaration.

// Logic:
// 1. The trailingSlash policy is determined from CanonicalUrlOptions in
//    packages/werkstatt-site/src/domain/share/astro/canonical-url.ts.
//    The type is `trailingSlash: "always"` (literal, not a union) — "always"
//    is the only supported value. The validator assumes "always" and does
//    not scan call sites. If a future RFC adds other trailingSlash values,
//    this validator will need updating.
// 2. Read astro.config.mjs build.format (expected: "directory" for
//    trailingSlash: "always"). If build.format is not set, assume
//    "directory" (Astro default).
// 3. If build.format ≠ "directory" → SLASH-02 error
// 4. Check _redirects for trailing-slash normalization rules:
//    - Pattern: /:path* → /:path/ 308 (or similar)
//    - Or per-route non-trailing-slash → trailing-slash redirects
// 5. If no normalization rules found → SLASH-01 error
// 6. Return diagnostics
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/werkstatt-site/src/checks/host-canonical.ts` | New file: `host.canonical.config.validate` command implementation |
| `packages/werkstatt-site/src/checks/trailing-slash.ts` | New file: `trailing.slash.config.validate` command implementation |
| `packages/werkstatt-site/src/checks/command-tables/31-public-surface.ts` | Modified: register both new commands |
| `packages/werkstatt-site/src/checks/pipelines/sites-check-postbuild.ts` | Modified: add both commands to `SITES_CHECK_POSTBUILD_PIPELINE` |
| `packages/werkstatt-site/src/tests/host-canonical.test.ts` | New file: unit tests for `host.canonical.config.validate` |
| `packages/werkstatt-site/src/tests/trailing-slash.test.ts` | New file: unit tests for `trailing.slash.config.validate` |
| `public/_redirects` | Read-only: trailing-slash redirect rules parsed from here (path-based only) |
| `astro.config.mjs` | Read-only: `site` URL and `build.format` parsed from here |
| `wrangler.toml` / `wrangler.jsonc` | Read-only: Worker route patterns parsed from here |
| Worker source (middleware.template.ts) | Read-only: host redirect logic detected in Worker fetch handler |
| `docs/architecture-dna.md` | Modified: add DNA-86 entry |
| `packages/werkstatt-site/AGENTS.md` | Modified: document both new commands |
| `docs/verification-plan.xml` | Modified: add HOST-CANON-01..03 and SLASH-01..03 rule IDs |

### Output format

Both commands use `diagnosticsResult` from `@warpgogol/werkstatt-shared/checks/result-helpers`.

**`host.canonical.config.validate --json`:**

```json
{
  "data": {
    "command": "host.canonical.config.validate",
    "status": "fail",
    "diagnostics": [
      {
        "ruleId": "HOST-CANON-01",
        "severity": "error",
        "file": "public/_redirects",
        "message": "Canonical host is warpgogol.com (apex) but no www→apex redirect found in _redirects or wrangler config",
        "fixHint": "Add 'www.warpgogol.com/*  https://warpgogol.com/:splat 301' to _redirects or configure host redirect in the Worker"
      }
    ],
    "summary": { "error": 1, "warning": 0, "info": 0 }
  },
  "exitCode": 1,
  "summary": "host.canonical.config.validate: 1 error(s), 0 warning(s)"
}
```

**`trailing.slash.config.validate --json`:**

```json
{
  "data": {
    "command": "trailing.slash.config.validate",
    "status": "fail",
    "diagnostics": [
      {
        "ruleId": "SLASH-01",
        "severity": "error",
        "file": "public/_redirects",
        "message": "Trailing-slash policy is 'always' but no non-trailing-slash → trailing-slash normalization redirects found in _redirects",
        "fixHint": "Add trailing-slash normalization rules to _redirects or configure normalization in the Worker fetch handler"
      },
      {
        "ruleId": "SLASH-02",
        "severity": "error",
        "file": "astro.config.mjs",
        "message": "build.format is 'file' but trailingSlash policy is 'always' — pages will be served at /path.html, not /path/",
        "fixHint": "Set build.format to 'directory' in astro.config.mjs to match trailingSlash: always"
      }
    ],
    "summary": { "error": 2, "warning": 0, "info": 0 }
  },
  "exitCode": 1,
  "summary": "trailing.slash.config.validate: 2 error(s), 0 warning(s)"
}
```

### Failure modes

**`host.canonical.config.validate`:**

- If `astro.config.mjs` is missing or `site` is not set → HOST-CANON-03 warning, skip remaining checks.
- If `site` URL is ambiguous (e.g., localhost) → HOST-CANON-03 warning, skip remaining checks.
- If `wrangler.toml`/`wrangler.jsonc` is missing → check Worker source code. If Worker source also has no host redirect logic → HOST-CANON-01 or HOST-CANON-02 error.
- If violations found → `exitCode: 1`, diagnostics emitted. HOST-CANON-01 and HOST-CANON-02 are errors; HOST-CANON-03 is a warning.
- If no violations → `exitCode: 0`, summary with `canonicalHost` and `redirectConfigured`.

**`trailing.slash.config.validate`:**

- If `astro.config.mjs` is missing → skip with info message.
- If `build.format` is not set → assume `"directory"` (Astro default) and continue.
- If `_redirects` is missing → SLASH-01 error (no normalization possible).
- If violations found → `exitCode: 1`, diagnostics emitted. SLASH-01 and SLASH-02 are errors; SLASH-03 is a warning.
- If no violations → `exitCode: 0`, summary with `policy` and `normalizationConfigured`.

## Rollout

**Default behavior: fail-hard from day one.** HOST-CANON-01, HOST-CANON-02, SLASH-01, and SLASH-02 are errors. HOST-CANON-03 and SLASH-03 are warnings. No grace period — missing host canonicalization and trailing-slash normalization cause Google indexing issues.

**Existing apps:** Sites without host canonicalization or trailing-slash normalization will fail the validators. The fix is to add redirect rules to `_redirects` or configure normalization in the Worker fetch handler.

**New apps:** Automatically compliant — the validators run in `SITES_CHECK_POSTBUILD_PIPELINE`.

**Pipeline integration:** Both commands are added to `SITES_CHECK_POSTBUILD_PIPELINE` after `redirect.shadow.validate`:

```
redirect.map.validate
redirect.shadow.validate          (RFC-0905)
host.canonical.config.validate    ← NEW
trailing.slash.config.validate    ← NEW
robots.page.validate
```

## Alternatives considered

**1. One combined command `url.normalization.validate`.** Rejected: host canonicalization and trailing-slash normalization are different concerns — one checks host-level redirects, the other checks path-level redirects and build configuration. Combining them would create a command with two unrelated rule families. The workshop principle is to split when responsibilities differ.

**2. Extend `redirect.map.validate` instead of creating new commands.** Rejected: `redirect.map.validate` validates existing redirect rules for correctness (source not live, target exists, no chains). This RFC checks for the presence of specific redirect rules (host canonicalization, trailing-slash normalization) — a different concern. Extending `redirect.map.validate` would mix correctness validation with completeness validation.

**3. Runtime probe (post-deploy) instead of post-build validator.** Rejected: the goal is to catch issues before deployment. Runtime probes complement post-build validators but cannot replace them for pre-deploy detection.

**4. Fix only the Worker / \_redirects, no validators.** Rejected: the runtime fix resolves the current issue, but without validators, the same regression can reappear (e.g., if someone removes the www redirect from `_redirects` during a future migration).

## Risks

**Performance:** Both validators read small configuration files (`_redirects`, `astro.config.mjs`, `wrangler.toml`). Performance impact is negligible.

**False positive rate:** HOST-CANON-01 and HOST-CANON-02 could produce false positives if the Worker handles host redirects in its fetch handler without detectable patterns in `wrangler.toml` or Worker source code. The validator checks `wrangler.toml` route patterns and scans Worker source for host redirect logic (e.g., `request.headers.get("host")` comparisons, `Response.redirect()` with host canonicalization). If the Worker handles redirects programmatically in a way the validator cannot detect, it emits an error. A follow-up RFC can add a config escape hatch (e.g., a `host-redirect.config.yaml` file that declares "Worker handles host redirects") if this proves to be a frequent false positive.

SLASH-01 could produce false positives if the Worker handles trailing-slash normalization programmatically. Same escape hatch applies.

SLASH-02 has no false positives — if `build.format` is `"file"` and `trailingSlash` is `"always"`, the build output is inconsistent with the canonical URL policy.

**Maintenance burden:** Two new files (~200 lines each) plus pipeline registration and tests. The host detection and trailing-slash logic are simple string/URL operations.

## Acceptance criteria

- [ ] `host.canonical.config.validate` command registered in `packages/werkstatt-site/src/checks/command-tables/31-public-surface.ts` with correct name, scope `app`, and `supportsAllSites: true`
- [ ] `trailing.slash.config.validate` command registered in `packages/werkstatt-site/src/checks/command-tables/31-public-surface.ts` with correct name, scope `app`, and `supportsAllSites: true`
- [ ] `host.canonical.config.validate` emits HOST-CANON-01 when canonical host is apex and no www→apex redirect exists
- [ ] `host.canonical.config.validate` emits HOST-CANON-02 when canonical host is www and no apex→www redirect exists
- [ ] `host.canonical.config.validate` emits HOST-CANON-03 (warning) when site URL is missing or ambiguous
- [ ] `trailing.slash.config.validate` emits SLASH-01 when trailing-slash policy is "always" and no normalization redirects exist
- [ ] `trailing.slash.config.validate` emits SLASH-02 when build.format is inconsistent with trailingSlash policy
- [ ] `trailing.slash.config.validate` emits SLASH-03 (warning) when trailing-slash policy is not explicitly declared
- [ ] Both commands added to `SITES_CHECK_POSTBUILD_PIPELINE` after `redirect.shadow.validate` and before `robots.page.validate`
- [ ] `--json` output format matches the documented shape for both commands
- [ ] DNA-86 added to `docs/architecture-dna.md`
- [ ] `packages/werkstatt-site/AGENTS.md` documents both new commands
- [ ] Unit tests pass: `pnpm --filter @warpgogol/werkstatt-site test`
- [ ] `rfc.validate` passes on this file

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST add DNA-86 to `docs/architecture-dna.md` as part of the implementation.
- Agents MUST reuse `parseRedirectRules` from `@warpgogol/werkstatt-shared/share/redirects` for parsing `_redirects`.
- Agents MUST reuse `readAstroSiteUrl` from `../../lib/astro-site-url.ts` for reading the Astro site URL.
- Agents MUST use `diagnosticsResult` from `../result-helpers.ts` for output, consistent with existing validators.
- Agents MUST resolve the deployment adapter via `resolveDeploymentAdapter` to determine whether to check Worker routes.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
