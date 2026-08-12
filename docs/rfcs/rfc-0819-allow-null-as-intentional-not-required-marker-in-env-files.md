---
id: RFC-0819
title: "Allow null as intentional not-required marker in env files"
status: implemented
# kind options: architecture | contract | command | policy | deprecation
kind: policy
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
createdAt: 2026-08-12
updatedAt: 2026-08-12
enhancedAt: 2026-08-12
implementedAt: 2026-08-12
closedAt:
supersedes: []
supersededBy:
amends:
  - RFC-0388
amendedBy: []
related:
  - DNA-40
  - RFC-0388
  - RFC-0761
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies: []
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
    - deploy.preflight
  removed: []
appsImpacted: []
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - "@warpgogol/werkstatt-site"
successSignals:
  - "deploy.preflight DEPLOY-PREFLIGHT-04 error message for empty values suggests using null for not-required variables."
  - "Operators can set KEY=null in .env for variables they do not need, and deploy.preflight accepts it without error."
  - ".env.example files remain unchanged — all values stay empty, null is not used in example files."
  - "The null convention is documented in docs/policies/agent-surface-ops.md and root .env.example header comment."
nonGoals:
  - "Does not change .env.example validation rules — ENV-CONTRACT-04 still requires empty values in example files."
  - "Does not introduce runtime normalization of the string \"null\" in getEnv or process.env access patterns."
  - "Does not add a new standalone validator command — the convention is enforced via deploy.preflight error messaging."
  - "Does not mandate that all .env files use null for every not-required variable — operators may still fill real values where needed."
  - "Does not change env.example.generate output — the generator continues producing empty values."
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

# RFC-0819: Allow null as intentional not-required marker in env files

## Context

RFC-0388 established the env-file standard and `deploy.preflight` gate for all env-consuming systems, services, and root. The contract requires every key from `.env.example` to be present in `.env` with a non-empty value before deploy. This prevents deploying with missing secrets.

However, not every variable listed in `.env.example` is required for every site or service. For example, `WARPGOGOL_OTLP_TOKEN` is relevant only when OTLP observability is enabled; `STRIPE_SECRET_KEY` is relevant only when the site participates in entitlements. When an operator does not need a variable, they currently have no documented way to signal "intentionally not configured" — they must either leave the value empty (which `deploy.preflight` rejects) or fill a placeholder value that could be mistaken for a real secret.

## Problem

`deploy.preflight` (DEPLOY-PREFLIGHT-04) rejects empty values in `.env` but provides no guidance on what to do when a variable is genuinely not required. Operators face two bad options:

1. **Leave the value empty** — `deploy.preflight` fails with a generic "empty value" error, blocking deploy.
2. **Fill a fake placeholder** (e.g. `KEY=not-used`) — `deploy.preflight` passes, but the fake value may leak into runtime code that does not guard against it, causing confusing errors.

There is no documented convention for marking a variable as "present but intentionally not configured." The `deploy.preflight` error message (`fixHint: "Fill in the value for ${key} in ${targetLabel}."`) does not mention `null` as an alternative, so operators do not discover the pattern.

## Decision

The `null` string value is the standard marker for "variable listed but intentionally not configured" in `.env` files. `deploy.preflight` accepts `null` as a valid non-empty value (it already does — `null` has length 4, not 0). The DEPLOY-PREFLIGHT-04 error message for empty values is updated to suggest `null` for not-required variables.

## Architectural fit

- **DNA-40** (env-file standard): this RFC extends the env contract established by RFC-0388 with a documented convention for not-required variables. It does not change the DNA invariant itself — it adds a usage pattern within the existing contract.
- **RFC-0388**: amended — DEPLOY-PREFLIGHT-04 error message gains a `null` suggestion. No validation logic changes.
- **RFC-0761**: aligned — `deploy.preflight` remains the single pre-deploy gate; no new command is introduced.
- **Site OS operator model**: the change is scoped to `deploy.preflight` in `packages/werkstatt-site/src/checks/env/deploy-preflight.ts`. No new command, no new pipeline step.

## Design

### CLI surface

No new command. The existing `deploy.preflight` command is unchanged in its CLI surface:

```sh
pnpm exec werkstatt run deploy.preflight --site warpgogol-com
pnpm exec werkstatt run deploy.preflight --service lagebild-sync
pnpm exec werkstatt run deploy.preflight --service cf-analytics-poller --dev
```

The only change is the `fixHint` text in the DEPLOY-PREFLIGHT-04 diagnostic when an empty value is found.

### TypeScript contracts

No new types. The change is a single string update in `deploy-preflight.ts`:

```ts
// Before (line ~186):
fixHint: `Fill in the value for ${key} in ${targetLabel}.`,

// After:
fixHint: `Fill in the value for ${key} in ${targetLabel}, or set it to null if this variable is not required for this deployment.`,
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/werkstatt-site/src/checks/env/deploy-preflight.ts` | DEPLOY-PREFLIGHT-04 fixHint text updated |
| `docs/policies/agent-surface-ops.md` | Convention documented in the Env-and-deploy contract section |
| `AGENTS.md` | One-line pointer added to the env-and-deploy reference (line ~252) |
| `.env.example` (root) | Header comment updated to mention the null convention |

### Output format

No change to `--json` output shape. The `fixHint` field in DEPLOY-PREFLIGHT-04 diagnostics now includes the `null` suggestion:

```json
{
  "ruleId": "DEPLOY-PREFLIGHT-04",
  "severity": "error",
  "file": "warpgogol-com/.env",
  "message": "Key \"WARPGOGOL_OTLP_TOKEN\" has an empty value in warpgogol-com/.env.",
  "fixHint": "Fill in the value for WARPGOGOL_OTLP_TOKEN in warpgogol-com/.env, or set it to null if this variable is not required for this deployment."
}
```

### Failure modes

No new failure modes. `deploy.preflight` continues to:

- Reject empty values (DEPLOY-PREFLIGHT-04) — now with improved guidance.
- Accept `null` as a valid non-empty value — this already works today (`null`.length === 4, not 0).
- Reject missing keys (DEPLOY-PREFLIGHT-02) and extra keys (DEPLOY-PREFLIGHT-03) — unchanged.

## Rollout

- **No migration required**: `null` already passes `deploy.preflight` today. Operators can start using `null` immediately.
- **Error message update**: the improved `fixHint` is deployed in the next platform version. No flag day.
- **Documentation**: AGENTS.md and root `.env.example` header comment are updated to document the convention.
- **No pipeline changes**: `deploy.preflight` runs where it already runs (pre-deploy gate, `leitstand.dev-deploy`, `leitstand.service.dev-deploy`). No new pipeline integration needed.

## Alternatives considered

1. **New standalone validator `env.null.convention.validate`** — rejected. The convention is already enforced by `deploy.preflight` (empty values are rejected, `null` is accepted). A separate validator would duplicate the check without adding value. The problem is discoverability, not enforcement — solved by updating the error message.

2. **Allow `null` in `.env.example` too** — rejected by the operator. `.env.example` is a template with empty values; `null` in the template would imply the variable is not required for any deployment, which is site-specific. The `null` marker belongs in `.env` only, where the operator makes the deployment-specific decision.

3. **Runtime normalization of `"null"` → `undefined` in `getEnv`** — rejected by the operator. Services that read `process.env` directly or via `getEnv` handle absent values themselves. Normalizing `"null"` in a helper would create an implicit contract that not all code paths follow. The convention is file-level, not runtime-level.

4. **Comment-based marker (e.g. `# optional` in the comment block)** — rejected. Comments are stripped by `wrangler deploy --secrets-file .env`; only `KEY=value` lines are read. A comment-based marker would not survive into the deployed environment and would not be visible to `deploy.preflight`.

## Risks

- **Runtime confusion with string `"null"`**: services that do `if (!process.env.KEY)` will treat `"null"` as truthy and attempt to use it. This is by design — the operator explicitly chose `null` because the variable is not required, so the service should not be reading it. If a service reads a variable marked `null`, the failure is in the service's env-consumption logic, not in the convention. Mitigation: document in AGENTS.md that `null` means "do not read this variable at runtime."

- **Agent misinterpretation**: agents may start writing `null` in `.env.example` files. Mitigation: ENV-CONTRACT-04 continues to reject non-empty values in `.env.example` (including `null`). The convention applies to `.env` only.

- **Confusion with JSON `null`**: the value is the literal string `"null"`, not JSON `null`. In `.env` files, all values are strings. This is documented in the RFC and in the AGENTS.md entry.

## Acceptance criteria

- [x] `deploy.preflight` DEPLOY-PREFLIGHT-04 `fixHint` includes the `null` suggestion for not-required variables (evidence: packages/werkstatt-site/src/checks/env/deploy-preflight.ts:186, deploy-preflight-test.test.ts:48)
- [x] A `.env` file with `KEY=null` passes `deploy.preflight` without error (evidence: deploy-preflight-test.test.ts:51-58)
- [x] A `.env` file with `KEY=` (empty) fails `deploy.preflight` with the updated message mentioning `null` (evidence: deploy-preflight-test.test.ts:38-48)
- [x] `.env.example` files with `KEY=null` are still rejected by `env.contract.validate` (ENV-CONTRACT-04) — example files remain empty-only (evidence: packages/werkstatt-site/src/checks/env/env-contract.ts:148, hasValue: value.length > 0 triggers ENV-CONTRACT-04 for any non-empty value including null)
- [x] `docs/policies/agent-surface-ops.md` documents the `null` convention in the Env-and-deploy contract section (evidence: docs/policies/agent-surface-ops.md:35)
- [x] Root `AGENTS.md` has a one-line pointer to the `null` convention in the env-and-deploy reference (evidence: AGENTS.md:252)
- [x] Root `.env.example` header comment mentions the `null` convention for `.env` files (evidence: .env.example:4)
- [x] `deploy.preflight --dev` (`.env.dev` files) also gets the `null` suggestion in DEPLOY-PREFLIGHT-04 — same code path, verify explicitly (evidence: deploy-preflight-test.test.ts:61-71, deploy-preflight-test.test.ts:74-81)
- [x] `rfc.validate` passes on this file before merging (evidence: rfc.validate --id RFC-0819 --json → status: pass, 0 violations)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST NOT use `null` in `.env.example` files — `null` is a `.env`-only convention. ENV-CONTRACT-04 continues to reject non-empty values in `.env.example`.
- Agents MUST NOT normalize the string `"null"` to `undefined` in runtime code (`getEnv`, `process.env` access). The convention is file-level, not runtime-level. Services that read a variable marked `null` should treat it as a configuration error, not as an absent value.
- When filling `.env` files for a deployment, agents SHOULD use `KEY=null` for variables that are listed in `.env.example` but not required for the specific site/service.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0819 --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
