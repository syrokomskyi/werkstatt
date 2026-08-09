---
id: RFC-0315
title: "Standardize HTTP security headers and public runtime probes"
status: implemented
kind: architecture
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-07-05
updatedAt: 2026-07-13
implementedAt: 2026-07-13
closedAt:
supersedes: []
supersededBy:
amends: []
related:
  - RFC-0177
  - RFC-0290
  - RFC-0307
commands:
  proposed:
    - headers.security.generate
    - headers.security.validate
    - headers.runtime.probe
  added:
    - headers.security.generate
    - headers.security.validate
    - headers.runtime.probe
  changed:
    - public.infrastructure.generate
    - cloudflare.assets.validate
    - build.prepare
    - build.check
appsImpacted:
  - apps/*
packagesImpacted:
  - "@gogol/share"
  - "@gogol/site-kernel-codegen"
  - "@gogol/site-kernel-checks"
  - "@gogol/site-kernel-deploy"
successSignals:
  - "Every site has generated baseline security headers for HTML, Markdown twins, well-known files, static assets, and agent knowledge files."
  - "The deploy/runtime probe checks HSTS, CSP, X-Content-Type-Options, Referrer-Policy, Permissions-Policy, Markdown content type, and freshness headers."
  - "Header changes are generated through public infrastructure ownership, not patched by hand in app public files."
nonGoals:
  - "Do not design a perfect CSP for every future third-party integration in v1."
  - "Do not block local development on live deployed header probes."
  - "Do not hardcode Cloudflare-only behavior into shared validators where another adapter may serve the same contract."
acceptance:
  - probe: command-registered
    name: "headers.security.validate"
  - probe: command-registered
    name: "headers.runtime.probe"
---

# RFC-0315: Standardize HTTP security headers and public runtime probes

## Context

The audit's "outside public" checklist named security headers, Markdown content type, and cache policy for `.well-known/*` and `/api/agent/v1/*`. These cannot be proven from a static `public/` folder alone; they need generated infrastructure files plus runtime probing.

This is a large topic, so this RFC defines a conservative baseline and a validation/probe model.

## Problem

Security headers are not visible in `public/`, and static generation alone cannot prove deployed content types or cache behavior. Without a generated baseline and runtime probe, each host can drift quietly: Markdown twins may be served as octet-stream, CSP may weaken, and `.well-known` agent files may cache too long.

## Decision

Every app gets generated HTTP header policy through the existing public infrastructure generator. The generated policy must cover:

- HTML pages;
- Markdown twins;
- `.well-known/*`;
- `/api/agent/v1/*`;
- static assets;
- feeds/sitemaps/manifests.

Runtime probes verify that the deployed host actually serves the intended headers.

## Architectural fit

The policy is generated through public infrastructure ownership, not app-local `_headers` edits. It extends RFC-0307's runtime probing model and keeps hosting-specific details behind generator/adapter code so the contract can survive Cloudflare or non-Cloudflare deployment targets.

## Design

## Baseline Header Policy

### Global HTML Baseline

For canonical HTML pages:

```text
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=()
Content-Security-Policy: <generated baseline>
```

HSTS is production-only and only for HTTPS canonical domains. Localhost/preview handling must not break development.

### CSP Baseline

The first CSP baseline is conservative but compatible with Astro static output and approved integrations:

```text
default-src 'self';
base-uri 'self';
object-src 'none';
frame-ancestors 'none';
img-src 'self' data: https:;
font-src 'self';
style-src 'self' 'unsafe-inline';
script-src 'self';
connect-src 'self';
form-action 'self';
upgrade-insecure-requests
```

Rules:

- Add integration-specific domains only through package-owned registries or system policy.
- Do not add wildcard `*`.
- Do not add third-party analytics/chat domains directly in app headers; the owning integration RFC must update the registry.
- `style-src 'unsafe-inline'` is accepted in v1 because Astro/component style output may require it; removing it is a future hardening task.

### Markdown Twins

Markdown twin files must serve:

```text
Content-Type: text/markdown; charset=utf-8
X-Content-Type-Options: nosniff
Cache-Control: public, max-age=300
```

The active twin URL scheme is owned by RFC-0166/RFC-0306. Header matching must cover both the current scheme and any accepted successor.

### Agent Knowledge and Well-Known Files

For `/api/agent/v1/*` and `.well-known/*` JSON/text artifacts:

```text
X-Content-Type-Options: nosniff
Cache-Control: public, max-age=300
ETag: <platform generated or explicit>
```

If the hosting platform cannot emit ETags for static assets, short `max-age` is required and the probe reports ETag absence as a warning, not an error.

### Static Assets

Hashed assets may use long immutable caching:

```text
Cache-Control: public, max-age=31536000, immutable
```

Unhashed public artifacts must not use long immutable caching.

## Commands

### headers.security.generate

May be implemented by extending `public.infrastructure.generate`.

Scope: app.

Writes or updates generated hosting header files such as `public/_headers` for Cloudflare Pages. The generator must be adapter-aware so the shared contract is not permanently tied to one host.

### headers.security.validate

Scope: app, read-only.

Validates generated/static header policy:

- required baseline headers exist in the generated infrastructure output;
- CSP contains required directives;
- CSP does not contain wildcard source `*`;
- Markdown twin pattern has `text/markdown; charset=utf-8`;
- `.well-known/*` and `/api/agent/v1/*` have short freshness policy or ETag expectation;
- hashed assets have long immutable caching;
- generated files carry the RFC-0081 marker and are not hand-edited.

Severity:

- `error` for missing HSTS on production domains, missing `nosniff`, missing Markdown content type, wildcard CSP, or hand-edited generated header files.
- `warning` for missing ETag expectation when short cache exists.

### headers.runtime.probe

Scope: URL target, networked.

Inputs:

```sh
pnpm exec werkstatt run headers.runtime.probe --app <app> --base-url <https-url> --json
```

Checks representative deployed URLs:

- `/`;
- one normal page route;
- one Markdown twin;
- `/.well-known/agent.json`;
- `/.well-known/security.txt`;
- `/api/agent/v1/*` sample when present;
- one hashed asset when discoverable.

It emits canonical diagnostics:

- `HDR-01`: missing required security header.
- `HDR-02`: CSP directive missing or unsafe wildcard.
- `HDR-03`: Markdown content type mismatch.
- `HDR-04`: freshness/cache policy mismatch.
- `HDR-05`: HSTS missing on production HTTPS.
- `HDR-06`: runtime differs from generated policy.

## Pipeline Placement

- `headers.security.generate` runs in `build.prepare` through public infrastructure generation.
- `headers.security.validate` runs in `build.check` and `apps-check.author`.
- `headers.runtime.probe` runs after deploy or against explicit preview URLs.

## Rollout

1. Model the baseline header policy in package-owned code.
2. Extend `public.infrastructure.generate` or add `headers.security.generate`.
3. Add static validation against generated infrastructure files.
4. Add runtime probe sampling for HTML, Markdown, `.well-known`, agent JSON, and assets.
5. Adjust integration registries for any approved third-party CSP sources.

## Alternatives considered

- **Only check headers manually with curl.** Rejected; manual checks do not scale across apps.
- **Use a very strict CSP immediately.** Rejected for v1 because existing Astro/style output and integrations need a staged hardening path.
- **Make live probes part of offline package checks.** Rejected; network checks belong after deploy or against an explicit preview URL.

## Risks

- **CSP breaks integrations.** Mitigated by integration-owned registries and staged validation.
- **Adapter-specific header semantics differ.** Mitigated by separating shared policy from generator adapter output.
- **Runtime probe flakiness.** Mitigated by keeping probes out of offline package checks and emitting structured diagnostics.

## Acceptance criteria

- [x] Generated header policy contains the baseline headers. (evidence: implemented historically)
- [x] Markdown twins serve `text/markdown; charset=utf-8` in deployed probe mode. (evidence: implemented historically)
- [x] `.well-known/*` and `/api/agent/v1/*` have short freshness policy or ETag. (evidence: implemented historically)
- [x] CSP has no wildcard source. (evidence: implemented historically)
- [x] `headers.security.validate` passes for both reference apps. (evidence: implemented historically)
- [x] `headers.runtime.probe --base-url https://warpgogol.com` can produce a structured report. (evidence: implemented historically)
- [x] `rfc.validate` passes. (evidence: implemented historically)

## Implementation notes for agents

- Agents may implement this RFC because its status is `accepted`.
- Before adding third-party domains to CSP, find the owning integration policy or write an amending RFC.
- Do not manually edit generated `_headers`; change the generator/template.
- Keep runtime probes separate from offline package checks.
