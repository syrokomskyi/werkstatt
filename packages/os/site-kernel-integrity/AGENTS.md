# Site Kernel Integrity Package Guide

This file defines the package-specific instruction layer for `packages/os/site-kernel-integrity`.

## Package role

- `@gogol/site-kernel-integrity` is the framework-free integrity tracking library for the site OS.
- It provides file hash tracking, entity registry management, build artifact recording, Ed25519 signing, and release verification.
- Any app in `apps/*` that needs integrity tracking imports from this package and registers commands via `tools/modules/integrity.module.ts`.

## Public API

The package exports via `src/index.ts`:

- **Run functions:** `runInit`, `runUpdate`, `runVerify`, `runRecordBuild`, `runBackfillRevisions`
- **Signing:** `generateSigningKeyPairPem`, `signLatestBuildArtifacts`, `loadSignedManifest`, `loadPublicKeyPem`, `verifyManifestSignature`, `compareManifestWithLocalArtifacts`
- **Env helpers:** `requireEnv`, `optionalEnv`
- **Path helpers:** `buildLatestDir`, `signedManifestPath`
- **FS helpers:** `ensureDir`, `writeText`
- **Types:** all integrity types from `types.ts`

## Core boundaries

- Keep this package framework-free and Node.js-only.
- Do not import from `@gogol/site-kernel` or any Astro package.
- Internal modules are not part of the public API — only `src/index.ts` exports are stable.
- The `.integrity/` directory layout is defined by `src/paths.ts` — do not scatter path constants across modules.

## Implementation rules

- FS and JSON access go through `src/fs.ts` / `src/json.ts` helpers (key ordering matters for deterministic hashes).
- Add new run functions as `run-{name}.ts` files following existing pattern.
- Do not add CLI logic here — the CLI is owned by `packages/os/site-kernel`.

## Validation

- Run `pnpm --filter @gogol/site-kernel-integrity build:check` after API or type changes.
