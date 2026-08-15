---
rfcId: RFC-0855
planId: PLAN-RFC-0855-01
status: draft
owner: architecture
createdAt: 2026-08-15
updatedAt: 2026-08-15
scope:
  apps: []
  packages:
    - "@warpgogol/forge"
    - "@warpgogol/werkstatt"
    - "@warpgogol/werkstatt-game"
    - "@warpgogol/werkstatt-site"
    - "@warpgogol/werkstatt-video"
  services: []
  docs:
    - AGENTS.md
    - packages/AGENTS.md
    - packages/forge/AGENTS.md
    - packages/werkstatt/AGENTS.md
    - packages/werkstatt-game/AGENTS.md
    - packages/werkstatt-site/AGENTS.md
    - packages/werkstatt-video/AGENTS.md
    - docs/architecture-dna.md
    - docs/specs/werkstatt-release-certification/amendments/amd-007-*.md
    - docs/rfcs/rfc-0769-*.md
    - docs/rfcs/rfc-0770-*.md
    - docs/rfcs/rfc-0848-*.md
    - docs/rfcs/rfc-0850-*.md
    - docs/rfcs/rfc-0851-*.md
    - docs/rfcs/rfc-0853-*.md
    - docs/rfcs/rfc-0855-*.md
    - docs/rfcs/rfc-0856-*.md
    - docs/rfcs/rfc-0857-*.md
    - docs/rfcs/rfc-*.md
    - docs/audits/rfc-*.md
    - docs/plans/agent-runtime-certification/**
    - docs/requirements.xml
    - docs/technology.xml
    - docs/development-plan.xml
    - docs/knowledge-graph.xml
    - docs/verification-plan.xml
    - docs/source-markup.xml
    - docs/styling.xml
    - docs/rfcs/index.yaml
    - docs/rfcs/decision-log.generated.yaml
    - docs/rfcs/decision-log.generated.md
    - docs/rfcs/dna-trace.generated.yaml
    - docs/ecosystem.generated.yaml
---

# Implementation Plan: RFC-0855

## 1. Outcome and objectives

Implement RFC-0855 as a documentation-only program charter. The result is an accepted, internally consistent, machine-checkable authority graph and a complete set of draft execution packets. It is not the runtime or certification implementation.

RFC-0857 is the controlling amendment wherever RFC-0855 or RFC-0856 could be read as requiring early materialization of release-certification RFCs. In particular, CERT-002 through CERT-010 remain unmaterialized until their predecessors complete and a Steward performs the just-in-time governance range.

- [ ] Create proposed AMD-007 without editing the immutable specification snapshot or accepting the amendment.
- [ ] Supersede RFC-0769 and RFC-0770 and carry their valid engine/profile inversion forward in revised DNA-64 wording.
- [ ] Create exactly seven new non-spec child RFCs, each through `rfc.create`, with distinct responsibility, direct dependencies, and `batch: agent-runtime-certification-program`.
- [ ] Re-audit and enhance RFC-0848, RFC-0850, RFC-0851, and RFC-0853 against RFC-0855, proposed AMD-007, and the new component/runtime contracts.
- [ ] Create `forge/program@1` draft fixtures, all 25 sequential packet drafts, and preparation/completion/recovery templates with no placeholder decisions or executable parallel path.
- [ ] Synchronize active AGENTS, DNA, Compass, RFC relationship projections, and the generated ecosystem projection.
- [ ] Review the complete documentation diff, attach exact acceptance evidence to RFC-0855, and stamp only RFC-0855 as implemented.

## 2. Non-negotiable execution constraints

1. Work strictly sequentially. Do not delegate, spawn agents, or prepare two artifacts concurrently.
2. Make no source-code, test-code, deployment, provider, mirror, mission-workpiece, credential, or runtime-state change.
3. Do not run `spec.materialize` for CERT-002 through CERT-010. Do not hand-edit their `materializedAs` projection fields and do not invent repository RFC IDs for them.
4. Keep AMD-007 `status: proposed` and `reviewers: []`. Packet 040 owns its explicit human acceptance.
5. Keep every newly created child RFC in `draft`. Charter implementation does not accept or implement child decisions.
6. Do not alter the normative design bodies of accepted RFC-0855, RFC-0856, or RFC-0857. Only reciprocal relationship metadata and RFC-0855 checkbox evidence required by the implementation stamp may change; evidence annotations must not change criterion meaning.
7. Use `rfc.create` for every non-spec RFC number. Never scan the RFC directory to choose an ID.
8. Use `apply_patch` for hand-authored file changes, owner commands for generated files, and `ecosystem.commit` for every commit. Raw `git commit` is forbidden.
9. After each commit, run `git status`; before the final response, run `bash scripts/check-clean-trees.sh`.
10. A discovered contradiction, duplicate responsibility, immutable-spec edit requirement, or need for source code stops charter implementation and triggers the escalation rules in section 8.

## 3. Affected artifacts and ownership

### 3.1 Source code and command surface

None. RFC-0855 declares no added, changed, or removed command. Do not run `command.manifest.generate`, because no command source changes.

The future `program.packet.*` commands are owned by RFC-0856 and packet 000. The charter creates their real planning fixtures only; it must not create an ad hoc validator in `packages/**`.

### 3.2 Governance contracts

| Artifact | Required mutation | Authority |
| --- | --- | --- |
| RFC-0855 frontmatter | add reciprocal `amendedBy: RFC-0857`; later add acceptance evidence only | RFC-0857 and `rfc.implement.stamp` |
| RFC-0856 frontmatter | add reciprocal `amendedBy: RFC-0857`; body unchanged | RFC-0857 |
| RFC-0769 and RFC-0770 | reciprocal supersession metadata and terminal `superseded` state while preserving `implementedAt` | accepted RFC-0855 |
| DNA-64 | replace one-plugin composition with one-profile/resolved-component-graph composition while preserving inversion | accepted RFC-0855 |
| AMD-007 | proposed static-seam, runtime-identity, evaluator, and roadmap reconciliation | RFC-0855; acceptance deferred to packet 040 |
| Seven new child RFCs | complete draft decisions for packets 050–090 and 190–200 | RFC-0855 |
| RFC-0848/0850/0851/0853 | fresh audits and enhanced drafts | RFC-0855 plus proposed AMD-007 |

### 3.3 Program planning fixtures

The charter creates this exact tree:

```text
docs/plans/agent-runtime-certification/
  README.md
  program.yaml
  packet-template.md
  000-program-control-plane.md
  010-node-24.md
  020-canonical-identity-bytes.md
  030-canonical-diagnostic.md
  040-specification-reconciliation.md
  050-component-and-capability-contracts.md
  060-fiber-and-effect-runtime.md
  070-resolution-and-reconciliation.md
  080-reflection-and-conformance-harness.md
  090-isolation-contract.md
  100-certification-contracts-and-identities.md
  110-deterministic-evaluation.md
  120-forward-only-state-reset.md
  130-foundation-integration.md
  140-resolved-certification-profile.md
  150-authority-and-durable-storage.md
  160-certification-orchestration.md
  170-deterministic-site-producers.md
  180-independent-evaluators.md
  190-capability-artifact-and-sandbox.md
  200-evolution-controller.md
  210-deployment-effect-authority.md
  220-continuous-health-and-demotion.md
  230-combined-cutover.md
  240-cleanup.md
  completions/completion-template.json
  preparations/preparation-template.json
  recoveries/recovery-template.json
```

No empty placeholder directory or `.gitkeep` substitutes for a schema-shaped template.

### 3.4 Active and generated documentation

- Active instructions: root `AGENTS.md`, `packages/AGENTS.md`, and the closest package guides for Forge, Werkstatt, and Werkstatt Site.
- Semantic layer: `docs/architecture-dna.md` and all seven root Compass XML documents.
- Generated projections: RFC index, decision log, DNA trace, and ecosystem manifest. Regenerate from their owners; never hand-edit them.
- Audit/plan documents created by the established fo-skill pipelines remain governed artifacts and must be committed through canonical commands.

## 4. Role-to-RFC map and dependency rules

Create the seven non-spec RFCs in the following order. Capture the ID returned by each `rfc.create` invocation in a temporary role map used while editing subsequent documents. Do not persist symbolic IDs such as `<COMPONENT_RFC>` into any file.

| Role key | `rfc.create` title | Kind | Direct `dependsOn` after IDs resolve |
| --- | --- | --- | --- |
| `component_contracts` | Establish versioned component and capability contracts | contract | RFC-0855, RFC-0852 |
| `fiber_effect_runtime` | Establish the lifecycle fiber and effect runtime | architecture | `component_contracts` |
| `resolution_reconciliation` | Establish deterministic component resolution and reconciliation | architecture | `component_contracts`, `fiber_effect_runtime` |
| `reflection_conformance` | Establish runtime reflection and the conformance harness | contract | `resolution_reconciliation` |
| `isolation_contract` | Establish the provider-neutral isolation contract | contract | `component_contracts`, `reflection_conformance` |
| `capability_artifact_sandbox` | Establish capability artifacts and the first real sandbox | architecture | RFC-0848, `isolation_contract` |
| `evolution_controller` | Establish the governed capability evolution controller | architecture | `capability_artifact_sandbox` |

Rules for all seven drafts:

- `batch: agent-runtime-certification-program`;
- `status: draft`, `reviewers: []`, no `implementedAt` or `closedAt`;
- `related` may cite RFC-0855, RFC-0856, RFC-0857, AMD-007, or qualified spec nodes, but must not duplicate `dependsOn`, `amends`, or `satisfies`;
- `commands.changed` remains empty unless the RFC proposes an actual future command-source change; proposed future commands belong in `commands.proposed`;
- complete context, problem, decision, contracts, ownership, output, failures, rollout, alternatives, risks, acceptance criteria, and weak-agent notes; no `TODO`, `TBD`, `NEEDS CLARIFICATION`, or generic file glob that grants repository-wide mutation;
- explain the Law Kernel boundary, release/capability candidate separation, four effect classes, no in-process untrusted code, and no compatibility path wherever relevant;
- validate each RFC immediately after filling it, before creating the next one.

CERT-backed RFCs are deliberately absent from this table. Their packet drafts use stable qualified spec references, and their repository RFCs are created only through the RFC-0857 JIT protocol.

## 5. Step sequence

### Step 0. Establish a clean, immutable baseline

**Goal:** Prove the charter starts from the accepted decision graph and a clean repository.

**Agent actions:**

1. Read RFC-0855, RFC-0856, RFC-0857, RFC-0848 through RFC-0854, RFC-0396, RFC-0397, DNA-51/52/53/55/59/64/65/73, the accepted certification overview/roadmap/ADRs, all effective amendments, and the root/package instruction files in scope.
2. Locate the committed `PLAN-RFC-0856-01` implementation plan. Require it to cite RFC-0857 and to define generic qualified spec-node resolution, packet-040 amendment status progression (`proposed` draft → human-accepted pre-seal boundary), the phase-aware preparation lease, preparation reports, descendant-range sealing, and recovery. If it is absent or incomplete, finish and commit that plan before starting RFC-0855 implementation.
3. Record the starting branch and commit with `git branch --show-current` and `git rev-parse HEAD`; require branch `program/agent-runtime-certification-cutover`.
4. Run the baseline checks below and save their exact command/result summary in working notes for later acceptance evidence.
5. Confirm no active mission workpiece or cache clone is dirty through the repository clean-tree script.

**Validation:**

```sh
rtk git status --short --branch
rtk pnpm exec werkstatt run rfc.validate --id RFC-0855 --json
rtk pnpm exec werkstatt run rfc.validate --id RFC-0856 --json
rtk pnpm exec werkstatt run rfc.validate --id RFC-0857 --json
rtk pnpm exec werkstatt run spec.validate --spec=werkstatt-release-certification --json
rtk bash scripts/check-clean-trees.sh
```

Only the already-known reciprocal-metadata warnings may exist at baseline: V-19 for RFC-0855/RFC-0856 missing `amendedBy: RFC-0857`, and V-12 for RFC-0769/RFC-0770 missing `supersededBy: RFC-0855`. No other non-pass result is allowed.

**Completion criterion:** The branch, HEAD, decision statuses, accepted spec, and clean trees are known, and every baseline diagnostic is either pass or one of the relationship gaps this plan removes.

**Human review:** No. RFC-0855 and RFC-0857 already contain the required human decisions.

---

### Step 1. Reconcile reciprocal authority and successor DNA

**Goal:** Make the accepted RFC graph and active invariant wording tell one truth before creating downstream drafts.

**Agent actions:**

1. Add `RFC-0857` to `amendedBy` in RFC-0855 and RFC-0856. Do not change either accepted design body.
2. Inspect the current canonical locations of RFC-0769 and RFC-0770. Set `supersededBy: RFC-0855`, `status: superseded`, `updatedAt` and `closedAt` to the implementation date; preserve their existing `implementedAt` and human reviewer metadata and do not rewrite their historical decisions.
3. Run `pnpm exec forge docs.archive --dry-run --status=superseded`, then `pnpm exec forge docs.archive --status=superseded` so both RFCs occupy their canonical terminal archive location. Do not move files manually.
4. Revise DNA-64 in `docs/architecture-dna.md`: preserve the stack-agnostic engine, exactly one stack-profile identity per workshop, consumer-workshop model, package ownership, and engine-to-stack dependency inversion; replace “exactly one plugin” with “exactly one stack profile resolves one immutable graph of independently lifecycle-managed components.” Record RFC-0769 as superseded and RFC-0855 as the carrying authority.
5. Regenerate the RFC index, decision log, and DNA trace after the hand-authored relationships are valid.

**Validation:**

```sh
rtk pnpm exec forge docs.archive --dry-run --status=superseded
rtk pnpm exec forge docs.archive --status=superseded
rtk pnpm exec werkstatt run rfc.validate --id RFC-0855 --json
rtk pnpm exec werkstatt run rfc.validate --id RFC-0856 --json
rtk pnpm exec werkstatt run rfc.validate --id RFC-0769 --json
rtk pnpm exec werkstatt run rfc.validate --id RFC-0770 --json
rtk pnpm exec werkstatt run rfc.index.generate --write
rtk pnpm exec werkstatt run rfc.decision-log.generate
rtk pnpm exec werkstatt run rfc.dna.trace.generate
rtk pnpm exec werkstatt run rfc.index.validate
rtk pnpm exec werkstatt run rfc.dna.trace.validate
rtk pnpm exec werkstatt run dna.registry.validate
```

**Completion criterion:** All reciprocal edges resolve, superseded RFCs are canonically archived, DNA-64 has one successor meaning, and all relationship projections validate.

**Human review:** Yes. Before the step commit, compare the exact DNA-64 replacement and supersession diff with the narrow carry-forward contract in RFC-0855. This is verification of an accepted decision, not a new acceptance vote.

---

### Step 2. Author proposed AMD-007 without changing the snapshot

**Goal:** Prepare the exact certification-seam reconciliation needed by packet 040 while preserving the explicit later acceptance boundary.

**Agent actions:**

1. Use the amendment naming and frontmatter pattern from AMD-006. Create `amd-007-<descriptive-slug>.md` under the specification's `amendments/` directory with schema `forge/spec-amendment@1`, `id: AMD-007`, `status: proposed`, `reviewers: []`, and exact targets.
2. State the prior rule and replacement rule explicitly. Cover:
   - one static active plugin becomes one active stack profile resolving versioned producer/evaluator/adapter capabilities from an exact component set;
   - `resolvedComponentSetHash` binds runtime-sensitive policy, release candidate, evidence, decision, and authority data;
   - `ReleaseCandidate` and `CapabilityCandidate` remain distinct over shared primitives;
   - producer/evaluator execution routes through lifecycle-owned capabilities;
   - roadmap execution is strictly sequential and CERT-009 is the combined runtime/certification cutover;
   - ADR-001 through ADR-020 and AMD-001 through AMD-006 remain effective except where AMD-007 names a direct contradiction.
3. State that evaluator model/provider output is untrusted data, while executable untrusted artifacts stay disabled until the real sandbox packet.
4. Do not edit snapshot files or `forge-spec.yaml`; proposed AMD-007 has no `materializedAs` effect.

**Validation:**

```sh
rtk pnpm exec werkstatt run spec.validate --spec=werkstatt-release-certification --json
rtk git diff -- docs/specs/werkstatt-release-certification
```

The diff must contain only the new amendment file.

**Completion criterion:** AMD-007 is complete, proposed, internally traceable, and the immutable specification validates unchanged.

**Human review:** Yes. Review semantic precision and absence of accidental acceptance. Do not change `status: proposed` in this charter.

---

### Step 3. Create the seven non-spec child RFC drafts

**Goal:** Replace broad future responsibilities with bounded, independently governable decision documents before packet drafting.

**Agent actions:**

1. Invoke `fo-idea` sequentially for the seven bounded decisions in section 4. Let it classify and route each decision through `fo-idea-create-rfc`, which must invoke `rfc.create` with the declared title/kind, `--scope workspace`, and applicable DNA identifiers. Capture each returned path and ID.
2. Fully author and validate the first RFC before invoking `rfc.create` for the next. Fill exact IDs into later `dependsOn` fields; never use placeholders.
3. Make responsibility boundaries mutually exclusive:
   - contracts define immutable schemas and identity only;
   - fiber/effect runtime owns lifecycle execution and effect unwinding;
   - resolution/reconciliation owns deterministic graph selection and desired-state transition;
   - reflection/conformance owns read-only catalog and test-only trusted fixtures;
   - isolation owns provider-neutral admission and adversarial contract, not a production provider;
   - capability artifact/sandbox owns immutable artifact storage and first certified real provider;
   - evolution controller owns the promotion/demotion state machine, not certification authority internals.
4. Run `fo-idea-audit` then `fo-idea-enhance` for each draft, one RFC at a time. Resolve every blocking or major finding before proceeding. Do not accept any child RFC.
5. After all seven exist, construct a responsibility matrix showing every RFC-0855 packet has exactly one governing decision and no two child RFCs own the same state transition, authority, schema, command, or filesystem surface.

**Validation:**

```sh
rtk pnpm exec werkstatt run rfc.validate --id <actual-id> --json
```

Run the command after creation and again after audit/enhance for each actual ID. Then run:

```sh
rtk pnpm exec werkstatt run rfc.validate --json
```

**Completion criterion:** Seven and only seven new non-spec drafts exist; every draft is audit-enhanced, dependency-resolved, batch-bound, individually valid, and responsibility-disjoint.

**Human review:** Yes. Review the seven-document responsibility matrix and dependency graph. Leave all seven RFCs in `draft` for later explicit acceptance.

---

### Step 4. Re-audit and enhance the retained certification/foundation RFCs

**Goal:** Preserve useful prior work while making it consistent with the new component graph and linear authority order.

**Agent actions:**

1. Process RFC-0853, RFC-0850, RFC-0851, and RFC-0848 in this exact order. For each, run a fresh `fo-idea-audit`, apply `fo-idea-enhance`, validate, inspect the full diff, and commit before moving to the next.
2. RFC-0853: bind strict contracts to `ResolvedComponentSet`, add release/capability candidate separation, and depend directly on the new isolation/component-contract chain as needed. Do not implement schemas.
3. RFC-0850: preserve deterministic bounded evaluation and action packs, but route evaluator inputs/outputs through admitted lifecycle capabilities and treat external evaluator output as untrusted data.
4. RFC-0851: preserve forward-only reset and artifact/operation separation, add the direct RFC-0850 dependency, and enumerate only transition diagnostics that later packets retire.
5. RFC-0848: integrate the new runtime identity, certification identity, evaluation, and state contracts through public APIs. Keep its CERT-001 `specRef`; do not create a replacement CERT-001 RFC.
6. Do not duplicate or semantically rewrite RFC-0854, RFC-0849, or RFC-0852. Relationship-only additions are allowed only if the new direct graph requires them and validation proves no duplicate metadata.

**Validation:**

```sh
rtk pnpm exec werkstatt run rfc.validate --id RFC-0853 --json
rtk pnpm exec werkstatt run rfc.validate --id RFC-0850 --json
rtk pnpm exec werkstatt run rfc.validate --id RFC-0851 --json
rtk pnpm exec werkstatt run rfc.validate --id RFC-0848 --json
rtk pnpm exec werkstatt run spec.validate --spec=werkstatt-release-certification --json
```

**Completion criterion:** All four retained RFCs have fresh audit evidence and enhanced drafts consistent with RFC-0855/0857 and proposed AMD-007, while the three no-regret RFCs remain single authorities for their responsibilities.

**Human review:** Yes. Review that enhancement does not imply AMD-007 acceptance or child RFC implementation. All four remain `draft`.

---

### Step 5. Define the program manifest and reusable record templates

**Goal:** Create truthful pre-implementation fixtures for RFC-0856 without pretending its runtime schemas or commands already exist.

**Agent actions:**

1. Require the committed implementation plan for accepted RFC-0856 to exist and to incorporate RFC-0857's qualified-reference and preparation-range rules. If it does not exist or contradicts RFC-0857, stop before creating packet 000 and complete the RFC-0856 planning pipeline first. Do not improvise the bootstrap contract inside RFC-0855 implementation.
2. Create `program.yaml` as one `forge/program@1` manifest with:
   - `programRfc: RFC-0855`;
   - branch `program/agent-runtime-certification-cutover`;
   - state `preparing`;
   - current packet `000-program-control-plane`;
   - exactly 25 packet entries in orders 000 through 240;
   - each packet `state: draft`, `baseCommit: null`, and no seal/completion identity;
   - exact path, predecessor packet, governing decision, and `resolvedRfc` projection (`null` only for unmaterialized CERT nodes).
3. Use actual RFC IDs for packets 000, 010, 020, 030, 050–130, 190, and 200. RFC-0856 is already `accepted`; never downgrade it to `draft` to satisfy older charter wording. Packet 040 uses `governingDecision: werkstatt-release-certification/AMD-007`, `decisionKind: spec-amendment`, and `resolvedRfc: null`; an amendment is not projected to a repository RFC. Use only these stable governing references for CERT-backed packets:

```text
140 -> werkstatt-release-certification/CERT-002
150 -> werkstatt-release-certification/CERT-003
160 -> werkstatt-release-certification/CERT-004
170 -> werkstatt-release-certification/CERT-005
180 -> werkstatt-release-certification/CERT-006
210 -> werkstatt-release-certification/CERT-007
220 -> werkstatt-release-certification/CERT-008
230 -> werkstatt-release-certification/CERT-009
240 -> werkstatt-release-certification/CERT-010
```

Repository-RFC entries project their actual RFC ID. CERT-node entries use `decisionKind: spec-node` and `resolvedRfc: null` until canonical JIT materialization. Never overload `resolvedRfc: null` to mean an unknown decision: `governingDecision`, `decisionKind`, and observed decision status must always be explicit.

4. Create strict JSON templates for completion, preparation, and recovery. Use syntactically valid schema-shaped example values that are explicitly marked as templates by file role, not prose placeholders inside live packet data.
5. The preparation template must record `baseCommit`, canonical preparation commits/head, exact changed files, stable governing reference, resolved RFC, materialization commit, validation evidence digests, clean-tree result, and Steward identity.
6. The recovery template must record prior lease digest, phase, observed head, completed governance stages, discovered reciprocal spec/RFC pair, reason, actor, and continuation target. It must forbid deletion, reset, rebase, or silent restart.
7. Create README as a human projection of the manifest: role separation, three committed boundaries, one phase-aware lease, JIT governance range, packet 000 bootstrap, exact program order, operational-unavailability policy, and no self-authorization.

**Validation:**

- Parse YAML and all JSON templates with the repository's installed parsers.
- Compare README order and names mechanically with `program.yaml`.
- Confirm the manifest contains 25 unique IDs and one linear predecessor chain.
- Confirm no blocked CERT node has a repository RFC ID.

**Completion criterion:** The manifest and record templates are parseable, internally consistent RFC-0856 fixtures and fully incorporate RFC-0857's preparation phase.

**Human review:** Yes. Review the complete manifest as the only permitted execution order. This does not seal packet 000 or start the program.

---

### Step 6. Author the packet template and all 25 packet drafts

**Goal:** Give a fresh weaker agent a bounded, decision-complete execution document for every program responsibility.

**Agent actions:**

1. Write `packet-template.md` with strict `forge/program-packet@1` frontmatter and these body sections in this exact order:
   1. objective and explicit non-goals;
   2. prerequisite decision status, branch, base commit, and program-state checks;
   3. mandatory reads with exact normative anchors;
   4. current code facts with verified paths and symbols;
   5. allowed and forbidden file boundaries;
   6. ordered implementation steps without hidden branches;
   7. exact validations with expected status and diagnostic counts;
   8. permitted transition diagnostics and the packet that eliminates each;
   9. rollback/recovery from the last canonical commit;
   10. seal/implementation/completion commit protocol, completion-report shape, and handoff gate.
2. Create all 25 named packets from section 3.3. Each packet frontmatter must contain:
   - exact packet ID, state `draft`, program `RFC-0855`, branch, Steward, predecessor, and governing decision;
   - `baseCommit: null` for future drafts;
   - non-empty exact `normativeSources` with SHA-256 of the current committed blob bytes;
   - a narrow non-empty `allowedFiles` set and explicit `forbiddenFiles`;
   - a closed `permittedTransitionDiagnostics` list;
   - exact required validation commands with `expectedStatus: pass` and explicit expected diagnostics.
3. Derive every normative hash from the committed source blob, not copied prose. Use a single documented SHA-256 procedure and lowercase 64-hex output.
4. For packets 140–240 governed by CERT nodes, include the entire RFC-0857 JIT preparation protocol before sealing: predecessor completion, front verification, one preparation lease, `spec.materialize`, audit, enhance, plan, explicit acceptance, deterministic dependency derivation, hash/fact refresh, tracked preparation report, descendant-range validation, seal commit, preparation-lease release, then distinct Executor lease.
5. For the seven non-spec child packets, use the actual RFC IDs created in step 3. Packet 040 uses the exact `werkstatt-release-certification/AMD-007` reference. Its draft accepts only observed amendment status `proposed`. After packet 030 completion, a human Steward acquires the packet's preparation lease at the predecessor base, performs and canonically commits the explicit amendment acceptance, and seals with a preparation report covering that descendant governance range; sealed validation requires status `accepted`. The preparation allow-list contains only AMD-007, amendment-owned effective projections, packet/manifest/preparation artifacts, and owner-generated RFC/spec projections—never source code. A distinct Packet Executor then validates the accepted effective spec/roadmap and produces the completion range. Charter implementation never performs this preparation.
6. Packet 000 alone documents the accepted RFC-0856 plan commit as bootstrap seal authority and genesis completion. Every later packet explicitly rejects bootstrap.
7. Packets 010–240 must prohibit Executor mutation of the packet, manifest, allow-list, governing RFC, preparation report, lease recovery, or completion report.
8. Enumerate transition diagnostics narrowly. An empty list is preferred when the packet must be fully green. Every non-empty entry must name the later packet that removes it. Generic “build broken,” wildcard diagnostic IDs, and prose exceptions are invalid.
9. Give each packet a recovery path appropriate to its effect class. Documentation-only changes may use `not-applicable` only with evidence; runtime/state mutations require verified revert, abort, compensation, rollback, or quarantine steps.
10. Do not seal packets, acquire leases, write live completion/preparation/recovery records, or change program state. These are draft fixtures only.

**Packet matrix:**

| Order | Packet | Governing decision | Draft completion boundary |
| --: | --- | --- | --- |
| 000 | program control plane | RFC-0856 | control-plane suite and one-time genesis import defined |
| 010 | Node 24 | RFC-0854 | ecosystem cutover and site smoke defined |
| 020 | canonical identity bytes | RFC-0849 | frozen vectors, bounds, bytes, hashes defined |
| 030 | canonical Diagnostic | RFC-0852 | strict engine/site Diagnostic cutover defined |
| 040 | specification reconciliation | AMD-007 | explicit amendment acceptance plus spec validation required |
| 050 | component/capability contracts | actual child ID | schemas, identities, bounds, negative fixtures defined |
| 060 | fiber/effect runtime | actual child ID | lifecycle/effect state suite defined |
| 070 | resolution/reconciliation | actual child ID | deterministic graph and rollback suite defined |
| 080 | reflection/conformance | actual child ID | filtered catalog and test-only fixture suite defined |
| 090 | isolation contract | actual child ID | adversarial provider-neutral contract suite defined |
| 100 | certification contracts | RFC-0853 | resolved-set identity and candidate separation defined |
| 110 | deterministic evaluation | RFC-0850 | bounded algebra and action-pack suite defined |
| 120 | state reset | RFC-0851 | truthful forward-only transition defined |
| 130 | foundation integration | RFC-0848 | public-API integration suite defined |
| 140 | resolved certification profile | CERT-002 | JIT RFC plus invalid-graph rejection defined |
| 150 | authority/storage | CERT-003 | signed authority and durable storage failures defined |
| 160 | orchestration | CERT-004 | lifecycle capability execution and resume defined |
| 170 | site producers | CERT-005 | admitted first-party producer graph defined |
| 180 | independent evaluators | CERT-006 | isolated evaluator data path and non-pass cases defined |
| 190 | artifact/sandbox | actual child ID | immutable artifacts and real sandbox suite defined |
| 200 | evolution controller | actual child ID | four-layer promotion, rollback, quarantine defined |
| 210 | deployment authority | CERT-007 | signed effect authorization and compensation defined |
| 220 | health/demotion | CERT-008 | deterministic health and incident response defined |
| 230 | combined cutover | CERT-009 | one runtime/certification cutover and proven rollback defined |
| 240 | cleanup | CERT-010 | plan-bound deletion evidence and retained audit defined |

**Validation:**

Before RFC-0856 exists in code, run one read-only TypeScript validation process against the checked-in fixtures as `pnpm exec tsx -e '<validator>'`. Use `tsx` so the workspace-installed `yaml` package resolves through pnpm; plain `node --input-type=module -e` is not sufficient in this workspace. The command must not create a script or source file and must fail unless all of these predicates hold:

- the manifest parses as YAML and names exactly 25 unique packet paths;
- numeric order is exactly `000, 010, ..., 240`;
- every path exists and frontmatter parses;
- packet ID/path/order and predecessor chain agree with the manifest;
- every packet is `draft` with `baseCommit: null`;
- required arrays exist and `allowedFiles`, `forbiddenFiles`, `normativeSources`, and `requiredValidations` are non-empty;
- every source path exists and every SHA-256 is lowercase 64-hex and equals current bytes;
- CERT packet governing references equal the nine qualified values above and have no invented RFC projection;
- no content contains `NEEDS CLARIFICATION`, `TODO`, `TBD`, `RFC-XXXX`, unbounded `**/*`, self-widening permission, compatibility path, parallel execution, or early production activation;
- completion, preparation, and recovery templates parse and contain every field required by RFC-0856 plus RFC-0857.

Record the exact inline command and its pass output in README so packet 000 can convert the real packet set into permanent automated fixtures. Do not describe this pre-implementation check as `program.packet.validate`; that command does not exist yet.

**Completion criterion:** All 25 drafts and four shared artifacts pass the one-off structural/hash validator, contain no unresolved decision, and form one linear non-executable preparation set.

**Human review:** Yes. Review packet 000 in full, one representative ordinary RFC packet, packet 040, one JIT CERT packet, packet 190, packet 230, and packet 240; then spot-check the remaining matrix against the mechanical validation report.

---

### Step 7. Synchronize active agent guidance and Compass truth

**Goal:** Ensure a weaker agent encounters the program laws before any package-local implementation instruction.

**Agent actions:**

1. Root `AGENTS.md`: add the active program branch, strictly sequential packet rule, Steward/Executor separation, permitted temporary operational unavailability, bounded-diagnostic rule, Law Kernel boundary, JIT CERT governance, and prohibition on self-sealing/self-authorization.
2. `packages/AGENTS.md`: define cross-package ownership, one resolved graph authority, lifecycle-owned registrations/effects, and no dual plugin/component authority.
3. `packages/forge/AGENTS.md`: define generic `forge/program@1` control-plane ownership, qualified spec-node lookup by repository data rather than CERT-specific parsing, phase-aware leases, and cross-platform constraints.
4. `packages/werkstatt/AGENTS.md`: define engine-owned resolved component graph, lifecycle/effect/runtime ownership, protected Law Kernel, and no compatibility registry.
5. `packages/werkstatt-site/AGENTS.md`: define the stack profile as component selection/composition, not a second runtime authority. Do not add site-specific runtime logic.
6. `packages/werkstatt-game/AGENTS.md` and `packages/werkstatt-video/AGENTS.md`: record the same stack-profile/component-selection boundary without claiming that these stacks participate in the sole-site certification cutover.
7. Update Compass documents from their owning semantics:
   - `requirements.xml`: authority-first outcome, no self-approval, one combined cutover, bounded unavailability;
   - `technology.xml`: Law Kernel, component graph, lifecycle/effects, sandbox boundary, release/component-set binding;
   - `development-plan.xml`: exact 000–240 linear rollout and JIT CERT governance;
   - `knowledge-graph.xml`: RFC-0855/0856/0857, AMD-007, DNA-64, child-RFC roles, and spec-node relationships;
   - `verification-plan.xml`: packet hashes, roles, leases, ancestry, diagnostic exactness, certification and rollback evidence;
   - `source-markup.xml`: ownership and source-header expectations for future Law Kernel/component/control-plane modules;
   - `styling.xml`: a reviewed no-change record explaining that the charter changes no visual or token contract.
8. Preserve each XML vocabulary and local schema. Do not invent element names without checking adjacent valid entries.

**Validation:**

```sh
rtk pnpm exec werkstatt run compass.validate
rtk pnpm exec werkstatt run dna.registry.validate
rtk pnpm exec werkstatt run rfc.dna.trace.generate
rtk pnpm exec werkstatt run rfc.dna.trace.validate
```

**Completion criterion:** Root and nearest package guidance expose the same authority model, all Compass contracts validate, and styling contains only the explicit no-change rationale.

**Human review:** Yes. Review instruction strength and confirm no wording authorizes implementation outside a sealed packet.

---

### Step 8. Regenerate projections and run the charter validation gate

**Goal:** Prove all hand-authored documents agree with their generated repository views.

**Agent actions:**

1. Regenerate RFC index, decision log, DNA trace, and ecosystem manifest from their owning commands.
2. Do not run `command.manifest.generate`; record “not applicable — RFC-0855 changes no command source” in the plan execution evidence.
3. Run the full validators below. Treat every unexpected warning as a defect. The only permitted future runtime diagnostics belong inside packet drafts; they are not exceptions to charter validation.
4. Inspect `git diff` for every touched file, including unstaged changes, before committing. Confirm generated diffs are explained by owner-source changes.

**Validation:**

```sh
rtk pnpm exec werkstatt run rfc.index.generate --write
rtk pnpm exec werkstatt run rfc.decision-log.generate
rtk pnpm exec werkstatt run rfc.dna.trace.generate
rtk pnpm exec werkstatt run ecosystem.manifest.generate
rtk pnpm exec werkstatt run rfc.index.validate
rtk pnpm exec werkstatt run rfc.dna.trace.validate
rtk pnpm exec werkstatt run ecosystem.manifest.validate
rtk pnpm exec werkstatt run compass.validate
rtk pnpm exec werkstatt run dna.registry.validate
rtk pnpm exec werkstatt run spec.validate --spec=werkstatt-release-certification --json
rtk pnpm exec werkstatt run rfc.validate --json
rtk pnpm exec forge pinned.validate --json
rtk bash scripts/check-clean-trees.sh
```

Run the one-off program-fixture validator from step 6 again after all documentation changes.

RFC-0855 has no acceptance probes. Therefore `rfc.acceptance.run` and `rfc.verification.emit` are explicitly not applicable and must not be run or used to fabricate a verification artifact.

**Completion criterion:** Every validator passes, all generated projections are current, the program fixture validator passes, and no undeclared evidence artifact exists.

**Human review:** No additional decision. Failures are repaired before review.

---

### Step 9. Review, fix, and verify acceptance evidence

**Goal:** Subject the complete charter diff to an independent standards review and convert each RFC-0855 criterion into reproducible evidence.

**Agent actions:**

1. Invoke `fo-review` on the complete documentation diff from the charter implementation base commit through current HEAD. The review must cover DNA alignment, forward-only policy, spec immutability, JIT materialization, agent clarity, exact paths, relationship metadata, generated projections, and absence of source changes.
2. If findings exist, invoke `fo-fix`, inspect the full diff, re-run the scoped validation gate, and re-run `fo-review`. Stop after at most three cycles and escalate any unresolved finding rather than suppressing it.
3. Invoke `fo-doc-audit` so active instructions, Compass, DNA, templates, and generated projections are checked against the actual charter diff.
4. For each RFC-0855 acceptance checkbox, collect inline `(evidence: ...)` containing exact files and commands. Evidence must reference the actual resulting paths and actual new child RFC IDs.
5. Verify RFC-0857 acceptance criteria affected by this charter. Leave RFC-0857 `accepted`; this plan does not stamp it because its RFC-0856 planning and runtime control-plane criteria are not all implemented here.
6. Verify AMD-007 and all child/retained RFCs remain proposed/draft as required. No human status transition may be inferred from a passing review.

**Validation:**

```sh
rtk git diff <charter-base-commit>...HEAD --stat
rtk git diff <charter-base-commit>...HEAD -- docs packages/AGENTS.md packages/*/AGENTS.md AGENTS.md
rtk pnpm exec werkstatt run rfc.validate --id RFC-0855 --json
rtk pnpm exec werkstatt run rfc.validate --id RFC-0857 --json
rtk bash scripts/check-clean-trees.sh
```

**Completion criterion:** The final review has no unresolved finding; all 11 RFC-0855 criteria are checked with inline evidence; RFC-0857 is truthfully left accepted; AMD-007 and child RFCs retain non-authorizing statuses.

**Human review:** Yes. Review the final packet set, the review/fix report, and the evidence annotations before stamping RFC-0855.

---

### Final Step. Commit boundaries and RFC-0855 implementation stamp

**Goal:** Persist the charter through canonical, auditable commits and perform the sole authorized status transition.

**Agent actions:**

1. Use small semantic `ecosystem.commit` boundaries throughout implementation. At minimum keep these responsibilities distinguishable:
   - reciprocal RFC supersession, DNA-64, and AMD-007;
   - seven new child RFCs and their audit/enhance documents;
   - retained RFC audits/enhancements;
   - program manifest/templates/25 packets;
   - AGENTS/Compass/generated projection synchronization;
   - review fixes and RFC-0855 acceptance evidence.
2. Before every commit, inspect `git diff` and `git diff --cached`; stage only the files owned by that boundary. After every commit, run `git status` and resolve all remaining session changes.
3. Ensure the implementation commit named for stamping references `RFC-0855` and contains the checked acceptance-evidence annotations.
4. Run the stamp dry-run, then the real atomic stamp. Never hand-edit `status`, `implementedAt`, or `updatedAt` for the implemented transition.
5. Commit the stamp mutation through `ecosystem.commit` as a separate documentation commit.
6. After the stamp commit, invoke `fo-doc-audit` again as required by the RFC implementation protocol. Commit any resulting owner-document or regenerated-projection changes through `ecosystem.commit`, then re-run the full documentation validation gate. If the audit produces no diff, record that result explicitly.
7. Do not archive RFC-0855 or this plan in this implementation turn. Archiving is a later explicit lifecycle action after the broader pipeline requires it.

**Validation:**

```sh
rtk pnpm exec werkstatt run rfc.implement.stamp --id RFC-0855 --implementation-commit <implementation-sha> --dry-run
rtk pnpm exec werkstatt run rfc.implement.stamp --id RFC-0855 --implementation-commit <implementation-sha>
rtk pnpm exec werkstatt run ecosystem.commit --message="docs: stamp RFC-0855 authority-first program implemented" --rfc RFC-0855
# Invoke fo-doc-audit here; commit any resulting files canonically.
rtk pnpm exec werkstatt run rfc.validate --id RFC-0855 --json
rtk pnpm exec werkstatt run rfc.validate --json
rtk pnpm exec werkstatt run spec.validate --spec=werkstatt-release-certification --json
rtk pnpm exec werkstatt run compass.validate
rtk pnpm exec werkstatt run ecosystem.manifest.validate
rtk pnpm exec forge pinned.validate --mode ci --json
rtk git status --short --branch
rtk bash scripts/check-clean-trees.sh
```

**Completion criterion:** RFC-0855 is atomically `implemented`; all other decisions retain their intended statuses; the charter and program fixtures are committed; all trees are clean; packet 000 remains unsealed and unexecuted.

**Human review:** No new architectural vote. The operator already accepted RFC-0855; the stamp is permitted only after the explicit final evidence review in step 9.

## 6. Validation suite and evidence

### 6.1 Required gates

| Gate | Required result | Evidence |
| --- | --- | --- |
| RFC validation | all RFCs pass; no unresolved reciprocal dependency | JSON command output plus generated index |
| Spec integrity | accepted snapshot and proposed AMD-007 validate; snapshot diff empty | `spec.validate` and path-scoped diff |
| Program fixture structure | 25 packets, exact order, exact hashes, no placeholders | recorded one-off validator command/output |
| Compass/DNA | all semantic projections validate | validator outputs and DNA trace |
| Generated projections | no ecosystem/RFC index drift | owner-command output and clean validation |
| Review/fix | final `fo-review` has no unresolved finding | committed review report |
| Acceptance evidence | every RFC-0855 checkbox is checked with inline evidence | RFC diff and stamp dry-run |
| Repository hygiene | monorepo, missions, and mirrors are clean | `scripts/check-clean-trees.sh` |

### 6.2 Evidence artifacts

- Proposed AMD-007.
- Seven actual child RFC files plus their audit/enhance artifacts.
- Fresh audit/enhance artifacts for RFC-0848/0850/0851/0853.
- `docs/plans/agent-runtime-certification/**`, including the recorded fixture-validation command.
- Updated AGENTS, DNA, Compass, RFC index/decision/DNA projections, and ecosystem manifest.
- Final review report and any fix commits.
- Inline acceptance evidence in RFC-0855 and the reachable RFC-0855 implementation commit.

There is no RFC-0855 generated acceptance-probe evidence file because the RFC declares no probes.

## 7. Risk controls

| Risk | Control in this plan |
| --- | --- |
| Premature CERT materialization | steps 2, 5, and 6 use qualified spec refs and forbid `spec.materialize` |
| Wrong or duplicate child responsibility | section 4 role map, sequential creation, per-RFC audit, final responsibility matrix |
| Prepared packet drift | exact committed-source SHA-256 plus mandatory JIT refresh before sealing |
| Weak agent invents missing decisions | fixed body order, exact reads/facts/files/commands, and placeholder scanner |
| Two simultaneous authorities | DNA/AGENTS synchronization and explicit no-compatibility boundaries |
| Self-approval or self-sealing | distinct Steward/Executor instructions and phase-aware lease preparation |
| False green during outage | only stable enumerated diagnostics; all charter validators remain hard-pass |
| Immutable spec corruption | path-scoped diff and `spec.validate`; AMD-only mutation |
| Generated-document drift | owner generators followed by dedicated validators |
| Partial commit or missed unstaged fix | full diff before commit, status after commit, final clean-tree script |
| Stamping the wrong RFCs | only RFC-0855 is stamped; RFC-0857, child RFCs, retained RFCs, and AMD-007 remain non-terminal |

## 8. Escalation triggers

Stop mutation and return to architecture governance if any of these occurs:

- a child responsibility cannot be isolated without changing the RFC-0855 packet order or Law Kernel boundary;
- effective spec dependencies and program order cannot both be represented without bypassing `spec.materialize`;
- AMD-007 needs to alter an immutable snapshot file or contradict an unnamed accepted ADR/amendment;
- a new external-effect class, isolation tier, Law Kernel capability, compatibility layer, or production activation path is required;
- a packet cannot be bounded to exact files, deterministic validations, and a recovery path;
- program fixture validation requires checked-in runtime code before packet 000;
- DNA-51/52/53/55/59/64/65/73 cannot remain simultaneously true;
- any canonical commit would include unrelated user changes or leave a touched file partially fixed.

For a DNA/RFC conflict, run `rfc.supersede.propose` with the exact invariant instead of weakening it locally. For a specification contradiction, use the amendment workflow. For an unclear packet, leave the program blocked; never persist `NEEDS CLARIFICATION` or grant the Executor authority to decide.

## 9. Deliberate non-actions

- No design summit: RFC-0855 is already human-accepted, and the operator requires strictly non-parallel work.
- No implementation of RFC-0856 or any child RFC.
- No packet sealing, lease acquisition, completion, recovery, or execution.
- No acceptance of AMD-007 or child RFCs.
- No CERT-002…CERT-010 materialization.
- No source or command-manifest changes.
- No deployment, site republish, mirror mutation, mission mutation, or provider call.
- No `rfc.acceptance.run` or `rfc.verification.emit` for RFC-0855.
