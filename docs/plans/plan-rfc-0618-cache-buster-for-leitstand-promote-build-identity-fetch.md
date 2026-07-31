---
rfcId: RFC-0618
planId: PLAN-RFC-0618-01
status: draft
owner: architecture
createdAt: 2026-07-31
updatedAt:
scope:
  apps: []
  packages:
    - "@warpgogol/site-kernel-handoff"
  services: []
  docs: []
---

# Implementation Plan: RFC-0618

## 1. Objectives

- [ ] Objective 1 — append `?cb=<timestamp>` to the `build-identity.json` fetch URL in `leitstand.promote` — maps to acceptance criterion "leitstand.promote appends ?cb=<timestamp> to the build-identity.json fetch URL"
- [ ] Objective 2 — add unit test verifying cache-buster is present in build-identity fetch URL — maps to acceptance criterion "Unit test: build-identity fetch URL includes cache-buster query param"
- [ ] Objective 3 — add unit test verifying health check route probe URLs do NOT include cache-buster — maps to acceptance criterion "Unit test: health check route probe URLs do NOT include cache-buster query param"
- [ ] Objective 4 — verify `rfc.validate` passes — maps to acceptance criterion "rfc.validate passes on this file"
- [ ] Objective 5 — verify first `leitstand.promote` after fresh `leitstand.propagate` succeeds without manual retry — maps to acceptance criterion "First leitstand.promote after a fresh leitstand.propagate succeeds without manual retry" (verified via unit test success path + code review)

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/os/site-kernel-handoff/src/leitstand/leitstand-commands.ts` — line 557: add `?cb=${Date.now()}` to `buildIdentityUrl` construction
- `packages/os/site-kernel-handoff/src/tests/leitstand-0608-promote.test.ts` — add positive cache-buster test (build-identity fetch URL includes `?cb=`)
- `packages/os/site-kernel-handoff/src/tests/cloudflare-workers.test.ts` — add negative cache-buster test (health check probe URLs do NOT include `?cb=`)

### 2.2 Configuration and data

None — no configuration, schema, or manifest changes.

### 2.3 Documentation and specs

- RFC file (read-only reference): `docs/rfcs/rfc-0618-cache-buster-for-leitstand-promote-build-identity-fetch.md`
- No AGENTS.md updates needed — the cache-buster is an implementation detail, not a behavioral contract change. The `packages/os/site-kernel-handoff/AGENTS.md` Leitstand section documents that `leitstand.promote` "fetches `/.well-known/build-identity.json` from the alt URL" — this remains true; the cache-buster doesn't change the semantic behavior.
- No Compass XML updates needed.
- No `docs/architecture-dna.md` updates needed — DNA-49 is unchanged.

### 2.4 Validation and pipelines

- `pnpm --filter @warpgogol/site-kernel-handoff run build:check` — typecheck
- `pnpm --filter @warpgogol/site-kernel-handoff run test` — unit tests
- `pnpm exec site-kernel run rfc.validate --id RFC-0618` — RFC validation

## 3. Step sequence

### Step 1. Add cache-buster to build-identity fetch URL

**Goal:** Append `?cb=${Date.now()}` to the `build-identity.json` fetch URL in `runLeitstandPromote`.

**Agent actions:**

- Edit `packages/os/site-kernel-handoff/src/leitstand/leitstand-commands.ts` line 557: change `const buildIdentityUrl = \`${altConfig.url}/.well-known/build-identity.json\`;` to `const buildIdentityUrl = \`${altConfig.url}/.well-known/build-identity.json?cb=${Date.now()}\`;`
- Do NOT add cache-busters to any other fetch calls (health check route probes, etc.)

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff run build:check` — typecheck passes

**Completion criterion:** `buildIdentityUrl` includes `?cb=${Date.now()}` and no other fetch URL is modified.

**Human review:** no

---

### Step 2. Add positive unit test — cache-buster in build-identity fetch URL

**Goal:** Verify that the `fetch` mock is called with a URL containing `?cb=` when `leitstand.promote` fetches `build-identity.json`.

**Agent actions:**

- Add a new test in `packages/os/site-kernel-handoff/src/tests/leitstand-0608-promote.test.ts` that:
  - Sets up a valid `alt-deployed` release with matching build identity
  - Mocks `fetch` with `vi.fn()` so the call URL can be inspected
  - Runs `runLeitstandPromote`
  - Asserts `fetch` was called with a URL matching `/.well-known/build-identity.json?cb=\d+`
- Use the existing `createRegistryWithCloudflareAdapter`, `writeReleaseManifest`, `createDistDir`, `storeArtifactCore`, and `VALID_BUILD_IDENTITY` helpers

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff run test -- --reporter=verbose` — new test passes

**Completion criterion:** Test asserts the fetch URL contains `?cb=` followed by digits.

**Human review:** no

---

### Step 3. Add negative unit test — no cache-buster on health check route probes

**Goal:** Verify that health check route probe URLs in the real cloudflare-workers adapter do NOT include the `?cb=` cache-buster.

**Agent actions:**

- Add a new test in `packages/os/site-kernel-handoff/src/tests/cloudflare-workers.test.ts` that:
  - Creates a behavior snapshot file with routes (e.g. `{ path: "/", contentHash: null }` and `{ path: "/de", contentHash: null }`)
  - Uses the real `createCloudflareWorkersAdapter` (no adapter mock)
  - Mocks `fetch` with `vi.fn()` returning `{ ok: true, status: 200, text: async () => "<html></html>", headers: new Headers() }` for all calls
  - Calls `adapter.health()` with `deploymentUrl: "https://alt.example.com"` and the workspace root containing the behavior snapshot
  - Collects all fetch call URLs
  - Asserts none of the health check route probe URLs contain `?cb=`
- The health check URL construction is at `cloudflare-workers.ts` line 289: `const url = \`${input.deploymentUrl}${route.path === "/" ? "" : route.path}\`` — this is the code being verified

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff run test -- --reporter=verbose` — new test passes

**Completion criterion:** Test asserts health check route probe URLs do NOT contain `?cb=`.

**Human review:** no

---

### Step 4. Run full validation suite

**Goal:** Verify all checks pass before stamping.

**Agent actions:**

- Run `pnpm --filter @warpgogol/site-kernel-handoff run build:check`
- Run `pnpm --filter @warpgogol/site-kernel-handoff run test`
- Run `pnpm exec site-kernel run rfc.validate --id RFC-0618`

**Validation:**

- All three commands exit with code 0

**Completion criterion:** Zero errors across all three validation commands.

**Human review:** no

---

### Step 5. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize documentation, run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- No AGENTS.md, Compass XML, or DNA updates needed — verify via `git diff` that no scope docs were modified.
- Run code review: invoke `fo-review` via the `skill` tool on all session code changes. Wait for the review report in `docs/reviews/code/`.
- Run fix if needed: if `fo-review` reported findings, invoke `fo-fix` via the `skill` tool. Re-run `fo-review` to confirm all findings are resolved. Maximum 3 iterations.
- Check off acceptance criteria: verify each criterion in the RFC against the implemented code. Mark `[x]` for verified criteria with inline `(evidence: <file:line>, <test-or-command>)` annotations.
- Stamp the RFC as implemented: run `pnpm exec site-kernel run rfc.implement.stamp --id RFC-0618 --implementation-commit <sha>` to atomically transition `accepted → implemented`.

**Validation:**

- `git status` — no uncommitted changes from the current session.
- `pnpm exec site-kernel run rfc.validate --id RFC-0618`
- Review report exists in `docs/reviews/code/` for this session.

**Completion criterion:** All acceptance criteria checked off with inline evidence; RFC stamped as `implemented` via `rfc.implement.stamp`; review passed.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp`.

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec site-kernel run rfc.validate --id RFC-0618`
- `pnpm --filter @warpgogol/site-kernel-handoff run build:check`
- `pnpm --filter @warpgogol/site-kernel-handoff run test`

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0618` in the subject line
- Review report in `docs/reviews/code/` for this session

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Log noise — cache-buster query param appears in logs | Cosmetic only; no mitigation needed. Step 1 changes the URL format which is reflected in the log line. |
| CDN edge behavior — some CDNs might ignore query params | Cloudflare Workers CDN honors query params by default. No mitigation needed for the target deployment. |
| False sense of security — cache-buster only on build-identity, not health checks | Step 3 adds a negative test verifying health check probes do NOT have cache-buster, enforcing the constraint. |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-49, run `pnpm exec site-kernel run rfc.supersede.propose --id RFC-0618 --reason "..." --invariant "DNA-49"` instead of working around it.
