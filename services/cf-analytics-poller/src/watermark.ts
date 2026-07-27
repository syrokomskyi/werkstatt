/*
<MODULE_CONTRACT>
<purpose>Persist and restore Cloudflare analytics poll windows so cycles resume without overlap (RFC-0343).</purpose>
<non-goals>
  <item>Do not calculate analytics metrics or contact Cloudflare from watermark persistence.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0343: initial implementation.</item>
  <item>Remove dead WATERMARK_PATH constant; wire readWatermark into the cycle.</item>
</CHANGE_SUMMARY>
*/

import { join } from "node:path";

export interface Watermark {
  lastProcessedUntil: string;
}

function watermarkPath(): string {
  const proc = (globalThis as Record<string, unknown>)["process"] as
    { cwd?: () => string } | undefined;
  const cwd = proc?.cwd?.() ?? ".";
  return join(cwd, "data", "watermark.json");
}

export async function readWatermark(): Promise<Watermark | null> {
  try {
    const fs = await import("node:fs/promises");
    const text = await fs.readFile(watermarkPath(), "utf-8");
    return JSON.parse(text) as Watermark;
  } catch {
    return null;
  }
}

export async function writeWatermark(watermark: Watermark): Promise<void> {
  const fs = await import("node:fs/promises");
  const path = watermarkPath();
  const dir = join(path, "..");
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path, JSON.stringify(watermark, null, 2) + "\n", "utf-8");
}
