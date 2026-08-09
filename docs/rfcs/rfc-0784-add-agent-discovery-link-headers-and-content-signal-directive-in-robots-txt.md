---
id: RFC-0784
title: "Add agent discovery Link headers and Content-Signal directive in robots.txt"
status: accepted
# kind options: architecture | contract | command | policy | deprecation
kind: architecture
# scope options: app | workspace
scope: workspace
owners:
  - architecture
# Set by the deciding human together with the status change (RFC-0335).
# Draft scaffolds must keep this empty; do not prefill a default identity.
# Format: human:<handle> (agent:<id> reserved — see RFC-0335)
# Default reviewer when none is specified by the operator: human:andrii-syrokomskyi
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-08-09
updatedAt: 2026-08-09
enhancedAt: 2026-08-09
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - DNA-34
  - RFC-0052
  - RFC-0315
  - RFC-0286
  - RFC-0783
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-34
# RFC-0396: Traceability to a vendored spec node: "<spec-id>/<node-id>", e.g. "pbp/RFC-PBP-020".
# Set by spec.materialize; leave commented for non-spec RFCs.
# specRef:
# RFC-0478: Platform versioning enforcement. Declares the SemVer delta this RFC
# produces when implemented. Required for post-cutoff implemented RFCs (V-29).
# Values: minor (Breaks-B, requires migrator), patch (safe), none (prose-only),
# major (architectural, manually reserved). Default: patch.
versionBump: patch
commands:
  proposed: []
  added: []
  changed:
    - public.infrastructure.generate
    - robots.generate
  removed: []
appsImpacted: []
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - packages/werkstatt-site
successSignals:
  - isitagentready.com reports Link headers present in HTTP response for warpgogol.com
  - isitagentready.com reports Content-Signal directive present in robots.txt for warpgogol.com
nonGoals:
  - API Catalog and MCP Server Card generators — covered by RFC-0783
  - Markdown content negotiation — covered by RFC-0785
  - DNS-AID records — covered by RFC-0786
# RFC-0268: OPTIONAL machine-checkable acceptance probes, executed on-demand
# via `pnpm exec werkstatt run rfc.acceptance.run --id <this-rfc-id>` (never
# automatically inside build pipelines). Closed probe vocabulary — see
# docs/rfcs/rfc-0268-make-rfc-acceptance-criteria-machine-checkable.md.
# acceptance:
#   - probe: run
#     command: "site-kernel run some.command.validate --app warpgogol-com"
#     expect:
#       exitCode: 0
#   - probe: file-exists
#     path: "packages/share/src/some-new-module.ts"
#   - probe: command-registered
#     name: "some.new.command"
#   - probe: file-contains
#     path: "AGENTS.md"
#     pattern: "Some new governance paragraph"
---

# RFC-0784: Add agent discovery Link headers and Content-Signal directive in robots.txt

## Context

The Werkstatt site generates `_headers` (HTTP response headers for Cloudflare Pages) via `public.infrastructure.generate` from a template (`public/_headers.template`, RFC-0315) and `robots.txt` via `robots.generate` (RFC-0052) using the `buildRobotsTxt()` pure function.

The [isitagentready.com](https://isitagentready.com/warpgogol.com) audit checks for two response-surface signals that we do not yet emit:

1. **Link headers** (RFC 8288) — HTTP `Link:` response headers on the root document that point to agent discovery endpoints (`/.well-known/agent.json`, `/.well-known/api-catalog`, `/.well-known/mcp/server-card.json`, `/llms.txt`).
2. **Content-Signal directive** in `robots.txt` — a `Content-Signal:` line that tells crawlers and agents which content types the site offers (HTML, markdown, JSON-LD, llms.txt).

## Problem

Agent discovery tooling checks for RFC 8288 `Link:` response headers and `Content-Signal:` directives in `robots.txt`. Both are absent from our generated output. Without them, agents that rely on HTTP header discovery (rather than fetching `/.well-known/` files) cannot find the agent surface, and crawlers that read `Content-Signal:` do not know the site offers markdown and structured content.

The `_headers` template (`packages/werkstatt-site/src/codegen/templates/app-boilerplate/public/_headers.template`) has no `Link:` header in the `/*` block. The `buildRobotsTxt()` function (`packages/werkstatt-site/src/domain/share/semantic/robots.ts`) has no `Content-Signal:` output.

## Decision

The `public.infrastructure.generate` command adds RFC 8288 `Link:` headers to the `/*` block of `_headers`, pointing to the agent discovery endpoints established by RFC-0286 and RFC-0783. The `robots.generate` command (via `buildRobotsTxt()`) adds a `Content-Signal:` directive listing the content types the site offers. Both changes are modifications to existing generators — no new commands.

## Architectural fit

- **DNA-34** (VC signing + `/.well-known/` discovery) — Link headers are the HTTP-level analogue of `.well-known/` discovery, providing an alternative discovery path for agents that inspect headers before fetching well-known files.
- **RFC-0052** (robots.txt generation) — extends `buildRobotsTxt()` with a new `Content-Signal:` directive, a backward-compatible addition to the robots.txt format.
- **RFC-0315** (HTTP security headers) — extends the `_headers` template with `Link:` headers in the existing `/*` block.
- **RFC-0286** (agent surface) — Link headers point to the agent surface endpoints (`agent.json`, `agent.openapi.json`).
- **RFC-0783** (API Catalog + MCP Server Card) — Link headers also point to `/.well-known/api-catalog` and `/.well-known/mcp/server-card.json` once those generators are implemented.
- **Site OS operator model** — both changes are in existing generators, no new commands, no new pipeline steps.
- **Compass sync** — no `docs/*.xml` files require synchronization. The changes are additive output in existing generators; no new contracts, no new commands, no new shared package APIs.

## Design

### CLI surface

No new commands. The changes are internal to two existing generators:

```sh
pnpm exec werkstatt run public.infrastructure.generate --site warpgogol-com
pnpm exec werkstatt run robots.generate --site warpgogol-com
```

Both commands run in `build.prepare` as they do today. The only difference is the output content.

### TypeScript contracts

```ts
// packages/werkstatt-site/src/domain/share/semantic/robots.ts — amended

export interface RobotsPolicy {
  // ... existing fields ...
  /** Content-Signal directive: declares content types the site offers. */
  contentSignal?: string[];
}

// buildRobotsTxt() output gains a Content-Signal line after the header comment:
// Content-Signal: text/html, text/markdown, application/ld+json, text/plain

// packages/werkstatt-site/src/codegen/templates/app-boilerplate/public/_headers.template — amended
// The /* block gains Link headers:
//   Link: < /.well-known/agent.json>; rel="service-meta"; type="application/json"
//   Link: < /.well-known/agent.openapi.json>; rel="service-desc"; type="application/json"
//   Link: < /.well-known/api-catalog>; rel="service-desc"; type="application/linkset+json"
//   Link: < /.well-known/mcp/server-card.json>; rel="service-desc"; type="application/json"
//   Link: < /llms.txt>; rel="service-doc"; type="text/plain"
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/werkstatt-site/src/codegen/templates/app-boilerplate/public/_headers.template` | Amended — add `{{AGENT_LINK_HEADERS}}` token to `/*` block |
| `packages/werkstatt-site/src/codegen/app-boilerplate.ts` | Amended — resolve `AGENT_LINK_HEADERS` token: Link header lines when `agent.enabled !== false`, empty string otherwise |
| `packages/werkstatt-site/src/domain/share/semantic/robots.ts` | Amended — add `contentSignal` field to `RobotsPolicy` and `Content-Signal:` output to `buildRobotsTxt()` |
| `packages/werkstatt-site/src/checks/robots.ts` | Amended — pass `contentSignal` from `system.md` robots block, or default `["text/html", "text/markdown", "application/ld+json", "text/plain"]` when absent |
| `packages/werkstatt-site/src/checks/public-surface/security.ts` | Amended — add HDR-07 rule: verify `Link:` headers present in `/*` block when `agent.enabled !== false` |
| `packages/werkstatt-site/src/checks/robots.ts` | Amended — add PUBTXT rule: verify `Content-Signal:` directive present in `robots.txt` |
| `public/_headers` | Generated output — gains `Link:` headers |
| `public/robots.txt` | Generated output — gains `Content-Signal:` line |

### Output format

**`_headers` `/*` block** (amended):

```
/*
  Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
  X-Content-Type-Options: nosniff
  X-Frame-Options: SAMEORIGIN
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: geolocation=(), microphone=(), camera=(), payment=()
  Content-Security-Policy: default-src 'self'; ...
  Cross-Origin-Resource-Policy: same-site
  X-DNS-Prefetch-Control: on
  Link: < /.well-known/agent.json>; rel="service-meta"; type="application/json"
  Link: < /.well-known/agent.openapi.json>; rel="service-desc"; type="application/json"
  Link: < /.well-known/api-catalog>; rel="service-desc"; type="application/linkset+json"
  Link: < /.well-known/mcp/server-card.json>; rel="service-desc"; type="application/json"
  Link: < /llms.txt>; rel="service-doc"; type="text/plain"
```

**`robots.txt`** (amended, after header comment):

```
Content-Signal: text/html, text/markdown, application/ld+json, text/plain
```

### Failure modes

**`headers.security.validate`** — new rule `HDR-07`:

- `HDR-07`: `Link:` header pointing to `/.well-known/agent.json` absent from `/*` block when `agent.enabled !== false` → error, fixHint: rerun `public.infrastructure.generate`.
- When `agent.enabled: false`, `HDR-07` is silent — Link headers are expected to be absent.

**`robots.validate`** — new rule `PUBTXT-CS`:

- `PUBTXT-CS`: `Content-Signal:` directive absent from `robots.txt` → error, fixHint: rerun `robots.generate`.

Both validators exit non-zero on any error. `--json` output follows the standard `CheckResult` shape with `diagnostics[]`.

**Default `contentSignal` resolution**: `robots.generate` sets `contentSignal` to the value from `system.md` robots block. When absent, `robots.generate` passes the default `["text/html", "text/markdown", "application/ld+json", "text/plain"]` (all Werkstatt sites have markdown twins). `buildRobotsTxt()` outputs the `Content-Signal:` line when `contentSignal` is present in the `RobotsPolicy` — it has no fallback logic of its own.

## Rollout

- **Existing apps**: All apps get the new `Link:` headers and `Content-Signal:` directive on their next `build.prepare` run. No flag day, no migration — both changes are additive to generated output.
- **New apps**: Onboarding scaffold already runs `public.infrastructure.generate` and `robots.generate`; the new output is automatic.
- **`agent.enabled: false` apps**: `public.infrastructure.generate` omits all agent-surface `Link:` headers when `agent.enabled: false` in `system.md`. The template uses a `{{AGENT_LINK_HEADERS}}` token that resolves to the Link header lines when `agent.enabled !== false` and to an empty string otherwise. This avoids emitting discovery hints for endpoints that do not exist.
- **Template vs generator**: The `_headers.template` uses `{{TOKEN}}` substitution. The Link headers are site-relative paths, not domain-specific, but their presence depends on `agent.enabled`. A new `{{AGENT_LINK_HEADERS}}` token is resolved by `public.infrastructure.generate` based on the manifest's `agent.enabled` flag.

## Alternatives considered

1. **Cloudflare Worker for Link headers** — generate `Link:` headers dynamically via a Worker instead of static `_headers`. Rejected: Cloudflare Pages `_headers` file supports `Link:` headers natively; a Worker adds runtime cost and complexity for static content.

2. **Separate `agent.headers.generate` command** — a new generator that writes only the agent discovery Link headers. Rejected: the `_headers` file is owned by `public.infrastructure.generate` (RFC-0315); splitting header generation across two commands creates merge conflicts and ordering issues.

3. **Content-Signal as a separate file** — a `/.well-known/content-signal` file instead of a `robots.txt` directive. Rejected: `Content-Signal:` is designed as a `robots.txt` directive, not a standalone file. Following the spec is more compatible.

## Risks

- **Header size**: Adding 5 `Link:` headers to every response increases the response header size by ~400 bytes. This is well within HTTP/2 header limits and Cloudflare Pages limits.
- **Content-Signal spec status**: `Content-Signal:` is a draft directive, not a finalized RFC. Some crawlers may ignore it. Mitigation: it is a single line, zero maintenance burden, and harmless if ignored.
- **Link header rel values**: The `rel="service-meta"` and `rel="service-desc"` values follow web conventions but are not registered IANA link relation types. This matches what isitagentready.com checks for. If the spec evolves, the template is a one-file update.
- **Agent misinterpretation**: Agents might follow Link headers before checking `/.well-known/agent.json`. This is fine — both paths lead to the same discovery surface.

## Acceptance criteria

- [ ] `buildRobotsTxt()` outputs `Content-Signal:` line when `contentSignal` field is present in `RobotsPolicy`
- [ ] `RobotsPolicy` interface has `contentSignal?: string[]` field
- [ ] `robots.generate` passes `contentSignal` from `system.md` robots block (or default)
- [ ] `_headers.template` includes `Link:` headers in `/*` block pointing to all 5 agent discovery endpoints
- [ ] `public.infrastructure.generate` output (`_headers`) contains the Link headers
- [ ] `headers.security.validate` includes new `HDR-07` rule: `Link:` headers present in `/*` block when `agent.enabled !== false`
- [ ] `robots.validate` includes new `PUBTXT-CS` rule: `Content-Signal:` directive present in `robots.txt`
- [ ] `HDR-07` is silent when `agent.enabled: false` (Link headers absent, no error)
- [ ] `headers.security.validate` still passes (HDR-01..04 unchanged)
- [ ] `robots.validate` still passes (existing PUBTXT rules unchanged)
- [ ] `isitagentready.com` reports Link headers present for warpgogol.com after deploy
- [ ] `isitagentready.com` reports Content-Signal directive present for warpgogol.com after deploy
- [ ] `rfc.validate` passes on this file before merging

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- For RFCs created on or after 2026-07-07 with acceptance probes: before stamping `implemented`, run `pnpm exec werkstatt run rfc.verification.emit --id RFC-0784` and commit the evidence file in the same commit (RFC-0330 amended transition precondition).
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0784 --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
- The `_headers.template` uses a `{{AGENT_LINK_HEADERS}}` token — `public.infrastructure.generate` resolves it to the Link header lines when `agent.enabled !== false` and to an empty string otherwise.
- The `Content-Signal:` directive in `buildRobotsTxt()` MUST be placed after the header comment and before the `User-agent: *` block.
- If RFC-0783 is not yet implemented, the Link headers pointing to `/.well-known/api-catalog` and `/.well-known/mcp/server-card.json` will produce 404s. This is acceptable — the Link header is a discovery hint, not a guarantee. Implementation order: RFC-0783 first, then RFC-0784.
