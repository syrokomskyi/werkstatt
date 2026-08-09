---
id: RFC-0256
title: "Plan advisory maintenance debt burn-down queues"
status: implemented
# kind options: architecture | contract | command | policy | deprecation
kind: architecture
# scope options: app | workspace
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-07-01
updatedAt: 2026-07-01
implementedAt: 2026-07-01
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0203
  - RFC-0211
  - RFC-0218
  - RFC-0220
  - RFC-0245
  - RFC-0247
  - RFC-0251
  - RFC-0254
commands:
  proposed:
    - maintenance.debt.queue.generate
    - maintenance.debt.queue.validate
    - maintenance.debt.queue.report
  added:
    - maintenance.debt.queue.generate
    - maintenance.debt.queue.validate
    - maintenance.debt.queue.report
  changed: []
  removed: []
appsImpacted:
  - warpgogol-com
  - nicaragua-projekt
packagesImpacted:
  - "@gogol/site-kernel"
  - "@gogol/site-kernel-checks"
successSignals:
  - "Accepted advisory maintenance debt is split into explicit queues that can be handled by separate agent sessions."
  - "`maintenance.debt.queue.report --json` returns the next bounded batch for a selected queue without requiring agents to reread the whole site."
  - "`maintenance.debt.queue.validate --json` detects stale queue entries, unqueued accepted warning debt, and queue items that no longer exist in the current debt report."
  - "The initial backlog has queues for prose authorship credits, surface narrative/image substance, and demand slug override warnings."
nonGoals:
  - "Do not fix the current advisory debt in this RFC."
  - "Do not convert all advisory warnings to fail-hard errors."
  - "Do not create a project-management system outside the repository."
  - "Do not invent missing rights, legal, or source facts to close queue items."
---

# RFC-0256: Plan advisory maintenance debt burn-down queues

## Context

RFC-0245 introduced an Agent Control Plane and a maintenance debt ledger. RFC-0247 completed canonical warning diagnostics so advisory findings could be aggregated. RFC-0251 accepted the first advisory maintenance debt baseline and added triage reporting.

As of 2026-07-01, the committed baseline contains 217 accepted advisory items:

| Source command               | Count | Rule id                                 |
| ---------------------------- | ----: | --------------------------------------- |
| `text.normalize.report`      |   123 | `TEXT-NORM-01`                          |
| `surface.validate`           |    20 | `surface.validate`                      |
| `material.credits.validate`  |    36 | `material.credits.missing-prose-credit` |
| `demands.hierarchy.validate` |    36 | `demands.hierarchy.validate`            |
| `material.metadata.validate` |     2 | `material.metadata.toolchain-missing`   |

That baseline is useful because it prevents existing advisory debt from blocking unrelated work while still rejecting new unbaselined debt. However, a baseline is not a plan. It says "this debt is known", not "this is the next safe batch to burn down."

The 2026-07-01 audit identified three categories that should be worked as deliberate sequential projects:

- prose authorship credit sidecars;
- surface narrative and image substance warnings;
- demand hierarchy slug override warnings.

Each category has different review needs and different risk. They should not be bundled into one broad cleanup.

## Problem

The unprotected invariant is: **accepted advisory debt must be converted into bounded, ownerful, reviewable work queues before agents start bulk cleanup.**

Without queue-level planning:

- Agents receive a large accepted backlog but no stable next batch.
- Advisory debt can remain accepted forever because the baseline hides urgency.
- A cleanup session can mix unrelated content authorship, generated surface semantics, and URL slug decisions.
- Reviewers cannot tell whether a change is completing an agreed queue or opportunistically editing content.
- Future sites may inherit the same accepted-debt pattern without a burn-down mechanism.

The repository needs a thin planning layer between "raw current debt" and "make edits".

## Decision

Add explicit advisory maintenance debt queues.

A queue is a repository-owned plan that selects a subset of accepted advisory debt, defines why it exists, gives batch limits for agent sessions, and declares the validation commands that prove a batch is complete.

Three commands are introduced:

- `maintenance.debt.queue.generate`
- `maintenance.debt.queue.validate`
- `maintenance.debt.queue.report`

The queue layer sits on top of existing commands:

- `maintenance.debt.report` remains the raw current debt ledger.
- `maintenance.debt.baseline.validate` remains the guard against new unaccepted advisory debt.
- `maintenance.debt.triage.report` remains the broad priority grouping.
- `maintenance.debt.queue.report` becomes the actionable next-work surface for agents.

## Architectural fit

This RFC extends the Site OS governance layer without changing app runtime behavior.

- RFC-0203 provides canonical diagnostics.
- RFC-0211 through RFC-0218 define Content Knowledge Lifecycle discipline for facts and provenance.
- RFC-0220 defines material credit requirements.
- RFC-0245 provides the Agent Control Plane and raw debt ledger.
- RFC-0247 guarantees advisory warnings are machine-readable.
- RFC-0251 defines the accepted baseline and triage report.
- RFC-0254 will make future human output less noisy.

Debt queues are not a second validator system. They are a planning and batching projection over existing validators.

## Design

### Queue storage

Authored queue specs live under:

```txt
docs/maintenance-debt/queues/*.yaml
```

The optional generated projection lives at:

```txt
docs/maintenance-debt.queues.generated.json
```

Rules:

- Queue YAML files are authored governance documents.
- The generated JSON projection is derived and must carry the standard generated marker.
- Agents may edit queue YAML when implementing this RFC or when closing a planned batch.
- Agents must not hand-edit the generated JSON projection.

### Queue schema

Illustrative YAML shape:

```yaml
id: prose-credit-sidecars
title: "Add prose authorship credit sidecars"
status: active
owner: content-architecture
priority: 1
createdAt: "2026-07-01"
reviewAfter: "2026-08-01"
rationale: >
  Prose records need explicit authorship credit sidecars so published
  legal, editorial, and narrative material has a reviewable origin.
sourceCommands:
  - material.credits.validate
selectors:
  apps:
    - warpgogol-com
    - nicaragua-projekt
  ruleIds:
    - material.credits.missing-prose-credit
  severity:
    - warning
batchPolicy:
  maxItemsPerSession: 8
  commitAfterEachBatch: true
  push: false
acceptance:
  commands:
    - pnpm exec werkstatt run maintenance.debt.queue.validate --queue prose-credit-sidecars --json
    - pnpm exec werkstatt run material.credits.validate --app <app> --json
    - pnpm exec werkstatt run maintenance.debt.baseline.validate --json
notes:
  - "Do not invent authorship. Use NEED_THIS-style placeholders or documented asserted ownership only where policy allows."
```

Required fields:

- `id`
- `title`
- `status`
- `owner`
- `priority`
- `createdAt`
- `reviewAfter`
- `rationale`
- `sourceCommands`
- `selectors`
- `batchPolicy`
- `acceptance.commands`

Allowed statuses:

- `active`
- `paused`
- `complete`
- `superseded`

`complete` means no current debt items match the queue selectors and the acceptance commands pass.

### Command surface

```sh
pnpm exec werkstatt run maintenance.debt.queue.generate --json
pnpm exec werkstatt run maintenance.debt.queue.validate --json
pnpm exec werkstatt run maintenance.debt.queue.report --json
```

Useful scoped forms:

```sh
pnpm exec werkstatt run maintenance.debt.queue.report --queue prose-credit-sidecars --json
pnpm exec werkstatt run maintenance.debt.queue.report --queue surface-substance --app warpgogol-com --json
pnpm exec werkstatt run maintenance.debt.queue.validate --queue demand-slug-overrides --json
pnpm exec werkstatt run maintenance.debt.queue.generate --dry-run --json
```

### `maintenance.debt.queue.generate`

This command reads:

- current `maintenance.debt.report --json`;
- committed `docs/maintenance-debt.baseline.generated.json`;
- existing queue YAML files.

It writes or updates queue projections. In the first implementation it may also scaffold missing queue YAML files for the required initial queues.

Behavior:

- Mutating by default only when explicitly called.
- Supports `--dry-run` to print proposed queue changes.
- Does not change app content.
- Does not rewrite completed queue YAML unless explicitly requested.
- Does not add new accepted debt to the baseline; baseline acceptance remains owned by RFC-0251 commands.

### `maintenance.debt.queue.validate`

This command validates queue health.

It must detect:

- malformed queue YAML;
- duplicate queue ids;
- unknown source commands or rule ids;
- active queues with no matching current debt and no `complete` status;
- current accepted warning debt that matches no active or paused queue, except explicitly ignored classes;
- queue selectors that match debt outside their declared app or command scope;
- stale queue items that no longer exist in the current report;
- `batchPolicy.push: true`, which is forbidden for agent-maintained queues;
- missing acceptance commands.

Validation severities:

- Schema errors fail.
- Unknown commands or rule ids fail.
- `batchPolicy.push: true` fails.
- Unqueued accepted warning debt warns during first rollout and may become fail-hard after every accepted debt class has a queue.
- Completed queues with matching current debt fail.

### `maintenance.debt.queue.report`

This command emits the next actionable batch.

Output includes:

- queue id and title;
- owner and priority;
- selected app;
- selected source commands and rule ids;
- total matching current items;
- next batch capped by `batchPolicy.maxItemsPerSession`;
- exact files or stable keys where available;
- fix hints from underlying diagnostics;
- acceptance commands to run after the batch;
- a reminder that agents commit after each completed batch and do not push.

Illustrative JSON shape:

```json
{
  "command": "maintenance.debt.queue.report",
  "status": "warn",
  "queue": {
    "id": "prose-credit-sidecars",
    "title": "Add prose authorship credit sidecars",
    "priority": 1,
    "owner": "content-architecture"
  },
  "totalMatchingItems": 36,
  "batch": {
    "maxItems": 8,
    "items": [
      {
        "key": "08e9a676d072d89041c7277608b038b59e18b89d8433064e7423ca2f24283925",
        "app": "warpgogol-com",
        "sourceCommand": "material.credits.validate",
        "ruleId": "material.credits.missing-prose-credit",
        "file": "src/content/prose/de/muster-widerruf.md",
        "fixHint": "Add a sibling material credit sidecar for the prose record."
      }
    ]
  },
  "acceptanceCommands": [
    "pnpm exec werkstatt run maintenance.debt.queue.validate --queue prose-credit-sidecars --json",
    "pnpm exec werkstatt run maintenance.debt.baseline.validate --json"
  ]
}
```

## Required initial queues

### `prose-credit-sidecars`

Purpose: clear `material.credits.missing-prose-credit` warnings.

Initial selector:

- `sourceCommand: material.credits.validate`
- `ruleId: material.credits.missing-prose-credit`
- apps: `warpgogol-com`, `nicaragua-projekt`

Work policy:

- Batch by app and language.
- Review legal pages separately from marketing prose.
- Do not invent authorship, rights, or provenance.
- If human confirmation is needed, leave an explicit NEED_THIS-style marker according to the relevant authoring policy instead of silently asserting a fact.

Acceptance:

- Affected app `material.credits.validate --json` has no remaining items for the edited prose files.
- `maintenance.debt.queue.validate --queue prose-credit-sidecars --json` passes or reports fewer matching items without new debt.
- `maintenance.debt.baseline.validate --json` passes.

### `surface-substance-assets-and-narratives`

Purpose: clear `surface.validate` warnings for missing or weak surface narrative/image substance.

Initial selector:

- `sourceCommand: surface.validate`
- `ruleId: surface.validate`
- apps: `warpgogol-com`, `nicaragua-projekt`

Work policy:

- Batch by surface domain and app.
- Prefer improving authored source records over editing generated surface output.
- Preserve image resolution contracts: bare filenames only, no extensions or content paths.
- Add material credits when new material tokens are introduced.
- Preserve CKL provenance discipline for factual claims.

Acceptance:

- Affected app `surface.validate --json` no longer reports the selected items.
- Any new image/material references pass `asset.reference.validate` and `material.credits.validate`.
- Generated surface files are regenerated through their owning command when required.

### `demand-slug-overrides`

Purpose: review and clear demand hierarchy slug override warnings.

Initial selector:

- `sourceCommand: demands.hierarchy.validate`
- `ruleId: demands.hierarchy.validate`
- apps: `warpgogol-com`, `nicaragua-projekt`

Work policy:

- Batch by industry and locale.
- Treat URL changes as high-risk.
- Do not change a published slug only to satisfy the derived slug convention unless redirects, canonical URLs, sitemap effects, and localized pairs are handled.
- Where an override is intentional, add or refine the explicit metadata that lets the validator distinguish accepted URL strategy from accidental drift.
- Where an override is accidental, update content and generated artifacts together.

Acceptance:

- Affected app `demands.hierarchy.validate --json` no longer reports the selected accidental overrides.
- Intentional overrides are represented by a first-class contract rather than a warning string.
- Any route-affecting changes run app `build:check` and sitemap/canonical validation.

## Future queues

The initial implementation may leave these classes out of active burn-down queues:

- `TEXT-NORM-01` source normalization info;
- `material.metadata.toolchain-missing`;
- any future warning class that is accepted into the baseline with a documented review date.

They should still be visible to `maintenance.debt.queue.validate` as ignored or deferred classes, not disappear from planning.

## Agent workflow

Agents working on maintenance debt should follow this sequence:

1. Run `maintenance.debt.queue.report --json`.
2. Select one active queue.
3. Work only the next reported batch.
4. Preserve the queue's stated risk policy.
5. Run the queue acceptance commands.
6. Regenerate derived artifacts only through owning generators.
7. Commit the completed batch.
8. Do not push from agent sessions.

If a batch requires human facts, rights confirmation, legal review, or source verification, the agent should mark the item as blocked in the queue or content policy surface rather than guessing.

## File system responsibilities

| Path | Role |
| --- | --- |
| `docs/maintenance-debt/queues/*.yaml` | Authored queue plans |
| `docs/maintenance-debt.queues.generated.json` | Optional generated queue projection |
| `packages/os/site-kernel-checks/src/maintenance-debt-queue-generate.ts` | Queue generation/scaffolding command |
| `packages/os/site-kernel-checks/src/maintenance-debt-queue-validate.ts` | Queue validation command |
| `packages/os/site-kernel-checks/src/maintenance-debt-queue-report.ts` | Next-batch report command |
| `packages/os/site-kernel-checks/src/maintenance-debt.ts` | Shared debt report/baseline/queue helpers if appropriate |
| `tools/kernel.config.ts` | Registers new workspace commands |
| `docs/ecosystem.generated.json` | Generated ACP projection after command registration |

## Rollout

1. Add queue schema types and parser tests.
2. Implement `maintenance.debt.queue.report` against in-memory current debt and authored queue YAML.
3. Add the three required queue YAML files.
4. Implement `maintenance.debt.queue.validate` in warning mode for unqueued accepted debt.
5. Implement `maintenance.debt.queue.generate` or keep it as a dry-run scaffold generator if manual queue YAML remains clearer.
6. Add queue command entries to `tools/kernel.config.ts`.
7. Regenerate `docs/ecosystem.generated.json`.
8. Run `maintenance.debt.queue.validate --json`, `maintenance.debt.baseline.validate --json`, `workspace.surface.validate --json`, and `rfc.validate`.
9. In later sessions, burn down queues one batch at a time.

## Best project decision

The best first queue to work is `prose-credit-sidecars`.

It has a clear validator, a bounded fix shape, and low runtime risk if authorship policy is respected. It also strengthens the platform's public trust layer by making prose origin explicit.

The highest-risk queue is `demand-slug-overrides` because URLs are public contracts. That queue should wait until the report and validation workflow can separate intentional slug strategy from accidental drift.

## Alternatives considered

Using only `maintenance.debt.triage.report` was rejected because triage groups are too broad for separate implementation sessions.

Putting debt tasks into an external project-management tool was rejected because the repository must remain self-describing for agents and future maintainers.

Editing the generated baseline by hand was rejected because the baseline is a generated acceptance artifact, not a plan.

Fixing all accepted warnings in one cleanup was rejected because it mixes unrelated ownership, factual provenance, media rights, URL strategy, and source normalization concerns.

Failing CI on all currently accepted debt was rejected because that would break unrelated client-site work. Queues allow deliberate burn-down without removing the guard against new debt.

## Risks

Queues can become stale if they are not validated against current debt. `maintenance.debt.queue.validate` must make staleness visible.

Queues can become another place to hide debt. Every active queue needs `reviewAfter`, owner, rationale, and batch policy.

Batch limits can be too conservative. That is acceptable; future sessions can update queue policy after successful burn-down.

Slug work can accidentally change public URLs. The slug queue must be treated as route-affecting and must require app-level build and canonical/sitemap checks when URLs change.

Credit work can tempt agents to invent authorship. The prose credit queue must explicitly forbid guessed rights and provenance.

## Acceptance criteria

- [x] `docs/maintenance-debt/queues/*.yaml` contains active queues for prose credits, surface substance, and demand slug overrides. (evidence: original apps retired by RFC-0381, implemented historically)
- [x] `maintenance.debt.queue.report --json` returns a bounded next batch for each active queue. (evidence: original apps retired by RFC-0381, implemented historically)
- [x] `maintenance.debt.queue.validate --json` validates queue schema, selectors, stale items, and forbidden push policy. (evidence: original apps retired by RFC-0381, implemented historically)
- [x] `maintenance.debt.queue.generate --dry-run --json` can propose queue scaffolding or projection updates from the current debt baseline. (evidence: original apps retired by RFC-0381, implemented historically)
- [x] Queue commands are registered in the workspace command surface. (evidence: implemented historically)
- [x] Agent Control Plane generation includes the new commands after implementation. (evidence: implemented historically)
- [x] `maintenance.debt.baseline.validate --json` still passes. (evidence: original apps retired by RFC-0381, implemented historically)
- [x] `maintenance.debt.triage.report --json` remains available and is not replaced. (evidence: original apps retired by RFC-0381, implemented historically)
- [x] Tests cover queue selection, batch limits, completed queue detection, duplicate ids, and unqueued accepted warning debt. (evidence: implemented historically)
- [x] `pnpm exec werkstatt run packages-check.run --json`, `pnpm exec werkstatt run ci.local.validate --json`, `pnpm test`, and `rfc.validate` pass. (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY implement code changes because this RFC is accepted.
- Implement the queue reporting and validation surfaces before editing app content.
- Do not modify `docs/maintenance-debt.baseline.generated.json` by hand.
- Do not change generated app files directly while clearing queue items.
- Treat legal, price, rights, and CKL facts as human-verification gates.
- Commit after each completed queue implementation step or content batch.
- Do not push from agent sessions.
