---
rfcId: RFC-0480
auditId: AUDIT-RFC-0480-01
date: 2026-07-21
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0480

## Verdict: Needs revision

The RFC is architecturally sound and well-grounded in DNA-46/DNA-47, but has command lifecycle metadata inaccuracies (`mission.preview` miscategorized, `release.prepare` missing from `commands.changed`), omits `@gogol/forge` from `packagesImpacted`, and has a significant design blind spot around `git am` idempotency on re-run after partial failure. These must be fixed before implementation can proceed safely.

## Mechanical validation (rfc.validate)

**Pass with 1 warning.**

- **V-19 (warning):** `RFC-0480.amends` includes `RFC-0472`, but `RFC-0472.amendedBy` does not include `RFC-0480`. The backreference on RFC-0472 must be added: `amendedBy: [RFC-0477, RFC-0480]`.

## Axis A — Structural completeness

1. **`mission.preview` miscategorized as `proposed`.** The command already exists at `packages/os/site-kernel-handoff/src/mission/mission-materialization-commands.ts:192-215` (returns workpiece path, open-missions-only). The RFC changes its behavior to start a dev server and support closed/aborted missions. It must move from `commands.proposed` to `commands.changed`.

2. **`release.prepare` missing from `commands.changed`.** The RFC extends `release.prepare` with behavior snapshot C-coverage (§"Behavior snapshot C-coverage", line 350) and adds a C-surface regression block (line 355). This is a behavior change to an existing command — it must be listed in `commands.changed`.

3. **`Breaks-C` frontmatter field name inconsistency.** The YAML example uses `Breaks-C: yes` (line 174) but the TypeScript schema uses `breaksC: z.boolean().optional()` (line 362). All existing frontmatter fields are camelCase (`supersedes`, `amendedBy`, `appsImpacted`, etc.). The field must be `breaksC` consistently in both YAML and TypeScript.

4. **`mission.abort` distribution handling unspecified.** The RFC says "Workpiece remains on disk after close/abort" (line 132) but does not address what happens to the `distribution/` directory on abort. The current `mission.abort` deletes both workpiece and distribution (`mission-abort.ts:82-87`). The RFC must clarify: is distribution preserved or deleted on abort?

## Axis B — DNA alignment

No issues. `satisfies: [DNA-46, DNA-47]` are correctly grounded:

- **DNA-46 (Mission lifecycle):** workpiece as git repo, step-by-step commits, git bundles on close/abort, `previewedAt`/`migratedAt` timestamps — all extend the mission lifecycle.
- **DNA-47 (Materialization):** `mission.materialize` initializes git, `mission.reconcile` uses `format-patch` + `git am` — directly changes materialization mechanics.

`related[]` DNA references (DNA-44, DNA-45, DNA-48, DNA-49, DNA-50, DNA-53) are all relevant and discussed in the architectural fit section. No conflicts with existing invariants. Amending RFC-0472 (rather than superseding) is correct — the RFC changes `sternsystem.sync` behavior, not its existence.

## Axis C — Ecosystem fit

1. **`@gogol/forge` missing from `packagesImpacted`.** The RFC modifies `packages/forge/os/rfc/types.ts` (add `breaksC` to `RFC_KNOWN_KEYS`, line 423) and `packages/forge/os/rfc/handlers/validate-rules.ts` (add V-30 rule, line 424). Both are in `@gogol/forge`. The package must be listed in `packagesImpacted`.

2. **Missing `package.json` export for `@gogol/ontology/external-surfaces`.** The RFC creates `packages/ontology/src/external-surfaces/index.ts` (line 285) but does not mention adding `./external-surfaces` to the `exports` map in `packages/ontology/package.json`. The existing `package.json` has explicit exports — a new subpath export is required for consumers to import the C-contract schemas.

3. **Compass sync not explicitly listed.** The RFC changes repository-wide requirements (edits-only-through-missions invariant, Layer C protection policy) but does not identify which `docs/*.xml` files need synchronization. Per root AGENTS.md Compass document duties, the RFC should list at minimum `docs/requirements.xml` (new invariant) and `docs/verification-plan.xml` (new `surface.contract.validate` check).

4. **Pipeline placement for `surface.contract.validate`** is stated as "included in `build.check` and `ci.local.validate`" (line 346) but the RFC does not specify whether the check is blocking (hard fail) or advisory (warning) in each pipeline. Given that C-surface regressions are meant to block `release.prepare`, the `build.check` placement should be blocking.

## Axis D — Forward-only compliance

1. **`sternsystem.sync --direction pull` deprecation as warning, not removal.** The ecosystem is forward-only — deprecation means removal in the same RFC wave. The RFC scopes `--direction pull` to disaster recovery and emits a deprecation warning (line 259). This is acceptable IF the RFC explicitly states that the warning is not a backward compatibility layer — it's a scoped DR feature that remains by design. The RFC should clarify this distinction to avoid appearing as a dual-path.

2. **`mission.preview` old behavior removed.** The existing "return path only" behavior is replaced by dev server startup. Forward-only compliant.

3. **`mission.abort` workpiece deletion removed.** The current delete-workpiece behavior is replaced by git bundle + preserve. Forward-only compliant.

## Axis E — Agent-facing policy

1. **Weak enforcement of `mission.git.commit`.** The RFC states "direct `git commit` in workpiece is discouraged but not technically prevented" (line 544). For a governance invariant ("edits-only-through-missions"), this is a soft enforcement gap. The RFC should explain why technical prevention is infeasible (workpiece is a plain git repo, any git client can commit) and note that the Bordbuch-vs-git-log check on the cache clone is the real enforcement boundary — the workpiece is disposable and non-canonical, so direct commits there are not a governance risk as long as reconcile is the only path to the cache clone.

2. **Status gate:** No self-authorizing language. "Agents MAY implement this RFC only after it is accepted" (line 539). Correct.

3. **Implementation notes** correctly reference RFC-0476 (`rfc.implement.stamp`) and RFC-0334 (supersede escalation). Good.

4. **Storage policy:** No cookies, no PII, no `document.cookie`. The RFC does not introduce client-side persistence. Compliant.

## Axis F — Pragmatism

1. **`mission.git.commit` earns its existence** — it's the canonical commit path for operator edits within a mission, providing a structured interface and audit trail message format. Not a flag on another command.

2. **`mission.preview` and `mission.cleanup`** both earn their existence — preview for side-by-side comparison is a stated requirement, cleanup for disk management is necessary as workpieces are preserved.

3. **`surface.contract.validate`** earns its existence as a separate command — it validates a different concern (C-surface conformance) than existing validators.

4. **Declarative C-contract in YAML** is a good choice — human-readable, machine-validatable. The alternatives section correctly rejects closed-enum (DNA-19 style) and SemVer-based versioning.

5. **`packagesImpacted` scope** is mostly correct but incomplete (see Axis C finding on `@gogol/forge`).

## Axis G — Blind spots

1. **`git am` idempotency on re-run (CRITICAL).** `mission.reconcile` uses `git format-patch --root` + `git am` (line 227-228). If reconcile fails mid-`git am` (conflict on patch 3 of 5), the cache clone has patches 1-2 applied. The RFC says "operator resolves in workpiece and re-runs reconcile" (line 229). But re-running `git format-patch --root` + `git am` will try to re-apply patches 1-2, which will fail (already applied). `git am` is NOT idempotent. The RFC must specify a mechanism: either (a) `git am --skip` for already-applied patches, (b) track the last-applied SHA and use `git format-patch <last-applied>..HEAD`, or (c) reset the cache clone to pre-reconcile state before re-applying all patches.

2. **`git format-patch --root` performance.** Exporting ALL commits from root could be slow for workpiece histories with many commits. Consider `git format-patch <base>..HEAD` where `<base>` is the last reconciled commit SHA (recorded in Bordbuch).

3. **`mission.preview` as long-running process.** Starting a dev server (`astro dev`) is a blocking operation. The RFC doesn't address whether `mission.preview` blocks the terminal or runs in the background. If blocking, the operator cannot run multiple previews side-by-side from the same terminal. The RFC should specify the process model (fork, spawn, or blocking with `--port` for differentiation).

4. **Bordbuch-vs-git-log matching algorithm unspecified.** The RFC says "if git log contains commits not corresponding to any Bordbuch entry → violation" (line 268) but doesn't specify how commits are matched to Bordbuch entries. Are commit SHAs recorded in Bordbuch `reconcile` entries? What if a reconcile commit was rebased? What about merge commits or Bordbuch entries without SHA? The matching algorithm must be specified.

5. **`mission.cleanup --older-than` timestamp source unspecified.** Is "older than 30d" determined by `closedAt`/`abortedAt` in the mission manifest, by directory mtime, or by git bundle creation date? Must be specified.

6. **Concurrent `mission.preview` on same mission.** Multiple operators previewing the same mission on different ports — the workpiece directory is shared. Astro dev server may conflict on `.astro/` cache or generated files. The RFC should address whether concurrent previews of the same mission are supported or rejected.

7. **Empty state for `surface.contract.validate`.** New system with no content, no routes, no JSON-LD, no sitemap — does `surface.contract.validate` pass (no surfaces = no violations) or fail (empty contract)? Must be specified.

## Questions for the author

1. How does `mission.reconcile` handle re-run after partial `git am` failure? `git am` is not idempotent — re-applying already-applied patches fails. What is the idempotency mechanism?

2. Why is `mission.preview` listed in `commands.proposed` when it already exists in the codebase? Should it not be in `commands.changed`?

3. Why is `@gogol/forge` not in `packagesImpacted` when the RFC modifies `packages/forge/os/rfc/types.ts` and `packages/forge/os/rfc/handlers/validate-rules.ts`?

4. What is the exact frontmatter field name: `Breaks-C` or `breaksC`? Existing fields are camelCase — which convention does this RFC follow?

5. What happens to the `distribution/` directory on `mission.abort`? Is it preserved alongside the workpiece, or deleted?

6. Is `surface.contract.validate` blocking (hard fail) or advisory (warning) in `build.check`? The RFC states it blocks `release.prepare` but doesn't specify the `build.check` behavior.
