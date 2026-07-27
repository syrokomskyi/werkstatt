/*
<MODULE_CONTRACT>
<purpose>
App-agnostic resolution of semantic link targets (internal page/anchor or
external href) to URLs. Used by shell components and sections that render
navigation/CTA links from content-declared targets.
</purpose>
<non-goals>
  <item>Do not import from apps/*.</item>
  <item>Do not handle page rendering or visibility policy (see @gogol/share/feature-policy).</item>
  <item>Do not persist state or manage user preferences.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0183: Extracted from the retired astro/feature-graph.ts; the RFC-0018 feature-graph runtime is removed (superseded by Feature Policy).</item>
</CHANGE_SUMMARY>
*/

import { resolveLocalizedPagePath, resolveAnchorFragment } from "./routes.ts";

export interface InternalTargetRef {
  kind: "internal";
  pageId: string;
  // RFC-0048: anchor may be a plain string (language-neutral) or a
  // language-keyed record (e.g. { de: "unser-ansatz", en: "our-approach" })
  anchor?: string | Record<string, string>;
}

export interface ExternalTargetRef {
  kind: "external";
  href: string;
}

export type LinkTargetRef = InternalTargetRef | ExternalTargetRef;

export async function resolveSemanticTarget(
  target: InternalTargetRef | ExternalTargetRef,
  lang: string,
): Promise<string | null> {
  if (target.kind === "external") {
    return target.href;
  }

  // RFC-0048: Use route registry for localized slugs
  const path = await resolveLocalizedPagePath(target.pageId, lang);
  if (path === null) {
    return null;
  }

  // RFC-0048: Resolve anchor through registry (anchorId -> lang-specific HTML id)
  // Falls back to raw string if not found in registry (no regression)
  if (target.anchor) {
    const anchorStr = typeof target.anchor === "string" ? target.anchor : target.anchor[lang];
    if (anchorStr) {
      const fragment = await resolveAnchorFragment(anchorStr, target.pageId, lang);
      return `${path}#${fragment}`;
    }
  }
  return path;
}
