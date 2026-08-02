---
id: RFC-0656
title: "Deterministic dist tree hashing — normalize non-deterministic build artifacts"
status: draft
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
reviewers: []
createdAt: 2026-08-02
updatedAt: 2026-08-02
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - DNA-53
  - DNA-58
  - DNA-48
  - DNA-49
  - RFC-0634
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-53
  - DNA-58
  - DNA-48
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
  added:
    - dist.determinism.validate
  changed:
    - leitstand.dev-deploy
    - release.prepare
  removed: []
appsImpacted: []
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - packages/fingerprint
  - packages/os/site-kernel-handoff
successSignals:
  - Two builds from the same commit produce identical distTreeHash
  - dist.determinism.validate reports zero non-deterministic artifacts for a clean build
  - leitstand.propagate succeeds without dev-channel hash mismatch for same-commit releases
nonGoals:
  - Making the entire build byte-reproducible (PDFs, source maps, chunk hashes) — only the distTreeHash needs to be stable
  - Replacing the existing fingerprintTree function — it is extended, not replaced
  - Changing the build-identity.json format or schema
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

# RFC-0656: Deterministic dist tree hashing — normalize non-deterministic build artifacts

## Context

During the 2026-08-02 release session, three builds from the same source commit produced three different `distTreeHash` values:

- `release.prepare` for m000025 → r000007: `sha256:dbdd6c0a...`
- `leitstand.dev-deploy` for m000026 workpiece: different hash
- `release.prepare` for m000026 → r000008: `sha256:a463aad8...`

This blocked `leitstand.propagate`, which verifies that the dev channel's `build-identity.json` `distTreeHash` matches the release manifest. The operator had to manually deploy the release artifact via `wrangler` to align the hashes.

The root cause is that `fingerprintTree` (in `packages/fingerprint/src/fingerprint.ts:64-109`) computes a byte-level hash over all files in `dist/`. While `build-identity.json` is excluded (RFC-0634), other non-deterministic build artifacts are included:

- PDF files with embedded creation timestamps (from Playwright/Puppeteer PDF generation)
- Source maps with absolute filesystem paths
- Astro chunk hashes that depend on module resolution order
- Generated JSON with `createdAt` or `buildTimestamp` fields

## Problem

DNA-53 requires that all project hashes use the shared `@warpgogol/fingerprint` package and be deterministic. DNA-58 requires generated files to be byte-identical across runs. But `fingerprintTree` with `mode: "byte"` hashes raw file bytes — any non-determinism in build output propagates directly to the `distTreeHash`.

DNA-48 (release discipline) depends on `distTreeHash` for build-identity verification at every promotion step (dev → alt → main). When the hash is non-deterministic, `leitstand.propagate` fails with a mismatch even though the content is semantically identical. This forces manual wrangler deploys and breaks the canonical release flow.

DNA-49 (fleet propagation) explicitly requires `distTreeHash` verification between dev and release manifest. The non-determinism makes this verification unreliable.

## Decision

The `@warpgogol/fingerprint` package gains a `mode: "stable"` option for `fingerprintTree` that normalizes known non-deterministic file types before hashing. A new `dist.determinism.validate` command reports which files in a `dist/` directory contribute to hash instability. `release.prepare` and `leitstand.dev-deploy` switch from `mode: "byte"` to `mode: "stable"` for `distTreeHash` computation.

## Architectural fit

- **DNA-53** (semantic fingerprint governance): Extends `@warpgogol/fingerprint` with a new normalization mode, keeping all hashing within the shared package.
- **DNA-58** (generated-file content determinism): The stable mode enforces deterministic output by normalizing non-deterministic fields before hashing.
- **DNA-48** (release discipline): Stable `distTreeHash` enables reliable build-identity verification across the release state machine.
- **DNA-49** (fleet propagation): `leitstand.propagate` and `leitstand.promote` can trust `distTreeHash` comparisons without manual workarounds.
- **Site OS operator model**: `dist.determinism.validate` is a workspace-scope command in the `release` module, callable standalone or integrated into `build.check`.

## Design

### CLI surface

```sh
# Validate dist determinism for a release
pnpm exec site-kernel run dist.determinism.validate --release warpgogol-com-r000008

# Validate dist determinism for a workpiece
pnpm exec site-kernel run dist.determinism.validate --mission warpgogol-com-m000026
```

Flags: `--release` (string) or `--mission` (string). Exactly one required. Scope: workspace.

### TypeScript contracts

```ts
// New option in @warpgogol/fingerprint
interface FingerprintOptions {
  mode: "byte" | "stable";
  ignore?: string[];
}

// Stable mode normalizers (applied per file type before hashing):
// - PDF: strip /CreationDate, /ModDate, /ID fields from PDF metadata
// - Source maps (.js.map, .mjs.map): normalize `sources` paths to relative, strip `sourceRoot`
// - JSON: sort keys, remove `createdAt`, `buildTimestamp`, `generatedAt` fields
// - HTML: strip generated comment headers (already handled by buildGeneratedHeader)

interface DeterminismCheck {
  file: string;
  reason: string;
  stable: boolean;
}

interface DistDeterminismValidateData {
  distPath: string;
  totalFiles: number;
  nonDeterministicFiles: DeterminismCheck[];
  stableHash: string;
  byteHash: string;
  hashesMatch: boolean;
  summary: string;
}
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/fingerprint/src/fingerprint.ts` | Extended — add `mode: "stable"` with per-type normalizers |
| `releases/{release}/dist/` | Read — hashed by `dist.determinism.validate` |
| `missions/{mission}/workpiece/dist/` | Read — hashed by `dist.determinism.validate` |
| `packages/os/site-kernel-handoff/src/release/release-commands.ts` | Changed — use `mode: "stable"` for `fingerprintTree` call |
| `packages/os/site-kernel-handoff/src/leitstand/leitstand-commands.ts` | Changed — use `mode: "stable"` for `fingerprintTree` call |

### Output format

```json
{
  "command": "dist.determinism.validate",
  "distPath": "/path/to/dist",
  "totalFiles": 2075,
  "nonDeterministicFiles": [
    {
      "file": "_print/de/index.pdf",
      "reason": "PDF /CreationDate differs between builds",
      "stable": false
    },
    {
      "file": "chunks/server_BHURFrqS.mjs.map",
      "reason": "Source map contains absolute path in sources[]",
      "stable": false
    }
  ],
  "stableHash": "sha256:abc123...",
  "byteHash": "sha256:def456...",
  "hashesMatch": false,
  "summary": "2 non-deterministic file(s) detected"
}
```

### Failure modes

- `dist.determinism.validate` exits 0 if all files are deterministic (stable hash equals byte hash).
- Exits 1 if non-deterministic files are detected. The `--json` output lists each file and reason.
- If a normalizer fails (e.g., corrupt PDF), the file falls back to byte hashing with a warning.
- `fingerprintTree` with `mode: "stable"` never throws for normalization failures — it falls back to byte hashing per file and records a warning.

## Rollout

- `fingerprintTree` gains `mode: "stable"` as an opt-in option. `mode: "byte"` remains the default for backward compatibility.
- `release.prepare` and `leitstand.dev-deploy` switch to `mode: "stable"` immediately — this is a backward-compatible change because the stable hash is computed from the same file set, just with normalization.
- `dist.determinism.validate` is introduced as a standalone command for diagnosing hash mismatches.
- After a grace period, `dist.determinism.validate` is integrated into `build.check` as a warn-level validator.
- Existing releases with byte-mode hashes are not re-hashed — the transition happens on the next `release.prepare`.

## Alternatives considered

- **Exclude non-deterministic files from the hash entirely**: Rejected — PDFs and source maps are part of the deployed artifact and should contribute to the identity. Excluding them weakens integrity verification.
- **Make the build itself deterministic (reproducible builds)**: Rejected as out of scope — Astro, Playwright PDF generation, and bundler chunk naming are third-party tools with their own non-determinism. Normalizing at the hash level is more practical.
- **Use semantic fingerprint mode for all files**: Rejected — `mode: "semantic"` already exists for source files but does not handle PDF metadata or source map paths. A new `mode: "stable"` combines byte hashing with targeted normalization.

## Risks

- **Normalizer correctness**: A buggy PDF normalizer could strip meaningful content, making two different PDFs hash the same. Mitigation: normalizers only strip known non-deterministic metadata fields (CreationDate, ModDate, ID), not content.
- **Performance**: Normalization requires parsing each file (PDF header scan, JSON parse, source map parse). For large dist directories (2000+ files), this adds ~1-2s. Acceptable for release.prepare which runs once per release.
- **False negatives**: Some non-deterministic artifacts may not be covered by the initial normalizers. `dist.determinism.validate` makes them visible so they can be added incrementally.
- **Hash migration**: Switching from byte to stable mode changes all existing `distTreeHash` values. `leitstand.propagate` comparisons between old (byte) and new (stable) releases will mismatch. Mitigation: the transition happens per-release — new releases use stable mode, old releases retain their byte-mode hash in `release.yaml`.

## Acceptance criteria

- [ ] `fingerprintTree` supports `mode: "stable"` with normalizers for PDF, source map, and JSON file types
- [ ] `dist.determinism.validate` command registered with `--release` and `--mission` flags
- [ ] `dist.determinism.validate` reports non-deterministic files with reasons
- [ ] `release.prepare` uses `mode: "stable"` for `fingerprintTree` call
- [ ] `leitstand.dev-deploy` uses `mode: "stable"` for `fingerprintTree` call
- [ ] Two builds from the same commit produce identical `distTreeHash` in stable mode
- [ ] Unit tests cover each normalizer (PDF, source map, JSON) with pass/fail scenarios
- [ ] `rfc.validate` passes on this file before merging

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id <this-rfc-id> --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
- Prefer existing npm packages for PDF metadata manipulation (e.g. `pdf-lib`) over custom parsers (DNA-53, project preference).
