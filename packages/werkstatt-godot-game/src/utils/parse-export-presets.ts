/*
<MODULE_CONTRACT>
<purpose>Shared parser for Godot export_presets.cfg files.</purpose>
<keywords>export, presets, godot, parser, utility</keywords>
<responsibilities>
  <item>Parses export_presets.cfg and returns structured preset objects.</item>
  <item>Used by build hook (dotnet-build) and deploy adapter (itch-io).</item>
</responsibilities>
<non-goals>
  <item>Does not validate preset correctness — only extracts structured data.</item>
  <item>Does not resolve export paths — caller handles path resolution.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial export presets parser — extracted from dotnet-build.ts and itch-io.ts to remove duplication.</item>
  <item>Fix: change [preset_N] to [preset.N] (Godot 4.x dot notation) — pre-existing regex bug exposed by scaffolded export_presets.cfg.</item>
</CHANGE_SUMMARY>
*/

import { readFileSync } from "node:fs";

export interface ExportPreset {
  name: string;
  platform: string;
  exportPath: string;
}

export function parseExportPresets(presetsPath: string): ExportPreset[] {
  const content = readFileSync(presetsPath, "utf-8");
  const presets: ExportPreset[] = [];
  const sections = content.split(/\[preset\.(\d+)\]/);

  for (let i = 1; i < sections.length; i += 2) {
    const body = sections[i + 1];
    if (!body) continue;

    const nameMatch = body.match(/^name="([^"]+)"/m);
    const platformMatch = body.match(/^platform="([^"]+)"/m);
    const pathMatch = body.match(/^export_path="([^"]+)"/m);

    if (nameMatch && platformMatch && pathMatch) {
      presets.push({
        name: nameMatch[1]!,
        platform: platformMatch[1]!,
        exportPath: pathMatch[1]!,
      });
    }
  }

  return presets;
}
