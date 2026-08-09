/*
<MODULE_CONTRACT>
<purpose>Aggregate public artifact validation, declaration, surface lint, and runtime probe commands (RFC-0307/0315/0316).</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0303: extracted aggregate commands from public-surface.ts into public-surface/aggregate.ts.</item>
  <item>RFC-0577: Enrich PUBTXT-07 fixHint with resolveProseSource helper and build.prepare command.</item>
  <item>RFC-0577 review fix: Make resolveProseSource async and use context.io.exists instead of existsSync.</item>
</CHANGE_SUMMARY>
*/

import { join } from "node:path";
import { readFile } from "node:fs/promises";
import { parse as yamlParse } from "yaml";
import type {
  CheckResult,
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/site-kernel";
import { hasGeneratedMarker } from "@warpgogol/werkstatt-site/codegen";
import {
  asString,
  appRel,
  deriveIndexNowKey,
  diagnostics,
  isPublicTextArtifact,
  loadPublicContext,
  markdownLeadBeforeSource,
  markdownLinkTargets,
  markdownTwinSourcePath,
  normalizePublicRelPath,
  normalizeUrl,
  publicArtifactPaths,
  publicPathFromRelPath,
  readTextIfExists,
  sameSiteDefaultPrefixPattern,
  sameSitePath,
  stripFencedCode,
  UTF8_DECODER,
  visibleTextLength,
  hasSubstantiveMarkdownAfterHeading,
  wildcardRobotsGroupDisallowsAll,
  workspaceRel,
} from "./shared.ts";
import { passResult } from "../result-helpers.ts";

async function resolveProseSource(
  file: string,
  appDir: string,
  context: KernelRuntimeContext,
): Promise<string | null> {
  if (!file.startsWith("public/")) return null;
  const proseRel = file.replace(/^public\//, "");
  const prosePath = join(appDir, "src", "content", "prose", proseRel);
  if (await context.io.exists(prosePath)) {
    return `src/content/prose/${proseRel}`;
  }
  return null;
}

export async function runPublicArtifactGenerate(
  _input: KernelCommandInput,
  _context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  return passResult(
    "public.artifact.generate",
    "public.artifact.generate: artifact generation is owned by dedicated public commands",
  );
}

export async function runPublicArtifactValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const app = await loadPublicContext(context);
  const messages: Array<{
    severity: "error" | "warning" | "info";
    message: string;
    file?: string;
    fixHint?: string;
  }> = [];
  for (const artifact of publicArtifactPaths(app.publicDirectory, app.appId)) {
    if (!(await context.io.exists(artifact.path))) {
      messages.push({
        severity: "error",
        file: workspaceRel(context, artifact.path),
        message: `Missing public artifact ${artifact.label}.`,
        fixHint: "Run the build.prepare pipeline before validating public artifacts.",
      });
    }
  }

  const robots = await readTextIfExists(context, join(app.publicDirectory, "robots.txt"));
  if (robots && !/^Sitemap:\s*/im.test(robots)) {
    messages.push({
      severity: "error",
      file: workspaceRel(context, join(app.publicDirectory, "robots.txt")),
      message: "robots.txt must declare a Sitemap directive.",
      fixHint: "Run robots.generate.",
    });
  }

  return diagnostics("public.artifact.validate", messages);
}

export async function runPublicDeclarationValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const app = await loadPublicContext(context);
  const messages: Array<{
    severity: "error" | "warning" | "info";
    message: string;
    file?: string;
    fixHint?: string;
  }> = [];
  const robots = await readTextIfExists(context, join(app.publicDirectory, "robots.txt"));
  const ai = await readTextIfExists(context, join(app.publicDirectory, "ai.txt"));
  const humans = await readTextIfExists(context, join(app.publicDirectory, "humans.txt"));

  if (robots && wildcardRobotsGroupDisallowsAll(robots) && ai?.includes("policy: allow")) {
    messages.push({
      severity: "error",
      file: workspaceRel(context, join(app.publicDirectory, "robots.txt")),
      message:
        "Public declarations conflict: robots.txt blocks all while ai.txt allows AI crawling.",
      fixHint: "Regenerate robots.txt or revise the explicit robots policy.",
    });
  }
  if (humans && humans.includes("NEED_THIS")) {
    messages.push({
      severity: "error",
      file: workspaceRel(context, join(app.publicDirectory, "humans.txt")),
      message: "humans.txt must not ship NEED_THIS placeholders.",
      fixHint: "Resolve credits/team placeholders before publishing.",
    });
  }
  return diagnostics("public.declaration.validate", messages);
}

export async function runPublicSurfaceLint(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const app = await loadPublicContext(context);
  const files = (await context.io.glob("**/*", { cwd: app.publicDirectory }))
    .map(normalizePublicRelPath)
    .filter(isPublicTextArtifact)
    .sort();
  const publicPaths = new Set(files.map(publicPathFromRelPath));
  const routePaths = new Set<string>();
  try {
    const sitemap = await context.io.readFile(join(app.publicDirectory, "sitemap.xml"));
    for (const match of sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)) {
      const path = sameSitePath(app, match[1]);
      if (path) routePaths.add(path.replace(/\/$/, "") || "/");
    }
  } catch {
    // Missing sitemap is owned by sitemap.validate/public.artifact.validate.
  }
  for (const page of (app.manifest.pages as
    Array<{ routes?: Record<string, string> }> | undefined) ?? []) {
    for (const [lang, slug] of Object.entries(page.routes ?? {})) {
      const prefix = lang === app.defaultLanguage ? "" : `/${lang}`;
      routePaths.add(`${prefix}/${slug}`.replace(/\/$/, "") || "/");
    }
  }
  routePaths.add("/.well-known/agent.json");
  // Also include PSEO surface routes from surface.generated.yaml so that
  // llms.txt links to programmatic surface pages are recognized as locally known.
  try {
    const surfaceRaw = await readFile(
      join(app.appDirectory, "src", "surface.generated.yaml"),
      "utf8",
    );
    const surface = yamlParse(surfaceRaw) as {
      entries?: Array<{ routes?: Record<string, string> }>;
    };
    for (const entry of surface.entries ?? []) {
      for (const [lang, slug] of Object.entries(entry.routes ?? {})) {
        const prefix = lang === app.defaultLanguage ? "" : `/${lang}`;
        routePaths.add(`${prefix}/${slug}`.replace(/\/$/, "") || "/");
      }
    }
  } catch {
    // No surface artifact — not an error here.
  }
  const defaultPrefixPattern = sameSiteDefaultPrefixPattern(app);
  const messages: Array<{
    severity: "error" | "warning" | "info";
    message: string;
    file?: string;
    fixHint?: string;
  }> = [];

  for (const relPath of files) {
    const absolutePath = join(app.publicDirectory, relPath);
    let text: string;
    try {
      const bytes = await context.io.readFileBytes(absolutePath);
      text = UTF8_DECODER.decode(bytes);
    } catch (error) {
      messages.push({
        severity: "error",
        file: appRel(app.appDirectory, absolutePath),
        message: `PUBTXT-01 invalid UTF-8: ${(error as Error).message}`,
        fixHint: "Regenerate this public artifact as UTF-8 text.",
      });
      continue;
    }

    const file = appRel(app.appDirectory, absolutePath);
    if (/\r\n?/.test(text)) {
      messages.push({
        severity: "error",
        file,
        message: "PUBTXT-02 public text artifact uses CRLF or bare CR line endings.",
        fixHint: "Regenerate with LF line endings.",
      });
    }

    const withoutFences = relPath.endsWith(".md") ? stripFencedCode(text) : text;
    if (/\{(?:business|site|pages|prose|navigation)\.[^}\n]+\}/.test(withoutFences)) {
      messages.push({
        severity: "error",
        file,
        message: "PUBTXT-04 unresolved content reference token is visible in public text.",
        fixHint: "Resolve RFC-0045 content references before writing public projections.",
      });
    }

    if (
      relPath.endsWith(".json") &&
      /"(?:sectionAnchors|anchors|items)"\s*:\s*\[\s*\]/.test(text)
    ) {
      messages.push({
        severity: "error",
        file,
        message: "PUBJSON-01 generated JSON serializes an optional empty array.",
        fixHint:
          "Omit optional empty generated JSON values instead of serializing empty containers.",
      });
    }

    if (
      (relPath.endsWith(".md") || relPath.endsWith(".txt")) &&
      !relPath.startsWith("open-source/")
    ) {
      if (/<\/?(?!https?:\/\/)[a-z][a-z0-9-]*(?:\s[^>]*)?>/i.test(withoutFences)) {
        messages.push({
          severity: "error",
          file,
          message: "PUBTXT-03 HTML tag appears in Markdown/text public artifact.",
          fixHint: "Project structured text to Markdown/plain text before writing the artifact.",
        });
      }

      const malformed = withoutFences.match(/^(?:- ---|- -(?:\s|$)|- #{1,6}\s+)/gm);
      if (malformed) {
        messages.push({
          severity: "error",
          file,
          message: `PUBTXT-05 malformed generated Markdown list artifact: ${malformed[0]}`,
          fixHint: "Normalize authored Markdown fragments before nesting them in generated lists.",
        });
      }

      if (defaultPrefixPattern?.test(withoutFences)) {
        messages.push({
          severity: "error",
          file,
          message: `PUBTXT-06 default-language /${app.defaultLanguage}/ URL prefix leaked into public text.`,
          fixHint:
            "Use the canonical unprefixed default-language URL helper when generating public links.",
        });
      }

      for (const target of markdownLinkTargets(withoutFences)) {
        if (/^(?:mailto:|tel:|#)/i.test(target)) continue;
        const path = sameSitePath(app, target);
        if (!path) continue;
        const normalizedPath = path.replace(/\/$/, "") || "/";
        const fileCandidates = [
          path,
          `${path.replace(/\/$/, "")}.md`,
          `${path.replace(/\/$/, "")}/index.md`,
          `${path.replace(/\/$/, "")}/index.html`,
        ];
        if (
          !routePaths.has(normalizedPath) &&
          !fileCandidates.some((candidate) => publicPaths.has(candidate))
        ) {
          const proseSource = await resolveProseSource(file, app.appDirectory, context);
          messages.push({
            severity: "error",
            file,
            message: `PUBTXT-07 same-site generated link target is not locally known: ${target}`,
            fixHint: proseSource
              ? `Fix the source file ${proseSource}, then re-run: pnpm exec site-kernel pipeline build.prepare --site <id>.`
              : "Use a canonical generated route/public file or add the target to the owning route/declaration set.",
          });
        }
      }

      if (hasGeneratedMarker(text) && /^Source:\s+\/\S+/m.test(withoutFences)) {
        messages.push({
          severity: "error",
          file,
          message: "PUBTXT-08 Markdown twin uses a relative Source line.",
          fixHint: "Emit an absolute canonical Source URL.",
        });
      }

      if (relPath === "robots.txt" && /^(?:Allow|Disallow):\s*\/?\s*$/im.test(withoutFences)) {
        messages.push({
          severity: "warning",
          file,
          message: "PUBTXT-09 robots.txt contains redundant wildcard allow/disallow noise.",
          fixHint: "Keep robots.txt declarative and avoid no-op directives.",
        });
      }

      if (/\b20\d{2}\/\d{1,2}\/\d{1,2}\b/.test(withoutFences)) {
        messages.push({
          severity: "error",
          file,
          message: "PUBTXT-10 slash-form date appears in public prose.",
          fixHint: "Use ISO dates or locale-appropriate display dates.",
        });
      }

      if (/\b(?:Change price|Hourly rate):\s*\d+\s*(?:$|\n)/.test(withoutFences)) {
        messages.push({
          severity: "error",
          file,
          message: "PUBTXT-11 bare commercial term lacks localized currency/unit rendering.",
          fixHint: "Render commercial terms through the business offer projector.",
        });
      }

      if ((relPath.endsWith(".md") && hasGeneratedMarker(text)) || relPath === "llms-full.txt") {
        const lines = withoutFences.split("\n");
        for (let i = 0; i < lines.length; i += 1) {
          if (!/^#{2,6}\s+\S/.test(lines[i])) continue;
          if (/^#{2,6}\s+CTA:/i.test(lines[i].trim())) continue;
          if (hasSubstantiveMarkdownAfterHeading(lines, i)) continue;
          messages.push({
            severity: "error",
            file,
            message: `PUBTXT-12 heading has no substantive content: ${lines[i].trim()}`,
            fixHint: "Remove empty generated headings or project substantive content beneath them.",
          });
          break;
        }
      }

      if (relPath.endsWith(".md") && hasGeneratedMarker(text)) {
        const sourcePath = markdownTwinSourcePath(text, app);
        const normalizedSource = sourcePath?.replace(/\/$/, "") || "/";
        if (sourcePath && routePaths.has(normalizedSource)) {
          const descriptionLength = visibleTextLength(markdownLeadBeforeSource(text));
          if (descriptionLength < 70) {
            messages.push({
              severity: "error",
              file,
              message: `PUBTXT-13 generated Markdown description is too short (${descriptionLength} visible characters).`,
              fixHint: "Project a substantive sitemap/member description into the Markdown twin.",
            });
          }
        }
      }
    }
  }

  return diagnostics("public.surface.lint", messages);
}

async function probeUrl(
  url: string,
): Promise<{ ok: boolean; status: number; contentType: string | null }> {
  const response = await fetch(url, { method: "GET" });
  return {
    ok: response.ok,
    status: response.status,
    contentType: response.headers.get("content-type"),
  };
}

export async function runPublicRuntimeProbe(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const app = await loadPublicContext(context);
  const baseUrl = asString(input.flags["base-url"]) ?? app.siteUrl;
  if (!baseUrl) {
    return passResult("public.runtime.probe", "public.runtime.probe: skipped (no --base-url)");
  }
  const normalized = normalizeUrl(baseUrl);
  const endpoints = [
    "/robots.txt",
    "/ai.txt",
    "/humans.txt",
    "/sitemap.xml",
    "/.well-known/security.txt",
    `/${deriveIndexNowKey(app.appId)}.txt`,
  ];
  const messages: Array<{
    severity: "error" | "warning" | "info";
    message: string;
    file?: string;
    fixHint?: string;
  }> = [];
  for (const endpoint of endpoints) {
    try {
      const result = await probeUrl(normalized + endpoint);
      if (!result.ok) {
        messages.push({
          severity: "error",
          message: `${endpoint} returned HTTP ${result.status}.`,
          fixHint: "Deploy the generated public artifacts and retry the runtime probe.",
        });
      }
    } catch (error) {
      messages.push({
        severity: "error",
        message: `${endpoint} probe failed: ${(error as Error).message}`,
        fixHint: "Check the base URL and network reachability.",
      });
    }
  }
  return diagnostics("public.runtime.probe", messages);
}
