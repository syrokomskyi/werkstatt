---
rfcId: RFC-0638
planId: PLAN-RFC-0638-01
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

# Implementation Plan: RFC-0638

## 1. Objectives

- [ ] O1 — Define `StackProfileDomainFields` types and Zod sub-schemas in a new file — maps to acceptance criterion 1
- [ ] O2 — Extend `stackProfileSchema` in `stack-profile.ts` to include domain fields — maps to acceptance criterion 2
- [ ] O3 — Export new types from `@warpgogol/forge` via `index.ts` — maps to acceptance criterion 3
- [ ] O4 — Verify existing profiles parse without changes — maps to acceptance criterion 4
- [ ] O5 — Unit tests for domain fields parsing, defaults, and invariant id validation — maps to acceptance criterion 5
- [ ] O6 — Update `packages/forge/AGENTS.md` with domain fields documentation — maps to acceptance criterion 6
- [ ] O7 — `rfc.validate` passes on RFC-0638 — maps to acceptance criterion 7

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/forge/src/profiles/profile-schema.ts` — **new file**: `ProfileArtifact`, `ProfileWorkspaceType`, `ProfileInvariant`, `StackProfileDomainFields` interfaces; `profileArtifactSchema`, `profileWorkspaceTypeSchema`, `profileInvariantSchema`, `stackProfileDomainFieldsSchema` Zod schemas; `UNIVERSAL_TERMINOLOGY_KEYS` constant and `TERMINOLOGY_DEFAULTS` map.
- `packages/forge/src/profiles/stack-profile.ts` — **modified**: import domain field schemas and spread into `stackProfileSchema`; extend `StackProfile` interface with domain fields.
- `packages/forge/src/index.ts` — **modified**: export new types (`StackProfileDomainFields`, `ProfileArtifact`, `ProfileWorkspaceType`, `ProfileInvariant`) and schemas from `./profiles/stack-profile.ts`.
- `packages/forge/src/tests/profile-schema.test.ts` — **new file**: unit tests for domain field parsing, defaults, invariant id validation, backward compatibility.

### 2.2 Configuration and data

- No YAML/JSON config files changed. Existing profile YAMLs (`astro-typescript-turborepo.yaml`, `phaser-turborepo.yaml`, `forge-shell.yaml`) remain unchanged — they don't use the new optional fields.

### 2.3 Documentation and specs

- `packages/forge/AGENTS.md` — add "Domain fields" subsection under "Stack profiles (RFC-0392)" documenting the six new optional fields and the universal terminology key catalog.
- No `docs/*.xml` Compass files affected — this is a forge-internal schema extension with no monorepo-wide semantic impact.
- No `docs/architecture-dna.md` changes — no new DNA invariant.

### 2.4 Validation and pipelines

- `pnpm --filter @warpgogol/forge run build:check` — TypeScript compilation.
- `pnpm --filter @warpgogol/forge run test` — vitest including new `profile-schema.test.ts`.
- `pnpm exec site-kernel run rfc.validate --id RFC-0638` — RFC mechanical validation.

## 3. Step sequence

### Step 1. Create domain field types and Zod schemas

**Goal:** Define the six new optional domain fields as TypeScript interfaces and Zod schemas in a new file.

**Agent actions:**

- Create `packages/forge/src/profiles/profile-schema.ts`.
- Define `ProfileArtifact` interface: `id: string`, `extensions: string[]`, `produce?: { command: string; output?: string }`, `validate?: { command: string }`, `determinism?: { hashable: boolean; inputs: string[] }`.
- Define `ProfileWorkspaceType` interface: `id: string`, `detect: { glob?: string; contains?: string; packageJsonDep?: string }`, `skills?: string[]`, `agentsMdTemplate?: string`.
- Define `ProfileInvariant` interface: `id: string`, `rule: string`, `severity: "error" | "warning"`.
- Define `StackProfileDomainFields` interface: `domain?: string`, `terminology?: Record<string, string>`, `artifacts?: ProfileArtifact[]`, `workspaceTypes?: ProfileWorkspaceType[]`, `invariants?: ProfileInvariant[]`, `register?: "business" | "creative"`.
- Define matching Zod schemas: `profileArtifactSchema`, `profileWorkspaceTypeSchema`, `profileInvariantSchema`, `stackProfileDomainFieldsSchema`.
- Add `UNIVERSAL_TERMINOLOGY_KEYS` as a readonly array: `["artifact", "artifactPlural", "module", "source", "output", "verify", "operator"]`.
- Add `TERMINOLOGY_DEFAULTS` as a `Record<string, string>` mapping each universal key to its default term.
- Add Compass `MODULE_CONTRACT` and `CHANGE_SUMMARY` blocks per DNA-42.
- Add `profileInvariantSchema` refinement: `id` must match `^[A-Z]+-\d+$`.

**Validation:**

- `pnpm --filter @warpgogol/forge run build:check` — file compiles without errors.

**Completion criterion:** `profile-schema.ts` exists, exports all types and schemas, and `build:check` passes.

**Human review:** no

---

### Step 2. Extend `stackProfileSchema` with domain fields

**Goal:** Integrate domain fields into the existing stack profile schema so profiles can use them optionally.

**Agent actions:**

- In `packages/forge/src/profiles/stack-profile.ts`:
  - Import `stackProfileDomainFieldsSchema` and domain field types from `./profile-schema.ts`.
  - Spread domain fields into `stackProfileSchema` using `z.object({ ...existingFields, ...stackProfileDomainFieldsSchema.shape })` or merge via `.extend()`.
  - Extend the `StackProfile` interface with `StackProfileDomainFields` (pick the optional fields).
- Update `CHANGE_SUMMARY` in `stack-profile.ts` with `RFC-0638` entry.

**Validation:**

- `pnpm --filter @warpgogol/forge run build:check` — compilation passes.
- Existing `stack-profile.test.ts` still passes (backward compatibility).

**Completion criterion:** `stackProfileSchema` accepts the six new optional fields; existing profiles without them still parse; `build:check` and existing tests pass.

**Human review:** no

---

### Step 3. Export new types from package entrypoint

**Goal:** Make the new domain field types and schemas publicly importable from `@warpgogol/forge`.

**Agent actions:**

- In `packages/forge/src/index.ts`, add to the "Stack profiles (RFC-0392)" export block:
  - `type StackProfileDomainFields`
  - `type ProfileArtifact`
  - `type ProfileWorkspaceType`
  - `type ProfileInvariant`
  - `stackProfileDomainFieldsSchema`
  - `UNIVERSAL_TERMINOLOGY_KEYS`
  - `TERMINOLOGY_DEFAULTS`
- Source from `./profiles/profile-schema.ts` (types) and `./profiles/stack-profile.ts` (re-exported schemas).

**Validation:**

- `pnpm --filter @warpgogol/forge run build:check` — compilation passes.

**Completion criterion:** New types and constants are importable from `@warpgogol/forge`; `build:check` passes.

**Human review:** no

---

### Step 4. Write unit tests

**Goal:** Verify domain fields parse correctly, defaults work, invalid invariant ids fail, and existing profiles remain valid.

**Agent actions:**

- Create `packages/forge/src/tests/profile-schema.test.ts`.
- Test cases:
  1. Profile with all six domain fields parses successfully.
  2. Profile with no domain fields parses successfully (backward compat).
  3. Profile with partial domain fields (only `domain` and `register`) parses.
  4. `terminology` with unknown keys parses (open vocabulary).
  5. `invariants` with invalid id format (e.g. `video-01` lowercase) fails validation.
  6. `invariants` with valid id format (e.g. `VIDEO-01`) passes.
  7. `register` with invalid value (e.g. `personal`) fails validation.
  8. `artifacts` with missing required `extensions` field fails.
  9. All three shipped profiles (`astro-typescript-turborepo`, `phaser-turborepo`, `forge-shell`) still parse without changes.
  10. `UNIVERSAL_TERMINOLOGY_KEYS` contains the 7 documented keys.
  11. `TERMINOLOGY_DEFAULTS` maps each key to a non-empty default string.
- Add Compass `MODULE_CONTRACT` and `CHANGE_SUMMARY` blocks per DNA-42.

**Validation:**

- `pnpm --filter @warpgogol/forge run test` — all tests pass.

**Completion criterion:** All test cases pass; test file covers positive, negative, and backward-compatibility scenarios.

**Human review:** no

---

### Step 5. Update `packages/forge/AGENTS.md`

**Goal:** Document the new domain fields in the forge package's agent guide.

**Agent actions:**

- In `packages/forge/AGENTS.md`, under "Stack profiles (RFC-0392)", add a new subsection "Domain fields (RFC-0638)":
  - List the six optional fields with one-line descriptions.
  - Note that all fields are optional and existing profiles are unaffected.
  - Reference the universal terminology key catalog.
  - Note that `register` is a one-time default for new projects (existing `PREFERENCES.md` is never overwritten).
  - Note that `invariants` enforcement is deferred to follow-up RFCs.

**Validation:**

- Visual review of the added section.

**Completion criterion:** `AGENTS.md` has a "Domain fields (RFC-0638)" subsection with all six fields documented.

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize all documentation artifacts, run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Verify `packages/forge/AGENTS.md` is updated (Step 5).
- No `docs/*.xml` Compass files need updates (forge-internal schema extension).
- No `docs/architecture-dna.md` changes (no new DNA invariant).
- Run `pnpm --filter @warpgogol/forge run build:check` — must pass.
- Run `pnpm --filter @warpgogol/forge run test` — must pass.
- Run `pnpm exec site-kernel run rfc.validate --id RFC-0638` — must pass.
- **Run code review:** invoke `fo-review` via the `skill` tool on all session code changes. Wait for the review report.
- **Run fix if needed:** if `fo-review` reported findings, invoke `fo-fix` via the `skill` tool. Re-run `fo-review` to confirm all findings are resolved. Maximum 3 iterations.
- **Check off acceptance criteria:** verify each criterion in the RFC against the implemented code. Mark `[x]` for verified criteria with inline `(evidence: <file:line>)` annotations.
- **Stamp the RFC as implemented:** run `pnpm exec site-kernel run rfc.implement.stamp --id RFC-0638 --implementation-commit <sha>`.

**Validation:**

- `git status` — no uncommitted changes from the current session.
- `pnpm exec site-kernel run rfc.validate --id RFC-0638` — passes.
- All acceptance criteria checked with evidence annotations.

**Completion criterion:** All documentation in scope is updated; code review passed; all acceptance criteria checked off with evidence; RFC stamped as `implemented`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp`.

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec site-kernel run rfc.validate --id RFC-0638`
- `pnpm --filter @warpgogol/forge run build:check`
- `pnpm --filter @warpgogol/forge run test`

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0638` in the subject line (RFC-0265 commit hygiene).
- Acceptance criteria in the RFC checked with `(evidence: <file:line>)` annotations.

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Schema bloat — six optional fields increase complexity | Step 1: all fields are optional in Zod, existing profiles pay no cost (verified in Step 4, test case 2) |
| Terminology key drift — skills reference keys profiles don't declare | Step 1: `TERMINOLOGY_DEFAULTS` provides fallback for all universal keys; Step 4 test case 4 verifies unknown keys are accepted |
| Invariant id collisions — domain invariants vs DNA invariants | Step 1: `profileInvariantSchema` enforces `^[A-Z]+-\d+$` format; DNA invariants use `DNA-` prefix, domain invariants use domain prefixes (`VIDEO-`, `BOOK-`, etc.) — no collision possible |

## 6. Escalation triggers

- If implementation reveals that `stackProfileSchema.extend()` causes Zod type inference issues that require restructuring the schema, stop and consult the operator before changing the schema architecture.
- If existing profile YAML files fail to parse after the schema extension (backward compatibility break), stop and revise the approach — existing profiles MUST remain valid.
