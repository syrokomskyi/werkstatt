---
id: RFC-0705
title: "Enforce sternsystem.sync in mission lifecycle"
status: implemented
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
createdAt: 2026-08-05
updatedAt: 2026-08-05
enhancedAt: 2026-08-05
implementedAt: 2026-08-05
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy:
  - RFC-0762
related:
  - RFC-0472
  - RFC-0477
  - RFC-0574
  - RFC-0355
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-46
  - DNA-44
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
    - mission.reconcile
    - mission.close
  removed: []
appsImpacted: []
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - "@warpgogol/site-kernel-handoff"
successSignals:
  - "mission.reconcile logs a non-fatal warning when external mirror sync fails"
  - "mission.close blocks when external mirrors are out of sync after reconcile"
  - "AGENTS.md rule 'MUST invoke sternsystem.sync after reconcile' is enforced by code, not convention"
nonGoals:
  - "Adding retry logic to sternsystem.sync itself (fail-fast remains per RFC-0472)"
  - "Changing sternsystem.sync command interface or flags"
  - "Syncing mirrors on mission.abort or mission.cleanup"
  - "Adding mirror sync to leitstand.dev-deploy or leitstand.propagate"
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

# RFC-0705: Enforce sternsystem.sync in mission lifecycle

## Context

The mission lifecycle (DNA-46) requires that after `mission.reconcile` merges workpiece commits into the cache clone and pushes to the bare repo, the external mirrors (GitHub, backup endpoints) are synchronized via `sternsystem.sync`. RFC-0472 established `sternsystem.sync` and RFC-0574 defined the star topology (cache → bare → external).

The AGENTS.md rule states:

> Agents MUST invoke `sternsystem.sync --id <id>` automatically after a successful `mission.reconcile` if the system's `mirrors[]` array contains external mirrors (indices 2+).

This rule is **conventional, not enforced by code**. `mission.reconcile` pushes to the bare repo (mirrors[1]) via `git push origin` with retry, but does not call `sternsystem.sync` to push from bare to external mirrors (mirrors[2+]). `mission.close` checks mirror status for its close report but does not block on desync.

An agent that forgets to run `sternsystem.sync` after reconcile produces a closed mission with external mirrors behind the bare repo — a silent consistency gap that is only visible in `closeReport.mirror.recommendation`.

## Problem

DNA-46 (Mission lifecycle) ensures every change passes through open → reconcile → close. The reconcile step merges workpiece commits into the cache clone and pushes to the bare repo. But the **bare → external mirror** push is a separate command (`sternsystem.sync`) that is only triggered by agent convention.

The gap: an agent can run `mission.reconcile` + `mission.close` without ever calling `sternsystem.sync`. The mission closes successfully, bordbuch is committed, evidence is synced to R2 — but external mirrors (GitHub) remain behind the bare repo. The desync is recorded in `closeReport.mirror.recommendation` as a non-blocking warning.

This violates the spirit of DNA-46 (complete lifecycle) and creates a reliability gap: external mirrors are the disaster-recovery source. If the bare repo is lost and the external mirror was never synced, the latest mission work is unrecoverable.

The current enforcement is a prose rule in AGENTS.md — agents must remember to run `sternsystem.sync` after reconcile. There is no code-level guarantee.

## Decision

`mission.reconcile` gains a **non-fatal best-effort mirror sync** step: after the successful `git push origin` to the bare repo, reconcile invokes `sternsystem.sync --id <systemId>` to push from bare to external mirrors. If the sync fails (network error, external mirror unavailable), reconcile logs a `logger.warn` and continues — the mission remains `open` and re-reconcilable (idempotent).

`mission.close` gains a **blocking mirror sync check**: after the existing `closeReport.mirror` status gathering, if external mirrors are configured (mirrors[2+]) and `closeReport.mirror.inSync === false`, close throws an error with the recommendation from the mirror status check. The operator must run `sternsystem.sync --id <id>` manually and re-run `mission.close`.

This two-phase approach guarantees:

1. **Reconcile attempts sync** — external mirrors are updated as part of the reconcile flow, not as a separate agent responsibility.
2. **Close blocks on desync** — a mission cannot close with external mirrors behind the bare repo, enforcing the AGENTS.md rule by code, not convention.
3. **Reconcile remains resilient** — transient network failures to external mirrors do not block reconcile (non-fatal warning). The blocking check is deferred to close, where the operator can decide to retry sync or investigate.

## Architectural fit

- **DNA-46 (Mission lifecycle)** — this RFC closes the gap between reconcile and close by ensuring external mirror sync is attempted during reconcile and verified during close. The mission lifecycle becomes a complete pipeline: open → materialize → validate → reconcile (+ sync) → close (with sync verification).
- **DNA-44 (Sternsystem bundle contract)** — external mirrors are the disaster-recovery source for Sternsystem repos. Enforcing sync protects the durability guarantee.
- **RFC-0472** — `sternsystem.sync` remains fail-fast (no retry logic added). This RFC calls it best-effort from reconcile, wrapping the call in try/catch — the fail-fast behavior is preserved within the sync command itself.
- **RFC-0574** — star topology (cache → bare → external) is unchanged. Reconcile already handles cache → bare; this RFC adds bare → external as part of the same flow.
- **Site OS operator model** — no new commands. `mission.reconcile` and `mission.close` behavior changes are internal to the handoff package. The AGENTS.md rule transitions from conventional to enforced.

## Design

### CLI surface

No new commands. No new flags. The operator runs the same commands as before:

```sh
pnpm exec werkstatt run mission.reconcile --mission <id>
pnpm exec werkstatt run mission.close --mission <id>
```

The behavior change is internal: reconcile now attempts `sternsystem.sync` after the bare repo push, and close blocks if external mirrors are desynced.

### TypeScript contracts

The `MissionReconcileData` interface gains an optional `mirrorSync` field:

```ts
interface MissionReconcileData {
  missionId: string;
  systemId: string;
  commitSha: string | null;
  preReconcileSha: string | null;
  reconciledAt: string;
  // ... existing fields ...
  mirrorSync?: {
    attempted: boolean;
    succeeded: boolean;
    error: string | null;
  };
}
```

The `CloseReport.mirror` interface is unchanged — `inSync` and `recommendation` already exist. The close handler adds a blocking check after building `closeReport`:

```ts
if (entry && entry.mirrors.length > 2 && !mirrorInSync) {
  throw new Error(
    `[mission.close] external mirrors are out of sync for system '${manifest.systemId}'. ` +
    `${recommendation ?? "Run: sternsystem.sync --id " + manifest.systemId}`,
  );
}
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/os/site-kernel-handoff/src/mission/mission-materialization-commands.ts` | `runMissionReconcile` — add `sternsystem.sync` call after `git push origin` |
| `packages/os/site-kernel-handoff/src/mission/mission-close.ts` | `runMissionClose` — add blocking mirror sync check after `closeReport` assembly |
| `AGENTS.md` | Update the rule from "MUST invoke" to "automatically enforced by mission.reconcile and mission.close" |

### Output format

`mission.reconcile` JSON output gains a `mirrorSync` field:

```json
{
  "data": {
    "missionId": "warpgogol-com-m000031",
    "systemId": "warpgogol-com",
    "commitSha": "abc123def456",
    "mirrorSync": {
      "attempted": true,
      "succeeded": true,
      "error": null
    }
  },
  "summary": "[mission.reconcile] warpgogol-com-m000031 reconciled (abc123d4, 3 commits merged, mirrors synced)"
}
```

When sync fails (non-fatal):

```json
{
  "data": {
    "mirrorSync": {
      "attempted": true,
      "succeeded": false,
      "error": "git push to git@github.com:... failed: Connection timed out"
    }
  },
  "summary": "[mission.reconcile] warpgogol-com-m000031 reconciled (abc123d4, 3 commits merged, mirror sync failed — non-fatal)"
}
```

`mission.close` error output when mirrors are desynced:

```
Error: [mission.close] external mirrors are out of sync for system 'warpgogol-com'.
Mirror is behind origin. Run: sternsystem.sync --id warpgogol-com
```

### Failure modes

**Reconcile — mirror sync failure (non-fatal):**

- `sternsystem.sync` throws (network error, external mirror unavailable)
- Reconcile catches the error, logs `logger.warn`, sets `mirrorSync: { attempted: true, succeeded: false, error: <message> }`
- Reconcile continues and completes successfully — mission remains `open`
- Operator can re-run reconcile (idempotent — resets to `preReconcileSha` and re-merges) or run `sternsystem.sync` manually before close

**Close — mirrors desynced (blocking):**

- `closeReport.mirror.inSync === false` and external mirrors are configured
- Close throws an error before writing `close-report.json` or transitioning state
- Mission remains `open` — no state change, no bordbuch entry
- Operator runs `sternsystem.sync --id <id>` manually, then re-runs `mission.close`

**Close — no external mirrors configured:**

- Systems with `mirrors.length <= 2` (no external mirrors) are unaffected
- The blocking check only applies when `mirrors[2+]` exist

## Rollout

- **Default behavior**: both changes are active immediately upon implementation. No flags, no grace period.
- **Existing systems**: all Sternsystems with external mirrors (mirrors[2+]) gain the enforcement automatically on their next mission. Systems without external mirrors are unaffected.
- **No migration path needed**: the changes are internal to `mission.reconcile` and `mission.close`. No data migration, no schema change, no pin file update.
- **AGENTS.md update**: the rule transitions from "Agents MUST invoke" to "Automatically enforced by mission.reconcile (best-effort) and mission.close (blocking check)". The manual `sternsystem.sync` invocation remains available as a standalone command for ad-hoc sync needs.

## Alternatives considered

- **Blocking sync in reconcile only** — reject if `sternsystem.sync` fails during reconcile. Rejected because reconcile is already network-aware (git push with retry) and transient GitHub outages would block the entire mission flow. The two-phase approach (non-fatal in reconcile, blocking in close) gives the operator a window to retry.

- **Blocking sync in close only** — don't call `sternsystem.sync` from reconcile at all, just block in close if mirrors are desynced. Rejected because it shifts all sync responsibility to the operator. Reconcile is the natural place to attempt sync (it just pushed to bare), and close only needs to verify.

- **Best-effort sync in close (non-blocking)** — log a warning in close if mirrors are desynced, but don't block. Rejected because this is the current behavior (via `closeReport.mirror.recommendation`) and it doesn't enforce anything — the mission closes with desynced mirrors.

- **Add `sternsystem.sync` as a pipeline step in `build.prepare`** — rejected because `build.prepare` runs during `mission.validate`, which is too early (reconcile hasn't happened yet). Sync must happen after the cache clone has the merged commits.

## Risks

- **Close blocking on transient GitHub outage** — if GitHub is temporarily unavailable during close, the mission cannot close until the operator manually syncs. Mitigation: the operator can run `sternsystem.sync` repeatedly until GitHub recovers, then re-run close. The error message includes the exact command to run.

- **Reconcile latency increase** — `sternsystem.sync` adds a network push to external mirrors, adding 2-10 seconds to reconcile. This is acceptable given the reliability benefit.

- **False positive mirror desync** — the `closeReport.mirror` check compares `originSha` vs `mirrorSha` in the bare repo. If the bare repo's mirror ref is missing (e.g. first sync after mirror configuration), close will block. Mitigation: run `sternsystem.sync` once manually after adding a new external mirror, before opening a mission.

- **Agent confusion** — agents accustomed to running `sternsystem.sync` manually after reconcile may be confused by the automatic call. The reconcile summary and `mirrorSync` field in the output make the automatic sync visible.

## Acceptance criteria

- [x] `MissionReconcileData` interface includes optional `mirrorSync` field with `attempted`, `succeeded`, `error` (evidence: packages/os/site-kernel-handoff/src/mission/mission-materialization-commands.ts:826-830, build:check passes)
- [x] `mission.reconcile` calls `sternsystem.sync --id <systemId>` after successful `git push origin` to bare repo (evidence: packages/os/site-kernel-handoff/src/mission/mission-materialization-commands.ts:1175-1211, rfc-0705-mirror-sync.test.ts test 1)
- [x] `mission.reconcile` catches sync failures non-fatally (logger.warn, continues, mission stays open) (evidence: packages/os/site-kernel-handoff/src/mission/mission-materialization-commands.ts:1200-1204, rfc-0705-mirror-sync.test.ts test 2)
- [x] `mission.reconcile` summary includes mirror sync status when external mirrors are configured (evidence: packages/os/site-kernel-handoff/src/mission/mission-materialization-commands.ts:1263-1267, rfc-0705-mirror-sync.test.ts test 1 summary contains "mirrors synced")
- [x] `mission.close` throws when `closeReport.mirror.inSync === false` and `mirrors.length > 2` (evidence: packages/os/site-kernel-handoff/src/mission/mission-close.ts:316-322, rfc-0705-mirror-sync.test.ts test 3)
- [x] `mission.close` does NOT throw when no external mirrors are configured (`mirrors.length <= 2`) (evidence: packages/os/site-kernel-handoff/src/mission/mission-close.ts:317, rfc-0705-mirror-sync.test.ts test 4)
- [x] `mission.close` error message includes the `sternsystem.sync` command to run (evidence: packages/os/site-kernel-handoff/src/mission/mission-close.ts:320, rfc-0705-mirror-sync.test.ts test 3 matches /sternsystem.sync/)
- [x] Unit test: reconcile with successful sync → `mirrorSync.succeeded === true` (evidence: packages/os/site-kernel-handoff/src/tests/rfc-0705-mirror-sync.test.ts test 1, vitest run passes)
- [x] Unit test: reconcile with sync failure → `mirrorSync.succeeded === false`, reconcile completes (evidence: packages/os/site-kernel-handoff/src/tests/rfc-0705-mirror-sync.test.ts test 2, vitest run passes)
- [x] Unit test: close with desynced mirrors → throws with actionable error message (evidence: packages/os/site-kernel-handoff/src/tests/rfc-0705-mirror-sync.test.ts test 3, vitest run passes)
- [x] Unit test: close with no external mirrors → does not throw (evidence: packages/os/site-kernel-handoff/src/tests/rfc-0705-mirror-sync.test.ts test 4, vitest run passes)
- [x] `AGENTS.md` updated: rule transitions from conventional to enforced (evidence: AGENTS.md:18-19, packages/os/site-kernel-handoff/AGENTS.md:37-38)
- [x] `rfc.validate` passes on this file before merging (evidence: `pnpm exec werkstatt run rfc.validate --id RFC-0705 --json` — 0 errors)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- For RFCs created on or after 2026-07-07 with acceptance probes: before stamping `implemented`, run `site-kernel run rfc.verification.emit --id <this-rfc-id>` and commit the evidence file in the same commit (RFC-0330 amended transition precondition).
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id <this-rfc-id> --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
- The `sternsystem.sync` call in reconcile MUST use `executeKernelCommand` (dynamic import from `@warpgogol/site-kernel`), not a direct function call — this preserves the kernel command boundary and ensures the sync command's own error handling applies.
- Reconcile MUST check `entry.mirrors.length > 2` before calling `sternsystem.sync` — systems without external mirrors skip the sync call entirely, avoiding an unnecessary bordbuch entry.
- The `sternsystem.sync` call from reconcile produces a `mirror-sync` bordbuch entry and a `commitAndPushBordbuch` commit/push in the cache clone. This is acceptable because the `system:<id>` lock is held during reconcile, preventing concurrent bordbuch access. The bordbuch entry provides auditability for the automatic sync.
- The automatic sync only applies when the cache clone is a git repository (the `existsSync(gitDir)` branch in reconcile). Non-git cache clones use the `copyDir` fallback and skip the sync call.
- The blocking check in close MUST be placed BEFORE the state transition (`manifest.state = "closed"`) — in the current `mission-close.ts` code, the state transition (line 263) precedes `closeReport` assembly (line 376). The mirror status gathering (lines 316–364) must be moved before the state transition, and the blocking check placed there. The `closeReport` can then reuse the already-gathered mirror status. This ensures a mirror desync blocks before any irreversible close actions (state transition, bordbuch entry, evidence sync).
- The `mirrorSync` field MUST be included in `evidence/reconciliation-report.json` for auditability.
- Re-running reconcile (idempotent path) re-calls `sternsystem.sync` — this is safe because pushing already-synced commits to external mirrors is a no-op.
- Compass `docs/*.xml` files do not reference `mission.reconcile`, `mission.close`, or `sternsystem.sync` behavior — no `docs/*.xml` synchronization is needed for this RFC.
