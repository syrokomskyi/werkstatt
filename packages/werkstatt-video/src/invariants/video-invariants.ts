/*
<MODULE_CONTRACT>
<purpose>Video stack invariants WV-01..09 surfaced to agents (RFC-0778).</purpose>
<keywords>invariants, video, editframe</keywords>
<non-goals>
  <item>Do not enforce invariants here — enforcement lives in validators.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0778: initial video stack invariants WV-01..09.</item>
</CHANGE_SUMMARY>
*/

import type { StackInvariant } from "@warpgogol/werkstatt/plugin";

export const VIDEO_INVARIANTS: StackInvariant[] = [
  {
    id: "WV-01",
    description:
      "Composition has a valid time model (duration > 0, frame rate > 0)",
    check: "video.composition.validate",
  },
  {
    id: "WV-02",
    description:
      "All media elements reference existing assets listed in the asset manifest",
    check: "video.assets.validate",
  },
  {
    id: "WV-03",
    description:
      "Composition is deterministic — same input produces byte-identical render output",
    check: "video.render.validate",
  },
  {
    id: "WV-04",
    description:
      "No hardcoded secrets in composition source — enforced by secret scan",
    check: "video.secret.scan",
  },
  {
    id: "WV-05",
    description:
      "Composition respects Editframe API rate limits (advisory — enforced at runtime by build hook)",
  },
  {
    id: "WV-06",
    description:
      "Render output format is declared and consistent (codec, container, resolution)",
    check: "video.render.validate",
  },
  {
    id: "WV-07",
    description:
      "Asset manifest is complete (no orphaned assets, no missing entries)",
    check: "video.assets.validate",
  },
  {
    id: "WV-08",
    description: "Composition entry point is src/composition.tsx",
    check: "video.composition.validate",
  },
  {
    id: "WV-09",
    description:
      "Rendered video is stored in the artifact store (DNA-52) with content-addressed hash",
    check: "video.render.validate",
  },
];
