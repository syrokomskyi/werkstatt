# Fingerprint Package Guide

This file defines the package-specific instruction layer for `packages/fingerprint`.

## Package role

- `@warpgogol/fingerprint` is the RFC-0364 semantic fingerprint package and hash governance authority.
- All project hashes for platform, content, release artifacts, snapshots, and generated manifests use this package.
- No ad hoc direct hashing helpers are allowed outside the package (enforced by `fingerprint.usage.lint`).

## Two entry points

The package has a split public API to keep lightweight consumers from transitively loading parser dependencies:

| Entry point | Exports | Parser deps? | Use when |
| --- | --- | --- | --- |
| `@warpgogol/fingerprint` | `byteHash`, `byteHashFile`, `stableStringify`, `stableJsonHash`, types | No | You need byte-level hashing only |
| `@warpgogol/fingerprint/semantic` | `fingerprintFile`, `fingerprintTree`, types | Yes | You need parser-backed semantic fingerprints |

**Always import primitives from the root entry point** (`@warpgogol/fingerprint`), not from internal modules.

## Internal structure

- `src/primitives.ts` — `byteHash`, `byteHashFile`, `stableStringify`, `stableJsonHash`. No parser imports.
- `src/fingerprint.ts` — `fingerprintFile`, `fingerprintTree`. Imports `byteHash` from `primitives.ts`.
- `src/semantic.ts` — thin re-export entry point for the semantic API.
- `src/index.ts` — thin re-export entry point for the primitives API.
- `src/types.ts` — `FingerprintOptions`, `FingerprintFileResult`, `FingerprintResult`.
- `src/normalizers/index.ts` — dispatcher that selects the correct normalizer by file extension.
- `src/normalizers/*.ts` — per-format normalizers (TypeScript, Astro, CSS, JSON, JSONC, YAML, Markdown, text, binary).

## Normalizer behavior

Each normalizer produces a `sha256:`-prefixed hex hash:

- **TypeScript** — `@typescript-eslint/typescript-estree` AST parse → JSON stringify → `byteHash`.
- **Astro** — `@astrojs/compiler` AST parse → recursive `normalizeNode` → JSON stringify → `byteHash`. Async.
- **CSS** — `postcss` parse → strip comments → normalize whitespace → `byteHash`.
- **JSON** — `JSON.parse` → `stableJsonHash`.
- **JSONC** — `jsonc-parser` parse → `stableJsonHash`.
- **YAML** — `yaml` parse → re-serialize with sorted map entries → `byteHash`.
- **Markdown** — strip HTML comments outside code fences → `unified`/`remark-parse` AST (no position data) → `byteHash`.
- **text** — normalize line endings → `byteHash`.
- **binary** — `byteHash` of raw bytes.

## fingerprintTree error handling

`fingerprintTree` catches per-file normalization errors and falls back to a byte hash. When this happens:

- A warning is emitted via `console.warn`.
- The warning is collected in `FingerprintResult.warnings[]`.
- The fallback entry is recorded with `mode: "byte"` and `normalizer: "binary"`.

## Core boundaries

- Do not add ad hoc hashing helpers outside this package.
- Do not import or re-export `byteHash` in `src/normalizers/index.ts` — the dispatcher does not use it; consumers import from the root entry point.
- Internal modules (`primitives.ts`, `fingerprint.ts`, `normalizers/*`) are not part of the public API — only `src/index.ts` and `src/semantic.ts` exports are stable.

## Validation

```sh
pnpm --filter @warpgogol/fingerprint build:check
pnpm --filter @warpgogol/fingerprint test
```
