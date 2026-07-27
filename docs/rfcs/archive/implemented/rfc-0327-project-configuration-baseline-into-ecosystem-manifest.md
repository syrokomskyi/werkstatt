---
id: RFC-0327
title: "Project configuration baseline into the ecosystem manifest"
status: implemented
# kind options: architecture | contract | command | policy | deprecation
kind: architecture
# scope options: app | workspace
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-07-06
updatedAt: 2026-07-06
implementedAt: 2026-07-06
closedAt:
supersedes: []
supersededBy:
amends:
  - RFC-0245
amendedBy: []
related:
  - RFC-0158
  - RFC-0245
commands:
  proposed: []
  added: []
  changed:
    - ecosystem.manifest.generate
  removed: []
appsImpacted: []
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - "@gogol/site-kernel-checks"
successSignals:
  - "`ecosystem.generated.json` includes a `baseline` object with `implementedRfcs`, `nonImplementedRfcs`, and `dnaRegistry` arrays."
  - "Each entry in `implementedRfcs` carries `id`, `implementedAt`, `kind`, `scope`, and `dnaRefs` extracted from the RFC body."
  - "`dnaRegistry` is parsed from `docs/architecture-dna.md` with `id`, `title`, `provenance`, `establishingRfc`, and `status`."
  - "`docs/architecture-dna.md` is included in the manifest source hashes so DNA registry changes trigger drift."
  - "`ecosystem.manifest.validate` fails when the baseline projection drifts from live RFC/DNA state."
nonGoals:
  - "Do not introduce a separate `baseline.generated.json` file — the baseline lives inside `ecosystem.generated.json`."
  - "Do not introduce new commands — `ecosystem.manifest.generate` and `ecosystem.manifest.validate` already cover generation and drift detection."
  - "Do not replace `dna.registry.validate` (RFC-0158) as the canonical invariant consistency guard."
  - "Do not enforce supersedes-chain integrity in this amendment — that is a future validation concern."
---

# RFC-0327: Project configuration baseline into the ecosystem manifest

## Context

The ecosystem has an implicit _de facto_ baseline: the set of `implemented` RFCs plus the DNA invariant registry (`docs/architecture-dna.md`). However, neither `docs/ecosystem.generated.json` nor any other artifact makes this baseline explicit. An agent working on a new RFC cannot point to a single artifact and say "this is the system state I am declaring against."

RFC-0245 already generates `docs/ecosystem.generated.json` as the Agent Control Plane projection. It includes RFC _counts_ (`rfcs: { accepted, implemented, draft, reviewing }`) but not the RFC list itself, DNA references per RFC, or the DNA registry.

## Problem

An agent cannot answer "what is the current approved configuration baseline?" from a single artifact. It must:

1. Read `docs/rfcs/` to find implemented RFCs.
2. Read each RFC body to find DNA references.
3. Read `docs/architecture-dna.md` for the invariant registry.
4. Cross-reference manually.

This reconstruction is error-prone and creates a gap: no committed snapshot exists that new RFCs declare against.

## Decision

Extend the `EcosystemManifest` (RFC-0245) with a `baseline` object projected by `ecosystem.manifest.generate`. No new command is needed — the existing generation and validation commands cover this.

### Structure

```ts
interface EcosystemManifest {
  // ... existing fields ...
  baseline: {
    implementedRfcs: Array<{
      id: string;
      implementedAt: string;
      kind: string;
      scope: string;
      dnaRefs: string[];
    }>;
    nonImplementedRfcs: Record<string, string[]>;
    dnaRegistry: Array<{
      id: string;
      title: string;
      provenance: "foundational" | "rfc";
      establishingRfc: string | null;
      status: "active" | "reclassified";
    }>;
  };
}
```

### Design decisions

- **No new file.** The baseline lives inside `ecosystem.generated.json` to avoid a second generated artifact with its own drift cycle.
- **No new command.** `ecosystem.manifest.generate` already produces the manifest; `ecosystem.manifest.validate` already fails on drift.
- **DNA refs from body text.** Extracted via `\bDNA-(\d+)\b` regex, not from frontmatter. This captures both formal `Established by` citations and informal references.
- **`docs/architecture-dna.md` added to source hashes** so DNA registry changes trigger manifest drift.
- **`dna.registry.validate` (RFC-0158) remains canonical** for invariant consistency. The baseline is a snapshot projection, not a replacement for the live guard.

## Architectural fit

This amends RFC-0245 by extending the manifest projection. It complements RFC-0158 (`dna.registry.validate`) by making the DNA registry visible in the same artifact agents use for planning. It does not introduce new enforcement — `ecosystem.manifest.validate` already handles drift.

## Design

### Implementation

The `collectBaselineRfcs` function reads all `docs/rfcs/*.md` files, parses frontmatter for `id`, `status`, `implementedAt`, `kind`, `scope`, and extracts DNA references from the full file body via `\bDNA-(\d+)\b` regex. Implemented RFCs are sorted numerically by id. Non-implemented RFCs are grouped by status into `accepted`, `draft`, `reviewing`, `superseded`, `rejected` arrays.

The `collectDnaRegistry` function parses `docs/architecture-dna.md` using the same `## DNA-N · Title` regex as `dna-registry.ts` (RFC-0158), extracting `establishingRfc` from `Established by RFC-XXXX` citations, `provenance` from `Foundational invariant` markers, and `status` from `Reclassified to feature` markers.

`docs/architecture-dna.md` is added to `collectSourceHashes` so DNA registry edits trigger manifest drift.

### File system responsibilities

| Path | Role |
| --- | --- |
| `docs/ecosystem.generated.json` | Gains `baseline` object alongside existing `rfcs` counts |
| `docs/architecture-dna.md` | Read for DNA registry projection; added to source hashes |
| `docs/rfcs/*.md` | Read for RFC metadata and DNA refs (already read for counts and provenance) |

## Alternatives considered

A separate `baseline.generated.json` file with its own `baseline.emit` command was rejected because it would create a second generated artifact with its own drift cycle, duplicating infrastructure that `ecosystem.manifest.generate`/`validate` already provide.

A separate `baseline.validate` command was rejected because `ecosystem.manifest.validate` already detects drift — adding a second validator for the same data would be redundant.

Keeping the RFC list as counts only (status quo) was rejected because counts do not let an agent check whether a specific DNA invariant is established or which RFCs reference it.

## Risks

The baseline projection duplicates data from `docs/architecture-dna.md` and `docs/rfcs/*.md` into the manifest. This is mitigated by: (1) adding `docs/architecture-dna.md` to source hashes, (2) the existing `ecosystem.manifest.validate` drift check, and (3) keeping `dna.registry.validate` (RFC-0158) as the canonical invariant guard.

The DNA ref extraction regex (`\bDNA-(\d+)\b`) may capture incidental mentions in RFC bodies that are not formal invariant citations. This is acceptable — the baseline is a projection for agent orientation, not a normative registry. The canonical DNA registry remains `docs/architecture-dna.md`.

## Rollout

1. Extend `EcosystemManifest` interface with `baseline` field.
2. Implement `collectBaselineRfcs` and `collectDnaRegistry` in `packages/os/site-kernel-checks/src/ecosystem.ts`.
3. Add `docs/architecture-dna.md` to `collectSourceHashes`.
4. Run `ecosystem.manifest.generate` to regenerate the manifest.
5. Verify `ecosystem.manifest.validate` passes.

## Acceptance criteria

- [x] TypeScript types and interfaces defined in the relevant package (evidence: implemented historically)
- [x] `ecosystem.manifest.generate` produces the `baseline` object (evidence: implemented historically)
- [x] `ecosystem.manifest.validate` detects baseline drift (evidence: implemented historically)
- [x] `docs/architecture-dna.md` is in source hashes (evidence: docs/ directory, documentation exists)
- [x] `rfc.validate` passes on this file before merging (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` and stamp `implementedAt`/`updatedAt` once every acceptance criterion is satisfied and checked, validators/build pass, and the change is committed referencing this RFC. Agents MUST NOT perform any other status transition, and MUST NOT mark it `implemented` while any criterion is unmet (RFC-0224).
- Agents MUST check `rfc.list --status accepted` before making structural changes to packages or app tools that relate to this RFC's scope.
- When implementing, agents MUST reference this RFC ID in commit messages or PR descriptions.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
