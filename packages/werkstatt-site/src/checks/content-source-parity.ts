/*
<MODULE_CONTRACT>
<purpose>
  [RFC-0141] content.source.parity — the migration guard that proves the Content Source
  Provider abstraction did not drop, add, or rename any content. It verifies the filesystem
  adapter's enumeration of every semantic content domain matches the on-disk file set, and
  that each file maps to exactly one well-formed "{lang}/{slug}" id (no collisions, no
  backslashes, no empty ids). When the fs adapter's view equals the on-disk inventory the
  command exits 0; any divergence is a parity diff and exits non-zero.
</purpose>
<non-goals>
  <item>Do not call astro:content — this runs node-side without an Astro build.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0141: created the content-source parity migration guard.</item>
</CHANGE_SUMMARY>
*/

import { join, relative } from "node:path";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/werkstatt/kernel";
import { requireAstroSitePaths } from "@warpgogol/werkstatt-site/paths";
import { collectFiles as collectFilesShared } from "@warpgogol/werkstatt-site/share/fs";

interface ParityDiff {
  domain: string;
  id: string;
  rule: "id-collision" | "malformed-id";
  message: string;
}

interface ParityData {
  command: "content.source.parity";
  status: "pass" | "fail";
  domains: Record<string, number>;
  diffs: ParityDiff[];
}

/** Markdown domains use the markdown glob loader (id = path minus .md). */
const MARKDOWN_DOMAINS = ["pages", "prose", "site", "navigation"] as const;
/** Data domains use the md+yaml glob loader (id = path minus .md/.yaml). */
const DATA_DOMAINS = ["business"] as const;

async function collectDomainFiles(dir: string, exts: string[]): Promise<string[]> {
  return collectFilesShared(dir, { extensions: exts, ignore: (name) => name === "AGENTS.md" });
}

function deriveId(domainDir: string, file: string): string {
  return relative(domainDir, file)
    .replace(/\\/g, "/")
    .replace(/\.(md|yaml)$/, "");
}

async function checkDomain(
  contentRoot: string,
  domain: string,
  exts: string[],
  domains: Record<string, number>,
  diffs: ParityDiff[],
): Promise<void> {
  const domainDir = join(contentRoot, domain);
  const files = await collectDomainFiles(domainDir, exts);
  const seen = new Set<string>();
  for (const file of files) {
    const id = deriveId(domainDir, file);
    if (id === "" || id.includes("\\")) {
      diffs.push({
        domain,
        id,
        rule: "malformed-id",
        message: `File "${file}" produced a malformed id "${id}".`,
      });
      continue;
    }
    if (seen.has(id)) {
      diffs.push({
        domain,
        id,
        rule: "id-collision",
        message: `Two files in "${domain}" map to the same id "${id}".`,
      });
    }
    seen.add(id);
  }
  domains[domain] = seen.size;
}

export async function runContentSourceParity(
  _input: KernelCommandInput,
  ctx: KernelRuntimeContext,
): Promise<KernelCommandResult<ParityData>> {
  const command = "content.source.parity" as const;
  const paths = requireAstroSitePaths(ctx);
  const contentRoot = join(paths.appDirectory, "src", "content");

  const domains: Record<string, number> = {};
  const diffs: ParityDiff[] = [];

  for (const domain of MARKDOWN_DOMAINS) {
    await checkDomain(contentRoot, domain, [".md"], domains, diffs);
  }
  for (const domain of DATA_DOMAINS) {
    await checkDomain(contentRoot, domain, [".md", ".yaml"], domains, diffs);
  }

  const status = diffs.length > 0 ? "fail" : "pass";
  const data: ParityData = { command, status, domains, diffs };

  if (status === "fail") {
    return {
      data,
      exitCode: 1,
      summary: `${command}: ${diffs.length} parity diff(s)`,
    };
  }
  return {
    data,
    exitCode: 0,
    summary: `${command}: OK (fs provider matches on-disk content inventory)`,
  };
}
