/*
<MODULE_CONTRACT>
<purpose>RFC-0761: Workspace-scoped env-and-deploy contract commands.
env.contract.validate — checks .env.example presence, comments, # How to obtain: instructions, README reference,
and empty values across all env-consuming systems/*, services/*, and root.
env.local.check — checks/creates .env from .env.example when missing.
deploy.scripts.validate — validates deploy scripts in systems and services package.json files.</purpose>
<non-goals>
  <item>Do not auto-generate .env.example for services — each service is unique and hand-authored.</item>
  <item>Do not read or write real secret values — .env holds operator-filled values only.</item>
  <item>Do not check packages — packages consume env via adapters, not direct process.env reads.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0346: initial implementation — four workspace-scoped env-and-deploy contract commands.</item>
  <item>RFC-0388: extend parseEnvExample with hasHowToObtain, add ENV-CONTRACT-05 rule, add root scope.</item>
  <item>RFC-0388: add ENV-CONTRACT-06 rule — no commented-out variables, blank line between variable blocks.</item>
  <item>RFC-0761: remove env.main.check and env.alt.check commands; update deploy.scripts.validate to check --secrets-file .env.</item>
</CHANGE_SUMMARY>
*/

import { join } from "node:path";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
  Diagnostic,
  CheckResult,
} from "@warpgogol/werkstatt/kernel";
import { discoverSiteWorkspaces } from "@warpgogol/werkstatt/kernel";
import { diagnosticsResult, passResult } from "../result-helpers.ts";

const ENV_EXAMPLE = ".env.example";
const ENV_LOCAL = ".env";
const README = "README.md";

// ─── Helpers ──────────────────────────────────────────────────────────────

/** List all site workspace names (Sternsystemen + transitional apps/*). */
async function listApps(
  context: KernelRuntimeContext,
): Promise<Array<{ name: string; directory: string }>> {
  const sites = await discoverSiteWorkspaces(context.workspaceRoot);
  return sites.map((s) => ({ name: s.name, directory: s.directory }));
}

/** List all service directory names under services/. */
async function listServices(context: KernelRuntimeContext): Promise<string[]> {
  const globs = await context.io.glob("services/*/package.json", {
    cwd: context.workspaceRoot,
  });
  return globs.map((g) =>
    g
      .replace(/\\/g, "/")
      .replace(/^services\//, "")
      .replace(/\/package\.json$/, ""),
  );
}

/** Detect whether a services project reads environment variables by scanning its src tree. */
async function serviceConsumesEnv(
  context: KernelRuntimeContext,
  serviceName: string,
): Promise<boolean> {
  const sources = await context.io.glob(`services/${serviceName}/src/**/*.ts`, {
    cwd: context.workspaceRoot,
  });
  for (const source of sources) {
    const text = await context.io.readFile(join(context.workspaceRoot, source));
    // Check for process.env. access or wrangler Env interface bindings
    if (/\bprocess\.env\b/.test(text)) return true;
    // Cloudflare Worker env bindings: interface Env { KEY: string }
    if (/interface\s+Env\s*\{[^}]*\b[A-Z][A-Z0-9_]*\b\s*:/.test(text)) return true;
    // getEnv helper pattern used by cf-analytics-poller and fleet-probe-runner
    if (/\bgetEnv\s*\(/.test(text)) return true;
  }
  return false;
}

/** Read a file if it exists, return null otherwise. */
async function readIfExists(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf-8");
  } catch {
    return null;
  }
}

/** Parse .env.example lines into { key, lineIndex, hasComment, hasHowToObtain } entries. */
interface EnvExampleVariable {
  key: string;
  lineIndex: number;
  hasComment: boolean;
  hasHowToObtain: boolean;
  hasValue: boolean;
  hasLeadingBlankLine: boolean;
  commentBlockStartLine: number;
}

interface CommentedOutVariable {
  key: string;
  lineIndex: number;
}

/** Parse .env.example lines into { key, lineIndex, hasComment, hasHowToObtain } entries. Exported for testing. */
export function parseEnvExample(raw: string): EnvExampleVariable[] {
  const lines = raw.split(/\r?\n/);
  const vars: EnvExampleVariable[] = [];
  let lastCommentLine = -2;
  let commentBlockStartLine = -1;
  let commentBlockHasHowToObtain = false;
  let lastVarLine = -1;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed) {
      lastCommentLine = -2;
      commentBlockStartLine = -1;
      commentBlockHasHowToObtain = false;
      continue;
    }
    if (trimmed.startsWith("#")) {
      if (lastCommentLine < 0 || lastCommentLine !== i - 1) {
        commentBlockStartLine = i;
      }
      lastCommentLine = i;
      if (/^#\s*How to obtain:/i.test(trimmed)) {
        commentBlockHasHowToObtain = true;
      }
      continue;
    }
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!/^[A-Z][A-Z0-9_]*$/.test(key)) continue;
    // Check for blank line before the comment block (or before the variable if no comment)
    const checkLine = commentBlockStartLine >= 0 ? commentBlockStartLine : i;
    const hasLeadingBlankLine =
      lastVarLine >= 0 && checkLine > 0 && lines[checkLine - 1].trim() === "";
    vars.push({
      key,
      lineIndex: i,
      hasComment: lastCommentLine >= 0,
      hasHowToObtain: commentBlockHasHowToObtain,
      hasValue: value.length > 0,
      hasLeadingBlankLine,
      commentBlockStartLine,
    });
    lastVarLine = i;
    lastCommentLine = -2;
    commentBlockStartLine = -1;
    commentBlockHasHowToObtain = false;
  }
  return vars;
}

/** Detect commented-out variable assignments like `# FOO=` or `# FOO=bar`. */
function findCommentedOutVariables(raw: string): CommentedOutVariable[] {
  const lines = raw.split(/\r?\n/);
  const result: CommentedOutVariable[] = [];
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    const match = /^#\s*([A-Z][A-Z0-9_]*)\s*=/.exec(trimmed);
    if (match) {
      result.push({ key: match[1], lineIndex: i });
    }
  }
  return result;
}

/** Check whether README.md contains an env-variable table or inline variable listing. */
function readmeDuplicatesEnv(raw: string): { duplicated: boolean; line?: number } {
  const lines = raw.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Markdown table header row with "Variable" or "Env" column
    if (/^\s*\|?\s*(Variable|Env|Secret|Environment\s+variable)/i.test(line)) {
      // Check if next line is a table separator (|---|---|)
      if (i + 1 < lines.length && /^\s*\|[\s-:]+\|/.test(lines[i + 1])) {
        return { duplicated: true, line: i + 1 };
      }
    }
    // "Environment variables:" heading followed by a table or list
    if (
      /^#+\s*Environment\s+variables?\s*$/i.test(line) ||
      /^Environment\s+variables?:\s*$/i.test(line)
    ) {
      // Check if the following non-empty line is a table or list of variables (not a .env.example reference)
      for (let j = i + 1; j < lines.length; j++) {
        const next = lines[j].trim();
        if (!next) continue;
        // If it's a reference to .env.example, it's fine
        if (/\.env\.example/i.test(next)) break;
        // If it's a table row or a bullet list with env vars, it's duplication
        if (/^\|/.test(next) || /^[-*]\s+`?[A-Z][A-Z0-9_]*`?/.test(next)) {
          return { duplicated: true, line: i + 1 };
        }
        // "Secrets (set via ...)" pattern
        if (/^#+\s*Secrets?\s*$/i.test(next) || /^Secrets?\s*\(/i.test(next)) {
          return { duplicated: true, line: i + 1 };
        }
        break;
      }
    }
    // "Secrets (set via `wrangler secret put`)" heading pattern
    if (/^#+\s*Secrets?\s*\(.*\)\s*$/i.test(line) || /^Secrets?\s*\(.*\)\s*$/i.test(line)) {
      return { duplicated: true, line: i + 1 };
    }
  }
  return { duplicated: false };
}

/** Create a .env file from .env.example (preserving comments, keeping values empty). */
async function createEnvFromExample(examplePath: string, targetPath: string): Promise<void> {
  const example = await readFile(examplePath, "utf-8");
  // The .env file is an exact copy of .env.example — comments and empty KEY= lines.
  // The operator fills in the values afterward.
  await writeFile(targetPath, example, "utf-8");
}

/** ENV-CONTRACT-06: push diagnostics for commented-out variables and missing blank lines between blocks. Exported for testing. */
export function checkEnvContract06(
  raw: string,
  fileLabel: string,
  diagnostics: Diagnostic[],
): void {
  const commentedOut = findCommentedOutVariables(raw);
  for (const c of commentedOut) {
    diagnostics.push({
      ruleId: "ENV-CONTRACT-06",
      severity: "error",
      file: fileLabel,
      line: c.lineIndex + 1,
      message: `Variable "${c.key}" is commented out. All variables in .env.example must be uncommented — use a comment line above for documentation, not a # prefix on the KEY= line (RFC-0388 Rule 3).`,
      fixHint: `Uncomment the line: remove the "# " prefix from ${c.key}=.`,
    });
  }

  const vars = parseEnvExample(raw);
  for (let i = 0; i < vars.length; i++) {
    const v = vars[i];
    if (i > 0 && !v.hasLeadingBlankLine) {
      diagnostics.push({
        ruleId: "ENV-CONTRACT-06",
        severity: "error",
        file: fileLabel,
        line: v.lineIndex + 1,
        message: `Variable "${v.key}" is missing a blank line before its comment block. Every variable block (except the first) must be preceded by an empty line (RFC-0388 Rule 3).`,
        fixHint: `Add an empty line above the comment block for ${v.key}=.`,
      });
    }
  }
}

// ─── env.contract.validate ────────────────────────────────────────────────

export async function runEnvContractValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const diagnostics: Diagnostic[] = [];
  let _projectsChecked = 0;

  // ── site workspaces (Sternsystemen + transitional apps/*) ──
  const apps = await listApps(context);
  for (const site of apps) {
    const appDir = site.directory;
    _projectsChecked++;

    const examplePath = join(appDir, ENV_EXAMPLE);
    const exampleRaw = await readIfExists(examplePath);

    if (!exampleRaw) {
      diagnostics.push({
        ruleId: "ENV-CONTRACT-01",
        severity: "error",
        file: `${site.name}/${ENV_EXAMPLE}`,
        message: `${site.name} has no .env.example. All sites must ship a .env.example (RFC-0388 Rule 1).`,
        fixHint: "Run: pnpm exec werkstatt run env.example.generate --site " + site.name,
      });
      continue;
    }

    // Check every variable is commented, has # How to obtain:, and has empty value
    const vars = parseEnvExample(exampleRaw);
    for (const v of vars) {
      if (!v.hasComment) {
        diagnostics.push({
          ruleId: "ENV-CONTRACT-02",
          severity: "error",
          file: `${site.name}/${ENV_EXAMPLE}`,
          line: v.lineIndex + 1,
          message: `Variable "${v.key}" has no preceding comment. Every variable in .env.example must be documented (RFC-0388 Rule 3).`,
          fixHint: `Add a "# comment" line above ${v.key}= explaining its purpose.`,
        });
      }
      if (!v.hasHowToObtain) {
        diagnostics.push({
          ruleId: "ENV-CONTRACT-05",
          severity: "error",
          file: `${site.name}/${ENV_EXAMPLE}`,
          line: v.lineIndex + 1,
          message: `Variable "${v.key}" is missing a "# How to obtain:" instruction line. Every variable in .env.example must include concrete instructions for acquiring its value (RFC-0388 Rule 3).`,
          fixHint: `Add a "# How to obtain: <instructions>" line above ${v.key}=.`,
        });
      }
      if (v.hasValue && v.key !== "PUBLIC_IMAGE_PROVIDER") {
        diagnostics.push({
          ruleId: "ENV-CONTRACT-04",
          severity: "error",
          file: `${site.name}/${ENV_EXAMPLE}`,
          line: v.lineIndex + 1,
          message: `Variable "${v.key}" has a non-empty value in .env.example. Values must stay empty to prevent secret leaks (RFC-0388 Rule 3).`,
          fixHint: `Move the value to .env and clear it in .env.example.`,
        });
      }
    }

    // ENV-CONTRACT-06: no commented-out variables, blank line between variable blocks
    checkEnvContract06(exampleRaw, `${site.name}/${ENV_EXAMPLE}`, diagnostics);

    // Check README does not duplicate env-variable tables
    const readmePath = join(appDir, README);
    const readmeRaw = await readIfExists(readmePath);
    if (readmeRaw) {
      const dup = readmeDuplicatesEnv(readmeRaw);
      if (dup.duplicated) {
        diagnostics.push({
          ruleId: "ENV-CONTRACT-03",
          severity: "error",
          file: `${site.name}/${README}`,
          line: dup.line,
          message: `README contains an env-variable table or listing. Replace with a reference to .env.example (RFC-0388 Rule 2).`,
          fixHint: `Replace the table with: See [.env.example](./.env.example) for all required and optional environment variables.`,
        });
      }
    }
  }

  // ── services/* ──
  const services = await listServices(context);
  for (const serviceName of services) {
    const serviceDir = join(context.workspaceRoot, "services", serviceName);
    const consumesEnv = await serviceConsumesEnv(context, serviceName);

    if (!consumesEnv) continue; // exempt — no env vars needed

    _projectsChecked++;

    const examplePath = join(serviceDir, ENV_EXAMPLE);
    const exampleRaw = await readIfExists(examplePath);

    if (!exampleRaw) {
      diagnostics.push({
        ruleId: "ENV-CONTRACT-01",
        severity: "error",
        file: `services/${serviceName}/${ENV_EXAMPLE}`,
        message: `services/${serviceName} reads environment variables but has no .env.example (RFC-0388 Rule 1).`,
        fixHint: `Create services/${serviceName}/.env.example with every required variable commented and empty.`,
      });
      continue;
    }

    // Check every variable is commented, has # How to obtain:, and has empty value
    const vars = parseEnvExample(exampleRaw);
    for (const v of vars) {
      if (!v.hasComment) {
        diagnostics.push({
          ruleId: "ENV-CONTRACT-02",
          severity: "error",
          file: `services/${serviceName}/${ENV_EXAMPLE}`,
          line: v.lineIndex + 1,
          message: `Variable "${v.key}" has no preceding comment. Every variable in .env.example must be documented (RFC-0388 Rule 3).`,
          fixHint: `Add a "# comment" line above ${v.key}= explaining its purpose.`,
        });
      }
      if (!v.hasHowToObtain) {
        diagnostics.push({
          ruleId: "ENV-CONTRACT-05",
          severity: "error",
          file: `services/${serviceName}/${ENV_EXAMPLE}`,
          line: v.lineIndex + 1,
          message: `Variable "${v.key}" is missing a "# How to obtain:" instruction line. Every variable in .env.example must include concrete instructions for acquiring its value (RFC-0388 Rule 3).`,
          fixHint: `Add a "# How to obtain: <instructions>" line above ${v.key}=.`,
        });
      }
      if (v.hasValue) {
        diagnostics.push({
          ruleId: "ENV-CONTRACT-04",
          severity: "error",
          file: `services/${serviceName}/${ENV_EXAMPLE}`,
          line: v.lineIndex + 1,
          message: `Variable "${v.key}" has a non-empty value in .env.example. Values must stay empty to prevent secret leaks (RFC-0388 Rule 3).`,
          fixHint: `Move the value to .env and clear it in .env.example.`,
        });
      }
    }

    // ENV-CONTRACT-06: no commented-out variables, blank line between variable blocks
    checkEnvContract06(exampleRaw, `services/${serviceName}/${ENV_EXAMPLE}`, diagnostics);

    // Check README does not duplicate env-variable tables
    const readmePath = join(serviceDir, README);
    const readmeRaw = await readIfExists(readmePath);
    if (readmeRaw) {
      const dup = readmeDuplicatesEnv(readmeRaw);
      if (dup.duplicated) {
        diagnostics.push({
          ruleId: "ENV-CONTRACT-03",
          severity: "error",
          file: `services/${serviceName}/${README}`,
          line: dup.line,
          message: `README contains an env-variable table or listing. Replace with a reference to .env.example (RFC-0388 Rule 2).`,
          fixHint: `Replace the table with: See [.env.example](./.env.example) for all required and optional environment variables.`,
        });
      }
    }
  }

  // ── root ──
  const rootExamplePath = join(context.workspaceRoot, ENV_EXAMPLE);
  const rootExampleRaw = await readIfExists(rootExamplePath);
  if (rootExampleRaw) {
    _projectsChecked++;
    const vars = parseEnvExample(rootExampleRaw);
    for (const v of vars) {
      if (!v.hasComment) {
        diagnostics.push({
          ruleId: "ENV-CONTRACT-02",
          severity: "error",
          file: ENV_EXAMPLE,
          line: v.lineIndex + 1,
          message: `Variable "${v.key}" has no preceding comment. Every variable in root .env.example must be documented (RFC-0388 Rule 3).`,
          fixHint: `Add a "# comment" line above ${v.key}= explaining its purpose.`,
        });
      }
      if (!v.hasHowToObtain) {
        diagnostics.push({
          ruleId: "ENV-CONTRACT-05",
          severity: "error",
          file: ENV_EXAMPLE,
          line: v.lineIndex + 1,
          message: `Variable "${v.key}" is missing a "# How to obtain:" instruction line. Every variable in root .env.example must include concrete instructions for acquiring its value (RFC-0388 Rule 3).`,
          fixHint: `Add a "# How to obtain: <instructions>" line above ${v.key}=.`,
        });
      }
      if (v.hasValue) {
        diagnostics.push({
          ruleId: "ENV-CONTRACT-04",
          severity: "error",
          file: ENV_EXAMPLE,
          line: v.lineIndex + 1,
          message: `Variable "${v.key}" has a non-empty value in root .env.example. Values must stay empty to prevent secret leaks (RFC-0388 Rule 3).`,
          fixHint: `Move the value to .env and clear it in .env.example.`,
        });
      }
    }

    // ENV-CONTRACT-06: no commented-out variables, blank line between variable blocks
    checkEnvContract06(rootExampleRaw, ENV_EXAMPLE, diagnostics);
  }

  return diagnosticsResult("env.contract.validate", diagnostics);
}

// ─── env.local.check ──────────────────────────────────────────────────────

export async function runEnvLocalCheck(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const results: Array<{ project: string; action: string; path: string }> = [];
  const appNames = await listApps(context);
  const serviceNames = await listServices(context);

  for (const site of appNames) {
    const baseDir = site.directory;
    const projectRel = site.name;

    const examplePath = join(baseDir, ENV_EXAMPLE);
    if (!existsSync(examplePath)) {
      results.push({
        project: projectRel,
        action: "not-required",
        path: `${projectRel}/${ENV_LOCAL}`,
      });
      continue;
    }

    const envPath = join(baseDir, ENV_LOCAL);
    if (existsSync(envPath)) {
      results.push({ project: projectRel, action: "present", path: `${projectRel}/${ENV_LOCAL}` });
      continue;
    }

    if (!context.dryRun) {
      await mkdir(baseDir, { recursive: true });
      await createEnvFromExample(examplePath, envPath);
    }
    results.push({ project: projectRel, action: "created", path: `${projectRel}/${ENV_LOCAL}` });
  }

  for (const serviceName of serviceNames) {
    const baseDir = join(context.workspaceRoot, "services", serviceName);
    const projectRel = `services/${serviceName}`;

    const examplePath = join(baseDir, ENV_EXAMPLE);
    if (!existsSync(examplePath)) {
      results.push({
        project: projectRel,
        action: "not-required",
        path: `${projectRel}/${ENV_LOCAL}`,
      });
      continue;
    }

    const envPath = join(baseDir, ENV_LOCAL);
    if (existsSync(envPath)) {
      results.push({ project: projectRel, action: "present", path: `${projectRel}/${ENV_LOCAL}` });
      continue;
    }

    if (!context.dryRun) {
      await mkdir(baseDir, { recursive: true });
      await createEnvFromExample(examplePath, envPath);
    }
    results.push({ project: projectRel, action: "created", path: `${projectRel}/${ENV_LOCAL}` });
  }

  return passResult(
    "env.local.check",
    `env.local.check: ${results.filter((r) => r.action === "present").length} present, ${results.filter((r) => r.action === "created").length} created, ${results.filter((r) => r.action === "not-required").length} not-required`,
  );
}

// ─── deploy.scripts.validate ──────────────────────────────────────────────

const REQUIRED_DEPLOY_SCRIPTS = [
  "build:main",
  "build:alt",
  "deploy:main",
  "deploy:alt",
  "build:deploy:main",
  "build:deploy:alt",
] as const;

export async function runDeployScriptsValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const diagnostics: Diagnostic[] = [];
  const apps = await listApps(context);

  for (const site of apps) {
    const pkgPath = join(site.directory, "package.json");
    let pkg: { scripts?: Record<string, string> };
    try {
      pkg = JSON.parse(await readFile(pkgPath, "utf-8"));
    } catch {
      diagnostics.push({
        ruleId: "DEPLOY-SCRIPTS-01",
        severity: "error",
        file: `${site.name}/package.json`,
        message: `Cannot read package.json for ${site.name}.`,
        fixHint: `Ensure ${site.name}/package.json exists and is valid JSON.`,
      });
      continue;
    }

    for (const script of REQUIRED_DEPLOY_SCRIPTS) {
      if (!pkg.scripts?.[script]) {
        diagnostics.push({
          ruleId: "DEPLOY-SCRIPTS-02",
          severity: "error",
          file: `${site.name}/package.json`,
          message: `Missing required deploy script "${script}" in ${site.name}/package.json (RFC-0388 Rule 6).`,
          fixHint: `Add "${script}" to the scripts section. See packages/os/site-kernel-onboarding/src/templates/package.template.json for the canonical shape.`,
        });
      }
    }

    // Validate deploy:main uses --secrets-file .env
    if (pkg.scripts?.["deploy:main"]) {
      const deployMain = pkg.scripts["deploy:main"];
      if (!deployMain.includes("--secrets-file .env")) {
        diagnostics.push({
          ruleId: "DEPLOY-SCRIPTS-03",
          severity: "error",
          file: `${site.name}/package.json`,
          message: `deploy:main script must use "--secrets-file .env" (RFC-0761 Rule 5).`,
          fixHint: `Set deploy:main to: site-kernel run deploy.preflight --site ${site.name} && wrangler deploy --name ${site.name} --secrets-file .env`,
        });
      }
    }

    // Validate deploy:alt uses --secrets-file .env
    if (pkg.scripts?.["deploy:alt"]) {
      const deployAlt = pkg.scripts["deploy:alt"];
      if (!deployAlt.includes("--secrets-file .env")) {
        diagnostics.push({
          ruleId: "DEPLOY-SCRIPTS-03",
          severity: "error",
          file: `${site.name}/package.json`,
          message: `deploy:alt script must use "--secrets-file .env" (RFC-0761 Rule 5).`,
          fixHint: `Set deploy:alt to: site-kernel run deploy.preflight --site ${site.name} && wrangler deploy --name alt-${site.name} --secrets-file .env`,
        });
      }
    }
  }

  // ── services/* deploy scripts ──
  const services = await listServices(context);
  for (const serviceName of services) {
    const pkgPath = join(context.workspaceRoot, "services", serviceName, "package.json");
    let pkg: { scripts?: Record<string, string> };
    try {
      pkg = JSON.parse(await readFile(pkgPath, "utf-8"));
    } catch {
      continue; // services without package.json are exempt
    }

    if (!pkg.scripts?.["deploy"]) continue; // services without deploy script are exempt

    const deployScript = pkg.scripts["deploy"];
    if (!deployScript.includes("--secrets-file .env")) {
      diagnostics.push({
        ruleId: "DEPLOY-SCRIPTS-03",
        severity: "error",
        file: `services/${serviceName}/package.json`,
        message: `deploy script must use "--secrets-file .env" (RFC-0388 Rule 6).`,
        fixHint: `Set deploy to: site-kernel run deploy.preflight --service ${serviceName} && wrangler deploy --secrets-file .env`,
      });
    }
  }

  return diagnosticsResult("deploy.scripts.validate", diagnostics);
}
