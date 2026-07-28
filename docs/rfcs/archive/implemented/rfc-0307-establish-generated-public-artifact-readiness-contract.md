---
id: RFC-0307
title: "Establish a generated public artifact readiness contract"
status: implemented
kind: architecture
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-07-05
updatedAt: 2026-07-06
implementedAt: 2026-07-06
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy:
  - RFC-0316
  - RFC-0318
related:
  - RFC-0052
  - RFC-0081
  - RFC-0087
  - RFC-0142
  - RFC-0143
  - RFC-0220
  - RFC-0287
  - RFC-0289
  - RFC-0290
  - RFC-0306
commands:
  proposed:
    - public.artifact.generate
    - public.artifact.validate
    - public.declaration.validate
    - public.runtime.probe
  added:
    - public.artifact.generate
    - public.artifact.validate
    - public.declaration.validate
    - public.runtime.probe
  changed:
    - dist.sitemap.images.generate
    - dist.sitemap.images.validate
    - page.markdown.generate
    - page.markdown.validate
    - agent.surface.validate
    - behavior.snapshot.validate
  removed: []
appsImpacted:
  - apps/*
packagesImpacted:
  - "@gogol/share"
  - "@gogol/ui"
  - "@gogol/site-kernel"
  - "@gogol/site-kernel-checks"
  - "@gogol/site-kernel-codegen"
successSignals:
  - "Every public artifact declared by sitemap.xml, agent.json, web.json, humans.txt, ai.txt, head links, or app manifests is generated or explicitly runtime-owned, and every generated declaration is validated before deployment."
  - "No app hand-authors generated public readiness files under public/; generators derive outputs from src/content/system.md, existing content, registries, and package-owned templates."
  - "Legal, credit, open-source, passport, and cosmic pages eligible for Markdown twins have machine-readable twins generated and validated with the same contract as normal pages."
  - "Runtime-only endpoints declared in static public artifacts are probed in production or preview by an explicit command, with failures recorded as canonical diagnostics."
nonGoals:
  - "Do not implement IndexNow, icon generation, humans.txt, AI crawler policy, 404 pages, or HTTP security headers here; sibling RFCs own those features."
  - "Do not make public/ an authored source of truth for managed artifacts."
  - "Do not weaken existing behavior snapshots to hide public artifact drift."
acceptance:
  - probe: command-registered
    name: "public.artifact.validate"
  - probe: command-registered
    name: "public.declaration.validate"
  - probe: run
    command: "site-kernel run public.artifact.validate --app warpgogol-com --json"
    expect:
      exitCode: 0
  - probe: run
    command: "site-kernel run public.declaration.validate --app warpgogol-com --json"
    expect:
      exitCode: 0
---

# RFC-0307: Establish a generated public artifact readiness contract

## Context

A public-folder audit of `apps/warpgogol-com/public/` found that the site already publishes an advanced public surface: `llms.txt`, `llms-full.txt`, Markdown twins, `.well-known/agent.json`, OpenAPI, MCP declarations, agent knowledge JSON, Bordbuch status artifacts, an Ed25519 key, hreflang sitemaps, and `ai.txt`.

The remaining gaps are not single-file chores. They are drift problems:

- `sitemap.xml` declared `sitemap-images.xml`, but the audited public snapshot did not contain it.
- Legal routes existed in HTML sitemap outputs, but their Markdown twins were incomplete.
- Static manifests declared runtime endpoints such as `/api/agent/actions/lead.submit`, `/api/agent/mcp`, and `/.well-known/cosmic-passport.json`; public snapshots alone cannot prove they work.
- `public/` can show whether a file exists, but not whether a generated declaration is true at runtime or after deployment.

The owner decision is generation-first: generate everything that can be generated and validate every declaration. This RFC creates the shared readiness contract that sibling RFCs use.

## Problem

Without a shared readiness contract, future agents can fix one public artifact by hand while the next generated build or the next app reintroduces the same defect. A static `public/` snapshot also cannot distinguish a truly missing file from a runtime-owned endpoint, so the ecosystem needs both local artifact validation and deploy-time probing.

## Decision

Introduce a generated public artifact readiness contract for every `apps/*` site.

1. Managed public files are generated from package-owned generators and templates.
2. Generated public declarations are validated before build/deploy.
3. Runtime declarations are probed after deploy or against an explicit preview URL.
4. Missing artifacts are either generated, removed from the declaring index, or marked as runtime-owned with a probe. No declaration may silently point to a 404.

## Architectural fit

This RFC sits above existing artifact generators such as `robots.generate`, `llms.generate`, `page.markdown.generate`, `sitemap.generate`, `dist.sitemap.images.generate`, and the agent-surface generators. It does not replace them; it defines the cross-artifact declaration contract and the validator/probe commands that catch drift between generated outputs.

It preserves RFC-0081/RFC-0087 generated-file governance: app public files remain outputs, while packages own generation and validation logic.

## Design

## Public Artifact Classes

| Class | Examples | Owner |
| --- | --- | --- |
| Static generated file | `robots.txt`, `ai.txt`, `humans.txt`, `manifest.webmanifest`, `*.md` twins, `sitemap*.xml` | package generator |
| Static fixed verification file | IndexNow key file, selected `.well-known/*` verification files | package generator; content derived from app id/config |
| Runtime endpoint | `/api/agent/mcp`, `/api/agent/actions/<id>`, `/.well-known/cosmic-passport.json` when served by Worker | runtime package + generated route |
| External declaration | canonical URLs in sitemap/agent/web manifests | validator/probe |

Apps must not hand-author generated static files. If a file is produced under `apps/<site>/public/` and belongs to one of these classes, the generator ownership map must list it.

## Required Commands

### public.artifact.generate

Scope: app.

Optional aggregate generator that invokes all public artifact generators required for a site. It may remain a thin orchestration alias if `build.prepare` already calls the individual generators.

It must not duplicate generator logic.

### public.artifact.validate

Scope: app, read-only.

Validates the built/public tree after generation:

- `sitemap.xml` exists and every nested sitemap `<loc>` declared for the same site has a generated local counterpart or an explicit runtime probe entry.
- If `sitemap.xml` declares `sitemap-images.xml`, the image sitemap exists, is XML, and `dist.sitemap.images.validate` passes.
- Every `<loc>` in every generated sitemap is absolute, same-site, and not a Markdown twin URL.
- Every generated public file that should be UTF-8 text can be decoded as UTF-8.
- Every declared Markdown twin path exists under the emitted public/dist tree.
- No generated artifact with the RFC-0081 marker is hand-edited outside its owning generator.
- No obsolete public artifacts from a previous scheme remain after a clean build when the generator has a stale cleanup responsibility.

Failure severity:

- `error` for missing declared artifacts, invalid UTF-8, invalid XML/JSON, or local 404 declarations.
- `warning` for optional advisory artifacts not yet required by a sibling RFC.

### public.declaration.validate

Scope: app, read-only.

Validates static declarations against generated routes and known runtime ownership:

- Head links for `rel=author`, `rel=manifest`, icons, and Markdown twins point to generated files.
- `.well-known/agent.json` only declares MCP/action/knowledge endpoints that have generated routes or generated static files.
- Any `web.json`, agent manifest, OpenAPI, or passport status URL is either a generated static file or listed as runtime-owned by an app/package route.
- Agent runtime declarations use the same manifest source as generated routes; no duplicate app-local route list is allowed.
- Legal, credits, open-source, cosmic/passport, and cosmic/star-map pages that are rendered as visible HTML and eligible for agent reading have Markdown twins.

Failure severity:

- `error` for dead static declarations or route/manifest mismatches.
- `warning` for runtime endpoints that cannot be probed locally but are listed for post-deploy probing.

### public.runtime.probe

Scope: app or URL target, networked, not required in offline package checks.

Inputs:

```sh
pnpm exec site-kernel run public.runtime.probe --app <app> --base-url <https-url> --json
```

The command fetches declared runtime endpoints and public artifacts after deploy:

- every sitemap `<loc>` that is a sitemap document;
- every agent manifest `interfaces.*.url`;
- every OpenAPI `servers`/path endpoint that should be public;
- `/.well-known/cosmic-passport.json` when declared;
- Markdown content-type samples;
- cache headers for `.well-known/*` and `/api/agent/v1/*`.

It emits canonical diagnostics:

- `PUB-DECL-404`: declared URL returned 404.
- `PUB-DECL-STATUS`: declared URL returned non-2xx where 2xx is required.
- `PUB-DECL-TYPE`: content type mismatch.
- `PUB-DECL-CACHE`: freshness/cache policy mismatch.

This command may run in deployment CI after the deploy URL is known. It must never be required for offline `packages-check.run`.

## Legal and Markdown Twin Coverage

The Markdown twin generator must treat these visible legal/credits/system routes as eligible unless an existing page policy explicitly opts them out:

- `impressum`
- `datenschutz`
- `agb`
- `widerruf`
- `open-source`
- `bildnachweise` or its current generated credits route
- `cosmic/passport`
- `cosmic/star-map`

If RFC-0306 is implemented first, twins use the sibling `/<route>.md` scheme. If not, this RFC still requires complete coverage under the active twin scheme. Do not implement a route-specific legal twin generator; extend the canonical `page.markdown.generate` path.

## Sitemap Image Rule

If `sitemap.xml` is a sitemap index and contains `<loc>.../sitemap-images.xml</loc>`, then the image sitemap must be present in the emitted public/dist output and pass `dist.sitemap.images.validate`.

If an app has no image sitemap content, the sitemap index must omit the image sitemap entry.

Partial states are forbidden:

- index declares file, file missing;
- file exists but index omits it;
- image sitemap contains image URLs that no longer exist in the build.

## Runtime Declarations

Static public artifacts may declare runtime routes only when the route is generated or owned by a package-level runtime contract.

For the current agent surface, `public.declaration.validate` must prove:

- `/api/agent/mcp` is declared only when `agent.routes.generate` emitted the MCP route.
- `/api/agent/actions/<id>` is declared only when the manifest references that capability and the generated action route exists.
- `/.well-known/cosmic-passport.json` is either generated static output or owned by a documented runtime route.

Do not remove working runtime declarations merely because `public/` snapshots do not contain them. Classify them and probe them.

## Pipeline Placement

- `public.artifact.generate` or equivalent individual generators run in `build.prepare`.
- `public.artifact.validate` runs in `build.check` and `apps-check.author`.
- `public.declaration.validate` runs in `build.check` and `apps-check.author`.
- `public.runtime.probe` runs after deploy or against explicit preview URLs; it is allowed to be a scheduled monitor command.

## Rollout

1. Inventory current public artifact declarations for both reference apps.
2. Implement `public.artifact.validate` over existing generators first.
3. Fix `sitemap-images.xml` generation/index drift for `warpgogol-com`.
4. Extend `page.markdown.generate` coverage for legal/credits/system pages.
5. Implement `public.declaration.validate`.
6. Add `public.runtime.probe` with fixture/offline mode and live mode.
7. Wire commands into pipelines with error/warning severities as specified.

## Risks

- **Over-validating optional files.** Mitigated by letting sibling RFCs promote optional artifacts to required status one by one.
- **Network flakes blocking local work.** Mitigated by keeping `public.runtime.probe` out of offline package checks.
- **Duplicating existing validators.** Mitigated by composing existing commands such as `dist.sitemap.images.validate`, `page.markdown.validate`, and `agent.surface.validate` instead of reimplementing their internals.

## Alternatives considered

- **Patch `apps/warpgogol-com/public/` directly.** Rejected. The audit looked at one snapshot, but the platform needs a rule for every current and future app.
- **Put every check into one deploy-only probe.** Rejected. Local generated-artifact errors should fail before deployment; only true runtime behavior belongs in network probes.
- **Delete declarations when files are missing.** Rejected as a default. Missing declarations are sometimes generator bugs, not optional features.

## Acceptance criteria

- [x] `public.artifact.validate`, `public.declaration.validate`, and `public.runtime.probe` are (evidence: implemented historically) registered commands.
- [x] `warpgogol-com` no longer declares `sitemap-images.xml` without emitting it. (evidence: implemented historically)
- [x] Legal/credits/open-source/cosmic visible routes eligible for Markdown twins have generated (evidence: implemented historically) twins and pass `page.markdown.validate`.
- [x] Static agent/runtime declarations are either backed by generated files/routes or reported as (evidence: implemented historically) runtime probes.
- [x] `public.runtime.probe --base-url <deploy-url>` can verify the audit's runtime URLs: (evidence: implemented historically) `/api/agent/mcp`, `/api/agent/actions/lead.submit`, and `/.well-known/cosmic-passport.json`.
- [x] Behavior snapshots capture intentional public-surface changes; snapshot diffs are reviewed, (evidence: implemented historically) not blindly regenerated.
- [x] `rfc.validate` passes. (evidence: implemented historically)

## Implementation notes for agents

- Agents may implement this RFC because its status is `accepted`.
- Do not edit generated public files directly.
- Prefer extending existing generator and validator commands over adding parallel scanners.
- Runtime endpoints are not missing just because they are absent from `public/`; classify them and probe them.
- Do not silence a missing sitemap/image/twin declaration by deleting the declaration unless the generator truly has no content to publish.
