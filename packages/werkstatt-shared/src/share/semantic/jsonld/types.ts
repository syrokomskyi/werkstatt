/*
<MODULE_CONTRACT>
<purpose>Maintains packages/share/src/semantic/jsonld/types.ts as an authored share authored module so agents can evolve it without rediscovering local boundaries.</purpose>
<non-goals>
  <item>Do not implement JSON-LD processing logic.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Moved from app semantic/jsonld/types to packages/share.</item>
</CHANGE_SUMMARY>
*/

export type JsonLdNode = Record<string, unknown>;

export type JsonLdDocument = {
  "@context": "https://schema.org";
  "@graph": JsonLdNode[];
};
