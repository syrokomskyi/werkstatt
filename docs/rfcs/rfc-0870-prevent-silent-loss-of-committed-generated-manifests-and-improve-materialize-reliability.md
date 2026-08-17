---
id: RFC-0870
title: "Prevent silent loss of committed generated manifests and improve materialize reliability"
status: accepted
# kind options: architecture | contract | command | policy | deprecation
kind: architecture
# scope options: app | workspace
scope: workspace
owners:
  - architecture
# Set by the deciding human together with the status change (RFC-0335).
# Draft scaffolds must keep this empty; do not prefill a default identity.
# Format: human:<handle> (agent:<id> reserved — see RFC-0335)
# Default reviewer when none is specified by the operator: human:andrii-syrokomskyi
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-08-17
updatedAt: 2026-08-17
enhancedAt: 2026-08-17
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0834
  - RFC-0869
  - RFC-0204
  - RFC-0081
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-47
  - DNA-58
# RFC-0396: Traceability to a vendored spec node: "<spec-id>/<node-id>", e.g. "pbp/RFC-PBP-020".
# Set by spec.materialize; leave commented for non-spec RFCs.
# specRef:
# RFC-0478: Platform versioning enforcement. Declares the SemVer delta this RFC
# produces when implemented. Required for post-cutoff implemented RFCs (V-29).
# Values: minor (Breaks-B, requires migrator), patch (safe), none (prose-only),
# major (architectural, manually reserved). Default: patch.
versionBump: patch
commands:
  proposed: []
  added: []
  changed: []
  removed: []
appsImpacted: []
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - "@warpgogol/werkstatt"
  - "@warpgogol/werkstatt-site"
successSignals:
  - "A freshly materialized workpiece has all git-tracked generated files present on disk without manual copying."
  - "sternsystem.validate emits STERN-MANIFEST-01 when a committed generated manifest (image-variants, video-manifest, live-video-manifest) is missing from the cache clone HEAD."
  - "Agents encountering a pipeline-not-command error see a actionable hint pointing to the correct command."
nonGoals:
  - "Do not change the materialize atomic-move strategy or STERNSYSTEM_DATA_PATHS."
  - "Do not change the build.prepare pipeline ordering."
  - "Do not auto-generate missing manifests during sternsystem.validate — only report."
# RFC-0268: OPTIONAL machine-checkable acceptance probes, executed on-demand
# via `pnpm exec werkstatt run rfc.acceptance.run --id <this-rfc-id>` (never
# automatically inside build pipelines). Closed probe vocabulary — see
# docs/rfcs/rfc-0268-make-rfc-acceptance-criteria-machine-checkable.md.
# acceptance:
#   - probe: run
#     command: "site-kernel run some.command.validate --app warpgogol-com"
#     expect:
#       exitCode: 0
#   - probe: file-exists
#     path: "packages/share/src/some-new-module.ts"
#   - probe: command-registered
#     name: "some.new.command"
#   - probe: file-contains
#     path: "AGENTS.md"
#     pattern: "Some new governance paragraph"
---

# RFC-0870: Prevent silent loss of committed generated manifests and improve materialize reliability

## Context

RFC-0834 established that generated variant manifests (`src/image-variants.generated.yaml`, `src/video-manifest.generated.yaml`, `src/live-video-manifest.generated.yaml`) are committed to git for drift detection and cold-materialize availability. RFC-0869 further reinforced this by making the manifest a critical input for the `build-portable` image provider.

Despite these policies, during mission `warpgogol-com-m000068` (2026-08-17) three operational gaps were discovered:

1. **Silent manifest deletion:** The manifest was removed from the cache clone in commit `dbe239d` ("fix: remove prematurely restored image-variants manifest (build output, not input)") and no validator caught the deletion until Lighthouse reported `image-delivery-insight` score 0 in production.

2. **Materialize does not restore git-tracked generated files:** After `mission.materialize`, `public/auth.md` (owned by `agent.discovery-endpoints.generate`, `markerPolicy: "registry-only"`) and `src/live-video-manifest.generated.yaml` were absent from the workpiece disk despite being git-tracked. The agent had to manually copy them from the cache clone.

3. **Pipeline vs command confusion:** `build.prepare` is a pipeline, not a command. Running `werkstatt run build.prepare` produces "No target site with a kernel config could be resolved" — an unhelpful error that wastes agent time.

## Problem

1. **No validator detects missing committed manifests in cache clone.** `sternsystem.validate` checks mirror topology, path existence, and bundle storage types — but does not verify that committed generated manifests (`src/image-variants.generated.yaml`, `src/video-manifest.generated.yaml`, `src/live-video-manifest.generated.yaml`) exist in the cache clone HEAD. An agent or operator can `git rm` these files and no check fires until production Lighthouse. This violates DNA-58 (Generated-file content determinism) — the manifest is a committed generated artifact that should be drift-detectable.

2. **`mission.materialize` does not restore all git-tracked files to disk.** The `atomicMoveDir` operation moves the staged workpiece into place, but files with `markerPolicy: "registry-only"` that are git-tracked may not be present on disk if they were not in the staging directory. This forces agents to manually `cp` files from the cache clone, wasting time and risking inconsistency. This violates DNA-47 (Materialization) — a materialized workpiece should be immediately buildable.

3. **Unhelpful error for pipeline-not-command.** When an agent runs `werkstatt run build.prepare`, the error "No target site with a kernel config could be resolved" does not explain that `build.prepare` is a pipeline name, not a command. The agent must discover independently that `image.variants.generate` is the correct command to run directly.

## Decision

Three changes:

1. **`sternsystem.validate` gains a committed-manifest presence check.** After existing mirror topology checks, the validator reads the cache clone git HEAD and verifies that the three committed generated manifests (`src/image-variants.generated.yaml`, `src/video-manifest.generated.yaml`, `src/live-video-manifest.generated.yaml`) are present. These manifest paths are also added to `GENERATOR_OWNERSHIP_MAP` with `markerPolicy: "registry-only"` so they are tracked as generated files. Emits `STERN-MANIFEST-01` (error) for each missing manifest.

2. **`mission.materialize` runs `git checkout -- <file>` for registry-only generated files after `atomicMoveDir`.** After the workpiece is moved into place, materialize runs `git checkout` on all git-tracked files that are in the generator ownership registry with `markerPolicy: "registry-only"`. The registry is read via dynamic `import()` from `@warpgogol/werkstatt-site/checks/generator-ownership` to respect DNA-64 (engine MUST NOT statically import from site plugin). This ensures they exist on disk without manual copying.

3. **Kernel CLI includes a pipeline hint.** When `werkstatt run <name>` fails with "Unknown command" (in `packages/werkstatt/src/kernel/cli/index.ts`) or "No target site with a kernel config could be resolved" (in `packages/werkstatt/src/kernel/runtime/execute-command.ts`) and `<name>` matches a known pipeline name (from `build.prepare`, `build.check`, `build.post`), the error message includes: `Hint: '<name>' is a pipeline, not a command. Run individual steps directly (e.g., 'image.variants.generate') or use 'mission.validate' which executes the full pipeline.`

## Architectural fit

- **DNA-47 (Materialization):** Change 2 directly enforces that a materialized workpiece is immediately buildable — all git-tracked generated files are present on disk.
- **DNA-58 (Generated-file content determinism):** Change 1 enforces that committed generated manifests are not silently deleted from the cache clone. The manifest is a drift-detection artifact; its absence is a policy violation, not a cleanup.
- **RFC-0834:** Change 1 operationalizes the RFC-0834 policy that manifests are committed — it adds a validator that detects when they are missing.
- **RFC-0081 (Generated-file governance):** Change 2 works within the existing generator ownership registry — it reads `markerPolicy` to determine which files need `git checkout`.
- **Site OS operator model:** Change 3 is a CLI runner improvement, not a new command. It affects all `werkstatt run` invocations.

## Design

### CLI surface

No new commands. Changes are internal to existing commands:

```sh
# Change 1: sternsystem.validate now includes manifest presence check
pnpm exec werkstatt run sternsystem.validate --id warpgogol-com --json

# Change 2: mission.materialize now restores registry-only files automatically
pnpm exec werkstatt run mission.materialize --mission warpgogol-com-m000068 --json

# Change 3: pipeline-not-command error now includes hint
pnpm exec werkstatt run build.prepare
# Error: Unknown command "build.prepare".
# Hint: 'build.prepare' is a pipeline, not a command. Run individual steps directly
# (e.g., 'image.variants.generate') or use 'mission.validate' which executes the full pipeline.
```

### TypeScript contracts

```ts
// Change 1: sternsystem.validate manifest check
interface ManifestPresenceFinding {
  ruleId: "STERN-MANIFEST-01";
  severity: "error";
  message: string;
  affectedSubjectId: string; // cache clone path
  fixHint: string;
}

// Change 2: materialize restoration — reads OwnershipEntry from GENERATOR_OWNERSHIP_MAP
// via dynamic import() from @warpgogol/werkstatt-site/checks/generator-ownership
// Only entries with markerPolicy: "registry-only" and no conditional: true are restored.
interface RegistryOnlyFile {
  path: string;           // e.g., "public/auth.md"
  command: string;        // e.g., "agent.discovery-endpoints.generate"
  markerPolicy: "registry-only";
}

// Change 3: pipeline hint
interface PipelineHint {
  pipelineName: string;   // e.g., "build.prepare"
  suggestions: string[];  // e.g., ["image.variants.generate", "video.variants.generate"]
}
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `systems-cache/{id}/src/image-variants.generated.yaml` | Checked by sternsystem.validate (Change 1) |
| `systems-cache/{id}/src/video-manifest.generated.yaml` | Checked by sternsystem.validate (Change 1) |
| `systems-cache/{id}/src/live-video-manifest.generated.yaml` | Checked by sternsystem.validate (Change 1) |
| `missions/{mission}/workpiece/public/auth.md` | Restored by mission.materialize (Change 2) |
| `missions/{mission}/workpiece/src/*.generated.yaml` | Restored by mission.materialize (Change 2) |
| `packages/werkstatt-site/src/checks/generator-ownership.ts` | Add manifest entries + read for registry-only file list (Changes 1, 2) |
| `packages/werkstatt/src/sternsystem/sternsystem-validate.ts` | Manifest presence check (Change 1) |
| `packages/werkstatt/src/mission/mission-materialize.ts` | git checkout for registry-only files (Change 2) |
| `packages/werkstatt/src/kernel/cli/index.ts` | Pipeline hint on "Unknown command" (Change 3) |
| `packages/werkstatt/src/kernel/runtime/execute-command.ts` | Pipeline hint on "No target site" (Change 3) |

### Output format

Change 1 — `sternsystem.validate --json`:

```json
{
  "command": "sternsystem.validate",
  "status": "fail",
  "diagnostics": [
    {
      "ruleId": "STERN-MANIFEST-01",
      "severity": "error",
      "message": "Committed generated manifest src/image-variants.generated.yaml is missing from cache clone HEAD",
      "affectedSubjectId": "systems-cache/warpgogol-com",
      "fixHint": "Run image.variants.generate in a mission workpiece and commit the manifest via mission.git.commit"
    }
  ]
}
```

### Failure modes

- **STERN-MANIFEST-01** (error): Committed generated manifest missing from cache clone HEAD. Blocks `mission.close` (sternsystem.validate runs during close).
- **Materialize restoration** (silent): If `git checkout` fails for a registry-only file, materialize logs a warning and continues. The file will be caught by `generated.files.validate` in `mission.validate`.
- **Pipeline hint** (cosmetic): If the pipeline name is not recognized, the hint is omitted and the original error is shown unchanged.

## Rollout

- **Change 1 (sternsystem.validate):** Active immediately. All existing Sternsystemen must have committed manifests (RFC-0834 is implemented). If a system is missing a manifest, it is already broken — the validator makes it visible.
- **Change 2 (materialize restoration):** Active immediately. No flag needed — `git checkout` is idempotent and safe for files that already exist on disk.
- **Change 3 (pipeline hint):** Active immediately. The hint is additive to the error message and does not change exit codes or JSON output structure.
- No deprecation path needed — all three changes are backward-compatible improvements to existing commands.

## Alternatives considered

- **Auto-generate missing manifests in sternsystem.validate:** Rejected. Validators must be read-only (K-0004: Evaluation must not mutate its subject). sternsystem.validate should report, not fix.
- **Add a separate `manifest.presence.validate` command:** Rejected. The check belongs in `sternsystem.validate` — it is a Sternsystem-level invariant, not a site-level check.
- **Run `build.prepare` before `generated.files.validate` in `mission.validate`:** Rejected. `build.prepare` already runs before `generated.files.validate` in the pipeline. The issue was that the file was git-tracked but not on disk after materialize — a materialize bug, not a pipeline ordering issue.
- **Make `build.prepare` a real command alias:** Rejected. Pipelines are compositions of commands; making them callable as commands blurs the distinction. The hint (Change 3) is sufficient.

## Risks

- **False positive on new Sternsystemen:** A freshly onboarded system may not have manifests yet. Mitigation: `sternsystem.validate` only checks manifests that are tracked in git (via `git ls-tree HEAD`). If the file is not tracked, no error — the system has not yet committed a manifest.
- **`git checkout` in materialize may conflict with uncommitted changes:** Mitigation: `git checkout -- <file>` only restores files that are tracked and missing from disk. If the file exists with different content, `git checkout` would overwrite it — but materialize just created the workpiece from a fresh staging directory, so there should be no uncommitted changes.
- **Pipeline hint may become stale:** If pipeline names change, the hint dictionary needs updating. Mitigation: the hint reads from the same pipeline registry that defines them.

## Acceptance criteria

- [x] `sternsystem.validate` emits `STERN-MANIFEST-01` when a committed generated manifest is missing from cache clone HEAD (evidence: packages/werkstatt/src/sternsystem/manifest-presence.test.ts:67-80, test "STERN-MANIFEST-01 emitted for tracked manifest missing from HEAD")
- [x] `mission.materialize` restores registry-only generated files to disk after `atomicMoveDir` (evidence: packages/werkstatt/src/mission/mission-materialize.ts:1188-1218, dynamic import of GENERATOR_OWNERSHIP_MAP + git checkout HEAD for non-conditional registry-only entries)
- [x] Kernel CLI includes pipeline hint when a pipeline name is used as a command (evidence: packages/werkstatt/src/kernel/pipeline-hint.test.ts:14-18, test "pipelineHint returns hint for known pipeline names")
- [x] `sternsystem.validate` integrated into existing `mission.close` validation chain (evidence: sternsystem.validate is called by mission.validate which is called by mission.close — STERN-MANIFEST-01 runs as part of sternsystem.validate's existing violation loop)
- [x] Existing Sternsystemen pass without changes (manifests are already committed per RFC-0834) (evidence: checkManifestPresence only flags tracked-but-missing manifests — new systems without manifests are not flagged, verified by manifest-presence.test.ts:82-94)
- [x] `AGENTS.md` updated with note about pipeline vs command distinction (evidence: AGENTS.md:348, "Pipeline vs. command distinction (RFC-0870)")
- [x] `rfc.validate` passes on this file before merging (evidence: `pnpm exec werkstatt run rfc.validate --id RFC-0870 --json` returns 0 errors)

## Implementation notes for agents

<!-- Rules that govern how AI agents interact with this RFC.
     Be explicit. Agents read this section for behavioral policy.

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- For RFCs created on or after 2026-07-07 with acceptance probes: before stamping `implemented`, run
  `site-kernel run rfc.verification.emit --id <this-rfc-id>` and commit the evidence file
  in the same commit (RFC-0330 amended transition precondition).
- Agents MUST NOT weaken or remove enforcement rules established by this RFC
  without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run
  `site-kernel run rfc.supersede.propose --id <this-rfc-id> --reason "..." --invariant "DNA-N"`
  instead of working around it (RFC-0334).
-->
