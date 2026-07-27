---
id: RFC-0517
title: "Pre-materialize content quality gate for mission materialization"
status: implemented
# kind options: architecture | contract | command | policy | deprecation
kind: architecture
# scope options: app | workspace
scope: workspace
owners:
  - architecture
# Set by the deciding human together with the status change (RFC-0335).
# Draft scaffolds must keep this empty; do not prefill a default identity.
# Format: human:<handle> (agent:<id> reserved — see RFC-0335).
# Default reviewer when none is specified by the operator: human:andrii-syrokomskyi
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-07-24
updatedAt: 2026-07-24
enhancedAt: 2026-07-24
implementedAt: 2026-07-24
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - DNA-46
  - DNA-47
  - RFC-0356
  - RFC-0389
  - RFC-0480
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-46
  - DNA-47
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
  changed:
    - mission.materialize
  removed: []
appsImpacted: []
packagesImpacted:
  - "@gogol/site-kernel-handoff"
  - "@gogol/site-kernel-checks"
  - "@gogol/ontology"
successSignals:
  - "mission.materialize aborts before git init when critical structural validators fail"
  - "evidence/preflight-report.json is written for every materialization"
  - "--skip-preflight records a Bordbuch entry with type: preflight-skipped"
nonGoals:
  - "Does not add a standalone mission.preflight command — future extension"
  - "Does not run generated-artifact-dependent validators (uni.registry.validate, entitlements.validate, etc.) — those require full build.prepare and run in mission.validate"
  - "Does not change the existing mission.validate pipeline or its validator set"
  - "Does not add new validators — reuses existing author-time validators from SITES_CHECK_AUTHOR_PIPELINE"
  - "Does not restructure --report-only mode — it retains its current behavior (version comparison only, no staging, no preflight)"
# RFC-0268: OPTIONAL machine-checkable acceptance probes, executed on-demand
# via `pnpm exec site-kernel run rfc.acceptance.run --id <this-rfc-id>` (never
# automatically inside build pipelines). Closed probe vocabulary — see
# docs/rfcs/rfc-0268-make-rfc-acceptance-criteria-machine-checkable.md.
# acceptance:
#   - probe: run
#     command: "site-kernel run some.command.validate --app webgogol-com"
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

# RFC-0517: Pre-materialize content quality gate for mission materialization

## Context

`mission.materialize` (RFC-0356, RFC-0389) assembles a Werkstück from a pinned Sternsystem bundle plus runtime boilerplate via `generateFullBoilerplate`. The command checks the system status (paused systems are refused), version compatibility (refuse-downgrade), and `system.pin.json` presence — but performs no content quality validation on the materialized workpiece before committing it to git and handing control to the operator.

The first content quality check occurs in `mission.validate`, which runs the full `build.prepare` + `build.check` pipeline (~160 validators). By that point the operator has already invested time in editing the workpiece. If the input data set from the Sternsystem bundle has structural defects (broken `system.md` frontmatter, schema drift, invalid cosmic catalog references), the operator discovers them only after editing — not at materialization time.

DNA-46 (Mission lifecycle) and DNA-47 (Materialization) define the mission container and its Werkstück, but neither invariant includes a pre-edit quality gate. The materialized Werkstück is validated by `mission.validate` after operator edits, not before.

## Problem

There is no automated gate between `generateFullBoilerplate` (which assembles the workpiece) and `git init` (which commits it to version control). Structural defects in the pinned Sternsystem data set — invalid `system.md` frontmatter, biome contract violations, cosmic catalog mismatches, schema drift — pass through silently. The operator discovers them only when running `mission.validate` after editing, wasting operator cycles on a workpiece that was never viable.

The gap is most acute for catch-up missions (platform version upgrade): the pinned data set may be stale relative to the current platform, and structural incompatibilities (e.g. a renamed schema field, a removed cosmic catalog entry) are invisible until the operator has already invested editing effort.

## Decision

`mission.materialize` gains a two-level preflight content quality gate that runs after `generateFullBoilerplate` and `atomicMoveDir`, but before `git init`. Critical-level validators (structural integrity) block materialization on failure. Warning-level validators (content quality) continue with a report. The gate is bypassable via `--skip-preflight`, which records a `preflight-skipped` entry in the Sternsystem Bordbuch for auditability.

## Architectural fit

- **DNA-46 (Mission lifecycle):** Extends the mission lifecycle with a pre-edit quality checkpoint. The mission remains an ephemeral container; the gate adds an automated validation step between materialization and operator editing, reducing wasted operator cycles on non-viable workpieces.
- **DNA-47 (Materialization):** Strengthens the materialization invariant. The Werkstück is now structurally validated before it is committed to git, ensuring the operator receives a viable editing surface.
- **RFC-0356 (Mission materialization):** Extends the materialization flow with a preflight gate. The existing `generateFullBoilerplate` → `atomicMoveDir` → `git init` sequence gains one intermediate step.
- **RFC-0480 (Mission git workpiece):** Compatible. The gate runs before `git init`, so a failed preflight leaves no git history with defective content. The workpiece is preserved on disk for diagnosis (no `rm -rf`), consistent with the disposable Werkstück model.
- **RFC-0389 (Full boilerplate generation):** Compatible. `generateFullBoilerplate` runs before the preflight; the gate validates its output (template files + codegen generators) alongside the pinned data set.
- **Site OS operator model:** No new command. The gate is embedded in `mission.materialize` and reuses existing author-time validators from `SITES_CHECK_AUTHOR_PIPELINE` via `executeKernelCommand`. No new validator functions are created.

## Design

### Insertion point

The preflight gate runs inside `runMissionMaterialize` (`packages/os/site-kernel-handoff/src/mission/mission-materialize.ts`), after `atomicMoveDir(stagingDir, workpieceDir, { replace: true })` and before `git init`:

```
syncCacheClone → copy data → generateFullBoilerplate → atomicMoveDir
  → [PREFLIGHT GATE] → git init → git commit → write report
```

At this point the workpiece is fully assembled on disk (pinned data + template files + codegen output) but has no git history. Validators run against the real workpiece directory.

### CLI surface

```sh
# Normal materialization with preflight gate
pnpm exec site-kernel run mission.materialize --mission <mission-id>

# Skip preflight (records Bordbuch entry)
pnpm exec site-kernel run mission.materialize --mission <mission-id> --skip-preflight

```

New flag on `mission.materialize`:

| Flag | Type | Description |
| --- | --- | --- |
| `--skip-preflight` | boolean | RFC-0517: skip the content quality preflight gate. Records a `preflight-skipped` Bordbuch entry. |

### Validator selection

Two curated subsets of existing author-time validators, exported from `packages/os/site-kernel-checks/src/pipelines/`:

**Critical (block on failure):**

| Validator                 | What it checks                                         |
| ------------------------- | ------------------------------------------------------ |
| `content-types.validate`  | Content type schemas are valid (RFC-0033/0034)         |
| `schema.drift.validate`   | Schemas have not drifted from the platform contract    |
| `cosmic.catalog.validate` | Cosmic catalogs are internally consistent (RFC-0025)   |
| `biome.contract.validate` | Biome configuration in `system.md` is valid (RFC-0071) |

**Warning (continue, report only):**

| Validator | What it checks |
| --- | --- |
| `content.filename.validate` | Page filenames derive from `pageId` (RFC-0090) |
| `naming.content.lint` | Content filenames are kebab-case |
| `mirroring.validate` | Content pages mirrored across language directories (DNA-11) |
| `semantic.drift.validate` | SEO field quality: no identical title/metaDescription, length limits |
| `content.links.validate` | Content links and anchors resolve (RFC-0206) |
| `content.references.validate` | Content references resolve |
| `pbp.content.validate` | PBP content discipline (RFC-0073) |

All validators already exist in `SITES_CHECK_AUTHOR_PIPELINE` (`packages/os/site-kernel-checks/src/pipelines/sites-check-author.ts`). The preflight reuses them via `executeKernelCommand` — invoking each validator individually against an app-scoped context pointing at the workpiece directory. The workpiece is discovered as a site workspace via `tryResolveMissionWorkpiece` when the registry entry has `currentMission` set (by `mission.open`). The preflight iterates the `MISSION_PREFLIGHT_CRITICAL` and `MISSION_PREFLIGHT_WARNING` pipeline constants, calling `executeKernelCommand` for each step's command name.

Validators requiring generated artifacts (`uni.registry.validate`, `entitlements.validate`, `surface.validate`, `blueprint.validate`, etc.) are excluded — they depend on the full `build.prepare` pipeline which runs later in `mission.validate`.

### TypeScript contracts

```ts
interface PreflightValidatorResult {
  command: string;
  ok: boolean;
  exitCode: number;
  summary?: string;
}

interface PreflightReport {
  schemaVersion: "1.0.0";
  missionId: string;
  systemId: string;
  criticalPassed: boolean;
  criticalResults: PreflightValidatorResult[];
  warningResults: PreflightValidatorResult[];
  skipped: boolean;
  ranAt: string; // ISO 8601
}
```

New pipeline constants in `packages/os/site-kernel-checks/src/pipelines/mission-preflight.ts`:

```ts
export const MISSION_PREFLIGHT_CRITICAL: KernelPipelineStep[] = [
  { command: "content-types.validate" },
  { command: "schema.drift.validate" },
  { command: "cosmic.catalog.validate" },
  { command: "biome.contract.validate" },
];

export const MISSION_PREFLIGHT_WARNING: KernelPipelineStep[] = [
  { command: "content.filename.validate" },
  { command: "naming.content.lint" },
  { command: "mirroring.validate" },
  { command: "semantic.drift.validate" },
  { command: "content.links.validate" },
  { command: "content.references.validate" },
  { command: "pbp.content.validate" },
];
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `missions/<missionId>/workpiece/` | Workpiece directory — validators read from here |
| `missions/<missionId>/evidence/preflight-report.json` | Written by the gate after every materialization |
| `systems/<systemId>/bordbuch/events.ndjson` | `preflight-skipped` entry appended when `--skip-preflight` is used |
| `packages/os/site-kernel-handoff/src/mission/mission-materialize.ts` | Insertion point for the gate |
| `packages/os/site-kernel-checks/src/pipelines/mission-preflight.ts` | New file: pipeline constants |
| `packages/os/site-kernel-checks/src/pipelines/index.ts` | Re-export new constants |
| `packages/ontology/src/operations/mission.ts` | Add `preflight-skipped` to `bordbuchEntryKindSchema` |
| `packages/os/site-kernel-handoff/src/bordbuch/bordbuch-io.ts` | Add `preflight-skipped` to `WRITER_ROLE_KINDS["mission"]` |

### Output format

`evidence/preflight-report.json`:

```json
{
  "schemaVersion": "1.0.0",
  "missionId": "webgogol-com-m000123",
  "systemId": "webgogol-com",
  "criticalPassed": true,
  "criticalResults": [
    { "command": "content-types.validate", "ok": true, "exitCode": 0, "summary": "all valid" }
  ],
  "warningResults": [
    { "command": "content.filename.validate", "ok": false, "exitCode": 1, "summary": "2 page(s) with filename not derived from pageId" }
  ],
  "skipped": false,
  "ranAt": "2026-07-24T08:30:00.000Z"
}
```

Bordbuch entry for `--skip-preflight` (appended via `appendBordbuchEntry` with `writerRole: "mission"`):

```json
{
  "schemaVersion": "1.0.0",
  "id": "event-000007",
  "systemId": "webgogol-com",
  "occurredAt": "2026-07-24T08:30:00.000Z",
  "kind": "preflight-skipped",
  "status": "done",
  "missionId": "webgogol-com-m000123",
  "releaseId": null,
  "actor": "agent",
  "summary": "Preflight content quality gate skipped via --skip-preflight flag",
  "metadata": { "reason": "operator override via --skip-preflight flag" },
  "previousHash": "sha256:...",
  "hash": "sha256:..."
}
```

### Failure modes

| Scenario | Behavior |
| --- | --- |
| Critical validator fails | `mission.materialize` throws with a summary of failures. Workpiece is preserved on disk (no `git init`, no `rm -rf`). Operator studies `evidence/preflight-report.json`, fixes the Sternsystem data set, re-runs `mission.materialize`. |
| Warning validator fails | `mission.materialize` continues. Failures are logged to console and written to `evidence/preflight-report.json`. Operator sees what needs fixing during the mission. |
| `--skip-preflight` used | Gate is bypassed. `evidence/preflight-report.json` is written with `skipped: true`. Bordbuch `preflight-skipped` entry is appended. |
| `--report-only` used | Returns early with version comparison report only (existing behavior). No staging, no preflight. |
| Validator command not found | Treated as a critical failure with a clear error message. |
| `executeKernelCommand` throws | Treated as a critical failure for that validator. |

### Bordbuch entry shape

The `preflight-skipped` entry is appended via the existing `appendBordbuchEntry` helper in `packages/os/site-kernel-handoff/src/bordbuch/bordbuch-io.ts`. It follows the standard `BordbuchEntry` schema from `@gogol/ontology/operations` with `kind: "preflight-skipped"` and `writerRole: "mission"`. The `preflight-skipped` kind must be added to the `bordbuchEntryKindSchema` enum in `packages/ontology/src/operations/mission.ts` and to the `mission` entry in `WRITER_ROLE_KINDS` in `bordbuch-io.ts`. The entry is appended before the materialization continues (not after), so the audit trail exists even if materialization subsequently fails.

## Rollout

- **Default behavior:** The preflight gate is active by default on all `mission.materialize` calls. No opt-in flag needed.
- **Existing systems:** No migration required. The gate runs against the workpiece at materialization time; existing pinned data sets that pass `mission.validate` will pass the preflight (the critical validators are a subset of `SITES_CHECK_AUTHOR_PIPELINE`).
- **False positives:** Operators can bypass with `--skip-preflight` (Bordbuch-audited) while a fix is prepared.
- **New systems:** Automatically benefit from the gate from their first materialization.
- **Pipeline integration:** No changes to `build.prepare`, `build.check`, or `mission.validate`. The preflight is a materialization-time gate only.
- `packages/os/site-kernel-checks` exports the new pipeline constants; `packages/os/site-kernel-handoff` imports and runs them.

## Alternatives considered

- **Single blocking level (all validators block):** Rejected because missions are frequently opened to fix content quality issues (missing `metaDescription`, broken links, incomplete translations). A single blocking level would prevent operators from materializing a workpiece whose entire purpose is to fix those exact issues.
- **Standalone `mission.preflight` command:** Rejected for now. A standalone command adds surface area (separate scope, flags, workpiece-vs-cache-clone detection) without clear benefit over an embedded gate. Can be added as a future extension if pre-checks before `mission.open` become needed.
- **Delete workpiece on critical failure:** Rejected. The workpiece is the primary diagnostic surface — deleting it destroys the evidence the operator needs to understand and fix the structural defect. Preserving it (without git init) is consistent with the disposable Werkstück model (DNA-46).
- **Run full `build.prepare` before preflight:** Rejected. `build.prepare` has ~40 steps and takes significant time. The preflight is meant to be a fast structural check, not a full build. Generated-artifact-dependent validators run later in `mission.validate`.

## Risks

- **False positives on critical validators:** If a critical validator (e.g. `cosmic.catalog.validate`) has a false positive, it blocks all materializations for that system. Mitigation: `--skip-preflight` with Bordbuch audit trail. The operator can bypass while investigating.
- **Performance overhead:** The preflight adds 12 validator runs to every materialization. These are author-time validators (file scanning, no build) and typically complete in seconds. The overhead is negligible compared to `generateFullBoilerplate` and the subsequent `mission.validate`.
- **Agent misinterpretation:** Agents may interpret a preflight failure as a reason to fix the workpiece directly. The correct response is to fix the Sternsystem data set (`systems/<id>/`) and re-materialize. The error message and `evidence/preflight-report.json` make this clear.
- **Validator selection drift:** The curated validator lists in `MISSION_PREFLIGHT_CRITICAL` and `MISSION_PREFLIGHT_WARNING` may diverge from `SITES_CHECK_AUTHOR_PIPELINE` over time as new validators are added. Mitigation: the pipeline constants are exported from `packages/os/site-kernel-checks/src/pipelines/` and reviewed during pipeline changes.
- **Bordbuch schema extension:** Adding `kind: "preflight-skipped"` to the `bordbuchEntryKindSchema` enum in `@gogol/ontology/operations`. `bordbuch.validate` must accept this new kind. The kind is documented in this RFC and must be added to the schema and to `WRITER_ROLE_KINDS["mission"]` in `bordbuch-io.ts`.

## Acceptance criteria

- [x] `MISSION_PREFLIGHT_CRITICAL` and `MISSION_PREFLIGHT_WARNING` pipeline constants exported from `packages/os/site-kernel-checks/src/pipelines/mission-preflight.ts` (evidence: packages/os/site-kernel-checks/src/pipelines/mission-preflight.ts:16-31, pnpm --filter @gogol/site-kernel-checks run build:check)
- [x] `mission.materialize` runs the preflight gate after `atomicMoveDir`, before `git init` (evidence: packages/os/site-kernel-handoff/src/mission/mission-materialize.ts:634-642)
- [x] Critical validator failure aborts `mission.materialize` with a clear error message referencing `evidence/preflight-report.json` (evidence: packages/os/site-kernel-handoff/src/mission/mission-materialize.ts:463-475)
- [x] Warning validator failures are logged and written to `evidence/preflight-report.json` without blocking (evidence: packages/os/site-kernel-handoff/src/mission/mission-materialize.ts:477-482)
- [x] `--skip-preflight` flag bypasses the gate and appends a `preflight-skipped` Bordbuch entry (evidence: packages/os/site-kernel-handoff/src/mission/mission-materialize.ts:644-659)
- [x] `evidence/preflight-report.json` is written for every materialization attempt (pass, fail, or skipped) (evidence: packages/os/site-kernel-handoff/src/mission/mission-materialize.ts:391,461,405)
- [x] `bordbuch.validate` accepts the `preflight-skipped` event type (evidence: packages/ontology/src/operations/mission.ts:60, bordbuchEntryKindSchema includes "preflight-skipped")
- [x] `WRITER_ROLE_KINDS["mission"]` in `bordbuch-io.ts` includes `preflight-skipped` (evidence: packages/os/site-kernel-handoff/src/bordbuch/bordbuch-io.ts:34)
- [x] `packages/os/site-kernel-handoff/AGENTS.md` documents the preflight gate in the mission materialization section (evidence: packages/os/site-kernel-handoff/AGENTS.md:98-105)
- [x] `rfc.validate` passes on this file (evidence: pnpm exec site-kernel run rfc.validate --json, only V-30 warning for @gogol/ontology in packagesImpacted)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- For RFCs created on or after 2026-07-07 with acceptance probes: before stamping `implemented`, run `site-kernel run rfc.verification.emit --id <this-rfc-id>` and commit the evidence file in the same commit (RFC-0330 amended transition precondition).
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id <this-rfc-id> --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
- Agents MUST NOT add generated-artifact-dependent validators (e.g. `uni.registry.validate`, `entitlements.validate`, `surface.validate`) to the preflight gate — they require the full `build.prepare` pipeline and run in `mission.validate`.
- Agents MUST NOT delete the workpiece on critical preflight failure — preserve it for diagnosis.
- Agents MUST NOT use `--skip-preflight` silently — the Bordbuch entry is mandatory for auditability.
- When adding a new author-time validator to `SITES_CHECK_AUTHOR_PIPELINE`, agents SHOULD evaluate whether it belongs in the preflight critical or warning set and update `MISSION_PREFLIGHT_*` accordingly.
