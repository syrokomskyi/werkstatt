---
rfcId: RFC-0649
planId: PLAN-RFC-0649-01
status: draft
owner: architecture
createdAt: 2026-08-02
updatedAt:
scope:
  apps: []
  packages:
    - site-kernel-handoff
  services: []
  docs:
    - packages/os/site-kernel-handoff/AGENTS.md
    - docs/architecture-dna.md
    - docs/rfcs/archive/implemented/rfc-0628-amend-dev-deployment-channel-workpiece-based-dev-deploy-with-pre-release-axiom-verification.md
---

# Implementation Plan: RFC-0649

## 1. Objectives

- [ ] Objective 1 — Add null-adapter guard in `runLeitstandDevDeploy` to skip purge + freshness check for `null` adapter (maps to acceptance criterion: "skips purge and freshness check for `null` adapter")
- [ ] Objective 2 — Make purge failure fatal in `runLeitstandDevDeploy` for `cloudflare-workers` adapter by checking `purgeResult.success === false` and returning early with `exitCode: 1` (maps to acceptance criterion: "checks `purgeResult.success === false` and stops pipeline")
- [ ] Objective 3 — Add `verifyFreshness` function that fetches `/.well-known/build-identity.json` from CDN URL and compares `distTreeHash` against local build-identity (maps to acceptance criterion: "fetches `/.well-known/build-identity.json` from CDN URL and compares `distTreeHash`")
- [ ] Objective 4 — Add `FreshnessResult` type and `freshness` field to `DevDeployResult.axiom` (maps to acceptance criterion: "`--json` output includes `freshness` object")
- [ ] Objective 5 — Update `AGENTS.md` and DNA-49 prose to reflect fatal purge + freshness check for `leitstand.dev-deploy` (maps to RFC Rollout section)
- [ ] Objective 6 — Add `RFC-0649` to RFC-0628's `amendedBy` frontmatter (maps to V-19 warning resolution)

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/os/site-kernel-handoff/src/leitstand/leitstand-commands.ts` — `runLeitstandDevDeploy` function (add adapter guard, purge fatal check, freshness verification); `DevDeployResult` interface (add `freshness` field to `axiom`); new `verifyFreshness` function; new `FreshnessResult` interface
- No ontology changes — `PurgeResult` in `@warpgogol/ontology/operations` is unchanged

### 2.2 Configuration and data

- None — no registry, bordbuch, or manifest changes

### 2.3 Documentation and specs

- `packages/os/site-kernel-handoff/AGENTS.md` — Leitstand section line 51: update "Purge failures are non-blocking warnings" to clarify `leitstand.dev-deploy` purge is fatal, while propagate/promote/rollback remain non-blocking
- `docs/architecture-dna.md` — DNA-49 prose (line 213): add freshness guarantee to `leitstand.dev-deploy` description
- `docs/rfcs/archive/implemented/rfc-0628-*.md` — Add `RFC-0649` to `amendedBy` frontmatter field

### 2.4 Validation and pipelines

- No pipeline changes — freshness check runs inside `leitstand.dev-deploy` between purge and Axiom gate
- No CI workflow changes

## 3. Step sequence

### Step 1. Add `FreshnessResult` type and extend `DevDeployResult`

**Goal:** Define the freshness result type and add the `freshness` field to `DevDeployResult.axiom`.

**Agent actions:**

- Add `FreshnessResult` interface to `leitstand-commands.ts` (near `DevDeployResult`):
  ```ts
  interface FreshnessResult {
    verified: boolean;
    cdnDistTreeHash: string | null;
    localDistTreeHash: string;
    error?: string;
  }
  ```
- Add `freshness: FreshnessResult` to `DevDeployResult.axiom`
- Add RFC-0649 entry to `<CHANGE_SUMMARY>` in the file header comment

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff run build:check` — typecheck passes

**Completion criterion:** `DevDeployResult` type includes `freshness` field; typecheck passes.

**Human review:** no

---

### Step 2. Add `verifyFreshness` function

**Goal:** Implement the freshness verification function that fetches `build-identity.json` from the CDN URL and compares `distTreeHash`.

**Agent actions:**

- Add `verifyFreshness` function to `leitstand-commands.ts`:
  - Fetch `${deploymentUrl}/.well-known/build-identity.json` via `fetch()` (single attempt, no retry)
  - Parse JSON response; handle non-200 responses and network errors
  - Compare `cdnBuildIdentity.distTreeHash` against `localDistTreeHash`
  - Return `FreshnessResult` with `verified: true` on match, `verified: false` + error on mismatch/failure
  - Use `BUILD_IDENTITY_PATH` constant from `cache-purge.ts` (already defined as `/.well-known/build-identity.json`)

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff run build:check` — typecheck passes

**Completion criterion:** `verifyFreshness` function exists, is typed, and typecheck passes.

**Human review:** no

---

### Step 3. Add null-adapter guard and purge fatal check in `runLeitstandDevDeploy`

**Goal:** Modify `runLeitstandDevDeploy` to skip purge for `null` adapter and treat purge failure as fatal for `cloudflare-workers` adapter.

**Agent actions:**

- After the deploy step (line ~591), before the purge step (line ~593), add adapter check:
  ```ts
  const isNullAdapter = dep.adapter === "null";
  ```
- Wrap the purge step (lines 593-605) in `if (!isNullAdapter) { ... }`
- After `purgeResult`, check `purgeResult.success === false`:
  - Return early with `exitCode: 1`, `axiom.status: "not-run"`, `freshness: { verified: false, cdnDistTreeHash: null, localDistTreeHash, error: purgeResult.error }`
  - Log via `logger.error`
- For null adapter: skip purge + sleep, set `freshness` to `{ verified: true, cdnDistTreeHash: null, localDistTreeHash: "" }` (no CDN to verify against)

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff run build:check` — typecheck passes

**Completion criterion:** `runLeitstandDevDeploy` skips purge for `null` adapter; treats `purgeResult.success === false` as fatal for `cloudflare-workers` adapter.

**Human review:** no

---

### Step 4. Add freshness check in `runLeitstandDevDeploy`

**Goal:** After purge + sleep (for `cloudflare-workers` adapter), fetch `build-identity.json` from CDN URL and verify `distTreeHash`.

**Agent actions:**

- After purge + sleep (for `cloudflare-workers` adapter only), call `verifyFreshness(deploymentUrl, localDistTreeHash)`
- Read `localDistTreeHash` from the final `build-identity.json` already written to `dist/client/.well-known/build-identity.json` (RFC-0634 step)
- If `freshness.verified === false`:
  - Return early with `exitCode: 1`, `axiom.status: "not-run"`, `freshness` result
  - Log via `logger.error`
- If `freshness.verified === true`:
  - Continue to Axiom gate (existing flow)
  - Include `freshness` in the result `data.axiom`

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff run build:check` — typecheck passes

**Completion criterion:** Freshness check runs after purge for `cloudflare-workers` adapter; mismatch stops pipeline before Axiom gate.

**Human review:** no

---

### Step 5. Update result return value

**Goal:** Ensure `runLeitstandDevDeploy` return value includes `freshness` in `data.axiom` for all code paths (success, purge fatal, freshness mismatch, null adapter).

**Agent actions:**

- Update the success return (line ~673) to include `freshness` in `data.axiom`
- Update the fatal early returns (steps 3 and 4) to include `freshness` in `data.axiom`
- For null adapter: `freshness: { verified: true, cdnDistTreeHash: null, localDistTreeHash: "" }`

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff run build:check` — typecheck passes

**Completion criterion:** All return paths from `runLeitstandDevDeploy` include `freshness` in `data.axiom`.

**Human review:** no

---

### Step 6. Write unit tests

**Goal:** Create unit tests covering all new behavior paths.

**Agent actions:**

- Create `packages/os/site-kernel-handoff/src/tests/leitstand-0649-freshness.test.ts`:
  - Test: null adapter skips purge + freshness check, Axiom runs normally
  - Test: `cloudflare-workers` adapter with missing `CLOUDFLARE_ZONE_ID` → fatal, `exitCode: 1`, `axiom.status: "not-run"`
  - Test: `cloudflare-workers` adapter with purge API failure → fatal, `exitCode: 1`, `axiom.status: "not-run"`
  - Test: `cloudflare-workers` adapter with freshness hash mismatch → fatal, `exitCode: 1`, `axiom.status: "not-run"`, `freshness.verified: false`
  - Test: `cloudflare-workers` adapter with freshness verified → normal flow, Axiom runs, `freshness.verified: true`
  - Test: `--json` output includes `freshness` object with required fields
- Mock `fetch` for freshness verification (use `vi.fn` or `vi.stubGlobal`)
- Mock `runPurgeStep` or Cloudflare API for purge scenarios
- Follow existing test patterns from `leitstand-0628-dev-deploy.test.ts` (temp workspace, `createRegistryWithChannels`, `makeContext`, `makeInput`)
- Add `cloudflare-workers` adapter variant to `createRegistryWithChannels` or create a new helper

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff run test -- --run leitstand-0649` — all new tests pass
- `pnpm --filter @warpgogol/site-kernel-handoff run test -- --run leitstand-0628` — existing tests still pass (null adapter path unchanged)

**Completion criterion:** All new tests pass; existing dev-deploy tests still pass.

**Human review:** no

---

### Step 7. Update AGENTS.md

**Goal:** Update the Leitstand section in `packages/os/site-kernel-handoff/AGENTS.md` to reflect the fatal purge behavior for `leitstand.dev-deploy`.

**Agent actions:**

- Update line 51: change "Purge failures are non-blocking warnings" to clarify that `leitstand.dev-deploy` purge failures are fatal (stop pipeline before Axiom gate), while `leitstand.propagate`, `leitstand.promote`, and `leitstand.rollback` purge failures remain non-blocking warnings
- Add note about freshness check: after purge + sleep, `leitstand.dev-deploy` fetches `build-identity.json` from the CDN URL and verifies `distTreeHash` against the local build-identity before running the Axiom gate
- Add note about null adapter: purge and freshness check are skipped for `null` adapter

**Validation:**

- File content matches the implemented behavior

**Completion criterion:** AGENTS.md Leitstand section reflects fatal purge + freshness check for `leitstand.dev-deploy` only.

**Human review:** no

---

### Step 8. Update DNA-49 prose

**Goal:** Update DNA-49 in `docs/architecture-dna.md` to reflect the freshness guarantee.

**Agent actions:**

- In DNA-49 prose (line 213), update the `leitstand.dev-deploy` description to include: after purge, verifies CDN freshness by fetching `build-identity.json` from the CDN URL and comparing `distTreeHash` against the local build-identity before running the Axiom gate. Purge failure and freshness mismatch are fatal — the Axiom gate is not invoked.

**Validation:**

- File content matches the implemented behavior

**Completion criterion:** DNA-49 prose includes freshness guarantee for `leitstand.dev-deploy`.

**Human review:** no

---

### Step 9. Add RFC-0649 to RFC-0628's amendedBy

**Goal:** Resolve the V-19 validation warning by adding `RFC-0649` to RFC-0628's `amendedBy` frontmatter.

**Agent actions:**

- Edit `docs/rfcs/archive/implemented/rfc-0628-*.md` frontmatter: add `RFC-0649` to the `amendedBy` list

**Validation:**

- `pnpm exec site-kernel run rfc.validate --id RFC-0649` — V-19 warning is resolved

**Completion criterion:** `rfc.validate` passes without V-19 warning for RFC-0649.

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize all documentation artifacts, run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Verify every file listed in `scope.docs` is updated — check each path against `git diff`; if a scope doc was not modified, document why.
- Run `pnpm exec site-kernel run command.manifest.generate` if command surfaces changed (they did not — no new commands, only behavior change to existing `leitstand.dev-deploy`).
- **Run code review:** invoke `fo-review` via the `skill` tool on all session code changes (`git diff <merge-base-of-session>...HEAD`). Wait for the review report in `docs/reviews/code/`.
- **Run fix if needed:** if `fo-review` reported findings, invoke `fo-fix` via the `skill` tool. Re-run `fo-review` to confirm all findings are resolved. Maximum 3 iterations.
- **Check off acceptance criteria:** verify each criterion in the RFC against the implemented code. Mark `[x]` for verified criteria. For unchecked `[ ]` criteria, document why.
- **Stamp the RFC as implemented:** run `pnpm exec site-kernel run rfc.implement.stamp --id RFC-0649 --implementation-commit <sha>` to atomically transition `accepted → implemented` (RFC-0476). The command validates all preconditions (status, criteria, clean tree, commit reachability). Do NOT hand-edit `status`, `implementedAt`, or `closedAt` fields — use the command.

**Validation:**

- `git status` — no uncommitted changes from the current session.
- `pnpm exec site-kernel run rfc.validate --id RFC-0649`
- Every file in `scope.docs` is either updated or documented as not-applicable.
- Review report exists in `docs/reviews/code/` for this session.

**Completion criterion:** All documentation artifacts in scope are updated; code review passed (findings fixed if any); all acceptance criteria are checked off with inline `(evidence: ...)` annotations; RFC is stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476), which validates all preconditions atomically. Code review is automated via `fo-review`.

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec site-kernel run rfc.validate --id RFC-0649`
- `pnpm --filter @warpgogol/site-kernel-handoff run build:check`
- `pnpm --filter @warpgogol/site-kernel-handoff run test -- --run leitstand-0649`
- `pnpm --filter @warpgogol/site-kernel-handoff run test -- --run leitstand-0628` (regression)

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0649` in the subject line (RFC-0265 commit hygiene)
- Unit test file `leitstand-0649-freshness.test.ts` as runtime evidence

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --------------- | ---------------------- |
| CDN propagation delay — single freshness fetch may fail even though purge succeeded | Step 6: test covers freshness fetch failure; operator re-runs `leitstand.dev-deploy` after brief wait (documented in RFC Risks) |
| Cloudflare API downtime — all dev deploys fail during outage | Step 3: purge fatal check correctly fails; Step 6: test covers purge API failure scenario |
| Agent misinterpretation — agents may set dummy `CLOUDFLARE_ZONE_ID` | Step 3: purge API call fails with auth error, still fatal; no bypass path |
| Performance impact — one additional HTTP fetch adds ~200ms | Negligible vs ~8min build + ~8min Axiom; no mitigation needed |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-49, run `pnpm exec site-kernel run rfc.supersede.propose --id RFC-0649 --reason "..." --invariant "DNA-49"` instead of working around it.
- If the freshness check proves too brittle for dev channel (e.g. CDN propagation consistently exceeds 6s sleep), do not add retry — create a new RFC to reconsider the sleep duration or retry strategy.
