---
id: RFC-0896
title: "Add custom domain DNS and www redirect management for site deployments"
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
createdAt: 2026-08-20
updatedAt: 2026-08-20
enhancedAt: 2026-08-20
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0752
  - RFC-0753
  - DNA-73
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-49
# RFC-0396: Traceability to a vendored spec node: "<spec-id>/<node-id>", e.g. "pbp/RFC-PBP-020".
# Set by spec.materialize; leave commented for non-spec RFCs.
# specRef:
# RFC-0478: Platform versioning enforcement. Declares the SemVer delta this RFC
# produces when implemented. Required for post-cutoff implemented RFCs (V-29).
# Values: minor (Breaks-B, requires migrator), patch (safe), none (prose-only),
# major (architectural, manually reserved). Default: patch.
versionBump: patch
commands:
  proposed:
    - customdomain.register
    - redirect.register
  added:
    - customdomain.register
    - redirect.register
  changed: []
  removed: []
appsImpacted: []
packagesImpacted:
  - werkstatt
successSignals:
  - Apex domain resolves to the deployed Worker within one deployment cycle
  - www subdomain redirects to apex with HTTP 301
  - Pipeline registers custom domain and redirect automatically before wrangler deploy
nonGoals:
  - Dev/alt channel custom domain setup (only main channel is covered)
  - DNS propagation waiting
  - Apex domain redirect from non-www to www (we standardize on apex canonical)
  - Bulk redirect management via Cloudflare Bulk Redirect API
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

# RFC-0896: Add custom domain DNS and www redirect management for site deployments

## Context

The platform expects thousands of sites per workshop (Mастерская). Each site deploys to Cloudflare Workers via `leitstand.propagate` (alt) and `leitstand.promote` (main). The `system-config.yaml` declares `deployment.channels.main.url` (e.g. `https://warpgogol.com`) and `cloudflareZoneId`, but no command connects the apex domain to the deployed Worker.

Existing commands cover only service subdomains (`subdomain.register`, RFC-0752) and arbitrary DNS records (`dns.record.upsert`, RFC-0753). Neither handles apex domain DNS + Workers route for sites, nor www→apex redirect. The `wrangler.template.jsonc` contains no `routes` or `custom_domains` sections — the Worker is reachable only via `*.workers.dev` unless DNS and routes are configured manually.

## Problem

DNA-49 (Fleet propagation) requires per-site targeting and explicit channel/URL logging, but the Leitstand does not ensure the custom domain in `system-config.yaml` is actually wired to the Worker. Operators must manually create DNS records and Workers routes for the apex domain, and manually configure www→apex redirect. At thousands-of-sites scale, manual DNS management is error-prone and blocks the deployment pipeline from being fully automated.

Specific gaps:

- No command creates an A record (proxied) or Workers route for the apex domain (`warpgogol.com`)
- No command creates a www DNS record + Cloudflare Redirect Rule for `www.warpgogol.com` → `warpgogol.com` (HTTP 301)
- `leitstand.propagate` and `leitstand.promote` deploy the Worker but do not verify or create DNS/route infrastructure for the custom domain

## Decision

The kernel gains two new commands — `customdomain.register` and `redirect.register` — that idempotently create DNS records, Workers routes, and Cloudflare Redirect Rules for site apex domains and www→apex redirects. Both commands are called automatically from `leitstand.promote` (main channel) before `wrangler deploy`. The alt channel (`leitstand.propagate`) is out of scope — it uses `alt.{domain}`, not the apex domain.

## Architectural fit

- **DNA-49 (Fleet propagation)**: Extends Leitstand to ensure custom domain infrastructure is in place before deployment. The pipeline already handles per-site targeting and channel ordering; this adds DNS/route readiness as a pipeline step.
- **DNA-73 (Sequential deployment pipeline)**: Both commands run inside the existing Dev → Alt → Main pipeline. They execute during `leitstand.promote` (main) only, before `wrangler deploy`, preserving sequential ordering. The alt channel is skipped because it uses `alt.{domain}`, not the apex domain.
- **RFC-0752 (Subdomain management)**: Follows the same idempotent pattern — check existing records, create if missing, error on mismatch. Reuses `cloudflare-api.ts` functions.
- **RFC-0753 (DNS record management)**: `dns.record.upsert` remains for arbitrary DNS records (SVCB, TXT). `customdomain.register` is specialized for apex domain + Workers route, `redirect.register` for www + Redirect Rule.
- **Site OS operator model**: Both commands are workspace-scope, registered in a new `customdomain.module.ts` in `packages/werkstatt/src/customdomain/`.

## Design

### CLI surface

```sh
# Register apex domain DNS + Workers route for a site
pnpm exec werkstatt run customdomain.register --site warpgogol-com

# Register www DNS + Redirect Rule (www → apex, 301)
pnpm exec werkstatt run redirect.register --site warpgogol-com
```

Flags:

- `--site` (required) — System ID from `system-config.yaml`

Scope: `workspace` (reads `systems-cache/{system}/system-config.yaml`).

Both commands use the standard `KernelCommandInput` — no custom input type is needed. The `--site` flag is parsed via the standard `flagSite(input)` helper, consistent with `subdomain.register` and other leitstand commands.

### TypeScript contracts

```ts
// customdomain.register result
// Input: standard KernelCommandInput with --site flag
interface CustomDomainRegisterResult {
  command: "customdomain.register";
  systemId: string;
  domain: string; // apex domain, e.g. "warpgogol.com"
  dnsRecord: {
    id: string;
    type: "A";
    name: string;
    content: string; // Cloudflare proxied A record placeholder
    proxied: true;
    created: boolean;
  };
  workersRoute: {
    id: string;
    pattern: string; // "warpgogol.com/*"
    script: string; // workerName from system-config.yaml
    created: boolean;
  };
  state: "registered" | "already-registered" | "failed";
}

// redirect.register result
// Input: standard KernelCommandInput with --site flag
interface RedirectRegisterResult {
  command: "redirect.register";
  systemId: string;
  wwwDomain: string; // "www.warpgogol.com"
  apexDomain: string; // "warpgogol.com"
  dnsRecord: {
    id: string;
    type: "CNAME";
    name: string; // "www.warpgogol.com"
    content: string; // apex domain
    proxied: true;
    created: boolean;
  };
  redirectRule: {
    id: string;
    description: string; // "www → apex 301 (warpgogol-com)"
    status: "enabled";
    created: boolean;
  };
  state: "registered" | "already-registered" | "failed";
}
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `systems-cache/{system}/system-config.yaml` | Read for `cloudflareZoneId`, `deployment.channels.main.url`, `deployment.channels.main.workerName` |
| `tools/kernel.config.ts` | Register `customdomain` module loader (analogous to `subdomain` and `dns` loaders) |
| `packages/werkstatt/src/customdomain/customdomain.module.ts` | New kernel module registering both commands |
| `packages/werkstatt/src/customdomain/customdomain-register.ts` | `customdomain.register` handler |
| `packages/werkstatt/src/customdomain/redirect-register.ts` | `redirect.register` handler |
| `packages/werkstatt/src/customdomain/customdomain-helpers.ts` | Shared helpers: resolve system config, build DNS/route/redirect payloads |
| `packages/werkstatt/src/leitstand/adapters/cloudflare-api.ts` | Extended with `getRedirectRuleset`, `createRedirectRule` for Rulesets API |
| `packages/werkstatt/src/leitstand/leitstand-commands.ts` | `runLeitstandPromote` calls both commands before `executeDeployPhases` |

### Output format

```json
{
  "command": "customdomain.register",
  "systemId": "warpgogol-com",
  "domain": "warpgogol.com",
  "dnsRecord": {
    "id": "abc123",
    "type": "A",
    "name": "warpgogol.com",
    "content": "192.0.2.1",
    "proxied": true,
    "created": true
    // Note: 192.0.2.1 is a TEST-NET-1 (RFC 5737) documentation placeholder.
// For proxied records, Cloudflare replaces the content with their anycast IPs.
  },
  "workersRoute": {
    "id": "def456",
    "pattern": "warpgogol.com/*",
    "script": "warpgogol-com",
    "created": true
  },
  "state": "registered"
}
```

```json
{
  "command": "redirect.register",
  "systemId": "warpgogol-com",
  "wwwDomain": "www.warpgogol.com",
  "apexDomain": "warpgogol.com",
  "dnsRecord": {
    "id": "ghi789",
    "type": "CNAME",
    "name": "www.warpgogol.com",
    "content": "warpgogol.com",
    "proxied": true,
    "created": true
  },
  "redirectRule": {
    "id": "jkl012",
    "description": "www → apex 301 (warpgogol-com)",
    "status": "enabled",
    "created": true
  },
  "state": "registered"
}
```

### Failure modes

- **DNS record mismatch**: If an existing DNS record for the apex domain has the wrong type or content, the command throws with a descriptive error (same pattern as `subdomain.register`). Operator must fix manually.
- **Workers route mismatch**: If an existing Workers route points to a different script, the command throws.
- **Redirect Rule mismatch**: If an existing Redirect Rule for www exists but has a different target or status code, the command throws.
- **Missing `cloudflareZoneId`**: If `system-config.yaml` lacks `cloudflareZoneId`, the command throws.
- **Missing or inaccessible zone**: If the Cloudflare API returns 404 for the zone or the token lacks permissions, the command throws with a descriptive error.
- **Missing `CLOUDFLARE_API_TOKEN`**: The token must have `Zone:DNS:Edit`, `Workers Routes:Edit`, and `Zone:Transform:Edit` (for Redirect Rules via Rulesets API) permissions.
- **No `--dry-run`**: Consistent with `subdomain.register` and `dns.record.upsert`, which do not have a dry-run flag. The commands are idempotent — re-running them is safe.
- **No validate commands**: The commands are idempotent and self-validating — they check existing records before creating. A separate `customdomain.validate`/`redirect.validate` is redundant, unlike `subdomain.validate` which exists because `leitstand.service.promote` calls validate-then-register as an optimization (avoid register if already valid). For sites, `leitstand.promote` calls register directly since the idempotent check is built in.
- Pipeline integration: if `customdomain.register` or `redirect.register` fails, `leitstand.promote` fails with a clear error message. The pipeline does not silently skip DNS setup.

## Rollout

- **Default behavior**: `customdomain.register` and `redirect.register` run automatically inside `leitstand.promote` (main channel) before `wrangler deploy`. No operator intervention needed for new sites. The alt channel (`leitstand.propagate`) is not involved — it uses `alt.{domain}`, not the apex domain.
- **Existing sites**: Sites with manually configured DNS and routes are unaffected — both commands are idempotent. If existing records match, they are skipped. If they mismatch, the command errors with a fix hint.
- **New sites**: Automatically comply from day one. Onboarding (`onboarding.scaffold`) already generates `system-config.yaml` with `cloudflareZoneId` and `deployment.channels.main.url`.
- **Pipeline integration**: Both commands are called in `runLeitstandPromote` after authorization but before `executeDeployPhases`. If either fails, the deployment aborts.
- **No deprecation**: This RFC does not supersede `subdomain.register` (RFC-0752) or `dns.record.upsert` (RFC-0753) — they remain for service subdomains and arbitrary DNS records respectively.

## Alternatives considered

- **Worker-level www redirect**: Check `Host` header in `src/worker.ts` and return 301 for `www.*`. Rejected because it requires modifying the Worker template for all sites and adds per-request overhead. Cloudflare Redirect Rules handle this at the edge before the Worker is invoked.
- **DNS-only www redirect**: CNAME `www` → apex without a Redirect Rule. Rejected because DNS only resolves the name — it does not issue an HTTP 301. The browser would show `www.warpgogol.com` in the address bar without redirecting.
- **Single command (customdomain.register for both apex + www)**: Rejected to keep commands single-responsibility. `customdomain.register` handles apex DNS + route; `redirect.register` handles www DNS + Redirect Rule. This allows sites that need only one without the other.
- **Extending `subdomain.register` for sites**: Rejected because `subdomain.register` reads `services/registry.yaml` and is scoped to service subdomains. Sites use `system-config.yaml`, a different config source. Mixing the two would violate the site/service boundary.
- **Hybrid (Redirect Rules with worker-level fallback)**: Rejected as over-engineering. Redirect Rules are sufficient and available on all Cloudflare plans.

## Risks

- **API token permissions**: The Cloudflare API token needs additional permissions for Redirect Rules (`Zone:Transform:Edit` or `Zone:Page Rules:Edit`). If the token lacks these, `redirect.register` fails. Mitigation: clear error message listing required permissions.
- **Redirect Rules API availability**: The Cloudflare Rulesets API for Redirect Rules is stable but may have rate limits. Mitigation: both commands are idempotent and run once per deployment, not per request.
- **Agent misinterpretation**: Agents might try to call `customdomain.register` for dev/alt channels. Mitigation: the command reads only `deployment.channels.main` from `system-config.yaml` and throws if `--channel` is passed (no `--channel` flag exists).
- **Scale**: At thousands of sites, the pipeline runs two additional API calls per site per deployment. This is negligible compared to the existing build + deploy + health check cycle.
- **False positive on mismatched DNS**: If an operator manually configured a different A record for the apex domain, `customdomain.register` will error. This is correct behavior — the operator must reconcile before the pipeline can proceed.

## Acceptance criteria

- [x] `customdomain.register` command registered in `customdomain.module.ts` with `--site` flag (evidence: `customdomain.module.ts:30-43` registers command with `flags.site`)
- [x] `redirect.register` command registered in `customdomain.module.ts` with `--site` flag (evidence: `customdomain.module.ts:45-58` registers command with `flags.site`)
- [x] `customdomain.register` creates a proxied A record for the apex domain and a Workers route pointing to the site's Worker, idempotently (evidence: `customdomain-register.ts:101-180` checks existing then creates, `customdomain-helpers.ts:73-79` builds A record)
- [x] `redirect.register` creates a proxied CNAME record for `www.{apex}` and a Cloudflare Redirect Rule (301 to apex), idempotently (evidence: `redirect-register.ts:92-170` checks existing then creates, `customdomain-helpers.ts:81-87` builds CNAME)
- [x] Both commands error on mismatched existing records with a descriptive fix hint (evidence: `customdomain-register.ts:118-127` and `redirect-register.ts:108-117` throw with "Delete or fix the record manually before re-running")
- [x] `runLeitstandPromote` calls `customdomain.register` and `redirect.register` before `executeDeployPhases` (evidence: `leitstand-commands.ts:1130-1158` calls both before `executeDeployPhases` at line 1160)
- [x] `cloudflare-api.ts` extended with `getRedirectRuleset` and `createRedirectRule` functions for the Rulesets API (evidence: `cloudflare-api.ts:328-394` implements both functions)
- [x] `--json` output format matches the documented shape (evidence: `CustomDomainRegisterResult` at `customdomain-register.ts:36-57` and `RedirectRegisterResult` at `redirect-register.ts:34-51`)
- [x] Unit tests for both commands covering: create, idempotent skip, mismatch error (evidence: `customdomain-register.test.ts` 7 tests, `redirect-register.test.ts` 7 tests — all 14 pass)
- [x] `AGENTS.md` updated with custom domain and redirect registration pipeline step (evidence: `AGENTS.md:446` updated with RFC-0896 note)
- [x] `rfc.validate` passes on this file with zero RFC-specific errors (evidence: `rfc.validate --id RFC-0896` exit 0)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST NOT call `customdomain.register` or `redirect.register` for dev/alt channels — both commands read only `deployment.channels.main` from `system-config.yaml`.
- Agents MUST NOT use `dns.record.upsert` as a substitute for `customdomain.register` — the latter also creates the Workers route, which `dns.record.upsert` does not.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `rfc.supersede.propose --id RFC-0896 --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
- The Cloudflare Rulesets API for Redirect Rules uses a two-step read-then-append pattern:
  1. `GET /zones/{zone_id}/rulesets/phases/http_request_dynamic_redirect/entrypoint` — fetch the existing phase ruleset and its rules. Check if a rule for `www.{apex}` already exists (by description or expression match).
  2. If not found, `POST /zones/{zone_id}/rulesets/{ruleset_id}/rules` — append a single rule to the existing ruleset. The rule action is `redirect` with `status_code: 301` and `expression` matching `(http.host eq "www.{apex}")`. This approach preserves existing Redirect Rules in the zone (unlike `PUT /entrypoint` which replaces all rules) and is safe for concurrent deployments of different sites in the same zone — each POST appends a distinct rule for a distinct www subdomain.
- The A record content `192.0.2.1` is a TEST-NET-1 (RFC 5737) documentation placeholder. For proxied records, Cloudflare replaces the content with their anycast IPs — the actual IP value is irrelevant.
- Both commands MUST be idempotent: if the correct DNS record, Workers route, or Redirect Rule already exists, skip creation and report `state: "already-registered"`.
- Pipeline integration point: in `runLeitstandPromote`, call both commands after `authorizeAndDeploy` succeeds but before `executeDeployPhases`. If either fails, return a failed result with `failingPhase: "custom-domain-setup"`.
