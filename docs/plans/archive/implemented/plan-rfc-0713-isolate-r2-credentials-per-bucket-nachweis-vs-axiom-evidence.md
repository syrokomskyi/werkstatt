---
rfcId: RFC-0713
planId: PLAN-RFC-0713-01
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
    - "packages/os/site-kernel-handoff/AGENTS.md"
    - ".env.example"
---

# Implementation Plan: RFC-0713

## 1. Objectives

- [ ] `resolveR2ConfigFromEnv` accepts optional `envPrefix` parameter — maps to acceptance criterion 1
- [ ] `nachweis-io.ts` passes `"R2_NACHWEIS"` prefix to `resolveR2ConfigFromEnv` — maps to acceptance criterion 2
- [ ] `evidence.sync` continues using unprefixed `R2_*` vars with no behavioral change — maps to acceptance criterion 3
- [ ] Root `.env.example` includes `R2_NACHWEIS_*` placeholders with "How to obtain" comments — maps to acceptance criterion 4
- [ ] Unit test verifies `MissingEnvError` for nachweis reports `R2_NACHWEIS_ACCOUNT_ID` — maps to acceptance criterion 5
- [ ] `AGENTS.md` updated to document per-bucket R2 token scoping — maps to acceptance criterion 6

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/os/site-kernel-handoff/src/evidence/r2-client.ts` — extend `resolveR2ConfigFromEnv` with optional `envPrefix` parameter
- `packages/os/site-kernel-handoff/src/nachweis/nachweis-io.ts` — update `uploadToR2` to pass `"R2_NACHWEIS"` prefix
- `packages/os/site-kernel-handoff/src/tests/r2-client-env-prefix.test.ts` — new unit test file

### 2.2 Configuration and data

- `.env.example` (root) — add `R2_NACHWEIS_*` section with "How to obtain" comments

### 2.3 Documentation and specs

- `packages/os/site-kernel-handoff/AGENTS.md` — update R2 setup note to document per-bucket token scoping

### 2.4 Validation and pipelines

- No pipeline changes — `nachweis.ingest` is a manual command, not a pipeline step
- `rfc.validate --id RFC-0713` must pass before stamping

## 3. Step sequence

### Step 1. Extend `resolveR2ConfigFromEnv` with optional `envPrefix` parameter

**Goal:** Add support for prefixed env var resolution to the R2 client.

**Agent actions:**

- Add `envPrefix?: string` parameter to `resolveR2ConfigFromEnv` in `packages/os/site-kernel-handoff/src/evidence/r2-client.ts`
- When `envPrefix` is provided, read `${envPrefix}_R2_ACCOUNT_ID`, `${envPrefix}_R2_ACCESS_KEY_ID`, `${envPrefix}_R2_SECRET_ACCESS_KEY` instead of unprefixed vars
- When `envPrefix` is omitted, preserve existing behavior (read `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`)
- `MissingEnvError` must report the prefixed var name (e.g. `R2_NACHWEIS_ACCOUNT_ID`) when prefix is used
- Update the module contract comment to document the new parameter

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff build:check` (typecheck passes)
- Existing tests still pass (`pnpm --filter @warpgogol/site-kernel-handoff test`)

**Completion criterion:** `resolveR2ConfigFromEnv` accepts `envPrefix` parameter and reads prefixed env vars when provided; unprefixed behavior unchanged.

**Human review:** no

---

### Step 2. Update `nachweis-io.ts` to pass `"R2_NACHWEIS"` prefix

**Goal:** Switch the Nachweis module to use isolated R2 credentials.

**Agent actions:**

- In `packages/os/site-kernel-handoff/src/nachweis/nachweis-io.ts`, update the `uploadToR2` function to call `resolveR2ConfigFromEnv(NACHWEIS_BUCKET, "R2_NACHWEIS")` instead of `resolveR2ConfigFromEnv(NACHWEIS_BUCKET)`
- Update the module contract comment to reflect the env var change

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff build:check`
- Existing nachweis tests still pass (they mock `resolveR2ConfigFromEnv` so the signature change is transparent)

**Completion criterion:** `nachweis-io.ts` passes `"R2_NACHWEIS"` as `envPrefix` to `resolveR2ConfigFromEnv`.

**Human review:** no

---

### Step 3. Add `R2_NACHWEIS_*` placeholders to root `.env.example`

**Goal:** Document the new env vars in the root `.env.example` template.

**Agent actions:**

- Add a new section after the existing `R2_*` section in `.env.example`:
  ```
  # ── Cloudflare R2 (RFC-0713 nachweis bucket isolation) — bucket: nachweis
  # Separate credentials scoped to the "nachweis" bucket only (least-privilege).
  # How to obtain: Cloudflare Dashboard → R2 → Manage R2 API Tokens → Create Access Key scoped to "nachweis" bucket.
  R2_NACHWEIS_ACCOUNT_ID=
  R2_NACHWEIS_ACCESS_KEY_ID=
  R2_NACHWEIS_SECRET_ACCESS_KEY=
  ```

**Validation:**

- `env.contract.validate` passes (root `.env.example` is hand-maintained, not generated)

**Completion criterion:** Root `.env.example` contains `R2_NACHWEIS_*` placeholders with "How to obtain" comments.

**Human review:** no

---

### Step 4. Write unit test for `MissingEnvError` with prefixed env vars

**Goal:** Verify that `MissingEnvError` reports the correct prefixed variable name.

**Agent actions:**

- Create `packages/os/site-kernel-handoff/src/tests/r2-client-env-prefix.test.ts`
- Test 1: `resolveR2ConfigFromEnv` with `envPrefix: "R2_NACHWEIS"` reads `R2_NACHWEIS_*` vars
- Test 2: `resolveR2ConfigFromEnv` with `envPrefix: "R2_NACHWEIS"` throws `MissingEnvError("R2_NACHWEIS_ACCOUNT_ID")` when vars absent
- Test 3: `resolveR2ConfigFromEnv` without `envPrefix` reads `R2_*` vars (backward compat)
- Test 4: `resolveR2ConfigFromEnv` without `envPrefix` throws `MissingEnvError("R2_ACCOUNT_ID")` when vars absent
- Use `vi.stubEnv` to set/unset env vars in tests; restore in `afterEach`

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff exec vitest run src/tests/r2-client-env-prefix.test.ts`

**Completion criterion:** All 4 tests pass; `MissingEnvError` reports prefixed var name when `envPrefix` is used.

**Human review:** no

---

### Step 5. Update `AGENTS.md` to document per-bucket R2 token scoping

**Goal:** Update the R2 setup note in `packages/os/site-kernel-handoff/AGENTS.md` to reflect per-bucket isolation.

**Agent actions:**

- Find the existing R2 note in `packages/os/site-kernel-handoff/AGENTS.md` (line 34): "Scope tokens to the `axiom-evidence` bucket only (least-privilege)."
- Update to document two separate token sets:
  - `R2_*` vars: token scoped to `axiom-evidence` bucket (for `evidence.sync`)
  - `R2_NACHWEIS_*` vars: token scoped to `nachweis` bucket (for `nachweis.ingest`)
- Add reference to RFC-0713

**Validation:**

- `forge.doctor` passes (AGENTS.md stale check)

**Completion criterion:** `AGENTS.md` documents per-bucket R2 token scoping with both `R2_*` and `R2_NACHWEIS_*` sections.

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize all documentation artifacts, run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Run `pnpm exec site-kernel run command.manifest.generate` (no new commands, but `nachweis.ingest` is in `commands.changed` — verify manifest is current)
- Run `pnpm exec site-kernel run ecosystem.manifest.generate` if needed
- **Run code review:** invoke `fo-review` via the `skill` tool on all session code changes
- **Run fix if needed:** if `fo-review` reported findings, invoke `fo-fix` via the `skill` tool
- **Check off acceptance criteria:** verify each criterion in the RFC against the implemented code. Mark `[x]` with inline `(evidence: <file:line>)` annotations
- **Stamp the RFC as implemented:** run `pnpm exec site-kernel run rfc.implement.stamp --id RFC-0713 --implementation-commit <sha>`

**Validation:**

- `git status` — no uncommitted changes from the current session
- `pnpm exec site-kernel run rfc.validate --id RFC-0713`
- Every file in `scope.docs` is either updated or documented as not-applicable
- Review report exists in `docs/reviews/code/` for this session

**Completion criterion:** All documentation artifacts in scope are updated; code review passed (findings fixed if any); all acceptance criteria are checked off with inline `(evidence: ...)` annotations; RFC is stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476).

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec site-kernel run rfc.validate --id RFC-0713`
- `pnpm --filter @warpgogol/site-kernel-handoff build:check`
- `pnpm --filter @warpgogol/site-kernel-handoff test`
- `pnpm exec site-kernel run env.contract.validate` (root `.env.example` check)

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0713` in the subject line (RFC-0265 commit hygiene)
- No acceptance probes declared (commented out) — `rfc.verification.emit` will skip silently (expected behavior)

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --------------- | ------------------------ |
| Operator confusion — two sets of R2 env vars | Step 3 adds clear `.env.example` comments with separate sections |
| Migration — operators who set `R2_*` for nachweis need `R2_NACHWEIS_*` | Nachweis is not yet in production; no migration needed |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-N, run `pnpm exec site-kernel run rfc.supersede.propose --id RFC-0713 --reason "..." --invariant "DNA-N"` instead of working around it.
