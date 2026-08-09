---
rfcId: RFC-0771
planId: PLAN-RFC-0771-01
status: draft
owner: architecture
createdAt: 2026-08-09
updatedAt:
scope:
  apps: []
  packages:
    - packages/werkstatt
  services: []
  docs:
    - docs/rfcs/rfc-0771-werkstatt-engine-core-package-composition.md
    - docs/rfcs/rfc-0772-consolidate-engine-core-into-packages-werkstatt-with-plugin-registry.md
    - docs/audits/audit-rfc-0771-werkstatt-engine-core-package-composition.md
    - docs/plans/plan-rfc-0771-werkstatt-engine-core-package-composition.md
---

# Implementation Plan: RFC-0771

## 1. Objectives

- [x] Objective 1 — module map table reviewed and accepted by the operator (completed during enhance/grilling phase, verdict confirmed by operator)
- [x] Objective 2 — every `packages/os/*` package and `packages/fingerprint`, `packages/agent-gate` assigned to engine, plugin, or workshop-local (completed during enhance: 12 packages/os + fingerprint + agent-gate all classified)
- [ ] Objective 3 — engine subpath export list drafted (this plan, Appendix A)
- [x] Objective 4 — decision protocol for unlisted files documented (RFC body, "Decision protocol for unlisted files" section)
- [x] Objective 5 — RFC-0772 references this map as its normative input (RFC-0772 line 79: "RFC-0771 defines the normative module map for the engine"; line 155: "packages/werkstatt exists and contains all RFC-0771 engine modules")
- [x] Objective 6 — `rfc.validate` passes on this file (verified during enhance, zero violations)

## 2. Affected artifacts

### 2.1 Code and commands

No code changes — this is a specification RFC. The `packages/werkstatt` package does not exist yet; it is created by RFC-0772. This plan drafts the subpath export list as a specification input for RFC-0772's implementation.

### 2.2 Configuration and data

- `packages/werkstatt/package.json` `exports` field — drafted in Appendix A of this plan, to be created by RFC-0772.

### 2.3 Documentation and specs

- `docs/rfcs/rfc-0771-werkstatt-engine-core-package-composition.md` — read-only reference (accepted status).
- `docs/rfcs/rfc-0772-consolidate-engine-core-into-packages-werkstatt-with-plugin-registry.md` — verify cross-reference to RFC-0771 module map (already present).
- `docs/audits/audit-rfc-0771-werkstatt-engine-core-package-composition.md` — audit report (reference).
- `docs/plans/plan-rfc-0771-werkstatt-engine-core-package-composition.md` — this plan file.

### 2.4 Validation and pipelines

- `rfc.validate --id RFC-0771` — mechanical validation (already passing).
- No build checks (no code changes).
- No acceptance probes (RFC-0771 does not declare `acceptance` probes).

## 3. Step sequence

### Step 1. Draft engine subpath export list

**Goal:** Produce the `exports` field specification for `packages/werkstatt/package.json`, derived from the RFC-0771 module map and engine package layout.

**Agent actions:**

- Read the RFC-0771 engine module table (22 engine modules) and the engine package layout tree (Design section).
- Map each engine module to its subpath export entry.
- Preserve the `fingerprint` two-entry-point split (`.` for primitives, `/semantic` for parser-backed).
- Preserve the `agent-gate` root-only entry (the `/astro` subpath goes to the site plugin).
- Draft the `exports` field in Appendix A of this plan file.

**Validation:**

- Every engine module in the RFC-0771 table has a corresponding subpath export entry.
- `fingerprint` preserves its two-entry-point split.
- `agent-gate` exports only the root entry (no `/astro`).

**Completion criterion:** Appendix A of this plan contains a complete `exports` field specification covering all 22 engine modules.

**Human review:** no — the export list is derived mechanically from the RFC module map.

---

### Step 2. Verify acceptance criteria

**Goal:** Verify every acceptance criterion in RFC-0771 is met and document evidence.

**Agent actions:**

- Criterion 1 ("Module map table reviewed and accepted by the operator") — confirmed during enhance/grilling phase. Evidence: operator selected "Site plugin" for `check-core` and `studio-gate` classifications, confirming review.
- Criterion 2 ("Every packages/os/* package and packages/fingerprint, packages/agent-gate assigned") — verified in enhanced RFC: 12 `packages/os/*` packages + `packages/fingerprint` + `packages/agent-gate` all classified in engine, plugin, or workshop-local tables.
- Criterion 3 ("Engine subpath export list drafted") — completed in Step 1 (Appendix A).
- Criterion 4 ("Decision protocol for unlisted files documented") — verified in RFC body, "Decision protocol for unlisted files" section.
- Criterion 5 ("RFC-0772 references this map as its normative input") — verified: RFC-0772 line 79 and line 155 reference RFC-0771's module map.
- Criterion 6 ("rfc.validate passes") — verified during enhance: zero violations.
- Check off each criterion in the RFC with inline `(evidence: ...)` annotation.

**Validation:**

- `rtk pnpm exec werkstatt run rfc.validate --id RFC-0771 --json` — passes with zero violations.

**Completion criterion:** All 6 acceptance criteria checked off with evidence annotations.

**Human review:** no — criteria verification is mechanical.

---

### Step 3. Run code review and fix

**Goal:** Run `fo-review` on all session code changes and fix any findings.

**Agent actions:**

- Invoke `fo-review` via the `skill` tool on all session code changes (`git diff <merge-base-of-session>...HEAD`).
- If findings are reported, invoke `fo-fix` via the `skill` tool.
- Re-run `fo-review` to confirm all findings are resolved. Maximum 3 iterations.

**Validation:**

- Review report exists in `docs/reviews/code/` for this session.
- All findings resolved (or documented as not-applicable).

**Completion criterion:** `fo-review` passes with zero unresolved findings.

**Human review:** no — code review is automated via `fo-review`.

---

### Step 4. Stamp implemented

**Goal:** Transition RFC-0771 from `accepted` to `implemented` using the stamp command.

**Agent actions:**

- Run `rtk pnpm exec werkstatt run rfc.implement.stamp --id RFC-0771 --implementation-commit <sha>` to atomically transition `accepted → implemented`.
- The command validates all preconditions (status, criteria, clean tree, commit reachability).
- Do NOT hand-edit `status`, `implementedAt`, or `closedAt` fields — use the command.

**Validation:**

- `rtk git status` — no uncommitted changes from the current session.
- `rtk pnpm exec werkstatt run rfc.validate --id RFC-0771` — passes.

**Completion criterion:** RFC-0771 status is `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476).

## 4. Validation suite

### 4.1 Required checks

- `rtk pnpm exec werkstatt run rfc.validate --id RFC-0771 --json` — mechanical validation
- No build checks (specification RFC, no code changes)
- No acceptance probes (RFC-0771 does not declare `acceptance` probes)
- No verification evidence (RFC-0771 does not declare `acceptance` probes, so `rfc.verification.emit` is not required)

### 4.2 Evidence artifacts

- This plan file with Appendix A (engine subpath export list)
- Commit messages referencing `RFC-0771` in the subject line (RFC-0265 commit hygiene)

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| share/ontology symbol split underestimated | Step 1 drafts the export list from the module map; the actual symbol-level split is executed by RFC-0772, not this RFC |
| Hidden Node-version or bundler assumptions | Not applicable — this RFC is a specification, no code changes. RFC-0772 handles bundler assumptions during physical consolidation. |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-51/52/53, run `rtk pnpm exec werkstatt run rfc.supersede.propose --id RFC-0771 --reason "..." --invariant "DNA-N"` instead of working around it.
- If the engine subpath export list reveals a module that doesn't fit any export entry, add it to the RFC-0771 module map via an amending RFC (the RFC is `accepted` and cannot be edited in place).

## Appendix A. Engine subpath export list

Derived from the RFC-0771 engine module table (22 modules) and the engine package layout. This is the specification input for RFC-0772's `packages/werkstatt/package.json` creation.

```json
{
  "exports": {
    ".": {
      "types": "./src/index.ts",
      "default": "./src/index.ts"
    },
    "./fingerprint": {
      "types": "./src/fingerprint/index.ts",
      "default": "./src/fingerprint/index.ts"
    },
    "./fingerprint/semantic": {
      "types": "./src/fingerprint/semantic.ts",
      "default": "./src/fingerprint/semantic.ts"
    },
    "./agent-gate": {
      "types": "./src/agent-gate/index.ts",
      "default": "./src/agent-gate/index.ts"
    },
    "./schemas": {
      "types": "./src/schemas/index.ts",
      "default": "./src/schemas/index.ts"
    },
    "./kernel": {
      "types": "./src/kernel/index.ts",
      "default": "./src/kernel/index.ts"
    },
    "./mission": {
      "types": "./src/mission/index.ts",
      "default": "./src/mission/index.ts"
    },
    "./sternsystem": {
      "types": "./src/sternsystem/index.ts",
      "default": "./src/sternsystem/index.ts"
    },
    "./release": {
      "types": "./src/release/index.ts",
      "default": "./src/release/index.ts"
    },
    "./leitstand": {
      "types": "./src/leitstand/index.ts",
      "default": "./src/leitstand/index.ts"
    },
    "./bordbuch": {
      "types": "./src/bordbuch/index.ts",
      "default": "./src/bordbuch/index.ts"
    },
    "./notausgang": {
      "types": "./src/notausgang/index.ts",
      "default": "./src/notausgang/index.ts"
    },
    "./artifact-store": {
      "types": "./src/artifact-store/index.ts",
      "default": "./src/artifact-store/index.ts"
    },
    "./evidence": {
      "types": "./src/evidence/index.ts",
      "default": "./src/evidence/index.ts"
    },
    "./nachweis": {
      "types": "./src/nachweis/index.ts",
      "default": "./src/nachweis/index.ts"
    },
    "./subdomain": {
      "types": "./src/subdomain/index.ts",
      "default": "./src/subdomain/index.ts"
    },
    "./dns": {
      "types": "./src/dns/index.ts",
      "default": "./src/dns/index.ts"
    },
    "./behavior-snapshot": {
      "types": "./src/behavior-snapshot/index.ts",
      "default": "./src/behavior-snapshot/index.ts"
    },
    "./migrators": {
      "types": "./src/migrators/index.ts",
      "default": "./src/migrators/index.ts"
    },
    "./deploy": {
      "types": "./src/deploy/index.ts",
      "default": "./src/deploy/index.ts"
    },
    "./identity": {
      "types": "./src/identity/index.ts",
      "default": "./src/identity/index.ts"
    },
    "./werkstatt": {
      "types": "./src/werkstatt/index.ts",
      "default": "./src/werkstatt/index.ts"
    },
    "./integrity": {
      "types": "./src/integrity/index.ts",
      "default": "./src/integrity/index.ts"
    },
    "./observability": {
      "types": "./src/observability/index.ts",
      "default": "./src/observability/index.ts"
    },
    "./changelog": {
      "types": "./src/changelog/index.ts",
      "default": "./src/changelog/index.ts"
    }
  }
}
```

**Export list notes:**

- `.` — full barrel (re-exports all engine modules for convenience)
- `./fingerprint` — primitives (`byteHash`, `byteHashFile`, `stableStringify`, `stableJsonHash`); preserves the `@warpgogol/fingerprint` root entry point
- `./fingerprint/semantic` — parser-backed normalizers (`fingerprintFile`, `fingerprintTree`); preserves the `@warpgogol/fingerprint/semantic` entry point
- `./agent-gate` — framework-agnostic gate runtime (MCP handler, action pipeline, rate limiting); the `/astro` subpath is NOT exported (it goes to the site plugin)
- `./schemas` — operations schemas extracted from `@warpgogol/ontology/operations` (mission, release, leitstand, sternsystem, werkstatt, artifact-store, naming-policy, notausgang, materialization, handoff)
- `./kernel` through `./changelog` — one subpath per engine module, matching the RFC-0771 module table

**Modules NOT exported (internal):**

- `werkstatt/` (primitives) — internal locks/idempotency/atomic-staging; consumed by other engine modules via relative imports, not subpath exports
- `identity/` — internal passport bootstrap glue; consumed by engine modules, not a public API
