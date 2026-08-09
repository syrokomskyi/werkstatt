---
name: wg-onboard
description: Onboard a new Sternsystem from raw client materials — synthesize, register, open first mission. Use when starting a new client site or amending an existing one.
invocation: user
concerns: code-mutation
dependsOn: ['my-preferences']
languagePolicy: ref(PREFERENCES.md)
knowledge:
  - qa-log.md
  - learned-principles.md
---

# wg-onboard

Before starting, read `PREFERENCES.md` at the repository root. If the file is missing or `aiLanguage` is unset, ask the operator once and create the file using the `my-preferences` skill semantics.

Orchestrate the full onboarding pipeline: from raw client materials in `onboarding/<system-id>/.input/` to a registered Sternsystem with an open first mission and materialized Werkstück.

## Knowledge layers

The skill maintains two knowledge files alongside `SKILL.md`:

- **`learned-principles.md`** (L2) — distilled concrete principles extracted from past onboarding runs. Read at start; appended after meta-analysis.
- **`qa-log.md`** (L0) — append-only raw Q&A pairs from each run. Used for meta-analysis.

Read L2 at the start of each run. Append to L0 during the run. Distill L2 from L0 at the end.

## Process

### 1. Determine mode and system-id

Two modes:

- **New onboarding** — no `--amend` flag. The operator provides a `<system-id>` (kebab-case). If not provided as an argument, ask the operator.
- **Amend** — `--amend` flag set. The operator provides `--system <id>` and optionally `--amend-id <N>`. If `--system` is not provided, list active systems from `systems/registry.yaml` and ask the operator to choose.

Read L2 (`learned-principles.md`) for any principles relevant to this system or onboarding pattern.

### 2. Prepare

Verify `git config core.hooksPath` is set to `hooks/`. If not, run `git config core.hooksPath hooks/`. This is a non-blocking prerequisite — if the config is already set, proceed without action.

Read `onboarding/<system-id>/.input/00-brief.md`. If the file does not exist, ask the operator to provide raw client materials before proceeding.

Validate the brief frontmatter mentally — check for `client.id`, `client.domain`, `i18n.default`, `i18n.supported`, `legalJurisdiction`. If any required field is missing, ask the operator to fix the brief. Do not edit `.input/` files.

For amend mode: read `onboarding/<system-id>/.input/amend-<N>/` for the amend-specific raw materials. If the directory does not exist, ask the operator where the new materials are.

### 3. Synthesize

Run the deterministic synthesis command: `pnpm exec werkstatt run onboarding.synthesize --system <system-id> --json`.

Parse the result. If `status` is `fail`, report the diagnostics and stop. If `status` is `noop` (no `.input/` directory), ask the operator to provide materials first.

If `status` is `pass`, review the input manifest at `onboarding/<system-id>/.output/input-manifest.json`. Perform AI synthesis by reading the raw materials and producing synthesis artifacts under `onboarding/<system-id>/.output/synthesis/`:

- **Blueprint** — site structure, page list, cosmic star assignment
- **Family-pick** — which UI family/archetype fits the client
- **Voice-profile** — tone, register, language patterns
- **Atoms** — reusable content fragments
- **Linking-plan** — internal linking strategy
- **Analytics-config** — growth vendor and event configuration
- **First-party-data** — data sources and integrations

Commit synthesis artifacts: `git add onboarding/<system-id>/.output/ && git commit -m "feat: synthesize onboarding inputs for <system-id>"`.

### 4. Register

**New onboarding:**

Derive the cosmic star from the blueprint synthesis. If the operator has not specified a star, propose one based on the client's industry and archetype.

Run `pnpm exec werkstatt run sternsystem.register --id <system-id> --cosmicStar <star> --repo <repo-url> --json`.

The command creates the registry entry, pin file, content stubs, opens the first mission (`<system-id>-m000001`), and triggers materialization. If it fails, the command rolls back atomically — report the error and stop.

**Amend:**

Run `pnpm exec werkstatt run sternsystem.register --id <system-id> --amend --amend-id <N> --json`.

The command updates the pin file, opens an amend mission, and triggers materialization.

### 5. Handoff

Report to the operator:

- **Registered Sternsystem** — id, cosmic star, registry status
- **First mission id** — `<system-id>-m000001` (or amend mission id)
- **Pin path** — `systems/<system-id>/system.pin.json`
- **Next steps** — operator edits content in the mission workpiece, then runs `release.prepare` → `mission.reconcile` → `mission.close`

### 6. Meta-analysis and learning

After the pipeline completes:

1. Review L0 (`qa-log.md`) entries from this run.
2. Identify recurring decision patterns (e.g. cosmic star selection criteria, synthesis artifact quality issues).
3. Formulate concrete principles.
4. Present principles to the operator for approval.
5. Append approved principles to L2 (`learned-principles.md`).
6. Commit knowledge file updates: `git add packages/warpgogol-skills/skills/wg-onboard/learned-principles.md packages/warpgogol-skills/skills/wg-onboard/qa-log.md && git commit -m "chore: update wg-onboard knowledge from run"`.

## Completion criteria

- `onboarding.synthesize` returned `status: pass` with a valid input manifest.
- Synthesis artifacts were produced under `onboarding/<system-id>/.output/synthesis/`.
- `sternsystem.register` returned `status: pass` with a registry entry, pin path, and first mission id.
- The operator received the handoff report with next steps.
- Knowledge files were updated and committed.

## Constraints

- **User-invoked only.** Never auto-run.
- **Never write under `onboarding/<system-id>/.input/`.** Raw client materials are human-owned.
- **Commit immediately after each verified step.** Never respond with uncommitted changes.
- **Do not edit `.input/` files.** If the brief is invalid, ask the operator to fix it.
- **Atomic rollback is handled by `sternsystem.register`.** If registration fails, the command cleans up partial state. Report the error and stop — do not attempt manual cleanup.
- **Read `_shared/fo-pipeline-conventions.md`** for commit discipline, language policy, and build verification rules.
