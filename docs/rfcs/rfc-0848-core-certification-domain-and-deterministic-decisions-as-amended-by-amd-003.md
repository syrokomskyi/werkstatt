---
id: RFC-0848
title: "Establish the core certification domain and deterministic decisions"
status: draft
kind: contract
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-08-14
updatedAt: 2026-08-14
enhancedAt: 2026-08-14
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - DNA-48
  - DNA-49
  - DNA-51
  - DNA-52
  - DNA-73
  - RFC-0362
  - RFC-0363
  - RFC-0849
  - RFC-0850
  - RFC-0851
dependsOn:
  - RFC-0850
  - RFC-0851
batch: werkstatt-release-certification-cert-001
satisfies:
  - DNA-53
  - DNA-64
specRef: "werkstatt-release-certification/CERT-001"
versionBump: major
liveSpec: release-certification
commands:
  proposed: []
  added: []
  changed: []
  removed: []
appsImpacted: []
packagesImpacted:
  - "@warpgogol/werkstatt"
  - "@warpgogol/werkstatt-site"
successSignals:
  - "RFC-0849, RFC-0850, and RFC-0851 are implemented independently, and one integration suite proves their public contracts compose without a second authority or compatibility path."
  - "Equivalent parsed evidence at the same authority cut yields the same identities, decision, action pack, dossier root, and state consequence across package boundaries."
  - "No legacy state/evidence/command result can enter the certification namespace or authorize deployment."
  - "Every affected normative, agent-facing, command, Compass, and generated surface describes one separated artifact/operation/certification model."
nonGoals:
  - "This integration RFC does not reimplement any child module or allow an implementation agent to combine their sessions."
  - "This RFC does not implement the plugin profile/producers (CERT-002/CERT-005), authority storage/signing (CERT-003), orchestration/commands (CERT-004), deployment (CERT-007), monitoring (CERT-008), cutover (CERT-009), or cleanup (CERT-010)."
  - "This RFC does not import, migrate, validate, translate, or preserve authority for legacy Axiom/test/readiness/quality/Nebula/release-state evidence."
acceptance:
  - probe: file-exists
    path: "packages/werkstatt/src/tests/certification-foundation.integration.test.ts"
---

# RFC-0848: Establish the core certification domain and deterministic decisions

## Context

The accepted `werkstatt-release-certification` specification makes one immutable candidate and append-only dossier the subject of deployment certification. CERT-001 is the dependency root for all later profile, storage, orchestration, evaluator, deployment, health, cutover, and cleanup nodes.

The initial RFC-0848 draft correctly selected strict contracts, authority-ordered evidence, deterministic aggregation, separated state machines, and a clean cutover, but its audit rejected two implementation hazards:

1. it changed DNA-48/DNA-49/DNA-73 without a formal superseding owner;
2. it combined several independently testable architectural changes into one session-sized document for an agent expected to implement it alone.

The operator confirmed a complete reset of prior certification authority, temporary deployment unavailability, and decomposition by execution boundary. This enhanced RFC is therefore the CERT-001 integration contract. Its three child RFCs are independently accepted, planned, implemented, audited, and verified before this RFC can be implemented.

Normative model sources remain the complete `werkstatt-release-certification` snapshot plus accepted amendments AMD-001 through AMD-006. This RFC states cross-module laws and ownership; child RFCs carry executable detail without duplicating spec field tables.

## Problem

Independent child implementations can each compile while still failing as a system. Schema versions can drift from identity payload builders; selection can accept values schemas meant to reject; action packs can reorder decision inputs; state code can infer deployment success from an old result; the plugin can reintroduce its own Diagnostic; generated/agent documentation can advertise old commands after code blocks them.

CERT-001 needs one final binary checkpoint proving that the strict contract, pure evaluation, and state-transition modules compose under the same candidate/policy/cut identity and that all old authority paths are absent.

## Decision

CERT-001 is implemented as four dependency-ordered RFCs: RFC-0849 owns strict runtime contracts and identities, RFC-0850 owns bounded deterministic evaluation/remediation, RFC-0851 owns formal legacy release/deployment supersession and the fail-closed command transition, and RFC-0848 owns only cross-module integration laws, package-boundary verification, and final normative/agent/generated-surface consistency.

RFC-0848 cannot be implemented until RFC-0850 and RFC-0851 are implemented; their direct dependency on RFC-0849 makes all three child boundaries mandatory. No child may be partially reimplemented or bypassed in the integration session.

## Architectural fit

### DNA-53 — one fingerprint authority

Integration proves every candidate, policy, evidence, decision, action-pack, dossier, and state-event identity flows through the RFC-0849 canonical fingerprint surface. No child or plugin hashes certification values independently.

### DNA-64 — engine/plugin/workshop boundary

Integration proves the engine exports the strict core and imports no stack plugin; the site plugin consumes the canonical Diagnostic and later contributes through the closed plugin contract. No stack-specific producer/profile logic enters CERT-001.

### DNA-48/DNA-49/DNA-73 — explicit supersession owner

RFC-0851—not this integration document—fully supersedes RFC-0357, RFC-0358, RFC-0608, RFC-0627, RFC-0628, and RFC-0842 when it implements the new artifact/operation state model. This placement keeps normative supersession atomic with the code and DNA rewrite. RFC-0848 verifies the result and must fail if either old state prose or an executable old authorization path remains.

### DNA-51/DNA-52 — reusable, non-authorizing infrastructure

Locks, idempotency, atomic writes, artifact storage, fingerprinting, adapters, build identity, Bordbuch, evidence archives, tests, and validators remain reusable. Integration tests prove none of those mechanisms alone produce a certification decision or open a deployment gate.

## Design

### Dependency and execution boundaries

| Order | RFC | One-session responsibility | Completion boundary |
|---:|---|---|---|
| 1 | RFC-0849 | Diagnostic ownership, canonical JSON, strict schemas, explicit identities | both packages compile; contract/identity properties pass |
| 2a | RFC-0850 | evidence index/selection, aggregation, action packs, dossier hashes | pure bounded tests/stress fixture pass |
| 2b | RFC-0851 | artifact/deployment state split, strict release manifest, legacy command block, supersession | changed commands fail before side effects; DNA/docs regenerated |
| 3 | RFC-0848 | cross-module integration, source-boundary and surface-consistency verification | all integrated laws and repository governance checks pass |

RFC-0850 and RFC-0851 may be implemented in either order after RFC-0849. Each receives its own audit, architecture acceptance, plan, implementation, review, and fix cycle. RFC-0848 receives no child code changes except corrections required by an actual integration defect; such a defect is fixed in its owning child module and verified here.

### CLI surface

RFC-0848 adds and changes no registered command. Command lifecycle metadata belongs exclusively to RFC-0851. The integration session invokes exact existing validations:

```sh
pnpm --filter @warpgogol/werkstatt test
pnpm --filter @warpgogol/werkstatt build:check
pnpm --filter @warpgogol/werkstatt-site build:check
pnpm exec werkstatt run werkstatt.autonomy.validate --json
pnpm exec werkstatt run fingerprint.usage.lint --json
pnpm exec werkstatt run command.manifest.validate --json
pnpm exec werkstatt run ecosystem.manifest.validate --json
pnpm exec werkstatt run workspace.surface.validate --json
pnpm exec werkstatt run spec.validate --spec=werkstatt-release-certification --json
pnpm exec werkstatt run rfc.validate --id RFC-0848 --json
```

Before stamping, it also runs:

```sh
pnpm exec werkstatt run rfc.acceptance.run --id RFC-0848
pnpm exec werkstatt run rfc.verification.emit --id RFC-0848
pnpm exec werkstatt run rfc.implement.stamp --id RFC-0848 --dry-run
bash scripts/check-clean-trees.sh
```

### Cross-module integration laws

The integration suite uses only public child APIs and synthetic fixtures. It proves:

1. all values are parsed by RFC-0849 before identity/evaluation/state use;
2. recomputed candidate/policy/evidence identities are exactly those consumed by RFC-0850;
3. one immutable evaluation cut and authority admission order determine selection;
4. decision/action-pack identities are invariant under equivalent input permutations;
5. dossier root changes under event insertion/removal/reorder and is location-independent;
6. `fail > stale > incomplete > pass`, with empty/unknown/timeout/limit overflow never green;
7. deployment operations bind the same candidate/decision/root and cannot mutate artifact readiness;
8. legacy states/evidence/result shapes fail strict parsing and cannot be adapted;
9. the transition block executes before every old site command side effect;
10. site Diagnostic values parse through the engine-owned schema and engine source has no plugin import.

### Scale and false-positive contract

Integration imports RFC-0849's 8 MiB/depth-64 canonical bounds and RFC-0850's limits of 1,000 requirements, 10,000 admitted evidence records, and 1,000 action tasks. Selection/aggregation remains `O(E + R log R)` time and `O(E + R)` memory; integration must not wrap it in a per-requirement scan.

All required schema, identity, aggregation, legacy, and transition diagnostics have zero intended false positives and no suppression/bypass. A confirmed defect is corrected in the owning spec/profile/producer/RFC and forces new identity/evidence as applicable. Until correction, the outcome remains invalid or `incomplete`, never pass. Advisory diagnostics may later have profile-governed suppressions; CERT-001 defines none.

### Integration file responsibilities

| Path | RFC-0848 responsibility |
|---|---|
| `packages/werkstatt/src/tests/certification-foundation.integration.test.ts` | Cross-child identity/evaluation/state and negative legacy laws |
| `packages/werkstatt/src/certification/index.ts` | Verify deliberate public surface; fix ownership only in child RFC if incorrect |
| `packages/werkstatt/package.json` | Verify certification export created by RFC-0849 |
| `packages/werkstatt-site/src/checks/audit/types.ts` | Verify core Diagnostic consumption created by RFC-0849 |
| `docs/architecture-dna.md` | Verify RFC-0851 DNA-48/49/73 and existing DNA-53/64 agree |
| `docs/command-manifest.generated.yaml` and `docs/COMMANDS.md` | Verify RFC-0851 command behavior projection |
| `docs/ecosystem.generated.yaml` | Verify regenerated ecosystem projection |

The integration RFC does not edit mission workpieces, Sternsystem mirrors, releases, provider state, object storage, or the public site.

### Exact Compass and agent-document map

The final CERT-001 integration evidence must review every file below. “No change” is acceptable only with an explicit rationale in the implementation evidence.

| File | Required CERT-001 concern |
|---|---|
| `docs/requirements.xml` | one fail-closed certification authority; reusable checks are non-authorizing |
| `docs/technology.xml` | strict Zod/canonical identity and engine/plugin placement |
| `docs/development-plan.xml` | four-RFC CERT-001 implementation order and blocked transition |
| `docs/knowledge-graph.xml` | ownership/relationships among contracts, evaluation, release, Leitstand, plugin |
| `docs/verification-plan.xml` | property/state/stress/integration/zero-side-effect evidence |
| `docs/source-markup.xml` | source contract requirements for new high-risk certification modules |
| `docs/styling.xml` | reviewed no-change rationale; certification has no styling surface |
| `AGENTS.md` | repository-wide temporary deployment and certification authority rules |
| `packages/AGENTS.md` | shared-package ownership and no duplicate authority |
| `packages/werkstatt/AGENTS.md` | engine contracts, bounds, no I/O/plugin/legacy rules |
| `packages/werkstatt-site/AGENTS.md` | Diagnostic consumer and non-authorizing producer/plugin boundary |

Generated projections are updated from owners: `command.manifest.generate` then `docs.commands.generate`, and `ecosystem.manifest.generate`. They are never hand-edited.

### Output and failure contract

The integration suite produces ordinary Vitest results; it defines no runtime JSON protocol. Runtime output contracts are owned by the children. An integration failure names the violated cross-module law and owning RFC/module so a weaker agent fixes the source rather than adding a bridge.

Stable integration-only test labels use `CERT-INTEGRATION-*`; production code must not emit them. Any mismatch fails CI/tests. There is no warn mode, suppression file, migration allowance, or “expected legacy pass.”

### Failure modes

| Failure | Required response |
|---|---|
| Child RFC not implemented | `rfc.implement.stamp` dependency block; do not start integration |
| Schema/type/identity drift | fix RFC-0849-owned source and rerun its tests |
| Selection/decision/action drift or complexity breach | fix RFC-0850-owned source; no wrapper workaround |
| Legacy state/command/DNA drift | fix RFC-0851-owned source; no alias or bypass |
| Spec contradiction discovered | create accepted spec amendment before code change |
| Generated/agent/Compass mismatch | update owner/generator and regenerate; never hand-edit projections |
| Any missing/stale/unknown integration input | fail/incomplete; never synthesize pass |

## Rollout

1. Audit, enhance, accept, plan, implement, review, and fix RFC-0849.
2. Do the same independently for RFC-0850 and RFC-0851 after RFC-0849; do not combine their implementation commits/sessions.
3. Confirm all child acceptance evidence and implemented statuses.
4. Add/run the cross-module integration suite without reimplementing child logic.
5. Review and synchronize the exact Compass/AGENTS/generated map.
6. Emit RFC-0848 verification evidence and only then request implementation stamping.

The current site may continue serving throughout. New site deployments are unavailable after RFC-0851 and remain unavailable until CERT-007. This accepted operational gap never permits a broken package build, partial child stamp, or legacy success fallback.

## Alternatives considered

### Keep the original monolithic RFC

Rejected after audit and operator grilling. It crossed four execution boundaries and was unsafe for one less capable agent session.

### Make RFC-0848 an umbrella with no executable checkpoint

Rejected. Spec status would claim CERT-001 complete without proving child composition. A small integration suite and exact documentation map earn the parent RFC's existence.

### Let RFC-0848 itself supersede old state RFCs

Rejected after decomposition. Supersession must land atomically with the code/DNA replacement in RFC-0851, not later in a parent that depends on it.

### Preserve old commands until CERT-007

Rejected. That leaves a second uncertified authority. Truthful unavailability is explicitly accepted.

### Treat existing tests/validators/Axiom as already certified evidence

Rejected. They remain useful producers/mechanisms only after later profiles and authority admission bind them to the candidate/policy/cut.

## Risks

- **Premature parent stamp:** mitigated by `dependsOn` and evidence checking all child statuses.
- **Duplicate child logic in integration:** mitigated by public-API-only tests and ownership-specific failure instructions.
- **Normative drift across four RFCs:** mitigated by one batch id, explicit dependency table, spec citations, and final surface scan.
- **False green from retained infrastructure:** mitigated by negative tests proving no adapter/check/archive/result opens a gate without a certification decision.
- **Performance wrapper regression:** mitigated by maximum-size integration fixture plus RFC-0850 operation-count contract.
- **Agent confusion about outage:** mitigated by exact statement that only deployment availability may be broken; builds/tests/contracts remain hard gates.

## Acceptance criteria

- [ ] RFC-0849, RFC-0850, and RFC-0851 are `implemented`, their verification artifacts exist, and no acceptance criterion remains unchecked.
- [ ] The integration suite uses public child APIs and proves all ten cross-module laws, including negative legacy/non-authority cases.
- [ ] The maximum-size integration fixture respects canonical/evaluation/task limits and non-quadratic operation bounds without truncation.
- [ ] Required diagnostics have no suppression/bypass and confirmed contract defects route to normative correction rather than fallback pass.
- [ ] `@warpgogol/werkstatt` imports no stack plugin and the site plugin defines no duplicate Diagnostic/certification authority.
- [ ] DNA-48/49/73 name only the separated model and RFC-0851 supersession; DNA-53/64 agree with public source/package boundaries.
- [ ] Every Compass and AGENTS.md file in the exact review map is updated or has an explicit no-change rationale in evidence.
- [ ] Command manifest, command docs, ecosystem projection, and workspace surface are regenerated/validated and advertise no executable legacy deployment success path.
- [ ] Both impacted package tests/build checks plus autonomy, fingerprint, spec, generated-drift, and clean-tree validations pass.
- [ ] `rfc.acceptance.run --id RFC-0848`, `rfc.verification.emit --id RFC-0848`, and `rfc.validate --id RFC-0848 --json` pass before stamping.

## Implementation notes for agents

- Implement only after RFC-0850 and RFC-0851 are both `implemented` and RFC-0848 is `accepted`. Draft text grants no code authority.
- This session is integration-only. Do not redo child work or combine it with another CERT node.
- If a test exposes a defect, fix it in the child owner and rerun that child's complete validation before returning here. Do not add adapters, aliases, coercions, fallback passes, duplicate schemas, or wrapper reimplementations.
- Read the full certification snapshot/amendments and all three child RFCs before editing.
- Do not invoke providers, deploy, edit mirrors/workpieces, migrate evidence, or delete legacy artifacts.
- Run the exact Compass/agent map; never choose “applicable files” ad hoc and never hand-edit generated projections.
- Follow RFC-0230 for agent-facing/public surfaces, RFC-0330 for acceptance-probe evidence, RFC-0334 for invariant conflict escalation, and RFC-0476 for verified stamping.
- For any new invariant conflict run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0848 --reason "..." --invariant "DNA-N"`; do not work around it.
- Before stamping, add line-accurate evidence, run `rfc.verification.emit --id RFC-0848`, then `rfc.implement.stamp --id RFC-0848 --dry-run` and commit through the canonical flow.
