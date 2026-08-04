---
rfcId: RFC-0669
auditId: AUDIT-RFC-0669-01
date: 2026-08-04
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0669

## Verdict: Needs revision

The RFC correctly identifies a real gap (no context management between batch items in the orchestrator) and proposes a proportionate solution (YAML checkpoint block + LLM release directive). However, the Design section references a "batch processing section" that does not exist in the orchestrator skill, and the rationale for excluding standalone batch skills is not documented in the RFC body.

## Mechanical validation (rfc.validate)

Pass — 0 violations.

## Axis A — Structural completeness

- **"step 3.2 of the implementation flow" reference is ambiguous.** The checkpoint directive says "begin the next document with a fresh read phase (step 3.2 of the implementation flow: read the RFC fully and all related documents)." This references `fo-idea-implement`'s internal step numbering, which is not visible from the orchestrator's perspective. An agent reading the orchestrator skill will not know what "step 3.2" refers to without cross-referencing `fo-idea-implement/SKILL.md`. Replace with a self-contained description: "begin the next document with a fresh read phase (re-read the RFC file and all related documents)."

- **Design references "batch processing section" that does not exist.** The Design section says: "In the batch processing section, after the existing 'without pauses between pipeline steps' directive, add..." The orchestrator skill (`packages/forge/skills/fo/fo-idea-i-just-want-to-see-the-result/SKILL.md`) has no section called "batch processing." The "No pauses between pipeline steps" directive is in the **Constraints** section (line 160). The Design section must specify the correct insertion point: either the Constraints section, the Process section (after line 55 "For each document, run the full pipeline inline"), or a new subsection.

## Axis B — DNA alignment

No issues. `satisfies[]` is empty — correct for `kind: policy`. `related[]` references RFC-0537, RFC-0581, RFC-0664, all relevant and correctly traced.

## Axis C — Ecosystem fit

- **`packages/forge/AGENTS.md` not mentioned.** The AGENTS.md file for `packages/forge` has a detailed Skills section documenting skill infrastructure (sync, validation, concerns, knowledge files). The RFC should explicitly state whether `packages/forge/AGENTS.md` needs updating. Based on review: the AGENTS.md documents skill infrastructure, not individual skill behavior — so no update is needed. But the RFC should state this explicitly in the Rollout or File system responsibilities section.

## Axis D — Forward-only compliance

No issues. The checkpoint is additive — it does not replace or weaken the "without pauses" directive. No compatibility shim, no dual-path.

## Axis E — Agent-facing policy

No issues. No self-authorizing language. Implementation notes reference correct governance rules (RFC-0224, RFC-0334). Status gate is clear: "Agents MAY implement skill text changes ONLY when this RFC has status: accepted."

## Axis F — Pragmatism

- **Rationale for excluding standalone batch skills not documented.** The RFC's `nonGoals` excludes `fo-idea-audit`, `fo-idea-enhance`, `fo-idea-plan`, `fo-idea-implement` from the checkpoint directive. However, `fo-idea-implement` also has batch processing ("loop through each one... without pauses between documents"). A direct invocation of `fo-idea-implement` with multiple RFCs would not get checkpoints. The RFC body does not explain why this is acceptable. The grilling established that the orchestrator generates maximum context (full pipeline per RFC), while standalone batch skills are lighter — but this rationale is not in the RFC. Add a sentence to the Decision or Architectural fit section explaining why standalone batch skills are excluded.

## Axis G — Blind spots

- **Resume with no checkpoint markers.** The Resume behavior section says "scan conversation output for `--- checkpoint ---` markers" but does not address what happens when no checkpoint markers exist in conversation output (e.g., new session, IDE restarted, or interruption before the first checkpoint was emitted). The existing resume logic (step 3 of the orchestrator) uses git log, audit/plan file inspection, and frontmatter status as signals. The RFC should state that the checkpoint marker is an **additional** resume signal, not a replacement for the existing resume logic. If no checkpoint markers are found, fall back to the existing git-log-and-file-inspection approach.

## Questions for the author

1. Where exactly in the orchestrator SKILL.md should the checkpoint directive be inserted — the Process section (after "For each document, run the full pipeline inline"), the Constraints section (after "No pauses between pipeline steps"), or a new subsection?
2. If `fo-idea-implement` is invoked directly with multiple RFCs (not through the orchestrator), should it also emit checkpoints? If not, why is the risk of context saturation acceptable for direct invocations but not for orchestrator invocations?
3. What happens if the agent emits a checkpoint block with `status: implemented` but the RFC file still shows `draft` (e.g., stamp failed silently)? The RFC says "git log verification mitigates this" — but what specific action does the resume logic take? Re-process the document, or skip it with a warning?
