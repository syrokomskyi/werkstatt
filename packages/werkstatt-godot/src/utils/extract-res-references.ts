/*
<MODULE_CONTRACT>
<purpose>Shared utility for extracting res:// references from Godot resource files.</purpose>
<keywords>res, reference, godot, utility, scene, tres</keywords>
<responsibilities>
  <item>Extracts res:// paths from file content using regex.</item>
  <item>Used by scene-reference-validate and resource-validate to avoid duplication.</item>
</responsibilities>
<non-goals>
  <item>Does not check file existence — caller handles existsSync.</item>
  <item>Does not parse Godot resource format semantically — only extracts res:// string paths.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial res:// reference extractor — extracted from scene-reference-validate and resource-validate to remove duplication.</item>
</CHANGE_SUMMARY>
*/

const RES_PATTERN = /"res:\/\/([^"]+)"/g;

export function extractResReferences(content: string): string[] {
  const references: string[] = [];
  RES_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = RES_PATTERN.exec(content)) !== null) {
    references.push(match[1]!);
  }
  return references;
}
