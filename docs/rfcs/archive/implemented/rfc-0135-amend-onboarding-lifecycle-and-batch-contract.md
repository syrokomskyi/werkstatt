---
id: RFC-0135
title: "Amend-onboarding lifecycle and batch contract: intake new materials into an already-onboarded app"
status: implemented
kind: contract
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
  - RFC-0070
  - RFC-0073
  - RFC-0076
  - RFC-0083
  - RFC-0087
  - RFC-0090
  - RFC-0097
  - RFC-0048
  - RFC-0049
  - RFC-0052
  - RFC-0136
commands:
  proposed:
    - amend.atoms.merge
    - amend.input.validate
    - amend.provenance.append
    - amend.provenance.validate
    - content.coverage.delta
  added:
    - amend.atoms.merge
    - amend.input.validate
    - amend.provenance.append
    - amend.provenance.validate
    - content.coverage.delta
  changed: []
  removed: []
appsImpacted:
  - warpgogol-com
packagesImpacted:
  - os/site-kernel-onboarding
  - os/site-kernel-checks
  - os/site-kernel-content
  - share
successSignals:
  - A new material set is taken on board an already-onboarded app via an immutable, hashed batch under onboarding/.input/amend-<NNN>/ — without overwriting the original 00-brief.md onboarding bundle.
  - Each amend batch leaves a signed, immutable provenance record inside apps/<id>/ that names the batch id, input hash, source versions, and the pageIds/atoms it added or strengthened — so the extracted site remains self-auditable outside the monorepo.
  - The coverage ledger is cumulative per site, not per batch; re-running an already-accepted batch writes 0 changes (idempotent), and a higher source version supersedes the atoms of the prior version through a recorded chain.
  - The compose decision strengthen-route vs new-route activates different write zones and guarantees: strengthen touches only the target page, new-route extends system.md pages[] through site-plan + system-md.compile and is reported in the handoff summary.
nonGoals:
  - Defining the amend workflow chain, its phase files, self-orchestration, delta-audit composite, or pause taxonomy — those live in RFC-0136.
  - Replacing the greenfield onboarding lifecycle (RFC-0070) or its brief contract; amend is a parallel lifecycle for apps that already exist.
  - Populating any real content for digitalesFundament / empfehler / sichtpass / umsicht; those are design examples only.
  - Carrying biome/family/constellation/passport/deploy decisions inside the amend brief; those are derived from materials exactly as in greenfield onboarding.
---

# RFC-0135: Amend-onboarding lifecycle and batch contract: intake new materials into an already-onboarded app

## Context

RFC-0070 defines a one-shot **greenfield** onboarding: a single `onboarding/.input/00-brief.md` plus a research bundle is consumed through five phases, the site is built directly under `apps/<id>/`, and once `apps-check.run` passes the human extracts `apps/<id>/` to its own turborepo and moves `onboarding/.input|.output` to a separate process repo. After that point the onboarding bundle is gone and the app may no longer live in this monorepo at all.

But sites are not finished when they are first onboarded. New material arrives later — a deeper offer write-up, a value rationale, an entirely new landing page. The founder's example batch is `Angebot_Digitales_Fundament_RU_v0.8` + `Geschäftswert_RU_v0.2` (strengthen the existing `digitalesFundament` page) alongside `Empfehler`, `Sichtpass`, `Umsicht` (three new landing routes). Today there is no contract for taking such material **on board an already-onboarded app**: the greenfield brief refuses to start when `apps/<id>/` already exists, the input bundle is a single-tenant flat tree that the next client overwrites, and nothing records what a later intake added to the site.

This RFC defines the **data and contract layer** of amend-onboarding: the immutable batch bundle, its manifest and hash discipline, the provenance trail that stays inside the app, the inverted app-present precondition, the cumulative coverage ledger, the strengthen vs new-route branch contract, idempotency, and source-version policy. The orchestration — the `.agents/workflows-amend/` chain, delta-audit, and pause taxonomy — is specified separately in RFC-0136.

## Problem

1. **No anchor for input after the onboarding bundle leaves (П-1).** After RFC-0070 handoff, `onboarding/.input|.output` move to the process repo and `apps/<id>/` may be extracted to its own repo. There is no defined place for a later batch to live, and no record inside the app of what any prior intake contributed. An extracted site cannot answer "where did this page's claims come from?" on its own.
2. **The greenfield precondition is inverted (П-2).** `brief.validate` and `00-prepare` require `apps/<id>/` to be **absent**. Amend requires it to be **present**, with a valid `system.md`, a chosen biome, and existing constellations.
3. **Two intake shapes share one process but need different guarantees (П-3).** Strengthening an existing `pageId` must not touch `system.md pages[]`, navigation, or the sitemap. Creating a new route must extend all of them. One contract has to encode both branches and their write zones.
4. **No idempotency or "already accepted" signal (П-4).** Re-running the same batch must be a no-op. There is no way to distinguish new material from material already on board, and the coverage ledger today is scoped to a single onboarding's `.output`, not cumulative across a site's life.
5. **No merge contract for strengthening (П-6).** When new atoms land on an existing page, nothing says whether they extend a block, add a block, or replace one — nor how to avoid duplicate claims or drift from the page's established voice profile.
6. **No source-version policy (П-7).** Materials arrive versioned (`v0.8`, `v0.2`). When `v0.9` arrives, nothing defines how it supersedes the atoms the `v0.8` batch contributed.

## Decision

The repository establishes a second, parallel intake lifecycle — **amend-onboarding** — for apps that already exist. It is defined by five contract elements:

1. **The amend batch bundle.** Each intake is an immutable, hashed batch under `onboarding/.input/amend-<NNN>/`, containing a required `00-amend-brief.md` plus its raw materials. Outputs are written under `onboarding/.output/amend-<NNN>/`. The batch never overwrites the greenfield `00-brief.md` bundle.
2. **The app-resident provenance trail.** Every accepted batch appends one immutable signed record under `apps/<id>/provenance/amend/`, naming the batch id, input hash, source files and versions, and the exact `pageId`s and atom ids it added or strengthened. This folder travels with the app when it is extracted, keeping the site self-auditable outside the monorepo.
3. **The inverted precondition command `amend.input.validate`.** It requires `apps/<id>/` present, `system.md` valid, biome resolved, validates `00-amend-brief.md`, and writes/verifies the batch manifest.
4. **The cumulative coverage ledger.** Coverage becomes a per-site, app-resident ledger keyed by `(sourceId, version, atomHash)`. `content.coverage.delta` validates only the batch's new atoms against it, idempotently.
5. **The strengthen vs new-route branch contract.** The amend brief declares an `intent` per source; each branch activates a fixed write zone and guarantee set, enforced by validators.

Compose, author, and audit reuse the existing greenfield kernel commands wherever the work is identical; amend adds new commands only for the differences above.

## Architectural fit

- **RFC-0070.** Amend is the sibling lifecycle to greenfield onboarding. It reuses the `onboarding/.input` / `onboarding/.output` split and the no-draft rule, but inverts the app-present precondition and adds per-batch subfolders instead of a single-tenant tree.
- **RFC-0076.** The batch manifest and header discipline are a direct extension of `OnboardingInputManifest` and `OnboardingPhaseOutputHeader`: amend outputs carry `derivedFromInputHash` taken from the **batch** manifest, not the greenfield intake manifest.
- **RFC-0073 / RFC-0087.** Atoms, voice profile, and the single-owner / idempotent generation rules apply unchanged; `amend.atoms.merge` is bound by the same voice and reference discipline, and the provenance append is single-owner and idempotent.
- **RFC-0083.** New routes that introduce sections get cosmic names through `cosmic.name.pick`; any rename still goes only through `cosmic.name.rename`.
- **RFC-0048 / RFC-0049 / RFC-0052.** The new-route branch is the only branch that touches the route registry, hreflang sitemap, and robots policy. The strengthen branch is contractually forbidden from touching them.
- **RFC-0090 / RFC-0097.** Page file names still derive from `pageId`; new-route locales remain opt-in and asymmetric.
- **Brand fit.** The product materials describe an immutable, signed, accumulating site passport (Sichtpass) with provenance on every claim. The app-resident amend provenance trail is the same philosophy applied to the build process itself — an argument for, not just a convenience of, П-1.

## Design

### The amend batch bundle

```
onboarding/.input/amend-<NNN>/        # immutable once intake starts; agents treat as read-only
  00-amend-brief.md                   # REQUIRED hand-authored frontmatter (schema below)
  <raw material files…>               # e.g. Angebot_Digitales_Fundament_RU_v0.8.md
onboarding/.output/amend-<NNN>/       # per-batch phase outputs (RFC-0136 chain writes here)
  a0-intake/input-manifest.json       # batch manifest + hash (this RFC)
  a1-synthesize/amend-blueprint.md
  a2-compose/site-plan-delta.md
  a3-author/coverage-delta.md
  a4-audit/audit-report.md
```

`<NNN>` is a zero-padded monotonically increasing integer per app (`amend-001`, `amend-002`, …). Multiple batches may exist on disk simultaneously while in flight; each is self-contained.

### `00-amend-brief.md` contract

The only mandatory hand-authored file in a batch. Parsed by `gray-matter` and validated by `amend.input.validate`. It carries exactly the decisions a human must make and the agent cannot derive: which app, and the intent + identity of each source.

```markdown
---
amend:
  batch: amend-007            # must equal the folder name
  targetApp: warpgogol-com     # apps/<id>/ — must already exist
sources:
  - file: Angebot_Digitales_Fundament_RU_v0.8.md
    sourceId: digitales-fundament-angebot   # stable across versions; identity for supersession
    version: v0.8                            # source-declared version string
    intent: strengthen                       # strengthen | new-route
    pageId: digitalesFundament               # existing pageId to strengthen
  - file: Geschaeftswert_RU_v0.2.md
    sourceId: digitales-fundament-value
    version: v0.2
    intent: strengthen
    pageId: digitalesFundament
  - file: Sichtpass_RU_v0.1.md
    sourceId: sichtpass
    version: v0.1
    intent: new-route
    pageId: sichtpass                         # PROPOSED new pageId (kebab→camel per RFC-0090)
---

# Notes (optional, free-form)

(Context the agent should know that does not fit the raw material — sensitivities,
hard preferences, links to prior batches. Read but never copied verbatim into the site.)
```

```ts
// packages/os/site-kernel-onboarding/src/amend-brief.ts
import { z } from "zod";

export const AmendSource = z.object({
  file: z.string(),
  sourceId: z.string().regex(/^[a-z][a-z0-9-]{1,48}$/),
  version: z.string().regex(/^v\d+(\.\d+)*$/),
  intent: z.enum(["strengthen", "new-route"]),
  pageId: z.string(),
}).strict();

export const AmendBrief = z.object({
  amend: z.object({
    batch: z.string().regex(/^amend-\d{3,}$/),
    targetApp: z.string().regex(/^[a-z][a-z0-9-]{2,48}$/),
  }),
  sources: z.array(AmendSource).min(1),
}).strict();

export type AmendBrief = z.infer<typeof AmendBrief>;
```

### `amend.input.validate` — app-present precondition + batch manifest

The amend analog of `brief.validate` + `onboarding.input.validate`, with the precondition inverted.

```sh
pnpm exec werkstatt run amend.input.validate --app warpgogol-com --batch amend-007
```

Behavior:

- Requires `apps/<targetApp>/` to **exist**, its `src/content/system.md` to pass `system.manifest.validate`, and `identity.biome` to resolve to a real biome.
- Validates `00-amend-brief.md` against `AmendBrief`; cross-checks `amend.batch` == folder name and `amend.targetApp` == `--app`.
- For every `intent: strengthen` source, the declared `pageId` MUST already exist in `system.md pages[]`. For every `intent: new-route` source, the declared `pageId` MUST NOT yet exist.
- Builds or verifies `onboarding/.output/amend-<NNN>/a0-intake/input-manifest.json`.
- Emits the shared envelope; exits non-zero on any failure.

```ts
export interface AmendInputManifest {
  version: 1;
  generatedAt: string;
  batch: string;                       // amend-007
  targetApp: string;
  inputRoot: string;                   // onboarding/.input/amend-007
  inputHash: string;                   // hash over all batch files (manifest provenance root)
  files: Array<{
    path: string;
    sha256: string;
    sizeBytes: number;
    sourceId?: string;                 // set for declared sources
    version?: string;
    intent?: "strengthen" | "new-route";
    pageId?: string;
  }>;
}
```

Every amend output file carries an `OnboardingPhaseOutputHeader` (RFC-0076) whose `derivedFromInputHash` is this batch manifest's `inputHash`. A stale output (manifest changed) fails phase validation exactly as in greenfield.

### Strengthen vs new-route branch contract

The `intent` declared per source is resolved on the compose phase into a write zone and a guarantee set. Validators enforce the zones.

| Concern | `strengthen` | `new-route` |
| --- | --- | --- |
| `apps/<id>/src/content/pages/{lang}/<pageId>.md` | edited (atoms merged) | created |
| `apps/<id>/src/content/prose/{lang}/**` | may add referenced prose | may add referenced prose |
| `system.md pages[]` | **must not change** | entry added via site-plan delta + `system-md.compile` |
| `routes.{lang}` | unchanged | added |
| navigation (RFC-0044) | unchanged | may add an entry |
| sitemap / hreflang (RFC-0048/0049) | unchanged | regenerated at build |
| robots (RFC-0052) | unchanged | regenerated at build |
| new constellation / section / archetype / biome | forbidden | allowed within contracts |
| coverage | delta on new atoms only | full coverage of the new page |

The strengthen branch is contractually a **content-only** change: a validator (`amend.atoms.merge`, below) refuses to emit when a strengthen source would require a `system.md` edit. New routes are public URLs; per the founder's autonomy decision the agent may proceed without a human pause as long as it stays inside these contracts, but RFC-0136 requires every new route to appear in the handoff summary for review.

### `amend.atoms.merge` — strengthen merge with similarity + voice guards (П-6)

```sh
pnpm exec werkstatt run amend.atoms.merge --app <id> --batch amend-<NNN> --page <pageId>
```

- Atomizes the strengthen source into candidate atoms (RFC-0073 intent enum).
- Compares each candidate against the page's existing atoms using the same similarity machinery as `section.similarity.report`. Candidates at or above the duplicate threshold are dropped (with a logged finding); near-duplicates above a soft threshold are surfaced for a human merge decision (the pause is owned by RFC-0136).
- Enforces the page's existing `voice-profile` (RFC-0073 `content.voice.lint`) on accepted atoms.
- Proposes a placement per accepted atom — extend an existing block's `body`, or add a new block — emitting the edit to `pages/{lang}/<pageId>.md`. It never silently replaces an existing block.
- Refuses (non-zero) if accepting the atoms would require a `system.md pages[]` change — that is a signal the source was misclassified and should be `new-route`.

### Cumulative coverage ledger + `content.coverage.delta` (П-4)

The greenfield coverage ledger lives at `onboarding/.output/04-author/coverage.md` and dies with the bundle. Amend needs coverage that **persists with the site**. This RFC introduces a per-site, app-resident ledger:

```
apps/<id>/provenance/coverage-ledger.yaml
```

```yaml
# RFC-0135 cumulative coverage ledger — single owner: content.coverage.delta
version: 1
atoms:
  - atomId: digitalesFundament.angebot.guarantee-72h
    sourceId: digitales-fundament-angebot
    version: v0.8
    atomHash: 9f2c…             # content hash of the atom
    batch: amend-007
    pageId: digitalesFundament
    acceptedAt: 2026-05-30T…
```

```sh
pnpm exec werkstatt run content.coverage.delta --app <id> --batch amend-<NNN>
```

- Validates that every atom the batch authored is recorded with its `sourceId`, `version`, and `atomHash`.
- Idempotent: an atom already present with the same `(sourceId, version, atomHash)` produces no change. Re-running a fully-accepted batch writes 0 files (П-4).
- A new batch carrying a higher `version` for an existing `sourceId` marks the prior version's atoms `supersededBy: <new atomId>` rather than deleting them — the supersession chain is auditable (П-7).
- The ledger is the cumulative source of truth; the per-batch `a3-author/coverage-delta.md` is the human-readable view of one batch's contribution.

### App-resident provenance trail (П-1)

```
apps/<id>/provenance/amend/amend-<NNN>.json     # one immutable record per accepted batch
apps/<id>/provenance/amend/ledger.md            # human-readable roll-up, newest first
```

```ts
export interface AmendProvenanceRecord {
  version: 1;
  batch: string;                       // amend-007
  targetApp: string;
  inputHash: string;                   // from the batch manifest — ties record to exact materials
  acceptedAt: string;
  sources: Array<{ sourceId: string; version: string; file: string; sha256: string }>;
  changes: Array<{
    intent: "strengthen" | "new-route";
    pageId: string;
    routesAdded?: Record<string, string>;     // new-route only
    atomIds: string[];                         // atoms this batch added to the page
    sectionsAdded?: string[];                  // new section slugs, if any
  }>;
  signature: string;                   // detached signature over the canonical record body
}
```

```sh
pnpm exec werkstatt run amend.provenance.append   --app <id> --batch amend-<NNN>
pnpm exec werkstatt run amend.provenance.validate --app <id>
```

- `amend.provenance.append` is **single-owner and immutable**: it refuses to overwrite an existing `amend-<NNN>.json`. Appending the same batch twice with identical content is a no-op; appending different content under an existing batch id is an error.
- The record is signed so the trail is tamper-evident once the app leaves the monorepo (mirroring the Sichtpass passport model). Key management reuses the passport signing facility (RFC-0028 family); the exact key source is an implementation detail of RFC-0136's handoff phase.
- `amend.provenance.validate` checks every record's signature, that each `inputHash` is well-formed, and that every `changes[].pageId` exists in the current `system.md` (a strengthened/new page must still be present). It runs in the post-build gate.
- This folder is **not** excluded from client export — it ships with the extracted app so the site is self-auditable outside the monorepo.

### Idempotency contract (П-4)

A batch is idempotent end-to-end: given the same `amend-<NNN>/` bundle and the same starting `system.md`, a re-run produces a byte-identical app diff and writes 0 new provenance/coverage entries. The three idempotency anchors are: the batch `inputHash`, the coverage ledger keyed by `(sourceId, version, atomHash)`, and the immutable provenance record. "Already on board" is therefore a deterministic check, not a guess.

### Output format

All five commands emit the shared kernel envelope. Example:

```json
{
  "command": "amend.input.validate",
  "app": "warpgogol-com",
  "batch": "amend-007",
  "status": "fail",
  "findings": [
    {
      "ruleId": "amend.input.page-absent",
      "severity": "error",
      "file": "onboarding/.input/amend-007/00-amend-brief.md",
      "message": "intent: strengthen names pageId 'digitalesFundament' but it is not present in system.md pages[]."
    }
  ]
}
```

### Failure modes

- `apps/<targetApp>/` absent, or its `system.md` invalid → `amend.input.validate` fails (inverse of greenfield).
- `intent: strengthen` names a `pageId` not in `system.md`, or `intent: new-route` names one that already exists → fail.
- A strengthen source whose atoms would require a `system.md pages[]` change → `amend.atoms.merge` fails, prompting reclassification to `new-route`.
- An amend output whose `derivedFromInputHash` ≠ the batch manifest hash → phase validation fails (RFC-0076).
- `amend.provenance.append` asked to overwrite an existing batch record with different content → fail; the batch id must be unique and records are immutable.
- A coverage entry missing for an authored atom → `content.coverage.delta` fails.

## Rollout

1. Add `AmendBrief` and `AmendInputManifest` schemas to `@gogol/site-kernel-onboarding`.
2. Implement `amend.input.validate` (app-present precondition + manifest builder).
3. Implement `amend.atoms.merge`, `content.coverage.delta`, and the cumulative `coverage-ledger.yaml` writer (single owner, idempotent per RFC-0087).
4. Implement `amend.provenance.append` (immutable, signed) and `amend.provenance.validate`; ensure `apps/<id>/provenance/` is exempt from client-export exclusion.
5. Register all five commands; `amend.provenance.validate` and `content.coverage.delta` are wired into the amend gates by RFC-0136, not into the greenfield `apps-check.*` pipelines.
6. This is additive: no greenfield command changes behavior. `apps/warpgogol-com` is the first amend target (design example `digitalesFundament` strengthen + `sichtpass`/`umsicht`/`empfehler` new-route), but no content is authored under this RFC.

## Alternatives considered

- **A mode flag on the greenfield brief (`--amend`).** Rejected by the founder: amend has an inverted precondition, per-batch bundles, and a provenance obligation that would bloat the single-tenant greenfield contract. A parallel lifecycle is cleaner.
- **Keep provenance only in the process repo (`onboarding/.output`).** Rejected — it violates П-1: an extracted app could not answer where its claims came from. Provenance must ride inside `apps/<id>/`.
- **Overwrite prior-version atoms on a new source version.** Rejected — destroys the audit chain. Supersession is recorded, not erased (П-7).
- **A single batch-scoped coverage file.** Rejected — coverage must be cumulative per site to detect duplicates across batches (П-4, П-6).

## Risks

- **Provenance signing key management.** If the signing key is unavailable outside the monorepo, validation degrades to structural-only. Mitigation: reuse the passport signing facility and document the key source; `amend.provenance.validate` warns (not fails) when only structural checks are possible.
- **Strengthen/new-route misclassification by the human.** Mitigated by `amend.input.validate` cross-checks and `amend.atoms.merge` refusing system.md-requiring edits on a strengthen source.
- **Ledger drift if hand-edited.** Mitigated by single-owner generation and CI hash checks, exactly as RFC-0087 handles other generated files.
- **Batch numbering collisions across parallel agents.** Mitigated by `amend.input.validate` rejecting a batch id whose folder name and `amend.batch` disagree, and by provenance immutability.

## Acceptance criteria

- [x] `AmendBrief`, `AmendSource`, `AmendInputManifest`, `AmendProvenanceRecord` types defined in `@gogol/site-kernel-onboarding` / `share`. (evidence: packages/ directory, package exists)
- [x] `amend.input.validate` registered app-scoped; requires `apps/<id>/` present and `system.md` valid; builds the batch manifest. (evidence: original apps retired by RFC-0381, implemented historically)
- [x] `amend.atoms.merge` registered; enforces similarity + voice guards and refuses system.md-requiring edits on strengthen sources. (evidence: implemented historically)
- [x] `content.coverage.delta` registered; writes the cumulative, idempotent `apps/<id>/provenance/coverage-ledger.yaml` with supersession on version bump. (evidence: original apps retired by RFC-0381, implemented historically)
- [x] `amend.provenance.append` (immutable, single-owner, signed) and `amend.provenance.validate` registered; `apps/<id>/provenance/` exempt from client-export exclusion. (evidence: original apps retired by RFC-0381, implemented historically)
- [x] Amend outputs carry RFC-0076 headers with `derivedFromInputHash` from the batch manifest. (evidence: implemented historically)
- [x] Re-running a fully-accepted batch writes 0 files (idempotency regression test). (evidence: implemented historically)
- [x] `rfc.validate` passes on this file. (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY implement this RFC ONLY when a human sets `status: accepted`. Agents MUST NOT change RFC status.
- Agents MUST treat `onboarding/.input/amend-<NNN>/**` as read-only source material, exactly like the greenfield `.input`.
- Agents MUST NOT overwrite the greenfield `00-brief.md` bundle to start an amend; amend uses its own `amend-<NNN>/` subfolder.
- Agents MUST write derived artifacts only under `onboarding/.output/amend-<NNN>/` and the declared `apps/<id>/provenance/` files.
- Agents MUST NOT hand-edit `coverage-ledger.yaml` or any `provenance/amend/*.json`; regenerate through the owning command.
- Agents MUST NOT touch `system.md pages[]`, navigation, sitemap, or robots on a `strengthen` source. If the material seems to need a new page, reclassify it as `new-route` in the brief and re-validate.
- Agents MUST update the relevant GRACE/AGENTS documents when this RFC changes command surfaces or onboarding architecture.
