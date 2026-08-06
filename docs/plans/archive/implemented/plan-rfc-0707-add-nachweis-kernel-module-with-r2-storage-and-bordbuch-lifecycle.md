---
rfcId: RFC-0707
planId: PLAN-RFC-0707-01
status: draft
owner: architecture
createdAt: 2026-08-06
updatedAt:
scope:
  apps:
    - warpgogol-com
  packages:
    - "@warpgogol/site-kernel-handoff"
  services: []
  docs:
    - packages/os/site-kernel-handoff/AGENTS.md
    - docs/verification-plan.xml
---

# Implementation Plan: RFC-0707

## 1. Objectives

- [ ] O1 — Create `nachweis` kernel module with 6 commands registered in `tools/kernel.config.ts` — maps to acceptance criterion "nachweis.module.ts registers all 6 commands"
- [ ] O2 — Implement `nachweis.ingest` with SHA-256 hashing, R2 upload, and Bordbuch append — maps to "nachweis.ingest computes SHA-256 via @warpgogol/fingerprint, uploads to R2, appends Bordbuch entry"
- [ ] O3 — Implement `nachweis.validate` with publication gate enforcement — maps to "nachweis.validate checks publication gate conditions and reports violations"
- [ ] O4 — Implement `nachweis.manifest.generate` with public-only filtering and `generatedAt: null` — maps to "nachweis.manifest.generate writes manifest.json with only publication.visibility: public records"
- [ ] O5 — Implement `nachweis.consent.update`, `nachweis.publish`, `nachweis.withdraw` with gate checks and Bordbuch entries — maps to respective acceptance criteria
- [ ] O6 — Integrate pipeline steps into `build.prepare` and `build.check` — maps to "nachweis.manifest.generate integrated into build.prepare" and "nachweis.validate integrated into build.check"
- [ ] O7 — All commands skip silently when `nachweis` entitlement is not resolved — maps to "All commands skip silently when nachweis entitlement is not resolved"
- [ ] O8 — All commands support `--json` output — maps to "All commands support --json output"

## 2. Affected artifacts

### 2.1 Code and commands

**New files in `packages/os/site-kernel-handoff/src/nachweis/`:**

- `nachweis.module.ts` — Module registration (lazy-loaded, 6 commands)
- `nachweis-io.ts` — R2 upload/download, SHA-256 via `@warpgogol/fingerprint`, record ID generation
- `nachweis-ingest.ts` — Intake command handler
- `nachweis-validate.ts` — Validation + publication gate
- `nachweis-manifest.ts` — Manifest generation
- `nachweis-consent.ts` — Consent lifecycle command
- `nachweis-publish.ts` — Publish gate command
- `nachweis-withdraw.ts` — Withdrawal command
- `index.ts` — Barrel exports

**Modified files:**

- `packages/os/site-kernel-handoff/package.json` — Add `./nachweis-module` subpath export
- `tools/kernel.config.ts` — Add `nachweis` entry to `moduleLoaders`
- `packages/os/site-kernel-checks/src/pipelines/build-prepare.ts` — Add `nachweis.manifest.generate` step after `bordbuch.commit`
- `packages/os/site-kernel-checks/src/pipelines/build-check.ts` — Add `nachweis.validate` step after `SITES_CHECK_AUTHOR_PIPELINE`

**Site OS commands (6 new):**

- `nachweis.ingest` — scope: workspace, mutatesState: true
- `nachweis.validate` — scope: workspace, mutatesState: false
- `nachweis.manifest.generate` — scope: workspace, mutatesState: true
- `nachweis.consent.update` — scope: workspace, mutatesState: true
- `nachweis.publish` — scope: workspace, mutatesState: true
- `nachweis.withdraw` — scope: workspace, mutatesState: true

### 2.2 Configuration and data

- R2 bucket `nachweise` — created manually in Cloudflare Dashboard before pilot
- `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` env vars — reused from evidence module
- `entitlementsOverride: ["nachweis"]` in warpgogol-com `system.md` for pilot
- PBP trust collections (EvidenceSource, Consent, Claim entities) — read/written by nachweis commands

### 2.3 Documentation and specs

- `packages/os/site-kernel-handoff/AGENTS.md` — Add nachweis-specific rules: entitlement gating pattern, R2 bucket prerequisite, atomicity gap guidance, `--pilot-n2-exception` removal commitment
- `docs/verification-plan.xml` — Add `nachweis.validate` and `nachweis.manifest.generate` to pipeline verification surface (if applicable)
- RFC-0707 file — read-only reference, not modified during implementation

### 2.4 Validation and pipelines

- `SITES_BUILD_PREPARE_PIPELINE` — Add `{ command: "nachweis.manifest.generate" }` after `bordbuch.commit`, before `passport.key.ensure`
- `SITES_BUILD_CHECK_PIPELINE` — Add `{ command: "nachweis.validate" }` after `SITES_CHECK_AUTHOR_PIPELINE`, before `biome.tokens.validate`

## 3. Step sequence

### Step 1. TypeScript contracts and nachweis-io.ts

**Goal:** Define all TypeScript interfaces and implement the I/O layer (R2 upload, hash computation, record ID generation).

**Agent actions:**

- Create `packages/os/site-kernel-handoff/src/nachweis/nachweis-io.ts` with:
  - `NachweisRecord`, `NachweisIngestResult`, `NachweisManifest`, `NachweisManifestEntry`, `NachweisPublicationGate` interfaces per RFC §Design
  - `uploadToR2(fileBuffer, r2Path)` — reuse `createR2Client` and `resolveR2ConfigFromEnv` from `../evidence/r2-client.ts`, bucket name `nachweise`
  - `computeSourceSha256(filePath)` — use `byteHashFile` from `@warpgogol/fingerprint`
  - `generateRecordId(slug)` — format `nr_{slug}_{YYYYMMDD}`
  - `resolveNachweisR2Path(recordId, version)` — `nachweise/private/{recordId}/v{version}/source.pdf`
- Create `packages/os/site-kernel-handoff/src/nachweis/index.ts` barrel exports

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff run build:check` (typecheck passes)

**Completion criterion:** `nachweis-io.ts` exports all interfaces and functions; typecheck passes.

**Human review:** no

---

### Step 2. nachweis.ingest command handler

**Goal:** Implement the intake command that hashes a PDF, uploads to R2, and appends a Bordbuch entry.

**Agent actions:**

- Create `packages/os/site-kernel-handoff/src/nachweis/nachweis-ingest.ts`:
  - Parse flags: `--system`, `--file`, `--record-type`, `--slug`, `--title-de`, `--title-uk`, `--title-en`, `--quality-status`, `--dry-run`
  - Validate file exists and has `.pdf` extension
  - Compute SHA-256 via `byteHashFile`
  - If `--dry-run`: return result without R2 upload or Bordbuch append
  - Upload to R2 via `uploadToR2` (bucket `nachweise`)
  - Acquire `system:<id>` and `bordbuch:<id>` locks (same pattern as `bordbuch-append.ts`)
  - Append `nachweis-record` Bordbuch entry via `appendBordbuchEntry` with `writerRole: "nachweis"`, `kind: "nachweis-record"`
  - Return `KernelCommandResult<NachweisIngestResult>` with `--json` support
  - Entitlement check: if `nachweis` not resolved, return skip result (not error)
  - ADR-0025: add 30s heartbeat if R2 upload may exceed 10s

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff run build:check`

**Completion criterion:** `nachweis.ingest` handler compiles, uses `byteHashFile` for SHA-256, uses R2 client from evidence module, appends Bordbuch entry with correct writer-role and kind.

**Human review:** no

---

### Step 3. nachweis.validate command handler

**Goal:** Implement validation and publication gate enforcement.

**Agent actions:**

- Create `packages/os/site-kernel-handoff/src/nachweis/nachweis-validate.ts`:
  - Load PBP trust collections (EvidenceSource, Consent, Claim entities) from cache clone
  - Check all EvidenceSource entities with Nachweis kinds have `sha256` in items
  - Check all Consent entities with `status: granted` have `grantedAt` set
  - Check all Claim entities with `statementLang` have valid BCP 47 tags
  - Publication gate: no entity with `record_status: published` exists without all gate conditions met
  - Delegate bordbuch hash-chain validation to `bordbuch.validate` via `executeKernelCommand`
  - Return `KernelCommandResult` with violations array and gate results
  - Entitlement skip check
  - `--json` support

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff run build:check`

**Completion criterion:** `nachweis.validate` compiles, checks all 5 validation rules, delegates bordbuch validation, reports gate results per record.

**Human review:** no

---

### Step 4. nachweis.manifest.generate command handler

**Goal:** Generate `public/nachweise/manifest.json` from published records.

**Agent actions:**

- Create `packages/os/site-kernel-handoff/src/nachweis/nachweis-manifest.ts`:
  - Read PBP trust collections, filter by `publication.visibility: public`
  - Build `NachweisManifest` with `schemaVersion`, `generatedAt: null` (RFC-0602), `expiresAt: null`, `records[]`
  - Write to `{cachePath}/public/nachweise/manifest.json` using `writeFileIfChanged` from `@warpgogol/site-kernel`
  - Entitlement skip check
  - `--json` support
  - Write empty manifest (with `records: []`) if no published records

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff run build:check`

**Completion criterion:** `nachweis.manifest.generate` compiles, writes manifest with `generatedAt: null`, only includes public records, uses `writeFileIfChanged`.

**Human review:** no

---

### Step 5. nachweis.consent.update, nachweis.publish, nachweis.withdraw command handlers

**Goal:** Implement the remaining 3 lifecycle commands.

**Agent actions:**

- Create `nachweis-consent.ts`:
  - Parse `--consent-id`, `--status` (requested|granted|revoked), `--method`
  - Update PBP Consent entity's `status` field in cache clone
  - Append `nachweis-consent` Bordbuch entry with metadata (previous status, new status, method, actor)
  - Acquire locks, entitlement skip, `--json`
- Create `nachweis-publish.ts`:
  - Parse `--slug`, `--pilot-n2-exception` (optional)
  - Check publication gate preconditions (consent granted, source integrity verified, record approved, verification level N3 or N2 with exception flag, public derivative ready, legal content check passed)
  - If all met: set `publication.visibility: public`, append `nachweis-record` Bordbuch entry, call `nachweis.manifest.generate` to regenerate manifest
  - If not met: fail without modifying state
  - Entitlement skip, `--json`
- Create `nachweis-withdraw.ts`:
  - Parse `--slug`, `--reason`
  - Set `consent.status: revoked`, `record_status: withdrawn`, `publication.visibility: private`
  - Append `nachweis-consent` and `nachweis-record` Bordbuch entries
  - Regenerate manifest
  - Idempotent: if already withdrawn, return no-op result
  - Entitlement skip, `--json`

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff run build:check`

**Completion criterion:** All 3 handlers compile, enforce gate conditions, append correct Bordbuch entries, support `--json`.

**Human review:** no

---

### Step 6. Module registration and pipeline integration

**Goal:** Wire the nachweis module into the kernel config and add pipeline steps.

**Agent actions:**

- Create `packages/os/site-kernel-handoff/src/nachweis/nachweis.module.ts`:
  - `createNachweisModule(): KernelModule` with lazy-loaded dynamic imports (same pattern as `evidence-module.ts`)
  - Register all 6 commands with correct names, scopes, flags, reads/writes declarations
- Add `./nachweis-module` subpath export to `packages/os/site-kernel-handoff/package.json`
- Add `nachweis` entry to `tools/kernel.config.ts` `moduleLoaders`:
  ```ts
  nachweis: async () =>
    (await import("@warpgogol/site-kernel-handoff/nachweis-module")).createNachweisModule(),
  ```
- Add `{ command: "nachweis.manifest.generate" }` to `SITES_BUILD_PREPARE_PIPELINE` in `build-prepare.ts` after `bordbuch.commit`, before `passport.key.ensure`
- Add `{ command: "nachweis.validate" }` to `SITES_BUILD_CHECK_PIPELINE` in `build-check.ts` after `...SITES_CHECK_AUTHOR_PIPELINE`, before `biome.tokens.validate`
- Update `CHANGE_SUMMARY` in both pipeline files

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff run build:check`
- `pnpm --filter @warpgogol/site-kernel-checks run build:check`
- `pnpm exec site-kernel run command.manifest.generate` (verify nachweis commands appear in manifest)

**Completion criterion:** Module loads in kernel config, 6 commands registered, pipeline steps added in correct positions, command manifest includes all 6 nachweis commands.

**Human review:** no

---

### Step 7. Unit tests

**Goal:** Write unit tests for all 6 command handlers and the I/O layer.

**Agent actions:**

- Create `packages/os/site-kernel-handoff/src/tests/nachweis-io.test.ts`:
  - Test `computeSourceSha256` with a fixture PDF
  - Test `generateRecordId` format
  - Test `resolveNachweisR2Path` path construction
- Create `packages/os/site-kernel-handoff/src/tests/nachweis-ingest.test.ts`:
  - Mock R2 client (reuse mock pattern from evidence-sync tests)
  - Mock `appendBordbuchEntry`
  - Test successful ingest (hash computed, R2 upload called, Bordbuch entry appended)
  - Test `--dry-run` (no R2 upload, no Bordbuch append)
  - Test missing file error
  - Test entitlement skip (returns skip result, not error)
- Create `packages/os/site-kernel-handoff/src/tests/nachweis-validate.test.ts`:
  - Test publication gate violations (missing consent, missing integrity, N1 instead of N3)
  - Test clean validation (all gate conditions met)
  - Test entitlement skip
- Create `packages/os/site-kernel-handoff/src/tests/nachweis-manifest.test.ts`:
  - Test manifest generation with published records
  - Test empty manifest when no published records
  - Test `generatedAt: null` (RFC-0602 determinism)
  - Test `writeFileIfChanged` is used (no unnecessary writes)
- Create `packages/os/site-kernel-handoff/src/tests/nachweis-lifecycle.test.ts`:
  - Test `consent.update` appends `nachweis-consent` Bordbuch entry
  - Test `publish` enforces gate (fails when conditions not met, succeeds when all met)
  - Test `publish` with `--pilot-n2-exception` accepts N2
  - Test `withdraw` is idempotent
  - Test `withdraw` regenerates manifest

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff run test`

**Completion criterion:** All nachweis tests pass; coverage includes success paths, failure modes, entitlement skip, and `--dry-run`.

**Human review:** no

---

### Step 8. Documentation sync

**Goal:** Update AGENTS.md and Compass XML files.

**Agent actions:**

- Update `packages/os/site-kernel-handoff/AGENTS.md`:
  - Add nachweis module to the module list
  - Add rules: entitlement gating pattern (skip result, not error), R2 bucket `nachweise` prerequisite (manual creation in Cloudflare Dashboard), atomicity gap in ingest (upload first, then append; on failure log R2 path for manual cleanup), `--pilot-n2-exception` is temporary and MUST be removed when N3 is implemented
  - Add cross-reference to RFC-0707 and RFC-0706
- Update `docs/verification-plan.xml` if pipeline verification surface changed (add `nachweis.manifest.generate` and `nachweis.validate` to the pipeline step inventory if applicable)
- Run `pnpm exec site-kernel run ecosystem.manifest.generate` if command surfaces changed

**Validation:**

- `git diff packages/os/site-kernel-handoff/AGENTS.md` shows nachweis rules added
- `git diff docs/verification-plan.xml` shows pipeline steps (if applicable)

**Completion criterion:** AGENTS.md updated with nachweis rules; verification-plan.xml synchronized if needed; ecosystem manifest regenerated.

**Human review:** no

---

### Final Step. Review, fix, acceptance criteria verification, and stamp

**Goal:** Run code review, fix findings, verify all acceptance criteria, and stamp RFC-0707 as implemented.

**Agent actions:**

- Run `pnpm exec site-kernel run rfc.validate --id RFC-0707`
- Run `pnpm --filter @warpgogol/site-kernel-handoff run build:check`
- Run `pnpm --filter @warpgogol/site-kernel-handoff run test`
- Run `pnpm exec site-kernel run rfc.verification.emit --id RFC-0707` (if acceptance probes declared)
- Run code review: invoke `fo-review` via the `skill` tool on all session code changes
- Run fix if needed: invoke `fo-fix` if review findings exist; re-run `fo-review` (max 3 iterations)
- Check off all 13 acceptance criteria in the RFC with inline `(evidence: <file:line>)` annotations
- Stamp: `pnpm exec site-kernel run rfc.implement.stamp --id RFC-0707 --implementation-commit <sha>`

**Validation:**

- `git status` — no uncommitted changes from this session
- `pnpm exec site-kernel run rfc.validate --id RFC-0707` — passes
- Review report exists in `docs/reviews/code/`
- All acceptance criteria checked `[x]` with evidence

**Completion criterion:** All validation passes; code review approved (findings fixed if any); all 13 acceptance criteria verified with evidence; RFC stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476).

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec site-kernel run rfc.validate --id RFC-0707`
- `pnpm --filter @warpgogol/site-kernel-handoff run build:check`
- `pnpm --filter @warpgogol/site-kernel-handoff run test`
- `pnpm --filter @warpgogol/site-kernel-checks run build:check`
- `pnpm exec site-kernel run rfc.verification.emit --id RFC-0707` (if acceptance probes declared)

### 4.2 Evidence artifacts

- `docs/rfcs/verification/rfc-0707.generated.json` — verification evidence (RFC-0330)
- Commit messages referencing `RFC-0707` in the subject line (RFC-0265 commit hygiene)

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| R2 bucket proliferation | Step 6 — use prefix-based isolation (`nachweise/{systemId}/private/...`) in shared bucket for small clients |
| Bordbuch growth (3-5 entries per record) | Step 3 — `nachweis.validate` delegates to `bordbuch.validate` which is O(n); monitor for 100+ records |
| Atomicity gap in ingest (R2 upload succeeds, Bordbuch append fails) | Step 2 — ingest appends Bordbuch immediately after upload; on failure, log warning with R2 path for manual cleanup |
| Pilot N2/N3 gap | Step 5 — `nachweis.publish` accepts N2 with `--pilot-n2-exception` flag; flag is documented as temporary in AGENTS.md (Step 8) |
| Concurrent execution | Step 2 — `nachweis.ingest` acquires `system:<id>` and `bordbuch:<id>` locks before appending |
| GDPR/privacy (withdrawn records persist in R2) | Step 5 — `nachweis.withdraw` does NOT delete R2 object (audit trail); data retention policy deferred to future RFC (noted in nonGoals) |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-46 (Bordbuch), DNA-53 (fingerprint governance), or DNA-59 (R2 evidence storage), run `pnpm exec site-kernel run rfc.supersede.propose --id RFC-0707 --reason "..." --invariant "DNA-N"` instead of working around it. The supersede escalation protocol is defined in RFC-0158 and RFC-0224.
- If RFC-0706 (schema extensions) is not yet `accepted` when implementation begins, stop and wait for RFC-0706 to reach `accepted` status. RFC-0707 depends on RFC-0706 for `BordbuchEntryKind` enum values (`nachweis-record`, `nachweis-consent`) and `ENTITLED_FEATURES` (`nachweis`).
