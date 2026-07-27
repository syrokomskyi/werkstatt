# Learned Principles (L2)

Concrete principles distilled from past runs. Each principle has a condition and an action. The skill checks these before asking the operator.

<!-- Entries are appended by the skill after meta-analysis and operator approval. -->
<!-- Format:
## <principle title>
- **Condition:** <when this applies>
- **Action:** <what to do>
- **Pattern:** A | B | C | D
- **Example:** <concrete case>
- **Added:** <date>
- **Confirmations:** N
-->

## Bordbuch events are always dirty after mission.migrate
- **Condition:** Cache clone has uncommitted `bordbuch/events.ndjson` after `mission.migrate` ran
- **Action:** Commit it with `git add bordbuch/events.ndjson && git commit -m "bordbuch: record <event>"` before attempting reconcile
- **Pattern:** C
- **Example:** `mission-migrate` event for rfc-0529 was uncommitted in `systems/webgogol-com/`
- **Added:** 2026-07-26
- **Confirmations:** 1

## Generated files always conflict add/add when cache clone diverged
- **Condition:** Cache clone has accumulated changes from previous missions; workpiece was materialized fresh from pin
- **Action:** Resolve with `git checkout --theirs . && git add -A && git am --continue` — workpiece version is authoritative
- **Pattern:** B
- **Example:** `entitlements.generated.yaml`, `freshness.generated.yaml`, `surface.generated.yaml` all conflicted add/add during m000013 reconcile
- **Added:** 2026-07-26
- **Confirmations:** 1

## mission.validate generates files that need committing
- **Condition:** `mission.validate` ran astro build as part of validation
- **Action:** Check workpiece for dirty files after validation and commit them before reconcile
- **Pattern:** D
- **Example:** 54 files in `public/` modified by astro build during m000013 validation
- **Added:** 2026-07-26
- **Confirmations:** 1
