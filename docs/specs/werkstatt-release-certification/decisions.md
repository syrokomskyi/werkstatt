# Decision Log

This log is normative for the Werkstatt Release Certification System. Decision IDs are cited as `werkstatt-release-certification/ADR-NNN`.

## ADR-001 — Missing or stale evidence is never success

Status: accepted

### Decision

Certification uses `pass`, `fail`, `incomplete`, and `stale`. Missing evidence, producer crashes, timeouts, infrastructure unavailability, malformed output, and unknown classifications produce `incomplete`. Identity, environment, profile, producer, toolchain, or freshness mismatch produces `stale`. Local authoring may continue while incomplete; Alt and Main require `pass`.

### Rationale

The existing system contains passing defaults and a calendar grace path. Those mechanisms erase the distinction between a good artifact and an unobserved artifact. Consequential transitions must fail closed.

### Consequences

- The grace behavior in test evidence must be removed at activation.
- Passing default evidence is forbidden.
- Operators and agents receive distinct remediation for product failures and verification failures.

## ADR-002 — Certification applies to an immutable release candidate

Status: accepted

### Decision

The certified object is an immutable candidate bound to `systemId`, `releaseId`, source commit, content digest, artifact digest, configuration digest, certification-profile digest, producer/toolchain identity, and required environment bindings. Dev, Alt, and Main promote the same artifact without rebuilding. Any bound change creates a new candidate and dossier.

### Rationale

A site, branch, URL, or mission is mutable and cannot carry a durable quality claim. Commit identity alone is insufficient because builds, content overlays, configuration, and policy can differ.

### Consequences

- Product remediation after candidate creation requires a new candidate.
- Evidence reuse requires exact identity compatibility.
- Live build identity must be verified at each environment transition.

## ADR-003 — The engine owns certification lifecycle; the plugin owns stack policy

Status: accepted

### Decision

The Werkstatt engine owns schemas, candidate identity, evidence ingestion, dossier lifecycle, storage, aggregation, commands, deployment enforcement, health projection, and cleanup orchestration. The single active plugin supplies its versioned certification profile and stack-specific producers.

Existing closed `checkGate` and `releaseEvidence` hooks must be used if sufficient. If insufficient, their contract is explicitly superseded; no ad hoc sixth lifecycle hook may be introduced.

### Rationale

Lifecycle duplication would make site, game, and video workshops inconsistent. Importing site policy into the engine would violate DNA-64.

### Consequences

- Core contracts live in `@warpgogol/werkstatt`.
- Site requirements and evaluators live in `@warpgogol/werkstatt-site`.
- Plugin-profile validation is an engine concern.

## ADR-004 — One append-only dossier contains stage-specific decisions

Status: accepted

### Decision

Each candidate has one append-only dossier with separate immutable decisions for `dev-deploy`, `propagate-alt`, and `promote-main`. Re-runs append evidence and decisions; they never overwrite prior records. Later gates may reference compatible earlier evidence.

### Rationale

A single final boolean cannot represent evidence that becomes available only after deployment. Separate per-channel files lose cross-stage provenance, while mutable “latest result” files erase history.

### Consequences

- One-file-per-test-level storage is replaced for certification purposes.
- Gate status is selected from appended decision history, not edited in place.
- Dossier integrity covers the complete transition chain.

## ADR-005 — A versioned certification profile is the normative gate policy

Status: accepted

### Decision

The active plugin provides one declarative profile. Each requirement declares stable ID, dimension, applicability, gate placement, classification (`required`, `conditional`, `advisory`), producer, expected evidence schema, permitted environment, reuse, freshness, timeout/retry, diagnostic recovery, drift action, and normative source. The engine rejects structurally invalid profiles. The profile digest is part of candidate identity.

### Rationale

Current readiness composition is scattered across hard-coded command arrays and handlers. A generated catalog describes the current state but does not define policy or affect execution.

### Consequences

- Gate composition has one source of truth.
- Policy changes invalidate existing evidence for future decisions.
- Required checks without registered producers are activation blockers.

## ADR-006 — Aggregation is deterministic and preserves failure class

Status: accepted

### Decision

Applicability is evaluated explicitly. A non-applicable requirement records `not-applicable` with reason evidence. Fresh required violations produce `fail`; binding mismatch produces `stale`; absence or verifier failure produces `incomplete`. Advisory evidence remains visible without changing the gate. Top-level precedence is `fail`, `stale`, `incomplete`, `pass`.

### Rationale

Collapsing every problem into exit code 1 prevents agents from knowing whether to fix the product, retry infrastructure, or change policy.

### Consequences

- `not-applicable` is never a top-level gate state.
- Unknown or unclassified outcomes are incomplete.
- Action packs can route remediation by failure class.

## ADR-007 — Independent evaluator agents supply qualitative evidence

Status: accepted

### Decision

Qualitative evidence is produced by a separate read-only evaluator-agent invocation with a clean context and versioned rubric. It receives the business brief, claims/facts, source content, rendered pages, screenshots, and relevant diagnostics. It cannot see the author’s private reasoning, mutate the candidate, or issue a gate decision. The deterministic engine remains the authority.

### Rationale

Deterministic validators do not fully measure clarity, trust, visual hierarchy, persuasiveness, factual grounding, or template-like content. Self-approval by the author creates correlated bias.

### Consequences

- Agent-only operation remains possible without a human approver.
- Evaluator outputs must be structured evidence, not a score-only opinion.
- Evaluator identity and rubric/model versions are recorded.

## ADR-008 — Required requirements have no runtime waiver

Status: accepted

### Decision

New Alt/Main promotion has no `--force`, skip-gate, grace-period, or automatic required-to-advisory downgrade. Suppressions apply only to advisory diagnostics. A required false positive is fixed in its producer or through a normative profile change, followed by recertification. Infrastructure failure remains incomplete. Rollback is recovery, not a waiver for forward promotion.

### Rationale

An agent that can waive the requirement it failed can always manufacture readiness. Temporary bypasses become permanent operational debt.

### Consequences

- Activation barriers must ensure every required producer is operational.
- Policy changes need their own RFC and profile version.
- Emergency procedures cannot label a new candidate certified.

## ADR-009 — Site Profile v1 covers nine mandatory quality dimensions

Status: accepted

### Decision

Before Main, the site profile covers candidate integrity; business truth and compliance; editorial quality and localization; information architecture and discoverability; UX and conversion; visual quality and accessibility; performance and runtime correctness; security and operational readiness; and independent qualitative evaluation.

Every dimension has at least one applicable required item. A genuinely irrelevant dimension requires explicit `not-applicable` evidence.

### Rationale

High command count is not the same as complete coverage. A system can run many structural validators while missing an entire quality dimension.

### Consequences

- Profile validation checks dimension coverage.
- Main cannot pass from technical/build evidence alone.
- The site profile is specified separately from core schemas.

## ADR-010 — Evidence is collected in the environment where it is meaningful

Status: accepted

### Decision

Authoring may remain incomplete. The Dev gate covers pre-deploy identity, build, schema, business, content, and static safety. Dev produces rendered, browser, integration, performance, accessibility, and evaluator evidence required for Alt. Alt rechecks environment-dependent URL/DNS/routes, headers, integrations, runtime, screenshots, and evaluator evidence required for Main. Cross-environment reuse is allowed only when explicitly declared environment-independent.

### Rationale

Runtime evidence cannot exist before deployment. Conversely, static source evidence need not be recomputed merely because the identical artifact changes channel.

### Consequences

- Each transition has a truthful limited profile.
- Environment is part of evidence identity.
- Dev remains the canonical real test environment under DNA-66.

## ADR-011 — Main promotion is transactional and verified after switch

Status: accepted

### Decision

Main promotion enters `main-verifying`, preferably after isolated slot verification, and becomes `main-certified` only after required Main smoke, build identity, critical routes/forms, headers, and health pass. A non-pass invalidates the promotion and automatically restores the last eligible certified artifact when rollback can remedy the problem. Rollback health and incidents are recorded. Missing or failed rollback is a critical incident, never success.

### Rationale

Some failures are observable only in the target environment. Marking promotion complete before those checks creates a window of false success.

### Consequences

- Release/deployment state vocabulary must be reconciled and superseded explicitly.
- Deploy adapters may expose isolated-slot capability.
- Failure injection must test both promotion and rollback paths.

## ADR-012 — Evidence uses a common provenance envelope and tamper-evident chain

Status: accepted

### Decision

The engine defines `EvidenceEnvelope@1` containing candidate, requirement, environment, producer version/source hash, run/timestamps, normalized input hashes, status, diagnostics, payload/artifact hashes, redaction metadata, and attestation. Producers submit through the engine. Evidence is content-addressed and appended through a hash-chained manifest. Decisions list evidence IDs and resulting dossier root.

Remote producers use workload-identity attestations. Local results receive an engine attestation bound to command and module hash. Manual files, unknown producers, broken attestations/chains, or secret-bearing payloads cannot certify.

### Rationale

Path location and syntactic validity do not prove origin or immutability. Agents with filesystem access must not be able to forge a passing JSON document.

### Consequences

- Producer registration is part of profile validation.
- Evidence ingestion performs security/redaction validation.
- Integrity failures become incidents and incomplete gates.

## ADR-013 — Dossier identity is location-independent and requires durable replication

Status: accepted

### Decision

The logical dossier is identified by root hash. Authoring and Dev use a local content-addressed cache. Before Alt, the complete dossier is replicated through a provider-neutral adapter to durable object storage. Upload uses immutable digest keys and read-after-write digest/size verification. Alt/Main require a verified durable replica. Release state stores root hash and safe locators, never credentials.

### Rationale

Local mission and release directories are routinely archived or cleaned. Durable history already exists for Axiom in R2, but the core must not depend on Cloudflare-specific storage.

### Consequences

- R2 is the first adapter, not the contract.
- Local loss is recoverable from durable storage.
- Durable-store unavailability produces incomplete for promotion.

## ADR-014 — Certification records use tiered retention with tombstones

Status: accepted

### Decision

Candidate identity, profiles, decisions, evidence metadata/digests, diagnostic summaries, incidents, and rollback chain are retained indefinitely. Full `main-certified` dossiers remain while active or rollback-eligible plus 24 months after supersession. Unsuccessful-candidate evidence remains 180 days. Heavy certified artifacts remain 12 months; heavy unsuccessful artifacts remain 90 days. Current/rollback candidates, open incidents, and audit holds are exempt. Payload deletion appends a tombstone with digest, reason, policy version, and time.

### Rationale

Auditability does not require every large screenshot and trace forever, but deleting payloads must not erase the fact that they existed or break decision provenance.

### Consequences

- Storage GC is policy-driven and content-addressed.
- Tombstones remain in the hash chain.
- Retention policies are versioned and testable.

## ADR-015 — Rollout uses a clean single-site republish

Status: accepted

### Decision

The current site remains online during rollout but is not retroactively certified. Old evidence is not imported for required gates and no generic legacy bootstrap command is created. A fresh candidate from current source completes the full pipeline and switches atomically or through an isolated slot. The old grace path is removed only when all required producers, evaluators, storage, and deployment integration are ready.

### Rationale

This workshop operates one replaceable site. A compatibility platform for a nonexistent legacy fleet would increase failure modes without protecting a real consumer.

### Consequences

- The first cutover is critical and requires two evaluators.
- Activation is a coordinated barrier, not a gradual fail-open period.
- Existing production is a temporary transition safety net, not a certified rollback target.

## ADR-016 — Bulky legacy artifacts are removed only after certified cutover

Status: accepted

### Decision

After the active mission is archived and the first new Main release is certified, a separate cleanup command may remove obsolete release payloads, archived workpieces, heavy evidence/snapshots, and staging directories. Before removal it creates an immutable inventory/tombstone manifest and verifies canonical source/mirror history. Bordbuch, Git history, normative documents, transcripts, manifests, and material incident/validation/close reports are retained.

### Rationale

The current old operational payload is about 61 GB. Raw deletion risks context and provenance loss, while permanent retention is wasteful.

### Consequences

- Cleanup is a separate final roadmap node.
- The command is idempotent, allow-listed, dry-run first, and report-producing.
- Manual recursive deletion is forbidden.

## ADR-017 — Deployment automatically orchestrates certification

Status: accepted

### Decision

`leitstand.dev-deploy`, `leitstand.propagate`, and `leitstand.promote` automatically invoke their gate through `release.certify --release=<id> --gate=<dev-deploy|propagate-alt|promote-main>`. The operation runs only missing/stale producers, evaluates, persists, syncs, is idempotent/resumable, and holds one release+gate lock. Explicit invocation remains available for early checks. Deployment always re-verifies the current decision and dossier root.

Read-only inspection is provided by `release.certification.status`, `release.certification.verify`, and `release.certification.profile.validate`.

### Rationale

Requiring a separate remembered manual command makes safety depend on agent memory. A goal-oriented entrypoint reduces the 700+ command discovery burden.

### Consequences

- Deployment cannot trust a caller-provided “already verified” flag.
- Resume state is append-only and lock-protected.
- Command manifests and ACP projections must be regenerated by implementation RFCs.

## ADR-018 — Certification is read-only and emits agent-ready action packs

Status: accepted

### Decision

Certification never changes candidate source, content, or artifact. Every non-pass emits `CertificationActionPack@1` tasks classified as product fix, infrastructure retry, or policy defect. Tasks include stable requirement/dimension/gate IDs, priority, dependencies, blocking rationale, precise evidence/file/URL/DOM/screenshot anchors, bounded repair instructions, exact reproduction/verification commands, and expected evidence. JSON is canonical; Markdown/HTML are projections.

### Rationale

An evaluator that repairs its input changes the identity it just assessed. Vague prose forces a future agent to rediscover the problem.

### Consequences

- Product fixes create a new candidate and dossier.
- Infrastructure retry may resume the same candidate.
- Policy defects require a separate normative change.

## ADR-019 — Evaluator count is risk-routed and disagreement is incomplete

Status: accepted

### Decision

Ordinary changes require one evaluator. Critical changes require two isolated evaluator identities and, where possible, different model families/providers. Critical includes the first cutover and changes to identity/offerings/prices/claims, legal/privacy/data collection, auth/payments/forms/integrations, locales, site-wide navigation/layout/CTA, agent/action surfaces, security headers, or DNS. Borderline confidence, threshold proximity, ambiguity, insufficient evidence, or high-severity advisory results trigger a second evaluator.

Evaluators cannot see each other’s outputs. Two passes yield pass, two failures yield fail, and disagreement, missing evaluation, or insufficient independence yields incomplete.

### Rationale

Qualitative judgement is nondeterministic and correlated with authoring bias. Risk routing concentrates cost where errors have the highest impact.

### Consequences

- Risk rules and thresholds are versioned profile data.
- A second evaluator is a required producer when routing demands it.
- No evaluator may convert disagreement into a majority guess.

## ADR-020 — Historical certification and current health are separate

Status: accepted

### Decision

Historical `main-certified` decisions remain immutable. Current `certificationHealth` is `current`, `degraded`, or `revoked`. Environment-independent evidence remains valid until identity/profile change. Environment-sensitive requirements use profile-defined TTLs and schedules. Monitoring appends evidence and health decisions. Non-critical non-pass degrades health, opens incidents/action packs, retries, and blocks new promotions. Critical regressions revoke health. Each requirement declares `retry`, `incident-only`, or `rollback`; rollback is forbidden when it cannot remedy a shared external outage.

### Rationale

Production conditions drift without new commits. Rewriting the historical decision destroys auditability, while treating certification as eternal creates false confidence.

### Consequences

- Current health is a projection, not a mutation of past decisions.
- Monitoring uses the same evidence envelope and profile.
- Successful refresh restores current health without erasing degradation history.
