/*
<MODULE_CONTRACT>
<purpose>Canonical pure text-position math shared by lint/validator diagnostics: convert a string offset into a 1-based line/column pair.</purpose>
<non-goals>
  <item>Do not touch the filesystem — this module is pure and browser-safe.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0303: extracted as the single canonical home, previously duplicated across several validators.</item>
</CHANGE_SUMMARY>
*/

export function getLineColumn(text: string, index: number): { line: number; column: number } {
  const before = text.slice(0, index);
  const lines = before.split("\n");
  const line = lines.length;
  const column = lines[lines.length - 1]?.length ?? 0;
  return { line, column: column + 1 };
}
