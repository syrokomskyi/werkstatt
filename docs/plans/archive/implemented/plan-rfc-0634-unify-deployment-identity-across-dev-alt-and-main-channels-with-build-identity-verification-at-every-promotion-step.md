---
rfcId: RFC-0634
planId: PLAN-RFC-0634-01
status: draft
owner: architecture
createdAt: 2026-08-01
updatedAt:
scope:
  apps: []
  packages:
    - packages/ontology
    - packages/ui
    - packages/os/site-kernel-handoff
  services: []
  docs:
    - docs/architecture-dna.md
    - packages/os/site-kernel-handoff/AGENTS.md
    - packages/ui/AGENTS.md
---

# Implementation Plan: RFC-0634

## 1. Objectives

- [ ] Objective 1 — Loosen `buildIdentitySchema.releaseId` regex to accept workpiece IDs — maps to acceptance criterion "buildIdentitySchema has a loosened releaseId regex"
- [ ] Objective 2 — `leitstand.dev-deploy` writes preliminary + final `build-identity.json` with deterministic `distTreeHash` — maps to acceptance criteria for dev-deploy build-identity write, dist cleanup, and hash determinism
- [ ] Objective 3 — `release.prepare` writes preliminary `build-identity.json` and uses workpiece HEAD for `commitSha` — maps to acceptance criteria for release.prepare preliminary write and commitSha source
- [ ] Objective 4 — Open-source page component reads `build-identity.json` locally via `readFileSync(join(process.cwd(), ...))` — maps to acceptance criterion for local file read
- [ ] Objective 5 — `leitstand.propagate` fetches and verifies dev build-identity before deploying to alt — maps to acceptance criteria for propagate dev-URL verification
- [ ] Objective 6 — Documentation updates (DNA-49, AGENTS.md files) — maps to acceptance criteria for DNA-49 prose and AGENTS.md updates
- [ ] Objective 7 — Unit tests for all new behavior — maps to acceptance criterion for unit tests

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/ontology/src/operations/release.ts` — `buildIdentitySchema.releaseId` regex change
- `packages/os/site-kernel-handoff/src/leitstand/leitstand-commands.ts` — `runLeitstandDevDeploy` gains build-identity write steps; `runLeitstandPropagate` gains dev-URL build-identity verification
- `packages/os/site-kernel-handoff/src/release/release-commands.ts` — `runReleasePrepare` gains preliminary build-identity write, `commitSha` source changes to workpiece HEAD, remove preliminary from dist before hash
- `packages/ui/src/sections/open-source-registry/open-source-registry-section.astro` — replace `fetch(Astro.url.origin)` with `readFileSync(join(process.cwd(), ...))`

### 2.2 Configuration and data

- No YAML/JSON config changes. The `build-identity.json` file is generated at runtime by commands.

### 2.3 Documentation and specs

- `docs/architecture-dna.md` — DNA-49 prose update (build-identity verification at every promotion step)
- `packages/os/site-kernel-handoff/AGENTS.md` — Leitstand section: dev-deploy build-identity, propagate dev-URL verification, release.prepare commitSha source
- `packages/ui/AGENTS.md` — document `readFileSync(join(process.cwd(), ...))` pattern for build-time file reads

### 2.4 Validation and pipelines

- `pnpm exec werkstatt run rfc.validate --id RFC-0634`
- `pnpm --filter @warpgogol/ontology run build:check`
- `pnpm --filter @warpgogol/site-kernel-handoff run build:check`
- `pnpm --filter @warpgogol/ui run build:check`
- Unit tests in `packages/os/site-kernel-handoff/src/tests/`

## 3. Step sequence

### Step 1. Loosen `buildIdentitySchema.releaseId` regex

**Goal:** Allow `buildIdentitySchema` to accept both release IDs (`<system-id>-r<NNNNNN>`) and workpiece IDs (`workpiece-<missionId>`).

**Agent actions:**

- Read `packages/ontology/src/operations/release.ts` lines 66-94 to find the `buildIdentitySchema` definition
- Change the `releaseId` field from `z.string().regex(RELEASE_ID_REGEX)` to `z.string().regex(/^(workpiece-)?[a-z0-9]+(-[a-z0-9]+)*(-r\d{6}|-m\d{6})$/)`
- Verify no other fields in `buildIdentitySchema` need changes

**Validation:**

- `pnpm --filter @warpgogol/ontology run build:check`

**Completion criterion:** `buildIdentitySchema.releaseId` accepts both `warpgogol-com-r000006` and `workpiece-warpgogol-com-m000024` formats

**Human review:** no

---

### Step 2. `leitstand.dev-deploy` build-identity write

**Goal:** `runLeitstandDevDeploy` writes preliminary `build-identity.json` to `workpiece/public/.well-known/` before build, removes it from `dist/client/.well-known/` after build, computes `distTreeHash`, writes final `build-identity.json`, and cleans up the preliminary file.

**Agent actions:**

- Read `packages/os/site-kernel-handoff/src/leitstand/leitstand-commands.ts` lines 357-590 (the `runLeitstandDevDeploy` function)
- Before the `execSync("pnpm build", ...)` call (around line 415), add:
  - Create `workpiece/public/.well-known/` directory (`fs.mkdir(..., { recursive: true })`)
  - Write preliminary `build-identity.json` with `releaseId: "workpiece-<missionId>"`, `systemId`, `missionId`, `commitSha` (captured from workpiece HEAD), `buildTimestamp`, placeholder hashes (empty strings), `semver: "0.0.0-workpiece"`, `platformVersion`, `platformSemanticHash`, `targetPlatform: "cloudflare-workers"`
- After the build succeeds and `distPath` is confirmed to exist (around line 445), add:
  - Remove `dist/client/.well-known/build-identity.json` if it exists (the preliminary file copied by Astro's build)
  - Compute `distTreeHash` via `fingerprintTree(distPath)` (or `dist/client` — match the existing `release.prepare` pattern)
  - Compute `siteContentHash` from the workpiece content tree (or use existing hash if available)
  - Write final `build-identity.json` to `dist/client/.well-known/build-identity.json` with real `distTreeHash`, `siteContentHash`, `platformVersion`, `platformSemanticHash`
  - Clean up preliminary `build-identity.json` from `workpiece/public/.well-known/`
- Add `buildIdentity` field to the `DevDeployResult` interface (additive — do not remove existing fields)
- Add `buildIdentity` to the return `data` object

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff run build:check`

**Completion criterion:** `dev-deploy` writes preliminary + final `build-identity.json`, `distTreeHash` excludes the file, result includes `buildIdentity` field

**Human review:** no

---

### Step 3. `release.prepare` preliminary write and commitSha source

**Goal:** `runReleasePrepare` writes a preliminary `build-identity.json` to `workpiece/public/.well-known/` before build, removes it from `dist/client/.well-known/` before hashing, and captures `commitSha` from the workpiece git HEAD.

**Agent actions:**

- Read `packages/os/site-kernel-handoff/src/release/release-commands.ts` lines 121-504 (the `runReleasePrepare` function)
- Change the `commitSha` source: replace `const { commit } = await resolveCurrentEcosystem(workspaceRoot)` (line 214) with a workpiece git HEAD capture: `const commitSha = execSync("git rev-parse HEAD", { cwd: workpieceDir, encoding: "utf-8", stdio: "pipe" }).trim()`
- Before the build step (wherever `pnpm build` or the distribution reuse check happens), add:
  - Create `workpiece/public/.well-known/` directory
  - Write preliminary `build-identity.json` with `releaseId` set to the release ID, `systemId`, `missionId`, `commitSha` (from workpiece HEAD), `buildTimestamp`, placeholder hashes
- After the build and before `fingerprintTree(distDest)` (around line 362), add:
  - Remove `distDest/client/.well-known/build-identity.json` if it exists (the preliminary file copied by Astro's build)
- The existing final write at line 370 remains unchanged
- Clean up preliminary from `workpiece/public/.well-known/` after the build
- Note: when `canReuseDistribution` is true, the workpiece is not rebuilt — skip the preliminary write (documented limitation)

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff run build:check`

**Completion criterion:** `release.prepare` writes preliminary `build-identity.json`, removes it from dist before hashing, uses workpiece HEAD for `commitSha`

**Human review:** no

---

### Step 4. Open-source page component — local file read

**Goal:** Replace the runtime `fetch(Astro.url.origin)` with a local `readFileSync` using `process.cwd()`.

**Agent actions:**

- Read `packages/ui/src/sections/open-source-registry/open-source-registry-section.astro` lines 50-120
- Replace the `fetch(`${Astro.url.origin}/.well-known/build-identity.json`)` call with:
  ```astro
  import { readFileSync } from "node:fs";
  import { join } from "node:path";

  const wellKnownPath = join(process.cwd(), "public", ".well-known", "build-identity.json");
  let deploymentMetadata = { deploymentId: "—", buildTimestamp: "—", commitSha: "—" };
  try {
    const raw = readFileSync(wellKnownPath, "utf8");
    const buildIdentity = JSON.parse(raw);
    deploymentMetadata = {
      deploymentId: buildIdentity.releaseId ?? "—",
      buildTimestamp: buildIdentity.buildTimestamp ?? "—",
      commitSha: buildIdentity.commitSha ?? "—",
    };
  } catch {
    // File not found — keep placeholders
  }
  ```
- Remove the `fetch` import or any `Astro.url.origin` references
- Update the component header comment/CHANGE_SUMMARY if present

**Validation:**

- `pnpm --filter @warpgogol/ui run build:check`

**Completion criterion:** Component reads `build-identity.json` from `process.cwd()/public/.well-known/` via `readFileSync`, no `fetch(Astro.url.origin)` calls remain

**Human review:** no

---

### Step 5. `leitstand.propagate` dev-URL build-identity verification

**Goal:** `runLeitstandPropagate` fetches `build-identity.json` from the dev channel URL and verifies `missionId`, `commitSha`, `distTreeHash`, and `siteContentHash` against the release manifest before deploying to alt.

**Agent actions:**

- Read `packages/os/site-kernel-handoff/src/leitstand/leitstand-commands.ts` lines 602-915 (the `runLeitstandPropagate` function)
- After the release manifest read and before the Axiom evidence gate (around line 640), add:
  - Read the registry entry to get `entry.deployment`
  - Resolve dev channel config: `const devConfig = getChannelConfig(dep, "dev")`
  - Fetch `build-identity.json` from `${devConfig.url}/.well-known/build-identity.json?cb=${Date.now()}`
  - Parse with `buildIdentitySchema.safeParse()`
  - Verify `missionId` matches `releaseManifest.missionId`
  - Verify `commitSha` matches `releaseManifest.commitSha`
  - Verify `distTreeHash` matches `releaseManifest.distTreeHash`
  - Verify `siteContentHash` matches `releaseManifest.siteContentHash`
  - Skip `behaviorSnapshotHash` (empty for workpiece)
  - Throw actionable error messages on any mismatch
- Add `devBuildIdentityVerified: boolean` and `axiomEvidenceVerified: boolean` to the `LeitstandPropagateData` interface (additive — preserve existing fields)
- Add these fields to the return `data` object

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff run build:check`

**Completion criterion:** `propagate` fetches and verifies dev build-identity before deploying to alt, result includes `devBuildIdentityVerified` and `axiomEvidenceVerified`

**Human review:** no

---

### Step 6. Documentation updates

**Goal:** Update DNA-49 prose and AGENTS.md files to reflect the new build-identity verification at every promotion step.

**Agent actions:**

- Read `docs/architecture-dna.md` DNA-49 section (around line 207)
- Add prose: "Build-identity verification is required at every promotion step: `leitstand.propagate` fetches `build-identity.json` from the dev channel URL and verifies `missionId`, `commitSha`, `distTreeHash`, and `siteContentHash` against the release manifest before deploying to alt; `leitstand.promote` fetches from the alt channel URL and verifies `releaseId`, `distTreeHash`, `behaviorSnapshotHash`, and `siteContentHash` before deploying to main."
- Read `packages/os/site-kernel-handoff/AGENTS.md` Leitstand section
- Update: `dev-deploy` now writes build-identity (preliminary + final with dist cleanup); `propagate` now verifies build-identity from dev URL; `release.prepare` now uses workpiece HEAD for `commitSha`
- Read `packages/ui/AGENTS.md`
- Add note about the `readFileSync(join(process.cwd(), ...))` pattern for build-time file reads in shared UI components

**Validation:**

- `git diff docs/architecture-dna.md packages/os/site-kernel-handoff/AGENTS.md packages/ui/AGENTS.md`

**Completion criterion:** DNA-49 prose updated, both AGENTS.md files updated with new behavior

**Human review:** no

---

### Step 7. Unit tests

**Goal:** Write unit tests for all new behavior: schema regex change, dev-deploy build-identity write, propagate dev-URL verification, open-source component local read.

**Agent actions:**

- Update `packages/os/site-kernel-handoff/src/tests/release-0608-build-identity.test.ts`:
  - Add test case: `workpiece-warpgogol-com-m000024` passes `buildIdentitySchema` validation
  - Add test case: `workpiece-warpgogol-com-m000024` with invalid characters fails
- Create `packages/os/site-kernel-handoff/src/tests/rfc-0634-dev-deploy-build-identity.test.ts`:
  - Test: dev-deploy writes preliminary `build-identity.json` to `workpiece/public/.well-known/` before build
  - Test: dev-deploy removes preliminary from `dist/client/.well-known/` before computing `distTreeHash`
  - Test: dev-deploy writes final `build-identity.json` with real hashes after hash computation
  - Test: dev-deploy cleans up preliminary from `workpiece/public/.well-known/` after build
  - Test: dev-deploy result includes `buildIdentity` field
  - Test: `distTreeHash` is deterministic across rebuilds
- Create `packages/os/site-kernel-handoff/src/tests/rfc-0634-propagate-dev-verification.test.ts`:
  - Test: propagate fetches build-identity from dev URL and verifies `missionId`, `commitSha`, `distTreeHash`, `siteContentHash`
  - Test: propagate throws when dev build-identity is missing
  - Test: propagate throws when dev build-identity schema is invalid
  - Test: propagate throws when `missionId` mismatches
  - Test: propagate throws when `commitSha` mismatches
  - Test: propagate throws when `distTreeHash` mismatches
  - Test: propagate result includes `devBuildIdentityVerified: true` on success
- Create `packages/ui/src/sections/open-source-registry/open-source-registry-section.test.ts` (or update existing test):
  - Test: component reads `build-identity.json` from `process.cwd()/public/.well-known/` via `readFileSync`
  - Test: component shows placeholder `—` values when file is missing

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff run build:check`
- `pnpm --filter @warpgogol/ui run build:check`

**Completion criterion:** All new tests pass, existing tests still pass

**Human review:** no

---

### Step 8. Validation and acceptance criteria verification

**Goal:** Run all validation checks, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Run `pnpm exec werkstatt run rfc.validate --id RFC-0634`
- Run `pnpm --filter @warpgogol/ontology run build:check`
- Run `pnpm --filter @warpgogol/site-kernel-handoff run build:check`
- Run `pnpm --filter @warpgogol/ui run build:check`
- Check off each acceptance criterion in the RFC against the implemented code
- Run `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0634 --implementation-commit <sha>`

**Validation:**

- `git status` — no uncommitted changes
- `pnpm exec werkstatt run rfc.validate --id RFC-0634`
- All acceptance criteria checked off

**Completion criterion:** All validation passes, RFC stamped as `implemented`

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize all documentation artifacts, run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Verify all `scope.docs` files are updated: `docs/architecture-dna.md`, `packages/os/site-kernel-handoff/AGENTS.md`, `packages/ui/AGENTS.md`
- Run code review: invoke `fo-review` via the `skill` tool on all session code changes
- Run fix if needed: if `fo-review` reported findings, invoke `fo-fix` via the `skill` tool. Re-run `fo-review` to confirm all findings are resolved. Maximum 3 iterations.
- Check off acceptance criteria: verify each criterion in the RFC against the implemented code. Mark `[x]` for verified criteria.
- Stamp the RFC as implemented: run `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0634 --implementation-commit <sha>`

**Validation:**

- `git status` — no uncommitted changes from the current session
- `pnpm exec werkstatt run rfc.validate --id RFC-0634`
- Every file in `scope.docs` is either updated or documented as not-applicable
- Review report exists in `docs/reviews/code/` for this session

**Completion criterion:** All documentation artifacts in scope are updated; code review passed (findings fixed if any); all acceptance criteria are checked off; RFC is stamped as `implemented` via `rfc.implement.stamp`

**Human review:** no

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate --id RFC-0634`
- `pnpm --filter @warpgogol/ontology run build:check`
- `pnpm --filter @warpgogol/site-kernel-handoff run build:check`
- `pnpm --filter @warpgogol/ui run build:check`

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0634` in the subject line (RFC-0265 commit hygiene)
- Review report in `docs/reviews/code/` from `fo-review`

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Preliminary build-identity stale in `public/.well-known/` | Step 2 & 3: mandatory cleanup after build |
| `distTreeHash` non-determinism if sequencing is broken | Step 2 & 3: remove preliminary from `dist/client/.well-known/` before `fingerprintTree` |
| Dev URL unreachable during propagate | Step 5: propagate throws actionable error — intended behavior |
| `public/.well-known/` directory creation | Step 2 & 3: `fs.mkdir(..., { recursive: true })` |
| Agent misinterpretation of build-identity sequencing | Step 6: AGENTS.md updates with explicit sequencing documentation |
| `readFileSync` path resolution in shared UI component | Step 4: use `process.cwd()` not `import.meta.url` |
| `commitSha` mismatch across git repos | Step 3: change `release.prepare` to use workpiece HEAD |
| Schema validation failure for workpiece `releaseId` | Step 1: loosen regex before any build-identity is written |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-48 or DNA-49, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0634 --reason "..." --invariant "DNA-N"` instead of working around it.
- If the `buildIdentitySchema` regex change breaks existing release build-identity validation, investigate whether the regex is too broad — do not revert without a superseding RFC.
