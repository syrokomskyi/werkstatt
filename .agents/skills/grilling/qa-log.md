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

## 2026-07-28 — RFC-0574 Sternsystem storage relocation and mirror topology

- **Question:** Does systems-cache (mirrors[0]) become a direct replacement for the current cache clone?
- **Answer:** Yes, direct replacement. materialize clones from it, reconcile merges back into it.
- **Question:** Should the non-bare mirror be named "systems-local" or "systems-cache"?
- **Answer:** systems-cache — preserves existing codebase terminology (syncCacheClone, hasGitCacheClone), accurately describes function.
- **Question:** How to represent mirrors in registry.yaml — array with roles or extend existing fields?
- **Answer:** Array with storageType, no role field. First entry is always non-bare cache.
- **Question:** Should mirrors have a "canonical" role?
- **Answer:** No roles at all. First mirror is always non-bare and always the cache. Convention over configuration.
- **Question:** What does the protocol parameter mean — only git protocols or also backup protocols?
- **Answer:** Git protocols (file/ssh/https) for materialize/reconcile/sync, plus backup protocols (ftp/s3/rsync) for bundle mirrors.
- **Question:** Where to validate mirror integrity — extend sternsystem.validate or new command?
- **Answer:** Extend sternsystem.validate with mirror topology rules.
- **Question:** Where does registry.yaml live after refactoring?
- **Answer:** Stays in systems/registry.yaml inside monorepo. Only <id>/ subdirectories move out.
- **Question:** How does sternsystem.sync work with multiple mirrors?
- **Answer:** Star topology through mirrors[0] (cache). Fetch git mirrors into cache, push from cache to git mirrors, bundle+copy to backup mirrors.
- **Question:** How do backup mirrors with non-git protocols receive data?
- **Answer:** Git bundle + file copy (FTP/S3/rsync).
- **Question:** One sternsystem.sync for all mirrors or separate sternsystem.backup?
- **Answer:** One sternsystem.sync for everything.
- **Question:** What fields does a mirror entry have?
- **Answer:** path + storageType only. Protocol inferred from path.
- **Question:** What AGENTS.md rule replaces the systems/<id>/ rule?
- **Answer:** "Agents MUST NEVER edit any Sternsystem mirror directly — only through mission workpieces."
