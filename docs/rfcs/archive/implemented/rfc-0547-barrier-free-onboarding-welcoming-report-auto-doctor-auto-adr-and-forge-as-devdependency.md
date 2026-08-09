---
id: RFC-0547
title: 'Barrier-free onboarding: register selection, welcoming report, auto-doctor, auto-ADR, first creation moment, and forge-as-devDependency'
status: implemented
kind: architecture
scope: workspace
owners:
- architecture
reviewers:
- human:andrii-syrokomskyi
createdAt: 2026-07-26
updatedAt: 2026-07-26
enhancedAt: 2026-07-26
implementedAt: 2026-07-26
closedAt: null
supersedes: []
supersededBy: null
amends:
- RFC-0545
amendedBy:
- RFC-0548
- RFC-0549
- RFC-0551
related:
- RFC-0542
- RFC-0545
- RFC-0546
- RFC-0548
- RFC-0549
satisfies:
- DNA-54
versionBump: patch
commands:
  proposed: []
  added: []
  changed: []
  removed: []
appsImpacted: []
packagesImpacted:
- forge
successSignals:
- forge-bootstrap asks the operator to choose a communication register (business or creative) and stores it in PREFERENCES.md and operator-profile.md
- forge-bootstrap asks for operator name and gender before the first creation moment
- forge-bootstrap report is presented in the operator's chosen aiLanguage with zero CLI commands in user-facing text
- forge-bootstrap auto-runs forge.doctor after configuration and reports issues with proposed solutions
- forge-bootstrap auto-creates an ADR for both greenfield and transplant via /fo-idea-create-adr inline, silently — the operator is not told about ADR/RFC concepts during onboarding
- forge-bootstrap analyzes transplanted projects and presents 2-3 creator-focused recommendations that demonstrate the system's value
- forge-bootstrap helps the operator create something real during onboarding (first creation moment) — not a placeholder or test
- forge-bootstrap collects project story, deep purpose, creative influences, audience, and writing voice organically during the first creation moment — not as a separate interview
- forge-bootstrap immediately invites the operator to start working on their project — no educational detours about internal mechanisms
- Scaffold profiles add @warpgogol/forge as devDependency so forge commands work inside the new project
- forge-bootstrap asks about git history transfer when source has .git; uses git format-patch + git am if accepted, clean git init if declined
- A short description of what Forge is and is not is presented after every onboarding
nonGoals:
- Adding operator-profile.md to .gitignore in scaffold profiles — this is handled in the Design section (§ Privacy and .gitignore)
- Removing forge.doctor as a CLI command — it remains available, just not suggested to the operator
- Making forge-bootstrap non-interactive — the skill still asks questions, but in human language without CLI jargon
- Explaining ADR/RFC concepts during onboarding — the operator does not need to know how the system documents internally; they learn naturally during work
- Asking the operator if they want to learn about RFCs — this is an educational detour that delays the moment the operator can start creating
- Collecting personal data (project story, deep purpose, creative influences, audience, writing voice) as a separate interview before creation — these are collected organically during the first creation moment
- Transferring the entire .git directory — git history is transferred via git format-patch + git am, not by copying .git/
- Changing forge CLI output language — CLI output remains English per RFC-0542; only the skill (agent chat) uses aiLanguage

---

# RFC-0547: Barrier-free onboarding: register selection, welcoming report, auto-doctor, auto-ADR, first creation moment, and forge-as-devDependency

## Context

Forge was published to npm (RFC-0543) with `forge create` + `/forge-bootstrap` as the onboarding path. RFC-0546 added migration-adapter registry for transplant mode. The current `forge-bootstrap` skill (RFC-0545) produces a report that assumes the operator is a developer: it references CLI commands (`forge doctor`), internal skill names (`fo-compass-annotate`), and technical concepts (`MODULE_CONTRACT`, `CHANGE_SUMMARY`, `bindings`, `adapter-id`) without explanation.

The operator's vision is that Forge serves creators who do not program. They describe an idea, and the system documents it, implements it, and maintains history — replacing what previously required a studio of 100 people. The onboarding must reflect this reality: no CLI commands, no guides, no formats, no internal jargon, no educational detours about how the system works internally. The system hides all complexity from the operator. The operator is a creator; Forge is the team that helps them. The operator's first interaction after onboarding should be to start creating — not to learn about ADRs, RFCs, or governance mechanisms. Those become visible naturally during work, when the operator encounters them in context. For an existing project (transplant), the system analyzes the codebase and history, then presents 2-3 recommendations from a creator's perspective — improvements that make the operator say "wow" and want to work with the system.

Additionally, `forge doctor` and other forge CLI commands do not work inside a newly created forge project because scaffold profiles do not add `@warpgogol/forge` as a dependency. The `nextSteps` suggesting `forge doctor` are broken.

## Problem

- **Report is developer-facing, not creator-facing** — the current `forge-bootstrap` report (`packages/forge/skills/meta/forge-bootstrap/SKILL.md:93-127`) contains CLI commands (`forge doctor`), internal skill names (`fo-compass-annotate`), and technical jargon (`MODULE_CONTRACT`, `CHANGE_SUMMARY`, `bindings`, `adapter-id`). A non-programming operator sees gibberish.
- **`forge doctor` is broken inside new projects** — scaffold profiles (`packages/forge/profiles/*.yaml`) do not add `@warpgogol/forge` as a dependency. `pnpm exec forge doctor` inside a newly created project fails with "forge not found". The `nextSteps` suggesting it are incorrect.
- **No auto-diagnostics** — the skill suggests running `forge doctor` but does not run it. An operator who does not know what `forge doctor` is will never run it. Issues remain undetected.
- **No auto-ADR** — the skill suggests "Create an ADR" but does not create it. An operator who does not know what an ADR is will never create one. The decision to adopt Forge — whether greenfield or transplant — goes undocumented. Starting a new project with Forge is a serious decision that deserves a record.
- **Git history transfer is not implemented** — the SKILL.md says "Git history is preserved via `git format-patch` + `git am`" but `.git` is in `DEFAULT_EXCLUDE_PATTERNS` (`packages/forge/src/migration-adapters/types.ts:64`) and `postSetup` is a no-op stub (`packages/forge/src/migration-adapters/node-typescript-pnpm/index.ts:121-125`). History is never transferred. The operator is not asked about it.
- **No explanation of Forge's value** — the report does not explain what Forge gives the operator. A new user finishes onboarding without understanding the system they just adopted.
- **No immediate call to action** — the report suggests learning about ADRs and RFCs instead of inviting the operator to start creating. The operator's goal is to build their project, not to learn governance.

## Decision

The `forge-bootstrap` skill is redesigned around a barrier-free onboarding philosophy: the operator is a creator, not a programmer. The system hides all complexity — no CLI commands, no guides, no formats, no internal jargon, no educational detours about internal mechanisms reach the operator. The skill (0) asks the operator to choose a communication register — business or creative — which controls the intensity of the extended behavioral layer (RFC-0549), (1) auto-runs `forge.doctor` after configuration and reports issues with proposed solutions, (2) auto-creates an ADR silently for both greenfield and transplant via `/fo-idea-create-adr` inline — the operator is not told about ADRs or RFCs during onboarding; they discover these naturally during work, (3) for transplant, analyzes the transplanted project and presents 2-3 creator-focused recommendations that demonstrate the system's value, (4) presents a welcoming report in the operator's `aiLanguage` with zero CLI commands — only human-language descriptions of what the system did and what the operator can do now, (5) immediately invites the operator to start creating — not with a placeholder or test, but with a real first piece of their project. During this first creation moment, the skill organically collects personal context (project story, deep purpose, creative influences, audience, writing voice) through the creative dialogue itself — not as a separate interview before creation. Only the operator's name and gender are asked before the first creation moment (needed for addressing and grammar in gendered languages). Scaffold profiles add `@warpgogol/forge` as a devDependency so forge commands work inside the project. Git history transfer is implemented: the skill asks the operator if they want to transfer history from the source project; if yes, `git format-patch` + `git am` transfers commits; if no, a clean `git init` is performed.

## Architectural fit

- **DNA-54 (Forge bindings contract)** — the welcoming report does not hardcode project-specific literals; it references bindings by key where needed. The report's human-language descriptions are generated from the forge.yaml config, not hardcoded.
- **RFC-0542 (self-documenting output contract)** — CLI output remains English; the welcoming report is agent chat output governed by `aiLanguage`, not CLI output. The separation is preserved.
- **RFC-0545 (forge-bootstrap redesign)** — this RFC amends the report section and adds auto-doctor, auto-ADR, and git-history steps. Greenfield and transplant modes are unchanged in structure; only the report and post-configuration steps change.
- **RFC-0546 (migration-adapter registry)** — the auto-ADR step creates a record of the migration decision that RFC-0546's transplant flow produces. Git history transfer was specified in RFC-0546 but not implemented; this RFC implements it.

## Design

### Forge-bootstrap process (redesigned)

The skill process is restructured to put the operator experience first:

1. **Language selection** (unchanged from current) — ask for `aiLanguage` and `documentationLanguage`, write to `PREFERENCES.md`. All subsequent communication uses `aiLanguage`.
2. **Register selection** (new) — ask the operator one question: how they prefer to work with the system — in a business register (direct, efficient, by-the-numbers) or a creative register (as a creative partner, thinking out loud, with emotional support). The choice is stored in `PREFERENCES.md` as `register: business|creative` and in `operator-profile.md` under `## Register`. The register controls whether the extended behavioral layer (RFC-0549) is included in `AGENTS.md`. Both registers receive the full core behavioral layer (RFC-0548). The operator can change the register at any time via live operator feedback.
3. **Operator name and gender** (new) — ask the operator's name and gender (needed for addressing and correct grammar in gendered languages). Stored in `operator-profile.md` under `## Personal`. These are the only personal data collected before the first creation moment.
4. **Verify forge project** (unchanged) — check `forge.yaml` exists.
5. **Mode choice** (unchanged) — greenfield or transplant.
6. **Greenfield or transplant interview** (unchanged) — fill bindings, migrate code.
7. **Auto-run doctor** (new) — the skill runs `forge.doctor` internally (not as a CLI command the operator types). If doctor reports issues, the skill presents them in human language with proposed solutions. If doctor passes, the skill confirms everything is healthy.
8. **Auto-create ADR** (new, both greenfield and transplant, silent) — the skill invokes `/fo-idea-create-adr` inline with a pre-filled title (greenfield: "Start new project with Forge"; transplant: "Migrate <source-project> into Forge"), context (stack, bindings, mode), and justification (operator's reason for adopting Forge). The ADR is created, validated, and committed silently — the operator is not told about ADRs, RFCs, or governance concepts. These become visible naturally during work when the operator encounters them in context.
9. **Project analysis and recommendations** (new, transplant only) — the skill analyzes the transplanted project: codebase structure, git history (if transferred), content, and configuration. It generates 2-3 recommendations from a creator's perspective — improvements that demonstrate the system's value and make the operator want to start working. Recommendations are not technical refactors; they are creator-facing improvements (e.g. content opportunities, user experience enhancements, creative direction suggestions). The skill presents each recommendation with: what it is, why it matters from a creator's perspective, and what the result would look like. The operator can choose to start one immediately or defer.
10. **First creation moment** (new, amended by RFC-0548) — after the welcoming report, the skill helps the operator create something real immediately — not a placeholder, not a test, but a first piece of their actual project. For a game: "Let's create your first scene right now. What's the first thing the player sees?" For a website: "Let's create your first page right now. What's the first thing visitors should see?" For a blog: "Let's write your first post right now. What do you want to tell the world?" During this creative dialogue, the skill organically collects personal context — project story, deep purpose, creative influences, target audience, writing voice — through the conversation itself, not as a separate interview. The operator's voice is learned from how they describe their idea. The audience is learned from "who is this for?". Creative influences are learned from "what inspires you in similar projects?". This data is stored in `operator-profile.md` under `## Personal`. This replaces the old model of collecting personal data as a separate interview before creation — it resolves the tension with the barrier-free philosophy and aligns with RFC-0548's indirect teaching principle (learning through doing, not lecturing).
11. **Welcoming report** (redesigned) — presented in `aiLanguage`. Contains: welcome message, what Forge gives the operator (value proposition), what was done (configuration, migration, health check), what the operator can do now (in human terms, not commands), and an immediate invitation to continue creating — either by describing the next idea, or by accepting one of the recommendations (transplant). If the first creation moment (step 10) already produced something, the report acknowledges it.

### Welcoming report structure

The report is presented in the operator's chosen `aiLanguage`. All labels, headings, and descriptions are translated. No CLI commands, no skill names with `fo-` prefix, no internal jargon. The report has four sections:

#### Section 1: Welcome

A brief welcome message acknowledging the operator's project and the completion of onboarding.

#### Section 2: What Forge gives you

A 2-3 sentence value proposition in human language, read from `forge-about.md` (see § Forge knowledge file). Core message: Forge gives the operator the leverage that previously required a studio of programmers — documentation, decision history, and autonomous implementation — without needing to hire or manage engineers. The system documents decisions, implements changes, and maintains history automatically. The system also learns: with every conversation, it understands the operator's style, preferences, and creative vision better (RFC-0548 adaptive learning).

#### Section 3: What was done

A human-language summary of what happened during onboarding. For greenfield: project structure created, language preferences saved, stack configured. For transplant: code migrated, structure created, language preferences saved, stack configured, health check results. The ADR is not mentioned — it is an internal mechanism the operator discovers naturally during work.

#### Section 4: What you can do now

Human-language descriptions of capabilities, not commands:

- "Describe an idea or change you want, and the system will make it happen."
- "Ask the system to review recent changes for quality and consistency."
- "Ask the system to check your project's health."

The operator does not need to know skill names or CLI commands. The LLM agent interprets their natural-language requests and invokes the appropriate skills.

#### Section 5: Let's start (transplant: recommendations)

For greenfield: an immediate invitation to start creating — "Tell me what you want to build, and I'll make it happen."

For transplant: the 2-3 recommendations from step 7 are presented here. Each recommendation includes:

- **What** — a short, creator-facing description of the improvement.
- **Why** — why it matters from a creator's perspective (not a programmer's).
- **Result** — what the result would look and feel like.

The operator can choose to start one immediately or describe their own idea. The skill does not push — it offers and waits.

#### Section 6: What Forge is and is not

A short description after every onboarding, read from `forge-about.md` (see § Forge knowledge file). The skill reads the knowledge file and presents its "What Forge is" and "What Forge is not" sections in the operator's `aiLanguage`.

### Forge knowledge file (`forge-about.md`)

A dedicated Markdown file at `packages/forge/skills/meta/forge-bootstrap/forge-about.md` serves as Forge's self-description knowledge base. The skill reads this file when the operator asks about the system at any point — not during onboarding (the operator is not educated about internal mechanisms during onboarding). The file is available as a knowledge base for the agent to draw on when the operator's questions naturally lead to "what is this system?".

The file contains:

- **What Forge is** — a system that documents decisions, implements ideas, and maintains history. A powerful office, a factory for embodying ideas. Gives a solo operator the leverage of a development studio without hiring engineers.
- **What Forge is not** — not a programming tool that requires you to write code, not a tool that replaces your creative judgment, not a system that works without your direction.
- **What Forge can do** — human-language descriptions of capabilities: document decisions, propose and plan changes, implement ideas autonomously, review work for quality, check project health, maintain history of all decisions and changes, learn the operator's style and preferences over time.
- **Value proposition** — Forge gives the operator the leverage that previously required a studio of 100 people: documentation, decision history, and autonomous implementation. The operator describes what they want; the system documents, plans, implements, and maintains history. The system learns with every conversation — understanding the operator's creative vision, communication style, and preferences better over time.

The file is written in English (source language). The skill translates its content into the operator's `aiLanguage` when presenting it. The file is declarative prose — no CLI commands, no skill names, no technical jargon. It speaks to a creator, not a programmer. Internal mechanism names (ADR, RFC, Compass) are not mentioned — the file describes capabilities in human terms.

The file is declared in the skill's frontmatter `knowledge` array (RFC-0524) so `forge.create` syncs it and `forge.doctor` checks for stale copies.

### Scaffold profiles: forge as devDependency

All scaffold profiles (`packages/forge/profiles/*.yaml`) add `@warpgogol/forge` as a devDependency in their install steps. This ensures `forge` binary is available inside the new project via `pnpm exec forge <command>`.

For `forge-shell` profile (minimal): add `pnpm add -D @warpgogol/forge` to install steps. For `astro-typescript-turborepo` profile: add `@warpgogol/forge` to the root devDependencies install step. For `phaser-turborepo` profile: add `@warpgogol/forge` to the root devDependencies install step.

### Git history transfer

When the source project has a `.git` directory, the skill asks the operator:

> "Your source project has Git history. Would you like to transfer the commit history into the new Forge project?"

If yes: the skill uses `git format-patch` (export all commits from source) + `git am` (apply them in the new project) to preserve history without copying the `.git` directory. If the source has many commits, the skill warns that this may take a moment.

If no: the skill runs `git init` in the new project (clean repository, no history from source).

If git history transfer fails (complex history, submodules, replace objects): the skill warns and continues with a clean `git init`.

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/forge/skills/meta/forge-bootstrap/SKILL.md` | Redesigned process: register selection, name/gender, auto-doctor, silent auto-ADR, project analysis, recommendations, first creation moment with organic personal-data collection, welcoming report |
| `packages/forge/skills/meta/forge-bootstrap/forge-about.md` | New knowledge file: Forge self-description, capabilities, value proposition |
| `packages/forge/skills/meta/forge-bootstrap/operator-profile-template.md` | Template for initial operator-profile.md with empty sections (created by forge-bootstrap, grown by fo-session-retro and live operator feedback per RFC-0548) |
| `packages/forge/skills/meta/forge-bootstrap/milestone-gallery/` | Directory for project milestone snapshots (amended by RFC-0549 for visual thinking) |
| `packages/forge/skills/meta/forge-bootstrap/project-narrative-template.md` | Template for initial project-narrative.md (amended by RFC-0549 for audience empathy) |
| `packages/forge/profiles/forge-shell.yaml` | Add `@warpgogol/forge` to install steps; add `operator-profile.md` to `.gitignore` |
| `packages/forge/profiles/astro-typescript-turborepo.yaml` | Add `@warpgogol/forge` to root devDependencies install; add `operator-profile.md` to `.gitignore` |
| `packages/forge/profiles/phaser-turborepo.yaml` | Add `@warpgogol/forge` to root devDependencies install; add `operator-profile.md` to `.gitignore` |
| `packages/forge/src/migration-adapters/types.ts` | Remove `.git` from DEFAULT_EXCLUDE_PATTERNS (git history handled by skill, not adapter) |
| `packages/forge/src/migration-adapters/node-typescript-pnpm/index.ts` | postSetup: implement git init / git format-patch + git am |
| `packages/forge/src/migration-adapters/phaser-pnpm/index.ts` | postSetup: implement git init / git format-patch + git am |
| `packages/forge/AGENTS.md` | Update Output contract section: skill report uses aiLanguage, no CLI commands in user-facing text |

### Privacy and .gitignore

`operator-profile.md` contains personal data: operator name, gender, project story, deep purpose, creative influences, target audience, writing voice. Gender is special category data under GDPR Article 9. To prevent accidental exposure when the project is pushed to a public repository:

- All scaffold profiles add `operator-profile.md` to `.gitignore` alongside `node_modules`, `dist`, `.turbo`, `.cache`.
- The skill informs the operator that `operator-profile.md` is local and private — it is not committed to the repository.
- Gender is optional: the operator may decline to provide it. If declined, the skill uses gender-neutral addressing and notes the absence in `operator-profile.md`.
- The operator can delete `operator-profile.md` at any time; the system continues to function without it.

### Failure modes

- `forge.doctor` finds issues → skill presents them in human language with proposed solutions; operator can choose to fix or defer.
- `forge.doctor` is unavailable (forge not installed as devDependency yet) → skill skips auto-doctor and notes it in the report; operator can ask the agent to run it later.
- Auto-ADR creation fails (adr.validate fails) → skill reports the error silently (in agent logs, not to operator), leaves the ADR file in place for the agent to fix, and continues to the welcoming report. The operator is never told about the ADR.
- Project analysis finds nothing recommendable (transplant of an empty or minimal project) → skill skips recommendations and proceeds to the welcoming report with a direct invitation to start creating.
- Git history transfer fails → skill warns and continues with clean `git init`.
- Source project has no `.git` → skill skips the git history question and runs `git init` directly.

## Rollout

1. **Create `forge-about.md`** — write the Forge knowledge file with self-description, capabilities, value proposition. Declare it in the skill's `knowledge` frontmatter array.
2. **Create `operator-profile-template.md`** — template for initial operator-profile.md with empty sections (Personal, Register, Communication style, Significance calibration, Common requests, Aesthetic preferences, Unimplemented ideas, Emotional rhythm, Feedback history, Operator directives, External feedback). Declare in forge-bootstrap skill's `knowledge` array.
3. **Create `project-narrative-template.md`** — template for initial project-narrative.md. Declare in forge-bootstrap skill's `knowledge` array. (Used by RFC-0549 audience empathy.)
4. **Create `milestone-gallery/` directory** — empty directory for project milestone snapshots. Declare in forge-bootstrap skill's `knowledge` array. (Used by RFC-0549 visual thinking.)
5. **Update `forge-bootstrap` SKILL.md** — redesign process steps: add register selection (step 2), name/gender (step 3), auto-doctor (step 7), silent auto-ADR (step 8), project analysis + recommendations for transplant (step 9), first creation moment with organic personal-data collection (step 10), welcoming report (step 11). Steps 1, 4-6 (language, verify, mode, interview) are unchanged.
6. **Update scaffold profiles** — add `@warpgogol/forge` to install steps in all three profiles.
7. **Implement git history transfer** — remove `.git` from `DEFAULT_EXCLUDE_PATTERNS`; implement `postSetup` in both adapters to handle git init / format-patch + git am based on operator's choice.
8. **Update `packages/forge/AGENTS.md`** — Output contract section: clarify that skill reports (agent chat) use `aiLanguage` and contain zero CLI commands, guides, or formats in user-facing text; CLI output remains English.
9. **Update tests** — scaffold-project tests verify `@warpgogol/forge` in install steps; migration-adapter tests verify git history transfer (accept and decline paths); SKILL.md validation passes; `forge-about.md`, `operator-profile-template.md`, `project-narrative-template.md`, and `milestone-gallery/` exist and are declared in `knowledge`.
10. **Publish as patch version** — `versionBump: patch` because changes are additive to the skill and profiles. No data contract break. No migrator needed.

## Alternatives considered

- **Keep CLI commands in report but add explanations** — rejected: the operator's vision is that non-programmers should never see CLI commands. Explanations of `pnpm exec forge doctor` do not help someone who does not use a terminal. The LLM agent handles command invocation.
- **Separate RFC for forge-as-devDependency** — rejected: the devDependency change is required for auto-doctor to work inside new projects. Without it, auto-doctor would fail. The four changes (UX, auto-doctor, auto-ADR, devDependency) form a single coherent onboarding experience.
- **Auto-create RFC instead of ADR** — rejected: RFCs require human architecture review and govern cross-workspace contracts. ADRs are local decisions that can be created autonomously. Adopting Forge — whether greenfield or transplant — is a local project decision.
- **Ask about RFC/ADR during onboarding** — rejected: the operator's vision is that onboarding should lead directly to creating, not to learning governance. ADRs and RFCs become visible naturally during work, when the operator encounters them in context. Educational detours delay the moment the operator can start building.
- **Technical recommendations for transplant** — rejected: recommendations must be creator-facing, not programmer-facing. A recommendation like "refactor the auth module" means nothing to a non-programmer. A recommendation like "add a page that tells your project's story to visitors" means everything.
- **Copy `.git` directory directly** — rejected: copying `.git` transfers the entire repository including remote configuration, hooks, and stashes. `git format-patch` + `git am` transfers only commit history, which is what the operator needs.
- **Make forge-bootstrap fully non-interactive** — rejected: the skill still needs to ask about language, register, mode, stack, and git history. The vision is not to remove interaction, but to make it human and jargon-free.
- **Collect personal data as a separate interview before creation** — rejected: this contradicts the barrier-free philosophy. Personal data (project story, deep purpose, creative influences, audience, writing voice) is collected organically during the first creation moment, not as a questionnaire. Only name and gender are asked before creation (needed for addressing and grammar).
- **Binary register without future extensibility** — rejected: the register parameter is stored as a string in `PREFERENCES.md`, not as a boolean. This allows future registers (e.g. educational, research) without schema changes.

## Risks

- **Auto-doctor false positives** — `forge.doctor` might report warnings that confuse a non-programming operator. Mitigation: the skill translates doctor results into human language and only presents actionable issues with proposed solutions.
- **Auto-ADR content quality** — the pre-filled ADR text might not capture the operator's actual reasoning. Mitigation: the skill asks the operator for their reason for adopting Forge and includes it in the ADR's justification section. The operator does not see the ADR — it is an internal record.
- **Recommendation quality** — the 2-3 recommendations might not resonate with the operator if they are too generic or too technical. Mitigation: recommendations are creator-facing (content, UX, creative direction), not technical (refactoring, dependency upgrades). The skill analyzes the actual project content and history to produce specific, relevant suggestions.
- **Recommendation analysis time** — analyzing a large project may take time. Mitigation: the skill sets expectations ("Let me study your project for a moment…") and keeps the analysis to a reasonable scope (structure, content, recent history — not a full audit).
- **Git history transfer performance** — `git format-patch` on a repo with thousands of commits may be slow. Mitigation: the skill warns the operator that history transfer may take a moment; for very large histories, the operator can decline and start clean.
- **`@warpgogol/forge` version drift** — adding forge as devDependency means the project has its own forge version, which may drift from the global one. Mitigation: `forge.doctor` checks `forge.syncedVersion` and warns on mismatch (already implemented per RFC-0543).
- **Agent misinterpretation** — an agent might still include CLI commands in the welcoming report despite the instruction not to. Mitigation: the SKILL.md explicitly states "zero CLI commands in user-facing text" and provides the report structure. `forge.skill.validate` could enforce this via a SKILL rule in a follow-up RFC.
- **Operator declines everything** — operator declines git history, declines ADR, declines RFC explanation, declines first creation moment. This is valid; the skill proceeds to the welcoming report with what was done. No step is mandatory beyond language selection, register selection, and project verification.
- **Register mismatch** — operator chooses business register but later wants creative support. Mitigation: the register can be changed at any time via live operator feedback (RFC-0548). The change takes effect immediately.
- **First creation moment fails** — the operator cannot describe what they want to create. Mitigation: the skill offers to start from a template or recommendation (transplant) instead. The first creation moment is an invitation, not a requirement.

## Acceptance criteria

- [x] `forge-bootstrap` SKILL.md process includes register selection step (step 2) that asks for business or creative register and stores it in `PREFERENCES.md` and `operator-profile.md` (evidence: packages/forge/skills/meta/forge-bootstrap/SKILL.md:57-68)
- [x] `forge-bootstrap` SKILL.md process includes name/gender step (step 3) that asks for operator name and gender before the first creation moment (evidence: packages/forge/skills/meta/forge-bootstrap/SKILL.md:70-82)
- [x] `forge-bootstrap` SKILL.md process includes auto-doctor step (step 7) that runs `forge.doctor` internally and presents results in `aiLanguage` (evidence: packages/forge/skills/meta/forge-bootstrap/SKILL.md:130-138)
- [x] `forge-bootstrap` SKILL.md process includes auto-ADR step (step 8, both greenfield and transplant) that invokes `/fo-idea-create-adr` inline silently — operator is not told about ADR/RFC concepts during onboarding (evidence: packages/forge/skills/meta/forge-bootstrap/SKILL.md:140-151)
- [x] `forge-bootstrap` SKILL.md process includes project analysis step (step 9, transplant only) that generates 2-3 creator-focused recommendations (evidence: packages/forge/skills/meta/forge-bootstrap/SKILL.md:153-165)
- [x] `forge-bootstrap` SKILL.md process includes first creation moment step (step 10) that helps the operator create something real and instructs the agent to collect personal data (project story, deep purpose, creative influences, audience, writing voice) organically during the creative dialogue — not as a separate interview (evidence: packages/forge/skills/meta/forge-bootstrap/SKILL.md:167-177)
- [x] `operator-profile-template.md` includes a `## Personal` section with fields for project story, deep purpose, creative influences, audience, and writing voice — confirming the data collected during the first creation moment has a designated storage location (evidence: packages/forge/skills/meta/forge-bootstrap/operator-profile-template.md:7-15)
- [x] `forge-bootstrap` SKILL.md welcoming report (step 11) contains zero CLI commands in user-facing text — no `pnpm exec`, no `forge doctor`, no `forge --help` (evidence: packages/forge/skills/meta/forge-bootstrap/SKILL.md:179-215, forge.skill.validate: 0 violations)
- [x] `forge-bootstrap` SKILL.md welcoming report includes value proposition, what was done, what you can do now, recommendations (transplant), and what Forge is/is not sections (evidence: packages/forge/skills/meta/forge-bootstrap/SKILL.md:183-215)
- [x] `forge-bootstrap` SKILL.md welcoming report ends with an immediate invitation to continue creating — no educational detours about ADRs, RFCs, or governance (evidence: packages/forge/skills/meta/forge-bootstrap/SKILL.md:205-215)
- [x] All scaffold profiles (`forge-shell.yaml`, `astro-typescript-turborepo.yaml`, `phaser-turborepo.yaml`) include `@warpgogol/forge` in install steps (evidence: packages/forge/profiles/forge-shell.yaml:18, packages/forge/profiles/astro-typescript-turborepo.yaml:57, packages/forge/profiles/phaser-turborepo.yaml:57, stack-profile.test.ts:161-166)
- [x] All scaffold profiles (`forge-shell.yaml`, `astro-typescript-turborepo.yaml`, `phaser-turborepo.yaml`) include `operator-profile.md` in `.gitignore` content (evidence: packages/forge/profiles/forge-shell.yaml:17, packages/forge/profiles/astro-typescript-turborepo.yaml:56, packages/forge/profiles/phaser-turborepo.yaml:56, stack-profile.test.ts:169-176)
- [x] `.git` is removed from `DEFAULT_EXCLUDE_PATTERNS` in `packages/forge/src/migration-adapters/types.ts` (evidence: packages/forge/src/migration-adapters/types.ts:59-65, migration-adapters.test.ts:43-50)
- [x] `postSetup` in both adapters (`node-typescript-pnpm`, `phaser-pnpm`) implements git init or git format-patch + git am based on operator's choice (evidence: packages/forge/src/migration-adapters/node-typescript-pnpm/index.ts:123-149, packages/forge/src/migration-adapters/phaser-pnpm/index.ts:123-150, migration-adapters.test.ts:238-318)
- [x] `forge-bootstrap` SKILL.md asks about git history transfer when source has `.git` (evidence: packages/forge/skills/meta/forge-bootstrap/SKILL.md:115-125)
- [x] `forge-about.md` exists at `packages/forge/skills/meta/forge-bootstrap/forge-about.md` and is declared in the skill's `knowledge` frontmatter array (evidence: packages/forge/skills/meta/forge-bootstrap/forge-about.md:1-28, SKILL.md:12-16, forge.skill.validate: 0 violations)
- [x] `forge-about.md` contains zero CLI commands, zero skill names with `fo-` prefix, zero internal jargon, zero internal mechanism names (ADR, RFC, Compass) — declarative prose for a creator (evidence: packages/forge/skills/meta/forge-bootstrap/forge-about.md:1-28)
- [x] `operator-profile-template.md` exists at `packages/forge/skills/meta/forge-bootstrap/operator-profile-template.md` and is declared in the skill's `knowledge` frontmatter array (evidence: packages/forge/skills/meta/forge-bootstrap/operator-profile-template.md:1-40, SKILL.md:12-16, forge.skill.validate: 0 violations)
- [x] `project-narrative-template.md` exists at `packages/forge/skills/meta/forge-bootstrap/project-narrative-template.md` and is declared in the skill's `knowledge` array (evidence: packages/forge/skills/meta/forge-bootstrap/project-narrative-template.md:1-22, SKILL.md:12-16, forge.skill.validate: 0 violations)
- [x] `milestone-gallery/` directory exists at `packages/forge/skills/meta/forge-bootstrap/milestone-gallery/` and is declared in the skill's `knowledge` array (evidence: packages/forge/skills/meta/forge-bootstrap/milestone-gallery/.gitkeep, SKILL.md:12-16, forge.skill.validate: 0 violations)
- [x] `packages/forge/AGENTS.md` Output contract section clarifies that skill reports use `aiLanguage` with zero CLI commands, guides, or formats in user-facing text (evidence: packages/forge/AGENTS.md:100)
- [x] `forge.skill.validate` passes on the redesigned `forge-bootstrap` skill (evidence: pnpm exec werkstatt run forge.skill.validate — 0 violations)
- [x] `rfc.validate` passes on this file before merging (evidence: pnpm exec werkstatt run rfc.validate RFC-0547 — All 1 RFC(s) passed validation)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MUST NOT include any CLI commands (e.g. `pnpm exec forge doctor`, `forge --help`, `pnpm exec werkstatt run`), guides, or format references in the welcoming report's user-facing text. The system hides all complexity from the operator. The operator is a creator; Forge is the team that helps them.
- Agents MUST NOT explain ADR, RFC, or governance concepts to the operator during onboarding. The operator discovers these naturally during work. The ADR is created silently.
- Agents MUST NOT ask the operator if they want to learn about RFCs, ADRs, or how the system works internally. Onboarding leads directly to creating.
- Agents MUST read `forge-about.md` when the operator asks about the system at any point — not proactively during onboarding. The knowledge file is the single source of truth for self-description.
- Agents MUST NOT auto-create RFCs — only ADRs are auto-created silently (for both greenfield and transplant).
- Agents MUST NOT skip the auto-doctor step — it runs internally, not as a suggested operator action.
- Agents MUST NOT skip the silent auto-ADR step — the ADR is created, not suggested, for both greenfield and transplant.
- Agents MUST generate 2-3 creator-focused recommendations for transplant mode — not technical refactors, not dependency upgrades, not infrastructure changes. Recommendations are about content, user experience, and creative direction.
- Agents MUST ask about git history transfer when the source has `.git`; they MUST NOT assume the operator wants or does not want history.
- Agents MUST present the welcoming report in the operator's chosen `aiLanguage` — translating all labels, headings, and descriptions. Command names, file paths, and skill invocations in the report's technical appendix (if any) remain untranslated.
- Agents MUST NOT copy the `.git` directory directly — git history transfer uses `git format-patch` + `git am` only.
- Agents MUST ask for the operator's name and gender before the first creation moment — these are the only personal data collected before creation. All other personal data (project story, deep purpose, creative influences, audience, writing voice) is collected organically during the first creation moment, not as a separate interview.
- Agents MUST help the operator create something real during the first creation moment — not a placeholder, not a test. The first creation moment is the operator's first experience of the system's value.
- Agents MUST NOT collect personal data as a separate interview before the first creation moment — this contradicts the barrier-free philosophy. Personal data emerges naturally from the creative dialogue.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id RFC-0547 --reason "..." --invariant "DNA-54"` instead of working around it (RFC-0334).
