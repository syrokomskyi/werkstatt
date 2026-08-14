<!-- knowledge-layer: L0 -->

# Q&A Log (L0)

Append-only log of questions asked and answers given during grilling sessions. Used for meta-analysis to distill recurring decision patterns.

### K-0001: Entry format for L0/L1/L2 knowledge records

```knowledge-entry
id: K-0001
layer: L0
created: 2026-08-03
status: active
```

- **Context:** 2026-08-03 — forge knowledge lifecycle RFC series (RFC-1..5)
- **Question:** Entry format for L0/L1/L2 knowledge records?
- **Answer:** Markdown files with per-entry YAML metadata blocks (human-readable, grep-able, parseable); soft migration for existing freeform entries.

### K-0002: How to define and enforce layer token budgets

```knowledge-entry
id: K-0002
layer: L0
created: 2026-08-03
status: active
```

- **Context:** 2026-08-03 — forge knowledge lifecycle RFC series (RFC-1..5)
- **Question:** How to define and enforce layer token budgets?
- **Answer:** Hard defaults in forge (L2 hot ~4KB, L1 warm ~8KB, L0 cold unbudgeted), optional override in forge.yaml bindings; warning on exceed, not error.

### K-0003: Where does AI distillation L0→L1/L2 live

```knowledge-entry
id: K-0003
layer: L0
created: 2026-08-03
status: active
```

- **Context:** 2026-08-03 — forge knowledge lifecycle RFC series (RFC-1..5)
- **Question:** Where does AI distillation L0→L1/L2 live?
- **Answer:** New skill fo-knowledge-distill alongside deterministic forge.skill.knowledge.compact command; code mutates metadata, agent distills meaning.

### K-0004: Should .agents/memory/ be versioned in git

```knowledge-entry
id: K-0004
layer: L0
created: 2026-08-03
status: active
```

- **Context:** 2026-08-03 — forge knowledge lifecycle RFC series (RFC-1..5)
- **Question:** Should .agents/memory/ be versioned in git?
- **Answer:** Hybrid — MEMORY.md (curated) versioned, daily logs git-ignored.

### K-0005: Schema extension before logic that depends on new fields

```knowledge-entry
id: K-0005
layer: L0
created: 2026-08-03
status: active
```

- **Context:** 2026-08-03 — grilling RFC-0663 plan (cross-skill knowledge promotion)
- **Question:** RFC proposes a new metadata field (promotedFrom) but the underlying schema (RFC-0660) doesn't define it. Where should schema extension live in the plan?
- **Answer:** Schema extension must be a separate step before any logic that creates or reads the field. Zod safeParse silently strips unknown fields; the serializer uses a fixed FIELD_ORDER array. Without extending both, the field is lost on parse and never written on serialize.

### K-0006: Doctor check status for informational warnings

```knowledge-entry
id: K-0006
layer: L0
created: 2026-08-03
status: active
```

- **Context:** 2026-08-03 — grilling RFC-0663 plan (knowledge-duplicate doctor check)
- **Question:** RFC says "informational warnings, never affects exit status." Should the doctor check use status "pass" or "warn"?
- **Answer:** Use "warn" when duplicates found, "pass" when none. Only "fail" affects exit status. "warn" makes duplicates visible in doctor summary (N warn(s)) and --json output, consistent with RFC-0661 SKILL-21 budget warnings. "pass" always would hide duplicates in the summary.

### K-0007: Validating non-skill knowledge files in doctor

```knowledge-entry
id: K-0007
layer: L0
created: 2026-08-03
status: active
```

- **Context:** 2026-08-03 — grilling RFC-0663 plan (shared knowledge layer validation)
- **Question:** The shared knowledge layer file is not inside a skill directory (no SKILL.md). Existing checks (checkLegacyKnowledgeSections, checkKnowledgeBudgets) and forge.skill.validate (SKILL-19/SKILL-20) discover knowledge files only through the skill registry. How to validate it?
- **Answer:** Add a dedicated checkSharedKnowledgeFile() in doctor.ts that parses the shared file via parseKnowledgeFile and checks SKILL-19 (schema validity) and SKILL-20 (id uniqueness) directly. A skill-wrapper would misrepresent the shared layer as a skill; skipping validation leaves schema violations undetected.

### K-0008: Dogfood criterion when no real duplicates exist

```knowledge-entry
id: K-0008
layer: L0
created: 2026-08-03
status: active
```

- **Context:** 2026-08-03 — grilling RFC-0663 plan (dogfood acceptance criterion)
- **Question:** RFC requires "at least one real duplicate pair promoted end-to-end" but the current monorepo has very few L2 entries across skills. Real duplicates are unlikely. How to handle the dogfood criterion?
- **Answer:** Conditional dogfood: run detection on the monorepo. If duplicates found, promote with operator approval. If none found, the detection pipeline running end-to-end (detection → doctor report → zero duplicates) serves as evidence. Promotion mechanics are verified by unit tests. Creating artificial test duplicates is not natural and would not test the real promotion path.

### K-0009: Certification semantics for missing or stale evidence

```knowledge-entry
id: K-0009
layer: L0
created: 2026-08-14
status: active
```

- **Context:** 2026-08-14 — Werkstatt quality-hardening architecture program, release certification module
- **Question:** How should release certification represent required evidence that is absent, outdated, or belongs to a different commit, configuration, or toolchain?
- **Answer:** Certification uses explicit `pass`, `fail`, `incomplete`, and `stale` states. Missing evidence must never be synthesized as success. Local authoring may continue with `incomplete` evidence so that content creation remains possible, but Alt/Main transitions require `pass`; `fail`, `incomplete`, and `stale` all block publication.

### K-0010: Identity of the certified release candidate

```knowledge-entry
id: K-0010
layer: L0
created: 2026-08-14
status: active
```

- **Context:** 2026-08-14 — Werkstatt quality-hardening architecture program, release certification module
- **Question:** What exact object receives a readiness certificate?
- **Answer:** Certification applies to an immutable release candidate, not to a site in general, a branch, a mission, or a URL. The identity binds at least `systemId`, `releaseId`, exact source commit, content and build-artifact hashes, configuration/policy/toolchain versions, and the evidence environment. Dev, Alt, and Main promote the same artifact without rebuilding; any bound-identity change invalidates the certificate and requires a new candidate and fresh evidence.

### K-0011: Ownership boundary for release certification

```knowledge-entry
id: K-0011
layer: L0
created: 2026-08-14
status: active
```

- **Context:** 2026-08-14 — Werkstatt quality-hardening architecture program, release certification module
- **Question:** Should release certification belong to the stack-agnostic Werkstatt engine or to the site plugin?
- **Answer:** The engine owns the certificate schema and lifecycle, candidate identity checks, storage, invalidation, and promotion enforcement. The one active stack plugin supplies the required-evidence profile and evidence producers. Universal integrity, provenance, freshness, and completeness rules stay in the engine; site-content, accessibility, SEO, Lighthouse, visual, and Astro-specific checks stay in `@warpgogol/werkstatt-site`. Existing closed `checkGate` and `releaseEvidence` plugin hooks must be used strictly or superseded explicitly rather than bypassed with an ad hoc sixth hook.

### K-0012: Stage-specific decisions in one append-only certification dossier

```knowledge-entry
id: K-0012
layer: L0
created: 2026-08-14
status: active
```

- **Context:** 2026-08-14 — Werkstatt quality-hardening architecture program, release certification module
- **Question:** Should certification be one final flag, separate certificates per channel, or one dossier with stage-specific gate decisions?
- **Answer:** Each immutable release candidate has one append-only certification dossier containing immutable, environment-bound evidence records and separate `dev-deploy`, `propagate-alt`, and `promote-main` decisions. Every decision uses `pass`, `fail`, `incomplete`, or `stale`; only the current `pass` for the relevant gate permits its transition. Re-runs append evidence and a new decision instead of overwriting history, while later gates may consume the required earlier evidence chain.

### K-0013: Versioned certification profile as the normative gate policy

```knowledge-entry
id: K-0013
layer: L0
created: 2026-08-14
status: active
```

- **Context:** 2026-08-14 — Werkstatt quality-hardening architecture program, release certification module
- **Question:** What is the authoritative source for the required checks at each certification gate?
- **Answer:** Each stack plugin supplies one declarative, versioned certification profile as the sole normative source for gate composition. Every requirement has a stable id, applicability, gate placement, required/conditional/advisory classification, expected evidence type and producer, permitted environment, freshness and candidate-binding rules, timeout/retry policy, recovery diagnostic, and normative RFC/DNA/spec reference. The engine rejects structurally invalid profiles, and the profile hash is bound into candidate identity so policy cannot change invisibly after evidence collection.

### K-0014: Deterministic aggregation of certification requirements

```knowledge-entry
id: K-0014
layer: L0
created: 2026-08-14
status: active
```

- **Context:** 2026-08-14 — Werkstatt quality-hardening architecture program, release certification module
- **Question:** How should individual requirement outcomes aggregate into a stage-gate decision?
- **Answer:** Applicability is evaluated explicitly; a conditional requirement that does not apply records `not-applicable` plus its reason. Fresh required failures produce `fail`; candidate/policy identity mismatches produce `stale`; missing evidence, timeouts, producer crashes, infrastructure unavailability, malformed output, or unclassified results produce `incomplete`. A gate passes only when every applicable required requirement has a current `pass`; advisory results remain visible but do not change status. Mixed problems use top-level precedence `fail` → `stale` → `incomplete` → `pass`, while all non-pass states block Alt/Main.

### K-0015: Agent-only independent qualitative evaluation

```knowledge-entry
id: K-0015
layer: L0
created: 2026-08-14
status: active
```

- **Context:** 2026-08-14 — Werkstatt quality-hardening architecture program, release certification module
- **Question:** If the authoring agent cannot approve its own qualitative work and the workflow uses agents only, who supplies approval evidence?
- **Answer:** A separate read-only Evaluator Agent run, with a clean context and a versioned rubric, evaluates rendered pages, screenshots, source content/claims, and the business brief and emits structured qualitative evidence. The deterministic Certification Engine—not the evaluator—computes the gate decision. One evaluator is sufficient for ordinary releases; critical or borderline cases require consensus from two independent evaluator runs. The process requires no human approver, and the authoring agent cannot submit its own approving qualitative evidence.

### K-0016: No agent waivers for required certification requirements

```knowledge-entry
id: K-0016
layer: L0
created: 2026-08-14
status: active
```

- **Context:** 2026-08-14 — Werkstatt quality-hardening architecture program, release certification module
- **Question:** May an agent bypass, suppress, or downgrade a required certification requirement to promote a new release?
- **Answer:** No runtime agent waiver exists for required Alt/Main requirements: no force, skip-gate, grace-period, or automatic required-to-advisory downgrade. Suppressions apply only to advisory diagnostics. A required false positive must be fixed in its producer or through a normative, versioned certification-profile change that invalidates prior evidence and triggers recertification. Infrastructure unavailability remains `incomplete`. The only bypass-like operation is rollback to a previously certified immutable artifact, which is recovery rather than promotion of a new candidate.
