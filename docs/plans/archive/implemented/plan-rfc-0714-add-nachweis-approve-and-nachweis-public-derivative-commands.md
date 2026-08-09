---
rfcId: RFC-0714
planId: PLAN-RFC-0714-01
status: draft
owner: architecture
createdAt: 2026-08-06
updatedAt:
scope:
  apps: []
  packages:
    - "@warpgogol/site-kernel-handoff"
  services: []
  docs:
    - packages/os/site-kernel-handoff/AGENTS.md
    - docs/command-manifest.generated.yaml
---

# Implementation Plan: RFC-0714

## 1. Objectives

- [ ] Objective 1 — Create `nachweis.approve` command handler that appends a Bordbuch entry with approval metadata (maps to acceptance criterion: handler created + Bordbuch entry with "approved" summary)
- [ ] Objective 2 — Create `nachweis.public-derivative` command handler that uploads a PDF to R2 and updates evidence-source `items.public.storage` to `"public"` (maps to acceptance criterion: handler created + R2 upload + entity update)
- [ ] Objective 3 — Register both commands in `createNachweisModule` with correct flags, scopes, and `--json` support (maps to acceptance criterion: both commands registered)
- [ ] Objective 4 — Add `NachweisApproveResult`, `NachweisPublicDerivativeResult` interfaces and `resolveNachweisPublicR2Path` helper to `nachweis-io.ts` (maps to acceptance criterion: contracts defined)
- [ ] Objective 5 — Write unit tests covering: entitlement skip, `--dry-run`, `--json` output, idempotency for `public-derivative`, Bordbuch entry content for `approve` (maps to acceptance criteria: unit tests)
- [ ] Objective 6 — Update `nachweis/index.ts` barrel exports, regenerate command manifest, update `AGENTS.md` workflow docs (maps to acceptance criteria: manifest + AGENTS.md)
- [ ] Objective 7 — Run `fo-review` and `fo-fix` on all code changes, then stamp RFC as implemented (maps to acceptance criterion: `rfc.validate` passes + review)

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/os/site-kernel-handoff/src/nachweis/nachweis-io.ts` — add `NachweisApproveResult`, `NachweisPublicDerivativeResult` interfaces, `resolveNachweisPublicR2Path` helper
- `packages/os/site-kernel-handoff/src/nachweis/nachweis-approve.ts` — new command handler
- `packages/os/site-kernel-handoff/src/nachweis/nachweis-public-derivative.ts` — new command handler
- `packages/os/site-kernel-handoff/src/nachweis/nachweis.module.ts` — register `nachweis.approve` and `nachweis.public-derivative` commands
- `packages/os/site-kernel-handoff/src/nachweis/index.ts` — barrel exports for new handlers and types
- `packages/os/site-kernel-handoff/src/tests/nachweis-commands.test.ts` — unit tests for both commands

### 2.2 Configuration and data

- `docs/command-manifest.generated.yaml` — regenerated via `command.manifest.generate`

### 2.3 Documentation and specs

- `packages/os/site-kernel-handoff/AGENTS.md` — update Nachweis workflow documentation to include `approve` and `public-derivative` commands in the workflow sequence

### 2.4 Validation and pipelines

- No pipeline changes — both commands are operator-invoked, not added to `build.prepare` or `build.check`
- `rfc.validate --id RFC-0714` — must pass before stamping
- `pnpm --filter @warpgogol/site-kernel-handoff build:check` — typecheck
- `pnpm --filter @warpgogol/site-kernel-handoff test` — unit tests

## 3. Step sequence

### Step 1. Add result interfaces and R2 path helper to nachweis-io.ts

**Goal:** Define the TypeScript contracts and R2 path helper that both new command handlers will use.

**Agent actions:**

- Add `NachweisApproveResult` interface with fields: `slug`, `systemId`, `verificationLevel`, `legalContentCheckPassed`, `bordbuchEventId`
- Add `NachweisPublicDerivativeResult` interface with fields: `slug`, `systemId`, `r2Path`, `publicDerivativeSha256`, `bordbuchEventId`, `alreadyUploaded`
- Add `resolveNachweisPublicR2Path(systemId: string, recordId: string, version: number): string` helper that returns `${systemId}/public/${recordId}/v${version}/public.pdf`
- Update the `<CHANGE_SUMMARY>` block with an `RFC-0714` entry

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff build:check` — typecheck passes with new interfaces

**Completion criterion:** Both interfaces and the helper function are exported from `nachweis-io.ts` and typecheck passes.

**Human review:** no

---

### Step 2. Create nachweis-approve.ts command handler

**Goal:** Implement the `nachweis.approve` command handler that records human approval, verification level, and legal content check in a Bordbuch entry.

**Agent actions:**

- Create `packages/os/site-kernel-handoff/src/nachweis/nachweis-approve.ts`
- Import `isNachweisEntitled`, `makeSkipResult`, `resolveNachweisCachePath` from `./nachweis-io.ts`
- Import `appendBordbuchEntry` from `../bordbuch/bordbuch-io.ts`
- Import `acquireLock`, `releaseLock`, `generateOperationId` from `../werkstatt/index.ts`
- Implement `runNachweisApprove(input, context)` following the pattern from `nachweis-consent.ts`:
  - Parse flags: `--system`, `--slug`, `--verification-level`, `--legal-content-check`, `--dry-run`, `--json`
  - Check entitlement → return skip result if not resolved
  - Check if evidence-source file exists for the slug → emit `logger.warn` if not found (non-blocking)
  - If `--dry-run`: return result without appending Bordbuch
  - Acquire `system:` and `bordbuch:` locks
  - Append `nachweis-record` Bordbuch entry with summary `"Record '<slug>' approved (verification: <level>, legal: <result>)"` and metadata `{ slug, verificationLevel, legalContentCheckPassed, approved: true }`
  - Release locks in `finally` block
  - Return `KernelCommandResult<NachweisApproveResult>`
- Add `<MODULE_CONTRACT>` block following existing nachweis handler conventions

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff build:check` — typecheck passes

**Completion criterion:** `runNachweisApprove` function exists, compiles, and follows the same pattern as `nachweis-consent.ts`.

**Human review:** no

---

### Step 3. Create nachweis-public-derivative.ts command handler

**Goal:** Implement the `nachweis.public-derivative` command handler that uploads a public-derivative PDF to R2 and updates the evidence-source entity.

**Agent actions:**

- Create `packages/os/site-kernel-handoff/src/nachweis/nachweis-public-derivative.ts`
- Import `isNachweisEntitled`, `makeSkipResult`, `resolveNachweisCachePath`, `computeSourceSha256`, `uploadToR2`, `resolveNachweisPublicR2Path` from `./nachweis-io.ts`
- Import `appendBordbuchEntry` from `../bordbuch/bordbuch-io.ts`
- Import `acquireLock`, `releaseLock`, `generateOperationId` from `../werkstatt/index.ts`
- Import `parseMarkdownFrontmatter`, `stringifyMarkdownFrontmatter` from `@warpgogol/site-kernel-content`
- Implement `runNachweisPublicDerivative(input, context)` following the pattern from `nachweis-publish.ts`:
  - Parse flags: `--system`, `--slug`, `--file`, `--dry-run`, `--json`
  - Check entitlement → return skip result if not resolved
  - Read evidence-source entity file → throw `NOT_FOUND` if missing
  - Extract `recordId` and `version` from frontmatter
  - Compute SHA-256 of the provided file via `computeSourceSha256`
  - **Idempotency check**: if `items.public.sha256` already matches computed hash → return no-op with `alreadyUploaded: true`
  - If `--dry-run`: return result without uploading or updating entity
  - Upload to R2 via `uploadToR2` at path from `resolveNachweisPublicR2Path`
  - Update evidence-source entity: set `items.public` to `{ sha256, storage: "public", mediaType: "application/pdf" }`
  - Write updated entity back to disk
  - Acquire `system:` and `bordbuch:` locks
  - Append `nachweis-record` Bordbuch entry with summary and metadata
  - Release locks in `finally` block
  - Return `KernelCommandResult<NachweisPublicDerivativeResult>`
- Add `<MODULE_CONTRACT>` block

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff build:check` — typecheck passes

**Completion criterion:** `runNachweisPublicDerivative` function exists, compiles, and follows the same pattern as `nachweis-publish.ts` with idempotency check.

**Human review:** no

---

### Step 4. Register both commands in nachweis.module.ts and update barrel exports

**Goal:** Wire the new command handlers into the kernel module registration and barrel exports.

**Agent actions:**

- In `nachweis.module.ts`:
  - Add dynamic imports for `runNachweisApprove` and `runNachweisPublicDerivative` in the `register` function
  - Register `nachweis.approve` command with flags: `system`, `slug` (required), `verification-level` (required), `legal-content-check` (required), `dry-run`, `json`
  - Register `nachweis.public-derivative` command with flags: `system`, `slug` (required), `file` (required), `dry-run`, `json`
  - Both commands: `scope: "workspace"`, `supportsAllSites: false`, `mutatesState: true`, `cacheable: false`
  - Update `<MODULE_CONTRACT>` responsibilities to list 8 commands
- In `index.ts`:
  - Add `export { runNachweisApprove } from "./nachweis-approve.ts"`
  - Add `export { runNachweisPublicDerivative } from "./nachweis-public-derivative.ts"`
  - Add `type NachweisApproveResult`, `type NachweisPublicDerivativeResult` to the type exports from `./nachweis-io.ts`

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff build:check` — typecheck passes

**Completion criterion:** Both commands are registered in `createNachweisModule` and exported from the barrel.

**Human review:** no

---

### Step 5. Write unit tests

**Goal:** Create unit tests covering all acceptance criteria: entitlement skip, dry-run, Bordbuch entry content, R2 upload, entity update, idempotency, `--json` output.

**Agent actions:**

- Add test sections to `packages/os/site-kernel-handoff/src/tests/nachweis-commands.test.ts`:
  - **`nachweis.approve` tests:**
    - Skip when entitlement not resolved (same pattern as existing tests)
    - Appends Bordbuch entry with summary containing "approved", `metadata.verificationLevel`, `metadata.legalContentCheckPassed`
    - `--dry-run` returns result without appending Bordbuch
    - Emits `logger.warn` when evidence-source file not found for slug
  - **`nachweis.public-derivative` tests:**
    - Skip when entitlement not resolved
    - Uploads PDF to R2 and updates `items.public.storage` to `"public"` in evidence-source entity
    - Idempotent: returns `alreadyUploaded: true` when same SHA-256 already in `items.public.sha256`
    - `--dry-run` returns result without uploading or updating entity
    - Throws `NOT_FOUND` when evidence-source file does not exist
- Mock R2 upload via `vi.mock` for `./nachweis-io.ts` `uploadToR2` (same pattern as existing nachweis tests mock bordbuch)
- Mock `resolveCachePath` from `../sternsystem/registry-io.ts` to return temp directory path (same pattern as existing tests)

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff test` — all tests pass

**Completion criterion:** All test cases pass and cover every acceptance criterion that requires unit test evidence.

**Human review:** no

---

### Step 6. Regenerate command manifest and update AGENTS.md

**Goal:** Synchronize the command manifest and documentation with the new commands.

**Agent actions:**

- Run `pnpm exec site-kernel run command.manifest.generate` to regenerate `docs/command-manifest.generated.yaml`
- Update `packages/os/site-kernel-handoff/AGENTS.md`:
  - Add a Nachweis workflow section documenting the full workflow: `ingest` → `consent.update` → `approve` → `public-derivative` → `validate` → `publish`
  - Document that `nachweis.approve` is operator-invoked only — agents MUST NOT run it autonomously
  - Document the idempotency contract for `nachweis.public-derivative`

**Validation:**

- `git diff docs/command-manifest.generated.yaml` shows both new commands registered
- `packages/os/site-kernel-handoff/AGENTS.md` contains the new workflow documentation

**Completion criterion:** Command manifest includes `nachweis.approve` and `nachweis.public-derivative`; AGENTS.md documents the workflow.

**Human review:** no

---

### Step 7. Validation, review, fix, and stamp implemented

**Goal:** Run all validation checks, code review, fix findings, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Run `pnpm exec site-kernel run rfc.validate --id RFC-0714` — must pass
- Run `pnpm --filter @warpgogol/site-kernel-handoff build:check` — must pass
- Run `pnpm --filter @warpgogol/site-kernel-handoff test` — must pass
- Run `pnpm exec site-kernel run command.manifest.generate` — verify manifest is up-to-date
- **Run code review:** invoke `fo-review` via the `skill` tool on all session code changes
- **Run fix if needed:** if `fo-review` reported findings, invoke `fo-fix` via the `skill` tool. Re-run `fo-review` to confirm all findings are resolved. Maximum 3 iterations.
- **Check off acceptance criteria:** verify each criterion in the RFC against the implemented code. Mark `[x]` for verified criteria with inline `(evidence: <file:line>)` annotations.
- **Stamp the RFC as implemented:** run `pnpm exec site-kernel run rfc.implement.stamp --id RFC-0714 --implementation-commit <sha>` (use the first implementation commit SHA).

**Validation:**

- `git status` — no uncommitted changes from the current session
- `pnpm exec site-kernel run rfc.validate --id RFC-0714` — passes
- Review report exists in `docs/reviews/code/` for this session

**Completion criterion:** All validation passes; code review passed (findings fixed if any); all acceptance criteria checked off with inline evidence; RFC stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp`.

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec site-kernel run rfc.validate --id RFC-0714`
- `pnpm --filter @warpgogol/site-kernel-handoff build:check`
- `pnpm --filter @warpgogol/site-kernel-handoff test`
- `pnpm exec site-kernel run command.manifest.generate` (verify manifest up-to-date)

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0714` in the subject line (RFC-0265 commit hygiene)
- Unit test outputs demonstrating Bordbuch entry content and idempotency behavior

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Verification level gaming — `nachweis.approve` accepts any level | Step 6: AGENTS.md documents that `approve` is operator-invoked only; Bordbuch entry records the actor |
| Public derivative content — operator responsible for no private data | Step 6: AGENTS.md documents operator responsibility; command does not redact |
| Bordbuch growth — each action adds an entry | Low risk — Nachweis records are low-volume; no mitigation needed |
| Agent misinterpretation — agents might run `approve` autonomously | Step 6: AGENTS.md explicitly states agents MUST NOT run `approve` autonomously |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-N, run `pnpm exec site-kernel run rfc.supersede.propose --id RFC-0714 --reason "..." --invariant "DNA-N"` instead of working around it.
- If the `publicDerivativeSha256` storage approach (using `items.public.sha256`) conflicts with PBP schema validation, run `rfc.supersede.propose` against RFC-0706 instead of introducing an unregistered field.
