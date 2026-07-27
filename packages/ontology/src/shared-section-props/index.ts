/*
<MODULE_CONTRACT>
<purpose>
[RFC-0101 + RFC-0102 + RFC-0103] Canonical catalog of JSON Schema fragments
that section manifests compose via the `propsSchemaCompose: [...]` field.

Two families of fragments:
  - section-visual / section-header — visual + header sub-schemas applied
    at section root.
  - body-{kind} — one fragment per RFC-0103 body kind that adds the entire
    `body: { kind: ..., ... }` object at section root.

Section manifests reference these by id instead of duplicating the same 60+
lines of JSON Schema in every file.
</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0133: backfilled MODULE_MAP and CHANGE_SUMMARY markers for compass.validate compliance.</item>
  <item>RFC-0303 Phase 3: split the flat 719-line file into sub-modules; this file is now the re-export shim.</item>
</CHANGE_SUMMARY>
*/

export type { JsonSchemaFragment } from "./common.ts";

export {
  SHARED_SECTION_PROPS,
  isSharedSectionPropsId,
  sharedSectionPropsChangelog,
  composeManifestPropsSchema,
} from "./catalog.ts";
export type { SharedSectionPropsId, SharedSectionPropsRef } from "./catalog.ts";
