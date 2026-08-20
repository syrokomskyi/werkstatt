/*
<MODULE_CONTRACT>
  <purpose>RFC-0895: leitstand.rollback no longer accepts --to-release or --gate-decision. Native wrangler rollback targets the previous version automatically.</purpose>
  <keywords>RFC-0895, leitstand, rollback, to-release, gate-decision, test</keywords>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0865: update rollback test to assert --to-release requirement.</item>
  <item>RFC-0895: --to-release and --gate-decision are now rejected, not required. Update test to assert rejection.</item>
</CHANGE_SUMMARY>
*/

import { test, expect } from "vitest";
import { runLeitstandRollback } from "../leitstand/leitstand-commands.ts";
import type { KernelRuntimeContext, KernelCommandInput } from "@warpgogol/werkstatt/kernel";

const context = {
  workspaceRoot: "/tmp",
  logger: { info: () => {}, success: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
} as unknown as KernelRuntimeContext;

test("leitstand.rollback rejects --to-release (RFC-0895)", async () => {
  const input: KernelCommandInput = {
    flags: { site: "test-sys", "to-release": "r000001" },
    argv: [],
  };
  await expect(runLeitstandRollback(input, context)).rejects.toThrow(
    "--to-release is no longer supported",
  );
});

test("leitstand.rollback rejects --gate-decision (RFC-0895)", async () => {
  const input: KernelCommandInput = {
    flags: { site: "test-sys", "gate-decision": "/tmp/gate.json" },
    argv: [],
  };
  await expect(runLeitstandRollback(input, context)).rejects.toThrow(
    "--gate-decision is no longer supported",
  );
});

test("leitstand.rollback requires --site or --service", async () => {
  const input: KernelCommandInput = { flags: {}, argv: [] };
  await expect(runLeitstandRollback(input, context)).rejects.toThrow(
    "--site or --service is required",
  );
});
