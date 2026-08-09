---
id: RFC-0519
title: Gate catalog generator and validator
status: implemented
kind: command
scope: workspace
owners:
- architecture
reviewers:
- human:andrii-syrokomskyi
createdAt: 2026-07-24
updatedAt: 2026-07-24
enhancedAt: 2026-07-24
implementedAt: 2026-07-24
closedAt: null
supersedes: []
supersededBy: null
amends: []
amendedBy: []
related:
- RFC-0245
- RFC-0246
- RFC-0518
- RFC-0520
satisfies:
- DNA-53
versionBump: patch
commands:
  proposed: []
  added:
  - gate.catalog.generate
  - gate.catalog.validate
  changed:
  - ecosystem.manifest.generate
  removed: []
appsImpacted: []
packagesImpacted:
- '@gogol/site-kernel-checks'
successSignals:
- gate.catalog.generate produces docs/gate-catalog.generated.yaml from command gate metadata and pipeline placement
- gate.catalog.validate drifts when the catalog is stale relative to live command registrations
- gate.catalog.validate is wired into PACKAGES_CHECK_PIPELINE
- Agents can query docs/gate-catalog.generated.yaml to discover gate severity, phase, conditional logic, surfaces, rules, and blocking relationships
nonGoals:
- Does not define gate metadata on command definitions — that is RFC-0518
- Does not extract inline guards into named functions — that is RFC-0520
- Does not change pipeline execution order or validation logic
- Does not generate per-site gate catalogs — the catalog is workspace-scoped
- 'Does not make gate metadata required on all commands — commands without gate metadata appear in the catalog with a ''metadata: absent'' marker'

---

# RFC-0519: Gate catalog generator and validator

## Context

The platform has ~200 validation commands across 6 pipelines. RFC-0518 adds optional `gate?: GateMetadata` to `KernelCommandMetadata`, making gate severity, phase, conditional logic, surfaces, rules, and blocking relationships declarative on the command definition.

However, even with `gate` metadata on individual commands, there is no single artifact that an agent or operator can read to answer:

- "Which gates protect Layer C?"
- "Which gates are warn-mode?"
- "Which gates block `release.prepare`?"
- "Which gates are entitlement-gated?"
- "Which gates run in the author phase vs postbuild?"

The ecosystem manifest (`docs/ecosystem.generated.yaml`) projects command name, scope, providers, and provenance — and after RFC-0518, gate metadata — but it is a dense, general-purpose manifest. A dedicated gate catalog provides a focused, queryable view of the gate landscape.

## Problem

1. **No queryable gate inventory:** Agents must grep handler source code and pipeline files to understand the gate landscape. There is no single file that lists all gates with their metadata.
2. **Pipeline placement is not in the manifest:** The ecosystem manifest projects which commands exist and their scope, but not which pipeline each command runs in. A gate's phase (author vs postbuild) is determined by pipeline placement, which is only visible by reading pipeline files.
3. **No drift detection for gate metadata:** If `gate` metadata (RFC-0518) is added or changed on a command but the ecosystem manifest is not regenerated, the manifest is stale. But there is no dedicated validator that cross-checks gate metadata against pipeline placement and handler behavior.
4. **No "gates without metadata" report:** Commands that act as gates but lack `gate` metadata are invisible in the catalog. A dedicated validator can surface these gaps.

## Decision

Add two new workspace-scoped commands:

- `gate.catalog.generate` — produces `docs/gate-catalog.generated.yaml` from live command registrations (gate metadata from RFC-0518) and pipeline placement.
- `gate.catalog.validate` — drift-checks the committed catalog against live state; also reports commands that appear in validation pipelines but lack `gate` metadata.

Wire `gate.catalog.validate` into `PACKAGES_CHECK_PIPELINE` after `ecosystem.manifest.validate`.

## Architectural fit

- **RFC-0245 (Agent Control Plane manifest):** This RFC follows the same generate/validate/drift pattern. The catalog is a generated artifact; the validator checks for drift.
- **RFC-0246 (Workspace surface validation):** `workspace.surface.validate` checks that workspace packages and pipelines are represented in the ACP manifest. `gate.catalog.validate` is the gate-specific analogue — it checks that gate metadata is represented in the catalog.
- **RFC-0518 (Gate metadata):** This RFC consumes the `gate` field from command definitions. Without RFC-0518, the catalog would have no metadata to project.
- **RFC-0520 (Extract inline guards):** When inline guards are extracted into named functions (RFC-0520), the commands that use them can declare `gate` metadata, which then flows into this catalog.
- **DNA-53 (Semantic fingerprint governance):** The catalog's content hash uses `@gogol/fingerprint` for deterministic output, same as the ecosystem manifest.

## Design

### Catalog schema

`docs/gate-catalog.generated.yaml`:

```yaml
meta:
  schemaVersion: 1
  deterministic: true
  generatedAt: null
  contentHash: <sha256>
  sources:
    - path: packages/os/site-kernel/src/types.ts
      hash: <sha256>
    - path: packages/os/site-kernel-checks/src/command-tables/
      hash: <sha256>
    # ... all command-table files
    - path: packages/os/site-kernel-checks/src/pipelines/
      hash: <sha256>
    # ... all pipeline files

gates:
  - command: platform.consistency.validate
    severity: error
    phase: workspace
    pipelines: [packages-check.run]
    conditional: null
    surfaces: null
    rules: [PC-01, PC-02, PC-03]
    blocks: [release.prepare]
    metadata: present
    rfc: RFC-0478

  - command: surface.contract.validate
    severity: error
    phase: postbuild
    pipelines: [build.check, build.post]
    conditional: null
    surfaces: [url-schema, jsonld-types, sitemap-shape]
    rules: [unmatched-route, parse-error, jsonld-surface-policy-overlap, jsonld-surface-policy-missing]
    blocks: [release.prepare]
    metadata: present
    rfc: RFC-0480

  - command: pseo.validate
    severity: error
    phase: author
    pipelines: [build.check, sites-check.author]
    conditional:
      kind: entitlement
      ref: pseo
      description: "Only runs when the pseo entitlement is active"
    surfaces: null
    rules: null
    blocks: null
    metadata: present
    rfc: RFC-0194

  # Commands in validation pipelines without gate metadata
  - command: content.types.validate
    severity: null
    phase: author
    pipelines: [build.check, sites-check.author]
    conditional: null
    surfaces: null
    rules: null
    blocks: null
    metadata: absent
    rfc: null

summary:
  total: 215
  withMetadata: 15
  withoutMetadata: 200
  bySeverity:
    error: 12
    warning: 2
    mixed: 1
    unknown: 200
  byPhase:
    author: 120
    postbuild: 30
    workspace: 50
    mission: 5
    release: 3
    unknown: 7
```

### Gate discovery logic

The generator discovers gates by:

1. **From command registrations:** All registered commands with `gate` metadata (RFC-0518) are gates. Their metadata is projected directly. The generator uses `listRegisteredKernelCommands()` from `@gogol/site-kernel` to enumerate all registered commands at runtime — this covers both command-table entries and module-registered commands (e.g. in `site-kernel-handoff`).

2. **From pipeline placement:** Commands that appear in validation pipelines but lack `gate` metadata are still gates — they appear with `metadata: absent`. The generator scans the **union** of all validation pipelines and **deduplicates by command name**. A command that appears in multiple pipelines (e.g. `SITES_BUILD_CHECK_PIPELINE` includes `SITES_CHECK_AUTHOR_PIPELINE`) is listed once, with all its pipelines recorded in the `pipelines` field. The scanned pipelines are:
   - `SITES_CHECK_AUTHOR_PIPELINE` → `phase: "author"`
   - `SITES_CHECK_POSTBUILD_PIPELINE` → `phase: "postbuild"`
   - `SITES_BUILD_CHECK_PIPELINE` → unique extra steps beyond `SITES_CHECK_AUTHOR_PIPELINE` (already covered by the author pipeline scan)
   - `PACKAGES_CHECK_PIPELINE` → `phase: "workspace"`
   - `MISSION_PREFLIGHT_CRITICAL` / `MISSION_PREFLIGHT_WARNING` → `phase: "mission"`

   `SITES_BUILD_PREPARE_PIPELINE` and `SITES_BUILD_POST_PIPELINE` are **excluded** because they are composite pipelines: `SITES_BUILD_POST_PIPELINE` includes `SITES_CHECK_POSTBUILD_PIPELINE` (already scanned) plus generation steps (not gates); `SITES_BUILD_PREPARE_PIPELINE` contains codegen steps, not validation gates. Scanning the base validation pipelines plus `PACKAGES_CHECK_PIPELINE` and mission preflight covers all gate-bearing commands without duplication.

   Commands in multiple pipelines get the most specific phase. The full priority order is: `release > mission > postbuild > author > workspace`. This ordering reflects specificity — a command that runs in both author and postbuild pipelines is primarily a postbuild gate (it requires built dist); a command in both workspace and author pipelines is primarily an author gate (it has site context).

3. **From RFC provenance:** The `rfc` field is derived from `commandProvenance` in the ecosystem manifest — the RFC that proposed or added the command.

### Commands

#### `gate.catalog.generate`

```sh
pnpm exec werkstatt run gate.catalog.generate
```

Workspace-scoped. Reads live command registrations via `listRegisteredKernelCommands()` from `@gogol/site-kernel` (covers both command-table entries and module-registered commands in `site-kernel-handoff`). Reads pipeline constants from `packages/os/site-kernel-checks/src/pipelines/**`. Writes `docs/gate-catalog.generated.yaml`. Uses `@gogol/fingerprint` for the content hash and source hashes.

| Flag     | Type    | Description                        |
| -------- | ------- | ---------------------------------- |
| `--json` | boolean | JSON output for agent consumption. |

**Reads:** `packages/os/site-kernel/src/types.ts`, `packages/os/site-kernel-checks/src/command-tables/**`, `packages/os/site-kernel-checks/src/pipelines/**`, `packages/os/site-kernel-handoff/src/**/*.ts` (module-registered commands with `gate` metadata), `tools/kernel.config.ts`, `docs/rfcs/**/*.md`, `docs/ecosystem.generated.yaml` (for `commandProvenance`)

**Writes:** `docs/gate-catalog.generated.yaml`

**Cacheable:** `false` (depends on live command registrations, not just file contents)

#### `gate.catalog.validate`

```sh
pnpm exec werkstatt run gate.catalog.validate
```

Workspace-scoped. Compares the committed `docs/gate-catalog.generated.yaml` against live state. Reports drift as diagnostics.

| Flag     | Type    | Description                        |
| -------- | ------- | ---------------------------------- |
| `--json` | boolean | JSON output for agent consumption. |

**Reads:** `docs/gate-catalog.generated.yaml`, `packages/os/site-kernel/src/types.ts`, `packages/os/site-kernel-checks/src/command-tables/**`, `packages/os/site-kernel-checks/src/pipelines/**`, `packages/os/site-kernel-handoff/src/**/*.ts`, `tools/kernel.config.ts`, `docs/rfcs/**/*.md`, `docs/ecosystem.generated.yaml`

**Writes:** none

**Cacheable:** `false`

Diagnostics:

| Rule | Severity | Condition |
| --- | --- | --- |
| `GATE-CAT-01` | error | `docs/gate-catalog.generated.yaml` is missing |
| `GATE-CAT-02` | error | Catalog drifted from live command registrations |
| `GATE-CAT-03` | warning | Command appears in a validation pipeline but lacks `gate` metadata |
| `GATE-CAT-04` | warning | Command's declared `phase` does not match its pipeline placement |
| `GATE-CAT-05` | warning | Command declares `blocks` referencing a workflow step that does not exist |

### Pipeline integration

`gate.catalog.validate` is added to `PACKAGES_CHECK_PIPELINE` after `workspace.surface.validate` (which itself runs after `ecosystem.manifest.validate`):

```ts
// In packages-check.ts
{ command: "ecosystem.manifest.validate" },
{ command: "workspace.surface.validate" },
// RFC-0519: gate catalog drift detection
{ command: "gate.catalog.validate" },
```

### Ecosystem manifest integration

`ecosystem.manifest.generate` is updated to include `docs/gate-catalog.generated.yaml` in its source hashes (same as it includes `docs/ecosystem.generated.yaml` sources). This ensures that catalog changes are reflected in the ecosystem manifest's content hash.

### File system responsibilities

| Path | Role |
| --- | --- |
| `docs/gate-catalog.generated.yaml` | Generated catalog artifact |
| `packages/os/site-kernel-checks/src/gate-catalog.ts` | New file: `runGateCatalogGenerate`, `runGateCatalogValidate` handlers |
| `packages/os/site-kernel-checks/src/command-tables/20-ecosystem.ts` | Register `gate.catalog.generate` and `gate.catalog.validate` commands |
| `packages/os/site-kernel-checks/src/pipelines/packages-check.ts` | Add `gate.catalog.validate` step |
| `packages/os/site-kernel-checks/src/ecosystem/manifest.ts` | Add `docs/gate-catalog.generated.yaml` to source hashes |
| `packages/os/site-kernel-checks/src/workspace-write-boundary.ts` | Add `gate.catalog.generate` to allowed workspace writes |
| `packages/os/site-kernel-checks/AGENTS.md` | Add `src/gate-catalog.ts` module entry to the module table |

### TypeScript contracts

```ts
interface GateCatalogEntry {
  command: string;
  severity: GateSeverity | null;
  phase: GatePhase | null;
  pipelines: string[];
  conditional: GateConditional | null;
  surfaces: string[] | null;
  rules: string[] | null;
  blocks: string[] | null;
  metadata: "present" | "absent";
  rfc: string | null;
}

interface GateCatalog {
  meta: {
    schemaVersion: 1;
    deterministic: true;
    generatedAt: null;
    contentHash: string;
    sources: Array<{ path: string; hash: string }>;
  };
  gates: GateCatalogEntry[];
  summary: {
    total: number;
    withMetadata: number;
    withoutMetadata: number;
    bySeverity: Record<string, number>;
    byPhase: Record<string, number>;
  };
}
```

### Output format

The catalog is YAML, deterministic (sorted by command name), and uses `@gogol/fingerprint` for content hashing — same pattern as `docs/ecosystem.generated.yaml`.

#### `gate.catalog.generate --json`

```json
{
  "command": "gate.catalog.generate",
  "data": { "file": "docs/gate-catalog.generated.yaml" },
  "exitCode": 0,
  "summary": "gate.catalog.generate: wrote docs/gate-catalog.generated.yaml"
}
```

#### `gate.catalog.validate --json`

```json
{
  "command": "gate.catalog.validate",
  "data": {
    "command": "gate.catalog.validate",
    "status": "pass",
    "count": 0,
    "diagnostics": []
  },
  "exitCode": 0,
  "ok": true
}
```

### Failure modes

| Condition | Exit code | Behavior |
| --- | --- | --- |
| Catalog missing | 1 | GATE-CAT-01 error: `docs/gate-catalog.generated.yaml is missing.` Fix hint: run `gate.catalog.generate`. |
| Catalog stale (gate metadata changed without regeneration) | 1 | GATE-CAT-02 error: `docs/gate-catalog.generated.yaml drifted from live command registrations.` Fix hint: run `gate.catalog.generate`. |
| Command in pipeline without `gate` metadata | 0 | GATE-CAT-03 warning (non-blocking). Expected during incremental backfill. |
| Phase mismatch | 0 | GATE-CAT-04 warning (non-blocking). |
| `blocks` references non-existent workflow step | 0 | GATE-CAT-05 warning (non-blocking). |
| `gate.catalog.generate` fails to read a source file | 1 | Error diagnostic with the file path. Missing optional source files are silently skipped (same as `ecosystem.manifest.generate`). |
| `gate.catalog.generate` runtime command registry is empty | 0 | Produces a valid empty catalog with `total: 0` in the summary. |
| Catalog valid | 0 | No diagnostics. |

## Rollout

- **Default behavior:** `gate.catalog.generate` is run manually or in `build.prepare` (workspace-scoped). `gate.catalog.validate` runs in `PACKAGES_CHECK_PIPELINE`.
- **Initial generation:** After implementation, run `gate.catalog.generate` once to produce the initial catalog. Commit it.
- **Drift detection:** `gate.catalog.validate` in `PACKAGES_CHECK_PIPELINE` catches drift when commands are added, removed, or their `gate` metadata changes without regenerating the catalog.
- **GATE-CAT-03 (missing metadata):** Initially produces ~200 warnings (most commands lack `gate` metadata). This is expected and non-blocking. The warnings decrease as `gate` metadata is backfilled incrementally per RFC-0518.
- **Forward-only:** No migration needed. The catalog is a new artifact.
- **Compass sync:** `docs/verification-plan.xml` should be updated to include `gate.catalog.validate` in the `PACKAGES_CHECK_PIPELINE` verification surface. `docs/ecosystem.generated.yaml` is updated automatically by `ecosystem.manifest.generate`.

## Alternatives considered

- **Embed gate catalog in ecosystem manifest:** Rejected. The ecosystem manifest is already dense with packages, commands, pipelines, RFCs, and DNA registry. A dedicated catalog provides a focused, queryable view. The ecosystem manifest projects `gate` metadata on commands (RFC-0518); the gate catalog is a derived, focused view of that data plus pipeline placement.
- **Per-site gate catalog:** Rejected. Gates are workspace-scoped (they are defined in packages, not per-site). A workspace-level catalog is sufficient.
- **JSON instead of YAML:** Rejected. All generated artifacts in this repo use YAML (ecosystem manifest, maintenance debt baseline, platform version log). Consistency.
- **Make GATE-CAT-03 an error:** Rejected. Initially ~200 commands lack `gate` metadata. Making this an error would block all builds. Warning mode with incremental backfill (RFC-0518) is the pragmatic path.

## Risks

- **Catalog staleness:** If `gate.catalog.generate` is not run after adding/changing `gate` metadata, the catalog is stale. Mitigation: `gate.catalog.validate` in `PACKAGES_CHECK_PIPELINE` catches drift.
- **GATE-CAT-03 noise:** Initially ~200 warnings for missing `gate` metadata. This is expected and non-blocking. Operators and agents should treat GATE-CAT-03 as a backlog, not a failure.
- **Phase mismatch false positives:** A command might legitimately run in both author and postbuild pipelines (e.g. `generated.marker.validate` runs with `--phase=author` and `--phase=postbuild`). The generator handles this by assigning the most specific phase (`release > mission > postbuild > author > workspace`). Commands in multiple phases get the most specific one; the catalog lists all pipelines.
- **Performance:** The generator reads all command-tables and pipeline files (~30 files in `packages/os/site-kernel-checks/src/`), plus `site-kernel-handoff` module files (~15 files). This is fast (file reads + in-memory processing, no network). Comparable to `ecosystem.manifest.generate`, which already scans similar paths.
- **Edge case — empty catalog:** If no commands have `gate` metadata and no validation pipelines have commands (e.g. during initial platform setup), the generator produces a valid empty catalog with `total: 0` in the summary. The validator accepts it.
- **Edge case — concurrent execution:** Two simultaneous `gate.catalog.generate` runs could race on the output file. Mitigation: `writeFileAtomic` (required by `SHARED_WRITE_ALLOWLIST`) prevents partial writes. The last writer wins, which is acceptable since the output is deterministic.

## Acceptance criteria

- [x] `gate.catalog.generate` command is registered and produces `docs/gate-catalog.generated.yaml` (evidence: packages/os/site-kernel-checks/src/gate-catalog.ts:326-338, docs/gate-catalog.generated.yaml exists)
- [x] `gate.catalog.validate` command is registered and drift-checks the catalog (evidence: packages/os/site-kernel-checks/src/gate-catalog.ts:340-444, gate.catalog.validate --json status=pass exit 0)
- [x] `gate.catalog.validate` is wired into `PACKAGES_CHECK_PIPELINE` (evidence: packages/os/site-kernel-checks/src/pipelines/packages-check.ts:84)
- [x] Catalog entries include command, severity, phase, pipelines, conditional, surfaces, rules, blocks, metadata status, and RFC provenance (evidence: GateCatalogEntry interface in gate-catalog.ts:55-66, docs/gate-catalog.generated.yaml)
- [x] Commands in validation pipelines without `gate` metadata appear with `metadata: absent` and produce GATE-CAT-03 warnings (evidence: gate-catalog.ts:374-391, GATE-CAT-03 diagnostic rule)
- [x] `ecosystem.manifest.generate` includes `docs/gate-catalog.generated.yaml` in source hashes (evidence: packages/os/site-kernel-checks/src/ecosystem/manifest.ts:206)
- [x] `pnpm --filter @gogol/site-kernel-checks run build:check` passes (evidence: tsc --noEmit exit 0, 2026-07-24)
- [x] `rfc.validate` passes on this file (evidence: rfc.validate RFC-0519 --json status=pass exit 0)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST run `gate.catalog.generate` after adding or changing `gate` metadata on any command.
- Agents MUST NOT make GATE-CAT-03 an error — it is warning mode to allow incremental backfill.
- Agents SHOULD backfill `gate` metadata on commands they touch, reducing GATE-CAT-03 warnings over time.
- Agents MUST use `@gogol/fingerprint` for all hashes in the catalog (DNA-53).
- The catalog is deterministic (sorted by command name, stable key order) — two runs with the same input produce identical bytes.
