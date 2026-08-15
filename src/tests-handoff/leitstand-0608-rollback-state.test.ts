/*
<MODULE_CONTRACT>
  <purpose>RFC-0865: leitstand.rollback requires --to-release for certification-gated rollback.</purpose>
  <keywords>RFC-0865, leitstand, rollback, certification, to-release, test</keywords>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0865: update rollback test to assert --to-release requirement.</item>
</CHANGE_SUMMARY>
*/

import { test, expect } from "vitest";
import { runLeitstandRollback } from "../leitstand/leitstand-commands.ts";
import type { KernelRuntimeContext, KernelCommandInput } from "@warpgogol/werkstatt/kernel";

const context = {
  workspaceRoot: "/tmp",
  logger: { info: () => {}, success: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
} as unknown as KernelRuntimeContext;

test("leitstand.rollback requires --to-release", async () => {
  const input: KernelCommandInput = { flags: { site: "test-sys" }, argv: [] };
  await expect(runLeitstandRollback(input, context)).rejects.toThrow("--to-release is required");
});
