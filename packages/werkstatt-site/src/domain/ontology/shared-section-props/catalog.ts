/*
<MODULE_CONTRACT>
<purpose>Catalog and composition helpers for shared section prop fragments: defines SHARED_SECTION_PROPS catalog with versioned fragments and provides resolution/changelog/composition functions.</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0303 Phase 3: extracted from shared-section-props/index.ts as part of the domain split.</item>
</CHANGE_SUMMARY>
*/

import type { JsonSchemaFragment } from "./common.ts";
import { SECTION_VISUAL_FRAGMENT, SECTION_HEADER_FRAGMENT } from "./visual-header.ts";
import {
  BODY_LIST_FRAGMENT,
  BODY_SPLIT_LIST_FRAGMENT,
  BODY_STATS_FRAGMENT,
  BODY_CARDS_FRAGMENT,
  BODY_PARAGRAPHS_FRAGMENT,
  BODY_COMPARISON_FRAGMENT,
  BODY_RICH_FRAGMENT,
} from "./body-fragments.ts";

// RFC-0119: every fragment carries `schemaVersion: number` (starts at 1) and
// optional `changelog`. The catalog stores versions under `latest` and
// optionally `prior` so consumers can pin to the prior shape during a
// migration window. Bare ids (without `@version`) resolve to `latest`.

type FragmentVersion = JsonSchemaFragment & {
  schemaVersion: number;
  changelog?: string;
};

type FragmentEntry = {
  latest: FragmentVersion;
  prior?: FragmentVersion;
};

function v1(fragment: JsonSchemaFragment, changelog: string): FragmentVersion {
  return { schemaVersion: 1, ...fragment, changelog };
}

export const SHARED_SECTION_PROPS: Record<string, FragmentEntry> = {
  "section-visual": {
    latest: v1(
      SECTION_VISUAL_FRAGMENT,
      "Initial release with background, effects, density, tone, containerVariant, motion.",
    ),
  },
  "section-header": {
    latest: v1(
      SECTION_HEADER_FRAGMENT,
      "Heading (string or tone-segmented array), eyebrow, subheading, align, level, hideSectionNumber. RFC-0567 added eyebrow.",
    ),
  },
  "body-list": {
    latest: v1(
      BODY_LIST_FRAGMENT,
      "Initial release of body.kind: list with items + note + iconColor + align + effects.",
    ),
  },
  "body-split-list": {
    latest: v1(
      BODY_SPLIT_LIST_FRAGMENT,
      "Initial release of body.kind: split-list with primary/secondary items, labels, iconColors + effects.",
    ),
  },
  "body-stats": {
    latest: v1(
      BODY_STATS_FRAGMENT,
      "Initial release of body.kind: stats with stats[] + animated + align.",
    ),
  },
  "body-cards": {
    latest: v1(
      BODY_CARDS_FRAGMENT,
      "Initial release of body.kind: cards with cards[] + layout + columns + align + effects. Added optional number field to cards for numbered lists.",
    ),
  },
  "body-paragraphs": {
    latest: v1(
      BODY_PARAGRAPHS_FRAGMENT,
      "Initial release of body.kind: paragraphs with paragraphs[] + align.",
    ),
  },
  "body-comparison": {
    latest: v1(
      BODY_COMPARISON_FRAGMENT,
      "Initial release of body.kind: comparison with rows + labels + align + effects.",
    ),
  },
  "body-rich": {
    latest: v1(
      BODY_RICH_FRAGMENT,
      "Initial release of body.kind: rich with contentRef + animateNumbers + align.",
    ),
  },
};

export type SharedSectionPropsId = keyof typeof SHARED_SECTION_PROPS;

/** RFC-0119: pinned reference syntax `<id>@<version>` or bare `<id>` (latest). */
export type SharedSectionPropsRef = string;

export function isSharedSectionPropsId(id: string): id is SharedSectionPropsId {
  const baseId = id.split("@")[0];
  return Object.prototype.hasOwnProperty.call(SHARED_SECTION_PROPS, baseId);
}

/**
 * RFC-0119: resolve a fragment reference (`<id>` or `<id>@<version>`) to the
 * matching fragment payload. Unknown ids or pinned versions raise with the
 * catalog of valid ids in the message.
 */
function resolveFragment(ref: string): FragmentVersion {
  const [baseId, pinned] = ref.split("@");
  const entry = SHARED_SECTION_PROPS[baseId];
  if (!entry) {
    throw new Error(
      `[shared-section-props] Unknown fragment id "${baseId}". ` +
        `Valid ids: ${Object.keys(SHARED_SECTION_PROPS).join(", ")}`,
    );
  }
  if (!pinned) return entry.latest;
  const pinnedVersion = Number.parseInt(pinned, 10);
  if (Number.isNaN(pinnedVersion)) {
    throw new Error(`[shared-section-props] Invalid pinned version "${pinned}" on "${baseId}".`);
  }
  if (entry.latest.schemaVersion === pinnedVersion) return entry.latest;
  if (entry.prior?.schemaVersion === pinnedVersion) return entry.prior;
  throw new Error(
    `[shared-section-props] Fragment "${baseId}" version ${pinnedVersion} not available ` +
      `(latest: ${entry.latest.schemaVersion}${entry.prior ? `, prior: ${entry.prior.schemaVersion}` : ""}).`,
  );
}

/**
 * RFC-0119: machine-readable changelog snapshot. Used by
 * shared.section-props.changelog.report.
 */
export function sharedSectionPropsChangelog(): Array<{
  id: string;
  schemaVersion: number;
  changelog?: string;
}> {
  return Object.entries(SHARED_SECTION_PROPS).map(([id, entry]) => ({
    id,
    schemaVersion: entry.latest.schemaVersion,
    changelog: entry.latest.changelog,
  }));
}

/**
 * Compose fragments + the manifest's local propsSchema into one draft-07
 * JSON Schema object. Properties of later inputs override earlier ones;
 * `additionalProperties: false` is enforced unless the manifest explicitly
 * opts out. Fragment ids accept both `<id>` and `<id>@<version>` forms
 * (RFC-0119).
 */
export function composeManifestPropsSchema(input: {
  compose?: readonly string[];
  local?: Record<string, unknown>;
}): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  const required = new Set<string>();

  for (const ref of input.compose ?? []) {
    const frag = resolveFragment(ref);
    Object.assign(properties, frag.properties);
    for (const r of frag.required ?? []) required.add(r);
  }

  if (input.local) {
    const localProps = (input.local.properties as Record<string, unknown> | undefined) ?? {};
    Object.assign(properties, localProps);
    const localRequired = Array.isArray(input.local.required)
      ? (input.local.required as string[])
      : [];
    for (const r of localRequired) required.add(r);
  }

  const additionalProperties =
    input.local && Object.prototype.hasOwnProperty.call(input.local, "additionalProperties")
      ? input.local.additionalProperties
      : false;

  const result: Record<string, unknown> = {
    type: "object",
    additionalProperties,
    properties,
  };
  if (required.size > 0) result.required = Array.from(required);
  return result;
}
