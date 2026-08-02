---
rfcId: RFC-0657
auditId: AUDIT-RFC-0657-01
date: 2026-08-02
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0657

## Verdict: Needs revision

RFC-0657 directly contradicts RFC-0649 (implemented), which explicitly prohibits retry in `verifyFreshness` — but RFC-0657 does not list RFC-0649 in `amends` or `supersedes`. Without this relationship, both RFCs are simultaneously in force with contradictory mandates. Additionally, the retry schedule has an off-by-one ambiguity (4 delay values for 5 attempts) and `FreshnessRetryConfig` carries speculative generality.

## Mechanical validation (rfc.validate)

Pass — `pnpm exec site-kernel run rfc.validate --id RFC-0657 --json` returns 0 violations. The mechanical validator does not detect semantic contradictions between related RFCs.

## Axis A — Structural completeness

- **Retry schedule ambiguity**: The Decision section says "polls the CDN URL up to 5 times with delays of 3s, 6s, 12s, 24s (total max wait ~45s)". Four delay values for five attempts is ambiguous. The Rollout section says "the retry loop's initial delay of 3 seconds" replaces the 6s sleep — implying the first attempt occurs after 3s. With 3s (initial) + attempt 1 + 6s + attempt 2 + 12s + attempt 3 + 24s + attempt 4, only 4 attempts are accounted for. The 5th attempt's delay is unspecified. The acceptance criterion "retries up to 5 times with exponential backoff (3s, 6s, 12s, 24s)" repeats the same ambiguity. Clarify: is it 5 attempts with 4 inter-attempt delays (3+6+12+24=45s), or 5 attempts including an initial 3s delay plus 4 more delays (needing a 5th delay value)?

- **Existing test impact not acknowledged**: The RFC's acceptance criteria say "Unit tests cover: first-attempt success, retry-then-success, all-attempts-fail, null adapter skip" but do not mention that existing tests in `leitstand-0649-freshness.test.ts` will need modification. The "hash mismatch" test (line 227-266) expects `mockFetch` to be called once and the pipeline to fail immediately — with retry, `mockFetch` will be called multiple times. The RFC should acknowledge that existing RFC-0649 tests require updating.

## Axis B — DNA alignment

- **Contradiction with RFC-0649 without amend/supersede relationship**: RFC-0649 (status: implemented) explicitly prohibits retry in two places:
  - Implementation notes (line 302): "The `verifyFreshness` function MUST use a single HTTP fetch without retry — retry is explicitly rejected by this RFC."
  - nonGoals (line 60): "Does not add retry logic for CDN edge propagation delay — a single fetch after sleep is sufficient for dev channel."
  - Alternatives considered (line 273): "Retry freshness check: ... Rejected for dev channel — the existing 6s sleep after purge is sufficient for dev iterations."

  RFC-0657 proposes exactly what RFC-0649 rejected, but lists RFC-0649 only in `related[]` and leaves `amends: []` and `supersedes: []` empty. Both RFCs would be simultaneously in force with contradictory mandates. RFC-0657 MUST add `amends: [RFC-0649]` to properly reflect that it modifies RFC-0649's freshness check decision. The DNA-49 invariant itself does not specify single-fetch vs retry, so no DNA update is needed — but the RFC-level contradiction must be resolved.

- **`satisfies: [DNA-49]` is correct**: DNA-49 requires CDN freshness verification before the Axiom gate. RFC-0657's retry loop strengthens this verification, so the `satisfies` declaration is valid.

## Axis C — Ecosystem fit

- **Package boundaries**: Correct — change is localized to `packages/os/site-kernel-handoff/src/leitstand/leitstand-commands.ts`. No cross-package imports needed.
- **Pipeline placement**: Correct — the retry loop runs inside `leitstand.dev-deploy` between purge and Axiom gate, not as a separate pipeline step.
- **Command lifecycle**: `commands.changed: [leitstand.dev-deploy]` is correct — the command exists and is being modified.
- **AGENTS.md update not mentioned**: `packages/os/site-kernel-handoff/AGENTS.md` Leitstand section describes the current freshness check behavior. The RFC does not mention updating this file. While the AGENTS.md text is general enough to accommodate retry, the RFC should identify it in the file system responsibilities table if the text needs updating.

## Axis D — Forward-only compliance

No issues. The single-fetch approach is replaced by retry — no compatibility layer, no dual-path, no flag to select old vs new behavior.

## Axis E — Agent-facing policy

- **Contradictory mandates create agent confusion**: An agent implementing RFC-0657 would find RFC-0649's implementation notes saying "MUST use a single HTTP fetch without retry — retry is explicitly rejected." Without `amends: [RFC-0649]`, the agent cannot determine which RFC takes precedence. This is a governance blocker — the amend relationship must be declared before implementation.
- **Status gate**: No self-authorizing language. The RFC correctly states "Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented)."
- **Implementation notes**: Standard boilerplate, references correct governance rules (RFC-0224, RFC-0334).

## Axis F — Pragmatism

- **`FreshnessRetryConfig` is over-designed**: The interface has `maxAttempts`, `initialDelayMs`, `backoffMultiplier`, and `maxDelayMs` fields, but the described behavior uses fixed values (5 attempts, 3s initial, 2x multiplier, 30s max). No caller will pass a custom config — the defaults are the only values. The `maxDelayMs: 30000` field is unused given the described delays (3, 6, 12, 24) never reach 30s. Consider replacing the config interface with hardcoded constants, or at minimum remove `maxDelayMs` since it's never exercised.
- **`retryConfig` parameter on `verifyFreshness`**: The optional `retryConfig?: FreshnessRetryConfig` parameter adds speculative generality. No call site will pass a custom config. The function should use fixed constants internally.

## Axis G — Blind spots

- **CDN serving stale 200 with old hash on all 5 attempts**: The RFC considers this (all-attempts-fail → exit 1) but doesn't describe what the operator should do next. The Risks section mentions "operator re-runs `leitstand.dev-deploy`" but doesn't address the case where the CDN is persistently stale (e.g., purge API returned success but didn't actually purge). A brief note on operator response would help.
- **Test timing**: The retry loop adds up to 45s of `sleep` calls in unit tests. Existing tests use `vi.fn()` for `fetch` but don't mock `sleep`. Tests that exercise the retry-then-success and all-attempts-fail paths will need either mocked timers (`vi.useFakeTimers`) or increased test timeouts. The RFC doesn't mention this testing concern.
- **No mention of `--force-build` interaction**: RFC-0653 introduced `--force-build` to bypass the build-skip cache. The retry loop runs after build, so `--force-build` doesn't directly interact with freshness retry. But the RFC could briefly note that `--force-build` does not affect freshness check behavior.

## Questions for the author

1. Why does RFC-0657 not list RFC-0649 in `amends`? RFC-0649 explicitly prohibits retry in its implementation notes and nonGoals. Without the amend relationship, both RFCs are simultaneously binding with contradictory mandates. Is the intent to amend RFC-0649's no-retry decision, or to fully supersede RFC-0649?

2. What is the exact retry schedule? "Up to 5 times with delays of 3s, 6s, 12s, 24s" has 4 delay values for 5 attempts. Is the first attempt immediate (0s delay) followed by 3s, 6s, 12s, 24s delays? Or is the first attempt after 3s (replacing the 6s sleep) with 4 more attempts after 6s, 12s, 24s, and an unspecified 5th delay?

3. Why does `FreshnessRetryConfig` need `maxDelayMs` and `backoffMultiplier` fields if no caller will pass custom values? Would hardcoded constants (`MAX_ATTEMPTS = 5`, `INITIAL_DELAY_MS = 3000`, `BACKOFF_MULTIPLIER = 2`) be simpler and sufficient?
