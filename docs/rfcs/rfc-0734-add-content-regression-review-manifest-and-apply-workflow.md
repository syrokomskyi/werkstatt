---
id: RFC-0734
title: "Add content regression review manifest and apply workflow"
status: draft
# kind options: architecture | contract | command | policy | deprecation
kind: architecture
# scope options: app | workspace
scope: workspace
owners:
  - architecture
# Set by the deciding human together with the status change (RFC-0335).
# Draft scaffolds must keep this empty; do not prefill a default identity.
# Format: human:<handle> (agent:<id> reserved — see RFC-0335)
# Default reviewer when none is specified by the operator: human:andrii-syrokomskyi
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-08-07
updatedAt: 2026-08-07
enhancedAt: 2026-08-07
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends:
  - RFC-0732
amendedBy: []
related:
  - DNA-61
  - RFC-0732
  - RFC-0269
  - RFC-0601
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-63
# RFC-0396: Traceability to a vendored spec node: "<spec-id>/<node-id>", e.g. "pbp/RFC-PBP-020".
# Set by spec.materialize; leave commented for non-spec RFCs.
# specRef:
# RFC-0478: Platform versioning enforcement. Declares the SemVer delta this RFC
# produces when implemented. Required for post-cutoff implemented RFCs (V-29).
# Values: minor (Breaks-B, requires migrator), patch (safe), none (prose-only),
# major (architectural, manually reserved). Default: patch.
versionBump: patch
commands:
  proposed:
    - content.regression.review.generate
    - content.regression.apply
  added: []
  changed:
    - content.regression.check
    - mission.close
  removed: []
appsImpacted: []
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - "@warpgogol/site-kernel-checks"
  - "@warpgogol/site-kernel-handoff"
successSignals:
  - "content.regression.review.generate produces a review.yaml with per-change decisions (accept/reject/fix)"
  - "content.regression.apply reads review.yaml and updates golden snapshot per accepted changes only"
  - "mission.close blocks if content drift exists but no review.yaml has been processed (CREG-05)"
  - "content.regression.apply blocks if workpiece content does not match fix decisions (CREG-04)"
  - "Agent receives a file path to review.yaml in command output for operator handoff"
nonGoals:
  - "HTML report generation — YAML review manifest is sufficient and more agent-friendly"
  - "Interactive web UI for reviewing changes — operator edits YAML directly"
  - "Automatic content fixing via LLM — agent applies fixes based on review.yaml decisions, not the kernel"
  - "Partial golden snapshot updates at the block level — apply updates the entire route's golden entry when any change is accepted"
  - "Cross-language parity checking — same non-goal as RFC-0732"
# RFC-0268: OPTIONAL machine-checkable acceptance probes, executed on-demand
# via `pnpm exec site-kernel run rfc.acceptance.run --id <this-rfc-id>` (never
# automatically inside build pipelines). Closed probe vocabulary — see
# docs/rfcs/rfc-0268-make-rfc-acceptance-criteria-machine-checkable.md.
acceptance:
  - probe: command-registered
    name: "content.regression.review.generate"
  - probe: command-registered
    name: "content.regression.apply"
  - probe: file-contains
    path: "packages/os/site-kernel-checks/src/content-regression.ts"
    pattern: "review.generate"
  - probe: file-contains
    path: "packages/os/site-kernel-checks/src/content-regression.ts"
    pattern: "content.regression.apply"
  - probe: file-contains
    path: "packages/os/site-kernel-handoff/src/mission/mission-close.ts"
    pattern: "CREG-05"
  - probe: file-contains
    path: "docs/architecture-dna.md"
    pattern: "DNA-63"
---

# RFC-0734: Add content regression review manifest and apply workflow

## Context

RFC-0732 established the content regression gate (`content.regression.check`) that snapshots resolved page content per-route and diffs it against a golden baseline. The gate detects content drift (CREG-01), route set mismatch (CREG-02), and cold start (CREG-03). However, the operator workflow for **reviewing and acting on detected drift** has three gaps:

1. **No reviewable diff artifact.** When CREG-01 fires, the operator sees only a diagnostic message with field names (`changedBlocks: [{ blockId: "hero", fields: ["heading"] }]`). There is no way to see the actual old → new text values without manually comparing snapshot YAML files. The operator cannot make informed accept/reject decisions.

2. **No selective confirmation.** `content.regression.snapshot.update --confirm` accepts **all** changes atomically — there is no way to accept some changes, reject others, and request corrections on a third group. Real missions often produce a mix of intentional edits, accidental drift, and changes that need refinement.

3. **`mission.close` silently forgets drift.** The current `mission.close` implementation (lines 600-625 in `mission-close.ts`) copies `current.snapshot.yaml` to the golden snapshot unconditionally — regardless of whether the operator reviewed the diff. This means any content drift is silently accepted as the new baseline on every mission close, defeating the gate's purpose for operators who don't manually run `snapshot.update` first.

## Problem

The operator needs a **reviewable artifact** that:

- Shows each detected change with its **golden (old) value** and **current (new) value** side by side
- Allows per-change decisions: **accept** (legit change, update golden), **reject** (not intended, agent must revert), or **fix** (change needs correction, agent must apply a specific value)
- Is a **plain YAML file** that the operator can edit in any text editor or IDE — no HTML, no JavaScript, no special tooling
- Can be **copied to an AI agent** as instructions — the agent reads the YAML and applies fixes/reverts to source `.md` files
- Is **enforced by the mission lifecycle** — `mission.close` must not silently accept unreviewed drift

The current system has all the data needed (snapshots contain actual text values for `heading`, `lead`, `body`, `items`, and FAQ `question`/`answer`), but no command surfaces it in a reviewable format and no command processes operator decisions.

## Decision

Three additions to the content regression subsystem:

1. **`content.regression.review.generate`** — generates a `review.yaml` file in the mission evidence directory, containing every detected change with golden and current values, pre-filled with `decision: pending` for each change. The command output includes the file path for agent handoff.

2. **`content.regression.apply`** — reads a filled-in `review.yaml` and:
   - For `accept` decisions: updates the golden snapshot for that route
   - For `reject` decisions: verifies the workpiece content has been reverted to golden; emits CREG-04 if not
   - For `fix` decisions: verifies the workpiece content matches `fixValue`; emits CREG-04 if not
   - Writes the updated golden snapshot to the cache clone

3. **`mission.close` enforcement** — blocks if content drift exists and no processed `review.yaml` exists (CREG-05). This closes the silent-acceptance gap.

DNA-63 (content regression review discipline) is established by this RFC.

## Architectural fit

### Architecture DNA

- **DNA-61** (resolved content regression gate) — extended. DNA-61 established the gate; this RFC adds the review and apply workflow that makes the gate actionable for operators.
- **DNA-63** (content regression review discipline) — established by this RFC. Content drift detected by the gate must be explicitly reviewed by the operator before the golden baseline is updated. `mission.close` must not silently accept unreviewed drift.
- **DNA-46** (mission lifecycle) — aligned. The review manifest integrates into the mission lifecycle: `review.generate` during mission work, `apply` before close, `mission.close` enforces review completion.

### Relationship to RFC-0732

This RFC amends RFC-0732. The amendment is strictly additive:

- No existing command signatures change (only `content.regression.check` fixHint text updates to point to `review.generate` instead of `snapshot.update`)
- The golden snapshot format is unchanged
- The `--skip-content-regression` escape hatch remains
- `mission.close` golden snapshot copy behavior changes from unconditional to conditional (only if no drift or after `apply`)

### Site OS operator model

- **Command scope:** `app` — runs against a single site workpiece.
- **Module placement:** `packages/os/site-kernel-checks/src/content-regression.ts` — alongside existing RFC-0732 code.
- **Pipeline integration:** none — `review.generate` and `apply` are operator-invoked commands, not pipeline steps.
- **Mission lifecycle:** `review.generate` is called by the operator/agent after `content.regression.check` reports drift; `apply` is called after the operator fills in decisions; `mission.close` checks for unreviewed drift.
- **Scaling:** applies uniformly across all Sternsystems.

## Design

### CLI surface

```sh
# Step 1: Check for drift (existing, unchanged)
pnpm exec site-kernel run content.regression.check --site warpgogol-com
# → exit 1, CREG-01 diagnostics

# Step 2: Generate review manifest (NEW)
pnpm exec site-kernel run content.regression.review.generate --site warpgogol-com
# → writes missions/<missionId>/evidence/content-regression/review.yaml
# → output includes: "Review manifest: missions/<missionId>/evidence/content-regression/review.yaml"

# Step 3: Operator edits review.yaml — sets decision per change (accept/reject/fix)

# Step 4: Apply decisions (NEW)
pnpm exec site-kernel run content.regression.apply --site warpgogol-com \
  --review missions/warpgogol-com-m000035/evidence/content-regression/review.yaml
# → updates golden snapshot for accepted changes
# → emits CREG-04 if rejected/fix decisions not yet reflected in workpiece content

# Step 5: Agent applies fixes/reverts to source .md files based on review.yaml

# Step 6: Re-run check (should pass after agent fixes)
pnpm exec site-kernel run content.regression.check --site warpgogol-com
# → exit 0

# Step 7: mission.close (no longer silently accepts drift)
pnpm exec site-kernel run mission.close --mission warpgogol-com-m000035
# → blocks with CREG-05 if drift exists and no review.yaml was processed
```

**Flags:**

| Command | Flag | Description |
| --- | --- | --- |
| `content.regression.review.generate` | `--site <name>` | Site to generate review for (required, app scope) |
| `content.regression.review.generate` | `--dry-run` | Print review YAML to stdout without writing file |
| `content.regression.apply` | `--site <name>` | Site to apply review to (required, app scope) |
| `content.regression.apply` | `--review <path>` | Path to filled-in review.yaml (required) |
| `content.regression.apply` | `--force` | Apply even if some decisions are `pending` (escape hatch) |
| `mission.close` | `--skip-content-regression` | Skip CREG-05 enforcement check (escape hatch, same as `mission.validate`) |

### Mission ID resolution

`review.generate` and `apply` take `--site <name>` (app scope) but write to `missions/{missionId}/evidence/content-regression/review.yaml`. The mission ID is resolved by reading `currentMission` from `systems/registry.yaml` for the matching `systemId`. This is the same field used by `mission.validate` and other workspace-scoped commands that need to locate the active mission for a given system.

### Review manifest format

```yaml
# Content Regression Review — warpgogol-com
# Mission: warpgogol-com-m000035
# Generated: 2026-08-07T14:30:00Z
#
# Instructions for operator:
#   1. Review each change below (golden = old value, current = new value)
#   2. Set decision: accept | reject | fix
#   3. For "fix": set fixValue to the desired text
#   4. For "accept": no further action — golden will be updated
#   5. For "reject": agent must revert the source content to match golden
#   6. Run: pnpm exec site-kernel run content.regression.apply --site warpgogol-com --review <this-file>
#
# Instructions for AI agent (copy to agent after operator fills decisions):
#   - Read this file
#   - For each change with decision: reject → revert source .md to golden value
#   - For each change with decision: fix → set source .md to fixValue
#   - For each change with decision: accept → no action needed
#   - After applying changes, run: content.regression.check --site warpgogol-com

schemaVersion: 1
systemId: warpgogol-com
missionId: warpgogol-com-m000035
generatedAt: "2026-08-07T14:30:00Z"
goldenSnapshotHash: "sha256:abc123..."
currentSnapshotHash: "sha256:def456..."
summary:
  totalChanges: 3
  addedRoutes: 0
  removedRoutes: 0
  changedRoutes: 3

changes:
  # ── Route: https://warpgogol.com/ ──────────────────────────
  - id: change-001
    route: https://warpgogol.com/
    blockId: hero
    field: heading
    golden: "Firmenwebsite für Ihren Betrieb — auf eigener Domain"
    current: "Firmenwebsite für Ihren Betrieb — auf der eigenen Domain"
    decision: accept
    fixValue: ""
    note: ""

  # ── Route: https://warpgogol.com/uk/ ───────────────────────
  - id: change-002
    route: https://warpgogol.com/uk/
    blockId: hero
    field: heading
    golden: "Фірмова вебсайт для вашого бізнесу"
    current: "Фірмова вебсайт для вашого бізнесу — на власному домені"
    decision: fix
    fixValue: "Фірмова вебсайт для вашого бізнесу — на власному домені (перевірено)"
    note: "Додати уточнення про власність домену"

  # ── Route: https://warpgogol.com/preis ─────────────────────
  - id: change-003
    route: https://warpgogol.com/preis
    blockId: pricing-table
    field: items
    golden: |
      [{"title":"Einrichtung","description":"200 € einmalig"}]
    current: |
      [{"title":"Einrichtung","description":"150 € einmalig"}]
    decision: reject
    fixValue: ""
    note: "Відкласти зміну цін до наступної місії"

  # ── Route set changes ──────────────────────────────────────
  - id: change-004
    route: https://warpgogol.com/neue-seite
    kind: added-route
    golden: null
    current: "route exists in current snapshot but not in golden"
    decision: accept
    fixValue: ""
    note: "New page added in this mission"

  - id: change-005
    route: https://warpgogol.com/alte-seite
    kind: removed-route
    golden: "route existed in golden but not in current"
    current: null
    decision: accept
    fixValue: ""
    note: "Page removed in this mission"
```

### TypeScript contracts

```ts
// packages/os/site-kernel-checks/src/content-regression.ts

interface ContentRegressionReview {
  schemaVersion: 1;
  systemId: string;
  missionId: string;
  generatedAt: string;          // ISO 8601
  goldenSnapshotHash: string;   // sha256 of golden snapshot content
  currentSnapshotHash: string;  // sha256 of current snapshot content
  summary: {
    totalChanges: number;
    addedRoutes: number;
    removedRoutes: number;
    changedRoutes: number;
  };
  changes: ContentRegressionReviewChange[];
}

interface ContentRegressionReviewChange {
  id: string;                   // "change-001", "change-002", ...
  route: string;
  kind: "block-field" | "added-route" | "removed-route" | "faq";
  blockId?: string;             // for kind: block-field
  field?: string;               // for kind: block-field: heading|lead|body|items
  golden: string | null;        // old value (null for added-route)
  current: string | null;       // new value (null for removed-route)
  decision: "pending" | "accept" | "reject" | "fix";
  fixValue: string;             // only used for decision: fix
  note: string;                 // operator note (free text)
}

interface ContentRegressionApplyResult {
  accepted: number;
  rejected: number;
  fixed: number;
  pending: number;              // should be 0 unless --force
  goldenUpdated: boolean;
  errors: string[];             // CREG-04 violations
}
```

### Diagnostic rules (new)

| Rule | Severity | Description |
| --- | --- | --- |
| CREG-04 | error | Workpiece content does not match review decision (reject not reverted, fix not applied) |
| CREG-05 | error | Content drift exists but no review.yaml has been processed — run `review.generate` |

### File system responsibilities

| Path | Role |
| --- | --- |
| `{workpiecePath}/.cache/content-regression/current.snapshot.yaml` | Working snapshot (existing, RFC-0732) |
| `{cacheClonePath}/.cache/content-regression/{systemId}.snapshot.yaml` | Golden snapshot (existing, RFC-0732) |
| `missions/{missionId}/evidence/content-regression/review.yaml` | Review manifest — generated by `review.generate`, read by `apply` |
| `missions/{missionId}/evidence/content-regression/apply-result.json` | Apply result — written by `apply` for audit trail |
| `packages/os/site-kernel-checks/src/content-regression.ts` | Implementation: review generator, apply handler |
| `packages/os/site-kernel-checks/src/command-tables/build-infra.ts` | Command registration for `review.generate` and `apply` |
| `packages/os/site-kernel-checks/src/diagnostics/rules/core-infra.ts` | CREG-04, CREG-05 diagnostic rules |
| `packages/os/site-kernel-handoff/src/mission/mission-close.ts` | CREG-05 enforcement before golden snapshot copy |

The review manifest is **committed to the mission evidence directory** (not the cache clone) — it is a mission-scoped artifact that documents the operator's review decisions. It is not gitignored.

### `content.regression.review.generate` behavior

1. Build current snapshot (same as `content.regression.check`, calls `buildSnapshot` → `loadSemanticSiteModel` per language, ~150-300ms for a medium site per RFC-0732 performance estimate)
2. Load golden snapshot from cache clone
3. Diff current vs golden (reuse `diffSnapshots`)
4. For each diff entry, extract the **actual golden and current text values** from the snapshot blocks. For `kind: block-field` changes, the `diffSnapshots` function already identifies which fields changed (heading, lead, body, items) per block — `review.generate` reads the golden and current values from the corresponding `ContentRegressionBlock` fields. For `kind: faq` changes, `diffSnapshots` produces `faqChanged: boolean` at the route level — `review.generate` performs a per-entry comparison of `ContentRegressionFaqEntry[]` arrays (question + answer pairs) to extract individual FAQ changes into review manifest entries.
5. Generate `ContentRegressionReview` YAML with `decision: pending` for all changes
6. Write to `missions/{missionId}/evidence/content-regression/review.yaml`
7. Print the file path in the command output for agent handoff:
   ```
   [OK] content.regression.review.generate: 3 change(s) detected
   Review manifest: missions/warpgogol-com-m000035/evidence/content-regression/review.yaml
   ```

### `content.regression.apply` behavior

1. Load review.yaml from `--review` path
2. Validate schema and that all decisions are non-`pending` (unless `--force`)
3. Build current snapshot and verify `currentSnapshotHash` in review.yaml matches the current snapshot's `contentHash` field. If they don't match, emit an error: "Workpiece content has changed since review.yaml was generated. Re-run `review.generate`."
4. For each change in review.yaml:
   - **`accept`**: mark the route's golden snapshot entry for update with current value
   - **`reject`**: build current snapshot, find the route by `route` path, find the block by `blockId`, read the specific `field` value (heading/lead/body/items) from the current `ContentRegressionBlock`. Compare against the golden value in review.yaml. If they still differ, emit CREG-04 ("rejected change not reverted in source")
   - **`fix`**: same lookup mechanism as `reject`, but compare current value against `fixValue` from review.yaml. If they don't match, emit CREG-04 ("fix value not yet applied to source")
5. Write updated golden snapshot to cache clone (only accepted routes are updated; rejected routes keep their golden values)
6. Write `apply-result.json` with summary
7. If any CREG-04 errors: exit 1 (agent must fix source content first)
8. If all decisions satisfied: exit 0

### `mission.close` enforcement

**Current behavior** (RFC-0732): unconditionally copies `current.snapshot.yaml` → golden snapshot.

**New behavior:**

1. Load the existing `current.snapshot.yaml` from the workpiece's `.cache/content-regression/` directory (written during `build.check`, not rebuilt from scratch — avoids ~150-300ms `loadSemanticSiteModel` cost)
2. Load golden snapshot from cache clone
3. If no drift (current hash == golden hash): copy as before (no change needed)
4. If drift exists: a. Check for `missions/{missionId}/evidence/content-regression/apply-result.json` b. If apply-result exists and has `pending: 0` and no errors: copy current → golden (all changes were reviewed and accepted/fixed) c. If no apply-result: emit CREG-05 ("Content drift exists but no review.yaml has been processed. Run: content.regression.review.generate --site <systemId>") and block
5. If `--skip-content-regression` flag is passed to `mission.close`: skip CREG-05 check, copy unconditionally (escape hatch preserved). This flag is added to `mission.close` command registration, mirroring the existing flag on `mission.validate`.

### Operator workflow

```
1. leitstand.dev-deploy → mission.check fails with CREG-01
   ↓
2. Operator/agent runs: content.regression.review.generate --site warpgogol-com
   → Output: "Review manifest: missions/<missionId>/evidence/content-regression/review.yaml"
   ↓
3. Operator opens review.yaml in IDE, reviews each change:
   - accept → legit change, golden will be updated
   - reject → not intended, agent must revert
   - fix → needs correction, agent must set fixValue
   ↓
4. Operator copies review.yaml content to AI agent
   → Agent reads decisions, applies reverts/fixes to source .md files
   ↓
5. Operator runs: content.regression.apply --site warpgogol-com --review <path>
   → If CREG-04: agent hasn't finished applying fixes → back to step 4
   → If exit 0: all decisions satisfied, golden updated
   ↓
6. Operator runs: content.regression.check --site warpgogol-com
   → Should pass (exit 0)
   ↓
7. mission.close → no CREG-05 block (apply-result.json exists)
```

### Agent handoff

The `review.generate` command output includes the review.yaml path. The agent should:

1. Print the path to the operator: `Review manifest ready: missions/<missionId>/evidence/content-regression/review.yaml`
2. Wait for the operator to fill in decisions
3. Read the filled-in review.yaml
4. For each `reject` decision: find the source `.md` file and field, revert to golden value
5. For each `fix` decision: find the source `.md` file and field, set to `fixValue`
6. Run `content.regression.apply --site <systemId> --review <path>` to verify
7. Run `content.regression.check --site <systemId>` to confirm gate passes

The review.yaml contains enough context (route, blockId, field, golden/current values) for the agent to locate the source file and apply changes without additional guidance.

### `content.regression.check` fixHint update

The fixHint in CREG-01 and CREG-02 diagnostics changes from:

```
"Review the content diff. If intended, run: pnpm exec site-kernel run content.regression.snapshot.update --site <systemId>"
```

to:

```
"Review the content diff. Run: pnpm exec site-kernel run content.regression.review.generate --site <systemId>"
```

This guides operators to the new review workflow instead of the atomic `snapshot.update`.

### `content.regression.snapshot.update` deprecation path

`content.regression.snapshot.update` remains functional but is now the **escape hatch** for bulk operations (e.g., after a major content migration where reviewing each change individually is impractical). The recommended workflow is `review.generate` → `apply`. The `snapshot.update` command is not removed — it serves a different use case (atomic bulk accept).

### Output format

`review.generate` `--json` output:

```json
{
  "command": "content.regression.review.generate",
  "status": "pass",
  "data": {
    "reviewPath": "missions/warpgogol-com-m000035/evidence/content-regression/review.yaml",
    "totalChanges": 3,
    "addedRoutes": 0,
    "removedRoutes": 0,
    "changedRoutes": 3
  },
  "summary": "content.regression.review.generate: 3 change(s) detected. Review manifest: missions/warpgogol-com-m000035/evidence/content-regression/review.yaml",
  "exitCode": 0
}
```

`apply` `--json` output:

```json
{
  "command": "content.regression.apply",
  "status": "pass",
  "data": {
    "accepted": 2,
    "rejected": 1,
    "fixed": 0,
    "pending": 0,
    "goldenUpdated": true,
    "errors": []
  },
  "summary": "content.regression.apply: 3 change(s) processed (2 accepted, 1 rejected, 0 fixed). Golden snapshot updated.",
  "exitCode": 0
}
```

When `apply` detects CREG-04 violations:

```json
{
  "command": "content.regression.apply",
  "status": "fail",
  "data": {
    "accepted": 0,
    "rejected": 0,
    "fixed": 0,
    "pending": 0,
    "goldenUpdated": false,
    "errors": ["CREG-04: Rejected change 'change-003' not reverted in source — block 'pricing-table' field 'items' still differs from golden value"]
  },
  "exitCode": 1
}
```

### Failure modes

- **CREG-04 (workpiece content mismatch):** `exitCode: 1` — blocks `apply`. Agent must revert rejected changes or apply fix values to source `.md` files, then re-run `apply`.
- **CREG-05 (unreviewed drift on `mission.close`):** `exitCode: 1` — blocks `mission.close`. Operator must run `review.generate` → fill decisions → `apply`, or use `--skip-content-regression` escape hatch.
- **Stale review.yaml (`currentSnapshotHash` mismatch):** `exitCode: 1` — blocks `apply`. Operator must re-run `review.generate` to produce a fresh review manifest.
- **Pending decisions in review.yaml:** `exitCode: 1` — blocks `apply` unless `--force` is passed. All decisions must be `accept`, `reject`, or `fix`.
- **No golden snapshot (cold start):** `exitCode: 0` — `review.generate` produces a review with all changes as `added-route` kind. `apply` creates the initial golden baseline.
- **`--skip-content-regression` on `mission.close`:** skips CREG-05 check, copies unconditionally. Bordbuch audit entry recommended.

## Rollout

### Default behavior

- **First mission after implementation:** `review.generate` and `apply` are available but not required if no drift exists. If drift exists, `mission.close` blocks with CREG-05 until the operator runs the review workflow.
- **Subsequent missions:** same behavior. The review workflow is only triggered when drift is detected.

### Existing apps

No flag day. The new commands are additive. `mission.close` behavior changes (adds CREG-05 check), but only blocks when drift exists — no drift means no change in behavior.

### Migration from RFC-0732 workflow

Operators who previously used `content.regression.snapshot.update --confirm` can continue to do so — it still works. The new workflow is recommended but not mandatory. `mission.close` accepts either:

- A processed `apply-result.json` (from `content.regression.apply`), OR
- No drift (current hash == golden hash)

If the operator used `snapshot.update --confirm` directly, the golden snapshot is already updated, so `mission.close` sees no drift and proceeds normally.

### Pipeline integration

None. `review.generate` and `apply` are operator-invoked commands, not pipeline steps. They run outside the build pipeline, on demand.

### Compass document synchronization

Adding two new commands and two new diagnostic rules requires synchronizing the following Compass documents:

- `docs/verification-plan.xml` — add content regression review verification entries (CREG-04, CREG-05)
- `docs/development-plan.xml` — add `content.regression.review.generate` and `content.regression.apply` to the command development plan

The `fo-doc-audit` step during implementation handles the actual sync.

### AGENTS.md updates

- `packages/os/site-kernel-checks/AGENTS.md` — add review.generate and apply to the content-regression module entry
- Root `AGENTS.md` — add a rule clarifying the review workflow: CREG-04 (workpiece mismatch) vs CREG-05 (unreviewed drift on close)

## Alternatives considered

### HTML report with interactive buttons

**Rejected.** The operator explicitly prefers YAML over HTML. YAML is:

- Editable in any IDE or text editor
- Diffable in git
- Copyable to AI agents as instructions
- No JavaScript or browser needed
- Simpler to generate and parse

HTML adds complexity without value for this use case.

### Automatic LLM-based content fixing

**Rejected.** The kernel should not invoke LLMs to fix content. The review.yaml is the bridge between the kernel (detection) and the agent (fixing). The agent reads the YAML and applies fixes — the kernel only verifies that fixes were applied.

### Per-block golden snapshot updates

**Rejected as impractical.** The golden snapshot is per-route (one YAML file with all routes). Updating individual blocks within a route would require partial snapshot reconstruction, which is fragile. Instead, `apply` updates the entire route's golden entry when any change in that route is accepted. Rejected changes keep their golden values. This is simpler and more robust.

### Commit review.yaml to cache clone instead of mission evidence

**Rejected.** The review manifest is a mission-scoped artifact — it documents the operator's decisions for a specific mission. It belongs in the mission evidence directory, not the cache clone. The cache clone stores only the golden snapshot (the result), not the review process.

## Risks

### Operator skips review workflow

An operator could use `--skip-content-regression` during `mission.validate` and then `mission.close` would copy the snapshot unconditionally. Mitigation: `--skip-content-regression` is an explicit escape hatch that should be used only with bordbuch audit entry. The default workflow enforces review.

### Review.yaml becomes stale

If the operator generates `review.yaml`, then makes additional content changes, the review.yaml no longer reflects the current diff. Mitigation: `apply` re-builds the current snapshot and compares against the review.yaml's `currentSnapshotHash`. If they don't match, it emits an error: "Workpiece content has changed since review.yaml was generated. Re-run `review.generate`."

### Large review.yaml for bulk content changes

A mission with 50+ content changes would produce a large review.yaml. Mitigation: the YAML is structured and scannable. For truly bulk changes (e.g., content migration), the operator can use `snapshot.update --confirm` as the escape hatch.

### Agent cannot locate source files

The review.yaml contains route, blockId, and field information, but not the source `.md` file path. The agent must resolve route → pageId → source file. Mitigation: the agent has access to `system.md` which maps pageIds to routes, and the content directory structure is conventional (`src/content/pages/{lang}/{slug}.md`). The agent instructions in the YAML header guide this resolution.

## Acceptance criteria

- [ ] `content.regression.review.generate` command registered in `command-tables/build-infra.ts` with `scope: app`, `cacheable: false`, `supportsAllSites: true`
- [ ] `content.regression.apply` command registered in `command-tables/build-infra.ts` with `scope: app`, `cacheable: false`, `supportsAllSites: true`
- [ ] `review.generate` produces a valid `review.yaml` with all detected changes, golden/current values, and `decision: pending`
- [ ] `review.generate` output includes the file path for agent handoff
- [ ] `apply` reads `review.yaml` and updates golden snapshot for accepted changes only
- [ ] `apply` emits CREG-04 when rejected changes are not reverted in source content
- [ ] `apply` emits CREG-04 when fix values are not yet applied to source content
- [ ] `apply` detects stale review.yaml (currentSnapshotHash mismatch) and errors
- [ ] `mission.close` emits CREG-05 when drift exists and no `apply-result.json` exists
- [ ] `mission.close` proceeds when `apply-result.json` exists with `pending: 0` and no errors
- [ ] `mission.close` proceeds when no drift exists (backward compatible)
- [ ] `content.regression.check` fixHint updated to point to `review.generate`
- [ ] `CREG-04` and `CREG-05` diagnostic rules registered in `core-infra.ts`
- [ ] `DNA-63` entry verified in `docs/architecture-dna.md` with reference to this RFC (DNA-63 was added during RFC drafting; verify it references RFC-0734)
- [ ] Unit tests: review generation, apply with all decisions, apply with stale review, mission.close CREG-05 block
- [ ] `rfc.validate` passes on this file with zero errors

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- For RFCs created on or after 2026-07-07 with acceptance probes: before stamping `implemented`, run `site-kernel run rfc.verification.emit --id <this-rfc-id>` and commit the evidence file in the same commit (RFC-0330 amended transition precondition).
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- The review.yaml file MUST be committed to the mission evidence directory (not gitignored).
- Use `writeFileIfChanged` from `@warpgogol/site-kernel` for all file writes.
- Use `yamlStringify` and `yamlParse` from existing content-regression.ts for YAML serialization.
- The `review.generate` command MUST print the review.yaml path in the command output (not just in JSON data) — this is the agent handoff mechanism.
- The `apply` command MUST verify `currentSnapshotHash` in review.yaml matches the current workpiece snapshot before proceeding — this prevents stale reviews.
- `mission.close` CREG-05 check MUST be skipped when `--skip-content-regression` was used during the mission — the escape hatch is preserved.
- `content.regression.snapshot.update` remains functional — do not remove or deprecate it. It serves as the bulk-accept escape hatch.
- The review.yaml header comments MUST include instructions for both the operator and the AI agent — this is the copy-paste handoff mechanism.
