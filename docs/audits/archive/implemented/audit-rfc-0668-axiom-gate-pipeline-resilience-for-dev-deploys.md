---
rfcId: RFC-0668
auditId: AUDIT-RFC-0668-01
date: 2026-08-04
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0668

## Verdict: Needs revision

The RFC addresses real production failure modes and the overall design (timeout + retry + pre-flight) is sound. However, several findings need resolution before implementation: the TypeScript contract doesn't match the actual `executeKernelCommand` return pattern, the Chromium pre-flight duplicates an existing RFC-0647 utility, the Rollout references a retired `apps/` path, and DNA-49 (which directly governs `leitstand.dev-deploy`) is missing from `satisfies[]`.

## Mechanical validation (rfc.validate)

Pass — `rfc.validate --id RFC-0668` reports 0 violations.

## Axis A — Structural completeness

- **TypeScript contract doesn't match actual code pattern.** The contract at line 169 shows `catch (err) { if (err.exitCode === 2 ...)` — implying `executeKernelCommand` throws an error with `exitCode`. The actual code at `@/packages/os/site-kernel-handoff/src/leitstand/leitstand-commands.ts:923-932` calls `executeKernelCommand` and receives a result object `{ exitCode, data }` — it does not throw on non-zero exit. The contract should show checking `result.exitCode === 2` on the returned result, not catching a thrown error.
- **`withTimeout` utility origin unspecified.** The TypeScript contract uses `withTimeout(...)` and `TimeoutError` but doesn't state whether these are new utilities to implement, existing imports, or part of a shared package. The File system responsibilities table doesn't list where `withTimeout` lives.
- **Chromium pre-flight code contradicts its own Risks section.** The Design section (line 196) hardcodes `chromium_headless_shell-1228` path. The Risks section (line 248) says "use `playwright.executablePath()` API instead of hardcoding". The Design code should reflect the recommended approach, not the anti-pattern.

## Axis B — DNA alignment

- **DNA-49 missing from `satisfies[]`.** DNA-49 (Fleet propagation) directly governs `leitstand.dev-deploy` — it defines the dev deployment pipeline, CDN purge, freshness verification, and Axiom gate. DNA-48 (Release discipline) is about the release state machine, which dev deploys explicitly do NOT enter (RFC-0628 removed `dev-deployed` from the state machine). The RFC should list DNA-49 in `satisfies[]` as the primary invariant, with DNA-48 as secondary (pipeline reliability enables correct release promotion later).

## Axis C — Ecosystem fit

- **Rollout references retired `apps/axiom/AGENTS.md`.** Line 228 says "Document in `apps/axiom/AGENTS.md` and `packages/os/site-kernel-handoff/AGENTS.md`." The `apps/` directory is retired (RFC-0381). The Axiom adapter lives in `packages/os/site-kernel-checks/src/axiom-adapter.ts`. The correct AGENTS.md to update is `packages/os/site-kernel-checks/AGENTS.md` (which already documents `mission.check` exit codes at line 23).
- **Missing `packages/os/site-kernel-checks/AGENTS.md` in Rollout.** Since `mission.check` lives in `packages/os/site-kernel-checks/src/axiom-adapter.ts`, its AGENTS.md must be updated with the exit code semantics and Chromium pre-flight behavior. The RFC only mentions `site-kernel-handoff/AGENTS.md`.

## Axis D — Forward-only compliance

No issues. The RFC directly amends RFC-0628's pipeline behavior — no compatibility shim, no dual-path, no flag-gated legacy mode.

## Axis E — Agent-facing policy

- **Implementation note about `err.exitCode === 2` is misleading.** Line 270 says "agents MUST check `err.exitCode === 2` specifically, not just `err !== null`." But `executeKernelCommand` returns a result object, not a thrown error. Implementing agents who follow this literally will write `catch (err) { if (err.exitCode === 2) }` which will never trigger. The note should say "check `result.exitCode === 2` on the returned result object."

## Axis F — Pragmatism

- **Chromium pre-flight duplicates RFC-0647.** `packages/os/site-kernel-checks/src/playwright-chromium-ensure.ts` already exports `ensureChromium` — a pure function that launches Chromium to verify and delegates to `preflightChromium` for auto-install. It's used by `build.post` pipeline (step 0) and `mission.materialize`. The RFC should reuse `ensureChromium` instead of creating a new `preflightChromium()` in `axiom-adapter.ts`. The `nonGoals` section should clarify the relationship to RFC-0647.

## Axis G — Blind spots

- **Unexpected exit codes not addressed.** The retry logic handles exit 0 (pass), 1 (violations), 2 (infrastructure). But what about exit code 137 (signal kill), exit code 3+ (unexpected), or no exit code at all (process vanished)? The RFC should specify: treat any non-0, non-1 exit as infrastructure error (retryable), or define a catch-all.
- **Cumulative timeout with retry not addressed.** If the first attempt runs 14 minutes before timing out, and the retry runs another 14 minutes, total pipeline time is 28+ minutes. The RFC should clarify: does the 15-minute timeout apply per-attempt (total worst case = 30 min) or to the entire retry loop (total = 15 min)?
- **Chromium auto-install has no timeout.** The pre-flight code calls `pnpm exec playwright install chromium` which downloads ~100MB. If the download hangs (slow network, proxy), the pre-flight itself could hang indefinitely. The RFC should specify a timeout for the install step or note that the outer 15-minute timeout covers it.
- **`maxDurationMs` default not addressed in Design.** The Problem section (line 107) lists "`maxDurationMs` default too short" as a concrete gap, but the Decision and Design sections don't include a fix for it. The Rollout doesn't mention changing the default. Either this gap is intentionally deferred (should be in `nonGoals`) or the Design is missing a section.

## Questions for the author

1. The existing `ensureChromium` from `packages/os/site-kernel-checks/src/playwright-chromium-ensure.ts` (RFC-0647) already provides Chromium verification + auto-install. Why not reuse it instead of creating a new `preflightChromium()` in `axiom-adapter.ts`?
2. The TypeScript contract shows `catch (err) { if (err.exitCode === 2) }` but `executeKernelCommand` returns `{ exitCode, data }` rather than throwing. Should the retry logic check `result.exitCode === 2` on the returned result? How should the wrapper handle the result-vs-throw discrepancy?
3. The Rollout references `apps/axiom/AGENTS.md` but `apps/` is retired. Should this be `packages/os/site-kernel-checks/AGENTS.md` instead, since that's where `mission.check` (axiom-adapter.ts) lives and where exit codes are already documented?
4. Should DNA-49 (Fleet propagation) be listed in `satisfies[]`? It directly governs `leitstand.dev-deploy`, while DNA-48 is about the release state machine that dev deploys explicitly don't enter.
5. What exit code should `mission.check` return for unexpected failures (signal kill, exit 3+)? Should these be treated as infrastructure errors (retryable) or fatal?
6. Does the 15-minute timeout apply per-attempt (worst case 30 min with retry) or to the total retry loop?
7. The Problem section lists `maxDurationMs` default too short as a gap, but the Design doesn't address it. Is this intentionally deferred (should be in `nonGoals`) or missing from the Design?
