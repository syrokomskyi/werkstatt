---
id: RFC-0856
title: "Establish the governed program packet control plane"
status: draft
kind: contract
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-08-15
updatedAt: 2026-08-15
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0855
  - RFC-0556
dependsOn:
  - RFC-0855
batch: agent-runtime-certification-program
satisfies:
  - DNA-51
  - DNA-53
  - DNA-65
versionBump: patch
commands:
  proposed:
    - program.packet.validate
    - program.packet.seal
    - program.packet.lease
    - program.packet.complete
  added: []
  changed: []
  removed: []
appsImpacted: []
packagesImpacted:
  - "@warpgogol/forge"
  - "@warpgogol/werkstatt"
successSignals:
  - "A fresh agent can reject a stale, incomplete, out-of-order, or self-authorized packet before changing any file."
  - "Exactly one local executor lease can be active for a program packet, with explicit heartbeat, release, and steward-reviewed stale recovery."
  - "Every completed packet has distinct seal, implementation, and completion commit boundaries with verified ancestry and file ownership."
  - "The next packet can be sealed only from the committed completion boundary of its predecessor."
  - "Program packet schemas and transition rules are reusable by any Forge workshop and are tested on Linux and Windows path semantics."
nonGoals:
  - "This RFC does not implement any RFC-0855 runtime, certification, sandbox, deployment, or cutover behavior."
  - "This RFC does not cryptographically authenticate local operator or agent identities; role assertions remain repository governance, not a security boundary."
  - "This RFC does not provide a distributed lease across independent clones or hosts. RFC-0855 forbids such parallel execution instead."
  - "This RFC does not commit files, bypass ecosystem.commit or mission.git.commit, or replace their validation and versioning behavior."
  - "This RFC does not permit an executor to seal, broaden, repair, or complete its own packet."
---

# RFC-0856: Establish the governed program packet control plane

## Context

RFC-0855 defines a long, forward-only runtime and certification transition that is intentionally executable by agents with no prior-session memory. Its packet contract requires exact prerequisite commits, normative source hashes, narrow file allow-lists, explicit transition diagnostics, independent handoff evidence, and strictly sequential execution.

A prose template cannot enforce those invariants. Future prerequisite commits do not exist when the program is initially drafted, an implementation commit cannot contain a report that names its own hash, and a dirty-tree check does not stop two local sessions from starting the same packet at the same base commit. The packet must therefore be prepared in advance but sealed only after its predecessor has a committed completion boundary.

Forge already owns portable RFC, ADR, plan, audit, workflow, lock, and agent-governance surfaces. Werkstatt registers Forge modules in `tools/kernel.config.ts` and generated workshop templates. The control plane belongs in Forge because the protocol is project governance rather than stack or production-runtime behavior. It uses DNA-51 atomic-write/idempotency patterns and the existing RFC-0556 autonomous `byteHash` primitive for exact bytes, while remaining independent from the RFC-0855 Law Kernel.

## Problem

Without machine enforcement, a weaker agent can:

1. execute a packet whose sources changed after it was written;
2. start before the predecessor is complete or from the wrong branch/head;
3. silently edit its own allow-list, diagnostics, or prerequisites;
4. race a second local executor from the same base commit;
5. include unrelated files or multiple responsibilities in an implementation range;
6. claim completion without independent validation or clean trees;
7. create a self-referential completion report whose named commit cannot exist;
8. leave an interrupted lease or half-written state with no deterministic recovery path.

The existing `.werkstatt/locks` implementation is process-local and expires when a command process ends. A packet lease must survive individual CLI calls and agent turns, so it needs a separate schema and lifecycle. It is a coordination guard on one shared workspace, not a hostile-user security primitive.

## Decision

Forge gains a fail-closed `forge/program@1` control plane with four workspace commands: `program.packet.validate`, `program.packet.seal`, `program.packet.lease`, and `program.packet.complete`.

The control plane establishes three committed boundaries:

1. **Seal commit** — a Program Steward finalizes one packet against the predecessor's completion commit and commits the sealed packet plus program manifest.
2. **Implementation range** — one executor holds the exclusive local lease and produces only canonical commits permitted by the packet. The range may contain more than one commit when repository policy requires separate version, RFC-stamp, review-fix, or documentation commits.
3. **Completion commit** — the Program Steward independently validates the range, writes the completion report and updated program manifest, and commits them. The next packet uses this commit as its `baseCommit`.

The roles are closed:

- **Program Steward:** a human operator or non-executing agent that prepares, seals, verifies, completes, and recovers packets;
- **Packet Executor:** the single agent identity holding the active packet lease and implementing only the sealed instructions.

The same identity must not be both Steward and Executor for one packet. CLI identity fields make this separation auditable but are not authentication.

## Architectural fit

- **DNA-51:** sealing and completion use atomic writes and idempotency keys; lease acquisition is exclusive and stale recovery is explicit.
- **DNA-53:** packet payloads, committed normative source blobs, validation evidence, and changed-file sets use Forge's existing RFC-0556 inlined `byteHash` primitive. These are exact-byte identities, not claims of semantic equivalence, and no second hash helper is introduced.
- **DNA-65:** the program manifest records direct packet order and governing RFC dependencies; a packet cannot seal until every direct RFC dependency is implemented.
- **Forge autonomy:** `@warpgogol/forge` remains cross-platform and imports no Werkstatt package. Its module is exposed through a Forge subpath and registered by workshop composition.
- **Werkstatt boundary:** `@warpgogol/werkstatt` changes only module-loader registration and workshop scaffolding. It does not own the generic schemas or handlers.
- **Pipelines:** the commands are standalone governance gates, not `build.check` steps. An active forward-only transition may intentionally disable build/deploy surfaces, so program validity must remain independently runnable.

## Design

### CLI surface

```sh
pnpm exec werkstatt run program.packet.validate \
  --program=RFC-0855 --packet=010-node-24 --phase=draft --json

pnpm exec werkstatt run program.packet.seal \
  --program=RFC-0855 --packet=010-node-24 \
  --steward=human:andrii-syrokomskyi --idempotency-key=<key> --json

pnpm exec werkstatt run program.packet.lease \
  --program=RFC-0855 --packet=010-node-24 --action=start \
  --executor=agent:<id> --json

pnpm exec werkstatt run program.packet.lease \
  --program=RFC-0855 --packet=010-node-24 --action=heartbeat \
  --lease-token=<opaque-token> --json

pnpm exec werkstatt run program.packet.complete \
  --program=RFC-0855 --packet=010-node-24 \
  --steward=human:andrii-syrokomskyi --lease-token=<opaque-token> \
  --implementation-head=<sha> --idempotency-key=<key> --json

pnpm exec werkstatt run program.packet.lease \
  --program=RFC-0855 --packet=010-node-24 --action=release \
  --lease-token=<opaque-token> --json

pnpm exec werkstatt run program.packet.lease \
  --program=RFC-0855 --packet=010-node-24 --action=recover \
  --steward=human:andrii-syrokomskyi --reason="<auditable reason>" --json
```

Packet `000-program-control-plane` is the sole bootstrap exception because these commands do not exist before its implementation. Its accepted RFC-0856 implementation plan commit acts as the seal boundary. After the implementation commands exist, the Steward runs `program.packet.complete --bootstrap --seal-commit=<accepted-plan-commit> ...` to validate the implementation range and create the genesis completion. `--bootstrap` is rejected for every other packet and after the program leaves `preparing`.

All commands are workspace-scoped and require an explicit program and packet. `validate` is read-only. `seal` writes only the packet and manifest. `lease` writes only untracked lease state, except `recover`, which also writes a tracked recovery record. `complete` writes only the completion report and manifest. None of the commands invokes git commit.

`--phase` is one of `draft`, `sealed`, `active`, or `completion`. Pretty and JSON modes have identical exit status and semantic data. Opaque lease tokens are never printed in ordinary logs; JSON returns them only from `--action=start` to the invoking executor.

### TypeScript contracts

```ts
type ProgramActor = `human:${string}` | `agent:${string}`;
type ProgramState = "preparing" | "executing" | "blocked" | "complete";
type PacketState = "draft" | "sealed" | "active" | "completed" | "blocked";
type RecoveryStatus = "verified" | "not-applicable";

interface ProgramManifestV1 {
  schema: "forge/program@1";
  programRfc: string;
  branch: string;
  state: ProgramState;
  currentPacket: string;
  packets: ProgramPacketIndexEntryV1[];
}

interface ProgramPacketV1 {
  schema: "forge/program-packet@1";
  program: string;
  packetId: string;
  state: "draft" | "sealed";
  governingDecision: string;
  dependsOnPacket: string | null;
  baseCommit: string | null;
  branch: string;
  steward: ProgramActor;
  normativeSources: Array<{ path: string; sha256: string }>;
  allowedFiles: string[];
  forbiddenFiles: string[];
  permittedTransitionDiagnostics: string[];
  requiredValidations: Array<{
    command: string;
    expectedStatus: "pass";
    expectedDiagnostics: string[];
  }>;
}

interface ProgramPacketLeaseV1 {
  schema: "forge/program-packet-lease@1";
  program: string;
  packetId: string;
  sealCommit: string;
  executor: ProgramActor;
  tokenHash: string;
  startedAt: string;
  heartbeatAt: string;
  timeoutSeconds: number;
}

interface ProgramPacketCompletionV1 {
  schema: "forge/program-packet-completion@1";
  program: string;
  packetId: string;
  baseCommit: string;
  sealCommit: string;
  implementationCommits: string[];
  implementationHead: string;
  changedFiles: string[];
  validations: Array<{
    command: string;
    status: "pass";
    evidenceDigest: string;
  }>;
  remainingTransitionDiagnostics: string[];
  unexpectedDiagnostics: [];
  recoveryStatus: RecoveryStatus;
  cleanTrees: true;
  completedBy: ProgramActor;
}
```

`baseCommit` is `null` only while a future packet is in `draft`. `seal` replaces it with the exact predecessor completion commit and rejects `null` for a sealed packet. `governingDecision` accepts either an RFC id or a qualified accepted specification-amendment reference; the validator applies the corresponding status rule.

The packet digest is computed from the normalized packet payload while `state: draft`; `seal` changes the state only after validating that payload and records its digest in the program manifest. The seal commit itself is discovered as the newest commit that changed the packet from `draft` to `sealed`; it is not embedded in that commit and is therefore not self-referential.

The completion report contains the already-known seal and implementation commits. It does not contain its own completion commit. The next `seal` invocation requires `HEAD` to be the committed completion boundary of the preceding packet and records that value as the next packet's `baseCommit`.

### State and authority transitions

```text
draft --Steward/seal--> sealed --Executor/start lease--> active
active --Steward/complete--> completion-pending --commit--> completed
active --timeout--> stale lease --Steward/recover--> blocked or sealed
```

- `seal` requires a clean tree, the program branch, `HEAD === baseCommit`, implemented direct RFC prerequisites, valid source hashes, no placeholders, a non-empty bounded allow-list, and no active lease.
- `start` requires `HEAD === sealCommit`, a sealed packet, no other active/stale lease, and `executor !== steward`.
- `heartbeat` requires the opaque token and never changes tracked state.
- During the implementation range, every commit must descend from the seal commit; all changed paths must match `allowedFiles` and none may match `forbiddenFiles`.
- `complete` requires a live matching lease, a clean tree, the declared implementation head, full ancestry, all validations with exact expected diagnostics, no unexpected diagnostics, and an independently named Steward distinct from the Executor.
- `complete` writes pending artifacts. After their canonical commit, `lease --action=release` verifies that `HEAD` is the completion commit before deleting the lease.
- `recover` is allowed only after timeout. It records the previous lease digest, reason, actor, observed head, and chosen target (`blocked` or the original seal boundary). It never silently deletes evidence or rewrites implementation commits.
- The bootstrap completion for packet `000` requires `governingDecision: RFC-0856`, no predecessor, program state `preparing`, the accepted RFC-0856 plan commit as `sealCommit`, and the full RFC-0856 acceptance suite. It transitions the program to `executing`; there is no second bootstrap path.

### File system responsibilities

| Path | Role |
|---|---|
| `packages/forge/os/program/**` | schemas, discovery, validation, seal, lease, completion, and module registration |
| `packages/forge/src/tests/program-packet*.test.ts` | state, hash, ancestry, path, race, interruption, and property tests |
| `packages/forge/package.json` | exported program module/API |
| `packages/werkstatt/src/workshop/templates.ts` | program module loader in generated workshops |
| `tools/kernel.config.ts` | program module loader in this workshop |
| `docs/plans/<program>/program.yaml` | tracked machine-authoritative program index |
| `docs/plans/<program>/NNN-*.md` | tracked draft/sealed packet payloads |
| `docs/plans/<program>/completions/*.json` | tracked completion reports |
| `docs/plans/<program>/recoveries/*.json` | tracked stale-lease recovery evidence |
| `.forge/program-leases/<program>/*.json` | untracked local lease state; contains only token hash |
| `docs/command-manifest.generated.yaml` | regenerated command metadata |
| `docs/ecosystem.generated.yaml` | regenerated ecosystem projection |

The implementation adds the anchored `/.forge/program-leases/` ignore rule. It never stores raw lease tokens, secrets, environment contents, prompts, or provider payloads in tracked or log output.

### Output format

Every command returns the standard command envelope. Example validation failure:

```json
{
  "commandName": "program.packet.validate",
  "data": {
    "command": "program.packet.validate",
    "status": "fail",
    "program": "RFC-0855",
    "packetId": "010-node-24",
    "phase": "sealed",
    "violations": [
      {
        "rule": "PROGRAM-PACKET-07",
        "path": "docs/plans/agent-runtime-certification/010-node-24.md",
        "message": "normative source hash mismatch"
      }
    ]
  },
  "exitCode": 1,
  "ok": false
}
```

Success returns `status: "pass"`, an empty `violations` array, the observed branch/head/state, and only safe digests. Mutation commands additionally return `filesModified`; lease start returns the raw token once in `data.leaseToken` and redacts it from logs.

### Failure modes

| Rule | Condition | Result |
|---|---|---|
| `PROGRAM-PACKET-01` | malformed manifest, packet, lease, report, or recovery record | error, exit 1 |
| `PROGRAM-PACKET-02` | wrong program branch or head | error, exit 1 |
| `PROGRAM-PACKET-03` | predecessor/RFC prerequisite not complete | error, exit 1 |
| `PROGRAM-PACKET-04` | role collision or unauthorized transition | error, exit 1 |
| `PROGRAM-PACKET-05` | active or stale lease exists | error, exit 1; stale lease needs explicit recovery |
| `PROGRAM-PACKET-06` | changed path escapes allow-list or hits forbidden list | error, exit 1 |
| `PROGRAM-PACKET-07` | source/payload/evidence digest mismatch | error, exit 1 |
| `PROGRAM-PACKET-08` | unexpected validation status or diagnostic | error, exit 1 |
| `PROGRAM-PACKET-09` | commit ancestry/range mismatch | error, exit 1 |
| `PROGRAM-PACKET-10` | dirty tree at a sealed boundary | error, exit 1 |
| `PROGRAM-PACKET-11` | raw token would enter tracked output/log | error, exit 1 |
| `PROGRAM-PACKET-12` | interrupted pending transition | error with exact idempotent recovery command, exit 1 |

There is no warning or suppression mode for identity, ordering, lease, path, hash, ancestry, or validation violations. Pretty output changes presentation only. A nonexistent program or empty packet list fails rather than passing vacuously.

## Rollout

1. RFC-0856 is the first implementation packet of RFC-0855. It uses the sole accepted-plan bootstrap described above. No other program packet may seal before its commands, schemas, tests, module registration, generated command metadata, and genesis completion are committed.
2. The initial implementation consumes the RFC-0855 `program.yaml` and packet template created by the charter documentation phase as fixtures, then validates the real packet set and imports its own completion boundary.
3. Existing RFC/ADR/plan workflows are unchanged. Program governance is opt-in through a checked-in `forge/program@1` manifest; a repository without one has no new build gate.
4. Program commands are fail-hard from introduction. There is no warn-only period because no legacy packet executor exists and the first consumer has not started.
5. Generated workshop templates register the module so new Forge workshops can use the protocol without project-specific source edits. The implementation remains cross-platform and tests Windows path/case behavior.

## Alternatives considered

### Prose-only packets

Rejected because the audit found contradictions that a weak executor cannot reliably resolve: stale hashes, unknown future commits, self-referential reports, and concurrent starts.

### Reuse process-local `.werkstatt/locks`

Rejected because a packet spans multiple CLI processes and agent turns. PID liveness is not a durable executor lease and would either expire immediately or leave an unrelated process as false authority.

### Let the executor seal or complete its packet

Rejected because it lets the actor under evaluation change its own scope, expected diagnostics, or success evidence.

### Store the seal or completion commit inside that same commit

Rejected as cryptographically self-referential. Commit identity is observed by the next transition rather than embedded in its own content.

### Implement the control plane in Werkstatt

Rejected because packet governance is stack-agnostic and reusable across Forge profiles. Werkstatt remains the composition host, not the owner of the generic protocol.

### Distributed lease service

Rejected as unnecessary infrastructure. RFC-0855 prohibits cross-workspace parallel execution; the local lease prevents accidental concurrency in the shared workspace and reports its non-security limitation honestly.

## Risks

- **Identity theatre:** actor strings are auditable claims, not authentication. The RFC never uses them as a production security boundary.
- **Stale lease:** a crashed executor can block progress. Explicit timeout recovery preserves evidence and requires a distinct Steward.
- **False lease recovery:** a slow executor may be mistaken for dead. Heartbeats and fail-closed recovery prevent silent takeover; the operator resolves contested ownership.
- **Git edge cases:** rebases, merge commits, case-only renames, and ecosystem.commit split commits can obscure ancestry. Tests cover these cases; merges and rewritten sealed history are rejected.
- **Path escape:** symlinks, `..`, case folding, and generated writes may escape naive globs. Validation uses repository-relative real paths and cross-platform normalization.
- **Performance:** packet validation hashes only declared normative files and inspects commits between two bounded SHAs. It does not scan the whole repository unless an allowed glob explicitly requires it.
- **False positives:** authority, hash, path, order, and ancestry checks intentionally have zero suppressible false positives. A defective packet is resealed by the Steward rather than waived by the Executor.
- **Secret leakage:** raw lease tokens exist only in memory and the untracked local lease exchange. Output redaction and tracked-file scanning block accidental persistence.
- **Agent misinterpretation:** the program packet body remains ordered and self-contained; diagnostics include one exact recovery action and never invite scope expansion.

## Acceptance criteria

- [ ] `forge/program@1`, `forge/program-packet@1`, `forge/program-packet-lease@1`, `forge/program-packet-completion@1`, and recovery schemas are strict, versioned, exported, and reject unknown fields.
- [ ] `program.packet.validate`, `program.packet.seal`, `program.packet.lease`, and `program.packet.complete` are registered as workspace commands with the documented flags and JSON envelopes.
- [ ] The state machine enforces distinct Steward/Executor roles, exact branch/head, direct RFC prerequisites, packet order, source hashes, allowed/forbidden paths, expected diagnostics, and commit ancestry.
- [ ] Seal, implementation-range, and completion boundaries contain no self-referential commit field; the next seal resolves the predecessor completion commit from git history.
- [ ] The one-time packet `000` bootstrap accepts only the committed accepted RFC-0856 plan as its seal boundary, produces a genesis completion through the implemented command, and is rejected for every later packet or program state.
- [ ] Exclusive lease tests cover two concurrent starts, heartbeat, token mismatch, timeout, explicit recovery, interrupted seal/complete, and release only after committed completion.
- [ ] Path tests cover symlinks, traversal, case-only paths, Windows separators, deleted files, renames, generated files, and ecosystem.commit split ranges.
- [ ] Property tests prove idempotent seal/complete retries, stable digests for identical committed git-blob bytes across checkout platforms, and rejection when reordered YAML/JSON changes the sealed exact-byte source identity.
- [ ] Raw lease tokens never appear in tracked artifacts, pretty logs, completion reports, or error messages; only the token hash is persisted locally.
- [ ] The Forge program module is exported, registered in this workshop and workshop templates, and remains independent of `@warpgogol/werkstatt` imports.
- [ ] `command.manifest.generate` and `ecosystem.manifest.generate` update their distinct generated projections from source owners.
- [ ] Root and package AGENTS guidance names Program Steward and Packet Executor boundaries and forbids manual state edits or self-sealing.
- [ ] `pnpm --filter @warpgogol/forge build:check`, scoped unit/property tests, command-manifest validation, ecosystem-manifest validation, `rfc.validate --id RFC-0856 --json`, and clean-tree verification pass.

## Implementation notes for agents

- Implement only after RFC-0856 is accepted and RFC-0855 is implemented. Draft status grants no source-code authority.
- Use the accepted implementation plan. Do not add a distributed coordinator, production credential, compatibility mode, or generic workflow engine.
- Fix source owners before generated projections. Never hand-edit command or ecosystem manifests.
- Keep Forge cross-platform: no POSIX-only shell/path/locking assumption may enter the published package.
- Reuse canonical atomic-file, hashing, YAML, git, and command-envelope patterns. Do not add an ad hoc hashing helper.
- The control plane must not execute implementation commands or commit on behalf of agents. It validates boundaries; canonical commit commands retain ownership of commits.
- A packet Executor must not invoke `seal`, `complete`, or `lease --action=recover` for its own packet. A Steward must not be the packet's Executor.
- A source mismatch, unexpected diagnostic, dirty boundary, stale lease, or allow-list escape is a hard stop. Never add a force, ignore, waive, or suppress flag.
- Inspect full diffs before each canonical commit. Stage only files owned by the active implementation step.
- If implementation reveals an invariant conflict, use `rfc.supersede.propose`; do not weaken DNA-51, DNA-53, DNA-65, or RFC-0855 locally.
