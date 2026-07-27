# @gogol/fingerprint

Semantic fingerprint package and hash governance for the WGogol platform (RFC-0364).

## Purpose

Provides deterministic byte, stable JSON, and semantic file/tree fingerprints with parser-backed normalizers. All project hashes for platform, content, release artifacts, snapshots, and generated manifests use this package.

## Two entry points

| Entry point | Exports | Parser deps? |
| --- | --- | --- |
| `@gogol/fingerprint` | `byteHash`, `byteHashFile`, `stableStringify`, `stableJsonHash` | No |
| `@gogol/fingerprint/semantic` | `fingerprintFile`, `fingerprintTree` | Yes |

The split keeps lightweight consumers (integrity, check-core, check-runner-node) from transitively loading parser packages.

## Primitives

```typescript
import { byteHash, byteHashFile, stableStringify, stableJsonHash } from "@gogol/fingerprint";

byteHash("hello");              // "sha256:2cf24dba..."
byteHash(Buffer.from([0x00]));  // "sha256:6e340b9c..."
await byteHashFile("/abs/path/to/file"); // "sha256:..."

stableStringify({ b: 1, a: 2 }); // '{"a":2,"b":1}'
stableJsonHash({ b: 1, a: 2 });  // "sha256:..."
```

All hashes are `sha256:`-prefixed hex strings.

## Semantic fingerprints

```typescript
import { fingerprintFile, fingerprintTree } from "@gogol/fingerprint/semantic";

// Single file — semantic mode uses parser-backed normalizer
const fileResult = await fingerprintFile("src/pages/index.astro", { mode: "semantic" });
// { path, mode, normalizer, hash }

// Directory tree — walks all files, normalizes each, combines hashes
const treeResult = await fingerprintTree("src/", {
  mode: "semantic",
  ignore: ["node_modules", "dist"],
});
// { algorithm, mode, value, files, warnings? }
```

### Supported normalizers

| Format | Normalizer | Parser |
| --- | --- | --- |
| `.ts` `.tsx` `.js` `.jsx` `.mjs` `.mts` `.cjs` | `typescript` | `@typescript-eslint/typescript-estree` |
| `.astro` | `astro` | `@astrojs/compiler` |
| `.css` | `css` | `postcss` |
| `.json` | `json` | `JSON.parse` |
| `.jsonc` | `jsonc` | `jsonc-parser` |
| `.yaml` `.yml` | `yaml` | `yaml` |
| `.md` `.mdx` | `markdown` | `unified` + `remark-parse` |
| Other text | `text` | Line-ending normalization |
| Binary | `binary` | Raw `byteHash` |

### Fallback behavior

If a semantic normalizer throws (e.g. parse error), `fingerprintTree` falls back to a byte hash for that file and emits a warning. The warning is available in `FingerprintResult.warnings[]`.

## Types

```typescript
interface FingerprintOptions {
  mode: "byte" | "semantic";
  root?: string;
  ignore?: string[];
}

interface FingerprintFileResult {
  path: string;
  mode: "byte" | "semantic";
  normalizer: string;
  hash: string;
}

interface FingerprintResult {
  algorithm: "sha256";
  mode: "byte" | "semantic";
  value: string;
  files: FingerprintFileResult[];
  warnings?: string[];
}
```

## Constraints

- No ad hoc hashing helpers outside this package (enforced by `fingerprint.usage.lint`).
- Internal modules are not part of the public API — only `@gogol/fingerprint` and `@gogol/fingerprint/semantic` are stable.
- The Astro normalizer is async (`@astrojs/compiler` `parse()` returns a Promise).

## Validation

```sh
pnpm --filter @gogol/fingerprint build:check
pnpm --filter @gogol/fingerprint test
```
