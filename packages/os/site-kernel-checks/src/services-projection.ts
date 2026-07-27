/*
<MODULE_CONTRACT>
<purpose>RFC-0373: services.projection.validate — validates the business service catalog projection. Checks schema compliance (slug + name), slug uniqueness within a language, no duplicate projected ids, and warns on ambiguous source (services.md alongside services/ directory).</purpose>
<non-goals>
  <item>Do not project services — this only validates the source files and projected output.</item>
  <item>Do not validate pricingOptions or deliveryTime — pbp.content.validate owns schema validation.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0373: initial implementation.</item>
</CHANGE_SUMMARY>
*/

import { join } from "node:path";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/site-kernel";
import { requireAstroSitePaths } from "@warpgogol/site-kernel-astro";
import { loadSystemManifest, parseMarkdownFrontmatter } from "@warpgogol/site-kernel-content";
import { projectServices } from "@warpgogol/share/semantic";
import { diagnosticsResult, passResult } from "./result-helpers.ts";
import { defaultLanguageFromManifest } from "./lib/i18n.ts";
import type { Diagnostic } from "@warpgogol/site-kernel";

type ServiceFile = {
  path: string;
  slug: string;
  name: string;
  data: Record<string, unknown>;
};

async function readServiceFiles(
  context: KernelRuntimeContext,
  contentDir: string,
  lang: string,
  sub: string,
): Promise<ServiceFile[]> {
  const dir = join(contentDir, "business", lang, sub);
  let entries: string[];
  try {
    entries = (await context.io.readdir(dir))
      .map((entry) => entry.name)
      .filter((f) => f.endsWith(".md") && f !== "AGENTS.md");
  } catch {
    return [];
  }
  const files: ServiceFile[] = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const parsed = parseMarkdownFrontmatter(await context.io.readFile(fullPath));
    const data = parsed.data as Record<string, unknown>;
    const slug = typeof data["slug"] === "string" ? data["slug"] : entry.replace(/\.md$/, "");
    const name = typeof data["name"] === "string" ? (data["name"] as string).trim() : "";
    files.push({ path: `business/${lang}/${sub}/${entry}`, slug, name, data });
  }
  return files;
}

export async function runServicesProjectionValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const paths = requireAstroSitePaths(context);
  const contentDir = join(paths.appDirectory, "src", "content");

  const { manifest } = await loadSystemManifest(contentDir);
  const defaultLang = defaultLanguageFromManifest(manifest);

  const diagnostics: Diagnostic[] = [];

  // Read service files for default language (and any other languages that exist).
  const langs = [defaultLang];
  try {
    const businessDir = join(contentDir, "business");
    const allLangs = (await context.io.readdir(businessDir))
      .map((entry) => entry.name)
      .filter((f) => !f.endsWith(".md") && f !== "AGENTS.md");
    for (const lang of allLangs) {
      if (!langs.includes(lang)) langs.push(lang);
    }
  } catch {
    // No business directory at all.
    return passResult(
      "services.projection.validate",
      "services.projection.validate: OK — no business content",
    );
  }

  let totalFiles = 0;

  for (const lang of langs) {
    const files = await readServiceFiles(context, contentDir, lang, "services");
    totalFiles += files.length;

    // Rule: missing-name (blocking)
    for (const file of files) {
      if (!file.name) {
        diagnostics.push({
          ruleId: "SERVICES-PROJ-01",
          severity: "error",
          message: `${file.path}: service entry has slug '${file.slug}' but no name field.`,
        });
      }
    }

    // Rule: duplicate-slug (blocking)
    const slugSeen = new Map<string, string>();
    for (const file of files) {
      const existing = slugSeen.get(file.slug);
      if (existing) {
        diagnostics.push({
          ruleId: "SERVICES-PROJ-02",
          severity: "error",
          message: `Duplicate slug '${file.slug}' in ${lang}: ${existing} and ${file.path}.`,
        });
      } else {
        slugSeen.set(file.slug, file.path);
      }
    }

    // Rule: ambiguous-source (advisory) — services.md single-file alongside services/ directory
    if (files.length > 0) {
      const orphanPath = join(contentDir, "business", lang, "services.md");
      try {
        await context.io.readFile(orphanPath);
        diagnostics.push({
          ruleId: "SERVICES-PROJ-03",
          severity: "warning",
          message: `business/${lang}/services.md exists alongside business/${lang}/services/ directory — ambiguous source. The projection reads from services/, not services.md.`,
        });
      } catch {
        // No orphan — good.
      }
    }
  }

  // Rule: duplicate-id (blocking) — projected SemanticService[] has duplicate ids
  const allFiles = await readServiceFiles(context, contentDir, defaultLang, "services");
  const projected = projectServices(allFiles.map((f) => f.data));
  const idSeen = new Set<string>();
  for (const service of projected) {
    if (idSeen.has(service.id)) {
      diagnostics.push({
        ruleId: "SERVICES-PROJ-04",
        severity: "error",
        message: `Duplicate projected service id '${service.id}' — two services resolve to the same id.`,
      });
    } else {
      idSeen.add(service.id);
    }
  }

  if (diagnostics.length === 0) {
    return passResult(
      "services.projection.validate",
      `services.projection.validate: OK — ${totalFiles} service file(s), ${projected.length} projected`,
    );
  }

  return diagnosticsResult("services.projection.validate", diagnostics);
}
