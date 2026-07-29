---
rfcId: RFC-0562
planId: PLAN-RFC-0562-01
status: draft
owner: architecture
createdAt: 2026-07-27
updatedAt:
scope:
  apps: []
  packages: []
  services: []
  docs:
    - docs/rfcs/rfc-0562-p2p-werkstatt-network-topology-and-dna-invariant-5-layer-architecture-for-million-site-scale.md
    - docs/rfcs/rfc-0563-git-mesh-platform-code-replication-p2p-replication-of-platform-monorepo-across-workshops.md
    - docs/rfcs/rfc-0564-swim-membership-and-crdt-genome-gossip-failure-detection-and-persistent-membership-log-for-workshops.md
    - docs/rfcs/rfc-0565-dht-site-registry-and-content-placement-s-kademlia-hardened-dht-for-site-lookups-and-mirror-placement.md
    - docs/rfcs/rfc-0566-immutable-platform-deploy-with-atomic-rollback-content-addressed-artifacts-and-symlink-swap-deployment-across-workshops.md
---

# Implementation Plan: RFC-0562

## 1. Objectives

- [ ] Verify all 5 layers are described with dedicated RFC references (0563–0566), each naming its protocol and failure model — maps to acceptance criterion 1
- [ ] Verify threat model enumerates all adversary classes and maps each to a mitigation layer — maps to acceptance criterion 2
- [ ] Verify DNA-recovery section explains reconstruction from persistent layers, including in-flight mission disposability — maps to acceptance criterion 3
- [ ] Verify cross-cutting requirements cover secrets, identity, content addressing, consistency, and pilot scope — maps to acceptance criterion 4
- [ ] Verify workshop model is defined with its five components — maps to acceptance criterion 5
- [ ] Verify rollout phases are defined (Phase 0–4) with pilot scope (Phase 1–2) — maps to acceptance criterion 6
- [ ] Verify Compass and AGENTS.md synchronization points are identified — maps to acceptance criterion 7
- [ ] `rfc.validate` passes on RFC-0562 — maps to acceptance criterion 8

## 2. Affected artifacts

### 2.1 Code and commands

No code changes. This RFC is an architectural frame (Phase 0). The `werkstatt.network.status` and `werkstatt.network.bootstrap` commands are proposed names only — implementation is deferred to per-layer RFCs (0563–0566) and future implementation RFCs.

### 2.2 Configuration and data

No configuration or data changes. No new YAML/JSON/NDJSON files. No ontology catalog changes.

### 2.3 Documentation and specs

- `docs/rfcs/rfc-0562-*.md` — the RFC file itself (read-only after acceptance; only `status`/`implementedAt`/`updatedAt` change via `rfc.implement.stamp`).
- `docs/rfcs/rfc-0563-*.md` — Layer 1 RFC (verify exists, verify cross-reference).
- `docs/rfcs/rfc-0564-*.md` — Layer 2 RFC (verify exists, verify cross-reference).
- `docs/rfcs/rfc-0565-*.md` — Layer 3 RFC (verify exists, verify cross-reference).
- `docs/rfcs/rfc-0566-*.md` — Layer 5 RFC (verify exists, verify cross-reference).
- No `AGENTS.md` updates in this RFC — the RFC identifies future synchronization points but does not modify AGENTS.md files (Phase 2+ work).
- No `docs/*.xml` Compass updates in this RFC — the RFC identifies future synchronization points but does not modify Compass files (Phase 2+ work).
- No `docs/architecture-dna.md` updates — the RFC explicitly states a future RFC will establish the DNA invariant for P2P topology.

### 2.4 Validation and pipelines

- `rfc.validate RFC-0562` — mechanical validation of the RFC file.
- No `build:check` needed — no code changes.
- No acceptance probes — the RFC has no `acceptance` probes declared.
- No `rfc.verification.emit` needed — no acceptance probes (RFC-0330 applies only to probe-bearing RFCs).

## 3. Step sequence

### Step 1. Verify RFC content completeness against acceptance criteria

**Goal:** Confirm every acceptance criterion in the RFC is satisfied by the RFC's own content.

**Agent actions:**

- Read RFC-0562 and verify each acceptance criterion against the RFC body:
  - Criterion 1: Check that all 5 layers (Git-Mesh, SWIM, DHT, Git-native content, Immutable Deploy) are described with their dedicated RFC references (0563–0566), each naming its protocol and failure model.
  - Criterion 2: Check that the threat model table enumerates all 5 adversary classes (byzantine workshop, network observer, rogue operator, sybil attacker, eclipse attacker) and maps each to a mitigation layer.
  - Criterion 3: Check that the DNA-recovery section explains reconstruction from the 4 persistent layers and addresses in-flight mission disposability (DNA-46).
  - Criterion 4: Check that cross-cutting requirements cover: no secrets (DNA-40), VC-based identity (RFC-0558), content addressing, eventual consistency, and pilot scope (trusted workshops).
  - Criterion 5: Check that the workshop model lists all 5 components (platform clone, SWIM membership, DHT node, Sternsystem repos, deploy target).
  - Criterion 6: Check that rollout defines Phase 0–4 with pilot scope at Phase 1–2.
  - Criterion 7: Check that Compass and AGENTS.md synchronization points are identified (docs/technology.xml, docs/development-plan.xml, root AGENTS.md, packages/os/site-kernel/AGENTS.md).
- Mark each criterion `[x]` with inline `(evidence: <RFC section>, <line range>)` annotation.

**Validation:**

- All 8 acceptance criteria in the RFC are marked `[x]` with evidence annotations.

**Completion criterion:** Every acceptance criterion is verified against the RFC body and marked `[x]` with an inline evidence annotation pointing to the specific section and line range.

**Human review:** no — content verification is a mechanical check against the RFC body.

---

### Step 2. Verify per-layer RFC cross-references

**Goal:** Confirm all per-layer RFCs (0563–0566) exist and are correctly cross-referenced from RFC-0562.

**Agent actions:**

- Verify `docs/rfcs/rfc-0563-*.md` exists and its `related[]` includes `RFC-0562`.
- Verify `docs/rfcs/rfc-0564-*.md` exists and its `related[]` includes `RFC-0562`.
- Verify `docs/rfcs/rfc-0565-*.md` exists and its `related[]` includes `RFC-0562`.
- Verify `docs/rfcs/rfc-0566-*.md` exists and its `related[]` includes `RFC-0562`.
- Verify RFC-0562's `related[]` includes all four per-layer RFC ids.

**Validation:**

- All 4 per-layer RFCs exist and have bidirectional `related[]` cross-references with RFC-0562.

**Completion criterion:** All per-layer RFCs exist and cross-reference RFC-0562 bidirectionally.

**Human review:** no — cross-reference verification is a mechanical check.

---

### Step 3. Run mechanical validation

**Goal:** Confirm `rfc.validate` passes on RFC-0562.

**Agent actions:**

- Run `pnpm exec site-kernel run rfc.validate RFC-0562 --json`.
- Verify zero violations.

**Validation:**

- `rfc.validate` returns `status: pass` with zero violations.

**Completion criterion:** `rfc.validate RFC-0562` passes with zero violations.

**Human review:** no.

---

### Step 4. Documentation sync verification

**Goal:** Confirm that no documentation files need modification in this RFC (architectural frame only).

**Agent actions:**

- Verify no `AGENTS.md` files are modified (the RFC identifies future sync points but does not modify them).
- Verify no `docs/*.xml` Compass files are modified (the RFC identifies future sync points but does not modify them).
- Verify `docs/architecture-dna.md` is not modified (the RFC states the DNA invariant is future work).
- Document in the implementation commit that documentation sync is deferred to Phase 2+ when per-layer RFCs are implemented.

**Validation:**

- `git diff --name-only` shows no documentation files modified except the RFC file itself (for status transition).

**Completion criterion:** No documentation files are modified; the deferral to Phase 2+ is documented.

**Human review:** no.

---

### Final Step. Review, fix, and stamp implemented

**Goal:** Run code review (N/A for this RFC — no code changes), verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- **Code review:** invoke `fo-review` via the `skill` tool on all session changes (`git diff <merge-base-of-session>...HEAD`). Since this RFC produces no code changes, the review will cover only the RFC file edits (status transition, acceptance criteria checkmarks). Wait for the review report in `docs/reviews/code/`.
- **Fix if needed:** if `fo-review` reported findings, invoke `fo-fix` via the `skill` tool. Re-run `fo-review` to confirm all findings are resolved. Maximum 3 iterations.
- **Check off acceptance criteria:** verify each criterion in the RFC against the RFC body. Mark `[x]` for verified criteria with inline `(evidence: <RFC section>, <line range>)` annotations.
- **Stamp the RFC as implemented:** run `pnpm exec site-kernel run rfc.implement.stamp --id RFC-0562 --implementation-commit <sha> --dry-run` first, then without `--dry-run`. The command validates all preconditions (status, criteria, clean tree, commit reachability). Do NOT hand-edit `status`, `implementedAt`, or `closedAt` fields.
- **Commit the stamped RFC separately** — the implementation commit and the stamp commit MUST be separate commits (per PREFERENCES.md §RFC implementation completion rules).

**Validation:**

- `git status` — no uncommitted changes from the current session.
- `pnpm exec site-kernel run rfc.validate RFC-0562` — passes with zero violations.
- Review report exists in `docs/reviews/code/` for this session.
- RFC status is `implemented` (set by `rfc.implement.stamp`, not by hand).

**Completion criterion:** All acceptance criteria are checked off with inline evidence annotations; RFC is stamped as `implemented` via `rfc.implement.stamp`; implementation commit and stamp commit are separate.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476).

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec site-kernel run rfc.validate RFC-0562` — mechanical validation.
- No `build:check` needed — no code changes.
- No acceptance probes — the RFC has no `acceptance` probes declared.
- No `rfc.verification.emit` needed — no acceptance probes (RFC-0330 applies only to probe-bearing RFCs).

### 4.2 Evidence artifacts

- Acceptance criteria checkmarks with inline `(evidence: <RFC section>, <line range>)` annotations in the RFC file.
- Commit messages referencing `RFC-0562` in the subject line (RFC-0265 commit hygiene).
- Review report in `docs/reviews/code/` for this session.

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --------------- | ---------------------- |
| Complexity — five layers is significantly more complex | Step 1 verifies each layer is described with its dedicated RFC, ensuring the complexity is decomposed into per-layer RFCs |
| Agent misinterpretation — LLM agents may attempt to implement P2P layers | Step 1 verifies the RFC explicitly states implementation is deferred; implementation notes section is checked |
| Byzantine resistance untested | Step 1 verifies the rollout section defines pilot scope at Phase 1–2 (trusted workshops only) |
| Operational burden | Step 1 verifies the risks section acknowledges operational burden with mitigation (pilot starts with two trusted workshops) |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-1 (Monorepo boundary), run `pnpm exec site-kernel run rfc.supersede.propose --id RFC-0562 --reason "..." --invariant "DNA-1"` instead of working around it.
- If the per-layer RFCs (0563–0566) reveal that the umbrella architecture needs to change, create a superseding RFC for RFC-0562 rather than amending it in place.
- If a future RFC establishes a DNA invariant for P2P topology, update RFC-0562's `satisfies[]` and `related[]` fields via an amending RFC.
