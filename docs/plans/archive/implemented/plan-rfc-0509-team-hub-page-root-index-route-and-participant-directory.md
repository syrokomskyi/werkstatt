---
rfcId: RFC-0509
planId: PLAN-RFC-0509-01
status: draft
owner: architecture
createdAt: 2026-07-24
updatedAt:
scope:
  apps:
    - warpgogol-com
  packages:
    - "@gogol/ontology"
    - "@gogol/site-kernel-checks"
    - "@gogol/site-kernel-codegen"
    - "@gogol/site-kernel-content"
    - "@gogol/ui"
  services: []
  docs:
    - docs/technology.xml
    - docs/knowledge-graph.xml
    - packages/ontology/AGENTS.md
---

# Implementation Plan: RFC-0509

## 1. Objectives

- [ ] Objective 1 — Extend `retiredRoutes` schema to support `status: 301` with optional `to` field (maps to acceptance criterion: `system.md` has a `founder` entry in `retiredRoutes` with `status: 301`)
- [ ] Objective 2 — Update `buildRetiredPageRoutesBlock` to emit 301 redirects in `_redirects` (maps to acceptance criterion: `/gruender/` redirects to `/team/andrii-syrokomskyi/`)
- [ ] Objective 3 — Add empty-list guard to `people-section.astro` (maps to acceptance criterion: `people-section.astro` suppresses empty sections)
- [ ] Objective 4 — Create team hub page, retire founder page, update system.md + navigation (maps to acceptance criteria: hub page exists, founder deleted, system.md updated, navigation updated)
- [ ] Objective 5 — Update `url-schema.yaml` C-contract (maps to acceptance criterion: `url-schema.yaml` includes `/team/` and `/komanda/`)
- [ ] Objective 6 — Ship `team.hub.validate` and join `sites-check-author` pipeline (maps to acceptance criterion: `team.hub.validate` passes and is registered)
- [ ] Objective 7 — Sync Compass docs and AGENTS.md (maps to implementation notes: update `docs/technology.xml` and `docs/knowledge-graph.xml`)

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/ontology/src/schemas/system/manifest.ts` — extend `retiredRoutes` schema: `status: z.union([z.literal(410), z.literal(301)])`, add optional `to: z.string().min(1)`
- `packages/os/site-kernel-content/src/system-manifest.ts` — update `SystemRoutesView` type projection for `retiredRoutes` 301 support
- `packages/os/site-kernel-codegen/src/app-boilerplate-helpers.ts` — update `buildRetiredPageRoutesBlock` to emit `/<slug>/* /<target> 301` when `status: 301` and `to` present
- `packages/os/site-kernel-checks/src/team-hub.ts` — new file: `team.hub.validate` command
- `packages/os/site-kernel-checks/src/command-tables/09-build-artifacts.ts` — register `team.hub.validate` command entry
- `packages/os/site-kernel-checks/src/pipelines/sites-check-author.ts` — add `{ command: "team.hub.validate" }` to pipeline
- `packages/ui/src/sections/people/people-section.astro` — add empty-list guard: suppress entire section when `selectPeople` returns `[]`

### 2.2 Configuration and data

- `missions/warpgogol-com-m000010/workpiece/src/content/pages/{de,uk}/team.md` — new authored team hub page (block-declarative YAML)
- `missions/warpgogol-com-m000010/workpiece/src/content/pages/{de,uk}/founder.md` — **deleted**
- `missions/warpgogol-com-m000010/workpiece/src/content/prose/{de,uk}/founder.md` — **deleted**
- `missions/warpgogol-com-m000010/workpiece/src/content/system.md` — add `team` page entry (`semanticType: collection`), remove `founder` page entry, add `founder` to `retiredRoutes` with `status: 301` and `to: participant:andrii-syrokomskyi`
- `missions/warpgogol-com-m000010/workpiece/src/content/navigation/{de,uk}/navigation.md` — replace `founder` nav entry with `team` entry
- `packages/ontology/src/external-surfaces/url-schema.yaml` — add `/team/` and `/komanda/` route patterns

### 2.3 Documentation and specs

- `docs/technology.xml` — add `/team/` route, `retiredRoutes` 301 extension
- `docs/knowledge-graph.xml` — add team hub page node, update founder page to retired
- `packages/ontology/AGENTS.md` — document `retiredRoutes` 301 support (if needed)

### 2.4 Validation and pipelines

- `sites-check-author` pipeline — add `team.hub.validate` step
- `surface.contract.validate` — must pass with updated `url-schema.yaml`
- `public.infrastructure.generate` — must emit correct 301 redirect in `_redirects`

## 3. Step sequence

### Step 1. Extend `retiredRoutes` schema for 301 redirects

**Goal:** Allow `retiredRoutes` entries to declare `status: 301` with an optional `to` field for redirect targets.

**Agent actions:**

- Edit `packages/ontology/src/schemas/system/manifest.ts:439-447`: change `status: z.literal(410)` to `status: z.union([z.literal(410), z.literal(301)])`, add `to: z.string().min(1).optional()`
- Update the JSDoc comment above `retiredRoutes` to document 301 support
- Update `packages/os/site-kernel-content/src/system-manifest.ts:98-99` type projection to include `status: 301` and optional `to`

**Validation:**

- `pnpm --filter @gogol/ontology run build:check`
- `pnpm --filter @gogol/site-kernel-content run build:check`

**Completion criterion:** `retiredRoutes` schema accepts `{ slug: "founder", status: 301, to: "participant:andrii-syrokomskyi" }` and rejects unknown status values; both packages typecheck.

**Human review:** no

---

### Step 2. Update `buildRetiredPageRoutesBlock` to emit 301 redirects

**Goal:** The `_redirects` generator emits 301 redirects when `retiredRoutes` has `status: 301` and a `to` target.

**Agent actions:**

- Edit `packages/os/site-kernel-codegen/src/app-boilerplate-helpers.ts:226-241`: in `buildRetiredPageRoutesBlock`, check `entry.status` — when `301` and `entry.to` is present, emit `/${slug}/* /<resolved-target> 301`; when `410`, emit the existing `/${slug}/* / 410` tombstone
- The `to` field is a pageId reference — resolve it via the route registry's `byPageId` map to get the localized route. If the pageId is not found, skip the redirect (fail open) and log a warning
- Update the header comment from "410 Gone tombstones" to "410 Gone tombstones + 301 redirects"

**Validation:**

- `pnpm --filter @gogol/site-kernel-codegen run build:check`

**Completion criterion:** `buildRetiredPageRoutesBlock` with input `{ retiredRoutes: [{ slug: "founder", status: 301, to: "participant:andrii-syrokomskyi" }] }` emits `# [RFC-0487/RFC-0509] Retired page routes — 410 Gone tombstones + 301 redirects.\n/founder/* /team/andrii-syrokomskyi 301`.

**Human review:** no

---

### Step 3. Add empty-list guard to `people-section.astro`

**Goal:** When `selectPeople` returns an empty array, the entire section (including heading) is suppressed.

**Agent actions:**

- Edit `packages/ui/src/sections/people/people-section.astro`: after line 69 (`const people = selectPeople(all, props.select);`), add a guard: if `people.length === 0`, render nothing (return early or wrap the entire SectionShell output in a conditional)
- The guard applies to all `people` sections, not just the team hub — empty sections should never render a heading with no content

**Validation:**

- `pnpm --filter @gogol/ui run build:check`

**Completion criterion:** A `people` section with `select` matching zero participants renders no HTML (no SectionShell, no heading, no empty list).

**Human review:** no

---

### Step 4. Create team hub page and retire founder page

**Goal:** Author the team hub page content, delete the founder page, and update `system.md` + navigation.

**Agent actions:**

- Create `missions/warpgogol-com-m000010/workpiece/src/content/pages/de/team.md` — block-declarative YAML with 4 blocks (hero + 3 people sections), `semanticType` not set here (set in system.md), DE content
- Create `missions/warpgogol-com-m000010/workpiece/src/content/pages/uk/team.md` — same structure, UK content (use the YAML from the RFC as the UK version)
- Delete `missions/warpgogol-com-m000010/workpiece/src/content/pages/{de,uk}/founder.md`
- Delete `missions/warpgogol-com-m000010/workpiece/src/content/prose/{de,uk}/founder.md`
- Edit `missions/warpgogol-com-m000010/workpiece/src/content/system.md`:
  - Add `team` page entry to `pages[]` with `semanticType: collection`, routes `de: team`, `uk: komanda`, `cosmicStar: Vega`
  - Remove the `founder` page entry from `pages[]`
  - Add `{ slug: founder, status: 301, to: participant:andrii-syrokomskyi }` to `retiredRoutes[]`
  - Update the page-description prose at the bottom (remove the `founder` line, add a `team` line)
- Edit `missions/warpgogol-com-m000010/workpiece/src/content/navigation/{de,uk}/navigation.md`: replace the `founder` entry (id: founder, label: Gründer/Засновник, pageId: founder, routeSlug: gruender/zasnovnyk) with a `team` entry (id: team, label: Team/Команда, pageId: team, routeSlug: team/komanda)

**Validation:**

- `pnpm exec site-kernel run system.manifest.validate --site warpgogol-com --json`
- `pnpm exec site-kernel run page.block.validate --site warpgogol-com --json`

**Completion criterion:** `team.md` exists in both locales with 4 blocks; `founder.md` and `prose/founder.md` are deleted in both locales; `system.md` has `team` page with `semanticType: collection` and `founder` in `retiredRoutes` with `status: 301`; navigation has `team` entry.

**Human review:** no — content is authored from the RFC specification

---

### Step 5. Update `url-schema.yaml` C-contract

**Goal:** Add `/team/` and `/komanda/` route patterns to the external surfaces C-contract.

**Agent actions:**

- Edit `packages/ontology/src/external-surfaces/url-schema.yaml`: add two new route patterns:
  - `/:locale?/team` with `locale.enum: [de, en]`, `generated: false`
  - `/:locale?/komanda` with `locale.enum: [uk]`, `generated: false`

**Validation:**

- `pnpm exec site-kernel run surface.contract.validate --site warpgogol-com --json`

**Completion criterion:** `url-schema.yaml` includes both patterns; `surface.contract.validate` passes.

**Human review:** no

---

### Step 6. Ship `team.hub.validate`

**Goal:** Create the `team.hub.validate` command and register it in the pipeline.

**Agent actions:**

- Create `packages/os/site-kernel-checks/src/team-hub.ts`:
  - Read `system.md` and the team page content files
  - Verify: `team` page exists with `semanticType: collection`
  - Verify: team page has ≥3 `people` blocks with `select.participantType` values `human`, `organization-unit`, `ai-agent`
  - Verify: all `people` blocks have `select.visibility: public` and `select.status: active`
  - Verify: `founder` pageId absent from `system.md`
  - Verify: `founder` in `retiredRoutes` with `status: 301` and `to: participant:andrii-syrokomskyi`
  - Verify: navigation has `team` entry pointing to `pageId: team`
  - All rules are errors (exit code 1); `--json` output follows standard kernel command envelope
- Register the command in `packages/os/site-kernel-checks/src/command-tables/09-build-artifacts.ts` with `name: "team.hub.validate"`, `scope: "app"`, `supportsAllSites: true`
- Add `{ command: "team.hub.validate" }` to `packages/os/site-kernel-checks/src/pipelines/sites-check-author.ts` after `participant.validate` (line 168)

**Validation:**

- `pnpm --filter @gogol/site-kernel-checks run build:check`
- `pnpm exec site-kernel run team.hub.validate --site warpgogol-com --json`

**Completion criterion:** `team.hub.validate` passes on warpgogol-com; command is registered and appears in `sites-check-author` pipeline.

**Human review:** no

---

### Step 7. Sync Compass docs and AGENTS.md

**Goal:** Update affected documentation artifacts to reflect the new `/team/` route and `retiredRoutes` 301 extension.

**Agent actions:**

- Update `docs/technology.xml`: add `/team/` route to the route table; document `retiredRoutes` 301 support in the system manifest section
- Update `docs/knowledge-graph.xml`: add team hub page node; update founder page node to `retired` status
- Run `pnpm exec site-kernel run ecosystem.manifest.generate` if command surfaces changed
- Update `packages/ontology/AGENTS.md` if the `retiredRoutes` 301 extension needs documentation

**Validation:**

- `pnpm exec site-kernel run rfc.validate --id RFC-0509`
- `pnpm exec site-kernel run sites-check.author --site warpgogol-com --json`

**Completion criterion:** All scope docs are updated; `rfc.validate` passes; `sites-check.author` passes.

**Human review:** no

---

### Final Step. Documentation sync and acceptance criteria verification

**Goal:** Verify all acceptance criteria and stamp the RFC as implemented.

**Agent actions:**

- Verify every acceptance criterion in RFC-0509 against the implemented code. Mark `[x]` for verified criteria.
- Run `pnpm exec site-kernel run rfc.implement.stamp --id RFC-0509 --implementation-commit <sha>` to transition `accepted → implemented`.
- Run `pnpm exec site-kernel run ecosystem.manifest.generate` if command surfaces or pipeline topology changed.

**Validation:**

- `git status` — no uncommitted changes from the current session.
- `pnpm exec site-kernel run rfc.validate --id RFC-0509`
- Every file in `scope.docs` is either updated or documented as not-applicable.

**Completion criterion:** All acceptance criteria checked off with inline `(evidence: ...)` annotations; RFC stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476).

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec site-kernel run rfc.validate --id RFC-0509`
- `pnpm --filter @gogol/ontology run build:check`
- `pnpm --filter @gogol/site-kernel-checks run build:check`
- `pnpm --filter @gogol/site-kernel-codegen run build:check`
- `pnpm --filter @gogol/ui run build:check`
- `pnpm exec site-kernel run sites-check.author --site warpgogol-com --json`
- `pnpm exec site-kernel run surface.contract.validate --site warpgogol-com --json`
- `pnpm exec site-kernel run team.hub.validate --site warpgogol-com --json`

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0509` in the subject line (RFC-0265 commit hygiene)
- `docs/rfcs/verification/rfc-0509.generated.json` — verification evidence (if acceptance probes declared)

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --------------- | ---------------------- |
| Redirect from `/gruender/` may break existing links | Step 2 emits a 301 redirect in `_redirects`; Step 6 validates the redirect is registered |
| Empty AI-agent section renders heading with no content | Step 3 adds empty-list guard to `people-section.astro` |
| Navigation change confuses returning visitors | Step 4 replaces nav entry; 301 redirect softens the transition |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-24 (block-declarative pages) or DNA-39 (route registry merge), run `pnpm exec site-kernel run rfc.supersede.propose --id RFC-0509 --reason "..." --invariant "DNA-N"` instead of working around it.
- If the `retiredRoutes` 301 extension conflicts with existing `b2b.model.validate` rules (B2B-CONFLICT-01), escalate to a superseding RFC rather than adding a special-case bypass.
