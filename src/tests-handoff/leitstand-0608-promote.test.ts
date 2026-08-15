/*
<MODULE_CONTRACT>
  <purpose>RFC-0865: leitstand.promote requires --gate-decision and --main-verification-decision for certification-gated deployment.</purpose>
  <keywords>RFC-0865, leitstand, promote, certification, gate-decision, test</keywords>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0865: update promote test to assert --gate-decision and --main-verification-decision requirement.</item>
</CHANGE_SUMMARY>
*/

import { test, expect } from "vitest";
import { runLeitstandPromote } from "../leitstand/leitstand-commands.ts";
import type { KernelRuntimeContext, KernelCommandInput } from "@warpgogol/werkstatt/kernel";

const context = {
  workspaceRoot: "/tmp",
  logger: { info: () => {}, success: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
} as unknown as KernelRuntimeContext;

test("leitstand.promote requires --gate-decision", async () => {
  const input: KernelCommandInput = { flags: { release: "r000001", site: "test-sys" }, argv: [] };
  await expect(runLeitstandPromote(input, context)).rejects.toThrow("--gate-decision is required");
});

test("leitstand.promote requires --main-verification-decision", async () => {
  const input: KernelCommandInput = {
    flags: { release: "r000001", site: "test-sys", "gate-decision": "/tmp/gd.json" },
    argv: [],
  };
  await expect(runLeitstandPromote(input, context)).rejects.toThrow(
    "--main-verification-decision is required",
  );
});
