# Learned Principles (L2)

Concrete principles distilled from past mission completion runs. Each principle has a condition and an action. The skill checks these before asking the operator.

<!-- Entries are appended by the skill after meta-analysis and operator approval. -->
<!-- Format:
## <principle title>
- **Code:** MC-XX
- **Condition:** <when this applies>
- **Action:** <what to do>
- **Added:** <date>
- **Confirmations:** N
-->

## Always commit bordbuch before reconcile

- **Code:** MC-01
- **Condition:** Cache clone has uncommitted `bordbuch/events.ndjson` after mission.open
- **Action:** Commit bordbuch in `systems/<id>/` before running reconcile. Bordbuch entries from mission.open are expected and safe to commit
- **Added:** 2026-07-26
- **Confirmations:** 1

## Generated files are authoritative from workpiece

- **Code:** MC-02
- **Condition:** Add/add conflict on `*.generated.*` files during git am
- **Action:** Always take theirs (workpiece version). Generated files are deterministic outputs from the latest build.prepare run — the workpiece version is always more recent than the cache clone version
- **Added:** 2026-07-26
- **Confirmations:** 1

## Full workflow: validate → reconcile → release.prepare → close

- **Code:** MC-03
- **Condition:** Operator asks to "complete" or "finish" or "close" a mission
- **Action:** Run the full sequence: mission.validate → mission.reconcile → release.prepare → mission.close. Do not skip steps. If any step fails — resolve the error using the error catalog (L1) before proceeding
- **Added:** 2026-07-26
- **Confirmations:** 1
