---
id: ADR-0050
title: "Clarify CREG-05 content drift warning on mission.close to distinguish blocking from non-blocking"
status: implemented
scope: package
decider: architecture
createdAt: 2026-08-16
updatedAt: 2026-08-16
implementedAt: 2026-08-16
closedAt: 2026-08-16
supersedes: []
supersededBy:
related: []
reviewers:
  - human:andrii-syrokomskyi
---

# ADR-0050: Clarify CREG-05 content drift warning on mission.close to distinguish blocking from non-blocking

## Context

During the m000060 pipeline test (2026-08-16), `mission.close` emitted a confusing warning:

> Warning: failed to write materialization state or copy .cache/: [mission.close] CREG-05: Content drift exists but no review.yaml has been processed. Run: pnpm exec werkstatt run content.regression.review.generate --site warpgogol-com

The warning is non-blocking — `mission.close` still succeeds. However, the warning text "failed to write materialization state" sounds like an error, and the instruction to run `content.regression.review.generate` is unclear when the agent has not intentionally created content drift.

## Decision

Clarify the CREG-05 warning message on `mission.close` to explicitly state that:

1. The warning is **non-blocking** — `mission.close` has completed successfully.
2. Content drift is **expected** when content was changed during the mission — it is not an error.
3. The `content.regression.review.generate` command is **optional** for missions that intentionally changed content.
4. The warning should only appear when content drift is unexpected (e.g., no content files were modified but drift is detected).

- The warning message should be reworded from "failed to write materialization state" to something like: "[mission.close] CREG-05: Content drift detected (expected after content changes). Review generation skipped — run content.regression.review.generate --site <siteId> if regression review is needed."

## Consequences

- Agents will no longer be confused by the CREG-05 warning during `mission.close`.
- The warning will clearly communicate that it is informational, not an error.

## Justification

The original CREG-05 implementation threw an error that was caught by the outer try/catch in `mission.close`, wrapping it in the confusing "failed to write materialization state" message. This made a non-blocking condition look like a fatal error. Since content drift is the expected outcome of any content-changing mission, treating it as an error is incorrect. A clear, non-blocking warning is the right level of communication.

## Evolution

If future requirements need CREG-05 to be blocking again (e.g., for regulated environments where unreviewed drift must not ship), add a `--strict-content-regression` flag that restores the throw behavior. The current `--skip-content-regression` flag already provides an opt-out for the warning.
