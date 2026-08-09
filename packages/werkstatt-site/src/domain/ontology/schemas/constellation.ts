/*
<MODULE_CONTRACT>
<purpose>
Zod schema for Constellation definition files (packages/werkstatt-site/src/domain/ontology/constellations/*.yaml).
A Constellation is a named, reusable composition pattern — an ordered sequence of
section archetypes that forms a proven page structure for a given intent
(DNA-23, RFC-0025).
</purpose>
<non-goals>
  <item>Do not parse YAML here; the caller is responsible for parsing.</item>
  <item>Do not add rendering or runtime logic.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Wave 1 (RFC-0025): Initial creation.</item>
</CHANGE_SUMMARY>
*/

import { z } from "zod";
import { planetNameSchema } from "../cosmic/planet-catalog.ts";
import { starNameSchema } from "../cosmic/star-catalog.ts";

// ---------------------------------------------------------------------------
// Constellation slot schema
// ---------------------------------------------------------------------------

/**
 * One step in the constellation sequence — references a section archetype by
 * its cosmicName (PlanetName) and states why it appears at that position.
 */
export const constellationSlotSchema = z.object({
  /**
   * The section cosmicName that occupies this position.
   * **Exactly ONE Planet per slot.** If a constellation accepts more than one
   * archetype at a given narrative position (e.g. "DNA-style feature list" OR
   * "approach-style card grid"), model it as TWO separate slots, each marked
   * `optional: true`. Do NOT introduce arrays/unions here — schema simplicity
   * is the contract. See packages/AGENTS.md "Constellation slots".
   * Must reference a value from PlanetCatalog.
   */
  cosmicName: planetNameSchema,

  /**
   * Human-readable label for this slot in documentation / tooling output.
   * Example: "Value proposition hero", "Social proof band"
   */
  label: z.string().min(1),

  /**
   * Why this section appears at this position in the sequence.
   * Describes the conversion / trust / narrative logic.
   */
  rationale: z.string().min(1),

  /**
   * When true, this slot is optional — the constellation is still valid
   * without it. Validators warn but do not fail on missing optional slots.
   * Default: false.
   */
  optional: z.boolean().optional().default(false),
});

export type ConstellationSlot = z.infer<typeof constellationSlotSchema>;

// ---------------------------------------------------------------------------
// Constellation schema
// ---------------------------------------------------------------------------

/**
 * A Constellation definition — a named, reusable page-composition pattern.
 * Stored as packages/werkstatt-site/src/domain/ontology/constellations/<slug>.yaml.
 */
export const constellationSchema = z.object({
  /**
   * Stable kebab-case identifier for this constellation.
   * Used as the reference key in system.yaml `constellations[]`.
   * Example: "nonprofit-donation-funnel"
   */
  id: z
    .string()
    .regex(/^[a-z][a-z0-9-]*$/, "id must be kebab-case (lowercase letters, digits, hyphens)"),

  /**
   * Display name for tooling, docs, and the Cosmic Passport map.
   * Example: "Nonprofit Donation Funnel"
   */
  name: z.string().min(1),

  /**
   * One-sentence description of the pattern's purpose and audience.
   */
  description: z.string().min(1),

  /**
   * The star (page) archetype this constellation is designed for.
   * Ensures the composition pattern is matched to the right page layer.
   */
  forStar: starNameSchema,

  /**
   * Ordered sequence of section slots composing this constellation.
   * Position is meaningful — validators check order compliance when
   * constellation.compose.validate is run.
   */
  slots: z.array(constellationSlotSchema).min(1),

  /**
   * Semantic version of this constellation definition.
   * Increment minor when slots are added; major when order changes.
   */
  version: z.string().regex(/^\d+\.\d+\.\d+(?:-[a-z0-9.-]+)?$/i, "version must be valid semver"),
});

export type Constellation = z.infer<typeof constellationSchema>;
