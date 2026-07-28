---
id: RFC-0279
title: "Add an auditable AI reviewer as a governed approval gate"
status: implemented
kind: contract
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-07-03
updatedAt: 2026-07-05
implementedAt: 2026-07-05
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0194
  - RFC-0197
  - RFC-0215
  - RFC-0272
  - RFC-0273
  - RFC-0274
  - RFC-0276
  - RFC-0278
  - RFC-0282
commands:
  proposed:
    []
  added:
    - surface.review.run
    - surface.review.calibrate
    - surface.review.validate
  changed:
    - surface.artifact.ready
    - surface.translation.validate
  removed: []
appsImpacted:
  - warpgogol-com
packagesImpacted:
  - "@gogol/surface"
  - "@gogol/site-kernel-checks"
  - "@gogol/share"
successSignals:
  - "An AI reviewer can render a structured, auditable verdict on a generated artifact and, at sanctioned autonomy levels, hold approval authority."
  - "The reviewing model and prompt are always different from the generating model and prompt, and both are pinned in provenance."
  - "Every AI verdict carries a confidence and evidence trail; low-confidence verdicts abstain and escalate instead of guessing."
  - "The reviewer is continuously calibrated against a human-labelled golden set, and its agreement rate drives RFC-0278 promotion and demotion."
nonGoals:
  - "Do not make the AI reviewer a build-time or request-time dependency; review is a generation-lane pass, never SSG."
  - "Do not replace deterministic gates (RFC-0194 substance, RFC-0274 evidence/duplicate); the AI reviewer runs after they pass, not instead of them."
  - "Do not let the same model both write and approve an artifact."
  - "Do not grant the reviewer authority above the scope's RFC-0278 autonomy level."
---

# RFC-0279: Add an auditable AI reviewer as a governed approval gate

## Context

RFC-0278 defines autonomy levels and typed approval authority, and states that at L2 and above an `agent:` approver may sign off on artifacts. It deliberately does not define that agent. RFC-0274 and Fable's audit both warn — correctly — against using an LLM as an _unaudited_ indexability judge: non-deterministic, ungrounded, unaccountable.

That warning bans the naive version, not the concept. The path to AI-exclusive operation requires _some_ reviewer that is not a human. The engineering question is therefore not "human or LLM" but "how do we make an AI reviewer auditable, grounded, and demotable enough to be trusted with approval authority — and only as much authority as it has earned".

This RFC specifies that reviewer: a deterministic _harness_ wrapped around a non-deterministic judge, producing structured verdicts that are logged, calibrated, and governed.

## Problem

There is currently no artifact that can review a generated artifact except a human. As a result:

- RFC-0278's L2–L4 are unreachable — there is nothing to be the `agent:` approver;
- the only automated quality signals are deterministic structural gates, which by construction cannot judge _helpfulness_, factual grounding, tone, or target-language register;
- any ad-hoc "ask the model if it's good" would be unpinned, unlogged, self-graded (generator judging itself), and impossible to calibrate or demote.

## Decision

The platform gains a **governed AI reviewer**: `surface.review.run`. It takes a frozen candidate artifact plus its grounding inputs and emits a structured `ReviewVerdict`. The reviewer is constrained so that its verdicts are auditable and its authority is bounded:

1. **Judge ≠ generator.** The reviewing `modelId`/`promptId` MUST differ from the artifact's generating `modelId`/`promptId`. A model may not approve its own output.
2. **Grounded, not free-floating.** The reviewer receives the structured record, approved claims, module context, glossary, and (for translations) the source artifact and translator note. It scores the candidate _against those facts_, not against its own priors.
3. **Deterministic harness.** Temperature 0, fixed seed where supported, a closed verdict schema, and self-consistency voting (k samples; disagreement lowers confidence). The harness is reproducible even though the model is not perfectly so; the _record_ of what was asked and answered is exact.
4. **Abstain, don't guess.** Below a confidence threshold, the verdict is `escalate`, which routes to the RFC-0285 human queue. Uncertainty is a first-class outcome, never a coin-flip approval.
5. **Bounded authority.** Whether a verdict may _approve_ (versus only _advise_) is decided by RFC-0278: at L0/L1 the reviewer advises and pre-screens; at L2+ it may approve within its field-class; it never exceeds the scope level.
6. **Logged and calibrated.** Every verdict is appended to the calibration log; `surface.review.calibrate` compares AI verdicts against a human-labelled golden set and emits the agreement/defect metrics RFC-0278 consumes for promotion and demotion.

## Architectural fit

- RFC-0197 freeze/approve is the mechanism; the AI reviewer is one kind of approver writing into it, stamped per RFC-0278.
- RFC-0194 substance and RFC-0274 evidence/duplicate gates run _first_ and deterministically; the AI reviewer only sees candidates that already cleared them, so it judges quality, not structure it cannot see.
- RFC-0272/0273 supply the translation grounding (source artifact, glossary, translator note) that makes cross-lingual review checkable, not vibes.
- RFC-0276 Bordbuch records review passes, calibration runs, and escalations as missions.
- RFC-0282 outcomes (indexation, duplicate footprint, core-page safety) are the ground truth that calibration ultimately reconciles against — the reviewer is judged by reality, not only by the sampling human.

## Design

### TypeScript contracts

```ts
export interface ReviewInput {
  artifactRef: string;              // frozen candidate under review
  fieldClass: "structural" | "narrative" | "claims" | "product";
  grounding: {
    record?: unknown;               // structured surface record
    approvedClaims?: unknown[];
    moduleContext: unknown;         // RFC-0271
    glossaryId?: string;            // RFC-0273
    sourceArtifactRef?: string;     // RFC-0272, translations only
    translatorNoteId?: string;
  };
}

export interface ReviewVerdict {
  artifactRef: string;
  reviewer: { modelId: string; promptId: string; version: string };
  decision: "approve" | "reject" | "escalate";
  confidence: number;               // 0..1, lowered by self-consistency disagreement
  checks: Array<{ id: string; pass: boolean; note?: string }>;
  groundingViolations: string[];    // claims/facts not supported by grounding inputs
  samples: number;                  // self-consistency k
  reviewedAt: string;
}
```

### Verdict rubric (per field-class)

The reviewer runs a closed, versioned checklist so verdicts are comparable across runs:

- `narrative`: factual grounding (every stated fact traces to a grounding input), no invented prices/dates/statistics, information gain over siblings, on-audience tone, no keyword stuffing.
- `claims`: every claim is present in `approvedClaims` verbatim-in-meaning; numbers/dates/certifications exact; no claim the grounding does not contain. Any failure ⇒ `reject` (and RFC-0278 demotes claims to L0).
- `structural`: block/link sanity beyond what deterministic gates cover (e.g. teaser labels not misleading).
- `product` (translations of packaging): matches translator note, no forbidden promises (RFC-0277), register correct (German `Sie`).

### CLI surface

```sh
# Review one artifact or a queue; emit verdicts, never render.
pnpm exec site-kernel run surface.review.run --app warpgogol-com --module pseo --queue ready --json

# Recompute agreement/defect metrics against the human-labelled golden set.
pnpm exec site-kernel run surface.review.calibrate --app warpgogol-com --module pseo --json

# Validate reviewer configuration and log integrity.
pnpm exec site-kernel run surface.review.validate --app warpgogol-com --json
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `apps/<app>/src/surface/review.log.ndjson` | Append-only verdict log (input refs + full verdict) |
| `apps/<app>/src/surface/review.golden/<module>/<lang>/*.json` | Human-labelled golden set for calibration |
| `apps/<app>/src/content/enriched/_review-prompts/<fieldClass>.md` | Frozen, approved reviewer prompts (own freeze-approve lifecycle) |

### Validation rules

| Rule | Severity | Meaning |
| --- | --- | --- |
| `REV-01` | error | Reviewer model/prompt equals the artifact's generator model/prompt |
| `REV-02` | error | An `approve` verdict was used to render at a scope whose level does not authorize agent approval |
| `REV-03` | error | A claims artifact was approved with a non-empty `groundingViolations` list |
| `REV-04` | warning | Verdict confidence below threshold was treated as approve instead of escalate |
| `REV-05` | error | Golden set missing or too small for a scope claiming calibrated status |
| `REV-06` | error | Reviewer prompt is unapproved or unpinned in a verdict |

## Failure modes

- Reviewer would approve its own generator's output: `REV-01`, verdict discarded.
- Confidence below threshold: verdict becomes `escalate`; artifact stays `draft`; RFC-0285 queue gets the item.
- Grounding violation on a claim: `reject`; RFC-0278 demotion of the claims scope; Bordbuch erratum-style event.
- Provider unavailable: `surface.review.run` exits non-zero; no artifact is approved; frozen approved content remains buildable.
- Golden set drifts stale: calibration reports "insufficient/expired evidence"; dependent scopes cannot promote and decay toward their floor.

## Rollout

1. Add verdict types, reviewer prompts (frozen/approved), and the append-only log.
2. Register `surface.review.run` in **advise-only** mode: verdicts are recorded, humans still approve (RFC-0278 L1 pre-screen).
3. Build the initial golden set from the first human-reviewed artifacts per scope.
4. Run `surface.review.calibrate`; expose agreement/defect metrics to `autonomy.level.report`.
5. When a scope's metrics clear the RFC-0278 bar, allow `surface.review.run` verdicts to approve at L2+ for that scope.
6. Keep claims/product under their ceilings; keep the golden set growing from escalations and errata.

## Alternatives considered

- **No AI reviewer; humans forever.** Rejected: it makes RFC-0278's upper levels unreachable and caps the fleet at review throughput.
- **Let the generator self-grade.** Rejected: `REV-01`; a model grading its own output has no independent signal and games any threshold.
- **Use only deterministic scores as the gate.** Rejected: they measure structure, not grounding/tone/register; Fable and RFC-0274 already show the substance score is necessary-not-sufficient.
- **Single-shot, high-temperature judgment.** Rejected: unreproducible and uncalibratable; the harness (temp 0, self-consistency, closed schema, logging) is what makes the judge auditable.

## Risks

- **Reviewer shares generator blind spots** even when model differs. Mitigation: distinct prompt lineage, grounding-anchored rubric, and reconciliation against RFC-0282 outcomes, not only against itself.
- **Over-trust from a small golden set.** Mitigation: `REV-05` minimum sizes per scope; promotion needs sustained agreement, not a lucky batch.
- **Cost of self-consistency sampling.** Mitigation: k is per-field-class and small; review is a queue pass, not per-request, and RFC-0282 gates enrichment/review to clusters that show demand.
- **Escalation flood at first.** Mitigation: expected and healthy; RFC-0285 measures the queue and it shrinks as calibration improves.

## Acceptance criteria

- [x] `ReviewInput` and `ReviewVerdict` types exist in the shared surface layer. (evidence: implemented historically)
- [x] `surface.review.run`, `surface.review.calibrate`, and `surface.review.validate` are registered. (evidence: implemented historically)
- [x] The reviewer enforces model/prompt inequality with the generator (`REV-01`). (evidence: implemented historically)
- [x] Verdicts carry confidence, per-check results, and grounding violations, and low confidence yields `escalate`. (evidence: implemented historically)
- [x] Reviewer authority to approve is bounded by RFC-0278 scope level (`REV-02`). (evidence: implemented historically)
- [x] Calibration emits agreement and defect-escape metrics consumed by `autonomy.level.report`. (evidence: implemented historically)
- [x] Claims artifacts with grounding violations cannot be approved (`REV-03`). (evidence: implemented historically)
- [x] `rfc.validate` passes on this file. (evidence: implemented historically)

## Implementation notes for agents

- The AI reviewer runs in the generation lane, never inside `build.check` or Astro SSG. Its output is frozen verdicts, not live judgments.
- Never point the reviewer prompt at the same model+prompt that generated the artifact.
- Never coerce a low-confidence verdict into an approval to clear a queue; escalate it.
- Treat the golden set as load-bearing infrastructure: grow it from every escalation and every overturned verdict so the reviewer keeps earning its authority.
