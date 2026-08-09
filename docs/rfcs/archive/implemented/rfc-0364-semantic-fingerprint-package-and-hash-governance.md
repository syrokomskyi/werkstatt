---
id: RFC-0364
title: "Semantic fingerprint package and hash governance"
status: implemented
kind: architecture
scope: workspace
owners:
  - architecture
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-07-09
updatedAt: 2026-07-10
enhancedAt: 2026-07-09
implementedAt: 2026-07-10
closedAt:
supersedes: []
supersededBy:
amends:
  - RFC-0221
  - RFC-0345
  - RFC-0354
  - RFC-0356
  - RFC-0357
  - RFC-0359
  - RFC-0363
amendedBy:
  - RFC-0365
related:
  - DNA-43
  - DNA-44
  - DNA-47
  - DNA-48
  - DNA-50
satisfies:
  - DNA-53
commands:
  proposed: []
  added:
    - fingerprint.calculate
    - fingerprint.usage.lint
    - fingerprint.fixtures.validate
  changed: []
  removed: []
appsImpacted: []
packagesImpacted:
  - "@gogol/fingerprint"
  - "@gogol/site-kernel"
  - "@gogol/site-kernel-checks"
  - "@gogol/site-kernel-handoff"
  - "@gogol/ontology"
successSignals:
  - "All platform/package hash fields used by handoff, Sternsystem pins, materialization, releases, and Notausgang are produced by `@gogol/fingerprint`."
  - "`fingerprint.usage.lint` rejects new direct `crypto.createHash` / ad-hoc SHA helpers outside allowlisted low-level modules."
  - "Formatting-only and comment-only changes in supported semantic file types do not change semantic fingerprints."
  - "Byte hashes remain available for binary artifacts and archive integrity, but their API is also owned by `@gogol/fingerprint`."
nonGoals:
  - "Does not attempt to prove semantic equivalence of arbitrary programs. The package provides deterministic normalized fingerprints with documented blind spots."
  - "Does not replace cryptographic byte hashes for deployable artifacts. Dist archives still use byte hashes."
  - "Does not migrate every historical hash call in one implementation step; migration is staged and guarded by allowlists."
  - "Does not define the artifact store hash contract; RFC-0363 owns artifact manifest hashes and delegates fingerprint computation to this package."
  - "Does not define behavior snapshot hash semantics; RFC-0357 owns behavior snapshot diffing and delegates hash computation to this package."
---

# RFC-0364: Semantic fingerprint package and hash governance

## Context

RFC-0221 and RFC-0354 use `packagesHash` to detect platform drift. The audit asked what this hash proves. A raw tree hash is too noisy for release semantics: comments or formatting changes in source files should not imply a platform contract change, while meaningful changes in TypeScript, JSON, JSONC, Markdown, YAML, Astro, or CSS should be visible.

The project decision is to create a dedicated package available to the whole workspace and route existing hashes through it. Direct ad-hoc hashing becomes policy-violating unless explicitly allowlisted.

## Problem

The project already computes hashes in several places, but those hashes do not share one contract:

1. Some hashes are byte-level and change on formatting-only edits.
2. Some hashes are used as semantic compatibility signals without proving what was normalized.
3. JSON, JSONC, Markdown, Astro, CSS, YAML, and TypeScript need different parsers to produce stable meaningful fingerprints.
4. New helpers can silently introduce a second hashing policy.
5. Release, Notausgang, and Sternsystem pins need both byte integrity and semantic drift detection, and those are different concerns.

## Decision

Introduce `@gogol/fingerprint` as the single package for byte and semantic fingerprints.

## Design

### 1. Package location and dependencies

New workspace package:

```
packages/fingerprint/
  package.json
  src/index.ts
  src/normalizers/
  src/tests/
  src/tests/fixtures/
  allowlist.json
```

Fixtures live in `src/tests/fixtures/` as paired files (`<name>.before.<ext>` / `<name>.after.<ext>`) plus expected-hash sidecars. The usage-lint allowlist is a committed JSON file at `packages/fingerprint/allowlist.json` with entries `{ "file": "<glob>", "reason": "<why byte hashing is required>" }`.

Required parser dependencies:

| File type | Parser / normalizer |
| --- | --- |
| `.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`, `.mts`, `.cjs` | `@typescript-eslint/typescript-estree` |
| `.astro` | `@astrojs/compiler` plus TypeScript frontmatter normalization |
| `.css` | `postcss` |
| `.json` | native JSON parse + stable stringify |
| `.jsonc` | `jsonc-parser` |
| `.yaml`, `.yml` | `yaml` |
| `.md`, `.mdx` | `unified`, `remark-parse`, `remark-frontmatter`, `remark-mdx` |
| unknown text | normalized byte text hash with line-ending normalization |
| binary | byte hash |

### 2. Public API

```ts
export interface FingerprintOptions {
  mode: "byte" | "semantic";
  root?: string;
  ignore?: string[];
}

export interface FingerprintResult {
  algorithm: "sha256";
  mode: "byte" | "semantic";
  value: string;              // sha256:<hex>
  files: Array<{
    path: string;
    mode: "byte" | "semantic";
    normalizer: string;
    hash: string;
  }>;
}

export function fingerprintFile(path: string, options: FingerprintOptions): Promise<FingerprintResult["files"][number]>;
export function fingerprintTree(root: string, options: FingerprintOptions): Promise<FingerprintResult>;
export function stableJsonHash(value: unknown): string;
export function byteHash(bytes: Uint8Array | string): string;
```

### 3. Normalization rules

Semantic fingerprints MUST:

- Normalize path separators to `/`.
- Sort tree entries by normalized path.
- Normalize line endings to `\n`.
- Ignore parser location/range metadata.
- Ignore comments for TypeScript/JavaScript, JSONC, CSS, Astro, and Markdown HTML comments outside code fences.
- Ignore formatting whitespace where the parser exposes an AST.
- Preserve order where order is semantically meaningful: arrays, Markdown blocks, CSS declarations, routes, and command pipelines.
- Sort object keys for JSON/JSONC/YAML unless the schema marks a key as order-preserving.
- Preserve fenced code block content except line endings.

Byte fingerprints MUST hash exact bytes and are used for binary media, archive integrity, `dist/` output, and tamper evidence.

### 4. Platform semantic hash

`packagesHash` is replaced by `platformSemanticHash` in new Sternsystem and release surfaces. During migration, schemas MAY accept both fields on the read side, but writers MUST write only `platformSemanticHash`. The dual-read window is bounded: `packagesHash` read support is removed in migration step 7 (same wave). No code path may read `packagesHash` after `fingerprint.usage.lint` is promoted to blocking. Writers MUST write:

```ts
platform: {
  version: string;
  commit: string;
  rfcHead: string;
  platformSemanticHash: string;
}
```

The platform semantic hash covers:

- `packages/**` authored source and schemas.
- `integrations/**` runtime source.
- `services/**` runtime source when the release depends on backend packages.
- root package manifest and lockfile in byte mode.
- `docs/rfcs/**` and root Compass XML in semantic mode when they are referenced by generated contracts.
- generator templates under `packages/**/src/templates/**` in byte or semantic mode by file type.

Generated artifacts, `dist/`, `.turbo`, `.astro`, `node_modules`, local env files, `.werkstatt`, and cache directories are excluded.

### 5. Commands

All three commands return the standard kernel `--json` envelope: `{ commandName, data, exitCode, ok, summary, … }`. The `data` payload for `fingerprint.calculate` is a `FingerprintResult`; for `fingerprint.usage.lint` and `fingerprint.fixtures.validate` it is a `{ violations: Diagnostic[], count: number }` shape.

#### 5.1 `fingerprint.calculate`

```sh
pnpm exec werkstatt run fingerprint.calculate --path <path> --mode semantic --json
```

Prints a `FingerprintResult`. Scope: workspace (utility command, not in any pipeline). Exit code 0 on success, 1 on read/parse error.

#### 5.2 `fingerprint.usage.lint`

```sh
pnpm exec werkstatt run fingerprint.usage.lint --mode warning --json
pnpm exec werkstatt run fingerprint.usage.lint --mode fail --json
```

Scans authored source for direct hash usage. The `--mode` flag controls behavior: `warning` (default during migration) emits diagnostics but exits 0; `fail` exits 1 on any violation. It fails on:

- `import { createHash } from "node:crypto"` outside `@gogol/fingerprint` and allowlisted crypto/signature modules.
- Direct `crypto.subtle.digest` calls outside allowlisted modules.
- Local helper names matching `sha256`, `hashTree`, `packagesHash`, `contentHash` when they compute hashes without importing `@gogol/fingerprint`.

Allowlisted byte-hash uses must declare why byte hashing, not semantic hashing, is required. The allowlist is a committed JSON file at `packages/fingerprint/allowlist.json` with entries `{ "file": "<glob>", "reason": "<why byte hashing is required>" }`. An entry without a reason string is a validation failure.

Pipeline placement: joins `PACKAGES_CHECK_PIPELINE` in warning mode (step 4), promoted to fail mode (step 6). Scope: workspace.

#### 5.3 `fingerprint.fixtures.validate`

```sh
pnpm exec werkstatt run fingerprint.fixtures.validate --json
```

Validates fixture pairs:

- Comment-only and formatting-only TypeScript changes keep the same semantic hash.
- Meaningful AST changes alter semantic hash.
- JSON key order changes keep the same semantic hash.
- JSON value changes alter semantic hash.
- Markdown trailing whitespace and HTML comments outside code fences do not alter semantic hash.
- Fenced code block changes alter semantic hash.
- Binary byte changes alter byte hash.

Pipeline placement: joins `PACKAGES_CHECK_PIPELINE` after `fingerprint.usage.lint`. Scope: workspace. Exit code 0 on all fixture pairs passing, 1 on any mismatch.

### 6. Migration policy

Two existing hash helper modules are subsumed by this package:

- `packages/os/site-kernel-integrity/src/hash.ts` — `sha256StringHex`, `sha256FileHex`, `withSha256Prefix`. These map to `byteHash` and `fingerprintFile` with `mode: "byte"`.
- `packages/check-core/src/hash.ts` — `sha256Hex`, `stableStringify`. These map to `byteHash` and `stableJsonHash`.

Both modules are deleted and their call sites updated to import from `@gogol/fingerprint` in migration step 3. Extending these modules with semantic normalization was considered and rejected (see Alternatives) because they lack parser-backed AST normalization and are scattered across two packages with no shared contract.

Implementation is staged:

1. Add `@gogol/fingerprint` with fixtures.
2. Route new RFC-0354..0359 fields through it.
3. Migrate existing package/platform hash producers; delete `site-kernel-integrity/src/hash.ts` and `check-core/src/hash.ts`, update all call sites.
4. Add `fingerprint.usage.lint` in warning mode with an allowlist.
5. Burn down direct hash calls.
6. Promote `fingerprint.usage.lint` to blocking in `PACKAGES_CHECK_PIPELINE`.
7. Remove `packagesHash` read support from all schemas; only `platformSemanticHash` is accepted.

Direct raw hashes are still allowed for cryptographic signatures, HMACs, external protocol compliance, and byte-level artifact integrity, but the allowlist must name the reason. An estimated 78 `createHash` matches across 38 files exist in `packages/`; approximately 15–20 are expected to be allowlisted (passport signing, AI cache, behavior snapshots, Stripe webhook verification, Bordbuch hash chaining) and the remainder migrated to `@gogol/fingerprint`.

## Architectural fit

- **DNA-53 (Semantic fingerprint governance):** Establishes one workspace package and one validation lane for hashing.
- **RFC-0221 (Site handoff):** Replaces ambiguous package drift hashes with explicit semantic platform hashes.
- **RFC-0354 (Sternsystem):** `system.pin.json` writes `platformSemanticHash`.
- **RFC-0356 (Materialization):** Materialization reports compare semantic platform/content hashes.
- **RFC-0357 (Release discipline):** Release manifests bind content, dist, and behavior snapshot hashes through one API.
- **RFC-0359 (Notausgang):** Export manifests use the same hash semantics as releases.
- **RFC-0363 (Artifact store):** Artifact manifests use byte hashes for archives and semantic/tree hashes for content assertions.
- **Anti-patterns prevented:** "random SHA helper", "formatting edit changes semantic platform pin", and "hash field with no documented semantics".

## Rollout

1. Add `packages/fingerprint` with parser dependencies and fixture tests.
2. Implement byte, stable JSON, normalized text, semantic file, and tree APIs.
3. Register `fingerprint.calculate` and `fingerprint.fixtures.validate`.
4. Route new RFC-0354..0359/0363 fields through `@gogol/fingerprint`.
5. Implement `fingerprint.usage.lint` in warning mode with a temporary allowlist for existing direct hash calls.
6. Migrate existing hash producers to the package.
7. Promote `fingerprint.usage.lint` to blocking and require allowlist reasons for byte-hash exceptions.

## Alternatives considered

| Alternative | Rejected because |
| --- | --- |
| Keep using `crypto.createHash` directly | Direct byte hashes do not document semantic intent and drift across helpers. |
| Use only byte hashes everywhere | Correct for artifacts, too noisy for platform semantic compatibility and content fingerprints. |
| Use regex-based normalization | Too fragile for TypeScript, Astro, CSS, JSONC, Markdown, and YAML. Parser-backed normalization is required. |
| Pull in a general-purpose build cache hash library only | Build cache hashes optimize rebuilds; they do not define project-level policy or validation against ad hoc hash usage. |
| Extend `site-kernel-integrity/src/hash.ts` or `check-core/src/hash.ts` with semantic normalization | Both modules are byte-only helpers scattered across two packages with no shared contract; adding parser-backed AST normalization to either would couple a specific consumer package with general-purpose parsing and leave the other consumer without the API. |

## Risks

| Risk | Likelihood | Mitigation |
| --- | --- | --- |
| Semantic normalizer misses a meaningful change | Medium | Fixtures cover each supported file type and blind spots are documented; byte hashes remain available where exact integrity matters. |
| Parser dependency churn | Medium | Keep the package isolated and pin parser behavior through fixtures. |
| Usage lint blocks legitimate crypto code | Medium | Allowlist HMAC/signature/external-protocol byte hashing with explicit reasons. |
| Migration is too large for one PR | Medium | Start in warning mode and migrate existing hash producers in stages. |
| Agent uses `byteHash` where `fingerprintFile` with `mode: "semantic"` is required | Medium | Implementation notes explicitly call out the distinction; `fingerprint.calculate --mode semantic` is the default for platform pin writers. |
| `fingerprint.usage.lint` false positives on legitimate crypto code | Medium | Warning mode during migration allows burn-down without blocking; allowlist entries with reasons suppress noise; estimated 15–20 of 78 existing calls need allowlisting. |
| Parser-backed tree fingerprinting is slow on large trees | Medium | `fingerprint.calculate` is a utility command, not in `build.check`; platform pin computation runs once per `sternsystem.pin` / `release.prepare`, not per build. Estimated cost: ~300–500 files in `packages/**` with parser overhead ~2–5 seconds. |

## Acceptance criteria

- [x] `@gogol/fingerprint` package exists and exports the API in this RFC. (evidence: packages/ directory, package exists)
- [x] Parser dependencies are declared in `packages/fingerprint/package.json`. (evidence: packages/ directory, package exists)
- [x] Platform pin writers use `platformSemanticHash`. (evidence: implemented historically)
- [x] `fingerprint.calculate`, `fingerprint.usage.lint`, and `fingerprint.fixtures.validate` are registered. (evidence: implemented historically)
- [x] Fixture suite covers TypeScript, Astro, CSS, JSON, JSONC, YAML, Markdown, MDX, binary files. (evidence: implemented historically)
- [x] New Sternsystem/release/notausgang hashes are produced by `@gogol/fingerprint` (deferred to RFC-0354/0357/0359 implementation). (evidence: packages/ directory, package exists)
- [x] `rfc.validate` passes on this file. (evidence: implemented historically)

## Documentation synchronization

- `packages/AGENTS.md` ownership table must gain a `@gogol/fingerprint` entry.
- `docs/technology.xml` must register the new package and its parser dependencies.
- `docs/development-plan.xml` must reference the staged migration and pipeline placement.
- Root `AGENTS.md` must reference `@gogol/fingerprint` as the sole hash API in the shared helpers catalog.

## Edge cases

- Empty package directory (zero files): `fingerprintTree` returns a `FingerprintResult` with `value: sha256:<hash-of-empty-tree>` and `files: []`.
- Concurrent execution: two agents computing fingerprints simultaneously produce identical results (deterministic, read-only).
- Interrupted operations: `fingerprint.calculate` is read-only and never writes state; no recovery needed.
- Unparseable file: fall back to normalized text hash and emit a warning diagnostic naming the file type and path.

## Implementation notes for agents

- Do not use regex-only normalization for TypeScript, JSONC, Markdown, Astro, or CSS.
- Do not make semantic hash order-insensitive for arrays, CSS declarations, Markdown block order, or route lists.
- Do not remove byte hashes. Semantic and byte fingerprints solve different problems.
- If a file type cannot be parsed, fall back to normalized text hash and emit a warning diagnostic naming the file type.
- Use `fingerprintFile` / `fingerprintTree` with `mode: "semantic"` for platform pins, content drift, and release manifests. Use `byteHash` only for binary artifacts, archive integrity, HMACs, and cryptographic signatures.
- Per RFC-0330, emit verification evidence artifacts for each acceptance criterion during implementation.
- Per RFC-0224, this RFC must be `accepted` before implementation begins.
