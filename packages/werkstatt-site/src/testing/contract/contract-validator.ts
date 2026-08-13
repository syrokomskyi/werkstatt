/*
<MODULE_CONTRACT>
<purpose>
  RFC-0827: contract.validate and contract.list command handlers.
  contract.validate checks that all registered site-service contract schemas are
  valid Zod, have both request and response schemas, and are referenced by both
  site-side and service-side code. contract.list returns the registry.
</purpose>
<non-goals>
  <item>Does not define contract schemas — those live in *.contract.ts files.</item>
  <item>Does not perform runtime validation — that is the handler's job.</item>
  <item>Does not parse AST — import checking uses regex scanning.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0827: initial contract validator and list handlers.</item>
</CHANGE_SUMMARY>
*/

import { readdir, readFile, stat } from "node:fs/promises";
import { join, extname } from "node:path";
import type {
  CheckResult,
  Diagnostic,
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/werkstatt/kernel";
import { diagnosticsResult } from "../../checks/result-helpers.ts";
import { CONTRACTS, type ContractDefinition } from "./index.ts";

export interface ContractListResult {
  command: "contract.list";
  contracts: Array<{
    id: string;
    name: string;
    direction: string;
    version: number;
    description: string;
  }>;
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function scanTypeScriptFiles(dir: string): Promise<string[]> {
  const results: string[] = [];
  if (!(await fileExists(dir))) return results;

  let entries: import("node:fs").Dirent[];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return results;
  }

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...(await scanTypeScriptFiles(fullPath)));
    } else if (entry.isFile() && (extname(entry.name) === ".ts" || extname(entry.name) === ".tsx")) {
      results.push(fullPath);
    }
  }
  return results;
}

async function findContractReferences(
  scanDirs: string[],
  contractId: string,
  workspaceRoot: string,
): Promise<string[]> {
  const references: string[] = [];
  const importPattern = new RegExp(
    `from\\s+["'][^"']*contract[^"']*["']|from\\s+["'][^"']*testing/contract[^"']*["']`,
  );
  const idPattern = new RegExp(`\\b${contractId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`);

  for (const dir of scanDirs) {
    const absDir = join(workspaceRoot, dir);
    const files = await scanTypeScriptFiles(absDir);
    for (const filePath of files) {
      if (filePath.includes("/testing/contract/")) continue;
      try {
        const content = await readFile(filePath, "utf8");
        if (importPattern.test(content) && idPattern.test(content)) {
          references.push(filePath.replace(workspaceRoot + "/", ""));
        }
      } catch {
        // skip unreadable files
      }
    }
  }
  return references;
}

function makeDiagnostic(
  ruleId: string,
  severity: Diagnostic["severity"],
  message: string,
  fixHint?: string,
): Diagnostic {
  return { ruleId, severity, message, fixHint };
}

export async function runContractValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const diagnostics: Diagnostic[] = [];
  const { workspaceRoot } = context;

  if (CONTRACTS.length === 0) {
    diagnostics.push(
      makeDiagnostic(
        "CONTRACT-00",
        "warning",
        "No contracts registered. Add contract schemas to packages/werkstatt-site/src/testing/contract/index.ts.",
      ),
    );
    return diagnosticsResult("contract.validate", diagnostics);
  }

  const siteScanDirs = ["packages/werkstatt-site/src/domain"];
  const serviceScanDirs: string[] = [];

  // Discover service source directories
  const servicesDir = join(workspaceRoot, "services");
  if (await fileExists(servicesDir)) {
    let serviceEntries: import("node:fs").Dirent[];
    try {
      serviceEntries = await readdir(servicesDir, { withFileTypes: true });
      for (const entry of serviceEntries) {
        if (entry.isDirectory()) {
          serviceScanDirs.push(`services/${entry.name}/src`);
        }
      }
    } catch {
      // services dir unreadable
    }
  }

  for (const contract of CONTRACTS) {
    // CONTRACT-01: schema is valid Zod
    try {
      contract.request.safeParse({});
      contract.response.safeParse({});
    } catch (err) {
      diagnostics.push(
        makeDiagnostic(
          "CONTRACT-01",
          "error",
          `Contract "${contract.id}" has an invalid Zod schema: ${(err as Error).message}`,
          `Fix the Zod schema definition in the contract file.`,
        ),
      );
      continue;
    }

    // CONTRACT-02: contract has both request and response schemas
    if (!contract.request || !contract.response) {
      diagnostics.push(
        makeDiagnostic(
          "CONTRACT-02",
          "error",
          `Contract "${contract.id}" is missing a ${!contract.request ? "request" : "response"} schema.`,
          `Add the missing schema to the contract definition.`,
        ),
      );
      continue;
    }

    // CONTRACT-03: site-side code references the contract
    const siteRefs = await findContractReferences(siteScanDirs, contract.id, workspaceRoot);
    if (siteRefs.length === 0) {
      diagnostics.push(
        makeDiagnostic(
          "CONTRACT-03",
          "warning",
          `Contract "${contract.id}" is not imported by any site-side code in packages/werkstatt-site/src/domain/.`,
          `Import the contract schema in the relevant site handler (grace period: warnings until escalation date).`,
        ),
      );
    }

    // CONTRACT-04: service-side code references the contract
    const serviceRefs = await findContractReferences(serviceScanDirs, contract.id, workspaceRoot);
    if (serviceRefs.length === 0) {
      diagnostics.push(
        makeDiagnostic(
          "CONTRACT-04",
          "warning",
          `Contract "${contract.id}" is not imported by any service-side code in services/*/src/.`,
          `Import the contract schema in the relevant service handler (grace period: warnings until escalation date).`,
        ),
      );
    }

    // CONTRACT-05: both sides reference the same contract
    if (siteRefs.length > 0 && serviceRefs.length > 0) {
      // Both sides have references — contract is aligned
    } else if (siteRefs.length > 0 || serviceRefs.length > 0) {
      diagnostics.push(
        makeDiagnostic(
          "CONTRACT-05",
          "warning",
          `Contract "${contract.id}" is referenced on one side but not both (site: ${siteRefs.length}, service: ${serviceRefs.length}).`,
          `Ensure both site and service handlers import the contract schema.`,
        ),
      );
    }
  }

  return diagnosticsResult("contract.validate", diagnostics);
}

export async function runContractList(
  _input: KernelCommandInput,
  _context: KernelRuntimeContext,
): Promise<KernelCommandResult<ContractListResult>> {
  const result: ContractListResult = {
    command: "contract.list",
    contracts: CONTRACTS.map((c: ContractDefinition) => ({
      id: c.id,
      name: c.name,
      direction: c.direction,
      version: c.version,
      description: c.description,
    })),
  };

  return {
    data: result,
    exitCode: 0,
    summary: `contract.list: ${CONTRACTS.length} contract(s) registered`,
  };
}
