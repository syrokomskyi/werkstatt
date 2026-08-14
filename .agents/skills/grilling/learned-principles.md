# Learned Principles (L2)

Concrete principles distilled from past grilling sessions. Each principle has a condition and a recommended answer. The skill checks these before asking the operator.

<!-- Entries are appended by the skill after meta-analysis and operator approval. -->
<!-- Format:
## <principle title>
- **Condition:** <when this applies>
- **Recommended answer:** <what to recommend>
- **confirmations:** <N>
- **Added:** <date>
-->

## Design transitions for the weakest independent executor

- **Condition:** A multi-step architectural program will be handed across agents, sessions, or capability levels.
- **Recommended answer:** Use one sequential program index and self-contained, hash-bound, fail-closed execution packets. Every packet declares exact prerequisites, allowed files, expected validations, and a completion report; it must not rely on session memory, parallel mutation, or hidden context.
- **confirmations:** 1
- **status:** active
- **Added:** 2026-08-15

## Establish authority before enabling self-evolution

- **Condition:** A system will activate agent-written, third-party, or otherwise dynamically supplied code.
- **Recommended answer:** Implement and independently verify a non-self-modifiable admission authority, sandbox boundary, immutable identity, evidence pipeline, rollback, quarantine, and kill switch before production activation. Until every control exists, dynamic code is limited to a bounded test harness and missing protection fails closed.
- **confirmations:** 1
- **status:** active
- **Added:** 2026-08-15

## Bound forward-only breakage with explicit transition diagnostics

- **Condition:** A forward-only architectural cutover intentionally permits temporary operational unavailability.
- **Recommended answer:** Keep every intermediate packet internally complete and require its declared verification contract to pass. Permit only enumerated transition diagnostics assigned to later packets; unexplained compilation, test, schema, state, or validator failures block handoff.
- **confirmations:** 1
- **status:** active
- **Added:** 2026-08-15
