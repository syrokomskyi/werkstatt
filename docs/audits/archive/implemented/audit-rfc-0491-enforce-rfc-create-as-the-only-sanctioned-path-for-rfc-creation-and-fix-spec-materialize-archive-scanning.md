---
rfcId: RFC-0491
auditId: AUDIT-RFC-0491-01
date: 2026-07-22
auditor:
  skill: fo-idea-audit
  model: unknown
verdict: approved
---

# Audit: RFC-0491

## Verdict: Approved

The RFC addresses a real bug (non-recursive `listRfcFiles` in `spec.materialize`) and a real governance gap (no `rfc.next-id`, no agent instruction). All four proposed changes are well-scoped, forward-only, and pragmatically justified. Two findings need resolution before or during implementation: V-31 retroactivity (existing archived RFCs may have filename/id mismatches that would suddenly fail) and missing generated-file regeneration in the rollout.

## Mechanical validation (rfc.validate)

Pass — `rfc.validate RFC-0491 --json` returns 0 violations.

## Axis A — Structural completeness

- **Minor:** The RFC cites `spec-materialize.ts:71-74` for the local `listRfcFiles` function. The function actually spans lines 71-75 (closing brace on line 75). Off-by-one citation.
- All required sections contain real content. Decision is present tense. CLI surface shows exact invocations. TypeScript contracts are minimal. File system responsibilities table names concrete paths. Alternatives section has five real alternatives with rejection reasons. Acceptance criteria are checkable and cover the full scope. Implementation notes are explicit behavioral rules.

## Axis B — DNA alignment

No issues.

- `satisfies: [DNA-53]` — DNA-53 ("Semantic fingerprint governance") exists in `docs/architecture-dna.md:227-229`. The RFC body explains the connection: "this RFC does not change fingerprint logic, but it protects the integrity of RFC ids which are inputs to the fingerprint system." The link is indirect but valid — RFC ids are inputs to `platformSemanticHash` which covers `docs/rfcs/**` in semantic mode (RFC-0364 §4).
- No new DNA invariant is established. No conflict with existing invariants.
- `related[]` references (RFC-0001, RFC-0329, RFC-0366, RFC-0396, RFC-0478, RFC-0479) are all relevant and correctly cited.

## Axis C — Ecosystem fit

- **Finding:** The RFC does not mention regeneration of generated documentation files. Adding `rfc.next-id` is a command surface change. Per root AGENTS.md, `docs/command-manifest.generated.yaml` and `docs/COMMANDS.md` must be regenerated via `command.manifest.generate` + `docs.commands.generate`. Additionally, `docs/ecosystem.generated.yaml` must be regenerated via `ecosystem.manifest.generate`. The rollout section should list these as explicit steps.
- Package boundaries are correct — all changes are within `packages/forge`. No cross-boundary imports proposed.
- Pipeline placement is correct — `rfc.next-id` is an on-demand query, V-31 joins `rfc.validate` as a post-hoc validator.
- AGENTS.md update is explicitly proposed in the file system responsibilities table.
- Command lifecycle buckets (`proposed: [rfc.next-id]`, `added: [rfc.next-id]`, `changed: [spec.materialize, rfc.validate]`) are internally consistent.

## Axis D — Forward-only compliance

No issues.

- The `spec.materialize` fix deletes the local `listRfcFiles` and replaces it with the shared import — no dual-path, no shim.
- V-31 is additive, not a modification of V-02 (as stated in nonGoals).
- No legacy code path maintained behind a flag.

## Axis E — Agent-facing policy

No issues.

- Status gate is respected: "Agents MAY implement code changes ONLY when this RFC has status: accepted."
- No self-authorizing language.
- Implementation notes are explicit: "Agents MUST use `rfc.create`", "Agents MUST NOT determine RFC numbers by running `ls`, `find`, `grep`."
- The AGENTS.md instruction is advisory + post-hoc validation, not a filesystem lock — consistent with the ecosystem's enforcement model.

## Axis F — Pragmatism

- **Minor:** The RFC does not consider `rfc.list --next-id` as an alternative to a separate `rfc.next-id` command. `rfc.list` already exists and could theoretically accept a `--next-id` flag. However, `rfc.next-id` is semantically distinct (returns a single number, not a list of entries), so a separate command is defensible. The alternatives section addresses `rfc.create --dry-run` but not `rfc.list --next-id`.
- `RfcNextIdResult` type is minimal — five fields, all necessary.
- The `spec.materialize` fix is a one-line import change, exactly as scoped.
- `packagesImpacted: ["@wgogol/forge"]` is correct — only `packages/forge` is touched.

## Axis G — Blind spots

- **Finding (moderate):** V-31 retroactivity is not addressed. The RFC states V-31 reports "both as errors." If any existing RFC file (particularly in `archive/`) has a filename numeric prefix that doesn't match its frontmatter `id`, or if two archived files share the same filename number, `rfc.validate` would suddenly fail with no migration path. The RFC should either (a) scope V-31 to post-cutoff RFCs only (like V-28/V-29 use `RFC_VERSION_BUMP_CUTOFF`), or (b) explicitly state that a pre-implementation scan of the full tree was performed and no mismatches exist, or (c) provide a remediation path for existing mismatches.
- **Minor:** The RFC says "The check iterates all parsed RFC files (already available via `allParsedByFile`)." In the actual code, `validateSingleRfc` receives `allParsed` (keyed by RFC id), not `allParsedByFile` (keyed by filename). Both maps contain the same data, so the implementation is feasible, but the citation is slightly inaccurate. The plan step should clarify which map is used.
- Performance estimate (<100ms for ~500 RFCs) is reasonable — `listRfcFiles` already does this scan in `rfc.list` and `rfc.create`.
- Empty state (no RFC files → `RFC-0001`) is documented.
- Race condition for concurrent `rfc.next-id` calls is acknowledged and correctly dismissed as low-risk.

## Questions for the author

1. **V-31 retroactivity:** Have you verified that no existing RFC files (including in `archive/implemented/` and `archive/superseded/`) have filename/id mismatches or duplicate filename numbers? If mismatches exist, should V-31 be scoped to post-cutoff RFCs (like V-28/V-29) to avoid suddenly breaking `rfc.validate`?
2. **Generated file regeneration:** Should the rollout explicitly list `command.manifest.generate`, `docs.commands.generate`, and `ecosystem.manifest.generate` as required post-implementation steps?
3. **`rfc.list --next-id` alternative:** Why not add a `--next-id` flag to the existing `rfc.list` command instead of creating a separate `rfc.next-id` command? Is the semantic distinction (single number vs. list) strong enough to justify a new command registration?
