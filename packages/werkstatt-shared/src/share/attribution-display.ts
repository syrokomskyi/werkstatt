/*
<MODULE_CONTRACT>
<purpose>
  RFC-0231 attribution visibility policy. One vocabulary + one pure resolver that
  decides whether an attribution surface (material credit, prose byline, footer
  copyright) renders its VISIBLE form. Hiding never affects provenance: callers
  must keep emitting JSON-LD and the credits-page listing regardless of the result.
</purpose>
<non-goals>
  <item>Do not read content or globs; callers pass the resolved overrides.</item>
  <item>Do not render UI or emit JSON-LD; @warpgogol/werkstatt-site/ui owns presentation.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0231: initial attribution visibility policy resolver + site schema.</item>
</CHANGE_SUMMARY>
*/

import { z } from "zod";

/** RFC-0231: every visibility level speaks the same two-word vocabulary. */
export type AttributionDisplay = "shown" | "hidden";
export type AttributionSurface = "material-credit" | "prose-authorship" | "footer-copyright";
/** Site default may defer to RFC-0228 editorial/decorative intent. */
export type AttributionSiteDefault = "byIntent" | "shown" | "hidden";

export const attributionDisplaySchema = z.enum(["shown", "hidden"]);
export const attributionSiteDefaultSchema = z.enum(["byIntent", "shown", "hidden"]);

/** RFC-0231: the `attribution` block authored in site/{lang}/labels.md. */
export const attributionPolicySchema = z
  .object({
    /** Material-credit inline disclosures. Defaults to byIntent. */
    credits: attributionSiteDefaultSchema.optional(),
    /** Visible prose byline. Defaults to shown. */
    proseAuthorship: attributionDisplaySchema.optional(),
    /** Footer site-copyright line. Defaults to shown. */
    footerCopyright: attributionDisplaySchema.optional(),
  })
  .strict();
export type AttributionPolicy = z.infer<typeof attributionPolicySchema>;

export interface AttributionDisplayInputs {
  surface: AttributionSurface;
  /** RFC-0228 intent of the target; editorial ⇒ shown, decorative ⇒ hidden under byIntent. */
  intent?: "editorial" | "decorative";
  /** Level 1: per-asset `display` in the sidecar (material credit only). */
  assetOverride?: AttributionDisplay;
  /** Level 2: per-placement `creditDisplay` on the section/block content. */
  placementOverride?: AttributionDisplay;
  /** Level 3: per-page `attribution.*` in page frontmatter. */
  pageOverride?: AttributionDisplay;
  /** Level 4: site default from the `attribution` labels block. */
  siteDefault?: AttributionSiteDefault;
}

/**
 * RFC-0231: resolve one visible-surface decision. Most-specific level wins; the
 * intrinsic default (editorial shown / decorative hidden) applies only when no
 * explicit level set a value and the site default is `byIntent` (or unset).
 */
export function resolveAttributionDisplay(inputs: AttributionDisplayInputs): AttributionDisplay {
  const explicit = inputs.assetOverride ?? inputs.placementOverride ?? inputs.pageOverride;
  if (explicit) return explicit;

  const site = inputs.siteDefault ?? "byIntent";
  if (site === "shown" || site === "hidden") return site;

  // byIntent: decorative material is quiet by default; everything else shows.
  return inputs.intent === "decorative" ? "hidden" : "shown";
}

/** RFC-0231: parse the optional site `attribution` block; tolerate absence/garbage. */
export function readAttributionPolicy(
  labels: Record<string, unknown> | undefined,
): AttributionPolicy {
  const parsed = attributionPolicySchema.safeParse(labels?.attribution);
  return parsed.success ? parsed.data : {};
}

/** RFC-0231: site-level default for material credits, defaulting to byIntent. */
export function readCreditsSiteDefault(
  labels: Record<string, unknown> | undefined,
): AttributionSiteDefault {
  return readAttributionPolicy(labels).credits ?? "byIntent";
}
