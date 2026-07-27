---
rfcId: RFC-0526
auditId: AUDIT-RFC-0526-01
date: 2026-07-25
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0526

## Verdict: Needs revision

The RFC addresses a real naming asymmetry and the decision is sound, but five required sections are missing (V-13), `video.variants.validate` is listed in `commands.changed` without any described change, and the RFC does not address stale-file cleanup in `public/_video/` after the rename. The code changes are already present in the codebase while the RFC remains in `draft` status — a status-gate gap that must be resolved during implementation.

## Mechanical validation (rfc.validate)

Pass with 5 V-13 warnings (missing required sections):

- `## Problem`
- `## Architectural fit`
- `## Design`
- `## Alternatives considered`
- `## Implementation notes for agents`

## Axis A — Structural completeness

- **FAIL**: Five required sections are missing (V-13 warnings above). The unified template requires Problem, Architectural fit, Design, Alternatives considered, and Implementation notes for agents.
- **Decision** is clear and present-tense ("All derived progressive video files MUST include a codec infix") — good.
- **Rollout** is concrete with 5 numbered steps — good.
- **Risks** is thin: mentions cache invalidation and no external impact, but does not address stale-file cleanup or agent misinterpretation risk.
- **Acceptance criteria** are checkable and cover the decision's scope — good. However, none carry evidence yet (RFC is in `draft`).

## Axis B — DNA alignment

No issues. `satisfies: []` is acceptable for a `kind: policy` naming-standard RFC — it does not establish or extend a DNA invariant. No conflict with existing DNA invariants.

## Axis C — Ecosystem fit

- **Package boundaries**: Correct — all changes are in `@gogol/site-kernel-checks` (`video-variants.ts`, `live-variants.ts`).
- **Layer C**: Correctly states no external impact. Filenames are internal to `public/_video/`; the manifest is the single source of truth for URLs. No `Breaks-C: yes` needed.
- **Command lifecycle**: `commands.changed` lists `video.variants.generate`, `video.variants.validate`, `live.variants.generate`. However, `video.variants.validate` reads manifest URLs (`video-variants.ts:630-637`) — it does not hardcode filenames. No code change to the validator is described in the RFC body or needed in practice. This entry should be removed or the RFC should describe the change.
- **Transparency claim**: The RFC should explicitly state that `video-fallback.ts` and `video.dist.prune` are transparent to the rename (both read manifest URLs, not hardcoded filenames). This is a key assurance for reviewers.

## Axis D — Forward-only compliance

No issues. Old filenames are replaced, not maintained alongside. The `ENCODER_SETTINGS_VERSION` bump from `"2"` to `"3"` forces a clean re-encode — no dual-path or compatibility shim.

## Axis E — Agent-facing policy

- **Status gate**: No self-authorizing language in the RFC body. However, the codebase already contains the implemented changes (`ENCODER_SETTINGS_VERSION = "3"`, `progressive.h264.mp4`, `progressive.vp9.webm` in both `video-variants.ts` and `live-variants.ts`) while the RFC is in `draft`. This is a status-gate process gap — the RFC must transition to `accepted` → `implemented` via the standard governance flow. The audit is read-only and does not modify the RFC; the enhance/plan/implement pipeline will resolve this.
- **Missing Implementation notes for agents**: The RFC lacks explicit behavioral rules for implementing agents (e.g. "do not maintain old filenames alongside new ones", "the validator and fallback guard are transparent to the rename because they read manifest URLs").

## Axis F — Pragmatism

- **FAIL**: `video.variants.validate` is listed in `commands.changed` but no change to the validator is described in the RFC body. The validator reads manifest URLs (`video-variants.ts:630-637`) and is transparent to filename changes. This entry should be removed from `commands.changed`, or the RFC should describe what change is needed (if any).
- **Scope discipline**: `appsImpacted: []` is correct. `packagesImpacted: ["@gogol/site-kernel-checks"]` is correct — both modified files are in that package.
- **Non-goals** are explicit and meaningful (HLS segments, poster, captions) — good.

## Axis G — Blind spots

- **FAIL**: Stale-file cleanup is not addressed. After the rename, `public/_video/<lang>/<token>/` directories may contain both old files (`progressive.mp4`, `progressive.webm`) and new files (`progressive.h264.mp4`, `progressive.vp9.webm`). The copy loop in `video-variants.ts:535-541` copies from cache to public but does not delete old files. The RFC should specify whether operators need to clean `public/_video/` manually or whether the generate command should purge stale entries.
- **Edge case**: A site with a warm cache from RFC-0525 (`ENCODER_SETTINGS_VERSION = "2"`) will have old-named files in `public/_video/`. The `ENCODER_SETTINGS_VERSION` bump creates new cache entries, but old files in `public/` persist. The RFC should document this.
- **`video.dist.prune` interaction**: `video.dist.prune` matches bundled source videos by basename from the manifest — it does not reference progressive filenames. No issue, but worth stating explicitly.

## Questions for the author

1. Should `video.variants.validate` remain in `commands.changed`? The validator reads manifest URLs and is transparent to the rename — no code change is needed. If it should be removed, update the frontmatter.
2. What happens to stale `progressive.mp4` and `progressive.webm` files in `public/_video/` after the rename? Should `video.variants.generate` purge old-named files, or is manual cleanup expected?
3. The codebase already contains the implemented changes (`ENCODER_SETTINGS_VERSION = "3"`, new filenames in both files). Was this implemented ahead of the RFC acceptance? If so, the status should transition to `implemented` with evidence during the pipeline.
