---
id: RFC-0656
title: "Deterministic dist tree hashing — normalize non-deterministic build artifacts"
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
createdAt: 2026-08-02
updatedAt: 2026-08-02
enhancedAt: 2026-08-02
implementedAt: 2026-08-02
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
  - DNA-48
  - DNA-49
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

DNA-53 requires that all project hashes use the shared `@warpgogol/fingerprint` package and be deterministic. But `fingerprintTree` with `mode: "byte"` hashes raw file bytes — any non-determinism in build output propagates directly to the `distTreeHash`.

DNA-48 (release discipline) depends on `distTreeHash` for build-identity verification at every promotion step (dev → alt → main). When the hash is non-deterministic, `leitstand.propagate` fails with a mismatch even though the content is semantically identical. This forces manual wrangler deploys and breaks the canonical release flow.

DNA-49 (fleet propagation) explicitly requires `distTreeHash` verification between dev and release manifest. The non-determinism makes this verification unreliable.

## Decision

The `@warpgogol/fingerprint` package gains a `mode: "stable"` option for `fingerprintTree` that normalizes known non-deterministic file types before hashing. A new `dist.determinism.validate` command reports which files in a `dist/` directory contribute to hash instability. `release.prepare` and `leitstand.dev-deploy` switch from `mode: "byte"` to `mode: "stable"` for `distTreeHash` computation.

## Architectural fit

- **DNA-53** (semantic fingerprint governance): Extends `@warpgogol/fingerprint` with a new normalization mode, keeping all hashing within the shared package.
- **DNA-58** (generated-file content determinism): Related — stable mode does not enforce byte-identical output (that is DNA-58's domain for committed generated files). Instead, stable mode makes the dist tree hash deterministic despite non-deterministic build artifacts, enabling reliable drift detection for dist content.
- **DNA-48** (release discipline): Stable `distTreeHash` enables reliable build-identity verification across the release state machine.
- **DNA-49** (fleet propagation): `leitstand.propagate` and `leitstand.promote` can trust `distTreeHash` comparisons without manual workarounds.
- **Site OS operator model**: `dist.determinism.validate` is a workspace-scope command registered in `packages/os/site-kernel-handoff/src/release/release.module.ts` alongside `release.prepare` and `release.publish`. Callable standalone or integrated into `build.check`.

## Design

### CLI surface

```sh
# Validate dist determinism for a release
pnpm exec werkstatt run dist.determinism.validate --release warpgogol-com-r000008

# Validate dist determinism for a workpiece
pnpm exec werkstatt run dist.determinism.validate --mission warpgogol-com-m000026
```

Flags: `--release` (string) or `--mission` (string). Exactly one required. Scope: workspace.

### TypeScript contracts

```ts
// Extended option in @warpgogol/fingerprint (existing mode: "byte" | "semantic" retained)
interface FingerprintOptions {
  mode: "byte" | "semantic" | "stable";
  root?: string;
  ignore?: string[];
}

// Stable mode normalizers (applied per file type before hashing):
// - PDF (.pdf): strip /CreationDate, /ModDate, /ID fields from PDF metadata via pdf-lib
// - Source maps (.js.map, .mjs.map): normalize `sources` paths to relative (relative to dist root), strip `sourceRoot`
// - JSON (.json): sort keys, remove `createdAt`, `buildTimestamp`, `generatedAt` fields
// - HTML (.html): strip generated comment headers (already handled by buildGeneratedHeader)
// - All other file types: raw byte hash (same as mode: "byte")

// Dist determinism check result (per non-deterministic file)
interface DeterminismCheck {
  file: string;
  reason: string;
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

### Stable vs semantic mode distinction

`mode: "semantic"` and `mode: "stable"` serve different purposes:

- **`semantic`** — replaces the entire file hash with an AST-based normalized hash via the normalizer registry (`normalizers/index.ts`). The hash is based on parsed structure (TypeScript AST, CSS AST, etc.), not raw bytes. This loses byte-level change detection for parseable files: two files with different whitespace but the same AST produce the same hash.

- **`stable`** — byte-hashes all files (like `mode: "byte"`), but applies targeted normalization only to known non-deterministic file types (PDF, source maps, JSON with timestamps). For all other files, raw byte hashing is used. This preserves change detection for file content while normalizing only volatile metadata.

The distinction matters because `distTreeHash` must detect content changes in binary files (PNGs, fonts) and in text files that don't have non-deterministic metadata. `semantic` mode would normalize away whitespace and formatting changes in source files; `stable` mode preserves them.

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/fingerprint/src/fingerprint.ts` | Extended — add `mode: "stable"` with per-type normalizers |
| `packages/fingerprint/src/normalizers/pdf.ts` | New — PDF metadata stripping normalizer |
| `packages/fingerprint/src/normalizers/sourcemap.ts` | New — source map path normalization |
| `packages/fingerprint/package.json` | Changed — add `pdf-lib` dependency for PDF metadata manipulation |
| `packages/os/site-kernel-handoff/src/release/release.module.ts` | Changed — register `dist.determinism.validate` command |
| `packages/os/site-kernel-handoff/src/release/release-commands.ts` | Changed — add `runDistDeterminismValidate` handler; use `mode: "stable"` for `fingerprintTree` call in `release.prepare` |
| `packages/os/site-kernel-handoff/src/leitstand/leitstand-commands.ts` | Changed — use `mode: "stable"` for `fingerprintTree` call in `leitstand.dev-deploy` |
| `releases/{release}/dist/` | Read — hashed by `dist.determinism.validate --release` |
| `missions/{mission}/workpiece/dist/` | Read — hashed by `dist.determinism.validate --mission` (preferred if exists) |
| `missions/{mission}/distribution/dist/` | Read — hashed by `dist.determinism.validate --mission` (fallback if workpiece dist absent) |

### Output format

```json
{
  "command": "dist.determinism.validate",
  "distPath": "/path/to/dist",
  "totalFiles": 2075,
  "nonDeterministicFiles": [
    {
      "file": "_print/de/index.pdf",
      "reason": "PDF /CreationDate differs between builds"
    },
    {
      "file": "chunks/server_BHURFrqS.mjs.map",
      "reason": "Source map contains absolute path in sources[]"
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
- Exits 1 with an error message if the dist directory is empty or missing.
- If a normalizer fails (e.g., corrupt PDF), the file falls back to byte hashing with a warning.
- `fingerprintTree` with `mode: "stable"` never throws for normalization failures — it falls back to byte hashing per file and records a warning.

## Rollout

- `fingerprintTree` gains `mode: "stable"` as an opt-in option. `mode: "byte"` remains the default — it is the correct mode for raw binary hashing where no normalization is desired (e.g., artifact store integrity checks). `mode: "semantic"` remains for source content hashing. `mode: "stable"` is for dist tree hashing where non-deterministic build artifacts are expected.
- `release.prepare` and `leitstand.dev-deploy` switch to `mode: "stable"` immediately. The stable hash is computed from the same file set with targeted normalization — content changes are still detected, only non-deterministic metadata is normalized.
- `dist.determinism.validate` is introduced as a standalone command for diagnosing hash mismatches.
- After a grace period, `dist.determinism.validate` is integrated into `build.check` as a warn-level validator.
- Existing releases with byte-mode hashes are not re-hashed — the transition happens on the next `release.prepare`.

### Transition sequence for cross-mode hash mismatch

When a new stable-mode release is promoted against an existing byte-mode dev deployment, `leitstand.propagate` will fail because the dev `build-identity.json` has a byte-mode `distTreeHash` while the release manifest has a stable-mode `distTreeHash`. The transition happens within a single release cycle:

1. Prepare the new release with `mode: "stable"` → release manifest has stable `distTreeHash`.
2. Re-deploy the same commit to dev via `leitstand.dev-deploy` (which now uses `mode: "stable"`) → dev `build-identity.json` has the same stable `distTreeHash`.
3. `leitstand.propagate` verifies dev `build-identity.json` against the release manifest — both stable, match.
4. Promote to alt, then main.

Old releases retain their byte-mode hash in `release.yaml` and are not re-verified. The mismatch only occurs when comparing a new stable-mode release against an old byte-mode dev deployment — re-deploying dev with the same release resolves it.

## Alternatives considered

- **Exclude non-deterministic files from the hash entirely**: Rejected — PDFs and source maps are part of the deployed artifact and should contribute to the identity. Excluding them weakens integrity verification.
- **Make the build itself deterministic (reproducible builds)**: Rejected as out of scope — Astro, Playwright PDF generation, and bundler chunk naming are third-party tools with their own non-determinism. Normalizing at the hash level is more practical.
- **Use semantic fingerprint mode for all files**: Rejected — `mode: "semantic"` replaces the entire hash with an AST-based normalized hash via the normalizer registry, losing byte-level change detection for parseable files. `mode: "stable"` preserves byte hashing for all files except known non-deterministic types, applying targeted normalization only to volatile metadata (PDF timestamps, source map paths, JSON timestamp fields). See "Stable vs semantic mode distinction" above.

## Risks

- **Normalizer correctness**: A buggy PDF normalizer could strip meaningful content, making two different PDFs hash the same. Mitigation: normalizers only strip known non-deterministic metadata fields (CreationDate, ModDate, ID), not content.
- **Performance**: Normalization requires parsing each file (PDF header scan, JSON parse, source map parse). For large dist directories (2000+ files), this adds ~1-2s. Acceptable for release.prepare which runs once per release.
- **False negatives**: Some non-deterministic artifacts may not be covered by the initial normalizers. `dist.determinism.validate` makes them visible so they can be added incrementally.
- **Hash migration**: Switching from byte to stable mode changes all existing `distTreeHash` values. `leitstand.propagate` comparisons between old (byte) and new (stable) releases will mismatch. Mitigation: the transition happens per-release within a single release cycle — re-deploy dev with the same stable-mode release before propagating. See "Transition sequence" above.
- **pdf-lib dependency weight**: `pdf-lib` is a full PDF library (~2MB). For stripping `/CreationDate`, `/ModDate`, `/ID` from PDF metadata, it is proportionate because PDF metadata is embedded in a complex binary structure that is error-prone to parse with regex. The dependency must be added to `packages/fingerprint/package.json`. If a lighter approach is found during implementation (e.g., targeted regex on PDF trailer dictionaries), it may be used instead — the RFC mandates the result (stripped metadata), not the specific library.

## Acceptance criteria

- [x] `fingerprintTree` supports `mode: "stable"` with normalizers for PDF, source map, and JSON file types (evidence: `packages/fingerprint/src/fingerprint.ts:36-71`, `packages/fingerprint/src/normalizers/stable.ts`, `packages/fingerprint/src/normalizers/pdf.ts`, `packages/fingerprint/src/normalizers/sourcemap.ts`, `packages/fingerprint/src/normalizers/json-stable.ts`)
- [x] `FingerprintOptions.mode` type is `"byte" | "semantic" | "stable"` (existing modes retained) (evidence: `packages/fingerprint/src/types.ts:14-18`)
- [x] `dist.determinism.validate` command registered in `release.module.ts` with `--release` and `--mission` flags (evidence: `packages/os/site-kernel-handoff/src/release/release.module.ts:127-140`)
- [x] `dist.determinism.validate --mission` reads `workpiece/dist/` if present, falls back to `distribution/dist/` (evidence: `packages/os/site-kernel-handoff/src/release/release-commands.ts:1240-1260`)
- [x] `dist.determinism.validate` reports non-deterministic files with reasons (evidence: `packages/os/site-kernel-handoff/src/release/release-commands.ts:1281-1296`)
- [x] `dist.determinism.validate` exits 1 with an error message on empty or missing dist directory (evidence: `packages/os/site-kernel-handoff/src/release/release-commands.ts:1248-1276`)
- [x] `release.prepare` uses `mode: "stable"` for `fingerprintTree` call (evidence: `packages/os/site-kernel-handoff/src/release/release-commands.ts:412-413`)
- [x] `leitstand.dev-deploy` uses `mode: "stable"` for `fingerprintTree` call (evidence: `packages/os/site-kernel-handoff/src/leitstand/leitstand-commands.ts:674-675`)
- [x] Two builds from the same commit produce identical `distTreeHash` in stable mode (evidence: `packages/fingerprint/src/tests/stable-normalizers.test.ts:155-180` — "fingerprintTree stable: two builds with different timestamps produce identical distTreeHash")
- [x] Unit tests cover each normalizer (PDF, source map, JSON) with pass/fail scenarios (evidence: `packages/fingerprint/src/tests/stable-normalizers.test.ts:39-107`, `packages/os/site-kernel-handoff/src/tests/dist-determinism-validate.test.ts`)
- [x] `pdf-lib` (or equivalent) added to `packages/fingerprint/package.json` dependencies (evidence: `packages/fingerprint/package.json:28-31`)
- [x] `rfc.validate` passes on this file before merging (evidence: `forge rfc.validate --id RFC-0656` exit code 0)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id <this-rfc-id> --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
- Prefer existing npm packages for PDF metadata manipulation (e.g. `pdf-lib`) over custom parsers (DNA-53, project preference).
