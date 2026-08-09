---
id: RFC-0070
title: 'Define onboarding lifecycle: .input/.output folders, 00-brief contract, phase semantics'
status: superseded
kind: contract
scope: workspace
owners:
- architecture
reviewers: []
createdAt: 2026-05-18
updatedAt: &id001 2026-05-18
implementedAt: 2026-05-18
closedAt: *id001
supersedes:
- RFC-0029
- RFC-0030
supersededBy: RFC-0532
related:
- DNA-35
- DNA-36
- RFC-0025
- RFC-0026
- RFC-0047
- RFC-0071
- RFC-0072
- RFC-0073
- RFC-0074
- RFC-0075
commands:
  proposed:
  - brief.validate
  added:
  - brief.validate
  changed: []
  removed: []
appsImpacted: []
packagesImpacted:
- os/site-kernel-onboarding
- os/site-kernel-checks
successSignals:
- onboarding/.input/ holds the active client research bundle including a required 00-brief.md frontmatter file
- onboarding/.output/<NN-phase>/ holds human-readable phase artifacts that the agent writes during the build
- brief.validate refuses to proceed when any required brief field is missing or malformed
- The site is built directly under apps/<id>/ (no draft/ folder, no staging copy)
- After the site passes apps-check.run, the human can open it in browser via pnpm --filter <id> dev
- The repo never holds more than 1-3 active sites in apps/ — completed sites move out to a separate turborepo
nonGoals:
- Carrying biome/family/constellation/passport/deploy decisions inside 00-brief.md (those are derived by the agent or always-on)
- Persisting client materials inside the repo after build (materials and .output/ archives live in a separate "process" project)
- Backward compatibility with docs/onboarding/, apps-todo/, spec/001-010/, or .agents/workflows/{plant-seed,plant-content,update-content,review}.md
- Replacing apps/<id>/AGENTS.md with workflow files — invariants stay in AGENTS.md, sequences stay in workflows

---

# RFC-0070: Define onboarding lifecycle: .input/.output folders, 00-brief contract, phase semantics

## Context

This repository is the **engineering ecosystem** for building thin Astro sites. It is not the place where finished sites live long-term: at most 1-3 active sites exist under `apps/` at any time, and finished sites are extracted to their own turborepo (same shape, minus the rest of the ecosystem) and only re-imported here when they need engineering work. The same is true for client research materials and the build's intermediate artifacts — they belong to a separate "process" project and only land in this repo while a site is being constructed.

Today the repo lacks a clear _contract_ for what arrives at the start of an onboarding, where it goes, what the AI agent writes during the build, and what gets cleaned up at the end. Earlier drafts of this RFC put materials in `docs/onboarding/` — that was wrong: `docs/` is the ecosystem's own documentation (architecture-dna, page-contracts, rfcs, etc.) and must not be mixed with per-client artifacts that come and go. Earlier drafts also imagined "concept-scope filtering" — also wrong: by the time the bundle arrives, every file after `25-concepts-selected.md` was already synthesized against the winning concept; the prior-concept files are kept only as historical record and are not consumed downstream.

## Problem

1. **No declared place for incoming materials.** Materials previously appeared in the root `onboarding/` folder as a flat tree, with no separation between "what arrived" and "what the build produced."
2. **No required parameters file.** A new site needs at minimum a kebab-case id (the `apps/<id>/` directory name), a domain, a default language, supported languages, and a legal jurisdiction. None of these are reliably derivable from materials. Without a single small structured file, the agent has to guess.
3. **No place for the agent's working notes between phases.** The agent currently has nowhere to put the synthesized blueprint, the visual axis decisions, the section gap report, or the audit summary. It either invents folders or stores the work only inside its own context window.
4. **No clear lifecycle.** Nothing says: "after the site passes its checks, the contents of `onboarding/.input/` and `onboarding/.output/` are extracted to the process repo and removed from here."
5. **Legacy paths still litter the tree.** `apps-todo/`, `docs/onboarding/new-client-from-scratch.md`, and `.agents/workflows/{plant-seed,plant-content,update-content,review}.md` all describe an architecture that no longer exists.

## Decision

The repository establishes a single, named onboarding surface at the workspace root:

```
onboarding/
  .input/         # READ-ONLY for agents. Holds the active client's research bundle.
  .output/        # WRITTEN-ONLY by phase workflows. One subfolder per phase.
```

`.input/` contains:

- **`00-brief.md`** — required frontmatter file. The build refuses to start without it.
- Any number of numbered research artifacts from the upstream research pipeline (`01-profile.md`, `02-vision.md`, …, `47-digital-infrastructure-brief.md`), plus `README.md`, `step-guide.md`, `log.txt`. The numbering is the upstream pipeline's contract; this repo does not reorder it.

`.output/` is populated by the agent during the build, one phase per folder, numbered:

```
onboarding/.output/
  01-synthesize/
  02-scaffold/
  03-compose/
  04-author/
  05-audit/
  status.md
```

Every per-phase folder holds human-readable markdown artifacts the human can read and review in Windsurf. A phase may also write **one** machine-readable file (yaml or json) per phase when a deterministic validator needs it (e.g. `04-author/atoms.yaml` for `content.coverage.validate`). Anything else is markdown.

Once `apps-check.run --app <id>` passes and the human has opened the site in browser, the lifecycle for this client is over inside this repo. `onboarding/.input/` and `onboarding/.output/` are moved (by the human) to the separate process repo. The next client overwrites `00-brief.md` and the cycle restarts. The repo never accumulates multiple `onboarding/<client>/` subfolders.

The build proceeds in **five phases**, each owned by a workflow file (RFC-0075). The phases are conceptual contracts here; the executable orchestration lives in workflows.

| # | Phase | Reads | Writes (under .output/) | Writes (under apps/<id>/) | Writes (under packages/) |
| --- | --- | --- | --- | --- | --- |
| 01 | synthesize | `.input/**` | `01-synthesize/blueprint.md`, `01-synthesize/family-pick.md` | — | — |
| 02 | scaffold | `.output/01-synthesize/**`, brief | `02-scaffold/visual-plan.md` | skeleton (`src/content/system.md` partial, `tools/`, `astro.config.mjs`, `package.json`, etc.) | `ontology/biomes/<biome-id>.yaml`, `ontology/site-families/<family-id>.yaml` (if new) |
| 03 | compose | `.output/01-02/**`, `.input/36-wireframe.md`, `.input/18-architecture.md` | `03-compose/site-plan.md`, `03-compose/section-gap.md` | `src/content/system.md` (final), `src/content/navigation/{lang}/navigation.md` | `ui/src/sections/<slug>/` for any new sections, `ontology/archetypes/sections/<id>.yaml` for any new archetypes, `ontology/constellations/<id>.yaml` for any new constellation |
| 04 | author | `.input/29,32,33,34,28,11,10,…`, site-plan | `04-author/atoms.yaml`, `04-author/coverage.md`, `04-author/voice-profile.yaml` | `src/content/pages/{lang}/**`, `src/content/prose/{lang}/**`, `src/content/business/{lang}/**`, `src/content/site/{lang}/**`, asset shells | — |
| 05 | audit | the assembled app + `.input/30,38,39,40,41,42,43,44,45,46,47` | `05-audit/audit-report.md`, `05-audit/llm-cache.jsonl` | (none beyond fixes the agent applies in response to findings) | — |

The "no draft folder" rule is firm: the agent writes the _final_ site files directly under `apps/<id>/` and the _final_ shared assets under `packages/`. Validation runs against the same files. If a validator fails, the agent fixes the file in place and re-runs the validator. Humans review via the Windsurf changelist, not via a separate draft folder.

## 00-brief.md contract

`00-brief.md` is the only mandatory hand-authored file in `.input/`. It is parsed by `gray-matter` (`^4.0.3`) outside Astro and validated by the new `brief.validate` command. The frontmatter is minimal on purpose — every field is something a human must decide and that the agent cannot derive from materials.

```markdown
---
client:
  id: warpgogol-handwerk          # kebab-case; becomes apps/<id>/ folder name
  domain: warpgogol-handwerk.de   # primary FQDN (no protocol, no path)
i18n:
  default: de                    # ISO 639-1
  supported: [de]                # array of ISO 639-1; must include default
legalJurisdiction: DE            # ISO 3166-1 alpha-2; drives Impressum / AGB / Datenschutz / Widerruf templates
---

# Notes (optional, free-form)

(anything the agent should know that does not fit the upstream research bundle —
prior context, sensitivities, hard preferences. Free markdown. The agent reads
this section to inform synthesize but never copies it verbatim into the site.)
```

**Required fields (build refuses to start if any are missing or malformed):**

| Field | Type | Validation |
| --- | --- | --- |
| `client.id` | string | matches `^[a-z][a-z0-9-]{2,48}$`; resolves to `apps/<id>/` not yet existing OR existing with `client.domain` matching its `system.md` |
| `client.domain` | string | matches `^([a-z0-9-]+\.)+[a-z]{2,}$`; no protocol; no path |
| `i18n.default` | string | matches `^[a-z]{2}$` |
| `i18n.supported` | array of strings | each matches `^[a-z]{2}$`; contains `i18n.default` |
| `legalJurisdiction` | string | matches `^[A-Z]{2}$` |

Anything else — biome id, family id, constellation, growth vendor, passport flags, deploy target, brand colors, tone-of-voice phrases, sitemap categories — is **not** in the brief. The agent proposes biome/family/constellation in the synthesize and scaffold phases based on the upstream materials; passport is on by default for every site (per ecosystem invariant); deploy target is decided at deploy time, not at build time.

`brief.validate` runs as the very first step of the synthesize phase and as the first step of `apps-check.run --app <id>` whenever an `onboarding/.input/00-brief.md` is present (when none is present, e.g. a previously-built site that no longer has its onboarding bundle, the validator is a no-op).

## Architectural fit

- **DNA-35 / DNA-36 (readiness).** The readiness signal remains `app.contract.full --app <id>` exiting zero. This RFC defines the path _to_ readiness.
- **RFC-0025 cosmic overlay** and **RFC-0047 CMS surface.** The author phase emits content into exactly the five client-editable domains; no `components/`, `sections/`, `features/`, `media/` ever appear in `apps/<id>/`.
- **RFC-0048 routes.** `system.md pages[].routes` is set during the compose phase from the site-plan; nothing in `00-brief.md` carries route slugs.
- **RFC-0075 workflows.** The five phases are concepts here; the workflow files give them executable orchestration. The kernel does _not_ gain phase-named commands like `onboarding.synthesize` — those were a misstep in the previous draft. The five phases are sequences of existing/new kernel commands invoked by the agent following a workflow file.

## Design

### File system responsibilities

| Path | Role |
| --- | --- |
| `onboarding/.input/00-brief.md` | Required hand-authored frontmatter file. Read by `brief.validate`. |
| `onboarding/.input/*.md`, `*.json`, `*.webp` | Research bundle from the upstream pipeline. Read-only for agents. |
| `onboarding/.output/<NN-phase>/*.md` | Per-phase human-readable artifacts the agent writes. |
| `onboarding/.output/<NN-phase>/*.yaml` | At most one machine-readable file per phase, only when a validator needs it. |
| `onboarding/.output/status.md` | Markdown ledger updated after every phase (last completed phase, outcome, links to artifacts). |
| `apps/<client.id>/**` | The site itself. Built directly here. |
| `packages/ontology/biomes/<biome-id>.yaml` | A biome (new or existing). |
| `packages/ontology/site-families/<family-id>.yaml` | A site family (new or existing). |
| `packages/ontology/archetypes/sections/<id>.yaml` | A section archetype (new or existing). |
| `packages/ontology/constellations/<id>.yaml` | A constellation (new or existing). |
| `packages/ui/src/sections/<slug>/**` | A section (new or existing). |

### `brief.validate` — single command, single purpose

```sh
# Validate the active onboarding/.input/00-brief.md against the schema.
pnpm exec werkstatt run brief.validate
```

Behavior:

- Reads `onboarding/.input/00-brief.md` via `gray-matter`.
- Validates the frontmatter against the Zod schema defined in `@gogol/site-kernel-onboarding/src/brief.ts`.
- Cross-checks `client.id` against existing `apps/<id>/`: if absent, ok; if present, the existing `apps/<id>/src/content/system.md` must declare the same `client.domain` and `i18n` set.
- Outputs the shared `--json` envelope. Exits non-zero on any failure.

```ts
// packages/os/site-kernel-onboarding/src/brief.ts
import { z } from "zod";

export const BriefFrontmatter = z.object({
  client: z.object({
    id: z.string().regex(/^[a-z][a-z0-9-]{2,48}$/),
    domain: z.string().regex(/^([a-z0-9-]+\.)+[a-z]{2,}$/),
  }),
  i18n: z.object({
    default: z.string().regex(/^[a-z]{2}$/),
    supported: z.array(z.string().regex(/^[a-z]{2}$/)).min(1),
  }).refine((v) => v.supported.includes(v.default), {
    message: "i18n.supported must contain i18n.default",
  }),
  legalJurisdiction: z.string().regex(/^[A-Z]{2}$/),
}).strict();

export type Brief = z.infer<typeof BriefFrontmatter>;
```

### Phase contract semantics

The five phases are **conceptual**, not registered commands. Each one is owned by a workflow file (`.agents/workflows/01-synthesize.md`, etc., per RFC-0075). The workflow tells the agent: which inputs to read, which artifact(s) to write under `.output/<NN-phase>/`, which kernel commands to run as gates, and what marks the phase complete.

After each phase the agent updates `onboarding/.output/status.md`:

```markdown
# Build status — warpgogol-handwerk

- Last phase: 03-compose
- Outcome: ok
- Next workflow: .agents/workflows/04-author.md

## Phase log

- 01-synthesize · ok · 2026-05-18T00:11:02Z · artifacts: 01-synthesize/blueprint.md, 01-synthesize/family-pick.md
- 02-scaffold · ok · 2026-05-18T00:11:18Z · artifacts: 02-scaffold/visual-plan.md · sites scaffolded: apps/warpgogol-handwerk/ · biome: packages/ontology/biomes/handwerk-material-warm.yaml
- 03-compose · ok · 2026-05-18T00:11:54Z · artifacts: 03-compose/site-plan.md, 03-compose/section-gap.md · sections proposed: 9 (in packages/ui/src/sections/) · constellation: handwerk-trust-funnel
- 04-author · pending
- 05-audit · pending
```

`status.md` is markdown, not yaml, because its primary reader is a human in Windsurf. The same agent re-reads it on resumption.

### Lifecycle and cleanup

```
1. Human places research bundle into onboarding/.input/ and edits onboarding/.input/00-brief.md.
2. Agent runs through the five phases (RFC-0075).
3. apps-check.run --app <client.id> passes.
4. Human opens the site at http://localhost:4321/<lang>/ via pnpm --filter <client.id> dev.
5. Human extracts apps/<client.id>/ to the separate per-site turborepo (out of scope for this repo).
6. Human moves onboarding/.input/ and onboarding/.output/ to the separate "process" project.
7. Human deletes apps/<client.id>/ from this repo OR keeps it temporarily if more engineering work is expected within 1-2 weeks.
8. The ecosystem repo is now ready for the next client.
```

Steps 5-7 are human actions; this RFC does not propose a CLI command for them because they cross repo boundaries and are not deterministic.

### Renaming legacy pipelines

`STANDARD_CHECK_PIPELINE` is renamed to `APPS_CHECK_PIPELINE`. A new sibling `PACKAGES_CHECK_PIPELINE` is introduced for `packages/*`. Both renames + the new pipeline are specified in RFC-0075; this RFC notes them here only so the names align across the family.

### Output format

Every kernel command (existing and new) follows the shared envelope:

```json
{
  "command": "brief.validate",
  "client": "warpgogol-handwerk",
  "status": "ok",
  "diagnostics": [],
  "runtimeMs": 18
}
```

### Failure modes

- `00-brief.md` missing or has invalid frontmatter → `brief.validate` fails; workflows refuse to start.
- `client.id` already exists in `apps/` with a different `domain` or `i18n` → fails.
- Agent attempts to write into `onboarding/.input/` → no kernel command does this; if a stray script does, `apps-check.run` will not stop it but `git status` will show the diff (operational discipline, not technical enforcement).
- Agent attempts to start phase N+1 before phase N's status is `ok` in `status.md` → RFC-0075 workflow precondition fails.

## Rollout

This is a greenfield change. Existing `apps/nicaragua-projekt` does not enter the new pipeline — it remains a reference for shared package contracts and continues to use the existing build commands. The pipeline applies to every new site.

Cleanup bundled with the implementation PR:

- Add `BriefFrontmatter` Zod schema and `brief.validate` command in `@gogol/site-kernel-onboarding`.
- Add `onboarding/.input/.gitkeep` and `onboarding/.output/.gitkeep` (the user has already created these folders; the `.gitkeep` files commit them).
- Delete `docs/onboarding/new-client-from-scratch.md` (superseded; new playbook is the workflows in `.agents/workflows/`).
- Update root `AGENTS.md`: replace the "Onboarding a new site (one paragraph)" section with a pointer to `.agents/workflows/00-prepare.md`.
- Add a `<system-reminder>`-style note in `apps/AGENTS.md`: "New sites are built via the workflows in `.agents/workflows/`. Do not duplicate `nicaragua-projekt` by hand."

## Alternatives considered

- **Keep one `onboarding/<client>/` per client in repo.** Rejected — accumulates dead client folders; conflicts with the 1-3-active-apps invariant.
- **Inline the brief inside `system.md identity`.** Rejected — `system.md` is the _built_ manifest. The brief is the _input_ and must exist before `system.md` is generated.
- **Make biome/family/constellation choices part of the brief.** Rejected — those are ecosystem-internal decisions the agent should propose from materials; they are not the human-side bargain.
- **Track phase status in `.output/status.json`.** Rejected — markdown is the right shape for Windsurf review; the validators read kernel-command output, not the status file.

## Risks

- **Material drift between snapshots.** If the upstream research pipeline subtly changes file numbering, the agent breaks. Mitigated by keeping ids stable in the upstream contract and by `brief.validate` not depending on numbered file names at all.
- **Human edits `.output/` files between phase runs.** Mitigated by writing a top-of-file warning in every `.output/` artifact and by treating `.output/` as overwritable by the next phase run.
- **Agent leaves stale `.output/` from a previous client.** Mitigated by RFC-0075 workflow `00-prepare.md` requiring an empty `.output/` (or only `status.md` from the prior client carrying `outcome: archived`).

## Acceptance criteria

- [x] `BriefFrontmatter` Zod schema defined in `@gogol/site-kernel-onboarding/src/brief.ts`. (evidence: packages/ directory, package exists)
- [x] `brief.validate` registered workspace-scoped; reads `onboarding/.input/00-brief.md` via `gray-matter`. (evidence: implemented historically)
- [x] `onboarding/.input/` and `onboarding/.output/` exist and committed via `.gitkeep`. (evidence: implemented historically)
- [x] `onboarding/.input/00-brief.md` exists as empty template ready for the next client. (evidence: implemented historically)
- [x] `docs/onboarding/` removed. (evidence: docs/ directory, documentation exists)
- [x] `apps-todo/` is gone (already done by the human). (evidence: implemented historically)
- [x] Root `AGENTS.md` updated to reference the new workflows. (evidence: AGENTS.md:1, agent guide updated)
- [x] `rfc.validate` passes on this file. (evidence: implemented historically)

## Implementation notes for agents

- Agents MUST treat `onboarding/.input/**` as read-only. Never write or modify a file there.
- Agents MUST refuse to start any phase if `brief.validate` fails. Surface the diagnostic and stop.
- Agents MUST write every per-phase artifact under `onboarding/.output/<NN-phase>/`. Never create ad-hoc folders.
- Agents MUST update `onboarding/.output/status.md` after every phase (one-paragraph entry + log line).
- Agents MUST NOT carry biome/family/constellation/passport/deploy decisions through the brief. Derive them from materials in synthesize/scaffold; passport is always on; deploy is decided later.
- Agents MUST NOT create a `draft/` folder or write a draft copy of `apps/<id>/` anywhere. The build is in `apps/<id>/` from the first scaffold action.
- When the human asks "is the site ready?", the answer is `apps-check.run --app <id>` plus `app.contract.full --app <id>` both exiting zero. Nothing else suffices.
