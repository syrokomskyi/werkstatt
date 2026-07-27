---
rfcId: RFC-0533
auditId: AUDIT-RFC-0533-01
date: 2026-07-26
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0533

## Verdict: Needs revision

The RFC directly contradicts an explicit nonGoal of RFC-0478 ("Does not automate version bumping on commit") without declaring `amends: [RFC-0478]`, declares `versionBump: minor` without registering a migrator per RFC-0479, and the "staged tree" hash computation design conflicts with the existing working-tree-based `resolvePlatformSemanticHash`. These three issues must be resolved before implementation.

## Mechanical validation (rfc.validate)

Pass — `rfc.validate RFC-0533` exits 0 with zero violations.

## Axis A — Structural completeness

**Finding A-1 (note): Handler implementation file not named.** The file system responsibilities table lists `packages/os/site-kernel-checks/src/command-tables/20-ecosystem.ts` for the command entry, but does not name the file where the `runEcosystemCommit` handler function will live (e.g. `packages/os/site-kernel-checks/src/ecosystem-commit.ts`). An implementer would not know where to put the handler.

**Finding A-2 (note): `hooks/pre-commit` script content not specified.** The table says "New versioned file — the pre-commit hook script" but the Design section does not show the script's logic (how it detects platform-scope staged files, how it checks `ECOSYSTEM_COMMIT`, what exact error message it prints). The acceptance criterion says "Hook error message includes the exact `ecosystem.commit` command to run" but the message text is not in the RFC.

**Finding A-3 (note): AGENTS.md not in file system responsibilities table.** The acceptance criteria mention "`AGENTS.md` updated with instructions to use `ecosystem.commit` for platform-scope changes" but the file system responsibilities table does not list `AGENTS.md` as a touched path.

Otherwise: all required sections are present with real content. Decision is in present tense ("The kernel gains…"). CLI surface shows exact invocations with all flags. TypeScript contracts are minimal type signatures. Output format documents `--json` shape with examples. Failure modes table specifies exit codes and `status: "blocked"` behavior. Rollout describes default behavior, existing-operator adoption, and new-operator path. Alternatives considered has six real alternatives with rejection reasons. Risks includes agent misinterpretation risk and env-var bypass. Acceptance criteria are checkable and cover the decision's scope. Implementation notes are explicit behavioral rules with MUST/MAY language.

## Axis B — DNA alignment

**Finding B-1 (fail): `versionBump: minor` without migrator.** RFC-0478 defines `minor = Breaks-B (requires migrator)`. RFC-0479 establishes the migrator registry with a 1:1 RFC-to-migrator mapping. RFC-0533 declares `versionBump: minor` (line 41) but does not register a migrator — the `commands` section (lines 42-48) lists no migrator-related command, and no acceptance criterion mentions `migrator.registry.validate`. The RFC's "Alternatives considered" (line 306) justifies `minor` as "new command, platform behavior change," but RFC-0478's semantics tie `minor` specifically to Breaks-B (data contract break), not to behavioral changes. If no site data contract breaks, `versionBump: patch` is the correct value. If a data contract does break, a migrator must be registered.

**Finding B-2 (pass with note): DNA-53 alignment.** `satisfies: [DNA-53]` is correct — DNA-53 governs semantic fingerprint usage, and the RFC reuses `resolvePlatformSemanticHash` from `bundle-io.ts` which uses `@gogol/fingerprint`. The RFC body (line 129) explains the enforcement mechanism. However, the RFC does not explicitly name `@gogol/fingerprint` or `resolvePlatformSemanticHash` as the hash source — it should, to make the DNA-53 compliance auditable.

## Axis C — Ecosystem fit

**Finding C-1 (fail): Silent conflict with RFC-0478 nonGoal — `amends` relationship missing.** RFC-0478 (`docs/rfcs/archive/implemented/rfc-0478-*.md` line 63) declares as an explicit nonGoal: _"Does not automate version bumping on commit — enforcement is at RFC merge and CI validation time"_. RFC-0533's core decision is to automate version bumping on commit, directly contradicting this nonGoal. Yet `amends: []` (line 22) — RFC-0533 does not declare an amends relationship with RFC-0478. Per forward-only discipline (Axis D), if an RFC changes another RFC's contract (including its nonGoals), it must `amends: [RFC-0478]` to formally modify that nonGoal. This is the most serious ecosystem-fit finding.

**Finding C-2 (note): Compass sync not mentioned.** The RFC changes platform governance (adds PC-04 rule, adds `ecosystem.commit` command) but does not identify which `docs/*.xml` files need synchronization. `docs/verification-plan.xml` likely needs updating to include PC-04 in the verification flow. The root AGENTS.md Compass document duties require this.

**Finding C-3 (pass): Package boundaries and command lifecycle.** `ecosystem.commit` registration in `packages/os/site-kernel-checks/src/command-tables/20-ecosystem.ts` is correct — this is where `ecosystem.manifest.generate` and other ecosystem commands live. PC-04 addition to `packages/os/site-kernel-handoff/src/platform-consistency.ts` is correct — this is where PC-01/02/03 live. `commands.added: [ecosystem.commit]` and `commands.changed: [platform.consistency.validate]` are internally consistent.

**Finding C-4 (note): `packagesImpacted` may be incomplete.** The RFC lists `packages/os/site-kernel-checks` and `packages/os/site-kernel-handoff`. The `ecosystem.commit` handler function will likely live in `packages/os/site-kernel-checks/src/ecosystem.ts` (where other ecosystem handlers are), which is covered. But if the hash computation needs a new function (see Finding G-1), `packages/os/site-kernel-handoff/src/bundle-io.ts` is also impacted — already listed.

## Axis D — Forward-only compliance

**Finding D-1 (fail): Parallel interpretation without `amends`.** RFC-0478's nonGoal says enforcement is "at RFC merge and CI validation time" — manual bump. RFC-0533 introduces automated bump at commit time. Without `amends: [RFC-0478]`, this creates a parallel interpretation of the version-bump workflow (automated vs. manual) rather than changing RFC-0478's contract directly. Per Axis D: "If the RFC amends another RFC, it changes the amended RFC's contract directly — it does not add a parallel interpretation." See Finding C-1.

Otherwise: no backward compatibility layers or dual-path designs. PC-04 is an error from day one with no grace period (line 291). The pre-commit hook is opt-in via `git config core.hooksPath hooks/`, but this is a deployment mechanism, not a compatibility layer — CI (PC-04) catches bypasses. No legacy code paths maintained behind a flag. `git commit` is not deprecated for non-platform paths.

## Axis E — Agent-facing policy

No issues. Status gate is clean — implementation notes (line 340) state "Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented)." Implementation notes reference RFC-0224, RFC-0334, and RFC-0330. The RFC adds explicit agent-facing rules (lines 345-347) distinguishing platform-scope and non-platform-scope commits. No content authoring in acceptance criteria. No persistence/cookie concerns.

## Axis F — Pragmatism

No issues. `ecosystem.commit` earns its existence — it replaces `git commit` for platform scope with atomic version-bump + hash + trailer semantics that no existing command provides. TypeScript contracts are minimal (`EcosystemCommitInput`, `EcosystemCommitResult`, `EcosystemCommitViolation`). The RFC reuses `resolvePlatformSemanticHash` from `bundle-io.ts` rather than proposing a new hash function. `packagesImpacted` lists only the two packages actually touched. `nonGoals` are explicit and meaningful (8 items covering `mission.git.commit` separation, `--bump` flag rejection, staging management, etc.).

## Axis G — Blind spots

**Finding G-1 (fail): "Staged tree" hash vs working-tree hash.** The RFC (line 118) says "Computes the `platformSemanticHash` from the staged tree (after `git add`, before `git commit`)." But the existing `resolvePlatformSemanticHash` in `@/packages/os/site-kernel-handoff/src/bundle-io.ts:110` reads from the working tree (`fingerprintTree(packagesDir, ...)`), not from the git index. If unstaged changes exist in `packages/`, the working-tree hash differs from the staged-tree hash. The RFC must either: (a) specify a new index-based hash function, or (b) clarify that the hash is computed from the working tree (accepting that unstaged changes are included), or (c) require `git stash` of unstaged changes before computing.

**Finding G-2 (fail): Platform scope mismatch with existing hash function.** The RFC defines platform scope as `packages/**`, `integrations/**`, `services/**` (line 110, matching RFC-0364). But `resolvePlatformSemanticHash` (bundle-io.ts:111) only fingerprints `packages/` — it does not cover `integrations/` or `services/`. The RFC's acceptance criterion (line 323) says the hash is "staged-tree hash" but the existing function covers only `packages/`. Either the hash function must be extended, or the RFC must acknowledge the scope gap.

**Finding G-3 (note): PC-04 cutoff mechanism unspecified.** The RFC (line 291) says PC-04 "only checks commits after the implementation date of this RFC" but does not specify how the cutoff is determined — by date string comparison? By a sentinel commit SHA? By a git tag? This is an implementation detail that affects correctness: a date-based cutoff is imprecise (timezone issues), while a SHA-based cutoff is precise but requires recording the implementation commit.

**Finding G-4 (note): `platform-version-log.generated.yaml` write interaction.** Both `ecosystem.commit` (writes log on commit) and `platform.consistency.validate` (writes log on success, line 173 of `platform-consistency.ts`) write to the same file. The RFC does not clarify the interaction: does `ecosystem.commit` replace the `platform.consistency.validate` write, or do they coexist? If `ecosystem.commit` writes the log, then `platform.consistency.validate` running afterward would see `lastHash === currentHash` and `lastVersion === currentVersion` — no drift, no write. This seems correct but should be explicit.

**Finding G-5 (note): Merge commits and cherry-picks.** PC-04 checks git history for `X-Platform-Bump` trailers on commits touching platform scope. The RFC does not address merge commits (which may not carry trailers) or cherry-picks (which preserve trailers but may touch different files). The implementation should specify whether merge commits are skipped or checked, and whether cherry-picked trailers are trusted.

**Finding G-6 (note): `--amend` undo behavior underspecified.** The risks section (line 316) says "`--amend` must undo the previous version bump before applying the new one" but the design section does not specify the undo mechanism. Does it read the previous commit's `X-Platform-Version` trailer and roll back `package.json`? Does it restore `docs/platform-version-log.generated.yaml` to its pre-commit state? What if the previous commit was not an `ecosystem.commit` commit (no `X-Platform-Bump` trailer)?

## Questions for the author

1. Should `amends: [RFC-0478]` be declared? RFC-0478 explicitly states as a nonGoal: "Does not automate version bumping on commit." RFC-0533 automates version bumping on commit, directly contradicting this. Without `amends: [RFC-0478]`, the RFC creates a parallel interpretation rather than formally modifying RFC-0478's contract.

2. Should `versionBump` be `patch` instead of `minor`? RFC-0533 adds a new command and a CI rule but does not break any site data contract (Layer B). Per RFC-0478, `minor` = Breaks-B = requires migrator. If no data contract breaks, `patch` is correct. If `minor` is intentional, a migrator must be registered per RFC-0479.

3. How should `ecosystem.commit` compute the hash — from the git index (staged tree), from the working tree (current `resolvePlatformSemanticHash` behavior), or via a stash-based approach? The existing function reads the working tree, not the staged tree. Should `resolvePlatformSemanticHash` be extended to cover `integrations/` and `services/`, or should `ecosystem.commit` use a separate scope-aware hash?
