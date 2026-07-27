---
id: RFC-0153
title: "Harden rfc.validate and rfc.check with lifecycle and referential rules"
status: implemented
kind: command
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-06-04
updatedAt: 2026-06-04
implementedAt: 2026-06-04
closedAt:
supersedes: []
supersededBy:
related:
  - RFC-0001
  - RFC-0003
commands:
  proposed:
    - rfc.check
    - rfc.validate
  added:
    - rfc.check
    - rfc.validate
  changed: []
  removed: []
appsImpacted: []
packagesImpacted:
  - os/site-kernel
successSignals:
  - "rfc.validate alone catches the drift the 2026-06 audit had to find with an out-of-band script (status/date coupling, one-directional supersession, dangling related refs)."
  - "rfc.check no longer reports hundreds of false-positive 'missing' artifacts for glob/placeholder paths."
  - "Validating any RFC has zero filesystem side effects."
nonGoals:
  - "Do not change the RFC frontmatter schema or lifecycle states themselves (that is RFC-0001's domain)."
  - "Do not auto-fix violations — these rules report, a human/agent edits."
---

# RFC-0153: Harden rfc.validate and rfc.check with lifecycle and referential rules

## Context

The 2026-06 RFC consistency audit (`docs/audits/2026-06-rfc-consistency-audit.md`) had to reconcile 109 frontmatter inconsistencies that `rfc.validate` did not catch, using a separate `scripts/rfc-audit.mjs`. Three classes of defect in the current validator (`packages/os/site-kernel/src/rfc/handlers.ts`) made the base drift silently:

1. **Leftover debug code.** `handlers.ts` (the V-11 block) writes `C:/Temp/rfc-debug.json` on _every_ validation that encounters RFC-0100, and leaks `(debug keys: …)` into the user-facing V-11 message. A read-only validate must have no filesystem side effects, and the path is Windows-hardcoded.
2. **V-12 is one-directional.** It only checks `supersededBy → supersedes`, never `supersedes → supersededBy`. The audit found 5 supersession edges with missing back-links that the validator reported as clean.
3. **`rfc.check` C-01 is unusable.** It `fs.access`-tests the "File system responsibilities" table paths verbatim, including globs (`apps/*/…`), placeholders (`apps/<app>/…`, `{lang}`), and prose ("Every generator module") — producing 339 false "missing" artifacts.

The validator also does not encode the lifecycle/referential invariants the audit applied by hand, so the same drift will re-accumulate.

## Decision

`rfc.validate` and `rfc.check` are hardened:

- **Remove the debug block** entirely; validation performs no writes.
- **V-12 becomes bidirectional**: for every `supersedes: [X]`, `X.supersededBy` must equal this RFC; for every `supersededBy: Y`, `Y.supersedes` must include this RFC.
- **V-16 (status ⟺ dates)**: `implemented` requires `implementedAt`; `superseded`/`rejected` require `closedAt`; `closedAt` is forbidden on non-terminal statuses; `implementedAt` is forbidden with `status: accepted`/`draft`.
- **V-17 (strict supersession)**: `supersededBy` set ⟹ `status: superseded`.
- **V-18 (referential integrity of `related[]`)**: every `RFC-XXXX` resolves to an existing RFC; every `DNA-NN`/`AP-NN` resolves against the canonical `architecture-dna.md` / `anti-patterns.md` registries (this would have caught the dangling DNA-37/DNA-38).
- **`rfc.check` C-01** skips or glob-expands non-literal paths (containing `*`, `**`, `<…>`, `{…}`, or whitespace) instead of `fs.access`-ing them verbatim.

The new rules ship as warnings for one release, then errors, so the (now-reconciled) base stays green.

## Acceptance criteria

- [x] The `C:/Temp/rfc-debug.json` write and the `(debug keys: …)` message suffix are removed; `rfc.validate` performs no filesystem writes (verified: file not recreated after a run). (evidence: implemented historically)
- [x] V-12 reports a violation for any one-directional supersedes/supersededBy edge (covered by `src/tests/rfc-validate.test.ts`). (evidence: implemented historically)
- [x] V-16, V-17, V-18 are implemented with documented codes and `--json` output; they reproduce the findings `scripts/rfc-audit.mjs` reports today. (evidence: implemented historically)
- [x] V-18 flags `DNA-37`/`DNA-38` (or any unknown DNA/AP id) referenced in `related[]` until the canonical registry defines them (surfaces 34 dangling DNA refs — canonical `architecture-dna.md` defines only DNA-1..26; → backlog B7). (evidence: docs/architecture-dna.md:1, DNA invariants documented)
- [x] `rfc.check` reports zero violations for glob/placeholder/prose paths in the "File system responsibilities" tables across the current RFC set (false positives 339 → 57; the remaining 57 are genuine stale literal paths in pre-thin-app RFCs). (evidence: original apps retired by RFC-0381, implemented historically)
- [x] `rfc.validate` and `rfc.check` pass on the full RFC set after the 2026-06 audit; `scripts/rfc-audit.mjs` becomes redundant and is removed. — partial: `rfc.validate` passes (new rules ship as warnings); `rfc.check` still reports 57 genuine stale-path misses in historical RFCs (separate content cleanup, not validator logic); `scripts/rfc-audit.mjs` was removed in the RFC-0157 commit (V-19/V-20 there subsume its remaining amends/stray-key checks). (evidence: original apps retired by RFC-0381, behavior verified historically)

## Implementation notes for agents

- The audit's standalone checks in `scripts/rfc-audit.mjs` are the executable specification for V-12 (bidirectional), V-16, V-17, V-18 — port them into `handlers.ts` and delete the script once parity is proven.
- Do not weaken any existing V-01…V-15 rule.
- Keep the new lifecycle rules consistent with the conventions recorded in `docs/audits/2026-06-rfc-consistency-audit.md` ("Conventions applied").

## Backfilled sections (RFC-0366)

The following headings were added when the RFC mini-template was retired. The original command/policy RFC used the mini form, which recorded only Context, Decision, Acceptance criteria, and Implementation notes. These sections satisfy the unified full-template contract without altering the original decision.

## Problem

See the Context section above for the problem this RFC addresses. (This section is required by the unified RFC template; the original mini-RFC recorded the problem within Context.)

## Architectural fit

This RFC aligns with the DNA invariants and related RFCs listed in the frontmatter. (Backfilled during mini-template retirement; original mini-RFC did not include a separate Architectural fit section.)

## Design

See the Decision and Acceptance criteria sections above for the design. (Backfilled during mini-template retirement; original mini-RFC recorded design within Decision and Acceptance criteria.)

## Rollout

Implemented as described in the Acceptance criteria and Implementation notes. (Backfilled during mini-template retirement.)

## Alternatives considered

No alternatives were recorded in the original mini-RFC form. (Backfilled during mini-template retirement.)

## Risks

No additional risks were recorded in the original mini-RFC form. (Backfilled during mini-template retirement.)
