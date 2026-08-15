---
rfcId: RFC-0856
planId: PLAN-RFC-0856-01
status: draft
owner: architecture
createdAt: 2026-08-15
updatedAt: 2026-08-15
scope:
  apps: []
  packages:
    - "@warpgogol/forge"
    - "@warpgogol/werkstatt"
  services: []
  docs:
    - AGENTS.md
    - packages/AGENTS.md
    - packages/forge/AGENTS.md
    - packages/werkstatt/AGENTS.md
    - docs/plans/agent-runtime-certification/**
    - docs/command-manifest.generated.yaml
    - docs/ecosystem.generated.yaml
    - docs/requirements.xml
    - docs/technology.xml
    - docs/development-plan.xml
    - docs/knowledge-graph.xml
    - docs/verification-plan.xml
    - docs/source-markup.xml
    - docs/styling.xml
---

# Implementation Plan: RFC-0856

## 1. Outcome and objectives

Implement the reusable `forge/program@1` packet control plane as packet 000 of RFC-0855. The implementation validates boundaries; it never executes packet work or commits on behalf of an agent.

RFC-0857 is normative for this plan. Its effective amendments are part of the implementation, not future work: generic qualified spec-decision resolution, draft/preparation/sealed distinctions, one phase-aware lease command, descendant preparation ranges, JIT materialization evidence, and deterministic dependency verification.

- [ ] Export strict schemas for program manifests, packets, phase-aware leases, preparation/completion/recovery reports, and resolved governing decisions.
- [ ] Register `program.packet.validate`, `program.packet.seal`, `program.packet.lease`, and `program.packet.complete` with fail-closed JSON/pretty parity.
- [ ] Enforce exact branch, head, packet order, roles, source hashes, path boundaries, diagnostics, ancestry, and clean-tree conditions.
- [ ] Resolve repository RFC, spec amendment, and spec node references from repository data without domain-specific parsing.
- [ ] Protect preparation and execution with one durable local lease lifecycle and explicit tracked recovery.
- [ ] Prove the one-time packet-000 bootstrap and permanently reject every later bootstrap attempt.
- [ ] Register the Forge module in this workshop and generated workshops, regenerate both command and ecosystem projections, and pass Linux/Windows-semantics tests.

## 2. Non-negotiable implementation laws

1. RFC-0855 must be `implemented` and its complete `docs/plans/agent-runtime-certification/**` fixtures committed before packet 000 implementation begins.
2. Work strictly sequentially; no subagents, parallel branches, distributed lease service, or concurrent packet preparation.
3. Keep `@warpgogol/forge` autonomous and cross-platform. It must not import `@warpgogol/werkstatt` or use POSIX-only locking, shell quoting, path, process, or `/tmp` assumptions.
4. Reuse `byteHash`, `writeFileAtomic`, YAML parsing, Forge config discovery, standard command envelopes, and existing git-process patterns. Do not add a second hash or atomic-write helper.
5. The control plane validates and writes governance artifacts only. It must not invoke implementation commands, `git commit`, `ecosystem.commit`, `mission.git.commit`, `spec.materialize`, RFC skills, or deployment/provider operations.
6. No force, ignore, waive, suppress, warn-only, compatibility, auto-takeover, or self-sealing flag exists.
7. Raw lease tokens are returned exactly once from lease start, never logged or written to tracked files, and compared through their stored digest thereafter.
8. Packet 000 is the sole bootstrap. Its seal authority is the committed plan for accepted RFC-0856; successful genesis completion irreversibly disables bootstrap mode.
9. Source owners are changed before generated projections. `command.manifest.generate` and `ecosystem.manifest.generate` are separate mandatory commands.
10. Every code phase is committed through `ecosystem.commit`; raw `git commit` is forbidden.

## 3. Contract and file map

### 3.1 New Forge module

Create a focused module under `packages/forge/os/program/`:

```text
packages/forge/os/program/
  program.module.ts
  index.ts
  types.ts
  schemas.ts
  discovery.ts
  decision-resolver.ts
  git-boundaries.ts
  path-policy.ts
  lease-store.ts
  transitions.ts
  handlers/
    validate.ts
    seal.ts
    lease.ts
    complete.ts
```

Responsibilities are strict:

- `types.ts`: exported versioned domain contracts only.
- `schemas.ts`: strict runtime schemas, closed enums/patterns, cross-field refinements.
- `discovery.ts`: program/packet/report discovery below the configured repository root.
- `decision-resolver.ts`: repository RFC and qualified spec lookup through actual RFC/spec projections.
- `git-boundaries.ts`: read-only git identity, ancestry, commit-range, blob-byte, and changed-path inspection using argument arrays.
- `path-policy.ts`: repository-relative real-path normalization and allow/deny matching.
- `lease-store.ts`: untracked atomic local state, token hashing, heartbeat, timeout, release, and recovery preconditions.
- `transitions.ts`: pure phase validation and mutation preparation.
- handlers: CLI parsing, standard envelope, calls to pure contracts, and atomic owner-file writes.
- `program.module.ts`: the four command registrations and metadata.

New non-trivial source files carry valid Compass `MODULE_CONTRACT` and `CHANGE_SUMMARY`; high-risk transition/path/token files also carry precise `@ai-invariant` statements.

### 3.2 Existing owner files

| Path | Change |
| --- | --- |
| `packages/forge/package.json` | export the program module/subpath and include runtime files in the package |
| `packages/forge/src/index.ts` | export public program types/schemas only if consistent with existing root API policy |
| `packages/werkstatt/src/workshop/templates.ts` | register `forge-program` in newly scaffolded workshops |
| `packages/werkstatt/test-fixtures/fixture-workshop/tools/kernel.config.ts` | keep the fixture workshop registration truthful if owned by the template contract |
| `tools/kernel.config.ts` | register `forge-program` in this workshop |
| `.gitignore` | add only anchored `/.forge/program-leases/` |
| `docs/plans/agent-runtime-certification/**` | real RFC-0855 fixtures consumed by packet-000 tests and genesis import |

Do not modify generated manifests by hand.

### 3.3 Test ownership

Create focused tests under `packages/forge/src/tests/`:

```text
program-schemas.test.ts
program-decision-resolver.test.ts
program-packet-validation.test.ts
program-packet-transitions.test.ts
program-packet-lease.test.ts
program-packet-paths.test.ts
program-packet-git.test.ts
program-packet-pbt.test.ts
program-packet-bootstrap.test.ts
```

Use temporary directories from the platform API, explicit local git fixtures, deterministic clocks/token sources, and existing Vitest + fast-check conventions. Tests must run without network access.

## 4. Effective contract matrix

### 4.1 Governing-decision resolution

`governingDecision` accepts exactly two lexical families:

```ts
type RepositoryRfcRef = `RFC-${string}`;
type QualifiedSpecDecisionRef = `${string}/${string}`;
type GoverningDecisionRef = RepositoryRfcRef | QualifiedSpecDecisionRef;
```

The TypeScript strings are convenience types only. Runtime schemas close the real vocabulary:

- repository RFC: `^RFC-\d{4}$`, resolving to exactly one RFC document;
- qualified decision: split on the final `/`; the prefix must resolve to one accepted spec and the suffix must equal one effective roadmap node ID or amendment ID found in that spec;
- unknown spec, unknown node/amendment, ambiguous mapping, duplicate RFC claim, or hand-written projection mismatch is `PROGRAM-PACKET-03`, never heuristic selection.

The resolver returns:

```ts
interface ResolvedGoverningDecisionV1 {
  reference: GoverningDecisionRef;
  kind: "rfc" | "spec-node" | "spec-amendment";
  resolvedRfc: RepositoryRfcRef | null;
  status: string;
}
```

Rules by phase:

| Kind | Draft | Preparation | Sealed/active/completion |
| --- | --- | --- | --- |
| RFC | exact RFC exists; status reported | no governance mutation | RFC accepted/implemented; direct implementation dependencies implemented |
| spec amendment | exact amendment exists; `proposed` allowed | one Steward may canonically obtain explicit human acceptance | amendment must be `accepted` |
| spec node | accepted spec and exact effective node; `materializedAs` may be null | front verification, canonical materialization and RFC governance | exactly one reciprocal accepted/implemented RFC; all derived direct dependencies implemented |

Stable spec-node references are never rewritten to assigned RFC IDs. `resolvedRfc` is a checked projection.

### 4.2 Schemas

Implement strict unknown-key-rejecting schemas for:

- `forge/program@1` — program RFC, branch, state, current packet, ordered packet index;
- `forge/program-packet@1` — draft/sealed packet contract from RFC-0855;
- `forge/program-packet-lease@1` — `phase: preparation | execution`, actor, base/seal boundary, token hash, timestamps, timeout;
- `forge/program-packet-preparation@1` — complete canonical governance range and materialization/acceptance evidence;
- `forge/program-packet-completion@1` — committed implementation range, validations, diagnostics, recovery status, clean-tree claim;
- recovery record — prior lease digest, observed head, completed stages, discovered decision mapping, chosen continuation target, actor, and reason;
- resolved-decision and command-result data shapes.

All SHA values, IDs, relative paths, actor IDs, timestamps, durations, diagnostic IDs, and arrays have explicit bounds. Empty program/packet lists, duplicate IDs/order, duplicate paths, empty allow-lists, impossible states, and self-referential boundary fields fail schema or phase validation.

### 4.3 State model

```text
draft
  -> preparation-active -> preparation-pending-seal -> sealed
  -> sealed (ordinary RFC packet with no preparation range)
sealed -> execution-active -> completion-pending -> completed
preparation-active/execution-active -> timed-out -> recovered-blocked or resumable
```

The public packet states remain `draft | sealed | active | completed | blocked`; preparation and pending states are validated projections from leases plus tracked artifacts, not extra loosely editable manifest states.

### 4.4 Commit boundaries

- Ordinary seal: `HEAD` equals predecessor completion `baseCommit`.
- Prepared seal: `baseCommit` is an ancestor of `HEAD`; one live matching preparation lease covers every intervening governance commit; all paths fit the derived semantic allow-list; history is linear and unrevised.
- Seal command writes pending packet/manifest/preparation artifacts atomically but does not commit them.
- Preparation lease release requires `HEAD` to be the commit that introduced all pending seal artifacts.
- Execution start requires that seal commit, no preparation lease, and `executor !== steward`.
- Complete writes pending completion/manifest artifacts but not their commit.
- Execution lease release requires `HEAD` to be the completion commit.
- The next packet resolves that completion commit from git and uses it as `baseCommit`.

No artifact embeds the hash of the commit that contains itself.

### 4.5 Deterministic JIT dependencies

For a materialized spec-node RFC, validation derives direct `dependsOn` in this order:

1. materialized RFCs of every direct effective-spec dependency, preserving spec order;
2. the immediately preceding program packet's resolved RFC, appended if absent;
3. stable first-occurrence de-duplication.

Every result must be implemented before sealing. A dependency that cannot resolve to a repository RFC, an order mismatch, or different RFC frontmatter fails preparation.

### 4.6 Path and secret policy

- Resolve the repository root once; reject paths outside it, absolute packet paths, `..`, symlink escapes, case-fold collisions, and separator ambiguity.
- Match both added and deleted/renamed sides of a diff. Generated files and `ecosystem.commit` split ranges remain visible.
- Derive preparation roles from the selected decision and collapse them to exact observed paths in the preparation report.
- Never include `.env*`, credentials, provider payloads, prompts, raw tokens, or lease-exchange data in tracked evidence or logs.
- Store only token hashes below ignored `/.forge/program-leases/<program>/` through atomic writes with restrictive permissions where the platform supports them.

## 5. Step sequence

### Step 0. Preflight and fixture freeze

**Goal:** Start packet 000 only from the committed RFC-0855 charter and complete draft fixture set.

**Agent actions:**

1. Require RFC-0855 `status: implemented`, RFC-0856 `status: accepted`, RFC-0857 `status: accepted`, and reciprocal amendment metadata.
2. Read this plan, the three RFCs, the RFC-0855 plan, program README/manifest/template, all 25 packets, and preparation/completion/recovery templates.
3. Record the current branch and commit. Require `program/agent-runtime-certification-cutover` and clean monorepo/mission/cache-clone trees.
4. Run the RFC-0855 pre-implementation fixture validator and record its pass output.
5. Append a `Bootstrap fixture freeze` record to this plan naming the RFC-0855 implementation/stamp boundary, exact program-manifest digest, ordered packet-path digest, and validation command. Commit that plan-only update through `ecosystem.commit`; the resulting commit—made after charter completion and immediately before RFC-0856 implementation—is the sole bootstrap seal authority. Do not embed that commit's own SHA in the plan.
6. Confirm no `/.forge/program-leases/` tracked entry and no program module/command already exists.

**Validation:**

```sh
rtk pnpm exec werkstatt run rfc.validate --id RFC-0855 --json
rtk pnpm exec werkstatt run rfc.validate --id RFC-0856 --json
rtk pnpm exec werkstatt run rfc.validate --id RFC-0857 --json
rtk pnpm exec werkstatt run spec.validate --spec=werkstatt-release-certification --json
rtk bash scripts/check-clean-trees.sh
```

**Completion criterion:** The accepted decisions, post-charter bootstrap-freeze plan commit, complete fixture set, branch, and clean boundary are proven; no unrelated commit lies between the freeze and the first RFC-0856 implementation commit.

**Human review:** No. This is verification of already accepted decisions.

---

### Step 1. Implement strict schemas and pure discovery

**Goal:** Establish the closed data model before any mutation command exists.

**Agent actions:**

1. Create `types.ts`, `schemas.ts`, and `discovery.ts` with the contracts in section 4.
2. Parse YAML/JSON with strict schemas and stable diagnostics; preserve exact committed bytes separately from semantic parsing.
3. Validate program order, path uniqueness, predecessor chain, current packet, state coherence, packet/frontmatter agreement, bounded arrays, and template-vs-live-record roles.
4. Discover program roots only below `docs/plans/`; reject ambiguous duplicate manifests or packet IDs.
5. Export only stable public contracts through the program subpath.

**Validation:**

```sh
rtk pnpm --filter @warpgogol/forge exec vitest run src/tests/program-schemas.test.ts
rtk pnpm --filter @warpgogol/forge run build:check
```

**Completion criterion:** All strict schemas reject unknown/impossible states and parse the real RFC-0855 draft fixtures.

**Human review:** No.

---

### Step 2. Implement generic decision resolution

**Goal:** Resolve authority from repository truth without CERT-specific code or manual projections.

**Agent actions:**

1. Implement final-slash qualified-ref parsing and exact accepted-spec lookup.
2. Resolve effective node/amendment IDs from `forge-spec.yaml` plus accepted amendments using existing spec readers where possible.
3. Verify reciprocal `materializedAs`/`specRef`, uniqueness, RFC status, audit/enhance/plan existence, and direct dependencies by phase.
4. Implement the ordered de-duplicated JIT dependency derivation and compare it with RFC frontmatter.
5. Make packet 040's amendment flow explicit: draft `proposed`; preparation obtains human acceptance; sealed requires `accepted`.

**Validation:**

```sh
rtk pnpm --filter @warpgogol/forge exec vitest run src/tests/program-decision-resolver.test.ts
rtk pnpm --filter @warpgogol/forge run build:check
```

**Completion criterion:** Repository RFCs, AMD-007, CERT nodes, and non-CERT spec-node vocabularies resolve deterministically; unknown/ambiguous/one-way mappings fail.

**Human review:** Yes. Review that Forge code is domain-neutral and that proposed amendment status is accepted only in draft/preparation, never at seal.

---

### Step 3. Implement git, hash, and path boundary primitives

**Goal:** Make committed identity, ancestry, and file ownership exact across platforms.

**Agent actions:**

1. Implement git reads with argument arrays: resolve commits, read committed blobs, ancestry, first-parent linearity, changed paths/status, rename/delete sides, and commit ranges.
2. Hash exact committed blob bytes with existing `byteHash`; normalize only the hash prefix representation required by packet schemas, never file content.
3. Implement repository-relative real-path checks, separator normalization, case-collision detection, symlink escape rejection, and bounded allow/deny matching.
4. Make all helpers pure/read-only and independently testable. No shell interpolation or mutation command belongs here.

**Validation:**

```sh
rtk pnpm --filter @warpgogol/forge exec vitest run src/tests/program-packet-git.test.ts src/tests/program-packet-paths.test.ts
rtk pnpm --filter @warpgogol/forge run build:check
```

**Completion criterion:** Linux and simulated Windows path/git cases, exact-byte hash vectors, renames, deletes, symlinks, traversal, and rewritten ancestry have deterministic results.

**Human review:** No.

---

### Step 4. Implement phase-aware lease storage and recovery

**Goal:** Guarantee one local preparation or execution owner across commands and agent turns.

**Agent actions:**

1. Add anchored `/.forge/program-leases/` ignore entry after verifying no conflicting historical purpose.
2. Implement atomic exclusive start with `phase`, actor, base/seal boundary, token hash, heartbeat, and timeout.
3. Return the raw token only in the successful start JSON data. Redact it from pretty logs, errors, reports, recovery records, and tracked-file scans.
4. Enforce heartbeat/token matching, no phase overlap, no second start, no automatic stale takeover, and release only after the required committed boundary.
5. Implement `recover` as a Steward-only timed-out transition that writes a tracked pending recovery record and never deletes/rebases/resets canonical work.
6. Permit resume only from a validated canonical preparation/implementation head consistent with the record.

**Validation:**

```sh
rtk pnpm --filter @warpgogol/forge exec vitest run src/tests/program-packet-lease.test.ts
rtk pnpm --filter @warpgogol/forge run build:check
```

**Completion criterion:** Race, heartbeat, mismatch, timeout, recovery, resume, release, redaction, and interrupted-write tests pass with no raw token persistence.

**Human review:** Yes. Review token disclosure and recovery authority because they are security-sensitive governance boundaries.

---

### Step 5. Implement draft/preparation/sealed/active/completion validation

**Goal:** Centralize every transition invariant before exposing mutation handlers.

**Agent actions:**

1. Implement one phase validator returning stable `PROGRAM-PACKET-01..12` diagnostics and safe observed state.
2. Draft: validate schema/order/refs/hashes/placeholders/bounds; allow only schema-defined future nulls.
3. Preparation: require exact predecessor base, one preparation lease, permitted decision kind/status, derived semantic paths, and canonical descendant governance range.
4. Sealed: require accepted/implemented resolved authority, implemented direct dependencies, exact sources, committed seal artifacts, no live preparation lease, and no null base/resolved spec-node RFC.
5. Active: require execution lease, distinct roles, exact seal head/ancestry, and implementation paths inside allow-list/outside forbidden list.
6. Completion: require clean trees, exact implementation head/range, declared validations and diagnostic counts, no unexpected diagnostic, recovery evidence, and distinct Steward.
7. Represent unknown/unavailable/ambiguous facts as fail, never empty success.

**Validation:**

```sh
rtk pnpm --filter @warpgogol/forge exec vitest run src/tests/program-packet-validation.test.ts src/tests/program-packet-transitions.test.ts
rtk pnpm --filter @warpgogol/forge run build:check
```

**Completion criterion:** Every phase and all twelve diagnostic families have positive/negative fixtures, including the complete RFC-0855 program set.

**Human review:** No.

---

### Step 6. Implement the four command handlers

**Goal:** Expose minimal fail-closed commands around the proven contracts.

**Agent actions:**

1. Register `program.packet.validate`, `.seal`, `.lease`, and `.complete` in `program.module.ts` with all RFC-0856/0857 flags and accurate read/write metadata.
2. `validate` is read-only for `draft | preparation | sealed | active | completion`.
3. `seal` validates then atomically writes only pending packet, manifest, and preparation report when applicable; it never commits.
4. `lease` implements start/heartbeat/release/recover and uses one command name for both phases.
5. `complete` validates then atomically writes only pending completion and manifest artifacts; it never commits or releases before the completion commit.
6. Preserve semantic parity between pretty/JSON modes, stable exit 1 for every violation, and standard `filesModified` output for mutations.

**Validation:**

```sh
rtk pnpm --filter @warpgogol/forge exec vitest run src/tests/program-packet-validation.test.ts src/tests/program-packet-transitions.test.ts src/tests/program-packet-lease.test.ts
rtk pnpm --filter @warpgogol/forge run build:check
```

**Completion criterion:** All four commands are registered once, expose the exact flags, mutate only owner files, and fail identically in pretty/JSON modes.

**Human review:** No.

---

### Step 7. Implement and prove the packet-000 bootstrap

**Goal:** Implement and integration-test the only self-hosting boundary without yet mutating the real program state.

**Agent actions:**

1. Implement `complete --bootstrap` as a closed special case requiring program RFC-0855, packet 000, state `preparing`, no predecessor, governing RFC-0856, the committed current plan as seal commit, and the full implementation range descending from it.
2. Validate the real program manifest, packet template, all 25 packets, and all record templates through the newly implemented schemas.
3. In an isolated temporary git fixture populated from those real files, execute bootstrap completion end-to-end and prove the pending genesis report/program transition are exact.
4. Verify a committed simulated genesis makes all bootstrap retries and all non-000/bootstrap-state combinations fail.
5. Leave the real program in `preparing`; its implementation range still needs RFC acceptance evidence, stamp, review/fix, and post-stamp documentation commits.

**Validation:**

```sh
rtk pnpm --filter @warpgogol/forge exec vitest run src/tests/program-packet-bootstrap.test.ts
rtk pnpm --filter @warpgogol/forge exec vitest run src/tests/program-packet-bootstrap.test.ts
```

**Completion criterion:** The bootstrap integration test uses the real packet set, produces one valid simulated genesis completion, and proves every repeat/foreign-state attempt fails; the real manifest remains `preparing`.

**Human review:** Yes. Review the bootstrap predicate and simulated completion before allowing the later real Steward transition.

---

### Step 8. Complete property, race, and adversarial coverage

**Goal:** Prove invariants over reorderings, retries, concurrency, and hostile paths rather than examples alone.

**Agent actions:**

1. Add fast-check properties for strict schema rejection, stable exact-byte digests, reordered YAML/JSON identity changes, idempotent seal/complete retries, and deterministic dependency de-duplication.
2. Add two-start races, interrupted atomic writes, stale recovery, token mismatch/leak scans, history rewrite/merge, split commits, case-only paths, traversal, symlinks, rename/delete, and generated paths.
3. Test empty program, missing files, unavailable git/spec authority, duplicate mappings, proposed/unaccepted decisions, and unknown diagnostics as fail.
4. Test generic PBP-style node IDs to prove no CERT hardcode.

**Validation:**

```sh
rtk pnpm --filter @warpgogol/forge exec vitest run src/tests/program-*.test.ts
rtk pnpm --filter @warpgogol/forge run build:check
```

**Completion criterion:** Unit/property/adversarial suites cover every acceptance criterion and stable diagnostic with deterministic, network-free results.

**Human review:** No.

---

### Step 9. Export and register the module

**Goal:** Make the portable module available in this workshop and every newly scaffolded workshop.

**Agent actions:**

1. Export the Forge program module from `packages/forge/package.json` and the narrow package API.
2. Register `forge-program` in `tools/kernel.config.ts`.
3. Update `packages/werkstatt/src/workshop/templates.ts` first, then regenerate or update its owned fixture through the canonical template workflow. Do not hand-fix only generated output.
4. Update nearest AGENTS instructions for module ownership, roles, leases, and no manual program-state edits.
5. Verify Forge source still has no Werkstatt import.

**Validation:**

```sh
rtk pnpm --filter @warpgogol/forge run build:check
rtk pnpm --filter @warpgogol/werkstatt run build:check
rtk pnpm exec werkstatt run werkstatt.autonomy.validate --json
```

**Completion criterion:** Existing and scaffolded workshop configs load one Forge program module; both impacted packages typecheck; autonomy validation passes.

**Human review:** No.

---

### Step 10. Regenerate command and ecosystem projections

**Goal:** Synchronize distinct generated surfaces from registered owner metadata.

**Agent actions:**

1. Move the four RFC commands from `commands.proposed` to `commands.added` only when their source registrations exist.
2. Run `command.manifest.generate`; never substitute ecosystem generation for it.
3. Run `ecosystem.manifest.generate` after package/module/workshop topology is final.
4. Update Compass and documentation through `fo-doc-audit`, including styling reviewed-no-change if no visual contract changes.

**Validation:**

```sh
rtk pnpm exec werkstatt run command.manifest.generate
rtk pnpm exec werkstatt run ecosystem.manifest.generate
rtk pnpm exec werkstatt run command.manifest.validate
rtk pnpm exec werkstatt run ecosystem.manifest.validate
rtk pnpm exec werkstatt run workspace.surface.validate
rtk pnpm exec werkstatt run compass.validate
```

**Completion criterion:** Four registered commands appear with accurate metadata, ecosystem topology is current, and every drift guard passes.

**Human review:** No.

---

### Step 11. Heavy validation, evidence, review, and fix

**Goal:** Run the complete quality gate before implementation evidence is attached.

**Agent actions:**

1. Run all required checks in section 6 in order; repair every caused failure.
2. Invoke `fo-doc-audit` on the complete implementation range and commit required documentation separately.
3. Invoke `fo-review` from the commit before the first RFC-0856 implementation commit through HEAD.
4. If any finding exists, invoke `fo-fix`, rerun scoped checks, and repeat review up to three cycles. Do not waive cosmetic findings.
5. Inspect the full diff and all commits for raw tokens, secrets, unowned paths, compatibility code, domain-specific resolver branches, and partial generated changes.

**Validation:**

```sh
rtk pnpm --filter @warpgogol/forge run build:check
rtk pnpm --filter @warpgogol/forge exec vitest run src/tests/program-*.test.ts
rtk pnpm --filter @warpgogol/werkstatt run build:check
rtk pnpm exec werkstatt run rfc.validate --id RFC-0856 --json
rtk pnpm exec werkstatt run command.manifest.validate
rtk pnpm exec werkstatt run ecosystem.manifest.validate
rtk pnpm exec werkstatt run compass.validate
rtk bash scripts/check-clean-trees.sh
```

**Completion criterion:** Scoped build/tests and governance validators pass; final review has zero findings; all fixes and doc changes are committed.

**Human review:** Yes. Review security-sensitive token/path/recovery code and the packet-000 genesis range.

---

### Final Step. Acceptance evidence, atomic RFC stamp, and real genesis completion

**Goal:** Prove every RFC-0856 criterion, transition RFC-0856 to implemented, then make the real genesis completion the final canonical boundary.

**Agent actions:**

1. Verify each acceptance criterion semantically and annotate every checkbox with exact `(evidence: ...)` paths and commands.
2. For the bootstrap criterion, cite the real-fixture isolated integration test; do not claim the production genesis already exists.
3. Commit acceptance annotations separately from the later stamp. RFC-0856 has no acceptance probes, so do not fabricate a verification artifact.
4. Run `rfc.implement.stamp --dry-run`, then the real command using the first RFC-0856 implementation commit.
5. Commit the stamped RFC separately through `ecosystem.commit`.
6. Run `fo-doc-audit` after stamping and complete review/fix; commit every resulting owner-doc change before genesis.
7. With a distinct Steward, run the real `program.packet.complete --bootstrap` against the post-charter freeze-plan seal and the final post-audit implementation head. Commit only the pending completion report and program manifest as the genesis completion commit.
8. Release the lease only after validating that committed genesis boundary. Make no later commit before packet 010 sealing; the genesis commit is packet 010's `baseCommit`.
9. Do not archive RFC-0856, its plan, or packet 000. They must remain addressable for packet 010.

**Validation:**

```sh
rtk pnpm exec werkstatt run rfc.implement.stamp --id RFC-0856 --implementation-commit <sha> --dry-run
rtk pnpm exec werkstatt run rfc.implement.stamp --id RFC-0856 --implementation-commit <sha>
rtk pnpm exec werkstatt run rfc.validate --id RFC-0856 --json
rtk pnpm exec werkstatt run program.packet.complete --program=RFC-0855 --packet=000-program-control-plane --bootstrap --seal-commit=<freeze-plan-sha> --implementation-head=<final-pre-genesis-sha> --steward=human:andrii-syrokomskyi --idempotency-key=<key> --json
# Commit only the pending genesis artifacts through ecosystem.commit.
rtk pnpm exec werkstatt run program.packet.validate --program=RFC-0855 --packet=000-program-control-plane --phase=completion --json
rtk git status --short --branch
rtk bash scripts/check-clean-trees.sh
```

**Completion criterion:** RFC-0856 is atomically implemented; its stamp and post-stamp documentation belong to the verified implementation range; genesis completion is the final unique commit; program state is executing at packet 010; all trees are clean.

**Human review:** No new decision; the pre-stamp review verifies implementation of the accepted contract.

## 6. Required validation suite

| Gate | Command | Required result |
| --- | --- | --- |
| Forge typecheck | `pnpm --filter @warpgogol/forge run build:check` | pass |
| Program unit/PBT | `pnpm --filter @warpgogol/forge exec vitest run src/tests/program-*.test.ts` | pass, deterministic |
| Werkstatt typecheck | `pnpm --filter @warpgogol/werkstatt run build:check` | pass |
| Forge autonomy | `pnpm exec werkstatt run werkstatt.autonomy.validate --json` | pass |
| Command projection | generate + `command.manifest.validate` | four accurate commands, no drift |
| Ecosystem projection | generate + `ecosystem.manifest.validate` | module/topology current |
| Workspace surface | `workspace.surface.validate` | pass |
| RFC | `rfc.validate --id RFC-0856 --json` | pass |
| Compass | `compass.validate` | pass |
| Program genesis | packet-000 completion validation | pass, second bootstrap rejected |
| Clean trees | `scripts/check-clean-trees.sh` | monorepo, missions, caches clean |

RFC-0856 has no declared `acceptance:` probes. `rfc.acceptance.run` and `rfc.verification.emit` are not applicable.

## 7. Evidence artifacts

- Program source module and exported strict schemas.
- Unit/property/adversarial tests with packet-000 real fixtures.
- Registered command metadata and regenerated command/ecosystem manifests.
- Anchored ignored lease path with no tracked lease/token files.
- Committed packet-000 genesis completion and program manifest transition.
- Updated AGENTS/Compass documents and final zero-finding review report.
- Inline RFC-0856 acceptance evidence and separate implementation/stamp commits.

## 8. Risk controls

| Risk | Plan control |
| --- | --- |
| Identity theatre | actor strings explicitly governance-only; no production authorization use |
| Concurrent owners | atomic single phase-aware lease; race tests; no automatic takeover |
| Interrupted governance | committed preparation ranges, resumable canonical heads, tracked recovery |
| Self-reference | observed commit boundaries, never own-commit hashes in payload |
| Path escape | real-path containment, both rename sides, case/separator/symlink tests |
| Spec ambiguity | repository-resolved exact node/amendment IDs and reciprocal mapping |
| False readiness | sealed authority/dependencies and predecessor completion are both mandatory |
| Token leakage | one-time return, digest-only storage, output/tracked-file leak tests |
| Cross-platform drift | no shell/POSIX assumptions; simulated Windows path/case tests |
| Bootstrap persistence | state-bound packet-000 special case and explicit negative tests |
| Agent scope expansion | exact paths/diagnostics/ancestry and no force/suppress flags |

## 9. Escalation triggers

Stop implementation and create a superseding/amending RFC instead of working around the contract if:

- a distributed or hostile-user authentication boundary becomes necessary;
- a fifth command or second resolver/lease mechanism is required;
- a packet must execute commands or commit through the control plane;
- the same actor must be Steward and Executor;
- a spec node must be materialized outside canonical `spec.materialize`;
- correct operation requires history rewrite, force, warning suppression, a compatibility path, or tracked raw tokens;
- a new public packet state or self-referential commit field is unavoidable;
- Forge would need a Werkstatt import or POSIX-only behavior.

## 10. Deliberate non-actions

- No runtime/certification/component implementation beyond the governance control plane.
- No packet 010 execution or sealing.
- No AMD-007 acceptance or CERT-node materialization during RFC-0856 implementation.
- No distributed lease, remote coordinator, production credential, or security-authentication claim.
- No full root build; only affected package and governance checks.
- No RFC-0856 probe evidence file because no probes are declared.
