---
rfcId: RFC-0478
planId: PLAN-RFC-0478-01
status: draft
owner: architecture
createdAt: 2026-07-21
updatedAt:
scope:
  apps: []
  packages:
    - "@wgogol/forge"
    - "@gogol/site-kernel-handoff"
    - "@gogol/site-kernel-checks"
  services: []
  docs:
    - docs/COMMANDS.md
    - AGENTS.md
    - docs/verification-plan.xml
---

# Implementation Plan: RFC-0478

## 1. Objectives

- [ ] O1 — Add `versionBump` to `RFC_KNOWN_KEYS` and `RfcFrontmatter` interface (maps to acceptance criterion 1)
- [ ] O2 — Implement V-28 RFC-id monotonicity rule using strictly earlier `createdAt` (maps to acceptance criterion 2)
- [ ] O3 — Implement V-29 `versionBump` required for post-cutoff implemented RFCs (maps to acceptance criterion 3)
- [ ] O4 — Implement `platform.consistency.validate` command in a new `platform-module.ts` (maps to acceptance criteria 4–7)
- [ ] O5 — Wire `platform.consistency.validate` into `ci.local.validate` and `packages.check` pipeline (maps to acceptance criteria 8–9)
- [ ] O6 — Scaffold `versionBump: patch` default in `rfc.create` template and handler (maps to acceptance criterion 10)
- [ ] O7 — Update `AGENTS.md` and `docs/COMMANDS.md` with enforcement rules (maps to acceptance criteria 11–12)
- [ ] O8 — Validate: `rfc.validate`, `build:check`, acceptance probes pass (maps to acceptance criteria 13–15)

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/forge/os/rfc/types.ts` — add `versionBump` to `RFC_KNOWN_KEYS` array and `RfcFrontmatter` interface
- `packages/forge/os/rfc/handlers/validate-rules.ts` — add V-28 and V-29 rules in `validateSingleRfc`
- `packages/forge/os/rfc/handlers/validate-rules.test.ts` — add V-28 and V-29 test cases
- `packages/forge/os/rfc/rfc-0000-template.md` — add `versionBump: patch` to template frontmatter
- `packages/forge/os/rfc/handlers/list-create.ts` — add `versionBump` placeholder replacement in `runRfcCreate`
- `packages/os/site-kernel-handoff/src/platform-consistency.ts` — new command handler
- `packages/os/site-kernel-handoff/src/platform-module.ts` — new `createPlatformModule` kernel module
- `packages/os/site-kernel-handoff/src/index.ts` — export `createPlatformModule` from barrel
- `tools/kernel.config.ts` — add `platform` module loader entry
- `packages/os/site-kernel-checks/src/ci-local.ts` — add `platform.consistency.validate` to `CI_LOCAL_CHECKED_COMMANDS`
- `packages/os/site-kernel-checks/src/pipelines/packages-check.ts` — add `platform.consistency.validate` step to `PACKAGES_CHECK_PIPELINE`
- `docs/platform-version-log.generated.yaml` — seed file (committed to repo)

### 2.2 Configuration and data

- `docs/platform-version-log.generated.yaml` — new committed artifact recording last validated hash + version + timestamp

### 2.3 Documentation and specs

- `AGENTS.md` (root) — document `versionBump` field, V-28/V-29 rules, `platform.consistency.validate` command
- `docs/COMMANDS.md` — add `platform.consistency.validate` to command table
- `docs/verification-plan.xml` — add V-28 and V-29 to the validation rules section

### 2.4 Validation and pipelines

- `packages.check` pipeline — new `platform.consistency.validate` step
- `ci.local.validate` — new `platform.consistency.validate` in `CI_LOCAL_CHECKED_COMMANDS`
- `.github/workflows/ci.yml` — must include `platform.consistency.validate` (enforced by `ci.local.validate`)

## 3. Step sequence

### Step 1. Add `versionBump` to RFC type contracts

**Goal:** Add `versionBump` field to the RFC frontmatter schema (known keys + typed interface).

**Agent actions:**

- Add `versionBump` to `RFC_KNOWN_KEYS` array in `packages/forge/os/rfc/types.ts`
- Add `versionBump?: "minor" | "patch" | "none" | "major"` to `RfcFrontmatter` interface in `packages/forge/os/rfc/types.ts`
- Add Compass `CHANGE_SUMMARY` entry: `RFC-0478: added versionBump field to RFC_KNOWN_KEYS and RfcFrontmatter interface.`

**Validation:**

- `pnpm --filter @wgogol/forge build:check` passes
- `pnpm exec site-kernel run rfc.validate RFC-0478 --json` passes (V-20 does not warn on `versionBump`)

**Completion criterion:** `versionBump` is in `RFC_KNOWN_KEYS` and `RfcFrontmatter`; `rfc.validate` passes; `build:check` passes.

**Human review:** no

---

### Step 2. Implement V-28 RFC-id monotonicity rule

**Goal:** Add V-28 to `validateSingleRfc` — rejects RFC-ids lower than the maximum among RFCs with strictly earlier `createdAt`.

**Agent actions:**

- In `packages/forge/os/rfc/handlers/validate-rules.ts`, inside `validateSingleRfc`, after V-24 block, add V-28 check:
  - Extract current RFC's numeric id and `createdAt`
  - Iterate `allParsed` entries; for each entry with `createdAt` **strictly earlier** than the current RFC's `createdAt`, track the maximum numeric id
  - If current RFC's numeric id < that maximum → V-28 error
  - Archived RFCs are included in `allParsed` but are never the target (they are the comparison set, not the validated file)
- Add test cases in `validate-rules.test.ts`:
  - V-28 passes when same-day RFCs have any id ordering
  - V-28 fails when a later-date RFC has a lower id than an earlier-date RFC
  - V-28 passes for archived RFCs (they are not the target)

**Validation:**

- `pnpm --filter @wgogol/forge test` passes (including new V-28 tests)
- `pnpm --filter @wgogol/forge build:check` passes

**Completion criterion:** V-28 rule in `validateSingleRfc`; test cases pass; `rfc.validate` on all RFCs passes (no false positives on RFC-0478/0479/0480 same-day batch).

**Human review:** no

---

### Step 3. Implement V-29 `versionBump` required for post-cutoff implemented RFCs

**Goal:** Add V-29 to `validateSingleRfc` — requires `versionBump` for RFCs with `status: implemented` and `createdAt >= 2026-07-21`.

**Agent actions:**

- In `validate-rules.ts`, after V-28 block, add V-29 check:
  - If `status === "implemented"` and `createdAt >= RFC_0478_CUTOFF` and `versionBump` is absent → V-29 error
  - If `versionBump === "none"` but `commands.added` or `commands.changed` is non-empty → V-29 warning
  - If `versionBump === "minor"` → note that migrator is required (RFC-0479 enforces)
- Define `RFC_0478_CUTOFF = "2026-07-21"` constant in `types.ts`
- Add test cases in `validate-rules.test.ts`:
  - V-29 fails on post-cutoff implemented RFC without `versionBump`
  - V-29 passes on post-cutoff implemented RFC with `versionBump: patch`
  - V-29 warns on `versionBump: none` with non-empty `commands.added`
  - V-29 does not fire on pre-cutoff RFCs

**Validation:**

- `pnpm --filter @wgogol/forge test` passes
- `pnpm --filter @wgogol/forge build:check` passes

**Completion criterion:** V-29 rule in `validateSingleRfc`; test cases pass; `rfc.validate` on all RFCs passes.

**Human review:** no

---

### Step 4. Scaffold `versionBump: patch` default in `rfc.create`

**Goal:** Make `rfc.create` scaffold `versionBump: patch` in new RFC frontmatter.

**Agent actions:**

- Add `versionBump: patch` to `packages/forge/os/rfc/rfc-0000-template.md` frontmatter (after `nonGoals` or near `commands` block)
- Add replacement logic in `runRfcCreate` in `packages/forge/os/rfc/handlers/list-create.ts` — the template will have `versionBump: patch` as a literal default, no placeholder replacement needed (it's a static default, not per-RFC)

**Validation:**

- `pnpm --filter @wgogol/forge build:check` passes
- `pnpm exec site-kernel run rfc.validate` passes on all RFCs (existing RFCs without `versionBump` are pre-cutoff, V-29 does not fire)

**Completion criterion:** `rfc-0000-template.md` contains `versionBump: patch`; `rfc.validate` passes.

**Human review:** no

---

### Step 5. Implement `platform.consistency.validate` command

**Goal:** Create the new command handler and kernel module.

**Agent actions:**

- Create `packages/os/site-kernel-handoff/src/platform-consistency.ts`:
  - Export `runPlatformConsistencyValidate` handler
  - Export `PlatformConsistencyData` and `PlatformConsistencyViolation` interfaces
  - Implement: compute `platformSemanticHash` via `resolvePlatformSemanticHash` (import from `./bundle-io.ts`)
  - Read `package.json` root version
  - Read `docs/platform-version-log.generated.yaml` (last validated state: hash, version, validatedAt)
  - PC-01: hash changed but version unchanged → error
  - PC-02: version bumped but no RFC with `versionBump: minor|patch` and `updatedAt >= last validatedAt` found → warning (scan RFCs by comparing `updatedAt` to the last `validatedAt` timestamp in the log)
  - PC-03: `versionBump: minor` RFC with `updatedAt >= last validatedAt` found but minor version was not bumped → error
  - On success: write `docs/platform-version-log.generated.yaml` with current hash + version + timestamp
  - First run (file missing): seed with current state, exit zero
  - **`--check` mode**: when `--check` flag is passed, do NOT write the log file — only validate. CI uses `--check` to avoid dirty working tree. Local operator runs without `--check` to update the log.
- Create `packages/os/site-kernel-handoff/src/platform-module.ts`:
  - Export `createPlatformModule` following the `createBordbuchModule` lazy-loading pattern
  - Register `platform.consistency.validate` command (scope: workspace, reads: `package.json` + `packages/**` + `docs/rfcs/**/*.md`, writes: `docs/platform-version-log.generated.yaml`)
- Export `createPlatformModule` from `packages/os/site-kernel-handoff/src/index.ts` barrel
- Add `platform` module loader entry in `tools/kernel.config.ts`

**Validation:**

- `pnpm --filter @gogol/site-kernel-handoff build:check` passes
- `pnpm exec site-kernel run platform.consistency.validate --json` runs and exits 0 (first run seeds the file)

**Completion criterion:** Command registered and runnable; `--json` output matches `PlatformConsistencyData` shape; first-run seeding works.

**Human review:** no

---

### Step 6. Seed `docs/platform-version-log.generated.yaml`

**Goal:** Create the initial committed artifact with current platform hash + version.

**Agent actions:**

- Run `pnpm exec site-kernel run platform.consistency.validate` to seed the file
- Verify the file is not gitignored (check `.gitignore` — no `docs/*.generated.*` pattern)
- Add the file to git

**Validation:**

- `docs/platform-version-log.generated.yaml` exists with `hash`, `version`, `validatedAt` fields

**Completion criterion:** File exists, is valid YAML, contains current hash + version.

**Human review:** no

---

### Step 7. Wire `platform.consistency.validate` into CI pipelines

**Goal:** Add the command to `ci.local.validate` and `packages.check` pipeline.

**Agent actions:**

- Add `"pnpm exec site-kernel run platform.consistency.validate --check --json"` to `CI_LOCAL_CHECKED_COMMANDS` in `packages/os/site-kernel-checks/src/ci-local.ts` (uses `--check` to avoid writing in CI)
- Add `{ command: "platform.consistency.validate", args: ["--check"] }` to `PACKAGES_CHECK_PIPELINE` in `packages/os/site-kernel-checks/src/pipelines/packages-check.ts` (after `fingerprint.fixtures.validate`, before `chat.metadata.drift.validate`)
- Verify `.github/workflows/ci.yml` includes the command (enforced by `ci.local.validate`)

**Validation:**

- `pnpm --filter @gogol/site-kernel-checks build:check` passes
- `pnpm exec site-kernel run ci.local.validate --json` passes
- `pnpm exec site-kernel run packages-check.run --json` passes

**Completion criterion:** Command appears in `CI_LOCAL_CHECKED_COMMANDS` and `PACKAGES_CHECK_PIPELINE`; `ci.local.validate` and `packages-check.run` pass.

**Human review:** no

---

### Step 8. Update documentation

**Goal:** Document the new field, rules, and command in `AGENTS.md`, `docs/COMMANDS.md`, and `docs/verification-plan.xml`.

**Agent actions:**

- In `AGENTS.md` (root), add a section under the versioning/governance area:
  - `versionBump` frontmatter field: `minor | patch | none | major`
  - V-28: RFC-id monotonicity (strictly earlier `createdAt`)
  - V-29: `versionBump` required for post-cutoff implemented RFCs
  - `platform.consistency.validate` command: PC-01/PC-02/PC-03 rules
- In `docs/COMMANDS.md`, add `platform.consistency.validate` to the command table
- In `docs/verification-plan.xml`, add V-28 and V-29 to the validation rules section

**Validation:**

- `pnpm exec site-kernel run docs.commands.validate --json` passes (command docs in sync)
- `pnpm exec site-kernel run rfc.validate --json` passes

**Completion criterion:** All three docs updated; `docs.commands.validate` passes.

**Human review:** no

---

### Step 9. Full validation suite

**Goal:** Run all validation checks to confirm the implementation is complete.

**Agent actions:**

- Run `pnpm exec site-kernel run rfc.validate --json` — all RFCs pass
- Run `pnpm --filter @wgogol/forge build:check` — passes
- Run `pnpm --filter @wgogol/forge test` — passes (including V-28/V-29 tests)
- Run `pnpm --filter @gogol/site-kernel-handoff build:check` — passes
- Run `pnpm --filter @gogol/site-kernel-handoff test` — passes
- Run `pnpm exec site-kernel run packages-check.run --json` — passes
- Run `pnpm exec site-kernel run ci.local.validate --json` — passes
- Run `pnpm exec site-kernel run platform.consistency.validate --json` — passes

**Validation:**

- All commands exit 0

**Completion criterion:** All validation commands pass; no violations.

**Human review:** no

---

### Step 10. Stamp implemented

**Goal:** Transition RFC-0478 from accepted to implemented using `rfc.implement.stamp`.

**Agent actions:**

- Check all acceptance criteria checkboxes in the RFC body
- Add `versionBump: patch` to RFC-0478 frontmatter (required by V-29 for post-cutoff implemented RFCs)
- Run `pnpm exec site-kernel run rfc.implement.stamp --id RFC-0478`
- Verify the stamp sets `status: implemented`, `implementedAt: 2026-07-21`, and records evidence

**Validation:**

- `rfc.implement.stamp` exits 0
- `rfc.validate RFC-0478 --json` passes (V-29 checks `versionBump` on implemented RFC — RFC-0478 declares `versionBump: patch`)

**Completion criterion:** RFC-0478 status is `implemented`; `rfc.validate` passes.

**Human review:** no — agent-permitted transition (RFC-0224/RFC-0476)

---

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec site-kernel run rfc.validate --id RFC-0478`
- `pnpm --filter @wgogol/forge build:check`
- `pnpm --filter @wgogol/forge test`
- `pnpm --filter @gogol/site-kernel-handoff build:check`
- `pnpm --filter @gogol/site-kernel-handoff test`
- `pnpm exec site-kernel run packages-check.run --json`
- `pnpm exec site-kernel run ci.local.validate --json`
- `pnpm exec site-kernel run platform.consistency.validate --json`

### 4.2 Evidence artifacts

- `docs/platform-version-log.generated.yaml` — seeded hash + version log
- Commit messages referencing `RFC-0478` in the subject line (RFC-0265 commit hygiene)

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Operator forgets `versionBump` field | Step 4 scaffolds `versionBump: patch` default; V-29 (Step 3) errors on post-cutoff implemented RFCs without it |
| `platformSemanticHash` changes on formatting-only edits | DNA-53 semantic hash is formatting-invariant by design; no plan step needed |
| `docs/platform-version-log.generated.yaml` drift after rebase | Step 6 seeds the file; command re-seeds if missing (first-run behavior) |
| V-28 false positive on archived RFCs | Step 2 includes archived RFCs in comparison set only, never as target; test cases verify |
| V-28 false positive on same-day RFCs | Step 2 uses strictly earlier `createdAt`, not "earlier or equal"; test cases verify |
| `fingerprintTree` cost on CI | 3–8 seconds; same cost as `sternsystem.pin` already in `packages.check`; no mitigation needed |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-44/46/48/53, run `pnpm exec site-kernel run rfc.supersede.propose --id RFC-0478 --reason "..." --invariant "DNA-N"` instead of working around it.
- If V-28 produces false positives on existing RFCs that cannot be resolved by the "strictly earlier" rule, stop and create a superseding RFC — do not weaken V-28 to a warning.
- If `platform.consistency.validate` cannot be registered in the `platform` module due to kernel constraints, fall back to registering in the `handoff` module and document the deviation.
