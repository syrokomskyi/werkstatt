---
rfcId: RFC-0824
auditId: AUDIT-RFC-0824-01
date: 2026-08-13
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0824

## Verdict: Needs revision

The RFC is structurally sound and addresses a real gap (zero service unit tests). However, it contains a factual error about `classifyTier` (services are already discovered by `collectPackageTestSignals` via `discoverWorkspacePackages` — the gap is the missing `services/` branch in `classifyTier`, not collection), a `commands` frontmatter inconsistency (`proposed` and `added` both list `service.test.run` — `proposed` should be empty since the command is new, not being proposed for future addition), and several design gaps around the vitest config approach and `test.signal.policy.validate` extension details.

## Mechanical validation (rfc.validate)

Pass — `rfc.validate --id RFC-0824 --json` returns zero violations.

## Axis A — Structural completeness

- **`commands.proposed` inconsistency:** The frontmatter lists `service.test.run` in both `proposed` and `added`. Per the command lifecycle convention, `proposed` is for commands not yet introduced; `added` is for commands this RFC introduces. Since `service.test.run` is new, it should appear only in `added`, not in `proposed`. The `changed` list (`test.signal.validate`) is correct.
- **`test.signal.policy.validate` extension underspecified:** The Decision (§3) says "`test.signal.policy.validate` extended to enforce owner/rationale/reviewAfter metadata for services with skipped test signals." But the Design section has no detail on how this extension works — the existing `policyDiagnosticForSignal` function in `packages/werkstatt-site/src/checks/test-signal.ts:218-305` already enforces owner/rationale/reviewAfter for all packages with `signal === "skipped"`. Since services are already discovered by `collectPackageTestSignals`, the policy validator already applies to them once `classifyTier` returns a tier for services. The RFC should clarify that no separate extension is needed — the existing policy logic applies automatically once services have a tier classification.
- **Vitest config design is vague:** The Design section proposes a "shared vitest config in `packages/werkstatt-site/src/testing/vitest.config.ts`" but does not specify how `vitest run` in `services/*/package.json` resolves to test files in `packages/werkstatt-site/src/testing/unit/services/<service-id>/`. The `vitest run` command in a service directory will look for test files relative to that service's directory by default. The RFC needs to specify the exact mechanism (e.g. a `vitest.config.ts` in each service that points to the package-level test directory, or a `--config` flag in the test script).

## Axis B — DNA alignment

- **DNA-66 (testing pyramid):** The RFC correctly references DNA-66 and implements the L1 layer for services. The `satisfies: [DNA-66]` field is correct.
- **DNA-41 (PBT):** The RFC mentions service unit tests "may include PBT tests for pure functions" — this is consistent with DNA-41 but does not extend it. Correct.
- **DNA-64 (engine/plugin boundary):** The RFC states `service.test.run` is registered by the site plugin, not the engine. This is correct — the command is in `packages/werkstatt-site/src/checks/`, which is the plugin package.

## Axis C — Ecosystem fit

- **`collectPackageTestSignals` already discovers services:** The RFC's Design section says "The `collectPackageTestSignals` function (or equivalent) is extended to scan `services/*/package.json`." This is misleading — `collectPackageTestSignals` at `packages/werkstatt-site/src/checks/test-signal.ts:186-202` calls `discoverWorkspacePackages(workspaceRoot)`, which reads `pnpm-workspace.yaml`. The workspace file at `pnpm-workspace.yaml:2` already includes `services/*`. So services are already discovered and their test signals are already collected. The actual gap is: (1) `classifyTier` at line 103-114 has no `services/` branch, so services fall through to the default `return 2` path, and (2) no service has a `test` script, so they all get `signal: "absent"`. The RFC should correct this — the extension is to `classifyTier`, not to `collectPackageTestSignals`.
- **Pipeline placement:** The RFC does not specify which pipeline `service.test.run` belongs to. Is it a CI gate? A pre-deploy gate? The `turbo run test` integration is mentioned, but the RFC should clarify whether `service.test.run` is also wired into `services.check.run` or any build pipeline.
- **`services/AGENTS.md`:** The RFC correctly identifies that `services/AGENTS.md` needs updating with the test requirement. This is consistent with the existing AGENTS.md structure.

## Axis D — Forward-only compliance

- **Grace period is a forward-only concern:** The 2-week grace period where services without test scripts get `warning` (not `error`) diagnostics is a temporary transition, not a permanent dual-path. The RFC states the escalation to errors happens after the grace period. This is acceptable under forward-only discipline — the grace period has a defined end date, not an indefinite compatibility window.
- **No shims or legacy paths:** The RFC does not propose any backward compatibility layers. Clean.

## Axis E — Agent-facing policy

- **Status gate:** The RFC is `draft` and does not contain self-authorizing language. Implementation notes correctly reference RFC-0224 preconditions. No issues.
- **NEEDS CLARIFICATION markers:** No unresolved markers found.
- **Implementation order guidance:** The RFC says "Implementation should start with the `service.test.run` command, then extend `test.signal.validate`, then add `test` scripts to all services." This is a reasonable order but should note that `test.signal.validate` already discovers services — the extension is to `classifyTier`, not to collection.

## Axis F — Pragmatism

- **`service.test.run` vs `pnpm --filter <service> run test`:** The RFC proposes a new kernel command `service.test.run` that runs vitest for a specific service. However, `pnpm --filter <service-id> run test` already does this (once services have `test` scripts). The RFC should justify why a kernel command is needed in addition to the pnpm filter approach. The `--json` output with structured results (`testFiles`, `testsPassed`, `testsFailed`, `failures[]`) is a genuine value-add that `pnpm run test` does not provide — but the RFC should make this case explicitly.
- **Shared vitest config vs per-service config:** The RFC presents two alternatives and chooses the shared config. The chosen approach adds complexity (service id → test directory mapping). A per-service `vitest.config.ts` that points to the package-level test directory is simpler and keeps each service self-contained. The RFC should reconsider — the "avoids duplicating config" argument is weak when each config would be ~5 lines.

## Axis G — Blind spots

- **Test file discovery mechanism:** The RFC does not explain how vitest will discover test files in `packages/werkstatt-site/src/testing/unit/services/<service-id>/` when `vitest run` is executed from a service directory. Vitest's default glob is `**/*.test.ts` relative to the config file location or `root`. If the config is in `packages/werkstatt-site/src/testing/`, vitest will scan that entire directory, not just the service-specific subdirectory. The `--service` filter mechanism is mentioned but not specified.
- **Empty test directory handling:** The RFC says `service.test.run` exits with a warning (not error) if the test directory exists but is empty. But `test.signal.validate` will classify a service with a `test` script but no test files as having a "real" signal (the script exists). There's a gap between "has test script" and "has actual test files" that neither command addresses.
- **`turbo run test` cost:** The RFC does not estimate the CI time impact of adding service tests to `turbo run test`. Since services currently have zero tests, the impact is proportional to the number of test files added. This is worth noting for capacity planning.

## Questions for the author

1. Should `commands.proposed` be empty (since `service.test.run` is in `added`, not proposed for future addition)?
2. Given that `collectPackageTestSignals` already discovers services via `pnpm-workspace.yaml`, should the Design section be corrected to say the extension is to `classifyTier` (adding a `services/` branch), not to `collectPackageTestSignals`?
3. How does `vitest run` in a service directory resolve test files in `packages/werkstatt-site/src/testing/unit/services/<service-id>/`? Is a per-service `vitest.config.ts` simpler than a shared config with a `--service` filter?
4. Does `test.signal.policy.validate` need any extension at all, or does the existing `policyDiagnosticForSignal` logic already enforce owner/rationale/reviewAfter for services once they have a tier classification?
