---
id: RFC-0805
title: "Rename services to drop redundant suffixes and add service.naming.validate"
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
createdAt: 2026-08-11
updatedAt: 2026-08-11
enhancedAt: 2026-08-11
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends:
  - RFC-0751
amendedBy: []
related:
  - DNA-6
  - DNA-40
  - RFC-0186
  - RFC-0744
  - RFC-0751
  - ADR-0042
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
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
  proposed: []
  added: []
  changed:
    - service.naming.validate
  removed: []
appsImpacted: []
packagesImpacted:
  - "@warpgogol/werkstatt"
  - "@warpgogol/werkstatt-site"
successSignals:
  - "services/* directories have no -worker suffix"
  - "services/* directories have no -warpgogol infix"
  - "wrangler.jsonc name fields have no -worker suffix"
  - "package.json name fields have no -worker suffix"
  - "services/registry.yaml id/workerName/url fields have no -worker suffix"
nonGoals:
  - "Renaming services that don't have a redundant suffix (cf-analytics-poller, fleet-probe-runner, matomo-proxy, observability-stack, telegram-alert-bridge)"
  - "Renaming Cloudflare account-level configuration"
  - "Changing Worker runtime behavior or code logic"
  - "Extending DNA-6 to cover services/ — DNA-6 scope is apps/ and packages/ only; the -worker suffix prohibition is a service-specific convention enforced by service.naming.validate, not a DNA invariant"
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

# RFC-0805: Rename services to drop redundant suffixes and add service.naming.validate

## Context

Four services in `services/*` carry redundant suffixes in their directory names and identity fields:

| Current name             | Target name      | Suffix dropped |
| ------------------------ | ---------------- | -------------- |
| `lagebild-sync-worker`   | `lagebild-sync`  | `-worker`      |
| `maturity-score-worker`  | `maturity-score` | `-worker`      |
| `rate-fetcher-worker`    | `rate-fetcher`   | `-worker`      |
| `check-warpgogol-runner` | `check-runner`   | `-warpgogol`   |

The `-worker` suffix is redundant: all entries in `services/*` are services, and the `kind` field in `service.config.yaml` already distinguishes Cloudflare Workers (`scheduled-worker`, `cloudflare-worker`, `proxy-worker`) from Node runners. The `-warpgogol` infix in `check-warpgogol-runner` is redundant: the service is already in the `services/*` namespace and its `ownerApp: check-warpgogol-com` field identifies the owning app. Both suffixes add visual noise without semantic value.

DNA-6 (kebab-case filenames) and DNA-40 (env-and-deploy contract) govern naming and deploy configuration for `services/*`. Neither currently enforces a prohibition on the `-worker` suffix. There is no validator that checks service naming conventions across the directory, `package.json`, `wrangler.jsonc`, and `registry.yaml`.

## Problem

There is no automated check preventing the `-worker` suffix from appearing in service names. The suffix is present in four locations that must be kept in sync manually:

1. **Directory name** — `services/lagebild-sync-worker/`, `services/maturity-score-worker/`, `services/rate-fetcher-worker/`
2. **`package.json` `name`** — `@warpgogol/lagebild-sync-worker`, `@warpgogol/maturity-score-worker`, `@warpgogol/rate-fetcher-worker`
3. **`wrangler.jsonc` `name`** — the Cloudflare Worker script name (determines the deployed Worker name and `*.workers.dev` subdomain)
4. **`services/registry.yaml`** — `id`, `workerName`, and `url` fields all contain the `-worker` suffix

Hardcoded references to the old names exist in `packages/werkstatt/src/kernel/lagebild/handlers.ts` (directory path, deploy command argument), `packages/werkstatt/src/kernel/lagebild/env.ts` (env file path), and `packages/werkstatt-site/src/checks/check-warpgogol/commands/services.ts` (validation paths). Without a validator, a future service could be created with a redundant suffix again.

## Decision

The four services are renamed to drop their redundant suffixes: `lagebild-sync-worker` → `lagebild-sync`, `maturity-score-worker` → `maturity-score`, `rate-fetcher-worker` → `rate-fetcher`, `check-warpgogol-runner` → `check-runner`. The rename covers directory names, `package.json` `name` fields, `wrangler.jsonc` `name` fields (where applicable), `service.config.yaml` `id` fields, and all hardcoded references in `packages/*`.

The existing `service.naming.validate` command (established by RFC-0751) is extended with a new rule: it rejects any service whose `id` in `services/registry.yaml` ends with the suffix `-worker`. Since the existing validator already enforces `workerName === id`, `wrangler.jsonc name === id`, `service.config.yaml id === id`, and `package.json name === id`, checking the registry `id` for the `-worker` suffix transitively covers all derived fields. The command is already registered in the `services.check.run` pipeline (RFC-0751).

RFC-0751 intentionally named these services WITH the `-worker` suffix (renaming `gogol-rate-fetcher` → `rate-fetcher-worker`, `gogol-lagebild-sync` → `lagebild-sync-worker`). This RFC amends RFC-0751: the `-worker` suffix is now considered redundant because the `kind` field in `service.config.yaml` already distinguishes Cloudflare Workers (`scheduled-worker`, `cloudflare-worker`, `proxy-worker`) from Node runners.

## Architectural fit

- **DNA-6 (kebab-case filenames)** — DNA-6 covers `apps/` and `packages/` only, not `services/`. The `-worker` suffix prohibition is a service-specific convention enforced by `service.naming.validate`, not a DNA-6 extension.
- **DNA-40 (env-and-deploy contract)** — the rename touches `wrangler.jsonc` names and deploy scripts; the env-and-deploy contract remains intact, only the service identity changes.
- **Site OS operator model** — `service.naming.validate` is a workspace-scope command registered in `services.check.run` (by RFC-0751), consistent with other service validators.
- **Scaling Playbook** — applies uniformly: any future service registered in `services/registry.yaml` is automatically checked.

## Design

### CLI surface

```sh
pnpm exec werkstatt run service.naming.validate
pnpm exec werkstatt run service.naming.validate --json
```

Workspace-scope command, no `--service` flag. Scans all entries in `services/registry.yaml`.

### TypeScript contracts

The existing `service.naming.validate` returns `KernelCommandResult<CheckResult>` with `Diagnostic[]` (RFC-0751). The new rule follows the same pattern:

```ts
// New diagnostic emitted by the existing validator
{
  ruleId: "SVC-NAME-06",
  severity: "error",
  file: "services/registry.yaml",
  message: "Service '<id>': id must not end with '-worker' suffix. Rename to '<id-without-suffix>'."
}
```

No new TypeScript interfaces are introduced — the existing `CheckResult` + `Diagnostic[]` pattern is reused.

### File system responsibilities

| Path | Role |
| --- | --- |
| `services/registry.yaml` | `id`, `workerName`, `url` fields updated for all renamed Cloudflare Worker services |
| `services/lagebild-sync-worker/` | `git mv` to `services/lagebild-sync/` |
| `services/lagebild-sync/package.json` | `name` field updated: `@warpgogol/lagebild-sync-worker` → `@warpgogol/lagebild-sync` |
| `services/lagebild-sync/wrangler.jsonc` | `name` field updated: `lagebild-sync-worker` → `lagebild-sync` |
| `services/lagebild-sync/service.config.yaml` | `id` field updated: `lagebild-sync-worker` → `lagebild-sync` |
| `services/lagebild-sync/AGENTS.md` | Service name references updated (deploy script, title, description) |
| `services/maturity-score-worker/` | `git mv` to `services/maturity-score/` |
| `services/maturity-score/package.json` | `name` field updated |
| `services/maturity-score/wrangler.jsonc` | `name` field updated |
| `services/maturity-score/service.config.yaml` | `id` field updated |
| `services/maturity-score/AGENTS.md` | Service name references updated |
| `services/maturity-score/README.md` | Service name references updated |
| `services/rate-fetcher-worker/` | `git mv` to `services/rate-fetcher/` |
| `services/rate-fetcher/package.json` | `name` field updated |
| `services/rate-fetcher/wrangler.jsonc` | `name` field updated |
| `services/rate-fetcher/service.config.yaml` | `id` field updated |
| `services/check-warpgogol-runner/` | `git mv` to `services/check-runner/` |
| `services/check-runner/package.json` | `name` field updated: `check-warpgogol-runner` → `check-runner` |
| `services/check-runner/service.config.yaml` | `id` field updated: `check-warpgogol-runner` → `check-runner` |
| `services/check-runner/AGENTS.md` | Service name references updated |
| `services/check-runner/README.md` | Service name references updated |
| `packages/werkstatt/src/kernel/lagebild/handlers.ts` | Hardcoded `"lagebild-sync-worker"` references updated to `"lagebild-sync"` |
| `packages/werkstatt/src/kernel/lagebild/env.ts` | `services/lagebild-sync-worker/.env` path updated to `services/lagebild-sync/.env` |
| `packages/werkstatt-site/src/checks/lagebild.ts` | `services/lagebild-sync-worker` path updated |
| `packages/werkstatt-site/src/checks/env/env-example.ts` | Comment reference updated |
| `packages/werkstatt-site/src/checks/test-signal.ts` | Regex pattern updated |
| `packages/werkstatt-site/src/checks/command-tables/infra-contracts.ts` | Description text updated |
| `packages/werkstatt-site/src/domain/integration/crm-buffer.ts` | Comment reference updated |
| `packages/werkstatt-site/src/domain/pbp-rate-adapters/adapters/ecb.ts` | Comment reference updated |
| `packages/werkstatt-site/src/domain/pbp-rate-adapters/adapters/frankfurter.ts` | Comment reference updated |
| `packages/werkstatt-site/src/checks/check-warpgogol/commands/services.ts` | Validation paths updated from `services/check-warpgogol-runner/` to `services/check-runner/` |
| `packages/werkstatt-site/src/checks/command-tables/30-check-warpgogol.ts` | `reads` glob path updated |
| `services/AGENTS.md` | Service references updated |
| `pnpm-lock.yaml` | Regenerated by `pnpm install` after package.json name changes |

### Output format

```json
{
  "command": "service.naming.validate",
  "status": "fail",
  "diagnostics": [
    {
      "ruleId": "SVC-NAME-06",
      "severity": "error",
      "file": "services/registry.yaml",
      "message": "Service 'lagebild-sync-worker': id must not end with '-worker' suffix. Rename to 'lagebild-sync'."
    }
  ],
  "summary": { "error": 1, "warning": 0, "info": 0 }
}
```

### Failure modes

- **`registry.yaml` `id` ends with `-worker`** — hard fail (SVC-NAME-06). This is the new rule added by this RFC. Since the existing validator (RFC-0751) already enforces `workerName === id`, `wrangler.jsonc name === id`, `service.config.yaml id === id`, and `package.json name === id`, checking the registry `id` for the suffix transitively covers all derived fields.
- Existing rules from RFC-0751 remain: SVC-NAME-01 (workerName = id), SVC-NAME-02 (wrangler name = id), SVC-NAME-03 (config id = id), SVC-NAME-04 (package.json name = id), SVC-NAME-05 (directory exists).
- All violations are reported in a single pass; the command exits with code 1 when any hard-fail violation exists.

## Rollout

### Phase 1: Rename directories and update references

1. `git mv services/lagebild-sync-worker services/lagebild-sync`
2. `git mv services/maturity-score-worker services/maturity-score`
3. `git mv services/rate-fetcher-worker services/rate-fetcher`
4. `git mv services/check-warpgogol-runner services/check-runner`
5. Update `package.json` `name` in each renamed service.
6. Update `wrangler.jsonc` `name` in each Cloudflare Worker service.
7. Update `service.config.yaml` `id` in each renamed service.
8. Update `services/registry.yaml` entries (`id`, `workerName`, `url`) for Cloudflare Worker services.
9. Update all hardcoded references in `packages/*` (handlers, env paths, checks, comments, validation paths).
10. Update `services/AGENTS.md` service descriptions.
11. Run `pnpm install` to refresh workspace symlinks.

### Phase 2: Deploy new Workers and delete old ones

1. Deploy each renamed Worker: `cd services/<new-name> && npx wrangler deploy --secrets-file .env`
2. Verify new Workers are live (check `*.workers.dev` URLs).
3. Delete old Workers from Cloudflare: `npx wrangler delete --name lagebild-sync-worker` (and same for the other two).
4. Update any external references (Cloudflare Dashboard, monitoring, etc.).

### Phase 3: Extend validator with suffix rule

1. Add SVC-NAME-06 rule to the existing `service.naming.validate` in `packages/werkstatt-site/src/checks/services/service-naming-validate.ts`.
2. The command is already registered in `services.check.run` pipeline (RFC-0751) — no new registration needed.
3. Run `pnpm exec werkstatt run service.naming.validate` — must pass with zero violations.

### Pipeline integration

`service.naming.validate` already runs as part of `services.check.run` (integrated by RFC-0751). The new SVC-NAME-06 rule is automatically included — no additional pipeline registration is needed.

## Alternatives considered

- **Keep `-worker` suffix, no validator** — rejected. The suffix is redundant noise, and without a validator, naming drift will recur.
- **Rename only, no validator** — rejected. Without automated enforcement, a future service could reintroduce the suffix.
- **Validator only, no rename** — rejected. The rename is the motivating change; the validator prevents regression.
- **Whitelist `check-warpgogol-runner`** — rejected. `check-warpgogol-runner` does not end with `-worker`, so it passes the SVC-NAME-06 rule automatically. The `-warpgogol` infix removal is a separate naming concern, not a validator whitelist issue.

## Risks

- **Cloudflare Worker name change creates new Workers** — the renamed Workers get new `*.workers.dev` subdomains. Old Workers must be manually deleted after the new ones are verified. The RFC includes this as a rollout step, but it is an operational task outside the codebase.
- **Hardcoded path references** — multiple files in `packages/*` hardcode the old directory names. Missing one would break the Lagebild deploy handler or env resolution. The Design section lists all known references; implementation must verify with `grep`.
- **`pnpm-lock.yaml` churn** — renaming `package.json` `name` fields regenerates the lockfile. This is expected and non-blocking.
- **False positive rate** — the validator only checks for the exact suffix `-worker`. Service names like `cf-analytics-poller` are unaffected. No false positives expected.
- **Agent misinterpretation** — agents might think the validator checks all naming conventions (kebab-case, etc.). It only checks the `-worker` suffix. DNA-6 (kebab-case) is enforced by `naming.convention.lint`.

## Acceptance criteria

- [x] `services/lagebild-sync-worker/` directory renamed to `services/lagebild-sync/` (evidence: `ls services/lagebild-sync/`)
- [x] `services/maturity-score-worker/` directory renamed to `services/maturity-score/` (evidence: `ls services/maturity-score/`)
- [x] `services/rate-fetcher-worker/` directory renamed to `services/rate-fetcher/` (evidence: `ls services/rate-fetcher/`)
- [x] `services/check-warpgogol-runner/` directory renamed to `services/check-runner/` (evidence: `ls services/check-runner/`)
- [x] `package.json` `name` fields updated in all renamed services (evidence: `grep -r 'lagebild-sync\|maturity-score\|rate-fetcher\|check-runner' services/*/package.json`)
- [x] `wrangler.jsonc` `name` fields updated in all renamed Cloudflare Worker services (evidence: `grep -r '"name"' services/*/wrangler.jsonc`)
- [x] `services/registry.yaml` `id`, `workerName`, `url` fields updated (evidence: `grep -v 'worker' services/registry.yaml | grep -E 'id:|workerName:|url:'`)
- [x] All hardcoded references in `packages/*` updated (evidence: `grep -rn 'lagebild-sync-worker\|maturity-score-worker\|rate-fetcher-worker\|check-warpgogol-runner' packages/` returns zero results)
- [x] SVC-NAME-06 rule added to existing `service.naming.validate` (evidence: `grep SVC-NAME-06 packages/werkstatt-site/src/checks/services/service-naming-validate.ts`)
- [x] `service.naming.validate` passes with zero violations after rename (evidence: `pnpm exec werkstatt run service.naming.validate --json` exits 0)
- [x] Old Cloudflare Workers deleted after new ones deployed (evidence: operator confirmed deletion via Cloudflare Dashboard)
- [x] `rfc.validate` passes on this file before merging (evidence: `pnpm exec werkstatt run rfc.validate --id RFC-0805 --json` exits 0)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it (RFC-0334).
- The `services/lagebild-sync-worker/AGENTS.md` deploy script uses the old CLI name `site-kernel` (pre-existing issue from RFC-0776). The rename updates the service name part (`--service lagebild-sync`) but the `site-kernel` → `werkstatt` CLI rename is a separate pre-existing issue.
- If implementation reveals an invariant conflict, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0805 --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
- The rename MUST be done atomically: `git mv` directories, update all references, and run `pnpm install` in a single commit batch. Splitting the rename across commits leaves the workspace in a broken state.
- After renaming, run `grep -rn 'lagebild-sync-worker\|maturity-score-worker\|rate-fetcher-worker' packages/ services/` to verify zero remaining references (excluding this RFC file and archived docs).
- The old Cloudflare Workers (`lagebild-sync-worker`, `maturity-score-worker`, `rate-fetcher-worker`) MUST be deleted after the new Workers are deployed and verified. This is a manual operational step.
