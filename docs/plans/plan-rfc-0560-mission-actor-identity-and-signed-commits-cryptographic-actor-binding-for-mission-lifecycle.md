---
rfcId: RFC-0560
planId: PLAN-RFC-0560-01
status: draft
owner: architecture
createdAt: 2026-07-27
updatedAt:
scope:
  apps: []
  packages:
    - packages/os/site-kernel-handoff
  services: []
  docs:
    - packages/os/site-kernel-handoff/AGENTS.md
---

# Implementation Plan: RFC-0560

## 1. Objectives

- [ ] O1 — Actor identity type and env-var resolution — maps to acceptance criterion "ActorIdentity type and resolveActorFromEnv function defined"
- [ ] O2 — Signed commit helper — maps to acceptance criterion "createSignedCommit function defined"
- [ ] O3 — mission.open actor-from-auth flag — maps to acceptance criterion "mission.open accepts --actor-from-auth flag"
- [ ] O4 — mission.git.commit Ed25519 signing — maps to acceptance criteria "mission.git.commit signs commits" and "produces unsigned commit when key not set" and "handles no-changes case"
- [ ] O5 — mission.reconcile, mission.close, mission.abort actor resolution — maps to acceptance criterion "mission.reconcile and mission.close use the same actor resolution logic"
- [ ] O6 — Bordbuch and mission.yaml actor field — maps to acceptance criteria "mission.yaml actor field stores VC subject id" and "Bordbuch entries record VC subject id"
- [ ] O7 — Backwards compatibility — maps to acceptance criterion "Existing missions with actor: 'agent' remain valid"
- [ ] O8 — Documentation sync — maps to acceptance criterion "AGENTS.md updated with --actor-from-auth flag and env-var propagation contract"

## 2. Affected artifacts

### 2.1 Code and commands

**New files:**

- `packages/os/site-kernel-handoff/src/mission/actor-identity.ts` — `ActorIdentity` type, `resolveActorFromEnv()` function, `resolveActor(input)` helper (reads `--actor-from-auth` flag, then env vars, then `--actor` flag, then `"unknown"` default)
- `packages/os/site-kernel-handoff/src/mission/signed-commit.ts` — `SignedCommitResult` type, `createSignedCommit()` function using `signBytes` from `@warpgogol/passport`

**Modified files:**

- `packages/os/site-kernel-handoff/src/mission/mission-open.ts` — replace `const actor = flagString(input, "actor") ?? "agent"` with `resolveActor(input)` call
- `packages/os/site-kernel-handoff/src/mission/mission-git-commit.ts` — integrate `createSignedCommit` when `PASSPORT_SIGNING_KEY` is set; add `signed`, `actorId`, `signature` fields to `MissionGitCommitData`
- `packages/os/site-kernel-handoff/src/mission/mission-close.ts` — replace `const actor = flagString(input, "actor") ?? "agent"` with `resolveActor(input)` call
- `packages/os/site-kernel-handoff/src/mission/mission-abort.ts` — replace `const actor = flagString(input, "actor") ?? "agent"` with `resolveActor(input)` call
- `packages/os/site-kernel-handoff/src/mission/mission-materialization-commands.ts` — add `--actor` and `--actor-from-auth` flags to `mission.reconcile` command registration; replace hardcoded `"agent"` in `acquireLock` calls with resolved actor
- `packages/os/site-kernel-handoff/src/mission/index.ts` — add `--actor-from-auth` boolean flag to `mission.open`, `mission.close`, `mission.abort`, `mission.reconcile` command registrations; change `actor` flag default from `"agent"` to `"unknown"` for `mission.open`, `mission.close`, `mission.abort`
- `packages/os/site-kernel-handoff/src/mission/mission-module.ts` — same flag additions as `index.ts` (dynamic import variant)

**Command registry changes:**

- `mission.open` — add `actor-from-auth: { kind: "boolean", description: "Read actor from WERKSTATT_ACTOR_ID env var" }` flag; change `actor` default from `"agent"` to `"unknown"`
- `mission.close` — add `actor-from-auth` flag; change `actor` default from `"agent"` to `"unknown"`
- `mission.abort` — add `actor-from-auth` flag; change `actor` default from `"agent"` to `"unknown"`
- `mission.reconcile` — add `actor: { kind: "string", description: "Actor identity." }` and `actor-from-auth` flags (currently has neither)
- `mission.git.commit` — no new flags (reads `PASSPORT_SIGNING_KEY` env var directly)

### 2.2 Configuration and data

- `missions/*/mission.yaml` — `openedBy` field stores VC subject id instead of free-text string (no schema change needed — field is already `string`)
- `systems/*/bordbuch/events.ndjson` — `actor` field stores VC subject id (no schema change needed — field is already `string`)

### 2.3 Documentation and specs

- `packages/os/site-kernel-handoff/AGENTS.md` — add section documenting `--actor-from-auth` flag, env-var propagation contract (`WERKSTATT_ACTOR_ID`, `WERKSTATT_ACTOR_SITE`, `WERKSTATT_ACTOR_SCOPES`), and actor resolution precedence
- RFC-0560 file itself — read-only reference, no modifications during implementation

### 2.4 Validation and pipelines

- `pnpm --filter @warpgogol/site-kernel-handoff build:check` — TypeScript compilation
- `pnpm --filter @warpgogol/site-kernel-handoff test` — unit tests
- `pnpm exec site-kernel run rfc.validate --id RFC-0560` — RFC validation

## 3. Step sequence

### Step 1. Create ActorIdentity type and resolveActorFromEnv helper

**Goal:** Define the shared actor identity type and resolution logic that all mission commands will use.

**Agent actions:**

- Create `packages/os/site-kernel-handoff/src/mission/actor-identity.ts`
- Define `ActorIdentity` interface: `{ actorId: string; siteId: string; scopes: string[] }`
- Define `resolveActorFromEnv(): ActorIdentity | null` — reads `WERKSTATT_ACTOR_ID`, `WERKSTATT_ACTOR_SITE`, `WERKSTATT_ACTOR_SCOPES` env vars; returns `null` if `WERKSTATT_ACTOR_ID` or `WERKSTATT_ACTOR_SITE` not set
- Define `resolveActor(input: KernelCommandInput): string` — if `--actor-from-auth` flag is set, call `resolveActorFromEnv()` and return `actorId` (or throw `actor-required` error if env vars not set); else if `--actor` flag is set, return its value; else return `"unknown"`
- Export from `packages/os/site-kernel-handoff/src/mission/index.ts`

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff build:check` passes

**Completion criterion:** `ActorIdentity` type and `resolveActorFromEnv` and `resolveActor` functions exist in `actor-identity.ts` and the package compiles.

**Human review:** no

---

### Step 2. Create createSignedCommit helper

**Goal:** Define the signed commit creation function that `mission.git.commit` will call.

**Agent actions:**

- Create `packages/os/site-kernel-handoff/src/mission/signed-commit.ts`
- Import `signBytes` from `@warpgogol/passport` (signature: `signBytes(privateKeyHex: string, message: Uint8Array): Promise<string>`)
- Define `SignedCommitResult` interface: `{ commitSha: string; signed: boolean; actorId: string | null; signature: string | null }`
- Define `createSignedCommit(workpieceDir, message, actorId, privateKeyHex): Promise<SignedCommitResult>`:
  1. `git add -A` in workpieceDir
  2. Check for changes via `git diff --cached --quiet` — if no changes, return current HEAD SHA with `signed: false`
  3. `git commit -m <message>` to create initial commit
  4. Get pre-amend commit SHA
  5. Call `signBytes(privateKeyHex, new TextEncoder().encode(sha))` to get multibase signature
  6. `git commit --amend -m "<message>\n\nWerkstatt-Actor: <actorId>\nWerkstatt-Signature: <multibase-sig>"` to add trailers
  7. Get post-amend commit SHA
  8. Return `{ commitSha: postAmendSha, signed: true, actorId, signature }`
- Export from `packages/os/site-kernel-handoff/src/mission/index.ts`

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff build:check` passes

**Completion criterion:** `createSignedCommit` function exists in `signed-commit.ts`, imports `signBytes` from `@warpgogol/passport`, and the package compiles.

**Human review:** no

---

### Step 3. Integrate resolveActor into mission.open

**Goal:** `mission.open` uses the shared actor resolution logic and accepts `--actor-from-auth` flag.

**Agent actions:**

- In `packages/os/site-kernel-handoff/src/mission/mission-open.ts`:
  - Import `resolveActor` from `./actor-identity.ts`
  - Replace `const actor = flagString(input, "actor") ?? "agent"` with `const actor = resolveActor(input)`
- In `packages/os/site-kernel-handoff/src/mission/index.ts`:
  - Add `actor-from-auth: { kind: "boolean", description: "Read actor identity from WERKSTATT_ACTOR_ID env var set by Studio Gate auth." }` to `mission.open` flags
  - Change `actor` flag default from `"agent"` to `"unknown"`
- In `packages/os/site-kernel-handoff/src/mission/mission-module.ts`:
  - Apply same flag changes to the dynamic-import variant

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff build:check` passes
- `pnpm exec site-kernel run mission.open --system <test-system> --brief "test" --actor-from-auth --json` fails with `actor-required` error when env vars not set

**Completion criterion:** `mission.open` accepts `--actor-from-auth` flag, reads `WERKSTATT_ACTOR_ID` env var, and defaults to `"unknown"` when neither `--actor` nor `--actor-from-auth` is provided.

**Human review:** no

---

### Step 4. Integrate createSignedCommit into mission.git.commit

**Goal:** `mission.git.commit` signs commits with Ed25519 when `PASSPORT_SIGNING_KEY` is set and produces unsigned commits when not set.

**Agent actions:**

- In `packages/os/site-kernel-handoff/src/mission/mission-git-commit.ts`:
  - Import `createSignedCommit` from `./signed-commit.ts`
  - Extend `MissionGitCommitData` interface with `signed: boolean`, `actorId: string | null`, `signature: string | null`
  - Read `PASSPORT_SIGNING_KEY` from `process.env`
  - Read actor from mission manifest's `openedBy` field (fallback for CLI mode)
  - If `PASSPORT_SIGNING_KEY` is set:
    - Call `createSignedCommit(workpieceDir, message, actorId, privateKeyHex)`
    - Return result with `signed`, `actorId`, `signature` fields
  - If `PASSPORT_SIGNING_KEY` is not set:
    - Keep existing unsigned commit logic
    - Return result with `signed: false`, `actorId: null`, `signature: null`
    - Log warning to stderr
  - Handle no-changes case: return current HEAD SHA with `signed: false` (no commit or amend)

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff build:check` passes
- Manual test: `mission.git.commit` with `PASSPORT_SIGNING_KEY` set produces commit with `Werkstatt-Actor` and `Werkstatt-Signature` trailers
- Manual test: `mission.git.commit` without `PASSPORT_SIGNING_KEY` produces unsigned commit with `signed: false`

**Completion criterion:** `mission.git.commit` signs commits when key is set, produces unsigned commits when key is not set, handles no-changes case, and output includes `signed`, `actorId`, `signature` fields.

**Human review:** no

---

### Step 5. Integrate resolveActor into mission.close, mission.abort, and mission.reconcile

**Goal:** All mission commands that write Bordbuch entries use the same actor resolution logic.

**Agent actions:**

- In `packages/os/site-kernel-handoff/src/mission/mission-close.ts`:
  - Import `resolveActor` from `./actor-identity.ts`
  - Replace `const actor = flagString(input, "actor") ?? "agent"` with `const actor = resolveActor(input)`
- In `packages/os/site-kernel-handoff/src/mission/mission-abort.ts`:
  - Import `resolveActor` from `./actor-identity.ts`
  - Replace `const actor = flagString(input, "actor") ?? "agent"` with `const actor = resolveActor(input)`
- In `packages/os/site-kernel-handoff/src/mission/mission-materialization-commands.ts`:
  - Import `resolveActor` from `./actor-identity.ts`
  - Add `const actor = resolveActor(input)` at the start of `runMissionReconcile`
  - Replace hardcoded `"agent"` in `acquireLock` calls with `actor` variable
- In `packages/os/site-kernel-handoff/src/mission/index.ts` and `mission-module.ts`:
  - Add `actor-from-auth` flag to `mission.close`, `mission.abort`, `mission.reconcile` command registrations
  - Change `actor` flag default from `"agent"` to `"unknown"` for `mission.close` and `mission.abort`
  - Add `actor` and `actor-from-auth` flags to `mission.reconcile` (currently has neither)

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff build:check` passes
- `pnpm --filter @warpgogol/site-kernel-handoff test` passes

**Completion criterion:** `mission.close`, `mission.abort`, and `mission.reconcile` all use `resolveActor(input)` for actor resolution and accept `--actor-from-auth` flag.

**Human review:** no

---

### Step 6. Write unit tests

**Goal:** Verify actor resolution, signed commit creation, and backwards compatibility.

**Agent actions:**

- Create `packages/os/site-kernel-handoff/src/mission/actor-identity.test.ts`:
  - Test `resolveActorFromEnv()` with env vars set → returns `ActorIdentity`
  - Test `resolveActorFromEnv()` with env vars not set → returns `null`
  - Test `resolveActor(input)` with `--actor-from-auth` flag and env vars set → returns VC subject id
  - Test `resolveActor(input)` with `--actor-from-auth` flag but env vars not set → throws `actor-required` error
  - Test `resolveActor(input)` with `--actor` flag → returns flag value
  - Test `resolveActor(input)` with neither flag → returns `"unknown"`
  - Test `resolveActor(input)` with both flags → `--actor-from-auth` takes precedence
- Create `packages/os/site-kernel-handoff/src/mission/signed-commit.test.ts`:
  - Test `createSignedCommit` with valid `PASSPORT_SIGNING_KEY` → produces signed commit with trailers
  - Test `createSignedCommit` with no changes → returns current HEAD SHA, `signed: false`
  - Test that `Werkstatt-Actor` and `Werkstatt-Signature` trailers are present in signed commits
  - Test that post-amend SHA differs from pre-amend SHA

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff test` passes

**Completion criterion:** All unit tests pass and cover actor resolution, signed commit creation, env-var reading, flag precedence, and no-changes case.

**Human review:** no

---

### Step 7. Update AGENTS.md

**Goal:** Document the new `--actor-from-auth` flag and env-var propagation contract.

**Agent actions:**

- In `packages/os/site-kernel-handoff/AGENTS.md`:
  - Add a new section "Mission actor identity (RFC-0560)" after the "Bordbuch git synchronization" section
  - Document the env-var propagation contract: `WERKSTATT_ACTOR_ID`, `WERKSTATT_ACTOR_SITE`, `WERKSTATT_ACTOR_SCOPES`
  - Document the `--actor-from-auth` flag and precedence: `--actor-from-auth` > `--actor` > `"unknown"` default
  - Document that `PASSPORT_SIGNING_KEY` enables Ed25519 commit signing in `mission.git.commit`
  - Document the `Werkstatt-Actor` and `Werkstatt-Signature` trailer format
  - Note that existing Bordbuch entries with `actor: "agent"` remain valid

**Validation:**

- `git diff packages/os/site-kernel-handoff/AGENTS.md` shows the new section

**Completion criterion:** `packages/os/site-kernel-handoff/AGENTS.md` includes the actor identity section with env-var contract and flag documentation.

**Human review:** no

---

### Step 8. Validate and run acceptance checks

**Goal:** Verify all acceptance criteria are met and the implementation passes all checks.

**Agent actions:**

- Run `pnpm exec site-kernel run rfc.validate --id RFC-0560`
- Run `pnpm --filter @warpgogol/site-kernel-handoff build:check`
- Run `pnpm --filter @warpgogol/site-kernel-handoff test`
- Verify each acceptance criterion in the RFC against the implemented code:
  - `ActorIdentity` type and `resolveActorFromEnv` function defined ✓
  - `createSignedCommit` function defined ✓
  - `mission.open` accepts `--actor-from-auth` flag ✓
  - `mission.git.commit` signs commits with `Werkstatt-Actor`/`Werkstatt-Signature` trailers ✓
  - `mission.git.commit` produces unsigned commit with `signed: false` when key not set ✓
  - `mission.git.commit` handles no-changes case ✓
  - `mission.yaml` `actor` field stores VC subject id ✓
  - Bordbuch entries record VC subject id ✓
  - `mission.reconcile`, `mission.close`, `mission.abort` use same actor resolution ✓
  - Existing missions with `actor: "agent"` remain valid ✓
  - `AGENTS.md` updated ✓
  - `rfc.validate` passes ✓

**Validation:**

- All commands pass with exit code 0

**Completion criterion:** All validation commands pass and every acceptance criterion is verified.

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize all documentation artifacts, run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Verify `packages/os/site-kernel-handoff/AGENTS.md` is updated (Step 7).
- Run `pnpm exec site-kernel run ecosystem.manifest.generate` if command surfaces changed (new flags on existing commands — check if `ecosystem.manifest.validate` requires regeneration).
- **Run code review:** invoke `fo-review` via the `skill` tool on all session code changes. Wait for the review report.
- **Run fix if needed:** if `fo-review` reported findings, invoke `fo-fix` via the `skill` tool. Re-run `fo-review` to confirm all findings are resolved. Maximum 3 iterations.
- **Check off acceptance criteria:** verify each criterion in the RFC against the implemented code. Mark `[x]` for verified criteria.
- **Stamp the RFC as implemented:** run `pnpm exec site-kernel run rfc.implement.stamp --id RFC-0560 --implementation-commit <sha>` to atomically transition `accepted → implemented`.

**Validation:**

- `git status` — no uncommitted changes from the current session.
- `pnpm exec site-kernel run rfc.validate --id RFC-0560`
- Review report exists in `docs/reviews/code/` for this session.

**Completion criterion:** All documentation artifacts in scope are updated; code review passed (findings fixed if any); all acceptance criteria are checked off; RFC is stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476).

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec site-kernel run rfc.validate --id RFC-0560`
- `pnpm --filter @warpgogol/site-kernel-handoff build:check`
- `pnpm --filter @warpgogol/site-kernel-handoff test`

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0560` in the subject line (RFC-0265 commit hygiene)
- `docs/reviews/code/` review report for this session

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Key not set during transition | Step 4: `mission.git.commit` falls back to unsigned commit with `signed: false` and warning |
| Signature verification not enforced | Out of scope — this RFC enables signing, not verification. No plan step needed. |
| Commit trailer format | Step 2: Uses `Werkstatt-` prefix to avoid collision with `Signed-off-by` (DCO) |
| Key reuse (PASSPORT_SIGNING_KEY) | Step 4: Key is only in env vars, never written to disk. Documented in AGENTS.md (Step 7) |
| Actor id changes after key rotation | Out of scope — old commits retain old actor ids. No plan step needed. |
| CLI actor with signing key | Step 4: Actor id for signature taken from `--actor` flag or mission manifest `openedBy` fallback |
| Agent misinterpretation | Step 1: `resolveActor` reads env vars, not LLM-provided values, when `--actor-from-auth` is set |
| Actor default change from "agent" to "unknown" | Step 3 and 5: All command registrations update default. Documented in AGENTS.md (Step 7) |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-46 (Mission lifecycle), run `pnpm exec site-kernel run rfc.supersede.propose --id RFC-0560 --reason "..." --invariant "DNA-46"` instead of working around it.
- If the env-var propagation mechanism conflicts with Studio Gate's architecture (RFC-0555/0559), escalate to a new RFC rather than adding a parallel propagation path.
