---
rfcId: RFC-0823
planId: PLAN-RFC-0823-01
status: draft
owner: architecture
createdAt: 2026-08-13
updatedAt:
scope:
  apps: []
  packages:
    - packages/werkstatt-site
  services: []
  docs:
    - docs/architecture-dna.md
    - docs/technology.xml
    - AGENTS.md
    - packages/werkstatt-site/AGENTS.md
    - docs/rfcs/rfc-0829-add-test-evidence-gates-to-deployment-pipeline.md
---

# Implementation Plan: RFC-0823

## 1. Objectives

- [ ] Objective 1 — Create `packages/werkstatt-site/src/testing/` directory structure with level subdirectories (maps to acceptance criterion: "directory structure created with level subdirectories")
- [ ] Objective 2 — Implement three helper modules: `dev-url-resolver.ts`, `test-env.ts`, `wait-for-deploy.ts` (maps to acceptance criteria for each helper)
- [ ] Objective 3 — Verify DNA-66 invariant is present in `docs/architecture-dna.md` (maps to acceptance criterion: "DNA-66 invariant added")
- [ ] Objective 4 — Verify downstream RFCs 0824–0829 have correct `batch: testing-architecture` and `dependsOn` chains; fix RFC-0829 missing RFC-0828 dependency (maps to acceptance criterion: "Downstream RFCs created with correct dependsOn chains")
- [ ] Objective 5 — Update AGENTS.md files and `docs/technology.xml` with testing architecture references (maps to acceptance criterion: "AGENTS.md updated")
- [ ] Objective 6 — Run `rfc.validate` on all created RFCs and fix violations (maps to acceptance criterion: "rfc.validate passes on all created RFCs")

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/werkstatt-site/src/testing/` — new directory tree:
  - `unit/services/` — empty, placeholder for downstream RFC-0824
  - `integration/services/` — empty, placeholder for downstream RFC-0826
  - `contract/` — empty, placeholder for downstream RFC-0827
  - `e2e/` — empty, placeholder for downstream RFC-0828
  - `smoke/` — empty, placeholder for downstream RFC-0825
  - `helpers/dev-url-resolver.ts` — resolves dev channel URLs from `services/registry.yaml` and fleet registry
  - `helpers/test-env.ts` — loads test environment variables from `.env.test`
  - `helpers/wait-for-deploy.ts` — polls a URL until reachable or timeout
  - `helpers/index.ts` — barrel export for helpers
- `packages/werkstatt-site/package.json` — add subpath exports for `./testing/helpers/*` if needed
- `packages/werkstatt-site/src/index.ts` — no changes (testing module is not part of the plugin entry point)

### 2.2 Configuration and data

- `services/registry.yaml` — read-only reference for `dev-url-resolver.ts` (no changes in this RFC)
- `fleet/fleet.sites.yaml` — read-only reference for dev site URLs (no changes in this RFC)

### 2.3 Documentation and specs

- `docs/architecture-dna.md` — verify DNA-66 entry exists (already present at line 279-281)
- `docs/technology.xml` — extend `<testing-stack>` with L1–L5 testing pyramid levels and DNA-66 reference
- `AGENTS.md` (root) — add testing architecture reference section
- `packages/werkstatt-site/AGENTS.md` — add testing directory convention and helper module documentation
- `docs/rfcs/rfc-0829-add-test-evidence-gates-to-deployment-pipeline.md` — fix missing `RFC-0828` in `dependsOn`

### 2.4 Validation and pipelines

- `pnpm exec werkstatt run rfc.validate --id RFC-0823` — must pass
- `pnpm exec werkstatt run rfc.validate` — must pass for all RFCs in the `testing-architecture` batch
- `pnpm --filter @warpgogol/werkstatt-site run build:check` — TypeScript must compile
- `pnpm --filter @warpgogol/werkstatt-site run test` — existing tests must still pass

## 3. Step sequence

### Step 1. Create testing directory structure

**Goal:** Create the `packages/werkstatt-site/src/testing/` directory tree with level subdirectories.

**Agent actions:**

- Create `packages/werkstatt-site/src/testing/unit/services/` directory (with `.gitkeep`)
- Create `packages/werkstatt-site/src/testing/integration/services/` directory (with `.gitkeep`)
- Create `packages/werkstatt-site/src/testing/contract/` directory (with `.gitkeep`)
- Create `packages/werkstatt-site/src/testing/e2e/` directory (with `.gitkeep`)
- Create `packages/werkstatt-site/src/testing/smoke/` directory (with `.gitkeep`)
- Create `packages/werkstatt-site/src/testing/helpers/` directory

**Validation:**

- `ls packages/werkstatt-site/src/testing/{unit,integration,contract,e2e,smoke,helpers}/` — all directories exist

**Completion criterion:** All five level directories and the `helpers/` directory exist under `packages/werkstatt-site/src/testing/`.

**Human review:** no

---

### Step 2. Implement helper modules

**Goal:** Implement the three shared helper modules that downstream RFCs will depend on.

**Agent actions:**

- Implement `packages/werkstatt-site/src/testing/helpers/dev-url-resolver.ts`:
  - Export `resolveServiceDevUrl(serviceId: string): string` — reads `services/registry.yaml` and returns the dev channel URL
  - Export `resolveSiteDevUrl(siteId: string): string` — reads fleet registry and returns the dev-deployed site URL
- Implement `packages/werkstatt-site/src/testing/helpers/test-env.ts`:
  - Export `loadTestEnv(): Record<string, string>` — loads `.env.test` from the package root
  - Export `getTestEnv(key: string): string` — loads and returns a specific env var, throws if missing
- Implement `packages/werkstatt-site/src/testing/helpers/wait-for-deploy.ts`:
  - Export `waitForDeploy(url: string, options?: { timeoutMs?: number; intervalMs?: number }): Promise<void>` — polls URL with fetch until 200 or timeout
- Create `packages/werkstatt-site/src/testing/helpers/index.ts` — barrel re-export of all three modules

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check` — TypeScript compiles
- `pnpm --filter @warpgogol/werkstatt-site run test` — existing tests pass

**Completion criterion:** All three helper modules compile and are exported from the helpers barrel.

**Human review:** no

---

### Step 3. Verify DNA-66 and fix downstream RFC dependencies

**Goal:** Verify DNA-66 is present in `docs/architecture-dna.md` and fix RFC-0829's missing `RFC-0828` dependency.

**Agent actions:**

- Verify `docs/architecture-dna.md` contains `## DNA-66 · Workshop testing pyramid` (already present)
- Read `docs/rfcs/rfc-0829-add-test-evidence-gates-to-deployment-pipeline.md` frontmatter
- Add `RFC-0828` to `dependsOn` list in RFC-0829 (currently missing)
- Run `pnpm exec werkstatt run rfc.validate` to verify all batch RFCs pass

**Validation:**

- `grep "DNA-66" docs/architecture-dna.md` — returns the DNA-66 entry
- `pnpm exec werkstatt run rfc.validate` — no violations targeting RFC-0823 or RFC-0829

**Completion criterion:** DNA-66 present; RFC-0829 dependsOn includes all of 0823–0828; rfc.validate clean for all batch RFCs.

**Human review:** no

---

### Step 4. Update documentation

**Goal:** Update AGENTS.md files and `docs/technology.xml` with testing architecture references.

**Agent actions:**

- Add testing architecture section to root `AGENTS.md` referencing DNA-66 and the five-level pyramid
- Add testing directory convention to `packages/werkstatt-site/AGENTS.md` documenting `src/testing/` structure
- Extend `<testing-stack>` in `docs/technology.xml` with L1–L5 levels and DNA-66 reference
- Run `pnpm exec werkstatt run ecosystem.manifest.generate` if command surfaces or pipeline topology changed (likely not needed — no new commands)

**Validation:**

- `grep "DNA-66\|testing pyramid\|testing architecture" AGENTS.md` — returns the new section
- `grep "DNA-66\|testing pyramid\|L1.*L5" packages/werkstatt-site/AGENTS.md` — returns the new section
- `grep "DNA-66\|testing pyramid" docs/technology.xml` — returns the extended section

**Completion criterion:** All three documentation files have testing architecture references.

**Human review:** no

---

### Step 5. Run validation suite

**Goal:** Run all validation checks to confirm the implementation is complete.

**Agent actions:**

- Run `pnpm exec werkstatt run rfc.validate --id RFC-0823` — must pass
- Run `pnpm --filter @warpgogol/werkstatt-site run build:check` — must pass
- Run `pnpm --filter @warpgogol/werkstatt-site run test` — must pass
- Check off acceptance criteria in the RFC with evidence annotations

**Validation:**

- All commands exit zero
- All acceptance criteria have `[x]` with inline `(evidence: ...)` annotations

**Completion criterion:** All validation commands pass; all acceptance criteria checked off.

**Human review:** no

---

### Step 6. Code review and fix

**Goal:** Run automated code review on all session changes and fix any findings.

**Agent actions:**

- Invoke `fo-review` via the `skill` tool on all session code changes
- If findings reported, invoke `fo-fix` via the `skill` tool
- Re-run `fo-review` to confirm all findings resolved (max 3 iterations)

**Validation:**

- Review report exists in `docs/reviews/code/` for this session
- All findings resolved (or documented as not-applicable)

**Completion criterion:** Code review passed with no unresolved findings.

**Human review:** no

---

### Final Step. Stamp implemented

**Goal:** Stamp RFC-0823 as implemented.

**Agent actions:**

- Run `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0823 --implementation-commit <sha>` to transition `accepted → implemented`
- The command validates all preconditions (status, criteria, clean tree, commit reachability)

**Validation:**

- `grep "status: implemented" docs/rfcs/rfc-0823-establish-workshop-testing-architecture.md` — confirms transition
- `pnpm exec werkstatt run rfc.validate --id RFC-0823` — passes for implemented status

**Completion criterion:** RFC-0823 status is `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476).

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate --id RFC-0823`
- `pnpm --filter @warpgogol/werkstatt-site run build:check`
- `pnpm --filter @warpgogol/werkstatt-site run test`
- `pnpm exec werkstatt run rfc.validate` (full batch validation)

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0823` in the subject line (RFC-0265 commit hygiene)
- Review report in `docs/reviews/code/` from `fo-review`

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --------------- | ---------------------- |
| Dev channel availability | Step 2: `wait-for-deploy.ts` helper with retry logic handles transient unavailability |
| Test credentials | Not in scope for this RFC — downstream RFC-0826 defines `.env.test` contract |
| Pipeline latency | Not in scope for this RFC — downstream RFC-0829 adds pipeline gates |
| False sense of security | Acceptance criteria verify structure, not exhaustive coverage |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-41 or DNA-64, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0823 --reason "..." --invariant "DNA-N"` instead of working around it.
- If downstream RFCs 0824–0829 cannot pass `rfc.validate` after fixing RFC-0829's dependsOn, investigate whether the batch/dependency model needs a separate RFC.
