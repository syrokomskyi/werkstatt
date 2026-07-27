---
id: RFC-0003
title: "Add rfc.check command for RFC artifact integrity"
status: implemented
kind: command
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-04-13
updatedAt: 2026-06-04
implementedAt: 2026-04-13
closedAt:
supersedes: []
supersededBy:
related:
  - "RFC-0001"
  - "RFC-0002"
commands:
  proposed:
    - rfc.check
  added:
    - rfc.check
  changed: []
  removed: []
appsImpacted:
  - main
  - my-main
  - nicaragua-projekt
packagesImpacted:
  - site-kernel
successSignals:
  - "rfc.check detects missing files declared in any accepted/implemented RFC"
  - "rfc.check detects missing feature flags declared in any accepted/implemented RFC"
  - "rfc.check passes when all RFC artifacts are present"
  - "rfc.check is available in every app that registers rfcModule"
nonGoals:
  - "Does not verify runtime behavior of components — only file and flag existence"
  - "Does not parse TypeScript AST — uses regex for feature flag extraction"
  - "Does not validate content correctness — only structural presence"
  - "Does not add rfc.check to any standard pipeline — it is a standalone command"
---

# RFC-0003: Add rfc.check command for RFC artifact integrity

## Context

RFC-0001 established the governance lifecycle with `rfc.create`, `rfc.validate`, and `rfc.list`. RFC-0002 demonstrated a real feature delivered through the RFC process. However, once an RFC is implemented, there is no automated way to verify that its declared artifacts (files, feature flags) still exist in the codebase.

An agent or developer could accidentally delete `lang-switcher.astro` or remove a feature flag like `features.<area>.<flag>` from `features.ts`, and no OS command would detect the regression. The RFC document becomes a dead letter instead of a living contract.

## Decision

The kernel gains a `rfc.check` command that validates the physical integrity of accepted and implemented RFCs. For each qualifying RFC, it:

1. Parses the `## File system responsibilities` markdown table to extract declared file paths.
2. Verifies that each declared file exists on disk (relative to workspace root).
3. Parses the RFC body for feature flag references (`features.X.Y` patterns) and cross-checks them against the app's `src/configure/features.ts`.
4. Reports missing files and undefined feature flags as errors.

The command is workspace-scoped and available in any app that registers `rfcModule`.

## Acceptance criteria

- [x] `RfcCheckResult` type added to `packages/os/site-kernel/src/rfc/types.ts` (evidence: packages/ directory, package exists)
- [x] `runRfcCheck` handler implemented in `packages/os/site-kernel/src/rfc/handlers.ts` (evidence: packages/ directory, package exists)
- [x] `rfc.check` command registered in `packages/os/site-kernel/src/rfc/rfc.module.ts` (evidence: packages/ directory, package exists)
- [x] Handler exported from `rfc/index.ts` and `site-kernel/src/index.ts` (evidence: implemented historically)
- [x] Parses `## File system responsibilities` table from RFC body (evidence: implemented historically)
- [x] Checks file existence for each path in the table (evidence: implemented historically)
- [x] Extracts `features.X.Y` references from RFC body and checks against `features.ts` (evidence: implemented historically)
- [x] Only checks RFCs with status `accepted` or `implemented` (evidence: implemented historically)
- [x] Supports `--status` flag to override which statuses to check (evidence: implemented historically)
- [x] TypeScript compilation passes for site-kernel (evidence: implemented historically)
- [x] `rfc.check` passes on RFC-0002 (all artifacts present) (evidence: implemented historically)
- [x] `rfc.validate` passes on this file (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has `status: accepted`.
- Agents MUST NOT change `status` in any RFC.
- The handler MUST reuse existing `parseRfcFile` and `listRfcFiles` utilities from `handlers.ts`.
- Feature flag extraction MUST use the same regex approach as `semantic.ts` (`extractDefinedFeatureKeys`) — do NOT import or execute app TypeScript at check time.
- File paths in the `## File system responsibilities` table are relative to workspace root (e.g. `apps/nicaragua-projekt/src/components/lang-switcher.astro`).
- The command MUST NOT modify any files.
- When implementing, reference `RFC-0003` in commit messages or PR descriptions.

## Backfilled sections (RFC-0366)

The following headings were added when the RFC mini-template was retired. The original command/policy RFC used the mini form, which recorded only Context, Decision, Acceptance criteria, and Implementation notes. These sections satisfy the unified full-template contract without altering the original decision.

## Problem

See the Context section above for the problem this RFC addresses. (This section is required by the unified RFC template; the original mini-RFC recorded the problem within Context.)

## Architectural fit

This RFC aligns with the DNA invariants and related RFCs listed in the frontmatter. (Backfilled during mini-template retirement; original mini-RFC did not include a separate Architectural fit section.)

## Design

See the Decision and Acceptance criteria sections above for the design. (Backfilled during mini-template retirement; original mini-RFC recorded design within Decision and Acceptance criteria.)

## Rollout

Implemented as described in the Acceptance criteria and Implementation notes. (Backfilled during mini-template retirement.)

## Alternatives considered

No alternatives were recorded in the original mini-RFC form. (Backfilled during mini-template retirement.)

## Risks

No additional risks were recorded in the original mini-RFC form. (Backfilled during mini-template retirement.)
