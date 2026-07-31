# Q&A Log (L0)

Append-only log of questions asked and answers given during grilling sessions. Used for meta-analysis to distill recurring decision patterns.

<!-- Entries are appended by the skill during each run. -->
<!-- Format:
## <date> — <context>
- **Question:** <short question summary>
- **Answer:** <operator's decision>
-->

## 2026-07-31 — RFC-0617 plan grilling

- **Question:** Should baseline failures during mission.materialize be fatal (RFC text) or non-fatal (warn)?
- **Answer:** Non-fatal — warn and continue. Ledger write failure should not block materialization.
- **Question:** Should --workpiece flag be shared across all compass commands or only on compass.audit.baseline?
- **Answer:** Shared compassScanFlags — all compass commands accept --workpiece.
