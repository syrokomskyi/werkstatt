# @warpgogol/site-kernel-integrity

File hash tracking, entity registry, build provenance recording, and Ed25519 signing for the Warpgogol Site OS.

## Purpose

Tracks every source file in an app's `.integrity/` manifest so renames, moves, and unauthorised edits are detectable. Also signs build output artifacts with an Ed25519 keypair, enabling release verification in CI.

## Commands

| Command | Function | What it does |
| --- | --- | --- |
| `integrity.init` | `runIntegrityInit` | Initialise the `.integrity/` manifest for the current app |
| `integrity.update` | `runIntegrityUpdate` | Re-hash changed files and record moves/deletes |
| `integrity.verify` | `runIntegrityVerify` | Verify current files against the stored manifest |
| `integrity.build-record` | `runIntegrityBuildRecord` | Record a build artifact into `.integrity/outputs.json` |
| `integrity.sign` | `runIntegritySign` | Sign the latest build artifacts with the Ed25519 private key |
| `integrity.verify-release` | `runIntegrityVerifyRelease` | Verify signed manifest against local dist artifacts |
| `integrity.keygen` | `runIntegrityGenerateSigningKeypair` | Generate a new Ed25519 keypair (prints private key once) |
| `integrity.backfill-revisions` | `runIntegrityBackfillRevisions` | Backfill git revision history into an existing manifest |

Commands are registered via `STANDARD_INTEGRITY_PIPELINE` — add it to `kernel.config.ts`:

```typescript
import { STANDARD_INTEGRITY_PIPELINE } from "@warpgogol/site-kernel-integrity";
```

## Key API

```typescript
import {
  runInit, runUpdate, runVerify, runRecordBuild,
  generateSigningKeyPairPem,
  signLatestBuildArtifacts,
  verifyManifestSignature,
} from "@warpgogol/site-kernel-integrity";
```

## Environment variables for signing

| Variable                    | Purpose                                     |
| --------------------------- | ------------------------------------------- |
| `INTEGRITY_PRIVATE_KEY_PEM` | Ed25519 private key (GitHub Actions secret) |
| `INTEGRITY_PUBLIC_KEY_PEM`  | Ed25519 public key (can be committed)       |

## Constraints

- Framework-free and Node.js-only. No Astro imports.
- All file I/O goes through `src/fs.ts`; all JSON I/O through `src/json.ts` (stable key ordering for deterministic hashes).
- Path constants are owned by `src/paths.ts` — do not scatter them.

## Validation

```sh
pnpm --filter @warpgogol/site-kernel-integrity build:check
```
