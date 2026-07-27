/*
<MODULE_CONTRACT>
<purpose>RFC-0149: generate thin, section-owned Astro APIRoute re-exports for a site, conditioned on which sections the site actually uses, and project their declared secrets into the app's astro:env schema.</purpose>
<non-goals>
  <item>Do not write handler logic — that lives once in the section package.</item>
  <item>Do not overwrite api route files that lack the GENERATED marker (project-specific).</item>
  <item>Do not configure adapters — owned by the onboarding astro.config template.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0140: new generator api.routes.generate.</item>
  <item>RFC-0149: emit Astro APIRoutes under src/pages/api/ (not Pages Functions under functions/); project section secrets into astro:env; GC residual functions/.</item>
</CHANGE_SUMMARY>
*/

import { promises as fs } from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/site-kernel";
import { requireAstroSitePaths } from "@warpgogol/site-kernel-astro";
import { loadSystemManifest, parseMarkdownFrontmatter } from "@warpgogol/site-kernel-content";
import { GENERATED_MARKER, hasGeneratedMarker, buildGeneratedHeader } from "./generated-marker.ts";

interface ApiRouteDeclaration {
  route: string;
  handler: string;
  /** HTTP methods → re-exported Astro APIRoute handler names (POST, GET, …). */
  methods: string[];
  /** Runtime secret env keys this endpoint reads via astro:env/server. */
  secrets: string[];
  /** semanticId of the owning section, for diagnostics. */
  section: string;
}

const DEFAULT_METHODS = ["POST"];
const AGENT_GATE_SECRETS = ["UPSTASH_QSTASH_TOKEN"] as const;
const ENTITLEMENT_SECRETS = ["STRIPE_SECRET_KEY"] as const;

interface ManifestEntitlement {
  billing?: unknown;
  entitlementsOverride?: unknown[];
  identity?: { domain?: string };
}

function participatesInEntitlements(m: ManifestEntitlement): boolean {
  if (m.billing && typeof m.billing === "object") return true;
  return Array.isArray(m.entitlementsOverride);
}

/** "post" → "POST" (Astro APIRoute named export = the uppercased HTTP method). */
function handlerExportName(method: string): string {
  return method.toUpperCase();
}

interface ApiRoutesGenerateData {
  command: "api.routes.generate";
  status: "ok" | "fail";
  generated: string[];
  removed: string[];
  /** Secret env keys projected into the app's astro:env schema. */
  envSchema: string[];
  warnings?: Array<{ file: string; message: string }>;
}

async function walkFiles(dir: string, predicate: (file: string) => boolean): Promise<string[]> {
  const out: string[] = [];
  let entries: import("node:fs").Dirent<string>[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await walkFiles(full, predicate)));
    } else if (predicate(full)) {
      out.push(full);
    }
  }
  return out;
}

/** Collect every author-facing block selector (`type` ?? `use`) used by the app. */
async function collectUsedSectionTypes(contentPagesDirectory: string): Promise<Set<string>> {
  const used = new Set<string>();
  const files = await walkFiles(contentPagesDirectory, (f) => f.endsWith(".md"));
  for (const file of files) {
    const raw = await fs.readFile(file, "utf8");
    let parsed: ReturnType<typeof parseMarkdownFrontmatter>;
    try {
      parsed = parseMarkdownFrontmatter(raw);
    } catch {
      continue;
    }
    const blocks = (parsed.data as { blocks?: unknown }).blocks;
    if (!Array.isArray(blocks)) continue;
    for (const block of blocks) {
      if (block && typeof block === "object") {
        const selector = (block as { type?: unknown }).type ?? (block as { use?: unknown }).use;
        if (typeof selector === "string" && selector.trim().length > 0) {
          used.add(selector.trim());
        }
      }
    }
  }
  return used;
}

/**
 * Read every section manifest in packages/ui and index its api[] declarations
 * by both semanticId and archetype, so a block `type` matching either resolves.
 */
async function collectSectionApiDeclarations(
  workspaceRoot: string,
): Promise<Map<string, ApiRouteDeclaration[]>> {
  const sectionsRoot = path.join(workspaceRoot, "packages", "ui", "src", "sections");
  const byKey = new Map<string, ApiRouteDeclaration[]>();
  const manifests = await walkFiles(sectionsRoot, (f) => f.endsWith(".manifest.yaml"));
  for (const manifestPath of manifests) {
    const raw = await fs.readFile(manifestPath, "utf8");
    let parsed: {
      semanticId?: string;
      archetype?: string;
      api?: Array<{ route?: string; handler?: string; methods?: string[]; secrets?: string[] }>;
    };
    try {
      parsed = parseYaml(raw);
    } catch {
      continue;
    }
    if (!Array.isArray(parsed.api) || parsed.api.length === 0) continue;
    const semanticId = typeof parsed.semanticId === "string" ? parsed.semanticId : null;
    const declarations: ApiRouteDeclaration[] = [];
    for (const entry of parsed.api) {
      if (
        entry &&
        typeof entry.route === "string" &&
        entry.route.trim().length > 0 &&
        typeof entry.handler === "string" &&
        entry.handler.trim().length > 0
      ) {
        const methods =
          Array.isArray(entry.methods) && entry.methods.length > 0
            ? entry.methods.map((m) => String(m).trim()).filter(Boolean)
            : DEFAULT_METHODS;
        const secrets = Array.isArray(entry.secrets)
          ? entry.secrets.map((s) => String(s).trim()).filter(Boolean)
          : [];
        declarations.push({
          route: entry.route.trim(),
          handler: entry.handler.trim(),
          methods,
          secrets,
          section: semanticId ?? path.basename(manifestPath),
        });
      }
    }
    if (declarations.length === 0) continue;
    for (const key of [semanticId, parsed.archetype]) {
      if (typeof key === "string" && key.length > 0) byKey.set(key, declarations);
    }
  }
  return byKey;
}

function renderApiRoute(declaration: ApiRouteDeclaration): string {
  // Re-export the Astro APIRoute handlers by NAME (POST, GET, …). The route renders
  // on demand in the Worker, so it MUST opt out of prerendering. Handler logic lives
  // once in the section package; this file is a thin GENERATED re-export.
  const names = declaration.methods.map(handlerExportName).join(", ");
  const header = buildGeneratedHeader({
    ownerCommand: "api.routes.generate",
    filePath: `src/pages/api/${declaration.route}.ts`,
  }).trimEnd();
  return `${header}
// Section-owned Astro APIRoute (RFC-0149). Handler logic lives once in the section
// package; this file is a thin re-export emitted by api.routes.generate for the
// "${declaration.section}" section. Do not edit — rerun api.routes.generate.
export const prerender = false;
export { ${names} } from "${declaration.handler}";
`;
}

/** Render src/env.schema.generated.mjs from the union of used sections' secrets. */
function renderEnvSchema(secrets: string[]): string {
  const header = buildGeneratedHeader({
    ownerCommand: "api.routes.generate",
    filePath: "src/env.schema.generated.mjs",
  }).trimEnd();
  const headerComment = `${header}
// [RFC-0149] Generated by api.routes.generate from the sections this app uses.
// Typed runtime secrets for astro:env, consumed by astro.config \`env.schema\`.
// Secrets are optional so a missing value degrades to the handler's error path
// (e.g. channel-delivery-failed), not a build/runtime throw.
`;
  if (secrets.length === 0) {
    return `${headerComment}export const envSchema = {};
`;
  }
  const fields = secrets
    .map(
      (key) =>
        `  ${key}: envField.string({\n    context: "server",\n    access: "secret",\n    optional: true,\n  }),`,
    )
    .join("\n");
  return `${headerComment}import { envField } from "astro/config";

export const envSchema = {
${fields}
};
`;
}

export async function runGenerateApiRoutes(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<ApiRoutesGenerateData>> {
  const paths = requireAstroSitePaths(context);
  const { manifest } = await loadSystemManifest(paths.contentDirectory);
  // RFC-0149: section endpoints are Astro APIRoutes under <app>/src/pages/api/. The
  // @astrojs/cloudflare adapter renders the prerender = false routes on demand in the Worker.
  const apiDirectory = path.join(paths.appDirectory, "src", "pages", "api");
  // Legacy Pages Functions location (RFC-0140) — GC any residue so no dead routes survive.
  const legacyFunctionsDirectory = path.join(paths.appDirectory, "functions");

  const usedTypes = await collectUsedSectionTypes(paths.contentPagesDirectory);
  const declarationsByKey = await collectSectionApiDeclarations(context.workspaceRoot);

  // Resolve the routes this app needs, deduped by route stem.
  const wanted = new Map<string, ApiRouteDeclaration>();
  for (const type of usedTypes) {
    const declarations = declarationsByKey.get(type);
    if (!declarations) continue;
    for (const declaration of declarations) {
      wanted.set(declaration.route, declaration);
    }
  }

  const warnings: ApiRoutesGenerateData["warnings"] = [];
  const generated: string[] = [];
  const removed: string[] = [];

  const appRelative = (absolute: string) =>
    path.relative(paths.appDirectory, absolute).replace(/\\/g, "/");

  // Write wanted routes.
  for (const declaration of wanted.values()) {
    const absolutePath = path.join(apiDirectory, `${declaration.route}.ts`);
    const content = renderApiRoute(declaration);
    let existing: string | null = null;
    try {
      existing = await fs.readFile(absolutePath, "utf8");
    } catch {
      existing = null;
    }
    if (existing !== null && !hasGeneratedMarker(existing)) {
      warnings.push({
        file: appRelative(absolutePath),
        message:
          "Existing api route is project-specific (no GENERATED marker) — skipped to preserve custom changes.",
      });
      continue;
    }
    if (existing === content) continue;
    if (!context.dryRun) {
      await fs.mkdir(path.dirname(absolutePath), { recursive: true });
      await fs.writeFile(absolutePath, content, "utf8");
    }
    generated.push(appRelative(absolutePath));
  }

  // Garbage-collect GENERATED routes whose section is no longer used.
  const wantedFiles = new Set([...wanted.keys()].map((route) => `${route}.ts`));
  const existingFiles = await walkFiles(apiDirectory, (f) => f.endsWith(".ts"));
  for (const absolutePath of existingFiles) {
    const base = path.basename(absolutePath);
    if (wantedFiles.has(base)) continue;
    let content: string;
    try {
      content = await fs.readFile(absolutePath, "utf8");
    } catch {
      continue;
    }
    if (!hasGeneratedMarker(content)) continue; // leave project-specific routes alone
    if (!context.dryRun) {
      await fs.rm(absolutePath, { force: true });
    }
    removed.push(appRelative(absolutePath));
  }

  // RFC-0149: retire the legacy Pages Functions tree. Remove GENERATED re-exports and
  // prune the functions/ directory once empty. Project-specific files are left in place.
  const legacyFiles = await walkFiles(legacyFunctionsDirectory, (f) => f.endsWith(".ts"));
  for (const absolutePath of legacyFiles) {
    let content: string;
    try {
      content = await fs.readFile(absolutePath, "utf8");
    } catch {
      continue;
    }
    if (!hasGeneratedMarker(content)) {
      warnings.push({
        file: appRelative(absolutePath),
        message:
          "Residual project-specific file under legacy functions/ — left in place; remove manually (RFC-0149).",
      });
      continue;
    }
    if (!context.dryRun) {
      await fs.rm(absolutePath, { force: true });
    }
    removed.push(appRelative(absolutePath));
  }
  if (!context.dryRun) {
    await fs.rm(legacyFunctionsDirectory, { recursive: true, force: true }).catch(() => {});
  }

  // RFC-0149: project the union of used sections' secrets into the app's astro:env schema.
  const agentBlock = (manifest as unknown as Record<string, unknown>).agent as
    { enabled?: boolean } | undefined;
  const agentEnabled = agentBlock?.enabled !== false;
  const entitlementsManifest = manifest as unknown as ManifestEntitlement;
  const hasEntitlements = participatesInEntitlements(entitlementsManifest);
  const envSchemaKeys = [
    ...new Set([
      ...[...wanted.values()].flatMap((declaration) => declaration.secrets),
      ...(agentEnabled ? AGENT_GATE_SECRETS : []),
      ...(hasEntitlements ? ENTITLEMENT_SECRETS : []),
    ]),
  ].sort();
  const envSchemaPath = path.join(paths.appDirectory, "src", "env.schema.generated.mjs");
  const envSchemaContent = renderEnvSchema(envSchemaKeys);
  let existingEnvSchema: string | null = null;
  try {
    existingEnvSchema = await fs.readFile(envSchemaPath, "utf8");
  } catch {
    existingEnvSchema = null;
  }
  if (existingEnvSchema !== envSchemaContent) {
    if (!context.dryRun) {
      await fs.mkdir(path.dirname(envSchemaPath), { recursive: true });
      await fs.writeFile(envSchemaPath, envSchemaContent, "utf8");
    }
    generated.push(appRelative(envSchemaPath));
  }

  return {
    data: {
      command: "api.routes.generate",
      status: "ok",
      generated,
      removed,
      envSchema: envSchemaKeys,
      warnings: warnings.length > 0 ? warnings : undefined,
    },
    summary: `[api.routes.generate] ${generated.length} written, ${removed.length} removed${
      context.dryRun ? " (dry-run)" : ""
    }`,
  };
}
