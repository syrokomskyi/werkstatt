---
reviewId: REVIEW-CODE-2026-08-18-02
date: 2026-08-18
reviewer:
  skill: fo-review
  model: claude-sonnet-4-20250514
verdict: needs-revision
diffRange: uncommitted changes (8 files)
filesReviewed:
  - .agents/skills/_shared/fo-pipeline-conventions.md
  - .agents/skills/fo-idea-i-just-want-to-see-the-plan/SKILL.md
  - .agents/skills/fo-idea-i-just-want-to-see-the-result/SKILL.md
  - .agents/skills/fo-idea-implement/SKILL.md
  - packages/forge/skills/_shared/fo-pipeline-conventions.md
  - packages/forge/skills/fo/fo-idea-i-just-want-to-see-the-plan/SKILL.md
  - packages/forge/skills/fo/fo-idea-i-just-want-to-see-the-result/SKILL.md
  - packages/forge/skills/fo/fo-idea-implement/SKILL.md
---

# Code Review: uncommitted changes — pre-pipeline checkpoint addition

### Verdict: Needs revision

The pre-pipeline checkpoint convention is well-structured and correctly referenced from all three pipeline skills. However, the step renumbering in `fo-idea-implement` (3.x→4.x, 4.x→5.x) broke cross-references in three files that were not updated as part of this diff.

### Mechanical floor

N/A — all changed files are `.md` skill documentation. No `build:check` or `astro check` applicable.

### Axis A — Structural correctness

1. **Broken cross-reference in `PREFERENCES.md`** — line 47 says "follow its steps 3.1–3.8 literally" and line 52 says "follow `fo-idea-implement` steps 3.6–3.8 literally". After the renumbering, these are now `4.1–4.8` and `4.6–4.8`. An agent following PREFERENCES.md would look for the wrong step numbers.

2. **Broken cross-references in `fo-doc-audit/SKILL.md`** — line 252 says `fo-idea-implement` step 3.9 ("Documentation audit") and line 253 says `ADR-FLOW step 4.6` ("Documentation audit"). After renumbering, these are `4.9` and `5.6` respectively. Both `.agents/skills/fo-doc-audit/SKILL.md` and `packages/forge/skills/fo/fo-doc-audit/SKILL.md` copies are affected.

3. **Broken cross-references in `fo-session-retro/SKILL.md`** — line 181 says "finish the remaining `fo-idea-implement` steps (3.6–3.8)" and line 184 says "execute `fo-idea-implement` steps 3.6–3.8". After renumbering, these should be `4.6–4.8`. Both `.agents/skills/fo-session-retro/SKILL.md` and `packages/forge/skills/fo/fo-session-retro/SKILL.md` copies are affected.

### Axis B — DNA alignment

No issues. The changes are to skill documentation, not code governed by DNA invariants. No invariant in `docs/architecture-dna.md` addresses skill file structure or checkpoint conventions.

### Axis C — Ecosystem fit

No issues. The `.agents/skills/` and `packages/forge/skills/` copies are kept in sync (verified identical via `diff`). The convention is correctly placed in `_shared/fo-pipeline-conventions.md` alongside the existing checkpoint conventions.

### Axis D — Forward-only compliance

No issues. No legacy paths, no compatibility shims. The new checkpoint is additive — it introduces a new convention without maintaining a parallel old behavior.

### Axis E — Agent-facing clarity

No issues. The pre-pipeline checkpoint YAML block is well-structured with clear fields (`documents`, `operatorConstraints`, `aiLanguage`, `sessionSummary`). The "When to emit" conditions are explicit: both pre-existing context AND a pipeline skill. The "What NOT to release" section prevents accidental loss of critical fields.

### Axis F — Pragmatism

1. **Shotgun Surgery from step renumbering** — inserting step 3 in `fo-idea-implement` forced renumbering of all subsequent steps (3.x→4.x, 4.x→5.x, 5→6), which in turn forced cross-reference updates in `PREFERENCES.md`, `fo-doc-audit/SKILL.md`, and `fo-session-retro/SKILL.md`. Those updates were not done, leaving 3 files with broken references (see Axis A findings 1–3). The root cause is the use of hard-coded step numbers in cross-file references. A long-term fix would be named anchors (e.g. `§Stamp implemented` instead of `step 4.8`), but that is a separate refactor. For now, the 3 files must be updated.

### Axis G — Blind spots

1. **Edge case: checkpoint with `fo-idea-implement` invoked standalone** — the convention says to emit the checkpoint when "pre-existing context exists". If `fo-idea-implement` is invoked standalone (not via the orchestrator) after a long discussion, the agent must emit the checkpoint. But if it's invoked via the orchestrator, the orchestrator already emitted it. The `fo-idea-implement` skill says "If the session has no prior context (e.g. this skill was invoked at the start of a session), skip the checkpoint." This is correct but could lead to a double checkpoint if the orchestrator emits one and then `fo-idea-implement` emits another. The orchestrator's step 1 says to emit the checkpoint, and then step 2 invokes `fo-idea-implement` which has its own step 3 checkpoint. Consider adding a note: "If a pre-pipeline checkpoint was already emitted by the calling orchestrator, skip this step."

### Spec compliance

No spec available — this was a conversational design decision, not an RFC/ADR. Skipped.

### Questions for the author

1. The step renumbering in `fo-idea-implement` broke cross-references in `PREFERENCES.md`, `fo-doc-audit/SKILL.md`, and `fo-session-retro/SKILL.md`. Should these be fixed in this same change, or tracked separately?
2. Could the pre-pipeline checkpoint be emitted twice — once by the orchestrator and once by `fo-idea-implement` when invoked via the orchestrator? Should `fo-idea-implement` skip the checkpoint if one was already emitted?
3. The convention lists `fo-idea-i-just-want-to-see-the-plan` as a pipeline skill that should emit the checkpoint, but the wrapper skill says the orchestrator handles it. Should the convention list be adjusted to clarify that wrapper skills delegate?
