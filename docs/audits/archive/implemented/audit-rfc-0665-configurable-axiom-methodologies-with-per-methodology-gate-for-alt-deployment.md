---
rfcId: RFC-0665
auditId: AUDIT-RFC-0665-01
date: 2026-08-03
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0665

## Verdict: Needs revision

The RFC is structurally sound and addresses a real architectural gap (hardcoded single methodology, leaky abstraction in `mission-check.ts`), but has four issues that must be resolved before implementation: (1) `leitstand.dev-deploy` is listed in `commands.changed` but the RFC never describes what changes about it; (2) `methodologies.validate` is workspace-scoped but the RFC proposes adding it to the site-scoped `build.check` pipeline — a scope mismatch; (3) `onboarding.scaffold` is said to create `systems/methodologies.md`, but the config is workshop-level — scaffolding a new system would overwrite the workshop config; (4) no backward-compatibility discussion for existing evidence files that lack the new `methodologies[]` field.

## Mechanical validation (rfc.validate)

Pass — 0 violations, 0 warnings.

## Axis A — Structural completeness

**FAIL — `leitstand.dev-deploy` listed in `commands.changed` with no described changes.** The RFC frontmatter lists `leitstand.dev-deploy` in `commands.changed` (`docs/rfcs/rfc-0665-...md:54`), but the Design section never describes what changes about `leitstand.dev-deploy`. The Design describes changes to `mission.check` (delegation to `runActiveMethodologies`), `leitstand.propagate` (per-methodology gate), `axiom.report` (gate summary + per-methodology sections), and `methodologies.validate` (new command). `leitstand.dev-deploy` calls `mission.check` via `executeKernelCommand` (`packages/os/site-kernel-handoff/src/leitstand/leitstand-commands.ts:869-877`) — if `mission.check` reads the config internally, `dev-deploy` needs no code change. Either `leitstand.dev-deploy` should be removed from `commands.changed`, or the RFC should describe what explicitly changes (e.g., passing config-related flags, handling the new evidence format).

Otherwise: all required sections present with real content. Decision is in present tense. CLI surface shows exact invocations. TypeScript contracts are minimal but sufficient. File system responsibilities table names concrete paths. Output format documents the `--json` shape. Failure modes specify exit behavior. Rollout describes default behavior and adoption path. Alternatives section has five real alternatives with rejection reasons. Risks includes agent misinterpretation and false-positive discussion. Acceptance criteria are checkable. Implementation notes are explicit behavioral rules.

## Axis B — DNA alignment

No issues. `satisfies: [DNA-49, DNA-48]` is correct:

- **DNA-49 (Fleet propagation / Leitstand)**: The RFC extends the Axiom verification gate from single-methodology to multi-methodology. DNA-49's text says "zero-error Axiom evidence" — this is generic enough to cover the multi-methodology gate without amending the DNA entry. The gate remains a hard requirement for `alt` deployment; the RFC makes it configurable, not optional.
- **DNA-48 (Release discipline)**: The RFC strengthens the gate by allowing multiple methodologies to block promotion. No DNA amendment needed.

The `related[]` entries (DNA-49, DNA-48, RFC-0629, RFC-0627, RFC-0628, RFC-0630, RFC-0633) are all relevant and not decorative.

## Axis C — Ecosystem fit

**FAIL — `methodologies.validate` scope vs `build.check` pipeline scope mismatch.** The RFC says `methodologies.validate` is "a workspace-scoped command in `site-kernel-checks`" (`docs/rfcs/rfc-0665-...md:130`) and "Added to `build.check` pipeline for all systems" (Rollout, line 383). However, `build.check` (`SITES_BUILD_CHECK_PIPELINE` in `packages/os/site-kernel-checks/src/pipelines/build-check.ts:19`) is a site-scoped pipeline — it runs per site via `site-kernel pipeline build.check --site <name>`. A workspace-scoped command cannot be a step in a site-scoped pipeline (it would either fail when `--site` is passed, or run redundantly once per site). The RFC should either: (a) make `methodologies.validate` site-scoped (but the config is workshop-level, so this is also wrong), (b) add it to a workspace-scoped pipeline (e.g., `packages-check.run` or a new `workspace.check` pipeline), or (c) run it as a standalone workspace command outside `build.check` and document the invocation cadence.

**FAIL — `onboarding.scaffold` creating `systems/methodologies.md` conflicts with workshop-level config scope.** The RFC says "the operator wants one config for the entire workshop, not per-system" (Alternatives §2, line 391) and the config lives at `systems/methodologies.md` (a workshop-level path). But the Rollout says "New sites: `onboarding.scaffold` creates `systems/methodologies.md` with all 8 methodologies" (line 385). `onboarding.scaffold` creates a new Sternsystem — if the config is workshop-level, scaffolding a new system should NOT create or overwrite it. If the config already exists, `onboarding.scaffold` should skip creation. If it doesn't exist yet (first system), `onboarding.scaffold` or a workshop-level init command should create it once. The RFC must clarify this — either `onboarding.scaffold` checks for existence and skips, or a separate workshop-level command creates the config.

**Minor — external packages in `packagesImpacted`.** The RFC lists `@syrokomskyi/axiom-methodology`, `@syrokomskyi/axiom-capture`, `@syrokomskyi/axiom-study` in `packagesImpacted` (lines 63-65). These are external npm packages, not Werkstatt `packages/*` workspaces. The `packagesImpacted` field in RFC frontmatter typically tracks Werkstatt packages. The RFC acknowledges the external dependency in the Rollout ("This is an external package change, not a Werkstatt change — the RFC defines the contract"), so listing them is informational. But it may confuse agents into modifying external packages from within the Werkstatt monorepo. Consider adding a note that these are external dependencies requiring a coordinated upstream release.

## Axis D — Forward-only compliance

No issues. The RFC is a clean break — `mission-check.ts` removes direct imports of `extractAxeResult`, `runAccessibilityInstrument`, `createAutomatedWebAccessibilityMethodology`, `findingsForObservation` and replaces them with a single `runActiveMethodologies` call. No backward compatibility with the old single-methodology behavior. The `nonGoals` explicitly state "Does not add a --methodologies CLI flag to override config at runtime." Legacy code paths are removed, not maintained behind a flag.

## Axis E — Agent-facing policy

No issues. The RFC does not contain self-authorizing language. Implementation notes correctly reference RFC-0224, RFC-0330, RFC-0334. The status gate is respected — the RFC is `draft` and implementation notes say "Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented)." The note "Agents MUST NOT add new methodologies to `fixtures.ts` in the external Axiom package as part of this RFC" is a clear boundary.

## Axis F — Pragmatism

**Minor — `gate.minCoverage: 1.0` default is very strict.** The gate config defaults to `minCoverage: 1.0` (100% page coverage per methodology). If a single page fails to load or capture, the gate fails. The RFC doesn't discuss how coverage is calculated (per page? per instrument? per methodology?) or what happens when pages are unreachable due to transient network issues. The gate logic (§Gate logic, step 4) says "verify the ratio of covered pages to discovered pages meets the threshold per methodology" — but "covered" is not defined. Consider documenting the coverage formula or lowering the default to 0.95.

**Minor — activating 7 methodologies is a large operational change.** Going from 1 active methodology (accessibility) to 7 active methodologies (accessibility, multilingual, runtime-health, privacy-consent, SEO, security-headers, performance-vitals) will surface many new findings. The Risks section acknowledges "False positives from new methodologies" but doesn't discuss a transition period, a phased rollout (e.g., activate 2 at a time), or a "warn-only" mode where new methodologies report but don't block. The operator may face a situation where `leitstand.propagate` is blocked on all missions until findings are resolved. Consider adding a phased rollout recommendation or a `gate.mode: warn-only` option for the transition.

**Minor — external package dependency is a hard blocker.** The RFC depends on `runActiveMethodologies` being implemented in the external Axiom package before it can be fully implemented. The Risks section acknowledges this ("If the external package is not updated, `mission.check` cannot function"). The RFC should clarify the staging order: does the external package ship first, or does the Werkstatt implementation land behind a feature flag until the external package is ready?

## Axis G — Blind spots

**FAIL — no backward-compatibility discussion for existing evidence files.** The RFC extends `evidence-metadata.json` with a `methodologies[]` array. Existing evidence files (from missions checked before this RFC) do not have this field. `leitstand.propagate` reads `methodologies[]` from `evidence-metadata.json` (Gate logic, step 1) — if the field is missing, the gate behavior is undefined. The RFC is forward-only (no backward compat), but a release published before this RFC and propagated after it would have old-format evidence. The RFC should either: (a) state that all existing releases must be re-checked via `leitstand.dev-deploy` before this RFC takes effect, or (b) specify that `leitstand.propagate` falls back to the old single-methodology gate when `methodologies[]` is absent, or (c) state that old evidence is rejected and the release must be re-published. Option (b) contradicts forward-only, so (a) or (c) is preferred.

**Minor — no transition path for existing systems without `systems/methodologies.md`.** The RFC says "Config is mandatory: `systems/methodologies.md` must exist for `mission.check` to run. No silent default." (Rollout, line 379). But existing systems (warpgogol-com, nicaragua-projekt, etc.) don't have this file yet. The RFC should specify the migration step: create the config for each existing system as part of implementation, or provide a command to generate a default config.

**Minor — `axiom.report` graceful degradation with old evidence.** The RFC extends `axiom.report` to show a gate summary and per-methodology sections. If `evidence-metadata.json` lacks `methodologies[]` (old evidence), the report should gracefully degrade. The RFC doesn't discuss this. `axiom.report` already handles missing `evidence-metadata.json` with a warning (`AXIOM-REPORT-05`), so a missing `methodologies[]` field should similarly fall back to the old report format.

## Questions for the author

1. What changes about `leitstand.dev-deploy`? If `mission.check` reads the config internally and `dev-deploy` just calls `mission.check` via `executeKernelCommand`, `dev-deploy` needs no code change — should it be removed from `commands.changed`, or is there an explicit change (e.g., passing `--methodologies-config` flag, handling new evidence format in the dev-deploy output)?
2. How should `methodologies.validate` be integrated into the pipeline system — as a workspace-scoped command in a workspace-scoped pipeline (not the site-scoped `build.check`), or as a standalone command with a documented invocation cadence?
3. Should `onboarding.scaffold` skip creating `systems/methodologies.md` if it already exists (workshop-level config), or should a separate workshop-level init command create it once?
4. What happens when `leitstand.propagate` encounters evidence files without `methodologies[]` (from releases published before this RFC)? Should the gate reject old evidence, fall back to the old single-methodology check, or require re-checking via `leitstand.dev-deploy`?
5. Is a phased rollout recommended (activate 2-3 methodologies first, then add more), or should all 7 be activated simultaneously with the understanding that the operator must resolve all findings before the gate passes?
