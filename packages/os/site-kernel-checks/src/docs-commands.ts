/*
<MODULE_CONTRACT>
<purpose>RFC-0222: generate and validate docs/COMMANDS.md from the single command manifest (RFC-0266).</purpose>
<non-goals>
  <item>Do not generate freeform architecture prose outside the command index.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0222: add generated command documentation and drift validation.</item>
  <item>RFC-0266: consume buildCommandManifest instead of independently re-walking the command registry.</item>
</CHANGE_SUMMARY>
*/

import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@gogol/site-kernel";
import { buildCommandManifest, buildGeneratedHeader } from "@gogol/site-kernel";

function escapeCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

async function renderCommandsMarkdown(workspaceRoot: string): Promise<string> {
  const manifest = await buildCommandManifest(workspaceRoot);
  const commands = manifest.commands;
  const grouped = new Map<string, (typeof commands)[number][]>();
  for (const command of commands) {
    const key = [
      command.name,
      command.scope,
      command.mutatesState ? "mutates" : "read",
      command.requiresNetwork ? "network" : "local",
      command.description,
    ].join("\u0000");
    grouped.set(key, [...(grouped.get(key) ?? []), command]);
  }

  const rows = [...grouped.values()].map((entries) => {
    const command = entries[0]!;
    const providers = [...new Set(entries.map((entry) => entry.provider))].sort().join(", ");
    const mutates = command.mutatesState ? "yes" : "no";
    const network = command.requiresNetwork ? "yes" : "no";
    return `| \`${escapeCell(command.name)}\` | ${providers} | ${command.scope} | ${mutates} | ${network} | ${escapeCell(command.description)} |`;
  });

  const header = buildGeneratedHeader({
    ownerCommand: "docs.commands.generate",
    filePath: "docs/COMMANDS.md",
  });
  return [
    header.trimEnd(),
    "# Site OS Commands",
    "",
    "This file is generated from docs/command-manifest.generated.yaml (RFC-0266), the single machine-readable",
    "command manifest. Regenerate both with `pnpm exec site-kernel run command.manifest.generate` then",
    "`pnpm exec site-kernel run docs.commands.generate`.",
    "",
    `Generated command rows: ${rows.length}. Raw manifest entries: ${commands.length}.`,
    "",
    "| Command | Provider | Scope | Mutates | Network | Description |",
    "| --- | --- | --- | --- | --- |",
    ...rows,
    "",
  ].join("\n");
}

export async function runDocsCommandsGenerate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<{ file: string; commandCount: number }>> {
  const content = await renderCommandsMarkdown(context.workspaceRoot);
  const target = join(context.workspaceRoot, "docs", "COMMANDS.md");
  await writeFile(target, content, "utf8");
  const commandCount = content.split("\n").filter((line) => line.startsWith("| `")).length;
  return {
    data: { file: "docs/COMMANDS.md", commandCount },
    exitCode: 0,
    summary: `docs.commands.generate: wrote docs/COMMANDS.md (${commandCount} command row(s))`,
  };
}

export async function runDocsCommandsValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<
  KernelCommandResult<{ command: string; status: "pass" | "fail"; violations: string[] }>
> {
  const target = join(context.workspaceRoot, "docs", "COMMANDS.md");
  const expected = await renderCommandsMarkdown(context.workspaceRoot);
  let actual = "";
  try {
    actual = await readFile(target, "utf8");
  } catch {
    return {
      data: {
        command: "docs.commands.validate",
        status: "fail",
        violations: ["docs/COMMANDS.md is missing; run docs.commands.generate."],
      },
      exitCode: 1,
      summary: "docs.commands.validate: docs/COMMANDS.md is missing",
    };
  }

  if (actual !== expected) {
    return {
      data: {
        command: "docs.commands.validate",
        status: "fail",
        violations: [
          "docs/COMMANDS.md drifted from the live command registry; run docs.commands.generate.",
        ],
      },
      exitCode: 1,
      summary: "docs.commands.validate: docs/COMMANDS.md drifted",
    };
  }

  return {
    data: { command: "docs.commands.validate", status: "pass", violations: [] },
    exitCode: 0,
    summary: "docs.commands.validate: OK",
  };
}
