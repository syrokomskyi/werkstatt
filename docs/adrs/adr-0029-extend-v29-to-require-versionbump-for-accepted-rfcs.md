---
id: ADR-0029
title: "Extend V-29 to require versionBump for accepted RFCs"
status: accepted
scope: package
decider: architecture
createdAt: 2026-08-06
updatedAt: 2026-08-06
implementedAt: 2026-08-06
related:
  - RFC-0478
reviewers:
  - human:andrii-syrokomskyi
---

# ADR-0029: Extend V-29 to require versionBump for accepted RFCs

## Context

RFC-0478 introduced V-29, which requires the `versionBump` frontmatter field for post-cutoff RFCs with `status: implemented`. The rule ensures version semantics are declared before a platform commit references the RFC via `ecosystem.commit --rfc`.

However, `ecosystem.commit` can be invoked with `--rfc` pointing to an RFC that has `status: accepted` (not yet implemented). In this case, the command reads `versionBump` from the RFC frontmatter to determine the bump type. If the field is absent, EC-05 blocks the commit. This means the operator must add `versionBump` reactively, at commit time, rather than at acceptance time when the version impact is best understood.

The gap was discovered during a review of the `ecosystem.commit` version bump reliability fix (commit `021c069e`), which also extended V-29 to `accepted` status in the code. This ADR documents the governance trail for that code change.

## Decision

V-29 is extended to require `versionBump` for post-cutoff RFCs with `status: accepted` or `status: implemented`.

- The `requiresVersionBump` condition in `validateSingleRfc` checks `status === "implemented" || status === "accepted"`.
- The violation message uses `"${status}"` interpolation so it reports the actual status.

## Justification

- **Acceptance is when version impact is known.** When an RFC transitions to `accepted`, the scope and breaking nature of the change are clear. Deferring `versionBump` to implementation time means the field is filled reactively, often as a default `patch`, undermining the semantic versioning signal.
- **Consistency with `ecosystem.commit` behavior.** The command already requires `versionBump` to be present (EC-05) when `--rfc` is used, regardless of RFC status. V-29 should enforce the same requirement at validation time.
- **Low risk of false positives.** Post-cutoff accepted RFCs (createdAt >= 2026-07-21) that lack `versionBump` are already blocked by EC-05 when referenced in a commit. This ADR makes the validation catch the issue earlier, at `rfc.validate` time.

## Consequences

- Positive: Version semantics are declared at acceptance time, providing a reliable signal for release planning and `platform.consistency.validate`.
- Positive: `rfc.validate` catches missing `versionBump` before the operator attempts a commit, reducing friction.
- Negative: Accepted RFCs that predate the cutoff (before 2026-07-21) remain exempt, creating a slight inconsistency. This is acceptable — those RFCs predate the `versionBump` field entirely.

## Evolution

If `versionBump` semantics change (e.g. new bump types like `pre-release`), V-29 and this ADR should be revisited. If the `accepted` → `implemented` transition is reformed (e.g. a single `decided` status), the condition should be updated accordingly.
