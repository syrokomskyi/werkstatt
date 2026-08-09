---
rfcId: RFC-0585
planId: PLAN-RFC-0585-01
status: draft
owner: architecture
createdAt: 2026-07-29
updatedAt:
scope:
  apps: []
  packages:
    - "@warpgogol/site-kernel-handoff"
  services: []
  docs:
    - docs/rfcs/rfc-0585-restore-release-prepare-production-build-and-add-release-publish-dist-guard.md
    - packages/os/site-kernel-handoff/AGENTS.md
---

# Implementation Plan: RFC-0585

## 1. Objectives

- [ ] Objective 1 — `release.prepare` runs `astro build` on the mission workpiece (or reuses `distribution/dist` when build input hash matches) — maps to acceptance criterion 1 & 2
- [ ] Objective 2 — `release.prepare` captures production and readable behavior snapshots and runs `behavior.snapshot.diff` — maps to acceptance criterion 3, 4, 5
- [ ] Objective 3 — `release.prepare` computes real `distTreeHash`, `siteContentHash`, `behaviorSnapshotHash`, `readableSnapshotHash` via `@warpgogol/fingerprint` — maps to acceptance criterion 6, 7, 8
- [ ] Objective 4 — `release.publish` refuses to publish when `distTreeHash` is `sha256:pending` — maps to acceptance criterion 9 & 10
- [ ] Objective 5 — Tests and typecheck pass — maps to acceptance criterion 11, 12, 13

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/os/site-kernel-handoff/src/release/release-commands.ts` — `runReleasePrepare` and `runReleasePublish` handlers
- `packages/os/site-kernel-handoff/src/behavior-snapshot/behavior-snapshot-commands.ts` — `runBehaviorSnapshotCapture` and `runBehaviorSnapshotDiff` (called in-process, no changes needed to these functions)
- `packages/os/site-kernel-handoff/src/tests/release-prepare-release-id.test.ts` — existing test may need updates if return shape changes

### 2.2 Configuration and data

- No YAML/JSON config changes.
- No ontology catalog changes.
- `release.yaml` manifest shape is unchanged — only the values written to existing fields change (pending → real hashes).

### 2.3 Documentation and specs

- `packages/os/site-kernel-handoff/AGENTS.md` — add a Release section documenting the restored `release.prepare` behavior (production build, snapshot capture, hash computation) and the `release.publish` dist guard.
- No `docs/*.xml` Compass files need updates — no repository-wide semantics changed.
- No `docs/architecture-dna.md` changes — this RFC restores conformance with existing DNA-48/52/53, it does not introduce new invariants.

### 2.4 Validation and pipelines

- `pnpm --filter @warpgogol/site-kernel-handoff build:check`
- `pnpm --filter @warpgogol/site-kernel-handoff test`
- `pnpm exec site-kernel run rfc.validate --id RFC-0585`

## 3. Step sequence

### Step 1. Add production build and hash computation to `release.prepare`

**Goal:** Replace the "copy dist if exists, write pending hashes" path with a real production build (or reuse), real hash computation, and real snapshot capture.

**Agent actions:**

- Add imports to `release-commands.ts`:
  - `import { fingerprintTree, byteHashFile } from "@warpgogol/fingerprint/semantic";` (for `distTreeHash` and `siteContentHash`)
  - `import { execSync } from "node:child_process";` (for `astro build`)
  - `import { runBehaviorSnapshotCapture, runBehaviorSnapshotDiff } from "../behavior-snapshot/behavior-snapshot-commands.ts";`
- After the existing evidence-copy block (line ~182), before the manifest write:
  1. **Determine build source**: Check if `missions/<id>/distribution/dist` exists. If it does, compute a build input hash from `workpieceTreeHash` (via `fingerprintTree` on the workpiece content directory with semantic mode) + `platformVersion` + `platformSemanticHash`. Compare against a stored hash file in `distribution/` (e.g., `distribution/build-input-hash.json`). If match, reuse `distribution/dist`. If no match or no distribution, run `astro build` in the workpiece directory.
  2. **Run production build** (if needed): `execSync("pnpm exec astro build", { cwd: workpieceDir, stdio: "pipe", timeout: 300_000 })`. Copy the output `dist/` to the staging directory.
  3. **Copy dist to staging**: Copy `workpiece/dist/` (or reused `distribution/dist/`) to `stagingDir/dist/`.
  4. **Capture readable snapshot**: Call `runBehaviorSnapshotCapture` in-process with `{ flags: { dist: <stagingDir>/dist, system: systemId, "build-kind": "readable", release: releaseId }, argv: [], args: [] }` and `context`. Write the result as `readable-snapshot.json` to the staging directory.
  5. **Capture production snapshot**: Same call with `"build-kind": "production"`. Write as `behavior-snapshot.json` (alias `production-snapshot.json`).
  6. **Run behavior snapshot diff**: Call `runBehaviorSnapshotDiff` in-process with baseline=`readable-snapshot.json`, candidate=`behavior-snapshot.json`. Write the diff result as `snapshot-diff.json`. Set `snapshotDiffVerdict` from the diff result.
  7. **Compute `distTreeHash`**: `const distTreeResult = await fingerprintTree(path.join(stagingDir, "dist"), { mode: "byte" });` → `distTreeResult.value`.
  8. **Compute `siteContentHash`**: `fingerprintTree` on the workpiece `src/content/` directory with semantic mode → `.value`.
  9. **Compute `behaviorSnapshotHash`** and **`readableSnapshotHash`**: From the snapshot capture results (`data.behaviorSnapshotHash`).
- Update the `releaseManifest` object to use the computed hash values instead of `"sha256:pending"`.
- Update the return `data` object to include all real hash values and `buildReused: boolean`.
- If `snapshotDiffVerdict` is `fail`, log the differences and throw an error to abort the prepare (do not create the release).

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff build:check` — TypeScript compiles
- Manual review: verify no `"sha256:pending"` strings remain in the `releaseManifest` or return data

**Completion criterion:** `release.prepare` runs `astro build` (or reuses distribution), captures both snapshots, runs diff, computes all hashes via `@warpgogol/fingerprint`, and writes real values to `release.yaml`. No `sha256:pending` values in the manifest.

**Human review:** no

---

### Step 2. Add `distTreeHash` guard to `release.publish`

**Goal:** `release.publish` refuses to publish any release whose `distTreeHash` is `sha256:pending`.

**Agent actions:**

- In `runReleasePublish`, after the existing `snapshotDiffVerdict` check (line ~350) and before the `migratorVerdict` check, add:
  ```ts
  if (manifest.distTreeHash === "sha256:pending" || !manifest.distTreeHash) {
    throw new Error(
      `[release.publish] distTreeHash is pending or missing — run release.prepare to compute a real hash before publishing`,
    );
  }
  ```
- Also verify the `dist/` directory exists in the release directory:
  ```ts
  const distDir = path.join(releaseDir, "dist");
  if (!existsSync(distDir)) {
    throw new Error(
      `[release.publish] release '${releaseId}' has no dist/ directory — run release.prepare to build and stage the distribution`,
    );
  }
  ```

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff build:check` — TypeScript compiles

**Completion criterion:** `release.publish` throws when `distTreeHash` is `sha256:pending` or when `dist/` is missing. Existing valid releases with real hashes still pass.

**Human review:** no

---

### Step 3. Update `ReleasePrepareData` interface and return shape

**Goal:** The TypeScript contract in the RFC must match the code.

**Agent actions:**

- Update `ReleasePrepareData` interface (line ~109) to include the new fields from the RFC:
  ```ts
  export interface ReleasePrepareData {
    releaseId: string;
    systemId: string;
    missionId: string;
    semver: string;
    state: "prepared";
    snapshotDiffVerdict: "pass" | "fail";
    cSurfaceVerdict: "pass" | "fail" | "skipped";
    behaviorSnapshotHash: string;
    distTreeHash: string;
    siteContentHash: string;
    readableSnapshotHash: string;
    buildReused: boolean;
  }
  ```
- Update the return object in `runReleasePrepare` to include all these fields with real values.

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff build:check`

**Completion criterion:** Interface matches the RFC contract. Return object includes all fields with real values.

**Human review:** no

---

### Step 4. Add tests for new behavior

**Goal:** Unit tests covering the new `release.prepare` behavior and the `release.publish` guard.

**Agent actions:**

- Add a test file `packages/os/site-kernel-handoff/src/tests/release-prepare-production-build.test.ts`:
  - Test that `release.prepare` throws when `astro build` fails (mock `execSync` to throw).
  - Test that `release.prepare` computes real `distTreeHash` (not `sha256:pending`) when dist exists.
  - Test that `release.publish` throws when `distTreeHash` is `sha256:pending`.
  - Test that `release.publish` throws when `dist/` directory is missing.
- Use `mkdtempSync` for temp directories, mock `KernelRuntimeContext` with `workspaceRoot` set to the temp dir.
- For the build test, create a minimal `dist/` directory with an `index.html` file to simulate build output.

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff test`

**Completion criterion:** All new tests pass. Tests cover: build failure, real hash computation, publish guard on pending hash, publish guard on missing dist.

**Human review:** no

---

### Step 5. Update `packages/os/site-kernel-handoff/AGENTS.md`

**Goal:** Document the restored release behavior in the package AGENTS.md.

**Agent actions:**

- Add a `## Release commands (RFC-0357 / RFC-0585)` section to `packages/os/site-kernel-handoff/AGENTS.md` documenting:
  - `release.prepare` runs a production `astro build` on the mission workpiece (or reuses `distribution/dist` when build input hash matches).
  - `release.prepare` captures production and readable behavior snapshots from the build output and runs `behavior.snapshot.diff`.
  - `release.prepare` computes `distTreeHash`, `siteContentHash`, `behaviorSnapshotHash`, and `readableSnapshotHash` via `@warpgogol/fingerprint` — never `sha256:pending`.
  - `release.publish` refuses to publish when `distTreeHash` is `sha256:pending` or when `dist/` is missing.

**Validation:**

- Visual review of the AGENTS.md section.

**Completion criterion:** AGENTS.md has a Release section documenting the behavior.

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize all documentation artifacts, run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Verify `packages/os/site-kernel-handoff/AGENTS.md` is updated.
- Run `pnpm exec site-kernel run rfc.validate --id RFC-0585` — must pass.
- Run `pnpm --filter @warpgogol/site-kernel-handoff build:check` — must pass.
- Run `pnpm --filter @warpgogol/site-kernel-handoff test` — must pass.
- **Run code review:** invoke `fo-review` via the `skill` tool on all session code changes. Wait for the review report in `docs/reviews/code/`.
- **Run fix if needed:** if `fo-review` reported findings, invoke `fo-fix` via the `skill` tool. Re-run `fo-review` to confirm all findings are resolved. Maximum 3 iterations.
- **Check off acceptance criteria:** verify each criterion in the RFC against the implemented code. Mark `[x]` for verified criteria with inline `(evidence: ...)` annotations.
- **Stamp the RFC as implemented:** run `pnpm exec site-kernel run rfc.implement.stamp --id RFC-0585 --implementation-commit <sha>`.

**Validation:**

- `git status` — no uncommitted changes from the current session.
- `pnpm exec site-kernel run rfc.validate --id RFC-0585`
- Review report exists in `docs/reviews/code/` for this session.

**Completion criterion:** All acceptance criteria checked off with evidence; RFC stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476).

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec site-kernel run rfc.validate --id RFC-0585`
- `pnpm --filter @warpgogol/site-kernel-handoff build:check`
- `pnpm --filter @warpgogol/site-kernel-handoff test`

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0585` in the subject line (RFC-0265 commit hygiene)
- Review report in `docs/reviews/code/`

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Build time in release.prepare (30–120s) | Step 1 includes reuse logic: when `distribution/dist` exists and build input hash matches, build is skipped |
| Build environment dependency | Step 1 reuses the same `execSync("pnpm exec astro build")` pattern already used in `mission.validate` — no new environment requirements |
| Behavior snapshot capture complexity | Step 1 calls existing `runBehaviorSnapshotCapture` in-process — no new infrastructure |
| Agent misinterpretation (manual hash editing) | Step 2 guard makes pending hashes impossible to publish — agents cannot bypass |
| False positive in reuse hash | Step 1 uses `fingerprintTree` (semantic mode) on workpiece content — deterministic, no timestamps |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-48/52/53, run `pnpm exec site-kernel run rfc.supersede.propose --id RFC-0585 --reason "..." --invariant "DNA-N"` instead of working around it.
- If `behavior.snapshot.capture` or `behavior.snapshot.diff` cannot be called in-process from `release.prepare` (e.g., due to circular import), escalate to the operator — do not duplicate the logic.
