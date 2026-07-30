---
id: ADR-0010
title: "Stop mission dev server on mission close"
# Lifecycle (RFC-0367 parity with RFCs):
#   proposed → reviewing → accepted → implemented
#   any → superseded (requires supersededBy)
#   any → rejected
status: proposed
scope: package
decider: architecture
createdAt: 2026-07-30
updatedAt: 2026-07-30
implementedAt:
closedAt:
supersedes: []
supersededBy:
related:
  - RFC-0355
  - RFC-0480
reviewers:
  - human:andrii-syrokomskyi
---

# ADR-0010: Stop mission dev server on mission close

## Context

`mission.preview` (RFC-0480, `packages/os/site-kernel-handoff/src/mission/mission-preview.ts`) starts a blocking Astro dev/preview server for a mission workpiece via `spawn("pnpm", ["exec", "astro", cmd, "--port", ...])` with `stdio: "inherit"`. The server runs in the foreground until the operator presses Ctrl+C.

`mission.close` (RFC-0355, `packages/os/site-kernel-handoff/src/mission/mission-close.ts`) transitions the mission to `closed`, commits bordbuch entries, writes evidence reports, and copies media caches — but does not stop any running dev server for that mission's workpiece. If the operator runs `mission.close` from a different terminal than the one running `mission.preview`, the dev server remains alive on its port (default 4321), holding the port and serving stale content from a now-closed mission.

`mission.preview` already calls `astro dev stop` via `spawnSync` before starting a new server (line 70-73 of `mission-preview.ts`), establishing a precedent for programmatic server shutdown within the same package.

## Decision

`mission.close` stops any running dev/preview server for the mission's workpiece before transitioning the mission to `closed`.

- The stop is best-effort: if no server is running, the stop command silently succeeds (no error).
- The mechanism reuses the existing `astro dev stop` pattern from `mission.preview`, invoked via `spawnSync` against the workpiece directory.

## Justification

- **Consistency with `mission.preview`**: `mission.preview` already calls `astro dev stop` before starting a new server. Using the same mechanism in `mission.close` keeps the shutdown path uniform and predictable.
- **No new command needed**: this is an addition to the existing `mission.close` handler, not a new Site OS command. No new flags, no PID tracking, no lock-file contract — just a `spawnSync` call before the close proceeds.
- **Port hygiene**: without this, a closed mission's dev server lingers on its port, blocking future `mission.preview` invocations for other missions that default to the same port (4321).
- **Alternative considered — PID file tracking**: writing a PID file per mission and sending `SIGTERM` to that PID. Rejected because it introduces a cross-workspace contract (PID file path that other packages would need to read) and requires cleanup on crash recovery. The `astro dev stop` approach is self-contained.
- **Alternative considered — `pkill` by port**: using `lsof`/`fuser` to find and kill the process on the port. Rejected because it is platform-dependent and could kill unrelated processes that happen to use the same port. `astro dev stop` is scoped to the workpiece directory and only stops servers started from that directory.

## Consequences

- **Positive**: closing a mission from any terminal automatically frees the dev server port and stops serving stale content from a closed workpiece.
- **Positive**: no operator action required — the stop is part of the close lifecycle, not a separate manual step.
- **Negative**: if the operator intentionally wants to keep the dev server running after close (e.g. for post-close inspection), they must start it manually again via `mission.preview` (which works for closed missions per RFC-0480).
- **Technical debt**: `astro dev stop` is an Astro CLI feature that may change or be removed in future Astro versions. If it becomes unavailable, the stop step will silently fail (best-effort) and the operator will need to kill the process manually. No fallback mechanism is implemented now.

## Evolution

- If `astro dev stop` is removed or renamed in a future Astro version, switch to PID-file-based process tracking or `pkill` by port. This would elevate the decision to an RFC if it introduces a cross-workspace PID/lock contract.
- If mission abort (`mission.abort`) also needs to stop the dev server, extract the stop logic into a shared helper in `site-kernel-handoff` and call it from both close and abort handlers.
- If per-mission port assignment becomes standard (e.g. deterministic port per system id), revisit whether `astro dev stop` from the workpiece directory is sufficient or whether port-based kill is needed.
