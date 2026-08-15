/*
<MODULE_CONTRACT>
  <purpose>RFC-0865: leitstand.dev-deploy requires --gate-decision for certification-gated deployment.</purpose>
  <keywords>RFC-0865, leitstand, dev-deploy, certification, gate-decision, evidence-sync, test</keywords>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0865: update evidence-sync dev-deploy test to assert --gate-decision requirement.</item>
</CHANGE_SUMMARY>
*/

import { test, expect } from "vitest";
import { runLeitstandDevDeploy } from "../leitstand/leitstand-commands.ts";
import type { KernelRuntimeContext, KernelCommandInput } from "@warpgogol/werkstatt/kernel";

const context = {
  workspaceRoot: "/tmp",
  logger: { info: () => {}, success: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
} as unknown as KernelRuntimeContext;

test("leitstand.dev-deploy (evidence-sync) requires --gate-decision", async () => {
  const input: KernelCommandInput = { flags: { site: "test-sys" }, argv: [] };
  await expect(runLeitstandDevDeploy(input, context)).rejects.toThrow(
    "--gate-decision is required",
  );
});
