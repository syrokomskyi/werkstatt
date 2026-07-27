---
reviewId: REVIEW-CODE-2026-07-27-01
date: 2026-07-27
reviewer:
  skill: fo-review
  model: unknown
verdict: needs-revision
diffRange: 2e82d89...HEAD
filesReviewed:
  - packages/os/site-kernel-handoff/src/deploy/types.ts
  - packages/os/site-kernel-handoff/src/deploy/deploy-utils.ts
  - packages/os/site-kernel-handoff/src/deploy/artifact-build.ts
  - packages/os/site-kernel-handoff/src/deploy/artifact-verify.ts
  - packages/os/site-kernel-handoff/src/deploy/atomic-swap.ts
  - packages/os/site-kernel-handoff/src/deploy/atomic-rollback.ts
  - packages/os/site-kernel-handoff/src/deploy/artifact-gc.ts
  - packages/os/site-kernel-handoff/src/deploy/deploy-status.ts
  - packages/os/site-kernel-handoff/src/deploy/deploy.module.ts
  - packages/os/site-kernel-handoff/src/deploy/index.ts
  - packages/os/site-kernel-handoff/src/deploy/tests/deploy.test.ts
  - packages/os/site-kernel-handoff/src/index.ts
  - packages/os/site-kernel-handoff/package.json
  - packages/os/site-kernel-integrity/src/signing.ts
  - packages/os/site-kernel-integrity/src/index.ts
  - tools/kernel.config.ts
  - packages/os/site-kernel-handoff/AGENTS.md
  - packages/os/site-kernel-integrity/AGENTS.md
  - docs/rfcs/rfc-0566-immutable-platform-deploy-with-atomic-rollback-content-addressed-artifacts-and-symlink-swap-deployment-across-workshops.md
---

# Code Review: 2e82d89...HEAD (RFC-0566 Deploy Module)

### Verdict: Needs revision

One functional bug (`buildHost` always `"unknown"` due to un-awaited `requireEnv`) and one DNA-51 potential violation (deploy commands mutate deployment state without shared Werkstatt lock primitives). The rest of the implementation is solid — clean module structure, proper Compass headers, correct use of `@warpgogol/fingerprint` for hashing, and comprehensive tests.

### Mechanical floor

Pass — `pnpm --filter @warpgogol/site-kernel-handoff build:check` and `pnpm --filter @warpgogol/site-kernel-integrity build:check` both pass. All 274 tests pass.

### Axis A — Structural correctness

- **Fail: Un-awaited `requireEnv` in `artifact-build.ts:120`.** `requireEnv` is `async function requireEnv(name: string, cwd?: string): Promise<string>`. The call `requireEnv("WORKSHOP_ID", workspaceRoot).catch(...)` returns a `Promise<string>`, not a `string`. Then `typeof buildHost === "string"` is always `false`, so `manifest.buildHost` is always `"unknown"`. Fix: `const buildHost = await requireEnv("WORKSHOP_ID", workspaceRoot).catch(() => process.env.HOSTNAME ?? "unknown");`
- **Pass: No `any` types or implicit casts.** The test file uses `as unknown as KernelRuntimeContext` and `as KernelCommandInput` for mock objects, which is acceptable in test code.
- **Pass: Error handling.** All command handlers throw descriptive errors with `[deploy.*]` prefixes. The `artifact-build.ts` signing path uses try/catch with silent fallback (unsigned manifest), which matches the RFC design.

### Axis B — DNA alignment

- **Potential fail: DNA-51 (Werkstatt consistency primitives).** DNA-51 states "Werkstatt commands that mutate registry, mission, release, deployment, artifact, or Bordbuch state use shared lock, idempotency, and atomic staging primitives." The deploy commands mutate deployment state (symlinks) but do not use `acquireLock` or `startOperation`. The `atomicSymlinkSwap` in `deploy-utils.ts` implements its own atomicity via `symlinkSync` + `rename`, which is correct for the symlink-swap mechanism, but concurrent `deploy.atomic.swap` calls could race. Consider whether the shared lock is needed for production use or whether the symlink swap itself is sufficiently atomic.
- **Pass: DNA-42 (Compass markup).** All 11 new source files carry `MODULE_CONTRACT` and `CHANGE_SUMMARY` headers.
- **Pass: DNA-53 (fingerprint governance).** All hashing uses `byteHash` from `@warpgogol/fingerprint`. No `crypto.createHash` calls.
- **Pass: DNA-49 (Leitstand).** The deploy module coexists with the Leitstand as specified in the RFC — `deploy.*` manages local symlink swaps, `leitstand.*` continues to manage Cloudflare Workers deployments.

### Axis C — Ecosystem fit

- **Pass: Package boundaries.** `site-kernel-handoff` imports from `site-kernel-integrity` and `fingerprint` — correct direction. No `apps/*` imports.
- **Pass: Command registration.** All 6 commands registered in `deploy.module.ts` with correct flags, scopes, and metadata. Module wired into `tools/kernel.config.ts`.
- **Pass: AGENTS.md updates.** Both `site-kernel-handoff/AGENTS.md` and `site-kernel-integrity/AGENTS.md` updated with new section and exports.
- **Pass: Package.json exports.** `deploy-module` export entry added to `site-kernel-handoff/package.json`.

### Axis D — Forward-only compliance

- **Pass: No compatibility shims.** The deploy module is entirely new — no legacy paths maintained.
- **Pass: No dual-paths.** The symlink-swap mechanism is the only local deployment path. The Leitstand is a separate remote deployment path, not a legacy one.

### Axis E — Agent-facing clarity

- **Fail: `buildHost` always `"unknown"`.** The manifest field `buildHost` is supposed to record the workshop that built the artifact, but due to the un-awaited `requireEnv` bug, it is always `"unknown"`. This is an ungrounded assertion — the manifest claims to record the build host but never does.
- **Pass: Compass scaffolding.** All files have MODULE_CONTRACT headers with purpose, keywords, responsibilities, and non-goals.
- **Pass: Log-driven development.** Command handlers produce structured `summary` strings with `[deploy.*]` prefixes.

### Axis F — Pragmatism

- **Pass: Minimal command surface.** 6 commands, each with a distinct responsibility. No command that could be a flag on another.
- **Pass: Existing patterns.** The module follows the existing `leitstand.module.ts` and `artifact-store.module.ts` patterns.
- **Pass: Scope discipline.** The diff touches only deploy-related files, kernel config, and docs. No scope creep.

### Axis G — Blind spots

- **Pass: Performance.** `deploy.artifact.build` runs `turbo run build` (~60-120s) and copies dist trees. Cost is documented in the RFC.
- **Pass: Edge cases.** First deploy (no `current` symlink) is handled. Empty artifact directory is handled. GC dry-run is supported.
- **Note: Concurrent execution.** `atomicSymlinkSwap` uses `symlinkSync` to a temp name + `rename`, which is atomic on POSIX. However, two concurrent `deploy.atomic.swap` calls could create conflicting temp symlinks. The temp name includes `process.pid` and `Date.now()`, which makes collisions unlikely but not impossible.

### Spec compliance

| Requirement from RFC-0566 | Status | Evidence |
| --- | --- | --- |
| Types defined | Done | `types.ts` |
| `deploy.artifact.build` | Done | `artifact-build.ts` |
| `deploy.artifact.verify` | Done | `artifact-verify.ts` |
| `deploy.atomic.swap` | Done | `atomic-swap.ts` |
| `deploy.atomic.rollback` | Done | `atomic-rollback.ts` |
| `deploy.artifact.gc` | Done | `artifact-gc.ts` |
| `deploy.status` | Done | `deploy-status.ts` |
| Artifact manifest with Ed25519 signature | Done | `signJsonPayload` in `artifact-build.ts` |
| Atomic symlink swap via `rename(2)` | Done | `atomicSymlinkSwap` in `deploy-utils.ts` |
| First deploy creates symlink, no previous | Done | Test in `deploy.test.ts` |
| Immutability test | Done | Test in `deploy.test.ts` |
| `buildHost` recorded in manifest | Partial | Bug: always `"unknown"` due to un-awaited `requireEnv` |
| Two-phase commit (Phase 4) | Missing (deferred) | Types defined as stubs, logic not implemented — acceptable per RFC |
| `rfc.validate` passes | Done | No RFC-0566-specific errors |

### Questions for the author

1. Should `deploy.atomic.swap` and `deploy.atomic.rollback` use the shared Werkstatt lock (`acquireLock`) to prevent concurrent swap operations, or is the `rename` atomicity sufficient?
2. The `buildHost` bug means all artifacts will have `buildHost: "unknown"` in their manifest — is this acceptable for the pilot, or should it be fixed before stamping?
3. The `manifestPath` and `readManifest` imports in `deploy.test.ts` are unused — should they be removed?
