---
id: ADR-0025
title: "Require progress logging for long-running pipeline steps"
# Lifecycle (RFC-0367 parity with RFCs):
#   proposed → reviewing → accepted → implemented
#   any → superseded (requires supersededBy)
#   any → rejected
status: proposed
scope: workspace
decider: architecture
createdAt: 2026-08-05
updatedAt: 2026-08-05
implementedAt:
closedAt:
supersedes: []
supersededBy:
related:
  - RFC-0628
  - RFC-0689
reviewers: []
---

# ADR-0025: Require progress logging for long-running pipeline steps

## Context

`leitstand.dev-deploy` (RFC-0628) runs a pipeline of 63 + 41 + Axiom steps that takes 10–15 minutes. Several steps — notably `evidence.sync` (the final step) and the Axiom scan (`mission.check`) — run for several minutes without producing any console output. During mission m000028, agents repeatedly assumed the command was hanging and considered killing it, when in fact it was working normally.

The pipeline executor in `packages/os/site-kernel/src/runtime/execute-pipeline.ts` logs step start/end (`[N/M] step.name …` / `[N/M] step.name — OK 0s`), but individual commands are responsible for their own progress output. Commands that call external tools (Axiom, R2 sync) or perform long I/O operations without intermediate logging appear silent.

## Decision

Pipeline commands that may run for more than 10 seconds MUST emit periodic progress output (at least one line per 30 seconds of silence) to indicate they are still running.

- This is a convention enforced by code review, not a runtime check.
- The `evidence.sync` command in `@warpgogol/site-kernel-handoff` is the first command to adopt this convention.
- The Axiom scan (`mission.check`) already produces progress output via `runAxiomCheck` capture progress logging.

## Justification

Agents and operators monitoring `leitstand.dev-deploy` cannot distinguish a hung process from a long-running silent step. This leads to:

1. Premature termination of working deploys (killing the process loses build artifacts and evidence).
2. Wasted time investigating "hangs" that are normal operation.
3. Reluctance to use `leitstand.dev-deploy` autonomously.

Progress logging is a standard practice for long-running CLI tools. The 30-second interval is chosen because the pipeline executor already logs step transitions — the gap is only within individual steps that take longer than expected.

Alternatives considered:

- **Timeout-based hang detection in the pipeline executor.** Rejected — distinguishing a hang from normal long operation requires domain knowledge that only the command has. A fixed timeout would either be too short (false alarms) or too long (defeats the purpose).
- **Structured progress events via a shared event emitter.** Rejected — over-engineered for a convention that only affects 2–3 commands. Simple `logger.info()` calls are sufficient.

## Consequences

- **Positive:** Agents and operators can distinguish running steps from hung processes. `leitstand.dev-deploy` can be used autonomously without kill-retry cycles.
- **Negative:** Commands that don't naturally produce intermediate output must add periodic `logger.info()` calls, which is minor implementation overhead.
- **Technical debt:** The 10-second threshold and 30-second interval are not enforced at runtime. Future commands may silently violate the convention. If this becomes a recurring problem, a runtime check (e.g. a watchdog timer in the pipeline executor) should be considered.

## Evolution

If more than 2 commands violate this convention within a 3-month period, escalate to an RFC that adds a runtime watchdog timer to the pipeline executor. The watchdog would log a warning after 30 seconds of silence from any step and a timeout error after a configurable maximum (default: 5 minutes).

References: `evidence.sync` in `packages/os/site-kernel-handoff/src/leitstand/leitstand-commands.ts` — the first command to adopt this convention (implemented alongside RFC-0689).
