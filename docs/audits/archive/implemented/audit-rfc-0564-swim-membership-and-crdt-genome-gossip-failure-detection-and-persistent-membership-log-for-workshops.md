---
rfcId: RFC-0564
auditId: AUDIT-RFC-0564-01
date: 2026-07-27
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0564

## Verdict: Needs revision

The RFC is structurally well-formed and fits cleanly into the P2P layer architecture (RFC-0562). However, the `satisfies: [DNA-1]` claim is semantically incorrect (the RFC explicitly states DNA-1 is "unaffected"), the CRDT type underlying the "CRDT Genome" is unspecified — a fundamental design gap for an RFC whose title includes "CRDT Genome" — and the `werkstatt.swim.json` config file creation depends on `werkstatt.network.bootstrap`, a command RFC-0562 explicitly defers. Three blind spots require resolution before implementation planning.

## Mechanical validation (rfc.validate)

Pass — zero violations.

## Axis A — Structural completeness

- **Failure modes** table specifies behavior per condition but does not specify exit codes or warn-vs-fail behavior for the four proposed commands. The audit axis requires "exit codes and warn-vs-fail behavior." For example: does `swim.join` with an unreachable seed exit non-zero? Does `swim.status` with zero peers exit zero (warn) or non-zero (fail)?

## Axis B — DNA alignment

- **`satisfies: [DNA-1]` is semantically incorrect.** The RFC body at line 111 states: "DNA-1 (Monorepo boundary): SWIM membership is per-workshop, not per-site. The monorepo boundary is unaffected." The `satisfies` field requires the RFC to _enforce, protect, or extend_ the invariant. Stating the invariant is "unaffected" means the RFC does not satisfy it — it's merely compatible with it. Either remove DNA-1 from `satisfies` (keep it in `related`), or reframe the architectural fit to explain how per-workshop membership _protects_ the monorepo boundary (e.g., "SWIM membership operates outside the monorepo boundary, ensuring platform code replication (Layer 1) can verify peer identity without coupling site content to membership state").

## Axis C — Ecosystem fit

- **AGENTS.md updates not identified.** The RFC adds a new `packages/os/site-kernel/src/swim/` directory with four commands. The `packages/os/site-kernel/AGENTS.md` should document the SWIM module. The RFC does not mention this.
- **Compass sync not identified.** Adding four new kernel commands (`swim.join`, `swim.leave`, `swim.members`, `swim.status`) affects `docs/ecosystem.generated.yaml` via `ecosystem.manifest.generate`. The RFC does not mention this synchronization step.
- **Command lifecycle** buckets are internally consistent: `proposed` has 4 commands, `added/changed/removed` are empty — correct for a draft. ✓

## Axis D — Forward-only compliance

No issues. No compatibility shims, no dual-paths, no legacy code maintained behind flags.

## Axis E — Agent-facing policy

- **Storage policy for runtime files not fully addressed.** The RFC introduces two persistent files: `werkstatt.swim.json` (config) and `werkstatt.genome.log` (append-only NDJSON). Neither is mentioned in `.gitignore` context. The genome log is per-workshop runtime state — it must not be committed to the platform monorepo. The RFC should state explicitly that both files are workshop-local and gitignored, not tracked in the monorepo. DNA-40 (env-example contract) may apply if `werkstatt.swim.json` references environment variables for bind addresses.
- **Ed25519 signing key management not referenced.** `GenomeLogEntry.signature` requires an Ed25519 keypair per workshop. The RFC does not reference RFC-0558 (identity model) or DNA-34 (VC signing) for key storage and rotation. Where is the workshop's Ed25519 private key stored? Is it the same keypair as the VC identity key from RFC-0558, or a separate SWIM-specific key?

## Axis F — Pragmatism

- **Four commands earn their existence.** `swim.join` (lifecycle entry), `swim.leave` (lifecycle exit), `swim.members` (observability), `swim.status` (self-diagnostic). No command duplicates another's scope. ✓
- **Types are minimal.** `SwimMember`, `SwimConfig`, `SwimMembershipView`, `GenomeLogEntry` are lean. ✓
- **Standard protocol, not custom.** The RFC explicitly uses standard SWIM with Lifeguard extensions, not a custom gossip protocol. ✓
- **`packagesImpacted` is scoped** to `packages/os/site-kernel` only. ✓

## Axis G — Blind spots

- **CRDT type unspecified.** The RFC title and body repeatedly say "CRDT genome log" but never specifies which CRDT type (G-Set, 2P-Set, OR-Set, LWW-Register, etc.). The body says "append-only, merge-free log" (line 107) but then says "CRDT genome log merges — dead workshops that are actually alive transition back to alive" on partition reunion (line 213). This is contradictory: is it merge-free (append-only, no merge semantics) or does it merge (CRDT merge operation)? The RFC must specify the CRDT semantics: what is the merge function, what is the state type, and how are conflicting entries (two workshops observing different statuses for the same member at the same time) resolved?
- **`werkstatt.swim.json` creation depends on an unimplemented command.** The file system responsibilities table says `werkstatt.swim.json` is "Created by `werkstatt.network.bootstrap` (RFC-0562)." But RFC-0562 line 348 explicitly states: "Agents MUST NOT implement the `werkstatt.network.*` commands — they are proposed names only, not implemented in this RFC." This creates a circular dependency: RFC-0564 needs a config file that is created by a command RFC-0562 defers. The RFC must either (a) define its own config creation step within `swim.join`, or (b) state that config creation is out of scope and the file is manually authored for the pilot.
- **Signature verification on restart unspecified.** The RFC says a restarting workshop "Reads `werkstatt.genome.log` to restore membership view" (line 212). Does it verify all signatures on restart? What happens if an entry has an invalid signature (corruption, tampering)? Is the entry skipped, does the log truncate, does the workshop refuse to start?
- **Genome log compaction deferred without scope.** The risks section mentions "log compaction (future RFC) can snapshot the current membership view and truncate old entries." This is acceptable as a future RFC, but the RFC should specify the compaction trigger condition (log size threshold? time-based?) to avoid unbounded growth in the pilot.

## Questions for the author

1. Which CRDT type underlies the genome log? What is the merge function for conflicting membership observations (two workshops seeing the same member as alive and dead simultaneously)?
2. How is `werkstatt.swim.json` created if `werkstatt.network.bootstrap` is not implemented by RFC-0562? Does `swim.join` create it, or is it manually authored for the pilot?
3. Where is the workshop's Ed25519 signing key stored, and is it the same keypair as the VC identity key from RFC-0558? What happens on restart if a genome log entry fails signature verification?
