/*
<MODULE_CONTRACT>
<purpose>Maintains packages/os/site-kernel-checks/src/pipelines/sites-check-postbuild.ts as an authored site-kernel-checks authored module so agents can evolve it without rediscovering local boundaries.</purpose>
<non-goals>
  <item>Do not validate authored source files — those belong in SITES_CHECK_AUTHOR_PIPELINE.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Extracted from module.ts to separate author-time from post-build concerns.</item>
</CHANGE_SUMMARY>
*/

import type { KernelPipelineStep } from "@warpgogol/werkstatt/kernel";

export const SITES_CHECK_POSTBUILD_PIPELINE: KernelPipelineStep[] = [
  { command: "seo.technical.validate" },
  // RFC-0074: deterministic audit validators that inspect rendered HTML. Relocated
  // from SITES_CHECK_AUTHOR_PIPELINE — they scan dist/ and must run after astro build.
  { command: "seo.structured-data.validate" },
  // RFC-0512: team JSON endpoint validation (private field exclusion, shape, consent gating).
  { command: "participant.json.validate" },
  // RFC-0513: cross-page alignment (hub ↔ profile ↔ home ↔ navigation ↔ JSON).
  { command: "team.cross-page.validate" },
  { command: "seo.internal-linking.validate" },
  { command: "first-party-data.validate" },
  // RFC-0162: rendered Open Graph / Twitter Card meta on every indexable page.
  { command: "seo.meta.validate" },
  // RFC-0163: per-page JSON-LD url/@id correctness + organization-identity parity.
  { command: "jsonld.url.validate" },
  { command: "jsonld.parity" },
  // RFC-0371: no external font origins in rendered HTML (Fontsource CSS imports).
  { command: "fonts.origin.validate" },
  // RFC-0177: no third-party chat vendor origin loads in server HTML before activation.
  { command: "consent.activation.validate" },
  // RFC-0166: every markdown alternate link resolves to an emitted twin.
  { command: "page.markdown.validate" },
  // RFC-0318: generated public trees must not retain stale twins or empty directories.
  { command: "public.orphans.validate" },
  { command: "redirect.map.validate" },
  // RFC-0165: a noindex page must never appear in the sitemap.
  { command: "robots.page.validate" },
  // RFC-0165: the RSS feed is well-formed.
  { command: "feed.validate" },
  // RFC-0317: canonical URL parity across sitemap, feed, llms, and HTML.
  { command: "canonical.url.validate" },
  // RFC-0172: the content-image contract holds and sitemap-images.xml is current.
  { command: "dist.sitemap.images.validate" },
  { command: "passport.verify" },
  { command: "lighthouse.budget.check" },
  { command: "generated.marker.validate", args: ["--phase=postbuild"] },
  // RFC-0095: catch missing required section props that leaked NEED_THIS_X markers into HTML
  { command: "need.markers.validate" },
  // RFC-0187: unresolved {collection.file.field} brace tokens that leaked into built HTML
  { command: "dist.content-references.validate" },
  // RFC-0152: fail if HTML references an /_astro/* asset missing from dist/client (404 guard)
  { command: "cloudflare.assets.validate" },
  // RFC-0830: responsive srcset, compression budget, LCP image optimization
  { command: "image.delivery.validate" },
  // RFC-0185: distribution artifacts must not expose the generated ownership marker
  { command: "dist.generated-marker.validate" },
  // RFC-0269: golden behavior snapshot drift check — must run before build-post's
  // own behavior.snapshot.generate step so it compares the fresh build against the
  // git-committed snapshot, not a same-run copy of itself.
  { command: "behavior.snapshot.validate" },
  // RFC-0352: strict audit gate — fails the release when any file is audit-overdue.
  { command: "compass.audit.validate", args: ["--strict"] },
  // RFC-0333: independent black-box QA — execute page probes against
  // dist/client in a headless browser. Zero-probe fast path keeps this
  // free until RFCs declare page probes.
  { command: "qa.independent.run" },
  // RFC-0235: warn-only backstop — report any residual AI-signal the egress adapter
  // missed (an unhandled output channel). Never gates the build.
  { command: "text.normalize.validate" },
  // RFC-0499: media metadata leakage prevention on surface pages.
  { command: "surface.media-leakage.validate" },
  // RFC-0690: duplicate section heading check on surface pages.
  { command: "surface.heading-uniqueness.validate" },
];
