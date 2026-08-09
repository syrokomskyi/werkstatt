---
rfcId: RFC-0373
planId: PLAN-RFC-0373-01
status: draft
owner: architecture
createdAt: 2026-07-11
updatedAt:
scope:
  apps:
    - apps/warpgogol-com
    - apps/nicaragua-projekt
    - apps/check-warpgogol-com
  packages:
    - packages/share
    - packages/business
    - packages/os/site-kernel-checks
    - packages/os/site-kernel-content
  services: []
  docs:
    - docs/rfcs/rfc-0373-extract-services-at-organization-level-from-business-catalog.md
    - docs/technology.xml
    - docs/verification-plan.xml
---

# Implementation Plan: RFC-0373

## 1. Objectives

- [ ] O1 — Add `projectServices()` projector to `business-projection.ts` (acceptance criterion 1)
- [ ] O2 — Add `description: z.string().optional()` to `businessServiceSchema` (acceptance criterion 2)
- [ ] O3 — Add `services?` to `OrganizationProfileInput`; wire in `buildOrganizationProfile()` (acceptance criterion 3)
- [ ] O4 — Make `SemanticService.description` optional; remove `SemanticPageModel.services` (acceptance criterion 4)
- [ ] O5 — Wire both loaders (disk + Astro) to read `business/{lang}/services/` and pass projected services to `buildOrganizationProfile()` (acceptance criteria 5–6)
- [ ] O6 — Update JSON-LD: `buildServiceNodes()`, `servicesListNode`, `servicesListId`, `webpage.ts` mentions to read from org (acceptance criteria 7–10)
- [ ] O7 — Add `formatServices()` to `llms.ts`; emit `## Services` in `llms-full.txt` (acceptance criterion 11)
- [ ] O8 — Remove `extractServices()` and `services` return from `home-page.ts` (acceptance criterion 12)
- [ ] O9 — Implement `services.projection.validate` command; register in `16-offer.ts`; wire into `APPS_BUILD_CHECK_PIPELINE` (acceptance criterion 13)
- [ ] O10 — All apps build green; `rfc.validate` passes; nicaragua-projekt omits services with no error (acceptance criteria 14–16)

## 2. Affected artifacts

### 2.1 Code and commands

**`packages/share/src/semantic/`**

- `business-projection.ts` — Add `projectServices()` projector: maps `Record<string, unknown>[]` → `SemanticService[]`. Records without `name` are dropped. `id` = `slug || name`. `description` included only when present.
- `models.ts` — Make `SemanticService.description` optional (`string?` → `string | undefined`). Remove `services?: SemanticService[]` from `SemanticPageModel`.
- `organization-profile.ts` — Add `services?: SemanticService[]` to `OrganizationProfileInput`. In `buildOrganizationProfile()`, add `...(input.services?.length ? { services: input.services } : {})` to the organization object.
- `llms.ts` — Add `formatServices(site: SemanticSiteModel): string[]`. Emits `## Services` with `- {name}: {description}` (description omitted when absent). Insert after `formatOffer()` and before `formatLocation()` in `buildLlmsFull()` org-section order.
- `jsonld/service.ts` — Change `buildServiceNodes()` to read from `context.page.organization.services` instead of `context.page.services`. In `buildServiceNode()`, conditionally include `description` only when present.
- `jsonld/context.ts` — Change `servicesListId` derivation: from `page.services` → `page.organization.services`. Scope: `${ids.organization}/services` instead of `${webpageId}/services`.
- `jsonld.ts` — Change `servicesListNode` to read from `context.page.organization.services` instead of `context.page.services`.
- `jsonld/webpage.ts` — Change `mentions` condition: from `page.services?.length` → `page.organization.services?.length`. Keep referencing `servicesListId`.
- `page-builders/home-page.ts` — Delete `extractServices()` function (lines 206–218). Remove `services` from the return object (line 351). Remove the `services` variable and its fallback logic (lines 307–320). Remove `SemanticService` from imports.

**`packages/business/src/`**

- `schemas/service.ts` — Add `description: z.string().optional()` to `businessServiceSchema`.
- `semantic-profile.ts` — Import `getBusinessServices` from `./loaders.ts`. Import `projectServices` from `@gogol/share/semantic`. Call `getBusinessServices(lang)`, project via `projectServices()`, pass to `buildOrganizationProfile()` as `services`.

**`packages/os/site-kernel-content/src/`**

- `semantic-loader.ts` — After existing `readBusinessCollection()` calls, read `business/{lang}/services/` via `readBusinessCollection()`, project via `projectServices()`, pass to `buildOrganizationProfile()` as `services`.

**`packages/os/site-kernel-checks/src/`**

- `services-projection.ts` — **New file.** Implements `services.projection.validate` command. App-scoped. Reads `business/{lang}/services/*.md` from the app's content directory. Rules:
  - `missing-name` (blocking): service file has `slug` but no `name` field.
  - `duplicate-slug` (blocking): two files share the same `slug` within a language.
  - `duplicate-id` (blocking): projected `SemanticService[]` has duplicate `id` values.
  - `ambiguous-source` (advisory/warn): `services.md` single-file exists alongside `services/` directory.
  - Exit code: 0 on pass, non-zero on fail. Advisory warnings do not affect exit code.
- `command-tables/16-offer.ts` — Add `services.projection.validate` entry to `OFFER_COMMANDS`. Import from `../services-projection.ts`.
- `pipelines/build-check.ts` — Add `{ command: "services.projection.validate" }` to `APPS_BUILD_CHECK_PIPELINE`.

### 2.2 Configuration and data

- No content files need to be authored — content authoring is explicitly out of scope (RFC Phase 5).
- The existing orphan `business/de/services.md` in warpgogol-com is not modified.

### 2.3 Documentation and specs

- `docs/rfcs/rfc-0373-*.md` — Read-only reference (accepted status).
- `docs/technology.xml` — Update inventory entries for `business-projection.ts` (new projector), `models.ts` (changed types), `services-projection.ts` (new file). Run `ecosystem.manifest.generate` to regenerate `docs/ecosystem.generated.json`.
- `docs/verification-plan.xml` — Update if it lists individual check commands. Run `ecosystem.manifest.generate`.
- `CHANGE_SUMMARY` blocks in all modified source files must be updated per `docs/source-markup.xml`.
- `packages/share/AGENTS.md` — No changes needed (entry point table unchanged).
- `packages/os/site-kernel-checks/AGENTS.md` — No changes needed (command table pattern unchanged).
- RFC-0147 `amendedBy` field — Add `RFC-0373` when implementing.

### 2.4 Validation and pipelines

- `services.projection.validate` joins `APPS_BUILD_CHECK_PIPELINE`.
- `pnpm exec werkstatt run rfc.validate RFC-0373 --json` — must pass.
- `pnpm --filter @gogol/share run build:check` — must pass after type changes.
- `pnpm --filter @gogol/business run build:check` — must pass after schema change.
- `pnpm --filter @gogol/site-kernel-checks run build:check` — must pass after new command.
- `pnpm --filter @gogol/site-kernel-content run build:check` — must pass after loader change.
- `pnpm run build:check` per app — all three apps must build green.
- Generated baselines (`kernel-flags-lint.baseline.generated.json`, `check-fixture-lint.baseline.generated.json`) must be regenerated if the new command name appears in lint output.

## 3. Step sequence

### Step 1. Add `projectServices()` projector and update `SemanticService` type

**Goal:** Establish the projector function and type contract that all downstream code will consume.

**Agent actions:**

- Add `projectServices()` to `packages/share/src/semantic/business-projection.ts`:
  ```ts
  export function projectServices(
    records: ReadonlyArray<Record<string, unknown>> | undefined,
  ): SemanticService[] {
    if (!records?.length) return [];
    const services: SemanticService[] = [];
    for (const r of records) {
      const name = typeof r["name"] === "string" ? (r["name"] as string).trim() : "";
      if (!name) continue;
      const slug = typeof r["slug"] === "string" ? (r["slug"] as string) : "";
      const description = typeof r["description"] === "string" ? (r["description"] as string).trim() : "";
      services.push({
        id: slug || name,
        name,
        ...(description ? { description } : {}),
      });
    }
    return services;
  }
  ```
- Import `SemanticService` in `business-projection.ts` (add to existing import from `./models.ts`).
- In `packages/share/src/semantic/models.ts`, change `SemanticService.description` from `string` to `string | undefined` (optional).
- Remove `services?: SemanticService[]` from `SemanticPageModel` in `models.ts`.
- Update `CHANGE_SUMMARY` in both files.

**Validation:**

- `pnpm --filter @gogol/share run build:check` — expect type errors in consumers (expected; subsequent steps fix them).

**Completion criterion:** `projectServices()` is defined; `SemanticService.description` is optional; `SemanticPageModel.services` is removed.

**Human review:** no

---

### Step 2. Add `services` to `OrganizationProfileInput`

**Goal:** Allow the org profile builder to accept and set services.

**Agent actions:**

- In `packages/share/src/semantic/organization-profile.ts`:
  - Add `services?: SemanticService[]` to `OrganizationProfileInput` interface.
  - Import `SemanticService` from `./models.ts`.
  - In `buildOrganizationProfile()`, add `...(input.services?.length ? { services: input.services } : {})` to the `organization` object.
- Update `CHANGE_SUMMARY`.

**Validation:**

- `pnpm --filter @gogol/share run build:check` — still expect type errors in JSON-LD and home-page consumers.

**Completion criterion:** `OrganizationProfileInput.services` exists; `buildOrganizationProfile()` sets `organization.services` when non-empty.

**Human review:** no

---

### Step 3. Update JSON-LD to read from organization

**Goal:** All JSON-LD service nodes and the services list node read from `page.organization.services`.

**Agent actions:**

- In `packages/share/src/semantic/jsonld/context.ts`:
  - Change `servicesListId` from `page.services && page.services.length > 0 ? \`${webpageId}/services\` : undefined` to `page.organization.services?.length ? \`${ids.organization}/services\` : undefined`.
- In `packages/share/src/semantic/jsonld/service.ts`:
  - Change `buildServiceNodes()` from `context.page.services ?? []` to `context.page.organization.services ?? []`.
  - In `buildServiceNode()`, conditionally include `description`: `...(service.description ? { description: service.description } : {})` instead of unconditional `description: service.description`.
- In `packages/share/src/semantic/jsonld.ts`:
  - Change `servicesListNode` `itemListElement` from `context.page.services ?? []` to `context.page.organization.services ?? []`.
- In `packages/share/src/semantic/jsonld/webpage.ts`:
  - Change `mentions` condition from `page.services?.length && servicesListId` to `page.organization.services?.length && servicesListId`.
- Update `CHANGE_SUMMARY` in all four files.

**Validation:**

- `pnpm --filter @gogol/share run build:check` — expect type errors in `home-page.ts` only (fixed in Step 5).

**Completion criterion:** All JSON-LD service wiring reads from `page.organization.services`; `servicesListId` is org-scoped; `description` is conditional.

**Human review:** no

---

### Step 4. Add `formatServices()` to `llms.ts`

**Goal:** LLM text output includes a `## Services` section.

**Agent actions:**

- In `packages/share/src/semantic/llms.ts`:
  - Add `formatServices(site: SemanticSiteModel): string[]`:
    ```ts
    function formatServices(site: SemanticSiteModel): string[] {
      const services = site.organization.services;
      if (!services?.length) return [];
      const lines: string[] = ["## Services"];
      for (const service of services) {
        const desc = service.description ? `: ${service.description}` : "";
        lines.push(`- ${service.name}${desc}`);
      }
      lines.push("");
      return lines;
    }
    ```
  - In `buildLlmsFull()`, insert `formatServices(site)` into the `orgSections` array between `formatOffer(site)` and `formatLocation(site)`:
    ```ts
    const orgSections = [
      ...formatOffer(site),
      ...formatServices(site),
      ...formatLocation(site),
      ...formatTeam(site),
    ].filter((s) => s.length > 0);
    ```
- Update `CHANGE_SUMMARY`.

**Validation:**

- `pnpm --filter @gogol/share run build:check` — expect type errors in `home-page.ts` only.

**Completion criterion:** `formatServices()` is defined; `## Services` section is emitted in `buildLlmsFull()` between Offer and Location.

**Human review:** no

---

### Step 5. Remove `extractServices()` and `services` from `home-page.ts`

**Goal:** Eliminate the page-level services extraction.

**Agent actions:**

- In `packages/share/src/semantic/page-builders/home-page.ts`:
  - Delete the `extractServices()` function (lines 206–218).
  - Remove the `services` variable declaration and its fallback logic (lines 307–320).
  - Remove `services: services.length > 0 ? services : undefined` from the return object (line 351).
  - Remove `SemanticService` from the type import on line 18.
- Update `CHANGE_SUMMARY`.

**Validation:**

- `pnpm --filter @gogol/share run build:check` — must pass (all type errors resolved).

**Completion criterion:** `extractServices()` is deleted; `services` is not in the return object; `SemanticService` is not imported.

**Human review:** no

---

### Step 6. Add `description` to `businessServiceSchema`

**Goal:** Allow authors to provide service descriptions in the business catalog.

**Agent actions:**

- In `packages/business/src/schemas/service.ts`:
  - Add `description: z.string().optional()` to `businessServiceSchema`.
- Update `CHANGE_SUMMARY`.

**Validation:**

- `pnpm --filter @gogol/business run build:check` — must pass.

**Completion criterion:** `businessServiceSchema` includes optional `description`.

**Human review:** no

---

### Step 7. Wire Astro loader (`semantic-profile.ts`)

**Goal:** The Astro content-layer path reads and projects services.

**Agent actions:**

- In `packages/business/src/semantic-profile.ts`:
  - Import `getBusinessServices` from `./loaders.ts`.
  - Import `projectServices` from `@gogol/share/semantic`.
  - After the `offer` and `location` projections, add:
    ```ts
    const services = projectServices(
      (await getBusinessServices(lang).catch(() => [])).map(
        (entry) => entry.data as Record<string, unknown>,
      ),
    );
    ```
  - Pass `...(services.length ? { services } : {})` to `buildOrganizationProfile()`.
- Update `CHANGE_SUMMARY`.

**Validation:**

- `pnpm --filter @gogol/business run build:check` — must pass.

**Completion criterion:** `semantic-profile.ts` calls `getBusinessServices()`, projects via `projectServices()`, passes to `buildOrganizationProfile()`.

**Human review:** no

---

### Step 8. Wire disk loader (`semantic-loader.ts`)

**Goal:** The disk-based loader reads and projects services.

**Agent actions:**

- In `packages/os/site-kernel-content/src/semantic-loader.ts`:
  - Import `projectServices` from `@gogol/share/semantic`.
  - After existing `readBusinessCollection()` calls, add:
    ```ts
    const serviceRecords = await readBusinessCollection(contentDir, lang, "services", defaultLang);
    const services = projectServices(serviceRecords);
    ```
  - Pass `...(services.length ? { services } : {})` to `buildOrganizationProfile()`.
- Update `CHANGE_SUMMARY`.

**Validation:**

- `pnpm --filter @gogol/site-kernel-content run build:check` — must pass.

**Completion criterion:** `semantic-loader.ts` reads `business/{lang}/services/`, projects via `projectServices()`, passes to `buildOrganizationProfile()`.

**Human review:** no

---

### Step 9. Implement `services.projection.validate`

**Goal:** Validation command for the services projection.

**Agent actions:**

- Create `packages/os/site-kernel-checks/src/services-projection.ts`:
  - Implement `runServicesProjectionValidate` function.
  - App-scoped: reads `business/{lang}/services/*.md` from the app's content directory.
  - Rules:
    - `missing-name` (blocking): file has `slug` but no `name`.
    - `duplicate-slug` (blocking): two files share `slug` within a language.
    - `duplicate-id` (blocking): projected `SemanticService[]` has duplicate `id` values.
    - `ambiguous-source` (advisory): `services.md` exists alongside `services/` directory.
  - Exit code: 0 on pass, non-zero on fail. Advisory warnings do not affect exit code.
  - Add `MODULE_CONTRACT` and `CHANGE_SUMMARY` blocks.
- In `packages/os/site-kernel-checks/src/command-tables/16-offer.ts`:
  - Import `runServicesProjectionValidate` from `../services-projection.ts`.
  - Add entry to `OFFER_COMMANDS`:
    ```ts
    {
      name: "services.projection.validate",
      description: "Validate business services projection: schema compliance, slug uniqueness, no orphan files. RFC-0373.",
      scope: "app",
      supportsAllApps: true,
      execute: runServicesProjectionValidate,
    },
    ```
- In `packages/os/site-kernel-checks/src/pipelines/build-check.ts`:
  - Add `{ command: "services.projection.validate" }` to `APPS_BUILD_CHECK_PIPELINE`.
- Regenerate baselines if the new command name appears in lint output.

**Validation:**

- `pnpm --filter @gogol/site-kernel-checks run build:check` — must pass.
- `pnpm exec werkstatt run services.projection.validate --app warpgogol-com` — must pass (no services files = no violations).
- `pnpm exec werkstatt run services.projection.validate --app nicaragua-projekt` — must pass.

**Completion criterion:** `services.projection.validate` is registered, runs per-app, and passes on all apps (no services files = no violations).

**Human review:** no

---

### Step 10. Update `amendedBy` on RFC-0147

**Goal:** Satisfy RFC-0373 implementation note: update `amendedBy` on RFC-0147.

**Agent actions:**

- In `docs/rfcs/rfc-0147-*.md`, add `RFC-0373` to the `amendedBy` array.

**Validation:**

- `pnpm exec werkstatt run rfc.validate RFC-0373 --json` — must pass.
- `pnpm exec werkstatt run rfc.validate RFC-0147 --json` — must pass.

**Completion criterion:** RFC-0147 `amendedBy` includes `RFC-0373`.

**Human review:** no

---

### Step 11. Compass sync and ecosystem manifest regeneration

**Goal:** Keep `docs/*.xml` and generated projections synchronized.

**Agent actions:**

- Run `pnpm exec werkstatt run ecosystem.manifest.generate` to regenerate `docs/ecosystem.generated.json`.
- Update `docs/technology.xml` inventory entries for new/changed source files if the generator does not auto-update them.
- Update `docs/verification-plan.xml` if it lists individual check commands.

**Validation:**

- `pnpm exec werkstatt run ecosystem.manifest.validate --json` — must pass.
- `pnpm exec werkstatt run workspace.surface.validate --json` — must pass.

**Completion criterion:** `ecosystem.manifest.validate` and `workspace.surface.validate` pass.

**Human review:** no

---

### Step 12. Full build verification

**Goal:** All apps build green with the new projection.

**Agent actions:**

- Run `pnpm run build:check` for `warpgogol-com`.
- Run `pnpm run build:check` for `nicaragua-projekt`.
- Run `pnpm run build:check` for `check-warpgogol-com`.
- Verify `nicaragua-projekt` (no services) omits `## Services` in llms-full.txt with no error.
- Run `pnpm exec werkstatt run rfc.validate RFC-0373 --json` — must pass.

**Validation:**

- All three `build:check` runs pass.
- `rfc.validate` passes.

**Completion criterion:** All acceptance criteria checkboxes in RFC-0373 are verifiable as checked.

**Human review:** no

---

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate RFC-0373 --json`
- `pnpm exec werkstatt run rfc.validate RFC-0147 --json`
- `pnpm --filter @gogol/share run build:check`
- `pnpm --filter @gogol/business run build:check`
- `pnpm --filter @gogol/site-kernel-checks run build:check`
- `pnpm --filter @gogol/site-kernel-content run build:check`
- `pnpm exec werkstatt run services.projection.validate --app warpgogol-com`
- `pnpm exec werkstatt run services.projection.validate --app nicaragua-projekt`
- `pnpm exec werkstatt run services.projection.validate --app check-warpgogol-com`
- `pnpm run build:check` (per app, all three)
- `pnpm exec werkstatt run ecosystem.manifest.validate --json`
- `pnpm exec werkstatt run workspace.surface.validate --json`

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0373` in the subject line (RFC-0265 commit hygiene).
- `docs/rfcs/verification/rfc-0373.generated.json` — verification evidence (RFC-0330, if RFC-0330 is implemented by then).

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| `SemanticPageModel.services` removal is a breaking change | Steps 1–5 update all consumers atomically; `build:check` after Step 5 confirms zero remaining references |
| Content gap — no `business/{lang}/services/` content exists yet | Step 9 confirms validator passes with no services files; projection is ready for when content arrives |
| Orphan `services.md` file confuses agents | Step 9 implements `ambiguous-source` advisory rule; file is not modified |
| RFC-0372 ordering — if RFC-0372 lands first, `page.services` is dead | This RFC lands first (per operator decision); `extractServices()` is removed in Step 5; when RFC-0372 later deletes `home-page.ts` entirely, it is a clean deletion |
| `services.projection.validate` false-positive on `ambiguous-source` | Rule is advisory (warn), not blocking — does not affect exit code |
| Agent misinterpretation of content scope | No content files are authored in this plan; Phase 5 of RFC is explicitly out of scope |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-16, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0373 --reason "..." --invariant "DNA-16"` instead of working around it.
- If `projectServices()` cannot produce valid `SemanticService[]` from the existing `businessServiceSchema` shape (e.g. `slug` field is missing or renamed), escalate — the schema may need a separate RFC amendment.
- If the disk loader's `readBusinessCollection()` cannot read `services/` subdirectory (e.g. path resolution differs from other collections), escalate — the loader may need a fix outside this RFC's scope.
