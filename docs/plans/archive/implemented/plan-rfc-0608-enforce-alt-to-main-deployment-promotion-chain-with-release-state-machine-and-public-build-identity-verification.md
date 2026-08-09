---
rfcId: RFC-0608
planId: PLAN-RFC-0608-01
status: draft
owner: architecture
createdAt: 2026-07-30
updatedAt:
scope:
  apps: []
  packages:
    - "@warpgogol/ontology"
    - "@warpgogol/site-kernel-handoff"
    - "@warpgogol/site-kernel-codegen"
    - "@warpgogol/ui"
  services: []
  docs:
    - docs/COMMANDS.md
    - docs/architecture-dna.md
    - packages/os/site-kernel-handoff/AGENTS.md
---

# Implementation Plan: RFC-0608

## 1. Objectives

- [ ] O1 — Extend `releaseStateSchema` with `alt-deployed` and `promoted` states; add `buildIdentitySchema` — maps to acceptance criteria 1, 15
- [ ] O2 — `release.prepare` writes `build-identity.json` into `dist/client/.well-known/` after hash computation — maps to acceptance criterion 2
- [ ] O3 — `open-source-page.ts` removes `deploymentMetadata` from registry JSON; UI component fetches `build-identity.json` at request time (SSR) — maps to acceptance criterion 3
- [ ] O4 — `leitstand.propagate` loses `--channel` flag, always deploys to alt, transitions release to `alt-deployed` — maps to acceptance criteria 4, 5, 12
- [ ] O5 — New `leitstand.promote` command: state gate, live build-identity fetch, hash verification, health re-check, main deployment, state transition to `promoted` — maps to acceptance criteria 6, 7, 8, 9
- [ ] O6 — `leitstand.rollback` updates release manifest state: main → `rolled-back`, alt → `published` — maps to acceptance criteria 10, 11
- [ ] O7 — Documentation: `docs/COMMANDS.md`, `packages/os/site-kernel-handoff/AGENTS.md`, `docs/architecture-dna.md` DNA-49 — maps to acceptance criteria 13, 14

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/ontology/src/operations/release.ts` — extend `releaseStateSchema`, add `buildIdentitySchema` + `BuildIdentity` type
- `packages/os/site-kernel-handoff/src/release/release-commands.ts` — `runReleasePrepare`: write `build-identity.json` after hash computation (line ~366)
- `packages/os/site-kernel-handoff/src/leitstand/leitstand-commands.ts` — `runLeitstandPropagate`: remove `--channel`, always alt, state transition; new `runLeitstandPromote`; `runLeitstandRollback`: add release state transitions
- `packages/os/site-kernel-handoff/src/leitstand/leitstand.module.ts` — register `leitstand.promote`, update `leitstand.propagate` registration (remove `channel` flag)
- `packages/os/site-kernel-handoff/src/leitstand/index.ts` — export `runLeitstandPromote` + `LeitstandPromoteData`
- `packages/os/site-kernel-codegen/src/open-source-page.ts` — remove `resolveDeploymentMetadata`, `resolveGitCommitSha`, `resolveBuildTimestamp`; remove `deploymentMetadata` from `openSourceRegistryDataSchema` and `buildRegistryData` output
- `packages/ui/src/sections/open-source-registry/open-source-registry-section.astro` — fetch `/.well-known/build-identity.json` server-side at request time; render deployment metadata from fetched data with fallback placeholders

### 2.2 Configuration and data

- `releases/<id>/dist/client/.well-known/build-identity.json` — new static file written by `release.prepare`
- `releases/<id>/release.yaml` — `state` field extended with `alt-deployed`, `promoted`
- `systems/registry.yaml` — `deployment.lastPropagated.main` updated by `leitstand.promote` instead of `leitstand.propagate`

### 2.3 Documentation and specs

- `docs/COMMANDS.md` — update `leitstand.propagate` entry (remove `--channel`), add `leitstand.promote` entry, update `leitstand.rollback` entry (state transitions)
- `docs/architecture-dna.md` — DNA-49: add `leitstand.promote` to enforcement command list
- `packages/os/site-kernel-handoff/AGENTS.md` — update Leitstand section: document new command surface, state machine, build-identity verification

### 2.4 Validation and pipelines

- `pnpm --filter @warpgogol/ontology run build:check`
- `pnpm --filter @warpgogol/site-kernel-handoff run build:check`
- `pnpm --filter @warpgogol/site-kernel-codegen run build:check`
- `pnpm --filter @warpgogol/ui run build:check`
- `pnpm --filter @warpgogol/site-kernel-handoff test`
- `pnpm exec werkstatt run rfc.validate --id RFC-0608`

## 3. Step sequence

### Step 1. Extend ontology schemas

**Goal:** Add `alt-deployed` and `promoted` to `releaseStateSchema`; add `buildIdentitySchema` and `BuildIdentity` type.

**Agent actions:**

- Edit `packages/ontology/src/operations/release.ts`:
  - Extend `releaseStateSchema` enum: add `"alt-deployed"` and `"promoted"` after `"published"`.
  - Add `buildIdentitySchema` (Zod object) with fields: `releaseId`, `systemId`, `missionId`, `semver`, `distTreeHash`, `behaviorSnapshotHash`, `siteContentHash`, `platformVersion`, `platformSemanticHash`, `commitSha`, `buildTimestamp`, `targetPlatform`.
  - Export `type BuildIdentity = z.infer<typeof buildIdentitySchema>`.
- Import `RELEASE_ID_REGEX`, `STERNSYSTEM_ID_REGEX`, `MISSION_ID_REGEX` if not already imported; otherwise use `z.string()` with appropriate validation.

**Validation:**

- `pnpm --filter @warpgogol/ontology run build:check`

**Completion criterion:** `releaseStateSchema` includes 5 states; `buildIdentitySchema` is exported; build passes.

**Human review:** no

---

### Step 2. Write `build-identity.json` in `release.prepare`

**Goal:** `runReleasePrepare` writes `build-identity.json` into `dist/client/.well-known/` after computing all hashes.

**Agent actions:**

- In `packages/os/site-kernel-handoff/src/release/release-commands.ts`, after hash computation (after line ~366, before release manifest write):
  - Construct `BuildIdentity` object from the already-computed values: `releaseId`, `systemId`, `missionId`, `semver`, `platformVersion`, `distTreeHash`, `behaviorSnapshotHash`, `siteContentHash`, `platformSemanticHash`, `commitSha`, `buildTimestamp` (use `now` variable), `targetPlatform` (read from system manifest or hardcode `"cloudflare-workers"`).
  - Write JSON to `path.join(distDest, "client", ".well-known", "build-identity.json")` using `writeFileIfChanged` from `@warpgogol/site-kernel`.
  - Ensure `.well-known/` directory is created with `fs.mkdir(..., { recursive: true })`.

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff run build:check`

**Completion criterion:** `release.prepare` writes `build-identity.json` into `dist/client/.well-known/`. Build passes.

**Human review:** no

---

### Step 3. Remove `deploymentMetadata` from open-source registry JSON and generator

**Goal:** The open-source page no longer reads deployment metadata from the registry JSON — the UI component will fetch `build-identity.json` at request time (Step 3a). Remove `deploymentMetadata` from the schema, generator output, and helper functions.

**Agent actions:**

- In `packages/os/site-kernel-codegen/src/open-source-page.ts`:
  - Remove `resolveDeploymentMetadata`, `resolveGitCommitSha`, `resolveBuildTimestamp` functions.
  - Remove `DeploymentMetadata` type.
  - Remove `deploymentMetadata` from `openSourceRegistryDataSchema` (the `.strict()` Zod schema).
  - Remove `deploymentMetadata` from `buildRegistryData` function output.
  - Remove the `metadata` variable and its usage in `runGenerateOpenSourcePage` (the `resolveDeploymentMetadata` call at line ~907).
  - Remove `process.env.DEPLOYMENT_ID`, `process.env.COMMIT_SHA`, `process.env.BUILD_TIMESTAMP` usage.
  - Keep `deploymentMetadataHeading`, `deploymentIdLabel`, `buildTimestampLabel`, `commitShaLabel` in `openSourceLabelsSchema` — the UI component still needs these labels.
- Update existing generated `open-source-registry.json` files: remove the `deploymentMetadata` key from all language variants in the active mission workpiece (strict schema rejects unknown keys). The next `open-source.generate` run will produce correct files.

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-codegen run build:check`
- `pnpm --filter @warpgogol/site-kernel-codegen test`

**Completion criterion:** `deploymentMetadata` removed from schema and generator; `resolveDeploymentMetadata` and helpers removed; build and tests pass.

**Human review:** no

---

### Step 3a. Update open-source UI section to fetch `build-identity.json` at request time

**Goal:** The open-source registry section component fetches `/.well-known/build-identity.json` server-side (Astro SSR) and renders deployment metadata from it.

**Agent actions:**

- In `packages/ui/src/sections/open-source-registry/open-source-registry-section.astro`:
  - After resolving registry data (which no longer contains `deploymentMetadata`), fetch `/.well-known/build-identity.json` via same-origin `fetch(Astro.url.origin + "/.well-known/build-identity.json")`. On Cloudflare Workers, static assets are served before Worker code executes, so this works for same-origin requests.
  - Parse the response as JSON. If fetch fails or file is not found, fall back to placeholder values: `{ deploymentId: "—", buildTimestamp: "—", commitSha: "—" }`.
  - Map build-identity fields to deployment metadata: `deploymentId` ← `releaseId`, `buildTimestamp` ← `buildTimestamp`, `commitSha` ← `commitSha`.
  - Render the deployment metadata section using the fetched data + existing labels from `data.deploymentMetadataHeading`, `data.deploymentIdLabel`, etc.
  - Remove the `data.deploymentMetadata.*` references — use the fetched data instead.

**Validation:**

- `pnpm --filter @warpgogol/ui run build:check`

**Completion criterion:** UI component fetches `build-identity.json` at request time; deployment metadata rendered from fetched data with fallback placeholders; build passes.

**Human review:** no

---

### Step 4. Update `leitstand.propagate` — remove `--channel`, always alt, state transition

**Goal:** `runLeitstandPropagate` always deploys to alt, rejects `--channel`, transitions release to `alt-deployed`.

**Agent actions:**

- In `packages/os/site-kernel-handoff/src/leitstand/leitstand-commands.ts`:
  - Remove `parseChannel` call; hardcode `channel = "alt"`.
  - If `--channel` flag is present in input, throw: `"[leitstand.propagate] --channel is removed; use leitstand.promote for main deployment"`.
  - Remove the main-channel gate (lines 368-375) — no longer needed.
  - After successful propagation + health check, read the release manifest, update `state` to `"alt-deployed"`, and write it back via `writeReleaseYaml`.
  - Update `LeitstandPropagateData` interface: `channel` is now always `"alt"`.
- In `packages/os/site-kernel-handoff/src/leitstand/leitstand.module.ts`:
  - Remove `channel` flag from `leitstand.propagate` registration.
  - Update description: `"Deploy a published release to the alt channel (RFC-0608). Flags: --release."`.
- In `packages/os/site-kernel-handoff/src/leitstand/index.ts`:
  - Update `leitstand.propagate` registration (remove `channel` flag from description).

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff run build:check`

**Completion criterion:** `leitstand.propagate` rejects `--channel`, always deploys to alt, transitions release to `alt-deployed`. Build passes.

**Human review:** no

---

### Step 5. Implement `leitstand.promote`

**Goal:** New command that deploys a verified release from alt to main with live build-identity verification.

**Agent actions:**

- In `packages/os/site-kernel-handoff/src/leitstand/leitstand-commands.ts`:
  - Add `LeitstandPromoteData` interface (per RFC TypeScript contracts).
  - Implement `runLeitstandPromote`:
    1. Read `--release` flag, require it.
    2. Read release manifest; require state `"alt-deployed"`, else throw.
    3. Read registry; find system entry; get `deployment.channels.alt` config for alt URL.
    4. Fetch `/.well-known/build-identity.json` from alt URL using global `fetch()` (Node 18+). Parse and validate with `buildIdentitySchema`.
    5. Verify `releaseId`, `distTreeHash`, `behaviorSnapshotHash`, `siteContentHash` match the release manifest. Throw on mismatch with field-specific error.
    6. Run live health check against alt deployment (reuse `adapter.health()` with alt channel config).
    7. Deploy to main channel via `adapter.propagate()` with `channel: "main"`.
    8. On success, update release manifest state to `"promoted"`, write via `writeReleaseYaml`.
    9. Update `deployment.lastPropagated.main` in registry.
    10. Append Bordbuch entry.
  - Acquire/release `deployment:${systemId}` lock.
- In `packages/os/site-kernel-handoff/src/leitstand/leitstand.module.ts`:
  - Register `leitstand.promote` command: `--release` (required), `mutatesState: true`, `writes: ["systems/registry.yaml", "systems/{system}/bordbuch/events.ndjson", "releases/{release}/release.yaml"]`.
- In `packages/os/site-kernel-handoff/src/leitstand/index.ts`:
  - Export `runLeitstandPromote` and `LeitstandPromoteData`.

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff run build:check`

**Completion criterion:** `leitstand.promote` is registered, requires `alt-deployed` state, fetches + verifies build-identity.json, runs health checks, deploys to main, transitions to `promoted`. Build passes.

**Human review:** no

---

### Step 6. Update `leitstand.rollback` — release state transitions

**Goal:** Rolling back main sets release state to `rolled-back`; rolling back alt sets release state back to `published`.

**Agent actions:**

- In `packages/os/site-kernel-handoff/src/leitstand/leitstand-commands.ts`, in `runLeitstandRollback`:
  - After successful rollback, before writing registry:
    - Read the release manifest of the release being rolled back FROM (`currentRelease` — from `dep.lastPropagated[channel].releaseId`).
    - If channel is `main`: set release manifest state to `"rolled-back"`.
    - If channel is `alt`: set release manifest state to `"published"` (allows re-deploy to alt).
    - Write the updated manifest via `writeReleaseYaml`.
  - The target release (rolled back TO) does not get a state change — it was already `published` or `promoted`.

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff run build:check`

**Completion criterion:** Main rollback transitions release to `rolled-back`; alt rollback transitions release to `published`. Build passes.

**Human review:** no

---

### Step 7. Tests

**Goal:** Unit tests for all new and changed behavior.

**Agent actions:**

- Create `packages/os/site-kernel-handoff/src/tests/release-0608-build-identity.test.ts`:
  - Test that `release.prepare` writes `build-identity.json` into `dist/client/.well-known/`.
  - Test that `build-identity.json` contains all required fields with correct values.
- Create `packages/os/site-kernel-handoff/src/tests/leitstand-0608-promote.test.ts`:
  - Test that `leitstand.promote` rejects when release state is not `alt-deployed`.
  - Test that `leitstand.promote` rejects when `build-identity.json` is not found at alt URL (mock `fetch`).
  - Test that `leitstand.promote` rejects on hash mismatch (mock `fetch` returning wrong hashes).
  - Test that `leitstand.promote` rejects on `releaseId` mismatch.
  - Test that `leitstand.promote` succeeds and transitions to `promoted` when all checks pass (mock `fetch` + adapter).
- Create `packages/os/site-kernel-handoff/src/tests/leitstand-0608-propagate-channel-removed.test.ts`:
  - Test that `leitstand.propagate` throws when `--channel` flag is passed.
  - Test that `leitstand.propagate` transitions release to `alt-deployed` on success.
- Create `packages/os/site-kernel-handoff/src/tests/leitstand-0608-rollback-state.test.ts`:
  - Test that `leitstand.rollback --channel main` transitions release to `rolled-back`.
  - Test that `leitstand.rollback --channel alt` transitions release to `published`.

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff test`

**Completion criterion:** All new tests pass; existing tests still pass.

**Human review:** no

---

### Step 8. Documentation sync

**Goal:** Update all documentation artifacts to reflect the new command surface and state machine.

**Agent actions:**

- `docs/COMMANDS.md`:
  - Update `leitstand.propagate` entry: remove `--channel` from flags, update description to "Deploy a published release to the alt channel (RFC-0608)."
  - Add `leitstand.promote` entry: "Promote a verified alt-deployed release to the main channel with live build-identity verification (RFC-0608). Flags: --release."
  - Update `leitstand.rollback` entry: note state transitions (main → `rolled-back`, alt → `published`).
- `docs/architecture-dna.md` DNA-49:
  - Add `leitstand.promote` to the enforcement command list: "Enforced by `leitstand.propagate`, `leitstand.promote`, `leitstand.status`, `leitstand.rollback`, and `leitstand.health`."
- `packages/os/site-kernel-handoff/AGENTS.md`:
  - Update Leitstand section: document `leitstand.propagate` (alt only, no `--channel`), `leitstand.promote` (new, main, build-identity verification), state machine (`published → alt-deployed → promoted`), `build-identity.json` file, rollback state transitions.
  - Remove the rule "`leitstand.propagate --channel main` is gated: `alt` must have a healthy propagation of the same release before promoting to `main`." — replaced by the state machine + `leitstand.promote`.

**Validation:**

- `git diff` — verify all scope.docs files are updated.

**Completion criterion:** All 3 documentation files updated with new command surface and state machine.

**Human review:** no

---

### Final Step. Review, fix, and acceptance criteria verification

**Goal:** Run code review, fix findings, verify acceptance criteria, stamp RFC as implemented.

**Agent actions:**

- Run `pnpm exec werkstatt run rfc.validate --id RFC-0608`
- Run `pnpm --filter @warpgogol/site-kernel-handoff run build:check`
- Run `pnpm --filter @warpgogol/site-kernel-handoff test`
- Run `pnpm --filter @warpgogol/site-kernel-codegen run build:check`
- Run `pnpm --filter @warpgogol/site-kernel-codegen test`
- Run code review: invoke `fo-review` via the `skill` tool on all session code changes (`git diff <merge-base-of-session>...HEAD`). Wait for the review report in `docs/reviews/code/`.
- Run fix if needed: if `fo-review` reported findings, invoke `fo-fix` via the `skill` tool. Re-run `fo-review` to confirm all findings are resolved. Maximum 3 iterations.
- Check off acceptance criteria: verify each criterion in the RFC against the implemented code. Mark `[x]` for verified criteria with inline `(evidence: ...)` annotations.
- Stamp the RFC as implemented: run `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0608 --implementation-commit <sha>`.

**Validation:**

- `git status` — no uncommitted changes from the current session.
- `pnpm exec werkstatt run rfc.validate --id RFC-0608`
- Review report exists in `docs/reviews/code/` for this session.

**Completion criterion:** All documentation artifacts in scope are updated; code review passed (findings fixed if any); all acceptance criteria are checked off with inline `(evidence: ...)` annotations; RFC is stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476).

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate --id RFC-0608`
- `pnpm --filter @warpgogol/ontology run build:check`
- `pnpm --filter @warpgogol/site-kernel-handoff run build:check`
- `pnpm --filter @warpgogol/site-kernel-handoff test`
- `pnpm --filter @warpgogol/site-kernel-codegen run build:check`
- `pnpm --filter @warpgogol/site-kernel-codegen test`
- `pnpm --filter @warpgogol/ui run build:check`

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0608` in the subject line (RFC-0265 commit hygiene)

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Alt URL unreachable during promotion | Step 5: `leitstand.promote` fetches build-identity.json from alt URL; network failure throws with clear error — promotion blocked by design |
| `build-identity.json` not served by Cloudflare Workers | Step 2: file written to `dist/client/.well-known/` — standard static path; if adapter doesn't serve it, fix before implementing |
| State machine complexity | Steps 4-6: each state has a single entry command; tests in Step 7 verify all transitions |
| Agent misinterpretation (`leitstand.propagate --channel main`) | Step 4: command throws with clear error; Step 8: AGENTS.md and COMMANDS.md document the new surface |
| Rollback state ambiguity | Step 6: main rollback → `rolled-back`, alt rollback → `published`; target release state unchanged |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-48 or DNA-49, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0608 --reason "..." --invariant "DNA-N"` instead of working around it.
- If the Cloudflare Workers adapter cannot serve `/.well-known/build-identity.json`, fix the adapter's static file serving before implementing this RFC — do not skip the verification.
