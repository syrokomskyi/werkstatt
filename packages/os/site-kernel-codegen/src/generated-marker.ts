/*
<MODULE_CONTRACT>
<purpose>Maintains packages/os/site-kernel-codegen/src/generated-marker.ts as an authored site-kernel-codegen authored module so agents can evolve it without rediscovering local boundaries.</purpose>
<non-goals>
  <item>Do not define the constant locally — canonical source lives in site-kernel.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Moved canonical source to site-kernel; this file is now a backward-compatible re-export shim.</item>
</CHANGE_SUMMARY>
*/

export {
  GENERATED_MARKER,
  hasGeneratedMarker,
  stripGeneratedMarker,
  buildGeneratedHeader,
  type StripGeneratedMarkerResult,
  type GeneratedHeaderInput,
} from "@gogol/site-kernel";
