/*
<MODULE_CONTRACT>
<purpose>Supports the build-time loading and validation of passport data for Astro components.</purpose>
<non-goals>
  <item>Do not execute client-side imports or runtime data fetching.</item>
  <item>Do not manage build orchestration or file emission processes.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Enhance Compass scaffolding to improve clarity and maintainability of the passport data module.</item>
</CHANGE_SUMMARY>
*/

/**
 * @warpgogol/passport — Build-time data helper for passport moons
 *
 * DNA-31 / RFC-0028
 *
 * Passport moon components (Methone, Bianca, Klarissa, Adrastea, Despina)
 * call `loadPassportData()` at build time to read cosmic-passport.json
 * from the build output.
 *
 * This module runs exclusively at SSG build time inside Astro components.
 * It must never be imported client-side.
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { emitPipelineLogEvent } from "@warpgogol/site-kernel-content";
import { PassportSchema } from "./schema.ts";
import type { PassportJson } from "./schema.ts";

/**
 * Read and parse the passport JSON from dist/.well-known/cosmic-passport.json.
 *
 * @param distDirectory — absolute path to the dist/ output directory.
 *                        Defaults to `process.cwd() + "/dist"` if not provided.
 * @returns PassportJson | null if the file is not yet emitted.
 */
export async function loadPassportData(distDirectory?: string): Promise<PassportJson | null> {
  const distDir = distDirectory ?? join(process.cwd(), "dist");
  const passportPath = join(distDir, ".well-known", "cosmic-passport.json");

  let raw: string;
  try {
    raw = await readFile(passportPath, "utf8");
  } catch {
    emitPipelineLogEvent({
      severity: "notice",
      kind: "expected-fallback",
      packageName: "@warpgogol/passport",
      module: "data",
      message: `passport prebuild artifact lookup miss: ${passportPath}`,
      dedupeKey: `passport-prebuild-miss:${passportPath}`,
      data: { passportPath },
    });
    return null;
  }

  const result = PassportSchema.safeParse(JSON.parse(raw));
  if (!result.success) {
    emitPipelineLogEvent({
      severity: "warning",
      kind: "diagnostic",
      packageName: "@warpgogol/passport",
      module: "data",
      ruleId: "PASSPORT-SCHEMA",
      message: "cosmic-passport.json failed schema validation",
      dedupeKey: `passport-schema:${passportPath}`,
      data: { passportPath, issues: result.error.issues },
    });
    return null;
  }

  return result.data;
}

/**
 * Convenience re-export of PassportJson type for use in moon component props.
 */
export type { PassportJson };
