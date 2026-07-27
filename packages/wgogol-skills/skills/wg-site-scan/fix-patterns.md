# Fix Patterns (L1)

Baseline fix patterns for `page.block.validate` violations. These are the starter set — the skill grows this file through AI per operator direction, never by hand.

## Pattern A — Remove prop

**When:** A block has a prop that is not declared in its `propsSchema` AND the section component does not consume it (not found in `.astro` or `.types.ts`).

**Action:** Remove the extraneous prop from the block's `props` in the content `.md` file.

**Commit:** Workpiece via `mission.git.commit`.

**Example:**

```yaml
# Before — price-card block has extraneous `body`
- id: price-comparison
  type: price-card
  props:
    body: ...      # ← not in price-card schema, component doesn't use it
    monthly: ...

# After — body removed
- id: price-comparison
  type: price-card
  props:
    monthly: ...
```

## Pattern B — Change block type

**When:** A block's props belong to a different cosmicName than its declared `type`. The props match another section's `propsSchema`.

**Action:** Change the block's `type` in the content `.md` file to the type whose cosmicName matches the props. Verify the new cosmicName is listed in `system.md` `pages[pageId].planets[]`.

**Commit:** Workpiece via `mission.git.commit`.

**Example:**

```yaml
# Before — hero block uses Phobos-only props but declares Europa type
- id: hero
  type: hero                    # Europa — doesn't have primaryCta/decisionCard
  props:
    primaryCta: ...
    decisionCard: ...

# After — type changed to hero-decision-card (Phobos)
- id: hero
  type: hero-decision-card      # Phobos — has primaryCta/decisionCard
  props:
    primaryCta: ...
    decisionCard: ...
```

## Pattern C — Update manifest schema

**When:** A prop is used by the section component (present in `.astro` or `.types.ts`) but is missing from the manifest's `propsSchema`. The content is correct; the schema is incomplete.

**Action:** Add the missing property to `propsSchema` in the section's `*.manifest.yaml` in `packages/ui/src/sections/`.

**Commit:** Platform via `git add <manifest> && git commit`.

**Example:**

```yaml
# Before — people-section manifest missing participantType in select schema
select:
  type: object
  additionalProperties: false
  properties:
    slugs: ...
    affiliation: ...

# After — participantType added
select:
  type: object
  additionalProperties: false
  properties:
    slugs: ...
    affiliation: ...
    participantType:
      type: string
```

## Decision tree

```
prop NOT in schema:
├── prop used by another cosmicName? → Pattern B (change type)
├── prop used by component (in .astro/.ts)? → Pattern C (update schema)
└── otherwise → Pattern A (remove prop)
```
