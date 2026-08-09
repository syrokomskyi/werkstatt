---
id: RFC-0786
title: "Add DNS-AID record generator for agent discovery via DNS TXT records"
status: accepted
# kind options: architecture | contract | command | policy | deprecation
kind: command
# scope options: app | workspace
scope: app
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
  - RFC-0753
  - RFC-0286
  - RFC-0787
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-58
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
    - agent.dns-aid.generate
    - agent.dns-aid.validate
  added: []
  changed: []
  removed: []
appsImpacted: []
packagesImpacted:
  - packages/werkstatt-site
successSignals:
  - dig TXT _agent.warpgogol.com returns the agent.json URL
  - isitagentready.com reports DNS-AID record present for warpgogol.com
nonGoals:
  - General DNS record management — already implemented by RFC-0753 (dns.record.upsert, dns.record.validate, dns.record.list, dns.record.delete)
  - Subdomain management for Workers — already implemented by RFC-0752
  - DNSSEC management — handled via Cloudflare Dashboard
  - DNS propagation waiting — DNS changes are asynchronous
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

# RFC-0786: Add DNS-AID record generator for agent discovery via DNS TXT records

## Context

RFC-0753 implemented a DNS record management protocol with `dns.record.upsert`, `dns.record.validate`, `dns.record.list`, and `dns.record.delete` commands. DNS records are declared in version-controlled YAML files (`systems/<id>/dns-records.yaml`) and synced to Cloudflare via the API.

The [isitagentready.com](https://isitagentready.com/warpgogol.com) audit checks for **DNS-AID** — a DNS TXT record at `_agent.<domain>` that points to the agent discovery manifest URL (`/.well-known/agent.json`). This provides a DNS-level discovery path for agents that check DNS before making HTTP requests.

Currently, no DNS-AID TXT record is declared in `dns-records.yaml`. The record could be added manually, but a generator ensures it stays in sync with the agent surface manifest and is automatically included when the agent surface is enabled.

## Problem

No DNS-AID TXT record exists in the DNS zone for warpgogol.com. Agents that use DNS-based discovery cannot find the agent surface. The record could be added manually to `dns-records.yaml`, but without a generator, the record is not automatically kept in sync with the agent surface manifest — if the manifest URL changes or the agent surface is disabled, the DNS record would become stale.

The gap is: no command generates or validates the DNS-AID TXT record declaration from the agent surface manifest.

## Decision

The kernel gains two new commands:

1. **`agent.dns-aid.generate --site <app>`** — reads the internal Agent Surface Manifest (`src/agent-surface.generated.yaml`) and writes a DNS-AID TXT record declaration fragment to `systems/<id>/dns-records.yaml` (or a separate `dns-aid.yaml` fragment that is included by the main declaration). The record is `_agent.<domain> TXT "https://<domain>/.well-known/agent.json"`.

2. **`agent.dns-aid.validate --site <app>`** — verifies that the DNS-AID TXT record declared in `dns-records.yaml` matches the agent surface manifest URL, and that the record exists in Cloudflare (via `dns.record.validate` from RFC-0753).

The generator does NOT create DNS records in Cloudflare directly — that is the job of `dns.record.upsert` (RFC-0753). The generator only produces the declaration; the operator runs `dns.record.upsert` to apply it.

## Architectural fit

- **DNA-58** (generated-file content determinism) — the DNS-AID record declaration is a generated file fragment; the generator must be idempotent, producing byte-identical output on unchanged input.
- **RFC-0028 / DNA-34** (`.well-known/` discovery, reclassified to product feature by RFC-0161) — DNS-AID is the DNS-level analogue of `.well-known/agent.json` discovery, providing an alternative discovery path for agents that check DNS first. DNA-34 is not a binding invariant; this RFC references the product feature, not the DNA.
- **RFC-0753** (DNS record management) — this RFC extends the DNS declaration file with agent-specific records. The actual DNS API operations are handled by RFC-0753 commands (`dns.record.upsert`, `dns.record.validate`).
- **RFC-0286** (agent surface) — the DNS-AID record points to the agent surface manifest URL, which is generated by `agent.manifest.generate`.
- **Site OS operator model** — `scope: app`, `supportsAllSites: true`. The generator reads the internal manifest and writes a declaration fragment. It runs in `build.prepare` after `agent.manifest.generate`.
- **Separation of concerns** — generation (this RFC) vs. application (RFC-0753). The generator produces the declaration; the operator applies it with `dns.record.upsert`.

## Design

### CLI surface

```sh
pnpm exec werkstatt run agent.dns-aid.generate --site warpgogol-com
pnpm exec werkstatt run agent.dns-aid.validate --site warpgogol-com
```

`scope: app`, `supportsAllSites: true`. No custom flags.

`agent.dns-aid.generate` runs in `build.prepare` after `agent.manifest.generate`. `agent.dns-aid.validate` runs in `build.check` after `dns.record.validate`.

### TypeScript contracts

```ts
// packages/werkstatt-site/src/domain/share/agent/dns-aid.ts

interface DnsAidRecord {
  name: string;      // "_agent.warpgogol.com"
  type: "TXT";
  content: string;   // "https://warpgogol.com/.well-known/agent.json"
  ttl: number;       // 3600
  proxied: false;
}

/**
 * Build the DNS-AID TXT record declaration from the agent surface manifest.
 * Pure function — no I/O.
 */
function buildDnsAidRecord(manifest: AgentSurfaceManifest): DnsAidRecord {
  const domain = manifest.baseUrl.replace(/^https?:\/\//, "");
  return {
    name: `_agent.${domain}`,
    type: "TXT",
    content: `${manifest.baseUrl}/.well-known/agent.json`,
    ttl: 3600,
    proxied: false,
  };
}

// dns-records.yaml fragment (appended to systems/<id>/dns-records.yaml):
// - name: _agent.warpgogol.com
//   type: TXT
//   content: "https://warpgogol.com/.well-known/agent.json"
//   ttl: 3600
//   proxied: false
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `src/agent-surface.generated.yaml` | Read — internal manifest, source of truth for agent surface URL |
| `systems/<id>/dns-records.yaml` | Written — DNS-AID TXT record declaration appended/updated |
| `packages/werkstatt-site/src/domain/share/agent/dns-aid.ts` | New module — `buildDnsAidRecord` pure function |
| `packages/werkstatt-site/src/checks/agent/agent-dns-aid.ts` | New module — generate + validate handlers |
| `packages/werkstatt-site/src/checks/command-tables/29-agent-surface.ts` | Amended — new command entries |
| `packages/werkstatt-site/src/domain/ontology/schemas/dns-records.ts` | Amended — `ttl?: number` field added to `dnsRecordDeclarationSchema` |
| `packages/werkstatt-site/src/checks/pipelines/build-prepare.ts` | Amended — `agent.dns-aid.generate` added after `agent.manifest.generate` |
| `packages/werkstatt-site/src/checks/pipelines/sites-check-author.ts` | Amended — `agent.dns-aid.validate` added alongside other agent surface validators |

### Schema extension: `ttl` field

The existing `dnsRecordDeclarationSchema` (`packages/werkstatt-site/src/domain/ontology/schemas/dns-records.ts`) does not include a `ttl` field. This RFC extends the schema to add `ttl?: number` (optional, default: zone-level TTL when omitted). This allows DNS-AID and other records to specify an explicit TTL. The field is optional to maintain backward compatibility with existing declaration files that omit TTL.

### Output format

**DNS-AID TXT record** (in `dns-records.yaml`):

```yaml
# BEGIN dns-aid
- name: _agent.warpgogol.com
  type: TXT
  content: "https://warpgogol.com/.well-known/agent.json"
  ttl: 3600
  proxied: false
# END dns-aid
```

**`agent.dns-aid.generate --json`**:

```json
{
  "command": "agent.dns-aid.generate",
  "status": "pass",
  "site": "warpgogol-com",
  "record": {
    "name": "_agent.warpgogol.com",
    "type": "TXT",
    "content": "https://warpgogol.com/.well-known/agent.json",
    "ttl": 3600,
    "proxied": false
  },
  "action": "updated"
}
```

`action` is one of `"created"` (marked section did not exist), `"updated"` (content changed), `"unchanged"` (byte-identical), `"removed"` (agent.enabled: false), `"skipped"` (agent.enabled: false, no stale section).

**`agent.dns-aid.validate --json`** (canonical Diagnostic envelope, RFC-0203):

```json
{
  "command": "agent.dns-aid.validate",
  "status": "pass",
  "diagnostics": []
}
```

**DNS lookup** (after `dns.record.upsert`):

```sh
$ dig TXT _agent.warpgogol.com

;; ANSWER SECTION:
_agent.warpgogol.com. 3600 IN TXT "https://warpgogol.com/.well-known/agent.json"
```

### Diagnostic rule IDs

`agent.dns-aid.validate` emits diagnostics with the `AGD-*` prefix:

| Rule | Severity | Meaning |
| --- | --- | --- |
| `AGD-01` | error | DNS-AID record missing from `dns-records.yaml` (no marked section or empty section). |
| `AGD-02` | error | DNS-AID record content does not match the agent surface manifest URL. |
| `AGD-03` | error | `agent.enabled: false` but DNS-AID section still exists in `dns-records.yaml`. |
| `AGD-04` | warning | DNS-AID record declared but not found in Cloudflare (advisory — run `dns.record.upsert` to apply). |

### Exit code behavior

`agent.dns-aid.validate` is **advisory** (exit 0 with diagnostics), consistent with `dns.record.validate` (RFC-0753, which exits 0 with `state: drifted` or `missing-records`). DNS-AID validation does not block deploys — the record is a discovery aid, not a functional dependency. The operator should run `dns.record.upsert` to resolve `AGD-04` warnings.

### Failure modes

- **No agent surface manifest**: `agent.dns-aid.generate` fails with exit code 1 and a message to run `agent.manifest.generate` first. Same pattern as `agent.openapi.generate`.
- **`agent.enabled: false`**: Generator skips writing the DNS-AID record and removes any stale declaration from `dns-records.yaml`. Same skip pattern as other agent surface generators.
- **DNS-AID record mismatch**: `agent.dns-aid.validate` reports `AGD-02` if the declared record's content does not match the manifest URL. Advisory (exit 0).
- **DNS-AID record not in Cloudflare**: `agent.dns-aid.validate` reports `AGD-04` (warning) that the record does not exist in Cloudflare. Advisory (exit 0). Fix hint: run `dns.record.upsert`.
- **`dns-records.yaml` has manual edits**: The generator uses text-level manipulation (line-based regex) to find and replace only the marked section (between `# BEGIN dns-aid` and `# END dns-aid` comments), preserving manual edits to other records. YAML parse + re-serialize is not used because it strips comments and loses formatting.
- **`dns-records.yaml` does not exist**: The generator creates the file with the required header (`kind`, `schemaVersion`, `zone`, `updatedAt`) and the DNS-AID marked section. The `zone` is derived from the system registry.
- **Marked section missing**: If the file exists but has no `# BEGIN dns-aid` / `# END dns-aid` markers, the generator appends the marked section at the end of the `records:` array.
- **`updatedAt` field**: The generator updates the `updatedAt` field in `dns-records.yaml` to the current date (YYYY-MM-DD) when it modifies the file.

## Rollout

- **Pipeline integration**: `agent.dns-aid.generate` runs in `build.prepare` after `agent.manifest.generate`. `agent.dns-aid.validate` runs in `build.check`.
- **Existing apps**: All apps with `agent.enabled !== false` get the DNS-AID declaration on their next `build.prepare` run. The operator must then run `dns.record.upsert --zone <domain>` to apply the declaration to Cloudflare.
- **New apps**: Onboarding scaffold includes the DNS-AID declaration in the initial `dns-records.yaml`.
- **`agent.enabled: false` apps**: Generator removes the DNS-AID declaration from `dns-records.yaml`. The operator should run `dns.record.delete` to remove the record from Cloudflare.
- **Two-step process**: The generator produces the declaration; `dns.record.upsert` (RFC-0753) applies it to Cloudflare. This separation is intentional — DNS changes are infrastructure changes that require explicit operator action, not automatic pipeline execution.

## Alternatives considered

1. **Automatic DNS record creation in the pipeline** — have `agent.dns-aid.generate` call the Cloudflare API directly instead of just writing a declaration. Rejected: DNS changes are infrastructure changes that should be explicit operator actions. The two-step process (generate declaration, then `dns.record.upsert`) follows the RFC-0753 pattern and gives the operator control.

2. **Manual addition to `dns-records.yaml`** — operators add the DNS-AID TXT record manually. Rejected: without a generator, the record can drift from the manifest URL if the domain or agent surface changes. The generator ensures sync.

3. **DNS-AID as a separate file** — a `dns-aid.yaml` fragment included by `dns-records.yaml`. Rejected: adds complexity. A marked section in the existing `dns-records.yaml` is simpler and follows the single-declaration-file pattern from RFC-0753.

## Risks

- **DNS-AID spec status**: DNS-AID is a draft proposal, not a finalized RFC. Some agents may not check for it. Mitigation: it is a single TXT record, zero maintenance burden, and harmless if ignored.
- **DNS propagation delay**: After `dns.record.upsert`, the DNS-AID record takes time to propagate (TTL: 3600s). This is inherent to DNS and not a bug.
- **`dns-records.yaml` merge conflicts**: The generator writes to a shared file. Mitigation: the generator only updates a marked section (between `# BEGIN dns-aid` and `# END dns-aid` comments), preserving manual edits to other records.
- **Concurrent execution**: `dns-records.yaml` is per-system (`systems/<id>/`), and each system maps to one zone. Concurrent `build.prepare` runs for different apps in the same system could write to the same file. Mitigation: the generator is idempotent and uses text-level section replacement — concurrent runs produce the same output. If a race condition causes a corrupt file, re-running `build.prepare` fixes it.
- **Agent misinterpretation risk**: Agents may confuse `agent.dns-aid.generate` (declaration generator, this RFC) with `dns.record.upsert` (Cloudflare API application, RFC-0753). The command namespaces are distinct (`agent.dns-aid.*` vs `dns.record.*`) and the two-step process is documented in the Rollout section.
- **Cloudflare API token permissions**: The operator needs `Zone:DNS:Edit` permission (already required by RFC-0753). No new permissions needed.

## Acceptance criteria

- [ ] `buildDnsAidRecord` pure function defined in `packages/werkstatt-site/src/domain/share/agent/dns-aid.ts`
- [ ] `agent.dns-aid.generate` registered in command table `29-agent-surface.ts`
- [ ] `agent.dns-aid.validate` registered in command table `29-agent-surface.ts`
- [ ] `agent.dns-aid.generate` integrated into `build.prepare` pipeline after `agent.manifest.generate`
- [ ] `agent.dns-aid.validate` integrated into `build.check` pipeline
- [ ] `agent.enabled: false` skip pattern works (stale declaration removed)
- [ ] Generator writes DNS-AID TXT record to `dns-records.yaml` in marked section
- [ ] Generator is idempotent — regenerating produces byte-identical output (DNA-58)
- [ ] `ttl?: number` field added to `dnsRecordDeclarationSchema` in `packages/werkstatt-site/src/domain/ontology/schemas/dns-records.ts`
- [ ] `agent.dns-aid.validate` emits `AGD-01..04` diagnostics with correct severity (error for AGD-01..03, warning for AGD-04)
- [ ] `agent.dns-aid.validate` is advisory (exit 0 with diagnostics), consistent with `dns.record.validate`
- [ ] `dig TXT _agent.warpgogol.com` returns the agent.json URL after `dns.record.upsert`
- [ ] `isitagentready.com` reports DNS-AID record present for warpgogol.com after deploy
- [ ] `rfc.validate` passes on this file before merging

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- For RFCs created on or after 2026-07-07 with acceptance probes: before stamping `implemented`, run `pnpm exec werkstatt run rfc.verification.emit --id RFC-0786` and commit the evidence file in the same commit (RFC-0330 amended transition precondition).
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0786 --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
- The generator MUST NOT call the Cloudflare API directly — it only writes the declaration. The operator runs `dns.record.upsert` (RFC-0753) to apply it.
- The marked section in `dns-records.yaml` MUST use `# BEGIN dns-aid` and `# END dns-aid` comment markers so the generator can update only that section.
- The `buildDnsAidRecord` function MUST be a pure function — no I/O, no side effects (DNA-58).
- The DNS-AID record name is `_agent.<domain>` (with leading underscore), following the DNS-AID convention.
