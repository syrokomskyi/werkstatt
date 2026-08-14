---
id: RFC-0851
title: "Replace legacy release state with deployment operations"
status: draft
kind: architecture
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-08-14
updatedAt: 2026-08-14
enhancedAt: 2026-08-14
implementedAt:
closedAt:
supersedes:
  - RFC-0357
  - RFC-0358
  - RFC-0608
  - RFC-0627
  - RFC-0628
  - RFC-0842
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0379
  - RFC-0649
  - RFC-0650
  - RFC-0698
  - RFC-0700
  - RFC-0724
  - RFC-0829
  - RFC-0848
  - RFC-0849
  - RFC-0852
  - RFC-0853
dependsOn:
  - RFC-0853
batch: werkstatt-release-certification-cert-001
satisfies:
  - DNA-48
  - DNA-49
  - DNA-73
versionBump: major
commands:
  proposed: []
  added: []
  changed:
    - release.prepare
    - release.ready
    - release.validate
    - release.list
    - release.rollback
    - release.state.validate
    - leitstand.dev-deploy
    - leitstand.propagate
    - leitstand.promote
    - leitstand.status
    - leitstand.rollback
    - leitstand.health
    - leitstand.pipeline.check
  removed: []
appsImpacted: []
packagesImpacted:
  - "@warpgogol/werkstatt"
successSignals:
  - "Release manifests accept only artifact readiness states prepared and ready; no deployment or rollback label remains."
  - "Deployment history is append-only operation data and certification/current health remain separate immutable contracts."
  - "Every legacy site deployment command fails before its first side effect until CERT-007 replaces the guard."
  - "Legacy release directories are reported invalid and are never translated, migrated, or presented as deployable."
  - "Old release/deployment RFC authority is formally superseded while artifact-store, fingerprint, adapter, lock, and test mechanisms remain reusable but non-authorizing."
nonGoals:
  - "This RFC does not implement authority-backed deployment, certification orchestration, Main verification, rollback execution, or health monitoring; CERT-007/CERT-008 own them."
  - "This RFC does not delete old release/mission payloads; CERT-010 owns idempotent audited cleanup."
  - "This RFC does not import old Axiom, test-evidence, quality-report, snapshot, Nebula, or release-state claims into the new certification namespace."
acceptance:
  - probe: file-exists
    path: "packages/werkstatt/src/certification/state-machine.ts"
  - probe: file-exists
    path: "packages/werkstatt/src/certification/transition-block.ts"
---

# RFC-0851: Replace legacy release state with deployment operations

## Context

The current code and normative documents describe incompatible release state machines: `prepared → ready → alt-deployed → promoted`, `prepared → published → alt-deployed → promoted`, and `ready → dev-deployed → alt-deployed → main-deployed`. Handlers also write values that their schema does not declare. These models conflate immutable artifact readiness, mutable deployment progress, rollback history, certification decisions, and current public health.

RFC-0848 was therefore split. RFC-0849 defines canonical bytes, RFC-0852 defines canonical Diagnostic, and RFC-0853 defines strict state/event contracts. This RFC is the one-session forward-only cutover that changes release manifests and blocks old deployment execution. RFC-0850 can proceed independently after RFC-0853. RFC-0848 integrates both.

The operator accepts temporary deployment unavailability until CERT-007. The serving public site stays online, but this repository must not claim or execute a successful new deployment through obsolete semantics.

## Problem

A release artifact can be ready while multiple deployments succeed/fail across channels, a rollback occurs, and public health later degrades. One mutable `release.state` cannot preserve these facts. Extending it again would retain the modeling error and allow old Axiom/test evidence or a plausible state string to masquerade as authority.

Keeping old commands operational during the new foundation would create two authorization paths. Removing old directories now would destroy provenance and violate the separate cleanup contract. The safe transition is strict rejection plus truthful operational unavailability.

## Decision

The release manifest state becomes `ReleaseArtifactState = "prepared" | "ready"`; deployment progress becomes an append-only `DeploymentOperationState` event chain; certification decisions and current health remain separate RFC-0849 contracts. Legacy deployment-state labels are rejected without translation. All existing site release/deployment commands that cannot operate truthfully against the new authority return one shared `CERT-TRANSITION-01` result before any side effect until CERT-007 replaces the guard.

RFC-0357, RFC-0358, RFC-0608, RFC-0627, RFC-0628, and RFC-0842 are fully superseded because their normative authority/state model conflicts with this separation. Retained mechanisms are restated below; their existence grants no deployment authority.

## Architectural fit

### DNA-48 — release discipline

DNA-48 becomes artifact-focused. A release retains its stable id, immutable build/artifact identity, behavior/artifact references, and durable artifact-store verification, but its manifest records only `prepared | ready`. Deployment and rollback never mutate artifact readiness.

### DNA-49 — Leitstand

Leitstand remains the site deployment component and later reuses per-site adapters, locks, build-identity verification, safe secret references, Bordbuch events, and health mechanisms. In this RFC it is deliberately unavailable for new site deployment; only CERT-007 may reconnect those mechanisms to signed certification authorization.

### DNA-73 — sequential deployment

The invariant becomes an operation/certification sequence rather than release enum mutation. Per-site targeting, rejection of `--all`, explicit channel/URL logging, and Dev → Alt → Main ordering remain mandatory when CERT-007 restores commands. The old `ready/dev-deployed/alt-deployed/main-deployed` labels are deleted.

### Superseded versus retained behavior

| Concern | Result after this RFC |
|---|---|
| Old release/deployment state labels and transition authority | Superseded and rejected |
| Axiom/test evidence as direct deployment authorization | Non-authorizing; later producers may contribute only through certification |
| Release id, immutable artifact/build identity, artifact-store references | Retained and restated |
| Consistency locks, atomic writers, idempotency, Bordbuch | Retained infrastructure; no authority by itself |
| Cloudflare/null deploy adapters and freshness/build-identity primitives | Retained but unreachable from blocked site commands until CERT-007 |
| Test pyramid, validators, Axiom archive | Retained evidence mechanisms; never sufficient alone to open a gate |
| `release.ready` recovery/reliability mechanics | Retained only for artifact readiness; no deployment certification meaning |
| Legacy directories and compact history | Preserved as invalid/non-authoritative until CERT-010 |

## Design

### CLI surface

No command is added or removed. These existing workspace commands keep their registered flags but change behavior:

```sh
pnpm exec werkstatt run release.prepare --mission=<mission-id> [--semver=<version>] [--json]
pnpm exec werkstatt run release.ready --release=<release-id> [--json]
pnpm exec werkstatt run release.validate --release=<release-id> [--json]
pnpm exec werkstatt run release.list [--site=<system-id>] [--json]
pnpm exec werkstatt run release.rollback --release=<release-id> [--json]
pnpm exec werkstatt run release.state.validate [--mission=<id>] [--release=<id>] [--site=<id>] [--json]

pnpm exec werkstatt run leitstand.dev-deploy --site=<system-id> [--release=<id>] [--json]
pnpm exec werkstatt run leitstand.propagate --release=<release-id> [--json]
pnpm exec werkstatt run leitstand.promote --release=<release-id> [--json]
pnpm exec werkstatt run leitstand.status --site=<system-id> [--json]
pnpm exec werkstatt run leitstand.rollback --site=<system-id> [--to-release=<id>] [--json]
pnpm exec werkstatt run leitstand.health --site=<system-id> [--channel=dev|alt|main] [--json]
pnpm exec werkstatt run leitstand.pipeline.check --release=<release-id> [--json]
```

`release.prepare`, `release.ready`, `release.validate`, `release.list`, and `release.state.validate` use the strict artifact-only manifest. `release.rollback` and every listed Leitstand command return the transition block because their truthful replacement requires deployment-operation persistence/authority from CERT-007. `release.list` separates valid releases from an explicit bounded `legacyInvalid` diagnostics collection and never labels invalid entries ready/deployable.

No `--force`, `--skip-certification`, `--legacy`, compatibility, or transition-disable flag exists. Service deployment commands are outside this site specification and remain unchanged.

### State contracts

```ts
type ReleaseArtifactState = "prepared" | "ready";

type DeploymentOperationState =
  | "planned"
  | "authorized"
  | "deploying"
  | "deployed"
  | "verifying"
  | "succeeded"
  | "failed"
  | "rollback-authorized"
  | "rolling-back"
  | "rolled-back";

function validateArtifactTransition(from: ReleaseArtifactState, to: ReleaseArtifactState): TransitionResultV1;
function validateDeploymentTransition(from: DeploymentOperationState, to: DeploymentOperationState): TransitionResultV1;
```

Deployment events bind candidate, channel, target, authority operation, previous event identity, and observed environment identity. Gate/Main decisions and `current | degraded | revoked` health are not deployment states. The pure transition validators have complete allowed/forbidden tables, stable reason codes, no I/O, and no adapters.

### Strict manifest and legacy handling

`readReleaseManifest()` parses YAML through the shared parser and strict inferred release schema; `writeReleaseYaml()` accepts only that type and uses the existing atomic writer. Values `published`, `dev-deployed`, `alt-deployed`, `promoted`, `main-deployed`, and `rolled-back` are absent and rejected.

A legacy manifest emits bounded `CERT-LEGACY-STATE-01` with release id/value and the clean-transition explanation. It is never rewritten, imported, deleted, or accepted by `release.ready`. Unknown fields are not stripped. CERT-010 later inventories and deletes allow-listed heavy payloads after cutover.

### Transition block ordering

All blocked handlers call one `buildCertificationTransitionBlock(command)` at the beginning of the handler after flag parsing but before:

- build or install;
- provider/deploy adapter or network request;
- lock/state/registry/release/Bordbuch write;
- evidence sync, CDN purge, health request, or generated-file auto-commit.

Tests spy on the first boundary in each handler and prove zero calls. The shared guard is intentionally replaced—not disabled—by CERT-007.

### File system responsibilities

| Path | Responsibility |
|---|---|
| `packages/werkstatt/src/schemas/release.ts` | Strict artifact-only release manifest/state |
| `packages/werkstatt/src/certification/contracts/state.ts` | Deployment operation state/event contracts from RFC-0853 |
| `packages/werkstatt/src/certification/state-machine.ts` | Pure complete artifact/deployment transition tables |
| `packages/werkstatt/src/certification/transition-block.ts` | Shared side-effect-free `CERT-TRANSITION-01` result |
| `packages/werkstatt/src/release/**` | Typed manifest I/O, legacy diagnostics, artifact-ready commands, rollback block |
| `packages/werkstatt/src/leitstand/**` | Early block in every listed site handler |
| `docs/architecture-dna.md` | Replace DNA-48/49/73 old normative state prose |
| `docs/command-manifest.generated.yaml` | Regenerate all changed command metadata |
| `docs/COMMANDS.md` | Regenerate from command manifest |
| `docs/ecosystem.generated.yaml` | Regenerate from registries; never hand-edit |

No test touches a real mission, cache clone, provider, URL, object store, or release directory. Fixtures live under package test temp roots.

### Output format

Blocked commands return a canonical nonzero kernel result:

```json
{
  "command": "leitstand.promote",
  "status": "incomplete",
  "diagnostics": [{
    "ruleId": "CERT-TRANSITION-01",
    "severity": "error",
    "message": "Site deployment is unavailable until the authority-backed certification transition is implemented.",
    "fixHint": "Complete the accepted certification roadmap through CERT-007; no bypass is permitted."
  }],
  "requiredNode": "CERT-007",
  "exitCode": 1
}
```

`release.list --json` returns `{ valid: ReleaseManifestV1[], legacyInvalid: LegacyReleaseDiagnosticV1[] }`. It does not abort on the first legacy directory, but collection is bounded and each entry is non-authorizing. Pretty mode renders the same facts; neither mode embeds full legacy payloads or absolute paths.

### Failure modes

| Failure | Result |
|---|---|
| Unknown/legacy manifest field or state | strict failure / `CERT-LEGACY-STATE-01`; never default/translate |
| Invalid artifact transition | `CERT-STATE-01`, exit 1, no write |
| Blocked deployment/rollback/health/status invocation | `CERT-TRANSITION-01`, incomplete, exit 1, no side effect |
| More legacy entries than reporting bound | bounded summary plus omitted count; never mark omitted entries valid |
| Site plugin or service deployment accidentally blocked | focused regression failure; fix handler scope, not bypass |

Required transition/legacy diagnostics have zero intended false positives and no suppression. A confirmed schema defect requires this/new superseding RFC; agents may not delete intended fields or add aliases to silence it.

## Rollout

1. Consume RFC-0853 state contracts and add exhaustive pure transition tables.
2. Replace release schema/manual YAML parsing and update prepare/ready/validate/list/state tests together.
3. Install the shared block in release rollback and all listed Leitstand handlers before side effects.
4. Add service-command and provider-zero-call regressions.
5. Replace DNA-48/49/73 and exact agent/Compass surfaces; regenerate command/ecosystem documentation.
6. Run both package-level and workspace governance validations.

There is no grace or compatibility window. The codebase must compile and tests must pass, while new site deployment remains intentionally unavailable until CERT-007. The currently serving public site is not changed by this RFC.

## Alternatives considered

### Add certification states to the release enum

Rejected: it still overwrites concurrent operation/history/health facts and repeats the source of current drift.

### Keep commands working on old evidence until CERT-007

Rejected: that preserves an executable uncertified promotion path and two authorities.

### Migrate or delete old manifests now

Rejected: migration grants false authority; deletion loses provenance and bypasses CERT-010's audited cleanup.

### Block all deployment commands including services

Rejected: the certification specification and single-site cutover target site deployment. Backend service workflows are a separate runtime composition.

## Risks

- **Operational outage:** site deploy commands are unavailable. Accepted mitigation: preserve current Main, make failure explicit, prioritize CERT-007.
- **Guard after side effect:** a weak agent may place it too late. Mitigation: shared first-boundary spies for every handler.
- **Overblocking:** shared helpers may affect service deployment. Mitigation: enumerate exact registered site commands and run service regressions.
- **Legacy confusion:** directories remain. Mitigation: strict rejection and separate invalid collection; never translate.
- **Lost retained obligations:** full RFC supersession could erase useful mechanics. Mitigation: the retained-mechanism table and rewritten DNA explicitly preserve artifact identity/store, per-site sequence, adapter, lock, Bordbuch, and build-identity obligations without old authority.
- **Agent misreads allowed breakage:** operational unavailability does not permit compilation/test failures. Both remain hard acceptance gates.

## Acceptance criteria

- [ ] `ReleaseArtifactState` is exactly `prepared | ready`; deployment operations, certification decisions, and current health are separate strict contracts.
- [ ] Every legacy deployment/rollback label is absent from release schemas and rejected by exhaustive fixtures.
- [ ] `readReleaseManifest`/`writeReleaseYaml` use the inferred strict type and atomic writer; no hand-cast `Record<string, unknown>` or migration reader remains.
- [ ] `release.prepare`, `release.ready`, `release.validate`, `release.list`, and `release.state.validate` use artifact-only semantics; `release.list` reports legacy entries separately.
- [ ] `release.rollback` plus all seven listed Leitstand commands return the exact transition result before any build/provider/network/lock/write/Bordbuch/CDN/health/commit side effect.
- [ ] Service deployment regression tests prove no service handler is blocked or changed.
- [ ] Pure state-table tests cover every allowed/forbidden artifact/deployment transition and prior-event binding.
- [ ] DNA-48, DNA-49, and DNA-73 contain only the new separated model and cite RFC-0851; no old state chain remains normative.
- [ ] `AGENTS.md`, `packages/AGENTS.md`, and `packages/werkstatt/AGENTS.md` describe temporary site-command unavailability and retained non-authorizing mechanisms.
- [ ] `docs/requirements.xml`, `docs/technology.xml`, `docs/development-plan.xml`, `docs/knowledge-graph.xml`, and `docs/verification-plan.xml` are updated or carry an explicit reviewed no-change rationale in implementation evidence.
- [ ] `command.manifest.generate`, `docs.commands.generate`, `ecosystem.manifest.generate`, `workspace.surface.validate`, and generated-drift validation pass.
- [ ] `rfc.acceptance.run --id RFC-0851`, `rfc.verification.emit --id RFC-0851`, `rfc.validate --id RFC-0851 --json`, relevant tests/build checks, and clean-tree verification pass before stamping.

## Implementation notes for agents

- Implement only after RFC-0853 is `implemented` and this RFC is `accepted`; draft text grants no authority.
- Complete only this state/transition boundary. Do not implement authority, certification orchestration, real deployment, monitoring, rollback execution, or cleanup.
- Preserve current public Main. Do not invoke a provider, edit a Sternsystem mirror, delete a release, or touch a mission workpiece during implementation/tests.
- Fix the owning schema/handler source, not generated command docs; regenerate projections from owners.
- The transition guard must precede every side effect. A test that only checks exit code is insufficient; spy the first boundary.
- Do not introduce aliases, migration readers, legacy enum members, force/skip/grace flags, or successful fallbacks.
- Supersession removes old authority, not retained mechanisms listed in this RFC. Do not delete artifact-store, fingerprint, adapter, lock, Bordbuch, testing, or evidence archive infrastructure.
- If an intended old field is still semantically required outside deployment authority, extend the new strict contract deliberately; do not strip it to satisfy parsing.
- For an invariant conflict run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0851 --reason "..." --invariant "DNA-N"` (RFC-0334).
- Follow RFC-0230 for all agent-facing command/docs changes, RFC-0330 for probe evidence, and RFC-0476 for stamping.
- Before stamping, attach line-accurate evidence, run `rfc.verification.emit --id RFC-0851`, then `rfc.implement.stamp --id RFC-0851 --dry-run` and commit through the canonical flow.
