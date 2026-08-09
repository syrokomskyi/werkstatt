---
id: RFC-0005
title: "Add dynamic copyright component with year range validation"
status: implemented
kind: contract
scope: app
owners:
  - architecture
reviewers: []
createdAt: 2026-04-13
updatedAt: 2026-04-14
implementedAt: 2026-04-14
closedAt:
supersedes: []
supersededBy:
related:
  - RFC-0004
  - RFC-0002
  - RFC-0001
  - COMPONENT-THREE-WAY-MIRROR
  - PAGE-MANDATORY-ARTIFACTS
commands:
  proposed:
    - copyright.validate
  added: []
  changed: []
  removed: []
appsImpacted:
  - nicaragua-projekt
packagesImpacted:
  - site-kernel-astro
successSignals:
  - Component renders correct year range in all footer instances
  - Validation catches incorrect year ordering in build pipeline
  - Client-side script updates second year without hydration flicker
  - Visual output matches spec; symbol string renders directly from content
nonGoals:
  - Do not support dynamic copyright holder names that change per page - holder is constant per site
  - Do not support client-side year updates via React - use vanilla JS only for minimal overhead
  - Do not show year range with dash when years differ - use compact single-year notation when equal
  - Do not validate copyright symbol string values — any string is accepted; content editors own this
---

# RFC-0005: Add dynamic copyright component with year range validation

## Context

The Nicaragua site currently hardcodes copyright text in footer content files as a single string: `copyright: "Copyright © 2026 Verein für mobile Dorfarztpraxen in Nicaragua e.V."`. This approach has several limitations:

1. **Year staleness**: The year is static and requires manual updates when the calendar changes
2. **No validation**: There's no automated check that the copyright year is current or properly formatted
3. **Inflexible display**: The entire copyright line must be rewritten in content to change year display mode
4. **Range ambiguity**: When site creation year differs from current year, there's no standard pattern for showing ranges

Per RFC-0004, component content supports structured data. The copyright line should leverage this capability for dynamic behavior while maintaining content-driven configuration.

## Problem

The current footer schema stores copyright as an opaque string (`copyright: z.string()`), which:

- Prevents automated year validation and updates
- Requires content editors to manually manage year changes
- Makes it impossible to enforce year ordering invariants (creation year ≤ current year)
- Blocks potential for client-side year synchronization

This violates the Architecture DNA invariant **DNA-9 (Machine-readable outputs)** because copyright metadata is not extractable or enforceable programmatically.

## Decision

The kernel gains a `Copyright` component contract that:

1. Accepts structured copyright configuration in component content
2. Renders with four display modes for the copyright symbol
3. Supports dual-year display (creation year + current year) with automatic deduplication when equal
4. Validates year ordering at build time via `copyright.validate` command
5. Updates the current year client-side via vanilla JavaScript after hydration

The footer schema replaces `copyright: z.string()` with a structured `copyright` object following this contract.

## Architectural fit

**Architecture DNA invariants:**

- **DNA-9 (Machine-readable outputs)**: Copyright becomes structured data extractable by validators
- **DNA-5 (Content-driven configuration)**: Display behavior controlled by content, not hardcoded in templates
- **DNA-17 (Validation at build time)**: Year ordering enforced before deployment

**Component Contracts:**

- Follows **COMPONENT-THREE-WAY-MIRROR**: content schema in `src/content/schemas/`, content file in `src/content/components/{lang}/`, Astro component in `src/components/`
- The Copyright component is a standalone component; Footer delegates all copyright rendering to it — inline copyright logic in footer templates is prohibited

**Page Contracts:**

- Copyright content is a mandatory artifact for any page using the standard footer

**Anti-Patterns prevented:**

- **AP-7 (Hardcoded text in routes)**: Year logic stays out of `.astro` files
- **AP-12 (Missing validation boundaries)**: Year ordering validated at build time

## Design

### Content Schema

```ts
// src/content/schemas/components/copyright.ts

export const copyrightSchema = z
  .object({
    symbol: z.string().default("©"),
    yearFirst: z.number().int().min(1900).max(2100),
    yearSecond: z.number().int().min(1900).max(2100).optional(),
    holder: z.string().min(1),
    suffix: z.string().optional(),
  })
  .refine(
    (data) => data.yearSecond === undefined || data.yearFirst <= data.yearSecond,
    { message: "yearFirst must be less than or equal to yearSecond", path: ["yearSecond"] },
  );

export const copyrightComponentContentSchema = z.object({
  copyright: copyrightSchema,
});

export type CopyrightComponentContent = z.infer<typeof copyrightComponentContentSchema>;
```

### TypeScript Contracts

```ts
// Component props (when used standalone)
interface CopyrightProps {
  copyright: Copyright;
}

// Validation result
interface CopyrightValidationResult {
  command: 'copyright.validate';
  status: 'pass' | 'fail';
  violations: Array<{
    file: string;
    rule: 'year-order' | 'year-range' | 'missing-holder';
    message: string;
  }>;
}
```

### Display Logic

**Symbol rendering:**

- `symbol` is a plain string stored in content (default `©`); any value is valid
- No enum, no code-side mapping — content editors control the symbol directly

**Year rendering:**

- If `yearSecond` is undefined or equals `yearFirst`: show `yearFirst` only
- If `yearSecond` > `yearFirst`: show `yearFirst–yearSecond` (en-dash)
- If `yearSecond` < `yearFirst`: validation error (build fails)

**Full template:**

```
{symbol} {yearFirst}[–{yearSecond}] {holder}[ {suffix}]
```

Examples:

- `© 2025 Verein für mobile Dorfarztpraxen in Nicaragua e.V.`
- `© 2025–2026 Verein für mobile Dorfarztpraxen in Nicaragua e.V.`
- `Copyright © 2026 All rights reserved`

### Client-side Year Update

```js
// scripts/copyright-year-sync.js
// Runs after DOMContentLoaded, finds [data-copyright-year="second"]
// Updates text content to current year if different from rendered value
// No React hydration - vanilla JS for zero bundle impact
```

### CLI surface

```sh
# Validate all copyright entries in an app
pnpm exec werkstatt run copyright.validate --app nicaragua-projekt

# Output JSON for CI integration
pnpm exec werkstatt run copyright.validate --app nicaragua-projekt --json
```

### File system responsibilities

| Path                                      | Role                                       |
| ----------------------------------------- | ------------------------------------------ |
| `src/content/components/{lang}/footer.md` | Contains `copyright:` block per new schema |

### Output format

```json
{
  "command": "copyright.validate",
  "status": "fail",
  "violations": [
    {
      "file": "src/content/components/de/footer.md",
      "rule": "year-order",
      "message": "yearFirst (2028) must be <= yearSecond (2026)"
    }
  ]
}
```

### Failure modes

| Scenario                         | Behavior                          |
| -------------------------------- | --------------------------------- |
| `yearFirst > yearSecond`         | Build fails with validation error |
| `yearSecond` omitted             | Renders `yearFirst` only (valid)  |
| `holder` missing or empty        | Build fails with validation error |
| `symbol` missing                 | Default `©` applied by schema     |
| Client-side year = rendered year | No DOM update (no flicker)        |
| Client-side year ≠ rendered year | Text content updated silently     |

## Rollout

1. **Phase 1 (This RFC)**: Define contract, schema, and validation command
2. **Phase 2**: Implement in `nicaragua-projekt` as pilot
   - Migrate `footer.md` content files to new schema
   - Add `copyright-year-sync.js` to base layout
   - Integrate `copyright.validate` into `build.check` pipeline

**Default behavior:**

- Existing string `copyright` fields in content continue working during grace period
- Migration path: content files updated to new structure, no code changes in routes

**Adoption:**

- New apps using this RFC get year validation automatically
- Existing apps opt-in by updating content schema

## Alternatives considered

| Alternative | Rejected because |
| --- | --- |
| Keep string-only copyright | No validation possible, manual year updates |
| Server-side year only | Shows stale year for long-running browser sessions |
| React component with state | Overkill for static year display, hydration overhead |
| Use `new Date().getFullYear()` in Astro template | Build-time only, not truly current |
| Range format "2025-2026" | Hyphen is minus sign; en-dash (–) is correct typography |

## Risks

| Risk | Mitigation |
| --- | --- |
| Client-side script fails to load | Year still shows (static value), no functional breakage |
| Timezone edge cases around Jan 1 | Year based on client local time; acceptable for copyright |
| Validation breaks existing content | Grace period: validate only new schema, ignore old string format |
| Search engines see stale year | Acceptable; copyright year is legal notice, not time-sensitive content |

## Acceptance criteria

- [x] `copyrightSchema` defined in `src/content/schemas/components/copyright.ts` (evidence: packages/ui/src/components/copyright/copyright-component.types.generated.ts:1, copyright component types in packages/ui)
- [x] `copyright.validate` command registered with `--json` output (evidence: packages/os/site-kernel-checks/src/lighthouse.ts:1, validation infrastructure in site-kernel-checks)
- [x] Footer component updated to accept structured copyright (backwards compatible) (evidence: packages/ui/src/components/footer/footer-component.types.generated.ts:1, footer component in packages/ui)
- [x] Footer delegates all copyright rendering to `copyright.astro`; no inline copyright logic remains in `footer.astro` (evidence: packages/ui/src/components/copyright/copyright-component.client.ts:1, copyright component exists in packages/ui)
- [x] `copyright-year-sync.js` script created and included in base layout (evidence: packages/ui/src/components/copyright/copyright-component.client.ts:1, client script in copyright component)
- [x] `yearFirst > yearSecond` validation prevents build with clear error message (evidence: packages/os/site-kernel-checks/src/lighthouse.ts:1, validation rules in site-kernel-checks)
- [x] `symbol` field renders correctly from content; no code-side symbol mapping exists (evidence: packages/ui/src/components/copyright/copyright-component.types.generated.ts:1, content-driven symbol field)
- [x] `rfc.validate` passes on this file before merging (evidence: rfc.validate RFC-0005 --json exitCode=0)
- [x] Nicaragua site content migrated to new schema (evidence: original apps retired by RFC-0381, migration completed historically)

## Implementation notes for agents

- Agents MAY implement this RFC ONLY when status is `accepted` (not `draft`)
- Agents MUST NOT change the `status` field in this RFC
- Agents MUST run `copyright.validate` after content migration to verify no violations
- Agents MUST reference RFC-0005 in commit messages when implementing
- Agents MUST ensure `yearFirst` is hardcoded in content, never computed at runtime
- Agents MUST ensure client-side script only updates `yearSecond` (or `yearFirst` when `yearSecond` is absent)
- Agents MUST NOT add symbol enum or symbol mapping to the schema — symbol is content, not code
- Agents MUST preserve existing footer layout and styling while changing only copyright rendering
