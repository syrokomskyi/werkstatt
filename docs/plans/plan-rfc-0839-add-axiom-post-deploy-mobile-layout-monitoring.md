---
rfcId: RFC-0839
planId: PLAN-RFC-0839-01
status: draft
owner: architecture
createdAt: 2026-08-14
updatedAt:
scope:
  apps: []
  packages:
    - packages/werkstatt-site
  services: []
  docs:
    - docs/architecture-dna.md
    - docs/verification-plan.xml
    - systems/methodologies.md
---

# Implementation Plan: RFC-0839

## 1. Objectives

- [ ] Objective 1 — Extend `methodologies-config.ts` schema with `mobile-layout` instrument type (maps to acceptance criteria 1, 2)
- [ ] Objective 2 — Declare `mobile-layout-stability` methodology in `systems/methodologies.md` with `active: false` (maps to acceptance criteria 3, 4, 5)
- [ ] Objective 3 — Establish DNA-70 in `docs/architecture-dna.md` and update `docs/verification-plan.xml` (maps to acceptance criteria 9, 11)
- [ ] Objective 4 — Add unit tests for schema extension and verify `methodologies.validate` passes (maps to acceptance criteria 6, 8)
- [ ] Objective 5 — Fix `successSignals` inconsistency noted in design summit (consensus finding A2+Q1)
- [ ] Objective 6 — Validate, review, fix, and stamp implemented (maps to acceptance criteria 12)

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/werkstatt-site/src/checks/methodologies-config.ts` — add `mobile-layout` to `instrumentConfigSchema` enum and `KNOWN_INSTRUMENT_TYPES` array; add `mobile-layout-stability` to `KNOWN_METHODOLOGY_IDS` array
- `packages/werkstatt-site/src/checks/tests/methodologies-config.test.ts` — add test case for `mobile-layout` instrument type
- `packages/werkstatt-site/src/checks/axiom-adapter.ts` — no change (existing `mapMethodologiesConfig` is generic)

### 2.2 Configuration and data

- `systems/methodologies.md` — add `mobile-layout-browser` instrument entry and `mobile-layout-stability` methodology entry with `active: false`

### 2.3 Documentation and specs

- `docs/architecture-dna.md` — append `## DNA-70` entry
- `docs/verification-plan.xml` — add `mobile-layout-stability` methodology to verification methods
- `docs/rfcs/rfc-0839-add-axiom-post-deploy-mobile-layout-monitoring.md` — fix `successSignals` frontmatter inconsistency (summit consensus finding)

### 2.4 Validation and pipelines

- `pnpm exec werkstatt run rfc.validate --id RFC-0839`
- `pnpm exec werkstatt run methodologies.validate`
- `pnpm --filter @warpgogol/werkstatt-site run build:check`
- `pnpm --filter @warpgogol/werkstatt-site run test`

## 3. Step sequence

### Step 1. Extend methodologies-config.ts schema

**Goal:** Add `mobile-layout` as a valid instrument type and `mobile-layout-stability` as a known methodology ID.

**Agent actions:**

- Add `"mobile-layout"` to the `z.enum()` in `instrumentConfigSchema` (line 22-31)
- Add `"mobile-layout"` to `KNOWN_INSTRUMENT_TYPES` array (line 73-82)
- Add `"mobile-layout-stability"` to `KNOWN_METHODOLOGY_IDS` array (line 62-71)

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check` — TypeScript compiles

**Completion criterion:** `methodologies-config.ts` exports `mobile-layout` in `KNOWN_INSTRUMENT_TYPES` and `mobile-layout-stability` in `KNOWN_METHODOLOGY_IDS`; `instrumentConfigSchema` accepts `type: "mobile-layout"`.

**Human review:** no

---

### Step 2. Declare methodology in systems/methodologies.md

**Goal:** Add the instrument and methodology entries to the workshop config.

**Agent actions:**

- Add instrument entry to `instruments[]`:
  ```yaml
  - id: mobile-layout-browser
    type: mobile-layout
    params: {}
  ```
- Add methodology entry to `methodologies[]`:
  ```yaml
  - id: mobile-layout-stability
    instrument: mobile-layout-browser
    active: false
    blockOn: [high, critical]
  ```

**Validation:**

- `pnpm exec werkstatt run methodologies.validate` — passes with 9 instruments and 9 methodologies

**Completion criterion:** `systems/methodologies.md` contains `mobile-layout-browser` instrument and `mobile-layout-stability` methodology with `active: false`.

**Human review:** no

---

### Step 3. Add unit tests for schema extension

**Goal:** Verify the schema accepts the new instrument type and rejects invalid ones.

**Agent actions:**

- Add test case in `methodologies-config.test.ts`: parse a config with `type: "mobile-layout"` instrument and verify it passes
- Add test case: verify `KNOWN_INSTRUMENT_TYPES` includes `"mobile-layout"`
- Add test case: verify `KNOWN_METHODOLOGY_IDS` includes `"mobile-layout-stability"`

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run test` — all tests pass

**Completion criterion:** New test cases pass; existing tests still pass.

**Human review:** no

---

### Step 4. Establish DNA-70 and update Compass docs

**Goal:** Add the DNA invariant and sync verification plan.

**Agent actions:**

- Append to `docs/architecture-dna.md`:
  ```markdown
  ## DNA-70 · Axiom post-deploy mobile layout monitoring

  The workshop extends Axiom post-deploy monitoring with a `mobile-layout` instrument type and `mobile-layout-stability` methodology. This is the L5 (post-deploy) layer of the three-layer mobile layout validation strategy (RFC-0837 static CSS, RFC-0838 Playwright pre-deploy, RFC-0839 Axiom post-deploy). The methodology runs against live URLs after deployment and checks horizontal overflow, orientation stability, address bar shift, and CLS on real device presets. Enforcement: `mission.check`, `methodologies.validate`. Established by RFC-0839.
  ```
- Update `docs/verification-plan.xml` to include `mobile-layout-stability` methodology in the verification methods section
- Run `pnpm exec werkstatt run dna.registry.validate` to verify DNA-70 is registered

**Validation:**

- `pnpm exec werkstatt run dna.registry.validate` — passes
- `pnpm exec werkstatt run rfc.validate --id RFC-0839` — passes

**Completion criterion:** DNA-70 entry exists in `docs/architecture-dna.md`; `docs/verification-plan.xml` includes `mobile-layout-stability`; `dna.registry.validate` passes.

**Human review:** no

---

### Step 5. Fix successSignals inconsistency (summit finding)

**Goal:** Resolve the consensus finding from the design summit — `successSignals` says `active: true` but rollout says `active: false` initially.

**Agent actions:**

- Edit the RFC frontmatter `successSignals` entry to say `active: false` instead of `active: true`, matching the rollout plan and acceptance criteria

**Validation:**

- `pnpm exec werkstatt run rfc.validate --id RFC-0839` — passes

**Completion criterion:** `successSignals` in RFC frontmatter says `active: false`, consistent with rollout step 2 and acceptance criterion 5.

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize all documentation artifacts, run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Verify every file listed in `scope.docs` is updated — check each path against `git diff`.
- Run `pnpm exec werkstatt run ecosystem.manifest.generate` if command surfaces changed (no new commands — skip).
- **Run code review:** invoke `fo-review` via the `skill` tool on all session code changes. Wait for the review report in `docs/reviews/code/`.
- **Run fix if needed:** if `fo-review` reported findings, invoke `fo-fix` via the `skill` tool. Re-run `fo-review` to confirm all findings are resolved. Maximum 3 iterations.
- **Check off acceptance criteria:** verify each criterion in the RFC against the implemented code. Mark `[x]` for verified criteria.
- **Note:** `rfc.implement.stamp` will enforce `dependsOn: [RFC-0837, RFC-0838]` (RFC-IMP-07). If either dependency is not yet `implemented`, the stamp will fail. This is expected — the plan cannot be stamped until both dependencies are implemented.
- **Stamp the RFC as implemented:** run `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0839 --implementation-commit <sha>`.

**Validation:**

- `git status` — no uncommitted changes from the current session.
- `pnpm exec werkstatt run rfc.validate --id RFC-0839`
- Every file in `scope.docs` is either updated or documented as not-applicable.
- Review report exists in `docs/reviews/code/` for this session.

**Completion criterion:** All documentation artifacts in scope are updated; code review passed (findings fixed if any); all acceptance criteria are checked off; RFC is stamped as `implemented` via `rfc.implement.stamp` (blocked until RFC-0837 and RFC-0838 are implemented).

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp`. Note: stamping is blocked by `dependsOn` until RFC-0837 and RFC-0838 are `implemented`.

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate --id RFC-0839`
- `pnpm --filter @warpgogol/werkstatt-site run build:check`
- `pnpm --filter @warpgogol/werkstatt-site run test`
- `pnpm exec werkstatt run methodologies.validate`
- `pnpm exec werkstatt run dna.registry.validate`

### 4.2 Evidence artifacts

- No acceptance probes declared in RFC frontmatter — `rfc.verification.emit` will produce no evidence file (expected behavior per RFC-0661 discovery).
- Commit messages referencing `RFC-0839` in the subject line.

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --------------- | ---------------------- |
| Execution time increases | Step 2 — methodology starts `active: false`, no runtime impact until activated |
| Overlap with RFC-0838 | Intentional safety net — no mitigation needed |
| dependsOn block | Final Step — `rfc.implement.stamp` enforces RFC-0837/0838 implementation; plan notes this explicitly |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-N, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0839 --reason "..." --invariant "DNA-N"` instead of working around it.
- If the external expert reports that the instrument contract in § Design is insufficient, create an amending RFC via `/fo-idea-create-rfc` with `amends: [RFC-0839]`.
