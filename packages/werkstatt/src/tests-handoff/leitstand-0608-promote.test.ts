/*
<MODULE_CONTRACT>
  <purpose>RFC-0866: leitstand.promote resolves gate decision at conventional path by default; still requires --main-verification-decision.</purpose>
  <keywords>RFC-0866, leitstand, promote, gate-decision, conventional path, main-verification, test</keywords>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0865: update promote test to assert --gate-decision and --main-verification-decision requirement.</item>
  <item>RFC-0866 fix D-1: update test for optional --gate-decision with conventional path fallback.</item>
</CHANGE_SUMMARY>
*/

import { test, expect } from "vitest";
import { runLeitstandPromote } from "../leitstand/leitstand-commands.ts";
import type { KernelRuntimeContext, KernelCommandInput } from "@warpgogol/werkstatt/kernel";

const context = {
  workspaceRoot: "/tmp",
  logger: { info: () => {}, success: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
} as unknown as KernelRuntimeContext;

test("leitstand.promote requires --main-verification-decision", async () => {
  const input: KernelCommandInput = {
    flags: {
      release: "r000001",
      site: "test-sys",
      "artifact-hash": "sha256:0000000000000000000000000000000000000000000000000000000000000000",
    },
    argv: [],
  };
  await expect(runLeitstandPromote(input, context)).rejects.toThrow(
    "--main-verification-decision is required",
  );
});
