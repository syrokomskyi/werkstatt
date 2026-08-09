---
rfcId: RFC-0777
auditId: AUDIT-RFC-0777-01
date: 2026-08-09
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0777

## Verdict: Needs revision

The RFC has a clear decision and good plugin module structure, but has several gaps: `commands.proposed` doesn't list the 3 new game validators, `satisfies: [DNA-1]` is listed without explaining the relationship, `packagesImpacted` is empty despite creating a new package, and the `--json` output format for the game validators is missing. The `hooks.materialize` omission needs explicit justification.

## Mechanical validation (rfc.validate)

Pass — 0 violations.

## Axis A — Structural completeness

- **A1: Missing "Output format" section.** The 3 game validators (`game.assets.validate`, `game.scenes.validate`, `game.bundle.validate`) have no `--json` output shape documented. RFC-0770 and RFC-0772 both include output format examples for their commands. The game validators should follow the same pattern.

- **A2: Missing "File system responsibilities" table.** RFC-0774 includes one naming concrete paths. The plugin module table partially covers this but doesn't name the filesystem layout of `packages/werkstatt-game` itself (e.g. `packages/werkstatt-game/src/{paths,checks,build,deploy,onboarding,release-evidence,invariants}/`).

- **A3: `packagesImpacted: []` is incorrect.** The RFC creates `packages/werkstatt-game` — this should be listed. The template says "Leave empty if unknown" but the RFC clearly knows the package it creates.

## Axis B — DNA alignment

- **B1: `satisfies: [DNA-1]` listed without body explanation.** DNA-1 is "Monorepo boundary" (shared logic in `packages/*`, no cross-site imports). The RFC body's Architectural fit section references DNA-64 and DNA-46..49 but never mentions DNA-1. The body must explain how the game plugin enforces, protects, or extends DNA-1 — or remove DNA-1 from `satisfies[]`.

- **B2: DNA-64 referenced in body but not yet in the registry.** The Architectural fit section says "DNA-64 — game plugin implements the same contract as the site plugin." DNA-64 is established by RFC-0769 (currently draft) and does not yet exist in `docs/architecture-dna.md`. This is a program-wide forward reference (all RFC-0770..0779 do the same). Not a blocking finding for this RFC alone, but the body should acknowledge DNA-64 is not yet established rather than citing it as an existing invariant.

## Axis C — Ecosystem fit

- **C1: `commands.proposed: []` but the RFC introduces 3 new commands.** `game.assets.validate`, `game.scenes.validate`, `game.bundle.validate` are described in the Design section and CLI surface but not listed in `commands.proposed`. Per the command lifecycle convention, proposed commands introduced by this RFC must land in `commands.proposed` (then move to `added` upon implementation).

- **C2: `hooks.materialize` omitted without justification.** The plugin entry point lists `hooks: { build, checkGate, releaseEvidence, scaffoldProject }` but omits `materialize`. RFC-0770's `WerkstattPluginHooks` includes `materialize` (scaffold/regenerate workpiece after authored data injection). The site plugin (RFC-0774) includes it. The RFC should either add `materialize` to the hook list or explicitly state that the engine's default materialize behavior is sufficient for game workpieces.

- **C3: `related[]` missing key siblings.** The list includes RFC-0769, RFC-0770, RFC-0771, RFC-0779 but is missing:
  - RFC-0774 (site plugin — the first implementer of the same contract the game plugin follows; the body even says "implements the same contract as the site plugin")
  - RFC-0773 (publication pipeline — acceptance criteria reference `extract.config.yaml`)
  - RFC-0778 (video plugin — sibling in the same wave 5)

## Axis D — Forward-only compliance

No issues. The plugin is new; no legacy paths, no compatibility shims, no dual-paths.

## Axis E — Agent-facing policy

No issues. No self-authorizing language, no NEEDS CLARIFICATION markers, standard implementation notes template, no storage policy concerns.

## Axis F — Pragmatism

- **F1: `packagesImpacted: []` should list `packages/werkstatt-game`.** Same as A3 — the RFC creates this package, the field should not be empty.

- **F2: 3 commands are justified.** Each validator addresses a distinct concern (asset manifest completeness, scene registry consistency, bundle size budget). No command duplicates an existing command's scope. No issues here.

## Axis G — Blind spots

- **G1: Empty-state behavior undefined.** The RFC doesn't specify what happens when a game project has zero scenes or zero assets. Does `game.scenes.validate` pass trivially (vacuously true) or fail (no scenes registered)? Does `game.assets.validate` pass with an empty manifest? The validators should define empty-state behavior to avoid false positives on freshly scaffolded projects.

- **G2: LFS-tracked binary assets not addressed.** The `onboarding/` module generates a new Phaser project with scene boilerplate and an asset manifest. If the onboarding templates include sample sprites or audio files, these are binary assets that may need Git LFS tracking. RFC-0773's Risks section calls out "LFS-tracked binaries in werkstatt-site (ui assets)" but not game plugins. If `packages/werkstatt-game` contains binary onboarding assets, the extraction pipeline (RFC-0773) needs LFS support for this package too.

- **G3: `game.bundle.validate` budget source unspecified.** GAME-03 says "Bundle size must not exceed the declared budget (default 5 MB gzipped)" but the RFC doesn't specify where the budget is declared — is it in `phaser.config.ts`, `systems/registry.yaml`, or a separate config file? The validator needs a defined source of truth for the budget value.

## Questions for the author

1. Should `game.scenes.validate` and `game.assets.validate` pass or fail on a freshly scaffolded project with zero scenes and zero assets? What is the empty-state contract?
2. Does `packages/werkstatt-game` contain LFS-tracked binary assets (sample sprites, audio in onboarding templates)? If so, does RFC-0773's extraction pipeline handle LFS for this package?
3. Why is `hooks.materialize` omitted from the plugin entry point? Is the engine's default materialize behavior sufficient for game workpieces, or does the game plugin need a custom materialize hook?
