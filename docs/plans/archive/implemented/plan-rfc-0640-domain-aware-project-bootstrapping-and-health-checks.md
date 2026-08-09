---
rfcId: RFC-0640
planId: PLAN-RFC-0640-01
status: draft
owner: architecture
createdAt: 2026-08-02
updatedAt:
scope:
  apps: []
  packages:
    - packages/forge
  services: []
  docs:
    - packages/forge/AGENTS.md
---

# Implementation Plan: RFC-0640

## 1. Objectives

- [ ] Objective 1 — `forge.profile.validate` command registered and functional — maps to acceptance criterion "forge.profile.validate command registered in forgeCoreModule"
- [ ] Objective 2 — `forge.create` reads domain fields from profile and writes them to `forge.yaml` and `PREFERENCES.md` — maps to acceptance criteria "forge.create reads register from profile and writes it to PREFERENCES.md" and "forge.create writes semantic binding defaults from profile artifacts[] when present"
- [ ] Objective 3 — `forge.doctor` reports domain info, lists invariants, resolves terminology, skips software-specific checks for non-software domains — maps to acceptance criteria for doctor domain reporting, invariant listing, terminology resolution, and software-check skipping
- [ ] Objective 4 — `forge.agents.generate` uses `workspaceTypes[]` for detection when present, falls back to hardcoded detection when absent — maps to acceptance criterion "forge.agents.generate uses workspaceTypes[] for detection when present, replacing hardcoded detection"
- [ ] Objective 5 — All three commands fall back to existing behavior when profile has no domain fields — maps to acceptance criterion "All three commands fall back to existing behavior when profile has no domain fields"
- [ ] Objective 6 — `--strict` and `--id` flags declared and functional — maps to acceptance criteria for flag declarations
- [ ] Objective 7 — Unit tests cover domain-aware and fallback paths — maps to acceptance criterion "Unit tests for each command's domain-aware and fallback paths"

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/forge/src/config/forge-config.ts` — extend `forgeConfigSchema` with optional `domain` and `terminology` fields; extend `ForgeConfig` interface; update `defaultForgeConfig` to include empty domain/terminology defaults
- `packages/forge/src/onboarding/profile-loader.ts` (or equivalent) — extend profile loading to read domain fields from RFC-0638 schema extensions
- `packages/forge/src/onboarding/create.ts` — extend `runCreate` to read `register`, `terminology`, and `semanticBindings` from profile and write them into `PREFERENCES.md` and `forge.yaml`
- `packages/forge/src/onboarding/init.ts` — extend `runInit` to accept domain fields from the profile and write `register` into `PREFERENCES.md`, `terminology` and `domain` into `forge.yaml`
- `packages/forge/src/onboarding/doctor.ts` — extend `runDoctor` with domain reporting section: report domain, list invariants (reported-only), resolve terminology via three-tier chain, skip software-specific checks when `domain !== "software"`, add `--strict` flag support, add `forge.profile.validate` as advisory check
- `packages/forge/src/onboarding/agents-generate.ts` — extend `runAgentsGenerate` to pass profile `workspaceTypes[]` to workspace discovery
- `packages/forge/src/onboarding/workspace-discovery.ts` — extend `detectWorkspaceType` to accept optional `workspaceTypes[]` parameter; when present, use profile-declared markers instead of hardcoded detection; when absent, use existing app > service > package precedence
- `packages/forge/src/onboarding/profile-validate.ts` — new file: `runProfileValidate` handler that validates profile YAML files under `packages/forge/profiles/` against the Zod schema from RFC-0638; supports `--id` flag for single-profile validation
- `packages/forge/os/core/core.module.ts` — register `forge.profile.validate` command; add `--strict` flag to `forge.doctor` command registration; add `--id` flag to `forge.profile.validate` registration
- `packages/forge/src/tests/profile-validate.test.ts` — new test file for `forge.profile.validate`
- `packages/forge/src/tests/create-domain.test.ts` — new test file for `forge.create` domain-aware path
- `packages/forge/src/tests/doctor-domain.test.ts` — new test file for `forge.doctor` domain reporting
- `packages/forge/src/tests/workspace-discovery-domain.test.ts` — new test file for `workspaceTypes` detection

### 2.2 Configuration and data

- `packages/forge/profiles/*.yaml` — existing profiles are read by `forge.profile.validate`; no changes needed to existing profiles (they have no domain fields, which triggers fallback behavior)
- `forge.yaml` schema gains optional `domain` and `terminology` fields in the `project` section (or top-level, depending on RFC-0638 schema design)

### 2.3 Documentation and specs

- `packages/forge/AGENTS.md` — update with `forge.profile.validate` command entry, `--strict` flag for `forge.doctor`, domain-aware behavior description for all three changed commands
- No `docs/*.xml` Compass files affected (confirmed in RFC architectural fit section)
- No `docs/architecture-dna.md` changes (no new DNA invariant)

### 2.4 Validation and pipelines

- `pnpm exec site-kernel run rfc.validate --id RFC-0640` — must pass before stamping
- `pnpm --filter @warpgogol/forge run build:check` — TypeScript compilation and tests
- `pnpm --filter @warpgogol/forge run test` — vitest unit tests including new test files

## 3. Step sequence

### Step 1. Extend forge-config schema with domain and terminology fields

**Goal:** Add optional `domain` and `terminology` fields to the forge.yaml schema so that `forge.create` can write them and `forge.doctor` can read them.

**Agent actions:**

- Add `domain: z.string().optional()` and `terminology: z.record(z.string(), z.string()).optional()` to `forgeConfigSchema` in `packages/forge/src/config/forge-config.ts`
- Add corresponding fields to the `ForgeConfig` interface
- Update `defaultForgeConfig` to omit domain/terminology by default (absent = software-domain fallback)
- Add `enhancedAt` to CHANGE_SUMMARY comment

**Validation:**

- `pnpm --filter @warpgogol/forge run build:check` passes with the new schema fields

**Completion criterion:** `forgeConfigSchema` includes optional `domain` and `terminology` fields; `ForgeConfig` interface matches; `defaultForgeConfig` does not include domain/terminology by default; TypeScript compiles.

**Human review:** no

---

### Step 2. Implement `forge.profile.validate` command handler

**Goal:** Create the new `runProfileValidate` handler that validates profile YAML files against the extended schema from RFC-0638.

**Agent actions:**

- Create `packages/forge/src/onboarding/profile-validate.ts`
- Implement `runProfileValidate` function that:
  - Reads all `*.yaml` files from `packages/forge/profiles/` (resolved relative to `forgeRoot`)
  - Parses each with `yaml.parse` and validates against the profile Zod schema (from RFC-0638)
  - Supports `--id` flag: when present, filters to the profile with matching `id` field
  - Returns `ProfileValidateResult` with per-profile `valid`, `errors`, `warnings`
  - Exits non-zero when any profile is invalid
- Define `ProfileValidateResult` interface matching the RFC TypeScript contract

**Validation:**

- `pnpm --filter @warpgogol/forge run build:check` passes
- Manual test: `pnpm exec forge profile.validate --json` returns valid for all shipped profiles

**Completion criterion:** `runProfileValidate` handler exists, validates all shipped profiles, supports `--id` flag, returns `ProfileValidateResult`.

**Human review:** no

---

### Step 3. Register `forge.profile.validate` in core module

**Goal:** Wire the new command into the forge core module so it is available as a CLI command.

**Agent actions:**

- In `packages/forge/os/core/core.module.ts`, import `runProfileValidate` and register it as `forge.profile.validate`
- Declare `--id` flag in the command registration
- Add `--strict` flag to the `forge.doctor` command registration (reserved for future use — does not change current behavior since invariants are reported-only)
- Update CHANGE_SUMMARY comment in `core.module.ts`

**Validation:**

- `pnpm --filter @warpgogol/forge run build:check` passes
- `pnpm exec forge profile.validate --json` returns valid JSON output

**Completion criterion:** `forge.profile.validate` is registered in `forgeCoreModule`; `--id` flag is declared; `--strict` flag is declared on `forge.doctor`.

**Human review:** no

---

### Step 4. Extend `forge.create` to read and write domain fields

**Goal:** Make `forge.create` domain-aware — read `register`, `terminology`, and `semanticBindings` from the selected profile and write them into `PREFERENCES.md` and `forge.yaml`.

**Agent actions:**

- In `packages/forge/src/onboarding/init.ts`, extend `runInit` to accept optional domain fields from the profile:
  - Write `register` from profile into `PREFERENCES.md` frontmatter (default: `business` when absent)
  - Write `terminology` from profile into `forge.yaml` bindings section
  - Write `domain` from profile into `forge.yaml` project section
  - Write semantic binding defaults from profile `artifacts[]` into `forge.yaml` bindings.commands (e.g. `produce`, `verify`, `preview`, `lint` from RFC-0639)
- In `packages/forge/src/onboarding/create.ts`, pass profile domain fields to `runInit` via the child context or input flags
- Ensure fallback: when profile has no domain fields, `PREFERENCES.md` gets `register: business` (current behavior) and `forge.yaml` gets no domain/terminology fields (current behavior)

**Validation:**

- `pnpm --filter @warpgogol/forge run build:check` passes
- Unit test: `forge.create` with a mock profile containing `register: creative` writes `register: creative` into `PREFERENCES.md`
- Unit test: `forge.create` with a profile without domain fields writes `register: business` (fallback)

**Completion criterion:** `forge.create` reads `register` from profile and writes it to `PREFERENCES.md`; writes semantic binding defaults from profile `artifacts[]` when present; falls back to current behavior when profile has no domain fields.

**Human review:** no

---

### Step 5. Extend `forge.doctor` with domain reporting

**Goal:** Make `forge.doctor` domain-aware — report domain info, list invariants (reported-only), resolve terminology, skip software-specific checks for non-software domains, add `forge.profile.validate` as advisory check.

**Agent actions:**

- In `packages/forge/src/onboarding/doctor.ts`, extend `runDoctor`:
  - Read `domain` and `terminology` from `forge.yaml` (written by `forge.create`)
  - Report `DoctorDomainReport` in the result data:
    - `domain`: from forge.yaml or `null` when absent
    - `register`: from forge.yaml or `null` when absent
    - `invariants`: list from profile's `invariants[]` array (reported-only, not checked)
    - `terminology`: resolved via three-tier chain (bindings.terminology → profile.terminology → UNIVERSAL_TERMINOLOGY default)
  - Skip `package.json` and `tsconfig.json` checks when `domain !== "software"` and domain is not null
  - Add `forge.profile.validate` as an advisory check with `warn` status on failure
  - Accept `--strict` flag (reserved — does not change behavior since invariants are reported-only)
- Define `DoctorDomainReport` interface matching the RFC TypeScript contract

**Validation:**

- `pnpm --filter @warpgogol/forge run build:check` passes
- Unit test: `forge.doctor` with `domain: video` in forge.yaml reports domain info and skips software-specific checks
- Unit test: `forge.doctor` without domain field in forge.yaml behaves as before (fallback)

**Completion criterion:** `forge.doctor` reports domain information when profile has `domain` field; lists invariants (reported-only); resolves terminology via three-tier chain; skips software-specific checks when `domain !== "software"`; `forge.profile.validate` runs as advisory check; `--strict` flag accepted.

**Human review:** no

---

### Step 6. Extend `forge.agents.generate` with profile-driven workspace detection

**Goal:** Make `forge.agents.generate` use `workspaceTypes[]` from the profile for workspace detection when present, falling back to hardcoded detection when absent.

**Agent actions:**

- In `packages/forge/src/onboarding/workspace-discovery.ts`, extend `detectWorkspaceType`:
  - Add optional `workspaceTypes?: WorkspaceTypeConfig[]` parameter
  - When `workspaceTypes` is present, iterate the array in order and return the first match (based on profile-declared markers)
  - When `workspaceTypes` is absent, use existing hardcoded detection (app > service > package)
  - When `workspaceTypes` is present but no type matches, return `null` (directory does not get a nested AGENTS.md)
- In `packages/forge/src/onboarding/nested-agents-generate.ts`, pass profile `workspaceTypes[]` to `detectWorkspaceType` via `discoverWorkspaces` or directly
- In `packages/forge/src/onboarding/agents-generate.ts`, load profile `workspaceTypes[]` and pass it through

**Validation:**

- `pnpm --filter @warpgogol/forge run build:check` passes
- Unit test: `detectWorkspaceType` with `workspaceTypes` containing custom markers returns the correct type
- Unit test: `detectWorkspaceType` without `workspaceTypes` uses hardcoded detection (fallback)
- Unit test: `detectWorkspaceType` with `workspaceTypes` where no type matches returns `null`

**Completion criterion:** `forge.agents.generate` uses `workspaceTypes[]` for detection when present, replacing hardcoded detection; falls back to hardcoded detection when absent.

**Human review:** no

---

### Step 7. Write unit tests

**Goal:** Comprehensive test coverage for domain-aware and fallback paths of all changed commands.

**Agent actions:**

- Create `packages/forge/src/tests/profile-validate.test.ts`:
  - Test validating all shipped profiles (should pass)
  - Test `--id` flag filtering to a single profile
  - Test invalid profile YAML returns errors
- Create `packages/forge/src/tests/create-domain.test.ts`:
  - Test `forge.create` with mock profile containing `register: creative` writes `register: creative` into `PREFERENCES.md`
  - Test `forge.create` with profile without domain fields writes `register: business` (fallback)
  - Test `forge.create` writes semantic binding defaults from `artifacts[]` when present
- Create `packages/forge/src/tests/doctor-domain.test.ts`:
  - Test `forge.doctor` with `domain: video` reports domain info and skips software-specific checks
  - Test `forge.doctor` without domain field behaves as before (fallback)
  - Test `forge.doctor` resolves terminology via three-tier chain
  - Test `forge.doctor` `--strict` flag is accepted
- Create `packages/forge/src/tests/workspace-discovery-domain.test.ts`:
  - Test `detectWorkspaceType` with `workspaceTypes` returns correct type
  - Test `detectWorkspaceType` without `workspaceTypes` uses hardcoded detection
  - Test `detectWorkspaceType` with `workspaceTypes` where no type matches returns `null`

**Validation:**

- `pnpm --filter @warpgogol/forge run test` passes all new and existing tests

**Completion criterion:** All new test files exist and pass; tests cover domain-aware and fallback paths for each changed command.

**Human review:** no

---

### Step 8. Update `packages/forge/AGENTS.md`

**Goal:** Document the new command and changed command behaviors in the forge agent guide.

**Agent actions:**

- Add `forge.profile.validate` to the `forgeCoreModule` command list in the OS modules table
- Add a section describing domain-aware behavior for `forge.create`, `forge.doctor`, and `forge.agents.generate`
- Document the `--strict` flag for `forge.doctor` (reserved for future use)
- Document the `--id` flag for `forge.profile.validate`

**Validation:**

- `packages/forge/AGENTS.md` contains entries for `forge.profile.validate` and domain-aware behavior

**Completion criterion:** `packages/forge/AGENTS.md` updated with new command and changed command behaviors.

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize all documentation artifacts, run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Verify `packages/forge/AGENTS.md` is updated (Step 8).
- Verify no `docs/*.xml` Compass files need updating (confirmed in RFC).
- Verify no `docs/architecture-dna.md` changes needed (no new DNA invariant).
- Run `pnpm exec site-kernel run ecosystem.manifest.generate` if command surfaces changed (they did — `forge.profile.validate` is new).
- **Run code review:** invoke `fo-review` via the `skill` tool on all session code changes (`git diff <merge-base-of-session>...HEAD`). Wait for the review report in `docs/reviews/code/`.
- **Run fix if needed:** if `fo-review` reported findings, invoke `fo-fix` via the `skill` tool. Re-run `fo-review` to confirm all findings are resolved. Maximum 3 iterations.
- **Check off acceptance criteria:** verify each criterion in the RFC against the implemented code. Mark `[x]` for verified criteria with inline `(evidence: <file:line>)` annotations. For unchecked `[ ]` criteria, document why.
- **Stamp the RFC as implemented:** run `pnpm exec site-kernel run rfc.implement.stamp --id RFC-0640 --implementation-commit <sha>` to atomically transition `accepted → implemented` (RFC-0476). The command validates all preconditions (status, criteria, clean tree, commit reachability). Do NOT hand-edit `status`, `implementedAt`, or `closedAt` fields — use the command.

**Validation:**

- `git status` — no uncommitted changes from the current session.
- `pnpm exec site-kernel run rfc.validate --id RFC-0640`
- Every file in `scope.docs` is either updated or documented as not-applicable.
- Review report exists in `docs/reviews/code/` for this session.

**Completion criterion:** All documentation artifacts in scope are updated; code review passed (findings fixed if any); all acceptance criteria are checked off with inline `(evidence: ...)` annotations; RFC is stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476), which validates all preconditions atomically. Code review is automated via `fo-review`.

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec site-kernel run rfc.validate --id RFC-0640`
- `pnpm --filter @warpgogol/forge run build:check`
- `pnpm --filter @warpgogol/forge run test`

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0640` in the subject line (RFC-0265 commit hygiene)
- `docs/reviews/code/` review report from `fo-review`

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Command complexity — extending three commands increases complexity | Step 4-6: domain-aware logic guarded by profile field presence — absent fields trigger fallback |
| Profile validation gaps — `forge.profile.validate` might miss edge cases | Step 2: uses the same Zod schema as the profile loader, ensuring schema-level consistency |
| workspaceTypes detection false positives — non-software markers might match unrelated files | Step 6: detection markers are profile-specific and can be refined per profile; fallback to hardcoded detection when `workspaceTypes` absent |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-N, run `pnpm exec site-kernel run rfc.supersede.propose --id RFC-0640 --reason "..." --invariant "DNA-N"` instead of working around it.
- If RFC-0638 (profile schema extensions) or RFC-0639 (bindings schema extensions) are not yet implemented, this RFC cannot be implemented — their schema fields are prerequisites. Stop and inform the operator.
