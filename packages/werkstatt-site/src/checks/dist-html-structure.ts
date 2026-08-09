/*
<MODULE_CONTRACT>
<purpose>
  RFC-0654: post-build HTML structural integrity validation.
  dist.html-structure.validate checks tag balance for structural non-void HTML
  elements in every .html file under dist/client/. It runs in the build.post
  pipeline after all mutators and before the postbuild validation pipeline.
  If any structural tag has mismatched open/close counts, the command fails.
</purpose>
<non-goals>
  <item>Do not validate accessibility landmarks — that is Axiom's responsibility.</item>
  <item>Do not detect duplicate structural tags — targets tag imbalance from mutator damage, not duplication.</item>
  <item>Do not parse HTML with a full parser — uses lightweight tag counting.</item>
  <item>Do not validate non-HTML files (JSON, XML, CSS, SVG).</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0654: initial implementation.</item>
</CHANGE_SUMMARY>
*/

import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/werkstatt/kernel";
import { collectFiles } from "@warpgogol/werkstatt-site/share/fs";

const STRUCTURAL_TAGS = [
  "main",
  "header",
  "nav",
  "footer",
  "section",
  "article",
  "aside",
  "body",
  "head",
  "form",
  "figure",
  "details",
  "dialog",
  "template",
] as const;

const COMMENT_REGEX = /<!--[\s\S]*?-->/g;

export interface HtmlStructureViolation {
  file: string;
  rule: string;
  tag: string;
  openCount: number;
  closeCount: number;
  message: string;
}

export interface HtmlStructureValidateResult {
  command: "dist.html-structure.validate";
  status: "pass" | "fail";
  filesScanned: number;
  violations?: HtmlStructureViolation[];
}

/**
 * Pure function: check HTML content for structural tag balance violations.
 *
 * Strips HTML comments before counting to avoid false positives from
 * tag-like strings inside comments. Counts opening tags via `<tag\b[^>]*>`
 * (excluding `</tag>`) and closing tags via `</tag>`. Self-closing variants
 * (`<tag ... />`) of non-void structural elements are counted as opening
 * tags — browsers treat `<main />` as `<main>` (opening tag).
 *
 * Returns an array of violations (empty if balanced).
 */
export function checkHtmlStructure(htmlContent: string): Omit<HtmlStructureViolation, "file">[] {
  const stripped = htmlContent.replace(COMMENT_REGEX, "");
  const violations: Omit<HtmlStructureViolation, "file">[] = [];

  for (const tag of STRUCTURAL_TAGS) {
    const openRegex = new RegExp(`<${tag}\\b[^>]*>`, "gi");
    const closeRegex = new RegExp(`</${tag}>`, "gi");
    const openCount = (stripped.match(openRegex) ?? []).length;
    const closeCount = (stripped.match(closeRegex) ?? []).length;

    if (openCount !== closeCount) {
      violations.push({
        rule: "HTML-STRUCT-01",
        tag,
        openCount,
        closeCount,
        message: `Tag <${tag}> has ${openCount} opening and ${closeCount} closing tags — structural imbalance detected`,
      });
    }
  }

  return violations;
}

/**
 * Thin kernel command handler wrapping {@link checkHtmlStructure} for
 * pipeline/CLI use. Scans all .html files under dist/client/ and fails
 * on any structural tag imbalance.
 */
export async function runDistHtmlStructureValidate(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<HtmlStructureValidateResult>> {
  const app = context.site?.name ?? (input.flags.site as string | undefined);
  if (!app) {
    return {
      data: {
        command: "dist.html-structure.validate",
        status: "fail",
        filesScanned: 0,
        violations: [
          {
            file: "",
            rule: "HTML-STRUCT-02",
            tag: "",
            openCount: 0,
            closeCount: 0,
            message: "App not specified.",
          },
        ],
      },
      exitCode: 1,
      summary: "dist.html-structure.validate: app not specified",
    };
  }

  const distClient = join(
    context.site?.directory ?? join(context.workspaceRoot, "apps", app),
    "dist",
    "client",
  );
  try {
    await access(distClient);
  } catch {
    return {
      data: {
        command: "dist.html-structure.validate",
        status: "pass",
        filesScanned: 0,
      },
      exitCode: 0,
      summary: "dist.html-structure.validate: skipped — no dist/client (run build first)",
    };
  }

  const allFiles = await collectFiles(distClient, { ignore: () => false });
  const htmlFiles = allFiles.filter((f) => f.endsWith(".html"));

  const violations: HtmlStructureViolation[] = [];

  for (const file of htmlFiles) {
    let content: string;
    try {
      content = await readFile(file, "utf-8");
    } catch {
      continue;
    }

    const fileViolations = checkHtmlStructure(content);
    for (const v of fileViolations) {
      const rel = file
        .replace(context.workspaceRoot + "\\", "")
        .replace(context.workspaceRoot + "/", "");
      violations.push({ ...v, file: rel });
    }
  }

  if (violations.length > 0) {
    return {
      data: {
        command: "dist.html-structure.validate",
        status: "fail",
        filesScanned: htmlFiles.length,
        violations,
      },
      exitCode: 1,
      summary: `dist.html-structure.validate: ${violations.length} violation(s) in ${htmlFiles.length} file(s)`,
    };
  }

  return {
    data: {
      command: "dist.html-structure.validate",
      status: "pass",
      filesScanned: htmlFiles.length,
    },
    exitCode: 0,
    summary: `dist.html-structure.validate: scanned ${htmlFiles.length} file(s), no structural violations`,
  };
}
