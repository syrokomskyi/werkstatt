/*
<MODULE_CONTRACT>
<purpose>Implements RFC-0532 onboarding.synthesize — deterministic input validation
and hashing for per-system onboarding directories (onboarding/<system-id>/.input/).</purpose>
<non-goals>
  <item>Does not perform AI synthesis — that is the responsibility of the onboard skill.</item>
  <item>Does not modify onboarding/<system-id>/.input/**.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0532: Extracted hashing and classification logic from phase-contract.ts, adapted for per-system path layout.</item>
  <item>RFC-0532 review fix: Replace createHash with byteHash from @warpgogol/fingerprint (DNA-53 compliance).</item>
</CHANGE_SUMMARY>
*/

import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { byteHash } from "@warpgogol/fingerprint";
import { collectFiles as collectFilesShared, fileExists as pathExists } from "@warpgogol/share/fs";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/site-kernel";
import { BriefFrontmatter, parseBriefFrontmatter } from "./brief.ts";

export interface OnboardingSynthesizeManifest {
  version: 1;
  generatedAt: string;
  system: string;
  inputRoot: string;
  inputHash: string;
  files: Array<{
    path: string;
    sha256: string;
    sizeBytes: number;
    kind: "brief" | "profile" | "research" | "audit" | "visual" | "strategy" | "other";
    required: boolean;
  }>;
}

interface OnboardingSynthesizeData {
  command: "onboarding.synthesize";
  system: string;
  status: "pass" | "fail" | "noop";
  manifestPath?: string;
  inputHash?: string;
  fileCount?: number;
  diagnostics: string[];
}

function readFlag(input: KernelCommandInput, name: string): string | undefined {
  const direct = input.flags[name];
  if (typeof direct === "string") return direct;
  const prefix = `--${name}=`;
  const arg = input.args.find((entry) => entry.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : undefined;
}

function hashString(source: string): string {
  return byteHash(source);
}

function classifyInputFile(path: string): OnboardingSynthesizeManifest["files"][number]["kind"] {
  const normalized = path.replace(/\\/g, "/").toLowerCase();
  if (normalized.endsWith("/00-brief.md")) return "brief";
  if (/profile|persona|company/.test(normalized)) return "profile";
  if (/audit|qa|lighthouse/.test(normalized)) return "audit";
  if (/visual|brand|design|logo|screenshot|\.png$|\.jpg$|\.jpeg$|\.webp$|\.svg$/.test(normalized)) {
    return "visual";
  }
  if (/strategy|plan|positioning|messaging/.test(normalized)) return "strategy";
  if (/research|briefing|market|competitor|seo/.test(normalized)) return "research";
  return "other";
}

async function buildSystemInputManifest(
  workspaceRoot: string,
  system: string,
): Promise<OnboardingSynthesizeManifest> {
  const inputRoot = join(workspaceRoot, "onboarding", system, ".input");
  const files = (await collectFilesShared(inputRoot, { ignore: () => false })).sort((a, b) =>
    a.localeCompare(b),
  );
  const briefRel = `onboarding/${system}/.input/00-brief.md`;
  const normalizedFiles = await Promise.all(
    files.map(async (filePath) => {
      const raw = await readFile(filePath);
      const info = await stat(filePath);
      const rel = relative(workspaceRoot, filePath).replace(/\\/g, "/");
      return {
        path: rel,
        sha256: byteHash(raw),
        sizeBytes: info.size,
        kind: classifyInputFile(rel),
        required: rel === briefRel,
      };
    }),
  );
  const inputHash = hashString(
    JSON.stringify(
      normalizedFiles.map((file) => ({
        path: file.path,
        sha256: file.sha256,
        sizeBytes: file.sizeBytes,
        kind: file.kind,
        required: file.required,
      })),
    ),
  );
  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    system,
    inputRoot: `onboarding/${system}/.input`,
    inputHash,
    files: normalizedFiles,
  };
}

export async function runOnboardingSynthesize(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<OnboardingSynthesizeData>> {
  const system = readFlag(input, "system");
  if (!system) {
    throw new Error("[onboarding.synthesize] requires --system <system-id>");
  }

  const inputRoot = join(context.workspaceRoot, "onboarding", system, ".input");
  const briefPath = join(inputRoot, "00-brief.md");

  if (!(await pathExists(inputRoot))) {
    return {
      data: {
        command: "onboarding.synthesize",
        system,
        status: "noop",
        diagnostics: [
          `No onboarding input directory found at onboarding/${system}/.input/; skipping synthesis.`,
        ],
      },
      exitCode: 0,
      summary: `onboarding.synthesize: noop (no onboarding/${system}/.input/)`,
    };
  }

  const diagnostics: string[] = [];

  if (!(await pathExists(briefPath))) {
    diagnostics.push(`Required file onboarding/${system}/.input/00-brief.md is missing.`);
  } else {
    try {
      const raw = await readFile(briefPath, "utf8");
      parseBriefFrontmatter(raw);
    } catch (error) {
      diagnostics.push(
        `onboarding/${system}/.input/00-brief.md validation failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  const manifest = await buildSystemInputManifest(context.workspaceRoot, system);
  const manifestPath = join(
    context.workspaceRoot,
    "onboarding",
    system,
    ".output",
    "input-manifest.json",
  );

  await mkdir(join(context.workspaceRoot, "onboarding", system, ".output"), {
    recursive: true,
  });
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  const status: OnboardingSynthesizeData["status"] = diagnostics.length > 0 ? "fail" : "pass";

  return {
    data: {
      command: "onboarding.synthesize",
      system,
      status,
      manifestPath,
      inputHash: manifest.inputHash,
      fileCount: manifest.files.length,
      diagnostics,
    },
    exitCode: status === "fail" ? 1 : 0,
    summary:
      status === "fail"
        ? `onboarding.synthesize: ${diagnostics.length} violation(s)`
        : `onboarding.synthesize: OK (${manifest.files.length} input file(s) for ${system})`,
  };
}
