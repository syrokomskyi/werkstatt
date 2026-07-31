---
rfcId: RFC-0587
auditId: AUDIT-RFC-0587-01
date: 2026-07-29
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0587

## Verdict: Needs revision

Six of the seven bugs described in the RFC are already fixed in the current codebase. The RFC's line references and bug descriptions do not match the actual code, undermining its credibility as a design document. The genuinely new proposals (tar.gz archive, adapter-declared limits, exported helpers) are sound but need the RFC to accurately reflect the current state and separate "already fixed" from "new work."

## Mechanical validation (rfc.validate)

Pass — zero violations.

## Axis A — Structural completeness

- **Inaccurate bug descriptions**: The RFC describes 7 bugs, but 6 are already fixed in the codebase:
  1. `artifact.store.put` EISDIR — the code at `artifact-store-commands.ts:111` uses `hashDir(distDir)` which calls `collectFiles(dir)`, not `fs.readFile(distDir)` on a directory. No EISDIR possible.
  2. `checkWranglerAvailable` without `--yes` — `leitstand-commands.ts:231-232` already uses `["npx", ["--yes", "wrangler", "--version"]]` with `nodeModulesBinPath` in `PATH`.
  3. `checkDistSize` 25 MiB limit — `leitstand-commands.ts:257-258` already uses `20 * 1024 * 1024 * 1024` (20 GiB) for total and `25 * 1024 * 1024` for per-file.
  4. Adapter ran `pnpm exec wrangler` from `dist/server/` — `cloudflare-workers.ts:155-163` already uses `npx --yes wrangler deploy` with `cwd: input.distPath`.
  5. `process.env` type error — `cloudflare-workers.ts:28-36` already has `filterEnv` helper, used at line 150.
  6. Silent deploy failures — `cloudflare-workers.ts:165-168` already logs `stdout`/`stderr` to `console.error` on failure.
  7. `sourceDotenv` comments/empty lines — `cloudflare-workers.ts:65-67` already skips `#` comments and empty lines.

  Only bug #2 (duplicate manifests / `findArtifactManifest` returning stale manifest) is partially valid.

- **Wrong line references**: RFC cites `leitstand-commands.ts:228` for `checkDistSize`, but `checkDistSize` starts at line 256. RFC cites `cloudflare-workers.ts:139` for `process.env` and `sourceDotenv` issues, but `filterEnv` is at line 28 and `sourceDotenv` at line 61.

- **Undocumented interface change**: The RFC's proposed `ArtifactStorePutData` (lines 167-177) drops `siteContentHash` which exists in the current interface at `artifact-store-commands.ts:71-81`. The RFC does not mention removing this field or explain why.

- **`filterEnv` / `sourceDotenv` signatures**: The RFC proposes `sourceDotenv(filePath: string): Record<string, string>` as synchronous, but the actual implementation at `cloudflare-workers.ts:61` is `async`. The RFC should specify whether the export changes the signature or keeps it async.

## Axis B — DNA alignment

- **DNA-49 and DNA-52**: Correctly referenced. The RFC explains how the preflight checks enforce DNA-49's propagation gate and how tar.gz archiving supports DNA-52's content-addressed artifact store. The alignment is sound for the genuinely new proposals.

## Axis C — Ecosystem fit

- **Package boundaries**: All changes are within `@warpgogol/site-kernel-handoff` — correct.
- **Command lifecycle**: `commands.changed` lists `artifact.store.put` and `leitstand.propagate` — accurate for the proposed changes.
- **`getLimits()` on `DeploymentAdapter`**: The RFC proposes adding this to the adapter interface. The null adapter declares `Infinity` limits. This is a clean extension point. However, `leitstand-commands.ts:256-282` (`checkDistSize`) currently hardcodes limits and does not receive the adapter — the RFC should specify how `checkDistSize` gains access to the adapter (parameter pass-through from `runPreflight`).

## Axis D — Forward-only compliance

- **Old manifest compatibility**: The Rollout section says "Releases already in the artifact store with tree-hash manifests remain valid." But if `distArtifactHash` changes from tree hash to tar.gz hash, `artifact.store.validate` and `artifact.store.get` will read old manifests with tree-hash-based `distArtifactHash` values. The RFC does not explain how these old manifests are handled — will `findArtifactManifest` still find them? Will `artifactStorePreflight` verify against tree hash or archive hash? This is a forward-only gap: old manifests use a different hash scheme than new ones, and the RFC doesn't specify the transition.

## Axis E — Agent-facing policy

- **Status gate**: Correctly states agents may only implement when `status: accepted` or `implemented`.
- **Implementation notes**: Reference RFC-0224 (accepted→implemented), RFC-0334 (supersede escalation), RFC-0330 (verification evidence). These are correct governance references.

## Axis F — Pragmatism

- **Already-fixed bugs inflate scope**: 6 of 7 bugs are already fixed. The RFC should either (a) reframe as "formalizing existing hotfixes + adding tar.gz archive and adapter limits" or (b) remove the already-fixed items entirely. As written, an implementing agent will be confused about what work remains.
- **`getLimits()` vs hardcoded**: The proposal to add `getLimits()` to `DeploymentAdapter` is justified — each platform has different limits. But the RFC should note that `checkDistSize` currently doesn't receive the adapter, so the implementation requires passing it through `runPreflight`.

## Axis G — Blind spots

- **`node:tar` availability**: The implementation notes say "MUST use `node:tar`" — good, but the RFC doesn't specify the minimum Node.js version. `node:tar` has been stable since Node 14, so this is likely fine, but the RFC should confirm.
- **Concurrent `artifact.store.put`**: The Risks section mentions `werkstatt.lock` (DNA-51) should be acquired. The current code at `artifact-store-commands.ts:102-108` already acquires a lock with scope `release:${releaseId}`. The RFC should acknowledge this existing lock and explain whether the idempotent overwrite changes the locking behavior.
- **`artifact.store.get` rehydration**: The current `artifactStoreRehydrate` at `artifact-store-commands.ts:363-380` does not actually extract a tar.gz — it just creates an empty directory. The RFC proposes creating tar.gz archives but does not update `artifact.store.get` or `artifactStoreRehydrate` to extract them. This is a gap: the archive is created but never used for restoration.

## Questions for the author

1. Six of the seven bugs described are already fixed in the codebase. Should the RFC be reframed to formalize those fixes and focus on the genuinely new work (tar.gz archive, adapter-declared limits, exported helpers), or should the already-fixed items be removed?
2. The proposed `ArtifactStorePutData` drops `siteContentHash` from the current interface. Is this intentional? If so, what happens to callers that depend on `siteContentHash`?
3. How will old tree-hash manifests be handled after the switch to tar.gz-based `distArtifactHash`? Will `findArtifactManifest` and `artifactStorePreflight` need to support both hash schemes, or will old manifests be migrated/garbage-collected?
4. `artifactStoreRehydrate` currently creates an empty directory without extracting anything. The RFC proposes creating tar.gz archives — should `artifactStoreRehydrate` and `artifact.store.get` be updated to extract the archive, or is the archive purely for backup?
5. How does `checkDistSize` gain access to `adapter.getLimits()`? The current `runPreflight` signature does not pass the adapter to `checkDistSize`. Will the adapter be passed through, or will limits be resolved upstream?
