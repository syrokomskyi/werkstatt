---
name: fo-knowledge-distill
description: Distill raw knowledge logs (L0) into durable fix patterns (L1) and learned principles (L2), maintain confirmation counters, and migrate legacy sections — with operator approval on every mutation.
invocation: user
category: fo
concerns: document-only
dependsOn: ['my-preferences', 'grilling']
languagePolicy: ref(PREFERENCES.md)
bindings:
  requires: []
  optional: []
triggers: ["distill knowledge", "compact skill knowledge", "knowledge lifecycle", "promote fix patterns", "promote memory db insights", "memory db promotion"]
---

# Knowledge Distillation

Before starting, read `PREFERENCES.md` at the repository root. If the file is missing or `aiLanguage` is unset, ask the operator once and create the file using the `my-preferences` skill semantics.

This skill assists the operator in the knowledge distillation lifecycle: reading raw material (L0), proposing durable patterns (L1) and principles (L2), re-confirming existing entries, migrating legacy sections, and recommending compaction. Every mutation requires explicit operator approval.

## When to invoke

- **After a productive session** — when the session generated raw Q&A pairs or debugging insights that could benefit future agents.
- **When `skill.knowledge.compact --all-skills --dry-run` reports legacy sections** — this skill performs the actual migration with operator approval.
- **When a SKILL-21 budget warning appears** — distill to reduce active knowledge volume.
- **When the operator asks to "distill", "compact", or "maintain" skill knowledge.**
- **When Memory DB entries accumulate** — the operator invokes `--source=memory-db` to review auto-retrieved memories and promote durable ones into Forge artifacts (skills, AGENTS.md, DNA). See § Memory DB promotion mode below.

## What this skill is NOT

- It is NOT `skill.knowledge.compact` — that command handles mechanical archival (expiry, supersession, L0 retention, L2 staleness). This skill handles semantic work: grouping, promoting, and migrating.
- It is NOT `fo-session-retro` — that skill triages session discoveries and routes them. This skill works within a single skill's knowledge files.
- It is NOT `fo-extract-dna` — that skill extracts architectural invariants. This skill distills operational knowledge (fix patterns, learned principles).

## Process

### Step 1: Scope selection

Ask the operator which skill(s) to distill:

- Use `ask_user_question` to offer: (a) a specific skill by name, or (b) all skills with knowledge files.
- Parse the selected skill's knowledge files via the structured knowledge parser (in-process import of the forge `src/knowledge/` module or the `forge` package).
- Report what was found: file names, entry counts, legacy section counts, parse issues.

**Completion criteria:** operator has selected a scope and the skill has parsed all relevant knowledge files without errors.

### Step 2: Read cold material

Read L0 (`qa-log.md`) and, if present, `qa-log.archive.md`. This is the sanctioned wholesale read of the cold layer (hot/warm/cold discipline).

- Also read L1 (`fix-patterns.md`) and L2 (`learned-principles.md`) to understand existing distilled knowledge.
- Report a summary: how many raw entries, how many existing patterns/principles, what themes recur.

**Completion criteria:** all knowledge files for the selected skill have been read and summarized.

### Step 3: Propose distillations

Group recurring Q&A themes from L0. For each theme, propose either:

- An **L2 principle** (with `confirmations` seeded from observed recurrences) — for cross-cutting insights that apply broadly.
- An **L1 fix pattern** — for specific, reusable solutions to specific problems.

Present proposals as a table:

| #   | Proposed entry | Layer | Source entries | Rationale |
| --- | -------------- | ----- | -------------- | --------- |

For each proposal, use `ask_user_question` to let the operator:

- **Confirm** — the entry is written as proposed.
- **Edit** — the operator provides corrections; the entry is written with edits.
- **Drop** — the proposal is discarded.

**Completion criteria:** every proposal has been confirmed, edited, or dropped by the operator.

### Step 4: Re-confirmation pass

For existing L2 entries whose themes appear in the new material:

- Propose `confirmations + 1` and `lastConfirmedAt: today`.
- If the entry is `status: stale`, propose restoring to `status: active`.
- Present each re-confirmation individually via `ask_user_question`.

**Completion criteria:** every re-confirmation has been approved or declined by the operator.

### Step 5: Legacy migration

For each legacy section (freeform prose that predates structured entries):

- Propose a structured entry: assign an ID, set metadata (layer, created, status), preserve the body verbatim.
- Use `ask_user_question` for each legacy section — the operator approves the proposed structured entry.

**Completion criteria:** every legacy section has been migrated or explicitly skipped by the operator.

### Step 6: Write

Apply approved mutations via the knowledge serializer (`serializeKnowledgeFile`). Never string-splice markdown. Never touch entries that were not explicitly approved.

- Write files atomically (staging + rename) to prevent corruption on mid-run failure.
- Commit only the mutated knowledge files (fo-pipeline commit discipline).

**Completion criteria:** all approved mutations are written and committed.

### Step 7: Recommend compact

If retention/expiry candidates remain after distillation:

- Recommend `skill.knowledge.compact --skill <name>` to the operator.
- Offer to run it via `ask_user_question`.
- If the operator declines, note it in the session summary.

**Completion criteria:** the operator has been informed of compaction opportunities and has made a decision.

### Step 8: Commit

Commit only the mutated knowledge files. Reference this skill and the knowledge lifecycle in the commit message. Do not stage unrelated changes.

**Completion criteria:** changes are committed with a descriptive message.

## Knowledge file format

All knowledge files use the structured knowledge entry format:

````markdown
<!-- knowledge-layer: L2 -->
# learned-principles.md

### K-0001: Short title

```knowledge-entry
id: K-0001
layer: L2
created: 2026-08-03
lastConfirmedAt: 2026-08-03
confirmations: 1
status: active
````

Body text describing the principle.

```

See `writing-great-skills` § Cumulative knowledge pattern for the three-layer reference pattern (L0 raw logs, L1 fix patterns, L2 learned principles), entry format, and mutation contract.

## Constraints

- **Operator approval on every mutation.** Never write to a knowledge file without explicit approval for each entry.
- **Serializer only.** Always use `serializeKnowledgeFile` from the forge knowledge module. Never string-splice markdown.
- **No semantic logic in command handlers.** The `skill.knowledge.compact` command handles mechanical archival only. Semantic grouping and promotion live in this skill.
- **No LLM logic in `src/knowledge/`.** Deterministic planning only; meaning work lives here.
- **Read archives too.** When distilling, read both live and archive files — archived material may still contain themes worth re-distilling.

## Cross-skill promotion

When `doctor` reports `knowledge-duplicate` warnings (cross-skill L2 entries with matching normalized titles), or when the operator identifies a promotion candidate, execute the promotion protocol:

### Promotion protocol

1. **Present the pair** — show both titles, bodies, confirmations, and the proposed merged shared entry (merged body, summed confirmations, `promotedFrom` provenance). The operator approves, edits, or rejects via grilling.
2. **Write the shared entry** — append to `packages/forge/skills/shared/knowledge/learned-principles.md` with the next `K-NNNN` id, `status: active`, `created: today`, `lastConfirmedAt: today`, `confirmations` (sum of sources), and `promotedFrom: ["<skill>/K-NNNN", ...]`.
3. **Rewrite local copies** — each skill-local entry keeps its heading and id but its metadata is rewritten: `promotedTo: shared/K-NNNN`, `status: superseded`; body replaced with one line: "Promoted to shared layer as shared/K-NNNN." The next compact run archives these pointer entries out of the hot file.
4. **Cite, don't copy** — future distill runs in any skill reference the shared id (`shared/K-NNNN`) instead of re-creating the principle locally.
5. **Commit** — shared file + all touched skill files in one commit.

### Promotion constraints

- **Promotion requires operator approval inside grilling** — detection is deterministic, promotion is human. Never promote without explicit operator approval for each pair.
- **Never copy shared-layer content into skill-local files** — cite via `shared/K-NNNN`, do not duplicate.
- **Never promote project-specific knowledge from pack skills into the forge shared layer** — domain-neutrality is checked during grilling. If the principle is project-specific, it stays pack-local.
- **Portability gate** — grilling must include the question: "Is this principle genuinely cross-skill, or is it specific to one skill's domain?" Only genuinely cross-skill principles promote.
```

## Memory DB promotion mode

When invoked with `--source=memory-db` (or when the operator asks to "promote memory insights"), this skill reviews Memory DB entries that have accumulated through `fo-session-retro` Context routing and proposes promotion to durable Forge artifacts.

### When to invoke this mode

- **After `fo-session-retro`** — when the retro created many Context memories and the operator wants to review them for promotion.
- **When the operator notices a recurring memory** — the same insight keeps appearing across sessions but is not yet in a skill, AGENTS.md, or DNA.
- **Periodically** — when the operator feels Memory DB has grown large and suspects some entries deserve permanent homes.

### Memory DB constraints

The agent cannot enumerate Memory DB directly — there is no "list all memories" tool. Instead, this mode works with:

1. **Auto-retrieved memories** — memories injected into the current session context by the retrieval system.
2. **Operator-provided memories** — the operator pastes memory content or IDs they want reviewed.
3. **Session-created memories** — memories created during the current session via `create_memory`.

If no memories are visible in the context and the operator has not provided any, ask the operator to either:

- Run this skill in a session where the memories will be auto-retrieved, or
- Paste the memory content they want reviewed.

### Process

#### M1: Gather memory candidates

Collect all Memory DB entries visible in the current session context (auto-retrieved `SYSTEM-RETRIEVED-MEMORY` blocks) or explicitly provided by the operator. For each entry, record:

- Memory ID (UUID from the `SYSTEM-RETRIEVED-MEMORY[<id>]` header)
- Title
- Content summary (1-2 sentences)
- Tags

#### M2: Check existing Forge coverage

For each memory, search for its knowledge in existing Forge artifacts:

1. **Skill files** — `grep_search` for key phrases from the memory content across `.agents/skills/**/SKILL.md` and `packages/forge/skills/**/SKILL.md`.
2. **AGENTS.md files** — `grep_search` across `**/AGENTS.md` for the rule or convention.
3. **DNA invariants** — `grep_search` in `ref(forge.yaml bindings.paths.invariantsFile)`.
4. **ADRs** — `grep_search` in `docs/adrs/`.

Classify each memory as:

- **Already covered** — the knowledge exists in a Forge artifact (cite the file and line).
- **Partially covered** — some aspect is documented, but the memory adds new detail.
- **Uncovered** — no trace in Forge artifacts; candidate for promotion.

#### M3: Propose promotions

For each uncovered or partially-covered memory, propose a promotion target:

| Memory | Proposed target | Action | Rationale |
| --- | --- | --- | --- |
| `<id>` | `.agents/skills/<skill>/SKILL.md` | Add step/constraint | Pipeline convention not in skill |
| `<id>` | `packages/AGENTS.md` | Add rule | Cross-package convention |
| `<id>` | `docs/architecture-dna.md` | Delegate to `fo-extract-dna` | Cross-workspace invariant |
| `<id>` | `.agents/skills/fo-<skill>/SKILL.md` | Add to process step | Operational pattern |

Promotion targets in priority order:

1. **Skill instruction** — if the memory is a pipeline convention, operational pattern, or how-to for a specific skill.
2. **AGENTS.md rule** — if the memory is a convention agents must follow across a workspace.
3. **DNA invariant** — if the memory is a cross-workspace architectural rule (delegate to `fo-extract-dna`).
4. **ADR** — if the memory is an architectural decision with rationale (delegate to `fo-idea-create-adr`).
5. **Forge shared knowledge** — if the memory is a cross-skill principle (use cross-skill promotion protocol above).

#### M4: Operator approval

Present the promotion table via `ask_user_question` (in `aiLanguage`). For each proposed promotion, the operator can:

- **Confirm** — proceed with the promotion as proposed.
- **Edit** — adjust the target or content before promotion.
- **Drop** — keep the memory in Memory DB; do not promote.

#### M5: Apply promotions

For each confirmed promotion:

1. **Write to the target Forge artifact** — use `edit` or `multi_edit` to add the knowledge in the appropriate section. Follow the existing structure and tone of the target file.
2. **Mark the memory as promoted** — use `create_memory` with `Action: "update"`, the memory's `Id`, and add `promotedTo: <target-file>` to the content. Set `Title` to the original title prefixed with `[promoted]`.
3. **Do not delete memories** — promoted memories remain in Memory DB as provenance. The `[promoted]` prefix and `promotedTo` field signal that the knowledge now lives in a durable artifact.

#### M6: Commit

Commit all Forge artifact edits (skill files, AGENTS.md files) in a single commit:

```txt
docs: promote N memory DB insights to Forge artifacts

Memory DB promotion: <list of memories promoted and their targets>.
```

Do not stage unrelated changes. DNA and ADR promotions are committed by their respective delegated skills.

### Promotion constraints

- **Operator approval on every promotion.** Never write to a Forge artifact without explicit approval.
- **Read before edit.** Always read the target file before editing to preserve structure and avoid duplicates.
- **Do not duplicate.** If the knowledge is already in the target file (even in different words), do not add it again. Cite the existing location instead.
- **Minimal edits.** Add the knowledge in the most concise actionable form. Do not rewrite existing sections.
- **Provenance preserved.** Promoted memories stay in Memory DB with `[promoted]` prefix — they are not deleted.
- **Project-specific knowledge stays local.** Do not promote project-specific memories to the forge shared layer. Domain-neutrality is checked during operator approval.
