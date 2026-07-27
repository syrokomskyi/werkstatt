---
id: RFC-0136
title: "Amend workflow chain and validators: .agents/workflows-amend/ self-orchestration, delta-audit, and pause taxonomy"
status: implemented
kind: policy
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-05-30
updatedAt: 2026-06-04
implementedAt: 2026-05-30
closedAt:
supersedes: []
supersededBy:
related:
  - DNA-35
  - DNA-36
  - RFC-0073
  - RFC-0074
  - RFC-0075
  - RFC-0076
  - RFC-0083
  - RFC-0085
  - RFC-0087
  - RFC-0048
  - RFC-0049
  - RFC-0052
  - RFC-0135
commands:
  proposed:
    - amend-check.run
    - amend.phase.validate
    - audit.delta.run
    - workflow-amend.list
  added:
    - amend-check.run
    - amend.phase.validate
    - audit.delta.run
    - workflow-amend.list
  changed:
    - workflow.lint
  removed: []
appsImpacted:
  - webgogol-com
packagesImpacted:
  - os/site-kernel
  - os/site-kernel-checks
  - os/site-kernel-audit
successSignals:
  - .agents/workflows-amend/ contains a six-file self-orchestrating chain (a0-intake → a5-handoff) that an AI agent runs end-to-end against an already-onboarded app, reusing the greenfield kernel commands and adding only the amend-specific gates from RFC-0135.
  - workflow.lint validates the amend chain with the same shape contract as the greenfield chain, recognizing the inverted app-present precondition and the strengthen/new-route branch on the compose phase.
  - 05-audit equivalent runs only over the batch delta (touched pages + new routes), reuses the LLM audit cache, and never re-flags or regresses already-accepted content.
  - The agent has the founder's autonomy: it proceeds through new biomes/archetypes/routes without pausing as long as it stays inside contracts, and pauses only for insufficient material coverage and for untraceable legal/factual/price/guarantee claims.
nonGoals:
  - Redefining the amend batch bundle, manifest, provenance trail, coverage ledger, or branch write-zones — those are owned by RFC-0135.
  - Building a workflow engine with retries/fan-out/state machines; the amend chain is linear and status lives in status.md, exactly as RFC-0075 decided for greenfield.
  - Changing the greenfield workflow chain or its gates.
  - Authoring real content for the design-example sources.
---

# RFC-0136: Amend workflow chain and validators: .agents/workflows-amend/ self-orchestration, delta-audit, and pause taxonomy

## Context

RFC-0075 established that `.agents/workflows/` is the active orchestration surface for greenfield onboarding: seven phase-aligned, self-orchestrating files that an AI agent executes end-to-end, pausing only at declared `pauseFor` conditions, gated by `workflow.lint`. RFC-0135 defines the **data and contract layer** of amend-onboarding — the batch bundle, provenance trail, inverted precondition, cumulative coverage, and strengthen/new-route branch — but deliberately leaves the orchestration unspecified.

This RFC supplies that orchestration: a dedicated `.agents/workflows-amend/` chain, the gates that run the delta-scoped checks, the extension of `workflow.lint` to the amend chain, and the pause taxonomy that encodes the founder's autonomy decision. It is the П-5 (delta-audit) and orchestration half of the two-RFC split; it depends on RFC-0135 for every data contract it invokes.

The founder's autonomy decision is the policy spine of this RFC: the agent is free **inside the architecture** (it need not pause to introduce a new biome, archetype, or navigation route as long as it stays within existing contracts), but it MUST pause when material coverage falls below threshold (it reports what is missing and waits — it does not invent) and when a legal, factual, price, or guarantee claim cannot be traced to a source (as 04-author already requires).

## Problem

1. **No executable chain for amend (orchestration gap).** RFC-0135 gives commands and contracts; nothing sequences them into a runbook an agent can follow, with declared reads/writes, recovery rules, and self-orchestration policy.
2. **Audit is whole-app, not delta (П-5).** `apps-check.author` / `apps-check.postbuild` (RFC-0085) and `app.qa.validate` (RFC-0074) run over the entire app. Re-running them after a small batch is slow, re-flags settled content, and discards the LLM cache. Amend needs a delta-scoped audit that touches only the batch's pages and new routes while guaranteeing it does not regress accepted content.
3. **`workflow.lint` does not know the amend chain.** Its phase enum and precondition expectations are greenfield-only; it cannot validate an inverted app-present precondition or a branch on compose.
4. **No phase readiness gate for amend.** `onboarding.phase.validate` (RFC-0076) recognizes only the greenfield numeric phases. Amend phases need an equivalent readiness gate keyed to the batch.
5. **Pause policy is undefined for amend.** Without a declared taxonomy, an agent either over-pauses (asking before every new route) or under-pauses (inventing untraceable claims). The founder's decision must be encoded as `pauseFor` conditions.

## Decision

Introduce the amend orchestration layer:

1. **A new chain `.agents/workflows-amend/`** with six self-orchestrating files: `a0-intake → a1-synthesize → a2-compose → a3-author → a4-audit → a5-handoff`. Each conforms to the RFC-0075 workflow shape (extended below) and reuses greenfield kernel commands wherever the work is identical.
2. **`amend.phase.validate --batch <NNN> --phase <phase>`** — the batch-scoped readiness gate, the amend analog of `onboarding.phase.validate`.
3. **`audit.delta.run`** — a delta-scoped audit that runs the RFC-0074 validators only over the batch's touched pages and new routes, reusing the LLM cache and refusing to declare success if it would regress accepted content.
4. **`amend-check.run`** — the composite gate for the amend chain: greenfield content-discipline validators scoped to the delta, plus the RFC-0135 amend gates (`content.coverage.delta`, `amend.provenance.validate`), split author/postbuild exactly as RFC-0085 split the greenfield gates.
5. **Extend `workflow.lint`** to recognize the amend chain: its phase enum, the inverted app-present precondition, and the strengthen/new-route branch on `a2-compose`. Add **`workflow-amend.list`** for agent discovery.
6. **A pause taxonomy** encoded in every amend workflow's `selfOrchestration.pauseFor`, implementing the founder's autonomy decision.

## Architectural fit

- **RFC-0075.** The amend chain is the second instance of the workflow surface. It reuses the workflow file shape, `selfOrchestration`, and the `workflow.lint` gate — extended, not duplicated.
- **RFC-0135.** Every amend-specific command the chain runs (`amend.input.validate`, `amend.atoms.merge`, `content.coverage.delta`, `amend.provenance.append/validate`) is defined there; this RFC only sequences and gates them.
- **RFC-0074 / RFC-0085.** `audit.delta.run` wraps the existing audit validators with a delta scope and cache reuse; `amend-check.run` mirrors the author/postbuild split so amend never mixes content-discipline failures with missing-`dist/` failures.
- **RFC-0076.** `amend.phase.validate` extends the phase-readiness pattern to the batch, using the batch manifest hash for freshness.
- **RFC-0083 / RFC-0048 / RFC-0049 / RFC-0052.** The `a2-compose` new-route branch runs `cosmic.name.pick`, extends the route registry, and triggers sitemap/hreflang/robots regeneration at build — all inside existing contracts, so no pause is required, but every new route is listed in the a5 handoff summary.

## Design

### The amend chain

```
.agents/workflows-amend/
  README.md                 # how the amend chain differs from greenfield; points at RFC-0135/0136
  a0-intake.md              # validate app-present + register batch + manifest/hash
  a1-synthesize.md          # batch materials → amend-blueprint.md (which pageIds strengthen, which new routes); reuse app biome/family
  a2-compose.md             # branch strengthen vs new-route; site-plan delta; system-md.compile on new-route; section.scaffold as needed
  a3-author.md              # delta atomization + amend.atoms.merge; cumulative coverage via content.coverage.delta
  a4-audit.md               # audit.delta.run + amend-check.author; LLM cache reuse; no regression of accepted content
  a5-handoff.md             # build, amend-check.postbuild, amend.provenance.append, summary (affected routes), autoRun:false
```

Greenfield `02-scaffold` has no amend counterpart: the app and biome already exist. Scaffold-class work (a new biome/archetype/section for a new landing) folds into `a2-compose`, exactly where the greenfield chain scaffolds new sections.

### Workflow shape extensions

The amend files use the RFC-0075 shape with two additions, both validated by `workflow.lint`:

```yaml
phase: compose                 # amend phases reuse the greenfield enum values where they map:
                               # intake→prepare, synthesize, compose, author, audit, handoff
chain: amend                   # NEW — "greenfield" | "amend"; selects precondition + lint rules
preconditions:                 # NEW (amend) — declarative, lint-checked
  appPresent: true             # inverse of greenfield 00-prepare
  systemManifestValid: true
branch:                        # NEW (a2-compose only)
  on: source.intent
  cases: [strengthen, new-route]
```

`a2-compose` declares both branch write-zones in `scope.allowedWriteRoots`, but the strengthen branch's `agentInvariants` forbid touching `system.md`, navigation, sitemap, and robots (enforced at content time by `amend.atoms.merge` per RFC-0135).

### `amend.phase.validate` — batch-scoped readiness gate

```sh
pnpm exec site-kernel run amend.phase.validate --app <id> --batch amend-<NNN> --phase a2-compose
```

```ts
export type AmendPhase =
  | "a0-intake"
  | "a2-compose"
  | "a3-author"
  | "a4-audit";

export interface AmendPhaseValidationResult {
  command: "amend.phase.validate";
  app: string;
  batch: string;
  phase: AmendPhase;
  status: "ok" | "warn" | "fail";
  findings: Array<{ ruleId: string; severity: "info" | "warn" | "error"; file?: string; message: string }>;
}
```

It validates the declared inputs/outputs of an amend phase and their freshness against the **batch** manifest hash (RFC-0135). `a4-audit` readiness requires the `a2`/`a3` outputs present and fresh, mirroring how `onboarding.phase.validate --phase=05-audit` gates greenfield audit.

### `audit.delta.run` — delta-scoped audit with cache reuse (П-5)

```sh
pnpm exec site-kernel run audit.delta.run --app <id> --batch amend-<NNN>
```

- Computes the delta set from the batch provenance changes (RFC-0135): the touched `pageId`s plus any new routes.
- Runs the RFC-0074 audit validators (SEO, structured-data, internal-linking, agent-readiness, LLM audits) **only** over the delta set.
- Reuses `onboarding/.output/05-audit/llm-cache.jsonl` keyed by content+prompt; unchanged pages are cache hits.
- Runs the full deterministic audit only for new routes (a new public URL needs full structured-data/sitemap/hreflang checks); strengthen pages get content-scoped audits.
- **Non-regression guarantee:** it fails if any previously-accepted page that it did _not_ author now reports a new error — catching collateral damage (e.g. a new constellation that breaks an existing page's internal linking). It does not re-flag pre-existing warnings on untouched pages.

### `amend-check.run` — the amend composite gate

Mirrors the RFC-0085 author/postbuild split, delta-scoped:

```sh
pnpm exec site-kernel run amend-check.author    --app <id> --batch amend-<NNN>
pnpm exec site-kernel run amend-check.postbuild --app <id> --batch amend-<NNN>
pnpm exec site-kernel run amend-check.run       --app <id> --batch amend-<NNN>   # = author + postbuild
```

| Stage | Members |
| --- | --- |
| `amend-check.author` | delta-scoped `content.*` (business/references/voice/coverage), `page.block.validate` on touched pages, `content.coverage.delta` (RFC-0135), `amend.phase.validate --phase a3-author`; on new-route also `system.manifest.validate`, `constellation.contract.validate`, `archetype.registry.validate` |
| `amend-check.postbuild` | `audit.delta.run`, `amend.provenance.validate` (RFC-0135), generated-marker on regenerated `public/*` (new-route only), `passport.verify` if passport content changed |

`amend-check.author` is the gate for `a3-author` and `a4-audit`; `amend-check.postbuild` runs in `a5-handoff` after `pnpm --filter <id> build`.

### `workflow.lint` extension + `workflow-amend.list`

`workflow.lint` is extended to lint both chains:

- Accepts `chain: greenfield | amend`.
- For `chain: amend`, requires `preconditions.appPresent: true` on `a0-intake` (the inverse of greenfield), and allows the `branch` field only on the compose phase.
- Validates that every command in `runs` exists — including the RFC-0135 amend commands.
- Defensively requires `onboarding/.input/` and `docs/` in `forbiddenWriteRoots`, and (amend) that `apps/<id>/provenance/` writes go only through `amend.provenance.append` / `content.coverage.delta`, never raw file writes.
- `nextWorkflow` resolves within the same chain.

```sh
pnpm exec site-kernel run workflow-amend.list --json
```

Lists the amend chain with phase, branch, reads/writes summary, and next workflow — the agent's discovery entry point for amend.

### Pause taxonomy (founder autonomy decision)

Every amend workflow declares `selfOrchestration.autoRun: true` (except `a5-handoff: false`) and the following `pauseFor` conditions, and **only** these:

1. **Insufficient coverage.** `content.coverage.delta` or `amend.atoms.merge` reports that the batch material does not cover a declared `pageId`/route above threshold → the agent reports exactly what is missing and waits. It does not invent content.
2. **Untraceable claim.** A legal, factual, price, or guarantee statement cannot be traced to a batch source (the 04-author rule, applied to the delta) → pause for human sourcing.
3. **Near-duplicate merge ambiguity (strengthen).** `amend.atoms.merge` flags a candidate atom in the soft-similarity band (below the hard-drop threshold, above the review threshold) → pause for a human merge decision (П-6).

Explicitly **not** pause conditions (the agent proceeds autonomously inside contracts): introducing a new biome/archetype/section, adding a new route to navigation, or extending `system.md pages[]` on the new-route branch. These are reported in the a5 handoff summary for review, but do not block the run.

### File system responsibilities

| Path | Role |
| --- | --- |
| `.agents/workflows-amend/{a0..a5}-*.md` | The six amend workflow files. |
| `.agents/workflows-amend/README.md` | Usage guide; points at RFC-0135/0136. |
| `packages/os/site-kernel/src/workflow/**` | `workflow.lint` chain extension; `workflow-amend.list`. |
| `packages/os/site-kernel-audit/src/delta.ts` | `audit.delta.run`. |
| `onboarding/.output/amend-<NNN>/**` | Per-batch phase outputs (RFC-0135). |

### Output format

All commands emit the shared envelope. Example delta-audit non-regression failure:

```json
{
  "command": "audit.delta.run",
  "app": "webgogol-com",
  "batch": "amend-007",
  "status": "fail",
  "findings": [
    {
      "ruleId": "audit.delta.regression",
      "severity": "error",
      "file": "src/content/pages/de/leistungen.md",
      "message": "Untouched page 'leistungen' now fails seo.internal-linking after batch amend-007 added route 'sichtpass'. Fix the new route's linking, not this page."
    }
  ]
}
```

### Failure modes

- `workflow.lint` finds an amend file with a greenfield-only precondition, a `branch` on a non-compose phase, or a missing kernel command → fail; merge blocked.
- `amend.phase.validate` finds a stale phase output (batch manifest changed) → fail.
- `audit.delta.run` detects a regression on an untouched page → fail with a pointer to the offending new content, not the victim page.
- `amend-check.postbuild` run before `pnpm --filter <id> build` → single helpful error (per RFC-0085 precedent).
- The agent hits a `pauseFor` condition → it halts and surfaces the situation; it never proceeds past insufficient coverage or an untraceable claim.

## Rollout

1. Implement `amend.phase.validate`, `audit.delta.run`, and the `amend-check.*` composites; wire the RFC-0135 commands into the composites.
2. Extend `workflow.lint` for `chain: amend` (precondition inversion, compose branch) and add `workflow-amend.list`. Keep greenfield linting unchanged.
3. Write the six `.agents/workflows-amend/` files + README, conforming to the extended shape. Add `workflow.lint` over the amend chain to `PACKAGES_CHECK_PIPELINE` (it already lints `.agents/workflows/`; extend its glob to `.agents/workflows-amend/`).
4. Dry-run the chain against `apps/webgogol-com` with the design-example batch (`digitalesFundament` strengthen + `sichtpass`/`umsicht`/`empfehler` new-route) **without authoring content** — verify the gates, branches, and pause conditions fire correctly.
5. Update root `AGENTS.md`: amend intakes start from `.agents/workflows-amend/a0-intake.md`; greenfield still starts from `.agents/workflows/00-prepare.md`.

## Alternatives considered

- **Reuse the greenfield chain with conditional steps.** Rejected — the founder chose a separate chain; an inverted precondition and a compose-time branch would make the greenfield files harder to read and lint.
- **Run the full `apps-check.run` after every batch.** Rejected — slow, re-flags settled content, discards the LLM cache (П-5). The delta scope is the point.
- **Auto-pause on every new public route.** Rejected — contradicts the founder's autonomy decision. New routes are reported in handoff, not blocked.
- **A standalone amend audit engine separate from RFC-0074 validators.** Rejected — duplicates logic; `audit.delta.run` wraps the existing validators with a scope and cache, reusing their internal rules.

## Risks

- **Delta scope misses a real regression.** Mitigated by the non-regression guarantee: `audit.delta.run` fails if any untouched page that the batch did not author newly errors. The scope narrows _what is authored against_, not _what regressions are caught_.
- **Two chains drift in shape.** Mitigated by one `workflow.lint` covering both, with a shared schema and a `chain` discriminator.
- **Over-broad autonomy.** Mitigated by the closed `pauseFor` taxonomy plus `scope.forbiddenWriteRoots`; the human reviews the a5 handoff summary (with the full list of new routes) before deploy.
- **LLM cache staleness on amend.** Mitigated by keying the cache on content+prompt (RFC-0074); a strengthened page's changed atoms invalidate only that page's cache entry.

## Acceptance criteria

- [x] `.agents/workflows-amend/` contains `a0-intake … a5-handoff` + `README.md`, each passing the extended `workflow.lint`. (evidence: implemented historically)
- [x] `workflow.lint` lints `chain: amend` files (precondition inversion, compose branch, RFC-0135 commands in `runs`); greenfield linting unchanged. (evidence: implemented historically)
- [x] `workflow-amend.list` registered workspace-scoped. (evidence: implemented historically)
- [x] `amend.phase.validate` registered app-scoped; freshness keyed to the batch manifest hash. (evidence: implemented historically)
- [x] `audit.delta.run` registered; delta-scoped, cache-reusing, with the non-regression guarantee. (evidence: implemented historically)
- [x] `amend-check.author/postbuild/run` registered; split per RFC-0085; wired to RFC-0135 gates. (evidence: implemented historically)
- [x] `workflow.lint` (amend glob) added to `PACKAGES_CHECK_PIPELINE`. (evidence: implemented historically)
- [x] Dry-run against `apps/webgogol-com` with the design-example batch exercises both branches and all three pause conditions without authoring content. (evidence: original apps retired by RFC-0381, implemented historically)
- [x] Root `AGENTS.md` references the amend chain entry point. (evidence: AGENTS.md:1, agent guide updated)
- [x] `rfc.validate` passes on this file. (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY implement this RFC ONLY when a human sets `status: accepted`, and ONLY together with (or after) RFC-0135, on which every gate depends. Agents MUST NOT change RFC status.
- Agents MUST start every amend intake from `.agents/workflows-amend/a0-intake.md`; never reuse the greenfield `00-prepare.md` for an existing app.
- Agents MUST execute the commands in each amend workflow's `runs` directly via the Bash tool (self-orchestration), and MUST stop at every `selfOrchestration.pauseFor` condition — insufficient coverage, untraceable claim, near-duplicate ambiguity — surfacing the situation to the human.
- Agents MUST NOT pause merely to introduce a new biome, archetype, section, or route; proceed inside contracts and record it in the a5 handoff summary.
- Agents MUST run `amend-check.author` after a3-author and a4-audit, and `amend-check.postbuild` after `pnpm --filter <id> build` in a5-handoff.
- Agents MUST NOT edit a workflow file to make `workflow.lint` pass; fix the underlying drift.
- Agents MUST update the relevant GRACE/AGENTS documents when this RFC changes command surfaces or workflow architecture.
