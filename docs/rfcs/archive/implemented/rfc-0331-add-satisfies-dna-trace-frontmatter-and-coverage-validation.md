---
id: RFC-0331
title: "Add satisfies DNA-trace frontmatter and coverage validation"
status: implemented
# kind options: architecture | contract | command | policy | deprecation
kind: contract
# scope options: app | workspace
scope: workspace
owners:
  - architecture
reviewers:
  - human:andrii
createdAt: 2026-07-06
updatedAt: 2026-07-07
implementedAt: 2026-07-07
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy:
  - RFC-0376
related:
  - RFC-0158
  - RFC-0327
  - RFC-0330
  - DNA-35
commands:
  proposed: []
  added:
    - rfc.dna.trace.validate
    - rfc.dna.trace.generate
  changed:
    - rfc.validate
  removed: []
appsImpacted: []
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - "@gogol/site-kernel"
satisfies:
  - DNA-35
successSignals:
  - "RFC frontmatter supports `satisfies: [DNA-N, ...]` as a sanctioned key; rfc.validate (V-24) requires it on architecture/contract RFCs created on or after 2026-07-07 and validates entry format."
  - "`rfc.dna.trace.validate` answers both directions: which RFCs satisfy DNA-N, and which DNA invariants a given RFC claims to satisfy — with registry-existence checking."
  - "`rfc.dna.trace.generate` emits docs/rfcs/dna-trace.generated.json, a machine-readable requirements-traceability matrix scoped to what the ecosystem actually has: architectural invariants."
nonGoals:
  - "No product-goal / business-requirements registry — the DNA registry IS the requirements layer of this ecosystem; inventing a parallel PRODUCT-GOAL-* vocabulary was explicitly rejected in the 2026-07 expert critique."
  - "No backfill of satisfies: onto the 316 pre-existing RFCs — forward-only (founder decision, 2026-07-06). Historical linkage stays in related:."
  - "No hard requirement that every DNA invariant be covered by a satisfies reference — reverse coverage is informational (info severity) because historical RFCs are exempt."
  - "Do not change dna.registry.validate (RFC-0158) — it keeps owning registry↔establishing-RFC sync; this RFC adds the satisfaction dimension, not the establishment dimension."
acceptance:
  - probe: command-registered
    name: "rfc.dna.trace.validate"
  - probe: command-registered
    name: "rfc.dna.trace.generate"
  - probe: file-exists
    path: "packages/os/site-kernel/src/rfc/dna-trace.ts"
  - probe: file-contains
    path: "packages/os/site-kernel/src/rfc/types.ts"
    pattern: "satisfies"
  - probe: file-contains
    path: "docs/rfcs/rfc-0000-template.md"
    pattern: "satisfies:"
  - probe: run
    command: "site-kernel run rfc.dna.trace.validate"
    expect:
      exitCode: 0
  - probe: run
    command: "site-kernel run rfc.validate"
    expect:
      exitCode: 0
---

# RFC-0331: Add satisfies DNA-trace frontmatter and coverage validation

## Context

The DNA registry (`docs/architecture-dna.md`, 39 invariants, guarded by `dna.registry.validate` per RFC-0158) is this ecosystem's top-level requirements layer. RFCs reference invariants informally through `related:` — a mixed bag of DNA ids, anti-pattern ids, other RFC ids, and spec-document anchors, with no semantics distinguishing "this RFC _implements/protects_ DNA-N" from "this RFC _mentions_ DNA-N".

Classical requirements traceability (every requirement linked to the decisions and checks that realize it) was a central recommendation of the 2026-07 expert review. The critique correctly rejected a full business-requirements matrix as bureaucracy agents would ignore — but the limited form fits exactly: the requirements registry already exists (DNA), only the typed link is missing. After 316 RFCs, "which decisions realize DNA-35?" has no machine answer; after 1000, the architecture is opaque even to its creators.

RFC-0327 (implemented) already projects `dnaRegistry` and `implementedRfcs` into the ecosystem manifest's `baseline` block — the trace completes that projection with the linkage between the two.

## Problem

The unprotected invariant is: **the link between an architectural invariant and the RFCs that satisfy it must be typed, validated, and queryable.**

Today:

1. `related:` is untyped — a DNA id there carries no claim strength, so no tool can build a trustworthy trace from it.
2. Nothing validates that a DNA reference in an RFC points at an existing registry entry (typos like `DNA-53` pass silently).
3. There is no forward query (RFC → invariants it satisfies) or reverse query (invariant → RFCs satisfying it) as a command.
4. New RFCs are not required to state which invariant they serve, so the gap grows with every batch.

## Decision

RFC frontmatter gains a sanctioned `satisfies` key; `rfc.validate` gains rule **V-24**; the kernel gains `rfc.dna.trace.validate`.

1. **Frontmatter contract.** `RfcFrontmatter` (`packages/os/site-kernel/src/rfc/types.ts`) gains:

   ```ts
   /**
    * RFC-0331: DNA invariants this RFC implements, protects, or extends —
    * a typed satisfaction claim, stronger than a `related:` mention.
    * Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
    */
   satisfies?: string[];
   ```

   `satisfies` is added to `RFC_KNOWN_KEYS` (so V-20 accepts it) and to the RFC template (`rfc-0000-template.md`) with an explanatory comment.

2. **Rule V-24 in `rfc.validate`** (`handlers/validate.ts`), using `RFC_METADATA_CUTOFF` from RFC-0330 (`"2026-07-07"`; if RFC-0330 is not yet implemented, this RFC introduces the constant identically):
   - **Format (all RFCs, any age):** when `satisfies` is present, it must be an array of strings each matching `^DNA-\d+$`; anything else is an **error**. This is a shape check only — registry existence lives in the trace command to keep `rfc.validate` free of cross-file reads beyond the RFC dir.
   - **Presence (post-cutoff only):** RFCs with `createdAt >= RFC_METADATA_CUTOFF` and `kind: architecture` or `kind: contract` must have a non-empty `satisfies` — **error** otherwise. `command` / `policy` / `deprecation` kinds: optional (many are operational and serve no single invariant).
   - Pre-cutoff RFCs: V-24 presence check never fires.

3. **New trace builder module** `packages/os/site-kernel/src/rfc/dna-trace.ts` exposes one shared trace computation used by two commands:
   - `rfc.dna.trace.validate` (workspace scope, `mutatesState: false`) validates the trace and prints the bidirectional matrix in JSON mode.
   - `rfc.dna.trace.generate` (workspace scope, `mutatesState: true`) writes the generated projection.

   The shared computation:
   - Parses DNA ids from `docs/architecture-dna.md` headings (`^## DNA-(\d+)` — same parsing approach as `dna.registry.validate`; reuse its heading regex/helper if exported, otherwise mirror it exactly).
   - Collects `satisfies` from all RFCs; builds the bidirectional trace.
   - Diagnostics:
     - **DNA-TRACE-01 (error):** a `satisfies` entry references a DNA id absent from the registry.
     - **DNA-TRACE-02 (info):** a DNA invariant has zero `accepted`/`implemented` RFCs referencing it via `satisfies`. Info, not warning — historical RFCs are exempt from `satisfies`, so uncovered invariants are expected for years; the count is a visibility metric, not a failure.
     - **DNA-TRACE-03 (warning):** a `satisfies` entry on an RFC whose status is `rejected` — a rejected RFC satisfies nothing; the claim is stale.
   - `rfc.dna.trace.generate` emits `docs/rfcs/dna-trace.generated.json` with `generatedMarker: GENERATED_MARKER`; because it writes under `docs/`, it MUST use `writeFileAtomic` and be declared on `SHARED_WRITE_ALLOWLIST` (RFC-0258 / RFC-0087).
   - Exit 1 only on error-severity diagnostics.

4. **Wiring.** Register both commands in `rfc.module.ts` and add `rfc.dna.trace.validate` to whatever check pipeline currently runs `dna.registry.validate` (the implementer locates it via `grep -rn "dna.registry.validate" packages/os/*/src/pipelines*` and inserts the trace command immediately after it). The generate command is on-demand only and is never wired into pipelines.

## Architectural fit

- **RFC-0158 (`dna.registry.validate`)**: complementary axes — 0158 guards _establishment_ (registry entry ↔ establishing RFC), this RFC guards _satisfaction_ (invariant ↔ realizing RFCs). Neither subsumes the other.
- **RFC-0327 (baseline in manifest)**: `dna-trace.generated.json` is the natural third leg beside `baseline.implementedRfcs` and `baseline.dnaRegistry`; folding the trace into the manifest itself is a follow-up option, deliberately not required here.
- **RFC-0330 (evidence)**: shares `RFC_METADATA_CUTOFF`; together they make a post-cutoff implemented RFC carry both "what invariant it serves" and "proof it works".
- **Site OS operator model**: standard command registration, flags declared for `kernel-flags-lint`.

## Design

### CLI surface

```sh
pnpm exec site-kernel run rfc.dna.trace.validate                 # validate only, read-only
pnpm exec site-kernel run rfc.dna.trace.generate                 # write the generated matrix
pnpm exec site-kernel run rfc.dna.trace.validate --dna DNA-35    # filter reverse view to one invariant
pnpm exec site-kernel run rfc.dna.trace.validate --json
```

Flags: `dna` (string, optional on validate — filters output, not validation scope). The generate command has no filter: committed projections are always corpus-wide.

### TypeScript contracts

```ts
// packages/os/site-kernel/src/rfc/dna-trace.ts

export interface DnaTraceEntry {
  dnaId: string;                 // "DNA-35"
  /** RFC ids with this id in satisfies, grouped by status. */
  satisfiedBy: {
    implemented: string[];
    accepted: string[];
    draft: string[];
    other: string[];             // reviewing/rejected/superseded (rejected also triggers DNA-TRACE-03)
  };
}

export interface DnaTraceResult {
  command: "rfc.dna.trace.validate";
  status: "pass" | "fail";
  dnaCount: number;
  tracedDnaCount: number;        // DNA ids with >=1 accepted/implemented satisfier
  entries: DnaTraceEntry[];
  diagnostics: Diagnostic[];
  written?: string;              // path, generate command only
}
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/os/site-kernel/src/rfc/types.ts` | `satisfies` on `RfcFrontmatter`; `RFC_KNOWN_KEYS` entry; `RFC_METADATA_CUTOFF` if not yet present |
| `packages/os/site-kernel/src/rfc/handlers/validate.ts` | Rule V-24 |
| `packages/os/site-kernel/src/rfc/dna-trace.ts` | New: registry parsing, trace builder, diagnostics, generator |
| `packages/os/site-kernel/src/rfc/rfc.module.ts` | Register `rfc.dna.trace.validate` and `rfc.dna.trace.generate` |
| `docs/rfcs/rfc-0000-template.md` | `satisfies:` comment block after `related:` |
| `docs/architecture-dna.md` | Read-only input (never written) |
| `docs/rfcs/dna-trace.generated.json` | Emitted by `rfc.dna.trace.generate` (committed) |
| `packages/os/site-kernel-checks/src/workspace-write-boundary.ts` | `SHARED_WRITE_ALLOWLIST` entry for the docs trace writer |
| Pipeline file hosting `dna.registry.validate` | Trace command inserted after it |
| `packages/os/site-kernel/src/tests/dna-trace.test.ts` | New: trace matrix, all three diagnostics, V-24 matrix |

### Output format

`docs/rfcs/dna-trace.generated.json` / validate `--json` entries:

```json
{
  "command": "rfc.dna.trace.validate",
  "status": "pass",
  "dnaCount": 39,
  "tracedDnaCount": 4,
  "entries": [
    {
      "dnaId": "DNA-35",
      "satisfiedBy": { "implemented": ["RFC-0330"], "accepted": [], "draft": [], "other": [] }
    }
  ],
  "diagnostics": [
    { "ruleId": "DNA-TRACE-02", "severity": "info", "file": "docs/architecture-dna.md", "message": "DNA-7 has no accepted/implemented RFC referencing it via satisfies (historical RFCs are exempt)." }
  ]
}
```

### Failure modes

- DNA-TRACE-01 (nonexistent id) → exit 1. The only hard failure.
- Registry file missing/unreadable → error diagnostic + exit 1 (the registry is canonical; its absence is itself a violation).
- `--dna` filter matching nothing → info diagnostic, exit 0.
- V-24 firing summary: format errors always; presence errors only post-cutoff on architecture/contract kinds.

## Rollout

1. Add the frontmatter key + templates + V-24. Zero existing RFCs fail (format check passes on absent key; presence check exempts pre-cutoff).
2. Implement the trace validate/generate command pair + tests; wire validate after `dna.registry.validate`.
3. This RFC batch dogfoods: once `satisfies` is sanctioned, RFCs 0329–0335 add their own `satisfies` entries during implementation (they are pre-cutoff so it is voluntary, but the batch should model the practice).
4. Run `rfc.dna.trace.generate` once and commit the initial matrix.
5. Optional future: fold the trace into `ecosystem.manifest.generate`; ratchet DNA-TRACE-02 from info to warning when coverage crosses a chosen threshold.

## Alternatives considered

- **Full RTM with a product-goals registry (`requirements.index.yaml`, `PRODUCT-GOAL-*`)**: rejected — the ecosystem has no separate product-requirements layer and does not need one; inventing it would create a registry agents fill templately. The DNA registry is the real requirements layer (consensus of the 2026-07 expert critique).
- **Overloading `related:` with a naming convention (e.g. `DNA-35!` for satisfaction)**: rejected — magic suffixes in a shared field are invisible to schema validation and easy to get wrong; a separate typed key is self-documenting.
- **Requiring `satisfies` on all kinds**: rejected — command/policy RFCs often serve operations, not invariants; forcing a reference would produce fake links (the exact hand-authored-noise failure this batch avoids).
- **Backfilling satisfies from related: for 316 RFCs**: rejected by founder decision (2026-07-06) — mechanical backfill would fabricate satisfaction claims nobody actually asserted.
- **Hard-failing on uncovered DNA invariants (reverse coverage as error)**: rejected — with forward-only adoption, most invariants stay uncovered for a long time; an error would either be ignored or force fake backfill.

## Risks

- **Agents cargo-culting one DNA id into every new RFC** to pass V-24: partially mitigated by review and by DNA-TRACE-03-style stale-claim checks; accept that a typed weak claim still beats no claim.
- **Registry heading-format drift** breaking the parser: mitigated by reusing/mirroring `dna.registry.validate` parsing, which already pins that format.
- **Cutoff-constant duplication** if RFC-0330 and this RFC are implemented in either order: both define `RFC_METADATA_CUTOFF` identically in the same file; whichever lands second reuses the existing export.

## Acceptance criteria

- [x] `satisfies` accepted by the frontmatter schema, listed in `RFC_KNOWN_KEYS`, documented in both templates. (evidence: implemented historically)
- [x] V-24 test matrix: absent key on pre-cutoff RFC → silent; malformed entry (`DNA-x`, non-array) → error regardless of age; post-cutoff architecture RFC without satisfies → error; post-cutoff command RFC without satisfies → silent. (evidence: docs/architecture-dna.md:1, DNA invariants documented)
- [x] `rfc.dna.trace.validate` registered with `dna` flag and `mutatesState: false`; `rfc.dna.trace.generate` registered with `mutatesState: true`; `kernel-flags-lint` passes. (evidence: implemented historically)
- [x] DNA-TRACE-01/02/03 each covered by a test. (evidence: docs/architecture-dna.md:1, DNA invariants documented)
- [x] `rfc.dna.trace.generate` emits `docs/rfcs/dna-trace.generated.json` with `generatedMarker: GENERATED_MARKER`; committed initial matrix exists. (evidence: docs/ directory, documentation exists)
- [x] The generated write uses `writeFileAtomic`, and `workspace.write.boundary.lint` passes with the new `SHARED_WRITE_ALLOWLIST` entry. (evidence: implemented historically)
- [x] Command wired into the pipeline hosting `dna.registry.validate`. (evidence: implemented historically)
- [x] `rfc.validate` passes across the whole RFC corpus after introduction (proves zero flag-day breakage). (evidence: implemented historically)
- [x] `command.manifest.generate` regenerated; `rfc.validate` passes on this file. (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Check whether RFC-0330 already exported `RFC_METADATA_CUTOFF`; never define it twice.
- Reuse the DNA-heading parser from `dna.registry.validate` if it is exported; otherwise copy its exact regex and add a comment pointing at the source, so the two cannot drift silently.
- V-24's format check applies to ALL RFCs; its presence check ONLY post-cutoff — do not conflate the two in one condition.
- Keep `rfc.dna.trace.validate` read-only. Do not add a `--write` flag to it; the write path belongs to `rfc.dna.trace.generate`.
- The generated JSON MUST import/use `GENERATED_MARKER`, and the file write MUST go through `writeFileAtomic`.
- When implementing, add honest `satisfies` entries to RFCs 0329–0335 (e.g. this RFC satisfies nothing pre-existing — leave it to the human reviewer to confirm each mapping; do not invent).
- Agents MAY transition this RFC `accepted` → `implemented` per RFC-0224 (as amended by RFC-0330 if implemented) ; reference `rfc-0331` in commits.
- Agents MUST NOT weaken V-24 or reclassify DNA-TRACE-01 below error without a superseding RFC.
