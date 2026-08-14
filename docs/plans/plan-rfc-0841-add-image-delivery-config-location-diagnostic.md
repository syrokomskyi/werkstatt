---
rfcId: RFC-0841
planId: PLAN-RFC-0841-01
status: draft
owner: architecture
createdAt: 2026-08-14
updatedAt:
scope:
  apps: []
  packages:
    - "@warpgogol/werkstatt-site"
  services: []
  docs:
    - packages/werkstatt-site/AGENTS.md
    - docs/architecture-dna.md
---

# Implementation Plan: RFC-0841

## 1. Objectives

- [ ] Add `IMG-DELIVERY-CONFIG-02` location diagnostic to `image.delivery.validate` — maps to acceptance criterion "IMG-DELIVERY-CONFIG-01 warning emitted when config is in root but not in src/" (rule ID changed to `IMG-DELIVERY-CONFIG-02` per grilling decision to distinguish from existing malformed-config warnings that use `IMG-DELIVERY-CONFIG-01`)
- [ ] Add config path to validator summary output — maps to acceptance criterion "Config path logged in validator summary output"
- [ ] Add unit tests for all four file-location combinations — maps to acceptance criteria "Unit test: config in root only / src/ only / both / neither"
- [ ] Update `packages/werkstatt-site/AGENTS.md` to document both `IMG-DELIVERY-CONFIG-01` (malformed config) and `IMG-DELIVERY-CONFIG-02` (location diagnostic) — maps to audit finding (Axis C)
- [ ] Update DNA-72 entry in `docs/architecture-dna.md` to reference `IMG-DELIVERY-CONFIG-02` for location diagnostic — maps to acceptance criterion "DNA-72 entry appended"

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/werkstatt-site/src/checks/image-delivery.ts` — add `IMG-DELIVERY-CONFIG-02` to `ImageDeliveryFinding` union type, add root-location check before `loadDeliveryConfig`, add config path to summary string
- `packages/werkstatt-site/src/checks/tests/image-delivery.test.ts` — add 4 test cases for `IMG-DELIVERY-CONFIG-02` location diagnostic

No new commands. No pipeline changes — `image.delivery.validate` is already in `SITES_CHECK_POSTBUILD_PIPELINE` (`packages/werkstatt-site/src/checks/pipelines/sites-check-postbuild.ts:61`).

### 2.2 Configuration and data

None — no YAML, manifests, or ontology catalogs touched.

### 2.3 Documentation and specs

- `packages/werkstatt-site/AGENTS.md` — update `image.delivery.validate` entry to document `IMG-DELIVERY-CONFIG-01` (malformed config) and `IMG-DELIVERY-CONFIG-02` (location diagnostic)
- `docs/architecture-dna.md` — update DNA-72 entry (line 295-297) to reference `IMG-DELIVERY-CONFIG-02` instead of `IMG-DELIVERY-CONFIG-01` for the location diagnostic

### 2.4 Validation and pipelines

- No pipeline changes. `image.delivery.validate` remains in `SITES_CHECK_POSTBUILD_PIPELINE` at the same position.
- No CI workflow changes.

## 3. Step sequence

### Step 1. Add root-location diagnostic to `image-delivery.ts`

**Goal:** Emit `IMG-DELIVERY-CONFIG-01` warning when `image-delivery.config.yaml` is found in workpiece root but not in `src/`.

**Agent actions:**

- In `runImageDeliveryValidate` (`packages/werkstatt-site/src/checks/image-delivery.ts`), before the existing `loadDeliveryConfig` call (line 236), add:
  - `const rootConfigPath = join(paths.appDirectory, "image-delivery.config.yaml");`
  - `const srcConfigPath = join(paths.srcDirectory, "image-delivery.config.yaml");` (already exists as `configPath` on line 221 — reuse or rename for clarity)
  - Add `IMG-DELIVERY-CONFIG-02` to the `ImageDeliveryFinding` union type (line 48)
  - Check `existsSync(rootConfigPath) && !existsSync(srcConfigPath)` — if true, push `IMG-DELIVERY-CONFIG-02` warning finding with message and fixHint per RFC design section
- Modify the summary string (line 394) to include config path: append `(config: ${existsSync(srcConfigPath) ? srcConfigPath : "not found"})` to the existing summary template

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check` — typecheck passes

**Completion criterion:** `image-delivery.ts` contains root-location check before `loadDeliveryConfig` and summary string includes config path.

**Human review:** no

---

### Step 2. Add unit tests for `IMG-DELIVERY-CONFIG-02` location diagnostic

**Goal:** Cover all four file-location combinations with unit tests.

**Agent actions:**

- Add 4 test cases to `packages/werkstatt-site/src/checks/tests/image-delivery.test.ts`:
  1. "IMG-DELIVERY-CONFIG-02: warns when config is in root but not in src/" — write config to `appDir/image-delivery.config.yaml` (not `srcDir/`), verify `IMG-DELIVERY-CONFIG-02` warning finding with severity "warning"
  2. "IMG-DELIVERY-CONFIG-02: no warning when config is in src/ only" — write config to `srcDir/` (existing `writeConfig` helper), verify no `IMG-DELIVERY-CONFIG-02` location warning (malformed-config warnings from existing tests are separate)
  3. "IMG-DELIVERY-CONFIG-02: no warning when config is in both root and src/" — write config to both locations, verify no `IMG-DELIVERY-CONFIG-02` location warning (src/ takes precedence)
  4. "IMG-DELIVERY-CONFIG-02: no warning when config is in neither location" — no config files written, verify no `IMG-DELIVERY-CONFIG-02` warning
- Add a helper function `writeRootConfig(yaml: string)` that writes to `join(appDir, "image-delivery.config.yaml")` (mirroring existing `writeConfig` which writes to `srcDir/`)

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run test -- --reporter=verbose` — all image-delivery tests pass (existing + 4 new)

**Completion criterion:** 4 new test cases pass, all existing tests still pass.

**Human review:** no

---

### Step 3. Update `packages/werkstatt-site/AGENTS.md`

**Goal:** Document `IMG-DELIVERY-CONFIG-01` rule in the `image.delivery.validate` entry.

**Agent actions:**

- In `packages/werkstatt-site/AGENTS.md`, find the `image.delivery.validate` entry in the Check commands section
- Update the description to include `IMG-DELIVERY-CONFIG-01` (malformed config warnings: missing overrides, not an array, invalid entry, YAML parse failure) and `IMG-DELIVERY-CONFIG-02` (location diagnostic: warning when config is in workpiece root but not in `src/`)

**Validation:**

- Visual inspection — AGENTS.md entry mentions `IMG-DELIVERY-CONFIG-01`

**Completion criterion:** `packages/werkstatt-site/AGENTS.md` documents `IMG-DELIVERY-CONFIG-01` in the `image.delivery.validate` entry.

**Human review:** no

---

### Step 4. Verify DNA-72 and run validation

**Goal:** Confirm DNA-72 entry exists and all validation passes.

**Agent actions:**

- Update `docs/architecture-dna.md` DNA-72 entry (line 295-297): change `IMG-DELIVERY-CONFIG-01` to `IMG-DELIVERY-CONFIG-02` in the description of the location diagnostic instance
- Run `pnpm exec werkstatt run rfc.validate --id RFC-0841` — passes with zero violations
- Run `pnpm --filter @warpgogol/werkstatt-site run build:check` — typecheck passes
- Run `pnpm --filter @warpgogol/werkstatt-site run test` — all tests pass

**Validation:**

- `rfc.validate --id RFC-0841` — zero violations
- `build:check` — zero type errors
- `test` — all tests pass

**Completion criterion:** All validation commands pass clean.

**Human review:** no

---

### Step 5. Commit implementation, emit evidence, stamp implemented

**Goal:** Commit code changes, emit verification evidence, stamp RFC as implemented.

**Agent actions:**

- Commit implementation changes via `pnpm exec werkstatt run ecosystem.commit --message "feat: add IMG-DELIVERY-CONFIG-01 location diagnostic (RFC-0841)"`
- Run `pnpm exec werkstatt run rfc.verification.emit --id RFC-0841` — emit evidence file (if acceptance probes exist)
- Check off all acceptance criteria in the RFC file with inline `(evidence: ...)` annotations
- Run `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0841` (auto-detects implementation commit)
- Commit the stamped RFC separately via `ecosystem.commit`

**Validation:**

- `git status` — clean working tree
- `rfc.validate --id RFC-0841` — passes
- RFC status is `implemented`

**Completion criterion:** RFC is stamped as `implemented`, all acceptance criteria checked off with evidence annotations, two separate commits (implementation + stamp).

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize all documentation artifacts, run code review and fix, verify acceptance criteria.

**Agent actions:**

- Verify `packages/werkstatt-site/AGENTS.md` is updated (Step 3)
- Run `pnpm exec werkstatt run ecosystem.manifest.generate` if command surfaces changed (no new commands — skip)
- **Run code review:** invoke `fo-review` via the `skill` tool on all session code changes
- **Run fix if needed:** if `fo-review` reported findings, invoke `fo-fix`
- **Verify every file listed in `scope.docs` is updated** — check `packages/werkstatt-site/AGENTS.md` against `git diff`
- Confirm all acceptance criteria are checked off with `(evidence: ...)` annotations

**Validation:**

- `git status` — no uncommitted changes from the current session
- `pnpm exec werkstatt run rfc.validate --id RFC-0841`
- Review report exists in `docs/reviews/code/` for this session

**Completion criterion:** All documentation artifacts in scope are updated; code review passed (findings fixed if any); all acceptance criteria checked off with inline `(evidence: ...)` annotations; RFC is stamped as `implemented`.

**Human review:** no

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate --id RFC-0841`
- `pnpm --filter @warpgogol/werkstatt-site run build:check`
- `pnpm --filter @warpgogol/werkstatt-site run test`
- `pnpm exec werkstatt run rfc.verification.emit --id RFC-0841` (if acceptance probes declared)

### 4.2 Evidence artifacts

- `docs/rfcs/verification/rfc-0841.generated.json` — verification evidence (if probes exist)
- Commit messages referencing `RFC-0841` in the subject line

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| False positive for sites with intentional root-level `image-delivery.config.yaml` | Step 2 test case 3 verifies no warning when config exists in both locations (src/ takes precedence) |
| RFC-0840 interaction: file restored to root after re-materialization | Diagnostic is non-blocking (warning severity) — operator sees the warning and moves file to `src/`. Plan includes note that operator should move file to `src/` after first warning to break the persistence cycle. Not a blocker for this RFC. |

## 6. Escalation triggers

- If implementation reveals that `IMG-DELIVERY-CONFIG-01` rule ID conflicts with existing malformed-config warnings in a way that breaks downstream consumers, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0841 --reason "rule ID conflict requires separate rule IDs" --invariant "DNA-72"` instead of working around it.
