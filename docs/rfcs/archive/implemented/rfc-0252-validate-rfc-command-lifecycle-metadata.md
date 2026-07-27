---
id: RFC-0252
title: "Validate RFC command lifecycle metadata"
status: implemented
# kind options: architecture | contract | command | policy | deprecation
kind: policy
# scope options: app | workspace
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-07-01
updatedAt: 2026-07-01
implementedAt: 2026-07-01
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0087
  - RFC-0224
  - RFC-0222
  - RFC-0246
  - RFC-0248
  - RFC-0249
commands:
  proposed:
    - rfc.command-lifecycle.validate
  added:
    - rfc.command-lifecycle.validate
  changed:
    - rfc.validate
    - rfc.list
    - ecosystem.manifest.generate
    - ecosystem.manifest.validate
  removed: []
appsImpacted: []
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - "@gogol/site-kernel"
  - "@gogol/site-kernel-checks"
successSignals:
  - "Implemented RFCs do not leave newly introduced commands only under `commands.proposed`."
  - "`rfc.validate` or `rfc.command-lifecycle.validate` reports command lifecycle metadata drift with concrete RFC file locators."
  - "Agent Control Plane command/RFC projections distinguish proposed, added, changed, removed, and implemented command surfaces."
nonGoals:
  - "Do not change the RFC acceptance gate: draft/reviewing RFCs still cannot authorize implementation."
  - "Do not require historical RFC cleanup beyond the accepted rollout scope."
  - "Do not implement this policy while the RFC remains draft."
---

# RFC-0252: Validate RFC command lifecycle metadata

## Context

The 2026-07-01 architecture audit found that recent implemented RFCs correctly added commands in code but left command lifecycle metadata inconsistent:

- RFC-0246 introduced `workspace.surface.validate`, but frontmatter still lists it under `commands.proposed` and keeps `commands.added: []`.
- RFC-0248 introduced `content.asset.contract.validate`, but frontmatter still lists it under `commands.proposed` and keeps `commands.added: []`.
- RFC-0249 introduced `ci.local.validate` and `test.signal.validate`, but frontmatter still lists them under `commands.proposed` and keeps `commands.added: []`.
- RFC-0245 shows the intended completed shape: command names appear under both `proposed` and `added` once implemented.

This is not a runtime bug, but it weakens the repository's AI-facing governance layer. Agents use RFC metadata to understand which commands are pending ideas versus implemented surfaces.

## Problem

The unprotected invariant is: **an RFC's command lifecycle metadata must reflect its status.**

When implemented RFCs leave commands only in `proposed`:

- Agents may treat implemented commands as future work.
- The Agent Control Plane may under-report command history.
- `rfc.list --status accepted --json` and future command provenance tools cannot distinguish proposal from implementation.
- Reviewers cannot easily see whether a command was added, changed, or only discussed.

The existing `rfc.validate` catches many lifecycle issues, but it does not enforce command lifecycle consistency.

## Decision

The workspace will add command lifecycle validation for RFC frontmatter.

The policy:

- `commands.proposed` records command names discussed by an RFC before implementation.
- `commands.added` records command names introduced by the implementation.
- `commands.changed` records existing command names whose behavior, output shape, scope, or pipeline position changed.
- `commands.removed` records command names removed or deprecated by the implementation.
- For `status: draft` and `status: reviewing`, `commands.added` should normally be empty unless documenting already-existing commands from a superseded RFC.
- For `status: accepted`, `commands.added` may be empty because implementation has not happened yet.
- For `status: implemented`, any command in `commands.proposed` that now exists in the live registry and was introduced by that RFC must also appear in `commands.added`.
- For `status: implemented`, `commands.changed` entries must exist in the live registry unless the RFC also lists them under `removed`.

A new command, `rfc.command-lifecycle.validate`, may be implemented as a separate focused validator or folded into `rfc.validate` as a named rule group. The command should be registered and discoverable either way.

## Architectural fit

This RFC extends RFC-0224's lifecycle governance and RFC-0245's Agent Control Plane. It does not change the draft/accepted/implemented gate. It makes command metadata precise enough for autonomous planning.

The implementation likely belongs in `@gogol/site-kernel` because RFC governance commands live there today. If the checks package owns ACP cross-checking, the command can delegate to shared RFC parsing helpers from `site-kernel`.

## Design

### CLI surface

```sh
pnpm exec site-kernel run rfc.command-lifecycle.validate --json
pnpm exec site-kernel run rfc.validate
pnpm exec site-kernel run rfc.list --status implemented --json
pnpm exec site-kernel run ecosystem.manifest.validate --json
```

`rfc.command-lifecycle.validate` is workspace-scoped and read-only.

### TypeScript contracts

```ts
type RfcStatus = "draft" | "reviewing" | "accepted" | "implemented" | "superseded" | "rejected";

interface RfcCommandLifecycle {
  rfcId: string;
  file: string;
  status: RfcStatus;
  proposed: string[];
  added: string[];
  changed: string[];
  removed: string[];
}

interface RegisteredCommandSnapshot {
  name: string;
  scope: "app" | "workspace";
  provider: "workspace" | "app";
}

interface RfcCommandLifecycleDiagnosticData {
  rfcId: string;
  command: string;
  status: RfcStatus;
  bucket: "proposed" | "added" | "changed" | "removed";
}
```

### Rules

`rfc.command-lifecycle.validate` emits:

- `RFC-CMD-01`: implemented RFC lists live introduced command only under `proposed`.
- `RFC-CMD-02`: implemented RFC lists command under `added` but no live command exists and command is not intentionally removed.
- `RFC-CMD-03`: implemented RFC lists command under `changed` but no live command exists and command is not intentionally removed.
- `RFC-CMD-04`: accepted/draft RFC lists `added` command without a rationale.
- `RFC-CMD-05`: command appears in conflicting lifecycle buckets without a documented transition.

`RFC-CMD-01` is fail-hard for every implemented RFC. Historical command metadata drift must be fixed in the RFC frontmatter instead of preserved as legacy warning debt.

### Agent Control Plane projection

`docs/ecosystem.generated.json` should include a command provenance section after implementation:

```ts
interface EcosystemCommandProvenance {
  command: string;
  proposedBy: string[];
  addedBy: string[];
  changedBy: string[];
  removedBy: string[];
}
```

This is generated from RFC frontmatter and live command registry data. It is advisory, not normative.

### File system responsibilities

| Path | Role |
| --- | --- |
| `docs/rfcs/*.md` | Source of RFC command lifecycle metadata |
| `packages/os/site-kernel/src/rfc*.ts` | Existing RFC parser/validator implementation location if owned by kernel |
| `packages/os/site-kernel-checks/src/ecosystem.ts` | ACP command provenance projection if added there |
| `packages/os/site-kernel-checks/src/diagnostics/rules.ts` | Rule registry if command is implemented in checks |
| `tools/kernel.config.ts` | Root registration for workspace-scoped RFC governance commands |

## Rollout

1. Add a parser/helper that extracts command lifecycle buckets from RFC frontmatter.
2. Add `rfc.command-lifecycle.validate` with fail-hard implemented-RFC command lifecycle behavior.
3. Fix current implemented RFC metadata for RFC-0246, RFC-0248, and RFC-0249.
4. Add command provenance projection to the ACP manifest.
5. Add lifecycle validation to `ci.local.validate` and `.github/workflows/ci.yml` if it is not already covered by `rfc.validate`.
6. Remove the temporary historical drift allowance by backfilling existing implemented RFC command metadata.

## Best project decision

The best decision is to add a validator rather than relying on reviewer memory. The repository is already using RFC frontmatter as machine-readable control data; command lifecycle consistency should be enforced the same way status/implementedAt consistency is enforced.

## Alternatives considered

Editing the three current RFCs by hand without a validator was rejected because the same drift will recur.

Removing `commands.proposed` after implementation was rejected because it loses proposal history. Keeping both `proposed` and `added` is more useful: proposed records design intent; added records implementation reality.

Making `commands.added` mandatory for every implemented RFC was considered too strict because many RFCs change policy or content without adding commands.

## Risks

Inferring which RFC "introduced" an existing command can be ambiguous for older RFCs. The first implementation should be conservative and focus on commands explicitly listed in each RFC.

Command names can move providers or scopes. The validator should detect live command existence first, then add scope/provider checks only where the RFC declares them.

Historical RFC cleanup can create churn. The rollout should fix only current known drift and enforce stricter rules for new/changed RFCs.

## Acceptance criteria

- [x] `rfc.command-lifecycle.validate` is registered as a workspace-scoped command, or equivalent named rule coverage is added to `rfc.validate`. (evidence: implemented historically)
- [x] Implemented RFCs that introduce live commands no longer leave those commands only under `commands.proposed`. (evidence: implemented historically)
- [x] Current known drift in RFC-0246, RFC-0248, and RFC-0249 is fixed. (evidence: implemented historically)
- [x] New rule ids are documented and emitted as canonical diagnostics or existing RFC warning records. (evidence: implemented historically)
- [x] Agent Control Plane command provenance includes proposed/added/changed/removed RFC relationships. (evidence: implemented historically)
- [x] `pnpm exec site-kernel run rfc.validate`, `pnpm exec site-kernel run rfc.command-lifecycle.validate --json`, `pnpm exec site-kernel run ecosystem.manifest.validate --json`, and `pnpm exec site-kernel run ci.local.validate --json` pass. (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY implement code changes only when this RFC has `status: accepted` or `status: implemented`.
- Do not change the RFC draft/accepted implementation gate.
- Fix validator behavior before bulk-editing old RFC files.
- Keep command provenance generated from RFC frontmatter and live command registry; do not hand-maintain it in ACP output.
- If implemented inside `rfc.validate`, still make the rule discoverable in docs/command output so agents know what failed.
