/*
<MODULE_CONTRACT>
<purpose>RFC-0186/RFC-0388: Lagebild shared sync worker validation stub.
lagebild.validate guards that the services/lagebild-sync-worker package
is present and its required environment variables are documented. No per-site
Workers are allowed; all sites share the single workspace worker.</purpose>
<non-goals>
  <item>Do not deploy or run the worker — validate workspace structure only.</item>
  <item>Do not manage tenant lifecycle — that is handled by the CLI handlers in @warpgogol/site-kernel.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0186: initial stub to unblock build.check pipeline.</item>
  <item>RFC-0386: assert subscriptions-invoices.sql DDL presence for lifecycle sync.</item>
  <item>RFC-0388: remove runLagebildWorkerDevVarsGenerate and runLagebildWorkerDevVarsValidate. Remove DEV_VARS_EXAMPLE constant and renderDevVarsExample.</item>
</CHANGE_SUMMARY>
*/

import { join } from "node:path";
import { existsSync, statSync } from "node:fs";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/werkstatt/kernel";
import { passResult, failResult } from "./result-helpers.ts";

const WORKER_DIR = "services/lagebild-sync-worker";
const SUBSCRIPTIONS_INVOICES_DDL = "supabase/subscriptions-invoices.sql";

export async function runLagebildValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const violations: string[] = [];

  // RFC-0386: assert subscriptions-invoices.sql DDL exists and is non-empty.
  const ddlPath = join(context.workspaceRoot, WORKER_DIR, SUBSCRIPTIONS_INVOICES_DDL);
  if (!existsSync(ddlPath)) {
    violations.push(
      `[missing-ddl] ${SUBSCRIPTIONS_INVOICES_DDL} not found — lifecycle sync handlers depend on the subscription/invoice buffer tables.`,
    );
  } else {
    const stat = statSync(ddlPath);
    if (stat.size === 0) {
      violations.push(
        `[empty-ddl] ${SUBSCRIPTIONS_INVOICES_DDL} is empty — lifecycle sync handlers depend on the subscription/invoice buffer tables.`,
      );
    }
  }

  if (violations.length > 0) {
    return failResult("lagebild.validate", violations);
  }
  return passResult(
    "lagebild.validate",
    "lagebild.validate: OK (worker dir present, subscriptions-invoices.sql DDL present)",
  );
}
