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

## Prefer existing codebase terminology for naming

- **Condition:** When naming a new concept that replaces or extends an existing codebase pattern, and the existing terminology is already used in code (function names, variable names, comments).
- **Recommended answer:** Use the existing terminology. It preserves grep-ability, reduces cognitive load, and avoids introducing a parallel vocabulary for the same concept.
- **confirmations:** 1
- **Added:** 2026-07-28

## Convention over configuration for ordered entries

- **Condition:** When designing an array schema where one entry has a special role (e.g., "primary", "cache", "canonical"), and the order is stable.
- **Recommended answer:** Use positional convention (first entry = special role) instead of an explicit role field. Simpler schema, less to validate, fewer ways to misconfigure.
- **confirmations:** 1
- **Added:** 2026-07-28

## Extend existing validators rather than creating new commands

- **Condition:** When adding validation rules for a new architectural concept, and an existing validator already covers the same domain (e.g., sternsystem.validate for Sternsystem registry).
- **Recommended answer:** Add rules to the existing validator. Avoids command proliferation, keeps all related validation in one place, simplifies pipeline integration.
- **confirmations:** 1
- **Added:** 2026-07-28

## Star topology over full mesh for synchronization

- **Condition:** When designing synchronization between multiple mirrors/endpoints, and one endpoint is the natural hub (e.g., cache clone for mission lifecycle).
- **Recommended answer:** Star topology through the hub endpoint. Simpler than full mesh (N-1 sync paths vs N*(N-1)/2), consistent state propagation, single sync pattern.
- **confirmations:** 1
- **Added:** 2026-07-28
