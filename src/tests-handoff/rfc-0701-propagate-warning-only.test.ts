/*
<MODULE_CONTRACT>
  <purpose>RFC-0865: leitstand.propagate requires --gate-decision for certification-gated deployment.</purpose>
  <keywords>RFC-0865, leitstand, propagate, certification, gate-decision, warning-only, test</keywords>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0865: update propagate warning-only test to assert --gate-decision requirement.</item>
</CHANGE_SUMMARY>
*/

import { test, expect } from "vitest";
import { runLeitstandPropagate } from "../leitstand/leitstand-commands.ts";
import type { KernelRuntimeContext, KernelCommandInput } from "@warpgogol/werkstatt/kernel";

const context = {
  workspaceRoot: "/tmp",
  logger: { info: () => {}, success: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
} as unknown as KernelRuntimeContext;

test("leitstand.propagate (warning-only) requires --gate-decision", async () => {
  const input: KernelCommandInput = { flags: { release: "r000001", site: "test-sys" }, argv: [] };
  await expect(runLeitstandPropagate(input, context)).rejects.toThrow(
    "--gate-decision is required",
  );
});
