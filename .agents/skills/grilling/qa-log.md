# Q&A Log (L0)

Append-only log of questions asked and answers given during grilling sessions. Used for meta-analysis to distill recurring decision patterns.

<!-- Entries are appended by the skill during each run. -->
<!-- Format:
## <date> — <context>
- **Question:** <short question summary>
- **Answer:** <operator's decision>
-->

## 2026-07-27 — RFC-0556 compass/werkstatt forge autonomy
- **Question:** Separate @webgogol/compass-core package vs inline both in forge?
- **Answer:** Inline both in forge — no separate package needed.
- **Question:** Conscious duplication vs dependency inversion for kernel-packages?
- **Answer:** Dependency inversion — forge becomes canonical, kernel-packages delegate to forge.
- **Question:** How should compass.audit.* behave in external projects without git?
- **Answer:** Safe-degradation — revision=0, warn not fail.
- **Question:** versionBump for this RFC?
- **Answer:** minor — new capability, not breaking change.
