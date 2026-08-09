---
id: RFC-0532
title: Modernize onboarding for Sternsystem architecture
status: implemented
kind: architecture
scope: workspace
owners:
- architecture
reviewers:
- human:andrii-syrokomskyi
createdAt: 2026-07-25
updatedAt: 2026-07-25
enhancedAt: 2026-07-25
implementedAt: 2026-07-25
closedAt: null
supersedes:
- RFC-0070
- RFC-0076
supersededBy: null
amends: []
amendedBy: []
related:
- DNA-44
- DNA-45
- DNA-46
- DNA-47
- RFC-0029
- RFC-0071
- RFC-0075
- RFC-0354
- RFC-0355
- RFC-0356
- RFC-0381
- RFC-0389
satisfies:
- DNA-44
- DNA-45
- DNA-46
- DNA-47
versionBump: patch
commands:
  proposed:
  - onboarding.synthesize
  added:
  - onboarding.synthesize
  - sternsystem.register
  changed: []
  removed:
  - brief.validate
  - onboarding.input.validate
  - onboarding.phase.validate
  - onboarding.scaffold
  - onboarding.checklist
appsImpacted: []
packagesImpacted:
- '@gogol/site-kernel-onboarding'
- '@gogol/site-kernel-handoff'
successSignals:
- No file under onboarding/ uses the legacy global .input/.output layout — all onboarding artifacts are namespaced under onboarding/<system-id>/.
- The .agents/workflows/ directory no longer contains 00-prepare through 06-handoff phase files — onboarding orchestration is delegated to the fo-onboard forge skill.
- sternsystem.register (extended in @gogol/site-kernel-handoff) creates a complete Sternsystem entry (registry + pin + initial content) and automatically opens the first mission in a single invocation.
- onboarding.synthesize validates and hashes raw client materials from onboarding/<system-id>/.input/ and writes a deterministic input manifest to onboarding/<system-id>/.output/.
- 'The fo-onboard skill orchestrates the full onboarding pipeline: brief validation → AI synthesis → sternsystem.register → first mission, with cumulative knowledge across invocations.'
- No code in the monorepo references apps/<id>/ in onboarding-related paths — all references use systems/<id>/ or missions/<id>/workpiece/.
- Amend onboarding (fo-onboard --amend) reads new raw materials from onboarding/<system-id>/.input/amend-<N>/, runs synthesis, and calls sternsystem.register --amend to update the pin and open an amend mission.
nonGoals:
- Does not change the mission lifecycle itself (DNA-46) — onboarding starts missions but does not modify mission.open, mission.materialize, or mission.close contracts.
- Does not change the Sternsystem bundle contract (DNA-44) — sternsystem.register creates a new Sternsystem but does not alter the pin file schema or bundle structure.
- Does not remove the biome.tokens.derive command (RFC-0071) — it remains useful for deterministic palette derivation during synthesis.
- Does not change the scaffold template set under packages/os/site-kernel-onboarding/src/templates/ — templates are reused by mission.materialize (RFC-0389) and remain in the package.
- Does not change the brief frontmatter schema (client.id, client.domain, i18n, legalJurisdiction) — the schema is preserved; only the validation command name and path change.
- Does not update amend lifecycle commands (amend.input.validate, amend.system.merge, amend.delta.files, content.coverage.delta, amend.atoms.merge, amend.provenance.append, amend.provenance.validate) — these reference onboarding/.input/{batch}/ and apps/<id>/ paths that change with the per-system layout. A follow-up RFC will migrate them to onboarding/<system-id>/.input/amend-<N>/ and missions/<id>/workpiece/ paths.
- Does not update config.regenerate or config.template.sync path references — config.regenerate uses <app> app-scoped paths that are replaced by mission.materialize boilerplate generation; config.template.sync already reads from systems/<app>/ paths. A follow-up RFC will clarify whether config.regenerate is redundant with mission.materialize.
- Does not change biome.site-background.derive — it remains in the package alongside biome.tokens.derive.

---

# RFC-0532: Modernize onboarding for Sternsystem architecture

## Context

The onboarding ecosystem was designed for the `apps/<id>/` layout (RFC-0070, RFC-0076, RFC-0078). Since then, RFC-0354..0356 introduced the Sternsystem architecture: sites are registered in `systems/registry.yaml` (DNA-45), materialized as mission workpieces (DNA-47), and the `apps/` directory is retired (RFC-0381). The onboarding package (`@gogol/site-kernel-onboarding`) and its workflows (`.agents/workflows/00-prepare.md` through `06-handoff.md`) still reference `apps/<id>/` and the global `onboarding/.input/` + `onboarding/.output/` directories.

The `onboarding/.input/` directory contains 95 files of raw client materials (including `.gitkeep`, `README.md`, and 13 `amend-001/` legal text files) for `warpgogol-com`, whose onboarding completed on 2026-05-23 (`onboarding/.output/status.md` shows `lastPhase: handoff`, `outcome: ok-with-build-deferrals`). `warpgogol-com` is now an active Sternsystem in `systems/registry.yaml` with `currentMission: warpgogol-com-m000013`. The raw onboarding data is a historical artifact with no active consumer — the amend-001 materials were consumed by mission m000013 and are present in the Sternsystem content.

Meanwhile, `mission.materialize` (RFC-0389) already reuses scaffold templates from `@gogol/site-kernel-onboarding` for boilerplate generation. The package's template set remains valuable, but its command surface (`onboarding.scaffold`, `brief.validate`, `onboarding.input.validate`, `onboarding.phase.validate`, `onboarding.checklist`) is coupled to the retired `apps/` layout and the global `onboarding/.input/` path.

## Problem

Three issues require resolution:

1. **Stale onboarding data clutters the repository.** `onboarding/.input/` (95 files) and `onboarding/.output/` (phase artifacts) for `warpgogol-com` are committed to git but serve no active purpose. The onboarding completed months ago; the Sternsystem is registered and managed through missions. This is dead weight in the repository.

2. **Onboarding commands reference retired paths.** `onboarding.scaffold` writes to `apps/<id>/` (retired by RFC-0381). `brief.validate` cross-checks against `apps/<id>/src/content/system.md`. `onboarding.input.validate` and `onboarding.phase.validate` read from the global `onboarding/.input/` and write to `onboarding/.output/`. None of these commands are compatible with the Sternsystem architecture (DNA-44, DNA-45).

3. **Onboarding workflows are disconnected from the mission lifecycle.** The 6-phase workflow (`.agents/workflows/00-prepare.md` through `06-handoff.md`) orchestrates a linear pipeline that ends in `apps/<id>/` scaffolding. In the new architecture, site creation = Sternsystem registration (DNA-45) + first mission materialization (DNA-46, DNA-47). The workflow phases for authoring and auditing overlap with the mission lifecycle, creating confusion about where onboarding ends and mission work begins.

## Decision

The onboarding ecosystem is rebuilt around three pillars: (1) per-system onboarding directories (`onboarding/<system-id>/.input/` and `.output/`) replace the global layout, enabling parallel onboarding processes; (2) a forge skill `fo-onboard` replaces the 6-phase workflow files and orchestrates the full pipeline from raw client materials to a registered Sternsystem with an open first mission; (3) one new command (`onboarding.synthesize` — deterministic input validation and hashing) and one extended command (`sternsystem.register` — already exists in `@gogol/site-kernel-handoff` per RFC-0354 for registry entry creation; this RFC extends it with pin file creation, content stubs, mission opening, and materialization trigger) replace the five retired onboarding commands. The existing `onboarding/.input/` and `onboarding/.output/` content is deleted.

## Architectural fit

- **DNA-44 (Sternsystem bundle contract):** `sternsystem.register` creates the Sternsystem entry and pin file, establishing the data-only bundle contract. It does not place runtime scripts or deployable source into the Sternsystem repo — that remains `mission.materialize`'s responsibility.
- **DNA-45 (Fleet registry):** `sternsystem.register` writes the entry into `systems/registry.yaml` with all required fields (`id`, `cosmicStar`, `repo`, `pinnedPlatform`, `currentMission`, `status`, `registeredAt`, `deployment`).
- **DNA-46 (Mission lifecycle):** `sternsystem.register` automatically opens the first mission (`<system-id>-m000001`) after creating the Sternsystem entry, bridging onboarding into the mission lifecycle.
- **DNA-47 (Materialization):** The first mission's Werkstück is materialized from the newly created Sternsystem's pinned data. `sternsystem.register` does not materialize content itself — it triggers `mission.materialize` as a follow-up step.
- **RFC-0389 (boilerplate generation):** Scaffold templates remain in `@gogol/site-kernel-onboarding/src/templates/` and are reused by `mission.materialize`. This RFC does not touch the template set.
- **RFC-0381 (apps retirement):** Removes the last onboarding-related references to `apps/<id>/` in command code and workflows.
- **Forge skill system (RFC-0374, RFC-0524):** `fo-onboard` leverages the forge skill infrastructure for portability, cumulative knowledge across onboarding invocations, and grilling integration for stress-testing client requirements.

## Design

### Directory layout

The global `onboarding/.input/` and `onboarding/.output/` directories are replaced by per-system namespaces:

```
onboarding/
  <system-id>/
    .input/              # Raw client materials (brief, profiles, research, visuals)
      00-brief.md         # Required: brief frontmatter (client.id, client.domain, i18n, legalJurisdiction)
      amend-<N>/          # Optional: amend-specific raw materials
    .output/              # Synthesis artifacts (deterministic + AI-generated)
      input-manifest.json # Deterministic: SHA-256 per file + aggregate inputHash
      synthesis/          # AI-generated: blueprint, family-pick, voice-profile, atoms, etc.
```

Multiple onboarding processes can run in parallel (one per system-id). All artifacts are git-tracked.

### CLI surface

```sh
# Validate and hash raw client materials
pnpm exec werkstatt run onboarding.synthesize --system <system-id> --json

# Create a new Sternsystem and auto-start first mission
pnpm exec werkstatt run sternsystem.register --id <system-id> --cosmicStar <star> --repo <repo-url> --json

# Amend an existing Sternsystem with new raw materials
pnpm exec werkstatt run sternsystem.register --id <system-id> --amend --amend-id <N> --json

# Orchestrate the full onboarding pipeline via skill
/fo-onboard                          # New Sternsystem onboarding
/fo-onboard --amend --system <id>    # Amend existing Sternsystem
```

### Command: onboarding.synthesize

**Scope:** workspace **Module:** `@gogol/site-kernel-onboarding`

Reads raw client materials from `onboarding/<system-id>/.input/`, validates the brief frontmatter, classifies files by kind (brief, profile, research, audit, visual, strategy, other), computes SHA-256 hashes, and writes a deterministic input manifest to `onboarding/<system-id>/.output/input-manifest.json`.

This command is deterministic only — it does not perform AI synthesis (blueprint, voice-profile, atoms, etc.). AI synthesis is the responsibility of the `fo-onboard` skill, which reads the manifest and raw materials to produce synthesis artifacts under `onboarding/<system-id>/.output/synthesis/`.

### Command: sternsystem.register

**Scope:** workspace **Module:** `@gogol/site-kernel-handoff` (existing command, extended)

The existing `sternsystem.register` command in `@gogol/site-kernel-handoff` (RFC-0354) currently creates only the registry entry. This RFC extends it to perform the full onboarding-to-mission bridge in a single invocation:

1. Adds an entry to `systems/registry.yaml` with `id`, `cosmicStar`, `repo`, `pinnedPlatform`, `status: registered`, `registeredAt`, and `deployment` config (existing behavior).
2. Creates the pin file `systems/<id>/system.pin.json` with the current platform version, commit, RFC head, and `platformSemanticHash` (new — delegates to `sternsystem.pin`).
3. Creates initial content stubs: `systems/<id>/content/system.md` with identity and i18n blocks derived from the brief (new).
4. Automatically opens the first mission (`<system-id>-m000001`) by calling `mission.open` (new).
5. Triggers `mission.materialize` to produce the first Werkstück from the pinned data (new).

With `--amend`: updates the pin file, opens an amend mission (`<system-id>-m<NNNNNN>`), and triggers materialization. Does not create a new registry entry.

The existing flags (`--id`, `--cosmicStar`, `--repo`, `--platform`, `--mirror`) are preserved. New flags: `--amend` (boolean), `--amend-id` (number).

### Skill: fo-onboard

**Location:** `.agents/skills/fo-onboard/` **Concern:** code-mutation (orchestrates commands and writes synthesis artifacts)

The skill orchestrates the full onboarding pipeline:

1. **Prepare** — reads `onboarding/<system-id>/.input/00-brief.md`, validates the brief frontmatter (reuses `BriefFrontmatter` schema from `src/brief.ts`).
2. **Synthesize** — runs `onboarding.synthesize` for deterministic validation and hashing, then performs AI synthesis: reads raw materials, produces blueprint, family-pick, voice-profile, atoms, linking-plan, analytics-config, and first-party-data artifacts under `onboarding/<system-id>/.output/synthesis/`.
3. **Register** — runs `sternsystem.register` with the system-id and cosmic-star derived from the brief. The command creates the Sternsystem entry, pin file, initial content, and auto-starts the first mission.
4. **Handoff** — reports the registered Sternsystem, first mission id, and next steps (operator edits in workpiece, then `release.prepare`).

With `--amend`: reads new raw materials from `onboarding/<system-id>/.input/amend-<N>/`, runs synthesis on the delta, and calls `sternsystem.register --amend`.

The skill maintains `learned-principles.md` and `qa-log.md` for cumulative knowledge across onboarding invocations (RFC-0524).

### TypeScript contracts

```ts
interface OnboardingSynthesizeInput {
  system: string; // --system <system-id>
}

interface OnboardingSynthesizeResult {
  command: "onboarding.synthesize";
  system: string;
  status: "pass" | "fail" | "noop";
  manifestPath?: string;
  inputHash?: string;
  fileCount?: number;
  diagnostics: string[];
}

interface SternsystemRegisterInput {
  id: string;           // --id <system-id> (existing flag)
  cosmicStar: string;   // --cosmicStar <star> (existing flag)
  repo: string;         // --repo <repo-url> (existing flag)
  platform?: string;    // --platform <version> (existing flag, optional)
  mirror?: string;      // --mirror <repo-url> (existing flag, optional)
  amend?: boolean;      // --amend (new flag)
  amendId?: number;     // --amend-id <N> (new flag)
}

interface SternsystemRegisterResult {
  command: "sternsystem.register";
  system: string;
  status: "pass" | "fail";
  registryEntry?: {
    id: string;
    cosmicStar: string;
    status: "registered" | "active";
    registeredAt: string;
  };
  pinPath?: string;
  firstMissionId?: string; // e.g. "<system-id>-m000001"
  diagnostics: string[];
}
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `onboarding/<system-id>/.input/` | Raw client materials (read by `onboarding.synthesize`, read by `fo-onboard` skill) |
| `onboarding/<system-id>/.output/input-manifest.json` | Written by `onboarding.synthesize` (deterministic) |
| `onboarding/<system-id>/.output/synthesis/` | Written by `fo-onboard` skill (AI synthesis artifacts) |
| `systems/registry.yaml` | Updated by `sternsystem.register` (new entry or amend update) |
| `systems/<id>/system.pin.json` | Created by `sternsystem.register` |
| `systems/<id>/content/system.md` | Created by `sternsystem.register` (initial content stub) |
| `.agents/workflows/00-prepare.md` through `06-handoff.md` | **Deleted** — replaced by `fo-onboard` skill |
| `.agents/workflows-amend/` | **Deleted** — replaced by `fo-onboard --amend` |
| `.agents/skills/fo-onboard/` | **Created** — new forge skill |
| `packages/os/site-kernel-onboarding/src/brief.ts` | Updated: `BriefFrontmatter` schema preserved, path references changed from `onboarding/.input/` to `onboarding/<system-id>/.input/` |
| `packages/os/site-kernel-onboarding/src/phase-contract.ts` | **Deleted** — phase contract replaced by mission lifecycle. Hashing and classification logic extracted to new `synthesize.ts` |
| `packages/os/site-kernel-onboarding/src/synthesize.ts` | **Created** — `onboarding.synthesize` implementation; reuses hashing and classification logic from the old `phase-contract.ts` |
| `packages/os/site-kernel-onboarding/src/scaffold.ts` | **Deleted** — scaffold replaced by `sternsystem.register` + `mission.materialize` |
| `packages/os/site-kernel-onboarding/src/module.ts` | Updated: removed old commands, added `onboarding.synthesize` |
| `packages/os/site-kernel-onboarding/src/index.ts` | Updated: removed exports of `runOnboardingScaffold`, `runOnboardingInputValidate`, `runOnboardingPhaseValidate`, and related types; added export of `runOnboardingSynthesize` |
| `packages/os/site-kernel-handoff/src/sternsystem/sternsystem-register.ts` | Updated: extended with pin creation, content stubs, `mission.open`, `mission.materialize` orchestration, and `--amend`/`--amend-id` flags |

### Output format

```json
{
  "command": "onboarding.synthesize",
  "system": "example-client",
  "status": "pass",
  "manifestPath": "onboarding/example-client/.output/input-manifest.json",
  "inputHash": "sha256:abc123...",
  "fileCount": 42,
  "diagnostics": []
}
```

```json
{
  "command": "sternsystem.register",
  "system": "example-client",
  "status": "pass",
  "registryEntry": {
    "id": "example-client",
    "cosmicStar": "Vega",
    "status": "registered",
    "registeredAt": "2026-07-25"
  },
  "pinPath": "systems/example-client/system.pin.json",
  "firstMissionId": "example-client-m000001",
  "diagnostics": []
}
```

### Failure modes

- `onboarding.synthesize` exits non-zero if `onboarding/<system-id>/.input/00-brief.md` is missing or fails `BriefFrontmatter` validation. Returns `noop` (exit 0) if the `.input/` directory does not exist.
- `sternsystem.register` exits non-zero if the system-id already exists in `systems/registry.yaml` (without `--amend`). With `--amend`, exits non-zero if the system-id does not exist.
- `sternsystem.register` exits non-zero if `mission.open` or `mission.materialize` fails. Partial state (registry entry without mission) is cleaned up atomically.
- `fo-onboard` skill halts and asks the operator if `onboarding.synthesize` or `sternsystem.register` fails. The skill does not retry automatically.

## Rollout

1. **Delete existing onboarding content** — remove `onboarding/.input/` and `onboarding/.output/` in the implementation commit. `warpgogol-com` is already registered in `systems/registry.yaml`; the raw materials (including `amend-001/` legal texts) are no longer needed — they were consumed by mission m000013 and are present in the Sternsystem content.
2. **Remove old commands** — delete `brief.validate`, `onboarding.input.validate`, `onboarding.phase.validate`, `onboarding.scaffold`, `onboarding.checklist` from `packages/os/site-kernel-onboarding/src/module.ts`. Delete `src/phase-contract.ts` and `src/scaffold.ts`. Remove their exports from `src/index.ts`.
3. **Add new command** — implement `onboarding.synthesize` in a new `packages/os/site-kernel-onboarding/src/synthesize.ts` file (reusing hashing and classification logic extracted from the old `phase-contract.ts`). Register it in `src/module.ts` and export from `src/index.ts`.
4. **Extend sternsystem.register** — update `packages/os/site-kernel-handoff/src/sternsystem/sternsystem-register.ts` to add pin creation (delegate to `sternsystem.pin`), content stub creation, `mission.open` call, `mission.materialize` trigger, and `--amend`/`--amend-id` flags. Update the command registration in `sternsystem.module.ts` with the new flags.
5. **Create fo-onboard skill** — scaffold the skill at `.agents/skills/fo-onboard/` with `SKILL.md`, `learned-principles.md`, and `qa-log.md`. The skill calls `onboarding.synthesize` and `sternsystem.register` and performs AI synthesis between them.
6. **Delete old workflows** — remove `.agents/workflows/00-prepare.md` through `06-handoff.md` and `.agents/workflows-amend/`.
7. **Update AGENTS.md** — update `packages/os/site-kernel-onboarding/AGENTS.md` to reflect new commands, paths, and the `fo-onboard` skill. Update `packages/os/site-kernel-handoff/AGENTS.md` to document the extended `sternsystem.register`. Update root `AGENTS.md` onboarding references.
8. **Update brief.ts** — change path references from `onboarding/.input/` to `onboarding/<system-id>/.input/`. Remove the `apps/<id>/` cross-check (replace with `systems/registry.yaml` check).
9. **Compass sync** — update `docs/COMMANDS.md` and affected `docs/*.xml` files to reflect the new/changed/removed command surfaces. Run `ecosystem.manifest.generate` after updating the registries.
10. **No migration needed for existing Sternsystems** — `warpgogol-com` is already registered; no onboarding data needs to be preserved. No migrator is required (no Sternsystem data contract is changed).
11. **build.check integration** — `onboarding.synthesize` is not added to `build.check` (it is an onboarding-time command, not a build-time check). `sternsystem.register` is not added to `build.check` either.

## Alternatives considered

1. **Rewrite workflows under Sternsystem (6 phases)** — keep the 6-phase workflow structure but update commands and paths. Rejected: the workflow phases for authoring and auditing overlap with the mission lifecycle, creating confusion. Onboarding should end at Sternsystem registration + first mission; authoring and auditing are mission work.

2. **Forge skill only (no new commands)** — encapsulate everything in `fo-onboard` without adding `onboarding.synthesize` or `sternsystem.register`. Rejected: deterministic operations (input hashing, registry mutation, pin creation, mission opening) belong in commands, not skills. Skills are for orchestration and AI synthesis; commands are for deterministic, testable, pipeline-integrable operations.

3. **Mission-integrated onboarding** — a single `mission.onboard` command that accepts raw data, does synthesis, registers the Sternsystem, and materializes content. Rejected: violates separation of concerns. Synthesis (AI-driven, non-deterministic) and registration (deterministic, mutates registry) are fundamentally different operations. Combining them makes testing and debugging harder.

4. **Keep global onboarding/.input/ (single active onboarding)** — preserve the current global directory but update commands for Sternsystem. Rejected: prevents parallel onboarding processes. The per-system namespace (`onboarding/<system-id>/`) is more flexible and aligns with the Sternsystem-per-site architecture.

5. **Migrate existing onboarding content to onboarding/warpgogol-com/** — move the 95 files as a historical archive. Rejected: the onboarding is complete, the Sternsystem is registered, and the raw materials serve no future purpose. Archiving adds repository weight without value.
6. **Create a separate compound command (e.g. `onboarding.register`)** — instead of extending `sternsystem.register`, create a new command that orchestrates registry + pin + mission. Rejected: `sternsystem.register` already exists in `@gogol/site-kernel-handoff` (RFC-0354) and is the natural entry point for Sternsystem creation. Creating a parallel command would violate the one-command-per-concern principle and create naming confusion. Extending the existing command with new flags is the forward-only path.

## Risks

- **Loss of onboarding history for warpgogol-com.** Deleting `onboarding/.input/` removes the raw client materials that produced `warpgogol-com`. Mitigation: the Sternsystem itself (`systems/warpgogol-com/`) and its Bordbuch contain the authoritative state; raw materials were never the source of truth after onboarding completed.
- **fo-onboard skill complexity.** The skill combines deterministic command invocation with AI synthesis, grilling, and cumulative knowledge. This is more complex than a workflow file. Mitigation: the skill delegates deterministic work to commands and focuses on orchestration + AI synthesis, keeping each concern separable and testable.
- **Agent confusion during transition.** Agents familiar with the old commands (`onboarding.scaffold`, `brief.validate`) may try to use them after they are removed. Mitigation: update `packages/os/site-kernel-onboarding/AGENTS.md` and root `AGENTS.md` to clearly document the new command surface and skill.
- **sternsystem.register atomicity.** The command creates a registry entry, pin file, content stubs, and opens a mission in one invocation. A failure mid-way could leave partial state. Mitigation: the command uses atomic staging — if `mission.open` fails, the registry entry and pin file are rolled back. If `mission.materialize` fails after `mission.open` succeeds, the opened mission is aborted before rolling back the registry entry and pin file. Cleanup ordering: abort mission → remove pin file → remove registry entry.
- **Concurrent sternsystem.register calls.** Two concurrent `sternsystem.register` calls for different system-ids both read and write `systems/registry.yaml`. The existing `readRegistry`/`writeRegistry` helpers in `@gogol/site-kernel-handoff` are not serialized. Mitigation: the command uses Werkstatt consistency primitives (DNA-51) for atomic registry mutation. Concurrent calls for the same system-id are rejected by the duplicate-id check. Concurrent calls for different system-ids are safe because the registry is read, appended, and written atomically.
- **Parallel onboarding processes.** The per-system namespace allows multiple onboarding processes simultaneously, which could lead to confusion if operators lose track. Mitigation: each onboarding is self-contained under `onboarding/<system-id>/`, and `sternsystem.register` refuses to create a duplicate entry.

## Acceptance criteria

- [x] `onboarding.synthesize` command is registered in `@gogol/site-kernel-onboarding` and validates `onboarding/<system-id>/.input/00-brief.md` using the preserved `BriefFrontmatter` schema (evidence: packages/os/site-kernel-onboarding/src/synthesize.ts, packages/os/site-kernel-onboarding/src/module.ts:40-58)
- [x] `onboarding.synthesize` writes `onboarding/<system-id>/.output/input-manifest.json` with SHA-256 per file and aggregate `inputHash` (evidence: packages/os/site-kernel-onboarding/src/synthesize.ts)
- [x] `sternsystem.register` command is extended in `@gogol/site-kernel-handoff` and creates a complete `systems/registry.yaml` entry with all DNA-45 required fields (evidence: packages/os/site-kernel-handoff/src/sternsystem/sternsystem-register.ts)
- [x] `sternsystem.register` creates `systems/<id>/system.pin.json` with platform version, commit, RFC head, and `platformSemanticHash` (evidence: packages/os/site-kernel-handoff/src/sternsystem/sternsystem-register.ts delegates to sternsystem.pin)
- [x] `sternsystem.register` automatically opens the first mission (`<system-id>-m000001`) and triggers `mission.materialize` (evidence: packages/os/site-kernel-handoff/src/sternsystem/sternsystem-register.ts calls mission.open then mission.materialize)
- [x] `sternsystem.register --amend` updates the pin and opens an amend mission without creating a new registry entry (evidence: packages/os/site-kernel-handoff/src/sternsystem/sternsystem-register.ts --amend flag handling)
- [x] `fo-onboard` skill exists at `.agents/skills/fo-onboard/SKILL.md` and orchestrates: brief validation → `onboarding.synthesize` → AI synthesis → `sternsystem.register` → handoff (evidence: .agents/skills/fo-onboard/SKILL.md, packages/forge/skills/fo/fo-onboard/SKILL.md)
- [x] `fo-onboard --amend` reads from `onboarding/<system-id>/.input/amend-<N>/` and calls `sternsystem.register --amend` (evidence: .agents/skills/fo-onboard/SKILL.md amend mode section)
- [x] Old commands (`brief.validate`, `onboarding.input.validate`, `onboarding.phase.validate`, `onboarding.scaffold`, `onboarding.checklist`) are removed from `@gogol/site-kernel-onboarding` (evidence: packages/os/site-kernel-onboarding/src/module.ts — old command registrations removed)
- [x] `packages/os/site-kernel-onboarding/src/phase-contract.ts` and `src/scaffold.ts` are deleted (evidence: git log — files deleted in commit 38363ee9a)
- [x] `.agents/workflows/00-prepare.md` through `06-handoff.md` and `.agents/workflows-amend/` are deleted (evidence: git log — deleted in commit fd1c33d07)
- [x] `onboarding/.input/` and `onboarding/.output/` directories are deleted (evidence: git log — deleted in commit fd1c33d07)
- [x] `packages/os/site-kernel-onboarding/src/index.ts` exports are updated (removed old, added new) (evidence: packages/os/site-kernel-onboarding/src/index.ts)
- [x] `packages/os/site-kernel-handoff/src/sternsystem/sternsystem-register.ts` is extended with pin, content stubs, mission opening, and materialization (evidence: packages/os/site-kernel-handoff/src/sternsystem/sternsystem-register.ts)
- [x] No code in `packages/os/site-kernel-onboarding/` references `apps/<id>/` or the global `onboarding/.input/` path (evidence: grep search confirms only amend/config commands retain legacy apps/ references, which are out of scope for this RFC)
- [x] `packages/os/site-kernel-onboarding/AGENTS.md` is updated with new commands, paths, and skill reference (evidence: packages/os/site-kernel-onboarding/AGENTS.md)
- [x] `packages/os/site-kernel-handoff/AGENTS.md` is updated with extended `sternsystem.register` documentation (evidence: packages/os/site-kernel-handoff/AGENTS.md:117-128)
- [x] `docs/COMMANDS.md` and affected `docs/*.xml` Compass files are updated to reflect the new/changed/removed command surfaces (evidence: docs/COMMANDS.md regenerated, docs/ecosystem.generated.yaml regenerated)
- [x] `rfc.validate` passes on this file before merging (evidence: rfc.validate rfc-0532 --json status: pass)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- For RFCs created on or after 2026-07-07 with acceptance probes: before stamping `implemented`, run `site-kernel run rfc.verification.emit --id <this-rfc-id>` and commit the evidence file in the same commit (RFC-0330 amended transition precondition).
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id <this-rfc-id> --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
- Agents MUST preserve the `BriefFrontmatter` Zod schema from `src/brief.ts` — only the path references and validation command change, not the schema itself.
- Agents MUST NOT delete `packages/os/site-kernel-onboarding/src/templates/` — templates are reused by `mission.materialize` (RFC-0389).
- Agents MUST NOT delete `packages/os/site-kernel-onboarding/src/biome.ts` or the `biome.tokens.derive` command — it is not superseded by this RFC.
- The `fo-onboard` skill MUST be created via `forge.port.scaffold` (RFC-0393) to ensure forge-compliant structure.
- The `sternsystem.register` command MUST use Werkstatt consistency primitives (DNA-51) for atomic registry mutation. The extended implementation lives in `@gogol/site-kernel-handoff/src/sternsystem/sternsystem-register.ts`.
- The `sternsystem.register` extension MUST delegate pin creation to the existing `sternsystem.pin` command, mission opening to `mission.open`, and materialization to `mission.materialize` — it must not reimplement their logic.
