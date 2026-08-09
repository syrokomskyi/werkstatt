---
rfcId: RFC-0711
auditId: AUDIT-RFC-0711-01
date: 2026-08-06
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0711

## Verdict: Needs revision

RFC-0711 introduces a well-motivated concept (living feature specs) but has a DNA alignment gap (`satisfies: [DNA-55]` is misleading — the RFC extends DNA-55 rather than enforcing it), an unexplained `packagesImpacted` entry, and several blind spots around rejected RFCs, conflict recovery, and the operator confirmation mechanism.

## Mechanical validation (rfc.validate)

Pass — zero violations.

## Axis A — Structural completeness

- **Decision** is clear and present-tense: "Introduce living feature specs at `docs/specs/live/<domain>.md`."
- **CLI surface** shows exact invocations with flags.
- **TypeScript contracts** are minimal type signatures — no speculative generality.
- **File system responsibilities** table names concrete paths.
- **Output format** documents `--json` shape for `spec.live.list` and `spec.live.merge`.
- **Failure modes** specifies warn-vs-fail behavior for conflicts and no-`liveSpec` RFCs.
- **Rollout** describes opt-in behavior, existing RFCs, and initial population.
- **Alternatives considered** has 4 real alternatives with rejection reasons.
- **Risks** includes drift, merge conflicts, and adoption friction.
- **Acceptance criteria** — 11 items, all checkable.
- **Implementation notes** are explicit behavioral rules.
- No issues.

## Axis B — DNA alignment

- **Finding B1:** `satisfies: [DNA-55]` is misleading. DNA-55 defines the spec vendoring contract for **external** specification packages under `docs/specs/<spec-id>/` with immutability, integrity manifests, and `forge-spec.yaml` projections. Living specs are **internal**, mutable, and have a different format (markdown with YAML frontmatter, no integrity manifest). The RFC does not "satisfy" DNA-55 — it **extends** the `docs/specs/` namespace with a new category that is outside DNA-55's current scope. The RFC should either: (a) propose a new DNA invariant (e.g. DNA-61) for living specs and include it in `satisfies[]`, or (b) explicitly state that DNA-55 is extended by this RFC and that the `docs/specs/live/` subdirectory is exempt from SPEC-01..07. The current `satisfies: [DNA-55]` without explanation creates ambiguity about which validation rules apply to `docs/specs/live/`.

## Axis C — Ecosystem fit

- **Finding C1:** `packagesImpacted` lists `packages/os/site-kernel-checks` but does not explain why. The existing `spec.validate` command lives in `packages/forge/os/spec/spec.module.ts` — the natural home for `spec.live.*` commands is the same module. If `spec.live.validate` also lives in `packages/forge`, then `packages/os/site-kernel-checks` is not impacted. The RFC should either remove `packages/os/site-kernel-checks` from `packagesImpacted` or explain what code changes are needed there.
- **Finding C2:** The RFC does not specify which package the `spec.live.*` command handlers live in. Since `spec.validate` is in `packages/forge/os/spec/`, the RFC should state that `spec.live.*` commands are registered in `forgeSpecModule` (or a new `forgeLiveSpecModule`).
- **Finding C3:** `docs.archive` integration: the RFC proposes "Step 7" but `docs.archive` currently runs 6 sub-commands in a loop (`core.module.ts:644-651`). The RFC should clarify whether step 7 is a new sub-command in the loop or a post-loop step that iterates over archived RFCs with `liveSpec` field. The `writes` and `reads` arrays in the `docs.archive` command registration (`core.module.ts:592-613`) need to be updated to include `docs/specs/live/**` — the RFC does not mention this.
- **Finding C4:** The RFC does not mention which `docs/*.xml` Compass documents need synchronization. Adding a new artifact type under `docs/specs/` may require updating `docs/knowledge-graph.xml` or `docs/requirements.xml`.
- **Finding C5:** The RFC does not mention updating root `AGENTS.md` § Spec vendoring (DNA-55) to document the `docs/specs/live/` subdirectory and the distinction between vendored and living specs.

## Axis D — Forward-only compliance

No issues. The `liveSpec` field is opt-in, not a compatibility layer. No legacy code paths are maintained behind a flag. No shims or dual-paths.

## Axis E — Agent-facing policy

- **Finding E1:** Implementation notes reference governance rules generically as "RFC-XXXX" placeholders (lines 332–333) instead of citing specific RFC numbers. The actual RFC for accepted→implemented transition is RFC-0224 (already cited on line 332). The other references should be concrete: RFC-0476 for stamping, RFC-0331 for `--satisfies` requirement, etc.
- **Finding E2:** The RFC says `spec.live.merge` is "semi-automatic: the agent proposes deltas, the operator confirms" (line 160, line 337) but the CLI surface (line 171) shows `pnpm exec werkstatt run spec.live.merge --id RFC-0708` with no `--dry-run` or `--confirm` flag. The confirmation mechanism is unspecified — is it an interactive prompt? A `--dry-run` preview? A separate `spec.live.apply` step? This is a contract gap.

## Axis F — Pragmatism

- **Finding F1:** 4 new commands is justified — `spec.live.merge` has no existing equivalent, and `spec.live.validate` has different rules from `spec.validate` (V-LS-01..05 vs SPEC-01..07). `spec.live.list` and `spec.live.show` are read-only companions consistent with the existing `spec.status` pattern.
- **Finding F2:** `packages/os/site-kernel-checks` in `packagesImpacted` is unexplained (see C1). If the only impact is adding V-LS-01..05 rules, those belong in `packages/forge/os/spec/` alongside the existing SPEC-01..07 rules, not in site-kernel-checks.
- No other issues.

## Axis G — Blind spots

- **Finding G1:** The RFC does not address `rejected` RFCs with `liveSpec` field. `docs.archive` archives RFCs with status `implemented`, `rejected`, and `superseded`. The merge step says "for each archived RFC with a `liveSpec` field" — but `rejected` RFCs should NOT contribute to living specs. The RFC should state that only `implemented` RFCs trigger `spec.live.merge`, not `rejected` or `superseded` (superseded RFCs are handled by the supersession logic).
- **Finding G2:** Conflict recovery is underspecified. The `DeltaConflict` interface has `resolution: "pending" | "resolved"` but the RFC doesn't describe: (a) whether partial application is possible (some deltas applied, some not), (b) how the operator resolves a conflict (edit the living spec manually? re-run `spec.live.merge`?), (c) what state the living spec is in after a conflict (is it written to disk with partial deltas, or not written at all?).
- **Finding G3:** The RFC doesn't mention updating `rfc.validate` to recognize the new `liveSpec` frontmatter field. If `rfc.validate` has a strict frontmatter schema, `liveSpec` would be flagged as an unknown field. The RFC should state whether `rfc.validate` needs to be updated to accept `liveSpec` as an optional field.
- **Finding G4:** Atomic writes: the RFC doesn't mention whether `spec.live.merge` uses `writeFileIfChanged` (the project standard per `packages/AGENTS.md` § Generated file writes) or `writeFileAtomic` for crash safety. A crash mid-merge could leave the living spec in a corrupted state.
- **Finding G5:** The RFC says "Living specs are not governance documents" (line 334) but doesn't specify whether living specs are version-controlled (committed to git) or generated. If they are committed, they need the `GENERATED` header marker per the project's generated-file conventions. If they are hand-maintained, the `history[]` frontmatter field should be append-only. The RFC should clarify the commit strategy.

## Questions for the author

1. Should this RFC propose a new DNA invariant (e.g. DNA-61) for living specs, or should it explicitly amend DNA-55 to include `docs/specs/live/` as an exempt subdirectory? The current `satisfies: [DNA-55]` is ambiguous.
2. What is the operator confirmation mechanism for `spec.live.merge` — interactive prompt, `--dry-run` flag, or a two-step propose/apply flow? The CLI surface doesn't show this.
3. What happens when a `rejected` RFC has a `liveSpec` field — is the merge skipped, or does it produce an error? The `docs.archive` integration says "for each archived RFC" without filtering by status.
4. Which package do the `spec.live.*` command handlers live in — `packages/forge/os/spec/` (alongside `spec.validate`) or `packages/os/site-kernel-checks`? And why is `packages/os/site-kernel-checks` listed in `packagesImpacted`?
5. Does `rfc.validate` need to be updated to recognize `liveSpec` as a valid optional frontmatter field, or will it silently accept unknown fields?
