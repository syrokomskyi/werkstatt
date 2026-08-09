---
rfcId: RFC-0658
auditId: AUDIT-RFC-0658-01
date: 2026-08-03
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0658

## Verdict: Needs revision

The RFC addresses a real integrity gap (accidental bordbuch deletion in cache clones) with a reasonable three-pronged approach. However, it has factual errors about the current `mission.close` flow, a missing package impact, and a misleading justification for pipeline step ordering.

## Mechanical validation (rfc.validate)

Pass — zero violations.

## Axis A — Structural completeness

No issues. All sections contain real content. Decision is present tense. CLI surface, TypeScript contracts, file system responsibilities, output format, failure modes, rollout, alternatives, risks, and acceptance criteria are all present and substantive.

## Axis B — DNA alignment

No issues. DNA-46 (mission lifecycle / bordbuch) and DNA-51 (Werkstatt consistency primitives) are correctly referenced. The RFC strengthens bordbuch integrity enforcement, which aligns with both invariants. The RFC body explains how each is enforced (§ Architectural fit, lines 103–104).

## Axis C — Ecosystem fit

**C1 — Missing `packagesImpacted` entry.** The RFC lists only `site-kernel-handoff` (line 52), but the `build.prepare` pipeline is defined in `packages/os/site-kernel-checks/src/pipelines/build-prepare.ts`. Adding a `bordbuch.validate` step to that pipeline modifies `site-kernel-checks` source. `packagesImpacted` should include `site-kernel-checks`.

**C2 — Existing `bordbuch.validate` in `sites-check-author` not acknowledged.** `bordbuch.validate` is already registered in the `sites-check-author` pipeline at `packages/os/site-kernel-checks/src/pipelines/sites-check-author.ts:107`. The RFC proposes adding it to `build.prepare` as well. The RFC should acknowledge the existing placement and explain why `build.prepare` also needs it (earlier detection — `build.prepare` runs before `astro build`, while `sites-check-author` runs after).

**C3 — Dev vs. full pipeline not specified.** There are two build.prepare pipelines: `SITES_BUILD_PREPARE_PIPELINE` (full) and `SITES_BUILD_PREPARE_DEV_PIPELINE` (dev). `bordbuch.generate` and `bordbuch.commit` are only in the full pipeline (`build-prepare.ts:124–126`). The RFC does not specify whether `bordbuch.validate` should be added to the dev pipeline as well. Given that the dev pipeline excludes bordbuch steps, `bordbuch.validate` should likely be full-pipeline-only — but the RFC should state this explicitly.

## Axis D — Forward-only compliance

No issues. No compatibility shims, no dual paths, no legacy maintenance. All three measures are active from day one.

## Axis E — Agent-facing policy

**E1 — Factual error about `mission.close`.** The RFC states "No bordbuch validation in `mission.close`" (line 93) and that "`mission.close` does not [validate bordbuch]". However, `mission.close` already runs `runInlineValidate(missionId, context)` at `mission-close.ts:183`, which calls `runMissionValidate`, which runs the `build.prepare` pipeline. If `bordbuch.validate` is added to `build.prepare`, then `mission.close` already validates bordbuch transitively via the inline validation gate (RFC-0593). The RFC's proposal to add a _separate_ `validateBordbuch` call in `mission.close` (lines 132–134) is potentially redundant. The RFC should either (a) justify the separate call — e.g., to cover the distribution-reuse skip path in RFC-0635 where `build.prepare` is skipped — or (b) remove it and rely on the pipeline step.

## Axis F — Pragmatism

**F1 — Misleading justification for pipeline step ordering.** The RFC says `bordbuch.validate` is inserted "after `bordbuch.generate` and before `bordbuch.commit`" with the justification "ensures projections are fresh before validation and committed only if validation passes" (line 251). But `bordbuch.validate` validates `events.ndjson` (the raw hash-chained ledger), not the generated projections (JSON/HTML/YAML). The projections' freshness is irrelevant to `bordbuch.validate` — it reads `events.ndjson`, not the projection files. The ordering between `bordbuch.generate` and `bordbuch.validate` doesn't matter for correctness. The RFC should either correct the justification or drop the ordering constraint.

**F2 — TypeScript contract uses wrong interface name.** The RFC shows `MissionCloseResult` (line 167) with a `bordbuchValidation` field. The actual interface in `mission-close.ts:95` is `MissionCloseData`. The RFC should use the real interface name for consistency.

## Axis G — Blind spots

**G1 — Workpiece hook propagation not addressed.** `mission.materialize` creates the workpiece via `git clone` from the cache clone (RFC-0568). `git clone` does NOT copy hooks. The RFC should explicitly state that the pre-commit hook is installed only in the cache clone, not in workpiece clones. This is correct behavior (the hook targets cache clone mutations), but the RFC should be explicit.

**G2 — Distribution-reuse skip path not addressed.** RFC-0635 allows `mission.validate` to skip the build cycle (including `build.prepare`) when the build-input-hash matches. In that case, `bordbuch.validate` in `build.prepare` would be skipped. The `mission.close` bordbuch validation call (if kept) provides defense-in-depth for this path. The RFC should acknowledge this interaction and use it as justification for the separate `mission.close` validation call (addressing E1).

## Questions for the author

1. If `bordbuch.validate` is added to `build.prepare`, and `mission.close` already runs `mission.validate` (which runs `build.prepare`), why is a _separate_ `validateBordbuch` call needed in `mission.close`? Is it to cover the distribution-reuse skip path (RFC-0635) where `build.prepare` is skipped? If so, state this explicitly.

2. Should `bordbuch.validate` be added to `SITES_BUILD_PREPARE_DEV_PIPELINE` as well, or only to `SITES_BUILD_PREPARE_PIPELINE`? The dev pipeline currently excludes `bordbuch.generate` and `bordbuch.commit` — should `bordbuch.validate` follow the same pattern?

3. The `packagesImpacted` field only lists `site-kernel-handoff`, but the `build.prepare` pipeline is defined in `packages/os/site-kernel-checks`. Should `site-kernel-checks` be listed too?
