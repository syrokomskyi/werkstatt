---
rfcId: RFC-0732
auditId: AUDIT-RFC-0732-01
date: 2026-08-07
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0732

## Verdict: Needs revision

The RFC is architecturally sound and fills a real gap in the regression gate stack. However, it contains a factual error about the existing `mission.close` ordering, omits Compass document sync duties, and has a blind spot around programmatic surface routes (DNA-39) that will cause false positives on legitimate PBP-driven content changes.

## Mechanical validation (rfc.validate)

Pass — 0 violations.

## Axis A — Structural completeness

1. **Factual error in `mission.close` ordering.** The RFC states (lines 327, 381) that the snapshot copy happens "before `.materialization-state.json` write", claiming this mirrors the existing `.cache/video/` copy pattern. In reality, `.materialization-state.json` is written at `mission-close.ts:558` and `.cache/video/` is copied at `mission-close.ts:576` — **after** the state file, not before. The RFC's ordering description contradicts the actual code it claims to mirror. Fix: either match the actual pattern (after state file) or explain why the content regression snapshot needs a different ordering.

## Axis B — DNA alignment

No issues. DNA-61 already exists at `docs/architecture-dna.md:259-261` with correct reference to RFC-0732. DNA-58 (line 247) is correctly referenced as extended. `satisfies: [DNA-58, DNA-61]` is consistent with the RFC body.

## Axis C — Ecosystem fit

1. **Compass document sync not mentioned.** The RFC establishes a new DNA invariant (DNA-61) and adds two new kernel commands. Root AGENTS.md requires synchronization of affected `docs/*.xml` Compass documents. The RFC should identify which Compass documents need updates — at minimum `docs/verification-plan.xml` (new validation gate) and potentially `docs/development-plan.xml`.

2. **AGENTS.md updates not specified.** The Risks section (line 363) says "The RFC and AGENTS.md must clearly state which gate covers which concern" but does not name which AGENTS.md files. At minimum, `packages/os/site-kernel-checks/AGENTS.md` needs a module entry for `content-regression.ts`, and root `AGENTS.md` may need a rule clarifying the CREG/DRIFT/SNAP gate boundaries.

3. **`packagesImpacted` includes `@warpgogol/site-kernel-content` unnecessarily.** The RFC does not propose any source changes to that package — it only imports `loadSemanticSiteModel` from it. Remove it from `packagesImpacted` unless the implementation will modify the package source.

## Axis D — Forward-only compliance

No issues. No compatibility shims, no dual-paths. Cold start semantics are a bootstrap pattern, not a backward compatibility layer.

## Axis E — Agent-facing policy

No issues. Status gate is correct (draft cannot self-authorize implementation). Implementation notes reference RFC-0224, RFC-0330, RFC-0334 correctly. No NEEDS CLARIFICATION markers found.

## Axis F — Pragmatism

1. **`content.regression.snapshot.update` confirmation mechanism unclear.** The Risks section (line 371) says "prints the diff before writing. The operator must explicitly confirm." But the CLI surface (line 156) shows a simple command with no `--confirm` or `--yes` flag. Is confirmation an interactive prompt? A `--dry-run` first? The mechanism should be specified in the CLI surface or failure modes section.

## Axis G — Blind spots

1. **Programmatic surface routes (DNA-39) not addressed.** `loadSemanticSiteModel` loads all routes, including programmatic surface pages generated from PBP data and supplementary collections. When an operator updates business profile data (e.g., changes a price in PBP), surface page content changes — this would trigger CREG-01 on every PBP edit. The RFC should clarify whether surface routes are included in the snapshot, and if so, how to distinguish legitimate PBP-driven changes from content regressions. Without this, every business profile update requires a golden snapshot update, creating noise.

2. **`--skip-content-regression` flag propagation not explained.** Unlike `--skip-evidence-sync` on `mission.close` (handled in the same function), `--skip-content-regression` on `mission.validate` needs to propagate to the `content.regression.check` pipeline step inside `build.check`. The mechanism (flag passthrough to pipeline steps, or pipeline step conditional check) is not described. This is an implementation detail but affects the CLI contract.

3. **Performance cost not quantified.** The RFC says `loadSemanticSiteModel` is called "for each supported language" but doesn't estimate the cost. For warpgogol-com (3 languages, ~50+ routes), how many ms per model load? This helps assess the `build.check` impact and whether caching is needed beyond the `build-input-hash` skip.

## Questions for the author

1. Should programmatic surface routes (DNA-39) be included in the content regression snapshot? If yes, how should the gate distinguish PBP-driven content changes (legitimate) from authored content regressions? If no, how does the snapshot builder exclude them?
2. Should the snapshot copy in `mission.close` happen before or after `.materialization-state.json` write? The RFC says "before" but the existing `.cache/video/` pattern is "after".
3. Which `docs/*.xml` Compass documents need synchronization after adding DNA-61 and the two new commands?
