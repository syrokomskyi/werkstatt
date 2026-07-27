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

## External package preference

- **Condition:** When implementing functionality that has existing external packages/libraries available (protocol, algorithm, utility, standard)
- **Recommended answer:** Always prefer using the external package over implementing from scratch. Never reinvent the wheel. Declare the dependency in package.json.
- **confirmations:** 1
- **Added:** 2026-07-27

## Ephemeral/stub for pilot

- **Condition:** When a protocol or feature requires long-running processes but the implementation target is CLI commands (ephemeral by nature)
- **Recommended answer:** Implement ephemeral per-command behavior for the pilot. Record state to persistent storage (logs, config files). Defer real-time/daemon behavior to a future phase. This allows testing the data model and CLI surface without the complexity of process management.
- **confirmations:** 2
- **Added:** 2026-07-27
