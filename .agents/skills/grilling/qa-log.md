# Q&A Log (L0)

Append-only log of questions asked and answers given during grilling sessions. Used for meta-analysis to distill recurring decision patterns.

<!-- Entries are appended by the skill during each run. -->
<!-- Format:
## <date> — <context>
- **Question:** <short question summary>
- **Answer:** <operator's decision>
-->

## 2026-07-31 — RFC-0627 dev deployment channel with Axiom gate

- **Question:** Should channels.dev be required for all systems or only for systems with deployment.channels declared? **Answer:** Required for all — only one system exists, question is moot.
- **Question:** Should there be a way to bypass the Axiom gate (e.g. --skip-axiom)? **Answer:** No bypass — the gate is absolute. If Axiom finds errors, the release stays stuck in dev-deployed.
- **Question:** Confirm auto-step rollback model (no --channel, system auto-detects from release state)? **Answer:** Confirmed auto-step with optional --to-release.
- **Question:** Does dev Worker need full secrets set (1:1 with alt) or just basic ones? **Answer:** Full set 1:1 with alt. .env.dev file.
- **Question:** What to do with existing releases that didn't go through dev channel? **Answer:** Clean slate — no migration needed. New state machine applies to new releases only.
