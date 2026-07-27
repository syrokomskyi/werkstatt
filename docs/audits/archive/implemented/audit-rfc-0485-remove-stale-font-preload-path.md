---
rfcId: RFC-0485
auditId: AUDIT-RFC-0485-01
date: 2026-07-22
auditor:
  skill: fo-idea-audit
  model: Cascade
verdict: needs-revision
---

# Audit: RFC-0485

## Verdict: Needs revision

Two mechanical validation errors (invalid `kind` and `scope` enum values) block `rfc.validate`. Semantically, the RFC amends RFC-0164 which is **superseded** by RFC-0371 — the amendment should target the live authority (RFC-0371) whose Fontsource CSS import migration caused the preload path to become stale.

## Mechanical validation (rfc.validate)

**Fail** — 2 errors, 3 warnings:

| Rule | Severity | Message |
| --- | --- | --- |
| V-04 | error | Invalid kind "patch". Must be one of: architecture, contract, command, policy, deprecation |
| V-05 | error | Invalid scope "package". Must be one of: app, workspace |
| V-13 | warning | Missing required section "## Design" |
| V-13 | warning | Missing required section "## Rollout" |
| V-19 | warning | RFC-0485.amends includes RFC-0164, but RFC-0164.amendedBy does not include RFC-0485 |

## Axis A — Structural completeness

- **Missing `## Design` section** (V-13 warning). The RFC has an `### Implementation` subsection under `## Decision` with concrete removal instructions, but the validator expects a top-level `## Design` heading. Rename `### Implementation` to `## Design` or add a `## Design` section.
- **Missing `## Rollout` section** (V-13 warning). For a single-line removal in a shared package, a brief `## Rollout` section (e.g. "Atomic removal in one commit; no migration window needed; all apps inherit the fix via `@gogol/ui`") would satisfy the validator.
- `## Alternatives considered` has three real alternatives with rejection reasons — good.
- `## Risks` addresses font paint delay — good.
- `## Acceptance criteria` has 5 checkable items — good.
- `## Implementation notes for agents` has explicit behavioral rules — good.

## Axis B — DNA alignment

No issues. `satisfies: []` is acceptable — a minor preload removal does not enforce, protect, or extend any DNA invariant. No DNA conflict.

## Axis C — Ecosystem fit

- **Finding (significant): `amends` targets a superseded RFC.** RFC-0485 declares `amends: [RFC-0164]`, but RFC-0164 has `status: superseded` — it was superseded by RFC-0371. A superseded RFC is no longer authoritative; amending it is semantically meaningless. The preload link became stale as a direct consequence of RFC-0371's migration from `public/fonts/*.woff2` copied files to Fontsource CSS `@import` statements with Vite-bundled `/_astro/*.woff2` assets. The amendment should target **RFC-0371** (the current implemented authority on fonts), not RFC-0164. RFC-0164 should remain in `related[]` for historical context only.
- `packagesImpacted: ["@gogol/ui"]` is correct — the only file touched is `packages/ui/src/components/layout/layout-component.astro`.
- `appsImpacted: []` is reasonable — no app code changes needed; all apps inherit the fix via the shared layout.
- No command changes proposed — correct.
- No Compass XML sync needed — single-line removal in a shared component.
- No AGENTS.md updates needed.

## Axis D — Forward-only compliance

- **Finding: amending a dead RFC bypasses the current authority.** The ecosystem moved forward from RFC-0164 to RFC-0371. Amending the superseded RFC-0164 instead of the live RFC-0371 is a forward-only violation — it fails to engage with the RFC that actually governs the current font pipeline and whose changes caused the staleness.
- The removal itself is forward-only: no compatibility shim, no dual-path, no replacement preload. Good.

## Axis E — Agent-facing policy

No issues. The status gate is correct: "Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented)." No self-authorizing language. Implementation notes are explicit behavioral rules. No persistence or storage changes.

## Axis F — Pragmatism

No issues. The RFC is minimal and focused — removes one `<link>` tag and its comment block. `nonGoals` are explicit and meaningful. `versionBump: patch` is appropriate. No new commands proposed.

## Axis G — Blind spots

- **Finding (minor): Compass CHANGE_SUMMARY update not mentioned.** `layout-component.astro` carries `MODULE_CONTRACT` and `CHANGE_SUMMARY` Compass scaffolding (DNA-42). Removing the preload link is a code change that should produce a `CHANGE_SUMMARY` entry (e.g. "RFC-0485: remove stale font preload for /fonts/inter-400.woff2 (404 fix)"). The implementation plan should include this.
- Performance: the RFC correctly notes font paint delay is negligible for self-hosted same-origin fonts with `font-display: swap`. No blind spot.
- No false-positive risk — this is a removal, not a validator.
- No security/privacy implications.

## Questions for the author

1. Why does `amends` target RFC-0164 (superseded) instead of RFC-0371 (the current implemented authority on fonts)? RFC-0371's switch to Fontsource CSS imports is what made the `/fonts/inter-400.woff2` preload path stale — RFC-0164 never knew about Fontsource.
2. What `kind` and `scope` values should be used? `patch` and `package` are not in the valid enum sets (`kind ∈ {architecture, contract, command, policy, deprecation}`, `scope ∈ {app, workspace}`). For a small contract change in a shared package, `kind: contract` and `scope: workspace` seem most appropriate.
3. Should the `CHANGE_SUMMARY` block in `layout-component.astro` be updated as part of this RFC's implementation plan?
