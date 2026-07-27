/*
<MODULE_CONTRACT>
<purpose>
  RFC-0185 distribution-only generated-marker cleanup.
  dist.generated-marker.strip removes the RFC-0081 GENERATED_MARKER from every
  text artifact under apps/<id>/dist/client. It runs after all post-build generators.
  dist.generated-marker.validate scans dist/client and fails if any marker remains.
</purpose>
<non-goals>
  <item>Do not strip markers from tracked apps/* source or public/ files.</item>
  <item>Do not alter binary files.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0185: initial implementation.</item>
</CHANGE_SUMMARY>
*/

import { access, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@gogol/site-kernel";
import {
  hasGeneratedMarker,
  stripGeneratedMarker,
  isGeneratedMarkerTextCandidate,
} from "@gogol/site-kernel";
import { passResult, failResult } from "./result-helpers.ts";
import { collectFiles } from "@gogol/share/fs";

async function walkTextFiles(dir: string): Promise<string[]> {
  const files = await collectFiles(dir, { ignore: () => false });
  return files.filter((abs) => isGeneratedMarkerTextCandidate(abs));
}

export async function runDistGeneratedMarkerStrip(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const app = context.site?.name ?? (input.flags.site as string | undefined);
  if (!app) {
    return failResult("dist.generated-marker.strip", ["DIST-GENMARK-02: App not specified."]);
  }

  const distClient = join(
    context.site?.directory ?? join(context.workspaceRoot, "apps", app),
    "dist",
    "client",
  );
  try {
    await access(distClient);
  } catch {
    return failResult("dist.generated-marker.strip", [
      `DIST-GENMARK-02: dist/client missing for app ${app}. Run build first.`,
    ]);
  }

  const files = await walkTextFiles(distClient);
  const changedFiles: string[] = [];
  const warnings: string[] = [];
  let filesChanged = 0;

  for (const file of files) {
    let content: string;
    try {
      content = await readFile(file, "utf-8");
    } catch {
      warnings.push(`DIST-GENMARK-03: Could not read ${file}`);
      continue;
    }

    if (!hasGeneratedMarker(content)) {
      continue;
    }

    const { changed, content: next } = stripGeneratedMarker(content);
    if (changed && !context.dryRun) {
      await writeFile(file, next, "utf-8");
    }
    if (changed) {
      filesChanged++;
      const rel = file
        .replace(context.workspaceRoot + "\\", "")
        .replace(context.workspaceRoot + "/", "");
      changedFiles.push(rel);
    }
  }

  return {
    data: {
      command: "dist.generated-marker.strip",
      status: "pass",
      filesScanned: files.length,
      filesChanged,
      changedFiles: changedFiles.length > 0 ? changedFiles : undefined,
      warnings: warnings.length > 0 ? warnings : undefined,
    },
    exitCode: 0,
    summary: `dist.generated-marker.strip: scanned ${files.length}, changed ${filesChanged}`,
  };
}

export async function runDistGeneratedMarkerValidate(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const app = context.site?.name ?? (input.flags.site as string | undefined);
  if (!app) {
    return failResult("dist.generated-marker.validate", ["DIST-GENMARK-02: App not specified."]);
  }

  const distClient = join(
    context.site?.directory ?? join(context.workspaceRoot, "apps", app),
    "dist",
    "client",
  );
  try {
    await access(distClient);
  } catch {
    return passResult(
      "dist.generated-marker.validate",
      "dist.generated-marker.validate: skipped — no dist/client (run build first)",
    );
  }

  const files = await walkTextFiles(distClient);
  const violations: Array<{ file: string; rule: string; message: string }> = [];

  for (const file of files) {
    let content: string;
    try {
      content = await readFile(file, "utf-8");
    } catch {
      continue;
    }

    if (hasGeneratedMarker(content)) {
      const rel = file
        .replace(context.workspaceRoot + "\\", "")
        .replace(context.workspaceRoot + "/", "");
      violations.push({
        file: rel,
        rule: "DIST-GENMARK-01",
        message:
          "Distribution artifact still contains the generated ownership marker. Run dist.generated-marker.strip after post-build generators.",
      });
    }
  }

  if (violations.length > 0) {
    return {
      data: {
        command: "dist.generated-marker.validate",
        status: "fail",
        violations,
      },
      exitCode: 1,
      summary: `dist.generated-marker.validate: ${violations.length} violation(s)`,
    };
  }

  return {
    data: {
      command: "dist.generated-marker.validate",
      status: "pass",
      filesScanned: files.length,
    },
    exitCode: 0,
    summary: `dist.generated-marker.validate: scanned ${files.length}, no markers found`,
  };
}
