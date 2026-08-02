---
id: ADR-0016
title: "Document --site vs --mission flag convention for kernel commands"
# Lifecycle (RFC-0367 parity with RFCs):
#   proposed → reviewing → accepted → implemented
#   any → superseded (requires supersededBy)
#   any → rejected
status: proposed
scope: workspace
decider: architecture
createdAt: 2026-08-02
updatedAt: 2026-08-02
implementedAt:
closedAt:
supersedes: []
supersededBy:
related:
  - RFC-0646
  - RFC-0647
reviewers:
  - human:andrii-syrokomskyi
---

# ADR-0016: Document --site vs --mission flag convention for kernel commands

## Context

Mission `warpgogol-com-m000024` (closed 2026-08-02) encountered a `KERNEL-FLAG-03` error when the operator ran `mission.validate --site warpgogol-com` instead of `mission.validate --mission warpgogol-com-m000024`. The command requires `--mission` because it operates on a specific mission, not on a site in general. This is not a bug — it is an intentional convention across the kernel command surface.

The kernel has two categories of commands:

1. **Site-scoped commands** — operate on a site regardless of mission state. Use `--site <systemId>` (e.g. `routes.generate --site warpgogol-com`, `preview.images.generate --site warpgogol-com`, `config.regenerate --site warpgogol-com`).
2. **Mission-scoped commands** — operate on a specific mission within a site. Use `--mission <missionId>` (e.g. `mission.validate --mission warpgogol-com-m000024`, `mission.close --mission warpgogol-com-m000024`, `mission.materialize --mission warpgogol-com-m000024`, `release.prepare --mission warpgogol-com-m000024`).

The convention is enforced by `flagString(input, "mission")` / `flagString(input, "system")` calls in command handlers, which throw `KERNEL-FLAG-03: Required flag "--mission" is missing` when the expected flag is absent. There is no alias or auto-derivation from `--site` to `--mission`.

This convention was established implicitly through RFC-0221 (mission lifecycle), RFC-0357 (release.prepare), RFC-0480 (mission.git.commit), and others, but was never documented as a standalone decision.

## Decision

Kernel commands use `--mission <missionId>` for mission-scoped operations and `--site <systemId>` for site-scoped operations, with no cross-derivation between the two.

- Mission-scoped commands (`mission.validate`, `mission.close`, `mission.materialize`, `mission.git.commit`, `mission.reconcile`, `release.prepare`, `release.publish`) require `--mission` and do not accept `--site`.
- Site-scoped commands (`routes.generate`, `preview.images.generate`, `config.regenerate`, `bordbuch.generate`, `bordbuch.commit`) require `--site` (or `--system`) and do not accept `--mission`.
- `mission.open` uses `--system` (not `--mission`) because the mission ID does not exist yet at open time — it is derived from the system ID.

## Justification

The `--mission` / `--site` split reflects a real semantic boundary: a mission is a scoped unit of work within a site's lifecycle. A site can have zero, one, or multiple missions over time, and mission-scoped commands need the exact mission ID to resolve the correct workpiece, bordbuch entries, and release manifest.

Auto-deriving `--mission` from `--site` (via `registry.currentMission`) was considered and rejected because:

- `currentMission` may be `null` (no active mission) or point to a closed/aborted mission.
- The operator may need to validate or close a specific mission that is not the `currentMission` (e.g. investigating a past mission).
- Silent auto-derivation hides the actual target from the operator, making errors harder to diagnose.

The explicit `--mission` flag forces the operator to state their intent, which is consistent with the kernel's design philosophy of explicit, auditable operations.

## Consequences

- **Positive**: Command scope is unambiguous from the flag name. `--mission` always means mission-scoped, `--site` always means site-scoped. Error messages (`KERNEL-FLAG-03`) clearly indicate which flag is required.
- **Positive**: No hidden state dependency — the operator explicitly states the target, not relying on `registry.currentMission`.
- **Negative**: Operators must know whether a command is mission-scoped or site-scoped before running it. This is a learning curve for new operators.
- **Negative**: No shorthand for the common case of "the current mission" — the operator must always type the full mission ID.
- **Technical debt**: The convention is not enforced by a validator — a new command could accidentally accept both `--site` and `--mission` without a lint rule catching it. A future `kernel-flags-lint` rule could enforce this convention.

## Evolution

This decision would be revisited if:

- A new command category emerges that does not fit the site/mission binary (e.g. `--release <releaseId>` for release-scoped commands that are not mission-scoped — `release.validate`, `release.list` already use `--release`).
- The operator friction of typing full mission IDs becomes significant enough to justify a `--current-mission` shorthand that resolves via `registry.currentMission`.
- A `kernel-flags-lint` rule is added to enforce the convention automatically — at that point, this ADR would be referenced by the RFC that adds the lint rule.

References: `mission-close.ts` (`--mission` required), `mission-materialize.ts` (`--mission` required), `mission-open.ts` (`--system` required), `release.module.ts` (`--mission` for `release.prepare`, `--release` for `release.validate`).
