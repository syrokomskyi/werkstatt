---
rfcId: RFC-0381
auditId: AUDIT-RFC-0381-01
date: 2026-07-12
auditor:
  skill: wg-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0381

## Verdict: Needs revision

The RFC is structurally well-organized as an execution-wave pilot and correctly composes the Sternsystem lifecycle end-to-end. However, it has multiple consistency violations against the RFCs it depends on: command invocations use flags and ID formats that don't match the establishing RFCs, the registry entry schema doesn't match RFC-0379, the `--repo` value violates RFC-0354's validation contract, and `commands.changed` is inconsistent with the RFC body's claim that "no new commands are added." The pilot also depends on three draft RFCs (0378, 0379, 0380) but states "all the machinery exists" without declaring them as preconditions.

## Mechanical validation (rfc.validate)

Pass. `pnpm exec site-kernel run rfc.validate RFC-0381 --json` — 0 violations, exit 0.

## Axis A — Structural completeness

- **Decision** is present-tense and clear: "Execute the pilot migration wave for `webgogol-com`."
- **CLI surface** shows exact `pnpm exec site-kernel run …` invocations — but multiple commands use flags not defined in their establishing RFCs (see Axis C for details). The invocations are syntactically plausible but semantically inconsistent with the contracts they invoke.
- **TypeScript contracts** section is absent. This is acceptable only if no command contracts change — but `commands.changed` lists 6 commands, which implies contract changes that should be documented.
- **File system responsibilities** table names concrete paths. No issues.
- **Output format** section is absent. N/A — no new commands, output shapes are defined by the establishing RFCs.
- **Failure modes** specifies per-step abort behavior and alt/main channel rollback. No issues.
- **Rollout** describes pilot-only scope, forward-only, alt-before-main, fleet projection, CI updates. No issues.
- **Alternatives considered** has 5 real alternatives with rejection reasons. No issues.
- **Risks** includes agent misinterpretation, production outage, data loss, lock contention. No issues.
- **Acceptance criteria** are 14 checkable items covering the full pilot scope. No issues.
- **Implementation notes for agents** are explicit MUST/MUST NOT behavioral rules. No issues.

## Axis B — DNA alignment

- **FAIL — DNA-50 missing from `satisfies[]` and `related[]` (significant).** The pilot directly exercises DNA-50 (Notausgang export) in Steps 11–12 and the Architectural fit section explicitly references "DNA-50 (Notausgang export): The pilot generates and validates a Notausgang export from `r000001`." But DNA-50 appears in neither `satisfies[]` nor `related[]` in the frontmatter. It should be in `related[]` at minimum, and arguably in `satisfies[]` since the pilot proves the invariant works end-to-end.
- **FAIL — RFC-0359 and RFC-0380 missing from `related[]` (significant).** The pilot directly exercises `notausgang.export` (RFC-0359) and `notausgang.validate` (RFC-0380) in Steps 11–12. Neither RFC appears in `related[]`. RFC-0380 is especially relevant because it upgrades `notausgang.validate` from shallow existence checks to deep integrity verification — the pilot's Step 12 depends on RFC-0380 being implemented.
- **QUESTIONABLE — `amends` relationship with RFC-0354 and RFC-0356.** The RFC lists both in `amends[]`, and both RFCs list RFC-0381 in their `amendedBy[]`. But the RFC body describes an execution sequence, not a contract change. The only visible contract deviations are:
  - `--repo ../systems-git/webgogol-com` (local path) vs RFC-0354's "valid git URL (SSH or HTTPS)" requirement.
  - `system.pin.yaml` vs RFC-0354's `system.pin.json`.
  - `--site` flag on `sternsystem.extract` vs RFC-0356's `--app` flag.

  If these are intentional contract changes, they must be described in the RFC body. If they are not, the `amends` relationship should be `related` instead.

- **DNA-49 in `related[]` but not `satisfies[]` (minor).** The pilot directly exercises and proves DNA-49 (fleet propagation). Consider adding it to `satisfies[]` alongside DNA-44/46/47/48.
- `satisfies[]` entries (DNA-44, DNA-46, DNA-47, DNA-48) are real DNA invariants, and the RFC body explains how each is exercised. No issues for these.
- The RFC does not establish any new DNA invariant. No issues.
- The RFC does not silently conflict with any existing DNA invariant. No issues.

## Axis C — Ecosystem fit

- **FAIL — `commands.changed` list is inconsistent with RFC body (critical).** The RFC body states: "The pilot is a linear sequence of existing commands. No new commands are added." Yet `commands.changed` lists 6 commands: `sternsystem.extract`, `mission.open`, `mission.materialize`, `mission.build`, `release.publish`, `leitstand.propagate`. If these commands are being modified (e.g., adding `--system` flags, renaming `--app` to `--site`), the changes must be described. If they are only being exercised, `commands.changed` should be empty. The current state is internally inconsistent.
- **FAIL — Registry entry schema mismatch with RFC-0379 (critical).** The "Registry entry after pilot" section shows:
  ```yaml
  deployment:
    adapter: cloudflare-workers
    channels:
      alt:
        workerName: alt-webgogol-com
        url: https://alt.webgogol.com
      main:
        workerName: webgogol-com
        url: https://webgogol.com
    secrets:
      - ref: CLOUDFLARE_API_TOKEN
        scope: workspace
  ```
  RFC-0379's `deploymentConfigSchema` has no top-level `secrets` key — secrets are configured per-channel via `secretsFile: secretRefSchema.optional()`. The `secrets` list with `ref` and `scope` fields is not in any defined schema. This registry entry would fail schema validation.
- **FAIL — `--repo` value violates RFC-0354's contract (critical).** RFC-0354 §2.3 requires: "Valid repo URL. Every `repo` MUST be a valid git URL (SSH or HTTPS)." The pilot uses `--repo ../systems-git/webgogol-com` (a local filesystem path). `sternsystem.validate` enforces this invariant and would reject the entry. Either the RFC must amend RFC-0354 to allow local paths, or the pilot must use a valid SSH/HTTPS URL.
- **FAIL — Pin file extension mismatch (significant).** The RFC's success signals and acceptance criteria reference `system.pin.yaml`, but RFC-0354 §3 defines the pin file as `system.pin.json`. The RFC amends RFC-0354 but does not describe this change. If the pin file is migrating to YAML (per RFC-0376), the RFC should explicitly state this and amend RFC-0354's §3 contract.
- **FAIL — Release ID format inconsistency (significant).** The pilot uses `--release r000001` in multiple commands (Steps 8, 9, 10, 11), but RFC-0357 defines release IDs as `<system-id>-r<NNNNNN>` (e.g., `webgogol-com-r000001`). The short form `r000001` does not match the release ID regex `^[a-z0-9]+(-[a-z0-9]+)*-r\d{6}$` defined in RFC-0357's `ReleaseManifestSchema`.
- **FAIL — Command flags don't match establishing RFCs (significant).** Multiple pilot commands use a `--system` flag that is not defined in their establishing RFCs:
  - `mission.materialize --system webgogol-com --mission …` — RFC-0356 defines `--mission <mission-id>` only.
  - `mission.validate --system webgogol-com --mission …` — RFC-0356 defines `--mission <mission-id>` only.
  - `mission.build --system webgogol-com --mission …` — RFC-0356 defines `--mission <mission-id>` only.
  - `mission.close --system webgogol-com --mission …` — RFC-0355 defines `--mission <mission-id>` only.
  - `release.publish --system webgogol-com --mission … --release …` — RFC-0357 defines `--release <release-id>` only.
  - `leitstand.propagate --system webgogol-com --release …` — RFC-0358 defines `--release <release-id>` only.

  Either these commands are being modified to accept `--system` (which must be described in the RFC body and listed in `commands.changed` with justification), or the pilot invocations are incorrect.

- **FAIL — Compass sync not mentioned (significant).** Removing `apps/` and changing `pnpm-workspace.yaml` is a repository-wide topology change. The RFC does not identify which `docs/*.xml` files need synchronization per the root AGENTS.md Compass document duties. At minimum, `docs/requirements.xml` and `docs/technology.xml` likely reference `apps/*` topology that needs updating.
- **FAIL — AGENTS.md updates not mentioned (significant).** Root `AGENTS.md` states "Deployable sites live in `apps/*`" and `apps/AGENTS.md` contains site-specific rules. After the pilot, these statements need updating. The RFC does not identify which `AGENTS.md` files need rule changes.
- **Pipeline placement**: N/A — no new pipeline checks proposed.
- **Cosmic naming**: N/A — the RFC does not touch manifests or component/section/page contracts.

## Axis D — Forward-only compliance

No issues. The RFC is explicitly forward-only: "Once `apps/webgogol-com/` is removed, there is no rollback path to the `apps/` layout." `apps/` is removed in the same RFC wave, not maintained behind a flag. No compatibility shims, no dual-paths, no grace periods. The Notausgang export and Sternsystem git repo are the safety net, not a backward-compatible fallback.

## Axis E — Agent-facing policy

- **Status gate** is correct: "Agents MAY execute the pilot sequence ONLY when this RFC has status: accepted (or implemented)." No self-authorizing language. No issues.
- **Implementation notes** reference RFC-0224 (accepted→implemented transition), RFC-0334 (supersede escalation), RFC-0330 (verification evidence). No issues.
- **Anti-fabrication**: N/A — acceptance criteria are about command execution and file system state, not content authoring.
- **Storage policy**: N/A — no persistence changes.

No issues.

## Axis F — Pragmatism

- **FAIL — `packagesImpacted` may be inflated (minor).** The RFC lists `@gogol/site-kernel-handoff`, `@gogol/site-kernel`, and `@gogol/ontology` in `packagesImpacted`. But the RFC body describes no code changes to these packages — it is an execution sequence of existing commands. If no code changes are needed, `packagesImpacted` should be empty. If code changes are needed (e.g., fixing bugs found during pilot execution, adding `--system` flags), they should be described.
- **FAIL — `commands.changed` should be empty or described (same as Axis C finding).** The RFC claims "no new commands" but lists 6 changed commands. This is either an inflated list or an undocumented change.
- **Minimal command surface**: Pass — no new commands proposed.
- **Existing patterns**: Pass — the RFC correctly reuses the entire Sternsystem command surface.
- **Scope discipline**: `appsImpacted` is correctly scoped to `apps/webgogol-com`. `nonGoals` are explicit and meaningful. No issues except for `packagesImpacted` above.

## Axis G — Blind spots

- **FAIL — Dependency on draft RFCs not stated (critical).** The Context section claims "All the machinery exists" and lists RFC-0378, RFC-0379 as if they are implemented. But all three are `status: draft`:
  - RFC-0378 (command surface, `--site` flag, `fleet.sites.generate`) — draft
  - RFC-0379 (cloudflare-workers adapter, channel model) — draft
  - RFC-0380 (notausgang.validate deep verification) — draft

  The pilot cannot execute without these RFCs being accepted and implemented. The RFC must declare them as preconditions or dependencies, not claim the machinery already exists.

- **FAIL — Pilot recovery/re-run plan missing (significant).** The failure modes section says "Abort pilot" for each step but does not describe how to recover and re-run after a partial failure. Key questions unanswered:
  - If Step 5 (materialize) fails, should the mission be aborted before re-running?
  - If Step 8 (release publish) succeeds but Step 9 (alt propagation) fails, can the pilot resume from Step 9?
  - If the registry entry was created (Step 1) but extraction failed (Step 3), should the registry entry be removed before re-running?
  - Is the pilot idempotent, or does it require manual cleanup between attempts?
- **FAIL — Interrupted operation handling (significant).** The RFC does not discuss what happens if the pilot is interrupted between steps (e.g., process crash after release publish but before propagation). The RFC-0362 lock and operation record machinery supports recovery, but the RFC does not describe how to use it for pilot resumption.
- **Minor gap — CI workflow files not listed.** The rollout says "CI workflows that reference `apps/webgogol-com` paths are updated" but does not list which specific workflow files (e.g., `.github/workflows/ci.yml`, `.github/workflows/cache-parity.yml`). An agent executing the pilot needs to know which files to update.
- **Minor gap — Secret management details.** The Risks section mentions `CLOUDFLARE_API_TOKEN` but does not specify where it is stored (`.env`? CI secrets?) or confirm its gitignore status. RFC-0379 defines `secretsFile` per channel, but the pilot's registry entry does not use `secretsFile` — it uses an undefined `secrets` list.
- **Performance**: N/A — the pilot is a one-time execution sequence, not a recurring build-time command.
- **False positives**: N/A — no new validators.

## Questions for the author

1. **`commands.changed` classification.** The RFC body says "No new commands are added" and describes the pilot as "a linear sequence of existing commands," but `commands.changed` lists 6 commands. Are these commands being modified (e.g., adding `--system` flags, renaming `--app` to `--site`)? If so, describe the changes. If not, should `commands.changed` be empty?
2. **Registry entry schema.** The "Registry entry after pilot" section uses a `secrets` key at the deployment level with `ref`/`scope` fields. RFC-0379's `deploymentConfigSchema` has no `secrets` key — it uses per-channel `secretsFile`. Should the registry entry match RFC-0379's schema, or is RFC-0379's schema being amended?
3. **`--repo` local path.** RFC-0354 §2.3 requires `repo` to be a valid git URL (SSH or HTTPS). The pilot uses `../systems-git/webgogol-com` (a local path). Should RFC-0354 be amended to allow local paths, or should the pilot use a valid SSH/HTTPS URL?
4. **Pin file extension.** The RFC references `system.pin.yaml` but RFC-0354 defines `system.pin.json`. Is this an intentional amendment to RFC-0354 (migrating to YAML per RFC-0376), or an error? If intentional, the contract change should be described.
5. **Release ID format.** The pilot uses `--release r000001` but RFC-0357 defines release IDs as `<system-id>-r<NNNNNN>` (e.g., `webgogol-com-r000001`). Should the pilot use the full release ID, or is a short form being introduced?
6. **Draft RFC dependencies.** RFC-0378, RFC-0379, and RFC-0380 are all `status: draft`. The Context section says "All the machinery exists." Should the RFC declare these as preconditions and update the Context to reflect that they must be accepted and implemented before the pilot can execute?
7. **DNA-50 and RFC-0359/0380 references.** The pilot exercises the Notausgang export (Steps 11–12) and the Architectural fit section references DNA-50, but DNA-50 is missing from `satisfies[]`/`related[]` and RFC-0359/RFC-0380 are missing from `related[]`. Should these be added?
8. **Pilot recovery plan.** If the pilot fails mid-sequence (e.g., after release publish but before propagation), what is the recovery procedure? Can the pilot resume from the failed step, or must it restart from Step 1? Does the mission need to be aborted and re-opened?
