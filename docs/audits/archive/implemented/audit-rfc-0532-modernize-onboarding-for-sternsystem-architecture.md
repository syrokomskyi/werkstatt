---
rfcId: RFC-0532
auditId: AUDIT-RFC-0532-01
date: 2026-07-25
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0532

## Verdict: Needs revision

The RFC addresses a real gap (onboarding ecosystem is coupled to the retired `apps/` layout), but has critical ecosystem-fit failures: it proposes `sternsystem.register` as a new command when it already exists in `@gogol/site-kernel-handoff` with different flags and behavior; it leaves 11 of 16 onboarding module commands unaddressed; and it declares `versionBump: minor` (requires migrator) while simultaneously stating no migration is needed. The nonGoals/acceptance-criteria contradiction on `fo-onboard` must also be resolved.

## Mechanical validation (rfc.validate)

Pass with 2 warnings (V-12): `RFC-0532.supersedes` includes RFC-0070 and RFC-0076, but their `supersededBy` fields are empty. Expected for a draft RFC — the back-reference will be set upon acceptance.

## Axis A — Structural completeness

- **File count inaccuracy.** The RFC states "79 files of raw client materials" (Context §2), but `onboarding/.input/` contains 95 files (including `.gitkeep`, `README.md`, and 13 amend-001 files). Minor, but evidence citations should be accurate.
- All required sections are present and contain real content. Decision, CLI surface, TypeScript contracts, file system responsibilities, output format, failure modes, rollout, alternatives, risks, and acceptance criteria are substantive.

## Axis B — DNA alignment

- **DNA-44, DNA-45, DNA-46** are real invariants in `docs/architecture-dna.md` and the RFC body explains how each is engaged (`sternsystem.register` creates the bundle, writes the registry entry, opens the first mission).
- **DNA-47 (Materialization) is in `related[]` but not `satisfies[]`.** The RFC says `sternsystem.register` "triggers `mission.materialize`" (Design §sternsystem.register step 5), which directly engages DNA-47. It should be in `satisfies[]`.
- No conflicts with existing DNA invariants. The RFC explicitly preserves DNA-44 (bundle contract) and DNA-46 (mission lifecycle) in nonGoals.

## Axis C — Ecosystem fit

- **CRITICAL — `sternsystem.register` already exists.** The command is registered in `@gogol/site-kernel-handoff/src/sternsystem/sternsystem.module.ts:31-48` (RFC-0354). The existing implementation:
  - Lives in `@gogol/site-kernel-handoff`, not `@gogol/site-kernel` as the RFC states.
  - Uses flags `--id`, `--cosmicStar`, `--repo`, `--platform`, `--mirror`.
  - Only writes the registry entry — does NOT create a pin file, open a mission, trigger materialization, or create content stubs.
  
  The RFC proposes flags `--system`, `--cosmic-star`, `--amend`, `--amend-id` and adds mission opening + materialization. The RFC's `commands.added` lists `sternsystem.register` as new, but it should be `commands.changed`. The RFC must acknowledge the existing implementation and specify whether it extends or replaces it. The flag rename (`--id` → `--system`, `--cosmicStar` → `--cosmic-star`) is a breaking interface change.

- **11 unaddressed commands.** `packages/os/site-kernel-onboarding/src/module.ts` registers 16 commands. The RFC's `commands.removed` lists 5. The remaining 11 are unaddressed:
  - Amend lifecycle: `amend.input.validate`, `amend.system.merge`, `amend.delta.files`, `content.coverage.delta`, `amend.atoms.merge`, `amend.provenance.append`, `amend.provenance.validate`
  - Biome: `biome.tokens.derive`, `biome.site-background.derive`
  - Config: `config.regenerate`, `config.template.sync`
  
  The RFC must state whether these are kept, removed, or migrated. The amend commands reference `onboarding/.input/{batch}/` and `onboarding/.output/{batch}/` paths that the RFC's new per-system layout changes. The `config.regenerate` and `config.template.sync` commands reference `apps/<id>/` paths that are retired.

- **`packagesImpacted` issues.** Lists `@gogol/forge` but no changes to that package are described (the `fo-onboard` skill lives in `.agents/skills/`, not `packages/forge/`). Does not list `@gogol/site-kernel-handoff`, which is where `sternsystem.register` currently lives and would be impacted if the command is moved or its flags change.

- **Compass sync not mentioned.** The RFC changes repository-wide onboarding paths and command surfaces but does not identify which `docs/*.xml` files need synchronization (root AGENTS.md Compass document duties).

- **`index.ts` cleanup not mentioned.** Deleting `scaffold.ts` and `phase-contract.ts` requires removing their exports from `packages/os/site-kernel-onboarding/src/index.ts` (`runOnboardingScaffold`, `runOnboardingInputValidate`, `runOnboardingPhaseValidate`, type exports). The file system responsibilities table does not list `index.ts`.

## Axis D — Forward-only compliance

- **`phase-contract.ts` deletion vs logic reuse contradiction.** Rollout step 3 says `onboarding.synthesize` "reuses hashing and classification logic from the old `phase-contract.ts`", but the file system responsibilities table says `phase-contract.ts` is **Deleted**. If the file is deleted, the hashing/classification logic must move to a new file (e.g., `synthesize.ts`). The RFC should specify the destination.

- No compatibility shims, no dual-path designs, no backward compatibility layers. The RFC is cleanly forward-only.

## Axis E — Agent-facing policy

- **`versionBump: minor` vs "No migration needed" contradiction.** `versionBump: minor` means Breaks-B (requires migrator per RFC-0479). But rollout step 8 says "No migration needed for existing Sternsystems." If no migrator is needed, `versionBump` should be `patch` (safe) or `none` (prose-only). The RFC must either justify `minor` by registering a migrator, or change the value. The onboarding directory layout is not a Sternsystem data contract (DNA-44), and the `BriefFrontmatter` schema is preserved — so the layer-B break is unclear.

- **nonGoals vs acceptance criteria contradiction on `fo-onboard`.** nonGoals item 5 says "Does not create the fo-onboard skill implementation — this RFC authorizes the skill as a deliverable; implementation follows after acceptance." But acceptance criteria require `fo-onboard` skill to exist at `.agents/skills/fo-onboard/SKILL.md` and orchestrate the full pipeline. Either remove the acceptance criteria for `fo-onboard` (making it a follow-up deliverable), or remove the nonGoal.

- Status gate is correct: "Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented)."
- Implementation notes reference RFC-0224, RFC-0334, RFC-0330 — all correct.

## Axis F — Pragmatism

- **`sternsystem.register` should extend, not recreate.** The existing command in `@gogol/site-kernel-handoff` handles registry entry creation. The RFC's additions (pin file, content stubs, mission opening, materialization trigger) could be added as flags to the existing command rather than creating a new one in a different package. This avoids a command-name conflict and a package-boundary violation.

- **`onboarding.synthesize` earns its existence** — deterministic input validation and hashing is a distinct concern from AI synthesis.

- **`packagesImpacted` scope discipline.** `@gogol/forge` is listed but no changes are described. `@gogol/site-kernel-handoff` is not listed but is impacted.

## Axis G — Blind spots

- **`onboarding/.input/amend-001/` contains 13 active legal-text files** (AGB, datenschutz, impressum, widerruf in de/uk). The RFC says to delete all of `onboarding/.input/` (rollout step 1), but `warpgogol-com` has `currentMission: warpgogol-com-m000013`. If these amend materials were input to an active or recent mission, deleting them loses provenance. The RFC should confirm these materials are fully consumed and no longer needed.

- **`sternsystem.register` atomicity under concurrent registration.** The RFC mentions atomic staging and rollback (Risks §sternsystem.register atomicity) and references DNA-51 (Werkstatt consistency primitives), but doesn't describe how two concurrent `sternsystem.register` calls for different system-ids are serialized. The existing implementation in `@gogol/site-kernel-handoff` uses `readRegistry`/`writeRegistry` — does the RFC's extended version need a lock?

- **`sternsystem.register` partial-failure cleanup.** The RFC says "if `mission.open` or `mission.materialize` fails, the registry entry and pin file are rolled back." But if `mission.materialize` fails after `mission.open` succeeds, does the opened mission get aborted? The RFC should specify the cleanup ordering.

- **`onboarding.synthesize` noop behavior.** The RFC says it returns `noop` (exit 0) if `.input/` doesn't exist. But in the per-system layout, a missing `onboarding/<system-id>/.input/` directory likely means the operator hasn't prepared materials yet. Should this be a `fail` with a diagnostic instead of a silent `noop`?

## Questions for the author

1. The existing `sternsystem.register` in `@gogol/site-kernel-handoff` (RFC-0354) uses `--id`/`--cosmicStar`/`--repo` flags and only writes the registry entry. Does this RFC extend that command (add `--amend`, mission opening, materialization) or replace it entirely? If replacing, why move it from `@gogol/site-kernel-handoff` to `@gogol/site-kernel`?

2. What happens to the 11 commands not listed in `commands.removed`? Specifically: are the amend commands (`amend.input.validate` through `amend.provenance.validate`) kept, removed, or migrated to the new per-system layout? Are `config.regenerate` and `config.template.sync` updated to use `systems/<id>/` paths instead of `apps/<id>/`?

3. `versionBump: minor` requires a migrator (RFC-0479), but rollout step 8 says "No migration needed." Which is correct — is there a layer-B data contract break that requires a migrator, or should `versionBump` be `patch`?

4. Should `fo-onboard` skill existence be an acceptance criterion (requiring implementation in this RFC) or a nonGoal (follow-up deliverable)? The current RFC has it as both.

5. Where does the hashing/classification logic from `phase-contract.ts` move when that file is deleted? Should it be extracted to a new `synthesize.ts` file?
