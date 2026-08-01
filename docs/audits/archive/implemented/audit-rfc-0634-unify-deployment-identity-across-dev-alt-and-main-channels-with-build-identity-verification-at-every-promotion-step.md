---
rfcId: RFC-0634
auditId: AUDIT-RFC-0634-01
date: 2026-08-01
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0634

## Verdict: Needs revision

The RFC has three blocking design flaws that would make implementation impossible without rework: (1) the workpiece `releaseId` (`workpiece-<missionId>`) does not match `RELEASE_ID_REGEX` in `buildIdentitySchema`, so `buildIdentitySchema.safeParse()` would reject the dev build-identity; (2) the `commitSha` from `dev-deploy` (workpiece git HEAD) and `release.prepare` (monorepo git HEAD via `resolveCurrentEcosystem`) come from different git repos and will never match; (3) the proposed `readFileSync` path in the open-source page component resolves to `packages/ui/src/public/` which does not exist. Additionally, the `release.prepare` rollout step does not address removing the preliminary `build-identity.json` from `distDest` before `fingerprintTree`, which would make `distTreeHash` non-deterministic.

## Mechanical validation (rfc.validate)

Pass with 1 warning:

- **V-19 (warning):** `RFC-0634.amends` includes `RFC-0628`, but `RFC-0628.amendedBy` does not include `RFC-0634`. Must add `RFC-0634` to `RFC-0628.amendedBy` before implementation.

## Axis A — Structural completeness

- **A-1 (Failure modes gap):** The Failure modes table does not list a failure mode for `buildIdentitySchema` validation failure when `leitstand.propagate` fetches the dev build-identity. Since the workpiece `releaseId` (`workpiece-<missionId>`) does not match `RELEASE_ID_REGEX`, this failure is guaranteed on every propagate — it is not an edge case but a structural blocker (see Axis B finding B-1).

- **A-2 (TypeScript contracts mismatch):** The proposed `DevDeployResult` interface (RFC lines 253–272) differs significantly from the existing interface at `@/packages/os/site-kernel-handoff/src/leitstand/leitstand-commands.ts:358-372`. The existing interface has `command`, `buildState`, `deployState` (top-level fields); the RFC proposes `state`, `build: { succeeded, durationMs }`, `deploy: { succeeded, workerName }`, `buildIdentity: { ... }` (nested fields). This is a breaking change to the `--json` output shape. The RFC does not mention migrating existing tests (`leitstand-0628-dev-deploy.test.ts` checks `data?.buildState`, `data?.deployState`) or downstream consumers.

- **A-3 (TypeScript contracts mismatch):** The proposed `LeitstandPropagateData` interface (RFC lines 241–250) drops existing fields (`state`, `deploymentUrl`, `startedAt`, `completedAt`, `preflight`, `purgeResult`, `health`, `releaseState`) and replaces them with `previousState`, `newState`, `devBuildIdentityVerified`, `axiomEvidenceVerified`, `deployedAt`. This is a complete restructuring of the output shape, not an additive change. Existing tests in `leitstand-0608-promote.test.ts` and `leitstand-0628-dev-deploy.test.ts` would break.

- **A-4 (Rollout step 2 incomplete):** The rollout step 2 for `release.prepare` says "Add a preliminary `build-identity.json` write to `workpiece/public/.well-known/` before the build" but does not mention removing the preliminary file from `distDest` before computing `distTreeHash`. Since Astro copies `public/` contents to `dist/client/` during build, the preliminary file will be present in `distDest/client/.well-known/build-identity.json` when `fingerprintTree(distDest)` runs at `release-commands.ts:362`. This makes `distTreeHash` non-deterministic (it includes the `buildTimestamp` from the preliminary file). The RFC's Design section (line 161) claims "the file is not present in `dist/` at hash time" — this is false when a preliminary file is written to `public/` before the build.

## Axis B — DNA alignment

- **B-1 (Blocking — schema conflict):** The RFC states "`buildIdentitySchema` in `packages/ontology/src/operations/release.ts` is unchanged" (acceptance criterion line 404, non-goals line 69). However, the workpiece build-identity uses `releaseId: "workpiece-warpgogol-com-m000024"` (RFC line 169). The `buildIdentitySchema` at `@/packages/ontology/src/operations/release.ts:75` defines `releaseId: z.string().regex(RELEASE_ID_REGEX)` where `RELEASE_ID_REGEX = /^[a-z0-9]+(-[a-z0-9]+)*-r\d{6}$/` (`@/packages/ontology/src/operations/naming-policy.ts:16`). The string `workpiece-warpgogol-com-m000024` does not match this regex (it lacks the `-r<NNNNNN>` suffix). Therefore `buildIdentitySchema.safeParse()` on the dev build-identity will always fail. The `leitstand.propagate` verification step (RFC line 226: "Parse and validate against `buildIdentitySchema`") would reject every dev build-identity. The RFC must either change the schema (contradicting its own non-goal) or use a release ID that matches the regex (contradicting the `workpiece-<missionId>` design).

- **B-2 (DNA-49 alignment):** The RFC claims to extend DNA-49 by adding build-identity verification to dev→alt propagation. DNA-49 currently states "promoting to `main` requires a healthy `alt` propagation of the same release with live build-identity verification." The RFC correctly extends this to dev→alt. However, the DNA-49 prose update (rollout step 7) is listed but the specific new prose is not provided — the agent implementing this will have to draft it. The RFC should include the proposed DNA-49 text.

## Axis C — Ecosystem fit

- **C-1 (Package boundaries):** The open-source page component at `packages/ui/src/sections/open-source-registry/open-source-registry-section.astro` is a shared UI component. The RFC proposes adding `readFileSync` from `node:fs` and `fileURLToPath` from `node:url` to this component. The `packages/AGENTS.md` states "Node-only modules (`node:fs/promises`, `node:path`, etc.) MUST NOT be re-exported from shared barrel files." While this is about barrel exports, using `node:fs` directly in an Astro component is acceptable for SSG but introduces a Node dependency in a shared UI package. More critically, the proposed path resolution is wrong (see G-1).

- **C-2 (AGENTS.md updates):** The RFC correctly identifies `packages/os/site-kernel-handoff/AGENTS.md` for Leitstand section updates (rollout step 6). However, it does not mention updating `packages/ui/AGENTS.md` — if the open-source component changes from runtime fetch to `readFileSync`, the UI package AGENTS.md should document this pattern.

- **C-3 (Command lifecycle):** `commands.changed` lists `leitstand.dev-deploy`, `leitstand.propagate`, `release.prepare`. These are all existing registered commands — correct. No new commands are proposed — consistent with the "No new commands" statement in the CLI surface section.

## Axis D — Forward-only compliance

- **D-1 (No compatibility layers):** The RFC does not propose any backward compatibility shim or dual-path. The open-source page component change is a direct replacement of `fetch(Astro.url.origin)` with `readFileSync`. The `dev-deploy` build-identity write is additive. The `propagate` verification is additive. Forward-only compliance is maintained.

- **D-2 (Legacy code removal):** The `fetch(Astro.url.origin)` code path in the open-source component is fully replaced, not maintained behind a flag. Correct.

## Axis E — Agent-facing policy

- **E-1 (Status gate):** The RFC is in `draft` status. Implementation notes (line 412) correctly state "Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented)." No self-authorizing language detected.

- **E-2 (Implementation notes):** The notes reference RFC-0224 (accepted→implemented transition), RFC-0334 (supersede escalation). These are correct governance references. The note about not verifying `behaviorSnapshotHash` for dev→alt (line 416) is clear and actionable.

- **E-3 (Anti-fabrication):** The acceptance criteria are code-level checks (file writes, hash computation, schema validation, unit tests). No content authoring is required. No anti-fabrication concerns.

## Axis F — Pragmatism

- **F-1 (Breaking output shape change):** The RFC restructures `DevDeployResult` and `LeitstandPropagateData` interfaces (see A-2, A-3). This is not minimal — it renames existing fields (`buildState` → `build.succeeded`, `deployState` → `deploy.succeeded` + `state`) and drops fields (`preflight`, `purgeResult`, `health`). The RFC should either preserve the existing shapes and add only the new `buildIdentity` / `devBuildIdentityVerified` fields, or explicitly justify the restructuring and list all tests that need updating.

- **F-2 (Existing patterns):** The RFC correctly mirrors the existing `leitstand.promote` build-identity verification pattern (fetch + `buildIdentitySchema.safeParse` + field-by-field comparison) for the new `leitstand.propagate` verification. This is the right approach — extending an existing pattern rather than inventing a new one.

- **F-3 (Scope discipline):** `packagesImpacted` lists `@warpgogol/site-kernel-handoff` and `@warpgogol/ui`. This is correct — the RFC touches `leitstand-commands.ts`, `release-commands.ts`, and the open-source component. `appsImpacted` is empty — correct, since the workpiece is the editing surface, not a fixed app.

## Axis G — Blind spots

- **G-1 (Blocking — wrong file path):** The proposed `readFileSync` path in the open-source page component (RFC line 204) is:
  ```ts
  const wellKnownPath = fileURLToPath(new URL("../../public/.well-known/build-identity.json", import.meta.url));
  ```
  The component lives at `packages/ui/src/sections/open-source-registry/open-source-registry-section.astro`. Relative to this file, `../../public/` resolves to `packages/ui/src/public/` — which does not exist. The `public/` directory is in the workpiece root (e.g., `missions/<id>/workpiece/public/`), not in the UI package. The path resolution is wrong and the code will throw `ENOENT` at build time. The RFC must specify a different path resolution strategy (e.g., `process.cwd() + "/public/.well-known/build-identity.json"` or an Astro-specific mechanism).

- **G-2 (Blocking — commitSha mismatch):** `dev-deploy` captures `commitSha` from the workpiece git repo (`git rev-parse HEAD` at `workpiecePath`, `leitstand-commands.ts:462`). `release.prepare` captures `commitSha` from the monorepo git repo via `resolveCurrentEcosystem(workspaceRoot)` which calls `git rev-parse HEAD` at `workspaceRoot` (`bundle-io.ts:72`). The workpiece is a separate git repository (clone of the cache clone). The monorepo HEAD and workpiece HEAD are different commits from different repos. The RFC's `leitstand.propagate` verification step (RFC line 228: "Verify `commitSha` matches the release manifest's `commitSha`") would always fail because the dev build-identity has the workpiece HEAD while the release manifest has the monorepo HEAD. The RFC must reconcile this — either by making `release.prepare` use the workpiece HEAD (changing existing behavior) or by making `dev-deploy` use the monorepo HEAD (which may not reflect the workpiece content).

- **G-3 (Distribution-reuse path):** `release.prepare` can skip the build when a distribution is reused (`canReuseDistribution`, `release-commands.ts:221-237`). In this path, the workpiece is not built — the existing distribution is copied to `distDest`. The preliminary `build-identity.json` written to `workpiece/public/.well-known/` before the build (rollout step 2) would not be copied to `distDest` because `copyDir(distributionDir, distDest)` copies the pre-built distribution, not the workpiece. The open-source page in the reused distribution was prerendered during `mission.build` without a preliminary `build-identity.json` in `public/` — so it would show placeholder `—` values. The RFC only addresses the "build from workpiece" path, not the distribution-reuse path.

- **G-4 (dev channel config access):** `leitstand.propagate` currently reads only the `alt` channel config. The RFC's new dev-URL build-identity fetch requires access to the `dev` channel config (specifically `devConfig.url`). The RFC does not mention that `runLeitstandPropagate` needs to read the dev channel config from the deployment config. This is feasible (`getChannelConfig(dep, "dev")`) but not documented.

- **G-5 (Preliminary file cleanup):** The RFC rollout step 1 says "Clean up the preliminary file from `workpiece/public/.well-known/` after the build (or leave it — it is overwritten by the next deploy or by `release.prepare`)." But if the preliminary file is left in `workpiece/public/.well-known/`, it will be present in the workpiece's `dist/client/.well-known/` after the next `pnpm build` (run by `mission.build` or `release.prepare`). This could cause the same `distTreeHash` non-determinism issue in `release.prepare` if `release.prepare` doesn't explicitly remove it before hashing. The RFC should mandate cleanup, not make it optional.

- **G-6 (Edge case — no dev deployment):** If `leitstand.dev-deploy` was never run (or the dev Worker is down), `leitstand.propagate` will fail to fetch `build-identity.json` from the dev URL. The RFC's failure modes table (line 334) covers this: "Throws: 'build-identity.json not served by dev deployment — run leitstand.dev-deploy first'." This is correct and actionable.

## Questions for the author

1. **How will the workpiece `releaseId` pass `buildIdentitySchema` validation?** The regex `RELEASE_ID_REGEX` requires `<system-id>-r<NNNNNN>`. `workpiece-<missionId>` does not match. Will you change the schema (removing the regex), use a different release ID format, or use a separate validation path for dev build-identity?

2. **How will `commitSha` verification work across different git repos?** `dev-deploy` captures the workpiece HEAD; `release.prepare` captures the monorepo HEAD. These are different commits from different repos. Will you make `release.prepare` use the workpiece HEAD, or skip `commitSha` verification for dev→alt, or use a different identifier?

3. **What is the correct path for `readFileSync` in the open-source component?** `../../public/` relative to `packages/ui/src/sections/open-source-registry/` resolves to `packages/ui/src/public/` which does not exist. The `public/` directory is in the workpiece root. How will the component resolve the workpiece root at build time?
