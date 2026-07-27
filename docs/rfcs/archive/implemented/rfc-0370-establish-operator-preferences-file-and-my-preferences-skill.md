---
id: RFC-0370
title: "Establish operator preferences file and my-preferences skill"
status: implemented
# kind options: architecture | contract | command | policy | deprecation
kind: policy
# scope options: app | workspace
scope: workspace
owners:
  - architecture
# Set by the deciding human together with the status change (RFC-0335).
# Draft scaffolds must keep this empty; do not prefill a default identity.
# Format: human:<handle> (agent:<id> reserved — see RFC-0335).
# Default reviewer when none is specified by the operator: human:andrii-syrokomskyi
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-07-09
updatedAt: 2026-07-09
implementedAt: 2026-07-09
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy:
  - RFC-0374
related:
  - DNA-2
  - RFC-0368
  - RFC-0335
commands:
  proposed: []
  added: []
  changed: []
  removed: []
appsImpacted: []
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted: []
successSignals:
  - "Every interactive skill reads the operator's language preferences before asking questions."
  - "A single root file records the operator's choices and can be edited by a dedicated skill."
  - "Agents respond in the operator's chosen language and generate documentation in the chosen documentation language."
nonGoals:
  - "Do not translate existing RFCs, ADRs, or READMEs automatically."
  - "Do not enforce a single language across the repository; documentation language may differ from AI language."
  - "Do not store secrets, API keys, or environment-specific values in PREFERENCES.md."
# RFC-0268: OPTIONAL machine-checkable acceptance probes, executed on-demand
# via `pnpm exec site-kernel run rfc.acceptance.run --id <this-rfc-id>` (never
# automatically inside build pipelines). Closed probe vocabulary — see
# docs/rfcs/rfc-0268-make-rfc-acceptance-criteria-machine-checkable.md.
acceptance:
  - probe: file-exists
    path: "PREFERENCES.md.template"
    pattern: "aiLanguage"
  - probe: file-exists
    path: ".agents/skills/my-preferences/SKILL.md"
    pattern: "operator preferences"
  - probe: file-exists
    path: "AGENTS.md"
    pattern: "Operator preferences"
---

# RFC-0370: Establish operator preferences file and my-preferences skill

## Context

AI agents in this monorepo interact with operators in natural language. Until now, the language of every conversation, grilling session, and generated document was implicit — usually the language the operator happened to use in the first prompt. This creates three problems:

1. **Inconsistent responses** — an agent may switch languages mid-session if the operator's wording changes.
2. **Mixed documentation** — an operator may want RFCs and READMEs in English while preferring to chat in Russian or Ukrainian.
3. **Repetition** — every new session re-asks the same questions instead of reading a stable preference file.

## Problem

There is no canonical, machine-readable place where the operator records their language preferences for:

- conversations with the AI (`aiLanguage`);
- grilling skill questions (`grillingLanguage`);
- project documentation (RFC, ADR, README, etc.) (`documentationLanguage`).

Without this file, each skill must either guess or ask every time. Skills like `windows-ai-tooling` and `grilling` should know the operator's preferences before they start asking questions.

## Decision

The repository root gains a `PREFERENCES.md` file (Markdown with YAML frontmatter) that stores operator preferences. A dedicated skill `my-preferences` creates, reads, and edits this file. Every interactive skill reads `PREFERENCES.md` at the start of a session; if it is missing, the skill asks for the preferences and creates the file.

## Architectural fit

- `DNA-2` (repository layout): a root-level metadata file is consistent with `AGENTS.md`, `README.md`, and `CONTRIBUTING.md`.
- `RFC-0368` (Windows agent tooling): the first interactive skill to adopt the preference file.
- `RFC-0335` (reviewer identity): decision records remain governed by RFC/ADR processes; preferences are operator-level, not governance-level.

## Design

### File format

`PREFERENCES.md` is a Markdown file with a YAML frontmatter block. The first version supports three language keys.

```yaml
---
aiLanguage: ru
grillingLanguage: ru
documentationLanguage: en
createdAt: 2026-07-09
updatedAt: 2026-07-09
---
```

- `aiLanguage`: language the AI uses for all skill responses and questions in this session.
- `grillingLanguage`: language the `grilling` skill uses when interrogating a plan or design.
- `documentationLanguage`: default language for generated RFCs, ADRs, READMEs, and other project documentation.

The body of the file may contain a short human-readable explanation of the settings.

### Skill: `my-preferences`

Located at `.agents/skills/my-preferences/SKILL.md`.

Behavior:

1. Read `PREFERENCES.md` at the repository root.
2. If missing, ask the operator for the three languages and create the file.
3. If present, display the current values and ask which one to change.
4. Update the file and confirm.

Language values are free-form strings (e.g., `ru`, `uk`, `de`, `en`, `es`). Agents treat them as IETF BCP 47 language tags where possible, but do not require strict validation at this stage.

### Adoption by other skills

- `windows-ai-tooling`: at the start of the skill, read `PREFERENCES.md`. If `aiLanguage` is missing, ask for it and create `PREFERENCES.md`. All further questions and the final report are in `aiLanguage`.
- `grilling`: before asking the first question, read `grillingLanguage` from `PREFERENCES.md`. If missing, ask once and save it.

### No automatic translation

The preferences file does **not** trigger translation of existing files. It only affects:

- the language of AI responses in the current session;
- the default language for newly generated documentation;
- the language of grilling questions.

## Rollout

1. Create `PREFERENCES.md.template` and `my-preferences` skill.
2. Update `windows-ai-tooling` and `grilling` to read the file.
3. Add an `Operator preferences` section to `AGENTS.md` so agents know the convention.
4. Future interactive skills adopt the same pattern without needing a new RFC each time.

## Alternatives considered

- **Environment variables** (`PREFERENCES_BOT_LANGUAGE=ru`): rejected because they are session-local and not committed; preferences should travel with the repository.
- **Section in `AGENTS.md`**: rejected because `AGENTS.md` is agent instructions, not operator settings; editing it for every language change would be noisy.
- **JSON file**: rejected because Markdown with frontmatter is already the canonical CMS-friendly content format in this repo (RFC-0047).

## Risks

- **Agent misreads an empty file**: skills must create the file if missing, not fail.
- **Stale preferences**: `updatedAt` helps operators notice old values; `my-preferences` skill provides an easy update path.
- **Language not supported by the model**: agents fall back to English if the requested language produces garbled output, but still record the preference.

## Acceptance criteria

- [x] `PREFERENCES.md.template` exists at the repository root with documented frontmatter keys. (evidence: implemented historically)
- [x] `.agents/skills/my-preferences/SKILL.md` exists and describes the read/edit flow. (evidence: implemented historically)
- [x] `windows-ai-tooling` reads `aiLanguage` at skill start and asks for it if missing. (evidence: implemented historically)
- [x] `grilling` reads `grillingLanguage` before asking questions. (evidence: implemented historically)
- [x] `AGENTS.md` references the operator preferences convention. (evidence: AGENTS.md:1, agent guide updated)
- [x] `rfc.validate` passes on this file. (evidence: implemented historically)

## Implementation notes for agents

When implementing an interactive skill after this RFC:

1. Check `PREFERENCES.md` at the repo root.
2. If the relevant language key is missing, ask the operator once and save the answer.
3. Use the language value for all subsequent natural-language output in the session.
4. Do not overwrite `PREFERENCES.md` unless the operator explicitly asks to change a preference.
