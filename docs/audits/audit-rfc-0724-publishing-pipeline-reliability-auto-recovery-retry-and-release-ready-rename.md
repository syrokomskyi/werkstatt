---
rfcId: RFC-0724
auditId: AUDIT-RFC-0724-01
date: 2026-08-06
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0724

## Verdict: Needs revision

The RFC addresses real reliability gaps but contains several factual errors (wrong file paths, wrong CLI flags), an architectural boundary violation (cross-package git commit from `site-kernel-checks`), an internally inconsistent retry specification, and an incomplete cascade analysis for the `published` → `ready` state rename. These must be fixed before implementation.

## Mechanical validation (rfc.validate)

Pass — 0 violations.

## Axis A — Structural completeness

- **Wrong file paths in File system responsibilities table (line 199–201):**
  - `packages/os/site-kernel-checks/src/checks/behavior-snapshot.ts` — actual path is `packages/os/site-kernel-checks/src/behavior-snapshot.ts` (no `checks/` subdirectory).
  - `packages/os/site-kernel-handoff/src/mission/mission-validate.ts` — no such file exists. The actual file is `packages/os/site-kernel-handoff/src/mission/mission-materialization-commands.ts`.
  - `packages/os/site-kernel-handoff/src/leitstand/verify-freshness.ts` — does not exist. `verifyFreshness` is a private inline function in `leitstand-commands.ts:289`. The RFC should state this is a new file to be extracted, not an existing file to be modified.

- **CLI surface uses `--site` flag (lines 153–161) but actual commands use `--system`:** All leitstand commands (`dev-deploy`, `propagate`, `promote`) accept `--system`, not `--site`. `release.publish`/`release.ready` accepts only `--release` (derives system from manifest). Every CLI example in the RFC is wrong.

- **`commands` frontmatter is internally inconsistent (lines 34–41):** `release.publish` appears in both `changed` and `removed`. `release.ready` is not listed in `added`. Correct: `added: [release.ready]`, `removed: [release.publish]`, `changed` should not include `release.publish`.

- **Rollout mentions `--skip-axiom` flag (line 218):** "`--skip-axiom` flag removed from dev-deploy release path." RFC-0700 never added a `--skip-axiom` flag — the release path simply skips Axiom by not calling `mission.check`. There is no flag to remove.

- **Missing acceptance criterion for CI template updates:** The rollout (line 214) and acceptance criteria (line 246) mention updating CI templates, but no acceptance criterion verifies CI template references to `release.publish` are updated.

## Axis B — DNA alignment

- **DNA-51 connection not articulated (line 28):** The RFC's `satisfies: [DNA-51]` claims alignment with Werkstatt consistency primitives, but the body never explains how auto-recovery and auto-commit use the shared lock, idempotency, or atomic staging primitives from RFC-0362. The auto-commit of dirty bordbuch and the snapshot auto-recovery git commit should use `commitBordbuchProjections` (which uses `gitExecWithRetry`) or similar DNA-51-compliant primitives. The RFC should state this explicitly.

- **DNA-59 connection is implicit but not explained (line 28):** Making the Axiom gate mandatory in the release path supports DNA-59 (evidence preservation), but the RFC doesn't explain how evidence from the release-path `mission.check` will be preserved. Will `evidence.sync` run? Will the evidence-metadata.json be stored in the release directory? The RFC should state the evidence flow.

- **DNA-56 (Studio Gate MCP) needs updating:** DNA-56 lists `release.publish` as an MCP tool projected by the Studio Gate. The rename to `release.ready` requires updating DNA-56's tool list. The RFC doesn't mention this.

## Axis C — Ecosystem fit

- **Incomplete cascade analysis for `published` → `ready` state rename:** The rename touches at least 7 code locations the RFC doesn't enumerate:
  1. `leitstand.propagate` state check: `state !== "published"` → `state !== "ready"` (`leitstand-commands.ts:1534`)
  2. `leitstand.propagate` error message: "Run leitstand.dev-deploy first, then release.publish" (line 1536)
  3. `leitstand.propagate` preflight check name: `"release-published"` (line 401)
  4. `leitstand.propagate` candidate search: `manifest.state === "published"` (line 2376)
  5. `autoStepReleaseState`: returns `"published"` (lines 2304–2305)
  6. `release.rollback`: checks `state !== "published"` (`release-commands.ts:876`)
  7. `release.validate`: checks `state === "published"` (`release-commands.ts:785`)

  The RFC should list all these locations in the File system responsibilities table.

- **Compass sync not identified:** The release state machine change affects `docs/verification-plan.xml` (release states are part of the verification flow). The RFC should identify which `docs/*.xml` files need synchronization.

- **AGENTS.md updates not identified:** The root `AGENTS.md` and `packages/os/site-kernel-handoff/AGENTS.md` reference `release.publish` and the `published` state. These need updating. The RFC doesn't mention which AGENTS.md files need changes.

- **Command lifecycle buckets inconsistent:** See Axis A finding on `commands` frontmatter.

## Axis D — Forward-only compliance

No issues. The RFC proposes a clean break rename with no alias, no compatibility shim, and no dual-path. The skip-Axiom behavior from RFC-0700 is removed, not maintained behind a flag. Existing `state: published` releases are migrated in the same wave. Forward-only compliant.

## Axis E — Agent-facing policy

- **Status gate language is correct (line 251):** "Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented)." No self-authorizing language.

- **Implementation notes reference RFC-0224 and RFC-0334 (lines 252, 253):** Correct governance references. The RFC has no acceptance probes (commented out), so no verification evidence reference is needed.

- **No NEEDS CLARIFICATION markers found.**

- **Anti-fabrication:** All acceptance criteria are code changes an agent can make. No content authoring required. Compliant.

- **Storage policy:** No cookies or client-side persistence introduced. Compliant.

## Axis F — Pragmatism

- **`verify-freshness.ts` extraction may be unnecessary:** The RFC proposes extracting `verifyFreshness` into a new file `verify-freshness.ts` for reuse in promote. But the existing function is a private function in `leitstand-commands.ts` — it could simply be exported. A new file is only justified if the function needs to be shared across files. Since both `dev-deploy` and `promote` handlers are in the same file (`leitstand-commands.ts`), no extraction is needed. The RFC should justify the extraction or drop it.

- **`packagesImpacted` is incomplete (lines 43–45):** Lists `@warpgogol/site-kernel-handoff` and `@warpgogol/site-kernel-checks`. But the rename touches CI templates (`.github/workflows/`) and AGENTS.md files — these aren't packages, but the RFC should acknowledge the full impact surface in the Rollout section.

- **Retry backoff specification is internally inconsistent (line 130):** The RFC says "5 attempts, exponential backoff (3s/6s/12s/24s/48s)". That's 5 delays, which implies 6 attempts (first immediate + 5 delayed). The existing code (RFC-0657) has 4 delays for 5 attempts: `[3_000, 6_000, 12_000, 24_000]`. The RFC adds a 48s delay, making it 5 delays. The total wait "~93 seconds" (line 233) = 3+6+12+24+48 = 93, confirming 5 delays. But "5 attempts" with 5 delays means 6 attempts. Either the attempt count should be 6, or the 48s delay should be removed.

## Axis G — Blind spots

- **Architectural boundary violation in auto-recovery design (lines 85–95):** `behavior.snapshot.validate` lives in `@warpgogol/site-kernel-checks`. `commitBordbuchProjections` lives in `@warpgogol/site-kernel-handoff`. `site-kernel-checks` does NOT depend on `site-kernel-handoff` (the dependency is the reverse: `handoff` depends on `checks`). The RFC's auto-recovery design requires `site-kernel-checks` to commit to the cache clone, but it cannot import the commit primitives from `site-kernel-handoff`. The RFC must either: (a) move the auto-recovery orchestration to a `site-kernel-handoff` pipeline wrapper, (b) use raw `gitExec` directly in `site-kernel-checks` (new pattern, needs justification), or (c) have the pipeline executor handle the commit after `behavior.snapshot.validate` signals recovery.

- **File confusion in auto-recovery (line 91):** The RFC says "Commits the updated `bordbuch/status.generated.yaml` to the cache clone." But `behavior.snapshot.generate` writes `behavior.snapshot.generated.yaml`, not `bordbuch/status.generated.yaml`. These are different files. The RFC appears to confuse the behavior snapshot file with the bordbuch status projection.

- **Auto-recovery second pass is tautological:** The RFC says (line 95): "If the second validation also fails, the step fails with the original error." But the second validation compares the freshly-generated snapshot against itself — it will always pass. The auto-recovery as described is not a recovery + re-validation, it's a recovery + overwrite. The RFC should clarify whether the second pass compares against the just-generated snapshot (tautological pass) or re-runs the full diff against a different baseline.

- **Concurrent execution not addressed:** If two `mission.validate` runs trigger auto-recovery simultaneously for the same system, both will try to git commit in the same cache clone. The RFC doesn't address this race condition.

- **Migration of existing `state: published` releases (line 215):** The RFC says "only the latest release matters for propagate/promote" but `leitstand.propagate` candidate search (line 2376) looks for ALL releases with `state === "published"`. Older releases with `state: published` would become invisible to the candidate search after the rename. The migration must update all releases, not just the latest.

- **Performance cost of auto-recovery not specified:** `buildBehaviorSnapshot` scans all HTML files in `dist/client`. On failure, auto-recovery runs it again (generate) and then again (validate). That's 3x the snapshot building cost. The RFC should document this cost.

## Questions for the author

1. How will `behavior.snapshot.validate` (in `site-kernel-checks`) commit to the cache clone when `site-kernel-checks` cannot import from `site-kernel-handoff`? What is the concrete mechanism — pipeline executor callback, raw git in checks, or moving the orchestration to handoff?

2. The auto-recovery second validation pass compares the freshly-generated snapshot against itself (tautological pass). What is the actual recovery contract — is it "regenerate and overwrite, log a warning, continue" or "regenerate, re-validate against a different baseline, fail if still different"?

3. The retry specification says "5 attempts" but lists 5 backoff delays (3s/6s/12s/24s/48s) totaling ~93s, which implies 6 attempts. Is the intent 5 attempts with 4 delays (matching existing RFC-0657 constants) or 6 attempts with 5 delays (new behavior)?
