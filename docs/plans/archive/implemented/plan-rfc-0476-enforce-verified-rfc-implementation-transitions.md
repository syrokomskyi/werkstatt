---
rfcId: RFC-0476
planId: PLAN-RFC-0476-01
status: accepted
owner: architecture
createdAt: 2026-07-21
updatedAt: 2026-07-21
scope:
  apps: []
  packages:
    - "@wgogol/forge"
    - "@gogol/site-kernel-checks"
  services: []
  docs:
    - AGENTS.md
    - docs/policies/rfc-governance.md
    - docs/policies/github-branch-protection.yaml
    - docs/requirements.xml
    - docs/technology.xml
    - docs/development-plan.xml
    - docs/knowledge-graph.xml
    - docs/verification-plan.xml
---

# Implementation Plan: RFC-0476

## 1. Objectives

- [ ] Provide one atomic, exclusive `rfc.implement.stamp` path for every `accepted → implemented` transition.
- [ ] Reject invalid transitions using stable `RFC-IMP-*` diagnostics before any RFC or evidence mutation.
- [ ] Version the expected GitHub branch-protection check and validate it offline against CI.
- [ ] Align agent instructions, implementation workflow, Compass contracts, tests, and CI with the new governance boundary.

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/forge/os/rfc/handlers/implement-stamp.ts` — stamp handler, clean-tree/commit/criteria/evidence preconditions, RFC-specific lock, and atomic mutation.
- `packages/forge/os/rfc/rfc.module.ts` and `packages/forge/os/rfc/index.ts` — typed command registration and exports.
- `packages/forge/os/rfc/types.ts` — `RfcImplementStamp*` result contracts.
- `packages/forge/os/rfc/handlers/validate-rules.ts` — reusable, single-source criterion semantics for V-26/V-27 and stamp validation.
- `packages/os/site-kernel-checks/src/ci-local.ts` and `packages/os/site-kernel-checks/src/command-tables/20-ecosystem.ts` — offline branch-policy validator and local CI gate registration.

### 2.2 Configuration and data

- `docs/policies/github-branch-protection.yaml` — authored policy containing the protected branch and stable required GitHub Actions check name.
- `.github/workflows/ci.yml` — stable job name and full RFC validation step; no authenticated GitHub API call.

### 2.3 Documentation and specs

- `AGENTS.md`, `docs/policies/rfc-governance.md`, and `packages/forge/skills/fo/fo-idea-implement/SKILL.md` — replace direct status edits with the stamp workflow for every actor.
- The six root Compass documents listed in frontmatter — synchronize command ownership, requirements, graph edges, rollout, and verification.
- `docs/rfcs/archive/implemented/rfc-0224-allow-agents-to-stamp-rfc-implementation-status.md` — add reciprocal `amendedBy: [RFC-0476]` only after RFC-0476 is implemented.

### 2.4 Validation and pipelines

- Unit tests for all `RFC-IMP-*` failures and atomic success.
- Integration test for command registration, flags, and JSON result.
- `pnpm --filter @wgogol/forge build:check`, `pnpm --filter @wgogol/forge test`, and `pnpm --filter @gogol/site-kernel-checks build:check/test`.
- `ci.local.validate`, targeted/full `rfc.validate`, and CI workflow parity.

## 3. Step sequence

### Step 1. Extract transition validation primitives

**Goal:** Centralize criterion checks and define the stamp result vocabulary without changing RFC state.

**Agent actions:**

- Add `RfcImplementStampData`, `RfcImplementStampViolation`, and result types.
- Extract reusable top-level checkbox/evidence evaluation from `validate-rules.ts`; preserve V-26/V-27 behavior and tests.
- Add focused unit tests for extraction parity.

**Validation:**

- `pnpm --filter @wgogol/forge test`
- `pnpm --filter @wgogol/forge build:check`

**Completion criterion:** V-26/V-27 and stamp precondition logic use one criterion-evaluation source.

**Human review:** no.

---

### Step 2. Implement and register atomic stamp command

**Goal:** Introduce the sole mutation path for implemented status.

**Agent actions:**

- Implement `rfc.implement.stamp --id --implementation-commit [--dry-run]`.
- Require accepted status, clean working tree, reachable commit containing the RFC ID, valid criteria, and required probe evidence.
- Add RFC-specific exclusive locking and temporary evidence handling so concurrent/interrupted operations publish no partial state.
- Register the command with `mutatesState`, declared reads/writes, typed flags, and stable `RFC-IMP-01..06` output.

**Validation:**

- Unit tests for every rejection path and atomic success.
- CLI/registry integration test for flags and JSON output.

**Completion criterion:** The command can stamp a valid fixture RFC and every invalid precondition exits non-zero without writing RFC/evidence state.

**Human review:** no.

---

### Step 3. Add offline branch-protection policy validation

**Goal:** Keep the required GitHub check name versioned and synchronized with CI without GitHub API credentials.

**Agent actions:**

- Add `docs/policies/github-branch-protection.yaml` with protected branch and required check `Package quality and author checks`.
- Implement `github.branch-protection.validate` to parse the policy and `.github/workflows/ci.yml`, confirm the job name and full RFC validation step, and emit stable diagnostics.
- Include the validator in `ci.local.validate` and preserve CI/local command parity.

**Validation:**

- Unit tests for valid policy, missing job, renamed job, malformed policy, and absent RFC validation step.
- `pnpm exec site-kernel run github.branch-protection.validate --json`
- `pnpm exec site-kernel run ci.local.validate --json`

**Completion criterion:** Offline policy/workflow drift fails locally and in CI without a network request.

**Human review:** yes — operator configures the equivalent GitHub branch rule after the stable job name is merged.

---

### Step 4. Update governance and Compass contracts

**Goal:** Make the stamp command mandatory for agents and architecture humans and preserve machine-readable repository truth.

**Agent actions:**

- Update root and Forge agent guidance plus RFC governance policy to require implementation commit → stamp command → separate stamp commit.
- Add RFC-0476 reciprocal amendment metadata to RFC-0224 once implementation succeeds.
- Synchronize affected Compass XML documents, command documentation, and generated command/ecosystem projections through their owning generators.

**Validation:**

- `pnpm exec site-kernel run rfc.validate`
- `pnpm exec site-kernel run ecosystem.manifest.validate --json`
- `pnpm exec site-kernel run command.manifest.validate --json`

**Completion criterion:** Documentation, generated projections, and command registry describe the same transition procedure.

**Human review:** yes — operator verifies the external GitHub branch rule matches the committed policy.

---

### Step 5. Run focused and repository verification

**Goal:** Prove the new enforcement is integrated without breaking current RFC governance.

**Agent actions:**

- Run all scoped Forge and site-kernel-checks checks.
- Exercise stamp command fixtures for success, dirty tree, invalid commit, missing criteria evidence, missing probes, and concurrent lock conflict.
- Run full RFC validation and inspect CI workflow parity.
- Update every RFC-0476 acceptance criterion with evidence.

**Validation:**

- `pnpm --filter @wgogol/forge build:check`
- `pnpm --filter @wgogol/forge test`
- `pnpm --filter @gogol/site-kernel-checks build:check`
- `pnpm --filter @gogol/site-kernel-checks test`
- `pnpm exec site-kernel run github.branch-protection.validate --json`
- `pnpm exec site-kernel run ci.local.validate --json`
- `pnpm exec site-kernel run rfc.validate`

**Completion criterion:** All scoped checks pass and RFC-0476 contains only checked, evidenced criteria before it is stamped.

**Human review:** yes — before the final stamp, the operator explicitly confirms that the GitHub branch rule matching the committed policy is active.

## 4. Validation suite

### 4.1 Required checks

- `pnpm --filter @wgogol/forge build:check`
- `pnpm --filter @wgogol/forge test`
- `pnpm --filter @gogol/site-kernel-checks build:check`
- `pnpm --filter @gogol/site-kernel-checks test`
- `pnpm exec site-kernel run github.branch-protection.validate --json`
- `pnpm exec site-kernel run ci.local.validate --json`
- `pnpm exec site-kernel run rfc.validate`

### 4.2 Evidence artifacts

- Commits referencing `RFC-0476` for implementation and final stamp.
- Targeted test output and inline evidence on every checked RFC-0476 criterion.
- Generated command/ecosystem projections refreshed only through owning generators.

## 5. Risks and mitigation

| Risk | Mitigation |
| --- | --- |
| Incorrect implementation commit | Step 2 requires a reachable SHA containing RFC-0476. |
| Partial or concurrent mutation | Step 2 adds lock and temporary/atomic publication tests. |
| External branch-rule drift | Steps 3–4 version the offline policy, validate CI parity, and require operator confirmation before the final stamp. |
| Incomplete governance rollout | Step 4 updates every active instruction and Compass surface. |

## 6. Escalation triggers

- If the stamp command cannot atomically coordinate RFC and evidence publication without violating the existing atomic-write contract, run `pnpm exec site-kernel run rfc.supersede.propose --id RFC-0476 --reason "Atomic transition evidence cannot be proven with the existing storage primitives" --invariant "RFC-0330"`.
- If enforcing the policy requires an authenticated external GitHub API integration, stop and create a follow-up RFC rather than adding credentials or network dependencies to CI.
