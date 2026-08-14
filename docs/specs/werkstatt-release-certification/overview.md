# Werkstatt Release Certification System

Status: authored specification snapshot  
Version: 1.0  
Scope: Werkstatt engine, stack plugin contract, site quality profile, release deployment, evidence storage, and continuous production health

## Executive summary

Werkstatt must be able to take a site from authored intent to a published production artifact without reporting readiness that it has not proved. The current ecosystem has many strong validators, test levels, evidence stores, and deployment guards, but no single fail-closed certification authority. Readiness is fragmented across `app.contract.full`, build pipelines, Axiom evidence, test evidence, Check Warpgogol, Nebula Score, release state, and deployment commands. Several of those surfaces can omit slow checks, skip when an artifact is unavailable, overwrite prior evidence, or translate missing evidence into a passing result.

This specification introduces a stack-agnostic Release Certification System. It binds every quality claim to one immutable release candidate, stores evidence in an append-only content-addressed dossier, evaluates a versioned plugin-owned certification profile, and makes the resulting gate decision the only authority for Dev, Alt, and Main transitions. The site plugin contributes the concrete quality profile and producers. Independent evaluator agents cover qualitative properties that deterministic validators cannot judge. Production remains continuously assessed after deployment through current health projections without rewriting the historical certification decision.

The first rollout targets the single `warpgogol-com` Sternsystem. It uses a clean republish rather than a compatibility layer. Existing production remains online until a fresh candidate completes the entire new pipeline. Legacy release and archived-mission payloads may be pruned only after the first new `main-certified` release and only through a separately implemented, audited cleanup command.

## Problem statement

### Fragmented readiness authority

The repository currently exposes multiple overlapping signals:

- `app.contract.full` calls itself the canonical deployment-readiness signal while explicitly excluding slow Lighthouse checks and omitting large portions of the live build pipelines.
- `SITES_CHECK_AUTHOR_PIPELINE`, post-build pipelines, Axiom, smoke, E2E, contract tests, and deployment preflights each enforce different subsets at different times.
- `check.run` captures a rendered evidence graph but currently reports that its report and action-pack phases are not implemented.
- `nebula.score.compute` can run before post-build and live evidence exists.
- `collectNebulaInputs` substitutes passing defaults when Lighthouse, accessibility, content, or DNA evidence is missing.
- `test.evidence.verify` currently maps missing, failed, or commit-mismatched evidence to `pass` during a calendar grace period.
- test evidence uses one mutable file per level, so a later run overwrites the earlier record and erases environment history.
- deployment state and readiness state are conflated, while current Compass/DNA descriptions contain incompatible historic state vocabularies.

The result is an epistemic failure: the system cannot always distinguish “the site passed”, “the site failed”, “the evidence is stale”, and “the system could not check”. This specification makes those states explicit and consequential.

### Quality beyond structural validation

The site plugin has extensive deterministic coverage for schemas, content, claims, SEO, accessibility primitives, generated ownership, mobile layout, Lighthouse, smoke, E2E, and operational contracts. However, a structurally valid site can still be unclear, generic, unconvincing, visually weak, internally inconsistent, or factually under-supported. The visual control system currently covers authored Tier-1 rules but explicitly excludes rendered-DOM and LLM visual judgement. A release-quality claim therefore requires a separate, read-only evaluator-agent role with a versioned rubric and evidence-bound output.

### Evidence durability and trust

DNA-52 already requires durable content-addressed release artifacts. DNA-59 already requires append-only durable Axiom evidence in R2. Those mechanisms do not yet form one certification dossier with a common envelope, producer identity, candidate binding, decision root hash, retention policy, and tamper verification. File location or a plausible-looking JSON document cannot be accepted as proof.

### Operational history growth

The current single-site estate contains approximately 11 GB under `releases/` across 34 release/staging directories and approximately 50 GB under `missions/archive/` across 47 archived missions. Historical context is useful, but full workpieces, heavy snapshots, and abandoned staging payloads are not all durable governance records. A post-cutover cleanup must retain compact audit history while removing redundant operational bulk.

## Goals

1. Establish exactly one authoritative, fail-closed readiness decision for each deployment transition.
2. Distinguish `pass`, `fail`, `incomplete`, and `stale` without treating absence or infrastructure failure as success.
3. Bind certification to an immutable candidate identity that includes source, content, build artifact, profile, configuration, and toolchain identities.
4. Preserve evidence and decisions as an append-only, content-addressed, tamper-evident dossier.
5. Keep the Werkstatt engine stack-agnostic while allowing exactly one active plugin to provide the concrete certification profile and evidence producers.
6. Cover deterministic technical quality and independent qualitative evaluation.
7. Make deployment orchestration automatic, idempotent, resumable, and impossible to bypass for new Alt/Main promotions.
8. Produce agent-ready remediation packs without allowing the certification process to mutate the judged artifact.
9. Verify Main transactionally and roll back only when rollback can remedy the observed failure.
10. Maintain a separate current production-health projection after the historical Main certification decision.
11. Roll out through one clean republish of `warpgogol-com`, with no generic legacy compatibility layer.
12. Provide a safe, auditable post-cutover cleanup path for obsolete release and mission payloads.

## Non-goals

- This specification does not implement any RFC node.
- It does not add a human approval gate; authoring, evaluation, and certification remain agent-operated.
- It does not make an LLM score the certification authority. The deterministic engine owns decisions.
- It does not replace the kernel command result envelope or canonical `Diagnostic[]` vocabulary.
- It does not replace the existing artifact store, fingerprint package, Axiom archive, Bordbuch, test pyramid, or deploy adapters. It composes and extends them.
- It does not preserve compatibility with old release evidence formats for promotion purposes.
- It does not support multi-site batch deployment; deployments remain per-site and per-release.
- It does not authorize deleting current source, Git/Bordbuch history, RFCs, ADRs, session transcripts, or active mission data.
- It does not authorize npm publication.

## Normative vocabulary

### Release candidate

An immutable candidate that may be certified and promoted. A candidate is not a branch, mission, mutable workpiece, URL, or site in general. Any bound identity change creates a different candidate.

### Certification profile

The versioned, declarative policy supplied by the active stack plugin. It enumerates requirements, applicability, gate placement, producers, evidence contracts, freshness, environment reuse, retries, qualitative risk routing, and drift reactions.

### Evidence envelope

The canonical engine-owned wrapper around one producer result. It binds the result to candidate, requirement, environment, inputs, producer version, time, payload hashes, diagnostics, and attestation.

### Dossier

The append-only logical collection of evidence, decisions, incidents, health projections, and retention tombstones for one candidate. Its identity is a root hash, not a path.

### Gate decision

An immutable evaluation for one candidate and one transition: `dev-deploy`, `propagate-alt`, or `promote-main`.

### Certification health

The current post-publication projection, separate from the historical gate decision. Values are `current`, `degraded`, and `revoked`.

### Evaluator agent

A separate read-only agent invocation with a clean context and versioned rubric. It emits qualitative evidence but cannot issue a gate decision and cannot mutate the candidate.

### Author agent

The agent that creates or repairs source/content. A product repair creates a new candidate and dossier.

### Certification engine

The deterministic stack-agnostic authority that validates profiles and evidence, persists dossiers, aggregates statuses, and authorizes deployment transitions.

## Governing principles

1. **Unknown is not green.** Missing, stale, malformed, unclassified, timed-out, or unavailable evidence never becomes success.
2. **Quality claims bind to immutable identity.** Evidence cannot float between candidates, policies, environments, or toolchains without an explicit reuse rule.
3. **Evaluation does not mutate its subject.** Certification produces evidence and remediation, never source fixes.
4. **History and health are separate.** Historical decisions remain immutable while current health changes through appended observations.
5. **The engine decides; plugins describe and produce.** Stack-specific policy does not duplicate the core lifecycle.
6. **No runtime waiver for required requirements.** False positives are fixed in producers or through a new normative profile version.
7. **Deployment is per-site, per-release, and sequential.** Dev, Alt, and Main are distinct evidence environments.
8. **Migration complexity follows the actual estate.** One replaceable site receives a clean cutover, not speculative legacy infrastructure.

## Target architecture

### Engine-owned components

The `@warpgogol/werkstatt` engine owns:

- candidate identity calculation and validation;
- core certification schemas and stable status vocabulary;
- profile schema and structural validation;
- evidence ingestion and producer registry validation;
- dossier append, hash-chain, integrity verification, and projections;
- storage adapter contract and durable replica enforcement;
- deterministic aggregation and gate decisions;
- certification commands, locking, idempotency, resume, and telemetry;
- deployment gate integration and state transitions;
- transactional Main verification and rollback coordination;
- continuous health projection, scheduling hooks, incidents, and retention;
- cleanup orchestration primitives for release/mission payloads.

### Plugin-owned components

The active `@warpgogol/werkstatt-site` plugin owns:

- the Site Certification Profile v1;
- mapping existing deterministic validators and tests to stable requirement IDs;
- site-specific evidence producers for content, business truth, SEO, UX, accessibility, performance, security, and runtime behavior;
- rendered evidence capture and qualitative evaluator integration;
- site-specific applicability and risk routing;
- site-specific repair guidance and verification commands;
- Cloudflare Workers deploy adapter capabilities such as isolated slot verification where supported.

The implementation must first determine whether the existing closed `checkGate` and `releaseEvidence` hooks can express these contributions. If the contract is insufficient, the relevant RFC must explicitly supersede the hook contract. An ad hoc sixth hook is forbidden.

### Existing systems reused

- `@warpgogol/fingerprint` remains the only hash implementation.
- DNA-52 artifact store remains the durable source for release artifacts.
- DNA-59 evidence storage remains the basis for the current R2 adapter.
- DNA-66 test levels remain the test taxonomy.
- Canonical `Diagnostic[]` remains the finding vocabulary.
- Bordbuch records lifecycle and incident events but is not the binary evidence store.
- Existing deploy adapters perform channel-specific deployment; certification authorizes transitions.
- Existing release and operation locks are reused or extended through DNA-51 consistency primitives.

## End-to-end lifecycle

### Authoring

The author agent works in a mission workpiece. Certification may report `incomplete`; no release candidate exists until immutable identity inputs are available. Author-time checks remain useful early feedback but are not themselves a deployment certificate.

### Candidate creation and Dev gate

`release.prepare` and the artifact store produce an immutable candidate identity. `release.certify --gate=dev-deploy` evaluates all pre-deploy requirements: identity, provenance, build, schema, business truth, authored content, and static safety. A `pass` permits Dev deployment. Runtime evidence is not required before the environment needed to produce it exists.

### Dev evidence and Alt gate

Dev deployment produces rendered screenshots, DOM/accessibility data, Lighthouse, console/network observations, smoke, E2E, integration results, and evaluator evidence. `propagate-alt` requires current evidence covering all nine site quality dimensions and a verified durable dossier replica.

### Alt evidence and Main gate

Alt deploys the identical artifact. Environment-dependent requirements are re-evaluated against the Alt URL. Environment-independent evidence may be reused only when the profile explicitly allows it and candidate/profile identity remains unchanged. `promote-main` requires a current `pass` for its gate.

### Main verification

Promotion enters `main-verifying`. Where possible, the adapter first deploys to an isolated slot. Required build-identity, critical route/form, header, health, and smoke evidence runs before the release becomes `main-certified`. A non-pass triggers rollback only to an eligible artifact and only when rollback can remedy the failure. Rollback health is itself verified and recorded.

### Continuous health

The historical `main-certified` decision remains immutable. A scheduler refreshes TTL-bound evidence and appends current health decisions. Non-critical drift produces `degraded`, incidents, retries, action packs, and a promotion block. Critical regressions produce `revoked` and execute the requirement-specific drift action.

## Fail-closed status semantics

Requirement results use:

- `pass`: applicable requirement succeeded with current, valid evidence;
- `fail`: current valid evidence proves the requirement is violated;
- `incomplete`: evidence is absent, malformed, unclassified, timed out, unavailable, or the producer failed;
- `stale`: evidence exists but candidate, environment, profile, producer, freshness, or toolchain binding no longer matches;
- `not-applicable`: an explicit applicability decision proves the requirement does not apply.

Gate aggregation precedence is `fail`, then `stale`, then `incomplete`, then `pass`. `not-applicable` is never a top-level gate state. A gate passes only when every applicable required requirement passes. Advisory results remain visible but do not change the gate decision.

Alt and Main accept only `pass`. No force, skip, grace, or required-to-advisory downgrade exists.

## Site quality dimensions

Before Main, Site Certification Profile v1 covers:

1. candidate integrity;
2. business truth and compliance;
3. editorial quality and localization;
4. information architecture and discoverability;
5. UX and conversion;
6. visual quality and accessibility;
7. performance and runtime correctness;
8. security and operational readiness;
9. independent qualitative evaluation.

Each dimension has at least one applicable required requirement. A dimension may be irrelevant only through explicit `not-applicable` evidence.

## Agent separation

Author and evaluator roles are separated by invocation, context, permissions, and evidence identity. The evaluator sees the business brief, source facts/claims, rendered pages, screenshots, and rubric. It does not see the author’s private reasoning or another evaluator’s output. Ordinary changes require one evaluator. Critical or borderline changes require two isolated evaluators according to the versioned risk policy. The certification engine, not the evaluator, aggregates the evidence.

## Remediation model

Certification never repairs the candidate. Every non-pass emits `CertificationActionPack@1` tasks classified as:

- product fix: authoring change and new candidate;
- infrastructure retry: same candidate may resume;
- policy defect: separate normative change to profile or producer.

Each task is anchored to requirement, gate, dimension, evidence, file/URL/DOM/screenshot, dependency, exact verification command, and expected success evidence. Vague quality prose is invalid.

## Rollout

The certification implementation remains inactive until all required producers, evaluator agents, durable storage, deployment integration, and verification fixtures are complete. The old test-evidence grace path is removed at activation, not earlier and not later. `warpgogol-com` is then republished as a fresh candidate through the full pipeline. Existing evidence does not satisfy the new gates.

After the first new `main-certified` release, a separate cleanup node may remove old bulky operational payloads after preserving compact audit manifests and verifying source/mirror integrity.

## Relationship to existing architecture

The roadmap RFCs must explicitly reconcile or supersede affected parts of:

- RFC-0029 / DNA-35 (`app.contract.full` as canonical readiness signal);
- RFC-0293 through RFC-0302 (Check Warpgogol evidence, reports, action packs, and deployment gating);
- RFC-0362 / DNA-51 (locks, idempotency, and atomic operations);
- RFC-0363 / DNA-52 (artifact store);
- RFC-0608, RFC-0627, RFC-0628, and RFC-0842 / DNA-49 and DNA-73 (deployment state vocabulary and transitions);
- RFC-0650 / DNA-59 (durable evidence history);
- RFC-0770 / DNA-64 (engine/plugin boundary and closed hooks);
- RFC-0823 through RFC-0829 / DNA-66 (testing and evidence gates, including grace behavior);
- RFC-0833 / DNA-67 (Lighthouse parity);
- RFC-0837 through RFC-0839 / DNA-68 through DNA-70 (mobile quality layers).

## Success criteria

The program is complete only when:

- no deployment path can promote a new candidate without a current certification pass;
- missing or mismatched evidence never returns pass;
- every gate decision can be independently verified from durable content-addressed evidence;
- a candidate cannot be rebuilt or mutated between channels;
- all nine site dimensions have required coverage;
- qualitative evidence is independent of the author agent;
- deployment failure produces anchored remediation, not generic prose;
- Main verification and rollback are observable and tested through failure injection;
- current health can degrade or revoke without rewriting historical decisions;
- `warpgogol-com` completes a critical two-evaluator clean cutover;
- post-cutover cleanup preserves compact audit history and removes obsolete operational bulk safely.
