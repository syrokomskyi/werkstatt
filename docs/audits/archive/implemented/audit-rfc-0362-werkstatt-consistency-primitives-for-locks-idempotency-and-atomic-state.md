---
rfcId: RFC-0362
auditId: AUDIT-RFC-0362-01
date: 2026-07-09
auditor:
  skill: wg-rfc-audit
  model: unknown
verdict: needs-revision
---

# Audit: RFC-0362

## Verdict: Needs revision

The RFC establishes a critically needed cross-cutting primitive (DNA-51) and the core design is sound: scoped locks, idempotency records, atomic staging. However, it has structural gaps that would cause implementation ambiguity: missing CLI surface and `--json` output shapes, missing file-system responsibility table, missing failure-mode exit codes, and no pipeline placement for `werkstatt.operation.validate`. Several axis-B and axis-E issues also need resolution before acceptance.

## Mechanical validation (rfc.validate)

Pass — all 351 RFCs pass, including RFC-0362.

## Axis A — Structural completeness

1. **CLI surface missing.** The RFC proposes three commands (`werkstatt.lock.status`, `werkstatt.lock.recover`, `werkstatt.operation.validate`) but never shows exact `pnpm exec werkstatt run ...` invocations with flags. The "Design" section describes behavior but does not include a "CLI surface" subsection. Compare RFC-0354 §7, RFC-0355 §5, RFC-0357 §6 — all show exact CLI invocations. **Fix: add a "CLI surface" subsection under Design with exact invocations for all three commands.**

2. **`--json` output shape undocumented.** The RFC mentions no `--json` output for any of the three commands. All Werkstatt commands in RFC-0354..0361 document their `--json` envelope. **Fix: add an "Output format" subsection showing `--json` output for `werkstatt.lock.status`, `werkstatt.lock.recover`, and `werkstatt.operation.validate`.**

3. **File-system responsibility table missing.** The RFC touches `.werkstatt/locks/`, `.werkstatt/operations/`, helper modules in `@gogol/site-kernel-handoff`, and potentially `@gogol/site-kernel`. No table maps paths to roles. **Fix: add a "File system responsibilities" table.**

4. **Failure modes table missing.** The RFC describes failure behavior inline (e.g., "the command exits non-zero and reports the blocking lock") but does not provide a structured failure-mode table with exit codes and messages. **Fix: add a "Failure modes" table.**

5. **TypeScript contracts incomplete.** `WerkstattLock` and `WerkstattOperationRecord` interfaces are defined, but the Zod schemas that would live in `@gogol/ontology` are not shown. Other Werkstatt RFCs (0354, 0355, 0357) all show Zod schemas. **Fix: add Zod schema definitions or explicitly state they are defined in the implementation and validated by `werkstatt.operation.validate`.**

6. **Decision statement is imperative but vague.** "All Werkstatt commands that mutate shared or durable state MUST use three primitives" — this is a constraint, not a decision about what this RFC _introduces_. **Fix: rephrase to "The kernel gains shared lock, idempotency, and atomic-write helpers that all mutating Werkstatt commands MUST use."**

7. **Acceptance criteria are checkable but insufficient.** The criteria cover helpers, commands, and recovery, but do not cover: (a) Zod schema existence in `@gogol/ontology`, (b) pipeline placement of `werkstatt.operation.validate`, (c) `.werkstatt/` gitignore entry, (d) command metadata declaration for lock scopes. **Fix: add missing acceptance criteria.**

8. **Rollout step 6 is vague.** "Promote `werkstatt.operation.validate` to the relevant package/workspace check pipeline once all mutating commands use helpers" — which pipeline? `APPS_CHECK_PIPELINE`? `WORKSPACE_CHECK_PIPELINE`? A new Werkstatt-specific pipeline? **Fix: name the specific pipeline and justify the choice.**

9. **Agent misinterpretation risk not in Risks table.** The Risks table has four entries but none address: agents bypassing helpers by using `writeFile` directly, or agents creating ad-hoc lock files despite the RFC. **Fix: add a risk row for agent bypass.**

## Axis B — DNA alignment

1. **`satisfies: [DNA-51]` is correct and present.** DNA-51 is defined in `docs/architecture-dna.md` at line 213-215 and references this RFC as its establishing RFC. The RFC body's "Architectural fit" section explains how it enforces DNA-51. **Pass.**

2. **`related[]` DNA references (DNA-44..50) are relevant but decorative.** The RFC body does not explain how it _interacts_ with DNA-44..50 beyond listing them. The "Required amendments" section implicitly covers the interaction (each RFC's commands must use the primitives), but the DNA references in `related[]` are not individually explained. **Fix: either remove DNA-44..50 from `related[]` (keeping only RFC references) or add a one-line explanation per DNA invariant in the Architectural fit section.**

3. **DNA-51 entry in `architecture-dna.md` is already present.** The DNA registry at line 213-215 matches the RFC's claims. **Pass.**

4. **No silent DNA conflict.** The RFC does not conflict with any existing DNA invariant. It establishes a new one. **Pass.**

## Axis C — Ecosystem fit

1. **Package boundaries correct.** Helpers go in `@gogol/site-kernel-handoff` (which already owns `handoff.*` commands and bundle I/O). Zod schemas go in `@gogol/ontology`. Command registration goes in `@gogol/site-kernel`. This follows the `packages/* → packages/*` boundary. **Pass.**

2. **`packagesImpacted` is incomplete.** The RFC lists `@gogol/site-kernel`, `@gogol/site-kernel-handoff`, and `@gogol/ontology`. But `werkstatt.operation.validate` is a validation command — it likely belongs in `@gogol/site-kernel-checks` (where all other `*.validate` commands live), not in `@gogol/site-kernel-handoff`. The existing pattern: `handoff.validate` is in `site-kernel-handoff`, but `migrator.validate` is also there. However, workspace-level validators like `naming.policy.validate` (RFC-0361) are in `@gogol/site-kernel-checks`. **Fix: clarify which package owns `werkstatt.operation.validate` — if it's a workspace-level lint/validate, it should be in `@gogol/site-kernel-checks`; add that package to `packagesImpacted`.**

3. **Pipeline placement not specified.** The RFC says "promote to the relevant package/workspace check pipeline" but does not name it. The existing pipelines are: `build.prepare`, `build.check`, `check` (apps-check), `compass`, `integrity.release`. `werkstatt.operation.validate` is a workspace-level static check (scans command metadata), so it belongs in the `check` pipeline or a new Werkstatt-specific pipeline, not in `build.check` (which is per-app). **Fix: name the pipeline and justify.**

4. **Compass sync not addressed.** The RFC introduces new source files in `packages/os/` but does not mention Compass scaffolding (`MODULE_CONTRACT`, `CHANGE_SUMMARY`) for the new helper modules. Per root AGENTS.md Compass document duties, new non-trivial source files in `packages/` need Compass semantic scaffolding. **Fix: add a note in Rollout or Implementation notes that new helper modules must carry Compass markup.**

5. **AGENTS.md update not identified.** The RFC establishes a new workspace-wide rule ("all mutating Werkstatt commands MUST use helpers"). This is a policy that belongs in `packages/AGENTS.md` or root `AGENTS.md`. The RFC does not identify which AGENTS.md file needs updating. **Fix: add a note that `packages/AGENTS.md` (or root) must document the helper requirement.**

6. **Command lifecycle buckets internally consistent.** `commands.proposed` lists three commands; `added`/`changed`/`removed` are empty. This is correct for a draft RFC. **Pass.**

7. **Cosmic naming not applicable.** The RFC does not touch manifests, sections, components, or pages. **N/A.**

## Axis D — Forward-only compliance

1. **No compatibility shims or dual-paths.** The RFC introduces new primitives and requires all mutating commands to use them. There is no "legacy lock file" or "gradual migration" language. **Pass.**

2. **No backward compatibility language.** The RFC does not propose keeping old behavior alive alongside the new one. **Pass.**

3. **Amendment model is correct.** The RFC amends RFC-0354..0361 directly (changing their contracts to require locks/idempotency/atomic writes). It does not add parallel interpretations. The `amendedBy` lists on the amended RFCs are populated (verified: RFC-0354, 0355, 0356, 0357, 0358, 0359, 0361 all list RFC-0362 in `amendedBy`). **Pass.**

4. **No legacy code path maintained behind a flag.** **Pass.**

## Axis E — Agent-facing policy

1. **No self-authorizing language.** The RFC does not say "may proceed while draft" or "implementation can start before acceptance". **Pass.**

2. **Implementation notes lack governance references.** The "Implementation notes for agents" section (lines 253-258) has four bullet points but none reference RFC-0224 (accepted→implemented transition), RFC-0230 (agent surface), RFC-0330 (verification evidence), or RFC-0334 (supersede escalation). Compare RFC-0354, 0355, 0356, 0357 — all have a standard "Implementation notes for agents" section with these references. **Fix: add the standard governance boilerplate: RFC-0224 transition preconditions, RFC-0330 verification evidence, RFC-0334 supersede escalation.**

3. **Anti-fabrication not applicable.** The RFC's acceptance criteria are all code/infrastructure changes, not content authoring. **N/A.**

4. **Storage policy not applicable.** The RFC does not touch client-side persistence, cookies, or user data. Locks and operation records are local filesystem artifacts. **N/A.**

5. **Status gate correct.** RFC is `draft` and the RFC does not claim implementation permission. **Pass.**

## Axis F — Pragmatism

1. **Three commands earn their existence.** `werkstatt.lock.status` (inspection), `werkstatt.lock.recover` (recovery), `werkstatt.operation.validate` (enforcement) are three distinct concerns. None could be a flag on another command. **Pass.**

2. **Lean contracts.** `WerkstattLock` and `WerkstattOperationRecord` are minimal and purpose-built. No speculative generality. **Pass.**

3. **Alternatives section is honest.** Four real alternatives with rejection reasons. **Pass.**

4. **`appsImpacted: []` is correct.** This is a workspace-level infrastructure RFC; no app is directly impacted. **Pass.**

5. **`nonGoals` are meaningful.** Three non-goals: no distributed consensus, no release artifact retention (RFC-0363), no semantic hashing (RFC-0364). All are explicit and reference the correct RFCs. **Pass.**

6. **Existing patterns not checked.** The RFC does not check whether an existing lock/file-write helper in `@gogol/site-kernel-handoff` or `@gogol/site-kernel` can be extended. The `bundle-io.ts` module already has `readLock` and `hashFile` helpers (exported from `site-kernel-handoff/src/index.ts`). The RFC should acknowledge these and explain why they are insufficient. **Fix: add a note in Alternatives or Design that existing `readLock`/`hashFile` helpers are narrow (RFC-0221 transfer-lock only) and the new helpers are general-purpose.**

## Axis G — Blind spots

1. **Performance of `werkstatt.operation.validate` not documented.** The validator "scans the command registry and command-table metadata for mutating Werkstatt commands." How many commands? How fast? Is it a static scan (fast) or does it load all command modules (slow)? **Fix: add a performance note — the validator scans command metadata (static), not command implementations, so cost is O(N) in registered commands, not O(N) in source files.**

2. **False-positive rate not documented.** `werkstatt.operation.validate` flags "direct `writeFile`, `appendFile`, `rename`, or recursive directory moves outside allowlisted helper modules." This will likely produce false positives on legitimate non-Werkstatt file writes (e.g., codegen, build output, test fixtures). **Fix: document the false-positive surface and the suppression mechanism (e.g., allowlist, `// werkstatt:allow-write` comment, or scope limitation to `packages/os/site-kernel-handoff/src/`).**

3. **Edge case: empty `.werkstatt/` on first run.** The RFC does not describe what happens when `.werkstatt/locks/` and `.werkstatt/operations/` do not exist yet. `werkstatt.lock.status` should report "no locks" gracefully, not error. **Fix: add a note that the commands handle empty-state cleanly.**

4. **Edge case: concurrent `werkstatt.lock.recover` calls.** Two operators running recovery simultaneously could race on artifact classification. **Fix: add a note that `werkstatt.lock.recover` itself acquires a meta-lock or is otherwise serialized.**

5. **Cross-platform behavior.** The Risks table mentions "Cross-platform rename/fsync behavior differs" but the RFC does not specify which platforms are supported. The project runs on Windows (user's OS) and POSIX (CI). `fs.rename` is atomic on POSIX but not on Windows for existing targets. **Fix: add a note that the atomic-write helper uses `fs.rename` on POSIX and `fs.rename` + fallback on Windows, or specify that directory moves on Windows use a two-phase rename.**

6. **Migration path for existing commands.** The RFC says "Update RFC-0354..0361 command implementations to declare lock scopes and operation ids" (Rollout step 4) but these RFCs are all `accepted`, not `implemented`. There are no command implementations yet. **Fix: clarify that the rollout step applies when those RFCs are implemented — the helpers must exist first, and the command implementations must use them from the start.**

7. **Security/privacy.** Lock files contain `pid`, `command`, `owner`, `startedAt` — no secrets. Operation records contain `inputHash` and `resultHash` — no raw inputs. **Pass.** But the RFC should note that operation records must not log full command arguments (which could contain secrets like `--repo git@...` with embedded tokens). **Fix: add a note that operation records store hashes, not raw input, and that command arguments must be sanitized before hashing.**

## Questions for the author

1. **Which package owns `werkstatt.operation.validate`?** Is it `@gogol/site-kernel-handoff` (alongside the helpers) or `@gogol/site-kernel-checks` (alongside other workspace validators like `naming.policy.validate`)? The choice affects `packagesImpacted` and pipeline placement.

2. **Which pipeline does `werkstatt.operation.validate` belong in?** The `check` pipeline (workspace-level, runs on every `pnpm run check`)? A new Werkstatt-specific pipeline? Or is it only run on-demand during implementation of RFC-0354..0361?

3. **Should `werkstatt.lock.recover` itself acquire a lock?** If recovery removes a stale lock, what prevents two concurrent recovery operations from both classifying and acting on the same artifacts?

4. **What is the allowlist mechanism for `werkstatt.operation.validate`?** How does a legitimate non-Werkstatt file write (e.g., codegen, test fixture) avoid being flagged? Is it path-scoped (only `packages/os/site-kernel-handoff/src/`), comment-based, or module-based?

5. **How are operation-record hashes computed?** The RFC says `inputHash` and `resultHash` but does not specify the hashing algorithm or the canonical serialization. Should this use `@gogol/fingerprint` (RFC-0364) or raw `sha256`?
