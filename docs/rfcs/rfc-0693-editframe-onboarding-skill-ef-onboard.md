---
id: RFC-0693
title: "Editframe onboarding skill: ef-onboard"
status: accepted
kind: command
scope: workspace
owners:
  - architecture
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-08-05
updatedAt: 2026-08-05
enhancedAt: 2026-08-05
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - DNA-54
  - RFC-0641
  - RFC-0692
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
  - packages/forge
successSignals:
  - "`ef-onboard` skill exists in `packages/forge/skills/fo/ef-onboard/SKILL.md`"
  - "`forge.skill.validate` passes on the skill"
  - "`forge.skill.list` includes `ef-onboard`"
  - "`editframe-html.yaml` declares `ef-onboard` in `workspaceTypes[].skills`"
  - "Skill references Editframe `llms.txt` and `editframe-composition` skill for domain knowledge"
  - "Skill guides agent through prerequisites check, discovery, scaffold, preview"
nonGoals:
  - "Do not add FFmpeg prerequisite check to `forge doctor` — that is a separate RFC if needed"
  - "Do not add a `prerequisites` field to the profile schema — the skill checks prerequisites via shell commands"
  - "Do not re-implement Editframe's `editframe-composition` skill — reference it, do not duplicate it"
  - "Do not modify `forge create` — the skill calls it, it does not change it"
  - "Do not create a new forge command — the skill uses existing `forge create`, `forge dev`, `forge doctor`"
  - "Do not vendor Editframe skills into forge — they are installed by `npm create @editframe` or referenced online"
---

# RFC-0693: Editframe onboarding skill: ef-onboard

## Context

Editframe publishes a getting-started page (`https://editframe.com/getting-started`) with a structured agent prompt for creating new video projects. The prompt covers:

1. **Prerequisites** — Node.js 18+ and FFmpeg must be installed
2. **Discovery** — ask the operator what kind of project they want (single video, template, editor, automation), what assets they have (files, URLs), and their stack preference (react vs html)
3. **Scaffold** — `npm create @editframe@latest -- html` or `-- react`
4. **Build** — read the `editframe-composition` skill, then build the composition
5. **Preview** — `npm start` (dev server with hot-reload)

Editframe also publishes `llms.txt` (`https://editframe.com/llms.txt`) — a machine-readable index of six domain skills: `editframe-composition`, `editframe-dev-server`, `editframe-api`, `editframe-create`, `editframe-editor-gui`, `editframe-webhooks`. These skills are installed to `.agents/skills/` by `npm create @editframe`.

Forge's `editframe-html` profile (RFC-0641) provides governance: invariants (VIDEO-01..09), `forge doctor`, `forge validate`, `forge build`, `forge.determinism.check`. RFC-0692 adds `ef-composition-review` and `ef-render-verify` skills for review and verification workflows.

What is missing: an **onboarding skill** that bridges Editframe's discovery flow with Forge's governance layer. Without it, an agent creating an Editframe project under Forge has no guided flow for prerequisites, discovery, and scaffold — it must improvise.

## Problem

An operator asking an agent to "create a new Editframe video project" within a Forge-managed workspace faces three gaps:

1. **No prerequisites check**: Forge does not check for FFmpeg. `forge create` checks Node.js but not FFmpeg. An operator who scaffolds a project without FFmpeg discovers the missing dependency only at render time (`editframe render` fails).

2. **No discovery flow**: `forge create --profile editframe-html` scaffolds a project structure, but does not ask the operator what kind of video they want to build, what assets they have, or whether they prefer react or html. The Editframe prompt has this discovery flow; Forge does not.

3. **No link to Editframe domain skills**: Forge skills (`ef-composition-review`, `ef-render-verify`) govern review and verification. Editframe skills (`editframe-composition`, `editframe-dev-server`) provide domain knowledge — how to use `ef-timegroup`, how CSS animations work, how to structure a timeline. An agent working in a Forge-managed Editframe project has no guidance to read Editframe's own skills first.

## Decision

A new skill `ef-onboard` is created in `packages/forge/skills/fo/ef-onboard/SKILL.md`. The skill is declared in the `editframe-html` profile's `workspaceTypes[].skills` array alongside `ef-composition-review` and `ef-render-verify`.

The skill incorporates the Editframe getting-started prompt's structure (prerequisites → discovery → scaffold → build → preview) and adds Forge-specific steps (governance setup, invariant awareness, editframe skills installation).

## Architectural fit

- **DNA-54 (Forge bindings contract)**: The skill references forge CLI commands (`forge create`, `forge dev`, `forge doctor`) directly — these are forge-level commands, not project-specific literals. No software-specific binding keys are used.
- **RFC-0641 (editframe profile)**: The profile declares skills in `workspaceTypes[].skills`. This RFC adds `ef-onboard` to that list.
- **RFC-0692 (composition skill pack)**: RFC-0692 is `accepted` and its skills (`ef-composition-review`, `ef-render-verify`) are already implemented in `packages/forge/skills/fo/`. This RFC adds a third skill `ef-onboard` to the same profile. All three skills are in `packages/forge/skills/fo/`.
- **Two-layer skill architecture**: Forge skills (`ef-onboard`, `ef-composition-review`, `ef-render-verify`) provide governance — onboarding, review, verification. Editframe skills (`editframe-composition`, `editframe-dev-server`, ...) provide domain knowledge — how to use elements, time model, rendering. The `ef-onboard` skill explicitly directs the agent to read Editframe's `editframe-composition` skill before building. The layers are complementary, not duplicative.

## Design

### Skill: ef-onboard

```yaml
# packages/forge/skills/fo/ef-onboard/SKILL.md
---
name: ef-onboard
description: Onboard a new Editframe video project — check prerequisites, discover requirements, scaffold, and start preview. Use when the operator asks to create a new video project.
invocation: user
category: fo
concerns: content-mutation
dependsOn: []
languagePolicy: ref(PREFERENCES.md)
triggers:
  - "create a new editframe project"
  - "start a new video project"
  - "build a video with editframe"
  - "create a video composition"
---
```

The skill guides the agent through six steps:

#### Step 1: Prerequisites check

- **Node.js 18+**: Run `node --version`. If missing or below 18, direct the operator to `https://nodejs.org/en/download/` or install via the system package manager.
- **FFmpeg**: Run `ffmpeg -version`. If missing, direct the operator to `https://ffmpeg.org/download.html` or install via the system package manager (`apt install ffmpeg`, `brew install ffmpeg`).
- If either prerequisite is missing and cannot be installed automatically, stop and ask the operator to install it manually.

#### Step 2: Discovery

Ask the operator:

1. **Project type**:
   - Single video (product demo, social media video, personal project)
   - Video template (reusable with different assets — birthday card, wedding announcement)
   - Video editing tool (custom editor built with Editframe as the engine)
   - Video workflow automation (script that generates videos from triggers)
   - Something else (ask them to describe it)

2. **Existing assets**:
   - Video clips, images, or audio files (file paths or URLs)
   - Website URLs to use as content source — if provided, download and cache all relevant assets locally before building
   - No existing assets — start from scratch

3. **Stack preference**:
   - Vanilla HTML/CSS/JS (simpler, no build step beyond Vite)
   - React + TypeScript (component-based, type-safe)
   - No preference — recommend HTML for single videos, React for templates and editors

4. **Node.js/React libraries**: Ask if the operator has any libraries in mind (e.g. AnimeJS for animations, Tailwind for styling).

Prioritize getting all answers before starting to build. This minimizes wait time for the operator.

#### Step 3: Scaffold

Run `forge create --profile editframe-html` to scaffold the project with Forge governance (invariants, AGENTS.md templates, forge skills).

The `editframe-html` profile currently targets HTML compositions only — it does not support a `--template react` flag. If the operator chose React, scaffold with `forge create --profile editframe-html`, then instruct the agent to install `@editframe/react` manually (`pnpm add @editframe/react`) after scaffold.

#### Step 4: Install Editframe domain skills

Editframe publishes six domain skills via `npm create @editframe`. To make them available alongside forge skills:

1. Run `npm create @editframe@latest` in the project directory. This installs Editframe's domain skills to `.agents/skills/editframe-*/`.
2. Report which skills were installed.
3. If the command fails (network issues, npm errors, unsupported flags), fall back to referencing the online documentation: direct the agent to read `https://editframe.com/llms.txt` and `https://editframe.com/skills/composition.md` before building. Do not use unverified CLI flags — if `npm create @editframe` prompts interactively, answer the prompts based on the operator's discovery answers from Step 2.

#### Step 5: Read domain knowledge

Before building, the agent MUST read the `editframe-composition` skill (either from `.agents/skills/editframe-composition/SKILL.md` if installed, or from `https://editframe.com/skills/composition.md`). This provides domain knowledge about:

- Time model (`ef-timegroup`, modes, duration, offset)
- Media elements (`ef-video`, `ef-audio`, `ef-image`, `ef-text`, `ef-captions`)
- CSS animations and transitions
- Rendering pipeline

The agent should also read `editframe-dev-server` if the project uses the dev server.

#### Step 6: Build and preview

1. Build the initial composition based on the operator's answers from Step 2. Use the discovery answers (project type, assets, stack preference, libraries) to determine composition structure, asset placement, and optional dependencies.
2. Run `forge dev` to start the preview server (delegates to `editframe preview` per the `editframe-html` profile's `devServer.command`).
3. Report the localhost URL to the operator.
4. Run `forge doctor` to check all VIDEO-* invariants on the initial composition.
5. Report any invariant violations and suggest fixes.

### Profile update

```yaml
workspaceTypes:
  - id: composition
    skills:
      - ef-onboard
      - ef-composition-review
      - ef-render-verify
```

`ef-onboard` is listed first because it is the entry point — the operator invokes it before the other two skills are relevant.

### Template update

The `composition-agents.md` template (enriched by RFC-0692 with a "Skill usage" section) is updated: the existing "Skill usage" section is replaced with an expanded "Skills" section that includes `ef-onboard` as the first entry, and a new "External resources" section is added:

```markdown
## Skills

- **ef-onboard** — onboard a new project: prerequisites, discovery, scaffold, preview. Trigger: "create a new video project".
- **ef-composition-review** — review a composition for time model correctness, accessibility, and best practices before rendering. Trigger: "review this composition".
- **ef-render-verify** — verify a render: validate, build, check determinism, inspect output. Trigger: "render and verify".

## External resources

- [Editframe llms.txt](https://editframe.com/llms.txt) — machine-readable index of Editframe domain skills
- [Editframe composition skill](https://editframe.com/skills/composition.md) — full reference for time model, elements, and rendering
- [Editframe getting started](https://editframe.com/getting-started) — step-by-step guide and agent prompt
```

The existing "Skill usage" section (lines 41–46 of the current template) is fully replaced by the new "Skills" section above. The "Workflow" and "Reference template" sections remain unchanged.

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/forge/skills/fo/ef-onboard/SKILL.md` | New — skill definition |
| `packages/forge/profiles/editframe-html.yaml` | Extended — `ef-onboard` added to `workspaceTypes[].skills` |
| `packages/forge/profiles/editframe-html-templates/composition-agents.md` | Extended — replace "Skill usage" with expanded "Skills" section, add "External resources" section |

### Output format

`forge.skill.validate --json` returns `{ violations: [], warnings: [] }` — the skill must produce zero violations. `forge.skill.list --json` returns `{ skills: [{ name, category, concerns, pack? }] }` — `ef-onboard` appears with `name: "ef-onboard"`, `category: "fo"`, no `pack` field (forge-level skill).

### Failure modes

- **FFmpeg not installed**: The skill detects this in Step 1 and stops. The operator must install FFmpeg before proceeding. This is by design — rendering is impossible without FFmpeg.
- **`npm create @editframe` fails**: The skill falls back to referencing online documentation. The agent can still build compositions using forge governance, but without the editframe domain skills installed locally.
- **`forge create` fails**: If `forge create --profile editframe-html` fails (missing profile, network error, permission issue), the skill reports the error to the operator and stops. Do not proceed to steps 4–6 without a scaffolded project.
- **Network unavailable**: If the agent cannot fetch `llms.txt` or `composition.md`, it should inform the operator and proceed with whatever knowledge it has. The forge invariants (VIDEO-01..09) still provide baseline quality checks.
- **Operator provides invalid assets**: If the operator provides URLs that return 404 or files that don't exist, the skill reports the missing assets and asks for corrections before proceeding.
- **React template not supported**: The `editframe-html` profile targets HTML compositions only. If the operator chose React, the skill instructs the agent to install `@editframe/react` manually after scaffold. This is a known limitation — a future RFC can add a `react` variant of the profile.

## Rollout

- **Skill creation**: `ef-onboard` is created in `packages/forge/skills/fo/`. `forge.create` and `forge.upgrade` sync it to `.agents/skills/`.
- **Profile update**: `editframe-html.yaml` gains `ef-onboard` in the skills list. `forge.doctor` on Editframe projects checks for its presence.
- **Template update**: `composition-agents.md` gains the onboarding reference and external resources section. New projects get the enriched template; existing projects get it on `forge.upgrade`.
- **No migration**: existing projects are unaffected. The skill is additive.
- **Coordination with RFC-0692**: RFC-0692 is `accepted` and its skills (`ef-composition-review`, `ef-render-verify`) are already implemented. This RFC adds `ef-onboard` to the same `editframe-html.yaml` skills list and replaces the "Skill usage" section in `composition-agents.md` with an expanded "Skills" section.

## Alternatives considered

- **Vendor Editframe skills into forge**: Rejected — Editframe skills are MIT-licensed and maintained by Editframe Inc. Vendoring them into forge creates a maintenance burden and version drift. The skill installs them from the official source (`npm create @editframe`) or references them online.
- **Add FFmpeg check to `forge doctor`**: Rejected for this RFC — it would require a `prerequisites` field in the profile schema, which is a schema change. The skill checks FFmpeg via shell commands. A future RFC can add profile-declared prerequisites with `forge doctor` enforcement if needed.
- **Make `ef-onboard` a meta skill (like `forge-bootstrap`)**: Rejected — `forge-bootstrap` is domain-neutral and handles forge project creation for any profile. `ef-onboard` is Editframe-specific — it includes discovery questions about video types, assets, and stack preferences that are meaningless for other profiles.
- **Single combined onboarding skill for all profiles**: Rejected — different domains have different discovery flows. An Astro site onboarding asks about content collections, i18n, and design tokens. An Editframe onboarding asks about video types, assets, and rendering. Combining them would produce an unfocused skill.
- **Skip discovery, just scaffold**: Rejected — the Editframe prompt explicitly prioritizes discovery before building. "Prioritize getting all answers and ideas from the user before you start fetching assets or building anything." This minimizes rework and wait time.

## Risks

- **Skill drift**: If Editframe updates their getting-started prompt or skills, the `ef-onboard` skill may become stale. Mitigation: the skill references the online resources (`llms.txt`, `composition.md`) rather than embedding their content. The skill's structure (prerequisites → discovery → scaffold → build → preview) is stable and unlikely to change.
- **Editframe skills installation failure**: The `npm create @editframe` command may fail or prompt interactively on some systems. Mitigation: the skill has a fallback to online documentation. The operator can also manually run `npm create @editframe` and follow the prompts.
- **Two sources of skills**: Forge skills (`ef-*`) and Editframe skills (`editframe-*`) coexist in `.agents/skills/`. This could confuse the agent about which to use. Mitigation: the `ef-onboard` skill explicitly directs the agent to read `editframe-composition` for domain knowledge and `ef-composition-review` / `ef-render-verify` for governance. The two layers are complementary, not competing.
- **React template gap**: The `editframe-html` profile currently targets HTML compositions. If the operator chooses React, the skill instructs manual installation of `@editframe/react`. This is a known limitation — a future RFC can add a `react` variant of the profile.

## Acceptance criteria

- [x] `packages/forge/skills/fo/ef-onboard/SKILL.md` exists with valid frontmatter (evidence: packages/forge/skills/fo/ef-onboard/SKILL.md:1-9, forge.skill.validate passes)
- [x] `forge.skill.validate` passes on the skill (evidence: packages/forge/src/tests/skill-validate.test.ts:297-301, zero violations for ef-onboard)
- [x] `forge.skill.list` includes `ef-onboard` (evidence: packages/forge/src/tests/skill-validate.test.ts:260-264, FORGE_SKILLS registry includes ef-onboard)
- [x] `editframe-html.yaml` declares `ef-onboard` in `workspaceTypes[].skills` (evidence: packages/forge/profiles/editframe-html.yaml:57-60, ef-onboard is first entry)
- [x] Skill includes prerequisites check (Node.js 18+, FFmpeg) (evidence: packages/forge/skills/fo/ef-onboard/SKILL.md:18-22, Step 1 Prerequisites check)
- [x] Skill includes discovery flow (project type, assets, stack preference) (evidence: packages/forge/skills/fo/ef-onboard/SKILL.md:24-42, Step 2 Discovery)
- [x] Skill references `https://editframe.com/llms.txt` and `editframe-composition` skill (evidence: packages/forge/skills/fo/ef-onboard/SKILL.md:56-57, Step 5 Read domain knowledge)
- [x] Skill instructs agent to read `editframe-composition` before building (evidence: packages/forge/skills/fo/ef-onboard/SKILL.md:54, 'the agent MUST read the editframe-composition skill')
- [x] `composition-agents.md` template includes onboarding reference and external resources (evidence: packages/forge/profiles/editframe-html-templates/composition-agents.md:41-51, Skills + External resources sections)
- [x] `rfc.validate` passes on this file before merging (evidence: rfc.validate --id RFC-0693 --json, status: pass, 0 violations)

## Implementation notes for agents

<!-- Rules that govern how AI agents interact with this RFC.
     Be explicit. Agents read this section for behavioral policy.

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC
  without a new RFC that supersedes it.
- Agents MUST install editframe skills from the official source (`npm create @editframe`) — do not vendor or fork them.
- Agents MUST NOT skip the discovery step — the operator's answers determine the project structure and composition content.
- Agents MUST invoke `ef-onboard` BEFORE `forge create` — it is an onboarding skill that runs prerequisites check and discovery first, then calls `forge create`.
-->
