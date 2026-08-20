---
rfcId: RFC-0888
planId: PLAN-RFC-0888-01
status: draft
owner: architecture
createdAt: 2026-08-20
updatedAt:
scope:
  apps: []
  packages:
    - werkstatt
  services: []
  docs:
    - docs/requirements.xml
---

# Implementation Plan: RFC-0888

## 1. Objectives

- [ ] O1 — Add `sichtpass` to `bordbuchEntryKindSchema` enum (maps to acceptance criterion: `bordbuchEntryKindSchema includes "sichtpass"`)
- [ ] O2 — Add `sichtpass` to `WRITER_ROLE_KINDS.nachweis` array (maps to acceptance criterion: `WRITER_ROLE_KINDS.nachweis includes sichtpass`)
- [ ] O3 — Register `--skip-bordbuch` flag on `nachweis.manifest.generate` and implement skip logic (maps to acceptance criterion: `nachweis.manifest.generate registers --skip-bordbuch`)
- [ ] O4 — Append `sichtpass` Bordbuch entry in `nachweis.manifest.generate` when `--skip-bordbuch` is not set (maps to acceptance criterion: `nachweis.manifest.generate appends sichtpass entry`)
- [ ] O5 — Append `sichtpass` Bordbuch entry in `nachweis.publish` after manifest regeneration, passing `--skip-bordbuch` to `manifest.generate` (maps to acceptance criteria: `nachweis.publish appends sichtpass`, `nachweis.publish calls manifest.generate with --skip-bordbuch`)
- [ ] O6 — Append `sichtpass` Bordbuch entry in `nachweis.withdraw` with `withdrawn: true` metadata, passing `--skip-bordbuch` to `manifest.generate` (maps to acceptance criteria: `nachweis.withdraw appends sichtpass with withdrawn: true`, `nachweis.withdraw calls manifest.generate with --skip-bordbuch`)
- [ ] O7 — Verify `bordbuch.validate` accepts `sichtpass` entries and `bordbuch.generate` projection includes them (maps to acceptance criteria: `bordbuch.validate accepts sichtpass`, `bordbuch.generate includes sichtpass in timeline`)

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/werkstatt/src/schemas/mission.ts` — add `"sichtpass"` to `bordbuchEntryKindSchema` enum (line 72, after `"nachweis-timestamped"`)
- `packages/werkstatt/src/bordbuch/bordbuch-io.ts` — add `"sichtpass"` to `WRITER_ROLE_KINDS.nachweis` array (line 75)
- `packages/werkstatt/src/nachweis/nachweis.module.ts` — register `skip-bordbuch` boolean flag on `nachweis.manifest.generate` command (hidden from CLI help)
- `packages/werkstatt/src/nachweis/nachweis-manifest.ts` — read `--skip-bordbuch` flag; when not set, append `sichtpass` Bordbuch entry after manifest file is written
- `packages/werkstatt/src/nachweis/nachweis-publish.ts` — pass `--skip-bordbuch` to `nachweis.manifest.generate` call (line 186-191); append `sichtpass` Bordbuch entry after manifest regeneration
- `packages/werkstatt/src/nachweis/nachweis-withdraw.ts` — pass `--skip-bordbuch` to `nachweis.manifest.generate` call (line 211-216); append `sichtpass` Bordbuch entry with `withdrawn: true` metadata

### 2.2 Configuration and data

- No YAML/JSON/NDJSON configuration changes. Bordbuch entries are append-only NDJSON; the new `sichtpass` kind is additive.

### 2.3 Documentation and specs

- `docs/requirements.xml` — req-23 (Bordbuch) may need updating to mention `sichtpass` as a tracked event kind.
- `packages/werkstatt/AGENTS.md` — no change needed (Bordbuch kind enum is internal schema detail).
- RFC file `docs/rfcs/rfc-0888-add-sichtpass-bordbuch-event-kind.md` — read-only reference.

### 2.4 Validation and pipelines

- `pnpm --filter @warpgogol/werkstatt run build:check` — TypeScript typecheck after schema and command changes.
- `pnpm --filter @warpgogol/werkstatt run test` — Vitest unit tests, including new `sichtpass` tests.
- `pnpm exec werkstatt run rfc.validate --id RFC-0888` — RFC mechanical validation.
- `pnpm exec werkstatt run bordbuch.validate --system <test-system>` — runtime Bordbuch validation (if test system available).

## 3. Step sequence

### Step 1. Extend Bordbuch schema with `sichtpass` kind

**Goal:** Add `sichtpass` to the Bordbuch entry kind enum and writer-role map.

**Agent actions:**

- Edit `packages/werkstatt/src/schemas/mission.ts`: add `"sichtpass"` after `"nachweis-timestamped"` in `bordbuchEntryKindSchema` with comment `// RFC-0888: Sichtpass lifecycle audit trail`.
- Edit `packages/werkstatt/src/bordbuch/bordbuch-io.ts`: add `"sichtpass"` to `WRITER_ROLE_KINDS.nachweis` array (line 75).

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run build:check` — confirms TypeScript compiles with new enum value.

**Completion criterion:** `bordbuchEntryKindSchema.options` includes `"sichtpass"` and `WRITER_ROLE_KINDS.nachweis` includes `"sichtpass"`.

**Human review:** no

---

### Step 2. Register `--skip-bordbuch` flag on `nachweis.manifest.generate`

**Goal:** Add the internal `--skip-bordbuch` boolean flag to the command registration.

**Agent actions:**

- Edit `packages/werkstatt/src/nachweis/nachweis.module.ts`: add `skip-bordbuch` flag to `nachweis.manifest.generate` command registration (after `json` flag). Set `kind: "boolean"` and `description: "Internal: skip sichtpass Bordbuch append (used by nachweis.publish and nachweis.withdraw)"`.
- Add code comment above the flag registration: `// RFC-0888: Internal coordination flag — set by nachweis.publish and nachweis.withdraw to prevent duplicate sichtpass Bordbuch entries. Not documented in CLI help.`, with `description` set to `"Internal: skip sichtpass Bordbuch append (used by nachweis.publish and nachweis.withdraw)."`

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run build:check` — confirms TypeScript compiles.

**Completion criterion:** `nachweis.manifest.generate` command registration includes `skip-bordbuch` boolean flag.

**Human review:** no

---

### Step 3. Implement `sichtpass` append in `nachweis.manifest.generate`

**Goal:** When `--skip-bordbuch` is not set, append a `sichtpass` Bordbuch entry after the manifest file is written.

**Agent actions:**

- Edit `packages/werkstatt/src/nachweis/nachweis-manifest.ts`:
  - Read `skip-bordbuch` flag from `input.flags` using `_flagBool` helper (or inline check).
  - After `writeFileIfChanged` and `logger.info` (line 175-179), if `skipBordbuch` is false:
    - Import `appendAndCommitBordbuch` from `../bordbuch/bordbuch-commit-helper.ts`.
    - Import `acquireLock`, `releaseLock`, `generateOperationId` from `../werkstatt/index.ts`.
    - Acquire `system:{systemId}` and `bordbuch:{systemId}` locks.
    - Call `appendAndCommitBordbuch` with kind `"sichtpass"`, summary `"Sichtpass manifest regenerated for '{systemId}'"`, writerRole `"nachweis"`, metadata:
      - `slug: "__manifest__"` (manifest-level event, not per-record)
      - `manifestVersion: MANIFEST_SCHEMA_VERSION` (e.g. "1.0.0")
      - `recordHash`: SHA-256 of the manifest JSON file content (or empty string if no records)
      - `signaturePresent: false` (manifest generation does not sign)
      - `timestampPresent: false` (manifest generation does not timestamp)
      - `verificationLevel: "N0"` (baseline — manifest regeneration is not a verification event)
    - Release locks in `finally` block.
  - If `skipBordbuch` is true, skip the append entirely and log `logger.info('[nachweis.manifest.generate] --skip-bordbuch set, skipping sichtpass Bordbuch entry')` so the audit trail gap is visible in logs.
- Design decision: one `sichtpass` entry per `manifest.generate` call (not per record). `slug = "__manifest__"` distinguishes manifest-level events from per-record events (which use the actual slug in `nachweis.publish` and `nachweis.withdraw`).

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run build:check` — confirms TypeScript compiles.
- `pnpm --filter @warpgogol/werkstatt run test` — existing tests pass.

**Completion criterion:** `nachweis.manifest.generate` appends a `sichtpass` Bordbuch entry when `--skip-bordbuch` is not set, and skips the append when `--skip-bordbuch` is true.

**Human review:** no

---

### Step 4. Implement `sichtpass` append in `nachweis.publish`

**Goal:** Append a `sichtpass` Bordbuch entry after manifest regeneration, and pass `--skip-bordbuch` to `manifest.generate`.

**Agent actions:**

- Edit `packages/werkstatt/src/nachweis/nachweis-publish.ts`:
  - In the `executeKernelCommand` call for `nachweis.manifest.generate` (line 186-191), add `--skip-bordbuch` to `argv`: `argv: [\`--system=${systemId}\`, "--skip-bordbuch"]`.
  - After the `executeKernelCommand` call and `logger.info` (line 193), append a `sichtpass` Bordbuch entry:
    - The existing `bordbuch:${systemId}` lock is released in the `finally` block before `executeKernelCommand` is called. Acquire NEW locks for the sichtpass append: `acquireLock` for `system:{systemId}` and `bordbuch:{systemId}` with a fresh `generateOperationId()`.
    - Use `appendAndCommitBordbuch` (already imported on line 38).
    - Call `appendAndCommitBordbuch` with kind `"sichtpass"`, summary `"Sichtpass manifest entry generated for '{slug}'"`, writerRole `"nachweis"`, metadata `{ slug, manifestVersion, recordHash, signaturePresent, timestampPresent, verificationLevel }`.
    - `signaturePresent` and `timestampPresent`: derive from Bordbuch entries — check if `nachweis-signed` and `nachweis-timestamped` entries exist for this slug.
    - `verificationLevel`: use `"N3"` (publish requires N3 per gate).
    - `recordHash`: SHA-256 of the evidence file content or the manifest entry's `sourceSha256`.
    - Release locks in `finally` block.

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run build:check` — confirms TypeScript compiles.
- `pnpm --filter @warpgogol/werkstatt run test` — existing tests pass.

**Completion criterion:** `nachweis.publish` appends a single `sichtpass` Bordbuch entry after manifest regeneration, and `nachweis.manifest.generate` is called with `--skip-bordbuch`.

**Human review:** no

---

### Step 5. Implement `sichtpass` append in `nachweis.withdraw`

**Goal:** Append a `sichtpass` Bordbuch entry with `withdrawn: true` metadata, and pass `--skip-bordbuch` to `manifest.generate`.

**Agent actions:**

- Edit `packages/werkstatt/src/nachweis/nachweis-withdraw.ts`:
  - In the `executeKernelCommand` call for `nachweis.manifest.generate` (line 211-216), add `--skip-bordbuch` to `argv`: `argv: [\`--system=${systemId}\`, "--skip-bordbuch"]`.
  - After the `executeKernelCommand` call and `logger.info` (line 218-220), append a `sichtpass` Bordbuch entry:
    - The existing `bordbuch:${systemId}` lock is released in the `finally` block before `executeKernelCommand` is called. Acquire NEW locks for the sichtpass append: `acquireLock` for `system:{systemId}` and `bordbuch:{systemId}` with a fresh `generateOperationId()`.
    - Use `appendAndCommitBordbuch` (already imported on line 37).
    - Call `appendAndCommitBordbuch` with kind `"sichtpass"`, summary `"Sichtpass manifest entry withdrawn for '{slug}'"`, writerRole `"nachweis"`, metadata `{ slug, manifestVersion, withdrawn: true, verificationLevel }`.
    - `verificationLevel`: read from evidence data or use `"N0"` (withdraw does not change verification level).
    - Release locks in `finally` block.

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run build:check` — confirms TypeScript compiles.
- `pnpm --filter @warpgogol/werkstatt run test` — existing tests pass.

**Completion criterion:** `nachweis.withdraw` appends a single `sichtpass` Bordbuch entry with `withdrawn: true` after manifest regeneration, and `nachweis.manifest.generate` is called with `--skip-bordbuch`.

**Human review:** no

---

### Step 6. Write unit tests for `sichtpass` Bordbuch entries

**Goal:** Add tests verifying that `sichtpass` entries are appended correctly by each command and that `--skip-bordbuch` prevents duplicates.

**Agent actions:**

- Create `packages/werkstatt/src/nachweis/nachweis-sichtpass.test.ts`:
  - Test 1: `nachweis.manifest.generate` appends `sichtpass` entry when `--skip-bordbuch` is not set.
  - Test 2: `nachweis.manifest.generate` does NOT append `sichtpass` entry when `--skip-bordbuch` is true.
  - Test 3: `nachweis.publish` appends exactly one `sichtpass` entry (not two — verify `manifest.generate` was called with `--skip-bordbuch`).
  - Test 4: `nachweis.withdraw` appends exactly one `sichtpass` entry with `withdrawn: true` metadata.
  - Test 5: `bordbuch.validate` accepts `sichtpass` entries without violations.
  - Test 6: `WRITER_ROLE_KINDS.nachweis` includes `"sichtpass"` and `validateWriterRole("nachweis", "sichtpass")` returns `true`.
  - Test 7: `nachweis.manifest.generate` with no published records appends `sichtpass` entry with `recordHash: ""` (empty manifest edge case).
- Use existing test fixtures from `packages/werkstatt/src/tests-handoff/nachweis-commands.test.ts` as reference for setup patterns.

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run test -- nachweis-sichtpass` — new tests pass.
- `pnpm --filter @warpgogol/werkstatt run test` — all tests pass.

**Completion criterion:** All 7 tests pass and cover the acceptance criteria for `sichtpass` append behavior, including the empty manifest edge case.

**Human review:** no

---

### Step 7. Update Compass XML

**Goal:** Sync `docs/requirements.xml` if req-23 mentions Bordbuch event kinds.

**Agent actions:**

- Read `docs/requirements.xml` and find req-23 (Bordbuch).
- If req-23 lists event kinds or mentions the enum, add `sichtpass` to the list.
- If req-23 is generic (does not list individual kinds), no change needed — document this in the final step.

**Validation:**

- `pnpm exec werkstatt run rfc.validate --id RFC-0888` — passes.

**Completion criterion:** `docs/requirements.xml` is updated or documented as not-applicable.

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize all documentation artifacts, run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Verify `docs/requirements.xml` is updated or documented as not-applicable.
- Run `pnpm exec werkstatt run rfc.validate --id RFC-0888` — must pass.
- Run `pnpm --filter @warpgogol/werkstatt run build:check` — must pass.
- Run `pnpm --filter @warpgogol/werkstatt run test` — must pass.
- **Run code review:** invoke `fo-review` via the `skill` tool on all session code changes. Wait for the review report.
- **Run fix if needed:** if `fo-review` reported findings, invoke `fo-fix`. Re-run `fo-review` to confirm. Maximum 3 iterations.
- **Check off acceptance criteria:** verify each criterion in the RFC against the implemented code. Mark `[x]` for verified criteria with inline `(evidence: ...)` annotations.
- **Stamp the RFC as implemented:** run `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0888 --implementation-commit <sha>` to atomically transition `accepted → implemented`.

**Validation:**

- `git status` — no uncommitted changes from the current session.
- `pnpm exec werkstatt run rfc.validate --id RFC-0888` — passes.
- `pnpm --filter @warpgogol/werkstatt run build:check` — passes.
- `pnpm --filter @warpgogol/werkstatt run test` — passes.
- Review report exists in `docs/reviews/code/` for this session.

**Completion criterion:** All documentation artifacts in scope are updated; code review passed; all acceptance criteria checked off; RFC stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp`.

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate --id RFC-0888`
- `pnpm --filter @warpgogol/werkstatt run build:check`
- `pnpm --filter @warpgogol/werkstatt run test`

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0888` in the subject line (RFC-0265 commit hygiene).
- `docs/rfcs/verification/rfc-0888.generated.json` — verification evidence (if acceptance probes declared; RFC-0888 has none, so this is not required).

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Duplicate entries from concurrent `manifest.generate` + `publish` | Step 2-5: `--skip-bordbuch` flag prevents duplicates when `manifest.generate` is called from `publish` or `withdraw` |
| Bordbuch growth acceleration | Acceptable — `sichtpass` entry is ~500 bytes, append-only by design. No mitigation needed. |
| Projection complexity for non-technical visitors | `bordbuch-generate.ts` already renders all kinds; `sichtpass` events appear with their `summary` field which is human-readable. No extra labeling step needed. |
| Agent calls `manifest.generate` standalone then `publish` | Step 3: standalone calls append their own entry; Step 4: `publish` calls with `--skip-bordbuch`. Two entries is harmless (second supersedes first). Documented in RFC failure modes. |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-46, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0888 --reason "..." --invariant "DNA-46"` instead of working around it.
- If `bordbuch.validate` rejects `sichtpass` entries due to an unexpected schema constraint, investigate the schema before adding a workaround — the enum extension should be sufficient.
