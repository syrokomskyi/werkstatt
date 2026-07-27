---
id: RFC-0560
title: "Mission Actor Identity and Signed Commits: Cryptographic actor binding for mission lifecycle"
status: accepted
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
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-07-27
updatedAt: 2026-07-27
enhancedAt: 2026-07-27
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends:
  - RFC-0355
amendedBy: []
related:
  - DNA-46
  - DNA-47
  - DNA-34
  - RFC-0355
  - RFC-0558
  - RFC-0559
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-46
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
    - mission.open
    - mission.git.commit
    - mission.reconcile
    - mission.close
  removed: []
appsImpacted: []
packagesImpacted:
  - packages/os/site-kernel-handoff
successSignals:
  - "A mission opened via Studio Gate records the VC subject id as actor in mission.yaml and Bordbuch, not a free-text string."
  - "A commit created by mission.git.commit carries an Ed25519 signature that can be verified against the operator's public key from werkstatt.identity.json."
  - "An existing mission with actor: 'agent' in Bordbuch remains valid and readable — no migration required for historical entries."
nonGoals:
  - "Do not implement GPG-style commit signing — Ed25519 signatures are stored as git notes or trailer fields, not as GPG signatures."
  - "Do not implement commit signature verification as a gate for mission.reconcile — signatures are for audit trail, not for blocking reconciliation."
  - "Do not implement actor identity for non-mission git operations (platform code commits in packages/*) — that is IDE workflow, governed by git config."
  - "Do not implement delegation chains for commit signing — only the direct actor signs."
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

# RFC-0560: Mission Actor Identity and Signed Commits: Cryptographic actor binding for mission lifecycle

## Context

DNA-46 (Mission lifecycle, RFC-0355) established that every change to a Sternsystem passes through a mission. Each mission records an `actor` field in `mission.yaml` and Bordbuch entries. Currently, `actor` is a free-text string defaulting to `"agent"` (`packages/os/site-kernel-handoff/src/mission/index.ts:68`). There is no cryptographic binding between the actor string and a real identity.

RFC-0558 introduced VC-based identity with Ed25519 keypairs. RFC-0559 added auth middleware to Studio Gate that verifies VC credentials and extracts the actor identity. This RFC closes the loop: the actor identity from the VC credential is written into mission manifests and Bordbuch, and commits in the workpiece git repository are cryptographically signed with the actor's Ed25519 key.

The grilling session (2026-07-27) established that signed commits provide an audit trail linking each workpiece change to a cryptographic identity, without blocking reconciliation or requiring GPG.

## Problem

1. **Actor is not cryptographic.** `mission.open` accepts `--actor` as a free-text flag (`packages/os/site-kernel-handoff/src/mission/index.ts:68`). Any string is accepted. Bordbuch records this string, but it cannot be verified against a keypair.
2. **No commit signing in workpiece.** `mission.git.commit` creates standard git commits in the workpiece repository (`packages/os/site-kernel-handoff/src/mission/mission-git-commit.ts`). Commits are not signed. There is no cryptographic link between the commit and the actor who made it.
3. **No identity propagation from Studio Gate.** When Studio Gate auth middleware (RFC-0559) authenticates a call, the resulting `actorId` is not passed to the underlying `mission.open` command. The auth context is lost at the command boundary.

## Decision

The `actor` field in mission manifests and Bordbuch entries becomes a VC subject identifier (multibase public key or `did:web` identifier) instead of a free-text string. `mission.git.commit` signs each commit with the actor's Ed25519 private key using `Werkstatt-Actor` and `Werkstatt-Signature` trailer fields containing the actor id and signature. The auth context from Studio Gate (RFC-0559) is propagated to mission commands via environment variables (`WERKSTATT_ACTOR_ID`, `WERKSTATT_ACTOR_SITE`, `WERKSTATT_ACTOR_SCOPES`) that are inherited by the child `site-kernel` process. The `--actor-from-auth` flag triggers reading these env vars.

## Architectural fit

- **DNA-46 (Mission lifecycle):** Extends RFC-0355 by making the `actor` field cryptographic. Existing missions with `actor: "agent"` remain valid — this is an additive change, not a breaking migration.
- **DNA-47 (Materialization):** Materialization creates the workpiece git repo. This RFC adds commit signing to `mission.git.commit`, which runs after materialization. No changes to materialization itself.
- **DNA-34 (VC signing):** Reuses `signBytes` from `packages/passport/src/sign.ts` for commit signing. The same Ed25519 keypair used for VC credentials is used for commit signatures.
- **RFC-0558 (Identity Model):** Depends on RFC-0558 for the VC subject identifier format and keypair management.
- **RFC-0559 (Studio Gate Auth):** Depends on RFC-0559 for auth context propagation. Studio Gate authenticates the MCP call and sets `WERKSTATT_ACTOR_ID`, `WERKSTATT_ACTOR_SITE`, and `WERKSTATT_ACTOR_SCOPES` env vars in the Studio Gate process. Since Studio Gate spawns `site-kernel` as a child process via `execFile` (`packages/studio-gate/src/executor.ts:36`), the child process inherits these env vars. This is the auth context propagation mechanism — no command flags needed.
- **Scaling:** Signed commits provide a verifiable audit trail that works across P2P workshops (RFC-0562) — any node can verify that a commit was signed by the claimed actor.

## Design

### CLI surface

```sh
# Mission open with actor from auth context (Studio Gate sets WERKSTATT_ACTOR_ID)
pnpm exec site-kernel run mission.open --system warpgogol-com --brief "Update homepage" --actor-from-auth --json

# Mission open with explicit actor (CLI direct access, backwards compatible)
pnpm exec site-kernel run mission.open --system warpgogol-com --brief "Update homepage" --actor did:web:warpgogol.com#operator-v1 --json

# Git commit with Ed25519 signature (uses PASSPORT_SIGNING_KEY)
pnpm exec site-kernel run mission.git.commit --mission warpgogol-com-m000015 --message "Update hero section" --json
```

The `--actor-from-auth` flag reads `WERKSTATT_ACTOR_ID` and `WERKSTATT_ACTOR_SITE` env vars set by Studio Gate auth middleware. If both `--actor` and `--actor-from-auth` are provided, `--actor-from-auth` takes precedence.

### TypeScript contracts

```ts
// packages/os/site-kernel-handoff/src/mission/actor-identity.ts

export interface ActorIdentity {
  actorId: string;        // VC subject id (did:web:<domain>#<key-version>)
  siteId: string;         // Site from credential
  scopes: string[];       // Scopes from credential
}

export function resolveActorFromEnv(): ActorIdentity | null {
  const actorId = process.env.WERKSTATT_ACTOR_ID;
  const siteId = process.env.WERKSTATT_ACTOR_SITE;
  if (!actorId || !siteId) return null;
  const scopes = process.env.WERKSTATT_ACTOR_SCOPES?.split(",") ?? ["*"];
  return { actorId, siteId, scopes };
}

// packages/os/site-kernel-handoff/src/mission/signed-commit.ts

import { signBytes } from "@warpgogol/passport";

export interface SignedCommitResult {
  commitSha: string;
  signature: string;      // base64 Ed25519 signature
  actorId: string;        // VC subject id
  signedAt: string;       // ISO-8601
}

export async function createSignedCommit(
  workpieceDir: string,
  message: string,
  actorId: string,
  privateKeyHex: string,  // from PASSPORT_SIGNING_KEY
): Promise<SignedCommitResult> {
  // 1. git add -A && git commit -m <message>
  // 2. Get commit sha (pre-amend)
  // 3. Sign commit sha with signBytes(privateKeyHex, new TextEncoder().encode(sha))
  //    Note: signBytes(privateKeyHex, message) returns multibase string (packages/passport/src/sign.ts:216)
  // 4. Add trailers: git commit --amend -m "<message>\n\nWerkstatt-Actor: <actorId>\nWerkstatt-Signature: <multibase-sig>"
  // 5. Return result with post-amend commit sha
  // Note: --amend is safe because the workpiece is a local repo, not pushed until mission.reconcile
}
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/os/site-kernel-handoff/src/mission/index.ts` | `actor` flag resolution: reads `--actor-from-auth` env vars, falls back to `--actor` flag, defaults to `"unknown"` if neither provided. |
| `packages/os/site-kernel-handoff/src/mission/actor-identity.ts` | New file. `resolveActorFromEnv` and `ActorIdentity` type. |
| `packages/os/site-kernel-handoff/src/mission/signed-commit.ts` | New file. `createSignedCommit` function using `signBytes` from passport. |
| `packages/os/site-kernel-handoff/src/mission/mission-git-commit.ts` | `mission.git.commit` calls `createSignedCommit` when `PASSPORT_SIGNING_KEY` is set. Falls back to unsigned commit if key not set. |
| `packages/os/site-kernel-handoff/src/mission/mission-open.ts` | `mission.open` actor resolution: reads `--actor-from-auth` env vars, falls back to `--actor` flag, defaults to `"unknown"` if neither provided. |
| `packages/os/site-kernel-handoff/src/mission/mission-reconcile.ts` | `mission.reconcile` uses the same actor resolution logic when writing Bordbuch entries. |
| `packages/os/site-kernel-handoff/src/mission/mission-close.ts` | `mission.close` uses the same actor resolution logic when writing Bordbuch entries. |
| `missions/*/mission.yaml` | `actor` field stores VC subject id instead of free-text string. |
| `systems/*/bordbuch/events.ndjson` | Bordbuch entries record VC subject id in `actor` field. |

### Env-var propagation contract

Studio Gate (RFC-0555) spawns `site-kernel` as a child process via `execFile` (`packages/studio-gate/src/executor.ts:36`). The child process inherits the parent's environment. When Studio Gate auth middleware (RFC-0559) authenticates a call, it sets the following env vars in the Studio Gate process before dispatching the command:

| Env var | Value | Source |
| --- | --- | --- |
| `WERKSTATT_ACTOR_ID` | VC subject id (e.g. `did:web:warpgogol.com#operator-v1`) | `StudioGateAuthResult.actorId` |
| `WERKSTATT_ACTOR_SITE` | Sternsystem id (e.g. `warpgogol-com`) | `StudioGateAuthResult.siteId` |
| `WERKSTATT_ACTOR_SCOPES` | Comma-separated scopes (e.g. `workpiece.read,workpiece.write`) | `StudioGateAuthResult.scopes` |

The `--actor-from-auth` flag on `mission.open` (and other mission commands) triggers reading these env vars. If the flag is not set, the env vars are ignored. This keeps CLI direct access unaffected by Studio Gate's auth context.

### Actor resolution in mission.reconcile and mission.close

`mission.reconcile` and `mission.close` also write Bordbuch entries with an `actor` field. They use the same actor resolution logic as `mission.open`: if `WERKSTATT_ACTOR_ID` is set (from auth context), it is used as the actor; otherwise, the `--actor` flag is used; otherwise, the default `"unknown"` is used. This ensures all Bordbuch entries within a mission consistently record the same actor identity.

### Output format

```json
{
  "command": "mission.git.commit",
  "status": "ok",
  "data": {
    "mission": "warpgogol-com-m000015",
    "commitSha": "abc123def456...",
    "signed": true,
    "actorId": "did:web:warpgogol.com#operator-v1",
    "signature": "multibase-ed25519-signature..."
  },
  "summary": "mission.git.commit: created signed commit abc123d for warpgogol-com-m000015"
}
```

The `commitSha` is the post-amend SHA (after trailers are added via `git commit --amend`). When `PASSPORT_SIGNING_KEY` is not set, `signed` is `false` and `signature` is omitted.

When the workpiece has no changes, `mission.git.commit` returns the current HEAD SHA with `signed: false` and `message: "(no changes — workpiece is clean)"` — no commit or amend is performed.

### Failure modes

| Condition | Behavior |
| --- | --- |
| `WERKSTATT_ACTOR_ID` not set and `--actor` not provided | `mission.open` fails with exit code 1 and `actor-required` error. |
| `WERKSTATT_ACTOR_ID` set but `--actor` also provided | `--actor-from-auth` takes precedence; `--actor` value is ignored with a warning to stderr. Exit code 0. |
| `PASSPORT_SIGNING_KEY` not set for `mission.git.commit` | Commit is created without signature. `signed: false` in output. Warning logged to stderr. Exit code 0. |
| `PASSPORT_SIGNING_KEY` set but invalid | `mission.git.commit` fails with exit code 1 and `signing-key-invalid` error. |
| Workpiece has no changes | `mission.git.commit` returns current HEAD SHA with `signed: false` and no commit is created. Exit code 0. |
| Existing mission with `actor: "agent"` | No migration needed. `bordbuch.validate` accepts any string in `actor` field. Only new missions use VC subject ids. |

## Rollout

- **Phase 1 (actor field migration):** `mission.open` accepts both `--actor` (free-text, backwards compatible) and `--actor-from-auth` (from auth context). New missions opened via Studio Gate use `--actor-from-auth`. CLI direct access continues to use `--actor`. The default actor changes from `"agent"` to `"unknown"` when neither `--actor` nor `--actor-from-auth` is provided — CLI workflows that omit `--actor` will see `"unknown"` in Bordbuch entries instead of `"agent"`. This is a visible behavior change for CLI direct access.
- **Phase 2 (signed commits):** `mission.git.commit` signs commits when `PASSPORT_SIGNING_KEY` is set. If not set, commits are unsigned with a warning. This allows gradual adoption — operators without identity bootstrap still get unsigned commits.
- **Phase 3 (enforcement):** After all operators have bootstrapped identity, a future RFC can make signed commits mandatory. This RFC does not enforce signing — it enables it.
- **Historical Bordbuch entries:** Existing entries with `actor: "agent"` remain valid. No migration. `bordbuch.validate` does not reject non-VC actor strings.
- **Mixed-state missions:** If an operator bootstraps identity mid-mission, the `mission-open` Bordbuch entry will have `actor: "agent"` (or `"unknown"`) but subsequent `mission.git.commit` signatures will reference the VC subject id. This is acceptable — the audit trail shows the transition point.
- **AGENTS.md update:** `packages/os/site-kernel-handoff/AGENTS.md` should be updated to document the `--actor-from-auth` flag and the env-var propagation contract.

## Alternatives considered

1. **GPG commit signing.** Use git's native GPG signing (`git commit -S`). Rejected: GPG is heavyweight, requires separate keyring, and is not aligned with the Ed25519 VC model. Ed25519 signatures in commit trailers are simpler and use the same keypair as VC credentials.
2. **Signed git tags instead of commit signing.** Sign a tag at mission close rather than each commit. Rejected: loses per-commit actor binding. A mission may have many commits from different actors (operator + delegated LLM). Per-commit signing preserves the full audit trail.
3. **Actor identity in commit message only.** Put actor id in commit message without cryptographic signature. Rejected: no verification. Anyone can write any actor id in a commit message. Signature proves the commit was created by someone holding the private key.
4. **Require actor from auth context only.** Remove `--actor` flag entirely. Rejected: breaks CLI direct access for operators who work without Studio Gate. The pilot needs both paths.

## Risks

- **Key not set during transition.** Operators who haven't run `identity.bootstrap` will produce unsigned commits. This is acceptable during rollout — the `signed: false` flag in output makes the state visible.
- **Signature verification not enforced.** This RFC enables signing but does not verify signatures during `mission.reconcile`. A future RFC may add verification. The pilot relies on the audit trail, not on blocking unsigned commits.
- **Commit trailer format.** The `Werkstatt-Actor` and `Werkstatt-Signature` trailers are custom git trailers, not a standard git format. Tools that parse git logs may not understand them. Mitigation: trailers are human-readable and do not interfere with git operations. The `Werkstatt-` prefix avoids collision with the standard `Signed-off-by` (DCO) trailer.
- **Key reuse.** `PASSPORT_SIGNING_KEY` is used for both build provenance signing (Cosmic Passport, RFC-0028) and mission commit signing (this RFC). A compromised mission workflow could leak the key that also signs build provenance. Mitigation: the key is only in env vars, never written to disk. A future RFC may introduce a separate `MISSION_SIGNING_KEY` if key separation is needed. For the pilot, key reuse is acceptable — both signing contexts are operator-controlled.
- **Actor id changes after key rotation.** If the operator rotates keys (RFC-0558 future `rotateKey`), the actor id changes. Old commits retain old actor ids. Bordbuch entries link actor ids to key versions via the VC proof `verificationMethod` field.
- **CLI actor with signing key.** If an operator runs `mission.git.commit` via CLI with `PASSPORT_SIGNING_KEY` set but without `--actor-from-auth`, the actor id for the signature is taken from the `--actor` flag (or the mission manifest's `openedBy` field as fallback). This ensures the signature's actor id matches the Bordbuch entry's actor field.
- **Agent misinterpretation.** LLM agents may set `--actor` to arbitrary strings when working via CLI. Mitigation: Studio Gate path uses `--actor-from-auth` which reads from auth context, not from LLM-provided flags.

## Acceptance criteria

- [ ] `ActorIdentity` type and `resolveActorFromEnv` function defined in `packages/os/site-kernel-handoff/src/mission/actor-identity.ts`
- [ ] `createSignedCommit` function defined in `packages/os/site-kernel-handoff/src/mission/signed-commit.ts`
- [ ] `mission.open` accepts `--actor-from-auth` flag and reads `WERKSTATT_ACTOR_ID` env var
- [ ] `mission.git.commit` signs commits with Ed25519 when `PASSPORT_SIGNING_KEY` is set, using `Werkstatt-Actor` and `Werkstatt-Signature` trailers
- [ ] `mission.git.commit` produces unsigned commit with `signed: false` when key not set
- [ ] `mission.git.commit` handles no-changes case by returning current HEAD SHA without committing
- [ ] `mission.yaml` `actor` field stores VC subject id when opened via `--actor-from-auth`
- [ ] Bordbuch entries record VC subject id in `actor` field
- [ ] `mission.reconcile` and `mission.close` use the same actor resolution logic as `mission.open`
- [ ] Existing missions with `actor: "agent"` remain valid in `bordbuch.validate`
- [ ] `packages/os/site-kernel-handoff/AGENTS.md` updated with `--actor-from-auth` flag and env-var propagation contract
- [ ] `rfc.validate` passes on this file before merging

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- For RFCs created on or after 2026-07-07 with acceptance probes: before stamping `implemented`, run `site-kernel run rfc.verification.emit --id <this-rfc-id>` and commit the evidence file in the same commit (RFC-0330 amended transition precondition).
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id <this-rfc-id> --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
- Agents MUST NOT fabricate actor identities when using `--actor-from-auth` — the env vars are set by Studio Gate auth middleware, not by the agent.
- Agents MAY use `--actor` flag for CLI direct access, but the value should be a valid VC subject id when identity bootstrap is complete.
- `mission.git.commit` MUST NOT fail when `PASSPORT_SIGNING_KEY` is not set — it falls back to unsigned commit with a warning.
- Bordbuch entries for historical missions MUST NOT be migrated — `actor: "agent"` remains valid.
