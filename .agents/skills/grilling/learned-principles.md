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
