---
id: RFC-0477
title: "Ensure bordbuch git synchronization on mission lifecycle and add sternsystem.status"
status: implemented
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
createdAt: 2026-07-21
updatedAt: 2026-07-21
enhancedAt: 2026-07-21
implementedAt: 2026-07-21
closedAt:
supersedes: []
supersededBy:
amends:
  - RFC-0355
  - RFC-0472
amendedBy: []
related:
  - DNA-44
  - DNA-45
  - DNA-46
  - RFC-0355
  - RFC-0472
  - RFC-0356
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-46
  - DNA-44
# RFC-0396: Traceability to a vendored spec node: "<spec-id>/<node-id>", e.g. "pbp/RFC-PBP-020".
# Set by spec.materialize; leave commented for non-spec RFCs.
# specRef:
# RFC-0478: Platform versioning enforcement.
versionBump: patch
commands:
  proposed: []
  added:
    - sternsystem.status
  changed:
    - mission.open
    - mission.close
    - mission.abort
    - sternsystem.sync
  removed: []
appsImpacted: []
packagesImpacted:
  - "@gogol/site-kernel-handoff"
successSignals:
  - "mission.open commits and pushes bordbuch/events.ndjson to the system git repo after appending the mission-open entry"
  - "mission.close refuses to close a mission with null reconciledAt"
  - "mission.close commits and pushes bordbuch/events.ndjson after appending the mission-close entry"
  - "mission.close writes evidence/close-report.json with git, mirror, and reconcile status blocks"
  - "mission.abort commits and pushes bordbuch/events.ndjson after appending the mission-abort entry"
  - "sternsystem.sync commits and pushes bordbuch/events.ndjson after appending the mirror-sync entry"
  - "sternsystem.status --id <id> shows HEAD SHA, origin SHA, mirror SHA, dirty files, last 6 bordbuch events, and last reconciledAt"
  - "sternsystem.status --all shows status for every system in the registry"
nonGoals:
  - "Does not automate sternsystem.sync after mission.close — mirror sync remains a manual operator action"
  - "Does not add retry logic for git push failures — fail-fast on network errors"
  - "Does not verify bordbuch hash-chain integrity — that is bordbuch.validate"
  - "Does not show deployment status — that is leitstand.status"
  - "Does not perform live network calls to the mirror — sternsystem.status reads local refs only"
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

# RFC-0477: Ensure bordbuch git synchronization on mission lifecycle and add sternsystem.status

## Context

RFC-0355 established the mission lifecycle (open → reconcile → close/abort) and the Bordbuch as an append-only hash-chained log. RFC-0472 added `sternsystem.sync` for external mirror synchronization. Both RFCs define commands that mutate `bordbuch/events.ndjson` in the system's git repo, but neither requires those mutations to be committed and pushed back to the system's origin (bare repo).

The current `mission.reconcile` command (RFC-0356) commits and pushes reconciled content changes to the system git repo. However, `mission.reconcile` also performs `git fetch + reset --hard` on the next materialize, which discards any uncommitted bordbuch entries from prior `mission.open`, `mission.close`, `mission.abort`, or `sternsystem.sync` calls.

This was observed in production: mission `warpgogol-com-m000005` was opened, materialized, validated, reconciled, and closed, but the bordbuch `mission-open` entry for m000005 was lost because `mission.reconcile`'s `git reset --hard` overwrote the uncommitted entry written by `mission.open`. Only the `mission-close` entry survived (it was written after reconcile).

Additionally, there is no single command to inspect the synchronization state of a Sternsystem — operators must manually run `git log`, `git status`, and compare SHAs across the cache clone, bare repo, and mirror ref.

## Problem

Three gaps exist in the current mission lifecycle:

1. **Bordbuch entries are lost on reconcile.** `mission.open`, `mission.close`, `mission.abort`, and `sternsystem.sync` all append entries to `systems/<id>/bordbuch/events.ndjson` but do not commit or push them. When `mission.reconcile` runs `git fetch + reset --hard` on the next materialize, these uncommitted entries are silently discarded. This violates DNA-46's Bordbuch contract ("append-only hash-chained log that records lifecycle events") because entries vanish.

2. **No closure guarantee.** `mission.close` does not verify that `reconciledAt` is set, does not commit its own bordbuch entry, and does not report whether the system git repo, origin, and mirror are in sync. An operator closing a mission has no single view confirming that content was transferred, committed, and pushed.

3. **No status command.** There is no read-only command to inspect the git synchronization state of a Sternsystem. Operators must manually compare SHAs across the cache clone (`systems/<id>/.git`), the bare repo, and the mirror ref to determine whether the system, origin, and mirror are aligned.

## Decision

All four commands that mutate `bordbuch/events.ndjson` (`mission.open`, `mission.close`, `mission.abort`, `sternsystem.sync`) commit and push the bordbuch file to the system's git origin after appending their entry. `mission.close` additionally guards on `reconciledAt`, generates a `close-report.json` evidence artifact with git/mirror/reconcile status, and warns when the mirror is behind. A new read-only `sternsystem.status` command shows the full synchronization state of a Sternsystem.

## Architectural fit

- **DNA-46 (Mission lifecycle):** This RFC extends the mission lifecycle by ensuring bordbuch entries survive across materialize cycles. The bordbuch is defined as "an append-only hash-chained log that records lifecycle events" — uncommitted entries that get silently discarded by `git reset --hard` violate this contract.
- **DNA-44 (Sternsystem bundle contract):** The Sternsystem lives in its own git repo. Bordbuch entries are part of that repo. Committing them is consistent with the Sternsystem being a durable, independently versioned artifact.
- **RFC-0355 (Mission lifecycle and Bordbuch):** This RFC amends the behavior of `mission.open`, `mission.close`, and `mission.abort` by adding git commit+push after bordbuch append. Listed in `amends[]`.
- **RFC-0472 (sternsystem.sync):** This RFC amends `sternsystem.sync` by adding git commit+push after bordbuch append. The manual nature of sync is preserved. Listed in `amends[]`.
- **RFC-0356 (Mission materialization):** `mission.reconcile` already commits and pushes. This RFC ensures the other lifecycle commands do the same, preventing `reconcile`'s `git reset --hard` from destroying bordbuch entries.

## Design

### CLI surface

Modified commands (no new flags, behavioral change only):

```sh
pnpm exec site-kernel run mission.open --system <id> --brief <text>
pnpm exec site-kernel run mission.close --mission <id>
pnpm exec site-kernel run mission.abort --mission <id> --reason <text>
pnpm exec site-kernel run sternsystem.sync --id <id>
```

New command:

```sh
# Status for a single system (--id required)
pnpm exec site-kernel run sternsystem.status --id <id>

# Status for all systems (--id not required when --all is set)
pnpm exec site-kernel run sternsystem.status --all
```

### TypeScript contracts

Shared helper for bordbuch commit+push:

```ts
interface CommitAndPushResult {
  commitSha: string | null;
  pushed: boolean;
  error: string | null;
}

async function commitAndPushBordbuch(
  systemDir: string,
  message: string,
): Promise<CommitAndPushResult>;
```

Extended `mission.close` result:

```ts
interface MissionCloseData {
  missionId: string;
  systemId: string;
  state: "closed";
  closedAt: string;
  releaseId: string | null;
  closeReport: {
    git: {
      commitSha: string | null;
      pushed: boolean;
      pushError: string | null;
      dirtyFiles: string[];
    };
    mirror: {
      originSha: string | null;
      mirrorSha: string | null;
      inSync: boolean;
      recommendation: string | null;
    };
    reconcile: {
      reconciledAt: string;
      verified: boolean;
    };
  };
}
```

New `sternsystem.status` result:

```ts
interface SternsystemStatusData {
  systemId: string;
  git: {
    headSha: string | null;
    originSha: string | null;
    mirrorSha: string | null;
    headVsOrigin: "sync" | "behind" | "ahead" | "diverged" | "unknown";
    originVsMirror: "sync" | "behind" | "ahead" | "diverged" | "unknown";
    dirtyFiles: string[];
  };
  bordbuch: {
    lastEvents: BordbuchEntry[];
    totalEvents: number;
  };
  lastMission: {
    missionId: string | null;
    state: string;
    reconciledAt: string | null;
  } | null;
}
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `systems/<id>/bordbuch/events.ndjson` | Appended by lifecycle commands, committed and pushed by them |
| `systems/<id>/.git` | System git repo — commit target, push to origin |
| `missions/<mission>/evidence/close-report.json` | Written by `mission.close` |
| `missions/<mission>/mission.yaml` | Read by `mission.close` to check `reconciledAt` |
| `systems/registry.yaml` | Read by `sternsystem.status` to enumerate systems for `--all` |
| Bare repo (`systems-git/<id>`) | Read by `sternsystem.status` for origin and mirror SHA |
| `packages/os/site-kernel-handoff/AGENTS.md` | Update with `sternsystem.status` command and commit+push behavior |

### Output format

`mission.close` `--json`:

```json
{
  "command": "mission.close",
  "data": {
    "missionId": "warpgogol-com-m000005",
    "systemId": "warpgogol-com",
    "state": "closed",
    "closedAt": "2026-07-21T00:15:07.307Z",
    "releaseId": null,
    "closeReport": {
      "git": {
        "commitSha": "abc123def",
        "pushed": true,
        "pushError": null,
        "dirtyFiles": []
      },
      "mirror": {
        "originSha": "abc123def",
        "mirrorSha": "abb13b9",
        "inSync": false,
        "recommendation": "Mirror is behind origin. Run: sternsystem.sync --id warpgogol-com"
      },
      "reconcile": {
        "reconciledAt": "2026-07-21T00:14:57.263Z",
        "verified": true
      }
    }
  },
  "exitCode": 0,
  "summary": "[mission.close] closed mission warpgogol-com-m000005"
}
```

`sternsystem.status` `--json`:

```json
{
  "command": "sternsystem.status",
  "data": {
    "systemId": "warpgogol-com",
    "git": {
      "headSha": "abc123def",
      "originSha": "abc123def",
      "mirrorSha": "abb13b9",
      "headVsOrigin": "sync",
      "originVsMirror": "behind",
      "dirtyFiles": []
    },
    "bordbuch": {
      "lastEvents": [
        { "id": "event-000009", "kind": "mission-close", "occurredAt": "2026-07-21T00:15:07.311Z", "summary": "Mission warpgogol-com-m000005 closed" }
      ],
      "totalEvents": 9
    },
    "lastMission": {
      "missionId": "warpgogol-com-m000005",
      "state": "closed",
      "reconciledAt": "2026-07-21T00:14:57.263Z"
    }
  },
  "exitCode": 0,
  "summary": "[sternsystem.status] warpgogol-com: HEAD=origin, mirror behind by 1 commit"
}
```

### Failure modes

- **`mission.close` with null `reconciledAt`**: Hard error, exit non-zero. Message: "mission has not been reconciled — run mission.reconcile first".
- **Git push failure (offline, network)**: Non-fatal. The bordbuch entry is committed locally; push error is recorded in `closeReport.git.pushError` and the command succeeds. The next `sternsystem.sync` or manual `git push` will catch up.
- **Git commit failure (no changes, git not configured)**: Non-fatal. `commitSha` is null in the report; the command continues.
- **`sternsystem.status` with missing bare repo**: Returns `originSha: null`, `mirrorSha: null`, `headVsOrigin: "unknown"`, `originVsMirror: "unknown"`. Does not fail.
- **`sternsystem.status` with no mirror configured**: Returns `mirrorSha: null`, `originVsMirror: "unknown"`. Does not fail.
- **`sternsystem.status --all` with some systems failing**: Aggregates all results; individual system errors are included in the data array, exit code 0.

## Rollout

- **No flag day.** The behavioral changes (commit+push after bordbuch append, `reconciledAt` guard in `mission.close`) take effect immediately for all systems. There is no opt-in flag.
- **Existing systems.** Systems with uncommitted bordbuch entries from prior missions will have those entries committed by the next lifecycle command call. No migration script is needed.
- **`close-report.json`** is written for all future `mission.close` calls. Past missions are not retroactively backfilled.
- **`sternsystem.status`** is available immediately after implementation for all registered systems.
- **No pipeline integration.** These commands are operator-invoked, not part of `build.check`.

## Alternatives considered

1. **Automate `sternsystem.sync` inside `mission.close`.** Rejected: RFC-0472 explicitly states sync is a manual operator action. Push to GitHub may require SSH keys and network access; `mission.close` should not fail due to external network issues. Instead, `mission.close` warns when the mirror is behind.

2. **Add bordbuch commit to `mission.reconcile` only.** Rejected: `mission.reconcile` already commits, but the problem is that entries from `mission.open` (written before reconcile) are lost when reconcile does `git reset --hard`. The fix must be at the source — each command that writes bordbuch must commit its own entry.

3. **Separate `bordbuch.commit` command.** Rejected: adds an extra step that operators must remember. The commit should be automatic and transparent, part of the lifecycle command itself.

4. **Extend `sternsystem.validate` instead of adding `sternsystem.status`.** Rejected: `sternsystem.validate` checks structural integrity (registry schema, pin file, mirror URL). `sternsystem.status` checks runtime synchronization (SHA comparison, dirty files, bordbuch events). Different concerns, different audiences.

## Risks

- **Git push latency.** Each lifecycle command now performs a git push. On slow networks, this adds latency to `mission.open`/`close`/`abort`. Mitigated by non-fatal push handling — the command succeeds even if push fails.
- **Agent confusion.** Agents may interpret push failures as command failures and retry unnecessarily. Implementation notes must clarify that push failure is non-fatal and recorded in the report.
- **Bare repo ref drift.** `sternsystem.status` reads the mirror ref (detected via `git symbolic-ref HEAD` in the bare repo, not hardcoded to `master`) which is only updated on `git push mirror` / `git fetch mirror`. The SHA may be stale if sync was done out-of-band. Mitigated by documenting that mirror SHA is "last known" in the output.
- **Dirty file noise.** `git status --porcelain` may show generated files (`.astro/`, `dist/`) as dirty if `.gitignore` is incomplete. This is a pre-existing issue, not introduced by this RFC.

## Acceptance criteria

- [x] `commitAndPushBordbuch` helper implemented in `packages/os/site-kernel-handoff/src/bordbuch/bordbuch-io.ts` (evidence: packages/os/site-kernel-handoff/src/bordbuch/bordbuch-io.ts:312, build:check pass)
- [x] `mission.open` commits and pushes bordbuch after appending mission-open entry (evidence: packages/os/site-kernel-handoff/src/mission/mission-open.ts:139-141, build:check pass)
- [x] `mission.close` refuses to close when `reconciledAt` is null (evidence: packages/os/site-kernel-handoff/src/mission/mission-close.ts:105-108, build:check pass)
- [x] `mission.close` commits and pushes bordbuch after appending mission-close entry (evidence: packages/os/site-kernel-handoff/src/mission/mission-close.ts:149-154, build:check pass)
- [x] `mission.close` writes `evidence/close-report.json` with git, mirror, and reconcile blocks (evidence: packages/os/site-kernel-handoff/src/mission/mission-close.ts:217-239, build:check pass)
- [x] `mission.abort` commits and pushes bordbuch after appending mission-abort entry (evidence: packages/os/site-kernel-handoff/src/mission/mission-abort.ts:109-111, build:check pass)
- [x] `sternsystem.sync` commits and pushes bordbuch after appending mirror-sync entry (evidence: packages/os/site-kernel-handoff/src/sternsystem/sternsystem-sync.ts:211-213, build:check pass)
- [x] `sternsystem.status` command registered with `mutatesState: false` (evidence: packages/os/site-kernel-handoff/src/sternsystem/index.ts:121-138, build:check pass)
- [x] `sternsystem.status --id <id>` shows HEAD SHA, origin SHA, mirror SHA, dirty files, last 6 bordbuch events, last reconciledAt (evidence: packages/os/site-kernel-handoff/src/sternsystem/sternsystem-status.ts:100-180, build:check pass)
- [x] `sternsystem.status --all` iterates all systems from registry (evidence: packages/os/site-kernel-handoff/src/sternsystem/sternsystem-status.ts:195-215, build:check pass)
- [x] `--json` output format matches the documented shapes (evidence: SternsystemStatusData interface at sternsystem-status.ts:44-56, MissionCloseData at mission-close.ts:53-60, build:check pass)
- [x] `rfc.validate` passes on this file (evidence: rfc.validate RFC-0477 --json exit 0, 0 violations)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- Git push failures in lifecycle commands are NON-FATAL. Agents MUST NOT interpret a push failure as a command failure or retry the entire command. The bordbuch entry is committed locally; the next `sternsystem.sync` or manual `git push` will catch up.
- `mission.close` MUST refuse to close a mission with null `reconciledAt`. This is a hard guard, not a warning.
- `sternsystem.status` is read-only. Agents MUST NOT use it as a precondition for mutating commands — it is a diagnostic snapshot, not a lock.
- The `commitAndPushBordbuch` helper MUST only stage `bordbuch/events.ndjson`, not `git add -A`. Other dirty files are reported but not committed by lifecycle commands.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id <this-rfc-id> --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
