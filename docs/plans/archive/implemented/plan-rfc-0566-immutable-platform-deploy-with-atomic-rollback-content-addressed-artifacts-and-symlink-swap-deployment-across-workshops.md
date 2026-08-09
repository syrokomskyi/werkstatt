---
rfcId: RFC-0566
planId: PLAN-RFC-0566-01
status: draft
owner: architecture
createdAt: 2026-07-27
updatedAt:
scope:
  apps: []
  packages:
    - packages/os/site-kernel-handoff
    - packages/os/site-kernel-integrity
  services: []
  docs:
    - packages/os/site-kernel-handoff/AGENTS.md
    - packages/AGENTS.md
---

# Implementation Plan: RFC-0566

## 1. Objectives

- [ ] Objective 1 — Define TypeScript contracts for platform artifacts, deploy status, and atomic swap results — maps to acceptance criterion [types defined in types.ts]
- [ ] Objective 2 — Implement `deploy.artifact.build` command to build immutable platform artifacts — maps to acceptance criterion [deploy.artifact.build command]
- [ ] Objective 3 — Implement `deploy.artifact.verify` command to verify artifact content hashes — maps to acceptance criterion [deploy.artifact.verify command]
- [ ] Objective 4 — Implement `deploy.atomic.swap` command with atomic symlink swap and hash verification — maps to acceptance criterion [deploy.atomic.swap command]
- [ ] Objective 5 — Implement `deploy.atomic.rollback` command with first-deploy edge case handling — maps to acceptance criterion [deploy.atomic.rollback command]
- [ ] Objective 6 — Implement `deploy.artifact.gc` command with retention policy — maps to acceptance criterion [deploy.artifact.gc command]
- [ ] Objective 7 — Implement `deploy.status` command — maps to acceptance criterion [deploy.status command]
- [ ] Objective 8 — Register all deploy commands in a new `deploy` kernel module and wire it into `tools/kernel.config.ts` — maps to acceptance criterion [commands registered]
- [ ] Objective 9 — Write unit tests for atomicity, hash verification, first-deploy, rollback, and immutability — maps to acceptance criteria [unit tests for swap, first-deploy, two-phase, immutability]
- [ ] Objective 10 — Update documentation (AGENTS.md, package ownership) — maps to acceptance criterion [rfc.validate passes]

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/os/site-kernel-handoff/src/deploy/types.ts` — new file: `PlatformArtifact`, `ArtifactManifest`, `ArtifactFile`, `DeployStatus`, `AtomicSwapResult`, `WorkshopDeployStatus`, `TwoPhaseCommitResult` interfaces
- `packages/os/site-kernel-handoff/src/deploy/artifact-build.ts` — new file: `runDeployArtifactBuild` handler (uses `turbo run build` to build all packages, then copies `dist/` trees into artifact directory)
- `packages/os/site-kernel-handoff/src/deploy/artifact-verify.ts` — new file: `runDeployArtifactVerify` handler
- `packages/os/site-kernel-handoff/src/deploy/artifact-gc.ts` — new file: `runDeployArtifactGc` handler
- `packages/os/site-kernel-handoff/src/deploy/atomic-swap.ts` — new file: `runDeployAtomicSwap` handler (manages both `current` and `previous` symlinks — swap updates both: new → current, old current → previous)
- `packages/os/site-kernel-handoff/src/deploy/atomic-rollback.ts` — new file: `runDeployAtomicRollback` handler
- `packages/os/site-kernel-handoff/src/deploy/deploy-status.ts` — new file: `runDeployStatus` handler
- `packages/os/site-kernel-handoff/src/deploy/two-phase.ts` — new file: two-phase commit type stubs (Phase 4 — types only, no logic implemented in pilot)
- `packages/os/site-kernel-handoff/src/deploy/index.ts` — new file: barrel exports + `createDeployModule()`
- `packages/os/site-kernel-handoff/src/deploy/deploy.module.ts` — new file: kernel module registering all 6 commands
- `packages/os/site-kernel-handoff/src/index.ts` — add `export { createDeployModule } from "./deploy/index.ts"`
- `tools/kernel.config.ts` — add `deploy` module loader: `deploy: async () => (await import("@warpgogol/site-kernel-handoff/deploy-module")).createDeployModule()`
- `packages/os/site-kernel-handoff/package.json` — add export entry `"./deploy-module"` pointing to `./src/deploy/deploy.module.ts`
- `packages/os/site-kernel-integrity/src/index.ts` — export `signPayload` from `./signing.ts` (currently internal, needs to be added to public API)
- `packages/os/site-kernel-integrity/src/signing.ts` — ensure `signPayload` is exported (it already exists internally, just needs to be added to `src/index.ts` exports)

### 2.2 Configuration and data

- `.werkstatt/artifacts/platform/<sha-256>/` — new artifact directory (created at runtime by `deploy.artifact.build`)
- `.werkstatt/artifacts/platform/current` — symlink to active artifact (created at runtime by `deploy.atomic.swap`)
- `.werkstatt/artifacts/platform/previous` — symlink to previous artifact for rollback (created at runtime by `deploy.atomic.swap`)
- `packages/os/site-kernel-handoff/src/deploy/types.ts` — TypeScript contracts (the only schema-like artifact)

### 2.3 Documentation and specs

- `packages/os/site-kernel-handoff/AGENTS.md` — add Deploy section documenting the new `deploy.*` command family, artifact paths, and symlink-swap model
- `packages/AGENTS.md` — update `site-kernel-handoff` ownership entry to mention deploy commands
- RFC file `docs/rfcs/rfc-0566-*.md` — read-only reference (not modified by plan)

### 2.4 Validation and pipelines

- `pnpm --filter @warpgogol/site-kernel-handoff build:check` — typecheck
- `pnpm --filter @warpgogol/site-kernel-handoff test` — unit tests
- `pnpm exec werkstatt run rfc.validate --id RFC-0566` — RFC validation
- No pipeline integration needed — `deploy.*` commands are operational, not part of `build.check` or `sites-check`

## 3. Step sequence

### Step 1. Define TypeScript contracts

**Goal:** Create the type definitions that all deploy commands depend on.

**Agent actions:**

- Create `packages/os/site-kernel-handoff/src/deploy/types.ts`
- Define `PlatformArtifact`, `ArtifactManifest`, `ArtifactFile`, `DeployStatus`, `AtomicSwapResult` interfaces per RFC §TypeScript contracts
- Define `WorkshopDeployStatus`, `TwoPhaseCommitResult` interfaces (Phase 4 — included for completeness but not exercised in pilot)
- Add Compass `MODULE_CONTRACT` and `CHANGE_SUMMARY` scaffolding (DNA-42)

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff build:check` passes with the new file

**Completion criterion:** `types.ts` exists with all 7 interfaces exported and `build:check` passes

**Human review:** no

---

### Step 2. Implement `deploy.artifact.build`

**Goal:** Build an immutable platform artifact from the local git clone.

**Agent actions:**

- Create `packages/os/site-kernel-handoff/src/deploy/artifact-build.ts`
- Implement `runDeployArtifactBuild(input, context)`:
  - Run `turbo run build` to build all `packages/*` with Turborepo (caching + dependency ordering)
  - Copy `dist/` trees into `.werkstatt/artifacts/platform/<sha-256>/dist/`
  - Compute SHA-256 content hash of the artifact directory using `@warpgogol/fingerprint` (`fingerprintTree`)
  - Write `manifest.json` with hash, file list, git SHA, build time, build host
  - Sign manifest with Ed25519 using `@warpgogol/site-kernel-integrity` (`signPayload` — newly exported from the package, see Step 1b)
- Add Compass scaffolding

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff build:check` passes
- Manual smoke test: `pnpm exec werkstatt run deploy.artifact.build --json` produces a valid artifact directory

**Completion criterion:** `deploy.artifact.build` creates a `.werkstatt/artifacts/platform/<sha-256>/` directory with `dist/` and signed `manifest.json`

**Human review:** no

---

### Step 1b. Export `signPayload` from `@warpgogol/site-kernel-integrity`

**Goal:** Make the low-level Ed25519 signing function available as a public API so `deploy.artifact.build` can sign arbitrary manifests.

**Agent actions:**

- Read `packages/os/site-kernel-integrity/src/signing.ts` — confirm `signPayload` exists as an internal function
- Add `signPayload` to the exports in `packages/os/site-kernel-integrity/src/index.ts`
- Run `pnpm --filter @warpgogol/site-kernel-integrity build:check` to verify no breakage

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-integrity build:check` passes

**Completion criterion:** `signPayload` is exported from `@warpgogol/site-kernel-integrity` and `build:check` passes

**Human review:** no

---

### Step 3. Implement `deploy.artifact.verify`

**Goal:** Verify an artifact's content hash against its manifest.

**Agent actions:**

- Create `packages/os/site-kernel-handoff/src/deploy/artifact-verify.ts`
- Implement `runDeployArtifactVerify(input, context)`:
  - Read `manifest.json` from `.werkstatt/artifacts/platform/<hash>/`
  - Recompute content hash using `@warpgogol/fingerprint`
  - Compare against manifest hash
  - Verify Ed25519 signature using `@warpgogol/site-kernel-integrity` (`verifyManifestSignature`)
  - Return `{ verified: boolean, hash, expectedHash }` or throw on mismatch
- Add Compass scaffolding

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff build:check` passes
- Smoke test: verify an artifact built in Step 2

**Completion criterion:** `deploy.artifact.verify --hash <sha-256>` returns `verified: true` for a valid artifact and `verified: false` for a corrupted one

**Human review:** no

---

### Step 4. Implement `deploy.atomic.swap`

**Goal:** Perform an atomic symlink swap to deploy a new artifact.

**Agent actions:**

- Create `packages/os/site-kernel-handoff/src/deploy/atomic-swap.ts`
- Implement `runDeployAtomicSwap(input, context)`:
  - Verify artifact hash with `deploy.artifact.verify` logic before swapping (abort on mismatch with `hash-mismatch` error code)
  - Create temp symlink pointing to new artifact
  - Atomic `rename(2)` (via `fs.rename`) to swap `current` symlink
  - Update `previous` symlink: old `current` target → `previous` (also atomic `rename(2)`)
  - Handle first-deploy case (no existing `current` symlink — create `current`, no `previous` to create)
  - Return `AtomicSwapResult` with `swapped`, `previousHash`, `newHash`, `swapTimeMs`
- Add Compass scaffolding

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff build:check` passes
- Unit test: swap creates `current` symlink pointing to new artifact
- Unit test: swap on first deploy creates symlink without error
- Unit test: swap with corrupted artifact fails with `hash-mismatch`

**Completion criterion:** `deploy.atomic.swap --hash <sha-256>` atomically swaps the `current` symlink and returns swap timing

**Human review:** no

---

### Step 5. Implement `deploy.atomic.rollback`

**Goal:** Roll back to the previous artifact by swapping the symlink back.

**Agent actions:**

- Create `packages/os/site-kernel-handoff/src/deploy/atomic-rollback.ts`
- Implement `runDeployAtomicRollback(input, context)`:
  - Read `previous` symlink target to determine previous artifact hash
  - If `previous` symlink does not exist, fail with `no-previous-artifact` error code
  - Verify previous artifact hash
  - Atomic symlink swap back to previous artifact
  - Return `AtomicSwapResult`
- Add Compass scaffolding

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff build:check` passes
- Unit test: rollback after swap restores previous artifact
- Unit test: rollback with no previous artifact fails with `no-previous-artifact`

**Completion criterion:** `deploy.atomic.rollback` swaps back to the previous artifact or fails gracefully if none exists

**Human review:** no

---

### Step 6. Implement `deploy.artifact.gc`

**Goal:** Garbage-collect old artifacts not referenced by symlinks.

**Agent actions:**

- Create `packages/os/site-kernel-handoff/src/deploy/artifact-gc.ts`
- Implement `runDeployArtifactGc(input, context)`:
  - Scan `.werkstatt/artifacts/platform/` for artifact directories
  - Identify artifacts referenced by `current` and `previous` symlinks (never delete these)
  - Retain at least last 5 artifacts by default
  - Delete unreferenced artifacts beyond retention limit (unless `--dry-run`)
  - Return `{ examined, deleted, retained, candidates }`
- Add Compass scaffolding

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff build:check` passes
- Unit test: gc with `--dry-run` reports candidates without deleting
- Unit test: gc never deletes artifacts referenced by symlinks

**Completion criterion:** `deploy.artifact.gc --dry-run` reports candidates; without `--dry-run` deletes unreferenced artifacts beyond retention limit

**Human review:** no

---

### Step 7. Implement `deploy.status`

**Goal:** Report current deployment status.

**Agent actions:**

- Create `packages/os/site-kernel-handoff/src/deploy/deploy-status.ts`
- Implement `runDeployStatus(input, context)`:
  - Read `current` symlink target to get current hash
  - Read `previous` symlink target to get previous hash
  - Read `manifest.json` for current git SHA and deployment time
  - Return `DeployStatus` with `currentHash`, `previousHash`, `currentGitSha`, `deployedAt`
- Add Compass scaffolding

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff build:check` passes
- Smoke test: `deploy.status --json` after a swap shows correct hashes

**Completion criterion:** `deploy.status` reports current and previous artifact hashes, git SHA, and deployment time

**Human review:** no

---

### Step 8. Create deploy module and wire into kernel config

**Goal:** Register all 6 deploy commands as a kernel module.

**Agent actions:**

- Create `packages/os/site-kernel-handoff/src/deploy/deploy.module.ts`:
  - `createDeployModule()` registering: `deploy.artifact.build`, `deploy.artifact.verify`, `deploy.atomic.swap`, `deploy.atomic.rollback`, `deploy.artifact.gc`, `deploy.status`
  - Each command with correct `scope: "workspace"`, `flags`, `writes`, `reads`, `cacheable: false`
- Create `packages/os/site-kernel-handoff/src/deploy/index.ts`:
  - Barrel exports for all handlers and types
  - Export `createDeployModule`
- Add `export { createDeployModule } from "./deploy/index.ts"` to `packages/os/site-kernel-handoff/src/index.ts`
- Add export entry `"./deploy-module"` to `packages/os/site-kernel-handoff/package.json`
- Add module loader to `tools/kernel.config.ts`:
  ```ts
  deploy: async () =>
    (await import("@warpgogol/site-kernel-handoff/deploy-module")).createDeployModule(),
  ```
- Add Compass scaffolding to module files

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff build:check` passes
- `pnpm exec werkstatt run deploy.status --json` resolves (even if no artifacts exist yet — should return empty status)

**Completion criterion:** All 6 `deploy.*` commands are registered and callable via `site-kernel run`

**Human review:** no

---

### Step 9. Write unit tests

**Goal:** Test atomicity, hash verification, first-deploy, rollback, and immutability.

**Agent actions:**

- Create `packages/os/site-kernel-handoff/src/deploy/tests/` directory
- Write `artifact-build.test.ts` — test that build creates valid artifact with manifest
- Write `artifact-verify.test.ts` — test that verify passes for valid artifact, fails for corrupted
- Write `atomic-swap.test.ts` — test swap creates symlink, handles first-deploy, rejects corrupted artifact
- Write `atomic-rollback.test.ts` — test rollback restores previous, fails with `no-previous-artifact`
- Write `artifact-gc.test.ts` — test gc retains referenced artifacts, deletes beyond retention
- Write `immutability.test.ts` — test that modifying an artifact directory causes `deploy.artifact.verify` to fail
- Use `vitest` with `fast-check` for property-based tests where applicable (DNA-41)
- Use temp directories for filesystem tests — never touch real `.werkstatt/`

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff test` passes
- All test files run without errors

**Completion criterion:** All deploy tests pass and cover: build, verify, swap (including first-deploy), rollback (including no-previous), gc, immutability

**Human review:** no

---

### Step 10. Update documentation

**Goal:** Sync AGENTS.md files with the new deploy command family.

**Agent actions:**

- Update `packages/os/site-kernel-handoff/AGENTS.md`:
  - Add "Deploy (RFC-0566)" section documenting the 6 `deploy.*` commands
  - Document artifact path conventions (`.werkstatt/artifacts/platform/`)
  - Document symlink-swap model and coexistence with Leitstand
  - Document Ed25519 signing via `@warpgogol/site-kernel-integrity`
- Update `packages/AGENTS.md`:
  - Update `site-kernel-handoff` ownership entry to mention deploy commands
- Run `pnpm exec werkstatt run ecosystem.manifest.generate` to update `docs/ecosystem.generated.yaml` with new command surface

**Validation:**

- `git diff` shows only the expected AGENTS.md files and `docs/ecosystem.generated.yaml` changed
- `pnpm exec werkstatt run rfc.validate --id RFC-0566` passes

**Completion criterion:** Both AGENTS.md files updated with deploy command documentation; `ecosystem.generated.yaml` regenerated

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize all documentation artifacts, run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Verify every file listed in `scope.docs` is updated — check each path against `git diff`; if a scope doc was not modified, document why.
- Run `pnpm exec werkstatt run ecosystem.manifest.generate` if command surfaces changed (already done in Step 10).
- **Run code review:** invoke `fo-review` via the `skill` tool on all session code changes (`git diff <merge-base-of-session>...HEAD`). Wait for the review report in `docs/reviews/code/`.
- **Run fix if needed:** if `fo-review` reported findings, invoke `fo-fix` via the `skill` tool. Re-run `fo-review` to confirm all findings are resolved. Maximum 3 iterations.
- **Check off acceptance criteria:** verify each criterion in the RFC against the implemented code. Mark `[x]` for verified criteria with inline `(evidence: <file:line>, <test-or-command>)`. For unchecked `[ ]` criteria, document why.
- **Stamp the RFC as implemented:** run `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0566 --implementation-commit <sha> --dry-run` first, then without `--dry-run`.

**Validation:**

- `git status` — no uncommitted changes from the current session.
- `pnpm exec werkstatt run rfc.validate --id RFC-0566`
- Every file in `scope.docs` is either updated or documented as not-applicable.
- Review report exists in `docs/reviews/code/` for this session.

**Completion criterion:** All documentation artifacts in scope are updated; code review passed (findings fixed if any); all acceptance criteria are checked off with inline `(evidence: ...)` annotations; RFC is stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476), which validates all preconditions atomically. Code review is automated via `fo-review`.

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate --id RFC-0566`
- `pnpm --filter @warpgogol/site-kernel-handoff build:check`
- `pnpm --filter @warpgogol/site-kernel-handoff test`
- `pnpm exec werkstatt run ecosystem.manifest.validate` (if command surface changed)

### 4.2 Evidence artifacts

- `docs/rfcs/verification/rfc-0566.generated.json` — verification evidence (RFC-0330, if acceptance probes declared)
- Commit messages referencing `RFC-0566` in the subject line (RFC-0265 commit hygiene)

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Disk space — artifacts accumulate | Step 6: `deploy.artifact.gc` with retention policy (keep last 5) |
| Symlink swap on non-POSIX | No mitigation needed — workshops run on Linux (AGENTS.md) |
| Two-phase commit blocking | Step 1: `TwoPhaseCommitResult` type defined but Phase 4 logic is stubbed — not exercised in pilot |
| Partial commit failure | Step 1: type defined; Step 9: immutability test; Phase 4 implementation deferred |
| Artifact integrity | Step 3: `deploy.artifact.verify` checks hash + signature; Step 4: swap verifies before swapping |
| Agent misinterpretation | Step 10: AGENTS.md documents that artifacts are immutable and symlinks are managed by commands only |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-49 (Leitstand), run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0566 --reason "..." --invariant "DNA-49"` instead of working around it.
- If the Ed25519 signing utilities in `@warpgogol/site-kernel-integrity` are insufficient for artifact manifest signing (different schema, different key management), create a follow-up RFC rather than duplicating signing logic. Step 1b exports `signPayload` — if this approach proves insufficient, escalate.
- If the two-phase commit (Phase 4) requires changes to DNA-49's propagation model, create a separate superseding RFC — Phase 4 is explicitly deferred in this plan.
