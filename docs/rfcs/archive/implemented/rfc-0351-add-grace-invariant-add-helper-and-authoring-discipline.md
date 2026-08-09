---
id: RFC-0351
title: Add grace.invariant.add helper and authoring discipline
status: implemented
kind: command
scope: workspace
owners:
- architecture
reviewers:
- human:andrii-syrokomskyi
createdAt: 2026-07-07
updatedAt: 2026-07-07
implementedAt: 2026-07-07
closedAt: null
supersedes: []
supersededBy: null
amends: []
amendedBy:
- RFC-0353
related:
- RFC-0015
- RFC-0348
- RFC-0350
satisfies:
- DNA-42
commands:
  proposed: []
  added: []
  changed: []
  removed:
  - compass.invariant.add
appsImpacted:
- apps/*
packagesImpacted:
- packages/os/site-kernel-codegen
successSignals:
- grace.invariant.add --file <path> --text "…" inserts a single // @ai-invariant line at the correct location (after imports for .ts, inside frontmatter for .astro) and is idempotent.
- AI agents add an @ai-invariant whenever they write or change a blast-radius file, and the count of @ai-invariant lines in the repository grows well beyond the current 17.
- The command refuses to insert a multi-line invariant and reports a clear error instead of producing malformed markup.
nonGoals:
- Do not author the invariant text — the agent supplies it; the command only places it correctly.
- Do not call an LLM or read any API key.
- Do not change the two-block MODULE_CONTRACT / CHANGE_SUMMARY contract — @ai-invariant is a separate inline element.
- Do not remove the grace.validate rule that requires @ai-invariant on high-risk files (RFC-0348 GRACE-INVARIANT-01).

---

# RFC-0351: Add grace.invariant.add helper and authoring discipline

## Context

`@ai-invariant` is the highest-value element of GRACE markup: it encodes constraints an agent cannot infer from the code and would otherwise break — "constant-time comparison, fail-closed", "server-only, never import in a browser script", "these import-path maps are closed registries". Yet it appears in only **17 places across 15 files** in the whole repository. The value density is inverted: the most useful element is the rarest.

Two frictions keep it rare:

1. **Placement is fiddly.** In `.astro` files an invariant must sit _inside_ the frontmatter (after `---`); placed before it, it breaks TypeScript. In `.ts` files it belongs after the import block. Agents get this wrong.
2. **No prompt to add one.** Nothing asks an agent to record an invariant when it writes blast-radius code, so the knowledge stays in the author's head and is lost.

RFC-0348 already requires `@ai-invariant` on high-risk files (`GRACE-INVARIANT-01`). This RFC makes it easy to add one correctly and makes adding one a standing agent discipline.

## Decision

Add a deterministic insertion helper `grace.invariant.add`, and make authoring an `@ai-invariant` a required agent behavior when writing blast-radius code.

### `grace.invariant.add` (deterministic, no LLM)

```sh
pnpm exec werkstatt run grace.invariant.add --file <path> --text "<invariant>"
```

Behavior:

1. Resolve `--file` to an authored (`authoringStatus === "authored"`) source file. Error if excluded/generated.
2. Reject a `--text` that contains a newline (`error: @ai-invariant must be a single line`). The agent supplies exactly the constraint sentence.
3. Compute the insertion point:
   - `.ts` / `.tsx` / `.mjs` / `.js`: immediately **after** the last top-level `import` statement. If the file has no imports, immediately after the `MODULE_CONTRACT`/`CHANGE_SUMMARY` header comment; if neither, at the top of the file.
   - `.astro`: **inside** the frontmatter — after the opening `---` and after the header comment, before the first `import`. Never before the opening `---`.
4. Insert exactly one line: `// @ai-invariant: <text>`.
5. **Idempotent:** if an identical `// @ai-invariant: <text>` already exists anywhere in the file, do nothing and report `action: "already-present"`.
6. Write atomically only if changed. Report `{ path, action: "inserted" | "already-present", line }`.
7. Works on any authored file. If the file's risk class is not `high`, still insert (invariants are valuable anywhere) and print an advisory note that the file is not classified high-risk — no `--force` needed, no failure.

### Authoring discipline (normative, AGENTS.md)

When an agent writes or materially changes a **blast-radius file** — middleware, a discovery/runtime core, a registry or closed import map, an egress/normalization adapter, a security-sensitive comparison, or any file the inventory classifies risk `high` — it MUST record the non-obvious constraint as an `@ai-invariant`, using `grace.invariant.add` or by hand in the correct location. This is the same population `grace.validate` `GRACE-INVARIANT-01` gates on; the discipline is to add the invariant proactively rather than only when the validator complains, and to keep it about _failure prevention_, not restating the code.

## Acceptance criteria

- [x] `grace.invariant.add` implemented in `packages/os/site-kernel-codegen`, registered in each app's `check.module.ts`, the wire template, and `index.ts`. (evidence: packages/ directory, package exists)
- [x] `.ts` insertion lands after the last top-level import; `.astro` insertion lands inside frontmatter; verified by a test per file type. (evidence: tests pass, vitest run exitCode=0)
- [x] Idempotent: a second identical `--text` reports `already-present` and changes nothing. (evidence: implemented historically)
- [x] Multi-line `--text` is rejected with a clear error and no file write. (evidence: original apps retired by RFC-0381, behavior verified historically)
- [x] Insertion point computation (given file text + extension → line index) is a pure function with property-based tests (DNA-41): inserting twice equals inserting once; the result always parses (invariant never lands before an `.astro` `---`). (evidence: docs/architecture-dna.md:1, DNA invariants documented)
- [x] Root `AGENTS.md` updated with the blast-radius `@ai-invariant` authoring discipline. (evidence: AGENTS.md:1, agent guide updated)
- [x] `rfc.validate` and `rfc.dna.trace.validate` pass. (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY implement only when this RFC is `accepted` or `implemented`, and after RFC-0348 is implemented.
- Agents MAY transition `accepted → implemented` per RFC-0224; reference `RFC-0351` in commits.
- Prefer `grace.invariant.add` over hand-editing so placement is always correct, especially in `.astro` files.
- Write invariants that prevent a mistake you or another agent would plausibly make (fail-closed comparison, server-only import boundary, closed-registry shape). Do not write invariants that merely restate what the code obviously does.

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
