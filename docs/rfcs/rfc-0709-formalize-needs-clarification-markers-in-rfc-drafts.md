---
id: RFC-0709
title: "Formalize NEEDS CLARIFICATION markers in RFC drafts"
status: accepted
kind: policy
scope: workspace
owners:
  - architecture
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-08-06
updatedAt: 2026-08-06
enhancedAt: 2026-08-06
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0710
  - RFC-0711
  - RFC-0712
versionBump: patch
commands:
  proposed: []
  added: []
  changed:
    - rfc.validate
  removed: []
appsImpacted: []
packagesImpacted:
  - packages/forge
successSignals:
  - "RFC drafts contain explicit NEEDS CLARIFICATION markers instead of guessed content"
  - "Audit reports reference unresolved markers with line numbers"
  - "Enhance step resolves all markers before status transition to reviewing"
nonGoals:
  - "Does not modify ADR workflow — ADRs use accepted-decision fast path and do not need markers"
  - "Does not introduce a new Site OS command — extends existing rfc.validate"
  - "Does not apply to implemented or accepted RFCs — markers are a draft-phase tool"
---

# RFC-0709: Formalize NEEDS CLARIFICATION markers in RFC drafts

## Context

During RFC creation (`fo-idea-create-rfc`) and enhancement (`fo-idea-enhance`), agents sometimes guess instead of marking uncertainty. The `grilling` step in `fo-idea-create-rfc` catches some of this after the draft is written, but there is no **inline marker** in the RFC body that survives until the enhance step resolves it.

The `fo-idea-audit` skill already produces "Questions for the author" in its audit report, but those questions live in `docs/audits/` — not in the RFC body itself. An agent reading the RFC during enhance or plan has no way to distinguish resolved content from guessed content. This leads to:

1. **Silent guesses** — agents fill sections with plausible-sounding but unverified content.
2. **Lost questions** — audit questions are in a separate file that may not be read by the implementing agent.
3. **Ambiguous drafts** — reviewers cannot tell which parts of a draft are settled and which are speculative.

Spec-Kit solves this with `NEEDS CLARIFICATION` markers in templates — uncertain areas are explicitly marked instead of guessed. This RFC adopts that pattern for Forge.

## Problem

There is no formal mechanism for marking uncertainty inside RFC draft bodies. The audit's "Questions for the author" are external to the RFC file. Agents reading the RFC during enhance, plan, or implementation cannot distinguish resolved content from agent guesses without cross-referencing the audit report.

This creates a quality gap: guessed content enters the RFC pipeline, survives through acceptance, and becomes implemented code based on assumptions rather than operator-confirmed decisions.

## Decision

Introduce `> NEEDS CLARIFICATION: <question>` as a formal inline marker in RFC drafts. The marker is a blockquote line that:

1. **Signals uncertainty** — any agent reading the RFC sees exactly which parts are unsettled.
2. **Blocks status transition** — `rfc.validate` rejects status transitions from `draft` to `reviewing` if unresolved markers remain.
3. **Is resolved during enhance** — `fo-idea-enhance` resolves markers by replacing them with operator-confirmed content.
4. **Is reported during audit** — `fo-idea-audit` lists unresolved markers with line numbers in the audit report.

## Architectural fit

- **Forge bindings (DNA-54):** The `fo-idea-create-rfc` and `fo-idea-audit` skill instructions reference the marker syntax via skill body text, not hardcoded project literals. No new bindings are needed.
- **RFC governance:** Extends the existing RFC lifecycle (`draft → reviewing → accepted → implemented`) with a quality gate between `draft` and `reviewing` — markers must be resolved before the RFC enters review.
- **Audit pipeline:** Complements the existing audit axes (A–G) with a structural check for marker presence.

## Design

### Marker syntax

```markdown
> NEEDS CLARIFICATION: Should this command accept --json output, or is pretty-print sufficient?
```

The marker is a single blockquote line starting with `> NEEDS CLARIFICATION:` followed by a question. Multiple markers may appear in the same RFC. Markers may appear in any section of the RFC body.

### Validation rule V-NC-01

`rfc.validate` gains a new validation rule:

- **V-NC-01 (draft):** RFCs with `status: draft` produce a **warning** for each unresolved `NEEDS CLARIFICATION` marker found in the body. The warning includes the line number and marker text.
- **V-NC-01 (reviewing+):** RFCs with `status: reviewing`, `accepted`, or `implemented` produce an **error** for each unresolved marker. The RFC cannot pass validation with unresolved markers in these statuses.

### Skill modifications

#### `fo-idea-create-rfc`

Step 5 (fill sections) gains an instruction:

> When a section cannot be filled with confidence, insert `> NEEDS CLARIFICATION: <question>` instead of guessing. Do not leave sections empty or fill them with speculative content. Markers are resolved during the enhance step.

#### `fo-idea-audit`

The audit report gains a "NEEDS CLARIFICATION markers" subsection under axis E (Agent-facing):

> List all unresolved `NEEDS CLARIFICATION` markers with line numbers. If none are found, state "No unresolved markers." Markers in `draft` status are informational; markers in `reviewing`+ status are a blocking finding.

#### `fo-idea-enhance`

Step 3 (classify findings) gains a new finding category:

> **NC (Needs Clarification):** Unresolved `NEEDS CLARIFICATION` markers in the RFC body. Resolution: ask the operator the question, replace the marker line with the operator's answer in the RFC body. If the operator defers, the marker remains and the RFC cannot transition to `reviewing`.

### File system responsibilities

| Path                     | Role                                                          |
| ------------------------ | ------------------------------------------------------------- |
| `docs/rfcs/rfc-*.md`     | Scanned for `NEEDS CLARIFICATION` markers by `rfc.validate`   |
| `docs/audits/audit-*.md` | Audit report includes marker inventory (no structural change) |

No new files or directories are created.

### TypeScript contracts

```typescript
interface Marker {
  line: number;
  text: string;
  severity: "warn" | "error";
}
```

The `markers` field is added to the existing `RfcValidationResult` type as `markers?: Marker[]`.

### Output format

`rfc.validate` `--json` output gains a `markers` field:

```json
{
  "command": "rfc.validate",
  "status": "warn",
  "violations": [],
  "markers": [
    {
      "line": 47,
      "text": "Should this command accept --json output, or is pretty-print sufficient?",
      "severity": "warn"
    }
  ]
}
```

`severity` is `"warn"` for `draft` status RFCs and `"error"` for `reviewing`+ status RFCs.

### Failure modes

- **False positives:** The string `NEEDS CLARIFICATION` might appear in quoted text or examples. The validator matches only lines that start with `> NEEDS CLARIFICATION:` (blockquote prefix + exact prefix + colon). Content inside code blocks is excluded.
- **Marker in code block:** A marker inside a fenced code block (`...`) is not counted — it is illustrative, not a real marker.
- **Resolved marker left as comment:** If an agent resolves a marker by writing the answer but leaves the marker line as a comment, the validator still counts it. The marker line must be removed or replaced.

## Rollout

- **Default behavior:** V-NC-01 is active immediately for all RFCs with `createdAt >= 2026-08-06`. Existing RFCs in `reviewing`+ status are exempt (no retroactive check).
- **Existing draft RFCs:** Existing drafts without markers are unaffected. Existing drafts with markers (informal ones) will produce warnings but not errors until they transition to `reviewing`.
- **New RFCs:** `fo-idea-create-rfc` instructs agents to use markers from creation.
- **Pipeline integration:** V-NC-01 runs as part of the existing `rfc.validate` command — no new pipeline step.

## Alternatives considered

- **Inline TODO comments:** Rejected — `TODO` is already used informally and has no validation. `NEEDS CLARIFICATION` is a distinct, validated marker.
- **Audit-only questions (status quo):** Rejected — audit questions are in a separate file and invisible to agents reading the RFC body. Inline markers are discoverable without cross-referencing.
- **Frontmatter field:** Rejected — a frontmatter list of questions loses positional context. Inline markers are co-located with the uncertain content.

## Risks

- **Marker proliferation:** Agents might overuse markers instead of making reasonable inferences. Mitigation: `fo-idea-create-rfc` grilling step challenges excessive markers — if the answer is obvious from context, the agent should fill the section, not mark it.
- **Stale markers in long-lived drafts:** Drafts that sit for weeks might accumulate markers that are no longer relevant. Mitigation: `fo-idea-audit` reports all markers, prompting resolution.
- **Validation bypass:** Agents might remove markers without resolving them to pass validation. Mitigation: `fo-idea-enhance` requires operator confirmation for marker resolution — agents must not silently delete markers.

## Acceptance criteria

- [x] V-NC-01 validation rule implemented in `rfc.validate` (warn for draft, error for reviewing+) (evidence: packages/forge/os/rfc/handlers/validate-rules.ts:878-888)
- [x] `rfc.validate --json` output includes `markers` field with line numbers and severity (evidence: packages/forge/os/rfc/handlers/validate.ts:154, packages/forge/os/rfc/types.ts:307-318)
- [x] `fo-idea-create-rfc` skill instructions include guidance to use markers instead of guessing (evidence: packages/forge/skills/fo/fo-idea-create-rfc/SKILL.md:93)
- [x] `fo-idea-audit` skill instructions include marker inventory in axis E report (evidence: packages/forge/skills/fo/fo-idea-audit/SKILL.md:128)
- [x] `fo-idea-enhance` skill instructions include NC finding category with resolution flow (evidence: packages/forge/skills/fo/fo-idea-enhance/SKILL.md:89)
- [x] Code blocks are excluded from marker detection (evidence: packages/forge/os/rfc/handlers/validate-rules.ts:172-176)
- [x] Existing RFCs in `reviewing`+ status are exempt from retroactive checks (evidence: packages/forge/os/rfc/handlers/validate-rules.ts:155,163)
- [x] `rfc.validate` passes on this file before merging (evidence: rfc.validate --id RFC-0709 --json returned 0 violations)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- The marker syntax `> NEEDS CLARIFICATION: <question>` is the only valid form. Variants like `> needs clarification:` or `> NEEDS_CLARIFICATION:` are not recognized.
- Agents MUST NOT remove a marker without resolving the question with the operator. Silent marker deletion to pass validation is a violation.
