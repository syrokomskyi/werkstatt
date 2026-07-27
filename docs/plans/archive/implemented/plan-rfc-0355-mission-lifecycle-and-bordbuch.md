---
rfcId: RFC-0355
planId: PLAN-RFC-0355-01
status: draft
owner: architecture
createdAt: 2026-07-09
updatedAt:
scope:
  apps: []
  packages:
    - "@gogol/ontology"
    - "@gogol/site-kernel-handoff"
    - "@gogol/site-kernel"
  services: []
  docs:
    - docs/architecture-dna.md
    - docs/requirements.xml
    - docs/technology.xml
    - docs/development-plan.xml
    - docs/knowledge-graph.xml
---

# Implementation Plan: RFC-0355

> **Pilot plan.** RFC-0355 has `status: draft` and `enhancedAt: 2026-07-09`. Implementation requires explicit architecture acceptance first. This plan is structured so it can be executed immediately once the RFC transitions to `accepted`.

## 1. Objectives

- [ ] O1 — Define `MissionManifest`, `BordbuchEntry`, and `Bordbuch` Zod schemas in `@gogol/ontology` (acceptance: schemas defined)
- [ ] O2 — Implement `mission.open`, `mission.status`, `mission.list` commands (acceptance: open, status, list registered and tested)
- [ ] O3 — Implement `mission.close`, `mission.abort` commands (acceptance: close, abort registered and tested)
- [ ] O4 — Implement `bordbuch.append`, `bordbuch.validate` commands (acceptance: append, validate registered and tested)
- [ ] O5 — Enforce mission state machine: no concurrent open missions, one-way transitions (acceptance: state machine enforced)
- [ ] O6 — Bordbuch append-only invariant with hash-chain, errata, sensitive-payload guard (acceptance: bordbuch.validate enforces all §3.4 rules)
- [ ] O7 — Registry integration: `currentMission` updates on open/close/abort (acceptance: registry invariants hold)
- [ ] O8 — Add DNA-46 entry to `docs/architecture-dna.md` (acceptance: DNA-46 present)
- [ ] O9 — `rfc.validate` passes on RFC-0355 (acceptance: validation clean)

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/ontology/src/schemas/mission.ts` — **new file**: `MissionStateSchema`, `MissionManifestSchema`, `BordbuchEntryKindSchema`, `BordbuchEntrySchema`, `BordbuchSchema` (Zod)
- `packages/ontology/src/schemas/index.ts` — re-export mission schemas and types
- `packages/os/site-kernel-handoff/src/mission/` — **new directory**:
  - `mission-open.ts` — `runMissionOpen` handler
  - `mission-status.ts` — `runMissionStatus` handler
  - `mission-close.ts` — `runMissionClose` handler
  - `mission-abort.ts` — `runMissionAbort` handler
  - `mission-list.ts` — `runMissionList` handler
  - `mission-io.ts` — shared helpers: read/write `mission.yaml`, derive next sequence number from Bordbuch, validate mission id regex
- `packages/os/site-kernel-handoff/src/bordbuch/` — **new directory**:
  - `bordbuch-append.ts` — `runBordbuchAppend` handler
  - `bordbuch-validate.ts` — `runBordbuchValidate` handler
  - `bordbuch-io.ts` — shared helpers: read NDJSON, compute hash-chain, sensitive-payload guard, writer-role validation
- `packages/os/site-kernel-handoff/src/index.ts` — add `createMissionModule()` factory, export new types and handlers
- `packages/os/site-kernel-handoff/src/tests/` — new test files:
  - `mission-open.test.ts`
  - `mission-close.test.ts`
  - `mission-abort.test.ts`
  - `mission-list.test.ts`
  - `bordbuch-append.test.ts`
  - `bordbuch-validate.test.ts`
- `tools/kernel.config.ts` — import and register `createMissionModule()` in `modules[]`
- `packages/os/site-kernel/src/registry.ts` — no changes needed (commands registered via module factory)

### 2.2 Configuration and data

- `systems/registry.yaml` — `currentMission` field updated by `mission.open` (set to mission id), `mission.close`/`mission.abort` (set to null). Schema already defined in RFC-0354's `FleetRegistryEntrySchema`.
- `missions/<system-id>-m<NNNNNN>/mission.yaml` — new ephemeral file (gitignored)
- `systems/<id>/bordbuch/events.ndjson` — new NDJSON hash-chain ledger (inside Sternsystem cache clone, committed to Sternsystem's repo)
- `.gitignore` (root) — `missions/` entry already added by RFC-0354 rollout

### 2.3 Documentation and specs

- `docs/rfcs/rfc-0355-mission-lifecycle-and-bordbuch.md` — read-only reference (not modified by this plan)
- `docs/architecture-dna.md` — DNA-46 already present (added by RFC-0354 rollout); verify it matches the enhanced RFC text
- `docs/requirements.xml` — add mission lifecycle requirements if the Werkstatt section exists
- `docs/technology.xml` — add mission/bordbuch command surface entries if the Werkstatt section exists
- `docs/development-plan.xml` — add mission lifecycle implementation milestone if the Werkstatt section exists
- `docs/knowledge-graph.xml` — add mission/bordbuch entity relationships if the Werkstatt section exists
- `packages/os/site-kernel-handoff/AGENTS.md` — add mission and bordbuch module rules
- Root `AGENTS.md` — add "Mission lifecycle" section if not already present (check first)

### 2.4 Validation and pipelines

- `pnpm exec site-kernel run rfc.validate RFC-0355 --json` — RFC validation
- `pnpm --filter @gogol/site-kernel-handoff run test` — unit tests for all handlers
- `pnpm --filter @gogol/site-kernel-handoff run build:check` — TypeScript compilation
- `pnpm --filter @gogol/ontology run build:check` — schema compilation
- No pipeline placement needed — mission/bordbuch commands are workspace-scoped, not part of `build.check` or `apps-check` pipelines

## 3. Step sequence

### Step 1. Define Zod schemas in `@gogol/ontology`

**Goal:** Create the type contracts that all handlers depend on.

**Agent actions:**

- Create `packages/ontology/src/schemas/mission.ts` with `MissionStateSchema`, `MissionManifestSchema`, `BordbuchEntryKindSchema`, `BordbuchEntrySchema` matching RFC-0355 §1.3 and §3.2 exactly
- Add `BordbuchSchema` as `z.array(BordbuchEntrySchema)` for convenience
- Re-export from `packages/ontology/src/schemas/index.ts`
- Run `pnpm --filter @gogol/ontology run build:check` to verify compilation

**Validation:**

- `pnpm --filter @gogol/ontology run build:check` passes
- Schemas match RFC-0355 TypeScript contracts (§Design → TypeScript contracts)

**Completion criterion:** `MissionManifestSchema`, `BordbuchEntrySchema`, and `BordbuchEntryKindSchema` are exported from `@gogol/ontology/schemas` and compile without errors

**Human review:** no

---

### Step 2. Implement Bordbuch IO and hash-chain helpers

**Goal:** Create the shared primitives for reading/writing the Bordbuch NDJSON ledger.

**Agent actions:**

- Create `packages/os/site-kernel-handoff/src/bordbuch/bordbuch-io.ts`:
  - `readBordbuch(systemDir: string): Promise<BordbuchEntry[]>` — stream-parse `events.ndjson`, one JSON object per line
  - `computeEntryHash(entry: Omit<BordbuchEntry, "hash">): string` — reuse `sha256OfBytes` from `../bundle-io.ts`; sha256 over stable serialized payload excluding `hash`
  - `deriveNextEventId(entries: BordbuchEntry[]): string` — `event-<NNNNNN>` with zero-padded sequence
  - `validateWriterRole(kind: BordbuchEntryKind, role: string): boolean` — check kind against §3.3 writer-role allowlist
  - `detectSensitivePayload(entry: BordbuchEntry): string | null` — reject secret-like strings, emails, phone numbers, raw tokens
  - `appendEntry(systemDir: string, entry: BordbuchEntry): Promise<void>` — append one line to `events.ndjson` (atomic write via staging + rename)
- Create `packages/os/site-kernel-handoff/src/mission/lock.ts`:
  - Minimal file-based locking abstraction (lockfile with PID + heartbeat) for use until RFC-0362 shared primitives are available
  - `acquireLock(scope: string, timeoutSeconds?: number): Promise<LockHandle>` — create `.werkstatt/locks/<scope>.lock` with PID, startedAt, heartbeatAt
  - `releaseLock(handle: LockHandle): Promise<void>` — remove lockfile
  - `withLock<T>(scope: string, fn: () => Promise<T>): Promise<T>` — acquire, execute, release
  - When RFC-0362 lands, replace this with the shared `werkstatt.lock` primitives
- Add `yaml` to `@gogol/site-kernel-handoff` dependencies in `package.json` (for reading/writing `mission.yaml`)

**Validation:**

- `pnpm --filter @gogol/site-kernel-handoff run build:check` passes
- Hash-chain computation verified against a known fixture

**Completion criterion:** `bordbuch-io.ts` exports all helpers, compiles, hash computation matches a hand-verified test vector, and `lock.ts` provides working file-based locking

**Human review:** no

---

### Step 3. Implement `bordbuch.append` command

**Goal:** Low-level append primitive with writer-role validation and sensitive-payload guard.

**Agent actions:**

- Create `packages/os/site-kernel-handoff/src/bordbuch/bordbuch-append.ts`:
  - Parse `--system`, `--kind`, `--summary`, `--mission`, `--release`, `--actor`, `--writer-role`, `--metadata` from CLI args
  - Validate `kind` against `writer-role` allowlist (§3.3)
  - Read current Bordbuch, derive next event id and `previousHash`
  - Compute `hash` over stable payload
  - Run sensitive-payload guard
  - If `--mission` references a terminal mission and `kind` is mission-lifecycle, fail
  - Append entry via atomic write (RFC-0362)
  - Return `{ command, status, data: { eventId }, summary }` envelope
- Create `packages/os/site-kernel-handoff/src/tests/bordbuch-append.test.ts`:
  - Test: append `operator-note` succeeds
  - Test: append `mission-open` with `writer-role: operator` fails (role mismatch)
  - Test: append with sensitive payload fails
  - Test: append `mission-close` referencing an aborted mission fails

**Validation:**

- `pnpm --filter @gogol/site-kernel-handoff run test -- bordbuch-append` passes

**Completion criterion:** `bordbuch.append` handler passes all 4 test cases and produces valid hash-chained entries

**Human review:** no

---

### Step 4. Implement `bordbuch.validate` command

**Goal:** Validate the full Bordbuch invariant set from §3.4.

**Agent actions:**

- Create `packages/os/site-kernel-handoff/src/bordbuch/bordbuch-validate.ts`:
  - Read all entries from `systems/<id>/bordbuch/events.ndjson`
  - Check: event ids monotonic with no gaps
  - Check: `occurredAt` non-decreasing
  - Check: `previousHash` chain integrity
  - Check: `hash` matches stable payload
  - Check: every `mission-open` has matching `mission-close` or `mission-abort`
  - Check: no orphan `mission-close`/`mission-abort`
  - Check: no duplicate `missionId` in `mission-open` entries
  - Check: sensitive-payload guard on all entries
  - Check: `erratum` entries reference valid prior event ids
  - Return `{ command, status, data: { systemId, events, violations }, summary }` envelope
- Create `packages/os/site-kernel-handoff/src/tests/bordbuch-validate.test.ts`:
  - Test: valid 5-entry Bordbuch passes
  - Test: hash-chain gap fails
  - Test: orphan close fails
  - Test: duplicate mission-open fails
  - Test: empty Bordbuch passes (0 events, 0 violations)

**Validation:**

- `pnpm --filter @gogol/site-kernel-handoff run test -- bordbuch-validate` passes

**Completion criterion:** `bordbuch.validate` enforces all 9 rules from §3.4 and passes all 5 test cases

**Human review:** no

---

### Step 5. Implement mission IO helpers

**Goal:** Shared primitives for mission manifest reading/writing and sequence derivation.

**Agent actions:**

- Create `packages/os/site-kernel-handoff/src/mission/mission-io.ts`:
  - `readMissionManifest(missionDir: string): Promise<MissionManifest>` — read and parse `mission.yaml`
  - `writeMissionManifest(missionDir: string, manifest: MissionManifest): Promise<void>` — atomic write (RFC-0362)
  - `deriveNextMissionId(systemId: string, bordbuch: BordbuchEntry[]): string` — scan `mission-open` entries for `<systemId>-m<NNNNNN>`, return highest + 1
  - `validateMissionId(id: string): boolean` — regex `^[a-z0-9]+(-[a-z0-9]+)*-m\d{6}$`
  - `createMissionDirectory(missionDir: string): Promise<void>` — create `missions/<id>/` with `workpiece/`, `evidence/`, `distribution/` subdirectories
- All tests use temp directories (`os.tmpdir()` + unique subdirectory per test) with real filesystem operations — no mocking. Cleanup in `afterEach`.

**Validation:**

- `pnpm --filter @gogol/site-kernel-handoff run build:check` passes

**Completion criterion:** All helpers exported and compile; `deriveNextMissionId` correctly returns `m000001` for empty Bordbuch and `m000003` for a Bordbuch with two prior `mission-open` entries

**Human review:** no

---

### Step 6. Implement `mission.open` command

**Goal:** Open a new mission with lifecycle enforcement and Bordbuch recording.

**Agent actions:**

- Create `packages/os/site-kernel-handoff/src/mission/mission-open.ts`:
  - Parse `--system`, `--brief`, `--actor` from CLI args
  - Read `systems/registry.yaml`, validate system exists and has status `active` or `registered`
  - Check `currentMission` is null (no concurrent open mission)
  - Validate pin file exists at `systems/<id>/system.pin.json`
  - Acquire `registry` and `system:<id>` locks (RFC-0362)
  - Read Bordbuch, derive next mission id
  - Create mission directory with subdirectories
  - Write `mission.yaml` (state: `open`, `openedAt`, `openedBy`, `pinAtOpen` from pin file)
  - Append `mission-open` entry to Bordbuch via shared helper
  - Update `systems/registry.yaml` `currentMission` to new mission id
  - Return `{ command, status, data: { missionId, systemId, state, brief, openedAt, pinAtOpen }, summary }` envelope
- Create `packages/os/site-kernel-handoff/src/tests/mission-open.test.ts`:
  - Test: open on registered system with pin succeeds
  - Test: open on paused system fails
  - Test: open when mission already open fails
  - Test: open without pin file fails
  - Test: mission id format is `<system-id>-m<NNNNNN>`

**Validation:**

- `pnpm --filter @gogol/site-kernel-handoff run test -- mission-open` passes

**Completion criterion:** `mission.open` passes all 5 test cases, creates valid mission directory, appends Bordbuch entry, and updates registry

**Human review:** no

---

### Step 7. Implement `mission.close` command

**Goal:** Close an open mission with validation/reconciliation preconditions.

**Agent actions:**

- Create `packages/os/site-kernel-handoff/src/mission/mission-close.ts`:
  - Parse `--mission`, `--actor`, `--release` from CLI args
  - Read mission manifest, validate state is `open`
  - If both `materializedAt` and `reconciledAt` are null, the mission made no Werkstück changes — close succeeds (allows RFC-0355 to ship independently of RFC-0356)
  - If `materializedAt` is non-null but `reconciledAt` is null, fail with "mission has not been reconciled — run mission.reconcile first"
  - Update `mission.yaml` state to `closed`, set `closedAt` and `closedBy`
  - Append `mission-close` entry to Bordbuch
  - Update `systems/registry.yaml` `currentMission` to null
  - If `--release` provided, set `releaseId` in manifest
  - Return `{ command, status, data: { missionId, state, closedAt }, summary }` envelope
- Create `packages/os/site-kernel-handoff/src/tests/mission-close.test.ts`:
  - Test: close open mission with both materializedAt and reconciledAt null succeeds (no Werkstück changes)
  - Test: close open mission with materializedAt set and reconciledAt set succeeds
  - Test: close open mission with materializedAt set but reconciledAt null fails
  - Test: close already-closed mission fails
  - Test: close aborted mission fails

**Validation:**

- `pnpm --filter @gogol/site-kernel-handoff run test -- mission-close` passes

**Completion criterion:** `mission.close` passes all 5 test cases, appends Bordbuch entry, and clears `currentMission`

**Human review:** no

---

### Step 8. Implement `mission.abort` command

**Goal:** Abort an open mission with clean rollback and crash recovery.

**Agent actions:**

- Create `packages/os/site-kernel-handoff/src/mission/mission-abort.ts`:
  - Parse `--mission`, `--reason`, `--actor` from CLI args
  - Read mission manifest, validate state is `open`
  - Discard `workpiece/` and `distribution/` directories (use staging + rename for crash safety per RFC-0362)
  - If deletion is interrupted, do NOT transition state to `aborted` — leave mission `open` with `.incomplete` artifact for `werkstatt.lock.recover`
  - Update `mission.yaml` state to `aborted`, set `closedAt` and `closedBy`
  - Append `mission-abort` entry to Bordbuch with reason in metadata
  - Update `systems/registry.yaml` `currentMission` to null
  - Return `{ command, status, data: { missionId, state, closedAt }, summary }` envelope
- Create `packages/os/site-kernel-handoff/src/tests/mission-abort.test.ts`:
  - Test: abort open mission succeeds, directories removed
  - Test: abort already-aborted mission fails
  - Test: abort closed mission fails
  - Test: abort clears `currentMission` in registry

**Validation:**

- `pnpm --filter @gogol/site-kernel-handoff run test -- mission-abort` passes

**Completion criterion:** `mission.abort` passes all 4 test cases, removes directories, appends Bordbuch entry, and clears `currentMission`

**Human review:** no

---

### Step 9. Implement `mission.status` and `mission.list` commands

**Goal:** Read-only commands for inspecting mission state.

**Agent actions:**

- Create `packages/os/site-kernel-handoff/src/mission/mission-status.ts`:
  - Parse `--mission` from CLI args
  - Read mission manifest
  - Read Bordbuch entries filtered by `missionId`
  - Return `{ command, status, data: { manifest, bordbuchEntries }, summary }` envelope
- Create `packages/os/site-kernel-handoff/src/mission/mission-list.ts`:
  - Parse optional `--system` from CLI args
  - Scan `missions/` directory for mission directories
  - Read each `mission.yaml`, collect summary records
  - Filter by system if `--system` provided
  - When no missions exist, return empty list with `summary: "[mission.list] 0 missions found"`
  - Return `{ command, status, data: { missions: [...] }, summary }` envelope
- Create `packages/os/site-kernel-handoff/src/tests/mission-list.test.ts`:
  - Test: list with no missions returns empty list
  - Test: list with two missions returns both
  - Test: list filtered by system returns only matching missions

**Validation:**

- `pnpm --filter @gogol/site-kernel-handoff run test -- mission-status mission-list` passes

**Completion criterion:** Both commands pass all test cases; empty-state behavior verified

**Human review:** no

---

### Step 10. Register commands in kernel module

**Goal:** Wire all seven commands into the kernel module factory.

**Agent actions:**

- Add `createMissionModule()` factory to `packages/os/site-kernel-handoff/src/index.ts`:
  - Register `mission.open`, `mission.status`, `mission.close`, `mission.abort`, `mission.list`, `bordbuch.append`, `bordbuch.validate`
  - All commands are `scope: "workspace"`, `supportsAllApps: false`
  - `mission.open`, `mission.close`, `mission.abort`, `bordbuch.append` have `mutatesState: true`
  - `mission.status`, `mission.list`, `bordbuch.validate` are read-only
- Import and add `createMissionModule()` to `modules[]` in `tools/kernel.config.ts`
- Update `MODULE_MAP` and `CHANGE_SUMMARY` in `tools/kernel.config.ts`

**Validation:**

- `pnpm --filter @gogol/site-kernel-handoff run build:check` passes
- `pnpm exec site-kernel run --help` lists all seven new commands

**Completion criterion:** All seven commands appear in the kernel command list and are invocable

**Human review:** no

---

### Step 11. Update documentation

**Goal:** Sync Compass XML and AGENTS.md with the new command surface.

**Agent actions:**

- Verify `docs/architecture-dna.md` DNA-46 entry matches the enhanced RFC text (it was added by RFC-0354 rollout — update if the enhanced text differs)
- Check `docs/requirements.xml`, `docs/technology.xml`, `docs/development-plan.xml`, `docs/knowledge-graph.xml` for Werkstatt/mission sections — add entries if the section exists, skip if not yet created
- Update `packages/os/site-kernel-handoff/AGENTS.md` with mission and bordbuch module rules:
  - Mission IDs MUST be kebab-case, lowercase, latin-only
  - Single-open-mission constraint is a hard invariant
  - Bordbuch is append-only; corrections use `erratum` entries
  - All mutations use RFC-0362 locks and idempotency records
  - `bordbuch.append` requires `--writer-role` and validates kind against role
- Check root `AGENTS.md` for a "Mission lifecycle" section — add if absent

**Validation:**

- `pnpm exec site-kernel run rfc.validate RFC-0355 --json` passes
- Documentation files are consistent with code

**Completion criterion:** DNA-46 verified, AGENTS.md updated, Compass XML updated where applicable

**Human review:** yes — Compass XML changes should be reviewed for consistency with the existing semantic layer

---

### Step 12. Run full validation suite

**Goal:** Verify no regressions and all acceptance criteria are met.

**Agent actions:**

- Run `pnpm --filter @gogol/ontology run build:check`
- Run `pnpm --filter @gogol/site-kernel-handoff run build:check`
- Run `pnpm --filter @gogol/site-kernel-handoff run test`
- Run `pnpm exec site-kernel run rfc.validate RFC-0355 --json`
- Verify all acceptance criteria checkboxes can be checked

**Validation:**

- All commands pass
- `rfc.validate` is clean

**Completion criterion:** All validation commands exit 0; every acceptance criterion in RFC-0355 is verifiable

**Human review:** no

---

### Step 13. Emit verification evidence and commit

**Goal:** Produce the RFC-0330 verification evidence artifact.

**Agent actions:**

- Run `pnpm exec site-kernel run rfc.verification.emit --id RFC-0355` (if the command is available — RFC-0330 is still draft)
- If `rfc.verification.emit` is not yet implemented, document the verification results in the commit message
- Commit all changes with reference to RFC-0355 in the subject

**Validation:**

- Evidence file committed (or verification documented in commit)

**Completion criterion:** All changes committed; commit subject references RFC-0355

**Human review:** no

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec site-kernel run rfc.validate RFC-0355 --json`
- `pnpm --filter @gogol/ontology run build:check`
- `pnpm --filter @gogol/site-kernel-handoff run build:check`
- `pnpm --filter @gogol/site-kernel-handoff run test`
- `pnpm exec site-kernel run rfc.verification.emit --id RFC-0355` (RFC-0330, if implemented)

### 4.2 Evidence artifacts

- `docs/rfcs/verification/rfc-0355.generated.json` — verification evidence (RFC-0330, if implemented)
- Commit messages referencing `RFC-0355` in the subject line (RFC-0265 commit hygiene)

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Mission Werkstück left open and forgotten | Step 6: `mission.open` sets `currentMission` in registry; `mission.list` (Step 9) shows open missions |
| Bordbuch grows large over time | NonGoal — append-only NDJSON is stream-parseable; archival is a future RFC |
| Agent forgets to close or abort a mission | Step 6: single-open-mission constraint enforced in `mission.open` — cannot open new mission until previous is resolved |
| Bordbuch append-only invariant violated by direct file edit | Step 4: `bordbuch.validate` catches all violations; Bordbuch lives in Sternsystem's repo so edits are visible in git diff |
| Mission sequence number collision after manual Bordbuch edit | Step 5: `deriveNextMissionId` reads from Bordbuch; Step 4: `bordbuch.validate` catches inconsistent state |
| Crash during `mission.abort` leaves partial state | Step 8: atomic staging per RFC-0362 — mission stays `open` with `.incomplete` artifact if deletion is interrupted |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-46 (mission lifecycle), run `pnpm exec site-kernel run rfc.supersede.propose --id RFC-0355 --reason "..." --invariant "DNA-46"` instead of working around it (RFC-0334).
- If the `mission.close` reconciliation precondition cannot be verified without RFC-0356's `mission.reconcile` command, implement a stub check that reads `reconciledAt` from the manifest and document the dependency — do NOT relax the precondition.
- If RFC-0362 lock/idempotency primitives are not yet implemented, use the minimal local locking abstraction from Step 2 (`lock.ts`). When RFC-0362 lands, replace `lock.ts` with the shared `werkstatt.lock` primitives — do NOT ship without any locking.
