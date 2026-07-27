---
rfcId: RFC-0566
auditId: AUDIT-RFC-0566-01
date: 2026-07-27
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0566

## Verdict: Needs revision

The RFC has a clear architectural vision and strong structural completeness, but has a critical DNA-alignment issue (changes DNA-49 rollback behavior without superseding RFC-0358), a significant ecosystem-fit gap (ignores existing Leitstand and artifact-store code in `site-kernel-handoff`), and several blind spots including a contradiction between tar-archive and directory-based artifact format, ambiguous artifact path, and missing `packagesImpacted` entries.

## Mechanical validation (rfc.validate)

Pass — `rfc.validate` reports zero violations.

## Axis A — Structural completeness

- **Failure modes** table specifies behavior but does NOT specify exit codes or warn-vs-fail behavior. E.g., "Artifact hash mismatch" — does `deploy.atomic.swap` exit with code 1? Does it warn and continue or hard-fail? The table says "refuses to swap" but doesn't specify the exit code or error code.
- **Rollout** describes 4 phases but doesn't describe the default behavior for existing apps. What happens to existing Sternsystems when Phase 2 lands? Do they automatically get immutable artifacts, or is it opt-in?
- **Acceptance criteria** item "Two-phase commit: prepare → commit, with abort and rollback on failure" is not checkable without a concrete test scenario. What constitutes a successful two-phase commit verification? A unit test? An integration test? A manual demonstration?
- All other sections contain real content with no template placeholders.

## Axis B — DNA alignment

- **FAIL:** `satisfies: [DNA-49]` — DNA-49 states "Rollback redeploys a previous published artifact from the release store." This RFC proposes replacing that with an atomic symlink swap: "Rollback is an atomic symlink swap back to the previous artifact." This is a **change** to DNA-49's rollback behavior, not an extension. The RFC says "Do not replace the existing Leitstand (DNA-49) — this RFC extends the Leitstand with immutable artifacts and atomic rollback" (nonGoals, line 68), but changing how rollback works IS a change to DNA-49. If DNA-49's rollback semantics change, the RFC must `supersede` RFC-0358 (the establishing RFC), not claim to merely "extend" it. Alternatively, the RFC should clarify that symlink-swap rollback is an **additional** mechanism that coexists with redeployment rollback, and DNA-49's text remains accurate for the redeployment path.
- The RFC body explains how it extends DNA-48 (immutability to platform code) and DNA-52 (same artifact store format) — these are genuine extensions, not changes. Good.
- `related[]` DNA references (DNA-44, DNA-48, DNA-52) are all relevant and non-decorative.

## Axis C — Ecosystem fit

- **FAIL:** The RFC proposes `packages/os/site-kernel/src/deploy/` as the home for all new code, but the existing deploy infrastructure lives in `packages/os/site-kernel-handoff/src/leitstand/` (Leitstand commands) and `packages/os/site-kernel-handoff/src/artifact-store/` (artifact store). There is also a separate `packages/os/site-kernel-deploy/` package for client export. The RFC doesn't acknowledge any of these existing modules. The new `deploy.*` commands should either live in `site-kernel-handoff` (alongside the Leitstand and artifact store) or the RFC must justify why a new directory in `site-kernel` is better than extending the existing `site-kernel-handoff` modules.
- **FAIL:** `packagesImpacted` lists only `packages/os/site-kernel`. It should also list `packages/os/site-kernel-handoff` (where the Leitstand and artifact store live and will be modified or extended) and potentially `packages/os/site-kernel-integrity` (which already has Ed25519 signing capabilities that the RFC's artifact manifest signing should reuse).
- **FAIL:** The RFC doesn't specify how the new `deploy.*` commands relate to the existing `leitstand.*` commands (`leitstand.propagate`, `leitstand.status`, `leitstand.rollback`, `leitstand.health`). Are `deploy.atomic.swap` and `deploy.atomic.rollback` replacing `leitstand.propagate` and `leitstand.rollback`? Coexisting? The `commands.changed` and `commands.removed` arrays are empty, but the RFC clearly changes the deployment model. The RFC must declare whether `leitstand.*` commands are changed, deprecated, or kept as-is.
- Command lifecycle: `commands.proposed` lists 5 new commands that will land in `added` upon implementation. This is internally consistent.

## Axis D — Forward-only compliance

- **AMBIGUOUS:** The RFC says "The existing single-workshop deployment model remains as a special case" (line 117). This could mean the old `leitstand.propagate` path is kept alongside the new `deploy.atomic.swap` path — a dual-path. If Phase 3 replaces `leitstand.propagate` with symlink swap for local deployments, the old path must be deleted, not maintained behind a flag. The RFC should clarify that the Cloudflare Workers adapter path remains (it's a different deployment target), while the local symlink-swap path replaces any existing local deployment path.
- No explicit compatibility shims or bridges proposed. Good.

## Axis E — Agent-facing policy

- No issues. Status gate is clean — no self-authorizing language. Implementation notes reference RFC-0224, RFC-0334, RFC-0330 correctly.
- Storage policy: filesystem symlinks and tar/directory artifacts. No cookies or client-side persistence. No issues.

## Axis F — Pragmatism

- **FAIL:** `deploy.status` overlaps with the existing `leitstand.status`. The RFC should explain why a separate status command is needed instead of extending `leitstand.status` with platform-artifact information.
- **FAIL:** `deploy.atomic.rollback` overlaps with `leitstand.rollback`. The RFC should explain the relationship — does `deploy.atomic.rollback` replace `leitstand.rollback` for local deployments while `leitstand.rollback` remains for Cloudflare Workers? Or are they redundant?
- The `TwoPhaseCommitResult` and `WorkshopDeployStatus` types are for multi-workshop scenarios (Phase 4), which the RFC itself defers as "future work beyond the pilot" (RFC-0562, Phase 3–4). These types are speculative for the pilot Phases 2–3. Consider deferring them to a follow-up RFC.
- The RFC proposes Ed25519 signing of artifact manifests (`ArtifactManifest.signature`) but doesn't acknowledge that `@warpgogol/site-kernel-integrity` already provides Ed25519 signing (`generateSigningKeyPairPem`, `signLatestBuildArtifacts`, `verifyManifestSignature`). The RFC should reference this existing capability.

## Axis G — Blind spots

- **CONTRADICTION:** nonGoals (line 71) says "Do not implement custom artifact formats — this RFC uses tar archives with content-addressed hashes (SHA-256)." But the design section (lines 128–140) shows directory-based artifacts (`/artifacts/platform/<sha-256>/dist/`, `manifest.json`), not tar archives. The file system responsibilities table also describes directories, not tar files. The RFC must resolve this: are artifacts tar files or directories?
- **AMBIGUOUS PATH:** The artifact path `/artifacts/platform/<sha-256>/` is an absolute filesystem path. Where is this relative to the workspace root? The existing artifact store uses `.werkstatt/artifacts/releases/` (relative to workspace root). The RFC should use a workspace-root-relative path, consistent with the existing artifact store.
- **FIRST DEPLOY:** The RFC doesn't address the first-deployment edge case. When `current` symlink doesn't exist yet (fresh workshop), `deploy.atomic.swap` must create it, not swap it. `deploy.atomic.rollback` must fail gracefully if there's no previous artifact.
- **CLOUDFLARE COEXISTENCE:** The RFC doesn't explain how symlink-swap deployment coexists with the existing Cloudflare Workers deployment model. The Leitstand deploys to Cloudflare Workers via adapter plugins. Symlink swap is a local filesystem operation. Are they for different deployment targets? The rollout Phase 3 says "The Leitstand is extended to use symlink swap for local deployments. Cloudflare Workers deployments continue via the adapter plugin." This should be clearer in the design section, not just the rollout.
- **BUILD COST:** The RFC claims "Artifact builds are O(1) per workshop" but doesn't specify what `deploy.artifact.build` actually builds. Does it run `pnpm build` for all packages? Does it copy `dist/`? How long does it take? What's the disk space per artifact?
- **SIGNING KEY MANAGEMENT:** The RFC requires Ed25519 signing of artifact manifests but doesn't specify where the signing key comes from, how it's stored, or how it rotates. The existing `site-kernel-integrity` package has signing key management — the RFC should reference it.
- **DISK SPACE MITIGATION:** The risks section mentions "artifact retention policy (default: keep last 5 artifacts)" and a future `deploy.artifact.gc` command, but neither is in the proposed commands list. The RFC should either add `deploy.artifact.gc` to the proposed commands or explicitly defer it.

## Questions for the author

1. Does this RFC change DNA-49's rollback semantics (from "redeploy previous artifact" to "atomic symlink swap"), and if so, should it supersede RFC-0358 rather than claim to "extend" it? Or is symlink-swap an additional mechanism that coexists with redeployment?
2. Why does the new code live in `packages/os/site-kernel/src/deploy/` instead of extending the existing `packages/os/site-kernel-handoff/src/leitstand/` and `packages/os/site-kernel-handoff/src/artifact-store/` modules that already implement the Leitstand and artifact store?
3. Are `deploy.atomic.swap` and `deploy.atomic.rollback` intended to replace `leitstand.propagate` and `leitstand.rollback` for local deployments, or do they coexist? If they coexist, what determines which command is used? If they replace, why are `commands.changed` and `commands.removed` empty?
4. Are artifacts tar archives or directories? nonGoals says "tar archives" but the design shows directory-based artifacts with `dist/` and `manifest.json`.
5. Where is `/artifacts/` on the filesystem? Is it workspace-root-relative (like `.werkstatt/artifacts/`) or an absolute path? How does it relate to the existing artifact store at `.werkstatt/artifacts/releases/`?
