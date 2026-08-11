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

### K-0009: Validator command order vs env var addition

```knowledge-entry
id: K-0009
layer: L0
created: 2026-08-11
status: active
```

- **Context:** 2026-08-11 — grilling RFC-0807 plan (service.otlp.validate ordering)
- **Question:** Validator is created in step 4, env vars added in steps 5-6. Pipeline falls between steps 4 and 6. Change order?
- **Answer:** Keep current order. Validator in step 4, pilot in step 5, remaining in step 6. Pipeline falls between steps 4 and 6 — expected, env vars not yet added. Validator is expected to fail until step 6 completes.

### K-0010: Pusher location for shared worker services

```knowledge-entry
id: K-0010
layer: L0
created: 2026-08-11
status: active
```

- **Context:** 2026-08-11 — grilling RFC-0807 plan (lagebild-sync pusher location)
- **Question:** lagebild-sync delegates to createLagebildSharedSyncWorker in package. Pusher in shared worker (package) or service?
- **Answer:** Pusher in shared worker (package). Service remains thin wrapper. Add OTLP vars to LagebildSharedWorkerEnv and pusher in shared worker scheduled handler. This follows the services/AGENTS.md rule: "Keep service workspaces thin and deployment-oriented."

### K-0011: OTLP-03 severity for delegated services

```knowledge-entry
id: K-0011
layer: L0
created: 2026-08-11
status: active
```

- **Context:** 2026-08-11 — grilling RFC-0807 plan (OTLP-03 for lagebild-sync)
- **Question:** OTLP-03 greps service source for OTLP vars in Env interface. lagebild-sync delegates to shared worker — env interface in package. Warning or error?
- **Answer:** Warning for delegated services. Validator scans service source only. If service delegates to shared worker (env interface in package), OTLP-03 is a warning, not an error. Documented exception: lagebild-sync delegates to shared worker, env interface in package.

### K-0012: Node service OTLP token in .env.example

```knowledge-entry
id: K-0012
layer: L0
created: 2026-08-11
status: active
```

- **Context:** 2026-08-11 — grilling RFC-0807 plan (Node vs CF Worker OTLP config)
- **Question:** Node services use internal endpoint without token. CF Workers use public endpoint with token. How to reflect in .env.example?
- **Answer:** Node: token empty, default endpoint in comment (`# Default: http://otel-collector:4318 (internal)`). CF: token required. Values always empty in .env.example (DNA-40). Default value documented in `# How to obtain:` comment, not in the value.
