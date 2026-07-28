/*
<MODULE_CONTRACT>
<purpose>
  Artifact reader port — abstracts file I/O for CI artifact collection.
  Extracted from collect.ts so the collector can be tested with an
  in-memory reader without touching the filesystem.
</purpose>
<non-goals>
  <item>Do not implement artifact parsing logic — that stays in collect.ts.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Architecture review 2026-07-14: extract ArtifactReader port from collect.ts.</item>
</CHANGE_SUMMARY>
*/

export interface ArtifactReader {
  readJson(filePath: string): Promise<string | undefined>;
}

export const fsArtifactReader: ArtifactReader = {
  async readJson(filePath) {
    try {
      const { readFile } = await import("node:fs/promises");
      return await readFile(filePath, "utf8");
    } catch {
      return undefined;
    }
  },
};
