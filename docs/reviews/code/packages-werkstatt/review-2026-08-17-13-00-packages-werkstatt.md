---
reviewId: REVIEW-CODE-2026-08-17-01
date: 2026-08-17
reviewer:
  skill: fo-review
  model: claude-sonnet-4-20250514
verdict: needs-revision
diffRange: 4ce32202...HEAD
filesReviewed:
  - packages/werkstatt/src/kernel/pipeline-hint.ts
  - packages/werkstatt/src/kernel/pipeline-hint.test.ts
  - packages/werkstatt/src/kernel/cli/index.ts
  - packages/werkstatt/src/kernel/runtime/execute-command.ts
  - packages/werkstatt/src/sternsystem/sternsystem-validate.ts
  - packages/werkstatt/src/sternsystem/manifest-presence.test.ts
  - packages/werkstatt/src/mission/mission-materialize.ts
  - packages/werkstatt-site/src/checks/generator-ownership.ts
  - packages/werkstatt-site/src/checks/tests/ownership-map-manifest-regression.test.ts
  - AGENTS.md
---

# Code Review: RFC-0870 implementation (4ce32202...HEAD)

### Verdict: Needs revision

Two findings: (1) `COMMITTED_MANIFEST_PATHS` in `sternsystem-validate.ts` duplicates manifest paths already maintained in `GENERATOR_OWNERSHIP_MAP` — a maintenance hazard. (2) `KNOWN_PIPELINE_NAMES` in `pipeline-hint.ts` is a static hardcoded list that the RFC's own risk mitigation claims reads from the pipeline registry, but the implementation does not.

### Mechanical floor

Pass — `pnpm --filter @warpgogol/werkstatt build:check` and all 342 tests pass (286 kernel + 49 sternsystem + 6 ownership-map + 1 ownership-cross-check).

### Axis A — Structural correctness

- **Finding A1: Duplicated manifest paths.** `COMMITTED_MANIFEST_PATHS` in `@/packages/werkstatt/src/sternsystem/sternsystem-validate.ts:82-85` hardcodes the same three manifest paths (`src/image-variants.generated.yaml`, `src/video-manifest.generated.yaml`, `src/live-video-manifest.generated.yaml`) that are registered in `GENERATOR_OWNERSHIP_MAP` in `@/packages/werkstatt-site/src/checks/generator-ownership.ts:704-749`. If a new manifest is added to the ownership map but not to `COMMITTED_MANIFEST_PATHS`, the validator will silently miss it. The Duplicated Code smell applies. Recommendation: add a comment cross-referencing `GENERATOR_OWNERSHIP_MAP` as the source of truth, or derive the list dynamically via a filtered import (DNA-64 permits dynamic `import()`).

- **Finding A2: Static pipeline list diverges from RFC mitigation.** `KNOWN_PIPELINE_NAMES` in `@/packages/werkstatt/src/kernel/pipeline-hint.ts:23-39` is a hardcoded set of pipeline names. The RFC's own Risks section (line 228) states: "Mitigation: the hint reads from the same pipeline registry that defines them." The implementation does not read from any registry — it is a static list that must be manually kept in sync. This is a Duplicated Code smell and a maintenance hazard. Recommendation: either (a) update the RFC risk mitigation text to acknowledge the static list tradeoff, or (b) derive the list from the workspace registry at call time.

### Axis B — DNA alignment

- **DNA-47 (Materialization):** The `mission.materialize` restoration code (`@/packages/werkstatt/src/mission/mission-materialize.ts:1188-1218`) correctly restores registry-only generated files after `atomicMoveDir`, supporting the materialization contract. Pass.
- **DNA-58 (Generated-file content determinism):** The `STERN-MANIFEST-01` check in `sternsystem.validate` enforces that committed generated manifests are present in cache clone HEAD, supporting drift detection. Pass.
- **DNA-64 (Autonomy boundary):** The `mission.materialize` code uses dynamic `import()` for `@warpgogol/werkstatt-site/checks/generator-ownership` (line 1194), correctly respecting the engine→plugin boundary. Pass.

### Axis C — Ecosystem fit

- **Package boundaries:** Dynamic import from engine to site plugin is the sanctioned pattern. Pass.
- **Pipeline placement:** No new checks added to pipelines. Pass.
- **AGENTS.md:** Root `AGENTS.md` updated with pipeline-vs-command note. Pass.
- **Command lifecycle:** No new commands. Pass.

### Axis D — Forward-only compliance

No compatibility shims, no dual paths, no legacy bridges. Pass.

### Axis E — Agent-facing clarity

- **Compass scaffolding:** `pipeline-hint.ts`, `manifest-presence.test.ts`, and `ownership-map-manifest-regression.test.ts` all carry `MODULE_CONTRACT` and `CHANGE_SUMMARY`. Pass.
- **No ungrounded assertions:** All comments reference real files and functions. Pass.
- **Readable by another agent:** Variable and function names are clear. Pass.

### Axis F — Pragmatism

- **Finding F1: `COMMITTED_MANIFEST_PATHS` could reference the ownership map.** The hardcoded list is the correct tradeoff for `sternsystem-validate.ts` because a static import from `@warpgogol/werkstatt-site` would violate DNA-64, and a dynamic import adds async overhead to a synchronous validation loop. However, a comment should explicitly state that `GENERATOR_OWNERSHIP_MAP` is the source of truth and that `COMMITTED_MANIFEST_PATHS` must be updated when new registry-only conditional manifests are added. The current comment (line 79-81) explains the "what" but not the "where to keep in sync."

- **`KNOWN_PIPELINE_NAMES` minimality:** The static list is acceptable for a hint-only feature — runtime registry enumeration would add complexity for marginal benefit. But the RFC's risk mitigation text should be updated to match the implementation.

### Axis G — Blind spots

- **Shell injection in `git checkout`:** `@/packages/werkstatt/src/mission/mission-materialize.ts:1202` uses `execSync(\`git checkout HEAD -- ${entry.path}\`)`. `entry.path` comes from `GENERATOR_OWNERSHIP_MAP`, which contains hardcoded trusted strings. No user input flows into these paths. Low risk — no action needed, but worth noting for future audits.
- **False positives on new Sternsystemen:** The `checkManifestPresence` function correctly skips untracked files (line 104: `if (!tracked) continue`), so new systems without manifests are not flagged. Verified by test. Pass.
- **Edge case — `git checkout` with existing file:** The RFC risk section (line 227) addresses this: materialize just created the workpiece from a fresh staging directory, so there should be no uncommitted changes. Pass.

### Spec compliance

| Requirement from RFC-0870 | Status | Evidence |
| --- | --- | --- |
| Change 1: Register manifest paths in GENERATOR_OWNERSHIP_MAP | Done | `generator-ownership.ts:704-749` |
| Change 2: STERN-MANIFEST-01 check in sternsystem.validate | Done | `sternsystem-validate.ts:78-124` |
| Change 3: Restore registry-only files in mission.materialize | Done | `mission-materialize.ts:1188-1218` |
| Change 4: Pipeline hint in kernel CLI error messages | Done | `pipeline-hint.ts`, `cli/index.ts:41`, `execute-command.ts:448,515` |
| Tests for all changes | Partial | pipeline-hint.test.ts (4), manifest-presence.test.ts (3), ownership-map-manifest-regression.test.ts (6) — no mission-materialize test |
| AGENTS.md pipeline-vs-command note | Done | `AGENTS.md:348` |

### Questions for the author

1. `COMMITTED_MANIFEST_PATHS` duplicates paths from `GENERATOR_OWNERSHIP_MAP` — what prevents these two lists from diverging over time? Should there be a cross-check test or a comment linking them?
2. The RFC risk mitigation says "the hint reads from the same pipeline registry" but the implementation uses a static list — should the RFC text be updated, or should the implementation be changed to read from the registry?
3. The acceptance criterion for `mission.materialize` restoration says "evidence: test in `mission-materialize.test.ts`" but no such test file exists — is the code-path evidence sufficient, or should a test be written despite the complex mocking requirements?
