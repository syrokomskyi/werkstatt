---
id: RFC-0605
title: "Add passport.key.ensure command for idempotent pipeline-safe key generation"
status: accepted
# kind options: architecture | contract | command | policy | deprecation
kind: command
# scope options: app | workspace
scope: workspace
owners:
  - architecture
# Set by the deciding human together with the status change (RFC-0335).
# Draft scaffolds must keep this empty; do not prefill a default identity.
# Format: human:<handle> (agent:<id> reserved — see RFC-0335).
# Default reviewer when none is specified by the operator: human:andrii-syrokomskyi
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-07-30
updatedAt: 2026-07-30
enhancedAt: 2026-07-30
# Audit-driven enhancements applied (AUDIT-RFC-0605-01): generateKeypair export, version behavior, file permissions, all-inactive keys edge case, AGENTS.md/Compass sync notes.
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0604
  - RFC-0028
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
  proposed:
    - passport.key.ensure
  added: []
  changed: []
  removed: []
appsImpacted: []
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - "@warpgogol/passport"
  - "@warpgogol/site-kernel-checks"
successSignals:
  - "passport.key.ensure creates a key on first run and no-ops on subsequent runs"
  - "passport.key.ensure does not print the private key to stdout"
  - "GENERATOR_OWNERSHIP_MAP lists passport.key.ensure as the owner of public/.well-known/cosmic-passport-key.json"
nonGoals:
  - "Does not change passport.key.rotate — it remains the operator-only command for manual key rotation with private key output."
  - "Does not add passport.key.ensure to the build.prepare pipeline — that is RFC-0604."
  - "Does not handle key revocation or expiry — only initial creation and no-op."
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

# RFC-0605: Add passport.key.ensure command for idempotent pipeline-safe key generation

## Context

`passport.key.rotate` (RFC-0028; DNA-34 reclassified to feature by RFC-0161) is the existing command for generating Ed25519 keypairs and updating `public/.well-known/cosmic-passport-key.json`. It always generates a new keypair, marks existing keys as inactive, and prints the private key to stdout for manual storage in GitHub Actions secrets. This is correct for operator-initiated key rotation but unsafe for pipeline execution: in CI, the private key would leak to logs, and repeated `build.prepare` runs would rotate the key on every invocation.

RFC-0604 wants to add passport key generation to the `build.prepare` pipeline so that `public/.well-known/cosmic-passport-key.json` is guaranteed to exist after build preparation. This requires a pipeline-safe variant that is idempotent (no-op if key exists) and does not print the private key.

## Problem

There is no command that can safely ensure a passport key file exists without risking key rotation or private key leakage. `passport.key.rotate` always generates a new keypair (`packages/passport/src/key-rotate.ts:73-133`) and prints the private key to stdout (`packages/os/site-kernel-checks/src/passport.ts:204-218`). Running it in `build.prepare` would:

1. Rotate the key on every pipeline run, invalidating existing signed tokens.
2. Print the private key to CI logs, violating the security contract in `key-rotate.ts:20-25`: "Private key is NEVER written to disk. It is printed to stdout ONCE for the engineer to paste into GitHub Actions secret."
3. Require manual post-steps (update `system.yaml`, add GitHub Actions secret) that cannot be performed in a pipeline.

## Decision

The kernel gains a `passport.key.ensure` command that creates the passport public key file if it does not exist and is a no-op if it already exists. The command never prints the private key to stdout. When a new key is generated, the private key is written to a temporary file path specified by `--private-key-out` (or skipped if the flag is absent), so the pipeline does not leak secrets to logs.

## Architectural fit

- **RFC-0028 / DNA-34** (Passport key rotation, reclassified to feature by RFC-0161): `passport.key.ensure` extends the passport key family with a pipeline-safe variant. It reuses `PassportPublicKeyFileSchema` from `@warpgogol/passport` and calls `generateKeypair` (which must be exported from `@warpgogol/passport` — see Rollout). It does not rotate existing keys.
- **RFC-0028**: `passport.key.rotate` remains the operator-only command for manual rotation. `passport.key.ensure` is the pipeline-safe command for initial creation.
- **GENERATOR_OWNERSHIP_MAP**: `passport.key.ensure` replaces `passport.key.rotate` as the registered owner of `public/.well-known/cosmic-passport-key.json` in `GENERATOR_OWNERSHIP_MAP`, since it is the command that runs in the pipeline. `passport.key.rotate` remains a registered command but is not in the ownership map (operator-only action).

## Design

### CLI surface

```sh
# Initial key creation (pipeline context — no private key to stdout)
pnpm exec site-kernel run passport.key.ensure --site warpgogol-com

# Initial key creation with private key written to a file (operator context)
pnpm exec site-kernel run passport.key.ensure --site warpgogol-com --private-key-out /tmp/passport-private-key.txt

# Subsequent runs are no-op (key file already exists)
pnpm exec site-kernel run passport.key.ensure --site warpgogol-com
```

Scope: `app`. The command reads the system manifest to get `appId` and writes to `<app>/public/.well-known/cosmic-passport-key.json`.

### TypeScript contracts

```ts
interface EnsureKeyOptions {
  appDirectory: string;
  appId: string;
  privateKeyOutPath?: string;
}

interface EnsureKeyResult {
  created: boolean;
  version: string;
  publicKeyFilePath: string;
  privateKeyWrittenTo?: string;
}
```

When `created` is `false`, the command is a no-op: the existing key file is untouched and no private key is generated. The `version` field is the active key's version from the existing file (the entry with `active: true`).

### File system responsibilities

| Path | Role |
| --- | --- |
| `<app>/public/.well-known/cosmic-passport-key.json` | Created if missing; untouched if existing |
| `--private-key-out <path>` | Private key written to this file only when a new key is created and the flag is provided. File is created with `0600` permissions (owner-only read/write) |

### Output format

```json
{
  "command": "passport.key.ensure",
  "status": "pass",
  "summary": "passport key exists (v1) — no-op",
  "data": {
    "created": false,
    "version": "v1",
    "publicKeyFilePath": "systems/warpgogol-com/public/.well-known/cosmic-passport-key.json"
  }
}
```

When a new key is created:

```json
{
  "command": "passport.key.ensure",
  "status": "pass",
  "summary": "passport key created (v1) — private key written to /tmp/passport-private-key.txt",
  "data": {
    "created": true,
    "version": "v1",
    "publicKeyFilePath": "systems/warpgogol-com/public/.well-known/cosmic-passport-key.json",
    "privateKeyWrittenTo": "/tmp/passport-private-key.txt"
  }
}
```

### Failure modes

- **Manifest missing**: fails with `PKE-01: Could not read system manifest: <error>`.
- **Key generation error**: fails with `PKE-02: Key generation failed: <error>`.
- **Existing key file corrupt**: fails with `PKE-03: Existing key file is invalid: <error>` (does not silently overwrite a corrupt file). This includes the case where the file is schema-valid but contains no key with `active: true` — a file with all keys inactive is functionally broken and must not be silently fixed.
- **Private key output path unwritable**: fails with `PKE-04: Could not write private key to <path>: <error>` (does not fall back to stdout).

## Rollout

- `generateKeypair` is exported from `@warpgogol/passport` (add to `packages/passport/src/index.ts`). Currently it is defined in `packages/passport/src/sign.ts:88` but not included in the barrel export.
- `passport.key.ensure` is registered as a new command in the passport command table (`packages/os/site-kernel-checks/src/command-tables/06-growth-passport.ts`).
- `GENERATOR_OWNERSHIP_MAP` is updated to list `passport.key.ensure` (replacing `passport.key.rotate`) as the owner of `public/.well-known/cosmic-passport-key.json`.
- `passport.key.rotate` remains registered and available for operator-initiated rotations.
- RFC-0604 adds `passport.key.ensure` to the `build.prepare` pipeline once this RFC is accepted and implemented.
- **AGENTS.md**: `packages/passport/AGENTS.md` must be updated to list `generateKeypair` in the exports table.
- **Compass sync**: `docs/COMMANDS.md` must be updated to list `passport.key.ensure` if it maintains a command inventory.

## Alternatives considered

- **Add `--ensure` flag to `passport.key.rotate`**: rejected because it muddies the command's contract — `rotate` means "generate a new key", and `--ensure` changes that to "maybe generate". A separate command keeps each command's semantics clean.
- **Suppress private key output in `passport.key.rotate` via a `--quiet` flag**: rejected because the command still rotates the key on every run, which is wrong for pipeline context.
- **Do not add passport key generation to the pipeline at all**: rejected because `public/.well-known/cosmic-passport-key.json` is a git-tracked generated file that must exist after `build.prepare` (RFC-0604).

## Risks

- **Two commands writing to the same file**: `passport.key.ensure` and `passport.key.rotate` both write to `public/.well-known/cosmic-passport-key.json`. `GENERATOR_OWNERSHIP_MAP` lists only `passport.key.ensure` as the owner to satisfy `generator.ownership.lint`. If an operator runs `passport.key.rotate` after `passport.key.ensure`, the file will have multiple keys (old ones marked inactive). This is by design — `passport.key.rotate` is for manual rotation.
- **Private key not stored**: If `--private-key-out` is not provided in the pipeline, the private key is generated but not stored anywhere. The operator must run `passport.key.rotate` manually for the initial key creation to obtain the private key, or use `--private-key-out` in a controlled environment. The recommended workflow is: operator runs `passport.key.rotate` once to create the initial key and store the private key in GitHub Actions secrets; subsequent `build.prepare` runs call `passport.key.ensure` which is a no-op. The pipeline-generated key (without `--private-key-out`) is only useful for development environments where passport signing is not required.

## Acceptance criteria

- [ ] `generateKeypair` exported from `@warpgogol/passport` (added to `packages/passport/src/index.ts`)
- [ ] `passport.key.ensure` command registered in `packages/os/site-kernel-checks/src/command-tables/06-growth-passport.ts` with `scope: "app"`, `mutatesState: true`, `cacheable: false`
- [ ] Command creates `public/.well-known/cosmic-passport-key.json` if it does not exist
- [ ] Command is a no-op (exit 0, `created: false`) if the key file already exists
- [ ] Command never prints the private key to stdout
- [ ] `--private-key-out` flag writes the private key to the specified file path when a new key is created, with `0600` file permissions
- [ ] `GENERATOR_OWNERSHIP_MAP` lists `passport.key.ensure` as the owner of `public/.well-known/cosmic-passport-key.json`
- [ ] `generator.ownership.lint` passes with no multi-owner violations
- [ ] `passport.key.rotate` remains registered and unchanged
- [ ] Command fails with PKE-03 if existing key file has no active key (all keys `active: false`)
- [ ] `packages/passport/AGENTS.md` updated to list `generateKeypair` in the exports table
- [ ] `rfc.validate` passes on this file before merging

## Implementation notes for agents

<!-- Rules that govern how AI agents interact with this RFC.
     Be explicit. Agents read this section for behavioral policy.

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- For RFCs created on or after 2026-07-07 with acceptance probes: before stamping `implemented`, run
  `site-kernel run rfc.verification.emit --id <this-rfc-id>` and commit the evidence file
  in the same commit (RFC-0330 amended transition precondition).
- Agents MUST NOT weaken or remove enforcement rules established by this RFC
  without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run
  `site-kernel run rfc.supersede.propose --id <this-rfc-id> --reason "..." --invariant "DNA-N"`
  instead of working around it (RFC-0334).
-->
