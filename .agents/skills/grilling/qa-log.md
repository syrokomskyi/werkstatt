# Q&A Log (L0)

Append-only log of questions asked and answers given during grilling sessions. Used for meta-analysis to distill recurring decision patterns.

<!-- Entries are appended by the skill during each run. -->
<!-- Format:
## <date> — <context>
- **Question:** <short question summary>
- **Answer:** <operator's decision>
-->

## 2026-07-28 — RFC-0571 config.regenerate mission-aware + build.prepare

- **Question:** Where in build.prepare pipeline should config.regenerate go?
- **Answer:** First step, before workpiece.imports.validate
- **Question:** Should config.regenerate also handle files from generateFullBoilerplate (tsconfig.json, deploy workflow, .env.example)?
- **Answer:** No, only current 5 files — minimal scope
- **Question:** Should RFC-0569 acceptance criterion be updated to reflect the fix?
- **Answer:** Yes, update it
