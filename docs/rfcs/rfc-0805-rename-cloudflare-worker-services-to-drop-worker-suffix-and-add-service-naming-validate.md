---
id: RFC-0805
title: "Rename Cloudflare Worker services to drop -worker suffix and add service.naming.validate"
status: draft
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
reviewers: []
createdAt: 2026-08-11
updatedAt: 2026-08-11
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - DNA-6
  - DNA-40
  - RFC-0186
  - RFC-0744
  - ADR-0042
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-6
  - DNA-40
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
    - service.naming.validate
  added:
    - service.naming.validate
  changed: []
  removed: []
appsImpacted: []
packagesImpacted:
  - "@warpgogol/werkstatt"
  - "@warpgogol/werkstatt-site"
successSignals:
  - "services/* directories have no -worker suffix"
  - "wrangler.jsonc name fields have no -worker suffix"
  - "package.json name fields have no -worker suffix"
  - "services/registry.yaml id/workerName/url fields have no -worker suffix"
nonGoals:
  - "Renaming non-Worker services (check-warpgogol-runner)"
  - "Renaming Cloudflare account-level configuration"
  - "Changing Worker runtime behavior or code logic"
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

# RFC-0805: Rename Cloudflare Worker services to drop -worker suffix and add service.naming.validate

## Context

Three Cloudflare Worker services in `services/*` carry a redundant `-worker` suffix in their directory names, `package.json` names, `wrangler.jsonc` names, and `services/registry.yaml` entries:

| Current name            | Target name      |
| ----------------------- | ---------------- |
| `lagebild-sync-worker`  | `lagebild-sync`  |
| `maturity-score-worker` | `maturity-score` |
| `rate-fetcher-worker`   | `rate-fetcher`   |

The `-worker` suffix is redundant: all entries in `services/*` are services, and the `kind` field in `service.config.yaml` already distinguishes Cloudflare Workers (`scheduled-worker`, `cloudflare-worker`, `proxy-worker`) from Node runners. The suffix adds visual noise without semantic value.

DNA-6 (kebab-case filenames) and DNA-40 (env-and-deploy contract) govern naming and deploy configuration for `services/*`. Neither currently enforces a prohibition on the `-worker` suffix. There is no validator that checks service naming conventions across the directory, `package.json`, `wrangler.jsonc`, and `registry.yaml`.

## Problem

There is no automated check preventing the `-worker` suffix from appearing in service names. The suffix is present in four locations that must be kept in sync manually:

1. **Directory name** — `services/lagebild-sync-worker/`, `services/maturity-score-worker/`, `services/rate-fetcher-worker/`
2. **`package.json` `name`** — `@warpgogol/lagebild-sync-worker`, `@warpgogol/maturity-score-worker`, `@warpgogol/rate-fetcher-worker`
3. **`wrangler.jsonc` `name`** — the Cloudflare Worker script name (determines the deployed Worker name and `*.workers.dev` subdomain)
4. **`services/registry.yaml`** — `id`, `workerName`, and `url` fields all contain the `-worker` suffix

Hardcoded references to the old names exist in `packages/werkstatt/src/kernel/lagebild/handlers.ts` (directory path, deploy command argument) and `packages/werkstatt/src/kernel/lagebild/env.ts` (env file path). Without a validator, a future service could be created with the `-worker` suffix again.

## Decision

The three Cloudflare Worker services are renamed to drop the `-worker` suffix: `lagebild-sync-worker` → `lagebild-sync`, `maturity-score-worker` → `maturity-score`, `rate-fetcher-worker` → `rate-fetcher`. The rename covers directory names, `package.json` `name` fields, `wrangler.jsonc` `name` fields, `services/registry.yaml` entries, and all hardcoded references in `packages/*`.

A new `service.naming.validate` command is introduced. It scans every `services/*/` directory and rejects any service whose name (directory, `package.json` `name`, `wrangler.jsonc` `name` when present, or `services/registry.yaml` `id`/`workerName`/`url`) ends with the suffix `-worker`. The command is registered in the `services.check.run` pipeline.

## Architectural fit

- **DNA-6 (kebab-case filenames)** — extends naming convention enforcement to `services/*` directories, prohibiting the `-worker` suffix.
- **DNA-40 (env-and-deploy contract)** — the rename touches `wrangler.jsonc` names and deploy scripts; the env-and-deploy contract remains intact, only the service identity changes.
- **Site OS operator model** — `service.naming.validate` is a workspace-scope command registered in `services.check.run`, consistent with other service validators.
- **Scaling Playbook** — applies uniformly: any future service in `services/*` is automatically checked.

## Design

### CLI surface

```sh
pnpm exec werkstatt run service.naming.validate
pnpm exec werkstatt run service.naming.validate --json
```

Workspace-scope command, no `--service` flag. Scans all `services/*/` directories.

### TypeScript contracts

```ts
interface ServiceNamingViolation {
  service: string;       // directory name (e.g. "lagebild-sync")
  field: "directory" | "package.json:name" | "wrangler.jsonc:name" | "registry:id" | "registry:workerName" | "registry:url";
  value: string;         // the offending value
  message: string;       // human-readable explanation
}

interface ServiceNamingValidateResult {
  command: "service.naming.validate";
  status: "pass" | "fail";
  violations: ServiceNamingViolation[];
}
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `services/*/` | Scanned: directory name checked for `-worker` suffix |
| `services/*/package.json` | `name` field checked for `-worker` suffix |
| `services/*/wrangler.jsonc` | `name` field checked (when file exists) |
| `services/registry.yaml` | `id`, `workerName`, `url` fields checked for `-worker` suffix |
| `packages/werkstatt/src/kernel/lagebild/handlers.ts` | Hardcoded `"lagebild-sync-worker"` references updated to `"lagebild-sync"` |
| `packages/werkstatt/src/kernel/lagebild/env.ts` | `services/lagebild-sync-worker/.env` path updated to `services/lagebild-sync/.env` |
| `packages/werkstatt-site/src/checks/lagebild.ts` | `services/lagebild-sync-worker` path updated |
| `packages/werkstatt-site/src/checks/env/env-example.ts` | Comment reference updated |
| `packages/werkstatt-site/src/checks/test-signal.ts` | Regex pattern updated |
| `packages/werkstatt-site/src/checks/command-tables/infra-contracts.ts` | Description text updated |
| `packages/werkstatt-site/src/domain/integration/crm-buffer.ts` | Comment reference updated |
| `packages/werkstatt-site/src/domain/pbp-rate-adapters/adapters/ecb.ts` | Comment reference updated |
| `packages/werkstatt-site/src/domain/pbp-rate-adapters/adapters/frankfurter.ts` | Comment reference updated |
| `services/AGENTS.md` | Service references updated |

### Output format

```json
{
  "command": "service.naming.validate",
  "status": "fail",
  "violations": [
    {
      "service": "lagebild-sync-worker",
      "field": "directory",
      "value": "lagebild-sync-worker",
      "message": "Service directory name must not end with '-worker' suffix"
    }
  ]
}
```

### Failure modes

- **Directory name ends with `-worker`** — hard fail (SN-01).
- **`package.json` `name` ends with `-worker`** — hard fail (SN-02).
- **`wrangler.jsonc` `name` ends with `-worker`** — hard fail (SN-03). Skipped when `wrangler.jsonc` does not exist (non-Worker services like `check-warpgogol-runner`).
- **`registry.yaml` `id` ends with `-worker`** — hard fail (SN-04).
- **`registry.yaml` `workerName` ends with `-worker`** — hard fail (SN-05).
- **`registry.yaml` `url` contains `-worker` before `.workers.dev`** — hard fail (SN-06).
- **`registry.yaml` entry missing for a `services/*` directory** — warning (SN-07), not a hard fail (the registry may not list all services).
- All violations are reported in a single pass; the command exits with code 1 when any hard-fail violation exists.

## Rollout

### Phase 1: Rename directories and update references

1. `git mv services/lagebild-sync-worker services/lagebild-sync`
2. `git mv services/maturity-score-worker services/maturity-score`
3. `git mv services/rate-fetcher-worker services/rate-fetcher`
4. Update `package.json` `name` in each renamed service: `@warpgogol/lagebild-sync-worker` → `@warpgogol/lagebild-sync`, etc.
5. Update `wrangler.jsonc` `name` in each: `lagebild-sync-worker` → `lagebild-sync`, etc.
6. Update `services/registry.yaml` entries (`id`, `workerName`, `url`).
7. Update all hardcoded references in `packages/*` (handlers, env paths, checks, comments).
8. Update `services/AGENTS.md` service descriptions.
9. Run `pnpm install` to refresh workspace symlinks.

### Phase 2: Deploy new Workers and delete old ones

1. Deploy each renamed Worker: `cd services/<new-name> && npx wrangler deploy --secrets-file .env`
2. Verify new Workers are live (check `*.workers.dev` URLs).
3. Delete old Workers from Cloudflare: `npx wrangler delete --name lagebild-sync-worker` (and same for the other two).
4. Update any external references (Cloudflare Dashboard, monitoring, etc.).

### Phase 3: Register and run validator

1. Implement `service.naming.validate` in `packages/werkstatt-site/src/checks/`.
2. Register in `services.check.run` pipeline.
3. Run `pnpm exec werkstatt run service.naming.validate` — must pass with zero violations.

### Pipeline integration

`service.naming.validate` runs as part of `services.check.run`, which is the standard pipeline for service workspace changes. It is a hard-fail validator: any `-worker` suffix violation blocks the pipeline.

## Alternatives considered

- **Keep `-worker` suffix, no validator** — rejected. The suffix is redundant noise, and without a validator, naming drift will recur.
- **Rename only, no validator** — rejected. Without automated enforcement, a future service could reintroduce the suffix.
- **Validator only, no rename** — rejected. The rename is the motivating change; the validator prevents regression.
- **Whitelist `check-warpgogol-runner`** — rejected. `check-warpgogol-runner` does not end with `-worker`, so it passes automatically. No whitelist is needed.

## Risks

- **Cloudflare Worker name change creates new Workers** — the renamed Workers get new `*.workers.dev` subdomains. Old Workers must be manually deleted after the new ones are verified. The RFC includes this as a rollout step, but it is an operational task outside the codebase.
- **Hardcoded path references** — multiple files in `packages/*` hardcode the old directory names. Missing one would break the Lagebild deploy handler or env resolution. The Design section lists all known references; implementation must verify with `grep`.
- **`pnpm-lock.yaml` churn** — renaming `package.json` `name` fields regenerates the lockfile. This is expected and non-blocking.
- **False positive rate** — the validator only checks for the exact suffix `-worker`. Service names like `check-warpgogol-runner` are unaffected. No false positives expected.
- **Agent misinterpretation** — agents might think the validator checks all naming conventions (kebab-case, etc.). It only checks the `-worker` suffix. DNA-6 (kebab-case) is enforced by `naming.convention.lint`.

## Acceptance criteria

- [ ] `services/lagebild-sync-worker/` directory renamed to `services/lagebild-sync/` (evidence: `ls services/lagebild-sync/`)
- [ ] `services/maturity-score-worker/` directory renamed to `services/maturity-score/` (evidence: `ls services/maturity-score/`)
- [ ] `services/rate-fetcher-worker/` directory renamed to `services/rate-fetcher/` (evidence: `ls services/rate-fetcher/`)
- [ ] `package.json` `name` fields updated in all three renamed services (evidence: `grep -r 'lagebild-sync\|maturity-score\|rate-fetcher' services/*/package.json`)
- [ ] `wrangler.jsonc` `name` fields updated in all three renamed services (evidence: `grep -r '"name"' services/*/wrangler.jsonc`)
- [ ] `services/registry.yaml` `id`, `workerName`, `url` fields updated (evidence: `grep -v 'worker' services/registry.yaml | grep -E 'id:|workerName:|url:'`)
- [ ] All hardcoded references in `packages/*` updated (evidence: `grep -rn 'lagebild-sync-worker\|maturity-score-worker\|rate-fetcher-worker' packages/` returns zero results)
- [ ] `service.naming.validate` command implemented and registered (evidence: `pnpm exec werkstatt run service.naming.validate --json` exits 0)
- [ ] `service.naming.validate` integrated into `services.check.run` pipeline (evidence: `grep service.naming.validate packages/werkstatt-site/src/checks/`)
- [ ] Old Cloudflare Workers deleted after new ones deployed (evidence: `npx wrangler deployments list --name lagebild-sync` succeeds, `--name lagebild-sync-worker` fails with 404)
- [ ] `rfc.validate` passes on this file before merging

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0805 --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
- The rename MUST be done atomically: `git mv` directories, update all references, and run `pnpm install` in a single commit batch. Splitting the rename across commits leaves the workspace in a broken state.
- After renaming, run `grep -rn 'lagebild-sync-worker\|maturity-score-worker\|rate-fetcher-worker' packages/ services/` to verify zero remaining references (excluding this RFC file and archived docs).
- The old Cloudflare Workers (`lagebild-sync-worker`, `maturity-score-worker`, `rate-fetcher-worker`) MUST be deleted after the new Workers are deployed and verified. This is a manual operational step.
