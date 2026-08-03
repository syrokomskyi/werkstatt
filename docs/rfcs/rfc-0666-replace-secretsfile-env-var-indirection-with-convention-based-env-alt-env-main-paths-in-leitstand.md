---
id: RFC-0666
title: "Replace secretsFile env-var indirection with convention-based .env.alt/.env.main paths in Leitstand"
status: draft
# kind options: architecture | contract | command | policy | deprecation
kind: architecture
# scope options: app | workspace
scope: workspace
owners:
  - architecture
# Set by the deciding human together with the status change (RFC-0335).
# Draft scaffolds must keep this empty; do not prefill a default identity.
# Format: human:<handle> (agent:<id> reserved — see RFC-0335).
# Default reviewer when none is specified by the operator: human:andrii-syrokomskyi
reviewers: []
createdAt: 2026-08-03
updatedAt: 2026-08-03
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends:
  - RFC-0379
  - RFC-0627
amendedBy: []
related:
  - RFC-0379
  - RFC-0627
  - RFC-0628
  - RFC-0388
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
    - leitstand.dev-deploy
    - leitstand.propagate
    - leitstand.promote
    - leitstand.rollback
    - sternsystem.validate
  removed: []
appsImpacted: []
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - "@warpgogol/ontology"
  - "@warpgogol/site-kernel-handoff"
successSignals: []
nonGoals:
  - Does not change how wrangler deploy uses secrets — the --secrets-file flag and sourceDotenv mechanism remain.
  - Does not introduce a new .env.dev file — dev and alt share .env.alt.
  - Does not change DNA-40 deploy-script contracts for per-app package.json scripts.
# RFC-0268: OPTIONAL machine-checkable acceptance probes, executed on-demand
# via `pnpm exec site-kernel run rfc.acceptance.run --id <this-rfc-id>` (never
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

# RFC-0666: Replace secretsFile env-var indirection with convention-based .env.alt/.env.main paths in Leitstand

## Context

RFC-0379 introduced the `secretsFile` field in `deploymentChannelSchema` with an `env:VAR_NAME` indirection: the registry stores `secretsFile: env:WERKSTATT_SECRETS_DEV`, `resolveSecretsFilePath` reads the env var to get a file path, and the Cloudflare Workers adapter passes that path to `wrangler deploy --secrets-file`. RFC-0627 copied this pattern for the dev channel.

In practice, none of the three env vars (`WERKSTATT_SECRETS_DEV`, `WERKSTATT_SECRETS_ALT`, `WERKSTATT_SECRETS_MAIN`) were ever set. The adapter falls back to `filterEnv(process.env)` — `CLOUDFLARE_API_TOKEN` from the root `.env` is sufficient for `wrangler deploy`. The entire `secretsFile` indirection is dead code.

Meanwhile, `mission.materialize` already creates and preserves `.env`, `.env.main`, `.env.alt` in the workpiece (DNA-40, RFC-0388). Per-app `package.json` deploy scripts already use `--secrets-file .env.main` and `--secrets-file .env.alt` by convention. The Leitstand does not follow this convention — it uses the env-var indirection instead.

## Problem

The `secretsFile: env:WERKSTATT_SECRETS_*` indirection creates three problems:

1. **Dead code.** None of the three env vars are set in any `.env` file. `resolveSecretsFilePath` always returns `undefined`. The adapter always falls back to `process.env`. The `secretRefSchema`, `SecretRef` type, `resolveSecretsFilePath` function, and preflight checks for `secretsFile` reference syntax are all dead code.

2. **Mission-ID-dependent path.** Even if an operator set `WERKSTATT_SECRETS_DEV=missions/warpgogol-com-m000027/workpiece/.env.alt`, the path changes with every new mission (m000028, m000029...). The operator must update the env var for each mission — there is no stable convention.

3. **Inconsistency with DNA-40.** DNA-40 already mandates `.env.main` and `.env.alt` as the convention for per-app deploy scripts. The Leitstand uses a different mechanism (env-var indirection) for the same concept, creating two parallel secret-resolution paths.

## Decision

The Leitstand resolves secrets via convention-based file paths instead of `secretsFile: env:VAR_NAME` indirection. The `secretsFile` field, `secretRefSchema`, `SecretRef` type, and `resolveSecretsFilePath` function are removed. Each Leitstand command resolves `.env.alt` or `.env.main` from a convention path relative to its working directory.

## Architectural fit

- **DNA-40 (env-and-deploy contract):** Extends the `.env.alt`/`.env.main` convention from per-app deploy scripts to the Leitstand. DNA-40 already mandates these files exist on disk and are used by `deploy:alt`/`deploy:main` scripts. The Leitstand now uses the same files.
- **RFC-0379 (Cloudflare Workers adapter):** Amends — removes `secretsFile` from `deploymentChannelSchema` and `resolveSecretsFilePath` from the adapter flow. The adapter's `sourceDotenv` and `--secrets-file` mechanism remain unchanged.
- **RFC-0627 (dev deployment channel):** Amends — removes `secretsFile: env:WERKSTATT_SECRETS_DEV` from the dev channel. Dev-deploy uses `.env.alt` from the workpiece (same secrets as alt — dev and alt are the same staging environment).
- **RFC-0628 (workpiece-based dev-deploy):** Aligns — dev-deploy already reads from the workpiece; convention-based path resolution is a natural fit.
- **Forward-only:** `secretRefSchema`, `SecretRef`, `resolveSecretsFilePath`, and `secretsFile` preflight checks are deleted, not kept as dead code.

## Design

### Convention paths

| Command | Base path | Env file | Resolved path |
| --- | --- | --- | --- |
| `leitstand.dev-deploy` | `missions/<missionId>/workpiece` | `.env.alt` | `<workpiece>/.env.alt` |
| `leitstand.propagate` | `releases/<releaseId>` | `.env.alt` | `<release>/.env.alt` |
| `leitstand.promote` | `releases/<releaseId>` | `.env.main` | `<release>/.env.main` |
| `leitstand.rollback` | `releases/<releaseId>` | `.env.alt` or `.env.main` (channel-dependent) | `<release>/.env.<channel>` |

Dev and alt share `.env.alt` — they are the same staging environment. Main uses `.env.main` with production secrets.

If the convention file does not exist, the adapter falls back to `filterEnv(process.env)` — `CLOUDFLARE_API_TOKEN` from the root `.env` is sufficient for `wrangler deploy`. Per-channel secrets (Stripe, Telegram, etc.) are optional and degrade gracefully.

### CLI surface

No CLI changes — the commands keep their existing flags. The change is internal to secret resolution:

```sh
pnpm kernel leitstand.dev-deploy --system=warpgogol-com
pnpm kernel leitstand.propagate --system=warpgogol-com --release=warpgogol-com-r000008
pnpm kernel leitstand.promote --system=warpgogol-com --release=warpgogol-com-r000008
```

### TypeScript contracts

**Removed** from `packages/ontology/src/operations/leitstand.ts`:

```ts
// REMOVED — dead code after secretsFile deletion
export const secretRefSchema = z.string().regex(...);
export type SecretRef = z.infer<typeof secretRefSchema>;

// deploymentChannelSchema — secretsFile field removed
export const deploymentChannelSchema = z.object({
  workerName: z.string(),
  url: z.string().url(),
  // secretsFile: secretRefSchema.optional(),  // REMOVED
});
```

**New** in `packages/os/site-kernel-handoff/src/leitstand/leitstand-commands.ts`:

```ts
/** Resolve convention-based secrets path for a channel. */
function resolveConventionSecretsPath(
  basePath: string,
  channel: "dev" | "alt" | "main",
): string | undefined {
  const envFile = channel === "main" ? ".env.main" : ".env.alt";
  const filePath = path.join(basePath, envFile);
  return existsSync(filePath) ? filePath : undefined;
}
```

**Removed** from `leitstand-commands.ts`:

```ts
// REMOVED — dead code after secretsFile deletion
async function resolveSecretsFilePath(secretsFileRef: string | undefined): Promise<string | undefined> { ... }
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `missions/<missionId>/workpiece/.env.alt` | Read by `leitstand.dev-deploy` (dev channel secrets) |
| `missions/<missionId>/workpiece/.env.main` | Copied to releases by `release.prepare` |
| `releases/<releaseId>/.env.alt` | Read by `leitstand.propagate` and `leitstand.rollback` (alt channel) |
| `releases/<releaseId>/.env.main` | Read by `leitstand.promote` and `leitstand.rollback` (main channel) |
| `systems/registry.yaml` | `secretsFile` fields removed from all channel configs |
| `packages/ontology/src/operations/leitstand.ts` | `secretRefSchema`, `SecretRef`, `secretsFile` field removed |
| `packages/ontology/src/operations/index.ts` | `secretRefSchema`, `SecretRef` exports removed |
| `packages/os/site-kernel-handoff/src/leitstand/leitstand-commands.ts` | `resolveSecretsFilePath` removed, `resolveConventionSecretsPath` added |
| `packages/os/site-kernel-handoff/src/leitstand/leitstand-commands.ts` | Preflight `secretsFile` reference-syntax check replaced with info-level `.env.alt`/`.env.main` existence check |

`release.prepare` gains a new step: copy `.env.alt` and `.env.main` from the workpiece to `releases/<releaseId>/` alongside `dist/`. This ensures propagate/promote have stable convention paths regardless of whether the mission workpiece still exists.

### Output format

No output format changes. The `secretsFilePath` field in `PropagateInput` / `RollbackInput` remains `string | undefined` — it is now populated by `resolveConventionSecretsPath` instead of `resolveSecretsFilePath`. The adapter behavior is unchanged: if `secretsFilePath` is `undefined`, it falls back to `filterEnv(process.env)`.

### Failure modes

- **Convention file not found:** Not an error. The adapter falls back to `filterEnv(process.env)`. `sternsystem.validate` preflight reports this as an info-level check ("`.env.alt` not found — using process.env fallback"), not a failure.
- **`release.prepare` cannot find `.env.alt`/`.env.main` in workpiece:** Warning, not error. The release is created without env files — propagate/promote will use `process.env` fallback. This is the same behavior as today.
- **Registry still contains `secretsFile`:** `sternsystem.validate` fails with a clear error: "`secretsFile` is no longer a valid field — remove it from the channel config. See RFC-0666." This ensures forward-only cleanup.

## Rollout

- **Schema change:** `deploymentChannelSchema` drops `secretsFile`. `sternsystem.validate` rejects registries that still contain `secretsFile` fields. This is a hard break — there is no grace period because the field was never used (env vars were never set).
- **Registry cleanup:** Remove `secretsFile: env:WERKSTATT_SECRETS_*` lines from all channel configs in `systems/registry.yaml`.
- **`release.prepare` update:** Add `.env.alt` and `.env.main` copy step. Existing releases without these files are unaffected — propagate/promote use `process.env` fallback.
- **New systems:** Automatically comply — `mission.materialize` already creates `.env.alt`/`.env.main`, and the convention paths work without any operator configuration.
- **No env-var setup required:** Operators no longer need to set `WERKSTATT_SECRETS_DEV/ALT/MAIN`. The convention paths work out of the box.

## Alternatives considered

1. **Workpiece-relative env-var resolution.** Keep `secretsFile: env:WERKSTATT_SECRETS_DEV` but resolve relative to workpiece path. Rejected — still requires operator to set an env var for no benefit. The env var is dead configuration that adds indirection without value.

2. **New `.env.dev` file.** Create a separate `.env.dev` for the dev channel. Rejected — dev and alt are the same staging environment with the same secrets. `mission.materialize` does not create `.env.dev`. Adding it would require schema changes to materialize for no functional difference.

3. **Stable path outside `missions/`.** Store secrets in `secrets/<systemId>/.env.dev` (gitignored). Rejected — introduces a new directory and `.gitignore` management. The workpiece already has `.env.alt`/`.env.main` that are preserved across re-materialization.

4. **Keep `secretsFile` as dead optional field.** Rejected — forward-only ecosystem. Dead code is removed, not kept.

## Risks

- **Operator confusion.** Operators who previously set `WERKSTATT_SECRETS_*` (none found in practice) will find the env vars ignored. Mitigation: `sternsystem.validate` fails with a clear error if `secretsFile` is still in the registry.
- **Release without env files.** If `release.prepare` runs before the operator fills `.env.alt`/`.env.main`, the release directory will not have env files. Propagate/promote will use `process.env` fallback — same as today. Not a regression.
- **Agent misinterpretation.** Agents may try to re-add `secretsFile` to the registry or create `.env.dev` files. Mitigation: `sternsystem.validate` rejects `secretsFile` fields, and AGENTS.md explicitly states the convention.

## Acceptance criteria

- [ ] `secretRefSchema` and `SecretRef` removed from `packages/ontology/src/operations/leitstand.ts` and `index.ts`
- [ ] `secretsFile` field removed from `deploymentChannelSchema`
- [ ] `resolveSecretsFilePath` removed from `leitstand-commands.ts`
- [ ] `resolveConventionSecretsPath` added to `leitstand-commands.ts`
- [ ] `leitstand.dev-deploy` resolves `.env.alt` from workpiece path
- [ ] `leitstand.propagate` resolves `.env.alt` from release path
- [ ] `leitstand.promote` resolves `.env.main` from release path
- [ ] `release.prepare` copies `.env.alt` and `.env.main` to `releases/<releaseId>/`
- [ ] `sternsystem.validate` rejects registries with `secretsFile` fields
- [ ] `sternsystem.validate` preflight reports info-level `.env.alt`/`.env.main` existence check
- [ ] `systems/registry.yaml` cleaned — all `secretsFile` lines removed
- [ ] `packages/os/site-kernel-handoff/AGENTS.md` updated with convention-based secret resolution rules
- [ ] Scoped typecheck passes on `@warpgogol/ontology` and `@warpgogol/site-kernel-handoff`
- [ ] All existing leitstand tests pass (with updated fixtures)
- [ ] `rfc.validate` passes on this file

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MUST NOT re-add `secretsFile` to `deploymentChannelSchema` or `secretRefSchema` to ontology — these are removed forward-only.
- Agents MUST NOT create `.env.dev` files — dev and alt share `.env.alt`.
- Agents MUST NOT set `WERKSTATT_SECRETS_DEV/ALT/MAIN` env vars — these are no longer read.
- `resolveConventionSecretsPath` MUST return `undefined` when the convention file does not exist — the adapter falls back to `filterEnv(process.env)`.
- `release.prepare` MUST copy `.env.alt` and `.env.main` from the workpiece to the release directory. If the files do not exist, it MUST NOT fail — it logs a warning and continues.
- `sternsystem.validate` MUST reject registries that still contain `secretsFile` fields with a clear error referencing this RFC.
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
