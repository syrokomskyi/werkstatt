---
rfcId: RFC-0561
planId: PLAN-RFC-0561-01
status: draft
owner: architecture
createdAt: 2026-07-27
updatedAt:
scope:
  apps: []
  packages:
    - packages/ontology
    - packages/os/site-kernel-handoff
    - packages/studio-gate
  services: []
  docs:
    - docs/rfcs/rfc-0561-site-ownership-in-sternsystem-registry-vc-linked-owner-field-for-fleet-entries.md
    - packages/ontology/AGENTS.md
---

# Implementation Plan: RFC-0561

## 1. Objectives

- [ ] Objective 1 — Add optional `owner` field with `did:web` format validation to `fleetRegistryEntrySchema` (maps to acceptance criterion: schema has optional `owner` field validated against `did:web:<domain>#<key-version>` format)
- [ ] Objective 2 — Add `--owner` flag to `sternsystem.register` command for new registrations and `--amend` backfill (maps to acceptance criterion: `sternsystem.register` accepts `--owner` flag)
- [ ] Objective 3 — Add notice-level warning to `sternsystem.validate` for entries without `owner` and fail for malformed `owner` (maps to acceptance criteria: validate passes with/without owner, warns for missing, fails for malformed)
- [ ] Objective 4 — Add `verifyOwnership` function to `packages/studio-gate/src/auth.ts` (maps to acceptance criterion: Studio Gate `verifyOwnership` function reads registry `owner` field)
- [ ] Objective 5 — Existing `systems/registry.yaml` entries without `owner` remain valid (maps to acceptance criterion: existing entries without `owner` remain valid)

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/ontology/src/operations/sternsystem.ts` — `fleetRegistryEntrySchema` gains `owner` field with `did:web` regex validation
- `packages/os/site-kernel-handoff/src/sternsystem/sternsystem-register.ts` — `runSternsystemRegister` reads `--owner` flag, writes it to registry entry on new registration, updates it on `--amend`
- `packages/os/site-kernel-handoff/src/sternsystem/sternsystem.module.ts` — `sternsystem.register` flag registration gains `owner` flag declaration
- `packages/os/site-kernel-handoff/src/sternsystem/sternsystem-validate.ts` — `runSternsystemValidate` adds owner-format check (fail) and missing-owner warning (notice)
- `packages/os/site-kernel-handoff/src/sternsystem/index.ts` — static import version of flag registration (kept in sync with `sternsystem.module.ts`)
- `packages/studio-gate/src/auth.ts` — new `verifyOwnership` function (Note: this file does not exist yet — it will be created by RFC-0559. This plan adds the `verifyOwnership` function only if `auth.ts` already exists; otherwise, this step is deferred to RFC-0559 implementation and this plan documents the contract only.)

### 2.2 Configuration and data

- `systems/registry.yaml` — existing entries unchanged (no `owner` field). New entries may include `owner`.

### 2.3 Documentation and specs

- `docs/rfcs/rfc-0561-site-ownership-in-sternsystem-registry-vc-linked-owner-field-for-fleet-entries.md` — read-only reference (accepted status)
- `packages/ontology/AGENTS.md` — update operations table to note `owner` field in `fleetRegistryEntrySchema`

### 2.4 Validation and pipelines

- `pnpm exec werkstatt run sternsystem.validate --json` — must pass with existing registry (no `owner` fields)
- `pnpm --filter @warpgogol/ontology build:check` — typecheck ontology schema changes
- `pnpm --filter @warpgogol/site-kernel-handoff build:check` — typecheck command changes
- `pnpm --filter @warpgogol/ontology test` — run existing ontology tests
- `pnpm --filter @warpgogol/site-kernel-handoff test` — run existing handoff tests

## 3. Step sequence

### Step 1. Add `owner` field to `fleetRegistryEntrySchema`

**Goal:** Extend the Zod schema with an optional `owner` field validated against the `did:web:<domain>#<key-version>` format.

**Agent actions:**

- In `packages/ontology/src/operations/sternsystem.ts`, add a `didWebRe` regex constant: `/^did:web:[a-z0-9.-]+#.+$/`
- Add `owner: z.string().regex(didWebRe, "owner must be a did:web identifier (did:web:<domain>#<key-version>)").optional()` to `fleetRegistryEntrySchema`
- Update the `MODULE_CONTRACT` `<purpose>` to mention the optional `owner` field (VC subject id from RFC-0558)
- Add a `CHANGE_SUMMARY` item: `RFC-0561: add optional owner field (did:web VC subject id) to fleetRegistryEntrySchema`

**Validation:**

- `pnpm --filter @warpgogol/ontology build:check` passes
- `pnpm --filter @warpgogol/ontology test` passes

**Completion criterion:** `fleetRegistryEntrySchema` includes `owner` field with `did:web` regex validation; typecheck passes; existing tests pass.

**Human review:** no

---

### Step 2. Add `--owner` flag to `sternsystem.register` command

**Goal:** Accept `--owner` flag on new registrations and `--amend` backfill.

**Agent actions:**

- In `packages/os/site-kernel-handoff/src/sternsystem/sternsystem-register.ts`:
  - Add `const owner = flagString(input, "owner");` to flag extraction
  - In the new-registration path (after `const entry = { ... }`), add `owner: owner ?? undefined,` to the entry object
  - In the `--amend` path, after reading the registry and finding the entry, if `owner` is provided, update `entry.owner = owner` and call `writeRegistry(workspaceRoot, registry)` before proceeding with pin/mission
- In `packages/os/site-kernel-handoff/src/sternsystem/sternsystem.module.ts`, add to `sternsystem.register` flags:
  ```ts
  owner: { kind: "string", description: "VC subject id (did:web:<domain>#<key-version>) for site owner (RFC-0561)." },
  ```
- In `packages/os/site-kernel-handoff/src/sternsystem/index.ts`, add the same `owner` flag to the static-import version of the command registration (keep in sync)
- Update `CHANGE_SUMMARY` in `sternsystem-register.ts`: `RFC-0561: add --owner flag for VC subject id on registration and amend backfill`
- Update command description strings to include `--owner` flag

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff build:check` passes
- `pnpm --filter @warpgogol/site-kernel-handoff test` passes

**Completion criterion:** `sternsystem.register --owner did:web:example.com#operator-v1 --id test --cosmicStar Vega --repo ./test` writes `owner` to registry entry; `sternsystem.register --amend --id existing --owner did:web:example.com#v2` updates `owner` on existing entry; typecheck passes.

**Human review:** no

---

### Step 3. Add owner validation and warning to `sternsystem.validate`

**Goal:** `sternsystem.validate` fails for malformed `owner` and warns for missing `owner`.

**Agent actions:**

- In `packages/os/site-kernel-handoff/src/sternsystem/sternsystem-validate.ts`:
  - The Zod schema parse in `readRegistry` (via `fleetRegistrySchema.parse`) already enforces the `did:web` format — a malformed `owner` will cause a parse failure. However, to produce a structured violation (not a crash), wrap the `readRegistry` call in a try/catch that extracts Zod issues and converts them to `violations` entries with `rule: "owner-format-invalid"` for owner-specific errors.
  - Alternatively, after `readRegistry` succeeds, iterate entries and check `entry.owner` — if present but not matching `didWebRe`, push a violation with `rule: "owner-format-invalid"`. This is more explicit and produces better error messages than relying on Zod parse failure.
  - For entries without `owner`, add a notice-level warning. Since `sternsystem.validate` currently only has `violations` (no warnings array), add a `warnings` array to `SternsystemValidateData` and push `{ systemId, field: "owner", message: "owner field not set; Studio Gate cannot verify ownership for this site" }` for entries without `owner`.
  - Update the output to include `withOwner` and `withoutOwner` counts in the data object (matching the RFC output format).
  - Update `SternsystemValidateData` interface to include `warnings` and owner counts.
  - Log warnings via `logger.warn()` (not `logger.error()`).
- Update `CHANGE_SUMMARY`: `RFC-0561: add owner-format-invalid check and missing-owner notice warning`

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff build:check` passes
- `pnpm exec werkstatt run sternsystem.validate --json` passes (existing registry has no `owner` fields, produces warnings)
- Verify output includes `warnings` array with one entry per existing Sternsystem

**Completion criterion:** `sternsystem.validate` passes with existing registry (no `owner`), produces notice-level warnings for entries without `owner`, and would fail for entries with malformed `owner` format; typecheck passes.

**Human review:** no

---

### Step 4. Add `verifyOwnership` function to Studio Gate (conditional)

**Goal:** Add the `verifyOwnership` function to `packages/studio-gate/src/auth.ts` if the file exists (created by RFC-0559). If RFC-0559 has not been implemented yet, skip this step and document the contract in the RFC for future implementation.

**Agent actions:**

- Check if `packages/studio-gate/src/auth.ts` exists
- If it exists: add `verifyOwnership` function that reads the registry entry for `siteId` and checks `entry.owner === credentialSubjectId`. If `entry.owner` is absent, return `true` (permissive) or `false` (enforced) based on `authMode` from `werkstatt.identity.json`.
- If it does NOT exist: skip this step. The `verifyOwnership` function will be added when RFC-0559 is implemented. Document in the RFC's acceptance criteria that this criterion is deferred to RFC-0559 implementation.

**Validation:**

- `pnpm --filter @warpgogol/studio-gate build:check` passes (if file exists)

**Completion criterion:** `verifyOwnership` function exists in `packages/studio-gate/src/auth.ts` (if file exists) OR acceptance criterion is documented as deferred to RFC-0559.

**Human review:** no

---

### Step 5. Add unit tests for owner field validation

**Goal:** Test the schema validation and validate command behavior for the `owner` field.

**Agent actions:**

- Create `packages/ontology/src/operations/sternsystem.test.ts` (or add to existing test file if one exists) with tests:
  - `fleetRegistryEntrySchema.parse()` accepts entry without `owner` (backwards compatible)
  - `fleetRegistryEntrySchema.parse()` accepts entry with valid `did:web:example.com#v1` owner
  - `fleetRegistryEntrySchema.parse()` rejects entry with `owner: "not-a-did"` (format invalid)
  - `fleetRegistryEntrySchema.parse()` rejects entry with `owner: ""` (empty string)
- If there are existing `sternsystem.validate` integration tests, add cases:
  - Registry with `owner` field present and valid → no violations, no warnings for that entry
  - Registry without `owner` field → warning for that entry
  - Registry with malformed `owner` → violation with `owner-format-invalid` rule

**Validation:**

- `pnpm --filter @warpgogol/ontology test` passes
- `pnpm --filter @warpgogol/site-kernel-handoff test` passes (if validate tests added)

**Completion criterion:** Tests pass and cover all three cases: valid owner, missing owner, malformed owner.

**Human review:** no

---

### Step 6. Update documentation

**Goal:** Sync AGENTS.md and verify Compass XML needs no changes.

**Agent actions:**

- Update `packages/ontology/AGENTS.md` operations table entry for `sternsystem.ts` to note the optional `owner` field (VC subject id, `did:web` format, RFC-0561)
- Check `docs/ecosystem.generated.yaml` — if `sternsystem.register` flag surface changed, run `pnpm exec werkstatt run ecosystem.manifest.generate` to regenerate it
- No `docs/*.xml` Compass files need updates — this RFC does not change repository-wide requirements, technology, or verification plans. It adds a field to an existing schema.
- No `docs/architecture-dna.md` update needed — DNA-45 already covers the fleet registry; this RFC extends it via amendment, not a new invariant.

**Validation:**

- `git diff packages/ontology/AGENTS.md` shows the update
- `pnpm exec werkstatt run ecosystem.manifest.validate` passes (if manifest was regenerated)

**Completion criterion:** `packages/ontology/AGENTS.md` documents the `owner` field; ecosystem manifest is in sync if regenerated.

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize all documentation artifacts, run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Verify every file listed in `scope.docs` is updated — check each path against `git diff`; if a scope doc was not modified, document why.
- Run `pnpm exec werkstatt run ecosystem.manifest.generate` if command surfaces or pipeline topology changed (the `--owner` flag was added to `sternsystem.register`).
- **Run code review:** invoke `fo-review` via the `skill` tool on all session code changes (`git diff <merge-base-of-session>...HEAD`). Wait for the review report in `docs/reviews/code/`.
- **Run fix if needed:** if `fo-review` reported findings, invoke `fo-fix` via the `skill` tool. Re-run `fo-review` to confirm all findings are resolved. Maximum 3 iterations.
- **Check off acceptance criteria:** verify each criterion in the RFC against the implemented code. Mark `[x]` for verified criteria with inline `(evidence: <file:line>, <test-or-command>)` annotations. For unchecked `[ ]` criteria, document why.
- **Stamp the RFC as implemented:** run `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0561 --implementation-commit <sha>` to atomically transition `accepted → implemented` (RFC-0476). Run `--dry-run` first, then without `--dry-run`.

**Validation:**

- `git status` — no uncommitted changes from the current session.
- `pnpm exec werkstatt run rfc.validate --id RFC-0561`
- Every file in `scope.docs` is either updated or documented as not-applicable.
- Review report exists in `docs/reviews/code/` for this session.

**Completion criterion:** All documentation artifacts in scope are updated; code review passed (findings fixed if any); all acceptance criteria are checked off with inline `(evidence: ...)` annotations; RFC is stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476), which validates all preconditions atomically. Code review is automated via `fo-review`.

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate --id RFC-0561`
- `pnpm --filter @warpgogol/ontology build:check`
- `pnpm --filter @warpgogol/ontology test`
- `pnpm --filter @warpgogol/site-kernel-handoff build:check`
- `pnpm --filter @warpgogol/site-kernel-handoff test`
- `pnpm exec werkstatt run sternsystem.validate --json` (existing registry must pass with warnings)
- `pnpm --filter @warpgogol/studio-gate build:check` (if Step 4 was executed)

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0561` in the subject line (RFC-0265 commit hygiene)
- Review report in `docs/reviews/code/` for this session

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Owner field not backfilled — operators forget | Step 3 adds notice-level warnings to `sternsystem.validate` making the gap visible |
| Owner mismatch between registry and VC after key rotation | Step 2 `--amend --owner` path allows updating the field; documented in RFC risks |
| No transfer mechanism | Out of scope (nonGoals); pilot accepts manual update via `--amend` |
| Agent confusion about VC subject id vs registry owner | Step 6 AGENTS.md update documents the relationship; Studio Gate handles automatically |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-45, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0561 --reason "..." --invariant "DNA-45"` instead of working around it.
- If the `did:web` format regex rejects valid identifiers from RFC-0558 that don't match the expected pattern, escalate to RFC-0558 to align the format definition before adjusting the regex.
