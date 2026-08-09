/*
<MODULE_CONTRACT>
<purpose>
  RFC-0171 (phases 2-4): the codegen + parity guard for the git-based (Decap) headless-CMS
  adapter. cms.schema.generate derives a Decap admin `config.yml` from the same content the
  build already reads — one folder collection per RFC-0047 content domain, with fields
  inferred from the union of on-disk frontmatter — so the CMS field config has a single
  source of truth and cannot silently diverge from the content. cms.schema.parity regenerates
  that config in memory and fails when the committed config.yml drifts. Both commands no-op
  (pass) for apps still on the filesystem adapter, so they are safe in the shared pipelines.
</purpose>
<non-goals>
  <item>Do not edit content or run the CMS — this is config codegen + a drift guard only.</item>
  <item>Do not resolve drafts — production builds read merged markdown via the fs provider (fail-closed).</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0171: git-based Decap adapter codegen + parity (headless-CMS phases 2-4).</item>
</CHANGE_SUMMARY>
*/

import { join, relative } from "node:path";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import YAML from "yaml";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/werkstatt/kernel";
import { requireAstroSitePaths } from "@warpgogol/werkstatt-site/paths";
import {
  loadSystemManifest,
  collectMarkdownFiles,
  parseMarkdownFrontmatter,
} from "@warpgogol/werkstatt-site/content";
import {
  buildDecapConfig,
  inferFields,
  mergeSamples,
  type DecapCollection,
} from "@warpgogol/werkstatt-site/content-source/cms-git";
import { passResult, failResult } from "./result-helpers.ts";
import { readAstroSiteUrl } from "./lib/astro-site-url.ts";

/** RFC-0047 content domains the Decap config exposes, in deterministic order. */
const CMS_DOMAINS = ["pages", "prose", "site", "navigation", "business"] as const;

const ADMIN_DIR = ["public", "admin"] as const;
const CONFIG_FILENAME = "config.yml";
const INDEX_FILENAME = "index.html";

/** Decap admin loader page — pins the widely-used CDN build of the editor. */
const ADMIN_INDEX_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="robots" content="noindex" />
    <title>Content Manager</title>
  </head>
  <body>
    <script src="https://unpkg.com/decap-cms@^3.0.0/dist/decap-cms.js"></script>
  </body>
</html>
`;

async function resolveAdapter(appDir: string): Promise<string> {
  const { manifest } = await loadSystemManifest(join(appDir, "src", "content"));
  const contentSource = (manifest as unknown as { contentSource?: { adapter?: string } })
    .contentSource;
  return contentSource?.adapter ?? "fs";
}

/** Build one Decap folder collection from the on-disk frontmatter of a content domain. */
async function buildDomainCollection(
  contentRoot: string,
  domain: string,
): Promise<DecapCollection | null> {
  const domainDir = join(contentRoot, domain);
  const files = await collectMarkdownFiles(domainDir);
  if (files.length === 0) return null;

  let sample: unknown = {};
  for (const file of files) {
    const { data } = parseMarkdownFrontmatter(await readFile(file, "utf-8"));
    sample = mergeSamples(sample, data);
  }
  const fields = inferFields((sample ?? {}) as Record<string, unknown>);
  // Every domain keeps a markdown body so prose and page narratives round-trip.
  fields.push({ name: "body", label: "Body", widget: "markdown", required: false });

  return {
    name: domain,
    label: domain.charAt(0).toUpperCase() + domain.slice(1),
    folder: `src/content/${domain}`,
    create: true,
    extension: "md",
    format: "frontmatter",
    nested: { depth: 4 },
    meta: { path: { widget: "string", label: "Path" } },
    fields,
  };
}

/** Render the full, deterministic config.yml content (marker header + serialized YAML). */
async function renderConfig(appDir: string): Promise<string> {
  const contentRoot = join(appDir, "src", "content");
  const collections: DecapCollection[] = [];
  for (const domain of CMS_DOMAINS) {
    const collection = await buildDomainCollection(contentRoot, domain);
    if (collection) collections.push(collection);
  }

  const config = buildDecapConfig({
    backend: { name: "git-gateway", branch: "main" },
    mediaFolder: "public/uploads",
    publicFolder: "/uploads",
    siteUrl: await readAstroSiteUrl(appDir),
    editorialWorkflow: true,
    collections,
  });

  return YAML.stringify(config);
}

export async function runCmsSchemaGenerate(
  _input: KernelCommandInput,
  ctx: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const command = "cms.schema.generate";
  const paths = requireAstroSitePaths(ctx);
  const appDir = paths.appDirectory;

  const adapter = await resolveAdapter(appDir);
  if (adapter !== "cms-git") {
    return passResult(command, `${command}: skipped (adapter "${adapter}", not cms-git)`);
  }

  if (ctx.dryRun) {
    return passResult(command, `${command}: [dry-run] would regenerate Decap config`);
  }

  const adminDir = join(appDir, ...ADMIN_DIR);
  await mkdir(adminDir, { recursive: true });
  await writeFile(join(adminDir, CONFIG_FILENAME), await renderConfig(appDir), "utf-8");
  await writeFile(join(adminDir, INDEX_FILENAME), ADMIN_INDEX_HTML, "utf-8");

  const rel = relative(ctx.workspaceRoot, join(adminDir, CONFIG_FILENAME)).replace(/\\/g, "/");
  return passResult(command, `${command}: wrote ${rel}`);
}

export async function runCmsSchemaParity(
  _input: KernelCommandInput,
  ctx: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const command = "cms.schema.parity";
  const paths = requireAstroSitePaths(ctx);
  const appDir = paths.appDirectory;

  const adapter = await resolveAdapter(appDir);
  if (adapter !== "cms-git") {
    return passResult(command, `${command}: skipped (adapter "${adapter}", not cms-git)`);
  }

  const configPath = join(appDir, ...ADMIN_DIR, CONFIG_FILENAME);
  let onDisk: string;
  try {
    onDisk = await readFile(configPath, "utf-8");
  } catch {
    return failResult(command, [
      `Decap config not found at public/admin/${CONFIG_FILENAME}. Run cms.schema.generate.`,
    ]);
  }

  const expected = await renderConfig(appDir);
  if (onDisk.trimEnd() !== expected.trimEnd()) {
    return failResult(command, [
      `public/admin/${CONFIG_FILENAME} is stale — it diverges from the content schemas. ` +
        `Regenerate with cms.schema.generate (never hand-edit the generated config).`,
    ]);
  }

  return passResult(command, `${command}: OK (Decap config matches content schemas)`);
}
