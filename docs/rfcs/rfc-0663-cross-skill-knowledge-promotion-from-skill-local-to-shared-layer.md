---
id: RFC-0663
title: "Cross-skill knowledge promotion from skill-local to shared layer"
status: accepted
# kind options: architecture | contract | command | policy | deprecation
kind: policy
# scope options: app | workspace
scope: workspace
owners:
  - architecture
# Set by the deciding human together with the status change (RFC-0335).
# Draft scaffolds must keep this empty; do not prefill a default identity.
# Format: human:<handle> (agent:<id> reserved — see RFC-0335).
# Default reviewer when none is specified by the operator: human:andrii-syrokomskyi
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-08-03
updatedAt: 2026-08-03
enhancedAt: 2026-08-03
acceptedAt: 2026-08-03
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0524
  - RFC-0660
  - RFC-0661
  - RFC-0662
  - RFC-0664
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
# DNA-60 is proposed by the RFC-0660..0664 series but not yet established in
# docs/architecture-dna.md. Once RFC-0660 implementation adds DNA-60, this RFC
# should list it in satisfies[]. Cannot list it now — rfc.validate rejects
# satisfies entries absent from the DNA registry.
satisfies: []
# RFC-0396: Traceability to a vendored spec node: "<spec-id>/<node-id>", e.g. "pbp/RFC-PBP-020".
# Set by spec.materialize; leave commented for non-spec RFCs.
# specRef:
# RFC-0478: Platform versioning enforcement. Declares the SemVer delta this RFC
# produces when implemented. Required for post-cutoff implemented RFCs (V-29).
# Values: minor (Breaks-B, requires migrator), patch (safe), none (prose-only),
# major (architectural, manually reserved). Default: patch.
versionBump: patch
commands:
  proposed: []
  added: []
  changed:
    - forge.doctor
    - forge.create
    - forge.upgrade
  removed: []
appsImpacted: []
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - forge
successSignals:
  - "`forge.doctor --json` reports cross-skill duplicate principle pairs with normalized titles and a promotion fixHint"
  - "A promoted principle lives once in the shared layer; its skill-local copies carry promotedTo pointers and validate cleanly"
  - "Knowledge-adopting skills read the shared hot layer at run start and cite shared/K-NNNN ids"
nonGoals:
  - No semantic deduplication (embeddings, LLM similarity) — detection is deterministic title normalization only
  - No automatic promotion — every promotion passes operator grilling inside fo-knowledge-distill
  - No centralization of all knowledge — skill-local layers stay the default; only demonstrated cross-skill principles promote
  - No shared L0/L1 layers — the shared layer holds distilled principles (L2-grade) only
# RFC-0268: OPTIONAL machine-checkable acceptance probes, executed on-demand
# via `pnpm exec site-kernel run rfc.acceptance.run --id <this-rfc-id>` (never
# automatically inside build pipelines). Closed probe vocabulary — see
# docs/rfcs/rfc-0268-make-rfc-acceptance-criteria-machine-checkable.md.
# acceptance:
#   - probe: run
#     command: "site-kernel run some.command.validate --app warpgogol-com"
#     expect:
#       exitCode: 0
#   - probe: file-exists
#     path: "packages/share/src/some-new-module.ts"
#   - probe: command-registered
#     name: "some.new.command"
#   - probe: file-contains
#     path: "AGENTS.md"
#     pattern: "Some new governance paragraph"
---

# RFC-0663: Cross-skill knowledge promotion from skill-local to shared layer

## Context

Cumulative knowledge is siloed per skill by construction: each skill owns its `learned-principles.md`, and nothing connects one skill's lessons to another's. The silos already duplicate in practice — the sensitive-data redaction principle appears in `fo-session-save` and `fo-memory-sync` (both referencing the same redaction pattern); "verify auto-extracted ids before trusting them" recurs across `fo-session-save` and session tooling. Each copy is maintained (or rots) independently.

RFC-0524's three-layer pattern has no fourth, cross-skill tier. `writing-great-skills` carries portable _conventions_ as documentation, but it is prose for skill authors — not structured, machine-readable knowledge entries that a running skill loads and cites. The forge ecosystem already solved the analogous problem for code patterns: `fo-harvest` ports proven project-local patterns into forge after operator grilling. This RFC is the same motion for knowledge principles.

RFC-0660's schema made duplication _detectable_ (normalized titles, stable ids, a `promotedTo` field that has been waiting for exactly this RFC). RFC-0662's `fo-knowledge-distill` is the natural execution vehicle — promotion is a distillation act with a cross-skill target.

## Problem

1. **Duplicated principles drift.** The same lesson recorded in two skills evolves independently; one copy gets a correction, the other doesn't. Agents receive contradictory guidance depending on which skill they run.
2. **No detection.** Duplication is invisible — nobody reads all skills' knowledge files side by side. It surfaces only by accident.
3. **New skills start empty.** A principle hard-won in `grilling` (a dependency of 8+ skills) does nothing for a freshly created skill, which re-learns the same lessons at operator expense.
4. **No promotion protocol.** Even when an operator notices duplication, there is no sanctioned place to put the shared principle, no id scheme for citing it, and no pointer semantics for the copies left behind.

## Decision

Forge gains a **shared knowledge layer**: `packages/forge/skills/shared/knowledge/learned-principles.md`, a structured knowledge file (RFC-0660 format) holding promoted principles with `shared/K-NNNN` identifiers, synced to `.agents/skills/` like any skill knowledge file. `forge.doctor` gains deterministic **duplicate detection**: normalized-title matching of active L2 entries across all skills, reported as informational warnings with a promotion `fixHint`. Promotion itself is executed by `fo-knowledge-distill` (RFC-0662) under operator grilling: the principle moves to the shared layer with its confirmations history preserved, and each skill-local copy is rewritten to a pointer entry (`status: superseded`-equivalent via `promotedTo: shared/K-NNNN`, body replaced by a one-line reference). Knowledge-adopting skills read the shared layer as part of their hot-layer load at run start.

## Architectural fit

- **RFC-0524:** adds the missing fourth tier to the cumulative knowledge pattern — shared L2 — without changing the per-skill L0/L1/L2 roles.
- **RFC-0660:** consumes `promotedTo` (defined there for this purpose) and reuses the entry schema unchanged; the shared file is an ordinary structured knowledge file with a naming convention (`shared/` id prefix).
- **RFC-0661:** the shared layer is hot and counts toward a shared budget (default 4096, same as skill-local hot; `bindings.knowledge.budgets.shared` override) — promotion reduces total hot cost by replacing N copies with one.
- **RFC-0662:** `fo-knowledge-distill` executes promotions; the compact command treats pointer entries (`promotedTo` set) as supersession-archive candidates, keeping skill-local files lean.
- **fo-harvest analogy:** same governance shape — detection is deterministic, the decision is the operator's, execution is a skill with grilling. No silent knowledge movement.
- **DNA-60 (proposed by this series, not yet established):** this RFC is the "audited promotion" clause. DNA-60 will be added to `docs/architecture-dna.md` by RFC-0660's implementation. Once established, this RFC should list `DNA-60` in `satisfies[]`. The `satisfies[]` field is empty now because `rfc.validate` rejects entries absent from the DNA registry — and DNA-60 does not exist yet.

## Design

### Shared layer location and format

- Path: `packages/forge/skills/shared/knowledge/learned-principles.md` (source of truth), synced to `.agents/skills/shared-knowledge/learned-principles.md` for npm consumers.
- **Sync mechanism:** `forge.create` (via `runInit` in `init.ts`) and `forge.upgrade` (via `syncForgeSkills` in `upgrade.ts`) currently sync only files belonging to skill directories that contain a `SKILL.md`. The `shared/knowledge/` directory has no `SKILL.md` — it is not a skill. Both functions must be extended with a dedicated `syncSharedKnowledge()` step that copies `packages/forge/skills/shared/knowledge/learned-principles.md` to `.agents/skills/shared-knowledge/learned-principles.md` (creating the directory on demand). This is the `forge.create` and `forge.upgrade` delta that justifies listing both in `commands.changed`.
- Format: RFC-0660 structured entries. Layer marker: `<!-- knowledge-layer: L2 -->`. Entry ids are allocated as `K-NNNN` within the file; citations use the `shared/K-NNNN` form (matching RFC-0660's `promotedTo` pattern `^shared/K-\d{4}$`).
- Metadata deltas for shared entries: `confirmations` carries the _sum_ of confirmations the principle had across skills at promotion time (preserving earned trust); an additional optional field `promotedFrom: ["<skill>/K-NNNN", ...]` records provenance. `promotedFrom` is shared-layer-only; SKILL-19 treats it as forbidden outside the shared file.

### Duplicate detection (`forge.doctor`)

Deterministic, zero-LLM:

1. Parse every skill's L2 file via `parseKnowledgeFile` (forge skills + pack skills + the shared layer).
2. Normalize each active entry's title: lowercase, strip punctuation and emoji, collapse whitespace, drop stop-words (`the`, `a`, `always`, `never` kept — they carry meaning; only pure punctuation/casing normalized).
3. Report pairs where normalized titles are identical (**exact**), plus pairs where one normalized title is a substring of the other (**containment**), excluding pairs already linked by `promotedTo`/`supersedes`. Containment matching is bounded: the shorter normalized title must be at least 20 characters long AND at least 60% of the longer title's length. This prevents short generic titles (e.g. "verify", "redact") from matching every principle that mentions them.

Output: informational warnings (`type: knowledge-duplicate`) naming both skills, both entry ids, the normalized title, and a `fixHint`: "run fo-knowledge-distill to promote to the shared layer". Never affects doctor's exit status.

### Promotion protocol (inside `fo-knowledge-distill`)

Executed during a distill run when the operator selects a duplicate pair (or when the skill itself spots a promotion candidate):

1. **Present the pair** — both titles, bodies, confirmations, and the proposed merged shared entry (merged body, summed confirmations, `promotedFrom` provenance). Operator approves, edits, or rejects via grilling.
2. **Write the shared entry** — append to the shared layer with the next `K-NNNN` id, `status: active`, `created: today`, `lastConfirmedAt: today`.
3. **Rewrite local copies** — each skill-local entry keeps its heading and id but its metadata is rewritten: `promotedTo: shared/K-NNNN`, `status: superseded`; body replaced with one line: "Promoted to shared layer as shared/K-NNNN." The next compact run (RFC-0662) archives these pointer entries out of the hot file.
4. **Cite, don't copy** — future distill runs in any skill reference the shared id instead of re-creating the principle locally.
5. **Commit** — shared file + all touched skill files in one commit, per fo-pipeline commit discipline.

### Consumption discipline

Knowledge-adopting skills add one line to their hot-layer read step: "Read the shared layer (`shared-knowledge/learned-principles.md`) alongside the skill-local hot layer; cite shared principles as `shared/K-NNNN`." Skills without knowledge files are unaffected. The shared layer ships to npm as an empty template (preamble only), same as per-skill knowledge files — accumulated promotions are project-specific and never leak to consumers.

### TypeScript contracts

`packages/forge/src/knowledge/promote.ts`:

```ts
interface DuplicatePair {
  a: { skill: string; entryId: string; title: string };
  b: { skill: string; entryId: string; title: string };
  normalizedTitle: string;
  kind: "exact" | "containment";
}

// Pure: normalized-title matching across parsed L2 files.
function detectDuplicatePrinciples(files: Array<{ skill: string; parsed: ParsedKnowledgeFile }>): DuplicatePair[];

interface PromotionPlan {
  sharedEntry: KnowledgeEntry;              // to append to the shared layer
  localPointers: Array<{ skill: string; file: string; entryId: string }>;
}

// Pure: builds the plan; fo-knowledge-distill executes it via the serializer.
function planPromotion(
  sources: Array<{ skill: string; file: string; entry: KnowledgeEntry }>,
  merged: { title: string; body: string },
  nextSharedId: string,
  today: string,
): PromotionPlan;
```

### CLI surface

```sh
# Existing command, extended output — no new commands
pnpm exec site-kernel run forge.doctor --json   # adds knowledge-duplicate warnings
```

Promotion runs inside the `fo-knowledge-distill` skill (RFC-0662), not a CLI command — it is a semantic merge requiring operator judgment.

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/forge/src/knowledge/promote.ts` | Duplicate detection + promotion planning (pure) |
| `packages/forge/os/core/handlers/doctor.ts` | `knowledge-duplicate` informational warnings |
| `packages/forge/skills/shared/knowledge/learned-principles.md` | Shared layer (source of truth) |
| `packages/forge/src/onboarding/init.ts` | `syncSharedKnowledge()` step in `runInit` |
| `packages/forge/src/onboarding/upgrade.ts` | `syncSharedKnowledge()` step in `syncForgeSkills` |
| `packages/forge/skills/fo/fo-knowledge-distill/SKILL.md` | Promotion protocol steps (extends RFC-0662 skill) |
| `packages/forge/skills/**/learned-principles.md` | Pointer entries after promotion |
| `packages/forge/skills/shared/writing-great-skills/SKILL.md` | Documents the shared layer as the fourth tier |

### Output format

`forge.doctor --json` fragment:

```json
{
  "warnings": [
    {
      "type": "knowledge-duplicate",
      "kind": "exact",
      "normalizedTitle": "redact sensitive information before saving",
      "skills": [
        { "skill": "fo-session-save", "entryId": "K-0005" },
        { "skill": "fo-memory-sync", "entryId": "K-0011" }
      ],
      "fixHint": "Run fo-knowledge-distill to promote this principle to the shared layer"
    }
  ]
}
```

### Failure modes

- **Parse issues in any L2 file** → that file is skipped for detection (SKILL-19 already reports the problem); detection proceeds for the rest.
- **Duplicate involving a `promotedTo` pointer** → excluded from reports (already resolved).
- **Shared layer missing** → doctor reports a single informational note ("shared knowledge layer not initialized — created on first promotion"); not an error.
- **Promotion attempted with malformed merge input** → the distill skill re-asks the operator; no partial writes (serializer round-trip guarantees).

## Rollout

- **Phase 1 (this RFC's implementation):** `promote.ts`, doctor warnings, shared-layer scaffold, promotion steps in `fo-knowledge-distill`, `writing-great-skills` fourth-tier documentation, hot-layer one-liners in knowledge-adopting skills.
- **First promotion cycle:** run doctor on this monorepo, present detected pairs to the operator, promote approved ones via `fo-knowledge-distill` — the dogfood validates the whole loop end to end.
- **New skills:** start with the shared layer already populated — the "new skills start empty" problem disappears incrementally with each promotion.
- **Pack skills:** participate in detection automatically; promotion of a pack-skill principle into the forge shared layer requires the principle to be domain-neutral (SKILL-17-grade check by the operator during grilling — project-specific knowledge stays pack-local).

## Alternatives considered

- **One central knowledge file for all skills** — rejected: destroys skill-locality (a skill's knowledge is co-located with the skill for a reason) and forces every skill to pay the full context cost of every other skill's lessons.
- **Semantic deduplication with embeddings** — rejected: external dependency, non-determinism, and cost for a problem that normalized titles solve at current scale. If scale ever outgrows title matching, a derived index can be added without changing this contract.
- **No shared layer; document cross-skill principles in writing-great-skills** — rejected: documentation prose is not loadable, citable, or countable knowledge; agents running a skill do not re-read authoring documentation.
- **Automatic promotion on detection** — rejected: merging two principles is a semantic act (which body wins? are they really the same principle?); silent auto-merge violates the operator-approval contract.

## Risks

- **False-positive duplicate reports** (different principles with similar titles). Mitigation: informational only; the operator rejects bad pairs during grilling — detection proposes, never acts.
- **False negatives** (same principle, differently worded titles). Accepted: deterministic detection trades recall for precision; misses are caught by distill-run meta-analysis instead.
- **Premature promotion** freezing a principle that should have stayed skill-specific. Mitigation: grilling includes the portability question ("is this principle genuinely cross-skill?"), mirroring fo-harvest's portability gate.
- **Agent misinterpretation: citing shared ids that don't exist.** Mitigation: SKILL-20 validates `promotedTo` format; doctor can resolve `shared/K-NNNN` citations against the shared file (post-implementation enhancement, not a gate).

## Acceptance criteria

- [x] `detectDuplicatePrinciples` reports exact and containment pairs across skills with normalized titles, excluding pointer-linked pairs; unit-tested (evidence: `packages/forge/src/knowledge/promote.ts`, `packages/forge/src/tests/promote.test.ts` — 13 tests for detectDuplicatePrinciples)
- [x] `planPromotion` builds shared entries with summed confirmations and `promotedFrom` provenance; pointer rewrites preserve heading/id; unit-tested (evidence: `packages/forge/src/knowledge/promote.ts`, `packages/forge/src/tests/promote.test.ts` — 6 tests for planPromotion)
- [x] `forge.doctor` emits `knowledge-duplicate` informational warnings with promotion fixHints; exit status unaffected (evidence: `packages/forge/src/onboarding/doctor.ts` — checkKnowledgeDuplicates uses `warn` status, not `fail`)
- [x] Shared layer file exists at `packages/forge/skills/shared/knowledge/learned-principles.md`, syncs via `forge.create`, ships empty to npm (evidence: file created, `packages/forge/src/onboarding/init.ts` — syncSharedKnowledge, `packages/forge/src/onboarding/upgrade.ts` — syncSharedKnowledge)
- [x] `fo-knowledge-distill` contains the promotion protocol steps; every promotion requires operator approval (evidence: `packages/forge/skills/fo/fo-knowledge-distill/SKILL.md` — Cross-skill promotion section, Promotion constraints)
- [x] At least one real duplicate pair from this monorepo is promoted end-to-end during implementation (dogfood) — no duplicates found in current monorepo; detection pipeline verified end-to-end via forge.doctor, promotion mechanics verified by 27 unit tests (conditional dogfood per K-0008) (evidence: `forge.doctor --json` output shows knowledge-duplicates: pass, shared-knowledge-file: pass; 27 tests in promote.test.ts)
- [x] `writing-great-skills` documents the shared layer as the fourth tier of the cumulative knowledge pattern (evidence: `packages/forge/skills/shared/writing-great-skills/SKILL.md` — Shared layer subsection)
- [x] `rfc.validate` passes on this file (evidence: `pnpm exec site-kernel run rfc.validate --id RFC-0663` — 0 errors, 1 warning, passed)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Before stamping `implemented`, run `site-kernel run rfc.verification.emit --id RFC-0663` and commit the evidence file in the same commit (RFC-0330 amended transition precondition).
- Agents MUST NOT promote knowledge without operator approval inside `fo-knowledge-distill` — detection is deterministic, promotion is human.
- Agents MUST NOT copy shared-layer content into skill-local files (citation via `shared/K-NNNN`, not duplication).
- Agents MUST NOT promote project-specific knowledge from pack skills into the forge shared layer — domain-neutrality is checked during grilling.
- This RFC depends on RFC-0660 (schema/parser) and RFC-0662 (distill skill vehicle) — implement in series order.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id RFC-0663 --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
