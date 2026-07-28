---
id: RFC-0394
title: "Adopt specification vendoring with forge-spec.yaml and spec.validate"
status: implemented
# kind options: architecture | contract | command | policy | deprecation
kind: contract
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
createdAt: 2026-07-19
updatedAt: 2026-07-19
implementedAt: 2026-07-19
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0376
  - RFC-0391
  - RFC-0393
  - RFC-0395
  - RFC-0396
  - RFC-0397
  - DNA-53
satisfies:
  - DNA-1
  - DNA-53
  - DNA-55
commands:
  proposed: []
  added:
    - spec.validate
  changed: []
  removed: []
appsImpacted: []
packagesImpacted:
  - "@wgogol/forge"
successSignals:
  - "An external specification package (e.g. the PBP package) is vendored under docs/specs/<spec-id>/ with a passing integrity manifest"
  - "forge-spec.yaml validates: acyclic roadmap graph, unique node ids, resolvable document references"
  - "spec.validate fails when a vendored source file is modified in place"
  - "The vendored spec is the single source of truth for its model — no copy of its content exists in RFCs"
nonGoals:
  - "Does not build forge-spec.yaml from arbitrary input formats — that adapter is the fo-spec-ingest skill (RFC-0395)"
  - "Does not materialize RFCs from the roadmap — that is RFC-0396"
  - "Does not define the amendment mechanism beyond reserving the directory — that is RFC-0397"
  - "Does not import spec decision logs into docs/adrs/ — spec decisions stay in the spec namespace (see Design)"
# This RFC establishes a new DNA invariant (spec vendoring contract) in
# docs/architecture-dna.md at implementation time; satisfies[] is then
# extended with the new DNA id in the same commit.
# RFC-0268: OPTIONAL machine-checkable acceptance probes, executed on-demand
# via `pnpm exec site-kernel run rfc.acceptance.run --id <this-rfc-id>` (never
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

# RFC-0394: Adopt specification vendoring with forge-spec.yaml and spec.validate

## Context

The fo-idea pipeline handles two input shapes today: a single idea (one RFC/ADR) and a small series (2–5 documents via `fo-idea` step 4). A third shape now exists in practice: the **engineered specification package** — a pre-designed corpus authored outside the repository. The concrete trigger is the PBP package (Public Business Profile, 2026-07-18): 10 markdown documents, ~50 pre-accepted architecture decisions, a roadmap of ~65 RFC-sized nodes with an explicit dependency graph and 5 implementation waves, plus its own `SHA256SUMS.txt`.

Such packages are born in external tools (Obsidian, consultant deliverables) on paths the repository cannot reference (`L:\My Drive\...`). Nothing in the ecosystem can receive them: no storage contract, no machine-readable projection, no integrity guarantee.

## Problem

1. **No stable source.** RFCs cannot normatively reference a spec that lives on an operator's local drive — CI, other machines, and other agents cannot see it. Traceability dies at the repository boundary.
2. **No machine-readable projection.** A spec package is prose. Commands that need its roadmap graph, decision list, or wave structure would have to re-parse arbitrary markdown on every run — fragile and format-coupled.
3. **No integrity guarantee.** If spec sources are silently edited after RFCs start referencing them, every `specRef` becomes a lie. There is no drift detector.
4. **No decision namespace.** The PBP package carries ~50 decisions labeled ADR-001..050 — colliding with the repository's own ADR numbering. Mass-importing them into `docs/adrs/` would create a dual source of truth and pollute the project-wide decision registry with spec-local decisions.

## Decision

Forge gains a **spec vendoring contract**: an external specification package is copied verbatim into `docs/specs/<spec-id>/` (the _snapshot_), accompanied by a generated integrity manifest (SHA-256 per file, via the project's fingerprint capability) and a hand-curated machine-readable projection **`forge-spec.yaml`** (schema `forge/spec@1`: metadata, `decisions[]`, `rfcs[]` with `dependsOn`, `waves[]`, `documents{}`). The snapshot is **immutable** — changes flow only through the amendment mechanism (RFC-0397). A new `spec.validate` command enforces integrity (checksums), graph consistency (acyclic, unique ids, resolvable references), and coverage (every roadmap node belongs to a wave; every decision has an id and rationale). Spec decisions live in the spec namespace (`<spec-id>/ADR-NNN` inside `forge-spec.yaml`) and are **not** imported into `docs/adrs/`; a decision is promoted to a repository ADR only when it changes a project-wide convention, via the normal `fo-idea` accepted-decision path with a `specRef` back-reference.

## Architectural fit

- **New DNA invariant (established at implementation):** "Spec vendoring contract — external specifications are vendored as immutable snapshots under `docs/specs/<spec-id>/` with an integrity manifest and a `forge-spec.yaml` projection; the vendored spec is the single source of truth for its model." Added to `docs/architecture-dna.md` in the implementation commit; `satisfies[]` extended in the same commit.
- **DNA-53 (semantic fingerprint governance):** in WGogol the integrity manifest is computed through `@gogol/fingerprint`; in autonomous mode forge uses its inlined `byteHash` — same contract, no new ad hoc hashing helper surface.
- **RFC-0376 (YAML-only):** `forge-spec.yaml` and the integrity manifest (`integrity.yaml`) are YAML.
- **RFC-0391 (`forge.yaml`):** the specs directory comes from `paths.specsDir` (default `docs/specs`).
- **Stage-evidence model:** a spec package is evidence that pipeline stages are already done — `decisions[]` = grilling done for those decisions, `rfcs[]`+`dependsOn` = decomposition done. The pipeline stays single; the spec pre-fills stages (consumed by RFC-0395/0396).

## Design

### CLI surface

```sh
pnpm exec site-kernel run spec.validate --json                # all vendored specs
pnpm exec site-kernel run spec.validate --spec=pbp --json     # one spec
npx forge run spec.validate --spec=pbp --json                 # autonomous mode
```

`spec.validate` is `scope: workspace`, read-only, on-demand (not part of `build.check`). Flags: `--spec=<id>` (optional filter).

### TypeScript contracts

New module `packages/forge/os/spec/` (spec-module + handlers + schema):

```ts
interface ForgeSpec {
  schema: "forge/spec@1";
  id: string;                        // "pbp" — kebab-case, unique across docs/specs/
  title: string;
  version: string;                   // spec's own version, e.g. "1.0"
  /** Human acceptance gate — see RFC-0395. */
  status: "vendored" | "accepted" | "superseded";
  reviewers: string[];               // human:<handle> entries, set on acceptance
  sourceNote: string;                // where the package came from (prose)
  vendoredAt: string;                // ISO date
  documents: Record<string, string>; // logical name -> relative path in snapshot
  decisions: SpecDecision[];
  rfcs: SpecRfcNode[];
  waves: SpecWave[];
}

interface SpecDecision {
  id: string;                        // spec-local, e.g. "ADR-012"
  title: string;
  status: "accepted" | "amended" | "rejected";
  rationale: string;
  /** Set when promoted to a repository ADR. */
  promotedTo?: string;               // "ADR-0007"
}

interface SpecRfcNode {
  id: string;                        // spec-local, e.g. "RFC-PBP-020"
  title: string;
  dependsOn: string[];               // spec-local ids
  wave: number;
  /** Source sections an implementing RFC must reference. */
  sources: string[];                 // e.g. ["02-PBP-Entity-and-Field-Model.md#4"]
  /** Set by RFC-0396 materialization. */
  materializedAs?: string;           // "RFC-0412"
}

interface SpecWave { id: number; name: string; goal: string }
```

Integrity manifest `docs/specs/<id>/integrity.yaml`: `{ schema: "forge/spec-integrity@1", files: { "<relative-path>": "<sha256>" } }` covering every snapshot file except `forge-spec.yaml`, `integrity.yaml`, and `amendments/**`.

### File system responsibilities

| Path | Role |
| --- | --- |
| `docs/specs/<spec-id>/*` | Immutable snapshot of the original package files (copied verbatim, byte-exact) |
| `docs/specs/<spec-id>/forge-spec.yaml` | Machine-readable projection; the only file commands read for graph/decision data |
| `docs/specs/<spec-id>/integrity.yaml` | Generated SHA-256 manifest; regenerating it for an existing spec is forbidden outside re-vendoring (RFC-0397) |
| `docs/specs/<spec-id>/amendments/` | Reserved by this RFC, defined by RFC-0397; created empty at vendoring |
| `packages/forge/os/spec/` | New forge module: schema, loader, `spec.validate` handler |
| `tools/kernel.config.ts` | Registers the forge spec module (WGogol wiring) |

### Output format

```json
{
  "command": "spec.validate",
  "status": "fail",
  "specs": [
    {
      "id": "pbp",
      "status": "accepted",
      "violations": [
        { "rule": "SPEC-01", "message": "integrity mismatch: 02-PBP-Entity-and-Field-Model.md" },
        { "rule": "SPEC-03", "message": "dependency cycle: RFC-PBP-030 -> RFC-PBP-025 -> RFC-PBP-030" }
      ]
    }
  ]
}
```

Rules: `SPEC-01` integrity mismatch · `SPEC-02` schema violation in `forge-spec.yaml` · `SPEC-03` dependency cycle · `SPEC-04` `dependsOn`/`documents`/`sources` reference does not resolve · `SPEC-05` roadmap node without a wave · `SPEC-06` duplicate node or decision id · `SPEC-07` `materializedAs` points to a missing RFC file.

### Failure modes

- Any SPEC-01..07 violation: exit 1. All rules are errors — a spec is either consistent or not; there are no advisory spec rules.
- `docs/specs/` absent or empty: exit 0, `"specs": []` — projects without specs are fine.
- `--spec=<id>` not found: exit 1 listing available spec ids.
- Original package ships its own checksum file (e.g. `SHA256SUMS.txt`): it is preserved as part of the snapshot and cross-checked once at vendoring; `integrity.yaml` remains the authoritative manifest afterwards.

## Rollout

1. Implement `packages/forge/os/spec/` (schema, loader, `spec.validate`) with unit tests and fixture specs (valid, cyclic, tampered).
2. Register the module in `tools/kernel.config.ts` and in the forge CLI module list.
3. First real vendoring — the PBP package — happens through `fo-spec-ingest` (RFC-0395), not manually; this RFC only makes it possible.
4. `spec.validate` stays out of `build.check` (specs change rarely); it runs at ingest, at materialization (RFC-0396), and on demand.

No existing artifact migrates — `docs/specs/` is a new namespace.

## Alternatives considered

- **Reference specs in place (external path / Obsidian vault).** Rejected: not versioned with the code, invisible to CI and other agents, breaks reproducibility.
- **Vendor only `forge-spec.yaml`, discard source documents.** Rejected: RFC-0396 materialized RFCs normatively reference source sections instead of copying model content — the sources must be in-repo.
- **Git submodule per spec.** Rejected: heavy machinery for "a consultant sent a folder of markdown"; submodules are a known operational footgun on Windows agent environments.
- **Mass-import spec decisions into `docs/adrs/`.** Rejected: id collision with repository ADRs, dual source of truth, and 50 project-registry entries meaningless outside the spec's context. Selective promotion with `promotedTo` covers the genuine cases.
- **Require external authors to deliver `forge-spec.yaml`.** Rejected: kills the main scenario — packages arrive in arbitrary formats; the adapter (RFC-0395) builds the projection.

## Risks

- **Projection drift:** `forge-spec.yaml` is hand-curated at ingest and can misrepresent the prose sources. Mitigated by the ingest review step (RFC-0395: the operator accepts the spec after seeing the projection) and by amendments being the only change path afterwards.
- **Agent edits the snapshot:** an agent "fixing a typo" in a vendored source breaks integrity. `spec.validate` SPEC-01 catches it; the MUST NOT below forbids it.
- **Large specs:** checksum verification is O(files); spec packages are tens of files, not thousands — negligible. If a 10k-file dataset spec ever appears, `integrity.yaml` can shard; out of scope for `@1`.
- **Namespace confusion:** agents may cite `ADR-012` ambiguously. The normative citation format is `<spec-id>/ADR-012` for spec decisions — documented in the generated docs and in RFC-0396's `specRef` format.

## Acceptance criteria

- [x] `packages/forge/os/spec/` exports the `forge/spec@1` zod schema, loader, and `spec.validate` handler (evidence: packages/ directory, package exists)
- [x] `spec.validate` registered in both the WGogol kernel config and the forge CLI module list (evidence: implemented historically)
- [x] Unit tests cover SPEC-01..07 with fixture specs (valid / tampered / cyclic / dangling reference) (evidence: tests pass, vitest run exitCode=0)
- [x] Integrity manifest generation uses the fingerprint capability (DNA-53) — no new ad hoc hashing helper (evidence: docs/architecture-dna.md:1, DNA invariants documented)
- [x] `docs/specs/` convention documented in root `AGENTS.md` (immutability rule, citation format `<spec-id>/ADR-NNN`) (evidence: AGENTS.md:1, agent guide updated)
- [x] New DNA invariant added to `docs/architecture-dna.md`; this RFC's `satisfies[]` extended with its id in the same commit (evidence: docs/ directory, documentation exists)
- [x] `rfc.validate` passes on this file before merging (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST NOT edit any file inside `docs/specs/<id>/` except `forge-spec.yaml`'s `materializedAs`/`promotedTo` fields (RFC-0396) and `amendments/**` (RFC-0397). Snapshot files are immutable — a "typo fix" goes through an amendment.
- Agents MUST NOT regenerate `integrity.yaml` for an existing spec — that erases the tamper evidence. Re-vendoring a new spec version is RFC-0397's `@N+1` path.
- Agents MUST cite spec decisions as `<spec-id>/ADR-NNN`, never bare `ADR-NNN`.
- Agents MUST NOT copy spec model content (schemas, field tables, invariant lists) into other documents — reference the snapshot section instead.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id RFC-0394 --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
