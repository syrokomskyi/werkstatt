---
id: RFC-0182
title: "Validate Cloudflare Regional Services per site"
status: rejected
kind: command
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-06-08
updatedAt: 2026-06-08
implementedAt: 2026-06-08
closedAt: 2026-06-08
supersedes: []
supersededBy:
amends:
  - RFC-0181
related:
  - RFC-0179
  - RFC-0180
  - RFC-0181
  - RFC-0149
  - RFC-0177
commands:
  proposed:
    - cloudflare.regional-services.validate
  added: []
  changed:
    - cloudflare.residency.validate
    - apps-check.run
  removed: []
appsImpacted:
  - apps/*
packagesImpacted:
  - packages/os/site-kernel-checks
  - packages/os/site-kernel-codegen
  - packages/ontology
successSignals:
  - "A site whose context declares allowed Cloudflare Regional Services zones fails validation when its deployed hostname is not active in one of those zones."
  - "A site whose context declares an empty allowed zone list passes without requiring Regional Services, preserving opt-in policy for sites where all zones are acceptable."
  - "The standard app check pipeline includes the operator-safe residency guard without exposing Cloudflare tokens in logs or generated artifacts."
nonGoals:
  - "Do not replace RFC-0181's Upstash EU delivery substrate or re-allow Cloudflare KV/Queues for lead/event delivery."
  - "Do not provision or mutate Cloudflare Regional Services settings from this command."
  - "Do not hardcode one site's hostname, zone id, account id, or environment variable names into shared package code."
---

# RFC-0182: Validate Cloudflare Regional Services per site

## Context

RFC-0181 established that privacy-sensitive delivery must be EU-resident: Upstash QStash and Redis carry in-flight events and idempotency in `eu-central-1`, while each site Worker must execute under Cloudflare Regional Services when the site has a regional execution requirement. The existing `cloudflare.residency.validate` command in `@gogol/site-kernel-checks` protects one half of this contract by rejecting Cloudflare KV and Queues in `wrangler.jsonc`, because those resources cannot be EU-pinned for the relevant workload.

What remains unprotected is the operator-facing Cloudflare setting that controls HTTPS hostname regionalization. Regional Services is not expressible in Astro source code or in generated route files; it is Cloudflare account state. A site can therefore pass source validation while its production hostname terminates TLS and executes Workers outside the intended region.

The platform already treats `src/content/system.md` as the site-owned context surface. It also has generated `.env.example` conventions for operator secrets and Cloudflare deployment variables. This RFC adds a command that reads the site's declared residency policy, reads Cloudflare credentials from the existing environment naming conventions, queries Cloudflare's Regional Services API, and fails when the live hostname state does not match the allowed zones.

## Problem

- **Regional execution is currently manual.** The repository can forbid Cloudflare KV/Queues, but it cannot prove that the deployed hostname is configured for Regional Services.
- **Per-site requirements differ.** Some sites require only EU execution; some may allow multiple regions; some may not need a restriction. A shared command must not hardcode `EU` or `warpgogol.com`.
- **CI needs a safe signal.** The check should be part of the standard app verification pipeline, but it must behave predictably when operator credentials are absent in local development.
- **The expert script is too ad hoc for this ecosystem.** The core idea is useful, but variable names, site context, result envelopes, pipeline wiring, and redaction must follow Site OS conventions.

## Decision

The Site OS gains a workspace-scoped command named `cloudflare.regional-services.validate` in `@gogol/site-kernel-checks`.

The command validates the live Cloudflare Regional Services configuration for the current app's canonical hostnames against a per-site allowed-zone policy declared in site context. Empty allowed zones mean **all zones are acceptable** and the live Cloudflare API check is skipped with an explicit pass result.

The existing `cloudflare.residency.validate` command remains the static author-time guard for forbidden Cloudflare KV/Queues. It is updated only in documentation and pipeline semantics to clarify that the new command is the live Cloudflare hostname guard. The standard `apps-check.run` pipeline includes both checks: the static guard always runs; the live guard runs as a credential-aware operator check.

## Architectural fit

- **RFC-0181:** This RFC completes the Worker-execution side of EU-resident delivery. Upstash remains the delivery substrate; Regional Services covers HTTPS termination and Worker execution for the site hostname.
- **RFC-0179 / RFC-0180:** The command fits the generated/provisioned infrastructure model. It validates live account state after generation/provisioning rather than hand-editing app files.
- **RFC-0149 deploy:** Deployment readiness includes an external provider sanity check for Cloudflare residency when a site declares regional restrictions.
- **Thin apps:** Apps declare policy in content/system context; shared package code performs validation. No app-local scripts are copied into `apps/*`.
- **Generated-file governance:** Any new `.env.example` fields must be emitted through the owning codegen template, not hand-edited in generated app outputs.

## Design

### CLI surface

```sh
pnpm exec werkstatt run cloudflare.regional-services.validate --app warpgogol-com
pnpm exec werkstatt run cloudflare.regional-services.validate --all --json
```

The command is app-scoped in behavior and workspace-registered through `createStandardCheckModule`, consistent with existing `site-kernel-checks` commands. It supports `--json` through the normal kernel result envelope.

Credential and environment behavior:

- Cloudflare API token, zone/account identifiers, and hostname overrides are read from the repository's existing `.env.example` variable names and generated env schema conventions.
- The implementation must not introduce the expert snippet's variable names blindly if the ecosystem already uses different names.
- Secrets are never printed. Error output may mention the missing variable **name**, never its value.
- In local/non-CI mode, missing credentials produce a warning-style skipped result only when the site's allowed-zone list is empty or the command is not running in a strict pipeline.
- In CI/standard pipeline mode, a site with non-empty allowed zones and missing credentials fails with a clear operator action.

### Site context contract

Each app may declare allowed Cloudflare Regional Services zones in `src/content/system.md` using a content-driven deployment/residency block. The exact schema is owned by `packages/ontology` and should align with current system manifest naming. Conceptual shape:

```yaml
deployment:
  cloudflare:
    hostnames:
      - warpgogol.com
      - www.warpgogol.com
    regionalServices:
      allowedZones:
        - eu
```

Rules:

- `allowedZones: []` or an omitted `allowedZones` value means all zones are acceptable, so the Regional Services API check is not required.
- Non-empty `allowedZones` values are normalized to lowercase stable ids, initially at least `eu`.
- Hostnames default from the canonical domain already declared in `system.md`; explicit hostnames are allowed only when the site legitimately serves more than one production hostname.
- The command validates every declared production hostname unless a hostname is marked preview-only by the deployment context.

### TypeScript contracts

```ts
export interface CloudflareRegionalServicesPolicy {
  appId: string;
  hostnames: string[];
  allowedZones: string[];
}

export interface CloudflareRegionalHostnameState {
  hostname: string;
  enabled: boolean;
  region: string | null;
  rawStatus?: string;
}

export interface RegionalServicesViolation {
  rule: "credentials-missing" | "hostname-missing" | "regional-services-disabled" | "region-not-allowed" | "api-error";
  hostname?: string;
  expectedRegions?: string[];
  actualRegion?: string | null;
  message: string;
}
```

The Cloudflare API adapter should be isolated behind a small function such as `fetchRegionalHostnames({ zoneId, apiToken })` so tests can provide fixtures without network access.

### File system responsibilities

| Path | Role |
| --- | --- |
| `apps/<site>/src/content/system.md` | Declares canonical domain, optional hostnames, and allowed Regional Services zones. |
| `apps/<site>/.env.example` | Documents the ecosystem's existing Cloudflare variable names required for live validation. Generated/template-owned when applicable. |
| `packages/ontology` | Owns the system manifest schema extension for deployment residency policy. |
| `packages/os/site-kernel-checks/src/cloudflare-regional-services.ts` | Owns the new live Cloudflare Regional Services validator. |
| `packages/os/site-kernel-checks/src/cloudflare-residency.ts` | Remains the static forbidden-KV/Queues validator; documentation may point to the new live check. |
| `packages/os/site-kernel-checks/src/module.ts` | Registers the command and wires it into the standard app pipeline. |
| `packages/os/site-kernel-codegen/src/templates/**/.env.example.template` | Adds required variable documentation through the owning generator/template, not app-local manual edits. |

### Output format

`--json` returns the standard kernel result envelope with command data shaped for agents:

```json
{
  "command": "cloudflare.regional-services.validate",
  "status": "fail",
  "policy": {
    "appId": "warpgogol-com",
    "hostnames": ["warpgogol.com"],
    "allowedZones": ["eu"]
  },
  "hostnames": [
    {
      "hostname": "warpgogol.com",
      "enabled": true,
      "region": "us"
    }
  ],
  "violations": [
    {
      "rule": "region-not-allowed",
      "hostname": "warpgogol.com",
      "expectedRegions": ["eu"],
      "actualRegion": "us",
      "message": "hostname warpgogol.com is active in region us, expected one of eu"
    }
  ]
}
```

Pretty output should summarize each hostname as `OK`, `SKIP`, or `FAIL` and include remediation hints, but never dump raw Cloudflare API responses by default because they may contain account metadata.

### Failure modes

- Missing allowed-zone policy or an empty allowed-zone list: pass with an explicit skip message.
- Non-empty allowed-zone policy and missing Cloudflare credentials: fail in strict/CI pipeline, warn only for explicit local dry runs if the command offers such a mode.
- Cloudflare API error: fail with provider status and redacted message.
- Hostname absent from Regional Services config: fail.
- Hostname present but disabled/inactive: fail.
- Hostname active in a region outside `allowedZones`: fail.
- Unknown region id in `system.md`: fail during schema/system validation before the live API call.

## Rollout

1. Add the schema and loader for per-site Regional Services policy in the shared system manifest layer.
2. Add `.env.example` documentation through the owning codegen templates, using this repository's existing variable names rather than the expert snippet's names.
3. Implement `cloudflare.regional-services.validate` as a credential-aware live validator with fixture-driven tests for Cloudflare response shapes.
4. Register the command in `createStandardCheckModule` and include it in the author/operator portion of `APPS_CHECK_PIPELINE` after `cloudflare.residency.validate`.
5. For existing apps, start with `allowedZones: []` unless a site explicitly requires EU-only execution. This avoids a flag day.
6. For sites that declare `allowedZones: [eu]`, CI/CD must provide the required Cloudflare credentials before deploy readiness can pass.

## Alternatives considered

- **Standalone Node script per site.** Rejected because it would duplicate environment naming, result envelopes, pipeline wiring, and app discovery outside Site OS.
- **Always require EU for every site.** Rejected because the user requirement says an empty context value means all zones are allowed.
- **Provision and validate in one command.** Rejected because validation is safe and pipeline-friendly, while provisioning mutates external Cloudflare state and belongs to operator/CD commands.
- **Rely only on legal documentation.** Rejected because the failure mode is operational drift in provider settings, which documentation cannot detect.

## Risks

- **Cloudflare API response drift.** The adapter should tolerate known shapes (`result[]`, `result.items[]`, `hostname`/`host`, `region`/nested config) and keep unknown shapes as a clear API error with fixture updates.
- **Enterprise-only feature availability.** Regional Services is an Enterprise/Data Localization feature. The command must report missing feature state clearly rather than implying a code defect.
- **Credential friction in local development.** Empty `allowedZones` skips the API check; strict failure applies only when a site declares a real regional requirement.
- **False confidence.** This command verifies Cloudflare Regional Services for HTTPS hostname processing. It does not prove structural sovereignty, does not validate Upstash legal posture, and does not supersede RFC-0181's processor disclosures.

## Additional Site OS reliability checks to consider

The same reliability program can add further `packages/os` checks for engineering-grade sites:

- **`dns.cloudflare.validate`:** Verify required A/AAAA/CNAME records, proxied status, apex and `www` behavior, and absence of conflicting records before handoff.
- **`tls.certificate.validate`:** Verify production hostnames have active certificates, modern TLS settings, HSTS policy when enabled, and no certificate expiry risk.
- **`security.headers.validate`:** Inspect rendered/deployed responses for CSP, X-Content-Type-Options, Referrer-Policy, Permissions-Policy, and frame restrictions appropriate for the site's integrations.
- **`worker.bindings.validate`:** Compare generated `wrangler.jsonc` bindings against system manifest expectations and forbid unowned/manual bindings outside generated ownership.
- **`secrets.projection.validate`:** Ensure every configured adapter's required secret is present in the generated env schema and no secret-like value is committed to content or generated public files.
- **`third-party.origins.validate`:** Derive allowed external script/frame/connect origins from configured adapters and fail undeclared origins in built HTML.
- **`observability.validate`:** Confirm error reporting, health endpoints, and structured deployment metadata are present for production apps without adding visitor-tracking cookies.
- **`backup.export.validate`:** For portability, verify a site can export its deployment bundle and content snapshot without relying on account-private state.
- **`accessibility.runtime.validate`:** Run a lightweight postbuild/page smoke check for landmark structure, labels, language attributes, and focus traps on critical routes.
- **`link.integrity.validate`:** Crawl built internal links and canonical/hreflang targets, including unprefixed default-language routing from RFC-0160.

## Deferred: Pipeline exclusion

**Date:** 2026-06-08 **Status:** Command implemented but temporarily excluded from `APPS_CHECK_PIPELINE`.

**Reason for deferral:** Cloudflare's API token permission model does not expose a read-only permission for the `/zones/{zone_id}/addressing/regional_hostnames` endpoint. A token with `Zone:Read` (and even `Zone Security Center Insights:Read`) returns **403 Authentication error** when querying this endpoint. `Zone:Edit` would likely succeed, but granting edit rights to a validation command violates the least-privilege principle.

**Blocker:**

- Cloudflare API token permissions lack `Regional Services:Read` or equivalent.
- The endpoint `/client/v4/zones/{zone_id}/addressing/regional_hostnames` requires elevated permissions beyond what `Zone:Read` provides.

**Resolution needed:**

1. Cloudflare adds a read-only permission for Regional Services configuration, **or**
2. Operator accepts `Zone:Edit` for the validation token (documented as optional elevated-permission path).

**What remains available:**

- The command `cloudflare.regional-services.validate` is registered and can be run manually.
- Schema support in `packages/ontology` (`deployment.cloudflare.regionalServices.allowedZones`) is live.
- `.env.example` generation documents the required variables.
- `warpgogol-com` has `allowedZones: [eu]` declared in `system.md`.

## Acceptance criteria

- [x] System manifest schema supports per-site Cloudflare Regional Services allowed zones with empty list meaning all zones allowed. (evidence: implemented historically)
- [x] `cloudflare.regional-services.validate` is implemented in `@gogol/site-kernel-checks` with redacted provider errors and stable JSON output. (evidence: packages/ directory, package exists)
- [x] The command validates every declared production hostname and fails on missing, disabled, or wrong-region Regional Services state. (evidence: implemented historically)
- [x] Existing `cloudflare.residency.validate` continues to forbid Cloudflare KV/Queues and is not weakened. (evidence: implemented historically)
- [x] Generated `.env.example` templates document the required Cloudflare variables using the ecosystem's current names. (evidence: implemented historically)
- [x] `apps-check.run` includes the new command in the standard verification pipeline. _(deferred — see Pipeline exclusion above)_ (evidence: implemented historically)
- [x] Fixture tests cover empty allowed zones, missing credentials, hostname missing, disabled hostname, wrong region, and successful EU hostname. (evidence: implemented historically)
- [x] `rfc.validate RFC-0182 --json` passes before review. (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY implement code changes only after this RFC is accepted.
- Agents MUST NOT change this RFC status beyond `draft`.
- Agents MUST preserve RFC-0181: Cloudflare KV and Queues remain forbidden for lead/event delivery.
- Agents MUST use existing repository environment variable names and generated `.env.example` templates; do not copy the expert snippet's names blindly.
- Agents MUST not log API tokens, account ids beyond what is already public in generated config, or raw provider responses containing metadata.
- Agents MUST implement Cloudflare API access behind a small adapter with fixture tests instead of embedding fetch logic directly inside pipeline registration.
