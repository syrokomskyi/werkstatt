---
rfcId: RFC-0472
auditId: AUDIT-RFC-0472-01
date: 2026-07-20
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0472

## Verdict: Needs revision

The RFC is structurally sound and well-scoped, with a clear decision, honest alternatives, and explicit agent-facing policy. However, it has two gaps in ecosystem fit: `sternsystem.register` is implicitly changed but not listed in `commands.changed`, and DNA-45's field list needs updating to include `mirror`. A security blind spot around credential-bearing URLs also needs addressing.

## Mechanical validation (rfc.validate)

Pass — 0 violations.

## Axis A — Structural completeness

No issues. All sections contain real content. Decision is a single present-tense sentence. CLI surface shows exact invocations with flags. TypeScript contracts are minimal type signatures. File system responsibilities table names concrete paths. Output format documents both success and failure `--json` shapes. Failure modes specify exit codes and warn-vs-fail behavior. Rollout describes default behavior, adoption path, and new-system compliance. Alternatives: 6 real alternatives with rejection reasons. Risks include agent misinterpretation risk. Acceptance criteria: 13 checkable items. Implementation notes: explicit MUST/MAY rules.

## Axis B — DNA alignment

**Finding B-1 (minor):** DNA-45 text in `docs/architecture-dna.md:197` lists the registry entry fields: "Each entry carries: `id`, `cosmicStar`, `repo`, `pinnedPlatform`, `currentMission`, `lastRelease`, `status`..., `registeredAt`, and `deployment` config." The RFC adds `mirror` to `fleetRegistryEntrySchema` but does not mention that DNA-45's prose needs updating to include `mirror` in this field list. The RFC's `satisfies` includes DNA-45, so it should note this update as an acceptance criterion or in the Architectural fit section.

DNA-44 alignment is correct: the RFC preserves the data-only invariant — `mirror` is repo metadata, not content.

## Axis C — Ecosystem fit

**Finding C-1 (fail):** The Rollout section states "Set `mirror` during `sternsystem.register` if an external repo is available." This implies `sternsystem.register` needs a new `--mirror` flag. However, `commands.changed` only lists `sternsystem.validate`. The `sternsystem.register` command (`packages/os/site-kernel-handoff/src/sternsystem/sternsystem-register.ts:78-88`) constructs the registry entry without a `mirror` field. Either:

- Add `sternsystem.register` to `commands.changed` and add a `--mirror` flag to its schema, or
- Remove the Rollout statement and document that operators set `mirror` by editing `registry.yaml` directly.

**Finding C-2 (minor):** The RFC does not mention which `docs/*.xml` Compass files need synchronization. Since it changes the fleet registry schema and adds a command, `docs/requirements.xml` or `docs/development-plan.xml` may need updates per the root AGENTS.md Compass document duties.

## Axis D — Forward-only compliance

No issues. `mirror` is purely additive — no existing field is removed, renamed, or made optional→required. No compatibility shim or dual-path. No legacy code path maintained behind a flag.

## Axis E — Agent-facing policy

No issues. No self-authorizing language. Implementation notes reference RFC-0224 (accepted→implemented transition) and RFC-0334 (supersede escalation). The explicit "Agents MUST NOT run `sternsystem.sync` automatically after `mission.reconcile`" rule is clear and prevents silent automation. Anti-fabrication and storage policy are not applicable.

## Axis F — Pragmatism

No issues. `sternsystem.sync` earns its existence as a distinct operation — external repo sync cannot be a flag on an existing command. `SternsystemSyncData` is minimal. `nonGoals` are explicit and meaningful (no `--mirror` git flag, no retry, no multiple mirrors). `packagesImpacted` lists exactly the two packages touched. The `mirror` field is a simple optional string — no speculative generality.

## Axis G — Blind spots

**Finding G-1 (minor):** The `mirror` field could contain embedded credentials (e.g., `https://<token>@github.com/...`). The RFC does not address this. The existing `repo` field has the same risk, but since `mirror` is new, the RFC should recommend SSH URLs and note that `sternsystem.validate` could warn if the URL contains credentials. The Risks table does not mention secret leakage via the registry file.

**Finding G-2 (minor):** The RFC does not address the empty-bare-repo edge case. A newly registered system may have a bare repo with no commits yet. `git push mirror master` from an empty repo would fail with "src refspec master does not match any." The Failure modes table should include this case.

**Finding G-3 (minor):** The `sternsystem.validate` mirror warning checks if the remote exists in the bare repo. But for a newly registered system, the bare repo might not exist yet. The RFC should clarify that the mirror remote warning only fires when the bare repo exists (similar to how pin validation only fires for `active` systems in the current code at `sternsystem-validate.ts:188`).

## Questions for the author

1. Should `sternsystem.register` gain a `--mirror` flag, or should operators set `mirror` by editing `registry.yaml` directly? The Rollout section implies the former, but `commands.changed` does not list it.
2. Should DNA-45's prose in `docs/architecture-dna.md` be updated to include `mirror` in the field list, and should this be an acceptance criterion?
3. Should `sternsystem.validate` warn if the `mirror` URL contains embedded credentials (HTTPS with token)?
