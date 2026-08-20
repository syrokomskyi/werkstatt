/*
<MODULE_CONTRACT>
<purpose>
Validates that every braceless content reference (collection.file.field) in
src/surface.generated.yaml resolves against the build-time content reference
index (RFC-0527). Catches unresolvable refs baked into the surface artifact
before SSG render — preventing raw path strings from leaking into rendered HTML.
</purpose>
<non-goals>
  <item>Do not resolve PBP derived prices — only content ref index resolution is checked here.</item>
  <item>Do not validate general surface artifact integrity — that is surface.validate.</item>
  <item>Do not validate priceRef syntax — that is surface.hub.validate.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial: scan surface.generated.yaml for braceless content refs and resolve against content-ref-index.generated.yaml.</item>
</CHANGE_SUMMARY>
*/

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import type {
  CheckResult,
  Diagnostic,
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/werkstatt/kernel";
import { requireAstroSitePaths } from "@warpgogol/werkstatt-site/paths";
import {
  resolveReference,
  type ContentRefIndex,
} from "@warpgogol/werkstatt-shared/share/content-reference";
import { diagnosticsResult, passResult } from "./result-helpers.ts";
import { ARTIFACT_FILE, readLangs } from "./surface/shared.ts";

const BRACELESS_REF_PATTERN =
  /\b([a-z][a-z-]*)\.([a-z0-9-/]+)\.([a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]+)*)\b/g;

function loadIndex(appRoot: string): ContentRefIndex | null {
  const indexPath = join(appRoot, "src", "content-ref-index.generated.yaml");
  try {
    const raw = readFileSync(indexPath, "utf8");
    const parsed = parseYaml(raw) as ContentRefIndex;
    if (parsed && parsed.version === 1 && parsed.entries) return parsed;
    return null;
  } catch {
    return null;
  }
}

function collectRefsFromYaml(
  obj: unknown,
  path: string,
  refs: Array<{ ref: string; path: string }>,
): void {
  if (typeof obj === "string") {
    const pattern = new RegExp(BRACELESS_REF_PATTERN.source, "g");
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(obj)) !== null) {
      const candidate = match[0];
      const collection = candidate.match(/^([a-z][a-z-]*)\./)?.[1];
      if (
        collection === "business-profile" ||
        collection === "pages" ||
        collection === "prose" ||
        collection === "navigation" ||
        collection === "site" ||
        collection === "people"
      ) {
        refs.push({ ref: candidate, path });
      }
    }
    return;
  }
  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      collectRefsFromYaml(obj[i], `${path}[${i}]`, refs);
    }
    return;
  }
  if (obj && typeof obj === "object") {
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      collectRefsFromYaml(value, path ? `${path}.${key}` : key, refs);
    }
  }
}

export async function runSurfaceContentRefsValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const paths = requireAstroSitePaths(context);
  const app = context.site;
  if (!app) {
    return {
      exitCode: 1,
      summary: "surface.content-refs.validate must run inside an app context.",
    };
  }

  const artifactPath = join(paths.appDirectory, ARTIFACT_FILE);
  if (!existsSync(artifactPath)) {
    return passResult(
      "surface.content-refs.validate",
      "skipped (no surface artifact; run surface.generate)",
    );
  }

  const index = loadIndex(paths.appDirectory);
  if (!index) {
    return passResult(
      "surface.content-refs.validate",
      "skipped (no content-ref-index; run content.ref-index.generate)",
    );
  }

  const { defaultLang } = await readLangs(paths.appDirectory);

  let artifact: unknown;
  try {
    artifact = parseYaml(readFileSync(artifactPath, "utf8"));
  } catch {
    return {
      exitCode: 1,
      summary: "surface.content-refs.validate: surface.generated.yaml is not valid YAML",
    };
  }

  const refs: Array<{ ref: string; path: string }> = [];
  collectRefsFromYaml(artifact, "", refs);

  if (refs.length === 0) {
    return passResult(
      "surface.content-refs.validate",
      `No content references found in ${ARTIFACT_FILE}.`,
    );
  }

  const diagnostics: Diagnostic[] = [];
  const seen = new Set<string>();

  for (const { ref, path: yamlPath } of refs) {
    const key = `${ref}@${yamlPath}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const result = resolveReference(index, ref, defaultLang, defaultLang);
    if (!result.resolved) {
      diagnostics.push({
        ruleId: "SURFACE-CONTENT-REF-UNRESOLVABLE",
        severity: "error",
        file: ARTIFACT_FILE,
        message: `Content reference "${ref}" at ${yamlPath} could not be resolved: ${result.error ?? "unknown error"}`,
        fixHint:
          "Verify the collection, file, and field path exist in the content ref index. Check spelling and ensure the referenced content file has the expected frontmatter field.",
      });
    }
  }

  return diagnosticsResult("surface.content-refs.validate", diagnostics);
}
