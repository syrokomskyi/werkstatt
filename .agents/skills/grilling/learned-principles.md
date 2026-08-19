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

## Copy-paste prompt completeness

- **Condition:** README contains a prompt block designed for the operator to copy and paste into an AI agent chat.
- **Recommended answer:** The prompt must be self-contained — include all identifiers, URLs, and data the agent needs to start. Do not rely on surrounding README text to provide context the prompt needs. Surrounding text is for the human operator; the prompt is for the agent. Do not duplicate information unnecessarily, but ensure the prompt works in isolation.
- **confirmations:** 1
- **Added:** 2026-08-19
