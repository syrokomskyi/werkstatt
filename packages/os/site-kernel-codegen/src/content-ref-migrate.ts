/*
<MODULE_CONTRACT>
<purpose>RFC-0529 content.ref-migrate — scans src/content markdown and yaml files, finds
brace-delimited {collection.file.field} patterns, and replaces them with braceless
collection.file.field syntax. Idempotent: re-running on already-migrated files is a no-op.</purpose>
<non-goals>
  <item>Do not resolve references — that is the resolver in @gogol/share/content-reference.</item>
  <item>Do not validate references — that is content.references.validate in @gogol/site-kernel-checks.</item>
  <item>Do not migrate files outside src/content/.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0529: initial implementation of content.ref-migrate command.</item>
</CHANGE_SUMMARY>
*/

import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { collectMarkdownFiles } from "@gogol/site-kernel-content";
import { collectFiles } from "@gogol/share/fs";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@gogol/site-kernel";
import { requireAstroSitePaths } from "@gogol/site-kernel-astro";

const BRACE_REF_PATTERN = /\{([a-z][a-z-]*\.[a-z0-9-/]+\.[a-zA-Z0-9_.-]+)\}/g;

function migrateYamlString(value: string): string {
  if (!value.includes("{")) return value;
  let result = value;
  const pattern = new RegExp(BRACE_REF_PATTERN.source, "g");
  let match: RegExpExecArray | null;
  const replacements: Array<{ original: string; replacement: string }> = [];

  while ((match = pattern.exec(value)) !== null) {
    const fullMatch = match[0];
    const inner = match[1];
    replacements.push({ original: fullMatch, replacement: inner });
  }

  for (const { original, replacement } of replacements) {
    result = result.replace(original, replacement);
  }

  return result;
}

function migratePureYamlValue(line: string): string {
  const match = line.match(/^(\s*-?\s*)(["'])(.*)\2\s*$/);
  if (!match) return line;
  const indent = match[1];
  const quote = match[2];
  const content = match[3];

  const pureRefPattern = /^[a-z][a-z-]*\.[a-z0-9-/]+\.[a-zA-Z0-9_.-]+$/;
  if (pureRefPattern.test(content)) {
    return `${indent}${content}`;
  }
  return line;
}

function migrateYamlLine(line: string): string {
  if (!line.includes("{")) return line;

  const valueMatch = line.match(/^(\s*\S+:?\s*)(["'])(.*)\2\s*$/);
  if (!valueMatch) {
    return migrateYamlString(line);
  }

  const prefix = valueMatch[1];
  const quote = valueMatch[2];
  const content = valueMatch[3];

  const pureRefPattern = /^[a-z][a-z-]*\.[a-z0-9-/]+\.[a-zA-Z0-9_.-]+$/;
  const migratedContent = migrateYamlString(content);

  if (pureRefPattern.test(migratedContent)) {
    return `${prefix}${migratedContent}`;
  }

  return `${prefix}${quote}${migratedContent}${quote}`;
}

function migrateMarkdownBody(body: string): string {
  if (!body.includes("{")) return body;
  return migrateYamlString(body);
}

function splitFrontmatter(content: string): { frontmatter: string; body: string } | null {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return null;
  return { frontmatter: match[1], body: match[2] };
}

function migrateFrontmatter(frontmatter: string): string {
  const lines = frontmatter.split("\n");
  const result: string[] = [];

  for (const line of lines) {
    if (line.includes("{")) {
      const migrated = migrateYamlLine(line);
      result.push(migrated);
    } else {
      result.push(line);
    }
  }

  return result.join("\n");
}

function migrateYamlFile(content: string): string {
  const lines = content.split("\n");
  const result: string[] = [];

  for (const line of lines) {
    if (line.includes("{")) {
      const migrated = migrateYamlLine(line);
      result.push(migrated);
    } else {
      result.push(line);
    }
  }

  return result.join("\n");
}

function migrateMarkdownFile(content: string): string {
  const parts = splitFrontmatter(content);
  if (!parts) {
    return migrateMarkdownBody(content);
  }

  const migratedFm = migrateFrontmatter(parts.frontmatter);
  const migratedBody = migrateMarkdownBody(parts.body);

  return `---\n${migratedFm}\n---\n${migratedBody}`;
}

export async function runContentRefMigrate(
  _input: KernelCommandInput,
  ctx: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const command = "content.ref-migrate";
  const paths = requireAstroSitePaths(ctx);
  const appRoot = paths.appDirectory;
  const contentDir = join(appRoot, "src", "content");

  const mdFiles = await collectMarkdownFiles(contentDir);
  const yamlFiles = (await collectFiles(contentDir, { extensions: [".yaml", ".yml"] })).filter(
    (f) => !f.endsWith(".credits.yaml") && !f.endsWith(".manifest.yaml"),
  );

  let migrated = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const filePath of mdFiles) {
    try {
      const content = await readFile(filePath, "utf-8");
      if (!content.includes("{")) {
        skipped++;
        continue;
      }
      const migratedContent = migrateMarkdownFile(content);
      if (migratedContent !== content) {
        await writeFile(filePath, migratedContent, "utf-8");
        migrated++;
      } else {
        skipped++;
      }
    } catch (err) {
      errors.push(`[migrate-failed] ${filePath}: ${String(err)}`);
    }
  }

  for (const filePath of yamlFiles) {
    try {
      const content = await readFile(filePath, "utf-8");
      if (!content.includes("{")) {
        skipped++;
        continue;
      }
      const migratedContent = migrateYamlFile(content);
      if (migratedContent !== content) {
        await writeFile(filePath, migratedContent, "utf-8");
        migrated++;
      } else {
        skipped++;
      }
    } catch (err) {
      errors.push(`[migrate-failed] ${filePath}: ${String(err)}`);
    }
  }

  if (errors.length > 0) {
    return {
      exitCode: 1,
      data: {
        command,
        status: "fail",
        migrated,
        skipped,
        errors,
      },
      summary: `${command}: ${migrated} migrated, ${skipped} skipped, ${errors.length} error(s)`,
    };
  }

  return {
    exitCode: 0,
    data: {
      command,
      status: "pass",
      migrated,
      skipped,
    },
    summary: `${command}: OK — ${migrated} file(s) migrated, ${skipped} skipped`,
  };
}
